import {GraphQLNonNull, GraphQLObjectType} from 'graphql'
import {GQLContext} from '../graphql'
import makeMutationPayload from './makeMutationPayload'
import TeamMember from './TeamMember'

export const ToggleTeamDrawerSuccess = new GraphQLObjectType<any, GQLContext>({
  name: 'ToggleTeamDrawerSuccess',
  fields: () => ({
    teamMember: {
      type: GraphQLNonNull(TeamMember),
      resolve: async ({teamMemberId}, _args, {dataLoader}) => {
        return dataLoader.get('teamMembers').load(teamMemberId)
      }
    }
  })
})

const ToggleTeamDrawerPayload = makeMutationPayload(
  'ToggleTeamDrawerPayload',
  ToggleTeamDrawerSuccess
)

export default ToggleTeamDrawerPayload
