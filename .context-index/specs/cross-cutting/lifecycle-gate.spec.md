# Cross-Cutting Spec: Lifecycle Gate

---
mode: cross-cutting
status: validated
risk_level: medium
revision: 2
created: 2026-05-05
updated: 2026-05-05
affects:
  - session-awareness
  - implementation
  - strategic-planning
  - maintenance
source-manifest:
  sha: "814d829"
  files:
    - hooks/lifecycle-gate-edit.sh
    - hooks/lifecycle-gate-bash.sh
    - hooks/lifecycle-gate-advisory.sh
    - hooks/_lifecycle-gate-check-edit.mjs
    - hooks/_lifecycle-gate-check-bash.mjs
    - lib/lifecycle-gate-config.mjs
    - lib/lifecycle-gate-helpers.mjs
    - lib/execution-state.mjs
    - skills/standalone/SKILL.md
  computed-at: "2026-05-05T00:00:00.000Z"
---

## Behavioral Contract

### Problem Statement

Agents bypass the adev lifecycle (plan before implement, validate after implement) when they accumulate enough context to "just do the work." This happens across all action types — file edits, bash commands, API calls — not just source code modifications. The existing `context-preflight.sh` hook is advisory-only (exit 0 always) and only fires on Edit.

This spec defines a **multi-layer, configurable enforcement system** that gates agent actions based on workflow state — whether the agent is currently executing within a planned flow — rather than capability (which tools it can use).

### Design Principles

1. **Gate workflow state, not capability.** The question is not "can the agent use Edit?" but "is the agent in the right workflow stage to be editing?"
2. **File-based signals, not env vars.** All bypass signals use existing config files (user-config, execution state) that work across all subagent depths via the shared filesystem.
3. **Configurable strength.** Users choose how aggressive enforcement is — from off (backwards compatible) to hard block.
4. **Configurable patterns.** Which commands and files are gated is project-specific, with sensible defaults that can be extended or reduced.
5. **Reuse existing mechanisms.** No new file conventions — uses `user-config` for permanent config and `.execution-state.md` for session-scoped state.

### Preconditions

- The project has `.context-index/` initialized with `manifest.yaml`
- Lifecycle gate hooks are registered in `hooks.json` (PreToolUse on Edit, Write, Bash; PostToolUse on `.*`)
- Configuration lives in `user-config` (local `.context-index/user-config` → global `<PLUGIN_ROOT>/user-config`)

---

## Enforcement Layers

The lifecycle gate operates as three complementary layers, all controlled by the same `lifecycle.gate` config level:

### Layer 1: File-Edit Gate (PreToolUse on Edit, Write)

Gates source code modifications. Fires on Edit/Write tool calls targeting files that are not excluded.

### Layer 2: Bash Action Gate (PreToolUse on Bash)

Gates mutating shell commands. Uses a configurable **passthrough allowlist** — commands matching the allowlist are read-only and always pass. Everything else is gated by workflow state.

### Layer 3: Session Advisory (PostToolUse on `.*`)

Persistent context injection when the agent is operating without a plan. Fires on ALL tool calls (not just edits/bash). Injects a reminder into `additionalContext` on every tool result until the agent enters a planned flow.

### Layer activation by enforcement level:

| Level | Layer 1 (Edit/Write) | Layer 2 (Bash) | Layer 3 (Advisory) |
|-------|---------------------|----------------|-------------------|
| `off` | disabled | disabled | disabled |
| `warn` | advisory message | advisory message | disabled |
| `confirm` | strong stop-directive | strong stop-directive | enabled |
| `block` | hard block (exit 2) | hard block (exit 2) | enabled |

---

## Behaviors

### Bypass Logic (shared across all layers)

All three layers share the same bypass check, evaluated in order (first match exits):

1. **When** `lifecycle.gate=off` in user-config **then** exit 0 immediately. No checks performed.

2. **When** `.context-index/.execution-state.md` has `status: standalone` **then** exit 0 immediately. The session is in standalone mode.

3. **When** `.context-index/.execution-state.md` has `status: active` **then** exit 0 immediately. The agent is executing within a planned flow (regardless of which module is being edited).

4. **When** `.context-index/` does not exist **then** exit 0 immediately. Project not initialized — no enforcement possible.

5. **When** user-config is malformed or unreadable **then** exit 0 immediately. Never block on config errors.

### Layer 1: File-Edit Gate

6. **When** an Edit or Write targets a path matching any pattern in `lifecycle.gate.file_exclusions` **then** exit 0 silently. The file is not subject to lifecycle enforcement.

7. **When** an Edit or Write targets a file in a module that has at least one `.plan.md` in `.context-index/specs/features/<module>/` **then** exit 0 silently. A plan exists — lifecycle is satisfied.

8. **When** an Edit or Write targets a file in a module that has specs but NO `.plan.md` **then** apply enforcement. Message: "Spec exists at `<path>` but no plan found. Run `/adev:plan --spec <path>` before editing."

9. **When** an Edit or Write targets a file NOT covered by any spec (module has no specs) **then** exit 0 silently. Untracked code is not gated.

### Layer 2: Bash Action Gate

10. **When** a Bash command matches any pattern in `lifecycle.gate.bash_passthrough` **then** exit 0 silently. The command is read-only and always safe.

11. **When** a Bash command does NOT match any passthrough pattern AND no active plan exists (execution state is not `active` or `standalone`) **then** apply enforcement. Message: "No active plan. Run `/adev:work` to enter the lifecycle before running mutating commands."

12. **When** a Bash command does NOT match any passthrough pattern AND an active plan exists (execution state `active`) **then** exit 0. Planned execution may run any commands.

### Layer 3: Session Advisory

13. **When** any tool call completes AND execution state is `idle` or absent AND `lifecycle.gate` is `confirm` or `block` **then** inject `additionalContext`: "You are operating without an active plan. Run `/adev:work` to classify this task and enter the lifecycle, or `/adev:standalone` to disable enforcement for this session."

14. **When** execution state is `active`, `standalone`, or `lifecycle.gate` is `off` or `warn` **then** the session advisory does not fire.

### Enforcement Actions

15. **When** enforcement level is `warn` **then** exit 0 with `additionalContext` containing an advisory message naming the missing artifact and the command to create it.

16. **When** enforcement level is `confirm` **then** exit 0 with `additionalContext` containing a strong directive: "STOP. You MUST run `/adev:plan` before proceeding. If this is a bug fix, invoke `/adev:debug`. If this is exploratory, run `/adev:standalone`. Only proceed for trivial non-tracked changes."

17. **When** enforcement level is `block` **then** exit 2 with JSON body explaining what's missing. The tool call is rejected.

### Standalone Mode

18. **When** the session-start hook detects `ADEV_STANDALONE=1` in the process environment **then** it writes `.context-index/.execution-state.md` with `status: standalone` and `updated: <now>`. All lifecycle gates pass for the entire session.

19. **When** `/adev:standalone` is invoked mid-session **then** it writes `status: standalone` to execution state. All lifecycle gates pass for the remainder of the session.

20. **When** a new session starts without `ADEV_STANDALONE=1` **then** session-start clears any previous `standalone` status (resets to `idle`). Standalone mode does not leak across sessions.

21. **When** `/adev:implement` or `/adev:debug` starts **then** they write `status: active` to execution state (as they already do). This overrides `idle` and satisfies all bypass checks. No special "bypass" mechanism needed — the existing execution state protocol is sufficient.

---

## Configuration

### Enforcement Level

```
# In .context-index/user-config (local) or <PLUGIN_ROOT>/user-config (global)
lifecycle.gate=off           # No enforcement (default, backwards compatible)
lifecycle.gate=warn          # Advisory messages on gated actions
lifecycle.gate=confirm       # Strong stop-directives + session advisory
lifecycle.gate=block         # Hard blocks on gated actions + session advisory
```

Default when absent: `off`. Invalid values treated as `warn` with a note.

### File Exclusions

Patterns for files that never trigger the Edit/Write gate (Layer 1). Checked via glob matching against the file path.

```
# Default (built-in, always applied):
lifecycle.gate.file_exclusions.defaults=.context-index/**,*.test.*,*.spec.*,__tests__/**,*.md,package.json,package-lock.json,*.config.*,tsconfig*,.eslintrc*,.prettierrc*,.gitignore,node_modules/**,.git/**,.claude-plugin/**

# Project overrides (extends OR replaces defaults):
lifecycle.gate.file_exclusions=*.generated.*,dist/**,migrations/**

# To replace defaults entirely (not extend):
lifecycle.gate.file_exclusions.replace_defaults=true
```

When `replace_defaults` is false (default): project exclusions are added to the built-in defaults.
When `replace_defaults` is true: only project exclusions apply.

### Bash Passthrough Allowlist

Patterns for commands that never trigger the Bash gate (Layer 2). These are read-only commands that don't mutate project state. Checked via prefix/glob matching against the command string.

```
# Default passthrough (built-in, always applied):
lifecycle.gate.bash_passthrough.defaults=git status,git log,git diff,git branch,git show,git blame,ls,cat,head,tail,find,grep,rg,wc,file,which,echo,printf,node --test,npm test,npm run test,npm run lint,npm run typecheck,npx jest,npx vitest,npx tsc --noEmit,pwd,env,whoami,date,uname

# Project additions (extends defaults):
lifecycle.gate.bash_passthrough=docker ps,kubectl get,terraform plan,aws s3 ls

# To replace defaults entirely:
lifecycle.gate.bash_passthrough.replace_defaults=true
```

When `replace_defaults` is false (default): project patterns extend the built-in list.
When `replace_defaults` is true: only project patterns apply.

**Matching rules for bash passthrough:**
- Prefix match: `git status` matches `git status --short`, `git status -sb`, etc.
- Exact match for single-word commands: `ls` matches `ls`, `ls -la`, `ls src/`
- Glob patterns allowed: `npm run test*` matches `npm run test`, `npm run test:unit`
- Pipe chains: each segment is checked independently. `git log | head` passes because both `git log` and `head` are in the allowlist.
- Commands with `&&` or `;`: the FIRST command determines gating. `npm test && npm run build` — `npm test` is passthrough, so the full command passes. Rationale: if the first command fails, the rest doesn't run. For strict enforcement, split into separate Bash calls.

### Additional Options

```
lifecycle.gate.require_validation=false    # When true, also gate post-implement edits if .validate.md is missing
lifecycle.gate.advisory_interval=5         # Layer 3: inject advisory every N tool calls (not every single one). Default 5.
```

---

## Module Resolution

The Edit/Write gate (Layer 1) determines which module a file belongs to:

1. Read `manifest.yaml` for any `source_paths` or module declarations
2. Fall back to directory-name heuristics: `src/<module>/`, `lib/<module>/`, `skills/<module>/`, `hooks/` → hooks module
3. If module cannot be determined: exit 0 (no enforcement on ambiguous files)

Once resolved, check for specs at `.context-index/specs/features/<module>/*.spec.md` and plans at `.context-index/specs/features/<module>/*.plan.md`.

---

## Subagent Behavior

Hooks are session-global — they fire on every tool call regardless of agent depth:

```
/adev:build (orchestrator)
  └─ Agent → subagent invokes /adev:implement
       │ writes .execution-state.md (status: active)
       └─ Agent → specialist worker
            └─ Edit source → hook fires → reads execution state → active → pass ✓
```

All bypass signals are file-based (user-config, execution-state), so they work identically across parent agents, subagents, and sub-subagents via the shared filesystem.

**Key invariant:** `/adev:implement` MUST write execution state (`status: active`) before its first source code edit or bash mutation. This ensures all downstream subagents pass the lifecycle gate.

---

## Init Wizard Integration

The lifecycle gate is configured during `/adev:init` onboarding (Step 7f: Lifecycle Gate) and detected during diagnostic mode (issue 6). Users choose their enforcement level as part of the governance setup wizard. The default for new installations is `off` (backwards compatible), but `confirm` is recommended during onboarding.

## Interaction with Existing Hooks

- **Replaces `context-preflight.sh`?** At `confirm` or `block` level, the lifecycle gate subsumes context-preflight's purpose (it provides a more specific, actionable message). At `warn` level, both coexist — context-preflight checks for ANY context reading, lifecycle-gate checks for plan artifacts. Projects upgrading to `confirm`+ can remove context-preflight from hooks.json if desired.

- **Ordering in hooks.json:** Lifecycle gate hooks run AFTER context-preflight (if both are present). The lifecycle gate's fast-path exits (enforcement=off, execution state bypass) ensure it adds negligible latency when not enforcing.

- **Execution state is the coordination mechanism.** Skills don't need to "set a bypass" — they write execution state as part of their normal protocol. `/adev:implement` writes `active`, `/adev:debug` writes `active` with `planRef: debug-session`, `/adev:standalone` writes `standalone`. The gate reads the same file all skills already write.

## Harness Scope

**This spec targets Claude Code only.** The hook-based enforcement (Layers 1, 2, 3) relies on Claude Code's `PreToolUse`/`PostToolUse` hook protocol with exit-code-based blocking.

**Other harnesses are out of scope for this spec.** Cursor, Windsurf, Copilot, and other AI coding tools may or may not have equivalent hook/plugin systems — research is needed before designing implementations for them. Do not assume their capabilities based on this document.

**Future work:**
- Research current extension mechanisms for Cursor, Windsurf, Copilot, and other harnesses (invoke `/adev:research` when ready to expand)
- If a harness supports pre-execution hooks with blocking: implement Layers 1-3 using its native mechanism
- If a harness only supports prompt injection (rules files): inject lifecycle advisory text via `/adev:sync` as a degraded fallback
- The configuration surface (`user-config` keys, execution state, patterns) is designed to be harness-agnostic — only the enforcement mechanism varies

## Limitations

1. **Bash pattern matching is prefix-based.** Complex command compositions (subshells, process substitution, eval) may not match passthrough patterns. When in doubt, the gate enforces — the user can add patterns to the passthrough list.

2. **Module resolution is heuristic.** Files in non-standard locations may not resolve to a module and will pass through ungated.

3. **No MCP tool gating.** MCP tools (Playwright, external APIs) are not gated by this hook. They operate at a different layer. If needed in the future, a separate MCP-aware gate could be added.

4. **Layer 3 advisory frequency.** Injecting context on every single tool call is noisy. The `advisory_interval` config (default 5) throttles this to every Nth call. This means the first few tool calls in an unplanned session may not see the advisory.

5. **Other harnesses not addressed.** This spec does not implement enforcement for Cursor, Windsurf, Copilot, or other tools. Research their current extension APIs before designing implementations.

## System Constitution Reference

- **Principle:** "Hook protocol compliance — hooks read JSON from stdin + env vars, exit 0 (allow) or 2 (block), output JSON to stdout" — all three layers follow the standard protocol
- **Principle:** "Skills are primarily markdown" — hooks are bash scripts (companion code). Configuration lives in user-config, not in SKILL.md
- **Principle:** "Minimize external dependencies" — hooks use only bash builtins and standard Unix tools for pattern matching

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Write `lifecycle-gate-edit.sh` | PreToolUse hook for Edit/Write — file exclusions, module resolution, plan check | medium |
| Write `lifecycle-gate-bash.sh` | PreToolUse hook for Bash — passthrough matching, enforcement | medium |
| Write `lifecycle-gate-advisory.sh` | PostToolUse hook for `.*` — session advisory with interval throttling | small |
| Add config parsing | Extend `parseUserConfig()` to read `lifecycle.gate.*` keys, parse pattern lists | small |
| Ship default patterns config | Write default patterns to `<PLUGIN_ROOT>/user-config` or a dedicated defaults file | small |
| Register in hooks.json | Add all three hooks to the appropriate matchers | small |
| Update execution state vocabulary | Add `standalone` as a valid status in `lib/execution-state.mjs` | small |
| Create `/adev:standalone` skill | Minimal skill: writes `status: standalone` to execution state | small |
| Update session-start hook | Check `ADEV_STANDALONE=1` env, write standalone state; clear standalone on normal start | small |
| Update `/adev:debug` | Write `status: active`, `planRef: debug-session` to execution state before edits | small |
| Tests | Unit tests for all three layers: patterns, config, bypasses, subagent scenarios | large |

## Acceptance Criteria

### Enforcement Levels
- [ ] `lifecycle.gate=off` — all layers disabled, no checks performed
- [ ] `lifecycle.gate=warn` — Layers 1+2 emit advisory messages; Layer 3 disabled
- [ ] `lifecycle.gate=confirm` — Layers 1+2 emit strong stop-directives; Layer 3 enabled
- [ ] `lifecycle.gate=block` — Layers 1+2 hard-block (exit 2); Layer 3 enabled
- [ ] Default (no config) is `off` — backwards compatible with existing installations
- [ ] Invalid config value treated as `warn`

### Bypass Logic (all layers)
- [ ] Execution state `status: standalone` bypasses all enforcement
- [ ] Execution state `status: active` bypasses all enforcement
- [ ] `lifecycle.gate=off` in user-config bypasses all enforcement
- [ ] Missing `.context-index/` → exit 0 silently
- [ ] Malformed user-config → exit 0 silently (never block on errors)
- [ ] All bypasses work identically for subagents (file-based signals on shared filesystem)

### Layer 1: File-Edit Gate
- [ ] Default exclusion patterns skip tests, configs, markdown, .context-index, node_modules
- [ ] Project `lifecycle.gate.file_exclusions` extends defaults (or replaces with `replace_defaults=true`)
- [ ] Modules with any `.plan.md` file pass (lifecycle satisfied)
- [ ] Modules with specs but no plan trigger enforcement
- [ ] Modules with no specs pass silently (untracked code not gated)
- [ ] Ambiguous files (module unresolvable) pass silently

### Layer 2: Bash Action Gate
- [ ] Default passthrough list covers common read-only commands (git status, ls, npm test, etc.)
- [ ] Project `lifecycle.gate.bash_passthrough` extends defaults (or replaces with `replace_defaults=true`)
- [ ] Passthrough uses prefix matching (e.g., `git log` matches `git log --oneline`)
- [ ] Non-matching commands without active execution state trigger enforcement
- [ ] Non-matching commands WITH active execution state pass

### Layer 3: Session Advisory
- [ ] Fires on PostToolUse `.*` when execution state is `idle`/absent and level is `confirm`/`block`
- [ ] Injects additionalContext with lifecycle reminder
- [ ] Throttled by `advisory_interval` (default every 5 tool calls, not every one)
- [ ] Does NOT fire when execution state is `active` or `standalone`
- [ ] Does NOT fire when level is `off` or `warn`

### Standalone Mode
- [ ] `ADEV_STANDALONE=1 claude` → session-start writes `status: standalone` to execution state
- [ ] `/adev:standalone` mid-session writes `status: standalone`
- [ ] Next session start (without env var) clears standalone status back to `idle`
- [ ] Standalone mode bypasses all three layers

### Configuration
- [ ] Default patterns are built-in (not requiring user-config to exist)
- [ ] Project user-config can extend or replace defaults via `replace_defaults` flag
- [ ] Pattern syntax: glob for files, prefix-match for bash commands
- [ ] `advisory_interval` controls Layer 3 frequency

### Performance
- [ ] Fast-path exits (enforcement=off, execution state bypass) add < 5ms
- [ ] Full enforcement path (read user-config + execution state + pattern match) adds < 50ms
- [ ] Hook protocol compliance: reads stdin, uses env vars, exits 0 or 2, outputs JSON to stdout

### Quality
- [ ] All quality gates pass (tests)
- [ ] No constitutional violations introduced
- [ ] All three hooks registered in hooks.json
