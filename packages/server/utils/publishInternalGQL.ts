import AuthToken from '../database/types/AuthToken'
import {getUserId} from './authorization'
import getGraphQLExecutor from './getGraphQLExecutor'
import sendToSentry from './sendToSentry'

interface Options {
  socketId: string
  ip: string
  query: string
  authToken: AuthToken
}

const publishInternalGQL = async (options: Options) => {
  const {socketId, query, ip, authToken} = options
  try {
    return await getGraphQLExecutor().publish({
      socketId,
      authToken,
      query,
      ip,
      isPrivate: true
    })
  } catch (e) {
    const viewerId = getUserId(authToken)
    const error = e instanceof Error ? e : new Error('GQL executor failed to publish')
    sendToSentry(error, {userId: viewerId})
    return undefined
  }
}

export default publishInternalGQL
