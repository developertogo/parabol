import {GraphQLObjectType, GraphQLID, GraphQLNonNull} from 'graphql'
import {GQLContext} from '../graphql'
import Discussion from './Discussion'
import makeMutationPayload from './makeMutationPayload'

export const EditCommentingSuccess = new GraphQLObjectType<any, GQLContext>({
  name: 'EditCommentingSuccess',
  fields: () => ({
    discussionId: {
      type: GraphQLNonNull(GraphQLID),
      description: 'The discussion the comment was created in'
    },
    discussion: {
      type: GraphQLNonNull(Discussion),
      description: 'The discussion where the commenting state changed',
      resolve: async ({discussionId}, _args, {dataLoader}) => {
        return dataLoader.get('discussions').load(discussionId)
      }
    }
  })
})

const EditCommentingPayload = makeMutationPayload('EditCommentingPayload', EditCommentingSuccess)

export default EditCommentingPayload
