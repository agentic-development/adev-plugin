<!-- DO NOT EDIT statuses inline — see lifecycle log backend-migration.jsonl -->
# Implementation Plan: Backend Migration

> **Methodology:** adev
> **Charter:** .context-index/specs/features/task-management/charter.md
> **Spec:** .context-index/specs/features/task-management/backend-migration.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-19)
> **Platform:** JavaScript (ESM), Node.js, node:test

**Goal:** Implement the `adev issues migrate` CLI verb to convert the configured issue board between backends (json ↔ beads), idempotent via `.beads-map.json` / title+spec_ref matching, with `--dry-run`, `--include-closed`, resumable partial-failure recovery, and a never-auto-write manifest prompt.

**Architecture:** New CLI verb dispatched from `cli/index.mjs` via a new `issues` sub-verb registry. The verb body lives in `lib/cli/issues-migrate.mjs` and composes existing adapter contracts (`JsonAdapter`, `BeadsAdapter`, `FileAdapter`) via `getIssueManager()`. Idempotency uses the existing `.beads-map.json` for json → beads, and `(title, spec_ref)` (with `original_id`-in-notes fallback) for beads → json. Partial-failure recovery writes `.context-index/tasks/.migrate-state.json` via temp-rename atomic write (`agent-reliable-state-artifacts` storage primitives). Tests use mocked `execFileSync` for `br` — no live infra is required.

The review notes (SA-1, SA-2, SEC-1, SEC-2, CON-1, CON-2, CON-3) are addressed inside the plan: per-item state-write granularity (SA-2), inline state-schema reference (SA-1), explicit `br` stderr passthrough policy (SEC-1), `SUPPORTED_BACKENDS`-sourced validation (SEC-2), and the field-naming cross-reference (CON-1).

---

## File Structure

**Create:**
- `lib/cli/issues-migrate.mjs` — Verb implementation (arg parsing, scope filtering, dry-run path, live loop, dependency replay, state file read/write, stderr passthrough policy)
- `tests/lib/cli-issues-migrate.test.mjs` — Unit tests for argument validation, dry-run shape, json→beads live path with mocked `execFileSync`, beads→json live path, partial-failure resume, manifest-never-written under `--auto`, dependency-edge skipped warnings, stderr-passthrough policy
- `.context-index/adrs/0014-backend-migration-stderr-policy.md` — ADR explaining the SEC-1 decision: `br` stderr is forwarded verbatim on `MIGRATE_PARTIAL_FAILURE` because the verb is operator-local and the existing `BEADS_COMMAND_FAILED` contract already exposes stderr; no redaction is introduced

**Modify:**
- `cli/index.mjs:1303-1339` — Register an `issues` verb in `VERB_REGISTRY` that dispatches sub-commands (`migrate` is the only sub-verb in this spec; structure leaves room for future ones)
- `.gitignore` — Add `.context-index/tasks/.migrate-state.json` under the existing `.context-index/tasks/` block (sits alongside `tasks.json.lock` and `tasks.json.*.tmp`)

**Reference (read, do not modify):**
- `lib/issues/registry.mjs` — Source of truth for `SUPPORTED_BACKENDS` and `getIssueManager()`
- `lib/issues/beads-adapter.mjs` — Read `create()`, `createEpic()`, `addDependency()`, `_runBr()`, and `.beads-map.json` schema
- `lib/issues/json-adapter.mjs` — Read `create()`, `createEpic()`, `addDependency()`, CAS retry semantics
- `lib/issues/interface.mjs` — Issue/Epic field set (`title, type, priority, notes, epicId, parent_id, planRef, spec_ref, next_action, dependencies`)
- `lib/build-state.mjs` — Atomic temp-rename write pattern (`atomicWriteJson`)
- `lib/manifest.mjs` — `loadManifest()` for source-backend resolution; the verb NEVER writes here
- `.context-index/specs/features/task-management/backend-adapters.spec.md` — Adapter contracts being composed
- `.context-index/specs/features/task-management/unified-create-api.spec.md` — Mixed camelCase/snake_case field-naming convention (CON-1 cross-reference)

## Context Packets

### Task 1 Context (ADR for stderr policy)
- Spec: `backend-migration.spec.md` (Behavior 17, Live-Run Output Shape, Error Cases)
- Review: `backend-migration.review.md` (SEC-1 warning)
- Reference: `lib/issues/beads-adapter.mjs:62` (`BEADS_COMMAND_FAILED` carries `err.stderr` verbatim)
- Reference: `.context-index/adrs/` (look at any existing 001x ADRs for format)

### Task 2 Context (`issues` verb dispatch + `migrate` sub-verb wiring)
- Spec: `backend-migration.spec.md` (Behaviors 1-8, Procedure Step 1)
- Reference: `cli/index.mjs:1303-1339` (`VERB_REGISTRY` pattern; legacy adapter closure vs. new-contract dynamic import)
- Reference: `lib/issues/registry.mjs::SUPPORTED_BACKENDS` (single source of truth for `--to`/`--from` validation per SEC-2)

### Task 3 Context (arg parsing + environment validation)
- Spec: `backend-migration.spec.md` (Behaviors 1-7, Procedure Step 1, Error Cases table rows 1-5)
- Reference: `lib/issues/registry.mjs::SUPPORTED_BACKENDS`
- Reference: `lib/issues/beads-adapter.mjs::_detectBr` (BEADS_NOT_AVAILABLE pattern)

### Task 4 Context (source read + scope filter)
- Spec: `backend-migration.spec.md` (Behaviors 8, 12; Procedure Step 3)
- Reference: `lib/issues/interface.mjs` (`IssueFilter` and `Issue` fields)
- Reference: `lib/issues/json-adapter.mjs::list, listEpics`
- Reference: `lib/issues/beads-adapter.mjs::list, listEpics`

### Task 5 Context (dry-run path)
- Spec: `backend-migration.spec.md` (Behavior 15, Procedure Step 4, Dry-Run Output Shape)
- Reference: `lib/issues/beads-adapter.mjs::_readMap` (`.beads-map.json` schema for `already_migrated` counts)

### Task 6 Context (live migration loop + idempotency + `.migrate-state.json`)
- Spec: `backend-migration.spec.md` (Behaviors 9-11, 17-19; Procedure Steps 2 and 5; Idempotency section; Postcondition 6)
- Reference: `lib/build-state.mjs::atomicWriteJson` (temp-rename pattern)
- Reference: `lib/issues/beads-adapter.mjs::_readMap, _writeMap` (mapping shape)
- Reference: `lib/issues/json-adapter.mjs::create` (CAS retries — the verb relies on adapter-level retries)
- Note: Per-item state-file granularity is required (SA-2): write `.migrate-state.json` after each successful adapter call

### Task 7 Context (dependency replay)
- Spec: `backend-migration.spec.md` (Behaviors 13-14, Procedure Step 6)
- Reference: `lib/issues/json-adapter.mjs::addDependency`
- Reference: `lib/issues/beads-adapter.mjs::addDependency`

### Task 8 Context (final report + manifest-update prompt + cleanup)
- Spec: `backend-migration.spec.md` (Behaviors 16, 18-19; Procedure Step 7; Live-Run Output Shape)
- Reference: `lib/manifest.mjs::loadManifest` (read-only — verb MUST NOT write)
- Reference: SEC-1 stderr policy ADR (Task 1 output)

### Task 9 Context (tests)
- All test cases mirror the Behaviors in `backend-migration.spec.md`
- Reference: existing test patterns in `tests/lib/issues-beads-adapter.test.mjs` (mocked `execFileSync`)
- Reference: `tests/helpers.mjs` (`createTempDir`, `cleanupTempDir`)

## Parallelization

- Group A (sequential): Task 1 (ADR) → Task 2 (verb dispatch) → Task 3 (arg parsing). Foundational; later tasks import from these.
- Group B (sequential after Group A): Task 4 (source read) → Task 5 (dry-run) → Task 6 (live loop + state file) → Task 7 (dependency replay) → Task 8 (report + cleanup). Shared file: `lib/cli/issues-migrate.mjs`.
- Group C (independent after Group A): Task 9 (test suite). Shared file: `tests/lib/cli-issues-migrate.test.mjs`. Tests for individual behaviors are added incrementally as each Group B task lands; the test file's existence and skeleton are seeded by Task 9's first subsection.

Groups B and C run sequentially per-task but can interleave per-behavior — each Group B task ends with the matching test from Group C green.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | ADR for stderr passthrough policy (SEC-1) | small | unit | — | 1 create, 0 modify |
| 2 | Wire `issues` verb + `migrate` sub-verb dispatch | small | unit | Task 1 | 1 create, 1 modify |
| 3 | Argument parsing + environment validation | small | unit | Task 2 | 0 create, 1 modify |
| 4 | Source backend read + scope filter | small | unit | Task 3 | 0 create, 1 modify |
| 5 | Dry-run path + JSON report shape | small | unit | Task 4 | 0 create, 1 modify |
| 6 | Live migration loop + idempotency + `.migrate-state.json` | medium | unit | Task 5 | 0 create, 1 modify |
| 7 | Dependency replay + out-of-scope edge warnings | small | unit | Task 6 | 0 create, 1 modify |
| 8 | Final report + manifest-update prompt + cleanup + `.gitignore` | small | unit | Task 7 | 0 create, 2 modify |
| 9 | Test suite | medium | unit | Tasks 2-8 (incremental) | 1 create, 0 modify |

All tasks resolve to `test_strategy: unit`. Tests mock `execFileSync` for `br` and use `tests/helpers.mjs` temp dirs — no live infrastructure is required.

## Strategy Summary

All 9 tasks resolve to `unit` (source: fallback). No infrastructure section emitted — no non-unit strategies and the spec has no `infra_requirements:` frontmatter.

---

### Task 1: ADR for `br` stderr passthrough policy (SEC-1) [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Pure ADR authoring with explicit Status/Context/Decision/Consequences template, single-file blast radius, and SEC-1 rationale already spelled out in the plan.

**Charter capability:** Backend Migration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `.context-index/adrs/0014-backend-migration-stderr-policy.md`

**Tests:** `tests/lib/cli-issues-migrate.test.mjs` — Task 9 will assert that `MIGRATE_PARTIAL_FAILURE` JSON includes the underlying adapter's stderr verbatim (the ADR documents the rationale; the test asserts the behavior).

**Context to load:**
- Spec Behavior 17 and Live-Run Output Shape (errors[] carries adapter stderr)
- `lib/issues/beads-adapter.mjs:62` (`BEADS_COMMAND_FAILED` already forwards `err.stderr`)
- Review note SEC-1

- [ ] **Write failing test**

The ADR-only task does not have a code test; its acceptance is doc-presence + later test (Task 9) asserts the stderr-passthrough behavior. This step is "Decision drafted in `0014-backend-migration-stderr-policy.md`" — verify by reading the file.

- [ ] **Verify test fails**

Confirm the ADR file does not yet exist. Expected: `0014-backend-migration-stderr-policy.md` absent.

- [ ] **Implement**

Author the ADR following the project's existing ADR format (Status / Context / Decision / Consequences). Capture:

- The verb forwards `br` stderr verbatim in `errors[]` and on the user's terminal.
- Rationale: the verb is operator-local; existing `BEADS_COMMAND_FAILED` already exposes stderr; no PII/secret surface is introduced; redaction would obscure debugging information the operator needs.
- Alternative (rejected): scrubbing absolute paths from stderr — rejected because the paths are operator-local and necessary to diagnose the failing `br` invocation.

- [ ] **Verify test passes**

Read the ADR. Confirm Status / Context / Decision / Consequences sections are present and reference SEC-1.

- [ ] **Commit**

Branch: `feat/lib/backend-migration`

```bash
git add .context-index/adrs/0014-backend-migration-stderr-policy.md
git commit -m "docs(lib): add ADR-0014 for br stderr passthrough policy

Spec: .context-index/specs/features/task-management/backend-migration.spec.md
Plan-task: 1"
```

---

### Task 2: Wire `issues` verb + `migrate` sub-verb dispatch [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=4 novelty=5
**Rationale:** Direct application of the existing VERB_REGISTRY pattern with exact line references and worked sample code in the plan.

**Charter capability:** Backend Migration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/cli/issues-migrate.mjs` (initial skeleton: exports `run({ projectRoot, argv, manifest })` and `help()`; body is a stub that returns immediately)
- Modify: `cli/index.mjs:1303-1339` — Add `["issues", () => import("../lib/cli/issues.mjs")]` to `VERB_REGISTRY`; the dispatcher routes `issues migrate ...` to the migrate helper.

**Tests:** `tests/lib/cli-issues-migrate.test.mjs`

**Context to load:**
- Task 2 Context packet above
- `cli/index.mjs:1303-1426` (full `VERB_REGISTRY` + `dispatch()` flow)

Note on dispatcher shape: there is no existing `issues` verb. Two options:

- (a) Add a thin `lib/cli/issues.mjs` that reads `argv[0]` as a sub-verb, dispatches to `lib/cli/issues-migrate.mjs` for `migrate`, and prints a usage banner otherwise.
- (b) Register `issues-migrate` directly as a top-level verb.

Choose (a) so that future `issues` sub-verbs (e.g., `issues list`) compose cleanly without polluting `VERB_REGISTRY`.

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { run } from "../../lib/cli/issues-migrate.mjs";

describe("issues migrate verb wiring", () => {
  it("exposes a run() function", () => {
    assert.equal(typeof run, "function");
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/cli/issues-migrate.mjs'`

- [ ] **Implement**

Create `lib/cli/issues-migrate.mjs`:

```javascript
export function help() {
  console.log("Usage: adev issues migrate --to <backend> [--from <backend>] [--include-closed] [--dry-run]");
}

export async function run({ projectRoot, argv, manifest } = {}) {
  // Stub — Task 3+ flesh this out.
  return 0;
}
```

Create `lib/cli/issues.mjs`:

```javascript
export function help() {
  console.log("Usage: adev issues <subcommand>");
  console.log("Subcommands:");
  console.log("  migrate    Convert the issue board to a different backend");
}

export async function run({ projectRoot, argv, manifest } = {}) {
  const sub = argv?.[0];
  if (!sub) { help(); return 1; }
  if (sub === "migrate") {
    const mod = await import("./issues-migrate.mjs");
    return mod.run({ projectRoot, argv: argv.slice(1), manifest });
  }
  console.error(`unknown issues subcommand: ${sub}`);
  help();
  return 1;
}
```

Modify `cli/index.mjs` `VERB_REGISTRY`:

```javascript
["issues", () => import("../lib/cli/issues.mjs")],
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/issues.mjs lib/cli/issues-migrate.mjs cli/index.mjs tests/lib/cli-issues-migrate.test.mjs
git commit -m "feat(cli): scaffold issues verb with migrate sub-verb

Spec: .context-index/specs/features/task-management/backend-migration.spec.md
Plan-task: 2"
```

---

### Task 3: Argument parsing + environment validation [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Each error code maps to an explicit behavior and Error Cases table row; SUPPORTED_BACKENDS source-of-truth is pre-identified.

**Charter capability:** Backend Migration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/issues-migrate.mjs` — Add arg parsing for `--to`, `--from`, `--include-closed`, `--dry-run`; emit `MIGRATE_MISSING_TARGET`, `MIGRATE_UNKNOWN_BACKEND`, `MIGRATE_TARGET_READONLY`, `MIGRATE_NOOP`, `BEADS_NOT_AVAILABLE`.

**Tests:** `tests/lib/cli-issues-migrate.test.mjs` — Append validation cases.

**Context to load:**
- Task 3 Context packet
- `lib/issues/registry.mjs::SUPPORTED_BACKENDS`
- `lib/issues/beads-adapter.mjs::_detectBr`

- [ ] **Write failing test**

Add cases per Behaviors 3-7:
- `--to` missing → exit non-zero, stderr contains `MIGRATE_MISSING_TARGET`.
- `--to xyz` (unknown) → `MIGRATE_UNKNOWN_BACKEND` with the supported list (from `SUPPORTED_BACKENDS` per SEC-2).
- `--to file` → `MIGRATE_TARGET_READONLY`.
- `--to json` with manifest `tasks.backend=json` → `MIGRATE_NOOP`.
- `--to beads` with `which br` mocked to throw → `BEADS_NOT_AVAILABLE`.

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: FAIL — error codes not yet emitted.

- [ ] **Implement**

Parse `argv` (simple positional/flag scan, no external lib). Use `SUPPORTED_BACKENDS` from `lib/issues/registry.mjs` (do NOT duplicate the literal `[json, beads, file]`). Resolve source backend from `manifest.tasks.backend` when `--from` is absent. For `--to beads`, attempt `BeadsAdapter` construction (which calls `_detectBr`); catch `BEADS_NOT_AVAILABLE` and re-emit with an install hint.

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/issues-migrate.mjs tests/lib/cli-issues-migrate.test.mjs
git commit -m "feat(cli): parse arguments and validate environment for issues migrate

Spec: .context-index/specs/features/task-management/backend-migration.spec.md
Plan-task: 3"
```

---

### Task 4: Source backend read + scope filter [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Pure composition of existing getIssueManager + list/listEpics with a clear scope-filter rule from Behavior 12.

**Charter capability:** Backend Migration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/issues-migrate.mjs` — Read source via `getIssueManager(manifest, projectRoot)` (with `--from` override); collect items via `list()` and `listEpics()`; apply scope filter (default excludes `closed`; `--include-closed` retains all).

**Tests:** `tests/lib/cli-issues-migrate.test.mjs` — Append source-read tests and `MIGRATE_SOURCE_INVALID` failure mode.

**Context to load:**
- Task 4 Context packet
- `lib/issues/interface.mjs::IssueFilter`

- [ ] **Write failing test**

Add cases per Behavior 8 and 12:
- json source with 3 open + 2 closed items + 1 epic → default scope returns 3 issues + 1 epic.
- Same source with `--include-closed` → 5 issues + 1 epic.
- Corrupt `tasks.json` (intentionally malformed) → `MIGRATE_SOURCE_INVALID` with path context.

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: FAIL — scope filter not yet implemented.

- [ ] **Implement**

Wire `getIssueManager()` with `manifest.tasks.backend = sourceBackend` (synthesize a shallow override; do NOT mutate the loaded manifest). Apply scope filter. Wrap adapter calls in try/catch and surface `MIGRATE_SOURCE_INVALID` with the offending path.

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/issues-migrate.mjs tests/lib/cli-issues-migrate.test.mjs
git commit -m "feat(cli): read source backend and apply scope filter

Spec: .context-index/specs/features/task-management/backend-migration.spec.md
Plan-task: 4"
```

---

### Task 5: Dry-run path + JSON report shape [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Output shape is fully specified; minor novelty comes from combining .beads-map.json reads with idempotency counting in both directions.

**Charter capability:** Backend Migration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/issues-migrate.mjs` — Implement `--dry-run` early-exit branch; compute `in_scope`, `already_migrated`, `would_create`, `dependencies_to_replay`; print JSON to stdout; exit 0.

**Tests:** `tests/lib/cli-issues-migrate.test.mjs` — Append dry-run cases (Behavior 15, Postcondition 7).

**Context to load:**
- Task 5 Context packet

- [ ] **Write failing test**

Add cases:
- json → beads dry-run with no existing `.beads-map.json` → JSON has `in_scope`, `already_migrated: 0`, `would_create` matching `in_scope`.
- json → beads dry-run with a pre-existing `.beads-map.json` covering 2 items → `already_migrated: 2`, `would_create.issues` reduced by 2.
- beads → json dry-run with 1 target item whose `(title, spec_ref)` matches a source item → `already_migrated: 1`.
- Assert `.beads-map.json` and target store are byte-equal before and after (Postcondition 7).

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: FAIL.

- [ ] **Implement**

For json → beads, read `.beads-map.json` (if present) via the same path `BeadsAdapter` uses (`<projectRoot>/.context-index/tasks/.beads-map.json`). For beads → json, list target items and match `(title, spec_ref)`. Compute `dependencies_to_replay` as the count of in-scope edges where both endpoints are in-scope. Print the JSON object on stdout. Exit 0.

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/issues-migrate.mjs tests/lib/cli-issues-migrate.test.mjs
git commit -m "feat(cli): implement dry-run path for issues migrate

Spec: .context-index/specs/features/task-management/backend-migration.spec.md
Plan-task: 5"
```

---

### Task 6: Live migration loop + idempotency + `.migrate-state.json` [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=3
**Rationale:** Composition of multiple patterns (atomic state writes, per-item idempotency, resume, partial-failure) but each is individually well-specified and the SA-2 granularity requirement is explicit.

**Charter capability:** Backend Migration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/issues-migrate.mjs` — Implement the loop in Procedure Step 5: per-item idempotency check, target `create()`/`createEpic()`, per-item atomic write of `.context-index/tasks/.migrate-state.json` (schema: `{ source, target, last_successful_index, scope_args }`), `MIGRATE_PARTIAL_FAILURE` on adapter throw, resume-from-state on next invocation (Procedure Step 2).

**Tests:** `tests/lib/cli-issues-migrate.test.mjs` — Append live-loop, idempotency, partial-failure, resume, and stderr-passthrough cases.

**Context to load:**
- Task 6 Context packet
- Spec Behaviors 9-11, 17-18; Idempotency section; Postcondition 6

- [ ] **Write failing test**

Add cases:
- json → beads live: mocked `execFileSync` returns synthesized beads ids for each `br create`. Assert `.beads-map.json` has entries, `tasks.md` (epics via `_fileAdapter`) has the created epic, and the run JSON has correct `created`/`skipped` counts.
- Idempotent re-run: a second invocation with no source changes reports `skipped > 0`, `created.issues = 0`.
- beads → json live: target gets entries, dup-detection by `(title, spec_ref)` skips a second matching item.
- Partial failure: mock `execFileSync` to throw on item 3 of 5. Assert `.migrate-state.json` written with `last_successful_index = 2`, `errors[]` populated with the underlying stderr verbatim (SEC-1), and exit non-zero.
- Resume: subsequent invocation with matching args picks up from index 3 and removes the state file on completion.
- Mismatched-args resume guard: first run wrote `--to beads`, second invocation `--to json` → verb refuses with a clear error and does NOT migrate.

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: FAIL.

- [ ] **Implement**

- Read `.migrate-state.json` if present; if `source` or `target` mismatch, error out.
- Compute `start_index` from resume state.
- Iterate items from `start_index`; check idempotency (json → beads: `.beads-map.json[sourceId]`; beads → json: target match by `(title, spec_ref)` or `original_id` from notes metadata).
- Pass the full field set (`title, type, priority, notes, epicId, parent_id, planRef, spec_ref, next_action`) to target `create()`/`createEpic()`.
- On success: write `.migrate-state.json` via temp-rename (`atomicWriteJson`-style).
- On failure: write final state with `last_successful_index = lastSuccessful`, emit `MIGRATE_PARTIAL_FAILURE` with the failing item id and `err.stderr || err.message` verbatim per SEC-1. Exit non-zero.

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/issues-migrate.mjs tests/lib/cli-issues-migrate.test.mjs
git commit -m "feat(cli): implement live migration loop with resumable partial-failure

Spec: .context-index/specs/features/task-management/backend-migration.spec.md
Plan-task: 6"
```

---

### Task 7: Dependency replay + out-of-scope edge warnings [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** addDependency is idempotent in both adapters; the only variation is id resolution direction (.beads-map.json vs original_id) which Behavior 14 makes explicit.

**Charter capability:** Backend Migration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/issues-migrate.mjs` — After the live loop, replay dependency edges; resolve target ids via `.beads-map.json` (json→beads) or target id (beads→json); call `addDependency`; emit warnings for out-of-scope endpoints (Behavior 14).

**Tests:** `tests/lib/cli-issues-migrate.test.mjs` — Append dependency-replay cases.

**Context to load:**
- Task 7 Context packet

- [ ] **Write failing test**

Add cases:
- json → beads with 3 in-scope items and 2 in-scope edges → `dependencies_replayed: 2`; assert mock `execFileSync` saw `br dep add` calls.
- One edge endpoint is a closed item (excluded by default) → warning printed to stderr naming both source ids; `dependencies_replayed` count excludes that edge; no `addDependency` call.

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: FAIL.

- [ ] **Implement**

Iterate in-scope edges. For json → beads, look up target ids in `.beads-map.json`. For beads → json, the target id IS the source id structure (json adapter assigns its own; resolve via stored `original_id` in target notes metadata). Call `addDependency` on the target. Catch missing-endpoint cases and emit a warning.

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/issues-migrate.mjs tests/lib/cli-issues-migrate.test.mjs
git commit -m "feat(cli): replay dependency edges with out-of-scope warnings

Spec: .context-index/specs/features/task-management/backend-migration.spec.md
Plan-task: 7"
```

---

### Task 8: Final report + manifest-update prompt + cleanup + `.gitignore` [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=4 novelty=5
**Rationale:** Output shape and Behavior 19 manifest-never-write rule are explicit; touches two files but both changes are mechanical.

**Charter capability:** Backend Migration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/issues-migrate.mjs` — Print the Live-Run Output Shape JSON on stdout, print the manifest-update suggestion on stderr (or a clearly labelled stdout section); remove `.migrate-state.json`; exit 0. Verify `manifest.yaml` is NEVER written even under `--auto` (Behavior 19).
- Modify: `.gitignore` — Add `.context-index/tasks/.migrate-state.json` under the existing `.context-index/tasks/` block.

**Tests:** `tests/lib/cli-issues-migrate.test.mjs` — Append report-shape and manifest-snapshot tests.

**Context to load:**
- Task 8 Context packet

- [ ] **Write failing test**

Add cases:
- Successful live run: stdout JSON has `{ source, target, created: { issues, epics }, skipped, dependencies_replayed, manifest_update_suggested: true, errors: [] }`. stderr contains the manifest-update suggestion text.
- Snapshot `.context-index/manifest.yaml` bytes before and after a live run (with and without `--auto`). Assert byte-equal in both cases.
- After successful run, `.migrate-state.json` does not exist.
- `.gitignore` contains `.context-index/tasks/.migrate-state.json` (literal-line match).

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: FAIL.

- [ ] **Implement**

Print the report. Print the manifest-update suggestion text (do not write the manifest). Remove `.migrate-state.json` (it may not exist on a clean first run; tolerate ENOENT). Add the gitignore line.

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/issues-migrate.mjs tests/lib/cli-issues-migrate.test.mjs .gitignore
git commit -m "feat(cli): final report, manifest-update prompt, and cleanup for issues migrate

Spec: .context-index/specs/features/task-management/backend-migration.spec.md
Plan-task: 8"
```

---

### Task 9: Test suite consolidation and coverage sweep [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Spec enumerates every Behavior/Postcondition/Error Case; existing test pattern (tests/lib/issues-beads-adapter.test.mjs with mocked execFileSync) is the direct precedent.

**Charter capability:** Backend Migration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create (or finalize): `tests/lib/cli-issues-migrate.test.mjs` — Consolidated test file covering every Behavior, Postcondition, and Error Case row from the spec.

**Tests:** This task IS the test task; verifies all earlier-task tests are present and that no Behavior is uncovered.

**Context to load:**
- Task 9 Context packet
- Spec sections: Behavioral Contract, Postconditions, Error Cases, Acceptance Criteria
- `tests/helpers.mjs` (`createTempDir`, `cleanupTempDir`)

This task is incremental across Tasks 2-8 (each Group B task appends its own behavior tests). Task 9 closes the loop: walk the spec, ensure every Behavior 1-19, Postcondition 1-8, and Error Case row has at least one test. Add any missing case.

- [ ] **Write failing test**

For each Behavior/Postcondition/Error Case not yet covered, write a focused test. The expected initial state is that some are missing (added incrementally during Tasks 2-8) — Task 9 fills the gaps.

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: missing-coverage cases fail.

- [ ] **Implement**

For each gap, write the test using existing test utilities. Mock `execFileSync` via the same pattern as `tests/lib/issues-beads-adapter.test.mjs`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli-issues-migrate.test.mjs`
Expected: PASS — every Behavior/Postcondition/Error Case is exercised.

Run: `npm test`
Expected: PASS — the whole suite stays green.

- [ ] **Commit**

```bash
git add tests/lib/cli-issues-migrate.test.mjs
git commit -m "test(lib): close coverage gaps for issues migrate verb

Spec: .context-index/specs/features/task-management/backend-migration.spec.md
Plan-task: 9"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from `backend-migration.spec.md` satisfied:
  - [ ] `adev issues migrate --to <backend>` is registered in `cli/index.mjs`.
  - [ ] All postconditions hold after a successful non-dry-run migration on a populated json store.
  - [ ] All error cases from the Error Cases table return the documented exit-non-zero behavior with the documented error code on stderr.
  - [ ] `--dry-run` writes no target-backend state and no `.beads-map.json` entries.
  - [ ] Idempotent re-run (json → beads) reports `skipped > 0` and `created.issues = 0` when nothing has changed on the source.
  - [ ] Idempotent re-run (beads → json) reports `skipped > 0` and `created.issues = 0` when nothing has changed on the source.
  - [ ] Partial-failure path writes a valid `.migrate-state.json`; subsequent re-run with matching arguments resumes and removes the state file on completion.
  - [ ] `.context-index/tasks/.migrate-state.json` is present in `.gitignore`.
  - [ ] `manifest.yaml::tasks.backend` is byte-equal before and after the verb runs (any mode, including `--auto`).
  - [ ] Dependency edges to out-of-scope items are surfaced as warnings (not silent drops).
  - [ ] `BeadsAdapter` and `JsonAdapter` interfaces are unchanged (no new public methods).
  - [ ] All existing task-management tests continue to pass.
  - [ ] Constitution gates pass: no new external dependencies, pure ESM, no inline-Node in SKILL.md, board-granularity invariant preserved.
