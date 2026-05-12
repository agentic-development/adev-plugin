# Implementation Plan: JSON Issue Board + Adapter

> **Methodology:** adev
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-11)
> **Platform:** Node.js (ESM, `.mjs`), node:test

**Goal:** Add a new JSON-backed issue-board storage adapter (`lib/issues/json-adapter.mjs`) implementing the unchanged `IssueManagerInterface`, with atomic temp-then-rename writes, board-granularity invariant enforcement, an extracted shared markdown parser (`lib/issues/markdown-parser.mjs`), and `backend: json` as the new registry default.

**Architecture:** New adapter mirrors `FileAdapter`'s method surface but swaps the on-disk format from markdown tables to a single JSON document `{ version: 2, epics, issues }`. Writes go through a one-shot temp-file-then-rename primitive (mirroring `lib/build-state.mjs::atomicWriteJson`). Shared markdown parsing logic is lifted out of `FileAdapter._read()` into a stand-alone helper so the JSON adapter's legacy-read fallback consumes it without importing `FileAdapter`. Registry gets a new `"json"` backend value and treats it as the new default for fresh scaffolds.

---

## File Structure

**Create:**
- `lib/issues/json-adapter.mjs` — New `JsonAdapter` class implementing `IssueManagerInterface`
- `lib/issues/markdown-parser.mjs` — Extracted `parseTasksMd(contents)` helper (shared with `FileAdapter`)
- `tests/lib/issues/json-adapter.test.mjs` — Unit tests for `JsonAdapter`
- `tests/lib/issues/markdown-parser.test.mjs` — Unit tests for the extracted parser
- `tests/lib/issues/adapter-conformance.test.mjs` — Architectural conformance test (parity of method names/arities across adapters)
- `tests/lib/issues/json-adapter.parity.test.mjs` — Parameterized parity test re-running the FileAdapter suite against JsonAdapter
- `tests/lib/issues/json-adapter.atomic.test.mjs` — Atomic-write fault-injection test
- `tests/lib/issues/json-adapter.concurrent.test.mjs` — Concurrent multi-update test (integration strategy)
- `tests/lib/issues/json-adapter.perf.test.mjs` — Performance baseline test (1000-issue board)

**Modify:**
- `lib/issues/file-adapter.mjs` — Replace inline parser with a delegate call to `lib/issues/markdown-parser.mjs`; add `BACKEND_READ_ONLY_DEPRECATED` throw on every write method
- `lib/issues/registry.mjs` — Add `"json"` to `SUPPORTED_BACKENDS`, make `JsonAdapter` the default, emit `DEPRECATED_BACKEND` warning for `"file"`
- `templates/manifest.yaml` — Set `tasks.backend: json` for new scaffolds; document `tasks.legacy_read` knob
- `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` — Update Capability Map row "JSON issue board + adapter" status to `planned`

**Reference (read, do not modify):**
- `lib/build-state.mjs` — Atomic-write pattern reference (`atomicWriteJson`)
- `lib/issues/file-adapter.mjs` — Method semantics to mirror in JSON form
- `lib/issues/interface.mjs` — `IssueManagerInterface` definition
- `lib/issues/resolve-root.mjs` — `resolveStorageRoot()` for worktree-shared storage
- `lib/issues/beads-adapter.mjs` — Beads adapter (untouched, must continue to import)
- `.context-index/samples/general-library-module-graph.md` — Module-graph sample
- `.context-index/samples/general-test-helpers.md` — Test helper conventions

---

## Context Packets

### Task 1 Context — Markdown parser extraction
- Spec: `json-issue-board-adapter.spec.md` (SA-3, line 82 of Actionable Task Map; AC criterion on `markdown-parser.mjs`)
- Source: `lib/issues/file-adapter.mjs` (full read — implementer needs to see the existing parser to extract it)
- Sample: `.context-index/samples/general-library-module-graph.md`

### Task 2 Context — `parseTasksMd` tests
- Spec: `json-issue-board-adapter.spec.md` (CON-3 read-tolerance, granularity invariant scope)
- Source: `lib/issues/file-adapter.mjs` (existing parser fixtures + 12/13/14-column branches)

### Task 3 Context — `FileAdapter._read()` delegate refactor
- Spec: SA-3 contract: `FileAdapter._read()` delegates to `markdown-parser.mjs`
- Source: `lib/issues/file-adapter.mjs` (full read), `tests/lib/issues/file-adapter.test.mjs`

### Task 4 Context — `JsonAdapter` skeleton
- Spec: `json-issue-board-adapter.spec.md` Interface Contracts + Acceptance Criteria 1-2
- Source: `lib/issues/file-adapter.mjs` (constructor pattern), `lib/issues/interface.mjs`, `lib/issues/resolve-root.mjs`

### Task 5 Context — `_read()` / `_write()` primitives + atomic write
- Spec: Acceptance Criteria 4 (atomic temp-then-rename), Path Safety SEC-2
- Source: `lib/build-state.mjs::atomicWriteJson` (full read — reference pattern)

### Task 6 Context — Path containment defenses
- Spec: Path Safety section items 1-3
- Source: `lib/issues/resolve-root.mjs`

### Task 7 Context — Document-shape validators (`MALFORMED_BOARD`, `INVALID_BOARD_SHAPE`, `UNSUPPORTED_BOARD_VERSION`)
- Spec: SEC-1 (line/column + 200-char prefix), SEC-4 (coerced version), Error Cases rows
- Source: existing `MALFORMED_BOARD` patterns in `lib/build-state.mjs`

### Task 8 Context — `init()`
- Spec: AC line on init idempotency
- Source: `lib/issues/file-adapter.mjs::init()`

### Task 9 Context — Board-granularity validator
- Spec: Granularity invariant scope section (CON-8); SA-2 in earlier review; Behaviors rows 5-7
- Source: `lib/issues/file-adapter.mjs::create/update` (validation patterns to mirror)

### Task 10 Context — `create()` + `update()`
- Spec: AC lines on tier-prefix, status-transition guard, granularity rejection; Error Cases parity table
- Source: `lib/issues/file-adapter.mjs::create()`, `::update()` (full read for semantic parity)

### Task 11 Context — `close()` with cascade and dependency guards
- Spec: AC line; Error Cases `BLOCKED_BY_DEPENDENCIES`, `CASCADE_BLOCKED`
- Source: `lib/issues/file-adapter.mjs::close()` (full read)

### Task 12 Context — Read APIs (`list`, `get`, `listEpics`)
- Spec: AC lines on filtering semantics
- Source: `lib/issues/file-adapter.mjs::list()`, `::get()`, `::listEpics()`

### Task 13 Context — Legacy epic wrappers (`createEpic`, `updateEpic`)
- Spec: AC line on backward compatibility
- Source: `lib/issues/file-adapter.mjs::createEpic()`, `::updateEpic()`

### Task 14 Context — `addDependency` (cycle detection)
- Spec: Error Cases `CYCLE_DETECTED`
- Source: `lib/issues/file-adapter.mjs::addDependency()`

### Task 15 Context — `walkTree`
- Spec: AC line on prefix-match semantics
- Source: `lib/issues/file-adapter.mjs::walkTree()`

### Task 16 Context — Legacy markdown read fallback
- Spec: Behaviors rows on legacy-read; AC lines on `LEGACY_FORMAT_DETECTED` and `tasks.legacy_read = disabled`
- Source: `lib/issues/markdown-parser.mjs` (the helper extracted in Task 1)

### Task 17 Context — `FileAdapter` write-method deprecation
- Spec: CON-5 deprecation semantics section; canonical error message
- Source: `lib/issues/file-adapter.mjs` (every write method)

### Task 18 Context — Registry extension + default flip
- Spec: AC lines on `SUPPORTED_BACKENDS`, default flip, `DEPRECATED_BACKEND` warning
- Source: `lib/issues/registry.mjs`

### Task 19 Context — Manifest template update
- Spec: AC line on `templates/manifest.yaml` default `tasks.backend: json`
- Source: `templates/manifest.yaml`

### Task 20 Context — Conformance + parity tests
- Spec: AC lines on adapter conformance and parameterized FileAdapter test re-run
- Source: existing `tests/lib/issues/file-adapter.test.mjs`

### Task 21 Context — Atomic + concurrent + perf tests
- Spec: AC lines on atomic-write fault injection, performance baseline
- Source: `lib/build-state.mjs` for atomic-write fault-injection pattern

---

## Heuristics

> Module-scope heuristics for `agent-reliable-state-artifacts` were not available at plan time (heuristics retrieval returned empty). `/adev:implement` reads from the live heuristic store at execution.

---

## Parallelization

- **Group A (sequential foundation):** Task 1 → Task 2 → Task 3 (parser extraction + delegate refactor; modifies shared file)
- **Group B (after Group A):** Task 4 → Task 5 → Task 6 → Task 7 (adapter skeleton + primitives; shared file `lib/issues/json-adapter.mjs`)
- **Group C (after Group B):** Tasks 8, 9, 10, 11 (init, granularity validator, create/update, close — all touch `json-adapter.mjs`)
- **Group D (after Group C):** Tasks 12, 13, 14, 15 (read APIs, legacy epic wrappers, addDependency, walkTree — same file)
- **Group E (after Group D):** Task 16 (legacy markdown read fallback)
- **Group F (independent of A-E):** Task 17 (`FileAdapter` deprecation — different file, no overlap with new adapter)
- **Group G (after Group F):** Task 18 (registry extension — consumes both adapters)
- **Group H (independent):** Task 19 (manifest template — isolated)
- **Group I (after Groups G + H):** Tasks 20, 21 (conformance + parity + atomic + concurrent + perf tests — all read-only against final code)

Within a group, tasks run sequentially. Groups can be interleaved by an orchestrator that respects the inter-group order (A → B → C → D → E → G; F → G; H independent; I last).

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Extract `parseTasksMd` into `lib/issues/markdown-parser.mjs` | medium | unit | — | 1 create, 0 modify |
| 2 | Tests for `parseTasksMd` | medium | unit | Task 1 | 1 create, 0 modify |
| 3 | Wire `FileAdapter._read()` to delegate to `markdown-parser.mjs` | small | unit | Task 1 | 0 create, 1 modify |
| 4 | `JsonAdapter` class skeleton + constructor with path safety | small | unit | Task 3 | 1 create, 0 modify |
| 5 | `_read()` / `_write()` primitives with atomic temp-then-rename | medium | unit | Task 4 | 0 create, 1 modify |
| 6 | Path containment defenses (`INVALID_PROJECT_ROOT`, `INVALID_STORAGE_PATH`) | small | unit | Task 4 | 0 create, 1 modify |
| 7 | Document-shape validators (`MALFORMED_BOARD`, `INVALID_BOARD_SHAPE`, `UNSUPPORTED_BOARD_VERSION`) | small | unit | Task 5 | 0 create, 1 modify |
| 8 | `init()` (idempotent bootstrap) | small | unit | Task 5 | 0 create, 1 modify |
| 9 | Board-granularity validator (`BOARD_GRANULARITY_VIOLATION`) | small | unit | Task 4 | 0 create, 1 modify |
| 10 | `create()` and `update()` with status-transition + granularity guards | large | unit | Tasks 5, 9 | 0 create, 1 modify |
| 11 | `close()` with cascade and dependency guards | medium | unit | Task 10 | 0 create, 1 modify |
| 12 | Read APIs: `list()`, `get()`, `listEpics()` | medium | unit | Task 5 | 0 create, 1 modify |
| 13 | Legacy epic wrappers `createEpic()` / `updateEpic()` | small | unit | Task 10 | 0 create, 1 modify |
| 14 | `addDependency()` with cycle detection | medium | unit | Task 10 | 0 create, 1 modify |
| 15 | `walkTree()` prefix-match | small | unit | Task 12 | 0 create, 1 modify |
| 16 | Legacy markdown-read fallback in `JsonAdapter._read()` | medium | unit | Tasks 1, 5 | 0 create, 1 modify |
| 17 | `FileAdapter` write methods throw `BACKEND_READ_ONLY_DEPRECATED` | small | unit | Task 3 | 0 create, 1 modify |
| 18 | Registry extension: add `"json"`, flip default, emit deprecation warning | medium | unit | Tasks 4, 17 | 0 create, 1 modify |
| 19 | Manifest template default flip + `tasks.legacy_read` documentation | small | unit | — | 0 create, 1 modify |
| 20 | Conformance test + parameterized parity suite re-run against `JsonAdapter` | large | unit | Task 16 | 2 create, 0 modify |
| 21 | Atomic-write fault injection + concurrent + performance tests | large | integration | Task 16 | 3 create, 0 modify |

---

## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| unit | 20 | fallback |
| integration | 1 | detected (medium confidence — concurrent write spawns child processes) |

⚠ Low confidence assignments:
- Task 21: strategy=integration (auto-detected — uses `node:child_process` for concurrent appender harness). Verify by inspecting whether the harness genuinely needs OS-level process spawning vs. async-only emulation.

---

## Test Infrastructure Requirements

> The plan auto-detected integration strategy on Task 21 only. No external systems are required — concurrent / atomic / performance tests run entirely against the local filesystem with `node:child_process`. No credentials, no provisioned state.

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| Local filesystem only | Task 21 | integration |

### Credentials / Environment Variables

None required.

### Pre-Provisioned State

- [x] None — `tests/helpers.mjs::createTempDir()` provisions the temp filesystem fixture per-test.

### CI Configuration

```bash
npm test
```

Integration test (`tests/lib/issues/json-adapter.concurrent.test.mjs`) runs under the default `npm test` invocation. No segregation needed; it uses local-fs only and completes in <10s.

---

## Task 1: Extract `parseTasksMd` into `lib/issues/markdown-parser.mjs` [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/issues/markdown-parser.mjs`
- Test: `tests/lib/issues/markdown-parser.test.mjs` (created in Task 2)

**Tests:** `tests/lib/issues/markdown-parser.test.mjs`

**Context to load:**
- `lib/issues/file-adapter.mjs` (existing parser logic to extract)

- [x] **Write failing test** (deferred to Task 2 — this task creates the surface area that Task 2 exercises; the failing test for *Task 1* is the import-resolution failure when Task 3 tries to delegate to a non-existent module)
- [x] **Verify test fails** (`node --test tests/lib/issues/markdown-parser.test.mjs` returns "Cannot find module")
- [x] **Implement** — Move `_read()`'s markdown-parsing block out of `lib/issues/file-adapter.mjs` into `lib/issues/markdown-parser.mjs` as a pure exported function `export function parseTasksMd(contents) → { version, epics, issues }`. Preserve the 12/13/14-column tolerance branches. No I/O — input is a string, output is the parsed shape.
- [x] **Verify import resolves** — `node -e "import('./lib/issues/markdown-parser.mjs').then(m => console.log(typeof m.parseTasksMd))"` prints `function`.
- [x] **Commit**

```bash
git checkout -b feat/agent-reliable-state-artifacts/json-adapter
git add lib/issues/markdown-parser.mjs
git commit -m "feat(issues): extract parseTasksMd into shared markdown-parser.mjs

Spec: .context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md
Plan-task: 1"
```

## Task 2: Tests for `parseTasksMd` [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 1
**Files:**
- Create: `tests/lib/issues/markdown-parser.test.mjs`

**Tests:** `tests/lib/issues/markdown-parser.test.mjs`

- [x] **Write failing tests** — Cover canonical 14-column board, legacy 13-col, legacy 12-col; round-trip-tolerated legacy issues with both `planRef`+`planTask`; orphan issues; epics with `plan_ref`; malformed lines.
- [x] **Verify tests fail** (`node --test tests/lib/issues/markdown-parser.test.mjs`)
- [x] **Implement** — The implementation already exists from Task 1. Tests should pass once written. If a test reveals a regression vs. the prior in-FileAdapter behavior, fix in `markdown-parser.mjs`.
- [x] **Verify tests pass**
- [x] **Commit**

```bash
git add tests/lib/issues/markdown-parser.test.mjs
git commit -m "test(issues): unit tests for parseTasksMd parser

Spec: .context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md
Plan-task: 2"
```

## Task 3: Wire `FileAdapter._read()` to delegate to `markdown-parser.mjs` [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 1
**Files:**
- Modify: `lib/issues/file-adapter.mjs` (replace inline parser block with `parseTasksMd` import + call)

**Tests:** `tests/lib/issues/file-adapter.test.mjs` (existing FileAdapter suite must continue to pass)

- [x] **Run existing FileAdapter tests** — Baseline: `node --test tests/lib/issues/file-adapter.test.mjs` should PASS before refactor.
- [x] **Refactor** — Replace inline parsing in `FileAdapter._read()` with `import { parseTasksMd } from './markdown-parser.mjs'` and call it. Architectural check: `JsonAdapter` source must NOT import `FileAdapter` (verified by Task 20).
- [x] **Verify existing tests still pass**
- [x] **Commit**

```bash
git add lib/issues/file-adapter.mjs
git commit -m "refactor(issues): FileAdapter._read delegates to markdown-parser

Spec: .context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md
Plan-task: 3"
```

## Task 4: `JsonAdapter` class skeleton + constructor [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 3
**Files:**
- Create: `lib/issues/json-adapter.mjs`
- Test: `tests/lib/issues/json-adapter.test.mjs`

**Tests:** `tests/lib/issues/json-adapter.test.mjs`

- [x] **Write failing test** — Construct `new JsonAdapter(projectRoot)`; expect every `IssueManagerInterface` method to exist as a function (not yet implemented).
- [x] **Verify test fails**
- [x] **Implement skeleton** — Class with constructor `(projectRoot, opts)`. Resolve storage root via `resolveStorageRoot()`. All methods stub-throw `NOT_IMPLEMENTED` for now. Path resolution: `<storageRoot>/.context-index/tasks/tasks.json`. Validate `projectRoot` contains `.context-index/manifest.yaml` (throw `INVALID_PROJECT_ROOT` otherwise).
- [x] **Verify test passes**
- [x] **Commit**

## Task 5: `_read()` / `_write()` primitives with atomic temp-then-rename [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 4
**Files:**
- Modify: `lib/issues/json-adapter.mjs`

**Tests:** `tests/lib/issues/json-adapter.test.mjs` (extend)

- [x] **Write failing tests** — `_read()` of missing file returns empty board `{ version: 2, epics: [], issues: [] }`. `_write()` produces a syntactically valid JSON file. Concurrent reader sees prior content during a write (atomic).
- [x] **Verify tests fail**
- [x] **Implement** — `_read()`: `fs.readFileSync` + `JSON.parse`. `_write(data)`: serialize with `JSON.stringify(data, null, 2) + "\n"`; write to `<finalPath>.<crypto.randomBytes(4).toString('hex')>.tmp`; `fs.renameSync` onto target. Best-effort `fs.unlinkSync` on failure path (swallow errors), then rethrow underlying `fs` error.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 6: Path containment defenses [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 4
**Files:**
- Modify: `lib/issues/json-adapter.mjs`

**Tests:** `tests/lib/issues/json-adapter.test.mjs` (extend)

- [x] **Write failing tests** — `projectRoot` lacking `.context-index/manifest.yaml` throws `INVALID_PROJECT_ROOT`. Crafted `tasks.db_path` resolving outside `.context-index/tasks/` throws `INVALID_STORAGE_PATH`. Symlink escape test.
- [x] **Verify tests fail**
- [x] **Implement** — Constructor enforces path-resolution + manifest-presence check. `_write()` asserts target path `startsWith(resolvedStorageRoot + sep + '.context-index' + sep + 'tasks' + sep)`. Re-use the realpath-prefix pattern from the sibling specs.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 7: Document-shape validators [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 5
**Files:**
- Modify: `lib/issues/json-adapter.mjs`

**Tests:** `tests/lib/issues/json-adapter.test.mjs` (extend)

- [x] **Write failing tests** — Malformed JSON triggers `MALFORMED_BOARD` with line/column + 200-char prefix (non-printable stripped, not raw embed). Bad top-level shape triggers `INVALID_BOARD_SHAPE`. `version < 2` triggers `UNSUPPORTED_BOARD_VERSION`. Non-numeric `version` uses fixed-string fallback message.
- [x] **Verify tests fail**
- [x] **Implement** — Wrap `_read()` body in try/catch with custom error wrapping. `Number(v)` coercion + finite-integer check for version.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 8: `init()` (idempotent bootstrap) [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 5
**Files:**
- Modify: `lib/issues/json-adapter.mjs`

**Tests:** `tests/lib/issues/json-adapter.test.mjs` (extend)

- [x] **Write failing tests** — `init()` on a project with no `tasks.json` creates the file with `{ version: 2, epics: [], issues: [] }`. `init()` on an existing file is a no-op (bytes unchanged).
- [x] **Verify tests fail**
- [x] **Implement**
- [x] **Verify tests pass**
- [x] **Commit**

## Task 9: Board-granularity validator [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 4
**Files:**
- Modify: `lib/issues/json-adapter.mjs`

**Tests:** `tests/lib/issues/json-adapter.test.mjs` (extend)

- [x] **Write failing tests** — Standalone validator function. `validate({ planRef: 'x', planTask: 't1' })` throws `BOARD_GRANULARITY_VIOLATION` with canonical message pointing at `lib/lifecycle-state.mjs::reportPlanTask`. `validate({ planTask: 't1' })` (alone) also throws. `validate({ planRef: 'x' })` alone passes. `validate({})` passes.
- [x] **Verify tests fail**
- [x] **Implement** — Internal helper `validateBoardGranularity(issuePayload)`. Reusable from `create()` and `update()`.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 10: `create()` + `update()` with status-transition + granularity guards [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Tasks 5, 9
**Files:**
- Modify: `lib/issues/json-adapter.mjs`

**Tests:** `tests/lib/issues/json-adapter.test.mjs` (extend)

- [x] **Write failing tests** — Test set mirrors `FileAdapter` semantics: tier-prefix inference (`issue-`, `epic-`, etc.), legacy `issue-N` counter generation, validation failure paths (`VALIDATION_FAILED`), status-transition guard (no `*→closed` via `update`), granularity invariant rejection on both create and update, legacy-issue read tolerance on update (changes that don't modify `planRef`/`planTask` succeed).
- [x] **Verify tests fail**
- [x] **Implement** — `create()`: load via `_read()`, generate ID via counter, validate, granularity check, append to board, persist via `_write()`. `update()`: load, lookup by ID, merge changes, guard transitions + granularity, persist.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 11: `close()` with cascade and dependency guards [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 10
**Files:**
- Modify: `lib/issues/json-adapter.mjs`

**Tests:** `tests/lib/issues/json-adapter.test.mjs` (extend)

- [x] **Write failing tests** — Close on issue with open dependencies → `BLOCKED_BY_DEPENDENCIES`. Close on tiered parent with open children → `CASCADE_BLOCKED`. Successful close: sets `status: closed`, appends reason to `notes`, updates `updated`.
- [x] **Verify tests fail**
- [x] **Implement**
- [x] **Verify tests pass**
- [x] **Commit**

## Task 12: Read APIs `list()` / `get()` / `listEpics()` [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 5
**Files:**
- Modify: `lib/issues/json-adapter.mjs`

**Tests:** `tests/lib/issues/json-adapter.test.mjs` (extend)

- [x] **Write failing tests** — Filter parity with `FileAdapter` (status, type, epicId, priority). Sort by priority then created date. `get()` direct lookup returns issue or `null`. `listEpics()` returns only epics.
- [x] **Verify tests fail**
- [x] **Implement**
- [x] **Verify tests pass**
- [x] **Commit**

## Task 13: Legacy epic wrappers `createEpic()` / `updateEpic()` [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 10
**Files:**
- Modify: `lib/issues/json-adapter.mjs`

**Tests:** `tests/lib/issues/json-adapter.test.mjs` (extend)

- [x] **Write failing tests** — Thin wrappers around `create({ type: "epic", ...epicData })` and `update(id, changes)`. Same deprecation status as `FileAdapter`. `plan_ref` (snake_case epic-level field) preserved.
- [x] **Verify tests fail**
- [x] **Implement**
- [x] **Verify tests pass**
- [x] **Commit**

## Task 14: `addDependency()` with cycle detection [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 10
**Files:**
- Modify: `lib/issues/json-adapter.mjs`

**Tests:** `tests/lib/issues/json-adapter.test.mjs` (extend)

- [x] **Write failing tests** — Self-cycle (A depends on A) throws `CYCLE_DETECTED`. Indirect cycle (A → B → A) throws. Linear chain succeeds. Missing issue ID throws.
- [x] **Verify tests fail**
- [x] **Implement** — DFS walk on `deps[]` to detect cycle before appending.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 15: `walkTree()` prefix-match [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 12
**Files:**
- Modify: `lib/issues/json-adapter.mjs`

**Tests:** `tests/lib/issues/json-adapter.test.mjs` (extend)

- [x] **Write failing tests** — Tiered IDs (`epic-1`, `epic-1-feat-1`, `epic-1-feat-2`, etc.) — `walkTree('epic-1')` returns descendant IDs matching the prefix.
- [x] **Verify tests fail**
- [x] **Implement**
- [x] **Verify tests pass**
- [x] **Commit**

## Task 16: Legacy markdown read fallback in `JsonAdapter._read()` [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Tasks 1, 5
**Files:**
- Modify: `lib/issues/json-adapter.mjs`

**Tests:** `tests/lib/issues/json-adapter.test.mjs` (extend)

- [x] **Write failing tests** — `tasks.json` absent + `tasks.md` exists + `tasks.legacy_read != disabled` → parses `tasks.md` via `markdown-parser.mjs` and returns its data. First write creates `tasks.json` and leaves `tasks.md` intact. `LEGACY_FORMAT_DETECTED` advisory emitted once. `tasks.legacy_read = disabled` → returns empty board even if `tasks.md` exists. `JsonAdapter` source contains no `import` of `FileAdapter`.
- [x] **Verify tests fail**
- [x] **Implement** — In `_read()`, after JSON check, if file missing and legacy-read enabled, read `tasks.md` via `parseTasksMd`. Emit one-time advisory.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 17: `FileAdapter` write methods throw `BACKEND_READ_ONLY_DEPRECATED` [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 3
**Files:**
- Modify: `lib/issues/file-adapter.mjs`

**Tests:** `tests/lib/issues/file-adapter.test.mjs` (extend or split into a new file)

- [x] **Write failing tests** — Every write method on `FileAdapter` (`create`, `update`, `close`, `createEpic`, `updateEpic`, `addDependency`) throws `BACKEND_READ_ONLY_DEPRECATED` with the canonical advisory message. Reads (`list`, `get`, `listEpics`, `walkTree`) continue to work.
- [x] **Verify tests fail**
- [x] **Implement** — Wrap each write method's body with a deprecation throw using the canonical message from the spec's CON-5 section.
- [x] **Verify tests pass**
- [x] **Note:** This breaks tests in the existing FileAdapter suite that exercise write paths. Either (a) re-target them at `JsonAdapter` via Task 20's parameterized fixture, or (b) keep the original tests as `it.skip()` with a "moved to parity suite" comment. Prefer (a).
- [x] **Commit**

## Task 18: Registry extension [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Tasks 4, 17
**Files:**
- Modify: `lib/issues/registry.mjs`

**Tests:** `tests/lib/issues/registry.test.mjs` (extend)

- [x] **Write failing tests** — `getIssueManager({ tasks: { backend: 'json' } })` returns `JsonAdapter`. Empty `tasks.backend` returns `JsonAdapter` (new default) with an advisory line. `backend: 'file'` returns `FileAdapter` + emits `DEPRECATED_BACKEND` once. Unknown backend throws `UNKNOWN_BACKEND`.
- [x] **Verify tests fail**
- [x] **Implement** — Add `"json"` to `SUPPORTED_BACKENDS`. Switch default. Emit `DEPRECATED_BACKEND` warning on `"file"` selection.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 19: Manifest template default flip [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** —
**Files:**
- Modify: `templates/manifest.yaml`

**Tests:** `tests/cli.test.mjs` (existing scaffold test exercises the template)

- [x] **Write failing test** — Run `/adev:init`-equivalent scaffold flow; assert `tasks.backend: json` in the resulting manifest.
- [x] **Verify test fails**
- [x] **Implement** — Update `templates/manifest.yaml` `tasks` block: `backend: json`. Document `tasks.legacy_read` knob with `# default: enabled`.
- [x] **Verify test passes**
- [x] **Commit**

## Task 20: Conformance test + parameterized parity suite [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** unit
**Depends on:** Task 16
**Files:**
- Create: `tests/lib/issues/adapter-conformance.test.mjs`
- Create: `tests/lib/issues/json-adapter.parity.test.mjs`

**Tests:** Self-tests above

- [x] **Conformance test** — Assert `Object.getOwnPropertyNames(FileAdapter.prototype)` equals `Object.getOwnPropertyNames(JsonAdapter.prototype)` (modulo internal `_`-prefixed primitives). All public method names + arities match.
- [x] **Parity suite** — Wrap the FileAdapter read-side test cases in a parameterized helper that runs them against both adapters. Modulo the granularity-invariant rejection (which is JSON-specific), every assertion produces equivalent results.
- [x] **Source check** — Grep `JsonAdapter` source: must contain no `import` of `FileAdapter`. CI assertion.
- [x] **Architectural test** — Grep all writes to `tasks.json`: must go through `_write()` only (no `writeFile`/`writeFileSync` directly targeting `tasks.json` outside `_write`).
- [x] **Commit**

## Task 21: Atomic + concurrent + performance tests [specialist: none]

**Charter capability:** JSON issue board + adapter
**Strategy:** integration (low-medium confidence)
**Depends on:** Task 16
**Files:**
- Create: `tests/lib/issues/json-adapter.atomic.test.mjs`
- Create: `tests/lib/issues/json-adapter.concurrent.test.mjs`
- Create: `tests/lib/issues/json-adapter.perf.test.mjs`

**Tests:** Self-tests above

- [x] **Atomic-write fault injection** — Kill process mid-write (between temp-file write and rename); assert prior `tasks.json` content unchanged and orphaned temp file is cleaned up on retry.
- [x] **Concurrent multi-update** — Spawn N concurrent `update()` calls on distinct issues; assert all updates persisted (last-writer-wins semantics expected at the file granularity, but per-issue mutations all preserved within a single read-modify-write cycle).
- [x] **Performance baseline** — Create a 1000-issue board fixture; assert `list()`, `create()`, `update()` complete within one order of magnitude of `FileAdapter` baseline.
- [x] **Commit**

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in `.validate.md`, not in this plan.

- Tests pass: `npm test`
- No new dependencies in `package.json`
- All files are `.mjs` ESM
- Test coverage on `lib/issues/json-adapter.mjs` ≥ 90% lines
- Test coverage on `lib/issues/markdown-parser.mjs` ≥ 90% lines
- All 22 acceptance criteria from `json-issue-board-adapter.spec.md` satisfied
- No constitutional violations
- Performance targets met (within 10× FileAdapter baseline)
