# Live Spec: Concurrent-write protection for the JSON issue board (CAS over atomic rename)

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     Closes a gap in the charter's Quality Attributes table: the existing
     "Concurrent-write safety" target covers appendEvent (JSONL) only and
     leaves the JSON issue board (tasks.json) unprotected. Charter is approved
     at revision 6; spec is filed as a charter-extension rather than
     blocking on a charter amendment. Roll the new capability + QA row into
     charter revision 7 in a follow-up sweep.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md
     Revision 2 (2026-05-17): Addresses review warnings SA-1/2/3/5, CON-1/3/5,
     and suggestions SEC-1, CON-4, CON-6. The CAS field is renamed from
     `revision` to `seq` to disambiguate from the schema `version` field and
     the spec frontmatter's own `revision`. Error codes renamed to follow the
     subject-first BOARD_* convention. -->

---
charter: agent-reliable-state-artifacts
kind: behavioral
status: validated
risk_level: high
milestone: 0.26.0
revision: 2
charter-revision: 6
charter-extension: true
created: 2026-05-17
updated: 2026-05-17
tracker-ref: issue-459
---

## Behavioral Contract

<!-- The JSON issue board adapter (lib/issues/json-adapter.mjs) currently
     does atomic-rename writes but no per-write sequence check. Two
     concurrent mutators reading the same on-disk snapshot will silently
     overwrite each other (lost update). This spec adds optimistic CAS
     using a monotonic `seq` field on the board document.

     Terminology note: `seq` (sequence) is the CAS revision counter on
     the document, distinct from the schema-version field `version: 2`
     (which signals on-disk format) and from the spec's own frontmatter
     `revision: N` (which tracks this spec document's revisions). -->

### Preconditions

- `.context-index/tasks/tasks.json` exists and is a valid v2 board document, OR is absent (treated as empty + `seq: 0`).
- The adapter is loaded via `getIssueManager(manifest)` with `tasks.backend: json`.
- No external file lock is held; this design assumes concurrent processes coordinate purely through the file's `seq` field plus POSIX atomic rename.

### Behaviors

1. **When** any mutating operation (`create`, `update`, `close`, `addDependency`, `createEpic`, `updateEpic`) is invoked **then** the adapter performs a read-modify-write cycle that captures the on-disk `seq`, stages the mutation against the captured snapshot, and writes only if the on-disk `seq` is still equal to the captured value.

2. **When** a stale-write conflict is detected (on-disk `seq` ≠ captured `seq` at write time) **then** the adapter discards the staged document, re-reads the current snapshot, re-applies the same logical mutation against it, and retries the write — up to `MAX_CAS_RETRIES` (default 3) times.

3. **When** all retries are exhausted **then** the adapter throws `STALE_BOARD_WRITE` with a message naming the operation, the captured `seq`, the latest on-disk `seq`, and the retry count.

4. **When** a successful write completes **then** the written document carries `seq = captured + 1`. The schema-version field `version` is unchanged (still `2`); `seq` is a separate monotonic integer.

5. **When** the adapter reads a board document that lacks a `seq` field (legacy `tasks.json` written by the pre-CAS adapter) **then** the missing field is treated as `seq: 0`. The next successful write stamps `seq: 1` without any schema-version bump or `adev migrate` invocation.

6. **When** the adapter writes a document **then** the final on-disk bytes appear in a single POSIX-atomic step (existing temp+rename remains the substrate); no reader observes a partial or torn document.

7. **When** the mutation logic is non-idempotent across retry attempts (e.g., `nextChildId` would assign a different ID against a newer snapshot) **then** the retry re-derives all derived fields (IDs, timestamps, `updated`) from the freshly-read snapshot rather than reusing the staged values from the prior attempt.

8. **When** N concurrent mutating operations execute against the same `tasks.json` **then** each operation either lands successfully (incrementing `seq` by 1) or throws `STALE_BOARD_WRITE` deterministically when its retry budget is exhausted. **Under POSIX rename semantics, the re-read→rename window is not strictly atomic**, so a precise upper-bound guarantee like "all N land if retries do not exhaust" is best-effort, not absolute. The contractual guarantee is: every mutation has an observable outcome (commit or `STALE_BOARD_WRITE`); no mutation is silently lost.

### Postconditions

- The on-disk document carries `seq = previous + 1` for every successful mutation.
- Every mutation either lands (`seq` incremented, change visible to subsequent readers) or throws `STALE_BOARD_WRITE` (no partial state, no silent loss). There is no third outcome.
- Reads observe either the pre-mutation snapshot or the post-mutation snapshot, never a torn intermediate.
- The `IssueManagerInterface` contract is unchanged: mutator return values and field shapes remain identical to today's adapter behavior.
- **For `create()` specifically:** the returned `Issue.id` is whatever the successful write stamped. Callers MUST use the return value as the source of truth and MUST NOT assume the ID matches one computed against a pre-write snapshot. Under retry, the assigned `id` reflects the freshest snapshot's `_nextIssueId` / `nextChildId` derivation, which may differ from the value a caller would predict by reading the board before invoking `create()`.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| On-disk `seq` ≠ captured `seq` at write time, retry budget remaining | Re-read snapshot, re-apply mutation, retry write. The intermediate signal is internal control flow; callers do not observe it. | (internal) `STALE_BOARD_WRITE_RETRY` |
| On-disk `seq` ≠ captured `seq`, retry budget exhausted | Throw `Error` with `err.code = "STALE_BOARD_WRITE"`; message includes op name (enum), captured `seq` (integer), current `seq` (integer), retry count (integer ≤ `MAX_CAS_RETRIES`). No filesystem paths, no document contents in the message. | `STALE_BOARD_WRITE` |
| `seq` field present but not a non-negative integer, or `seq > Number.MAX_SAFE_INTEGER` | Throw `Error` with `err.code = "INVALID_BOARD_SEQ"`; do not write. The error message reports the violation kind (negative / non-integer / out-of-range) but does NOT echo the offending value (route through the existing `MALFORMED_BOARD` sanitization in `safePrefix`). | `INVALID_BOARD_SEQ` |
| `seq` field absent on existing v2 document | Treat as `seq: 0`; proceed without warning | (none — legacy fallback) |
| Temp-file write fails mid-stream | Existing CON-6 cleanup path runs; original `tasks.json` untouched; no `seq` increment | (existing) |
| Rename fails after successful temp write | Best-effort `unlinkSync` on temp file; throw underlying fs error; original `tasks.json` untouched | (existing fs error) |
| Caller passes explicit `id` field on `create()` that collides with an ID a competing writer just allocated | The retry path's re-derivation may yield a different `id`; an explicit-id collision is detected by the existing `ID_MISMATCH` guard in `JsonAdapter.create()` and rethrown. The retry budget is still consumed up to `MAX_CAS_RETRIES`. | `ID_MISMATCH` (existing) |

## System Constitution Reference

- **Principle 1: Minimize external dependencies.** CAS is implemented using only `node:fs` primitives already in use by the adapter — no `proper-lockfile`, no `flock` binding. File locking would be a simpler-looking alternative but introduces a runtime dependency and OS-portability hazards.
- **Principle 3: Pure ESM.** All new code is in `lib/issues/json-adapter.mjs` and `tests/issues/*.test.mjs`; the spec adds no new modules and no CommonJS surface.
- **Coding Standards — Patterns to Follow:** "Atomic file ops via temp+rename" (already exemplified by `lib/build-state.mjs::atomicWriteJson`). CAS composes on top of this pattern rather than replacing it.
- **Charter Invariant #6 (Atomic write or no write):** preserved. CAS strengthens this from "no torn writes" to "no silent lost updates" — every mutation is either visible or throws.
- **Charter Quality Attribute "Concurrent-write safety":** currently scoped to `appendEvent` (JSONL primitive). This spec extends an analogous guarantee to the JSON board via a different mechanism, justified by the storage shape:
  - JSONL append-only writes are lost-update-safe by construction — writes only add bytes, never rewrite existing ones, so the failure mode this spec addresses cannot occur. The PIPE_BUF assumption (~4 KB) bounds interleaving, not overwriting.
  - Whole-document JSON writes are not lost-update-safe by construction — every write rewrites the entire file, so two concurrent writers reading the same snapshot will silently overwrite each other. CAS via a per-write `seq` field is the analogous mechanism: it can't make rewrites atomic, but it can make stale rewrites *visible* (throwing `STALE_BOARD_WRITE`) rather than silent.
  - **CAS is best-effort under POSIX rename semantics.** The re-read→rename window is not strictly atomic; a sufficiently adversarial interleaving can still produce a lost update. For the local-CLI threat model (developer's own parallel processes), this window is small enough that the practical guarantee holds; for stronger guarantees (cluster scenarios, hostile multi-writer), `flock` or a database-backed adapter would be required — explicitly out of scope.
  - Charter QA table should gain a row for `tasks.json` mutations in revision 7, scoped to the practical guarantee above.
- **Cross-spec amendment (paired with `json-issue-board-adapter.spec.md`):** That sibling spec defines the canonical document schema as `{version, epics[], issues[]}` and stipulates that the `_write()` reconstructor drops unknown top-level keys. Adding `seq` as a top-level field requires a documented exception in this rule: the canonical schema becomes `{version, seq, epics[], issues[]}`, and `_write()` must preserve `seq` rather than strip it. This is a minor amendment to the sibling spec, handled in lockstep during implementation; an explicit `Spec:` trailer on the implementation commit references both specs.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add `seq` to document schema | Update `_validateBoardDocument` to accept (but not require) an integer `seq` field with `0 ≤ seq ≤ Number.MAX_SAFE_INTEGER`; treat missing as `0`. No schema-version bump. | small |
| Amend sibling spec (`json-issue-board-adapter`) | Add `seq` to the canonical schema diagram and document the top-level-key-preservation exception. One-paragraph edit; spec-only change, no code. | small |
| Split read primitive | Keep `_read()` returning `board` (used by `list`/`get`/`listEpics`/`walkTree`). Add `_readWithSeq()` returning `{ board, seq }`, called only from the six mutators. Read-only call sites stay simpler; CAS code path is named for what it does. | small |
| Rework `_write(data, expectedSeq)` to CAS | Re-read `tasks.json` immediately before rename, compare `disk.seq` to `expectedSeq`, throw `STALE_BOARD_WRITE_RETRY` on mismatch. Stamp `seq: expectedSeq + 1` on success. Preserve `seq` through the document reconstructor (CON-1 / SA-5 exception). | medium |
| Retry wrapper in mutators | Bounded-retry loop in `create`, `update`, `close`, `addDependency`, `createEpic`, `updateEpic`. On `STALE_BOARD_WRITE_RETRY`: re-read via `_readWithSeq()`, re-derive IDs/timestamps, re-apply mutation. After `MAX_CAS_RETRIES` attempts: throw `STALE_BOARD_WRITE`. | medium |
| Retry budget constant + manifest knob | Export `MAX_CAS_RETRIES = 3` as the default. Add optional manifest knob `tasks.cas_max_retries` (default 3) matching the escape-hatch pattern of `lifecycle.gate_mode` and `tasks.legacy_read`. Adapter constructor reads from manifest; falls back to constant. | small |
| Verify `_read`/`_write` are not called externally | Grep test (`tests/issues/json-adapter-internal-encapsulation.test.mjs`): scan `lib/**`, `tests/**`, `cli/**`, `hooks/**`, `viz/**`, `providers/**` for `\._read\(|\._write\(` calls against any `JsonAdapter` instance. Assert zero matches outside `lib/issues/json-adapter.mjs` itself. | small |
| Concurrency test: N parallel mutators | Spawn N child processes via `tests/helpers.mjs`, each doing one mutation against the same `tasks.json`. Assert every mutation has an observable outcome (commit or `STALE_BOARD_WRITE`); assert no mutation is silently lost (final state contains every committed mutation); assert no orphan `.tmp` files remain. | medium |
| Stale-write exhaustion test | Inject a slow-writer that artificially holds the captured `seq`; concurrent fast-writers bump `seq` past the retry budget; assert `STALE_BOARD_WRITE` thrown with the documented message fields (op name, captured seq, current seq, retry count). | small |
| Legacy-document test | Write a `tasks.json` without `seq` field; assert next mutation succeeds, stamps `seq: 1`, and emits no warning. | small |
| Hostile-seed test | Write a `tasks.json` with `seq: Number.MAX_SAFE_INTEGER + 1` (parsed as a JSON number); assert `INVALID_BOARD_SEQ` thrown; assert error message does NOT echo the offending integer. | small |
| Doc update: `json-adapter.mjs` header | Add a CAS paragraph under the existing atomic-rename note (lines 1-25). One paragraph; references `STALE_BOARD_WRITE` and the retry constant. | small |

## Acceptance Criteria

- [ ] `JsonAdapter._read()` returns `board` unchanged; new `JsonAdapter._readWithSeq()` returns `{ board, seq }` and is the only entry point used by the six mutators.
- [ ] `JsonAdapter._write(data, expectedSeq)` performs CAS via re-read-before-rename and throws `STALE_BOARD_WRITE_RETRY` on mismatch; the document reconstructor preserves the `seq` field.
- [ ] All six mutating methods (`create`, `update`, `close`, `addDependency`, `createEpic`, `updateEpic`) wrap their RMW cycle in a bounded retry loop and surface `STALE_BOARD_WRITE` after `MAX_CAS_RETRIES` exhausted. Retry budget is configurable via `manifest.tasks.cas_max_retries` (default 3).
- [ ] `_validateBoardDocument` rejects `seq` values that are negative, non-integer, or `> Number.MAX_SAFE_INTEGER` with `INVALID_BOARD_SEQ`. Error messages do not echo the offending value (routed through `safePrefix`).
- [ ] Concurrency test with N=10 parallel mutators on a shared `tasks.json` asserts: every mutation has an observable outcome (commit or `STALE_BOARD_WRITE`); no mutation is silently lost; no orphan `.tmp` files remain. (Final `seq` may be less than `initial + 10` if any retries exhausted — that is the contractual guarantee per behavior 8.)
- [ ] Stale-write exhaustion test demonstrates that `STALE_BOARD_WRITE` is thrown (not silent overwrite) when the retry budget is exceeded, with the documented integer-only message fields.
- [ ] Legacy-document test demonstrates that a `tasks.json` without a `seq` field is upgraded transparently on first write.
- [ ] Hostile-seed test demonstrates that `seq > Number.MAX_SAFE_INTEGER` produces `INVALID_BOARD_SEQ` without echoing the value.
- [ ] Grep test asserts zero external callers of `JsonAdapter._read()` or `JsonAdapter._write()` outside the adapter file itself (CON-5).
- [ ] Sibling spec `json-issue-board-adapter.spec.md` is amended in lockstep to document the top-level `seq` field and the `_write()` preservation rule (SA-5).
- [ ] No new runtime dependencies introduced (constitution Principle 1).
- [ ] `IssueManagerInterface` public contract is unchanged: no public method signatures or return shapes modified. Internal `_read`/`_write` are not part of the public contract.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations introduced.
- [ ] `issue-459` updated with `spec_ref` pointing to this spec.
