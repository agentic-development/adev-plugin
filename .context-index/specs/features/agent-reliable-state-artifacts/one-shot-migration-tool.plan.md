# Implementation Plan: One-Shot Migration Tool

> **Methodology:** adev
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-11)
> **Platform:** Node.js (ESM, `.mjs`), node:test

**Goal:** Build `lib/migrate-state-artifacts.mjs` + `adev migrate` CLI subcommand that converts a project's four legacy artifacts to the charter-era shapes in one semantically-idempotent invocation: `tasks.md → tasks.json`, `build-state/*.json → lifecycle-state/*.jsonl` + directory rename, `.execution-state.md → .execution-state.json`, `milestones.yaml → milestones.json`. Also updates the constitution's Context Routing row (scoped to the active table only).

**Architecture:** New library module exporting `migrateAll(projectRoot, options)` plus per-artifact migrators (`migrateTasks`, `migrateLifecycleState`, `migrateExecutionState`, `migrateMilestones`, `migrateConstitution`). All write paths go through the same atomic temp-then-rename primitive as the consumer modules. Pre-flight check validates parseability and enforces per-artifact size caps before any parser executes. Idempotency mechanism is **skip-on-completion** — re-running `adev migrate` on a fully-migrated project short-circuits each artifact based on target presence and exits 0 with "no work to do." Path containment uses realpath-prefix check on every read AND write path. Rename collision is fatal (`RENAME_COLLISION`, `LIFECYCLE_STATE_FILE_EXISTS`) — no silent merge or append. Parse-error advisories redact raw legacy content.

**Sequencing note:** This spec depends on the four prior specs (`lifecycle-event-log`, `json-issue-board-adapter`, `execution-state-migration`, `milestones-migration`) being implemented first — it consumes their public APIs and the extracted `lib/issues/markdown-parser.mjs`.

---

## File Structure

**Create:**
- `lib/migrate-state-artifacts.mjs` — Migration library module
- `tests/lib/migrate-state-artifacts.test.mjs` — Per-artifact migration parity tests
- `tests/lib/migrate-state-artifacts.idempotency.test.mjs` — Re-run produces no diff
- `tests/lib/migrate-state-artifacts.containment.test.mjs` — Path-containment + size-cap + slug-allowlist
- `tests/lib/migrate-state-artifacts.collision.test.mjs` — RENAME_COLLISION + LIFECYCLE_STATE_FILE_EXISTS
- `tests/cli/migrate.test.mjs` — CLI subcommand integration (`--dry-run`, `--artifact=<name>`)

**Modify:**
- `cli/index.mjs` — Add `migrate` subcommand with `--dry-run` and `--artifact=<value>` flags
- `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` — Capability Map: `One-shot migration tool` + `Directory rename` + `Constitution Context Routing update` → `planned`

**Reference (read, do not modify):**
- `lib/issues/markdown-parser.mjs::parseTasksMd` (lands in `json-issue-board-adapter` work)
- `lib/issues/json-adapter.mjs::_write` (atomic-write pattern)
- `lib/lifecycle-state.mjs::appendEvent` (event-by-event JSONL write)
- `lib/execution-state.mjs::writeExecutionState` (rewritten module)
- `lib/milestones.mjs::saveMilestones` (rewritten module)
- `lib/profiles/yaml.mjs::parseYaml` (kept as one-shot helper for milestones.yaml parsing)
- `lib/build-state.mjs::atomicWriteJson` (atomic-write reference)
- `lib/issues/resolve-root.mjs::resolveStorageRoot`

---

## Context Packets

### Task 1 — Module skeleton + entry-point shape
- Spec: Behavioral Contract; migration order; Idempotency Model

### Task 2 — Pre-flight validator
- Spec: Migration Order step 1; Path Safety items 5-7 (size caps + slug allowlist + read-path containment)

### Task 3 — `migrateTasks` (tasks.md → tasks.json)
- Spec: Migration Order step 2; collapse advisory for legacy `planRef`+`planTask` issues; preservation of counters / deps / `epicId` / `beads_id`
- Source: `lib/issues/markdown-parser.mjs::parseTasksMd`

### Task 4 — `migrateLifecycleState` per-file translation
- Spec: Migration Order step 3; event-synthesis rules (ts = legacy mtime, actor = `migration/adev-cli`); severity stamping rule (per lifecycle-event-log spec)

### Task 5 — Directory rename + collision handling
- Spec: Migration Order step 4; `RENAME_COLLISION`, `LIFECYCLE_STATE_FILE_EXISTS`; `--artifact=lifecycle-state-skip-rename` escape hatch

### Task 6 — `migrateExecutionState`
- Spec: Migration Order step 5; legacy YAML/markdown parser kept as one-shot helper

### Task 7 — `migrateMilestones`
- Spec: Migration Order step 6; worktree-vs-main-repo write target via `resolveStorageRoot`

### Task 8 — `migrateConstitution`
- Spec: Migration Order step 7; markdown-section-scoped match (Context Routing table); `CONSTITUTION_AMBIGUOUS_MATCH` on multiple occurrences; safe refusal when target inside code fence / quoted ADR / example table

### Task 9 — `migrateAll` orchestrator + per-artifact idempotency
- Spec: Idempotency Contract; per-artifact skip rules; `BUILD_STATE_ORPHAN` abort

### Task 10 — Parse-error advisory redaction
- Spec: Path Safety item 9; 200-char non-printable-stripped context window; no raw file content in stderr / advisory

### Task 11 — CLI `adev migrate` subcommand
- Spec: CLI Surface; flag parsing (`--dry-run`, `--artifact=<value>`); exit codes table; `/adev:sync` advisory emission scope (only on `action: "migrated"` for constitution)

### Task 12 — Tests: per-artifact migration parity
- Spec: AC criteria on each `migrate*` producing consumer-equivalent output

### Task 13 — Tests: idempotency
- Spec: AC on re-run produces zero on-disk diff; third-run-with-legacy-removed still skips

### Task 14 — Tests: rename collision + LIFECYCLE_STATE_FILE_EXISTS
- Spec: AC criteria; `--artifact=lifecycle-state-skip-rename` recovery flow

### Task 15 — Tests: path-containment, size-cap, slug-allowlist
- Spec: AC criteria; review-rev-1 SEC-1/SEC-2/SEC-6 carryover

### Task 16 — Tests: `--dry-run` produces structured plan
- Spec: AC on dry-run safety

### Task 17 — Tests: `--artifact=<name>` scoping
- Spec: AC on `--artifact` valid names

### Task 18 — Tests: parse-error redaction
- Spec: AC on no raw content in advisories

### Task 19 — Tests: constitution edit scoped to active table only
- Spec: AC on `CONSTITUTION_AMBIGUOUS_MATCH`; SEC-3 carryover

---

## Heuristics

> Module-scope heuristics returned empty at plan time.

---

## Parallelization

- **Group A (sequential foundation):** Task 1 → Task 2 (skeleton + preflight)
- **Group B (after A; per-artifact migrators can develop in parallel since they touch disjoint code regions within `lib/migrate-state-artifacts.mjs`, but for safety serialize them):** Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8
- **Group C (after Group B):** Task 9 → Task 10 (orchestrator + redaction)
- **Group D (after Group C):** Task 11 (CLI wiring)
- **Group E (after Group D):** Tasks 12-19 (tests — can run in parallel within the group)

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Module skeleton + `migrateAll` entry shape | small | unit | — | 1 create, 0 modify |
| 2 | Pre-flight validator (parseability + size caps + slug allowlist + read-path containment) | medium | unit | Task 1 | 0 create, 1 modify |
| 3 | `migrateTasks` (tasks.md → tasks.json) | medium | unit | Task 2 | 0 create, 1 modify |
| 4 | `migrateLifecycleState` per-file translation (event synthesis + severity stamping) | large | unit | Task 2 | 0 create, 1 modify |
| 5 | Directory rename + collision handling + skip-rename escape hatch | medium | unit | Task 4 | 0 create, 1 modify |
| 6 | `migrateExecutionState` (legacy YAML/md parser as one-shot helper) | medium | unit | Task 2 | 0 create, 1 modify |
| 7 | `migrateMilestones` (worktree-vs-main-repo write target) | medium | unit | Task 2 | 0 create, 1 modify |
| 8 | `migrateConstitution` (markdown-section-scoped match; `CONSTITUTION_AMBIGUOUS_MATCH`) | medium | unit | Task 2 | 0 create, 1 modify |
| 9 | `migrateAll` orchestrator + per-artifact idempotency (skip-on-completion) + `BUILD_STATE_ORPHAN` | medium | unit | Tasks 3-8 | 0 create, 1 modify |
| 10 | Parse-error advisory redaction (200-char window, no raw content) | small | unit | Task 9 | 0 create, 1 modify |
| 11 | CLI `adev migrate` subcommand (flag parsing + exit codes + `/adev:sync` advisory scope) | medium | unit | Task 10 | 0 create, 1 modify (cli/index.mjs) |
| 12 | Tests: per-artifact migration parity | large | unit | Task 11 | 1 create, 0 modify |
| 13 | Tests: idempotency (three-run check) | medium | unit | Task 11 | 0 create, 1 modify (test file) |
| 14 | Tests: rename collision + `LIFECYCLE_STATE_FILE_EXISTS` + skip-rename recovery | medium | unit | Task 11 | 1 create, 0 modify |
| 15 | Tests: path-containment, size caps, slug allowlist (every traversal payload from sibling specs) | medium | unit | Task 11 | 1 create, 0 modify |
| 16 | Tests: `--dry-run` structured plan | small | unit | Task 11 | 0 create, 1 modify (test file) |
| 17 | Tests: `--artifact=<name>` scoping + `UNKNOWN_ARTIFACT` | small | unit | Task 11 | 0 create, 1 modify (test file) |
| 18 | Tests: parse-error advisory redaction (no raw legacy content surfaces) | small | unit | Task 11 | 0 create, 1 modify (test file) |
| 19 | Tests: constitution edit scoped to active table; ambiguous-match abort; code-fence safety | medium | unit | Task 11 | 0 create, 1 modify (test file) |

---

## Strategy Summary

All tasks resolve to `unit` strategy. No external infrastructure required — every fixture is a local filesystem-only project.

---

## Task 1: Module skeleton + `migrateAll` entry shape [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit

- [x] **Write failing test** — Import `migrateAll` from `lib/migrate-state-artifacts.mjs`. Assert function exists with arity `(projectRoot, options)`. Assert per-artifact migrators (`migrateTasks`, `migrateLifecycleState`, `migrateExecutionState`, `migrateMilestones`, `migrateConstitution`) are also exported.
- [x] **Verify test fails** (module does not exist)
- [x] **Implement** — Skeleton file with stubs for each migrator. Stub-throw `NOT_IMPLEMENTED`.
- [x] **Verify test passes**
- [x] **Commit**

```bash
git checkout -b feat/agent-reliable-state-artifacts/migrate-tool
git add lib/migrate-state-artifacts.mjs
git commit -m "feat(migrate): module skeleton

Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
Plan-task: 1"
```

## Task 2: Pre-flight validator [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit
**Depends on:** Task 1

- [x] **Write failing tests** — Pre-flight produces a structured `PreflightReport`. Per-artifact size caps enforced (`tasks.md` ≤ 10 MB; each `build-state/<slug>.json` ≤ 1 MB; `.execution-state.md` ≤ 1 MB; `milestones.yaml` ≤ 1 MB; `constitution.md` ≤ 5 MB). Oversized file → `LEGACY_FILE_TOO_LARGE` in report + abort. Crafted `build-state/<slug>.json` with bad slug → `INVALID_LEGACY_SLUG` abort. Read-path containment: any legacy path resolving outside `.context-index/` → `INVALID_STORAGE_PATH`.
- [x] **Verify tests fail**
- [x] **Implement** — `preflight(projectRoot, options)` returning `{ ok, advisories[], reports[] }`. Refuses to invoke any parser if any check fails.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 3: `migrateTasks` (tasks.md → tasks.json) [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit
**Depends on:** Task 2

- [x] **Write failing tests** — Parse legacy `tasks.md` via `parseTasksMd` (from `lib/issues/markdown-parser.mjs`). Write JSON via atomic temp-then-rename. Preserve tier-prefix counters, dependencies, `epicId`, `spec_ref`, `next_action`, beads-map fields. Legacy issues with `planRef`+`planTask` → emit collapse advisory but preserve fields (do NOT silently drop `planTask`).
- [x] **Verify tests fail**
- [x] **Implement**
- [x] **Verify tests pass**
- [x] **Commit**

## Task 4: `migrateLifecycleState` per-file translation [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit
**Depends on:** Task 2

- [x] **Write failing tests** — For each `<slug>.json` in `build-state/`, derive spec path via `slugFromSpec` reverse lookup; translate step JSON to canonical events (`lifecycle_step`, `step_completed`, `step_failed`, `reviewer_report`, `validator_report`). Synthesized events carry `ts` = legacy mtime; `actor: "migration/adev-cli"`; severity stamped from `reviewers.yaml`/`gates.yaml` per lifecycle-event-log spec rule. Per-file write target collision → `LIFECYCLE_STATE_FILE_EXISTS` abort (no append, no merge).
- [x] **Verify tests fail**
- [x] **Implement**
- [x] **Verify tests pass**
- [x] **Commit**

## Task 5: Directory rename + collision handling [specialist: none]

**Charter capability:** Directory rename: build-state → lifecycle-state
**Strategy:** unit
**Depends on:** Task 4

- [x] **Write failing tests** — After step 3 completes, `fs.renameSync` `.context-index/build-state` → `.context-index/lifecycle-state`. If target exists (whether empty or populated) → `RENAME_COLLISION` exit 1 with advisory listing SHA-256 of pre-existing files. `--artifact=lifecycle-state-skip-rename` performs only step 3, skips rename.
- [x] **Verify tests fail**
- [x] **Implement**
- [x] **Verify tests pass**
- [x] **Commit**

## Task 6: `migrateExecutionState` [specialist: none]

**Charter capability:** Execution state migration
**Strategy:** unit
**Depends on:** Task 2

- [x] **Write failing tests** — Parse legacy `.execution-state.md` via the kept-as-one-shot YAML/markdown parser (today's `parse()` function from `lib/execution-state.mjs`, copied into the migration module as the rewritten consumer module no longer carries it). Write via the rewritten `writeExecutionState`. Preserve every field (status, planRef, currentTask, issueBinding, blockers, nextAction, updated, progress).
- [x] **Verify tests fail**
- [x] **Implement**
- [x] **Verify tests pass**
- [x] **Commit**

## Task 7: `migrateMilestones` [specialist: none]

**Charter capability:** Milestones migration
**Strategy:** unit
**Depends on:** Task 2

- [x] **Write failing tests** — Parse legacy `milestones.yaml` via `parseYaml` (kept as one-shot import — rewritten `lib/milestones.mjs` no longer imports it). Write via the rewritten `saveMilestones`. Worktree-vs-main-repo: legacy file in worktree-only `.context-index/` → migrator writes JSON to `resolveStorageRoot(manifest, projectRoot)` (main repo), leaves legacy file in the worktree untouched.
- [x] **Verify tests fail**
- [x] **Implement**
- [x] **Verify tests pass**
- [x] **Commit**

## Task 8: `migrateConstitution` [specialist: none]

**Charter capability:** Constitution Context Routing update
**Strategy:** unit
**Depends on:** Task 2

- [x] **Write failing tests** — Replace the `| Build state | \`.context-index/build-state/\` |` row with `| Lifecycle state | \`.context-index/lifecycle-state/\` |`, scoped to the active `## Context Routing` table. Refuse mutation if the target literal appears more than once across the file → `CONSTITUTION_AMBIGUOUS_MATCH` exit 1 with line numbers. Refuse if target inside a fenced code block or quoted ADR. Skip with advisory if target line is missing (already migrated).
- [x] **Verify tests fail**
- [x] **Implement** — Parse markdown structure to locate the `## Context Routing` heading; bound the table by next `## ` or EOF; perform literal-string match within bounds.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 9: `migrateAll` orchestrator + per-artifact idempotency [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit
**Depends on:** Tasks 3-8

- [x] **Write failing tests** — `migrateAll(projectRoot)` runs pre-flight → migrate steps in order 2→3→4→5→6→7 → constitution. Skip-on-completion per artifact: presence of `tasks.json` skips tasks step, etc. `BUILD_STATE_ORPHAN`: `<slug>.json` in `build-state/` without matching `<slug>.jsonl` in `lifecycle-state/` after a prior partial run → abort with operator advisory.
- [x] **Verify tests fail**
- [x] **Implement**
- [x] **Verify tests pass**
- [x] **Commit**

## Task 10: Parse-error advisory redaction [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit
**Depends on:** Task 9

- [x] **Write failing test** — Trigger a parse error on each artifact. Assert advisory surfaces `{ artifact, file, parser_error_code, line, column }` plus 200-char non-printable-stripped context window. Raw legacy content does NOT appear in stderr, `PreflightReport`, or any `MigrationResult`.
- [x] **Verify test fails**
- [x] **Implement** — Centralized redaction helper applied to every parse-error advisory path.
- [x] **Verify test passes**
- [x] **Commit**

## Task 11: CLI `adev migrate` subcommand [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit
**Depends on:** Task 10

- [x] **Write failing tests** — `adev migrate` runs full migration; exit 0 on success. `adev migrate --dry-run` prints structured plan, exits 0 on valid plan / 1 on preflight fail. `adev migrate --artifact=tasks` migrates only tasks. `adev migrate --artifact=lifecycle-state` runs steps 3+4 atomically. `adev migrate --artifact=lifecycle-state-skip-rename` runs only step 3. Unknown `--artifact` → `UNKNOWN_ARTIFACT` exit 1. `/adev:sync` advisory printed only when constitution migration produced `action: "migrated"` (not on skip / dry-run / out-of-scope).
- [x] **Verify tests fail**
- [x] **Implement** — Wire subcommand into `cli/index.mjs` alongside `install`, `upgrade`, `init`, `uninstall`, `extension`.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 12: Per-artifact parity tests [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit
**Depends on:** Task 11

- [x] **Write tests** — For each artifact:
  - `tasks.md` fixture → migrated → `JsonAdapter.list()` returns field-by-field-identical issues
  - `build-state/<slug>.json` → migrated → `currentState(spec)` returns the same projection as the legacy file's implicit state
  - `.execution-state.md` → migrated → `readExecutionState` returns the same in-memory shape
  - `milestones.yaml` → migrated → `loadMilestones` returns the same array
- [x] **Verify tests pass**
- [x] **Commit**

## Task 13: Idempotency tests [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit
**Depends on:** Task 11

- [x] **Write tests** — First run produces output X. Second run on fully-migrated project skips every artifact, zero I/O, exit 0. Third run with legacy files manually removed still skips, exit 0.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 14: Collision tests [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit
**Depends on:** Task 11

- [x] **Write tests** — Pre-existing `lifecycle-state/` (empty AND populated cases) → `RENAME_COLLISION` exit 1 with SHA-256 advisory. Pre-existing `lifecycle-state/<slug>.jsonl` during step 3 → `LIFECYCLE_STATE_FILE_EXISTS` exit 1 (never appends). `--artifact=lifecycle-state-skip-rename` recovery flow succeeds.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 15: Path-containment, size-cap, slug-allowlist tests [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit
**Depends on:** Task 11

- [x] **Write tests** — Every traversal payload from sibling specs: `projectRoot` missing manifest; `tasks.db_path: /etc/passwd`; symlink escape under `.context-index/`; crafted `build-state/<slug>.json` with `<slug>` containing `..` or non-allowlist chars; oversized legacy files (each artifact's cap).
- [x] **Verify tests pass**
- [x] **Commit**

## Task 16: `--dry-run` tests [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit
**Depends on:** Task 11

- [x] **Write tests** — `--dry-run` produces structured plan to stdout; no file written, renamed, or deleted. Exit 0 if plan would succeed; exit 1 if any pre-flight check fails. CI-safe.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 17: `--artifact=<name>` scoping tests [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit
**Depends on:** Task 11

- [x] **Write tests** — Each valid `--artifact=<name>` scopes writes correctly. `--artifact=all` (default) runs everything. Unknown name → `UNKNOWN_ARTIFACT` exit 1. `--artifact=constitution` does not emit the `/adev:sync` advisory if constitution was already migrated.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 18: Parse-error redaction tests [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit
**Depends on:** Task 11

- [x] **Write tests** — Crafted malformed files for each artifact contain a "secret" sentinel string. Assert sentinel does NOT appear in stderr, the structured advisory, or any test-captured output. Only `{ artifact, file, parser_error_code, line, column }` + 200-char stripped window surfaces.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 19: Constitution scoped-match tests [specialist: none]

**Charter capability:** One-shot migration tool
**Strategy:** unit
**Depends on:** Task 11

- [x] **Write tests** — Constitution with target row only in the active `## Context Routing` table → migrated. With target literal in BOTH the active table AND a quoted code block → `CONSTITUTION_AMBIGUOUS_MATCH` exit 1, listing line numbers. Target row inside a fenced code block elsewhere → safely refused, table-active row still migrated. Missing target row → skipped with advisory.
- [x] **Verify tests pass**
- [x] **Commit**

---

## Quality Gates

- `npm test` green
- No new dependencies in `package.json`
- All files are `.mjs` ESM
- Coverage on `lib/migrate-state-artifacts.mjs` ≥ 90% lines
- All AC criteria satisfied
- Idempotency: re-run produces zero on-disk diff
- No constitutional violations
