---
name: adev:prototype
description: "Generates tiered UI prototypes (wireframe, mockup, functional) from an adev Feature Charter stored at .context-index/specs/features/<module>/charter.md, serving them via a localhost browser preview for interactive review. Use when the user wants to prototype a feature, sketch the screen, preview the UI, or bridge a Feature Charter into implementation before writing code. Supports conversational iteration across rounds, then a choice to persist the result under .adev/prototype/<module>/ or discard it. This is adev-specific: it requires an existing Feature Charter and drives the brainstorm-to-implementation lifecycle, distinct from generic standalone UI-mockup tools. In Codex, invoke with $adev:prototype"
allowed-tools: [Read, Glob, Grep, Write, Bash, Edit]
---

# Prototype a Feature

Generate tiered prototypes (wireframe, mockup, functional) from a Feature Charter, serve them via localhost for browser preview, iterate on conversational feedback, and persist or discard the result.

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill prototype
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

---

## Arguments

- `--module <name>`: Module name. Locates charter at `.context-index/specs/features/<name>/charter.md`. Required when invoked standalone.
- `--tier <wireframe|mockup|functional>`: Pre-select tier (skips interactive prompt).
- `--framework <react|vue|svelte|vanilla>`: Pre-select framework for functional tier (skips interactive prompt).

When invoked from `/adev:brainstorm`, the module name and approach context are passed automatically.

## Prerequisites

1. **Context Index.** `.context-index/` must exist with `constitution.md`. If missing, tell the user to run `/adev:init` first.
2. **Charter.** A charter must exist at `.context-index/specs/features/<module>/charter.md`. If missing:
   > No charter found at `.context-index/specs/features/<module>/charter.md`. Run `/adev:brainstorm` first.
3. **Node.js runtime.** Required for the HTTP server helper.

## Process

### Brainstorm Context Reception

If brainstorm context is provided (a `BRAINSTORM_CONTEXT` block), skip Step 0 entirely and proceed directly to Step 1 with the provided context:

- `module` is used directly — no charter discovery needed, no `--module` argument required
- `approach_summary` is used to seed the initial prototype generation — it guides what the prototype demonstrates and what design direction to explore
- `platform_context` sets framework defaults for the functional tier (e.g., if platform context specifies React, pre-select React as the framework)
- `constitution_constraints` are used to validate generated prototype code against constitutional principles

When brainstorm context is present, skip the charter lookup in Step 0 entirely — the brainstorm already loaded the charter and extracted the relevant context.

**Error handling:** If brainstorm context is provided but missing required fields (`module` or `approach_summary`), report an error and stop. Error code: `INCOMPLETE_CONTEXT`.

> Incomplete brainstorm context. Required: module, approach_summary. Received: `<fields>`.

### Step 0: Standalone Entry

Applies only when invoked directly rather than from brainstorm.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/prototype/references/steps/step-0-standalone-entry.md` for the full instructions. Do not act on this section from the summary above.

### Step 1: Load Context and Heuristics

Loads the Feature Charter and prior prototype heuristics.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/prototype/references/steps/step-1-load-context.md` for the full instructions. Do not act on this section from the summary above.

### Step 2: Tier Selection

Chooses wireframe / mockup / functional.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/prototype/references/steps/step-2-tier-selection.md` for the full instructions. Do not act on this section from the summary above.

### Step 3: Generate Prototype Files

Renders the tier-appropriate prototype files.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/prototype/references/steps/step-3-generate-files.md` for the full instructions. Do not act on this section from the summary above.

### Step 4: Start HTTP Server

Serves the prototype on localhost for review.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/prototype/references/steps/step-4-start-server.md` for the full instructions. Do not act on this section from the summary above.

### Step 5: Feedback Loop

The conversational iteration rounds with the user.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/prototype/references/steps/step-5-feedback-loop.md` for the full instructions. Do not act on this section from the summary above.

### Step 5a: Visual Reference Capture

Captures screenshots of the running prototype.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/prototype/references/steps/step-5a-visual-reference-capture.md` for the full instructions. Do not act on this section from the summary above.

### Step 6: Persistence Choice

Asks whether to persist under .adev/prototype/ or discard.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/prototype/references/steps/step-6-persistence-choice.md` for the full instructions. Do not act on this section from the summary above.

### Step 7: Cleanup

The HTTP server MUST always be stopped when the session ends, regardless of keep/discard choice. No orphaned server processes.

Stop the server. The server is owned by the backgrounded `adev prototype start-server` process spawned in Step 4. Kill it with the recorded PID (e.g., `kill $SERVER_PID`) or let the parent skill session terminate, which will reap the child via SIGHUP.

**Note:** If the conversation ends mid-session (terminal closed, browser tab closed), the server process dies with the Claude Code session. Temp files are cleaned by the OS. This is an inherent limitation of skill-driven sessions, not a bug.

### Step 8: Heuristics Capture

Records durable lessons from the prototype session.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/prototype/references/steps/step-8-heuristics-capture.md` for the full instructions. Do not act on this section from the summary above.

### Step 8b: Return to Brainstorm

This step runs only when the prototype was invoked from `/adev:brainstorm` (brainstorm context was provided). When invoked standalone, skip this step — the session ends at Step 9 (Session Summary).

Return control to `/adev:brainstorm` with a structured result:

```
PROTOTYPE_RESULT:
  status: "completed" | "discarded"
  tier: "wireframe" | "mockup" | "functional"
  visual_references: tracker.toArray()   # [{ path: string, description: string }]
  heuristics_saved: <count>
  persistence: "project" | "ephemeral"
```

Where:
- `status` — `"completed"` if the user approved the prototype (chose "keep" or "done"), `"discarded"` if the user chose to discard
- `tier` — the prototype tier used during the session
- `visual_references` — array of captured images with their slugified descriptions (may be empty if no images were captured)
- `heuristics_saved` — count of design decisions saved as heuristics via `/adev:learn` in Step 8
- `persistence` — `"project"` if files were kept at `.adev/prototype/<module>/`, `"ephemeral"` if temp files were removed

After returning the result, the brainstorm skill handles presentation and continues to Step 4 (Present Design Sections).

### Step 9: Session Summary (Standalone Only)

Standalone-only closing summary.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/prototype/references/steps/step-9-session-summary.md` for the full instructions. Do not act on this section from the summary above.

## Error Reference

| Condition | Behavior | Code |
|-----------|----------|------|
| `--module` value fails validation | Error with format hint | INVALID_MODULE_NAME |
| `--module` references non-existent charter | Error with path hint | CHARTER_NOT_FOUND |
| No charters exist (no `--module`) | Error with `/adev:brainstorm` suggestion | NO_CHARTERS |
| `constitution.md` missing | Error; block session | NO_CONSTITUTION |
| `platform-context.yaml` missing | Warning; proceed without framework defaults | NO_PLATFORM_CONTEXT |
| `--framework` without functional tier | Warning note; argument ignored | FRAMEWORK_IGNORED |
| Invalid tier (interactive) | Re-prompt with options | INVALID_TIER |
| Invalid tier (CLI `--tier`) | Error, do not re-prompt | INVALID_TIER |
| Invalid framework (interactive) | Re-prompt with options | INVALID_FRAMEWORK |
| Invalid framework (CLI `--framework`) | Error, do not re-prompt | INVALID_FRAMEWORK |
| All server ports fail (3210-3219) | Fall back to file-path mode | SERVER_PORT_EXHAUSTED |
| Server bind fails (EACCES) | Fall back to file-path mode | SERVER_PERMISSION_ERROR |
| File write fails (disk full, perms) | Error with normalized message | FILE_WRITE_ERROR |
| `.adev/` not writable (keep mode) | Error; suggest discard | PERSIST_WRITE_ERROR |
| Empty feedback | Re-prompt | EMPTY_FEEDBACK |

## Red Flags

**Never:**
- Include executable logic (imports, exports, require) in this SKILL.md
- Bind the HTTP server to `0.0.0.0` — always `127.0.0.1` only
- Use external npm packages for the server — Node.js built-ins only
- Include a build step for functional-tier prototypes — CDN imports only
- Carry prototype code forward into implementation
- Commit prototype files to git (they are ephemeral or gitignored)
- Block the session if the HTTP server fails to start (fall back to file path)
- Allow the user to change tier mid-session (new invocation required)
