<!-- partial_schema: plan@1 -->

# Implementation Plan: GitHub Board Backend

> **Methodology:** adev
> **Charter:** .context-index/specs/features/task-management/charter.md (revision 10)
> **Spec:** .context-index/specs/features/task-management/github-board-backend.spec.md (revision 6; tasks 14, 18, 19, 22 and 23–26 reconciled to it and to `backend-migration-rev-3-github-target.spec.md` rev 2 on 2026-11-26)
> **Review:** PASS_WITH_NOTES (2026-11-26, rev 2) — 0 blockers, 17 warnings, 8 suggestions; rev 6 re-review PASS_WITH_NOTES (2026-11-26) — 0 blockers, 19 warnings, 7 suggestions (commit 5b6cd074)
> **Platform:** Node.js, JavaScript (pure ESM `.mjs`), `node:test`; optional external CLI `gh`
> **Implementation mode:** tdd
> **Risk / approval:** `risk_level: high`; human approval given by the maintainer on 2026-11-26. `require_hitl_approval` has no code consumer (tracked as `adev-plugin-03du`), so the approval is recorded here and in the plan commit.

**Goal:** Ship `tasks.backend: github` — a `GithubAdapter` implementing the unchanged `IssueManager` contract against GitHub Issues + Projects v2, with fail-fast preflight, `gh-<n>` IDs, write + re-read claims, the `adev issues github setup` verb, and `adev issues migrate --to github`.

**Architecture:** A new `lib/issues/github/` package holds pure, separately testable layers — `transport` (the only code that spawns `gh`, one fixed argv, values only as GraphQL variables on stdin), `config`, `preflight`, `decode` (field decoding + refuse-don't-sanitize predicates + status mapping), `queries`/`mutations` (constant GraphQL documents), `setup`, and `migrate` — composed by `lib/issues/github-adapter.mjs` and registered in `lib/issues/registry.mjs`, the same posture as `lib/issues/beads-adapter.mjs` over `br` and `lib/provider/tracker-providers/github-tracker-adapter.mjs` over `gh`. Every GitHub-touching test runs through an injected replay transport, so `npm test` needs no network or token.

### Prerequisites outside this plan

These are lifecycle artifacts, not implementation tasks. Tasks that depend on one say so in their **Depends on** line.

| Prerequisite | Why | Blocks | Status |
|---|---|---|---|
| Amendment of `backend-migration.spec.md` (`/adev:specify --amend`) | `--to github` accepted; github resume semantics (BEH-30); confirmation + `--yes` (BEH-41, review RI-5); github aborts still emit `MIGRATE_PARTIAL_FAILURE` with the `GITHUB_*` code in `errors[]`, token redacted (review CON-1) | Tasks 18, 19 | **Done**: `.context-index/specs/features/task-management/backend-migration-rev-3-github-target.spec.md` rev 2, review-passed PASS_WITH_NOTES (commit e43a5831). Its BEH-5 check order does not yet list the unanchored-item check this plan adds in Task 18 (GitHub spec rev 5 BEH-30; rev 6 review CON-1). Follow-up for that amendment, not a blocker. |
| Amendment of `tracker-provider-bridge.spec.md` | Bridge coexistence (charter rev 10); must test that a home-repo `gh-<n>` item with a reserved `module:` label is classified fail-closed (review WR-3) | Bridge work only — no task here | **Done**: `.context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge-rev-12-github-board-coexistence.spec.md`, review-passed PASS_WITH_NOTES (commit 40284a89) |
| ADR 0016 amendment: opt-in external board carve-out | ADR 0016 (Proposed) makes `.context-index/` the sole system of record for the board (review CON-2) | Merge of this branch | **Done**: ADR 0016 external-board exception (commit 983e01ad) |
| `agent-reliable-state-artifacts` confirmation of the read-only sentinel format (BEH-32) | Spec precondition; owner of board state-file formats (review CON-3) | Task 14 | **Done**: `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` rev 9, "Read-only board sentinel document schema" (commit 983e01ad) |
---

## File Structure

**Create:**
- `lib/issues/github/transport.mjs` — sole `gh` spawn site: fixed argv, JSON body on stdin, pagination helper, error mapping
- `lib/issues/github/errors.mjs` — `githubError(code, message, extra)` and the `GITHUB_*` code list
- `lib/issues/github/config.mjs` — `normalizeGithubConfig(raw)` for the complete `tasks.github` key set
- `lib/issues/github/preflight.mjs` — lazy, process-cached preflight through the transport
- `lib/issues/github/decode.mjs` — item → `Issue` decoding, per-field predicates, status read mapping
- `lib/issues/github/queries.mjs` — constant read documents (project items page, connection continuation, preflight probe)
- `lib/issues/github/mutations.mjs` — constant write documents (create, add-to-project, field update, sub-issue, blocked-by, close, comment, labels, type, milestone)
- `lib/issues/github/untrusted-text.mjs` — title neutralization + body fencing for renderers
- `lib/issues/github/setup.mjs` — required-field model, drift scan, write-set planner
- `lib/issues/github/migrate.mjs` — github migration path (ordered copy, replay, pacing, confirmation)
- `lib/issues/github-adapter.mjs` — `GithubAdapter` composing the above
- `lib/issues/read-only-sentinel.mjs` — write/read/check the migration sentinel
- `lib/cli/issues-github.mjs` — `adev issues github setup` verb
- `scripts/record-github-fixtures.mjs` — manual fixture recorder (writes only under `tests/issues/conformance/fixtures/`)
- `tests/issues/github/replay-transport.mjs` — test helper: replay recorded responses keyed by query + variables; fails on unrecorded requests
- `tests/issues/github/*.test.mjs` — per-behavior suites (named in each task)
- `tests/issues/conformance/contract-cases.mjs`, `tests/issues/conformance/*.conformance.test.mjs`, `tests/issues/conformance/fixtures/**`
- `tests/docs/github-backend-docs.test.mjs` — docs-coverage test

**Modify:**
- `lib/issues/id-utils.mjs` — `gh-` classification first in `parseId()`; encode/decode/normalize helpers
- `lib/retro/issue-id-validation.mjs`, `lib/session-capture.mjs` — gh charset and length
- `lib/issues/interface.mjs` — `Issue` typedef + `validateIssue()` returned set gain `legacy_id`, `affected_modules`
- `lib/issues/registry.mjs` — `github` in `SUPPORTED_BACKENDS`, no fallback
- `lib/issues/json-adapter.mjs`, `lib/issues/beads-adapter.mjs` — sentinel write guard
- `lib/cli/issues.mjs` — `github` dispatcher branch
- `lib/cli/issues-migrate.mjs` — `--yes`, dispatch to the github path
- `lib/cli/issues-show.mjs`, `issues-next.mjs`, `issues-board.mjs`, `issues-list.mjs`, `issues-stale.mjs` — untrusted-text rendering
- `skills/sync/SKILL.md`, `templates/constitution-template.md` — github case in the Task Management block
- `docs/configuration.md`, `docs/troubleshooting.md`, `docs/concepts.md`
- `.context-index/specs/features/task-management/charter.md` — `setup --check` interface row (review RI-3)

**Reference (read, do not modify):**
- `lib/issues/beads-adapter.mjs` — adapter shape over an external CLI, `_resolve`, claim/release structure
- `lib/issues/json-adapter.mjs:990-1030` — `claim()` return shape incl. `takeover`
- `lib/provider/tracker-providers/github-tracker-adapter.mjs` — injectable `exec`, `execFileSync` argv posture
- `lib/governance/context-pack.mjs:628` — `fenceBlock({ nonce, attrs, body })`
- `lib/path-safety.mjs` — `resolveContained`, `isContained`, `safeRealpath`
- `lib/issues/eligibility.mjs:81,116` — `RESERVED_SAFETY_TAGS`, manifest module slugs
- `tests/helpers.mjs` — `createTempDir`, `cleanupTempDir`, `writeFixture`

## Context Packets

### Task 1 Context
- Spec: BEH-5, BEH-6; Acceptance Criteria row 5
- Charter: capability **GitHub Canonical IDs**
- Source files: `lib/issues/id-utils.mjs` (full); `tests/issues/id-utils.test.mjs` (signatures)
- Review notes: BD-7 (see ## Review Notes)
- Heuristics: 1 entry for module `task-management` (coverage-predicate heuristic)

### Task 2 Context
- Spec: BEH-7
- Charter: capability **GitHub Canonical IDs**
- Source files: `lib/retro/issue-id-validation.mjs`, `lib/session-capture.mjs:255-335` (full); `tests/retro/*issue-id*` (signatures)

### Task 3 Context
- Spec: BEH-8 (last paragraph)
- Charter: capability **GitHub Board Backend**
- Source files: `lib/issues/interface.mjs:10-31,377-475` (full)

### Task 4 Context
- Spec: BEH-40, BEH-10 (pagination bound), BEH-35/BEH-36 (error mapping)
- Charter: capability **GitHub Fail-Fast Preflight**, **GitHub Batched Reads**
- Source files: `lib/provider/tracker-providers/github-tracker-adapter.mjs` (full)
- Review notes: BD-1, TR-1 (see ## Review Notes)

### Task 5 Context
- Spec: BEH-37 (replay transport, fixture-lint)
- Charter: capability **GitHub Conformance Suite**
- Review notes: BD-5 (see ## Review Notes)

### Task 6 Context
- Spec: BEH-2
- Charter: capability **GitHub Board Backend** (Domain Model `GithubBoardConfig`)

### Task 7 Context
- Spec: BEH-3, BEH-4
- Charter: capability **GitHub Fail-Fast Preflight**

### Task 8 Context
- Spec: BEH-8, BEH-12, BEH-39
- Charter: capability **GitHub Board Backend**
- Source files: `lib/issues/interface.mjs` (`normalizeOwner`), `lib/issues/eligibility.mjs:81,116`, `lib/path-safety.mjs`
- Review notes: BD-3, BD-4 (see ## Review Notes)

### Task 9 Context
- Spec: BEH-9, BEH-10, BEH-11, BEH-34
- Charter: capability **GitHub Board Backend**, **GitHub Batched Reads**
- Source files: `lib/issues/beads-adapter.mjs` (structure), `lib/issues/json-adapter.mjs:1140-1210` (`get`, `walkTree`)
- Review notes: TR-2 (see ## Review Notes)

### Task 10 Context
- Spec: BEH-1
- Source files: `lib/issues/registry.mjs` (full); `tests/issues/*registry*` (signatures)

### Task 11 Context
- Spec: BEH-13, BEH-14, BEH-15, BEH-19
- Charter: capability **GitHub Board Backend**
- Source files: `lib/issues/json-adapter.mjs:380-420,800-900` (create, granularity guard), `lib/cli/issues-create.mjs`, `lib/cli/issues-epic.mjs`
- Review notes: RI-1 (see ## Review Notes)

### Task 12 Context
- Spec: BEH-16, BEH-17, BEH-18
- Source files: `lib/issues/interface.mjs:482-495` (`validateStatusTransition`), `lib/issues/json-adapter.mjs:1080-1110` (close guards)

### Task 13 Context
- Spec: BEH-21 – BEH-25
- Charter: capability **GitHub Claim Lease**
- Source files: `lib/issues/interface.mjs:589-730` (lease helpers), `lib/issues/json-adapter.mjs:960-1070` (claim/release)
- Review notes: CON-4 (see ## Review Notes)

### Task 14 Context
- Spec: BEH-32 (sentinel), BEH-33; `backend-migration-rev-3-github-target.spec.md` BEH-8 (commit), BEH-12 (containment)
- Charter: capability **Migration to GitHub**; `agent-reliable-state-artifacts/charter.md` rev 9 "Read-only board sentinel document schema"
- Source files: `lib/issues/resolve-root.mjs`, `lib/path-safety.mjs`, `lib/issues/board-worktree.mjs` (git argv pattern), `lib/extensions/exec-payload.mjs:158` (`assertContained`), `lib/issues/file-adapter.mjs:25-40`
- Review notes: RI-2, CON-3, BD-2, M-BD-2, M-BD-3 (see ## Review Notes)

### Task 15 Context
- Spec: BEH-20
- Source files: `lib/governance/context-pack.mjs:600-660`, `lib/cli/issues-show.mjs`, `lib/cli/issues-next.mjs`
- Review notes: RI-4 (see ## Review Notes)

### Task 16 Context
- Spec: BEH-20
- Source files: `lib/cli/issues-board.mjs`, `lib/cli/issues-list.mjs`, `lib/cli/issues-stale.mjs`

### Task 17 Context
- Spec: BEH-26, BEH-27, BEH-28
- Charter: capability **GitHub Project Setup**
- Source files: `lib/cli/issues.mjs` (dispatcher), `lib/cli/issues-migrate.mjs:778-820` (arg parsing pattern)
- Review notes: WR-2, RI-3 (see ## Review Notes)

### Task 18 Context
- Spec: BEH-14, BEH-29, BEH-30; `backend-migration-rev-3-github-target.spec.md` BEH-1, BEH-2, BEH-4, BEH-5, BEH-6, BEH-10, BEH-11, BEH-12 and its Error Cases
- Charter: capability **Migration to GitHub**
- Source files: `lib/cli/issues-migrate.mjs` (full; `loadResumeState` :313, refusals :917-944, dry-run return :999-1033), `lib/issues/github/errors.mjs` (`redact`), `lib/issues/github-adapter.mjs` (constructor seams), `lib/gitignore-paths.mjs`, `.context-index/specs/features/task-management/backend-migration.spec.md`
- Review notes: CON-1, M-RI-1, M-RI-2, M-RI-3, M-RI-4, M-WR-8, M-BD-5, R6-CON-1, R6-BD-2 (see ## Review Notes)

### Task 19 Context
- Spec: BEH-31, BEH-32, BEH-33, BEH-35, BEH-41; `backend-migration-rev-3-github-target.spec.md` BEH-3, BEH-4, BEH-7, BEH-8, BEH-9
- Charter: capability **Migration to GitHub**
- Source files: `lib/cli/issues-migrate.mjs:700-830`, `lib/issues/read-only-sentinel.mjs` (Task 14)
- Review notes: RI-5, M-BD-1, M-BD-4, M-WR-8 (see ## Review Notes)

### Task 20 Context
- Spec: BEH-37
- Charter: capability **GitHub Conformance Suite**
- Source files: `tests/issues/claim.test.mjs`, `tests/issues/unified-create.test.mjs` (signatures — contract cases to lift)

### Task 21 Context
- Spec: Behavioral Contract; review WR-1
- Source files: `skills/sync/SKILL.md:45-90`, `templates/constitution-template.md` (Task Management section), `.context-index/specs/features/task-management/constitution-sync.spec.md` (Error Cases)
- Review notes: WR-1 (see ## Review Notes)

### Task 22 Context
- Spec: BEH-38, BEH-22 (claim window), BEH-13/BEH-14 (write order), BEH-30 (unanchored record), Error Cases table; `backend-migration-rev-3-github-target.spec.md` Error Cases and Notes for Planning (Task 22 docs)
- Source files: `docs/configuration.md`, `docs/troubleshooting.md`, `docs/cli-reference.md`, `docs/concepts.md`, `lib/issues/github/errors.mjs`, `tests/issues/github/replay-transport.mjs`
- Review notes: CON-2, BD-4 (docs part), R6-CON-2, R6-RI-3 (see ## Review Notes)

### Task 23 Context
- Spec: BEH-14 (rev 5 maintainer decision: `/adev:plan` stops loudly)
- Source files: `skills/plan/references/feature-mode.md:35-48`, `epic-mode.md:15`, `release-mode.md:65-69`, `skills/specify/references/modes/standard-mode.md:325-329` (unchanged)
- Review notes: RI-1 (rev 3/4 blocker history) (see ## Review Notes)

### Task 24 Context
- Spec: BEH-39, BEH-37, BEH-32 (realpath containment)
- Source files: `lib/reality-check.mjs:430-470`, `lib/extensions/exec-payload.mjs:158`, `lib/path-safety.mjs`
- Review notes: R6-RI-2 (see ## Review Notes)

### Task 25 Context
- Spec: BEH-13, BEH-14 (Legacy ID first, residual window)
- Source files: `lib/issues/github-adapter.mjs` (`_planCreate`, `_createItem`)
- Review notes: M-TR (out-of-scope termination note) (see ## Review Notes)

### Task 26 Context
- Spec: BEH-10 (rev 6 page bounds)
- Source files: `lib/issues/github/transport.mjs:210-250` (`paginate`), `lib/issues/github/board-read.mjs:28-52` (`continueConnection`)
- Review notes: R6-RI-1, R6-TR-2 (see ## Review Notes)

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

- **A universal coverage claim must ship with the predicate that checks it** (medium) — state the executable check alongside the claim, scoped to live surfaces. Applies to Task 22's docs-coverage test, Task 8's "predicates are exhaustive over BEH-8", and Task 21's "every `tasks.backend` reader was checked".
- **Use session JSONL for token measurement, not file-size estimates** (medium) — not applicable to this plan.
- **Cache reads are 71% of session cost — minimize context accumulation** (medium) — keep subagent returns to summaries; fixtures and recorded responses stay on disk.

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 6 → Task 8
- Group B (sequential): Task 4 → Task 5
- Group C (independent): Task 14
- Group D (independent): Task 21
- Group F (independent, deltas on shipped code): Task 23, Task 24, Task 25, Task 26
- Group E (sequential): Task 7 → Task 9 → Task 10 → Task 11 → Task 12 → Task 13 → Task 15 → Task 16 → Task 17 → Task 18 → Task 19 → Task 20 → Task 22

Groups A, B, C and D can run in parallel. Group E starts only after Groups A and B complete (Task 7 needs Tasks 4 and 6; Task 9 needs Tasks 5 and 8), Task 18 additionally needs Task 14 and Task 25, and Task 19 additionally needs Task 14.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | GitHub canonical IDs in `id-utils` | small | unit | — | 0 create, 1 modify |
| 2 | Widen retro and session-capture ID validators | small | unit | Task 1 | 0 create, 2 modify |
| 3 | `legacy_id` / `affected_modules` on the `Issue` contract | small | unit | — | 0 create, 1 modify |
| 4 | GraphQL transport (fixed argv, variables channel, pagination, errors) | medium | unit | — | 2 create, 0 modify |
| 5 | Replay transport and fixture-lint | small | unit | Task 4 | 1 create, 0 modify |
| 6 | `tasks.github` config validation | small | unit | — | 1 create, 0 modify |
| 7 | Lazy preflight | small | unit | Task 4, Task 6 | 2 create, 0 modify |
| 8 | Field decoding, predicates, status mapping | medium | unit | Task 1, Task 3, Task 6 | 1 create, 0 modify |
| 9 | `GithubAdapter` read path | large | unit | Task 5, Task 7, Task 8 | 2 create, 1 modify |
| 10 | Registry wiring | small | unit | Task 9 | 0 create, 1 modify |
| 11 | Write path: `create`, epics, partial create | large | unit | Task 9 | 1 create, 3 modify |
| 12 | Write path: `update`, `close`, `addDependency` | medium | unit | Task 11 | 0 create, 2 modify |
| 13 | Claim lease | medium | unit | Task 12 | 0 create, 1 modify |
| 14 | Read-only sentinel, adapter guard, and beads sentinel commit | medium | unit | — | 1 create, 2 modify |
| 15 | Untrusted text: helper, `show`, `next` | small | unit | Task 10 | 1 create, 2 modify |
| 16 | Untrusted text: `board`, `list`, `stale` | small | unit | Task 15 | 0 create, 3 modify |
| 17 | `adev issues github setup` | medium | unit | Task 10 | 2 create, 2 modify |
| 18 | Migration core: pre-write checks, ordered copy, `legacy_id`, replay, resume, abort envelope | large | unit | Task 13, Task 14, Task 17, Task 25 | 3 create, 4 modify |
| 19 | Migration: confirmation, progress line, dry-run, pacing, sentinel write and commit, manifest suggestion | large | unit | Task 14, Task 18 | 1 create, 4 modify |
| 20 | Conformance suite and fixture recorder | large | unit | Task 13, Task 5 | 4 create, 0 modify |
| 21 | `/adev:sync` Task Management block for github | small | unit | — | 1 create, 2 modify |
| 22 | Docs and docs-coverage test (or follow-up delta if already landed) | small | unit | Task 19, Task 20 | 1 create, 5 modify |
| 23 | `/adev:plan` stops loudly on `GITHUB_PARTIAL_CREATE` | small | unit | Task 11 | 1 create, 3 modify |
| 24 | Realpath containment for `spec_ref` / `plan_ref` consumers | small | unit | — | 1 create, 1 modify |
| 25 | `Legacy ID` first in `_createItem` | small | unit | Task 11 | 1 create, 2 modify |
| 26 | Page bounds fixed from the first page | small | unit | Task 4, Task 9 | 1 create, 2 modify |

## Review Notes

> Carried forward from the PASS_WITH_NOTES review (`.context-index/specs/features/task-management/github-board-backend.review.md`). Each open warning is assigned to the first task that touches the spec section it cites; warnings with no cited section are assigned to the task whose work they concern (the verb returned `section: null` for them because the review report cites them by behavior in prose).

| ID | Warning | Cited section | Assigned to |
|----|---------|---------------|-------------|
| CON-1 | Github migration aborts vs `MIGRATE_PARTIAL_FAILURE` / ADR 0014 passthrough vs token redaction | — | Task 18 (resolved in the backend-migration amendment BEH-5/BEH-6; Task 18 implements it) |
| CON-2 | ADR 0016 makes `.context-index/` the sole board system of record | — | Task 22 (docs); prerequisite ADR amendment done (983e01ad) |
| CON-3 | Beads sentinel lives in the `beads-board` worktree — committed or local-only? | — | Task 14 (`commitSentinel`, per amendment BEH-8 and charter rev 9) |
| CON-4 | "Rollback" vs "abstention"; loser's `claimed_at` overwrite | — | Task 13 |
| RI-1 | `/adev:plan` uses `createEpic`, not `create()`, and has no non-blocking path | behaviors-14 | Task 11 |
| RI-2 | File adapter already throws `BACKEND_READ_ONLY_DEPRECATED` — precedence with the sentinel | behaviors-33 | Task 14 (spec rev 3 BEH-33 now states it) |
| RI-3 | Charter row says `setup --check` exits non-zero on drift and lists no `--yes` | behaviors-26 | Task 17 |
| RI-4 | The five verbs render bodies only in `--json`; `fenceBlock` needs a nonce | behaviors-20 | Task 15 |
| WR-1 | Other `tasks.backend` readers, incl. the `/adev:sync` block | — | Task 21 |
| WR-2 | No test asserts each `setup --check` drift category | — | Task 17 |
| WR-3 | Producer→consumer contract for the bridge amendment | — | unassigned — address in Task 1 (record in the prerequisite amendment; Task 1 only notes it) |
| BD-1 | Single fixed argv vs preflight's need for `gh auth status` | — | Task 4 |
| BD-3 | Predicates missing for `type`, `milestone`, `priority`; YAML-significant `next_action` | — | Task 8 |
| BD-4 | Labels/types are triage-writable — the real trust model | — | Task 8 (code) + Task 22 (docs) |
| BD-5 | Sentinel commit status; fixture content allowlist | — | Task 5 (fixtures) + Task 14 (sentinel commit) |
| M-RI-1 | Resume-argument checks run only on the live path today, after board reads (migration amendment review) | — | Task 18 (moved before preflight, dry-run included) |
| M-RI-2 | `--from github --to github` hits `MIGRATE_GITHUB_UNAVAILABLE` before `MIGRATE_NOOP` today | — | Task 18 (NOOP first) |
| M-RI-3 | Github envelope `{ source_id, code, message }` and one stderr line are new; json/beads keep `{ id, index, stderr }` | — | Task 18 |
| M-RI-4 | `migrateToGithub({ source, target, scope, log })` lacked `exec`/`now`/`sleep` | — | Task 18 (adapter built inside with seams) |
| M-WR-8 | No single stderr chokepoint for `redact()` | — | Task 18 (`createGithubOutput`) + Task 19 (non-error-line test) |
| M-BD-1 | Commit-only path for a pre-existing beads sentinel runs without a prompt | — | Task 19 (accepted per amendment BEH-3: the file is the consent proxy) |
| M-BD-2 | `git status --porcelain` is empty for a gitignored, untracked sentinel | — | Task 14 (`ls-files --error-unmatch` + `diff --quiet HEAD`) |
| M-BD-3 | A plain `.beads/` directory reports the main checkout's branch | — | Task 14 (`rev-parse --show-toplevel` realpath check) |
| M-BD-4 | Write set should say `--yes` covers the beads commit and its hooks | — | Task 19 |
| M-BD-5 | Echoed `legacy_id` values are untrusted | — | Task 18 (`echoValue`, `parseId` validation) |
| M-TR | `GITHUB_PARTIAL_CREATE` before the `Legacy ID` write leaves an unfindable item (rev 4 termination note) | — | Task 25 (Legacy ID first) + Task 18 (unanchored record) |
| R6-CON-1 / R6-WR-2 / R6-BD-2 | `.migrate-unanchored.json` not in the amendment's check order or the gitignore registry; needs sentinel-grade containment | — | Task 18 (registry, containment, ID validation); amendment order is an external follow-up |
| R6-CON-2 / R6-RI-3 | Amendment codes and `GITHUB_REQUEST_FAILED` / `GITHUB_TRANSPORT_INTERNAL` absent from the Error Cases table | — | Task 22 (`EXTRA_CODES`) |
| R6-RI-1 / R6-TR-2 | Shipped `paginate()` / `continueConnection()` recompute the bound per page; no integer check on `totalCount` | behaviors-10 | Task 26 |
| R6-RI-2 | `lib/reality-check.mjs` opens `spec_ref` / `plan_ref` with no containment | behaviors-39 | Task 24 |
| TR-1 | Connection continuations need their own page bound | — | Task 4 |
| TR-2 | `walkTree` visited-set and cycle outcome | — | Task 9 |

Resolutions decided here (so the implementer does not re-decide them):

- **BD-1:** preflight adds **no** argv. `gh` missing → `ENOENT` from `execFileSync` → `GITHUB_CLI_MISSING`; unauthenticated → `gh`'s non-zero exit with its auth message → `GITHUB_AUTH_REQUIRED`; missing scopes → GraphQL error `type: "INSUFFICIENT_SCOPES"` → `GITHUB_SCOPE_MISSING` naming the scopes GitHub reports. Every probe is a GraphQL query through the one fixed argv, so BEH-40's "that exact argv" holds literally.
- **RI-2:** the file adapter is unchanged and keeps `BACKEND_READ_ONLY_DEPRECATED` (it is already read-only); the sentinel guard is added to the json and beads adapters only.
- **CON-3 / BD-5 (sentinel):** the format is confirmed by `agent-reliable-state-artifacts` charter rev 9 (commit 983e01ad); its only content is the five-key BEH-32 object. json/file: the operator commits it on the branch that carries the board, like `tasks.json`. beads: the migration verb commits that one file on `beads-board` via `commitSentinel` (Task 14, amendment BEH-8) and never pushes; pushing stays part of the operator's board sync.
- **RI-4:** `--json` output keeps `title`/`notes` byte-raw (consumers such as `/adev:debug` parse it) and adds `"untrusted_text": ["title", "notes"]` for github items; human output neutralizes titles and, in `show`, prints the body inside a `fenceBlock` with a fresh `crypto.randomBytes(8)` hex nonce.
- **RI-1:** `GITHUB_PARTIAL_CREATE` is raised by `create()` and `createEpic()`; `adev issues create` and `adev issues epic` print the ID and unwritten fields and exit 1; `/adev:plan` surfaces the CLI's exit like any other failed verb.
- **CON-4:** "rollback" in the charter means rollback-by-abstention; a loser's `claimed_at` overwriting the winner's is accepted (both stamps fall inside the race window) and documented in Task 22.
- **CON-1:** a github-path abort still emits `MIGRATE_PARTIAL_FAILURE`, with `{ source_id, code, message }` entries in `errors[]` and one `MIGRATE_PARTIAL_FAILURE:` stderr line; `redact()` is the single chokepoint for every github-path stdout and stderr string (amendment BEH-5, BEH-6; Task 18).
- **M-BD-1:** accepted: a re-run that finds the beads sentinel present but uncommitted commits it without a prompt, because amendment BEH-3 treats the file as the consent given by the run that created it.
- **Unanchored window (spec rev 5 BEH-30):** recorded in `.migrate-unanchored.json`, separate from `.migrate-state.json`, so the amendment's state-file schema and "deleting it changes nothing" rule stay true; the guarantee holds only while that file exists.

## Test Infrastructure Requirements

> These requirements must be satisfied before integration/infrastructure tests can run.
> Tasks without these prerequisites will produce setup errors, not test failures.
> **Never record actual credential values in plan output or spec files — env var names only.**

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| GitHub GraphQL API (Issues + Projects v2) | Task 20 fixture recorder only (`scripts/record-github-fixtures.mjs`) | unit (replay) — live access is manual and out of `npm test` |

### Credentials / Environment Variables

| Variable | Required For | Where to Get It |
|----------|-------------|-----------------|
| `GH_TOKEN` (optional when `gh` is already authenticated) | Fixture recording against a throwaway project | A token for a dedicated test account, scopes `repo` + `project` only |

### Pre-Provisioned State

- [ ] A throwaway Projects v2 board and repository owned by a test account, used only for recording fixtures
- [ ] `gh` installed on the recording machine

### CI Configuration

No CI change. Every test in this plan replays recorded fixtures through `tests/issues/github/replay-transport.mjs`; `npm test` never spawns `gh` and needs no secret. The recorder script is run by hand and is not part of any test glob.

## Tasks

All steps use `node --test <file>` (constitution quality gate: `npm test`). Every commit carries the trailers:

```
Spec: .context-index/specs/features/task-management/github-board-backend.spec.md
Plan-task: <n>
```

### Task 1: GitHub canonical IDs in `id-utils` [specialist: none]

**Charter capability:** GitHub Canonical IDs
**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Modify: `lib/issues/id-utils.mjs` — `parseId()` gains a first branch for `gh-` IDs; new exports `encodeGithubId({ owner, repo, number }, home)`, `decodeGithubId(id, home)`, `normalizeGithubIdInput(input, home)`
- Test: `tests/issues/github/ids.test.mjs`

**Tests:** `tests/issues/github/ids.test.mjs` — create (BEH-5, BEH-6)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseId, encodeGithubId, decodeGithubId, normalizeGithubIdInput } from "../../../lib/issues/id-utils.mjs";

const home = { owner: "acme", repo: "board" };

test("home-repo issues are gh-<n>; other repos encode owner.repo.n losslessly", () => {
  assert.equal(encodeGithubId({ owner: "Acme", repo: "Board", number: 12 }, home), "gh-12");
  assert.equal(encodeGithubId({ owner: "Org2", repo: "my_repo.v2", number: 3 }, home), "gh-org2.my_repo.v2.3");
  assert.deepEqual(decodeGithubId("gh-org2.my_repo.v2.3", home), { owner: "org2", repo: "my_repo.v2", number: 3 });
  assert.notEqual(encodeGithubId({ owner: "org1", repo: "api", number: 3 }, home),
                  encodeGithubId({ owner: "org2", repo: "api", number: 3 }, home));
});

test("gh- IDs are classified before the legacy grammar", () => {
  assert.equal(parseId(encodeGithubId({ owner: "x", repo: "issue", number: 12 }, home)).github, true);
  assert.equal(parseId("issue-12").legacy, true);
});

test("display forms and strict URLs normalize; everything else is refused", () => {
  for (const input of ["#12", "12", "acme/board#12", "https://github.com/acme/board/issues/12"]) {
    assert.equal(normalizeGithubIdInput(input, home), "gh-12");
  }
  for (const bad of ["https://github.com@evil.example/acme/board/issues/1", "https://github.com:8443/acme/board/issues/1",
                     "https://github.com/acme/board/issues/1?x=1", "https://github.com/acme/board/issues/1#c", "http://github.com/acme/board/issues/1",
                     "https://gitlab.com/acme/board/issues/1"]) {
    assert.throws(() => normalizeGithubIdInput(bad, home), { code: "GITHUB_INVALID_ID" });
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/github/ids.test.mjs`
Expected: FAIL — `encodeGithubId` is not exported

- [ ] **Implement**

In `parseId()`, before `LEGACY_RE`: if `id` starts with `gh-`, return `{ tier: null, depth: 1, parent_id: null, prefix: "gh", counter: null, legacy: false, github: true }` when the remainder is `\d+` or matches `^[a-z0-9-]+\.[a-z0-9._-]+\.\d+$`, else `null`. `normalizeGithubIdInput` parses URLs with `new URL()` and refuses (never strips) any `username`, `password`, `port`, `search`, or `hash`, a protocol other than `https:`, and a hostname other than `github.com` (review BD-7). Lowercase owner and repo. Note for the bridge amendment prerequisite (review WR-3): record that a home-repo `gh-<n>` item with a reserved `module:` label must be classified fail-closed — no code here.

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/ids.test.mjs && node --test tests/issues/id-utils.test.mjs`
Expected: PASS (existing `id-utils` suite unchanged)

- [ ] **Commit**

```bash
git add lib/issues/id-utils.mjs tests/issues/github/ids.test.mjs
git commit -m "feat(task-management): recognize GitHub canonical issue IDs"
```

### Task 2: Widen retro and session-capture ID validators [specialist: none]

**Charter capability:** GitHub Canonical IDs
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/retro/issue-id-validation.mjs` — charset/length accept canonical gh IDs (`[a-z0-9._-]`, ≤ 160, `gh-` prefix)
- Modify: `lib/session-capture.mjs:264,315-335` — same rule
- Test: `tests/issues/github/id-validators.test.mjs`

**Tests:** `tests/issues/github/id-validators.test.mjs` — create (BEH-7)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateIssueId } from "../../../lib/retro/issue-id-validation.mjs";

test("canonical gh IDs pass; display forms are rejected", () => {
  assert.equal(validateIssueId("gh-12").ok, true);
  assert.equal(validateIssueId("gh-org2.my_repo.v2.3").ok, true);
  assert.equal(validateIssueId("gh-" + "a".repeat(39) + "." + "b".repeat(100) + ".1234567").ok, true);
  for (const bad of ["#12", "acme/board#12", "gh-12 ", "GH-12"]) assert.equal(validateIssueId(bad).ok, false);
  assert.equal(validateIssueId("issue-7").ok, true);
});
```

Add the equivalent assertion for the session-capture validator (it is module-internal; test it through its exported entry point the existing session-capture tests use — find it with `grep -n "^export" lib/session-capture.mjs`).

- [ ] **Verify test fails**

Run: `node --test tests/issues/github/id-validators.test.mjs`
Expected: FAIL — `gh-org2.my_repo.v2.3` rejected with reason `charset`

- [ ] **Implement**

Keep the existing 64-char rule for non-gh IDs; add a second accepted shape for IDs starting `gh-`: charset `[a-z0-9._-]`, length ≤ 160, and `parseId()` must report `github: true`.

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/id-validators.test.mjs && npm test -- --test-name-pattern "issue id|session"`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/retro/issue-id-validation.mjs lib/session-capture.mjs tests/issues/github/id-validators.test.mjs
git commit -m "feat(task-management): accept GitHub canonical IDs in retro and session validators"
```

### Task 3: `legacy_id` / `affected_modules` on the `Issue` contract [specialist: none]

**Charter capability:** GitHub Board Backend
**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Modify: `lib/issues/interface.mjs:10-31` (typedef) and `:452-475` (`validateIssue()` returned set)
- Test: `tests/issues/github/issue-fields.test.mjs`

**Tests:** `tests/issues/github/issue-fields.test.mjs` — create (BEH-8)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateIssue } from "../../../lib/issues/interface.mjs";

test("validateIssue keeps legacy_id and affected_modules", () => {
  const out = validateIssue({ title: "t", legacy_id: "issue-7k3f9a", affected_modules: ["lib"] });
  assert.equal(out.legacy_id, "issue-7k3f9a");
  assert.deepEqual(out.affected_modules, ["lib"]);
  const bare = validateIssue({ title: "t" });
  assert.equal("legacy_id" in bare && bare.legacy_id !== undefined, false);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/github/issue-fields.test.mjs`
Expected: FAIL — `legacy_id` is `undefined` (dropped by the whitelist)

- [ ] **Implement**

Add both properties to the typedef and pass them through `validateIssue()` as `undefined` when absent (same idiom as `claimed_at`). `affected_modules` must be an array of strings when present, else `INVALID_AFFECTED_MODULES`; check `grep -rn affected_modules lib/issues` first and reuse the beads adapter's existing validation if one exists rather than adding a second.

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/issue-fields.test.mjs && node --test tests/issues/`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/interface.mjs tests/issues/github/issue-fields.test.mjs
git commit -m "feat(task-management): carry legacy_id and affected_modules on the Issue contract"
```

### Task 4: GraphQL transport [specialist: none]

**Charter capability:** GitHub Fail-Fast Preflight, GitHub Batched Reads
**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `lib/issues/github/transport.mjs` — `createTransport({ exec = execFileSync, env })` returning `{ request(document, variables), paginate(document, variables, { connectionPath }) }`
- Create: `lib/issues/github/errors.mjs` — `githubError(code, message, extra)`, `GITHUB_ERROR_CODES`, `redact(text)`
- Test: `tests/issues/github/transport.test.mjs`

**Tests:** `tests/issues/github/transport.test.mjs` — create (BEH-40, BEH-10 bound, BEH-35, BEH-36)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "../../../lib/issues/github/transport.mjs";

function recordingExec(response) {
  const calls = [];
  const exec = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return JSON.stringify(response); };
  return { exec, calls };
}

test("every request uses the one fixed argv and carries values only as variables on stdin", () => {
  const { exec, calls } = recordingExec({ data: { ok: true } });
  const t = createTransport({ exec });
  const hostile = "@/etc/passwd $(id) `x` \n } mutation { x }";
  t.request("query Q($v: String!) { echo(v: $v) }", { v: hostile });
  assert.equal(calls[0].cmd, "gh");
  assert.deepEqual(calls[0].args, ["api", "graphql", "--input", "-"]);
  assert.equal(calls[0].opts.shell, false);
  assert.equal(calls[0].opts.env.GH_PROMPT_DISABLED, "1");
  assert.deepEqual(JSON.parse(calls[0].opts.input).variables, { v: hostile });
  assert.ok(!calls[0].args.some((a) => a.includes(hostile)));
});

test("error mapping: ENOENT, auth, INSUFFICIENT_SCOPES, rate limit, timeout", () => {
  const throwing = (err) => () => { throw err; };
  const enoent = Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" });
  assert.throws(() => createTransport({ exec: throwing(enoent) }).request("query{a}", {}), { code: "GITHUB_CLI_MISSING" });
  const auth = Object.assign(new Error("x"), { status: 4, stderr: "To get started with GitHub CLI, please run:  gh auth login" });
  assert.throws(() => createTransport({ exec: throwing(auth) }).request("query{a}", {}), { code: "GITHUB_AUTH_REQUIRED" });
  const scopes = { errors: [{ type: "INSUFFICIENT_SCOPES", message: "requires one of ['read:project']" }] };
  assert.throws(() => createTransport({ exec: () => JSON.stringify(scopes) }).request("query{a}", {}), { code: "GITHUB_SCOPE_MISSING" });
  const limited = { errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] };
  assert.throws(() => createTransport({ exec: () => JSON.stringify(limited) }).request("query{a}", {}), { code: "GITHUB_RATE_LIMITED" });
  const timeout = Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" });
  assert.throws(() => createTransport({ exec: throwing(timeout) }).request("query{a}", {}), { code: "GITHUB_UNREACHABLE" });
});

test("pagination is bounded per connection: repeated cursor and page overrun both throw", () => {
  const pages = [
    { data: { node: { items: { totalCount: 150, pageInfo: { hasNextPage: true, endCursor: "c1" }, nodes: [1] } } } },
    { data: { node: { items: { totalCount: 150, pageInfo: { hasNextPage: true, endCursor: "c1" }, nodes: [2] } } } },
  ];
  let i = 0;
  const t = createTransport({ exec: () => JSON.stringify(pages[i++]) });
  assert.throws(() => t.paginate("query($after:String){x}", {}, { connectionPath: ["node", "items"] }), { code: "GITHUB_PAGINATION_INVALID" });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/github/transport.test.mjs`
Expected: FAIL — cannot find module `lib/issues/github/transport.mjs`

- [ ] **Implement**

- `request()` calls `exec("gh", FIXED_ARGV, { input: JSON.stringify({ query, variables }), encoding: "utf8", shell: false, timeout: 30_000, env: { ...process.env, GH_PROMPT_DISABLED: "1" } })`. Assert `args` deep-equals the frozen `FIXED_ARGV` before spawning; any other value throws an internal error (never reachable from callers — `request` takes no argv input).
- Map failures as in the test; `GITHUB_SCOPE_MISSING` names the scopes from GitHub's message; every message passes through `redact()` (strips `gh[pousr]_…` and `github_pat_…` tokens) — this is the "token redacted" half of review CON-1.
- Preflight needs no extra argv (review BD-1 resolution): CLI presence, auth and scopes are all detected from this channel's failures.
- `paginate()` follows `pageInfo.endCursor`, tracks every cursor seen, and enforces `pages ≤ ceil(totalCount / pageSize) + 1` **per connection** (review TR-1): the item connection and each sub-issue / blocked-by continuation get their own bound from their own `totalCount`. Either violation throws `GITHUB_PAGINATION_INVALID`; no partial array is returned.

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/transport.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/github/transport.mjs lib/issues/github/errors.mjs tests/issues/github/transport.test.mjs
git commit -m "feat(task-management): add the GitHub GraphQL transport with a fixed argv"
```

### Task 5: Replay transport and fixture-lint [specialist: none]

**Charter capability:** GitHub Conformance Suite
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 4
**Files:**
- Create: `tests/issues/github/replay-transport.mjs` — `replayExec(fixtures)` returning an `exec` function for `createTransport`, keyed by `sha256(query + "\0" + stableStringify(variables))`; throws `UNRECORDED_GITHUB_REQUEST` on a miss. The returned function carries `exec.calls`: an array of `{ operation, query, variables }` per request, in order, where `operation` is the GraphQL operation name parsed from the document with `/^\s*(query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/` (group 2). Every document constant in `queries.mjs` / `mutations.mjs` is therefore a **named** operation (`query ProjectItems(...)`, `mutation SetFields(...)`); an anonymous document throws in `replayExec` so the rule cannot drift. `exec.calls.length` counts requests.
- Test: `tests/issues/github/fixture-lint.test.mjs`

**Tests:** `tests/issues/github/fixture-lint.test.mjs` — create (BEH-37 fixture-lint)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { replayExec } from "./replay-transport.mjs";
import { createTransport } from "../../../lib/issues/github/transport.mjs";

const FIXTURES = new URL("../conformance/fixtures/", import.meta.url).pathname;
const TOKEN_RE = /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/;
const ALLOWED_LOGINS = new Set(["adev-fixture-bot", "adev-fixture-human"]);

test("an unrecorded request fails instead of reaching the network", () => {
  const t = createTransport({ exec: replayExec([]) });
  assert.throws(() => t.request("query{viewer{login}}", {}), { code: "UNRECORDED_GITHUB_REQUEST" });
});

test("committed fixtures carry no tokens, no foreign logins, and only recorder-authored text", () => {
  if (!existsSync(FIXTURES)) return;
  for (const f of readdirSync(FIXTURES, { recursive: true }).filter((p) => p.endsWith(".json"))) {
    const text = readFileSync(join(FIXTURES, f), "utf8");
    assert.doesNotMatch(text, TOKEN_RE, f);
    for (const [, login] of text.matchAll(/"login"\s*:\s*"([^"]+)"/g)) assert.ok(ALLOWED_LOGINS.has(login), `${f}: ${login}`);
    for (const [, s] of text.matchAll(/"(?:title|body)"\s*:\s*"([^"]*)"/g)) assert.match(s, /^(adev-fixture:|$)/, `${f}: ${s.slice(0, 40)}`);
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/github/fixture-lint.test.mjs`
Expected: FAIL — cannot find module `./replay-transport.mjs`

- [ ] **Implement**

Write the replay helper. Fixture file shape: `{ "requests": [{ "query": "...", "variables": {...}, "response": {...} | "error": { "code": "...", "stderr": "..." } }] }`. The recorder (Task 20) prefixes every title and body it creates with `adev-fixture:` so the content allowlist above holds (review BD-5).

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/fixture-lint.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/issues/github/replay-transport.mjs tests/issues/github/fixture-lint.test.mjs
git commit -m "test(task-management): add GitHub replay transport and fixture lint"
```

### Task 6: `tasks.github` config validation [specialist: none]

**Charter capability:** GitHub Board Backend
**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `lib/issues/github/config.mjs` — `normalizeGithubConfig(raw)` → frozen config with defaults
- Test: `tests/issues/github/config.test.mjs`

**Tests:** `tests/issues/github/config.test.mjs` — create (BEH-2)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGithubConfig } from "../../../lib/issues/github/config.mjs";

const base = { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" };

test("defaults: Status field, recommended status_map, auto type_source, 1500ms settle", () => {
  const c = normalizeGithubConfig(base);
  assert.equal(c.status_field, "Status");
  assert.deepEqual(c.status_map.open, ["Backlog", "Ready"]);
  assert.equal(c.status_map_write.open, "Backlog");
  assert.equal(c.type_source, "auto");
  assert.equal(c.claim_settle_ms, 1500);
});

for (const [name, patch] of [
  ["bad project url", { project: "https://github.com/acme/board" }],
  ["bad repo", { repo: "acme" }],
  ["incomplete status_map", { status_map: { open: "Backlog" } }],
  ["option under two statuses", { status_map: { open: "X", in_progress: "X", deferred: "D", closed: "C" } }],
  ["bad type_source", { type_source: "magic" }],
  ["fields collision", { fields: { owner: "Who", next_action: "Who" } }],
  ["unknown fields key", { fields: { nope: "X" } }],
  ["claim_settle_ms out of range", { claim_settle_ms: 10001 }],
]) {
  test(`GITHUB_INVALID_CONFIG: ${name}`, () => {
    assert.throws(() => normalizeGithubConfig({ ...base, ...patch }), { code: "GITHUB_INVALID_CONFIG" });
  });
}
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/github/config.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

Pure, synchronous, no I/O. Error messages name the offending key. Expose `status_map` (status → options[]) and `status_map_write` (status → first option), and `fieldNames` (adev field → project field name, defaults from BEH-8).

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/config.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/github/config.mjs tests/issues/github/config.test.mjs
git commit -m "feat(task-management): validate the tasks.github configuration"
```

### Task 7: Lazy preflight [specialist: none]

**Charter capability:** GitHub Fail-Fast Preflight
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 4, Task 6
**Files:**
- Create: `lib/issues/github/preflight.mjs` — `createPreflight({ transport, config })` → `ensure()` (runs once, caches result or error), `visibility()` (`{ repo: "public"|"private", project: "public"|"private" }`)
- Create (shared with later tasks): `lib/issues/github/queries.mjs` — `PREFLIGHT_QUERY` constant
- Test: `tests/issues/github/preflight.test.mjs`

**Tests:** `tests/issues/github/preflight.test.mjs` — create (BEH-3, BEH-4)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "../../../lib/issues/github/transport.mjs";
import { normalizeGithubConfig } from "../../../lib/issues/github/config.mjs";
import { createPreflight } from "../../../lib/issues/github/preflight.mjs";
import { replayExec } from "./replay-transport.mjs";
import { preflightFixture } from "./fixtures/preflight.mjs";

const config = normalizeGithubConfig({ project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" });

test("one network probe per process; result cached", () => {
  const exec = replayExec(preflightFixture.ok);
  const p = createPreflight({ transport: createTransport({ exec }), config });
  p.ensure(); p.ensure();
  assert.equal(exec.calls.length, 1);
  assert.deepEqual(p.visibility(), { repo: "private", project: "private" });
  assert.ok(exec.calls.every((c) => !/viewer\s*\{[^}]*login/.test(c.query)), "preflight never reads the gh login");
});

for (const [variant, code] of [
  ["projectMissing", "GITHUB_PROJECT_NOT_FOUND"], ["repoMissing", "GITHUB_REPO_NOT_FOUND"],
  ["statusFieldMissing", "GITHUB_FIELD_MISSING"], ["ownerFieldWrongType", "GITHUB_FIELD_MISSING"],
  ["statusOptionMissing", "GITHUB_STATUS_OPTION_MISSING"],
]) {
  test(`preflight ${variant} → ${code}, message ends with a remedy`, () => {
    const p = createPreflight({ transport: createTransport({ exec: replayExec(preflightFixture[variant]) }), config });
    assert.throws(() => p.ensure(), (e) => e.code === code && /adev issues github setup/.test(e.message));
  });
}
```

Create `tests/issues/github/fixtures/preflight.mjs` with hand-written response objects for each variant (these are unit fixtures, not recorded ones; titles/bodies prefixed `adev-fixture:`).

- [ ] **Verify test fails**

Run: `node --test tests/issues/github/preflight.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

One `PREFLIGHT_QUERY` resolves the project (by org/user + number), its fields with types and single-select options, and the repository with `visibility` — a single request. CLI/auth/scope failures surface from the transport (Task 4). The adapter never reads a token or the `gh` login (BEH-4) — asserted in the test above.

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/github/preflight.mjs lib/issues/github/queries.mjs tests/issues/github/preflight.test.mjs tests/issues/github/fixtures/preflight.mjs
git commit -m "feat(task-management): add lazy GitHub board preflight"
```

### Task 8: Field decoding, predicates, status mapping [specialist: none]

**Charter capability:** GitHub Board Backend
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 1, Task 3, Task 6
**Files:**
- Create: `lib/issues/github/decode.mjs` — `decodeItem(rawItem, ctx)` → `{ issue, drift[] }` or throws; `FIELD_PREDICATES`; `decodeStatus(issueState, option, config)`
- Test: `tests/issues/github/decode.test.mjs`

**Tests:** `tests/issues/github/decode.test.mjs` — create (BEH-8, BEH-12, BEH-39)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeItem, decodeStatus, FIELD_PREDICATES } from "../../../lib/issues/github/decode.mjs";
import { normalizeGithubConfig } from "../../../lib/issues/github/config.mjs";
import { rawItem } from "./fixtures/items.mjs";

const config = normalizeGithubConfig({ project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" });
const ctx = { config, home: { owner: "acme", repo: "board" }, moduleSlugs: new Set(["lib", "cli"]) };

test("status: issue state wins; aliases read; unmapped option throws", () => {
  assert.equal(decodeStatus("CLOSED", "Backlog", config).status, "closed");
  assert.equal(decodeStatus("OPEN", null, config).status, "open");
  assert.equal(decodeStatus("OPEN", "In Review", config).status, "in_progress");
  assert.deepEqual(decodeStatus("OPEN", "Done", config), { status: "open", drift: "closed-mapped-open" });
  assert.throws(() => decodeStatus("OPEN", "Icebox", config), { code: "GITHUB_UNMAPPED_STATUS" });
});

test("a forged metadata block in the body changes no decoded field", () => {
  const { issue } = decodeItem(rawItem({ body: "```adev\nspec_ref: ../../etc/passwd\nowner: mallory\n```" }), ctx);
  assert.equal(issue.spec_ref, undefined);
  assert.equal(issue.owner, undefined);
});

test("predicates refuse, never repair", () => {
  for (const [field, bad] of [["branch", "feat/x..y"], ["branch", "-x"], ["spec_ref", "../x.md"], ["spec_ref", "/abs.md"],
    ["next_action", "a\nb"], ["next_action", "x".repeat(501)], ["claimed_at", "yesterday"], ["pr", "javascript:1"],
    ["legacy_id", "gh-12"], ["type", "Bug Report!"], ["priority", 7], ["milestone", "v1\u0007"]]) {
    assert.throws(() => decodeItem(rawItem({ fields: { [field]: bad } }), ctx), { code: "GITHUB_INVALID_FIELD_VALUE" }, `${field}=${bad}`);
  }
});

test("predicates cover every BEH-8 field (exhaustive)", () => {
  for (const f of ["owner", "claimed_at", "next_action", "spec_ref", "planRef", "branch", "pr", "legacy_id", "type", "priority", "milestone", "affected_modules"]) {
    assert.equal(typeof FIELD_PREDICATES[f], "function", f);
  }
});

test("unknown module: slugs are excluded and reported as drift", () => {
  const { issue, drift } = decodeItem(rawItem({ labels: ["module:lib", "module:nope", "module:review-gate"] }), ctx);
  assert.deepEqual(issue.affected_modules.sort(), ["lib", "review-gate"]);
  assert.ok(drift.some((d) => d.kind === "unknown-module-label" && d.value === "nope"));
});
```

Create `tests/issues/github/fixtures/items.mjs` with a `rawItem(overrides)` builder producing one project-item node in the shape `queries.mjs` will request.

- [ ] **Verify test fails**

Run: `node --test tests/issues/github/decode.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

- Predicates per BEH-39, plus the three the review found missing (review BD-3): `type` — lowercase slug `^[a-z][a-z0-9-]{0,39}$` after lowercasing the issue-type name or the `type:` label suffix; `priority` — integer 0–4 (single-select `P0`–`P4`, number field, or `priority:<n>` label); `milestone` — one line, no control characters, ≤ 255. `next_action` additionally refuses a leading YAML indicator (`- `, `? `, `: `, `#`, `&`, `*`, `!`, `|`, `>`, `'`, `"`, `%`, `@`, `` ` ``) so it can never break a frontmatter splice.
- Reserved safety tags come from `RESERVED_SAFETY_TAGS` in `lib/issues/eligibility.mjs`; module slugs from `manifest.modules[].slug`. A reserved tag counts only when its label is present — absence is fail-closed in eligibility, so a triager removing it makes the item ineligible, never more eligible (review BD-4: the docs in Task 22 state that label and issue-type writes require triage access, Project field writes require project write access).
- `decodeItem` never reads `body` or `title` for any field other than `notes` / `title`.

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/decode.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/github/decode.mjs tests/issues/github/decode.test.mjs tests/issues/github/fixtures/items.mjs
git commit -m "feat(task-management): decode GitHub project items with refuse-on-read predicates"
```

### Task 9: `GithubAdapter` read path [specialist: none]

**Charter capability:** GitHub Board Backend, GitHub Batched Reads
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 5, Task 7, Task 8
**Files:**
- Create: `lib/issues/github-adapter.mjs` — `class GithubAdapter { constructor(storageRoot, manifest, { exec, now = Date.now, sleep } = {}) }` (`now` and `sleep` are injectable so claim timestamps and the settle wait are deterministic under replay) with `name = "github"`, `claimTtlMinutes`, `init`, `get`, `list`, `listEpics`, `walkTree`
- Create: `lib/issues/github/board-read.mjs` — `readBoard(transport, config)`: one paginated items read + per-item connection continuations, returning decoded items and drift; process-scoped cache invalidated by any write
- Modify: `lib/issues/github/queries.mjs` — `PROJECT_ITEMS_QUERY`, `SUB_ISSUES_PAGE_QUERY`, `BLOCKED_BY_PAGE_QUERY`
- Test: `tests/issues/github/adapter-read.test.mjs`

**Tests:** `tests/issues/github/adapter-read.test.mjs` — create (BEH-9, BEH-10, BEH-11, BEH-34)
**Why not split:** the read path is one query feeding four methods; splitting by method would duplicate the board-read fixture without separating any behavior.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { replayExec } from "./replay-transport.mjs";
import { createTempDir } from "../../helpers.mjs";
import { board } from "./fixtures/board.mjs"; // 250 items, 2 epics, nested sub-issues, one cross-repo item, one draft, one PR

const manifest = { tasks: { backend: "github", github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" } } };
const adapter = (fx) => { const exec = replayExec(fx); return { a: new GithubAdapter(createTempDir(), manifest, { exec }), exec }; };

test("list: ceil(250/100) item pages, drafts and PRs ignored, epics separated", async () => {
  const { a, exec } = adapter(board.full);
  const issues = await a.list({});
  assert.equal(exec.calls.filter((c) => c.query.startsWith("query ProjectItems")).length, 3);
  assert.ok(issues.every((i) => /^gh-/.test(i.id)));
  assert.equal((await a.listEpics()).length, 2);
});

test("walkTree: transitive sub-issues on the project, sorted; a cycle throws", async () => {
  const { a } = adapter(board.full);
  assert.deepEqual((await a.walkTree("gh-1")).map((i) => i.id), ["gh-2", "gh-3", "gh-4"]);
  const { a: cyclic } = adapter(board.cycle);
  await assert.rejects(cyclic.walkTree("gh-1"), { code: "GITHUB_SUBISSUE_CYCLE" });
});

test("old IDs resolve through legacy_id; ambiguity refused; unknown → null", async () => {
  const { a } = adapter(board.migrated);
  assert.equal((await a.get("issue-7k3f9a")).id, "gh-41");
  await assert.rejects(a.get("epic-2"), { code: "GITHUB_AMBIGUOUS_LEGACY_ID" });
  assert.equal(await a.get("issue-zzzzzz"), null);
  assert.equal(await a.get("gh-99999"), null);
});
```

Build `tests/issues/github/fixtures/board.mjs` programmatically (a generator over `rawItem` from Task 8), not as a recorded file.

- [ ] **Verify test fails**

Run: `node --test tests/issues/github/adapter-read.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

- The constructor calls `normalizeGithubConfig` (sync, throws `GITHUB_INVALID_CONFIG`) and does no I/O; every public method calls `preflight.ensure()` first.
- `walkTree` (review TR-2) walks parent → children over the decoded item set with a `visited` set of canonical IDs; revisiting an ID throws `GITHUB_SUBISSUE_CYCLE` (add it to `errors.mjs`) with no partial result. This code, like `SENTINEL_PATH_UNSAFE` (Task 14), is a deliberate plan-level addition beyond the spec's Error Cases table — documented in Task 22 and declared there as an extra code; `/adev:validate`'s scope-expansion sub-finding should be answered with this note, not by amending the review-passed spec. The walk is also bounded by the item set from `readBoard`.
- `get(id)`: canonical / display / URL input → `normalizeGithubIdInput`; non-gh input → `legacy_id` index; zero matches → `null` (BEH-34).
- `list` / `walkTree` / `get` throw `GITHUB_UNMAPPED_STATUS` / `GITHUB_INVALID_FIELD_VALUE` naming every offending ID — collect across all items before throwing.

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/adapter-read.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/github-adapter.mjs lib/issues/github/board-read.mjs lib/issues/github/queries.mjs tests/issues/github/adapter-read.test.mjs tests/issues/github/fixtures/board.mjs
git commit -m "feat(task-management): read the GitHub board through GithubAdapter"
```

### Task 10: Registry wiring [specialist: none]

**Charter capability:** GitHub Board Backend
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 9
**Files:**
- Modify: `lib/issues/registry.mjs` — `SUPPORTED_BACKENDS` gains `"github"`; `backend === "github"` returns `new GithubAdapter(storageRoot, manifest)` with no try/catch fallback
- Test: `tests/issues/github/registry.test.mjs`

**Tests:** `tests/issues/github/registry.test.mjs` — create (BEH-1)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { getIssueManager, SUPPORTED_BACKENDS } from "../../../lib/issues/registry.mjs";

test("github backend returns GithubAdapter and never falls back to JSON", () => {
  assert.ok(SUPPORTED_BACKENDS.includes("github"));
  const m = getIssueManager({ tasks: { backend: "github", github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" } } }, process.cwd());
  assert.equal(m.name, "github");
  assert.throws(() => getIssueManager({ tasks: { backend: "github", github: { repo: "acme/board" } } }, process.cwd()), { code: "GITHUB_INVALID_CONFIG" });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/github/registry.test.mjs`
Expected: FAIL — `SUPPORTED_BACKENDS` lacks `github`

- [ ] **Implement**

Add the branch; update the module docblock's backend list. Before committing, run `grep -rn "json, file, beads\|json, beads, file\|SUPPORTED_BACKENDS" tests lib` and update any test asserting the exact backend list or `MIGRATE_UNKNOWN_BACKEND` message text in the same commit. Count them with that grep before starting; if more than 8 would change, stop and split this task per the plan's sizing rule.

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/registry.test.mjs && npm test`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/registry.mjs tests/issues/github/registry.test.mjs
git commit -m "feat(task-management): register the github issue backend"
```

### Task 11: Write path — `create`, epics, partial create [specialist: none]

**Charter capability:** GitHub Board Backend
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 9
**Files:**
- Create: `lib/issues/github/mutations.mjs` — constant documents: `CREATE_ISSUE`, `ADD_TO_PROJECT`, `SET_TEXT_FIELD`, `SET_SINGLE_SELECT`, `ADD_SUB_ISSUE`, `ADD_BLOCKED_BY`, `SET_ISSUE_TYPE`, `ADD_LABELS`, `SET_MILESTONE`
- Modify: `lib/issues/github-adapter.mjs` — `create`, `createEpic`, `updateEpic` (non-status fields)
- Modify: `lib/cli/issues-create.mjs`, `lib/cli/issues-epic.mjs` — print ID + unwritten fields on `GITHUB_PARTIAL_CREATE` and exit 1
- Test: `tests/issues/github/adapter-create.test.mjs`

**Tests:** `tests/issues/github/adapter-create.test.mjs` — create (BEH-13, BEH-14, BEH-15, BEH-19)
**Why not split:** `create` and `createEpic` share one mutation sequence; the two CLI edits are three-line catch blocks for the same error.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { replayExec } from "./replay-transport.mjs";
import { writes } from "./fixtures/writes.mjs";
import { createTempDir } from "../../helpers.mjs";

const manifest = { tasks: { backend: "github", github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" } } };

test("create writes the recorded sequence and returns the read-back item", async () => {
  const exec = replayExec(writes.createWithParent);
  const a = new GithubAdapter("/tmp/unused", manifest, { exec });
  const item = await a.create({ title: "adev-fixture: t", notes: "@/etc/passwd", parent_id: "gh-1", spec_ref: "x.spec.md", affected_modules: ["lib"] });
  assert.equal(item.id, "gh-300");
  assert.deepEqual(exec.calls.map((c) => c.operation), ["CreateIssue", "AddToProject", "SetFields", "AddSubIssue", "AddLabels", "ProjectItems"]);
  assert.equal(exec.calls[0].variables.body, "@/etc/passwd");
  assert.ok(exec.calls.every((c) => !/assignee/i.test(c.query)));
});

test("unresolvable parent or dependency is refused before any issue is created", async () => {
  const exec = replayExec(writes.boardWithoutParent);
  const a = new GithubAdapter(createTempDir(), manifest, { exec });
  await assert.rejects(a.create({ title: "adev-fixture: t", parent_id: "gh-404" }), { code: "PARENT_NOT_FOUND" });
  await assert.rejects(a.create({ title: "adev-fixture: t", dependencies: ["gh-405"] }), { code: "NOT_FOUND" });
  assert.equal(exec.calls.filter((c) => c.operation === "CreateIssue").length, 0);
});

test("type_source branches and Epic milestone", async () => {
  const viaTypes = replayExec(writes.createTypedIssueTypes);
  await new GithubAdapter(createTempDir(), { tasks: { ...manifest.tasks, github: { ...manifest.tasks.github, type_source: "issue_types" } } }, { exec: viaTypes }).create({ title: "adev-fixture: b", type: "bug" });
  assert.ok(viaTypes.calls.some((c) => c.operation === "SetIssueType"));
  const viaLabels = replayExec(writes.createTypedLabels);
  await new GithubAdapter(createTempDir(), { tasks: { ...manifest.tasks, github: { ...manifest.tasks.github, type_source: "labels" } } }, { exec: viaLabels }).create({ title: "adev-fixture: b", type: "bug" });
  assert.ok(viaLabels.calls.some((c) => c.operation === "AddLabels" && c.variables.labels.includes("type:bug")));
  const epic = replayExec(writes.createEpicWithMilestone);
  await new GithubAdapter(createTempDir(), manifest, { exec: epic }).createEpic({ title: "adev-fixture: e", milestone: "v1" });
  assert.ok(epic.calls.some((c) => c.operation === "SetMilestone"));
});

test("planTask is refused; partial create keeps the issue and reports unwritten fields", async () => {
  const a = new GithubAdapter("/tmp/unused", manifest, { exec: replayExec(writes.partial) });
  await assert.rejects(a.create({ title: "t", planRef: "p.md", planTask: 3 }), { code: "BOARD_GRANULARITY_VIOLATION" });
  await assert.rejects(a.create({ title: "adev-fixture: t", next_action: "Run /adev:plan" }),
    (e) => e.code === "GITHUB_PARTIAL_CREATE" && e.id === "gh-301" && e.unwritten.includes("next_action"));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/github/adapter-create.test.mjs`
Expected: FAIL — `a.create is not a function`

- [ ] **Implement**

Validate every value with `FIELD_PREDICATES` (Task 8) before the first request. Field writes for one item are aliased mutations in one request (`SetFields`). Labels: only `type:`, `priority:` (fallback), `epic` (label typing) and `module:` families are ever added. `/adev:plan` reaches this through `adev issues epic`, so the CLI's exit 1 is its failure surface (review RI-1).

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/adapter-create.test.mjs && node --test tests/issues/cli-create.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/github/mutations.mjs lib/issues/github-adapter.mjs lib/cli/issues-create.mjs lib/cli/issues-epic.mjs tests/issues/github/adapter-create.test.mjs tests/issues/github/fixtures/writes.mjs
git commit -m "feat(task-management): create issues and epics on the GitHub board"
```

### Task 12: Write path — `update`, `close`, `addDependency` [specialist: none]

**Charter capability:** GitHub Board Backend
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 11
**Files:**
- Modify: `lib/issues/github-adapter.mjs` — `update`, `close`, `addDependency`
- Modify: `lib/issues/github/mutations.mjs` — `CLOSE_ISSUE`, `ADD_COMMENT`, `CLEAR_FIELD`
- Test: `tests/issues/github/adapter-update-close.test.mjs`

**Tests:** `tests/issues/github/adapter-update-close.test.mjs` — create (BEH-16, BEH-17, BEH-18)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { replayExec } from "./replay-transport.mjs";
import { writes } from "./fixtures/writes.mjs";
const manifest = { tasks: { backend: "github", github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" } } };
const make = (fx) => { const exec = replayExec(fx); return { a: new GithubAdapter("/tmp/unused", manifest, { exec }), exec }; };

test("update follows the shared transition rules; adev never reopens", async () => {
  const { a } = make(writes.closedItem);
  await assert.rejects(a.update("gh-5", { next_action: "x" }), { code: "ISSUE_CLOSED" });
  const { a: b } = make(writes.openItem);
  await assert.rejects(b.update("gh-6", { status: "closed" }), { code: "USE_CLOSE_METHOD" });
});

test("update writes only changed fields in one aliased request", async () => {
  const { a, exec } = make(writes.openItemUpdate);
  await a.update("gh-6", { next_action: "Run /adev:implement", priority: 1 });
  assert.equal(exec.calls.filter((c) => c.operation === "SetFields").length, 1);
});

test("close guards, then Status → Done, close COMPLETED, reason as comment", async () => {
  await assert.rejects(make(writes.blockedItem).a.close("gh-7", "r"), { code: "BLOCKED_BY_DEPENDENCIES" });
  await assert.rejects(make(writes.parentWithOpenChild).a.close("gh-1", "r"), { code: "CASCADE_BLOCKED" });
  const { a, exec } = make(writes.closeOk);
  await a.close("gh-8", "done in #12");
  assert.deepEqual(exec.calls.map((c) => c.operation).slice(-3), ["SetFields", "CloseIssue", "AddComment"]);
});

test("planTask on update is refused", async () => {
  await assert.rejects(make(writes.openItem).a.update("gh-6", { planTask: 2 }), { code: "BOARD_GRANULARITY_VIOLATION" });
});

test("legacy IDs on update and close: unknown → NOT_FOUND, ambiguous → GITHUB_AMBIGUOUS_LEGACY_ID", async () => {
  for (const call of [(a, id) => a.update(id, { next_action: "x" }), (a, id) => a.close(id, "r")]) {
    await assert.rejects(call(make(writes.migratedBoard).a, "issue-zzzzzz"), { code: "NOT_FOUND" });
    await assert.rejects(call(make(writes.migratedBoard).a, "epic-2"), { code: "GITHUB_AMBIGUOUS_LEGACY_ID" });
  }
});

test("addDependency is idempotent", async () => {
  const { a, exec } = make(writes.dependencyExists);
  await a.addDependency("gh-9", "gh-10");
  assert.equal(exec.calls.filter((c) => c.operation === "AddBlockedBy").length, 0);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/github/adapter-update-close.test.mjs`
Expected: FAIL — `a.update is not a function`

- [ ] **Implement**

Call `validateStatusTransition(current.status, changes)` from `lib/issues/interface.mjs` first — unchanged semantics, no github-specific branch. `close` posts the comment only when `reason` is non-empty.

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/adapter-update-close.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/github-adapter.mjs lib/issues/github/mutations.mjs tests/issues/github/adapter-update-close.test.mjs tests/issues/github/fixtures/writes.mjs
git commit -m "feat(task-management): update, close and link issues on the GitHub board"
```

### Task 13: Claim lease [specialist: none]

**Charter capability:** GitHub Claim Lease
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 12
**Files:**
- Modify: `lib/issues/github-adapter.mjs` — `claim`, `release`
- Test: `tests/issues/github/claim.test.mjs`

**Tests:** `tests/issues/github/claim.test.mjs` — create (BEH-21 – BEH-25)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { replayExec } from "./replay-transport.mjs";
import { claims } from "./fixtures/claims.mjs";
import { createTempDir } from "../../helpers.mjs";
const manifest = (settle = 0) => ({ tasks: { backend: "github", claim_ttl_minutes: 240, github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board", claim_settle_ms: settle } } });
const NOW = Date.parse("2026-11-26T10:00:00.000Z"); // claims.mjs fixtures are built with this clock
const make = (fx) => { const exec = replayExec(fx); return { a: new GithubAdapter(createTempDir(), manifest(), { exec, now: () => NOW, sleep: async () => {} }), exec }; };

test("(a) competing claim on a live lease → ISSUE_ALREADY_CLAIMED", async () => {
  await assert.rejects(make(claims.liveLease).a.claim("gh-5", "agent-b"), (e) => e.code === "ISSUE_ALREADY_CLAIMED" && e.owner === "agent-a");
});
test("(b) lost before first re-read → throw, nothing further written", async () => {
  const { a, exec } = make(claims.lostBeforeReread);
  await assert.rejects(a.claim("gh-5", "agent-b", { branch: "feat/x" }), { code: "ISSUE_ALREADY_CLAIMED" });
  assert.equal(exec.calls.filter((c) => c.operation === "SetFields").length, 1); // only the claim write
});
test("(c) lost within the settle interval → throw", async () => {
  await assert.rejects(make(claims.lostDuringSettle).a.claim("gh-5", "agent-b"), { code: "ISSUE_ALREADY_CLAIMED" });
});
test("(d) owner write fails after claimed_at → unclaimed + GITHUB_WRITE_FAILED", async () => {
  const { a } = make(claims.ownerWriteFails);
  await assert.rejects(a.claim("gh-5", "agent-b"), { code: "GITHUB_WRITE_FAILED" });
  assert.equal((await a.get("gh-5")).owner, undefined);
});
test("(e) stale lease takeover returns the json-shaped takeover object; status unchanged", async () => {
  const item = await make(claims.staleLease).a.claim("gh-5", "agent-b");
  assert.deepEqual(Object.keys(item.takeover).sort(), ["previous_claimed_at", "previous_owner", "ttl_minutes"]);
  assert.equal(item.status, "open");
});
test("legacy IDs on claim: unknown → NOT_FOUND, ambiguous → GITHUB_AMBIGUOUS_LEGACY_ID", async () => {
  await assert.rejects(make(claims.migratedBoard).a.claim("issue-zzzzzz", "agent-b"), { code: "NOT_FOUND" });
  await assert.rejects(make(claims.migratedBoard).a.claim("epic-2", "agent-b"), { code: "GITHUB_AMBIGUOUS_LEGACY_ID" });
});
test("release clears owner before claimed_at", async () => {
  const { a, exec } = make(claims.release);
  await a.release("gh-5", "agent-a");
  assert.deepEqual(exec.calls.find((c) => c.operation === "ClearFields").variables.order, ["owner", "claimed_at"]);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/github/claim.test.mjs`
Expected: FAIL — `a.claim is not a function`

- [ ] **Implement**

Fresh read (bypass the board cache) → `requireClaimable(issue, owner, { ttlMs: this.claimTtlMinutes * 60_000, now: this.now() })`; `claimed_at` is `new Date(this.now()).toISOString()`; the settle wait is `await this.sleep(claim_settle_ms)` (default `setTimeout`-based) → one request with aliases `claimed_at` then `owner` → re-read → `setTimeout(claim_settle_ms)` → re-read → only then `branch` / `pr`. "Rollback" means abstention (review CON-4): a lost claimant writes nothing further and does not restore the winner's `claimed_at`, which it may have overwritten; both stamps lie inside the race window, and Task 22 documents this. `release`: `requireReleasable`, then clear `owner`, then `claimed_at` (two aliased mutations in that order, in one request).

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/claim.test.mjs && node --test tests/issues/claim.test.mjs tests/issues/claim-ttl.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/github-adapter.mjs tests/issues/github/claim.test.mjs tests/issues/github/fixtures/claims.mjs
git commit -m "feat(task-management): claim leases on the GitHub board via write and re-read"
```

### Task 14: Read-only sentinel, adapter guard, and beads sentinel commit [specialist: none]

**Charter capability:** Migration to GitHub
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** — (the sentinel format is confirmed by `agent-reliable-state-artifacts` charter revision 9, commit 983e01ad; see the prerequisites table)
**Files:**
- Create: `lib/issues/read-only-sentinel.mjs`. It exports:
  - `sentinelPath(storageRoot, backend)`: `json` and `file` → `.context-index/tasks/board-read-only.json`; `beads` → `.beads/adev-read-only.json`.
  - `writeSentinel(storageRoot, backend, { project })`.
  - `readSentinel(storageRoot, backend)`: returns `null`, the parsed five-key object, or `{ malformed: true }`.
  - `assertWritable(storageRoot, backend)`.
  - `commitSentinel(storageRoot)`: the beads-board commit (migration amendment BEH-8).
- Modify: `lib/issues/json-adapter.mjs`, `lib/issues/beads-adapter.mjs`. Every write method calls `assertWritable` before touching storage.
- Not modified: `lib/issues/file-adapter.mjs` (GitHub spec BEH-33, review RI-2).
- Test: `tests/issues/read-only-sentinel.test.mjs`

**Tests:** `tests/issues/read-only-sentinel.test.mjs`, created by this task (BEH-32 sentinel, BEH-33; migration amendment BEH-8 commit, BEH-12 containment)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, symlinkSync, mkdirSync, unlinkSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { writeSentinel, readSentinel, assertWritable, sentinelPath, commitSentinel } from "../../lib/issues/read-only-sentinel.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { FileAdapter } from "../../lib/issues/file-adapter.mjs";

const PROJECT = "https://github.com/orgs/acme/projects/7";
const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

// A main repo whose .beads/ is a linked worktree of an orphan beads-board branch,
// the topology lib/issues/board-worktree.mjs provisions.
function beadsRepo() {
  const dir = createTempDir();
  git(["init", "-q", "-b", "main"], dir);
  git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "root"], dir);
  git(["worktree", "add", "-q", "--orphan", "-b", "beads-board", ".beads"], dir);
  const beads = join(dir, ".beads");
  git(["config", "user.email", "t@t"], beads); git(["config", "user.name", "t"], beads);
  writeFileSync(join(beads, "issues.jsonl"), "");
  git(["add", "--", "issues.jsonl"], beads); git(["commit", "-q", "-m", "board"], beads);
  return dir;
}

test("json board: sentinel blocks writes, leaves board files byte-identical, reads still work", async () => {
  const dir = createTempDir();
  try {
    const a = new JsonAdapter(dir); await a.init(dir); await a.create({ title: "x" });
    const before = readFileSync(join(dir, ".context-index/tasks/tasks.json"));
    writeSentinel(dir, "json", { project: PROJECT });
    assert.deepEqual(readFileSync(join(dir, ".context-index/tasks/tasks.json")), before);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(sentinelPath(dir, "json"), "utf8"))).sort(), ["migrated_at", "project", "reason", "schema", "target"]);
    await assert.rejects(a.create({ title: "y" }), (e) => e.code === "BOARD_READ_ONLY_MIGRATED" && /projects\/7/.test(e.message));
    assert.equal((await a.list({})).length, 1);
  } finally { cleanupTempDir(dir); }
});

test("fail-closed: unparseable or unknown-schema sentinel blocks writes and reads back as malformed", () => {
  const dir = createTempDir();
  try {
    mkdirSync(join(dir, ".context-index/tasks"), { recursive: true });
    const p = sentinelPath(dir, "json");
    for (const body of ["{not json", JSON.stringify({ schema: 2, reason: "migrated", target: "github", project: PROJECT, migrated_at: "2026-11-26T00:00:00Z" })]) {
      writeFileSync(p, body);
      assert.deepEqual(readSentinel(dir, "json"), { malformed: true });
      assert.throws(() => assertWritable(dir, "json"), { code: "BOARD_READ_ONLY_MIGRATED" });
    }
  } finally { cleanupTempDir(dir); }
});

test("SENTINEL_PATH_UNSAFE: symlink at the sentinel path, or .beads resolving outside the root", () => {
  const dir = createTempDir();
  const other = createTempDir();
  try {
    mkdirSync(join(dir, ".context-index/tasks"), { recursive: true });
    writeFileSync(join(other, "x.json"), "{}");
    symlinkSync(join(other, "x.json"), sentinelPath(dir, "json"));
    assert.throws(() => writeSentinel(dir, "json", { project: PROJECT }), { code: "SENTINEL_PATH_UNSAFE" });
    assert.throws(() => readSentinel(dir, "json"), { code: "SENTINEL_PATH_UNSAFE" });
    symlinkSync(other, join(dir, ".beads"));
    assert.throws(() => writeSentinel(dir, "beads", { project: PROJECT }), { code: "SENTINEL_PATH_UNSAFE" });
  } finally { cleanupTempDir(dir); cleanupTempDir(other); }
});

test("file adapter is unchanged: writes keep throwing BACKEND_READ_ONLY_DEPRECATED with a sentinel present", async () => {
  const dir = createTempDir();
  try {
    writeSentinel(dir, "file", { project: PROJECT });
    await assert.rejects(new FileAdapter(dir).create({ title: "y" }), { code: "BACKEND_READ_ONLY_DEPRECATED" });
  } finally { cleanupTempDir(dir); }
});

test("commitSentinel: one pathspec-limited commit on beads-board, pre-staged files untouched, idempotent, never pushed", () => {
  const dir = beadsRepo();
  try {
    const beads = join(dir, ".beads");
    writeFileSync(join(beads, "staged.txt"), "s"); git(["add", "--", "staged.txt"], beads);
    const mainHead = git(["rev-parse", "main"], dir);
    writeSentinel(dir, "beads", { project: PROJECT });
    assert.equal(commitSentinel(dir).committed, true);
    assert.equal(git(["log", "-1", "--name-only", "--format="], beads), "adev-read-only.json");
    assert.match(git(["diff", "--cached", "--name-only"], beads), /staged\.txt/);
    assert.equal(git(["rev-parse", "main"], dir), mainHead);
    const head = git(["rev-parse", "HEAD"], beads);
    assert.deepEqual(commitSentinel(dir), { committed: false, alreadyCommitted: true });
    assert.equal(git(["rev-parse", "HEAD"], beads), head);
  } finally { cleanupTempDir(dir); }
});

test("commitSentinel refuses with MIGRATE_SENTINEL_COMMIT_FAILED: wrong branch, plain tracked .beads/, gitignored sentinel", () => {
  for (const setup of ["wrong-branch", "plain-dir", "ignored"]) {
    const dir = setup === "plain-dir" ? createTempDir() : beadsRepo();
    try {
      if (setup === "plain-dir") {
        git(["init", "-q", "-b", "main"], dir);
        mkdirSync(join(dir, ".beads"));
      }
      const beads = join(dir, ".beads");
      if (setup === "wrong-branch") git(["switch", "-q", "-c", "other"], beads);
      if (setup === "ignored") { writeFileSync(join(beads, ".gitignore"), "adev-read-only.json\n"); git(["add", "--", ".gitignore"], beads); git(["commit", "-q", "-m", "ignore"], beads); }
      writeSentinel(dir, "beads", { project: PROJECT });
      assert.throws(() => commitSentinel(dir), (e) =>
        e.code === "MIGRATE_SENTINEL_COMMIT_FAILED" &&
        e.message.includes(join(realpathSync(dir), ".beads", "adev-read-only.json")) &&
        e.message.includes("beads-board"));
      if (setup === "plain-dir") assert.throws(() => git(["rev-parse", "HEAD"], dir)); // nothing was committed on main
    } finally { cleanupTempDir(dir); }
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/read-only-sentinel.test.mjs`
Expected: FAIL (module not found)

- [ ] **Implement**

- **Format owner:** `agent-reliable-state-artifacts` charter revision 9, section "Read-only board sentinel document schema". The content is exactly `{ schema: 1, reason: "migrated", target: "github", project, migrated_at }`, and nothing else is written (review CON-3 / BD-5).
- **Paths:**
  - Resolved under `resolveStorageRoot()` with `resolveContained()` against `safeRealpath(storageRoot)`.
  - A not-yet-existing sentinel is contained when the realpath of its parent directory is inside the root, so a `.beads` symlink that leaves the root fails.
  - An `lstat` symlink at the sentinel path throws `SENTINEL_PATH_UNSAFE`. This applies to write and read alike (review BD-2).
- **Write:**
  - Temp file plus `renameSync` in the same directory.
  - No board file is ever read-modify-written.
  - `writeSentinel` never overwrites an existing sentinel. The migration's BEH-12 check has already decided what to do with it.
- **Fail-closed read:** `readSentinel` returns `{ malformed: true }` in four cases: unparseable JSON, a `schema` other than `1`, `reason`/`target` outside their closed sets, or any key outside the five. `assertWritable` throws `BOARD_READ_ONLY_MIGRATED` for any present sentinel (review BD-6). A parsed sentinel's message names `project`. A malformed one says "an unreadable read-only sentinel".
- **`commitSentinel(storageRoot)`:**
  - **Git invocation:** every call is `execFileSync("git", [...args], { cwd: <root>/.beads, stdio: "pipe" })`, an argv array with `--` before every pathspec, the same mechanism as `lib/issues/board-worktree.mjs`.
  - **Steps, in order:**
    1. `git rev-parse --show-toplevel` must be realpath-equal to `<root>/.beads`. This means `.beads/` is its own worktree and not a plain directory of the main checkout (migration review BD-3, GitHub spec BEH-32).
    2. `git rev-parse --abbrev-ref HEAD` must be `beads-board`.
    3. **Already committed:** `git ls-files --error-unmatch -- adev-read-only.json` exits 0 **and** `git diff --quiet HEAD -- adev-read-only.json` exits 0. In that case return `{ committed: false, alreadyCommitted: true }`. Tracking is checked directly, never inferred from an empty `git status --porcelain`. That command is also empty for a gitignored, untracked file (migration review BD-2).
    4. `git add -- adev-read-only.json`. A gitignored path makes this exit non-zero, and the task never passes `-f`.
    5. `git commit -m "chore(issues): retire beads board, migrated to GitHub" -- adev-read-only.json`. The pathspec keeps anything else staged out of the commit. It never passes `--no-verify` and never pushes.
  - **Any failure:** a failed check or a non-zero git exit throws `MIGRATE_SENTINEL_COMMIT_FAILED`. The message names:
    - the absolute sentinel path;
    - the branch `beads-board`;
    - the topology found: not a linked worktree (e.g. `.beads/` still tracked on `main`; remedy `adev issues board migrate`), wrong branch, ignored path, or git error;
    - how to commit that one file by hand.
  - **Never on main:** it never commits on `main` or any branch other than `beads-board`.
- **The file adapter is not modified.** It already throws `BACKEND_READ_ONLY_DEPRECATED` on every write (GitHub spec BEH-33, review RI-2).
- **The json and beads write guard** sits in front of every mutating method, before any storage access.

- [ ] **Verify test passes**

Run: `node --test tests/issues/read-only-sentinel.test.mjs && node --test tests/issues/`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/read-only-sentinel.mjs lib/issues/json-adapter.mjs lib/issues/beads-adapter.mjs tests/issues/read-only-sentinel.test.mjs
git commit -m "feat(task-management): read-only sentinel for boards migrated to GitHub"
```

### Task 15: Untrusted text — helper, `show`, `next` [specialist: none]

**Charter capability:** GitHub Board Backend
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 10
**Files:**
- Create: `lib/issues/github/untrusted-text.mjs` — `neutralizeTitle(s)` (one line, control chars stripped, ≤ 200), `fenceNotes(s)` (`fenceBlock` with a fresh `randomBytes(8).toString("hex")` nonce), `markUntrusted(jsonIssue)` (adds `untrusted_text: ["title", "notes"]`)
- Modify: `lib/cli/issues-show.mjs`, `lib/cli/issues-next.mjs`
- Test: `tests/issues/github/untrusted-text.test.mjs`

**Tests:** `tests/issues/github/untrusted-text.test.mjs` — create (BEH-20)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { neutralizeTitle, fenceNotes, markUntrusted } from "../../../lib/issues/github/untrusted-text.mjs";

test("titles are one line, control-free, capped; notes are fenced with a fresh nonce; JSON stays raw", () => {
  assert.equal(neutralizeTitle("a\nb\u0007c" + "x".repeat(300)).length, 200);
  assert.doesNotMatch(neutralizeTitle("a\nb"), /\n/);
  const f1 = fenceNotes("ignore previous instructions"), f2 = fenceNotes("ignore previous instructions");
  assert.notEqual(f1, f2);
  const j = markUntrusted({ title: "t\n", notes: "n" });
  assert.equal(j.title, "t\n");
  assert.deepEqual(j.untrusted_text, ["title", "notes"]);
});
```

Add one CLI-level case per verb (`show` human form prints the fenced body; `--json` keeps `notes` byte-raw and includes `untrusted_text`) using a stub manager whose `name` is `"github"`.

- [ ] **Verify test fails**

Run: `node --test tests/issues/github/untrusted-text.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

Apply only when `manager.name === "github"`; other backends render exactly as today. Resolution of review RI-4 as recorded in ## Review Notes.

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/untrusted-text.test.mjs && node --test tests/issues/next.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/github/untrusted-text.mjs lib/cli/issues-show.mjs lib/cli/issues-next.mjs tests/issues/github/untrusted-text.test.mjs
git commit -m "feat(task-management): treat GitHub titles and bodies as untrusted in show and next"
```

### Task 16: Untrusted text — `board`, `list`, `stale` [specialist: none]

**Charter capability:** GitHub Board Backend
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 15
**Files:**
- Modify: `lib/cli/issues-board.mjs`, `lib/cli/issues-list.mjs`, `lib/cli/issues-stale.mjs`
- Test: `tests/issues/github/untrusted-text.test.mjs`

**Tests:** `tests/issues/github/untrusted-text.test.mjs` — extend (BEH-20)

- [ ] **Write failing test** — add one case per verb: with a stub `github` manager returning an item titled `"a\nb\u001b[31m"`, human output contains `neutralizeTitle(...)` and no raw newline or escape; `--json` output keeps the raw title and carries `untrusted_text`.
- [ ] **Verify test fails** — Run: `node --test tests/issues/github/untrusted-text.test.mjs` — Expected: FAIL on the three new cases
- [ ] **Implement** — route title rendering through `neutralizeTitle` and JSON items through `markUntrusted` when `manager.name === "github"`. These five verbs are the complete renderer set this spec owns (BEH-20); bugfix-loop prompt assembly belongs to the bridge amendment.
- [ ] **Verify test passes** — Run: `node --test tests/issues/github/untrusted-text.test.mjs && node --test tests/issues/` — Expected: PASS
- [ ] **Commit**

```bash
git add lib/cli/issues-board.mjs lib/cli/issues-list.mjs lib/cli/issues-stale.mjs tests/issues/github/untrusted-text.test.mjs
git commit -m "feat(task-management): treat GitHub titles as untrusted in board, list and stale"
```

### Task 17: `adev issues github setup` [specialist: none]

**Charter capability:** GitHub Project Setup
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 10
**Files:**
- Create: `lib/issues/github/setup.mjs` — `REQUIRED_FIELDS`, `RECOMMENDED_BOARD`, `checkProject(snapshot, config, ctx)` → `{ fields[], drift[], ok }`, `planWrites(check)` → `{ create[], skipped[] }`
- Create: `lib/cli/issues-github.mjs` — `run({ projectRoot, argv, manifest })`, `help()`; flags `--check`, `--dry-run`, `--yes`, `--json`
- Modify: `lib/cli/issues.mjs` — `github` dispatcher branch
- Modify: `.context-index/specs/features/task-management/charter.md` — interface row for `setup`: exit 0 when ready (drift is a warning), add `--yes` (review RI-3)
- Test: `tests/issues/github/setup.test.mjs`

**Tests:** `tests/issues/github/setup.test.mjs` — create (BEH-26, BEH-27, BEH-28)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../../../lib/cli/issues-github.mjs";
import { replayExec } from "./replay-transport.mjs";
import { setupFx } from "./fixtures/setup.mjs";

const manifest = { tasks: { backend: "github", github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" } } };
const runWith = (fx, argv, opts = {}) => run({ projectRoot: "/tmp/unused", argv, manifest, exec: replayExec(fx), isTTY: false, ...opts });

test("--check and --dry-run never mutate", async () => {
  for (const argv of [["setup", "--check"], ["setup", "--dry-run"]]) {
    const exec = replayExec(setupFx.emptyProject);
    await run({ projectRoot: "/tmp/unused", argv, manifest, exec, isTTY: false });
    assert.equal(exec.calls.filter((c) => c.query.trimStart().startsWith("mutation")).length, 0, argv.join(" "));
  }
});

test("--check reports every drift category and exits 0 when fields are complete", async () => {
  const out = [];
  const code = await runWith(setupFx.completeWithDrift, ["setup", "--check", "--json"], { log: (s) => out.push(s) });
  assert.equal(code, 0);
  const kinds = new Set(JSON.parse(out.join("")).drift.map((d) => d.kind));
  for (const k of ["closed-mapped-open", "unmapped-status", "subissue-not-on-project", "owner-without-claimed-at", "invalid-field-value", "unknown-module-label"]) assert.ok(kinds.has(k), k);
});

test("non-interactive without --yes refuses before any write; --yes creates exactly the recommended board", async () => {
  assert.equal(await runWith(setupFx.emptyProject, ["setup"]), 1);
  const exec = replayExec(setupFx.emptyProjectCreate);
  await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes"], manifest, exec, isTTY: false });
  assert.deepEqual(exec.calls.filter((c) => c.operation === "CreateField").map((c) => c.variables.name).sort(),
    ["Branch", "Claimed At", "Legacy ID", "Next Action", "Owner", "PR", "Plan", "Priority", "Spec", "Status"].sort());
});

test("existing options: only missing ones added; nothing deleted, renamed, or cleared", async () => {
  const exec = replayExec(setupFx.partialOptions);
  await run({ projectRoot: "/tmp/unused", argv: ["setup", "--yes"], manifest, exec, isTTY: false });
  assert.ok(exec.calls.every((c) => !/delete|archive|clearProjectV2ItemFieldValue/i.test(c.query)));
});
```

- [ ] **Verify test fails** — Run: `node --test tests/issues/github/setup.test.mjs` — Expected: FAIL, module not found
- [ ] **Implement** — `--yes` is read only from argv (never config, never a prior run; `--auto` does not imply it). The complete write set is printed once before any write. Where adding an option would require replacing the field's option set in a way that could clear item values, skip it and print the manual step. `SETUP_CONFIRMATION_REQUIRED` on non-interactive without `--yes`. Preflight failures (BEH-28) propagate their codes and write nothing.
- [ ] **Verify test passes** — Run: `node --test tests/issues/github/setup.test.mjs` — Expected: PASS
- [ ] **Commit**

```bash
git add lib/issues/github/setup.mjs lib/cli/issues-github.mjs lib/cli/issues.mjs .context-index/specs/features/task-management/charter.md tests/issues/github/setup.test.mjs tests/issues/github/fixtures/setup.mjs
git commit -m "feat(task-management): add adev issues github setup with the recommended board"
```

### Task 18: Migration core: pre-write checks, ordered copy, `legacy_id`, replay, resume, abort envelope [specialist: none]

**Charter capability:** Migration to GitHub
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 13, Task 14 (`readSentinel` for the BEH-12 check), Task 17, Task 25 (its fixtures assume `Legacy ID` is the first aliased mutation). The backend-migration amendment is review-passed (see the prerequisites table).
**Contract:** `backend-migration-rev-3-github-target.spec.md` ("the amendment") BEH-1, BEH-2, BEH-4 (resume-argument checks), BEH-5 (steps 1–6 and the abort envelope), BEH-6, BEH-10, BEH-11 and BEH-12, plus GitHub spec BEH-29 and BEH-30, including BEH-30's unanchored-item record and `MIGRATE_UNANCHORED_ITEM` (GitHub spec rev 5). Task 19 owns the rest: BEH-5 steps 7–8, BEH-3, BEH-7, BEH-8 and BEH-9.
**Files:**
- Create: `lib/issues/github/migrate.mjs`
  - `migrateToGithub({ projectRoot, storageRoot, manifest, source, includeClosed, dryRun, resume, confirm, out, exec, now, sleep })` returns the verb's exit code.
  - It builds the target adapter itself as `new GithubAdapter(storageRoot, manifest, { exec, now, sleep })`, never through `getIssueManager()` (amendment BEH-10).
  - This replaces the earlier `migrateToGithub({ source, target, scope, log })` sketch, which had no `exec`/`now`/`sleep` and owned `log` (migration review RI-4). `log` belongs to `run()` and reaches this module only inside `out`.
  - `createGithubOutput({ log, env })` returns `{ stdout(obj), stderr(line) }`. Both pass every string through `redact(s, [env.GH_TOKEN, env.GITHUB_TOKEN])` from `lib/issues/github/errors.mjs`. `stderr` is the only `console.error` call in the module. It is the single stderr chokepoint for the github path (migration review WR-8, RI-6).
  - Keep the literal `console.error(` out of comments in this module: the chokepoint test counts its occurrences.
  - `echoValue(s)` caps an echoed board-supplied value at 80 characters and escapes every C0/C1 control character as `\uXXXX`.
- Modify: `lib/cli/issues-migrate.mjs`
  - `run({ projectRoot, argv, manifest, exec, isTTY, readLine, sleep, now, log })`: all six seams are optional with production defaults (amendment BEH-10). The dispatcher `lib/cli/issues.mjs` still passes none of them.
  - `parseArgs()` and `help()` accept `--yes` ("Confirm a github migration's write set without prompting."), a boolean that takes no value. It is not recorded in `scope_args`.
  - Dispatch of `--to github`, the reordered checks, and the github-only strict scope check in `loadResumeState()`.
- Modify: `lib/gitignore-paths.mjs` and `.gitignore`: register `.context-index/tasks/.migrate-unanchored.json` next to `.migrate-state.json`. `tests/lib/gitignore-paths-dogfood.test.mjs` checks that the two stay in parity.
- Modify: `lib/issues/github/errors.mjs`: `redact()` gains the credential pattern `/(authorization:\s*(?:bearer|token)\s+)\S+/gi` → `$1[REDACTED]` (amendment BEH-6 (c)).
- Test: `tests/issues/github/migrate.test.mjs`
- Fixtures: `tests/issues/github/fixtures/migrate.mjs`
  - `seedJsonBoard(dir)`;
  - `migrateFx.{fresh, failsAtItem2, resumeFromItem2, partialCreateAtItem2, unanchoredAtItem2, completeUnanchored, unanchoredClosed, foreignLegacyId, duplicateLegacyId, outOfScopeLegacyId, emptyLegacyId, allPresent, secretInError}`. `partialCreateAtItem2` fails at a step after the SetFields request that carries `Legacy ID` (e.g. AddLabels), so its `unwritten` excludes `legacy_id`; `unanchoredAtItem2` fails in AddToProject, so its `unwritten` includes `legacy_id`.

**Tests:** `tests/issues/github/migrate.test.mjs`, created by this task (GitHub spec BEH-29, BEH-30; amendment BEH-1, BEH-2, BEH-4, BEH-5, BEH-6, BEH-10, BEH-11, BEH-12)
**Why not split:** copy, replay and resume share one idempotency key (`legacy_id`) and one fixture sequence, and the ordered pre-write checks gate all three. Splitting would test resume without the copy that produces its state.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../../lib/cli/issues-migrate.mjs";
import { redact } from "../../../lib/issues/github/errors.mjs";
import { echoValue } from "../../../lib/issues/github/migrate.mjs";
import { writeSentinel, sentinelPath } from "../../../lib/issues/read-only-sentinel.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";
import { replayExec } from "./replay-transport.mjs";
import { migrateFx, seedJsonBoard } from "./fixtures/migrate.mjs";

const PROJECT = "https://github.com/orgs/acme/projects/7";
const STATE = ".context-index/tasks/.migrate-state.json";
const MUTATIONS = new Set(["CreateIssue", "AddProjectItem", "SetFields", "AddSubIssue", "AddBlockedBy", "CloseIssue"]);
const noWait = { sleep: async () => {}, now: () => 0 };

async function migrate(dir, manifest, argv, fx, extra = {}) {
  const out = [], err = [];
  const exec = replayExec(fx);
  const origErr = console.error;
  console.error = (s) => err.push(String(s));
  try {
    const code = await run({ projectRoot: dir, argv, manifest, exec, isTTY: false, log: (s) => out.push(s), ...noWait, ...extra });
    return { code, exec, stdout: out.join(""), stderr: err };
  } finally { console.error = origErr; }
}
const mutations = (exec) => exec.calls.filter((c) => MUTATIONS.has(c.operation)).map((c) => [c.operation, c.variables]);

test("json → github through the real verb: parents first, replay after, legacy_id on every item, seams reach the adapter", async () => {
  const dir = createTempDir();
  try {
    const manifest = await seedJsonBoard(dir); // epic e1, feature e1.f1 (dep on issue-7k3f9a), issue-7k3f9a
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh);
    assert.equal(r.code, 0);
    assert.equal(r.exec.calls[0].operation, "Preflight"); // built with the injected exec, not via getIssueManager()
    const ops = r.exec.calls.map((c) => c.operation);
    assert.ok(ops.lastIndexOf("CreateIssue") < ops.indexOf("AddSubIssue"));
    assert.equal(r.exec.calls.filter((c) => c.operation === "SetFields" && "legacy_id" in c.variables.fields).length, 3);
    assert.deepEqual(Object.keys(JSON.parse(r.stdout).github.id_map).sort(), ["e1", "e1.f1", "issue-7k3f9a"]);
  } finally { cleanupTempDir(dir); }
});

test("re-run after interruption: with or without .migrate-state.json, the identical mutation sequence and no duplicate", async () => {
  const seqs = [];
  for (const dropState of [false, true]) {
    const dir = createTempDir();
    try {
      const manifest = await seedJsonBoard(dir);
      await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.failsAtItem2);
      if (dropState) rmSync(join(dir, STATE), { force: true });
      const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.resumeFromItem2);
      assert.equal(r.code, 0);
      assert.equal(r.exec.calls.filter((c) => c.operation === "CreateIssue").length, 2);
      seqs.push(mutations(r.exec));
    } finally { cleanupTempDir(dir); }
  }
  assert.deepEqual(seqs[0], seqs[1]);
});

test("abort envelope: per-item failure → exit 1, Live-Run shape with { source_id, code, message }, one MIGRATE_PARTIAL_FAILURE: stderr line", async () => {
  const dir = createTempDir();
  try {
    const manifest = await seedJsonBoard(dir);
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.failsAtItem2);
    assert.equal(r.code, 1);
    const report = JSON.parse(r.stdout);
    assert.equal("code" in report, false);
    assert.equal(report.manifest_update_suggested, false);
    assert.equal(report.errors.length, 1);
    assert.equal(report.errors[0].code, "GITHUB_WRITE_FAILED");
    assert.equal(report.errors[0].source_id, "e1.f1");
    assert.equal(typeof report.errors[0].message, "string");
    assert.equal(r.stderr.filter((l) => l.startsWith("MIGRATE_PARTIAL_FAILURE:")).length, 1);
    assert.ok(existsSync(join(dir, STATE)));
  } finally { cleanupTempDir(dir); }
});

test("partial create after the Legacy ID write: envelope carries target_id and unwritten_fields; a re-run without the state file completes it", async () => {
  const dir = createTempDir();
  try {
    const manifest = await seedJsonBoard(dir);
    const p = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.partialCreateAtItem2);
    const e = JSON.parse(p.stdout).errors[0];
    assert.equal(e.code, "GITHUB_PARTIAL_CREATE");
    assert.match(e.target_id, /^gh-\d+$/);
    assert.ok(Array.isArray(e.unwritten_fields) && !e.unwritten_fields.includes("legacy_id"));
    assert.equal(existsSync(join(dir, ".context-index/tasks/.migrate-unanchored.json")), false);
    rmSync(join(dir, STATE), { force: true });
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.resumeFromItem2);
    assert.equal(r.code, 0);
    assert.equal(r.exec.calls.filter((c) => c.operation === "CreateIssue").length, 1); // only the item after e1.f1
  } finally { cleanupTempDir(dir); }
});

test("pre-write ordering (BEH-5 steps 1–2): github→github is NOOP, github source refused, resume checks run before preflight", async () => {
  const dir = createTempDir();
  try {
    const manifest = await seedJsonBoard(dir);
    let r = await migrate(dir, manifest, ["--from", "github", "--to", "github"], migrateFx.fresh);
    assert.ok(r.code !== 0 && r.stderr.some((l) => l.startsWith("MIGRATE_NOOP")) && r.exec.calls.length === 0);
    r = await migrate(dir, manifest, ["--from", "github", "--to", "json"], migrateFx.fresh);
    assert.ok(r.code === 1 && r.stderr.some((l) => l.startsWith("MIGRATE_GITHUB_UNAVAILABLE")) && r.exec.calls.length === 0);
    mkdirSync(join(dir, ".context-index/tasks"), { recursive: true });
    const state = JSON.stringify({ source: "json", target: "github", last_successful_index: 0, scope_args: { includeClosed: true } });
    writeFileSync(join(dir, STATE), state);
    for (const argv of [["--to", "github", "--yes"], ["--to", "github", "--dry-run"]]) {
      r = await migrate(dir, manifest, argv, migrateFx.fresh);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.some((l) => l.startsWith("MIGRATE_RESUME_MISMATCH") && /true/.test(l) && /false/.test(l)));
      assert.equal(r.exec.calls.length, 0);
      assert.equal(readFileSync(join(dir, STATE), "utf8"), state);
    }
    writeFileSync(join(dir, STATE), JSON.stringify({ source: "json", target: "github", last_successful_index: 0, scope_args: {} }));
    r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh);
    assert.ok(r.code === 1 && r.stderr.some((l) => l.startsWith("MIGRATE_RESUME_INVALID")));
  } finally { cleanupTempDir(dir); }
});

test("legacy_id provenance (BEH-11): foreign and duplicate refused before any write; out-of-scope and empty values pass", async () => {
  for (const [fx, code] of [[migrateFx.foreignLegacyId, "MIGRATE_TARGET_FOREIGN_LEGACY_ID"], [migrateFx.duplicateLegacyId, "GITHUB_AMBIGUOUS_LEGACY_ID"]]) {
    for (const extraArg of [[], ["--dry-run"]]) {
      const dir = createTempDir();
      try {
        const manifest = await seedJsonBoard(dir);
        const r = await migrate(dir, manifest, ["--to", "github", "--yes", ...extraArg], fx);
        assert.equal(r.code, 1);
        assert.ok(r.stderr.some((l) => l.startsWith(code)));
        if (code === "MIGRATE_TARGET_FOREIGN_LEGACY_ID") assert.ok(r.stderr.some((l) => l.includes("issue-zzzz99")));
        assert.equal(mutations(r.exec).length, 0);
        assert.equal(existsSync(join(dir, STATE)), false);
        assert.equal(existsSync(sentinelPath(dir, "json")), false);
      } finally { cleanupTempDir(dir); }
    }
  }
  for (const fx of [migrateFx.outOfScopeLegacyId, migrateFx.emptyLegacyId]) {
    const dir = createTempDir();
    try {
      const manifest = await seedJsonBoard(dir);
      assert.equal((await migrate(dir, manifest, ["--to", "github", "--yes"], fx)).code, 0);
    } finally { cleanupTempDir(dir); }
  }
  assert.equal(echoValue("a\u001b[31mb\nc"), "a\\u001b[31mb\\u000ac");
  assert.equal(echoValue("x".repeat(200)).length <= 81, true);
});

test("existing sentinel (BEH-12): another project or unreadable → MIGRATE_SENTINEL_PROJECT_MISMATCH, byte-identical, no mutation", async () => {
  for (const body of [null, "{not json"]) {
    const dir = createTempDir();
    try {
      const manifest = await seedJsonBoard(dir);
      if (body === null) writeSentinel(dir, "json", { project: "https://github.com/orgs/other/projects/1" });
      else writeFileSync(sentinelPath(dir, "json"), body);
      const before = readFileSync(sentinelPath(dir, "json"));
      const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.fresh);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.some((l) => l.startsWith("MIGRATE_SENTINEL_PROJECT_MISMATCH") && l.includes(PROJECT)));
      assert.equal(mutations(r.exec).length, 0);
      assert.deepEqual(readFileSync(sentinelPath(dir, "json")), before);
    } finally { cleanupTempDir(dir); }
  }
});

test("redaction (BEH-6): no secret reaches stdout or stderr", async () => {
  const dir = createTempDir();
  const saved = process.env.GH_TOKEN;
  process.env.GH_TOKEN = "fixture-token-12345";
  try {
    const manifest = await seedJsonBoard(dir);
    // the fixture's error message embeds GH_TOKEN, a ghp_ token, a github_pat_ token and "Authorization: bearer abc.def"
    const r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.secretInError);
    const all = r.stdout + r.stderr.join("\n");
    for (const s of ["fixture-token-12345", "ghp_", "github_pat_", "abc.def"]) assert.equal(all.includes(s), false, s);
    assert.ok(all.includes("[REDACTED]"));
  } finally {
    if (saved === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = saved;
    cleanupTempDir(dir);
  }
  assert.equal(redact("Authorization: token s3cr3t-value"), "Authorization: token [REDACTED]");
});

test("single stderr chokepoint and no configurable seams (WR-8, BEH-10)", () => {
  const src = readFileSync("lib/issues/github/migrate.mjs", "utf8");
  assert.equal(src.match(/console\.error\(/g).length, 1);
  for (const f of ["lib/cli/issues-migrate.mjs", "lib/issues/github/migrate.mjs"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /process\.env\.[A-Z_]*(EXEC|TTY|SLEEP|READLINE|LOG)/);
  }
});

test("unanchored window (GitHub spec BEH-14, BEH-30): recorded, completed exactly, refused when unverifiable", async () => {
  const UNANCHORED = ".context-index/tasks/.migrate-unanchored.json";
  const dir = createTempDir();
  try {
    const manifest = await seedJsonBoard(dir);
    let r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.unanchoredAtItem2);
    assert.equal(r.code, 1);
    const rec = JSON.parse(readFileSync(join(dir, UNANCHORED), "utf8"));
    assert.equal(rec.source_id, "e1.f1");
    assert.match(rec.target_id, /^gh-\d+$/);
    assert.ok(r.stderr.some((l) => l.includes(rec.target_id) && /do not delete/i.test(l)));
    r = await migrate(dir, manifest, ["--to", "github", "--yes"], migrateFx.completeUnanchored);
    assert.equal(r.code, 0);
    assert.equal(r.exec.calls.filter((c) => c.operation === "CreateIssue").length, 1); // only the item after e1.f1
    assert.equal(Object.keys(r.exec.calls.find((c) => c.operation === "SetFields").variables.fields)[0], "legacy_id");
    assert.equal(existsSync(join(dir, UNANCHORED)), false);
  } finally { cleanupTempDir(dir); }
  const dir2 = createTempDir();
  try {
    const manifest = await seedJsonBoard(dir2);
    await migrate(dir2, manifest, ["--to", "github", "--yes"], migrateFx.unanchoredAtItem2);
    for (let i = 0; i < 2; i += 1) {
      const r = await migrate(dir2, manifest, ["--to", "github", "--yes"], migrateFx.unanchoredClosed);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.some((l) => l.startsWith("MIGRATE_UNANCHORED_ITEM") && l.includes("e1.f1")));
      assert.equal(mutations(r.exec).length, 0);
    }
  } finally { cleanupTempDir(dir2); }
});
```


- [ ] **Verify test fails**

Run: `node --test tests/issues/github/migrate.test.mjs`
Expected: FAIL (`--to github` still refused with `MIGRATE_GITHUB_UNAVAILABLE`; `--yes` rejected by `parseArgs()`)

- [ ] **Implement**

1. **Steps 1–2 of BEH-5 in `run()`, in this order, before any adapter is built:**
   - **Source/target refusals.**
     - `source === opts.to` runs **before** the github refusal, so `--from github --to github` exits with `MIGRATE_NOOP`. Today `MIGRATE_GITHUB_UNAVAILABLE` fires first, at `lib/cli/issues-migrate.mjs:917-944` (migration review RI-2).
     - `MIGRATE_GITHUB_UNAVAILABLE` then fires only when the source is `github` and the target is not.
     - The `MIGRATE_TARGET_READONLY` clause for `file` stays (migration review RI-7).
   - **Resume-argument checks.** For a github target, `loadResumeState({ ..., strictScope: true })` runs immediately after the refusals, on live runs and `--dry-run` alike. Today it runs only on the live path, after both board reads and after the dry-run early return, at `:999-1033` (migration review RI-1). The checks, in order:
     - an unparseable file → `MIGRATE_RESUME_INVALID`;
     - a `source`/`target` mismatch → `MIGRATE_RESUME_MISMATCH`;
     - `scope_args.includeClosed` missing or not a boolean → `MIGRATE_RESUME_INVALID`;
     - `scope_args.includeClosed !== opts.includeClosed` → `MIGRATE_RESUME_MISMATCH`. The message names both values and both remedies (re-run with the recorded scope, or delete the state file).
   - **json and beads** keep today's warn-and-continue (`strictScope` false), at today's position.
2. **Steps 3–6 in `migrateToGithub()`:**
   - **Step 3:** preflight and the `setup --check` gate through the adapter's transport (`GITHUB_FIELD_MISSING` names `Legacy ID`).
   - **Step 4:** the source read. Read once with `includeClosed: true`, then filter to scope, so the BEH-11 source ID set covers every status. Then the target-board read.
   - **Step 4b, unanchored record** (GitHub spec BEH-30). This step is read-only. It runs immediately after the target-board read and before provenance.
     - Read `<storageRoot>/.context-index/tasks/.migrate-unanchored.json`. Apply the sentinel's realpath and symlink rules (Task 14) to that path.
     - Validate `source_id` as a non-gh `parseId()` ID and `target_id` as a canonical gh ID before using them.
     - When the record exists, re-read `target_id`:
       - **Verified** (an open issue in the home repo whose `Legacy ID` is empty or equals `source_id`): plan to complete that exact issue. Add it to the project when it is missing, write `Legacy ID` first, then the unwritten fields. Never create a new issue for `source_id`.
       - **Not verified:** exit 1 with `MIGRATE_UNANCHORED_ITEM`, naming both IDs and both remedies (set `Legacy ID` by hand, or close the issue and delete the file).
     - `--dry-run` reads the record and neither writes nor removes the file. This task passes it on to the dry-run path; the `github` dry-run report that shows it is emitted by Task 19.
     - This check is not in the amendment's BEH-5 order. Its position is recorded here and flagged as an amendment follow-up (review CON-4 / RI-4).
   - **Step 5:** `legacy_id` provenance.
     - Group target items by non-empty `legacy_id`. Values held by more than one item → `GITHUB_AMBIGUOUS_LEGACY_ID` naming the items.
     - Values not in the source ID set → `MIGRATE_TARGET_FOREIGN_LEGACY_ID`. The message names up to 10 values and the total, and says each source board needs its own project.
     - Empty values are ignored.
     - Every echoed value goes through `echoValue()`. A value that does not parse under `parseId()` as a non-gh ID is echoed only in its escaped form (migration review BD-5).
   - **Step 6:** `storageRoot = resolveStorageRoot(manifest, projectRoot)`, then `readSentinel(storageRoot, source)`:
     - absent → continue with `sentinelPresent = false`;
     - `project` byte-equal to `tasks.github.project` → continue with `sentinelPresent = true`;
     - otherwise, including `{ malformed: true }` → `MIGRATE_SENTINEL_PROJECT_MISMATCH`, naming the recorded project (or "unreadable") and the target project, and saying only removing the sentinel by hand un-retires the board;
     - `SENTINEL_PATH_UNSAFE` propagates.
   - **Output:** every step 1–6 failure prints `<CODE>: <message>` through `out.stderr` and exits 1. It emits no envelope, writes no state file and writes no sentinel.
3. **Confirmation hook:** `confirm(writeSet)` is supplied by `run()`. In this task it returns `opts.yes`, and `false` makes the verb exit 1 with `MIGRATE_CONFIRMATION_REQUIRED`. Task 19 replaces it with the full BEH-3 step (write-set disclosure, `isTTY`/`readLine`, the sentinel qualifier) and adds the progress line (step 7).
4. **Copy:**
   - In-scope items in base order, parents before children, sequentially.
   - An item whose ID is already a target `legacy_id` is skipped, and finished if it is partial (GitHub spec BEH-14, BEH-30). Every other item is created with every BEH-13 field plus `Legacy ID`.
   - After each item, whether created, finished or skipped, `last_successful_index` advances and `.migrate-state.json` is written with the existing atomic writer (migration review WR-9).
   - After every item exists, sub-issue parents and dependencies are replayed, skipping links already present.
   - A replay-phase failure leaves the index at M−1.
   - Title matching is never used.
5. **Abort envelope:** the first per-item or write-phase `GITHUB_*` error stops the run.
   - **stdout:** one base Live-Run report through `out.stdout`, with `manifest_update_suggested: false` and `errors: [{ source_id, code, message }]`.
     - `GITHUB_PARTIAL_CREATE` adds `target_id` (the error's `id`) and `unwritten_fields` (its `unwritten`), as Task 11 names them (migration review RI-5).
     - `GITHUB_RATE_LIMITED` adds `reset_at` from `resetAt`. Task 19 exercises that case.
   - **stderr:** exactly one `MIGRATE_PARTIAL_FAILURE: <code> at <source_id>` line.
   - **Exit:** 1.
   - The json and beads paths keep today's `{ id, index, stderr }` entries and their two stderr lines (migration review RI-3).
   - **Unanchored window** (GitHub spec BEH-14, BEH-30). When the stop is a `GITHUB_PARTIAL_CREATE` whose `unwritten` includes `legacy_id`:
     - Write `{ source_id, target_id }` to `.migrate-unanchored.json` by atomic temp-rename, before the envelope.
     - The stderr line also names the issue and says not to delete that file.
     - The file is removed only once that item completes on a later run.
     - It is independent of `.migrate-state.json`. The amendment's BEH-4 schema for that file, and its "deleting it changes nothing" rule, are unchanged.
     - Register the file in `lib/gitignore-paths.mjs` next to `.migrate-state.json` (review CON-4).
6. **Success:** every item and link is present. In this task, success prints the Live-Run report with `errors: []`, `manifest_update_suggested: true`, and `github: { project, id_map }`, removes the state file, and exits 0. Task 19 inserts the sentinel write and commit before the report, and the stderr summary after it.
7. **Redaction:** add the `Authorization:` pattern to `redact()`. Route every github-path string through `createGithubOutput()`. Neither module calls `console.log` or `console.error` outside it.
8. **Existing tests:** run `grep -n "MIGRATE_UNKNOWN_BACKEND\|MIGRATE_GITHUB_UNAVAILABLE\|--to" tests/` and update any existing migrate test whose expectation changes. Count with the grep first; more than 8 means split.

- [ ] **Verify test passes**

Run: `node --test tests/issues/github/migrate.test.mjs && node --test tests/lib/cli-issues-migrate.test.mjs && npm test -- --test-name-pattern migrate`
Expected: PASS. The existing json → beads and beads → json migrate tests pass unchanged, including the json/beads scope-mismatch `warning:` line.

- [ ] **Commit**

```bash
git add lib/issues/github/migrate.mjs lib/issues/github/errors.mjs lib/cli/issues-migrate.mjs lib/gitignore-paths.mjs .gitignore tests/issues/github/migrate.test.mjs tests/issues/github/fixtures/migrate.mjs
git commit -m "feat(task-management): migrate a json or beads board to GitHub"
```

### Task 19: Migration: confirmation, progress line, dry-run, pacing, sentinel write and commit, manifest suggestion [specialist: none]

**Charter capability:** Migration to GitHub
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 14, Task 18. It also modifies the write path shipped by Tasks 11–13 in `lib/issues/github-adapter.mjs` (`_mutate`, `_createItem`), so run it on the branch that carries that write path. In this worktree the adapter still has only the read path.
**Contract:** amendment BEH-3, BEH-4 (progress line), BEH-5 steps 7–8, BEH-7, BEH-8, BEH-9 and BEH-10 (`isTTY`, `readLine`, `sleep`, `now`), plus GitHub spec BEH-31, BEH-32, BEH-35 and BEH-41.
**Files:**
- Modify: `lib/issues/github/migrate.mjs`
  - Progress line and cross-check.
  - Write-set disclosure.
  - Dry-run `github` object.
  - Pacing and rate-limit waits.
  - Success path: sentinel write, beads `commitSentinel`, then the stdout report and stderr summary.
- Modify: `lib/issues/github-adapter.mjs` (shipped in Tasks 9–13). This is where pacing lives.
  - **Why the adapter:** the transport's `request()` is synchronous (`execFileSync`), so it cannot await the async `sleep` seam. Pacing therefore sits in the adapter's `_mutate()`, which runs inside async methods.
  - **Constructor:** gains one optional, non-seam option, `pace: { minIntervalMs, maxSingleWaitMs, maxWaits, maxTotalWaitMs }`. It is the fixed BEH-35 policy and is never read from argv, the environment or the manifest.
    - `migrateToGithub()` builds `new GithubAdapter(storageRoot, manifest, { exec, now, sleep, pace: MIGRATION_PACE })`, with `MIGRATION_PACE = { minIntervalMs: 1000, maxSingleWaitMs: 300000, maxWaits: 5, maxTotalWaitMs: 900000 }`.
    - The seams are still exactly amendment BEH-10's `exec`, `now` and `sleep`.
  - **`_mutate()`:** becomes `async`, and `_createItem`, `update`, `close`, `addDependency`, `claim` and `release` `await` it.
  - **With `pace` set:** `_mutate()` does three things:
    1. awaits `this._sleep(...)` until `this._now() >= lastMutationAt + minIntervalMs`;
    2. issues the request;
    3. on `GITHUB_RATE_LIMITED`, waits when `resetAt - now <= maxSingleWaitMs`, waits < `maxWaits`, and the total wait stays within `maxTotalWaitMs`. It sleeps until `resetAt` and re-issues **the identical request**. Each rate-limit response consumes one wait, and the counters live on the adapter instance (one per run).
    Beyond the bounds it throws the `GITHUB_RATE_LIMITED`. Inside `create()` after the issue exists, that surfaces as `GITHUB_PARTIAL_CREATE` with `causeCode: "GITHUB_RATE_LIMITED"`, and the envelope entry then also carries `reset_at`.
  - **With `pace` unset** (every non-migration caller): behavior is unchanged. `_mutate()` makes no wait and no retry, and every read and write still throws `GITHUB_RATE_LIMITED` (GitHub spec BEH-35).
  - **Scope:** only mutation operations are paced. Reads go through the transport unchanged.
- Modify: `lib/cli/issues-migrate.mjs`
  - The full BEH-3 confirmation step built from `isTTY`, `readLine` and `--yes` / `--auto`. It replaces Task 18's `confirm` hook.
  - The production `readLine` default: one line from `process.stdin`, resolving `null` on EOF.
- Modify: `tests/issues/github/fixtures/migrate.mjs`
  - `seedBeadsBoard(dir)`: a temp repo whose `.beads/` is a linked worktree on `beads-board`, as in Task 14's test.
  - Fixtures `rateLimited(resetInMs)` and `allPresent`.
- Test: `tests/issues/github/migrate-safety.test.mjs`

**Tests:** `tests/issues/github/migrate-safety.test.mjs`, created by this task (GitHub spec BEH-31, BEH-32, BEH-35, BEH-41; amendment BEH-3, BEH-4, BEH-7, BEH-8, BEH-9)
**Why not split:** the confirmation decision depends on the sentinel's presence and on the write set the progress line and dry run also compute, and the success path writes and commits that same sentinel. Pacing is the remaining piece, and it shares the fixture board and the injected `now`/`sleep` with every other case here. Splitting would duplicate the fixture sequence across two suites that must agree.

- [ ] **Write failing test.** Each case runs through `run()` with injected `exec` (`replayExec`), `isTTY`, `readLine`, `sleep`, `now` and `log`. stderr is captured by replacing `console.error`, as in Task 18's `migrate()` helper. "No mutation" means no operation from Task 18's `MUTATIONS` set appears in `exec.calls`.
  1. **Dry run.** `--dry-run --to github` behaves as follows:
     - It exits 0 with no mutation, no `.migrate-state.json`, no sentinel and no new git commit.
     - It asks for no confirmation; `readLine` is never called.
     - stdout is one JSON report with every base Dry-Run key (`already_migrated` counted by `legacy_id`) plus `github.{project, repository, visibility.{project,repository}, would_create_ids, parent_links_to_replay, would_publish.{titles,notes}, estimated_requests}`.
     - With a state file present it still prints the `resuming:` line. It neither writes nor removes `.migrate-unanchored.json`.
  2. **Non-interactive refusal.**
     - With `isTTY: false` and no `--yes`, the run exits 1 with `MIGRATE_CONFIRMATION_REQUIRED`, and the message names `--yes`.
     - The same holds for `--auto` without `--yes`.
     - In both cases there is no mutation, no state file and no sentinel.
  3. **Interactive confirmation.** With `isTTY: true`:
     - `readLine` returning `"n"` exits 1 with `MIGRATE_CONFIRMATION_REQUIRED`, with no mutation.
     - `null` (EOF) does the same.
     - `" YES "` proceeds.
     - A resume run with work left and a sentinel for this project already on disk, with `isTTY: true` and `"y"`, prints a sentinel line containing "present" and "unchanged", and leaves the sentinel byte-identical.
     - The write set appears on stderr exactly once, before the prompt. It names the target project and repository with their visibility, the item and link counts, the titles and notes to publish, and the sentinel path. For a beads source it also says the verb will commit that one file on `beads-board`, and that `--yes` covers that commit and the repository's commit hooks (migration review BD-4).
  4. **Nothing left to do, sentinel present.**
     - The `allPresent` fixture with a sentinel for this project on disk, `isTTY: false`, no `--yes`: the run exits 0 without prompting, issues no mutation, and leaves the sentinel byte-identical.
     - A beads source whose sentinel exists but is uncommitted gets it committed without a prompt. The amendment's BEH-3 accepts the file as the consent proxy given by the run that created it (migration review BD-1).
  5. **Nothing left to do, sentinel absent.**
     - The same fixture with no sentinel, `isTTY: false`, no `--yes`: the run exits 1 with `MIGRATE_CONFIRMATION_REQUIRED` and leaves no sentinel. The write set shows zero items and zero links and names the sentinel.
     - With `--yes` the run exits 0 and writes the sentinel.
  6. **Progress line** (amendment BEH-4). Both lines come before the write set.
     - **Agreeing state file:** `failsAtItem2` fails at `e1.f1`, the second item in the order `e1`, `e1.f1`, `issue-7k3f9a`. Only `e1` completes, so `last_successful_index` is 0 and the board holds one `legacy_id`. The re-run with `resumeFromItem2` prints `resuming: 1 of M already migrated` and no `warning:` line.
     - **Disagreeing state file:** after `partialCreateAtItem2`, the board holds two `legacy_id` matches (`e1` and `e1.f1`). A state file edited to `last_successful_index: 0` against that board prints `resuming: 1 of M already migrated` and then `warning: .migrate-state.json records 1 of M migrated but the target board holds 2; the target board decides what is skipped`. The run still exits 0 with the same mutation sequence.
     - **No state file:** there is no `resuming:` line.
  7. **Pacing** (BEH-35).
     - Consecutive mutation requests are at least 1000 ms apart, measured on the injected `now`, with the waits recorded on the injected `sleep`. No two are in flight at once.
     - Real time for the test advances by less than one second.
     - A rate limit on AddToProject in the middle of an item is waited and AddToProject is re-issued. The item completes with no `GITHUB_PARTIAL_CREATE`.
     - An adapter built without `pace` (as `getIssueManager()` builds it) throws `GITHUB_RATE_LIMITED` on the first limit and never calls `sleep`.
  8. **Rate-limit bounds** (BEH-35, amendment BEH-9).
     - A reset at most 5 minutes away is waited on `sleep`.
     - The 6th wait, or cumulative waiting over 15 minutes, or a reset more than 5 minutes away, stops the run with exit 1 and the BEH-5 envelope.
     - The envelope's `errors[0]` is `{ source_id, code: "GITHUB_RATE_LIMITED", message, reset_at }`, where `reset_at` equals the error's `resetAt`.
     - The same bounds apply under `--auto`.
  9. **Success, json source** (amendment BEH-8).
     - `.context-index/tasks/board-read-only.json` holds exactly the five charter-rev-9 keys.
     - Every pre-existing board file is byte-identical.
     - stdout is one report with `errors: []`, `manifest_update_suggested: true` and `github.{project, sentinel_path, id_map}`. `id_map` covers every in-scope source ID.
     - stderr has, in order: one `<source id> → <gh id>` line per item; one sentinel line that says to commit the file on the branch that carries the board; and, as the last line, `manifestUpdateSuggestion("github")`.
     - `.migrate-state.json` is gone.
     - `manifest.yaml` is byte-identical with and without `--auto`.
     - `git log` shows no new commit.
     - Run with `projectRoot` set to a linked worktree of the test repo, the sentinel lands under the main checkout's `.context-index/tasks/` (`resolveStorageRoot()`).
  10. **Success, beads source** (`seedBeadsBoard`).
      - `.beads/adev-read-only.json` is written.
      - `git -C .beads log -1 --name-only` shows one new commit touching only that file.
      - A file staged in `.beads/` before the run is still staged and not in the commit.
      - The remote-tracking ref is unchanged, and `main` has no new commit.
      - The sentinel stderr line says the file was committed on `beads-board` and to push it with the next board sync.
  11. **Beads commit failure.**
      - With `.beads/` switched to another branch, the run exits 1 with `MIGRATE_SENTINEL_COMMIT_FAILED`. The message names the absolute sentinel path and `beads-board`. The sentinel exists uncommitted, stdout has no success report, and the state file is kept.
      - After switching back to `beads-board`, a re-run with `isTTY: false` and no `--yes` commits the file and exits 0.
  12. **Unsafe sentinel.**
      - A symlink at the sentinel path stops the run with `SENTINEL_PATH_UNSAFE` before any mutation (Task 18's BEH-12 check).
      - **Sentinel write failure after the copy.** Wrap the injected `exec` in the test, keeping its `.calls`. After the last replayed mutation returns, the wrapper creates a non-empty directory at the sentinel path, so `renameSync` fails whatever the user, including root. The run exits 1 with no success report and keeps the GitHub items and the state file. Remove the directory, then a re-run needs confirmation before it writes the sentinel.
  13. **The guard after migration** (GitHub spec BEH-33).
      - After the json success above, `create()` on a `JsonAdapter` for the same storage root throws `BOARD_READ_ONLY_MIGRATED` naming the project, and `list()` still returns the items.
      - After the beads success, `assertWritable(storageRoot, "beads")` throws `BOARD_READ_ONLY_MIGRATED`.
  14. **Redaction on non-error lines** (migration review WR-8).
      - With `GH_TOKEN` set to an 8+-character fixture value, a fixture whose project title contains that value and a `ghp_` token makes the write set and the success summary print `[REDACTED]`.
      - Neither secret appears in the captured stdout or stderr.
- [ ] **Verify test fails** — Run: `node --test tests/issues/github/migrate-safety.test.mjs` — Expected: FAIL (no write set, no `readLine` prompt, no sentinel, no pacing)
- [ ] **Implement.** Every string goes through Task 18's `createGithubOutput()`.
  1. **Progress line** (BEH-5 step 7). Print it after the step-6 sentinel check, when a state file exists and passed Task 18's checks:
     - N = `last_successful_index + 1`; M = the in-scope count.
     - B = the in-scope source IDs found as target `legacy_id` values.
     - Print `resuming: N of M already migrated`. When B ≠ N, follow it with the `warning:` line, and continue in both cases.
     - This also runs on `--dry-run`.
  2. **Write set** (BEH-5 step 8, amendment BEH-3).
     - The run has a write to make when any item is to be created or finished, any link replayed, any closed item closed, or the sentinel is absent.
     - **No write:** skip confirmation.
     - **Otherwise:** print the write set once.
       - **Sentinel line in the write set** (amendment BEH-3):
         - when the sentinel is absent, it gives the path it will create, plus the beads-board commit line for a beads source;
         - when the sentinel already exists for this project, it says the sentinel is present and will be left unchanged.
       - `--yes` proceeds.
       - Interactive (`isTTY === true` and no `--auto`): prompt `Proceed? [y/N] ` on stderr and `await readLine()`. Proceed only on `/^(y|yes)$/i` after trimming. Anything else, or `null`, exits 1 with `MIGRATE_CONFIRMATION_REQUIRED`.
       - Non-interactive without `--yes`: exit 1 with `MIGRATE_CONFIRMATION_REQUIRED`, naming `--yes`.
     - No local write happens before this point.
  3. **Dry run** (amendment BEH-7). Run checks 1–7, print the report with the `github` object, and exit 0. `estimated_requests` = preflight + board-read pages + mutations planned.
  4. **Pacing** (amendment BEH-9). Implement the adapter's optional `pace` policy exactly as described under Files: async `_mutate()`, a spacing wait on the injected `sleep`/`now`, and a bounded wait-and-re-issue of the identical request on `GITHUB_RATE_LIMITED`.
     - `migrateToGithub()` passes `pace: MIGRATION_PACE`.
     - A stop beyond the bounds uses the BEH-5 envelope.
     - Add a regression test that an adapter built without `pace` still throws `GITHUB_RATE_LIMITED` on the first limit with no `sleep` call.
  5. **Success** (amendment BEH-8), in this order:
     1. `writeSentinel(storageRoot, source, { project })` when absent. A present sentinel was checked in Task 18 and is left byte-identical.
     2. For a beads source, `commitSentinel(storageRoot)`.
     3. The stdout report.
     4. The stderr summary, sentinel line, then `manifestUpdateSuggestion("github")` as the last line.
     5. Remove `.migrate-state.json` and exit 0.
     - **Failures in step 1 or 2:** a write failure exits 1 with `SENTINEL_PATH_UNSAFE` or the I/O error's code, and a commit failure exits 1 with `MIGRATE_SENTINEL_COMMIT_FAILED`. Either prints no success report and keeps the state file.
     - The verb never writes `manifest.yaml` and never pushes.
- [ ] **Verify test passes** — Run: `node --test tests/issues/github/migrate-safety.test.mjs && node --test tests/issues/github/ && node --test tests/issues/read-only-sentinel.test.mjs` — Expected: PASS
- [ ] **Commit**

```bash
git add lib/issues/github/migrate.mjs lib/issues/github-adapter.mjs lib/cli/issues-migrate.mjs tests/issues/github/migrate-safety.test.mjs tests/issues/github/fixtures/migrate.mjs
git commit -m "feat(task-management): confirm, pace and seal migrations to GitHub"
```

### Task 20: Conformance suite and fixture recorder [specialist: none] [REQUIRES HUMAN STEP]

**Charter capability:** GitHub Conformance Suite
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 5, Task 13
**Files:**
- Create: `tests/issues/conformance/contract-cases.mjs` — `export function contractCases(makeManager)` registering the shared `IssueManager` cases (create/get/list/update/close guards/claim/release/addDependency/walkTree shape)
- Create: `tests/issues/conformance/json.conformance.test.mjs`, `tests/issues/conformance/github.conformance.test.mjs`, `tests/issues/conformance/github-differences.test.mjs`
- Create: `scripts/record-github-fixtures.mjs` — manual: runs the contract cases against a throwaway project with a recording `exec`; writes only beneath `tests/issues/conformance/fixtures/` resolved through `resolveContained()`; prefixes every title/body with `adev-fixture:`
- Create: `tests/issues/conformance/fixtures/**` — recorded responses (committed after the Task 5 fixture-lint passes)

**Tests:** `tests/issues/conformance/*.conformance.test.mjs` — create (BEH-37)
**Human step:** recording the github fixtures needs a live throwaway project and a token, which an agent must not hold. The task therefore lands in two commits: (1) the agent commits the shared cases, the json runner, the differences suite (which runs on the hand-built `fixtures/*.mjs` builders from Tasks 8–13 and needs no recording), and the recorder script; (2) after the maintainer runs the recorder, the agent adds `github.conformance.test.mjs` and the recorded fixtures in a second commit. The github runner file does not exist before commit (2), so the suite is never red and nothing is skipped silently. The task is complete only after commit (2).
**Why not split:** the json and github runners are two-line wrappers over one case list; the differences file is the documented complement of that list.

- [ ] **Write failing test** — `json.conformance.test.mjs`: `contractCases(() => new JsonAdapter(tmp))`; `github.conformance.test.mjs`: `contractCases(() => new GithubAdapter(tmp, manifest, { exec: replayExec(recorded) }))`; `github-differences.test.mjs`: ID shape, sub-issue `walkTree` (including a legacy ID resolved through `legacy_id`, review CON-5), status read mapping, UI-closed issue reads closed despite open children, delayed `branch`/`pr` write.
- [ ] **Verify test fails** — Run: `node --test tests/issues/conformance/` — Expected: FAIL, modules not found (commit 1); for commit 2, the github runner fails with `UNRECORDED_GITHUB_REQUEST` until the recorded fixtures are in place
- [ ] **Implement** — commit 1: write the cases, json runner, differences suite and recorder. Then **[HUMAN]** the maintainer records fixtures by hand: `GH_TOKEN=<test token> node scripts/record-github-fixtures.mjs --project <throwaway project URL> --repo <owner/repo>`. The recorder's containment is checked by code review, not a test (accepted manual-only, review WR-5). Run the fixture-lint test before committing fixtures.
- [ ] **Verify test passes** — Run: `node --test tests/issues/conformance/ && node --test tests/issues/github/fixture-lint.test.mjs` — Expected: PASS, no network
- [ ] **Commit**

```bash
# commit 1 (agent)
git add tests/issues/conformance/contract-cases.mjs tests/issues/conformance/json.conformance.test.mjs tests/issues/conformance/github-differences.test.mjs scripts/record-github-fixtures.mjs
git commit -m "test(task-management): shared IssueManager conformance cases and fixture recorder"
# commit 2 (agent, after the human step)
git add tests/issues/conformance/github.conformance.test.mjs tests/issues/conformance/fixtures
git commit -m "test(task-management): run the conformance suite against recorded GitHub fixtures"
```

### Task 21: `/adev:sync` Task Management block for github [specialist: none]

**Charter capability:** GitHub Board Backend
**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Modify: `skills/sync/SKILL.md` — add the `tasks.backend` is `"github"` case (board lives on the configured project; use `adev issues …` verbs; `gh-<n>` IDs; network required)
- Modify: `templates/constitution-template.md` — Task Management section lists `github`
- Create: `tests/sync/github-backend-block.test.mjs`

**Tests:** `tests/sync/github-backend-block.test.mjs` — create (review WR-1)

- [ ] **Write failing test** — assert `skills/sync/SKILL.md`'s Task Management block names the `github` case and that `templates/constitution-template.md` lists `github` among backends. Then the reader audit (the predicate for "every reader was checked", per the module heuristic): the test scans every `.mjs` file under `lib/` and `cli/` line by line, skips comment lines (`/^\s*(\/\/|\*|\/\*)/`), matches `/\btasks\??\.backend\b/` on the rest, and asserts the set of matching files equals the reviewed allowlist (comment-only mentions such as `lib/manifest.mjs`'s docblock and `lib/issues/beads-adapter.mjs`'s comments are excluded by the comment rule; string literals count as code) `{ lib/issues/registry.mjs, lib/cli/issues-migrate.mjs, lib/cli/issues-next.mjs, lib/cli/issues-claim.mjs, lib/cost-summary.mjs, lib/issues/file-adapter.mjs, cli/index.mjs }`, so a new reader fails the test until someone checks it against github.
- [ ] **Verify test fails** — Run: `node --test tests/sync/github-backend-block.test.mjs` — Expected: FAIL (no github case)
- [ ] **Implement** — markdown only; no inline Node in SKILL.md (constitution anti-pattern). Of the existing readers, only `cli/index.mjs:1199` is backend-specific (beads worktree provisioning) and correctly ignores github; `issues-next`, `cost-summary` and `issues-claim` only test presence or `typeof manager.claim`.
- [ ] **Verify test passes** — Run: `node --test tests/sync/github-backend-block.test.mjs && node --test tests/skills/` — Expected: PASS (including the SKILL.md size-cap test)
- [ ] **Commit**

```bash
git add skills/sync/SKILL.md templates/constitution-template.md tests/sync/github-backend-block.test.mjs
git commit -m "docs(task-management): sync the github backend into agent files"
```

### Task 22: Docs and docs-coverage test [specialist: none]

**Charter capability:** GitHub Board Backend
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 19, Task 20
**Applying this as a follow-up delta:** if an earlier version of Task 22 has already landed (with `EXTRA_CODES = ["GITHUB_SUBISSUE_CYCLE", "SENTINEL_PATH_UNSAFE"]` and only the GitHub spec's Error Cases codes), do not redo it. Apply only the missing parts as one follow-up commit (message below):
- the widened `EXTRA_CODES` list;
- the `docs/cli-reference.md` assertions;
- the troubleshooting entries for every code that is not documented yet;
- the docs for the unanchored-item record.

Today's spec rev 6 Error Cases table also gained rows for these codes, which the existing test picks up on its own:
- `GITHUB_SUBISSUE_CYCLE`
- `MIGRATE_UNANCHORED_ITEM`
- `SENTINEL_PATH_UNSAFE`
- `MIGRATE_SENTINEL_COMMIT_FAILED`
- `BACKEND_READ_ONLY_DEPRECATED`

**Files:**
- Modify: `docs/configuration.md`: every `tasks.github` key from BEH-2 with its default.
- Modify: `docs/troubleshooting.md`: every code in the spec's Error Cases table plus every `EXTRA_CODES` entry, each with its remedy. It also covers:
  - the sanctioned unlock for `BOARD_READ_ONLY_MIGRATED`: delete the sentinel only after confirming the migration is abandoned, and note that a malformed sentinel still blocks (review BD-6);
  - for a beads source, committing that deletion on `beads-board`;
  - the unanchored-item record `.context-index/tasks/.migrate-unanchored.json`: never delete it while the issue it names is unanchored, and the two remedies for `MIGRATE_UNANCHORED_ITEM`.
- Modify: `docs/cli-reference.md`: under `adev issues migrate`, the `--yes` flag ("Confirm a github migration's write set without prompting."), the `MIGRATE_UNKNOWN_BACKEND` text that now lists `SUPPORTED_BACKENDS` including `github`, and `MIGRATE_PARTIAL_FAILURE`'s github `errors[]` entry shape `{ source_id, code, message }`.
- Modify: `docs/concepts.md`:
  - backend comparison and the github differences;
  - the claim window and rollback-by-abstention (review CON-4);
  - the trust model: Project fields need project write, labels and issue types need triage, issue authors control only title and body (review BD-4);
  - the ADR 0016 relationship (review CON-2);
  - the `Legacy ID`-first write order and its residual window (GitHub spec BEH-13, BEH-14).
- Modify: `skills/issues/SKILL.md` only if `grep -nE "e1\.f|dotted" skills/issues/SKILL.md skills/plan/references/*.md` shows a dotted ID used as the sole example. Otherwise leave it unchanged and say so in the commit body.
- Create: `tests/docs/github-backend-docs.test.mjs`

**Tests:** `tests/docs/github-backend-docs.test.mjs`, created by this task (BEH-38)

- [ ] **Write failing test.** Parse the Error Cases table from `github-board-backend.spec.md` (third column, backticked codes) and the key list from BEH-2. Then add the declared plan-level extras. These are codes emitted by the migration amendment, the transport and the replay helper that the GitHub spec's own table does not carry:

```javascript
const EXTRA_CODES = [
  // GitHub spec, also in its rev 6 Error Cases table (listed so a stale table cannot drop them)
  "GITHUB_SUBISSUE_CYCLE", "SENTINEL_PATH_UNSAFE", "MIGRATE_SENTINEL_COMMIT_FAILED", "MIGRATE_UNANCHORED_ITEM",
  // backend-migration-rev-3-github-target.spec.md (Error Cases delta)
  "MIGRATE_RESUME_MISMATCH", "MIGRATE_RESUME_INVALID", "MIGRATE_TARGET_FOREIGN_LEGACY_ID",
  "MIGRATE_SENTINEL_PROJECT_MISMATCH", "MIGRATE_PARTIAL_FAILURE", "MIGRATE_GITHUB_UNAVAILABLE",
  // transport (Task 4) and replay helper (Task 5)
  "GITHUB_REQUEST_FAILED", "GITHUB_TRANSPORT_INTERNAL", "REPLAY_ANONYMOUS_DOCUMENT", "REPLAY_AMBIGUOUS_FIXTURE",
];
```

  - Assert that each code appears in `docs/troubleshooting.md` and each key in `docs/configuration.md`.
  - Assert that `docs/cli-reference.md`'s `adev issues migrate` section contains `--yes` and `MIGRATE_UNKNOWN_BACKEND`.
  - Assert that `docs/troubleshooting.md` names `.migrate-unanchored.json`.
  - The extras are docs-only additions, not a spec amendment.
  - Mark the two `REPLAY_*` codes as test-helper codes under a "Test fixtures" heading, so operators do not mistake them for runtime errors.
- [ ] **Verify test fails** — Run: `node --test tests/docs/github-backend-docs.test.mjs` — Expected: FAIL listing the missing codes, keys and cli-reference entries
- [ ] **Implement** — write the docs.
- [ ] **Verify test passes** — Run: `node --test tests/docs/github-backend-docs.test.mjs && npm test` — Expected: PASS
- [ ] **Commit**

```bash
git add docs/configuration.md docs/troubleshooting.md docs/cli-reference.md docs/concepts.md tests/docs/github-backend-docs.test.mjs
git commit -m "docs(task-management): document the github issue backend"
# follow-up delta variant, when an earlier Task 22 already landed:
# git commit -m "docs(task-management): document the github migration and transport error codes"
```

### Task 23: `/adev:plan` stops loudly on `GITHUB_PARTIAL_CREATE` [specialist: none]

**Charter capability:** GitHub Board Backend
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 11 (the code exists). It is independent of Tasks 18–22.
**Contract:** GitHub spec BEH-14 (rev 5, maintainer decision 2026-11-26)
- `/adev:plan`'s in-process `create()` calls never catch and continue. On `GITHUB_PARTIAL_CREATE` the mode:
  - stops;
  - reports the code, the new canonical ID and the unwritten fields;
  - creates no further items;
  - tells the operator to finish that item and re-run.
- There is no retry.
- `/adev:specify`'s Step 5.6 catch-log-continue is unchanged.
**Files:**
- Modify: `skills/plan/references/feature-mode.md` (the `create()` calls at about lines 38–48), `skills/plan/references/epic-mode.md` (about line 15) and `skills/plan/references/release-mode.md` (about lines 65–69). Each gets one prose paragraph after its create step. Markdown only: no inline Node, no fenced JavaScript directive (constitution anti-patterns).
- Not modified: `skills/plan/references/steps/step-7-execution-handoff.md`. Its `adev issues epic` call already exits 1 with the ID and unwritten fields (`lib/cli/issues-epic.mjs`).
- Not modified: `skills/specify/references/modes/standard-mode.md`.
- Test: `tests/skills/plan-partial-create-stop.test.mjs`

**Tests:** `tests/skills/plan-partial-create-stop.test.mjs`, created by this task (GitHub spec BEH-14 acceptance criterion)

- [ ] **Write failing test.** For each of the three mode files:
  - read the file and anchor on the first occurrence of the literal `create({`, then take the enclosing section (the lines from the nearest preceding heading or numbered step to the next one). In `release-mode.md` the Workspace-mode skip paragraph near line 27 ("Skip epic-board `create()` calls unconditionally") is **not** the target; the anchor `create({` skips it, landing on the calls at about lines 65 and 69;
  - assert that the section names `GITHUB_PARTIAL_CREATE` and says the mode stops, reports the ID and the unwritten fields, creates no further items, and does not retry. Use one regex per obligation, each matched case-insensitively.
  Also assert two things are unchanged:
  - `skills/specify/references/modes/standard-mode.md` still contains "do not block" in Step 5.6;
  - none of the three files gained a `node -e` or `Run inline Node` directive.
- [ ] **Verify test fails** — Run: `node --test tests/skills/plan-partial-create-stop.test.mjs` — Expected: FAIL (no mode names the code)
- [ ] **Implement** — add the paragraph to each file. It names `GITHUB_PARTIAL_CREATE`, the fields to report (the code, the canonical ID `id`, the `unwritten` list), the instruction to stop without creating further items, and the remedy: finish that item with `adev issues update` or on GitHub, then re-run.
- [ ] **Verify test passes** — Run: `node --test tests/skills/plan-partial-create-stop.test.mjs && node --test tests/skills/` — Expected: PASS, including the SKILL.md size-cap and no-inline-Node tests
- [ ] **Commit**

```bash
git add skills/plan/references/feature-mode.md skills/plan/references/epic-mode.md skills/plan/references/release-mode.md tests/skills/plan-partial-create-stop.test.mjs
git commit -m "docs(task-management): stop /adev:plan loudly on a partial GitHub create"
```

### Task 24: Realpath containment for `spec_ref` / `plan_ref` consumers [specialist: none]

**Charter capability:** GitHub Board Backend
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** — (applies to shipped code)
**Contract:** GitHub spec BEH-39, BEH-37 and BEH-32 (rev 5): containment is checked on the realpath, equivalent to `assertContained` in `lib/extensions/exec-payload.mjs`. The lexical `resolveContained()` alone is insufficient.
**Call sites, checked on the implement branch:**
- `lib/issues/github/` has no `resolveContained` call.
- The one shipped consumer that opens a board path is `lib/reality-check.mjs`. It calls `resolve(projectRoot, issue.plan_ref)` (about lines 432–433) and `resolve(projectRoot, issue.spec_ref)` (about lines 467–468) with **no** containment at all. Note the snake-case `plan_ref` it reads alongside `planRef` (review RI-1).
- The fixture recorder (Task 20) and the sentinel (Task 14) use realpath containment from the start. If Task 20 has already landed with `resolveContained()`, this task also converts `scripts/record-github-fixtures.mjs`.

**Files:**
- Modify: `lib/reality-check.mjs`
  - Both resolutions go through `assertContained(projectRoot, candidate)` from `lib/extensions/exec-payload.mjs`, or the equivalent `lenientRealpath` + `isContained` from `lib/path-safety.mjs` against `safeRealpath(projectRoot)`.
  - A refused or unresolvable path returns `{ completed: false, confidence: CONFIDENCE.NONE, reason: "<field> resolves outside the repository" }` and never reads the file.
- Modify (only if Task 20 has landed): `scripts/record-github-fixtures.mjs`
- Test: `tests/lib/reality-check-containment.test.mjs`

**Tests:** `tests/lib/reality-check-containment.test.mjs`, created by this task (GitHub spec BEH-39 acceptance criterion)

- [ ] **Write failing test.** In a temp repo:
  - add a directory symlink `docs/evil -> <outside temp dir>` and an outside file `spec.md` that the verifier would accept;
  - an issue with `spec_ref: "docs/evil/spec.md"` is reported not completed with the outside-repository reason, and the outside file is never opened (assert with a read counter, or by making the outside file unreadable);
  - the same holds for `plan_ref`;
  - a `spec_ref` of `../x.md` and a non-existent path are refused the same way;
  - a normal in-repo `spec_ref` still verifies.
  - If Task 20 has landed, add a recorder case: a symlinked `fixtures/` subdirectory pointing outside is refused.
- [ ] **Verify test fails** — Run: `node --test tests/lib/reality-check-containment.test.mjs` — Expected: FAIL (the symlinked path is followed)
- [ ] **Implement** — as above. Do not change `resolveContained()` itself: its many CLI-argument callers are lexical by design and out of scope.
- [ ] **Verify test passes** — Run: `node --test tests/lib/reality-check-containment.test.mjs && npm test -- --test-name-pattern reality` — Expected: PASS
- [ ] **Commit**

```bash
git add lib/reality-check.mjs tests/lib/reality-check-containment.test.mjs
git commit -m "fix(task-management): check spec_ref and plan_ref containment on the realpath"
```

### Task 25: `Legacy ID` first in `_createItem` [specialist: none]

**Charter capability:** Migration to GitHub
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 11 (shipped on the implement branch; `_planCreate` and `_createItem` are not in this worktree's adapter yet). Must land before Task 18.
**Contract:** GitHub spec BEH-13 and BEH-14 (rev 5).
- When `legacy_id` is set, it is the first aliased mutation of the first field-write request, immediately after AddToProject.
- A failure after that write leaves an item the next run finds by `legacy_id`.
- **Shipped state:** `_createItem` in `lib/issues/github-adapter.mjs` runs CreateIssue → AddToProject → one SetFields request. `_planCreate` builds `slots` starting with the status slot, then priority, then the text fields, so `legacy_id` comes late in that request.

**Files:**
- Modify: `lib/issues/github-adapter.mjs`
  - `_planCreate` places the `legacy_id` text slot first in `plan.slots` when it is present. The order of the remaining slots is unchanged.
  - `GITHUB_PARTIAL_CREATE`'s `unwritten` still lists every field of the failed request, including `legacy_id`. Partial application inside an aliased request is not inferred, which is conservative: Task 18's unanchored check then finds the issue verified by its `Legacy ID`.
- Modify: `tests/issues/github/fixtures/*.mjs`, the create-path recordings whose SetFields variable order changes.
- Test: `tests/issues/github/create-legacy-first.test.mjs`

**Tests:** `tests/issues/github/create-legacy-first.test.mjs`, created by this task (GitHub spec BEH-13 acceptance criterion)

- [ ] **Write failing test.** Through `replayExec`:
  - `create({ ..., legacy_id: "issue-7k3f9a" })` sends CreateIssue, then AddToProject, then a SetFields request whose first aliased mutation sets `Legacy ID`.
  - Without `legacy_id`, the SetFields order is unchanged from today.
  - A fixture that fails the SetFields request throws `GITHUB_PARTIAL_CREATE` with `unwritten` containing `legacy_id`.
  - A fixture that fails a later step (`AddSubIssue`) throws with `unwritten` not containing `legacy_id`.
- [ ] **Verify test fails** — Run: `node --test tests/issues/github/create-legacy-first.test.mjs` — Expected: FAIL (`legacy_id` is not first)
- [ ] **Implement** — reorder the slots; re-record or regenerate the affected hand-built fixtures.
- [ ] **Verify test passes** — Run: `node --test tests/issues/github/` — Expected: PASS
- [ ] **Commit**

```bash
git add lib/issues/github-adapter.mjs tests/issues/github/create-legacy-first.test.mjs tests/issues/github/fixtures
git commit -m "fix(task-management): write Legacy ID first when creating a migrated item"
```

### Task 26: Page bounds fixed from the first page [specialist: none]

**Charter capability:** GitHub Batched Reads
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 4, Task 9 (shipped)
**Contract:** GitHub spec BEH-10 (rev 6, review RI-2):
- **Item pages:** the bound is `ceil(totalCount / 100) + 1`, with `totalCount` taken from the first page and fixed for the read.
- **Continuations:** each sub-issue or blocked-by continuation is bounded on its own, by `totalCount` from that connection's embedded first page (which counts as page 1). Its pages never count toward the item-page bound.
- **Outcome:** a repeated cursor or an exceeded bound throws `GITHUB_PAGINATION_INVALID` with no partial result.
- **Shipped state:** `paginate()` in `lib/issues/github/transport.mjs` (about line 231) and `continueConnection()` in `lib/issues/github/board-read.mjs` (about line 47) both recompute `bound` from each page's own `totalCount`. Continuations are already separate from the item-page count and already throw on a repeated cursor.

**Files:**
- Modify: `lib/issues/github/transport.mjs`
  - `paginate()` computes `bound` once, from the first response.
  - A first page whose `totalCount` is not a non-negative safe integer throws `GITHUB_PAGINATION_INVALID` (review TR-2).
- Modify: `lib/issues/github/board-read.mjs`
  - `continueConnection()` computes `bound` once, from the embedded connection's `totalCount`, with the same integer check.
- Test: create `tests/issues/github/page-bound.test.mjs`. Existing `transport.test.mjs` cases that assert today's per-page bound are updated only if they break.

**Tests:** `tests/issues/github/page-bound.test.mjs`, created by this task (GitHub spec BEH-10 acceptance criterion)

- [ ] **Write failing test.**
  - A recorded item read whose `totalCount` grows by 100 on every response, with fresh cursors, throws `GITHUB_PAGINATION_INVALID` at page `ceil(first totalCount / 100) + 2`.
  - The same holds for a sub-issue continuation, measured against its embedded first page.
  - A first page with `totalCount: "250"` or `-1` throws immediately.
  - A normal 250-item read still issues exactly 3 item-page requests.
- [ ] **Verify test fails** — Run: `node --test tests/issues/github/page-bound.test.mjs` — Expected: FAIL (the growing `totalCount` never trips)
- [ ] **Implement** — hoist the bound out of the loop in both functions.
- [ ] **Verify test passes** — Run: `node --test tests/issues/github/` — Expected: PASS
- [ ] **Commit**

```bash
git add lib/issues/github/transport.mjs lib/issues/github/board-read.mjs tests/issues/github/page-bound.test.mjs
git commit -m "fix(task-management): fix GitHub page bounds from the first page"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test` (no network, no token — every GitHub interaction replays fixtures)
- Gates from `.context-index/governance/gates.yaml` (deterministic gates with commands; probabilistic gates noted as skipped)
- Boundaries (`.context-index/governance/boundaries.yaml`): no CommonJS (`no-commonjs`), no inline Node in skills (`no-inline-node-in-skills`), no hard-coded `~/.claude/`, no manual version bump
- No new npm dependency (`package.json` dependencies unchanged)
- All acceptance criteria in `github-board-backend.spec.md` satisfied
