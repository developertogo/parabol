import {GraphQLResolveInfo} from 'graphql'
import GitHubIssueId from '../../../../client/shared/gqlIds/GitHubIssueId'
import GitHubRepoId from '../../../../client/shared/gqlIds/GitHubRepoId'
import JiraIssueId from '../../../../client/shared/gqlIds/JiraIssueId'
import JiraProjectId from '../../../../client/shared/gqlIds/JiraProjectId'
import removeRangesForEntity from '../../../../client/utils/draftjs/removeRangesForEntity'
import TaskIntegrationGitHub from '../../../database/types/TaskIntegrationGitHub'
import TaskIntegrationJira from '../../../database/types/TaskIntegrationJira'
import {GQLContext} from '../../graphql'
import {CreateTaskIntegrationInput} from '../createTask'
import createGitHubTask from './createGitHubTask'
import createJiraTask from './createJiraTask'

const createTaskInService = async (
  integrationInput: CreateTaskIntegrationInput | null | undefined,
  rawContent: string,
  accessUserId: string,
  teamId: string,
  context: GQLContext,
  info: GraphQLResolveInfo
) => {
  if (!integrationInput) return {integrationHash: undefined, integration: undefined}
  const {dataLoader} = context
  const {service, serviceProjectHash} = integrationInput
  const eqFn = (data) => ['archived', 'private'].includes(data.value)
  const taglessContentJSON = removeRangesForEntity(rawContent, 'TAG', eqFn) || rawContent
  if (service === 'jira') {
    const atlassianAuth = await dataLoader
      .get('freshAtlassianAuth')
      .load({userId: accessUserId, teamId})
    if (!atlassianAuth) {
      return {error: new Error('Cannot create jira task without a valid jira token')}
    }
    const {cloudId, projectKey} = JiraProjectId.split(serviceProjectHash)
    const jiraTaskRes = await createJiraTask(taglessContentJSON, cloudId, projectKey, atlassianAuth)
    if (jiraTaskRes.error) return {error: jiraTaskRes.error}
    const {issueKey} = jiraTaskRes
    return {
      integration: new TaskIntegrationJira({
        accessUserId,
        cloudId,
        issueKey
      }),
      integrationHash: JiraIssueId.join(cloudId, issueKey)
    }
  } else if (service === 'github') {
    const {repoOwner, repoName} = GitHubRepoId.split(serviceProjectHash)
    const githubAuth = await dataLoader.get('githubAuth').load({userId: accessUserId, teamId})
    if (!githubAuth) {
      return {error: new Error('Cannot create GitHub task without a valid GitHub token')}
    }
    const githubTaskRes = await createGitHubTask(
      taglessContentJSON,
      repoOwner,
      repoName,
      githubAuth,
      context,
      info
    )
    if (githubTaskRes.error) {
      return {error: githubTaskRes.error}
    }
    const {issueNumber} = githubTaskRes
    return {
      integration: new TaskIntegrationGitHub({
        accessUserId,
        nameWithOwner: serviceProjectHash,
        issueNumber
      }),
      integrationHash: GitHubIssueId.join(serviceProjectHash, issueNumber)
    }
  }
  return {error: new Error('Unknown integration')}
}

export default createTaskInService
