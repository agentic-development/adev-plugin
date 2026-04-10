---
charter: hooks
status: review-passed
risk_level: low
milestone: v1
revision: 2
charter-revision: 4
created: 2026-04-09
updated: 2026-04-10
---

# Live Spec: Plan Mode Guard

<!-- Live Spec within the hooks charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/hooks/charter.md -->

## Behavioral Contract

This capability provides a harness-agnostic check for whether an agent-authored plan routes through the adev lifecycle, plus a Claude Code hook adapter that surfaces an advisory when the check fails. The advisory is non-blocking: the `ExitPlanMode` tool call always proceeds. The check logic lives in `lib/` so future harness adapters (OpenCode, Codex) can reuse it without duplicating the regex or message text.

### Architecture

The capability is split across three layers:

1. **Core check (harness-agnostic):** `lib/plan-mode-check.mjs` exports a pure function `checkPlanMode(planText)` that returns `{ hasAdevInvocation, advisoryMessage }`. Also exports the regex constant and the advisory message template so adapters can reference them without copy-paste. No I/O, no dependencies.
2. **Claude Code adapter (Node):** `hooks/plan-mode-guard.mjs` reads stdin JSON, extracts `tool_input.plan`, calls `checkPlanMode`, and emits a `hookSpecificOutput.additionalContext` JSON payload to stdout (same envelope used by `context-preflight.sh`) when the plan lacks `/adev:*` invocations. Exit 0 on every code path except unexpected bash internal errors.
3. **Claude Code wrapper (bash):** `hooks/plan-mode-guard.sh` is a thin wrapper that pipes stdin to `node hooks/plan-mode-guard.mjs` with graceful degradation (`|| echo '{}'`), matching the `issue-reminder.sh` / `issue-reminder.mjs` precedent.

Future harness adapters (e.g., `providers/opencode/plugin.mjs`) can import `checkPlanMode` from `lib/plan-mode-check.mjs` directly — no duplication, no separate fork of the check logic.

### Preconditions

- `hooks/hooks.json` registers `plan-mode-guard.sh` under `PreToolUse.ExitPlanMode`.
- `hooks/plan-mode-guard.sh` is executable (`chmod +x`).
- `lib/plan-mode-check.mjs` exists and exports `checkPlanMode`, the regex constant, and the advisory message constant.
- `skills/using-adev/SKILL.md` has a new top-level `## Plan Mode Rule` section placed between `## Context-First Rule` and `## Skill Invocation Rule`.
- Node.js is available on the agent's machine (already required by the plugin).

### Behaviors

1. **When** `checkPlanMode(planText)` is called and `planText` contains at least one substring matching the regex `/\/adev:[a-z-]+/` **then** it returns `{ hasAdevInvocation: true, advisoryMessage: null }`.
2. **When** `checkPlanMode(planText)` is called and `planText` contains no substring matching the regex **then** it returns `{ hasAdevInvocation: false, advisoryMessage: <static string> }` where the advisory is a fully-rendered static constant (no interpolation of `planText`) recommending rewriting the plan as a skill-sequence in the canonical order `/adev:brainstorm → /adev:specify → /adev:review-specs → /adev:plan → /adev:implement → /adev:validate`. The advisory message must never embed the user's plan text to avoid reflection of control characters or prompt-injection strings.
3. **When** `checkPlanMode` is called with `null`, `undefined`, an empty string, or a non-string value (array, object, number) **then** it returns `{ hasAdevInvocation: false, advisoryMessage: <static string> }` (treats missing or invalid plan as non-adev). Type-check at entry: if `typeof planText !== 'string'`, return the advisory immediately without attempting regex matching.
4. **When** Claude invokes `ExitPlanMode` and the Claude Code adapter (`hooks/plan-mode-guard.mjs`) reads stdin JSON containing `tool_input.plan` **then** it calls `checkPlanMode` on that plan text and, if `advisoryMessage` is present, emits `{"hookSpecificOutput": {"additionalContext": "<advisoryMessage>"}}` to stdout. Exit code 0.
5. **When** the Claude Code adapter reads stdin and the JSON is malformed, missing `tool_input`, or missing `tool_input.plan` **then** it exits 0 without emitting any advisory (fail-open: do not disrupt `ExitPlanMode` on parse failure).
6. **When** the Claude Code adapter runs and `checkPlanMode` returns `hasAdevInvocation: true` **then** it exits 0 with no stdout output (pass-through).
7. **When** the bash wrapper (`hooks/plan-mode-guard.sh`) pipes stdin to node and node exits non-zero or is missing **then** the wrapper falls back to `echo '{}'` and exits 0 (graceful degradation, same pattern as `issue-reminder.sh`).
### Integration Notes (downstream consumers, not owned by this spec)

- **Claude Code session-start:** `session-start.sh` injects `skills/using-adev/SKILL.md` (which now includes the `## Plan Mode Rule` section) into the session context, priming Claude on the expected plan shape before any work begins.
- **OpenCode session-start:** `providers/opencode/plugin.mjs`'s `session.created` handler (which already reads `skills/using-adev/SKILL.md`) picks up the new `## Plan Mode Rule` section automatically — no OpenCode code changes required for soft priming.

### Postconditions

- No `ExitPlanMode` invocation is ever blocked — the hook exits 0 on every expected code path (only unexpected bash internal errors can produce non-zero exit, and Claude Code treats non-2 as non-blocking anyway).
- When the plan contains at least one `/adev:*` invocation, there are zero side effects: no stdout, no stderr, no injected context.
- When the plan lacks `/adev:*` invocations, the agent sees the advisory message as injected context via `hookSpecificOutput.additionalContext` and can choose to rewrite or proceed.
- The core check is reusable: any future harness adapter can `import { checkPlanMode } from "lib/plan-mode-check.mjs"` and apply the same logic to its own plan-mode event.

### Error Cases

| Condition | Expected Behavior | Exit Code |
|-----------|-------------------|-----------|
| Malformed stdin JSON | Adapter fails open — exit 0, no advisory | 0 |
| Missing `tool_input` object | Adapter fails open — exit 0, no advisory | 0 |
| Missing `tool_input.plan` field | Adapter fails open — exit 0, no advisory | 0 |
| `tool_input.plan` is `null`, `undefined`, empty string, or non-string type | `checkPlanMode` treats as non-adev — advisory emitted | 0 |
| `checkPlanMode` throws (should be impossible — pure function with no I/O) | Adapter catches, exits 0, no advisory (fail-open) | 0 |
| Node.js not installed / script not found | Bash wrapper's `|| echo '{}'` fallback fires | 0 |
| Unexpected bash internal error caught by `set -uo pipefail` | Non-zero exit; Claude Code tolerates non-2 exit codes as non-blocking | non-zero |

## System Constitution Reference

- **Principle 1: Minimize external dependencies** — `lib/plan-mode-check.mjs` uses zero dependencies (pure string operations). `hooks/plan-mode-guard.mjs` uses only Node.js built-ins (`process.stdin`, `JSON`). No npm packages added.
- **Principle 3: Pure ESM** — Both new `.mjs` files use ESM imports/exports with `.mjs` extensions, matching the project convention.
- **Principle 4: Hook protocol compliance** — Bash wrapper follows the established stdin-JSON + exit-code contract. Advisory emission uses the `hookSpecificOutput.additionalContext` JSON structure already used by `context-preflight.sh`. No changes to the hook protocol.
- **Hooks charter (rev 3): "Bash-first, .mjs when justified"** — The `.mjs` adapter is justified by harness-agnostic reuse: `lib/plan-mode-check.mjs` is intended to be imported by future OpenCode and Codex adapters, eliminating the need for a bash/JS fork. This is a stronger justification than `issue-reminder.mjs` (which was justified by JSON parsing complexity).
- **Hooks charter (rev 3): "Non-blocking by default for advisory hooks"** — This spec is the reference implementation for the newly-codified advisory-hook rule. Exit 0 on every expected path; hard-block is reserved for constitutional enforcement.
- **Architecture Boundary: "Changing the hook protocol requires human approval"** — This spec does NOT change the protocol. It adds a new hook entry using the existing contract.

## Actionable Task Map

<!-- Preliminary breakdown. /adev:plan will refine this after review. -->

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1 | Write failing test: `checkPlanMode` returns `{ hasAdevInvocation: true, advisoryMessage: null }` when plan contains `/adev:brainstorm` | small |
| 2 | Write failing test: `checkPlanMode` returns advisory when plan contains no `/adev:*` (e.g., "edit file.ts, add function") | small |
| 3 | Write failing test: `checkPlanMode` handles `null`, `undefined`, empty string | small |
| 4 | Write failing test: advisory message contains the canonical skill sequence | small |
| 5 | Implement `lib/plan-mode-check.mjs` — pure function + exported regex/message constants | small |
| 6 | Write failing test: `hooks/plan-mode-guard.mjs` emits correct Claude Code JSON on advisory | small |
| 7 | Write failing test: `hooks/plan-mode-guard.mjs` emits nothing on pass-through | small |
| 8 | Write failing test: `hooks/plan-mode-guard.mjs` fails open on malformed stdin | small |
| 9 | Write failing test: `hooks/plan-mode-guard.mjs` fails open on missing `tool_input.plan` | small |
| 10 | Implement `hooks/plan-mode-guard.mjs` — Claude Code adapter | medium |
| 11 | Add `hooks/plan-mode-guard.sh` — thin bash wrapper matching `issue-reminder.sh` pattern | small |
| 12 | Register hook in `hooks/hooks.json` under `PreToolUse.ExitPlanMode` | small |
| 13 | Add `## Plan Mode Rule` section to `skills/using-adev/SKILL.md`, placed between existing `## Context-First Rule` and `## Skill Invocation Rule` | small |
| 14 | Update hooks charter Capability Map: mark plan-mode-guard capability as `status: specified` | small |

## Acceptance Criteria

- [ ] `lib/plan-mode-check.mjs` exists and exports `checkPlanMode` as a pure function (no I/O, no dependencies beyond language built-ins)
- [ ] `lib/plan-mode-check.mjs` also exports the regex constant and the advisory message template as named exports, allowing adapters to reference them without duplication
- [ ] `checkPlanMode(planText)` returns the documented shape for every input case (contains adev, no adev, null, undefined, empty string)
- [ ] `tests/plan-mode-check.test.mjs` exercises the pure function directly with at least 5 test cases
- [ ] `hooks/plan-mode-guard.mjs` imports from `lib/plan-mode-check.mjs` (not inlined) and handles stdin JSON parsing
- [ ] `hooks/plan-mode-guard.mjs` emits `{"hookSpecificOutput": {"additionalContext": "<advisoryMessage>"}}` only when the plan lacks `/adev:*`
- [ ] `hooks/plan-mode-guard.mjs` fails open on malformed JSON, missing `tool_input`, or missing `tool_input.plan`
- [ ] `hooks/plan-mode-guard.sh` exists, is executable, and follows the `issue-reminder.sh` thin-wrapper pattern with `|| echo '{}'` fallback
- [ ] `hooks/hooks.json` registers `plan-mode-guard.sh` under `PreToolUse.ExitPlanMode`
- [ ] `tests/hooks/plan-mode-guard.test.mjs` exists with at least 4 test cases covering: pass-through, advisory, malformed stdin, missing `plan` field
- [ ] `skills/using-adev/SKILL.md` has a new top-level `## Plan Mode Rule` section placed between `## Context-First Rule` and `## Skill Invocation Rule`
- [ ] The Plan Mode Rule section documents the expected skill sequence: `/adev:brainstorm → /adev:specify → /adev:review-specs → /adev:plan → /adev:implement → /adev:validate`
- [ ] The Plan Mode Rule section states explicitly that the advisory is non-blocking
- [ ] The Plan Mode Rule section notes that this applies across harnesses (Claude Code hook + future OpenCode/Codex integration via `lib/plan-mode-check.mjs`)
- [ ] Hooks charter Capability Map row for "Plan Mode Guard" is updated to `status: specified`
- [ ] `npm test` passes with all new test files
- [ ] No constitutional violations introduced
- [ ] No new npm dependencies added
