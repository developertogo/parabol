import {commitLocalUpdate, RecordSourceProxy} from 'relay-runtime'
import clientTempId from '../../../utils/relay/clientTempId'
import Atmosphere from '../../../Atmosphere'
import getDiscussionThreadConn from '../../../mutations/connections/getDiscussionThreadConn'
import safePutNodeInConn from '../../../mutations/handlers/safePutNodeInConn'

const LocalPollOptionsNumber = 2

export const isLocalPoll = (threadable: {id: string}) =>
  threadable.id.startsWith('poll') && threadable.id.endsWith('tmp')

export const createLocalPoll = (
  atmosphere: Atmosphere,
  discussionId: string,
  threadSortOrder: number
) =>
  commitLocalUpdate(atmosphere, (store) => {
    const discussion = store
      .getRoot()
      .getLinkedRecord('viewer')
      ?.getLinkedRecord('discussion', {id: discussionId})
    if (!discussion) {
      console.warn('Discussion not found, could not create a poll!')
      return
    }
    const {viewerId} = atmosphere
    const user = store.get(viewerId)
    if (!user) {
      console.warn('Viewer is null, could not create a poll!')
      return
    }

    const pollId = clientTempId('poll')
    const now = new Date().toJSON()
    const newPollRecord = store.create(pollId, 'Poll')
    newPollRecord.setValue(pollId, 'id')
    newPollRecord.setValue(now, 'createdAt')
    newPollRecord.setValue(now, 'updatedAt')
    newPollRecord.setValue(viewerId, 'createdById')
    newPollRecord.setValue('', 'title')
    newPollRecord.setValue(threadSortOrder, 'threadSortOrder')
    newPollRecord.setLinkedRecord(user, 'createdByUser')
    newPollRecord.setLinkedRecords(
      Array.from({length: LocalPollOptionsNumber}).map(() => createEmptyPollOption(pollId, store)),
      'options'
    )

    const threadConn = getDiscussionThreadConn(store, discussionId)
    safePutNodeInConn(threadConn, newPollRecord, store, 'threadSortOrder', true)
  })

export const updateLocalPoll = (atmosphere: Atmosphere, id: string, title: string) =>
  commitLocalUpdate(atmosphere, (store) => {
    const poll = store.get(id)
    if (!poll) {
      console.warn(`Could not find poll with id: ${id}, skipping update!`)
      return
    }
    poll.setValue(title, 'title')
  })

export const updateLocalPollOption = (atmosphere: Atmosphere, id: string, title: string) =>
  commitLocalUpdate(atmosphere, (store) => {
    const pollOption = store.get(id)
    if (!pollOption) {
      console.warn(`Could not find poll option with id: ${id}, skipping update!`)
      return
    }
    pollOption.setValue(title, 'title')
  })

export const addLocalPollOption = (atmosphere: Atmosphere, pollId: string) =>
  commitLocalUpdate(atmosphere, (store) => {
    const poll = store.get(pollId)
    if (!poll) {
      console.warn(`Could not find poll with id: ${pollId}, will not create a new poll option!`)
      return
    }

    const pollOptions = poll.getLinkedRecords('options') || []
    const pollOption = createEmptyPollOption(pollId, store)
    poll.setLinkedRecords([...pollOptions, pollOption], 'options')
    poll.setValue(new Date().toJSON(), 'updatedAt')
  })

const createEmptyPollOption = (pollId: string, store: RecordSourceProxy) => {
  const dataID = clientTempId('poll')
  const newPollOption = store.create(dataID, 'PollOption')
  newPollOption.setValue(dataID, 'id')
  newPollOption.setValue('', 'title')
  newPollOption.setValue(pollId, 'pollId')

  return newPollOption
}
