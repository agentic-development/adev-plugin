---
status: approved
revision: 4
updated: 2026-04-10
---

# Feature Charter: Hooks

## Purpose

Hook scripts that run at Claude Code lifecycle events. They enforce project rules programmatically and inject context into the agent. Hooks fall into two categories: **guardrails** (enforce boundaries, may block or advise) and **infrastructure** (inject context, track session state, trigger syncs).

## Hook Inventory

| Script | Event | Category | Behavior |
|--------|-------|----------|----------|
| `session-start.sh` | SessionStart | infrastructure | Reads `using-adev/SKILL.md` and execution state, injects as additional context |
| `constitution-linter.sh` | PreToolUse:Edit | guardrail | Validates constitution edits: ≤200 lines, required sections, valid file references |
| `context-preflight.sh` | PreToolUse:Edit | guardrail | Warns when source code is edited without prior `.context-index/` reading |
| `merge-guard.sh` | PreToolUse:Bash | guardrail | Parses `manifest.yaml` merge policy, blocks commits/merges/pushes to protected branches (exit 2) |
| `plan-mode-guard.sh` | PreToolUse:ExitPlanMode | guardrail | Advisory check: emits `hookSpecificOutput.additionalContext` JSON on stdout when a plan lacks `/adev:*` skill invocations, suggesting rewrite as a skill-sequence. Exit 0 (non-blocking) |
| `context-read-tracker.sh` | PostToolUse:Read | infrastructure | Sets a session flag when `.context-index/` files are read (feeds context-preflight.sh) |
| `sync-trigger.sh` | PostToolUse:Edit | infrastructure | Non-blocking notification to run `/adev:sync` after constitution edits |
| `session-capture.sh` | PostToolUse:`.*` | infrastructure | Appends tool calls to `.context-index/.session-tracking.jsonl` |
| `issue-reminder.sh` | PostToolUse:`.*` | infrastructure | Counter-based trigger that surfaces in-progress issues every N tool calls and after git commits (delegates to `issue-reminder.mjs`) |

## Protocol

- **Input:** JSON on stdin + `CLAUDE_TOOL_INPUT_*` environment variables
- **Output:** JSON to stdout with optional `hookSpecificOutput` for context injection
- **Exit codes:** 0 = allow, 2 = block
- **Registration:** `hooks/hooks.json` maps events to scripts

## Constraints

- **Bash-first.** New hooks should be written in bash unless the logic would be unreasonable without a richer runtime (parsing complex JSON, cross-platform path handling, structured state). The `issue-reminder.mjs` precedent establishes that Node.js `.mjs` helpers are acceptable when justified, but bash remains the default.
- **No new dependencies.** Hooks — bash or .mjs — must use only Node.js built-ins (`fs`, `path`, `child_process`, `crypto`) and standard POSIX utilities. External npm packages are prohibited per constitutional principle 1.
- **Hook protocol compliance.** Hooks read JSON from stdin + `CLAUDE_TOOL_INPUT_*` env vars, exit 0 (allow) / 2 (block), and emit optional JSON to stdout with `hookSpecificOutput` for context injection. Changing this protocol requires human approval (constitutional Architecture Boundary).
- **Idempotent.** Hooks must be safe to run multiple times on the same input — no state leaks, no partial writes without atomic rename.
- **Non-blocking by default for advisory hooks.** Guardrail hooks that are meant as nudges (not hard gates) should exit 0 and emit advisory context via `hookSpecificOutput.additionalContext` JSON on stdout (matching the `context-preflight.sh` pattern). Hard-block (exit 2) is reserved for enforcement of constitutional boundaries and merge policy.

## Capability: Plan Mode Guard

**Status:** specified — see [`plan-mode-guard.md`](plan-mode-guard.md)

### Motivation

Claude Code's `ExitPlanMode` tool lets the agent present a plan to the user for approval before acting. In adev projects, plans should be expressed as a sequence of `/adev:*` skill invocations (e.g., `/adev:brainstorm` → `/adev:specify` → `/adev:plan` → `/adev:implement`), not as inline code-change checklists. When plans drift into inline edits, the lifecycle gates (HARD-GATEs in brainstorm, review-before-plan, TDD enforcement in implement) are bypassed. This capability provides a soft guardrail that nudges plans back into the adev lifecycle without hard-blocking legitimate non-adev work.

### Scope

**In scope:**

- A `PreToolUse:ExitPlanMode` hook (`plan-mode-guard.sh`) that inspects the plan text and emits an advisory when no `/adev:*` invocation is present
- Advisory-only behavior: the hook always exits 0 (non-blocking). It emits an advisory via `hookSpecificOutput.additionalContext` JSON on stdout (matching the `context-preflight.sh` pattern), suggesting the agent rewrite the plan as a skill-sequence
- A "Plan Mode Rule" section added to `skills/using-adev/SKILL.md` as soft priming at session-start, documenting the expected plan shape and the existence of the advisory hook

**Out of scope:**

- Hard-blocking plans (this is Approach B; hard-blocking remains available as a future revision if advisory proves insufficient)
- `TodoWrite`-based planning (TodoWrite is used for ordinary in-session task lists, not user-facing plans — intercepting it would break normal use)
- Validating the correctness or ordering of the `/adev:*` skills referenced (the hook only checks presence, not semantics)
- Retroactive enforcement on plans already approved via ExitPlanMode before this hook existed

### Architecture

Three-layer split for harness-agnostic reuse:
1. **Core check (harness-agnostic):** `lib/plan-mode-check.mjs` — pure function, no I/O, importable by any adapter
2. **Claude Code adapter (Node):** `hooks/plan-mode-guard.mjs` — reads stdin JSON, calls core check, emits `hookSpecificOutput.additionalContext`
3. **Claude Code wrapper (bash):** `hooks/plan-mode-guard.sh` — thin pipe to node with graceful degradation, matching the `issue-reminder.sh`/`.mjs` precedent

### Touchpoints

| File | Change type |
|------|-------------|
| `lib/plan-mode-check.mjs` | new — harness-agnostic core check |
| `hooks/plan-mode-guard.mjs` | new — Claude Code Node adapter |
| `hooks/plan-mode-guard.sh` | new — Claude Code bash wrapper |
| `hooks/hooks.json` | modify — register new PreToolUse:ExitPlanMode entry |
| `skills/using-adev/SKILL.md` | modify — add "Plan Mode Rule" section |
| `tests/plan-mode-check.test.mjs` | new — core check unit tests |
| `tests/hooks/plan-mode-guard.test.mjs` | new — adapter integration tests |

### Dependencies

- **Hook protocol** (existing, same stdin-JSON / exit-code contract as other hooks)
- **`ExitPlanMode` tool input shape** — hook reads the plan text from the tool input field. If the Claude Code tool input field name changes, the hook will need updating (documented risk)
- **`skills/using-adev/SKILL.md`** — the soft-priming text depends on this file being in the session-start injection path (already true via `session-start.sh`)

## Key Files

- `hooks/hooks.json` (registration config)
- `hooks/session-start.sh`
- `hooks/constitution-linter.sh`
- `hooks/context-preflight.sh`
- `hooks/context-read-tracker.sh`
- `hooks/merge-guard.sh`
- `lib/plan-mode-check.mjs` *(new, revision 4 — harness-agnostic core)*
- `hooks/plan-mode-guard.mjs` *(new, revision 4 — Claude Code adapter)*
- `hooks/plan-mode-guard.sh` *(new, revision 4 — Claude Code wrapper)*
- `hooks/sync-trigger.sh`
- `hooks/session-capture.sh`
- `hooks/issue-reminder.sh` + `hooks/issue-reminder.mjs`
- `skills/using-adev/SKILL.md` — session-start priming, also owns the "Plan Mode Rule" section *(shared interface)*
- `tests/hooks/` (per-hook integration tests)
