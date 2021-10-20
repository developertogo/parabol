import {SlackNotificationEventEnum as EventEnum} from '../../../../database/types/SlackNotification'
import makeAppURL from 'parabol-client/utils/makeAppURL'
import appOrigin from '../../../../appOrigin'
import MattermostServerManager from '../../../../utils/MattermostServerManager'
import segmentIo from '../../../../utils/segmentIo'
import sendToSentry from '../../../../utils/sendToSentry'
import {DataLoaderWorker} from '../../../graphql'
import {
  makeFieldsAttachment,
  makeHackedFieldButtonValue,
  makeHackedButtonPairFields
} from './makeMattermostAttachments'
import getSummaryText from './getSummaryText'
import MeetingRetrospective from '../../../../database/types/MeetingRetrospective'
import MeetingAction from '../../../../database/types/MeetingAction'
import MeetingPoker from '../../../../database/types/MeetingPoker'
import findStageById from 'parabol-client/utils/meetings/findStageById'
import {phaseLabelLookup} from 'parabol-client/utils/meetings/lookups'
import formatWeekday from 'parabol-client/utils/date/formatWeekday'
import formatTime from 'parabol-client/utils/date/formatTime'
import {toEpochSeconds} from '../../../../utils/epochTime'

const getWebhookForTeamId = async (dataLoader: DataLoaderWorker, teamId: string) => {
  const mattermost = await dataLoader.get('mattermostAuthByTeamId').load(teamId)
  return mattermost?.webhookUrl
}

const notifyMattermost = async (
  event: EventEnum,
  webhookUrl: string,
  userId: string,
  teamId: string,
  textOrAttachmentsArray: string | Array<object>,
  notificationText?: string
) => {
  const manager = new MattermostServerManager(webhookUrl)
  const status = await manager.postMessage(textOrAttachmentsArray, notificationText)
  segmentIo.track({
    userId,
    event: 'Mattermost notification sent',
    properties: {
      teamId,
      notificationEvent: event
    }
  })
  const result = status == 200
  if (!result) sendToSentry(new Error(`Mattermost Notification Error: ${webhookUrl}`))

  return result
}

export const startMattermostMeeting = async (
  meetingId: string,
  teamId: string,
  dataLoader: DataLoaderWorker
) => {
  const webhookUrl = await getWebhookForTeamId(dataLoader, teamId)
  if (!webhookUrl) return

  const searchParams = {
    utm_source: 'mattermost meeting start',
    utm_medium: 'product',
    utm_campaign: 'invitations'
  }
  const options = {searchParams}
  const [team, meeting] = await Promise.all([
    dataLoader.get('teams').load(teamId),
    dataLoader.get('newMeetings').load(meetingId)
  ])
  const {facilitatorUserId: userId} = meeting
  const meetingUrl = makeAppURL(appOrigin, `meet/${meetingId}`, options)
  const attachments = [
    makeFieldsAttachment(
      [
        {
          short: true,
          title: 'Team',
          value: team.name
        },
        {
          short: true,
          title: 'Meeting',
          value: meeting.name
        },
        {
          short: false,
          value: makeHackedFieldButtonValue({label: 'Join meeting', link: meetingUrl})
        }
      ],
      {
        fallback: `Meeting started, join: ${meetingUrl}`,
        title: 'Meeting started 👋',
        title_link: meetingUrl
      }
    )
  ]
  return await notifyMattermost('meetingStart', webhookUrl, userId, teamId, attachments).catch(
    console.log
  )
}

const makeEndMeetingButtons = (meeting: MeetingRetrospective | MeetingAction | MeetingPoker) => {
  const {id: meetingId} = meeting
  const searchParams = {
    utm_source: 'mattermost summary',
    utm_medium: 'product',
    utm_campaign: 'after-meeting'
  }
  const options = {searchParams}
  const summaryUrl = makeAppURL(appOrigin, `new-summary/${meetingId}`, options)
  const makeDiscussionButton = (meetingUrl: string) => ({
    label: 'See discussion',
    link: meetingUrl
  })
  const summaryButton = {
    label: 'Review summary',
    link: summaryUrl
  }
  switch (meeting.meetingType) {
    case 'retrospective':
      const retroUrl = makeAppURL(appOrigin, `meet/${meetingId}/discuss/1`)
      return makeHackedButtonPairFields([makeDiscussionButton(retroUrl), summaryButton])
    case 'action':
      const checkInUrl = makeAppURL(appOrigin, `meet/${meetingId}/checkin/1`)
      return makeHackedButtonPairFields([makeDiscussionButton(checkInUrl), summaryButton])
    case 'poker':
      const pokerUrl = makeAppURL(appOrigin, `meet/${meetingId}/estimate/1`)
      const estimateButton = {
        label: 'See estimates',
        link: pokerUrl
      }
      return makeHackedButtonPairFields([estimateButton, summaryButton])
    default:
      throw new Error('Invalid meeting type')
  }
}

export const endMattermostMeeting = async (
  meetingId: string,
  teamId: string,
  dataLoader: DataLoaderWorker
) => {
  const webhookUrl = await getWebhookForTeamId(dataLoader, teamId)
  if (!webhookUrl) return
  const [team, meeting] = await Promise.all([
    dataLoader.get('teams').load(teamId),
    dataLoader.get('newMeetings').load(meetingId)
  ])
  const {facilitatorUserId: userId} = meeting
  const summaryText = getSummaryText(meeting)
  const meetingUrl = makeAppURL(appOrigin, `meet/${meetingId}`)
  const attachments = [
    makeFieldsAttachment(
      [
        {
          short: true,
          title: 'Team',
          value: team.name
        },
        {
          short: true,
          title: 'Meeting',
          value: meeting.name
        },
        {
          short: false,
          title: 'Summary',
          value: summaryText
        },
        ...makeEndMeetingButtons(meeting)
      ],
      {
        fallback: `Meeting completed, join: ${meetingUrl}`,
        title: 'Meeting completed 🎉',
        title_link: meetingUrl
      }
    )
  ]
  return await notifyMattermost('meetingEnd', webhookUrl, userId, teamId, attachments).catch(
    console.log
  )
}

export const notifyMattermostTimeLimitStart = async (
  scheduledEndTime: Date,
  meetingId: string,
  teamId: string,
  dataLoader: DataLoaderWorker
) => {
  const webhookUrl = await getWebhookForTeamId(dataLoader, teamId)
  if (!webhookUrl) return

  const [team, meeting] = await Promise.all([
    dataLoader.get('teams').load(teamId),
    dataLoader.get('newMeetings').load(meetingId)
  ])
  const {name: meetingName, phases, facilitatorStageId, facilitatorUserId: userId} = meeting
  const {name: teamName} = team
  const stageRes = findStageById(phases, facilitatorStageId)
  const {stage} = stageRes!
  const meetingUrl = makeAppURL(appOrigin, `meet/${meetingId}`)
  const {phaseType} = stage
  const phaseLabel = phaseLabelLookup[phaseType]

  const fallbackDate = formatWeekday(scheduledEndTime)
  const fallbackTime = formatTime(scheduledEndTime)
  const fallbackZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Eastern Time'
  const fallback = `${fallbackDate} at ${fallbackTime} (${fallbackZone})`
  const constraint = `You have until *<!date^${toEpochSeconds(
    scheduledEndTime
  )}^{date_short_pretty} at {time}|${fallback}>* to complete it.`

  const attachments = [
    makeFieldsAttachment(
      [
        {
          short: true,
          title: 'Team',
          value: teamName
        },
        {
          short: true,
          title: 'Meeting',
          value: meetingName
        },
        {
          short: false,
          value: constraint
        },
        {
          short: false,
          title: 'Link',
          value: `[https:/prbl.in/${meetingId}](${meetingUrl})`
        },
        {
          short: false,
          value: makeHackedFieldButtonValue({label: 'Open meeting', link: meetingUrl})
        }
      ],
      {
        fallback: `The ${phaseLabel} Phase has begun, see: ${meetingUrl}`,
        title: `The ${phaseLabel} Phase has begun ⏳`,
        title_link: meetingUrl
      }
    )
  ]

  return await notifyMattermost(
    'MEETING_STAGE_TIME_LIMIT_START',
    webhookUrl,
    userId,
    teamId,
    attachments
  ).catch(console.log)
}

export const notifyMattermostTimeLimitEnd = async (
  meetingId: string,
  teamId: string,
  dataLoader: DataLoaderWorker
) => {
  const webhookUrl = await getWebhookForTeamId(dataLoader, teamId)
  if (!webhookUrl) return

  const meeting = await dataLoader.get('newMeetings').load(meetingId)
  const {facilitatorUserId: userId} = meeting

  const meetingUrl = makeAppURL(appOrigin, `meet/${meetingId}`)
  const messageText = `Time’s up! Advance your meeting to the next phase: ${meetingUrl}`

  return await notifyMattermost(
    'MEETING_STAGE_TIME_LIMIT_END',
    webhookUrl,
    teamId,
    userId,
    messageText
  ).catch(console.log)
}
