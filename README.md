<p><a href="https://github.com/TobKed/label-when-approved-action/actions">
<img alt="label-when-approved-action status"
    src="https://github.com/TobKed/label-when-approved-action/workflows/Test%20the%20build/badge.svg"></a>

# Label When Approved action


<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Context and motivation](#context-and-motivation)
- [Inputs and outputs](#inputs-and-outputs)
  - [Inputs](#inputs)
  - [Outputs](#outputs)
- [Examples](#examples)
    - [Workflow Run event](#workflow-run-event)
  - [Development environment](#development-environment)
  - [License](#license)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# Context and motivation

Label When Approved is an action that checks is Pull Request is approved and assign label to it.
Label is not set or removed when Pull Request has awaiting requested changes.

Setting label is optional that only output can be used in the workflow.

The required input `require_committers_approval` says is approval can be done by people with read access to the repo
or by anyone. It may be useful in repositories which requires committers approvals like [Apache Software Foundation](https://github.com/apache/)
projects.

# Inputs and outputs

## Inputs

| Input                         | Required | Example                                                           | Comment                                                                       |
|-------------------------------|----------|-------------------------------------------------------------------|-------------------------------------------------------------------------------|
| `token`                       | yes      | `${{ secrets.GITHUB_TOKEN }}`                                     | The github token passed from `${{ secrets.GITHUB_TOKEN }}`                    |
| `label`                       | no       | `Approved by committers`                                          | Label to be added/removed to the Pull Request if approved/not approved        |
| `require_committers_approval` | no       | `true`                                                            | Is approval from user with write permission required                          |
| `comment`                     | no       | `PR approved by at least one committer and no changes requested.` | Add optional comment to the PR when approved (requires label input to be set) |

## Outputs

| Output         |                              |
|----------------|------------------------------|
| `isApproved`   | is Pull Reqeuest approved    |
| `labelSet`     | was label set                |
| `labelRemoved` | was label removed            |

# Examples

### Workflow Run event

```yaml
name: Label when approved
on: pull_request_review

jobs:

  label-when-approved:
    name: "Label when approved"
    runs-on: ubuntu-latest
    outputs:
      isApprovedByCommiters: ${{ steps.label-when-approved-by-commiters.outputs.isApproved }}
      isApprovedByAnyone: ${{ steps.label-when-approved-by-anyone.outputs.isApproved }}
    steps:
      - name: Label when approved by commiters
        uses: TobKed/label-when-approved-action@v1
        id: label-when-approved-by-commiters
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          label: 'ready to merge (committers)'
          require_committers_approval: 'true'
          comment: 'PR approved by at least one committer and no changes requested.'
      - name: Label when approved by anyone
        uses: TobKed/label-when-approved-action@v1
        id: label-when-approved-by-anyone
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```


## Development environment

It is highly recommended tu use [pre commit](https://pre-commit.com). The pre-commits
installed via pre-commit tool handle automatically linting (including automated fixes) as well
as building and packaging Javascript index.js from the main.ts Typescript code, so you do not have
to run it yourself.

## License
[MIT License](LICENSE) covers the scripts and documentation in this project.
