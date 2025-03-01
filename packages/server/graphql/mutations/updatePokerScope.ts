import {GraphQLID, GraphQLList, GraphQLNonNull} from 'graphql'
import {SubscriptionChannel, Threshold} from 'parabol-client/types/constEnums'
import {Writeable} from '../../../client/types/generics'
import JiraIssueId from '../../../client/shared/gqlIds/JiraIssueId'
import getRethink from '../../database/rethinkDriver'
import EstimateStage from '../../database/types/EstimateStage'
import MeetingPoker from '../../database/types/MeetingPoker'
import {TaskServiceEnum} from '../../database/types/Task'
import insertDiscussions, {InputDiscussions} from '../../postgres/queries/insertDiscussions'
import {getUserId, isTeamMember} from '../../utils/authorization'
import ensureJiraDimensionField from '../../utils/ensureJiraDimensionField'
import getPhase from '../../utils/getPhase'
import getRedis from '../../utils/getRedis'
import publish from '../../utils/publish'
import RedisLockQueue from '../../utils/RedisLockQueue'
import {GQLContext} from '../graphql'
import UpdatePokerScopeItemInput from '../types/UpdatePokerScopeItemInput'
import UpdatePokerScopePayload from '../types/UpdatePokerScopePayload'
import getNextFacilitatorStageAfterStageRemoved from './helpers/getNextFacilitatorStageAfterStageRemoved'
import importTasksForPoker from './helpers/importTasksForPoker'

export interface TUpdatePokerScopeItemInput {
  service: TaskServiceEnum
  serviceTaskId: string
  action: 'ADD' | 'DELETE'
}

const updatePokerScope = {
  type: GraphQLNonNull(UpdatePokerScopePayload),
  description: `Add or remove a task and its estimate phase from the meeting`,
  args: {
    meetingId: {
      type: GraphQLNonNull(GraphQLID),
      description: 'the meeting with the estimate phases to modify'
    },
    updates: {
      type: GraphQLNonNull(GraphQLList(GraphQLNonNull(UpdatePokerScopeItemInput))),
      description: 'The list of items to add/remove to the estimate phase'
    }
  },
  resolve: async (
    _source,
    {meetingId, updates}: {meetingId: string; updates: TUpdatePokerScopeItemInput[]},
    {authToken, dataLoader, socketId: mutatorId}: GQLContext
  ) => {
    const r = await getRethink()
    const redis = getRedis()
    const viewerId = getUserId(authToken)
    const operationId = dataLoader.share()
    const subOptions = {mutatorId, operationId}
    const now = new Date()

    //AUTH
    const meeting = (await dataLoader.get('newMeetings').load(meetingId)) as MeetingPoker
    if (!meeting) {
      return {error: {message: `Meeting not found`}}
    }

    const {endedAt, teamId, phases, meetingType, templateRefId, facilitatorStageId} = meeting
    if (endedAt) {
      return {error: {message: `Meeting already ended`}}
    }
    if (!isTeamMember(authToken, teamId)) {
      return {error: {message: `Not on team`}}
    }

    if (meetingType !== 'poker') {
      return {error: {message: 'Not a poker meeting'}}
    }

    // lock the meeting while the scope is updating
    const redisLock = new RedisLockQueue(`meeting:${meetingId}`, 3000)
    await redisLock.lock(10000)

    // RESOLUTION

    const estimatePhase = getPhase(phases, 'ESTIMATE')
    let stages = estimatePhase.stages

    // delete stages
    const subtractiveUpdates = updates.filter((update) => {
      const {action, serviceTaskId} = update
      return action === 'DELETE' && !!stages.find((stage) => stage.serviceTaskId === serviceTaskId)
    })

    subtractiveUpdates.forEach((update) => {
      const {serviceTaskId} = update
      const stagesToRemove = stages.filter((stage) => stage.serviceTaskId === serviceTaskId)
      const removingTatorStage = stagesToRemove.find((stage) => stage.id === facilitatorStageId)
      if (removingTatorStage) {
        const nextStage = getNextFacilitatorStageAfterStageRemoved(
          facilitatorStageId,
          removingTatorStage.id,
          phases
        )
        nextStage.startAt = now
        meeting.facilitatorStageId = nextStage.id
      }
      if (stagesToRemove.length > 0) {
        // MUTATIVE
        stages = stages.filter((stage) => stage.serviceTaskId !== serviceTaskId)
        estimatePhase.stages = stages
        const writes = stagesToRemove.map((stage) => {
          return ['del', `pokerHover:${stage.id}`]
        })
        redis.multi(writes).exec()
      }
    })

    // add stages
    const templateRef = await dataLoader.get('templateRefs').load(templateRefId)
    const {dimensions} = templateRef
    const firstDimensionName = dimensions[0].name
    const newDiscussions = [] as Writeable<InputDiscussions>
    const additiveUpdates = updates.filter((update) => {
      const {action, serviceTaskId} = update
      return action === 'ADD' && !stages.find((stage) => stage.serviceTaskId === serviceTaskId)
    })

    const requiredJiraMappers = additiveUpdates
      .filter((update) => update.service === 'jira')
      .map((update) => {
        const {cloudId, issueKey, projectKey} = JiraIssueId.split(update.serviceTaskId)
        return {
          cloudId,
          issueKey,
          projectKey,
          dimensionName: firstDimensionName
        }
      })
    await ensureJiraDimensionField(requiredJiraMappers, teamId, viewerId, dataLoader)

    const additiveUpdatesWithTaskIds = await importTasksForPoker(
      additiveUpdates,
      teamId,
      viewerId,
      meetingId
    )

    additiveUpdatesWithTaskIds.forEach((update) => {
      const {serviceTaskId, taskId} = update
      const lastSortOrder = stages[stages.length - 1]?.sortOrder ?? -1
      const newStages = dimensions.map(
        (_, idx) =>
          new EstimateStage({
            creatorUserId: viewerId,
            // integrationHash if integrated, else taskId
            serviceTaskId,
            sortOrder: lastSortOrder + 1,
            taskId,
            durations: undefined,
            dimensionRefIdx: idx
          })
      )
      const discussions = newStages.map((stage) => ({
        id: stage.discussionId,
        meetingId,
        teamId,
        discussionTopicId: taskId,
        discussionTopicType: 'task' as const
      }))
      // MUTATIVE
      newDiscussions.push(...discussions)
      stages.push(...newStages)
    })

    if (stages.length > Threshold.MAX_POKER_STORIES * dimensions.length) {
      return {error: {message: 'Story limit reached'}}
    }
    await r
      .table('NewMeeting')
      .get(meetingId)
      .update({
        facilitatorStageId: meeting.facilitatorStageId,
        phases,
        updatedAt: now
      })
      .run()
    if (newDiscussions.length > 0) {
      await insertDiscussions(newDiscussions)
    }
    await redisLock.unlock()
    const data = {meetingId}
    publish(SubscriptionChannel.MEETING, meetingId, 'UpdatePokerScopeSuccess', data, subOptions)
    return data
  }
}

export default updatePokerScope
