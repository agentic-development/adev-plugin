# Live Spec: JSON Issue Board + Adapter

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->

---
charter: agent-reliable-state-artifacts
status: review-passed
risk_level: high
milestone: 0.26.0
revision: 3
charter-revision: 3
created: 2026-05-11
updated: 2026-05-11
---

## Behavioral Contract

This spec defines a new storage backend for the adev issue board: `.context-index/tasks/tasks.json`, written and read by `lib/issues/json-adapter.mjs`. The adapter implements the existing `IssueManagerInterface` (the contract shared with `FileAdapter` and `BeadsAdapter`) with identical method signatures, return shapes, and error codes — only the on-disk format and parsing logic differ. Writes go through an atomic temp-then-rename, mirroring the `lib/build-state.mjs` pattern. The document schema is `{ version, epics[], issues[] }`; schema evolution is by optional fields with defaults, not by parser-variant branches. The registry (`lib/issues/registry.mjs`) gains `"json"` as a supported backend value and treats it as the new default for fresh scaffolds. The markdown backend (`"file"`) continues to work in read-only-deprecated mode for one release cycle. The adapter enforces the post-migration board-granularity invariant: any `create` or `update` call that would land an issue with both `planRef` and `planTask` set is rejected — plan-task state belongs in the lifecycle event log, not on the board. Storage root resolution uses the existing `resolveStorageRoot()` helper so `tasks.json` continues to be shared across git worktrees. Optional legacy-read support reads `tasks.md` when `tasks.json` is absent (governed by `tasks.legacy_read` knob); writes never go to markdown.

## Naming Conventions (CON-1, CON-8, CON-9)

Three distinct naming domains, each with its own convention preserved on purpose:

- **Issue fields (camelCase + later snake_case):** `id`, `title`, `status`, `priority`, `type`, `epicId`, `planRef`, `planTask` (camelCase); `spec_ref`, `next_action` (snake_case, later-added by previous specs). Preserved verbatim from existing `FileAdapter` / `IssueManagerInterface` to keep the parity invariant intact.
- **Epic fields (snake_case for plan link):** `id`, `title`, `status`, `milestone`, `created`, `updated` (lowercase + camelCase), with `plan_ref` (snake_case) for the optional plan pointer. Epics never carried a `planTask` field, so the granularity invariant (next section) is not applicable to epics — they may reference a plan via `plan_ref` without violation.
- **Event-discriminator names (snake_case):** owned by the sibling `lifecycle-event-log` spec (`plan_task`, `lifecycle_step`, etc.).
- **StateProjection fields (camelCase):** also owned by the sibling spec (`currentStep`, `currentTask`, `planTasks`, etc.). This adapter does not emit projection objects; consumers should consult the sibling spec for projection field names.

Implementers must **not** rename Issue/Epic fields during this work — that would break `IssueManagerInterface` parity.

## Granularity invariant scope (CON-8)

The board-granularity invariant ("plan-task state lives in the lifecycle log, not on the board") applies to **Issues only**. Specifically:

- An Issue may not carry `planTask` non-null. The adapter rejects writes that would.
- An Issue may carry `planRef` (pointer to a plan file) alone. This is permitted — it merely references a plan; no per-task state is implied.
- Epics may carry `plan_ref` (the snake_case epic-level field). Epics have never had a `planTask` field; no invariant applies. `plan_ref` on epics is a stable epic→plan link and is not affected by this charter.

## Path Safety (SEC-2)

The adapter enforces path-containment defenses on every public method that takes a `projectRoot`:

1. **`projectRoot` normalization.** The constructor resolves `projectRoot` via `path.resolve()` and asserts it contains `.context-index/manifest.yaml`. If validation fails, the constructor throws `INVALID_PROJECT_ROOT`.
2. **Storage-path containment.** The resolved storage root from `resolveStorageRoot()` plus the constant suffix `.context-index/tasks/tasks.json` is computed once at construction time and reused. Any path used by `_write()` (including the temp file) must satisfy `resolvedPath.startsWith(resolvedStorageRoot + sep + '.context-index' + sep + 'tasks' + sep)`. If not, throw `INVALID_STORAGE_PATH`. Defeats traversal via crafted manifests (CWE-22).
3. **Sibling-spec parity.** This adapter applies the same `projectRoot` normalization contract as `lib/lifecycle-state.mjs`, so the two modules cannot diverge on path safety.

## `"file"` backend deprecation semantics (CON-5)

Reconciliation with the charter: the charter declares `"file"` is **read-only-deprecated for one release cycle**. This spec aligns:

- When `manifest.tasks.backend === "file"`, the registry returns a `FileAdapter` instance, BUT every write method on that instance throws `BACKEND_READ_ONLY_DEPRECATED` with the advisory message: "The `file` (markdown) backend is read-only. Run `adev migrate` to upgrade to JSON, or set `tasks.backend: json` in `manifest.yaml`."
- Reads continue to function normally through `FileAdapter`.
- Removal of the `FileAdapter` write paths is the implementation work for this spec; it is NOT delegated to the migration tool spec.
- This is a behavior change from today's `FileAdapter` (which permits writes). The migration tool spec accounts for this: existing projects on `backend: file` either migrate (auto-flips to `json`) or accept read-only.

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
| Extract shared markdown parser | Lift the parsing logic in `FileAdapter._read()` into a new module `lib/issues/markdown-parser.mjs` exporting a `parseTasksMd(contents) → { version, epics, issues }` pure function (SA-3). `FileAdapter._read()` becomes a thin wrapper around it; `JsonAdapter` legacy-read path consumes it directly without reaching into `FileAdapter`. | small |
| Legacy markdown read fallback | When `tasks.json` is absent but `tasks.md` exists AND `tasks.legacy_read != disabled`, call `parseTasksMd()` from `lib/issues/markdown-parser.mjs` to parse the legacy file and return its data. The first subsequent write creates `tasks.json` from the parsed data; legacy file is left untouched. | medium |
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
- [ ] `manifest.tasks.backend = "file"` continues to return `FileAdapter`, with a one-time `DEPRECATED_BACKEND` console warning. Reads continue to work; writes throw `BACKEND_READ_ONLY_DEPRECATED` (CON-5). Test fixture asserts read works and every write method throws.
- [ ] `lib/issues/markdown-parser.mjs` exports `parseTasksMd(contents)` (SA-3). `FileAdapter._read()` delegates to it. `JsonAdapter` legacy-read consumes it directly. Architectural test: `JsonAdapter` source contains no import of `FileAdapter`.
- [ ] Path-containment defenses are enforced (SEC-2): any `projectRoot` lacking `.context-index/manifest.yaml` throws `INVALID_PROJECT_ROOT`; any path resolution outside `.context-index/tasks/` throws `INVALID_STORAGE_PATH`. Test exercises traversal payloads.
- [ ] `MALFORMED_BOARD` errors include only the parser's line/column and a 200-character non-printable-stripped context prefix (SEC-1). Raw file content is not embedded in the message.
- [ ] `UNSUPPORTED_BOARD_VERSION` coerces `version` to `Number(v)` and validates it is a finite integer before interpolating into the error message. Non-numeric values use a fixed fallback message (SEC-4).
- [ ] Granularity invariant rejects `planTask`-only writes (SA-2). `create({ planTask: "t1" })` and `update(id, { planTask: "t1" })` both throw `BOARD_GRANULARITY_VIOLATION`. Legacy issues with both fields present are tolerated on read but cannot be modified to a state where `planTask` is set to any non-null value (CON-3).
- [ ] Writers always emit `version: 2` regardless of the version read on the input file (SA-5).
- [ ] Default-flip behavior for existing `tasks.md`-only projects emits `LEGACY_FORMAT_DETECTED` advisory on first write (SA-4). Test fixture exercises this transition.
- [ ] When `tasks.json` is absent AND `tasks.md` exists AND `tasks.legacy_read != disabled`, `JsonAdapter` reads the legacy markdown via `lib/issues/markdown-parser.mjs` (the extracted shared helper from SA-3) — NOT via `FileAdapter` — and surfaces the parsed data. The first subsequent write creates `tasks.json`; the legacy `tasks.md` is left intact (untouched). Test fixture exercises this path.
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
- **When** `create({ planRef, planTask })` is called with both `planRef` AND `planTask` non-null **then** the call is rejected with `BOARD_GRANULARITY_VIOLATION` and the board is unchanged.
- **When** `create({ planTask })` is called with `planTask` non-null (regardless of whether `planRef` is set) **then** the call is rejected with `BOARD_GRANULARITY_VIOLATION` (SA-2). Plan-task state — bound or unbound — belongs in the lifecycle event log, not on the board. Solo `planRef` (without `planTask`) is permitted, since it merely points at a plan file and carries no per-task state.
- **When** `update(id, changes)` is called with changes that would set `planTask` to a non-null value on the resulting issue **then** the call is rejected with `BOARD_GRANULARITY_VIOLATION` and the board is unchanged.
- **When** `update(id, changes)` is called on a **legacy issue** (created before this charter landed) that already has `planRef` AND `planTask` populated, AND the `changes` payload does NOT modify those two fields **then** the update proceeds normally; existing legacy data is preserved. The update may explicitly null both fields to clear the legacy state, but cannot set `planTask` to any non-null value.
- **When** `_read()` parses `tasks.json` and finds a legacy issue with both `planRef` and `planTask` populated **then** the issue is returned to callers as-is (read tolerance — CON-3). No write or repair is triggered on read. The legacy issue persists in the board until migrated or manually cleared. Tolerance window: indefinite; deletion of legacy `planTask` fields is a future migration concern, not in scope here.
- **When** the registry is called with `manifest.tasks.backend === "json"` **then** a `JsonAdapter` instance is returned.
- **When** the registry is called with no `tasks.backend` configured **then** a `JsonAdapter` instance is returned (new default), AND a one-time advisory log line names `"json"` as the resolved default for clarity.
- **When** the registry is called with `manifest.tasks.backend === "file"` **then** a `FileAdapter` instance is returned AND a one-time `DEPRECATED_BACKEND` console warning is emitted advising users to migrate to `"json"`. All write methods on that adapter throw `BACKEND_READ_ONLY_DEPRECATED` (CON-5); reads continue to work.
- **When** an existing project has no `tasks.json` AND no `tasks.md` AND `tasks.backend` is unset **then** the registry returns a `JsonAdapter` (new default), `init()` creates an empty `tasks.json`, and no advisory is emitted (clean greenfield).
- **When** an existing project has `tasks.md` but no `tasks.json` AND `tasks.backend` is unset **then** the registry returns a `JsonAdapter`. If `tasks.legacy_read` is enabled (default), the adapter reads `tasks.md` via the shared markdown parser (see SA-3 below) and returns its data. The first write call creates `tasks.json` from the parsed data, leaves `tasks.md` intact, and emits a one-time `LEGACY_FORMAT_DETECTED` advisory recommending `adev migrate` for an explicit conversion (SA-4).
- **When** `tasks.json` contains a top-level `version` value greater than `2` **then** the reader proceeds normally — unknown fields on epics/issues are preserved on read and re-emitted on write, ensuring future-version files can be read by older adapters without data loss.
- **When** `tasks.json` is absent but `tasks.md` exists AND `tasks.legacy_read != disabled` **then** the adapter parses `tasks.md` via the shared `lib/issues/markdown-parser.mjs` helper (extracted from the existing `FileAdapter._read()` logic — see SA-3 in this spec) and returns its data. `JsonAdapter` does not call `FileAdapter` directly. The next write call creates `tasks.json` and leaves `tasks.md` untouched.
- **When** `tasks.legacy_read = disabled` AND `tasks.json` is absent **then** the adapter returns the empty board, regardless of whether `tasks.md` exists.
- **When** `_write()` cannot complete the rename step (permission, disk full) **then** the temp file is left orphaned, the underlying `fs` error is surfaced to the caller, and `tasks.json` remains in its prior state.
- **When** any caller writes to `tasks.json` via a non-`_write()` primitive **then** a CI architectural test catches it and fails the build.
- **When** `JsonAdapter` is constructed in a git worktree **then** `resolveStorageRoot()` resolves to the main repo's `.context-index/`, ensuring the board is shared across worktrees (existing behavior preserved).

## Postconditions

- After a successful `init()`, `tasks.json` exists and contains a syntactically valid empty board with `version: 2`.
- After a successful write call, `tasks.json` is a complete, parseable JSON document whose top-level shape is `{ version, epics, issues }` — no partial writes are observable.
- After any rejected write (granularity violation, validation error, dependency cycle), `tasks.json` is byte-for-byte identical to its pre-call state. No partial mutation persists.
- After a `_write()`, no temp file from that operation remains on disk in either the success or the failure path. Failure paths invoke a best-effort `fs.unlinkSync` (swallowing errors) on the temp file before re-throwing the original error to the caller. This mirrors the cleanup behavior of `lib/build-state.mjs::atomicWriteJson`. (CON-6)
- After legacy-read fallback, the returned data structure is indistinguishable in shape from a fresh `tasks.json` parse. Callers cannot tell which file was the source unless they inspect filesystem state.
- After a registry call, the returned adapter conforms to the `IssueManagerInterface` regardless of which backend resolved.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `create({ planRef, planTask })` with both fields non-null | Throws with descriptive message: "Board granularity violation: plan tasks belong in the lifecycle event log, not on the issue board. See `lib/lifecycle-state.mjs::reportPlanTask`." | BOARD_GRANULARITY_VIOLATION |
| `update(id, changes)` where merged result has both `planRef` and `planTask` non-null | Throws as above | BOARD_GRANULARITY_VIOLATION |
| `tasks.json` exists but is malformed JSON | Throws `MALFORMED_BOARD` with the line/column from `JSON.parse` and a fixed-length 200-character prefix of the surrounding context with non-printable characters stripped (SEC-1). Adapter does not attempt repair. | MALFORMED_BOARD |
| `tasks.json` exists but top-level shape is not `{ version, epics, issues }` | Throws `INVALID_BOARD_SHAPE` with a description of the expected shape | INVALID_BOARD_SHAPE |
| `tasks.json` has `version < 2` (coerced to a finite integer via `Number(v)`) or `version` is non-numeric | Throws `UNSUPPORTED_BOARD_VERSION` advising the user to run `adev migrate`. If `version` is non-numeric or cannot be coerced, the thrown message uses a fixed-string fallback ("version field is not a valid integer") rather than interpolating the raw value (SEC-4). | UNSUPPORTED_BOARD_VERSION |
| Caller passes a `projectRoot` that does not contain `.context-index/manifest.yaml` after `path.resolve()` | Throws `INVALID_PROJECT_ROOT` with the resolved path (SEC-2) | INVALID_PROJECT_ROOT |
| Any internal path resolution yields a target outside `.context-index/tasks/` | Throws `INVALID_STORAGE_PATH` (SEC-2 / CWE-22) | INVALID_STORAGE_PATH |
| Any write call (`create`, `update`, `close`, `createEpic`, `updateEpic`, `addDependency`) invoked on a `FileAdapter` returned by registry under `manifest.tasks.backend === "file"` | Throws `BACKEND_READ_ONLY_DEPRECATED` with the canonical advisory message defined in the "`file`" backend deprecation semantics" section (CON-5): "The `file` (markdown) backend is read-only. Run `adev migrate` to upgrade to JSON, or set `tasks.backend: json` in `manifest.yaml`." This is the single source of the message; do not paraphrase. | BACKEND_READ_ONLY_DEPRECATED |
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
