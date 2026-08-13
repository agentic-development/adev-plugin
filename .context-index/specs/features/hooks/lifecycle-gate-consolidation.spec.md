<!-- partial_schema: spec@1 -->

---
charter: hooks
kind: refactor
mode: refactor
status: review-pending
milestone: —
revision: 1
charter-revision: 1
charter-extension: true
created: 2026-08-12
updated: 2026-08-12
tracker-ref: "issue-579 / epic-102"
---

<!-- charter-extension: the hooks charter (rev 1, 2026-03-22) predates the lifecycle-gate,
     session-capture, and preflight hook families — it lists 4 scripts; hooks/ has 22 files.
     This spec extends beyond the charter's listed inventory. The charter needs a refresh
     via /adev:brainstorm --module hooks (out of scope here). -->

# Refactoring Spec: Lifecycle-Gate Hook Consolidation

## Current State

### Structure

| File | Role | Lines | Notes |
|---|---|---|---|
| `hooks/lifecycle-gate-edit.sh` | PreToolUse:Edit gate | 149 | Reads user-config level, execution state, dispatches checker |
| `hooks/lifecycle-gate-bash.sh` | PreToolUse:Bash gate | 136 | Same skeleton; bash-passthrough branch |
| `hooks/lifecycle-gate-advisory.sh` | PostToolUse:.* advisory | 111 | Same skeleton; fires on EVERY tool call |
| `hooks/_lifecycle-gate-check-edit.mjs` | file-exclusion checker shim | 36 | Wraps `isFileExcluded` |
| `hooks/_lifecycle-gate-check-bash.mjs` | passthrough checker shim | 31 | Wraps `isBashPassthrough` |
| `hooks/context-read-tracker.sh` | PostToolUse:Read | 25 | Touches `.context-preflight-ok`; visibility is a strict subset of session-capture's `.*` matcher |
| `hooks/session-capture.sh` | PostToolUse:.* | 194 | Lines 15–40 embed an inline-Node heredoc; `lib/session-capture.mjs` exists and is already used by `session-end.sh` |

### Problems

1. **Triplicated gate skeleton.** The three gate hooks share level resolution, `find_context_index()`, execution-state read, and enforcement rendering — ~396 lines where one dispatcher suffices. Every behavior fix (e.g. the 2026-08 escape-hatch messaging) must be applied three times; the standalone-skill deletion PR had to patch all three.
2. **Redundant per-tool-call work.** A gated Edit triggers two full state reads (gate-edit at PreToolUse, advisory at PostToolUse); a Read triggers three hook processes (`context-read-tracker`, `session-capture`, `lifecycle-gate-advisory`) where one suffices.
3. **`find_context_index()` duplicated verbatim in 5 hooks** (`context-preflight.sh`, the three gate hooks, `session-start.sh`) — ~60 lines of copy-paste; the shared-helper pattern already exists (`_parse-stdin.sh`).
4. **Inline-Node heredoc in `session-capture.sh:15-40`** — the pattern `.githooks/pre-commit-no-inline-node` bans in skills, living in a hook, while the equivalent library entry point (`lib/session-capture.mjs`) already exists.
5. **Two checker subprocesses** (`_lifecycle-gate-check-{edit,bash}.mjs`) that differ only in which lib function they call.

### Dependencies (migration constraints)

- `hooks/hooks.json` registration map (plugin-shipped) and its provider projections: `scripts/build-copilot-hooks.mjs` → `providers/copilot/hooks.json`; other provider adapters consume `hooks.json` conventions per their charters.
- `tests/hooks/*.test.mjs` (216 tests) exercise the three gate hooks by path via `runHook()` from `tests/helpers.mjs`.
- `_parse-stdin.sh` is sourced by hooks in both plugin mode (env vars pre-set) and settings.json mode (stdin JSON only) — the dispatcher must work in both.
- ADR 0016: hooks are trigger plumbing; state stays in `.context-index/` — nothing here may move state.

## Target State

### Structure

| File | Role | Status |
|---|---|---|
| `hooks/lifecycle-gate.sh` | Single gate, registered under PreToolUse:Edit, PreToolUse:Bash, PostToolUse:.*; dispatches on `CLAUDE_HOOK_EVENT` + `CLAUDE_HOOK_TOOL` | new |
| `hooks/_lifecycle-gate-check.mjs` | Single checker with `--surface file\|bash` argument | new (merges 2) |
| `hooks/_parse-stdin.sh` | Also exports `CLAUDE_HOOK_EVENT` / `CLAUDE_HOOK_TOOL` from stdin JSON; hosts the hoisted `find_context_index()` | modified |
| `hooks/session-capture.sh` | Gains the Read-branch touch of `.context-preflight-ok`; heredoc replaced by `node "$PLUGIN_ROOT/lib/session-capture.mjs" --event tool-use` delegation | modified |
| `hooks/lifecycle-gate-{edit,bash,advisory}.sh`, `hooks/_lifecycle-gate-check-{edit,bash}.mjs`, `hooks/context-read-tracker.sh` | — | deleted (6 files) |
| `hooks/hooks.json` | Same three matchers, one gate script; `context-read-tracker` entry removed | modified |

### Improvements

- Problem 1 → one skeleton, one enforcement-message site, one state-read implementation.
- Problem 2 → per-Read hook invocations drop 3 → 2 (capture + gate); no behavior change.
- Problem 3 → single `find_context_index()` in the sourced shared helper.
- Problem 4 → hooks contain no inline Node beyond the existing `_parse-stdin.sh` bridge; capture logic lives in the library it already had.
- Problem 5 → one checker subprocess, `--surface` flag.

## Changes Catalog

| Change | Type | Files |
|---|---|---|
| Export event/tool from stdin JSON; hoist `find_context_index()` | modify | `hooks/_parse-stdin.sh` + 5 consumers |
| Merge checker shims | replace | `_lifecycle-gate-check-{edit,bash}.mjs` → `_lifecycle-gate-check.mjs` |
| Consolidate gate hooks | replace | 3 gate scripts → `lifecycle-gate.sh`; `hooks.json` |
| Fold read-tracker into capture | merge+delete | `context-read-tracker.sh` → `session-capture.sh`; `hooks.json` |
| Replace capture heredoc with lib delegation | modify | `session-capture.sh`, reusing `lib/session-capture.mjs` |
| Regenerate provider hook projections | mechanical | `providers/copilot/hooks.json` (+ any adapter-consumed copies) |

## Migration Path

| # | Step | Risk | Verify |
|---|---|---|---|
| 1 | Extend `_parse-stdin.sh` (event/tool exports + hoisted `find_context_index()`); switch 5 hooks to the shared copy | Low | Full `tests/hooks/` suite; both plugin-mode and settings.json-mode fixtures |
| 2 | Merge the two checker shims into `_lifecycle-gate-check.mjs --surface file\|bash`; update gate hooks' dispatch lines | Low | Gate suites (config + hook level) |
| 3 | Introduce `lifecycle-gate.sh`; re-register the three matchers in `hooks.json` onto it; delete the three old gate scripts; update test paths | Medium | 216-test hook suite + `lifecycle-gate-registration` test; manual smoke: warn/confirm/block levels on Edit, Bash, and PostToolUse advisory |
| 4 | Fold `context-read-tracker.sh` into `session-capture.sh` (Read branch touches `.context-preflight-ok`); deregister and delete | Low | context-preflight tests (the touch-file consumer) |
| 5 | Replace the inline heredoc with `lib/session-capture.mjs --event tool-use` delegation; JSONL output byte-compatible | Medium | session-capture tests + before/after fixture diff of `.session-tracking.jsonl` entries |
| 6 | Regenerate provider hook projections; run parity/generator tests | Low | `tests/copilot-hooks-sync.test.mjs` (and sibling provider tests) |

Safe ordering: helpers before dispatcher (1–2 before 3); deletions ride the step that replaces them; providers last.

## Invariants

1. **Hook protocol unchanged** — stdin JSON + `CLAUDE_TOOL_INPUT_*` env in; JSON stdout; exit 0 allow / 2 block (constitution Principle 4). No approval-gated protocol change occurs.
2. **Gate decisions byte-identical** for identical inputs across all levels (`off`/`warn`/`confirm`/`block`), both surfaces (file exclusion, bash passthrough incl. quote-aware splitting and the structural escape set), and both invocation modes (plugin env-var / settings.json stdin).
3. All existing tests pass at every migration step.
4. Hook invocations per tool call never increase; per-Read they decrease 3 → 2.
5. No adev state moves out of `.context-index/` (ADR 0016); capture JSONL schema unchanged.
6. No new dependencies; no new inline-Node blocks (net removal of one).

## Behavioral Contract

<!-- Target behavior after refactoring — what /adev:validate verifies. -->

- **When** PreToolUse fires for Edit under `lifecycle.gate=block` with no active plan and a non-excluded file **then** the consolidated hook exits 2 with the same block message emitted today.
- **When** PreToolUse fires for Bash with a passthrough command (including quoted-pipe commands and the structural escape `adev execution-state write --status standalone`) **then** the hook exits 0 with no output.
- **When** PostToolUse fires for any tool under an advisory-relevant state **then** the consolidated hook reproduces `lifecycle-gate-advisory.sh`'s current output verbatim.
- **When** PostToolUse fires for Read on a `.context-index/` path **then** `session-capture.sh` touches `.context-preflight-ok` (formerly context-read-tracker's job) and records the capture event in the same invocation.
- **When** a hook is invoked in settings.json mode (no `CLAUDE_TOOL_INPUT_*` env) **then** `_parse-stdin.sh` resolves `CLAUDE_HOOK_EVENT`, `CLAUDE_HOOK_TOOL`, and tool-input fields from stdin JSON and the dispatcher routes identically to plugin mode.
- **When** the dispatcher receives an unknown event or missing tool name **then** it exits 0 (fail-open — gates only ever block on positively identified gated actions; observational paths never block).
- **When** `session-capture.sh` records a tool call **then** the `.session-tracking.jsonl` entry schema is byte-compatible with the pre-refactor writer.

### Error Cases

| Condition | Expected behavior | Exit |
|---|---|---|
| Malformed stdin JSON | Drain stdin, treat as no-op, allow | 0 |
| Unknown `hook_event_name` | Allow (fail-open, observational) | 0 |
| Missing `tool_name` on PostToolUse | Run advisory branch only | 0 |
| `node` unavailable | Allow (matches current guard behavior) | 0 |
| Checker subprocess crash | Allow with stderr diagnostic (matches current `|| echo passthrough` fallback) | 0 |

## System Constitution Reference

- **Principle 4 (hook protocol compliance)** — the refactor's primary invariant; the protocol is the fixed point the consolidation preserves.
- **Principle 1 (minimize dependencies)** — merged checker and lib delegation reuse existing Node built-ins; nothing added.
- **Anti-pattern: inline Node** — this refactor removes the one hook-side heredoc, aligning hooks with the standard applied to skills.
- **Architecture boundary:** "Changing the hook protocol" requires human approval — this spec explicitly does NOT change it; registration entries in `hooks.json` change, the contract does not.

## Acceptance Criteria

- [ ] `hooks/` contains one lifecycle-gate script; the three per-surface gate scripts and both checker shims are deleted
- [ ] `find_context_index()` exists in exactly one file, sourced by all consumers
- [ ] `context-read-tracker.sh` deleted; `.context-preflight-ok` touch verified via session-capture path
- [ ] `session-capture.sh` contains no inline-Node heredoc; delegates to `lib/session-capture.mjs`
- [ ] `hooks/hooks.json` registers the consolidated script under the same three matchers; provider projections regenerated and parity tests pass
- [ ] Full `tests/hooks/` suite passes at every migration step (216 baseline; updated paths in step 3)
- [ ] Gate-decision equivalence fixtures: identical verdict + output for a matrix of (level × surface × invocation-mode) inputs, pre vs post
- [ ] All quality gates pass; no constitutional violations
