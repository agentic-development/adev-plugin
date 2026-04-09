---
status: approved
revision: 3
updated: 2026-04-09
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
| `plan-mode-guard.sh` | PreToolUse:ExitPlanMode | guardrail | Advisory check: warns via stderr when a plan lacks `/adev:*` skill invocations, suggesting rewrite as a skill-sequence. Exit 0 (non-blocking) |
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
- **Non-blocking by default for advisory hooks.** Guardrail hooks that are meant as nudges (not hard gates) should exit 0 and emit to stderr for visibility. Hard-block (exit 2) is reserved for enforcement of constitutional boundaries and merge policy.

## Capability: Plan Mode Guard (Revision 2)

### Motivation

Claude Code's `ExitPlanMode` tool lets the agent present a plan to the user for approval before acting. In adev projects, plans should be expressed as a sequence of `/adev:*` skill invocations (e.g., `/adev:brainstorm` → `/adev:specify` → `/adev:plan` → `/adev:implement`), not as inline code-change checklists. When plans drift into inline edits, the lifecycle gates (HARD-GATEs in brainstorm, review-before-plan, TDD enforcement in implement) are bypassed. This capability provides a soft guardrail that nudges plans back into the adev lifecycle without hard-blocking legitimate non-adev work.

### Scope

**In scope:**

- A `PreToolUse:ExitPlanMode` hook (`plan-mode-guard.sh`) that inspects the plan text and emits an advisory when no `/adev:*` invocation is present
- Advisory-only behavior: the hook always exits 0 (non-blocking). It emits to stderr suggesting the agent rewrite the plan as a skill-sequence and reminding of the adev lifecycle ordering
- A "Plan Mode Rule" section added to `skills/using-adev/SKILL.md` as soft priming at session-start, documenting the expected plan shape and the existence of the advisory hook

**Out of scope:**

- Hard-blocking plans (this is Approach B; hard-blocking remains available as a future revision if advisory proves insufficient)
- `TodoWrite`-based planning (TodoWrite is used for ordinary in-session task lists, not user-facing plans — intercepting it would break normal use)
- Validating the correctness or ordering of the `/adev:*` skills referenced (the hook only checks presence, not semantics)
- Retroactive enforcement on plans already approved via ExitPlanMode before this hook existed

### Touchpoints

| File | Change type |
|------|-------------|
| `hooks/plan-mode-guard.sh` | new |
| `hooks/hooks.json` | modify — register new PreToolUse:ExitPlanMode entry |
| `skills/using-adev/SKILL.md` | modify — add "Plan Mode Rule" section |
| `tests/hooks/plan-mode-guard.test.mjs` | new |

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
- `hooks/plan-mode-guard.sh` *(new, revision 2)*
- `hooks/sync-trigger.sh`
- `hooks/session-capture.sh`
- `hooks/issue-reminder.sh` + `hooks/issue-reminder.mjs`
- `skills/using-adev/SKILL.md` — session-start priming, now also owns the "Plan Mode Rule" section *(shared interface, revision 2)*
- `tests/hooks/` (per-hook integration tests)
