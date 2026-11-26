<!-- partial_schema: plan@1 -->

# Implementation Plan: GitHub Board Backend

> **Methodology:** adev
> **Charter:** .context-index/specs/features/task-management/charter.md (revision 10)
> **Spec:** .context-index/specs/features/task-management/github-board-backend.spec.md (revision 2)
> **Review:** PASS_WITH_NOTES (2026-11-26) — 0 blockers, 17 warnings, 8 suggestions
> **Platform:** Node.js, JavaScript (pure ESM `.mjs`), `node:test`; optional external CLI `gh`
> **Implementation mode:** tdd
> **Risk / approval:** `risk_level: high`; human approval given by the maintainer on 2026-11-26. `require_hitl_approval` has no code consumer (tracked as `adev-plugin-03du`), so the approval is recorded here and in the plan commit.

**Goal:** Ship `tasks.backend: github` — a `GithubAdapter` implementing the unchanged `IssueManager` contract against GitHub Issues + Projects v2, with fail-fast preflight, `gh-<n>` IDs, write + re-read claims, the `adev issues github setup` verb, and `adev issues migrate --to github`.

**Architecture:** A new `lib/issues/github/` package holds pure, separately testable layers — `transport` (the only code that spawns `gh`, one fixed argv, values only as GraphQL variables on stdin), `config`, `preflight`, `decode` (field decoding + refuse-don't-sanitize predicates + status mapping), `queries`/`mutations` (constant GraphQL documents), `setup`, and `migrate` — composed by `lib/issues/github-adapter.mjs` and registered in `lib/issues/registry.mjs`, the same posture as `lib/issues/beads-adapter.mjs` over `br` and `lib/provider/tracker-providers/github-tracker-adapter.mjs` over `gh`. Every GitHub-touching test runs through an injected replay transport, so `npm test` needs no network or token.

### Prerequisites outside this plan

These are lifecycle artifacts, not implementation tasks. Tasks that depend on one say so in their **Depends on** line.

| Prerequisite | Why | Blocks |
|---|---|---|
| Amendment of `backend-migration.spec.md` (`/adev:specify --amend`) | `--to github` accepted; github resume semantics (BEH-30); confirmation + `--yes` (BEH-41, review RI-5); github aborts still emit `MIGRATE_PARTIAL_FAILURE` with the `GITHUB_*` code in `errors[]`, token redacted (review CON-1) | Tasks 18, 19 |
| Amendment of `tracker-provider-bridge.spec.md` | Bridge coexistence (charter rev 10); must test that a home-repo `gh-<n>` item with a reserved `module:` label is classified fail-closed (review WR-3) | Bridge work only — no task here |
| ADR 0016 amendment: opt-in external board carve-out | ADR 0016 (Proposed) makes `.context-index/` the sole system of record for the board (review CON-2) | Merge of this branch |
| `agent-reliable-state-artifacts` confirmation of the read-only sentinel format (BEH-32) | Spec precondition; owner of board state-file formats (review CON-3) | Task 14 |

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
- Spec: BEH-32 (sentinel), BEH-33
- Charter: capability **Migration to GitHub**
- Source files: `lib/issues/resolve-root.mjs`, `lib/path-safety.mjs`, `lib/issues/file-adapter.mjs:25-40`
- Review notes: RI-2, CON-3, BD-2 (see ## Review Notes)

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
- Spec: BEH-29, BEH-30
- Charter: capability **Migration to GitHub**
- Source files: `lib/cli/issues-migrate.mjs` (full), `.context-index/specs/features/task-management/backend-migration.spec.md` (+ its amendment)
- Review notes: CON-1 (see ## Review Notes)

### Task 19 Context
- Spec: BEH-31, BEH-32, BEH-35, BEH-41
- Charter: capability **Migration to GitHub**
- Source files: `lib/cli/issues-migrate.mjs:700-830`
- Review notes: RI-5 (see ## Review Notes)

### Task 20 Context
- Spec: BEH-37
- Charter: capability **GitHub Conformance Suite**
- Source files: `tests/issues/claim.test.mjs`, `tests/issues/unified-create.test.mjs` (signatures — contract cases to lift)

### Task 21 Context
- Spec: Behavioral Contract; review WR-1
- Source files: `skills/sync/SKILL.md:45-90`, `templates/constitution-template.md` (Task Management section), `.context-index/specs/features/task-management/constitution-sync.spec.md` (Error Cases)
- Review notes: WR-1 (see ## Review Notes)

### Task 22 Context
- Spec: BEH-38, BEH-22 (claim window), Error Cases table
- Source files: `docs/configuration.md`, `docs/troubleshooting.md`, `docs/concepts.md`
- Review notes: CON-2, BD-4 (docs part) (see ## Review Notes)

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
- Group E (sequential): Task 7 → Task 9 → Task 10 → Task 11 → Task 12 → Task 13 → Task 15 → Task 16 → Task 17 → Task 18 → Task 19 → Task 20 → Task 22

Groups A, B, C and D can run in parallel. Group E starts only after Groups A and B complete (Task 7 needs Tasks 4 and 6; Task 9 needs Tasks 5 and 8), and Task 19 additionally needs Task 14.

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
| 14 | Read-only sentinel and adapter guard | small | unit | — | 1 create, 2 modify |
| 15 | Untrusted text: helper, `show`, `next` | small | unit | Task 10 | 1 create, 2 modify |
| 16 | Untrusted text: `board`, `list`, `stale` | small | unit | Task 15 | 0 create, 3 modify |
| 17 | `adev issues github setup` | medium | unit | Task 10 | 2 create, 2 modify |
| 18 | Migration core: ordered copy, `legacy_id`, replay, resume | large | unit | Task 13, Task 17, backend-migration amendment | 1 create, 1 modify |
| 19 | Migration: confirmation, dry-run, pacing, sentinel, manifest suggestion | medium | unit | Task 14, Task 18 | 0 create, 2 modify |
| 20 | Conformance suite and fixture recorder | large | unit | Task 13, Task 5 | 4 create, 0 modify |
| 21 | `/adev:sync` Task Management block for github | small | unit | — | 1 create, 2 modify |
| 22 | Docs and docs-coverage test | small | unit | Task 19, Task 20 | 1 create, 4 modify |

## Review Notes

> Carried forward from the PASS_WITH_NOTES review (`.context-index/specs/features/task-management/github-board-backend.review.md`). Each open warning is assigned to the first task that touches the spec section it cites; warnings with no cited section are assigned to the task whose work they concern (the verb returned `section: null` for them because the review report cites them by behavior in prose).

| ID | Warning | Cited section | Assigned to |
|----|---------|---------------|-------------|
| CON-1 | Github migration aborts vs `MIGRATE_PARTIAL_FAILURE` / ADR 0014 passthrough vs token redaction | — | Task 18 |
| CON-2 | ADR 0016 makes `.context-index/` the sole board system of record | — | Task 22 (docs) + prerequisite ADR amendment |
| CON-3 | Beads sentinel lives in the `beads-board` worktree — committed or local-only? | — | Task 14 |
| CON-4 | "Rollback" vs "abstention"; loser's `claimed_at` overwrite | — | Task 13 |
| RI-1 | `/adev:plan` uses `createEpic`, not `create()`, and has no non-blocking path | behaviors-14 | Task 11 |
| RI-2 | File adapter already throws `BACKEND_READ_ONLY_DEPRECATED` — precedence with the sentinel | behaviors-33 | Task 14 |
| RI-3 | Charter row says `setup --check` exits non-zero on drift and lists no `--yes` | behaviors-26 | Task 17 |
| RI-4 | The five verbs render bodies only in `--json`; `fenceBlock` needs a nonce | behaviors-20 | Task 15 |
| WR-1 | Other `tasks.backend` readers, incl. the `/adev:sync` block | — | Task 21 |
| WR-2 | No test asserts each `setup --check` drift category | — | Task 17 |
| WR-3 | Producer→consumer contract for the bridge amendment | — | unassigned — address in Task 1 (record in the prerequisite amendment; Task 1 only notes it) |
| BD-1 | Single fixed argv vs preflight's need for `gh auth status` | — | Task 4 |
| BD-3 | Predicates missing for `type`, `milestone`, `priority`; YAML-significant `next_action` | — | Task 8 |
| BD-4 | Labels/types are triage-writable — the real trust model | — | Task 8 (code) + Task 22 (docs) |
| BD-5 | Sentinel commit status; fixture content allowlist | — | Task 5 (fixtures) + Task 14 (sentinel) |
| TR-1 | Connection continuations need their own page bound | — | Task 4 |
| TR-2 | `walkTree` visited-set and cycle outcome | — | Task 9 |

Resolutions decided here (so the implementer does not re-decide them):

- **BD-1:** preflight adds **no** argv. `gh` missing → `ENOENT` from `execFileSync` → `GITHUB_CLI_MISSING`; unauthenticated → `gh`'s non-zero exit with its auth message → `GITHUB_AUTH_REQUIRED`; missing scopes → GraphQL error `type: "INSUFFICIENT_SCOPES"` → `GITHUB_SCOPE_MISSING` naming the scopes GitHub reports. Every probe is a GraphQL query through the one fixed argv, so BEH-40's "that exact argv" holds literally.
- **RI-2:** the file adapter is unchanged and keeps `BACKEND_READ_ONLY_DEPRECATED` (it is already read-only); the sentinel guard is added to the json and beads adapters only.
- **CON-3 / BD-5 (sentinel):** the sentinel is board state like `tasks.json` / `issues.jsonl` and is committed with the board through its normal sync path (json: the git-tracked `.context-index/tasks/`; beads: `adev issues sync --push` to `beads-board`). Its only content is the BEH-32 JSON object. Pending `agent-reliable-state-artifacts` confirmation.
- **RI-4:** `--json` output keeps `title`/`notes` byte-raw (consumers such as `/adev:debug` parse it) and adds `"untrusted_text": ["title", "notes"]` for github items; human output neutralizes titles and, in `show`, prints the body inside a `fenceBlock` with a fresh `crypto.randomBytes(8)` hex nonce.
- **RI-1:** `GITHUB_PARTIAL_CREATE` is raised by `create()` and `createEpic()`; `adev issues create` and `adev issues epic` print the ID and unwritten fields and exit 1; `/adev:plan` surfaces the CLI's exit like any other failed verb.
- **CON-4:** "rollback" in the charter means rollback-by-abstention; a loser's `claimed_at` overwriting the winner's is accepted (both stamps fall inside the race window) and documented in Task 22.
- **CON-1:** a github-path abort still emits `MIGRATE_PARTIAL_FAILURE`, with the `GITHUB_*` code and redacted message in `errors[]`; this is written into the backend-migration amendment.

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

### Task 14: Read-only sentinel and adapter guard [specialist: none]

**Charter capability:** Migration to GitHub
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** `agent-reliable-state-artifacts` sentinel-format confirmation (prerequisite)
**Files:**
- Create: `lib/issues/read-only-sentinel.mjs` — `sentinelPath(storageRoot, backend)`, `writeSentinel(storageRoot, backend, { project })`, `readSentinel(storageRoot, backend)` (returns `null`, a parsed object, or `{ malformed: true }`), `assertWritable(storageRoot, backend)`
- Modify: `lib/issues/json-adapter.mjs`, `lib/issues/beads-adapter.mjs` — every write method calls `assertWritable` before touching storage
- Test: `tests/issues/read-only-sentinel.test.mjs`

**Tests:** `tests/issues/read-only-sentinel.test.mjs` — create (BEH-32 sentinel, BEH-33)

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, symlinkSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { writeSentinel, assertWritable, sentinelPath } from "../../lib/issues/read-only-sentinel.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";

test("json board: sentinel blocks writes, leaves board files byte-identical, reads still work", async () => {
  const dir = createTempDir();
  try {
    const a = new JsonAdapter(dir); await a.init(dir); await a.create({ title: "x" });
    const before = readFileSync(join(dir, ".context-index/tasks/tasks.json"));
    writeSentinel(dir, "json", { project: "https://github.com/orgs/acme/projects/7" });
    assert.deepEqual(readFileSync(join(dir, ".context-index/tasks/tasks.json")), before);
    await assert.rejects(a.create({ title: "y" }), (e) => e.code === "BOARD_READ_ONLY_MIGRATED" && /projects\/7/.test(e.message));
    assert.equal((await a.list({})).length, 1);
  } finally { cleanupTempDir(dir); }
});

test("malformed sentinel still blocks; symlinked sentinel is refused", () => {
  const dir = createTempDir();
  const other = createTempDir();
  try {
    mkdirSync(join(dir, ".context-index/tasks"), { recursive: true });
    const p = sentinelPath(dir, "json");
    writeFileSync(p, "{not json");
    assert.throws(() => assertWritable(dir, "json"), { code: "BOARD_READ_ONLY_MIGRATED" });
    unlinkSync(p);
    writeFileSync(join(other, "x.json"), "{}");
    symlinkSync(join(other, "x.json"), p);
    assert.throws(() => writeSentinel(dir, "json", { project: "https://github.com/orgs/acme/projects/7" }), { code: "SENTINEL_PATH_UNSAFE" });
  } finally { cleanupTempDir(dir); cleanupTempDir(other); }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/read-only-sentinel.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

- Paths: `.context-index/tasks/board-read-only.json` (json) and `.beads/adev-read-only.json` (beads) under `resolveStorageRoot()`. Resolve with `resolveContained()` against `safeRealpath(storageRoot)`; refuse a symlink at the sentinel path with `SENTINEL_PATH_UNSAFE` (review BD-2).
- Write by temp file + `renameSync` in the same directory; never read-modify-write a board file.
- A present-but-unparseable sentinel blocks writes (fail-closed, review BD-6).
- The file adapter is **not** modified: it already throws `BACKEND_READ_ONLY_DEPRECATED` on every write (review RI-2).
- The sentinel is board state and is committed with the board (review CON-3 / BD-5); its only content is `{ schema, reason, target, project, migrated_at }`.

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

### Task 18: Migration core — ordered copy, `legacy_id`, replay, resume [specialist: none]

**Charter capability:** Migration to GitHub
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 13, Task 17, backend-migration amendment (prerequisite)
**Files:**
- Create: `lib/issues/github/migrate.mjs` — `migrateToGithub({ source, target, scope, log })`: gate on preflight + `checkProject`, ordered sequential create, replay after all items exist, stop on first per-item failure
- Modify: `lib/cli/issues-migrate.mjs` — dispatch `--to github` to `migrateToGithub`; keep writing `.migrate-state.json` for progress and resume-argument checks
- Test: `tests/issues/github/migrate.test.mjs`

**Tests:** `tests/issues/github/migrate.test.mjs` — create (BEH-29, BEH-30)
**Why not split:** copy, replay and resume share one idempotency key (`legacy_id`) and one fixture sequence; splitting would test resume without the copy that produces its state.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../../lib/cli/issues-migrate.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";
import { replayExec } from "./replay-transport.mjs";
import { migrateFx, seedJsonBoard } from "./fixtures/migrate.mjs";

test("json → github through the real verb: parents first, replay after, legacy_id on every item", async () => {
  const dir = createTempDir();
  try {
    const manifest = await seedJsonBoard(dir); // epic e1, feature e1.f1 (dep on issue-7k3f9a), issue-7k3f9a
    const exec = replayExec(migrateFx.fresh);
    assert.equal(await run({ projectRoot: dir, argv: ["--to", "github", "--yes"], manifest, exec, isTTY: false }), 0);
    const ops = exec.calls.map((c) => c.operation);
    assert.ok(ops.lastIndexOf("CreateIssue") < ops.indexOf("AddSubIssue"));
    assert.equal(exec.calls.filter((c) => c.operation === "SetFields" && "legacy_id" in c.variables.fields).length, 3);
  } finally { cleanupTempDir(dir); }
});

test("re-run after interruption — with or without .migrate-state.json — duplicates nothing", async () => {
  for (const dropState of [false, true]) {
    const dir = createTempDir();
    try {
      const manifest = await seedJsonBoard(dir);
      await run({ projectRoot: dir, argv: ["--to", "github", "--yes"], manifest, exec: replayExec(migrateFx.failsAtItem2), isTTY: false });
      if (dropState) rmSync(join(dir, ".context-index/tasks/.migrate-state.json"), { force: true });
      const exec = replayExec(migrateFx.resumeFromItem2);
      assert.equal(await run({ projectRoot: dir, argv: ["--to", "github", "--yes"], manifest, exec, isTTY: false }), 0);
      assert.equal(exec.calls.filter((c) => c.operation === "CreateIssue").length, 2);
    } finally { cleanupTempDir(dir); }
  }
});

test("per-item failure stops the run with exit 1 and MIGRATE_PARTIAL_FAILURE carrying the GITHUB_* code", async () => {
  const dir = createTempDir();
  try {
    const manifest = await seedJsonBoard(dir);
    const out = [];
    assert.equal(await run({ projectRoot: dir, argv: ["--to", "github", "--yes", "--json"], manifest, exec: replayExec(migrateFx.failsAtItem2), isTTY: false, log: (s) => out.push(s) }), 1);
    const report = JSON.parse(out.join(""));
    assert.equal(report.code, "MIGRATE_PARTIAL_FAILURE");
    assert.equal(report.errors[0].code, "GITHUB_WRITE_FAILED");
    assert.doesNotMatch(JSON.stringify(report), /gh[pousr]_[A-Za-z0-9]{20,}/);
  } finally { cleanupTempDir(dir); }
});
```

- [ ] **Verify test fails** — Run: `node --test tests/issues/github/migrate.test.mjs` — Expected: FAIL (`--to github` not dispatched)
- [ ] **Implement** — Idempotency reads `legacy_id` from the target board first; title matching is never used for a github target. `.migrate-state.json` keeps its existing resume-argument check (`MIGRATE_RESUME_MISMATCH`) and progress counts; correctness never depends on it. Aborts emit `MIGRATE_PARTIAL_FAILURE` with the `GITHUB_*` code and a `redact()`ed message in `errors[]` (review CON-1). Run `grep -n "MIGRATE_UNKNOWN_BACKEND\|--to" tests/` and update any existing migrate test whose expectation changes — count with the grep first; more than 8 means split.
- [ ] **Verify test passes** — Run: `node --test tests/issues/github/migrate.test.mjs && npm test -- --test-name-pattern migrate` — Expected: PASS
- [ ] **Commit**

```bash
git add lib/issues/github/migrate.mjs lib/cli/issues-migrate.mjs tests/issues/github/migrate.test.mjs tests/issues/github/fixtures/migrate.mjs
git commit -m "feat(task-management): migrate a json or beads board to GitHub"
```

### Task 19: Migration — confirmation, dry-run, pacing, sentinel, manifest suggestion [specialist: none]

**Charter capability:** Migration to GitHub
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 14, Task 18
**Files:**
- Modify: `lib/issues/github/migrate.mjs` — write-set disclosure + confirmation, dry-run report, pacing and wait bounds, sentinel write on success
- Modify: `lib/cli/issues-migrate.mjs` — accept `--yes` in `parseArgs()` and `help()` (review RI-5); after success print the summary then `manifestUpdateSuggestion("github")`
- Test: `tests/issues/github/migrate-safety.test.mjs`

**Tests:** `tests/issues/github/migrate-safety.test.mjs` — create (BEH-31, BEH-32, BEH-35, BEH-41)

- [ ] **Write failing test** — cases, each through `run()` with an injected `exec`, `isTTY`, `sleep` and `now`:
  1. `--dry-run` issues zero mutations and prints repo/project visibility and the count of titles and notes to be published.
  2. Non-interactive without `--yes` exits 1 with `MIGRATE_CONFIRMATION_REQUIRED` before any mutation; `--auto` alone does not count as `--yes`.
  3. A re-run with nothing left to create or link needs no confirmation.
  4. Mutations are spaced ≥ 1000 ms apart (assert on the injected `sleep`), never concurrent.
  5. Rate-limit fixtures: a reset ≤ 5 min is waited; the 6th wait, or cumulative waiting > 15 min, stops with exit 1 and `GITHUB_RATE_LIMITED`; same under `--auto`.
  6. On success the sentinel exists at `.context-index/tasks/board-read-only.json`, `manifest.yaml` is byte-identical, and stdout ends with the `manifestUpdateSuggestion("github")` text.
- [ ] **Verify test fails** — Run: `node --test tests/issues/github/migrate-safety.test.mjs` — Expected: FAIL
- [ ] **Implement** — inject `sleep` and `now` through `run()` options (default `setTimeout`-based / `Date.now`) so tests never wait. `--yes` is argv-only.
- [ ] **Verify test passes** — Run: `node --test tests/issues/github/migrate-safety.test.mjs && node --test tests/issues/github/` — Expected: PASS
- [ ] **Commit**

```bash
git add lib/issues/github/migrate.mjs lib/cli/issues-migrate.mjs tests/issues/github/migrate-safety.test.mjs
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
**Files:**
- Modify: `docs/configuration.md` — every `tasks.github` key from BEH-2 with its default
- Modify: `docs/troubleshooting.md` — every error code in the spec's Error Cases table plus `GITHUB_SUBISSUE_CYCLE` and `SENTINEL_PATH_UNSAFE`, each with its remedy; the sanctioned unlock for `BOARD_READ_ONLY_MIGRATED` (delete the sentinel only after confirming the migration is abandoned; a malformed sentinel still blocks — review BD-6)
- Modify: `docs/concepts.md` — backend comparison; the github differences; the claim window and rollback-by-abstention (review CON-4); the trust model — Project fields need project write, labels and issue types need triage, issue authors control only title and body (review BD-4); the ADR 0016 relationship (review CON-2)
- Modify: `skills/issues/SKILL.md` — only if `grep -nE "e1\.f|dotted" skills/issues/SKILL.md skills/plan/references/*.md` shows a dotted ID used as the sole example; otherwise leave unchanged and say so in the commit body
- Create: `tests/docs/github-backend-docs.test.mjs`

**Tests:** `tests/docs/github-backend-docs.test.mjs` — create (BEH-38)

- [ ] **Write failing test** — parse the Error Cases table from `github-board-backend.spec.md` (third column, backticked codes) and the key list from BEH-2; add the declared plan-level extras `const EXTRA_CODES = ["GITHUB_SUBISSUE_CYCLE", "SENTINEL_PATH_UNSAFE"]`; assert each code appears in `docs/troubleshooting.md` and each key in `docs/configuration.md`. The extras are docs-only additions, not a spec amendment.
- [ ] **Verify test fails** — Run: `node --test tests/docs/github-backend-docs.test.mjs` — Expected: FAIL listing the missing codes/keys
- [ ] **Implement** — write the docs.
- [ ] **Verify test passes** — Run: `node --test tests/docs/github-backend-docs.test.mjs && npm test` — Expected: PASS
- [ ] **Commit**

```bash
git add docs/configuration.md docs/troubleshooting.md docs/concepts.md tests/docs/github-backend-docs.test.mjs
git commit -m "docs(task-management): document the github issue backend"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test` (no network, no token — every GitHub interaction replays fixtures)
- Gates from `.context-index/governance/gates.yaml` (deterministic gates with commands; probabilistic gates noted as skipped)
- Boundaries (`.context-index/governance/boundaries.yaml`): no CommonJS (`no-commonjs`), no inline Node in skills (`no-inline-node-in-skills`), no hard-coded `~/.claude/`, no manual version bump
- No new npm dependency (`package.json` dependencies unchanged)
- All acceptance criteria in `github-board-backend.spec.md` satisfied
