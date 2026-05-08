---
name: adev:prototype
description: "Rapidly sketch UI screens, user flows, and API surface from Feature Charters. Bridges the gap between chartering and implementation. Optionally uses a live browser preview for interactive design."
allowed-tools: [Read, Glob, Grep, Write, Bash, Edit]
---

# Prototype a Feature

Generate tiered prototypes (wireframe, mockup, functional) from a Feature Charter, serve them via localhost for browser preview, iterate on conversational feedback, and persist or discard the result.

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

### Step 1: Load Context and Heuristics

1. Read the charter at `.context-index/specs/features/<module>/charter.md`.
2. Read `.context-index/constitution.md` for constraint validation.
3. Read `.context-index/platform-context.yaml` for framework defaults (if it exists).
4. Load module heuristics. Derive `<ADEV_ROOT>` from this skill file by stripping `skills/prototype/` from its path.

```bash
node -e "import { retrieveHeuristics, renderHeuristic } from '<ADEV_ROOT>/lib/heuristics.mjs'; const h = await retrieveHeuristics(process.cwd(), '<module>'); if (h.length) { console.log(h.map(r => renderHeuristic(r)).join('\n\n')); } else { console.log('__NONE__'); }"
```

If heuristics are found (output is not `__NONE__`), present them to the user:

> **Previous design learnings for this module:**
>
> (heuristic summaries)

If `retrieveHeuristics()` fails or returns empty, proceed silently. Do not block the session.

### Step 2: Tier Selection

Present three tier options:

> **Choose a prototype tier:**
>
> 1. **Wireframe** — Bare HTML with semantic structure. Shows information hierarchy, not visual design.
> 2. **Mockup** — HTML + CSS with visual styling. Conveys design intent (colors, typography, spacing).
> 3. **Functional** — Interactive SPA with mock data. Choose a framework (React, Vue, Svelte, vanilla JS). No build step — CDN imports only.
>
> Enter 1, 2, or 3 (or tier name):

**Validation:**
- If user enters invalid input interactively: re-prompt with valid options. Error code: `INVALID_TIER`.
- If `--tier` was passed with an invalid value: error with valid options, do NOT re-prompt.

**If functional tier is selected**, ask for framework preference:

> **Choose a framework:**
> 1. React
> 2. Vue
> 3. Svelte
> 4. Vanilla JS
>
> Enter 1-4 (or framework name):

- Invalid framework interactively: re-prompt. Error code: `INVALID_FRAMEWORK`.
- Invalid `--framework` CLI argument: error, do not re-prompt.

**The tier is immutable for the session.** Changing tier requires a new invocation.

### Step 3: Generate Prototype Files

Generate prototype files into a temp directory:

```javascript
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const tmpDir = mkdtempSync(join(tmpdir(), 'adev-prototype-'));
```

**Per-tier generation rules:**

**Wireframe:**
- Semantic HTML only (headings, lists, sections, nav, article, aside, footer)
- Basic layout resets (box-sizing, margin: 0) — no visual styling
- Placeholder text where content will go
- Set `framework = 'html'`

**Mockup:**
- HTML + CSS with visual styling (colors, typography, spacing, borders)
- Convey design intent — this is what the feature will look like
- No JavaScript
- Set `framework = 'html'`

**Functional:**
- Interactive SPA with the chosen framework
- CDN imports only (no build step, no npm install)
- Mock data for dynamic content
- Single `index.html` entry point with all framework code
- Set `framework` to the chosen framework name

Write all generated files into the temp directory.

### Step 4: Start HTTP Server

Start the server using the prototype-server helper. Derive `<ADEV_ROOT>` from this skill file by stripping `skills/prototype/` from its path.

```bash
node -e "
import { startServer } from '<ADEV_ROOT>/lib/prototype-server.mjs';
const server = await startServer('<tmpDir>');
if (server) {
  console.log(JSON.stringify({ port: server.port }));
} else {
  console.log(JSON.stringify({ port: null }));
}
"
```

**If server starts successfully:**

> Prototype server running at **http://127.0.0.1:<port>/**
> Open this URL in your browser to preview.

**If `startServer` returns null (all ports busy or permission error):**

Fall back to file-path mode:

> Could not start HTTP server (ports 3210-3219 unavailable or permission denied).
> Open the prototype files directly: `<tmpDir>/index.html`

Continue with the feedback loop regardless. Error codes: `SERVER_PORT_EXHAUSTED`, `SERVER_PERMISSION_ERROR`.

### Step 5: Feedback Loop

This is a conversational loop. The initial generation counts as iteration 1.

**On each feedback round:**

1. Wait for user input.
2. If user sends empty feedback: re-prompt with:
   > Please describe what you'd like changed, or say "done" to finish.
   Error code: `EMPTY_FEEDBACK`.
3. If user indicates approval (e.g., "looks good", "approved", "done", "ship it"):
   - End the feedback loop.
   - Proceed to Step 6 (Persistence).
   - The HTTP server remains active during the persistence prompt so the user can take a final look.
4. If user provides change feedback:
   - Increment `iteration_number` by 1.
   - Clear ALL files and subdirectories in the temp directory (clean-slate regeneration — prevents stale files from prior iterations).
   - Regenerate prototype files based on feedback.
   - Notify user:
     > Prototype updated (iteration <N>). Refresh your browser to see the changes.
   - Continue the loop.

### Step 6: Persistence Choice

After the feedback loop ends, present the persistence choice:

> **Keep these prototype files?**
>
> - **Keep** — Saved to `.adev/prototype/<module>/` (gitignored, stays in your project)
> - **Discard** — Temp files removed, nothing persisted
>
> Enter keep or discard:

**Keep (project persistence):**

1. Re-validate the module name against `^[a-z0-9][a-z0-9-]*$` before path construction (defense-in-depth).
2. Copy all files from the temp directory to `.adev/prototype/<module>/`.
3. Ensure `.adev/` is gitignored using the helper:

```bash
node -e "
import { ensureGitignore } from '<ADEV_ROOT>/lib/prototype-server.mjs';
ensureGitignore(process.cwd());
console.log('OK');
"
```

4. Remove the temp directory.
5. Stop the HTTP server.

If `.adev/` directory is not writable: error with code `PERSIST_WRITE_ERROR`. Suggest discard or fix permissions.

**Discard (ephemeral persistence):**

1. Remove the temp directory and all prototype files.
2. Stop the HTTP server.

### Step 7: Cleanup

The HTTP server MUST always be stopped when the session ends, regardless of keep/discard choice. No orphaned server processes.

Stop the server:

```bash
node -e "
// Server close is handled by the startServer return value's close() method
// This is called in Step 6 during keep/discard handling
"
```

**Note:** If the conversation ends mid-session (terminal closed, browser tab closed), the server process dies with the Claude Code session. Temp files are cleaned by the OS. This is an inherent limitation of skill-driven sessions, not a bug.

### Step 8: Heuristics Capture

After the prototype session completes (keep or discard), suggest capturing design decisions:

> Would you like to save any design learnings from this prototype session? (Invokes `/adev:learn`)

If the user agrees, invoke `/adev:learn` to persist 2-4 key design decisions as module-scoped heuristics.

## Error Reference

| Condition | Behavior | Code |
|-----------|----------|------|
| Invalid tier (interactive) | Re-prompt with options | INVALID_TIER |
| Invalid tier (CLI `--tier`) | Error, do not re-prompt | INVALID_TIER |
| Invalid framework (interactive) | Re-prompt with options | INVALID_FRAMEWORK |
| No charter found (standalone) | Error with path hint | CHARTER_NOT_FOUND |
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
