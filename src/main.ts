import * as github from '@actions/github'
import * as core from '@actions/core'
import * as rest from '@octokit/rest'
import {Context} from '@actions/github/lib/context'

function getRequiredEnv(key: string): string {
  const value = process.env[key]
  if (value === undefined) {
    const message = `${key} was not defined.`
    throw new Error(message)
  }
  return value
}

function verboseOutput(name: string, value: string): void {
  core.info(`Setting output: ${name}: ${value}`)
  core.setOutput(name, value)
}

async function getPullRequest(
  octokit: github.GitHub,
  context: Context,
  owner: string,
  repo: string
): Promise<rest.PullsGetResponse> {
  const pullRequestNumber = context.payload.pull_request
    ? context.payload.pull_request.number
    : null
  if (pullRequestNumber === null) {
    throw Error(`Could not find PR number in context payload.`)
  }
  core.info(`pullRequestNumber: ${pullRequestNumber}`)
  const pullRequest = await octokit.pulls.get({
    owner,
    repo,
    // eslint-disable-next-line @typescript-eslint/camelcase
    pull_number: pullRequestNumber
  })
  return pullRequest.data
}

function getPullRequestLabels(pullRequest: rest.PullsGetResponse): string[] {
  const labelNames = pullRequest
    ? pullRequest.labels.map(label => label.name)
    : []
  return labelNames
}

async function getReviews(
  octokit: github.GitHub,
  owner: string,
  repo: string,
  number: number,
  getComitters: boolean
): Promise<[rest.PullsListReviewsResponseItem[], string[], string[]]> {
  let reviews: rest.PullsListReviewsResponseItem[] = []
  const options = octokit.pulls.listReviews.endpoint.merge({
    owner,
    repo,
    // eslint-disable-next-line @typescript-eslint/camelcase
    pull_number: number
  })
  await octokit.paginate(options).then(r => {
    reviews = r
  })

  const reviewers = reviews ? reviews.map(review => review.user.login) : []
  const reviewersAlreadyChecked: string[] = []
  const committers: string[] = []
  if (getComitters) {
    core.info('Checking reviewers permissions:')
    for (const reviewer of reviewers) {
      if (!reviewersAlreadyChecked.includes(reviewer)) {
        const p = await octokit.repos.getCollaboratorPermissionLevel({
          owner,
          repo,
          username: reviewer
        })
        const permission = p.data.permission
        if (permission === 'admin' || permission === 'write') {
          committers.push(reviewer)
        }
        core.info(`\t${reviewer}: ${permission}`)
        reviewersAlreadyChecked.push(reviewer)
      }
    }
  }
  return [reviews, reviewers, committers]
}

function processReviews(
  reviews: rest.PullsListReviewsResponseItem[],
  reviewers: string[],
  committers: string[],
  requireCommittersApproval: boolean
): boolean {
  let isApproved = false
  const reviewStates: {[user: string]: string} = {}

  for (const review of reviews) {
    if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED') {
      if (requireCommittersApproval && committers.includes(review.user.login)) {
        reviewStates[review.user.login] = review.state
      } else if (!requireCommittersApproval) {
        reviewStates[review.user.login] = review.state
      }
    }
  }

  core.info(`Reviews:`)
  for (const user in reviewStates) {
    core.info(`\t${user}: ${reviewStates[user].toLowerCase()}`)
  }

  for (const user in reviewStates) {
    if (reviewStates[user] === 'APPROVED') {
      isApproved = true
      break
    }
  }
  for (const user in reviewStates) {
    if (reviewStates[user] === 'REQUEST_CHANGES') {
      isApproved = false
      break
    }
  }

  return isApproved
}

async function setLabel(
  octokit: github.GitHub,
  owner: string,
  repo: string,
  pullRequestNumber: number,
  label: string
): Promise<void> {
  core.info(`Setting label: ${label}`)
  await octokit.issues.addLabels({
    // eslint-disable-next-line @typescript-eslint/camelcase
    issue_number: pullRequestNumber,
    labels: [label],
    owner,
    repo
  })
}

async function removeLabel(
  octokit: github.GitHub,
  owner: string,
  repo: string,
  pullRequestNumber: number,
  label: string
): Promise<void> {
  core.info(`Removing label: ${label}`)
  await octokit.issues.removeLabel({
    // eslint-disable-next-line @typescript-eslint/camelcase
    issue_number: pullRequestNumber,
    name: label,
    owner,
    repo
  })
}

async function addComment(
  octokit: github.GitHub,
  owner: string,
  repo: string,
  pullRequestNumber: number,
  comment: string
): Promise<void> {
  core.info(`Adding comment: ${comment}`)
  await octokit.issues.createComment({
    owner,
    repo,
    // eslint-disable-next-line @typescript-eslint/camelcase
    issue_number: pullRequestNumber,
    body: comment
  })
}

async function getWorkflowId(
  octokit: github.GitHub,
  runId: number,
  owner: string,
  repo: string
): Promise<number> {
  const reply = await octokit.actions.getWorkflowRun({
    owner,
    repo,
    // eslint-disable-next-line @typescript-eslint/camelcase
    run_id: runId
  })
  core.info(`The source run ${runId} is in ${reply.data.workflow_url} workflow`)
  const workflowIdString = reply.data.workflow_url.split('/').pop() || ''
  if (!(workflowIdString.length > 0)) {
    throw new Error('Could not resolve workflow')
  }
  return parseInt(workflowIdString)
}

async function getPrWorkflowRunsIds(
  octokit: github.GitHub,
  owner: string,
  repo: string,
  branch: string,
  sha: string,
  skipRunId: number
): Promise<number[]> {
  const workflowRuns = await octokit.actions.listRepoWorkflowRuns({
    owner,
    repo,
    branch,
    event: 'pull_request',
    status: 'completed',
    // eslint-disable-next-line @typescript-eslint/camelcase
    per_page: 100
  })
  // may be no need to rerun pending/queued runs
  const filteredRunsIds: number[] = []
  const filteredWorklowRunsIds: number[] = []

  for (const workflowRun of workflowRuns.data.workflow_runs) {
    const workflowId = parseInt(
      workflowRun.workflow_url.split('/').pop() || '0'
    )

    if (
      workflowRun.head_sha === sha &&
      !filteredRunsIds.includes(workflowId) &&
      workflowId !== skipRunId
    ) {
      filteredRunsIds.push(workflowId)
      filteredWorklowRunsIds.push(workflowRun.id)
    }
  }

  return filteredWorklowRunsIds
}

async function rerunWorkflows(
  octokit: github.GitHub,
  owner: string,
  repo: string,
  runIds: number[]
): Promise<void> {
  core.info(`Rerun worklowws: ${runIds}`)
  for (const runId of runIds) {
    await octokit.actions.reRunWorkflow({
      owner,
      repo,
      // eslint-disable-next-line @typescript-eslint/camelcase
      run_id: runId
    })
  }
}

async function printDebug(
  item: object | string | boolean | number,
  description: string
): Promise<void> {
  const itemJson = JSON.stringify(item)
  core.info(`\n ######### ${description} ######### \n: ${itemJson}\n\n`)
}

async function run(): Promise<void> {
  const token = core.getInput('token', {required: true})
  const userLabel = core.getInput('label') || 'not set'
  const requireCommittersApproval =
    core.getInput('require_committers_approval') === 'true'
  const comment = core.getInput('comment') || ''
  const octokit = new github.GitHub(token)
  const context = github.context
  const repository = getRequiredEnv('GITHUB_REPOSITORY')
  const eventName = getRequiredEnv('GITHUB_EVENT_NAME')
  const selfRunId = parseInt(getRequiredEnv('GITHUB_RUN_ID'))
  const [owner, repo] = repository.split('/')
  const selfWorkflowId = await getWorkflowId(octokit, selfRunId, owner, repo)
  const branch = context.payload.pull_request?.head.ref
  const sha = context.payload.pull_request?.head.sha

  core.info(
    `\n############### Set Label When Approved start ##################\n` +
      `label: "${userLabel}"\n` +
      `requireCommittersApproval: ${requireCommittersApproval}\n` +
      `comment: ${comment}`
  )

  if (eventName !== 'pull_request_review') {
    throw Error(
      `This action is only useful in "pull_request_review" triggered runs and you used it in "${eventName}"`
    )
  }

  // PULL REQUEST
  const pullRequest = await getPullRequest(octokit, context, owner, repo)

  // LABELS
  const labelNames = getPullRequestLabels(pullRequest)

  // REVIEWS
  const [reviews, reviewers, committers] = await getReviews(
    octokit,
    owner,
    repo,
    pullRequest.number,
    requireCommittersApproval
  )
  const isApproved = processReviews(
    reviews,
    reviewers,
    committers,
    requireCommittersApproval
  )

  // HANDLE LABEL
  let isLabelShouldBeSet = false
  let isLabelShouldBeRemoved = false

  if (userLabel !== 'not set') {
    isLabelShouldBeSet = isApproved && !labelNames.includes(userLabel)
    isLabelShouldBeRemoved = !isApproved && labelNames.includes(userLabel)

    if (isLabelShouldBeSet) {
      await setLabel(octokit, owner, repo, pullRequest.number, userLabel)
      if (comment !== '') {
        await addComment(octokit, owner, repo, pullRequest.number, comment)
      }
    } else if (isLabelShouldBeRemoved) {
      await removeLabel(octokit, owner, repo, pullRequest.number, userLabel)
    }
  }

  //// Future option to rerun workflows if PR approved
  //// Rerun workflow can have dynamic matrixes which check presence of labels
  //// it is not possible to rerun successful runs
  //// https://github.community/t/cannot-re-run-a-successful-workflow-run-using-the-rest-api/123661
  //
  // if (isLabelShouldBeSet) {
  //   const prWorkflowRunsIds = await getPrWorkflowRunsIds(
  //     octokit,
  //     owner,
  //     repo,
  //     branch,
  //     sha,
  //     selfWorkflowId
  //   )
  //
  //   await rerunWorkflows(octokit, owner, repo, prWorkflowRunsIds)
  // }

  // OUTPUT
  verboseOutput('isApproved', String(isApproved))
  verboseOutput('labelSet', String(isLabelShouldBeSet))
  verboseOutput('labelRemoved', String(isLabelShouldBeRemoved))
}

run()
  .then(() =>
    core.info(
      '\n############### Set Label When Approved complete ##################\n'
    )
  )
  .catch(e => core.setFailed(e.message))
