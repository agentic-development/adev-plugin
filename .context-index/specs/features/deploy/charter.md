---
status: draft
revision: 1
updated: 2026-05-09
tracker-ref: issue-345
---

# Feature Charter: deploy

## Business Intent

Projects using adev have a structured path from idea to validated code (brainstorm → specify → plan → implement → validate), and `milestone ship` handles tagging and release creation. But what happens after shipping varies wildly — npm publish, Docker push, file upload, manual clicks in a web console — and none of it is captured or guided. `/adev:deploy` closes this gap by letting projects declare their deployment steps in a structured config (`.context-index/deploy.yaml`), then guiding agents and users through execution with automated steps, manual instructions, verification checks, and failure recovery.

## Scope and Boundaries

### In Scope

- `.context-index/deploy.yaml` — structured deployment definition with steps, environments, and verification
- Five step types: `shell`, `ci-trigger`, `manual`, `verify`, `gate`
- Single-target default with opt-in named environments (`staging`, `production`, etc.)
- Integration with milestone lifecycle — auto-reads version/tag from shipped milestone when available
- Standalone mode with `--version <tag>` for hotfixes without a milestone
- Fail-fast with suggested rollback — surface rollback steps from config, require user confirmation
- `/adev:deploy` skill in `skills/deploy/SKILL.md` with companion code in `lib/deploy.mjs`

### Out of Scope

- Automatic rollback execution — rollback steps are suggested, never auto-executed
- CI/CD pipeline generation — deploy reads existing pipelines, doesn't create them
- Secret management — deploy.yaml references env var names, never stores values
- Multi-repo coordinated deploys — workspace-level deploy is deferred
- Monitoring or alerting after deploy — verification checks confirm deploy succeeded, not ongoing health

### Dependencies

| Module | Direction | Why |
|--------|-----------|-----|
| `milestone-lifecycle` | Consumes | Reads shipped milestone for version/tag; optional integration. Milestone Integration capability requires milestone-lifecycle to ship first. |
| `lib/issues/` | Consumes | Optionally updates issue status after deploy |
| `manifest.yaml` | Consumes | Reads `gates.test` for pre-deploy verification |
| `setup` | Integrates | `/adev:init` should offer deploy.yaml scaffolding during project init |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| DeployConfig | Project-level deployment definition | `environments[]`, `default_environment`, `steps[]` |
| Environment | Named deployment target | `name`, `steps[]`, `variables[]` |
| Step | Single deployment action | `id`, `type` (shell/ci-trigger/manual/verify/gate), `command` or `instructions`, `rollback?`, `timeout?` |
| DeployRun | A single execution of the deploy flow | `version`, `environment`, `started`, `step_results[]`, `status` (in_progress/succeeded/failed) |

### Relationships

- A DeployConfig contains one or more Environments (or a flat `steps[]` for single-target)
- An Environment contains an ordered list of Steps
- A Step may have an optional rollback Step
- A DeployRun records the outcome of executing an Environment's steps for a version

### Invariants

- Step IDs must be unique within an environment
- `shell` and `ci-trigger` steps must never contain inline secrets — only env var references
- `rollback` steps are never auto-executed — always require user confirmation
- Deploy.yaml must never be committed with actual credential values

## Capability Map

| Capability | Description | Priority | Phase | Status |
|------------|-------------|----------|-------|--------|
| Deploy Config Schema | `.context-index/deploy.yaml` schema: steps, environments, variables, rollback. `loadDeployConfig()` / `validateDeployConfig()` | Must-have | v1 | — |
| Deploy Execute | `/adev:deploy [--version <tag>] [--env <name>]` — run steps in order: shell (exec), ci-trigger (dispatch + poll), manual (prompt), verify (check), gate (block until condition) | Must-have | v1 | — |
| Milestone Integration | When no `--version`, read latest shipped milestone from `milestones.yaml` for version/tag. Fall back to `--version` requirement if none shipped. | Must-have | v1 | — |
| Failure and Rollback | On step failure: stop, report what succeeded/failed, surface rollback steps from config, require confirmation before executing any | Must-have | v1 | — |
| Deploy Init | `/adev:deploy init` — interactive wizard to scaffold `deploy.yaml` with project-appropriate defaults (detect npm, docker, static site) | Should-have | v1 | — |
| Deploy History | Append deploy run results to `.context-index/deploy-history.yaml` — version, environment, timestamp, step results, status | Should-have | v1 | — |
| Named Environments | Opt-in `environments:` config with promotion flow (`--env staging` then `--env production`) | Should-have | v1 | — |
| Dry Run | `--dry-run` flag — print what would execute without running anything | Nice-to-have | v1 | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `loadDeployConfig(projectRoot)` | function | Reads and validates `.context-index/deploy.yaml`, returns DeployConfig object |
| `validateDeployConfig(config)` | function | Validates schema, returns errors array |
| `executeDeploy(projectRoot, options)` | function | Orchestrates step execution, returns DeployRun result |
| `getDeployHistory(projectRoot)` | function | Reads `.context-index/deploy-history.yaml`, returns array of past DeployRun entries |
| `/adev:deploy [--version <tag>] [--env <name>] [--dry-run]` | skill subcommand | Main deploy entry point |
| `/adev:deploy init` | skill subcommand | Interactive deploy config scaffolding wizard |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|--------------|-------------|
| `findMilestone(projectRoot, name)` | `lib/milestones.mjs` | Read shipped milestone for version/tag |
| `loadMilestones(projectRoot)` | `lib/milestones.mjs` | Find most recently shipped milestone when no `--version` provided |
| `getIssueManager(manifest)` | `lib/issues/registry.mjs` | Optionally update issue status post-deploy |
| `manifest.gates.test` | `manifest.yaml` | Pre-deploy verification (gates_pass) |
| `/adev:init` | `setup` module | Deploy config scaffolding during project init (integration point — setup module owns this) |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Safety | `shell` and `ci-trigger` steps use `execFile` with `shell: false` (array args, no interpolation). Rollback is never automatic — always requires user confirmation. Deploy.yaml is validated for inline secrets before execution. |
| Idempotency | When deploy history is available, re-running `/adev:deploy` after a partial failure resumes from the failed step (prior succeeded steps are skipped). Without deploy history, deploy re-runs all steps. |
| Graceful Degradation | If `milestones.yaml` doesn't exist or no milestone is shipped, deploy still works with `--version`. If deploy-history.yaml is missing, deploy runs without resume capability. |
| Transparency | Every step prints what it will do before executing. `--dry-run` shows the full plan without side effects. Manual steps print clear instructions the user can follow. |
| Secret Safety | Deploy.yaml must never contain actual credential values — only env var names (e.g., `$NPM_TOKEN`). Validation rejects configs containing patterns that look like inline secrets. Step output is redacted for known secret patterns before logging to deploy history. |
| Testability | `loadDeployConfig`, `validateDeployConfig`, and step execution are pure functions with injectable executors. Testable with fixture YAML and mock executors using existing test helpers. |
| Backward Compatibility | Projects without `deploy.yaml` are unaffected. The skill exits gracefully: "No deploy.yaml found. Run `/adev:deploy init` to set up deployment." |
