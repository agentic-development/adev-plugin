# Live Spec: Execution State Migration

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->

---
charter: agent-reliable-state-artifacts
status: validated
risk_level: medium
milestone: 0.26.0
revision: 3
charter-revision: 3
created: 2026-05-11
updated: 2026-08-13
source-manifest:
  sha: "2f19a02"
  files:
    - hooks/_execution-state.mjs
    - hooks/lifecycle-gate-advisory.sh
    - hooks/lifecycle-gate-bash.sh
    - hooks/lifecycle-gate-edit.sh
    - hooks/session-capture.sh
    - hooks/session-start.sh
    - lib/execution-state.mjs
    - tests/architectural-execution-state.test.mjs
    - tests/hooks/execution-state-helper.test.mjs
    - tests/hooks/lifecycle-gate-advisory.test.mjs
    - tests/hooks/lifecycle-gate-bash.test.mjs
    - tests/hooks/lifecycle-gate-edit.test.mjs
    - tests/hooks/lifecycle-gate-integration.test.mjs
    - tests/hooks/lifecycle-gate-status.test.mjs
    - tests/hooks/session-start-resume.test.mjs
    - tests/hooks/session-start.test.mjs
    - tests/lib/execution-state.test.mjs
  computed-at: "2026-05-12T01:20:29.444Z"
drift_detected: true
---

## Behavioral Contract

This spec migrates the per-project session resume marker from `.context-index/.execution-state.md` (YAML frontmatter + markdown checklist body) to `.context-index/.execution-state.json` (a single JSON document). `lib/execution-state.mjs` is rewritten to read/write JSON via an atomic temp-then-rename, mirroring the `lib/build-state.mjs::atomicWriteJson` pattern. The module's exported API (`writeExecutionState`, `readExecutionState`, `clearExecutionState`) keeps its current signatures, validation contract, and normalization semantics — only the on-disk format changes. The two bash hooks that today parse the markdown file inline — `hooks/session-start.sh` (resume-block builder) and `hooks/lifecycle-gate-bash.sh` (status gate) — are decoupled from format-specific parsing: each invokes a new internal Node helper (`hooks/_execution-state.mjs`) as a parsing subprocess that reads `.execution-state.json` via `lib/execution-state.mjs` and emits structured data on stdout. The shell scripts remain the **registered hook entry points** in `hooks/hooks.json` and retain exclusive ownership of hook exit codes (0 = allow, 2 = block) and the JSON stdout protocol, preserving constitution Non-Negotiable Principle 4. The migration tool spec (`one-shot-migration-tool`) owns the one-shot conversion of any pre-existing `.execution-state.md` file; this spec does not perform any in-place migration on first read.

## Naming Conventions (CON-1)

This spec preserves the existing camelCase field names already used by `lib/execution-state.mjs`:

- **ExecutionState fields (camelCase):** `status`, `planRef`, `currentTask`, `issueBinding`, `blockers`, `nextAction`, `updated`, `progress`. These names are already in use in the current YAML frontmatter and in the public API of `writeExecutionState` / `readExecutionState`. They are **not** part of the `IssueManagerInterface` WorkItem legacy mix and require no special-case preservation — they are camelCase across the board.
- **Progress entries (camelCase):** Each progress item is `{ task: string, done: boolean }`. Same shape as the in-memory object returned by today's parser.
- **Status enum (lowercase strings):** `idle`, `active`, `blocked`, `standalone` — unchanged from today.

### Schema delta vs. charter (CON-2 from review rev 1)

The parent charter's illustrative `.execution-state.json` schema example (charter rev 3, lines 268–279) shows `"blockers": null` and omits the `progress` field. This spec normatively diverges from that illustration on two points, preserving today's `lib/execution-state.mjs` behavior:

1. **Cleared free-text fields serialize as `""` (empty string), not `null`.** When `status` is `idle` or `standalone`, the fields `planRef`, `currentTask`, `issueBinding`, `blockers`, and `nextAction` are written as `""`. This preserves `readExecutionState`'s round-trip return shape (today's parser returns `""` for missing-or-empty fields via `metadata.<field> || ""`), so consumers reading the JSON state get the same in-memory shape they get today from the YAML state.
2. **`progress: []` is part of the on-disk JSON shape.** The charter's example schema omits it; this spec adds it as a JSON array of `{ task: string, done: boolean }` objects (replacing today's markdown checklist body). Idle/standalone normalization clears `progress` to `[]`. This is an additive correction to the charter's illustrative example, not a redesign — today's `lib/execution-state.mjs` already exposes `progress` as part of its in-memory object, so it is part of the consumer contract regardless of file format.

A future charter revision may reconcile the illustration to match; this spec does not gate on that revision happening.

Implementers must NOT rename any field during this migration. The `IssueManagerInterface` parity invariant does not apply here (execution-state is its own surface), but the `lib/execution-state.mjs` API consumers — bash hooks, `/adev:work`, `/adev:implement`, `/adev:build`, `/adev:reconcile` — all rely on the current field names. Renaming would force a synchronized cross-skill update with no compensating benefit.

## Path Safety (SEC-1, SEC-4)

The module enforces path-containment defenses on every public function that takes a `projectRoot`:

1. **`projectRoot` normalization.** Every public function (`writeExecutionState`, `readExecutionState`, `clearExecutionState`) resolves `projectRoot` via `path.resolve()` at entry. The resolved path must contain `.context-index/manifest.yaml` (validated by `fs.existsSync`). If validation fails, the function throws `INVALID_PROJECT_ROOT` with the resolved path. This is a strengthening of today's behavior, which only checks `isAbsolute()` — manifest presence is the same containment guard used by `lib/lifecycle-state.mjs` and `lib/issues/json-adapter.mjs` per the foundation specs.
2. **State-path containment (with symlink defense).** The resolved target path `<storageRoot>/.context-index/.execution-state.json` is computed via `path.resolve()`, where `storageRoot` is the shared storage root derived from the validated `projectRoot` (see "Worktree-Shared Storage" below; for a non-worktree checkout with no `tasks.db_path` the two are the same directory). **The containment check uses `fs.realpathSync.native()`** on the resolved storage root AND on the resolved state-file path's parent directory (the state file itself may not yet exist, so its parent dir is realpath'd instead). The check asserts: `realStateParent.startsWith(realStorageRoot + path.sep + '.context-index')` AND the basename of the state path equals `.execution-state.json` exactly. The temp-file path used by the atomic write is `<finalPath>.<crypto.randomBytes(4).toString('hex')>.tmp`; it must satisfy `resolvedTempPath.startsWith(resolvedStatePath + '.')` and end with `.tmp`. If any check fails, throw `INVALID_STORAGE_PATH`. Defeats crafted `projectRoot` traversal AND symlink escape under `.context-index/` (CWE-22 path traversal, CWE-59 symlink following). Addresses review-rev-1 SEC-1 — the rev 1 tautological-equality check is replaced by realpath-prefix containment matching the sibling lifecycle-event-log pattern.
3. **Sibling-spec parity.** This module applies the same `projectRoot` *validation* contract as `lib/lifecycle-state.mjs` (`lifecycle-event-log.spec.md`) and `lib/issues/json-adapter.mjs` (`json-issue-board-adapter.spec.md`): resolve, require `.context-index/manifest.yaml`, realpath-prefix containment. **Rev 3 amendment (issue-607):** parity on *path resolution* now follows the shared-storage modules rather than the worktree-local ones. `lib/execution-state.mjs` maps the validated `projectRoot` onto a storage root through `lib/issues/resolve-root.mjs::resolveStorageRoot` — the same resolver used by `lib/issues/json-adapter.mjs` and `lib/milestones.mjs` (`milestones-migration.spec.md`) — so the issue board, the milestone registry, and execution state all land in one place per repository. `lib/lifecycle-state.mjs` remains worktree-local (its event log is an append-only per-checkout journal, not a live cross-worktree snapshot); the rev 2 claim that "the three state-artifact modules cannot diverge on path safety" is therefore restated as: they cannot diverge on *validation*, and the modules holding **live shared state** cannot diverge on *resolution*. **Note on legacy-read parity:** unlike `lib/issues/json-adapter.mjs` (which keeps a `tasks.legacy_read` fallback in the adapter itself), `lib/execution-state.mjs` has **no** legacy-read fallback. The execution-state file is a single small JSON document and the one-shot migration tool fully owns conversion; there's no equivalent operational reason to expose a transparent fallback. This asymmetry is intentional. Addresses review-rev-1 CON-1.
4. **Node helper inherits validation.** `hooks/_execution-state.mjs` invokes `readExecutionState(projectRoot)` from `lib/execution-state.mjs`; it does not perform its own path resolution. The bash entry points pass `ADEV_CONTEXT_ROOT` (the walked-up `.context-index/` parent) as the helper's `projectRoot`, so the same containment check applies inside the helper.

## Worktree-Shared Storage (rev 3 — issue-607)

Execution state describes *what this repository is currently working on*. Rev 2 stored it at `<projectRoot>/.context-index/.execution-state.json`, which is worktree-local: a linked `git worktree` got its own file, so `/adev:work` reported `idle` in one checkout while four issues were `in_progress` and five PRs were open from another. The issue board never had this defect because `lib/issues/registry.mjs` resolves storage through `lib/issues/resolve-root.mjs::resolveStorageRoot()`.

Rev 3 makes execution state use that same resolver. No second resolver is introduced and no execution-state-specific manifest key is added.

**Resolution order** (inherited verbatim from `resolveStorageRoot`):

1. `tasks.db_path` from `<projectRoot>/.context-index/manifest.yaml`, when set. This is the **unified knob** already documented in `templates/manifest-template.yaml` as governing `tasks/tasks.json` and `milestones.json`; it now also governs `.execution-state.json`. A separate `execution_state.path`-style key is deliberately **not** introduced — splitting the knob would let the board and the state that references its issue IDs drift to different roots, which is the failure this revision removes.
2. The main repository root, via `git rev-parse --path-format=absolute --git-common-dir`. Linked worktrees resolve to the main checkout.
3. The caller-supplied `projectRoot`, when the git probe fails (non-git checkout, git absent). Behavior outside a git repository is unchanged from rev 2.

**Ordering and validation invariants:**

- `validateProjectRoot(projectRoot)` runs **first and unchanged**. A `projectRoot` that is empty, non-string, or lacking `.context-index/manifest.yaml` still throws `INVALID_PROJECT_ROOT` before any resolution is attempted. Storage resolution can never be used to sidestep that guard.
- The manifest is loaded tolerantly (`lib/manifest.mjs::loadManifest` wrapped in try/catch → `null`), mirroring `lib/milestones.mjs::loadManifestForStorage`. An unparseable manifest degrades to git resolution rather than throwing.
- **Positive containment:** the resolved storage root must be an existing directory (`fs.statSync(...).isDirectory()`), else `INVALID_STORAGE_PATH` — the same defense `lib/milestones.mjs` applies to a `tasks.db_path` pointing at a regular file or a nonexistent path. The resolved root is then canonicalized with `fs.realpathSync.native()` so that the realpath-prefix check in Path Safety item 2 compares like with like (a manifest-supplied path may be `/var/...` where its realpath is `/private/var/...`).
- All rev 2 write-path invariants survive unchanged, now anchored at the storage root: the `.execution-state.json` basename check, the realpath-prefix containment, and the `<statePath>.<hex>.tmp` atomic temp-then-rename with best-effort cleanup.
- **Accepted consequence (precedent: `milestones-migration.spec.md`):** where a project's `.context-index/` sits *below* the git root, the state file follows the git root, and `writeExecutionState` will create `.context-index/` there on first write. The issue board and the milestone registry already behave this way; execution state is not given a bespoke guard against it.

## Hook Protocol Compliance (CON-4)

Per constitution Non-Negotiable Principle 4 ("Hook protocol compliance — hooks read JSON from stdin + env vars, exit 0 (allow) or 2 (block), output JSON to stdout"):

- `hooks/session-start.sh` and `hooks/lifecycle-gate-bash.sh` remain the **registered hook entry points** in `hooks/hooks.json`. The Node helper introduced by this spec is **not** registered in `hooks/hooks.json`; it is invoked from within the shell scripts.
- The shell scripts retain exclusive ownership of:
  - Reading stdin and `CLAUDE_TOOL_INPUT_*` env vars (via `hooks/_parse-stdin.sh`).
  - Constructing the `hookSpecificOutput.additionalContext` JSON envelope written to stdout.
  - Setting the hook exit code (`exit 0` = allow, `exit 2` = block).
- The Node helper (`hooks/_execution-state.mjs`) is a **parsing subprocess only**. Its responsibility is bounded to: receive a context-root path via env var, call `readExecutionState(projectRoot)`, and write a single JSON document to stdout describing the parsed state. It never writes to stdin/env-var protocol, never sets a hook exit code, and never participates in the allow/block decision. Its own exit code is 0 on success, 1 on parse failure — the caller (the shell script) is free to ignore non-zero exits and treat them as "no resume / no gating signal".
- **Helper stderr is discarded.** The shell entry points invoke the Node helpers with `2>/dev/null` redirection. Helper stack traces (e.g., from a broken `lib/execution-state.mjs` import) MUST NOT flow into `hookSpecificOutput.additionalContext`. Addresses review-rev-1 SEC-4: prevents accidental leakage of internal file paths or agent-mutated state via subprocess stderr captured in Claude's context window.
- The naming convention (`_` prefix in `hooks/`) signals "internal helper, not registered" — matching the existing `hooks/_lifecycle-gate-check-bash.mjs` and `hooks/_parse-stdin.sh` precedents.

### Single-helper design (rev 2 — addresses review-rev-1 SA-3)

The rev 1 design described two Node helpers piped together (`_execution-state-read.mjs | _render-resume-block.mjs`), doubling the `node` startup cost per SessionStart event. Rev 2 collapses to **one helper** with two operating modes selected by an env var:

- `hooks/_execution-state.mjs` is the new single helper.
- When invoked with `ADEV_EXECUTION_STATE_MODE=read`, it reads `ADEV_CONTEXT_ROOT`, calls `readExecutionState(projectRoot)`, and emits `JSON.stringify(state)` or `"null"` on stdout. Used by `hooks/lifecycle-gate-bash.sh` (which only needs the `.status` field).
- When invoked with `ADEV_EXECUTION_STATE_MODE=resume-block` (default), it reads state internally and emits the formatted resume-block markdown (or empty stdout for `idle`/`standalone`/`null`/unknown status). Used by `hooks/session-start.sh`.
- One process per SessionStart, one process per gated Bash invocation. No piping. The helper-internal mode dispatch is invisible to the shell caller.

The two-helper design from rev 1 is rejected for the perf reason above. The single-helper design preserves the constitution Principle 4 boundary identically (bash retains exit-code ownership and the stdout envelope; the helper is a pure parsing/formatting subprocess).

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies because the rewritten `lib/execution-state.mjs` uses only `node:fs`, `node:path`, and `node:crypto` (the latter for the temp-file suffix). `JSON.parse`/`JSON.stringify` are built-ins. No YAML library is introduced — the parser, which was a hand-rolled regex anyway, is replaced wholesale.
- **Principle:** "Skills are primarily markdown" — Applies because no skill logic moves into the lib. The migration alters file format and the bash↔Node boundary, but the surface `/adev:work`, `/adev:implement`, etc. call into is unchanged.
- **Principle:** "Pure ESM — all `.mjs` files" — Applies because `lib/execution-state.mjs` is already ESM; the rewrite stays ESM. The new single helper `hooks/_execution-state.mjs` is authored as `.mjs`.
- **Principle:** "Hook protocol compliance — hooks read JSON from stdin + env vars, exit 0 (allow) or 2 (block), output JSON to stdout" — Applies directly. See "Hook Protocol Compliance" section above for the explicit treatment.
- **Architecture Boundary (Autonomous):** "Refactoring within a module's boundaries" — Applies because the rewrite lives inside the `agent-reliable-state-artifacts` module scope laid out in the charter. The bash↔Node boundary change is internal to the hooks; the registered hook contract is preserved.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| `.execution-state.json` document schema | Define the JSON shape: `{ status, planRef, currentTask, issueBinding, blockers, nextAction, progress[], updated }`. Document required vs. optional fields per status. Lock the field name list against drift. | small |
| Rewrite `lib/execution-state.mjs` core | Replace YAML/markdown serialization with `JSON.stringify(state, null, 2) + "\n"`. Replace regex frontmatter parser with `JSON.parse`. Preserve `writeExecutionState` / `readExecutionState` / `clearExecutionState` signatures and validation semantics. | medium |
| Atomic write helper | Reuse the existing `randomBytes(4).toString('hex') + '.tmp'` temp-then-rename pattern. Match `lib/build-state.mjs::atomicWriteJson` exactly, including the **best-effort `fs.unlinkSync` cleanup on the failure path** (swallowing cleanup errors) before re-throwing the original error. The rev 1 review (CON-5) flagged this as already present in the existing code at line 144 — preserve it verbatim. | small |
| Path containment defenses | Add `path.resolve` + `.context-index/manifest.yaml` existence check to `validateProjectRoot()`. Add the realpath-based state-path containment assertion per Path Safety item 2. Strip the existing weaker `isAbsolute()` check (subsumed). | small |
| `readExecutionState` tolerance | Returns `null` on missing file, malformed JSON, any `fs`/parse error, or files exceeding the 256 KB size cap (current null-tolerance behavior preserved — the function never throws on read errors except `INVALID_PROJECT_ROOT`). Truncated final byte from a crashed write yields a parse error, which yields `null`. Oversized files emit a one-time `STATE_FILE_TOO_LARGE` console warning before returning `null` (review-rev-1 SEC-2 — caps the impact of a hostile/corrupted state file flowing into the resume-block render). | small |
| `clearExecutionState` unchanged | Continue to delegate to `writeExecutionState({ status: 'idle' })`. The idle-normalization (`planRef=""`, `currentTask=""`, etc.) is preserved verbatim. | small |
| Progress field shape | Persist `progress: []` as a JSON array of `{ task, done }` objects. Drop the markdown checklist body entirely from the on-disk format. The in-memory shape returned by `readExecutionState` is unchanged. | small |
| `sanitizeField` removal | Drop the YAML-specific escape (replace newlines, strip `---` sequences). JSON-encoding by `JSON.stringify` handles all escape cases natively. Free-text fields (`blockers`, `nextAction`, `progress[].task`) are written verbatim. | small |
| `hooks/_execution-state.mjs` helper (single-helper design) | New Node helper with two modes selected by `ADEV_EXECUTION_STATE_MODE` env var: `read` emits `JSON.stringify(state)` or `"null"`; `resume-block` emits formatted resume-block markdown or empty. Both modes read `ADEV_CONTEXT_ROOT` for `projectRoot`. Exit 0 on success, 1 on unhandled error. No flags; no stdin. | small |
| `hooks/session-start.sh` refactor | Replace the inline `node -e` YAML parser (the ~60-line embedded JavaScript that builds `RESUME_BLOCK`) with a single invocation: `RESUME_BLOCK=$(ADEV_CONTEXT_ROOT="$CONTEXT_ROOT" ADEV_EXECUTION_STATE_MODE=resume-block node "$PLUGIN_ROOT/hooks/_execution-state.mjs" 2>/dev/null || true)`. The shell script continues to own the final `hookSpecificOutput` envelope and the hook exit code. Stderr is discarded per CON-4 SEC-4. | small |
| Resume-block field rendering (markdown safety) | The `resume-block` mode emits markdown lines like `Blocker: <blockers>`, `Next Action: <nextAction>`. Free-text fields are **rendered with newlines replaced by a single space** before interpolation into single-line markdown slots. Backticks and `[link](...)` patterns are not escaped (the resume block flows into Claude's context, not a markdown renderer) but newline replacement prevents structural injection. Per-field truncation: `blockers` and `nextAction` truncated to 4 KB with a `…[truncated]` marker; `progress[].task` truncated to 256 B per entry; `progress[]` truncated to 100 entries with a `…[N more]` line. Addresses review-rev-1 SEC-3. | small |
| `hooks/lifecycle-gate-bash.sh` refactor | Replace the `grep -E "^status:"` extraction with: `STATE_STATUS=$(ADEV_CONTEXT_ROOT="$CONTEXT_ROOT" ADEV_EXECUTION_STATE_MODE=read node "$PLUGIN_ROOT/hooks/_execution-state.mjs" 2>/dev/null | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{ try{ const j=JSON.parse(s); console.log(j&&j.status||""); }catch{ console.log(""); } })' \|\| echo "")`. The gate logic (`standalone\|active` ⇒ exit 0) is unchanged. | small |
| Tests: `lib/execution-state.mjs` parity | Re-run every existing test in `tests/lib/execution-state.test.mjs` (or equivalent test file) against the rewritten module. Fixtures rewritten to JSON shape. | medium |
| Tests: path-containment defenses | New tests asserting `INVALID_PROJECT_ROOT` and `INVALID_STORAGE_PATH` for traversal payloads (missing manifest, `../../../etc/passwd` `projectRoot`, symlink escape). | small |
| Tests: atomic-write fault injection | Kill the process between the temp-file write and the rename; assert the reader sees the prior state, the temp file is orphaned but discoverable, and a follow-up write succeeds. Mirror the lifecycle-event-log / json-adapter pattern. | medium |
| Tests: helper subprocess contract | `hooks/_execution-state.mjs` invoked with `ADEV_CONTEXT_ROOT` set: emits a parseable JSON document on stdout matching the in-memory shape. Invoked with the env var unset or pointing at a missing file: emits `null` and exits 0. Invoked on a corrupt JSON file: emits `null` and exits 0 (matches `readExecutionState` tolerance). | small |
| Tests: hook integration | End-to-end tests that exercise `hooks/session-start.sh` and `hooks/lifecycle-gate-bash.sh` against a fixture project with a JSON state file — assert the resume block content and the gate decision are byte-identical to today's behavior for each status. | medium |
| Constitution check: no inline YAML parsing in hooks | Architectural test: `grep -E "match\(/\^---|YAML"` against `hooks/*.sh` returns empty. CI gate. | small |
| Coverage target | ≥ 90% line coverage on the rewritten `lib/execution-state.mjs` and the two new helpers. | small |

## Visual Expectations

Not applicable — `lib/execution-state.mjs` and the new hook helpers are passive library and CLI modules with no UI surface. The session-resume block content remains a markdown string injected into the SessionStart hook output; its visual rendering is owned by Claude Code itself, not this module.

## Acceptance Criteria

- [ ] `lib/execution-state.mjs` exports unchanged signatures: `writeExecutionState(projectRoot, state)`, `readExecutionState(projectRoot)`, `clearExecutionState(projectRoot)`. No new public exports beyond the constants needed for tests.
- [ ] All writes go through `JSON.stringify(state, null, 2) + "\n"` followed by temp-then-rename. A grep test asserts no `yaml` / `YAML` (case-insensitive) string and no `^---` regex match (legacy frontmatter sentinel) appears in `lib/execution-state.mjs` after the rewrite. CI gate. Addresses review-rev-1 SA-2 — the rev 1 `---\n`-literal grep was overzealous (could match markdown headings and JSDoc).
- [ ] `readExecutionState(projectRoot)` returns the parsed state object on success; returns `null` on a missing file, malformed JSON, or any `fs`/parse error. Throws only on `INVALID_PROJECT_ROOT` / `INVALID_STORAGE_PATH`.
- [ ] **Worktree-shared storage (rev 3 — issue-607).** Storage resolution goes through `lib/issues/resolve-root.mjs::resolveStorageRoot`; `lib/execution-state.mjs` defines no resolver of its own and adds no public export (AC 1 still holds — the behavior is asserted through `readExecutionState` / `writeExecutionState` / `clearExecutionState` only). Tests, against a real `git worktree add` fixture: (a) `writeExecutionState(<worktree>, …)` creates `<mainRepo>/.context-index/.execution-state.json` and leaves `<worktree>/.context-index/.execution-state.json` absent; (b) `readExecutionState(<worktree>)` returns what was written from `<mainRepo>`; (c) a stale worktree-local `.execution-state.json` is ignored in favour of the shared file; (d) `clearExecutionState(<worktree>)` clears the shared file.
- [ ] **`tasks.db_path` unified knob (rev 3 — issue-607).** With `tasks.db_path: <dir>` set in the manifest, the state file resolves to `<dir>/.context-index/.execution-state.json` and no project-local copy is created. A `db_path` pointing at a regular file or a nonexistent path throws `INVALID_STORAGE_PATH` ("must point at an existing directory"). Outside a git checkout with no `db_path`, the caller-supplied root is still the storage root (rev 2 behavior preserved).
- [ ] `writeExecutionState(projectRoot, state)` validates `state.status` against the existing `VALID_STATUSES` set (`idle`, `active`, `blocked`, `standalone`). `active` status still requires `planRef` and non-null `currentTask` (existing semantics preserved). Throws `INVALID_STATUS`, `MISSING_PLAN_REF`, or `MISSING_CURRENT_TASK` per today's contract.
- [ ] Idle/standalone normalization is preserved: when `state.status` is `idle` or `standalone`, all binding fields (`planRef`, `currentTask`, `issueBinding`, `blockers`, `nextAction`) are cleared to `""` and `progress` is cleared to `[]` before writing. Test fixture exercises both statuses.
- [ ] Atomic-write fault-injection test passes: killing the process between temp-file write and rename leaves either the prior state or no change to `.execution-state.json`. Reader never observes partial JSON.
- [ ] Path-containment defenses are enforced (SEC-1, SEC-4): any `projectRoot` lacking `.context-index/manifest.yaml` throws `INVALID_PROJECT_ROOT`; any resolved state-file path whose parent fails the realpath-prefix check against `<realProjectRoot>/.context-index/` throws `INVALID_STORAGE_PATH`. Tests exercise both crafted-`projectRoot` traversal payloads AND a symlink-escape fixture where `.context-index/` is a symlink to a sibling directory.
- [ ] Existing tests of `lib/execution-state.mjs` that use temp directories without a `manifest.yaml` are updated to materialize `.context-index/manifest.yaml` in their fixture roots. Addresses review-rev-1 SA-4: the strengthening of `validateProjectRoot` from `isAbsolute()` to manifest-presence is a contract change that callers' fixtures must accommodate.
- [ ] The on-disk format is JSON only. Test fixtures asserting `.execution-state.md` shape are rewritten to assert `.execution-state.json` shape. No code path writes to `.execution-state.md`.
- [ ] `hooks/_execution-state.mjs` is a single helper supporting both modes via `ADEV_EXECUTION_STATE_MODE`:
  - `read` mode: (a) reads `ADEV_CONTEXT_ROOT` env var as `projectRoot`; (b) calls `readExecutionState(projectRoot)`; (c) writes `JSON.stringify(state)` or `"null"` to stdout; (d) exits 0 on success; (e) exits 1 only on unhandled internal error.
  - `resume-block` mode (default): (a) reads `ADEV_CONTEXT_ROOT` and calls `readExecutionState` internally; (b) emits the formatted resume-block markdown on stdout matching today's format for `active` and `blocked` status; (c) emits empty output for `idle`, `standalone`, `null`, or any unknown status; (d) applies field-rendering safety rules (newline-to-space on single-line slots, per-field truncation per the task map row).
  - Unknown `ADEV_EXECUTION_STATE_MODE` values default to `resume-block` and emit a one-time stderr warning (discarded by the shell caller per CON-4 SEC-4).
- [ ] **Single-helper design (review-rev-1 SA-3):** No `_render-resume-block.mjs` file is created. The architectural test asserts `hooks/_render-resume-block.mjs` does not exist on disk after implementation.
- [ ] `hooks/session-start.sh` contains no inline YAML parsing. The resume-block generation is delegated to a single `hooks/_execution-state.mjs` invocation with `ADEV_EXECUTION_STATE_MODE=resume-block`. The shell script retains ownership of the `hookSpecificOutput.additionalContext` JSON envelope and the hook exit code. CI architectural test (grep `hooks/*.sh` for `match\(\/\^---` or `meta\.status`) asserts no inline parsing remains.
- [ ] **Helper stderr is discarded by every shell invocation (review-rev-1 SEC-4):** all shell-side calls to `hooks/_execution-state.mjs` use `2>/dev/null` redirection. CI architectural test greps `hooks/*.sh` for `node "$PLUGIN_ROOT/hooks/_execution-state.mjs"` and asserts every occurrence is immediately followed by `2>/dev/null`.
- [ ] **Field rendering safety (review-rev-1 SEC-2 + SEC-3):** the `resume-block` mode applies four safety rules: (a) `readExecutionState` refuses to read `.execution-state.json` files larger than 256 KB (`STATE_FILE_TOO_LARGE` returns `null`); (b) `\r\n`/`\n`/`\r` in `blockers`, `nextAction`, `currentTask` are replaced with a single space before interpolation into single-line markdown slots; (c) `blockers` and `nextAction` are truncated to 4 KB Unicode codepoints with `…[truncated]` marker; (d) `progress[].task` is truncated to 256 codepoints per entry, `progress[]` is truncated to 100 entries with a trailing `…[N more]` line. Tests exercise each rule with crafted overflow / newline / Unicode payloads.
- [ ] `hooks/lifecycle-gate-bash.sh` contains no `grep -E "^status:"` against the state file. The status check is delegated to the helper. The gate logic (status `standalone` or `active` ⇒ exit 0) is preserved. CI architectural test asserts no inline grep.
- [ ] `hooks/hooks.json` is unchanged. Only `session-start.sh` and `lifecycle-gate-bash.sh` are registered for their event types. The single new `_execution-state.mjs` helper is unregistered. Test asserts the registration map.
- [ ] Hook integration tests: against a fixture project with `.execution-state.json` in each of the four valid statuses (`idle`, `active`, `blocked`, `standalone`), the `session-start.sh` output and `lifecycle-gate-bash.sh` exit code match today's behavior byte-for-byte / value-for-value.
- [ ] Test coverage on the rewritten `lib/execution-state.mjs` ≥ 90% lines. Coverage on the single new helper `hooks/_execution-state.mjs` ≥ 90% lines (both modes covered).
- [ ] All constitution quality gates pass: `npm test` green, no new dependencies in `package.json`, all files are `.mjs` ESM.
- [ ] No constitutional violations.
- [ ] No in-place migration of legacy `.execution-state.md` is performed by `lib/execution-state.mjs`. The migration tool spec owns one-shot conversion. If both `.execution-state.json` and a stale `.execution-state.md` exist on disk, `readExecutionState` reads the JSON file and ignores the markdown file (leaves it untouched).

## Preconditions

- The project has a `.context-index/` directory (created by `/adev:init`).
- The project has a `.context-index/manifest.yaml` declaring at least the `domain` field (existing requirement). The path-containment defense enforces this on every public call.
- Node.js runtime with `node:fs`, `node:path`, `node:crypto`, `JSON.parse`, `JSON.stringify` available (existing constitution baseline).
- No pre-existing `.execution-state.json` is required — `writeExecutionState` creates the file (and parent directory) on first write.
- The one-shot migration tool (`one-shot-migration-tool.spec.md`) is the only code path that reads `.execution-state.md` after this spec lands. `lib/execution-state.mjs` does not have a legacy-read fallback path.

## Behaviors

- **When** a caller invokes `writeExecutionState(projectRoot, state)` and `state` is valid **then** `.context-index/.execution-state.json` is written atomically via temp-then-rename, containing a single JSON document with all fields from `state` plus a fresh `updated` ISO-8601 timestamp.
- **When** a caller invokes `writeExecutionState` and the target file does not exist **then** the parent directory `.context-index/` is created if missing and the new file is the first write.
- **When** a caller invokes `writeExecutionState` with `state.status === 'idle'` or `state.status === 'standalone'` **then** the persisted document has `planRef: ""`, `currentTask: ""`, `issueBinding: ""`, `blockers: ""`, `nextAction: ""`, and `progress: []` regardless of the input's values for those fields (idle-normalization preserved).
- **When** a caller invokes `writeExecutionState` and the validation rejects the input (invalid status, missing `planRef` on active, missing `currentTask` on active) **then** the function throws the corresponding error code (`INVALID_STATUS`, `MISSING_PLAN_REF`, `MISSING_CURRENT_TASK`) and `.execution-state.json` is unchanged.
- **When** the rename step of the atomic write fails (permission, disk full, etc.) **then** the temp file is best-effort unlinked, the underlying `fs` error is rethrown, and `.execution-state.json` remains in its prior state.
- **When** a caller invokes `readExecutionState(projectRoot)` and the file exists and parses as JSON **then** the parsed object is returned, with `currentTask` coerced to `Number` if the stored value is a numeric string (preserves today's coercion behavior for round-trip compatibility).
- **When** a caller invokes `readExecutionState` and the file does not exist **then** `null` is returned (no error thrown).
- **When** a caller invokes `readExecutionState` on a file with malformed JSON (truncated mid-write, corrupted bytes, non-JSON content) **then** `null` is returned (no error thrown). The reader's tolerance covers crash mid-write recovery.
- **When** a caller invokes `clearExecutionState(projectRoot)` **then** `writeExecutionState(projectRoot, { status: 'idle' })` is called, producing the idle-normalized document.
- **When** any public function is called with a `projectRoot` that does not resolve to a directory containing `.context-index/manifest.yaml` **then** `INVALID_PROJECT_ROOT` is thrown before any I/O occurs.
- **When** the resolved state path or temp-file path escapes `<storageRoot>/.context-index/` **then** `INVALID_STORAGE_PATH` is thrown before any write occurs (defense against crafted `projectRoot` traversal).
- **When** any public function is called from inside a linked `git worktree` **then** the state file resolves to the main repository root (`git rev-parse --git-common-dir`), so every worktree of a repository reads and writes one execution state (issue-607). A stale worktree-local `.execution-state.json` left behind by an earlier revision is ignored, never read and never written.
- **When** the manifest sets `tasks.db_path` **then** that directory is the storage root for `.execution-state.json`, exactly as it already is for `tasks/tasks.json` and `milestones.json` (unified knob). **When** it points at a path that is not an existing directory **then** `INVALID_STORAGE_PATH` is thrown before any I/O.
- **When** the git probe fails (no repository, git unavailable) and no `tasks.db_path` is set **then** the caller-supplied `projectRoot` remains the storage root (rev 2 behavior).
- **When** `hooks/_execution-state.mjs` is invoked with `ADEV_CONTEXT_ROOT` set to a valid project root containing `.execution-state.json` **then** the helper writes a single line of JSON to stdout (the parsed state object) and exits 0.
- **When** `hooks/_execution-state.mjs` is invoked with `ADEV_CONTEXT_ROOT` unset, set to a non-existent path, or pointing at a project without a state file **then** the helper writes `null` to stdout and exits 0. The caller (shell script) interprets `null` as "no resume needed / status unknown".
- **When** `hooks/_execution-state.mjs` is invoked with `ADEV_EXECUTION_STATE_MODE=resume-block` and the resolved state has `status: "active"` **then** the helper emits the resume-block markdown including `Status: active`, `Plan: <planRef>`, `Current Task: <currentTask>`, `Issue: <issueBinding>`, `Next Action: <nextAction>`, and a `## Progress` section listing each `progress[]` entry as a `- [x|/space/]` line, followed by `Resume from Task <currentTask>.` Free-text field values have their newlines replaced with spaces and are truncated per the field-rendering safety rules before interpolation.
- **When** `hooks/_execution-state.mjs` is invoked with `ADEV_EXECUTION_STATE_MODE=resume-block` and the resolved state has `status: "blocked"` **then** the helper emits a resume block including `Status: blocked`, `Blocker: <blockers>`, `Next Action: <nextAction>` (each with newline-to-space rendering and 4 KB truncation), and the trailing line `Address the blocker before continuing implementation.`
- **When** `hooks/_execution-state.mjs` resolves a state with `status` set to `idle`, `standalone`, the empty string, any unknown value, or when `readExecutionState` returns `null` **then** the helper emits empty stdout (no resume block is added). Exit code is 0 in every case.
- **When** `hooks/session-start.sh` runs and no `.execution-state.json` file exists **then** the resume block is empty and the rest of the SessionStart context (the using-adev SKILL, persona block, update block) is emitted exactly as today.
- **When** `hooks/lifecycle-gate-bash.sh` runs and the state file is missing or its status is anything other than `standalone` or `active` **then** the gate proceeds to the passthrough-pattern check and the existing enforcement logic; the hook's allow/block decision and exit code are unchanged from today's behavior.
- **When** any caller writes to `.execution-state.md` (the legacy path) via any code path **then** a CI architectural test catches it and fails the build.

## Postconditions

- After a successful `writeExecutionState`, `.context-index/.execution-state.json` is a syntactically valid JSON document containing every field declared in the schema, including a fresh ISO-8601 `updated` timestamp.
- After a rejected `writeExecutionState` (any validation throw), `.execution-state.json` is byte-for-byte identical to its pre-call state.
- After a `_write()` failure path, no temp file from that operation remains on disk (best-effort `fs.unlinkSync` cleanup, swallowing cleanup errors). This mirrors `lib/build-state.mjs::atomicWriteJson`.
- After a `readExecutionState` call, the returned object is independent of any future writes — subsequent writes do not mutate prior return values.
- After `clearExecutionState`, `.execution-state.json` exists with the idle-normalized shape and no binding fields are populated.
- After `hooks/_execution-state.mjs` returns, its stdout contains exactly one parseable JSON value (an object or `null`), with no trailing or leading garbage. The shell caller can `JSON.parse` it directly.
- After `hooks/_execution-state.mjs` returns in `resume-block` mode, its stdout contains either the full resume-block markdown (terminated with a single trailing newline) or empty. The shell caller can append this content to the SessionStart `additionalContext` envelope without further sanitization — the helper has already applied newline-to-space and per-field truncation.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `writeExecutionState` called with `state.status` not in `{idle, active, blocked, standalone}` | Throws with message naming the invalid status; `.execution-state.json` unchanged | INVALID_STATUS |
| `writeExecutionState` called with `state.status === "active"` and missing `state.planRef` | Throws; `.execution-state.json` unchanged | MISSING_PLAN_REF |
| `writeExecutionState` called with `state.status === "active"` and `state.currentTask == null` | Throws; `.execution-state.json` unchanged | MISSING_CURRENT_TASK |
| Any public function called with a `projectRoot` that does not resolve to a directory containing `.context-index/manifest.yaml` after `path.resolve()` | Throws `INVALID_PROJECT_ROOT` with the resolved path | INVALID_PROJECT_ROOT |
| Any public function whose resolved state-file path escapes `<storageRoot>/.context-index/` (e.g., via a crafted `projectRoot` symlink) | Throws `INVALID_STORAGE_PATH` with the offending resolved path before any I/O | INVALID_STORAGE_PATH |
| `tasks.db_path` resolves to a regular file, a nonexistent path, or a path that cannot be canonicalized | Throws `INVALID_STORAGE_PATH` ("must point at an existing directory") before any I/O. Same defense as `lib/milestones.mjs`. | INVALID_STORAGE_PATH |
| `writeExecutionState` rename step fails (`EACCES`, `ENOSPC`, etc.) | Best-effort `fs.unlinkSync` on the temp file, then rethrows the underlying `fs` error code unchanged. `.execution-state.json` is unchanged. | FS_ERROR |
| `writeExecutionState` temp-file write step fails | Propagates `fs` error. No rename attempted. `.execution-state.json` unchanged. | FS_ERROR |
| `readExecutionState` encounters a missing file | Returns `null` (no error thrown) | — (no error) |
| `readExecutionState` encounters malformed JSON, truncated content, or non-JSON content | Returns `null` (no error thrown). Reader tolerance is the crash-mid-write recovery path. | — (no error) |
| `readExecutionState` called with an invalid `projectRoot` | Throws `INVALID_PROJECT_ROOT` (with `INVALID_STORAGE_PATH`, one of only two error conditions under which read throws) | INVALID_PROJECT_ROOT |
| `hooks/_execution-state.mjs` invoked with `ADEV_CONTEXT_ROOT` unset or pointing at a non-existent directory | Writes `null` to stdout, exits 0 | — (no error) |
| `hooks/_execution-state.mjs` invoked against a state file that fails to parse | Writes `null` to stdout, exits 0 (inherits `readExecutionState` tolerance) | — (no error) |
| `hooks/_execution-state.mjs` encounters an unhandled internal error (missing `lib/execution-state.mjs`, broken import, etc.) | Writes empty stdout, exits 1. The shell caller treats non-zero exit as "no resume / no gating signal" and proceeds without error. | HELPER_BOOTSTRAP_ERROR |
| `hooks/_execution-state.mjs` in `resume-block` mode encounters a malformed `.execution-state.json` (caught by `readExecutionState` returning `null`) | Writes empty stdout, exits 0 (no resume block, no error propagation to the shell caller) | — (no error) |
| `.execution-state.json` on disk exceeds the 256 KB cap | `readExecutionState` returns `null`; helper emits empty stdout in `resume-block` mode and `"null"` in `read` mode. Exit 0. Addresses review-rev-1 SEC-2. | STATE_FILE_TOO_LARGE (logged to discarded stderr) |
| `hooks/_execution-state.mjs` invoked with an unknown `ADEV_EXECUTION_STATE_MODE` value | Defaults to `resume-block`, emits a one-time stderr warning (discarded by shell caller). Exit 0. | UNKNOWN_HELPER_MODE_DEFAULTED (warning on discarded stderr) |
| Any caller writes to `.execution-state.md` after this spec lands | CI architectural test fails the build | ARCH_VIOLATION_LEGACY_FORMAT |
| Any hook script reintroduces inline YAML / regex parsing of the state file | CI architectural test (`grep` against `hooks/*.sh`) fails the build | ARCH_VIOLATION_HOOK_INLINE_PARSE |
