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
  const reviews = await octokit.pulls.listReviews({
    owner,
    repo,
    // eslint-disable-next-line @typescript-eslint/camelcase
    pull_number: number
  })
  const reviewers = reviews ? reviews.data.map(review => review.user.login) : []
  const committers: string[] = []
  if (getComitters) {
    for (const reviewer of reviewers) {
      if (!committers.includes(reviewer)) {
        const p = await octokit.repos.getCollaboratorPermissionLevel({
          owner,
          repo,
          username: reviewer
        })
        const permission = p.data.permission
        core.info(`\nChecking: "${reviewer}" permissions: ${permission}.\n`)
        if (permission === 'admin' || permission === 'write') {
          committers.push(reviewer)
        }
      }
    }
  }
  return [reviews.data, reviewers, committers]
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

  core.info(`User reviews:`)
  for (const user in reviewStates) {
    core.info(`User "${user}" : "${reviewStates[user]}"`)
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
  await octokit.issues.removeLabel({
    // eslint-disable-next-line @typescript-eslint/camelcase
    issue_number: pullRequestNumber,
    name: label,
    owner,
    repo
  })
}

async function printDebug(
  item: object | string | boolean,
  description: string
): Promise<void> {
  const itemJson = JSON.stringify(item)
  core.info(`\n ######### ${description} ######### \n: ${itemJson}\n\n`)
}

async function run(): Promise<void> {
  const token = core.getInput('token', {required: true})
  const userLabel = core.getInput('label', {required: true})
  const requireCommittersApproval = core.getInput(
    'require_committers_approval',
    {
      required: true
    }
  )
  const octokit = new github.GitHub(token)
  const context = github.context
  const repository = getRequiredEnv('GITHUB_REPOSITORY')
  const eventName = getRequiredEnv('GITHUB_EVENT_NAME')
  const [owner, repo] = repository.split('/')

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
    requireCommittersApproval === 'true'
  )
  const isApproved = processReviews(
    reviews,
    reviewers,
    committers,
    requireCommittersApproval === 'true'
  )

  // HANDLE LABEL
  if (isApproved && !labelNames.includes(userLabel)) {
    setLabel(octokit, owner, repo, pullRequest.number, userLabel)
  } else if (!isApproved && labelNames.includes(userLabel)) {
    removeLabel(octokit, owner, repo, pullRequest.number, userLabel)
  }
}

run()
  .then(() =>
    core.info(
      '\n############### Set Label When Approved complete ##################\n'
    )
  )
  .catch(e => core.setFailed(e.message))
