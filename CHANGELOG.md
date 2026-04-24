# Changelog

## [0.22.0] - 2026-04-24

### Heuristics Phase 2: Progressive Disclosure

Extends the heuristic memory system from a lifecycle-internal layer to a project-wide context layer. Agents now see relevant lessons in every interaction — not just during plan/implement — at minimal token cost via tiered rendering.

### CLI: Install/Upgrade Split

- **`install` command** — new dedicated command for fresh installations. Handles provider selection, plugin registration, and context index scaffolding.
- **`upgrade` command** — new dedicated command for existing installations. Detects installed version, computes diff, and applies incremental updates.
- **Simplified flow** — the old `init` command (which handled both cases) is replaced by two focused commands with clearer intent.

### Output Personas

- **Persona-aware skill templates** — skill output templates now include persona directives so output adapts to the active persona (product, developer, architect).

### Heuristics Phase 2: Progressive Disclosure

Extends the heuristic memory system from a lifecycle-internal layer to a project-wide context layer. Agents now see relevant lessons in every interaction — not just during plan/implement — at minimal token cost via tiered rendering.

#### Features

- **Keyword tags** — `tags` field on heuristic schema (free-form `[a-z0-9-]` string array). Extractors derive tags from task context for relevance matching.
- **Tiered rendering** — `retrieveHeuristics` gains a `tier` parameter: `index` (~5 tok/entry), `summary` (~40 tok, default), `full` (~100 tok). Progressive disclosure scales context injection to the use case.
- **Keyword matching** — optional `keywords` parameter boosts entries whose `tags`, `title`, or `pattern` match, without filtering non-matches.
- **Sync index** — `/adev:sync` appends a `## Learned Lessons` section to all sync targets (CLAUDE.md, AGENTS.md, .cursorrules) containing high-confidence heuristic index.
- **Hygiene Pass 16** — `/adev:hygiene` checks for heuristic index staleness and orphan tags.
- **Wider injection** — heuristics now injected into `/adev:debug`, `/adev:brainstorm`, `/adev:specify`, `/adev:review-specs`, and `/adev:validate` at `summary` tier with keyword matching.

#### Fixes

- **Plan task completion tracking** — `/adev:implement` Step 2h now marks plan file checkboxes (`- [x]`) after each task completes. Previously only the ephemeral execution state and issue board were updated, leaving plan files permanently showing all tasks unchecked. (issue-125)
- **Validate plan checkbox check** — `/adev:validate` Check 12e detects stale unchecked checkboxes on completed tasks and auto-fixes them with `--fix`.
- `writeHeuristic` now propagates `tags` field in both create and update paths (was silently dropping tags).

#### Context Hygiene

- Renumbered duplicate ADR 0003 → 0005 (`configurable-review-registry`)
- Added `Spec` to `required_trailers` for commit provenance enforcement
- Populated capability maps for 9 empty charters (71 capabilities)
- Backfilled `last-reviewed-revision` on 7 review files
- Created 40 epics for orphaned plan files
- Refreshed repo map and generated first retrospective report

### Modified

- `cli/index.mjs` — split `init` into `install` and `upgrade` commands
- `lib/heuristics.mjs` — tags schema, tiered rendering, keyword matching, writeHeuristic fix
- `skills/sync/SKILL.md` — Learned Lessons section injection
- `skills/hygiene/SKILL.md` — Pass 16 heuristic index health
- `skills/implement/SKILL.md` — Step 2h plan checkbox completion on task done
- `skills/validate/SKILL.md` — Check 12e plan checkbox reconciliation, heuristic injection widening
- `skills/brainstorm/SKILL.md`, `skills/debug/SKILL.md`, `skills/specify/SKILL.md`, `skills/review-specs/SKILL.md` — heuristic injection widening
- `.context-index/memory/heuristics/_format.md` — tags and tiered retrieval documentation

### New

- `tests/lib/heuristics-tags-and-tiers.test.mjs` — 41 tests for tags, tiered rendering, keyword matching
- `tests/skills/sync-heuristic-index.test.mjs`, `tests/skills/hygiene-heuristic-pass.test.mjs`, `tests/skills/heuristic-injection-widening.test.mjs`
- `.context-index/hygiene/retros/2026-04-23.md` — first retrospective report

## [0.21.0] - 2026-04-21

### Fix — Build Skill Subagent Delegation (issue-124)

The `/adev:build` orchestrator was pseudo-invoking child skills (review, plan, route, implement, validate) instead of properly delegating to them. The agent would inline a simplified version of each child skill, missing dozens of substeps (specialist routing, TDD, 2-stage review, source manifest stamping, commit trailers, DoD, 13-check validation suites, etc.).

**Root cause:** The build SKILL.md said "Invoke `/adev:implement`" without specifying HOW — the agent interpreted this as "do what the skill does" rather than loading the full skill via the Skill tool.

**Fix — Subagent coordinator model:**

- **`context: fork`** added to build skill frontmatter — isolates the entire build pipeline from the parent conversation
- **Subagent dispatch per step** — every pipeline step is dispatched as a fresh subagent via the Agent tool. The subagent invokes the child skill via the Skill tool in an isolated context. This structurally prevents pseudo-invocation: a fresh subagent has no "knowledge" of what the skill does and must load it properly.
- **Context packet assembly** — each subagent receives a structured prompt with pipeline context (spec path, title, phase, workspace, issue board) and step-specific context (review verdict, plan path, route annotations) read from artifact files on disk.
- **STEP_RESULT contract** — subagents return a structured result (status, verdict, artifacts, summary, error) that the orchestrator uses for skip/stop/continue decisions.
- **Validate→implement retry loop** — configurable via `build.max_retries` in `user-config` (default 0 = disabled, max 3). Extracts specific validation failures, scopes re-implementation, stops on no-progress or regression.
- **Red Flags section** — 10 anti-patterns focused on preventing pseudo-invocation and inline execution.

### Modified

- `skills/build/SKILL.md` — rewritten delegation protocol, context packet assembly, subagent dispatch per step, retry loop, red flags
- `.context-index/specs/features/strategic-planning/adev-build-skill.md` — spec revision 3 with subagent dispatch behaviors, context packet contract, retry behaviors, 26 acceptance criteria
- `.context-index/specs/features/strategic-planning/charter.md` — fixed stale pipeline ordering, capability status → validated
- `.context-index/tasks/tasks.md` — issue-124 closed with updated root cause description

### New

- `.context-index/specs/features/strategic-planning/adev-build-skill-validation.md` — validation report (PASS)
- `.context-index/specs/features/strategic-planning/adev-build-skill.review.md` — architecture review (PASS_WITH_NOTES, 0 blockers)

## [0.20.0] - 2026-04-21

### New Feature — Output Personas

- **Role-adaptive outputs.** Plugin outputs now adapt to three user personas: `product` (PMs, designers), `developer` (default), and `architect` (senior technical). Internal processing, reviews, validations, and TDD cycles are unchanged — only the presentation layer adapts.
- **Layered config hierarchy.** Persona resolves from: per-invocation `--persona` flag > local `.context-index/user-config` > global `<PLUGIN_ROOT>/user-config` > fallback (`developer`). Local config is gitignored so each collaborator has their own preference.
- **Session-start injection.** The resolved persona directive is injected at session start via `session-start.sh`. All skills follow the directive automatically without modification.
- **Three persona templates.** Each template defines output rules across 8 dimensions: verbosity, code references, review verdicts, test results, plan output, spec/ADR citations, error/debug output, and next actions.
- **CLI install prompt.** `npx @adev-org/adev-cli init` now prompts for a default persona during installation.
- **Project-level override.** `/adev:init` offers an optional local persona override per project.
- **Per-invocation override.** Skills can accept `--persona <name>` to override the session default for a single invocation via a shared template section.
- **Security.** Persona names are validated against actual directory listing. Path separators and `..` sequences are rejected with safe fallback to `developer`.

### New modules

- `lib/persona.mjs` — `parseUserConfig()`, `resolvePersona()`, `loadPersonaDirective()` with path traversal protection and warning messages
- `templates/personas/{product,developer,architect}.md` — persona directive templates
- `templates/persona-override-section.md` — shared `--persona` argument section for skills

### Modified

- `hooks/session-start.sh` — persona resolution block + refactored COMBINED assembly to array-join pattern
- `cli/index.mjs` — persona prompt during install, `user-config` added to gitignore
- `skills/init/SKILL.md` — optional local persona configuration step

### Tests

- 18 tests in `tests/persona.test.mjs` covering resolution hierarchy, path traversal rejection, unknown persona fallback, warning messages, and template loading

## [0.19.0] - 2026-04-21

> **Upgrading?** No action required. Projects without `test_strategies` in their manifest behave identically to before. See [`docs/test-strategies.md`](docs/test-strategies.md) for the full adoption guide — covers auto-detection (zero config), manifest declarations, and spec-level overrides.

### New Feature — Test Strategies

- **Domain-specific TDD.** The RED-GREEN-REFACTOR cycle now adapts to the type of work being done. Eight strategies ship: `unit`, `schema` (migrations), `fixture` (data pipelines), `policy` (IaC), `contract` (service integrations), `threshold` (performance), `visual` (UI), and `smoke` (deployments). Each strategy defines its own RED/GREEN semantics, gaming detection patterns, assertion rules, seed data requirements, and handoff format.
- **Auto-detection.** `/adev:plan` inspects task file paths and project structure to assign the right strategy automatically. A Prisma migration gets `schema`, a dbt model gets `fixture`, a Terraform module gets `policy`, a React component gets `visual` — no configuration needed.
- **Manifest override.** Projects can declare `test_strategies` in `manifest.yaml` with explicit commands, tiers, and path globs. Manifest entries override auto-detection; spec-level `test_strategy` frontmatter overrides everything.
- **Strategy profiles.** Each strategy is a markdown profile at `lib/test-strategies/profiles/<strategy>.md` consumed by `/adev:write-test` as structured instructions. Profiles define domain-specific gaming blockers (e.g., "testing a migration on an empty database", "structure-only contract assertions", "trivially small fixtures").
- **Plan integration.** Each task in plan output now includes a `Strategy:` field with the assigned strategy, source, and confidence level. A Strategy Summary table appears when any task uses a non-unit strategy.
- **Write-test dispatch.** `/adev:write-test` loads the matching strategy profile before the RED phase, replacing hardcoded unit-test rules with domain-appropriate ones. Four shared cross-strategy gaming patterns (disabled tests, empty assertions, swallowed assertions, conditional assertions) apply to all strategies.
- **Backward compatible.** Projects with no `test_strategies` config get `unit` for every task — identical to pre-0.19.0 behavior with no warnings.

### New modules

- `lib/test-strategies/registry.mjs` — 8 strategy type definitions
- `lib/test-strategies/detection.mjs` — project-level and task-level auto-detection (2s timeout, no symlink following)
- `lib/test-strategies/manifest.mjs` — manifest `test_strategies` parser with path traversal prevention and command-as-array enforcement
- `lib/test-strategies/assignment.mjs` — `resolveStrategy()` with 4-level priority chain
- `lib/test-strategies/profiles.mjs` — `getStrategyProfile()` with unit fallback chain
- `lib/test-strategies/gaming.mjs` — 4 shared cross-strategy gaming patterns

### Tests

- 168 unit tests across 6 test files
- 85 fixture-based eval tests across 9 project types (node-api, dbt, terraform, prisma, grpc, react, k6, fullstack, data-platform)

## [0.18.1] - 2026-04-19

### Bug Fixes

- **fix(install): register custom marketplace on fresh machines** — `ClaudeCodeAdapter.enable()` now writes the `extraKnownMarketplaces` entry to user-level `~/.claude/settings.json` so Claude Code can resolve `adev@agentic-development` without manual setup.
- **feat(plugin): add `marketplace.json`** — enables native installation via `/plugin marketplace add agentic-development/adev-plugin` followed by `/plugin install adev@agentic-development`.

## [0.18.0] - 2026-04-19

> **Upgrading from 0.17.x?** See [`docs/governance.md`](docs/governance.md) — includes a five-recipe migration guide covering `manifest.yaml:specialists` → `governance/review.yaml`, shell-env-inheriting quality gates → profile `env.allow`, shell-form commands → argv, reviewer write-paths → package mode, and browser-automation reviewers. Zero-config projects need no changes; bundled defaults preserve pre-0.18.0 behavior. Copy-paste starter overlays ship at [`templates/governance/review.example.yaml`](templates/governance/review.example.yaml) and [`validate.example.yaml`](templates/governance/validate.example.yaml).

### New Features — Execution-profile primitive

- **`lib/profiles/`** — zero-dep cross-cutting subsystem for any skill that dispatches a subagent or a subprocess. A profile declares tool permissions (via portable categories, MCP servers, or opt-in tool literals), env-var allowlist with per-file resolution, model tier, limits, and a redaction contract.
- **Bundled profiles** — six at `templates/governance/profiles.yaml`: `read-only`, `browser-review`, `reviewer-fast`, `reviewer-capable`, `reviewer-reasoning`, `implementer` (last is defined-but-unconsumed in v1 per ADR-0004).
- **Seed tool categories** — six at `templates/governance/tool-categories.yaml`. Each adapter declares `IMPLEMENTED` + `UNSUPPORTED` + `AUDITED_CHANNELS` + `capabilities` exports.
- **Claude Code adapter** — all six categories mapped; MCP servers surfaced via `mcp__<name>__*` expansion.
- **OpenCode adapter (v1 partial)** — four categories implemented; `filesystem-write` and `shell` surface as `UNSUPPORTED_CATEGORY` so callers fail closed.
- **Env resolution** — `env.files` supports bare paths (must exist) and `optional:` prefix (silent-skip on absence). Allowlist filters values; missing `required` keys fail load with file list cited. `$workspace/<rest>` resolves via the `adev-workspace.yaml`-anchored root. Per-key contributing-file mapping returned for dispatch-record audit. `@`-prefixed env.files entries rejected with a grammar-disjoint message pointing at `multi-repo-workspace/charter.md`.
- **Redaction pipeline** — single adapter-owned chokepoint covering tool stdout/stderr, harness errors, adapter diagnostics, tool-argument echoing, pre-adapter transcript capture, and subprocess spawn errors. 8-char minimum length gate. Streaming lookback buffer catches cross-chunk matches. Shared-value placeholder `<REDACTED:<K1>|<K2>>` disambiguates shared values.
- **Schema validation** — `{ category: "*" }` and wildcards rejected; `{ tool: <literal> }` requires explicit `allow_unportable: true`; `allow`/`allow_add` mix rejected.
- **Public API** — `loadProfiles(repoRoot)`, `resolveProfile(name, ctx)`, `getEffectivePosture(name, profiles)` in `lib/profiles/index.mjs`. Load-time WARN surfaces: `TOOL_UNPORTABLE_WARN` (per profile/literal-tool pair) and `BROADEN_*` (eager extends-chain walk at load so CI can gate).

### New Features — Configurable reviewer registry

- **`/adev:review-specs` is governance-driven.** Projects declare reviewers in `.context-index/governance/review.yaml`; bundled defaults ship at `templates/review-specs/defaults.yaml`. Subagent mode runs a prompt directly; package mode wraps an external skill as a two-stage runner+adapter pipeline. Severity caps, triggered dispatch (glob + keyword scoring), context-pack extends chains, and in-memory migration of legacy `manifest.yaml:specialists` all land at `loadReviewConfig(repoRoot)` in `lib/governance/review-config.mjs`. Zero-config behavior matches the prior hardcoded flow.
- **Adapter parse-failure sanitization** — `sanitizeAdapterOutput(raw, ctx)` runs raw runner output through the profile's redactor, normalizes absolute paths under `.context-index/`, plugin root, and `$HOME`, and truncates to 8 KiB with a tail marker. Full redacted text retained only in the dispatch record.
- **Reviewer posture clamp** — reviewers rejected at load if their effective profile permits `filesystem-write` / `shell` / literal tools / non-deny filesystem / non-`{deny, read-only}` network. Referencing `implementer` from a reviewer fails load.
- **Path-traversal rejection** on `prompt` / `package.skill` / `package.adapter` with `..` pre-resolution + `fs.realpath` symlink-escape check.

### New Features — Configurable validate check registry

- **`/adev:validate` Checks 2-12 flow through `lib/governance/validate-config.mjs`** + `templates/validate/defaults.yaml`. Projects add/disable/reorder checks via `.context-index/governance/validate.yaml`. Kinds: `quality-gate`, `subagent-review`, `deterministic-check`, `observational`. Topological sort by `after:` with lex-by-id tie-break; cycles fail load.
- **Quality-gate runner** — `lib/governance/quality-gate.mjs` executes quality-gate commands via `execFile` with `shell: false`. Subprocess env scoped to profile-declared keys plus a minimal startup whitelist (`PATH`, `HOME`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TMPDIR`, `USER`, `LOGNAME`) — `LD_PRELOAD`, `NODE_OPTIONS`, `PYTHONPATH`, and other invoking-shell vars do not leak. stdout/stderr pass through the profile's redactor; combined output capped at 64 KiB.
- **Quality-gate hardening** — string-form `command` rejected (`QUALITY_GATE_COMMAND_SHELL`); argv interpolation `{{...}}` / `$VAR` / `${VAR}` / `%VAR%` rejected syntactically (`QUALITY_GATE_INTERPOLATION`); explicit `profile` required with no implicit default; `shell: true` and `cwd` override blocked.

### New Features — Shared infrastructure

- **Context-pack shared library** — `lib/governance/context-pack.mjs` resolves pack `extends` chains, expands globs, and enforces a hard denylist (`.env*`, `*.pem`, `*.key`, `id_*`, `profiles.yaml`, `**/secrets/**`) at both glob-string and resolved-path layers. Used by both reviewer and validate registries.
- **Dispatch-shape harness** — `lib/governance/dispatch-shape.mjs` exposes `buildReviewerDispatches()` and `renderReviewReport()` for LLM-free end-to-end testing: inspects the Task-tool structs the skill would send (prompt, env, redactionSet, allowedTools) and renders a byte-stable `.review.md` body suitable for golden-master verification.
- **Configurable-governance eval** — `tests/evals/configurable-governance/` with three tiers: Tier 1 library-level (workspace fixture, multi-repo env routing, cross-registry pack sharing, malformed-YAML line-citation, quality-gate missing-env), Tier 2 dispatch-shape (prompt-snapshot env-absence, audited-channel enumeration, package-mode two-stage, golden-master `.review.md`), Tier 3 live runner (`run-live.mjs` + pluggable dispatcher — `dispatchers/stub.mjs` default; `dispatchers/anthropic.mjs` template via dynamic import).

### Specs

- `.context-index/specs/cross-cutting/execution-profiles.md` (rev 2, PASS_WITH_NOTES).
- `.context-index/specs/features/review/configurable-reviewers.md` (rev 3, PASS_WITH_NOTES).
- `.context-index/specs/features/validation/configurable-checks.md` (rev 3, PASS_WITH_NOTES).
- `.context-index/adrs/0003-configurable-review-registry.md`.
- `.context-index/adrs/0004-execution-profiles.md`.
- `.context-index/adrs/0004-execution-profiles.md`.

### Other

- 1179 tests pass, 0 failures. 208 suites. ~134 new tests across `tests/profiles/` (62), `tests/governance/` (44), `tests/evals/configurable-governance/` (28).
- 13 PARTIAL acceptance criteria from the /adev:validate reports closed across three eval tiers.
- Zero new external dependencies. All modules ESM, Node built-ins only.
- Version parity held (`package.json` + `.claude-plugin/plugin.json`).

## [0.16.0] - 2026-04-17

### New Features

- **Workspace-aware strategic planning** — `/adev:brainstorm` at the workspace root bootstraps `product.md` with per-repo identity synthesis; `/adev:plan --release` and `--milestone` plan across workspace + repo charters with non-transitive dependency inheritance. Epic-board sync deferred to Phase 2 Shared Issue Tracking (#65)
- **Input-hardening helpers** — `assertPathInWorkspace` (PATH_ESCAPE), `validateModuleName` (INVALID_MODULE_NAME), `sanitizeIdentityOneLiner` (ANSI/control-char stripping), `readCappedText` (512 KB file cap), `resolveWorkspaceProductPath` added to `lib/workspace.mjs`
- **Repo-mode advisory** — Both `/adev:brainstorm` and `/adev:plan` print a one-line stdout advisory when invoked inside a registered repo of a detected workspace

### Breaking Changes

- **`/adev:vision` and `/adev:roadmap` removed** (since 0.15.0) — Vision/identity bootstrap folded into `/adev:brainstorm` Step 5b; milestone/release planning folded into `/adev:plan --milestone` and `--release`

### Other

- 45 new tests (1045 total, 0 failures)
- 1 Live Spec validated (workspace-aware-vision, 23 acceptance criteria)
- Multi-repo workspace charter: all 11 capabilities at `validated` status

## [0.11.0] - 2026-04-06

### New Features

- **Session Awareness module** — Full feature charter with 10 capabilities, all validated
- **Execution state file** — `lib/execution-state.mjs` with read/write/clear, atomic writes (temp-file-then-rename), YAML frontmatter + markdown progress body. Tracks active plan, current task, issue binding, blockers, and next action
- **Session-start resume** — Extended `session-start.sh` to read execution state and inject a resume block (active plan context or blocker alert) at session start, enabling seamless continuation across sessions
- **Issue reminder hook** — New `issue-reminder.sh/.mjs` PostToolUse hook that surfaces active issues every N tool calls and after git commits, with counter-based triggering and git commit detection
- **Idle nudge** — When no in-progress issues exist, the reminder hook shows up to 3 open issues by priority or an "all resolved" message, with a stale execution state warning when applicable
- **Configurable reminder interval** — `tasks.reminder_interval` in manifest.yaml (default 25, set to 0 to disable). Added to scaffold template
- **Session log schema** — Formalized the existing JSONL schema for `.session-tracking.jsonl`, removed undocumented `specs` field, added `tool_name` guard to skip writes when tool name is missing
- **Skill-level state instructions** — Added execution state instructions to `/adev:implement` SKILL.md: resume check at Step 1, per-task state writes at Step 2, blocker state at Step 2d, and clear on completion at Step 4
- **Format documentation** — `FORMAT.md` template documenting execution state and session log schemas as public contracts for external tool interoperability

### Fixes

- **Session capture schema alignment** — Removed undocumented `specs: []` field from JSONL output, added guard to skip writes when `tool_name` is missing (was writing `"unknown"`)

### Other

- 22 new tests across 4 test files (531 total, 0 failures)
- 7 Live Specs written, reviewed (3 specialist reviewers each), and validated (11-check suite)
- Feature charter fully validated: all 10 capabilities at `validated` status

## [0.10.0] - 2026-04-06

### New Features

- **Context-preflight hook** — New PreToolUse hook (`context-preflight.sh`) that warns when source files are edited without reading project context first. Tracks context reads via `context-read-tracker.sh` and a `.context-preflight-ok` flag file (#30)
- **Strategic planning skills** — `/adev:vision`, `/adev:roadmap`, and `/adev:research` skills for product-level planning, dependency sequencing, and structured research. Charter with 8 live specs, all reviewed and planned (#29)
- **Issue model milestone support** — Issues and epics now support milestone fields for roadmap alignment
- **Plugin-namespaced skill rename** — Renamed all skills from `adev-*` to `adev:*` format (e.g., `/adev-brainstorm` → `/adev:brainstorm`) for plugin namespace compliance

### Fixes

- Fixed all 16 pre-existing test failures from skill rename migration
- Skill naming convention aligned across all three providers (Claude Code, OpenCode, Codex)

## [0.9.0] - 2026-04-02

### New Features

- **`/adev:codehealth` skill** — Proactive source code scanning for dead exports, orphan files, unused dependencies, stale code, and duplicate logic. Produces severity-tiered reports from repomap artifacts (#26)
- **Quickstart guide and skill reference** — New `docs/quickstart.md` and `docs/skills.md` with lifecycle flow diagram, full skill inventory, and getting-started instructions (#27)
- **Worktree-shared issue storage** — Issue board data is now shared across git worktrees via `resolveStorageRoot()`, with optional `tasks.db_path` override in manifest (#25)

### Other

- Stamped source manifests on all implemented specs for drift detection (#24)
- Validated spec-lifecycle transitions and fixed stale spec statuses
- Refreshed all generated documentation (`docs/architecture.md`, module docs)

## [0.8.0] - 2026-04-01

### New Features

- **Persistent issue tracking** — `lib/issues/` module with pluggable backends (file-based markdown tables and beads_rust). Includes epic/issue CRUD, dependency tracking with cycle detection, status transitions, and priority ordering. Integrated into `/adev:plan` and `/adev:implement` (#23)
- **`/adev:issues` skill** — Interactive issue management: create, update, close, and view issues and epics with board display
- **Data engineering eval framework** — Cross-tool benchmarks for data engineering skills with dbt project fixtures (#20)
- **`adev-data-eval` submodule** — Dedicated test data repository for data engineering evaluations (#18)

### Fixes

- **Commit guard on protected branches** — `merge-guard.sh` now also blocks `git commit` on protected branches, not just `git push` and `git merge` (#21)

### Other

- Synced provider skills across Claude Code, OpenCode, and Codex (#17)
- Backfilled hygiene metadata and review trailers on existing specs (#15)

## [0.7.1] - 2026-03-30

### Fixes

- **TDD verification uses targeted test runs** — `adev-implement` VERIFY RED/GREEN steps now run only the specific test file instead of the full suite, preventing dozens of unnecessary full-suite runs during multi-task implementation sessions (all three providers updated)

## [0.7.0] - 2026-03-30

### New Features

- **`/adev:work` skill** — Pre-lifecycle triage that classifies incoming work (feature, bug, spike, chore) and routes to the correct `/adev:*` skill. Scans for in-progress plans, unreviewed specs, and recent sessions before classifying (#16)
- **Canonical `/adev:document` SKILL.md** — Created provider-agnostic canonical skill from OpenCode version

### Other

- Converted `/adev:test-write` companion helpers from `.mjs` to bash scripts for cross-provider compatibility

## [0.6.0] - 2026-03-29

### New Features

- **Spec Lifecycle tracking** — Full lifecycle metadata for specs including status transitions, session-capture hooks, enriched post-commit session summaries, and CLI scaffolding for status reporting (#13)
- **`/adev-status` skill** — New skill to query spec and feature lifecycle status at a glance
- **`/adev-write-test` skill** — AI-assisted red-phase test authoring with 67 tests covering the generation pipeline (#10)
- **Model Routing cross-cutting spec** — Applies model tier routing across all skills, enabling cost-aware agent dispatch
- **Golden Samples curation** — Automated golden sample scoring and curation in `.context-index/samples/`, with orientation updates for `lib/repomap` (#12)

### Fixes

- Codex install flow and skill metadata corrections
- Session-capture grep pattern fix
- Backfill lifecycle metadata for existing specs
- Multiple architecture review blocker resolutions across specs

### Other

- Added Claude install coverage
- Updated README for multi-provider support
- Added `session_capture` integration to manifest

## [0.5.0] - 2026-03-25

### New Features

- **Multi-provider support** — Added OpenCode and OpenAI Codex providers with full skill parity (18 skills each) (#5, #6)
- **`/adev-assess` skill** — Codebase readiness assessment across 8 structural dimensions with data domain support (#7)
- **`/adev-document` skill** — Automated documentation generation with architecture docs, module docs, slug validation, and GENERATED.md manifest
- **`/adev-repomap`** — AST-based symbol index using tree-sitter with TypeScript support, PageRank ranking, dependency graph builder, and `--mode` flag
- **Eval framework** — Repomap eval pipeline (cloner, ground truth, parser, compare, report) and skill-compression eval framework
- **CI/CD** — GitHub Actions quality gates workflow, merge-block and publish-on-tags specs
- **Browser-based visual verification** — Added to `/adev-implement` and `/adev-validate` skills
- **Automatic spec status updates** — Specs transition status automatically across skill lifecycle
- **Skill compression** — Eval-validated compression of `/adev-brainstorm` and `/adev-specify`

### Fixes

- Include `.claude-plugin` in package files for `npx` install (#3)
- Resolve symlinks in CLI `isDirectRun` check
- Auto-create `opencode.json` when installing for OpenCode
- Improve scaffolding to detect existing `.context-index/`
- Correct OpenCode plugin installation and fix adev-document tests

### Other

- Added CLAUDE.md with project conventions and architecture boundaries
- Initialized `.context-index/` with constitution, charters, and manifest
- ADR 0001: web-tree-sitter optional dependency
- ADR 0002: TypeScript dev dependency

## [0.4.1] - 2026-03-20

### New Features

- **E2E test suite** — End-to-end tests for the full plugin
- **Merge guard hook** — Prevents direct pushes to main, enforces PR-based workflow

## [0.4.0] - 2026-03-19

### New Features

- **Context packets** — Structured context bundles for cross-skill data sharing
- **Task routing** — Intelligent routing of implementation tasks to specialist subagents
- **Agent recovery** — Structured diagnosis-correction-resume cycle (`/adev-recover`)
- **Golden samples** — Reference implementation curation in `.context-index/samples/`
- **Eval harness** — Graduated evaluation framework (`/adev-eval`)

## [0.3.0] - 2026-03-19

### New Features

- **Declarative governance** — Constitution-gated quality checks across all lifecycle phases

## [0.2.0] - 2026-03-19

### New Features

- **External references** — Support for external references in manifest, init wizard, context-loading skills, and hygiene audit
- Renamed `.context-kit/` to `.context-index/` across all files

## [0.1.0] - 2026-03-19

Initial release.

### New Features

- **Plugin skeleton** — Claude Code plugin structure with `.claude-plugin/plugin.json`
- **`/adev-init` skill** — Interactive onboarding wizard with plugin conflict detection
- **CLI installer** — `npx @adev-org/adev-cli init` for plugin installation and project scaffolding
- **9 core lifecycle skills** — brainstorm, specify, review-specs, plan, implement, validate, debug, hygiene, sync
- **SessionStart hook** — Injects framework context at session start
- **README** — Install guide, quick start, and lifecycle overview
