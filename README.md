<p><a href="https://github.com/TobKed/label-when-approved-action/actions">
<img alt="label-when-approved-action status"
    src="https://github.com/TobKed/label-when-approved-action/workflows/Test%20the%20build/badge.svg"></a>

# Get Workflow Runs action


<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Context and motivation](#context-and-motivation)
- [Inputs and outputs](#inputs-and-outputs)
  - [Inputs](#inputs)
  - [Outputs](#outputs)
  - [Development environment](#development-environment)
  - [License](#license)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# Context and motivation

TODO

# Inputs and outputs

## Inputs

| Input                   | Required | Default      | Comment                                                                                                                                                                                                          |
|-------------------------|----------|--------------|-----------------------------------------------------------------------------------------------------|
| `token`                 | yes      |              | The github token passed from `${{ secrets.GITHUB_TOKEN }}`                                          |

## Outputs

TODO

## Development environment

It is highly recommended tu use [pre commit](https://pre-commit.com). The pre-commits
installed via pre-commit tool handle automatically linting (including automated fixes) as well
as building and packaging Javascript index.js from the main.ts Typescript code, so you do not have
to run it yourself.

## License
[MIT License](LICENSE) covers the scripts and documentation in this project.
