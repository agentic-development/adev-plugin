---
charter: hooks
kind: refactor
mode: refactor
status: review-pending
milestone: —
revision: 2
charter-revision: 1
charter-extension: true
created: 2026-08-12
updated: 2026-08-13
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
| `hooks/session-capture.sh` | PostToolUse:.* | 194 | Effectively one inline-Node program (lines 14–194): JSONL append to `.session-tracking.jsonl`, provider resolution, issue/epic enrichment, token-usage cursor. `lib/session-capture.mjs` serves ONLY `session-end`/`pre-compact` markdown capture (`:437-439` hard-rejects other events) — **no per-tool-call lib path exists today** |

### Problems

1. **Triplicated gate skeleton.** The three gate hooks share level resolution, `find_context_index()`, execution-state read, and enforcement rendering — ~396 lines where one dispatcher suffices. Every behavior fix (e.g. the 2026-08 escape-hatch messaging) must be applied three times; the standalone-skill deletion PR had to patch all three.
2. **Redundant per-tool-call work.** A gated Edit triggers two full state reads (gate-edit at PreToolUse, advisory at PostToolUse); a Read triggers three hook processes (`context-read-tracker`, `session-capture`, `lifecycle-gate-advisory`) where one suffices.
3. **`find_context_index()` duplicated verbatim in 5 hooks** (`context-preflight.sh`, the three gate hooks, `session-start.sh`) — ~60 lines of copy-paste; the shared-helper pattern already exists (`_parse-stdin.sh`).
4. **`session-capture.sh` is a ~180-line inline-Node program** (lines 14–194) — the pattern `.githooks/pre-commit-no-inline-node` bans in skills, living in a hook. The library that should own this logic (`lib/session-capture.mjs`) implements only the `session-end`/`pre-compact` markdown path; the tool-call JSONL capture path must be **built** there before the shell hook can delegate (review blocker 5b2c).
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
| `hooks/lifecycle-gate.sh` | Single gate, registered **three times** in `hooks.json` with an **argv surface argument**: `lifecycle-gate.sh pre-edit` (PreToolUse:Edit), `pre-bash` (PreToolUse:Bash), `advisory` (PostToolUse:.*). Dispatch key comes from `$1` — a channel the plugin fully controls, with **no dependency on unverified stdin fields** (blocker 9e41). Unknown/missing `$1` → exit 0 fail-open with a stderr diagnostic (registration bug, never a silent gating regression) | new |
| `hooks/_lifecycle-gate-check.mjs` | Single checker with `--surface file\|bash` argument | new (merges 2) |
| `hooks/_parse-stdin.sh` | Hosts the hoisted `find_context_index()`. Opportunistic hardening while touched: allowlist `tool_input` key names (`^[A-Za-z_][A-Za-z0-9_]*$`) before the `eval` export (pre-existing key-injection surface); any future stdin-field exports use fixed literal names only | modified |
| `lib/session-capture.mjs` | Gains a **new** `tool-use` capture path: appends to `.context-index/.session-tracking.jsonl` with a schema byte-compatible with the current shell writer (provider resolution, issue/epic enrichment, token-usage cursor ported over with unit tests) | modified |
| `hooks/session-capture.sh` | Gains the Read-branch touch of `.context-preflight-ok`; the ~180-line inline program replaced by delegation to the new lib `tool-use` path | modified |
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
| Build lib `tool-use` capture path, then delegate | build + modify | `lib/session-capture.mjs` (new path + tests), then `session-capture.sh` |
| Regenerate provider hook projections | mechanical | `providers/copilot/hooks.json` (+ any adapter-consumed copies) |

## Migration Path

| # | Step | Risk | Verify |
|---|---|---|---|
| 0 | **Capture golden-output fixtures** for the three gate hooks across the equivalence matrix (level × surface × invocation-mode × advisory counter cadence) while the source scripts still exist — byte-level stdout + exit-code snapshots checked into `tests/fixtures/` | Low | Fixture-capture script run; snapshots reviewed |
| 1 | `_parse-stdin.sh`: hoist `find_context_index()`; allowlist `tool_input` key names before the `eval` export; switch the 5 consumer hooks to the shared copy. **No stdin event-field exports** — dispatch does not depend on stdin (blocker 9e41) | Low | Full `tests/hooks/` suite; golden fixtures unchanged |
| 2 | Merge the two checker shims into `_lifecycle-gate-check.mjs --surface file\|bash`; update gate hooks' dispatch lines | Low | Gate suites (config + hook level); golden fixtures unchanged |
| 3 | Introduce `lifecycle-gate.sh <surface>`; re-register the three matchers in `hooks.json` passing the argv surface; delete the three old gate scripts. Rework `lifecycle-gate-registration.test.mjs` to matcher/position semantics (same filename now appears in three entries — filename-based ordering assertions no longer discriminate) | Medium | Golden-fixture equivalence gate (step 0 snapshots vs consolidated output, byte-diff); full hook suite |
| 4 | Fold `context-read-tracker.sh` into `session-capture.sh` (Read branch touches `.context-preflight-ok`); deregister and delete; **migrate its 6 tests** into the session-capture suite | Low | Migrated tests + context-preflight tests (the touch-file consumer) |
| 5a | **Build** the `tool-use` capture path in `lib/session-capture.mjs`: port the shell program's JSONL append, provider resolution, issue/epic enrichment, and token-usage cursor, with unit tests asserting entry-schema byte-compatibility against fixtures of current writer output (blocker 5b2c) | **High** | New unit tests; fixture diff of `.session-tracking.jsonl` entries |
| 5b | Switch `hooks/session-capture.sh` to delegate to the new lib path; delete the inline program | Medium | session-capture hook tests + end-to-end fixture diff |
| 6 | Regenerate provider hook projections; run parity/generator tests | Low | `tests/copilot-hooks-sync.test.mjs` (and sibling provider tests) |

Safe ordering: fixtures before any change (0 first — after step 3 deletes the scripts there is no source of truth left to diff against); helpers before dispatcher (1–2 before 3); deletions ride the step that replaces them; 5a lands with tests before 5b touches the shell; providers last.

## Invariants

1. **Hook protocol unchanged** — stdin JSON + `CLAUDE_TOOL_INPUT_*` env in; JSON stdout; exit 0 allow / 2 block (constitution Principle 4). No approval-gated protocol change occurs.
2. **Gate decisions byte-identical** for identical inputs across all levels (`off`/`warn`/`confirm`/`block`), both surfaces (file exclusion, bash passthrough incl. quote-aware splitting and the structural escape set), both invocation modes (plugin env-var / settings.json stdin), **and the advisory counter cadence** (the stateful `.advisory-counter` throttle at `lifecycle-gate-advisory.sh:80-96` emits every Nth call — cadence must survive consolidation). Verified against the step-0 golden fixtures.
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
- **When** the consolidated gate is invoked in either mode (plugin env-var or settings.json stdin) **then** dispatch resolves from the argv surface argument alone — behavior is invocation-mode-independent by construction; `_parse-stdin.sh` continues to bridge `tool_input` fields exactly as today.
- **When** the dispatcher receives an unknown or missing surface argument **then** it exits 0 with a stderr diagnostic (fail-open — a mis-registration must be loudly visible but never a block; gates only block on positively identified gated actions).
- **When** `session-capture.sh` records a tool call **then** the `.session-tracking.jsonl` entry schema is byte-compatible with the pre-refactor writer.

### Error Cases

| Condition | Expected behavior | Exit |
|---|---|---|
| Malformed stdin JSON | Drain stdin, treat as no-op, allow | 0 |
| Unknown / missing argv surface argument | Allow + stderr diagnostic (registration bug) | 0 |
| `tool_input` key failing the allowlist | Key skipped (not exported); remaining keys processed | 0 |
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
- [ ] Full `tests/hooks/` suite passes at every migration step (216 baseline; registration test reworked to matcher/position semantics; read-tracker's 6 tests migrated, not dropped)
- [ ] Gate-decision equivalence: byte-identical stdout + exit codes vs the step-0 golden fixtures across (level × surface × invocation-mode × advisory-counter-cadence)
- [ ] `lib/session-capture.mjs` `tool-use` path unit tests prove `.session-tracking.jsonl` entry-schema byte-compatibility against fixtures of the current shell writer's output
- [ ] All quality gates pass; no constitutional violations
