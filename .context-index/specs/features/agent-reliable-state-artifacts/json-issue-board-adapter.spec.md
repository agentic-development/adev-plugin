# Live Spec: JSON Issue Board + Adapter

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->

---
charter: agent-reliable-state-artifacts
status: review-pending
risk_level: high
milestone: 0.26.0
revision: 1
charter-revision: 2
created: 2026-05-11
updated: 2026-05-11
---

## Behavioral Contract

This spec defines a new storage backend for the adev issue board: `.context-index/tasks/tasks.json`, written and read by `lib/issues/json-adapter.mjs`. The adapter implements the existing `IssueManagerInterface` (the contract shared with `FileAdapter` and `BeadsAdapter`) with identical method signatures, return shapes, and error codes — only the on-disk format and parsing logic differ. Writes go through an atomic temp-then-rename, mirroring the `lib/build-state.mjs` pattern. The document schema is `{ version, epics[], issues[] }`; schema evolution is by optional fields with defaults, not by parser-variant branches. The registry (`lib/issues/registry.mjs`) gains `"json"` as a supported backend value and treats it as the new default for fresh scaffolds. The markdown backend (`"file"`) continues to work in read-only-deprecated mode for one release cycle. The adapter enforces the post-migration board-granularity invariant: any `create` or `update` call that would land an issue with both `planRef` and `planTask` set is rejected — plan-task state belongs in the lifecycle event log, not on the board. Storage root resolution uses the existing `resolveStorageRoot()` helper so `tasks.json` continues to be shared across git worktrees. Optional legacy-read support reads `tasks.md` when `tasks.json` is absent (governed by `tasks.legacy_read` knob); writes never go to markdown.

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies because the adapter uses only `node:fs`, `node:path`, and `node:crypto` (for temp-file suffix). No YAML/JSON library is added — `JSON.parse`/`JSON.stringify` are built-in.
- **Principle:** "Pure ESM — all `.mjs` files" — Applies because `lib/issues/json-adapter.mjs` is authored in ESM and consumed by ESM callers (the registry, every lifecycle skill via the issue manager).
- **Principle:** "Skills are primarily markdown" — Applies because the adapter is a passive helper invoked by skills; no skill logic moves into the adapter. The `IssueManagerInterface` stability invariant means existing skill instructions referencing adapter methods need no change for the adapter swap.
- **Architecture Boundary (Autonomous):** "Refactoring within a module's boundaries" — Applies because adding a new adapter and extending the registry both live inside the `agent-reliable-state-artifacts` module scope laid out in the charter.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| `tasks.json` document schema | Define the `{ version: 2, epics: [], issues: [] }` shape. Document required vs. optional fields per entity. Version field semantics: readers tolerate higher versions; writers always emit current version. | small |
| `lib/issues/json-adapter.mjs` skeleton | Class with constructor `(projectRoot, opts)` and stubs for every `IssueManagerInterface` method. Resolves storage root via existing `resolveStorageRoot()`. | small |
| `_read()` / `_write()` primitives | `_read()` reads `tasks.json`, parses, returns `{ version, epics, issues }`. `_write()` serializes with `JSON.stringify(data, null, 2) + "\n"` and uses temp-then-rename (mirror `lib/build-state.mjs::atomicWriteJson`). Creates parent dir if missing. | small |
| `init()` | Idempotent: if `tasks.json` exists, no-op. If absent, write minimal `{ version: 2, epics: [], issues: [] }`. Creates `.context-index/tasks/` directory. | small |
| `create(issueData)` | Unified create matching `FileAdapter`'s semantics: tier-prefix inference, legacy `issue-N` / `epic-N` counter generation, validation. Enforces board-granularity invariant (rejects `planRef`+`planTask`). | medium |
| `update(id, changes)` | Same semantics as `FileAdapter::update`. Status-transition guard preserved (no `*→closed` via update). Enforces board-granularity invariant. | medium |
| `close(id, reason)` | Same semantics: cascade guard for tiered IDs, dependency guard for closing blockers. | medium |
| `list(filters)` | Same filtering semantics. Sort by priority then created date. | small |
| `get(id)` | Direct lookup. | small |
| `listEpics(filters)` | Epic-only list. | small |
| `createEpic(epicData)` / `updateEpic(id, changes)` | Legacy wrappers preserved for backward compatibility. Same deprecation status as in `FileAdapter`. | small |
| `addDependency(issueId, dependsOnId)` | Same cycle-detection semantics as `FileAdapter`. | small |
| `walkTree(parentId)` | Same prefix-match semantics; returns descendant tiered IDs. | small |
| Legacy markdown read fallback | When `tasks.json` is absent but `tasks.md` exists AND `tasks.legacy_read != disabled`, invoke `FileAdapter._read()` to parse the legacy file and return its data. The first subsequent write creates `tasks.json` from the parsed data; legacy file is left untouched. | medium |
| Board-granularity validator | Internal helper called from `create`/`update`. Rejects any issue payload with both `planRef` and `planTask` set, throwing `BOARD_GRANULARITY_VIOLATION` with a descriptive message pointing at the lifecycle log. | small |
| Registry extension | Update `lib/issues/registry.mjs`: add `"json"` to `SUPPORTED_BACKENDS`; instantiate `JsonAdapter` when `manifest.tasks.backend === "json"`; make `"json"` the default when the manifest field is absent (was `"file"`). Mark `"file"` as deprecated in the docstring. | small |
| Manifest schema doc | Update `templates/manifest.yaml` (the scaffold template) to set `tasks.backend: json` for new projects. Document `tasks.legacy_read` knob. | small |
| Interface-conformance test | Architectural test that asserts `JsonAdapter` and `FileAdapter` expose the same set of method names with the same arity. CI gate. | small |
| Parity test suite | Every test in `tests/lib/issues-file-adapter.test.mjs` re-run against `JsonAdapter` (parameterized fixture). Both adapters must produce equivalent results (modulo the granularity-invariant rejection). | large |
| Atomic-write fault-injection test | Kill mid-write; assert reader sees the prior consistent state, not a partial write. | medium |
| Concurrent-write test | Spawn N concurrent updates on different issues; assert all updates are persisted, none silently overwritten beyond last-writer-wins semantics expected from temp-then-rename. | medium |
| Performance test | Microbench: 1000-issue `list()` and per-issue `update()` ≤ one order of magnitude slower than current `FileAdapter`. | small |
| Coverage target | ≥ 90% line coverage on `lib/issues/json-adapter.mjs` and the registry extension. | small |

## Visual Expectations

Not applicable — the adapter is a passive library module. The on-demand `tasks.md` rendering is the separate markdown-rendering-layer spec.

## Acceptance Criteria

- [ ] `lib/issues/json-adapter.mjs` exports a `JsonAdapter` class implementing every method of `IssueManagerInterface` (`init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`).
- [ ] An architectural conformance test asserts that `JsonAdapter` and `FileAdapter` have identical public method names and arities. CI gate.
- [ ] Every test in the existing FileAdapter test suite is parameterized to run against `JsonAdapter` and passes (modulo the new board-granularity invariant rejection — see next criterion).
- [ ] Any `create({ planRef, planTask })` or `update(id, { planRef, planTask })` call (where both fields are present and non-null) is rejected with `BOARD_GRANULARITY_VIOLATION`. Test asserts both the error code and a human-readable message pointing at the lifecycle log.
- [ ] All writes to `tasks.json` use atomic temp-then-rename. Grep test asserts no `writeFile`/`writeFileSync` directly targets `tasks.json` outside the `_write()` primitive. CI gate.
- [ ] `lib/issues/registry.mjs` includes `"json"` in `SUPPORTED_BACKENDS`. Returns `JsonAdapter` when `manifest.tasks.backend === "json"`. Returns `JsonAdapter` (not `FileAdapter`) when `tasks.backend` is absent — `"json"` is the new default.
- [ ] `manifest.tasks.backend = "file"` continues to return `FileAdapter`, with a one-time `DEPRECATED_BACKEND` console warning advising users to migrate. Reads via `FileAdapter` continue to work; writes continue to work (deprecation is advisory, not enforced).
- [ ] When `tasks.json` is absent AND `tasks.md` exists AND `tasks.legacy_read != disabled`, `JsonAdapter` reads the legacy markdown via `FileAdapter` and surfaces the parsed data. The first subsequent write creates `tasks.json`; the legacy `tasks.md` is left intact (untouched). Test fixture exercises this path.
- [ ] When `tasks.legacy_read = disabled`, no legacy-read attempt is made; an empty board is returned if `tasks.json` is absent.
- [ ] Storage root resolution uses `resolveStorageRoot()` from `lib/issues/resolve-root.mjs`. Worktree-shared storage continues to work (verified by an existing test re-run against `JsonAdapter`).
- [ ] `tasks.json` schema includes a top-level `version: 2` field. Readers parse files with `version >= 2`; unknown additional fields on epics/issues are preserved on read and re-emitted on write (forward compatibility).
- [ ] All constitution quality gates pass: `npm test` green, no new dependencies in `package.json`, all files are `.mjs` ESM.
- [ ] No constitutional violations.
- [ ] Test coverage on `lib/issues/json-adapter.mjs` ≥ 90% lines. Coverage on the registry's new code path ≥ 90% lines.
- [ ] Performance: `create`, `update`, `close`, `list` operations on a 1000-issue board complete within one order of magnitude of `FileAdapter` baseline. Measured by `node --test` perf assertions.
- [ ] Atomic-write fault-injection test passes: a process killed mid-write leaves either the prior consistent state or no change, never a partial document. Reader never observes truncated JSON.
- [ ] `templates/manifest.yaml` (the project scaffold template) sets `tasks.backend: json` for new projects. New scaffolds default to JSON without user intervention.

## Preconditions

- The project has a `.context-index/` directory (created by `/adev:init`).
- The project has a `manifest.yaml`. The adapter tolerates missing `tasks.backend` (defaults to `"json"`).
- `lib/issues/interface.mjs` (the `IssueManagerInterface` definition) exists with its current method set.
- `lib/issues/file-adapter.mjs` and `lib/issues/beads-adapter.mjs` exist and continue to be importable — this spec does not modify either.
- `lib/issues/resolve-root.mjs` exists with the `resolveStorageRoot()` export.
- `lib/build-state.mjs` exists with the `atomicWriteJson` pattern (mirrored by this adapter's `_write()`).
- Node.js runtime with `node:fs`, `node:path`, `node:crypto`, `JSON.parse`, `JSON.stringify` available (existing constitution baseline).

## Behaviors

- **When** `JsonAdapter` is instantiated for a project where `tasks.json` does not exist **then** subsequent reads return an empty board `{ version: 2, epics: [], issues: [] }` (or, if `tasks.legacy_read` is enabled and `tasks.md` exists, the legacy data parsed via `FileAdapter`).
- **When** `init()` is called and `tasks.json` is absent **then** the file is created with `{ version: 2, epics: [], issues: [] }` and the `.context-index/tasks/` directory is created if missing.
- **When** `init()` is called and `tasks.json` already exists **then** it is left unchanged (idempotent no-op).
- **When** any write method (`create`, `update`, `close`, `createEpic`, `updateEpic`, `addDependency`) mutates the board **then** the write is performed via temp-then-rename: a unique temp file is written with the full new JSON, then renamed onto `tasks.json` atomically. Readers concurrent with the write see either the prior state or the new state, never a partial state.
- **When** `create({ planRef, planTask })` is called with both `planRef` AND `planTask` set to non-null values **then** the call is rejected with `BOARD_GRANULARITY_VIOLATION` and the board is unchanged.
- **When** `update(id, changes)` is called with changes that would result in the issue having both `planRef` AND `planTask` non-null **then** the call is rejected with `BOARD_GRANULARITY_VIOLATION` and the board is unchanged. (Existing legacy issues with both fields populated are tolerated on read; they cannot be re-validated into existence.)
- **When** the registry is called with `manifest.tasks.backend === "json"` **then** a `JsonAdapter` instance is returned.
- **When** the registry is called with no `tasks.backend` configured **then** a `JsonAdapter` instance is returned (new default), AND a one-time advisory log line names `"json"` as the resolved default for clarity.
- **When** the registry is called with `manifest.tasks.backend === "file"` **then** a `FileAdapter` instance is returned AND a one-time `DEPRECATED_BACKEND` console warning is emitted advising users to migrate to `"json"`.
- **When** `tasks.json` contains a top-level `version` value greater than `2` **then** the reader proceeds normally — unknown fields on epics/issues are preserved on read and re-emitted on write, ensuring future-version files can be read by older adapters without data loss.
- **When** `tasks.json` is absent but `tasks.md` exists AND `tasks.legacy_read != disabled` **then** the adapter parses `tasks.md` via `FileAdapter._read()` and returns its data. The next write call creates `tasks.json` and leaves `tasks.md` untouched.
- **When** `tasks.legacy_read = disabled` AND `tasks.json` is absent **then** the adapter returns the empty board, regardless of whether `tasks.md` exists.
- **When** `_write()` cannot complete the rename step (permission, disk full) **then** the temp file is left orphaned, the underlying `fs` error is surfaced to the caller, and `tasks.json` remains in its prior state.
- **When** any caller writes to `tasks.json` via a non-`_write()` primitive **then** a CI architectural test catches it and fails the build.
- **When** `JsonAdapter` is constructed in a git worktree **then** `resolveStorageRoot()` resolves to the main repo's `.context-index/`, ensuring the board is shared across worktrees (existing behavior preserved).

## Postconditions

- After a successful `init()`, `tasks.json` exists and contains a syntactically valid empty board with `version: 2`.
- After a successful write call, `tasks.json` is a complete, parseable JSON document whose top-level shape is `{ version, epics, issues }` — no partial writes are observable.
- After any rejected write (granularity violation, validation error, dependency cycle), `tasks.json` is byte-for-byte identical to its pre-call state. No partial mutation persists.
- After a `_write()`, no temp file from that operation remains on disk in the success path. On failure paths, an orphaned temp file may remain; cleanup is a future concern.
- After legacy-read fallback, the returned data structure is indistinguishable in shape from a fresh `tasks.json` parse. Callers cannot tell which file was the source unless they inspect filesystem state.
- After a registry call, the returned adapter conforms to the `IssueManagerInterface` regardless of which backend resolved.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `create({ planRef, planTask })` with both fields non-null | Throws with descriptive message: "Board granularity violation: plan tasks belong in the lifecycle event log, not on the issue board. See `lib/lifecycle-state.mjs::reportPlanTask`." | BOARD_GRANULARITY_VIOLATION |
| `update(id, changes)` where merged result has both `planRef` and `planTask` non-null | Throws as above | BOARD_GRANULARITY_VIOLATION |
| `tasks.json` exists but is malformed JSON | Throws `MALFORMED_BOARD` with the underlying `JSON.parse` error location. Adapter does not attempt repair. | MALFORMED_BOARD |
| `tasks.json` exists but top-level shape is not `{ version, epics, issues }` | Throws `INVALID_BOARD_SHAPE` with a description of the expected shape | INVALID_BOARD_SHAPE |
| `tasks.json` has `version < 2` | Throws `UNSUPPORTED_BOARD_VERSION` advising the user to run `adev migrate`. (Anticipates the migration spec.) | UNSUPPORTED_BOARD_VERSION |
| `_write()` rename step fails (disk full, permission) | Propagates the underlying `fs` error code unchanged. `tasks.json` is unchanged. Orphaned temp file may remain. | FS_ERROR |
| `_write()` temp-file write step fails | Propagates `fs` error. No rename attempted. `tasks.json` unchanged. | FS_ERROR |
| Registry called with `manifest.tasks.backend === "file"` | Returns `FileAdapter`, emits one-time `DEPRECATED_BACKEND` warning. Not an error. | — (warning only) |
| Registry called with an unknown backend value (e.g., `"sqlite"`) | Throws `UNKNOWN_BACKEND` matching existing registry semantics | UNKNOWN_BACKEND |
| Legacy-read fallback fails to parse `tasks.md` | Propagates `FileAdapter`'s parse error unchanged; the adapter does not silently swallow it | FILE_ADAPTER_PARSE_ERROR |
| Caller writes to `tasks.json` via any non-`_write()` path | CI architectural test fails the build | ARCH_VIOLATION_DIRECT_WRITE |
| `create()` / `update()` called with validation errors (missing required field, invalid status, etc.) | Same error codes as `FileAdapter` (e.g., `VALIDATION_FAILED`, `INVALID_STATUS_TRANSITION`) — parity with existing semantics | (same as FileAdapter) |
| `close()` called on an issue with unclosed dependencies | Throws `BLOCKED_BY_DEPENDENCIES` (parity with `FileAdapter`) | BLOCKED_BY_DEPENDENCIES |
| `close()` called on a tiered parent with unclosed children | Throws `CASCADE_BLOCKED` (parity with `FileAdapter`) | CASCADE_BLOCKED |
| `addDependency()` creating a cycle | Throws `CYCLE_DETECTED` (parity with `FileAdapter`) | CYCLE_DETECTED |
