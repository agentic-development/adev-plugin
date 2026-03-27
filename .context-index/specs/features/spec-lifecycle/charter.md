# Feature Charter: spec-lifecycle

## Business Intent

The spec-lifecycle module improves how charters and specs track their status, revision history, and relationship to implementation code. It eliminates status drift by making skills auto-transition status fields, introduces revision counters for drift detection at plan gates, adds source manifests to map specs to their implementing files via content hashes, and provides automatic session capture to record why decisions were made. The goal is that any developer or agent can read a single spec file and immediately know: is it current, has it been reviewed, and does the code match.

## Scope and Boundaries

### In Scope

- Charter status field with lifecycle: `draft` → `approved` → `evolving` → `closed`
- `closed` hard-blocks new spec creation via `/adev-specify`
- Spec status auto-transitions by skills (edit after `review-passed` → `review-pending`)
- Revision counter in charter and spec frontmatter, auto-incremented on skill writes
- `charter-revision` field in specs to track which charter version they were written against
- Git-based drift detection for manual edits (plan gate compares file hash at review time vs current)
- Source manifest in spec frontmatter: `sha`, `files`, `computed-at` — computed by `/adev-implement` after GREEN
- Capability Status column in charter Capability Map (`—`/`specified`/`review-passed`/`planned`/`implementing`/`implemented`/`validated`)
- Plan tasks reference test files; test pass/fail is the source of truth for task completion
- Structured commit message convention: `Spec:`, `Plan-task:`, `Session:` trailers
- Native session capture via Claude Code hooks + git native hooks
- Session summary artifacts at `.context-index/sessions/` using standardized schema (intent/outcome/learnings/friction/open_items)
- Provider-agnostic session capture: `entire` (read Entire's output), `native` (our own hooks), `none` (skip)
- v1 adapters: Claude Code (native JSONL parsing), Entire (read checkpoint branch)
- `lib/session-parser.mjs` — plugin-level helper for JSONL parsing and condensing
- `lib/session-summary.mjs` — plugin-level helper for writing standardized summaries
- `lib/source-manifest.mjs` — plugin-level helper for computing and verifying content hashes
- Git native hooks (`.githooks/prepare-commit-msg`, `.githooks/post-commit`) installed by `/adev-init`
- `/adev-hygiene` aggregation: queries git + tests + frontmatter + session summaries for project status report
- Updated templates: charter template with status/revision/capability status, spec template with revision/charter-revision/source-manifest/tracker-ref, manifest template with `integrations:` section
- `/adev-status` skill for querying spec-lifecycle data: per-spec, per-charter, and project-wide status reports
- Optional `tracker-ref` field in spec and charter frontmatter for linking to external trackers (metadata only, no API integration)

### Out of Scope

- Traceability graph (epics → tasks → specs → code → sessions) — separate adev-graph plugin
- Semantic versioning (1.0.0 style) — revision counter is sufficient
- Amendment Log — git log with structured commits replaces this
- Plan task checkboxes / status tracking — tests are source of truth
- Custom verify commands per plan task — test runner replaces this
- Auto-generating session summaries via LLM calls (v2)
- Multi-agent adapters beyond Claude Code and Entire (v2)
- PR-level session aggregation (v2)
- Sidecar state files — all state lives in frontmatter
- State machine helper module — skills enforce transitions inline
- Epic/task management — belongs in future adev-graph plugin
- External tracker API integration (Jira, Linear, GitHub) — belongs in future adev-graph plugin or dedicated integration plugin
- Bidirectional sync between tracker-ref and external systems

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| Design (adev-brainstorm, adev-specify) | internal module | Must read/write charter status, revision, capability status |
| Assessment (adev-review-specs) | internal module | Must record `last-reviewed-revision` in `.review.md` |
| Planning (adev-plan) | internal module | Must check revision + git diff at plan gate |
| Implementation (adev-implement) | internal module | Must compute source manifest, update capability status, write structured commits |
| Validation (adev-validate) | internal module | Must verify source manifest SHA, update capability status to `validated` |
| Maintenance (adev-hygiene) | internal module | Must aggregate status across charters/specs/plans/sessions |
| Setup (adev-init) | internal module | Must scaffold `.githooks/`, updated templates, git config for hooksPath |
| Hooks | internal module | New session capture hooks (Claude Code + git native) |
| Templates | internal module | Updated charter, spec, manifest templates |
| Claude Code JSONL transcripts | external service | Session logs at `~/.claude/projects/*/sessions/` |
| Entire CLI (optional) | external service | Checkpoint branch `entire/checkpoints/v1` when provider is `entire` |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Charter Status | Lifecycle state of a charter | `status` (draft/approved/evolving/closed), `revision` (integer), `updated` (date) |
| Capability Status | Per-row status in charter's Capability Map | `status` (—/specified/review-passed/planned/implementing/implemented/validated) |
| Spec Status | Lifecycle state of a spec | `status` (draft/review-pending/review-passed/review-blocked/implemented/validated), `revision` (integer), `charter-revision` (integer), `updated` (date) |
| Source Manifest | Mapping between spec and implementing code | `sha` (content hash), `files` (path list), `computed-at` (timestamp) |
| Review Snapshot | Point-in-time record of what was reviewed | `last-reviewed-revision` (integer), `file-sha` (git hash at review time) — stored in `.review.md` |
| Session Summary | Structured record of a work session | `date`, `type` (brainstorm/specify/implement/debug/review), `mode` (human/agent/agent-assisted), `agent` (claude-code/codex/etc), `specs-touched` (path list), `commits` (hash list) |
| Session Content | The substance of what happened | `intent`, `outcome`, `learnings` (repo/code/workflow), `friction` (list), `open_items` (list) |
| Session Provider | Agent-specific adapter for reading session logs | `provider` (entire/native/none), `agent` (claude-code/codex) |
| Commit Trailers | Structured metadata appended to commit messages | `Spec:` (spec path), `Plan-task:` (task number), `Session:` (session ID) |

### Relationships

- A Charter has one Charter Status, a Capability Map with per-row Capability Status, and zero or more Specs
- A Spec has one Spec Status, references one Charter via `charter-revision`, and optionally has one Source Manifest
- A Spec has one Review Snapshot (in its `.review.md` sidecar)
- A Spec has at most one Plan, which contains an ordered list of Plan Tasks with test file references
- A Session Summary references zero or more Specs (via `specs-touched`) and zero or more Commits (via `commits`)
- A Commit references zero or more Specs and Plan Tasks (via Commit Trailers)
- A Session Provider reads agent-specific logs and produces Session Summaries

### Invariants

- `revision` is monotonically increasing, never decremented
- `charter-revision` on a spec must be ≤ the charter's current `revision`
- A spec with `status: review-passed` whose `revision` > its Review Snapshot's `last-reviewed-revision` is stale — plan gate must block
- A charter with `status: closed` must have all capabilities in `implemented` or `validated`
- `closed` charter hard-blocks new spec creation via `/adev-specify`
- Source manifest `sha` is deterministic: same file contents always produce the same hash
- A Capability Status cannot advance past its spec's status
- Session Summaries are immutable once committed — corrections go in new sessions
- When `provider: entire`, native hooks are disabled to avoid duplication

## Capability Map

| Capability | Description | Priority | Phase | Status |
|-----------|-------------|----------|-------|--------|
| Charter Status Lifecycle | Add `status`/`revision`/`updated` to charters; enforce `draft→approved→evolving→closed` transitions in brainstorm/specify skills; `closed` blocks new specs | must-have | v1 | — |
| Capability Status Column | Add `Status` column to charter Capability Map; update as specs progress through lifecycle | must-have | v1 | — |
| Spec Revision Tracking | Add `revision`/`charter-revision`/`updated` to specs; auto-increment on skill writes; auto-downgrade to `review-pending` on edit after `review-passed` | must-have | v1 | — |
| Source Manifest | Compute content SHA of implementing files after GREEN; stamp `source-manifest` block in spec frontmatter; recomputable by any skill | must-have | v1 | — |
| Plan-Test Mapping | Plan tasks reference their test files; test pass/fail determines task completion; no separate task status tracking | must-have | v1 | — |
| Git Drift Detection | Plan gate compares spec `revision` vs `last-reviewed-revision` in `.review.md` AND checks `git diff` for manual edits; blocks on drift | must-have | v1 | — |
| Session Capture Pipeline | Claude Code hooks (SessionStart, PostToolUse, Stop) + git native hooks (prepare-commit-msg, post-commit) capture session lifecycle; provider config in manifest (`entire`/`native`/`none`); `lib/session-parser.mjs` reads Claude Code JSONL transcripts and condenses to structured format; zero external deps | must-have | v1 | — |
| Session Summary Persistence | `lib/session-summary.mjs` writes standardized summaries to `.context-index/sessions/` with intent/outcome/learnings/friction/open_items schema; `readSummary()` parses them back; summaries committed alongside code via post-commit hook | must-have | v1 | — |
| Template Updates | Update charter, spec, and manifest templates with new fields; `/adev-init` scaffolds `.githooks/` and sets `core.hooksPath` | must-have | v1 | — |
| Structured Commit Trailers | Git hooks inject `Spec:`, `Plan-task:`, `Session:` trailers into commit messages automatically | must-have | v1 | — |
| Entire Provider Adapter | When `provider: entire`, read summaries from Entire's checkpoint branch; disable native hooks to avoid duplication | should-have | v1 | — |
| Hygiene Status Aggregation | `/adev-hygiene` queries charters, specs, plans, tests, git log, and session summaries; produces project status report | should-have | v1 | — |
| Status Query Skill | `/adev-status` skill queries spec-lifecycle data: per-spec status (revision, source manifest match, commits, sessions, test results), per-charter status (capability progress), project-wide aggregation. Composes git log, frontmatter, test results, and session summaries into a single report. | should-have | v1 | — |
| Tracker Reference Field | Optional `tracker-ref` field in spec and charter frontmatter linking to external trackers (Jira, Linear, GitHub Issues). No API integration — metadata only. Displayed by `/adev-status`, queryable by future adev-graph plugin. | should-have | v1 | — |
| Codex Adapter | Session parser adapter for Codex log format | nice-to-have | v2 | — |
| PR Session Aggregation | Aggregate session summaries from branch commits into PR description | nice-to-have | v2 | — |
| LLM Auto-Summarization | Auto-generate intent/outcome/learnings from raw transcript via LLM call at session end | nice-to-have | v2 | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `lib/session-parser.mjs:parseSession(logPath, agent)` | function | Reads agent-specific session log, returns condensed transcript `{ messages[], filesModified[], toolCalls[], tokenUsage }` |
| `lib/session-parser.mjs:resolveLogPath(agent)` | function | Returns the session log file path for the given agent |
| `lib/session-summary.mjs:writeSummary(condensed, metadata, outputDir)` | function | Takes condensed transcript + metadata, writes standardized markdown summary |
| `lib/session-summary.mjs:readSummary(summaryPath)` | function | Parses a session summary markdown file back into structured object |
| `lib/source-manifest.mjs:computeManifest(filePaths)` | function | Computes SHA-256 content hash of given files, returns `{ sha, files, computedAt }` |
| `lib/source-manifest.mjs:verifyManifest(manifest)` | function | Recomputes SHA from manifest's file list, returns `{ matches, currentSha }` |
| `.githooks/prepare-commit-msg` | git hook | Injects `Spec:`, `Plan-task:`, `Session:` trailers into commit messages |
| `.githooks/post-commit` | git hook | Calls session-summary writer to persist session summary on commit |
| `hooks/session-capture.sh` | Claude Code PostToolUse hook | Logs tool name + files touched to lightweight session tracking file. Uses `.sh` (not `.mjs`) for consistency with existing Claude Code hooks (`session-start.sh`, `constitution-linter.sh`, `merge-guard.sh`, `sync-trigger.sh`) which all follow the bash hook protocol. |
| `skills/adev-status/SKILL.md` | skill | Queries spec-lifecycle data. Arguments: `--spec <path>` (single spec status), `--charter <name>` (charter + capability progress), `--all` (project-wide aggregation). Composes git log, frontmatter, test results, session summaries, and tracker-ref into a structured report. |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| Claude Code JSONL transcripts | Claude Code runtime | Session logs at `~/.claude/projects/*/sessions/` |
| Entire checkpoint branch | Entire CLI | `entire/checkpoints/v1` branch with checkpoint metadata and summaries |
| `manifest.yaml:integrations.session_capture` | Setup module | Provider configuration (entire/native/none) |
| Spec frontmatter | Design module | Read `status`, `revision`, `charter-revision` |
| Charter frontmatter | Design module | Read `status`, `revision` |
| `.review.md` files | Assessment module | Read `last-reviewed-revision`, `file-sha` |
| Plan files (`.plan.md`) | Planning module | Read task list + test file references |
| `npm test` / test runner | Project infrastructure | Determine task completion via test pass/fail |
| `git log` / `git diff` | Git | Drift detection, commit history, structured trailer queries |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Performance | Source manifest SHA computation < 1 second for up to 50 files. Session log parsing < 2 seconds for a typical session (~1000 JSONL lines). Git hook overhead < 500ms per commit. |
| Zero Dependencies | All helpers (`session-parser.mjs`, `session-summary.mjs`, `source-manifest.mjs`) use only Node.js built-ins (`fs`, `path`, `crypto`). No external packages. |
| Graceful Degradation | If session logs are missing or unreadable, hooks log a warning and proceed — never block a commit. If Entire is configured but not installed, fall back to `native` with a warning. If `provider: none`, all session hooks are no-ops. |
| Idempotency | Source manifest recomputation always produces the same SHA for the same file contents. Session summary writes are safe to re-run. `/adev-init` hook installation is idempotent. |
| Non-blocking | Claude Code hooks (session-capture) must not block the agent's workflow. Git hooks run synchronously but stay under 500ms budget. |
| Testability | All lib functions are pure (input → output, no global state). Git hooks testable via existing `runHook()` test helper. Session parser testable with fixture JSONL files. |
| Portability | Session summary schema is agent-agnostic. Adding a new agent adapter requires only a new `parse` function, no changes to summary writer or hooks. |
| Privacy | Session summaries contain condensed intent/outcome, not raw transcripts. No API keys, secrets, or full conversation text in committed summaries. Raw session logs stay in agent-local storage, never committed. |
