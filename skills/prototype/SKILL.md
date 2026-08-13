---
name: adev:prototype
description: "Generates tiered UI prototypes (wireframe, mockup, functional) from an adev Feature Charter stored at .context-index/specs/features/<module>/charter.md, serving them via a localhost browser preview for interactive review. Use when the user wants to prototype a feature, sketch the screen, preview the UI, or bridge a Feature Charter into implementation before writing code. Supports conversational iteration across rounds, then a choice to persist the result under .adev/prototype/<module>/ or discard it. This is adev-specific: it requires an existing Feature Charter and drives the brainstorm-to-implementation lifecycle, distinct from generic standalone UI-mockup tools."
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

This step runs only when `/adev:prototype` is invoked directly (not dispatched from `/adev:brainstorm`). When brainstorm context is provided, skip to Step 1.

#### 0a. Module Resolution

**When `--module` is provided:**

Validate the module name via the CLI:

```bash
adev prototype validate-module-name --module <module>
```

Stdout is the literal string `true` (valid kebab-case, ≤ 64 chars) or `false`. Exit 0 always.

If stdout is `false`: error and stop.

> Invalid module name: `<value>`. Must be kebab-case (lowercase letters, numbers, hyphens). Error code: `INVALID_MODULE_NAME`.

If stdout is `true`: locate the charter at `.context-index/specs/features/<module>/charter.md`. If the charter file does not exist:

> No charter found at `.context-index/specs/features/<module>/charter.md`. Error code: `CHARTER_NOT_FOUND`.

**When `--module` is NOT provided:**

Discover available charters via the CLI:

```bash
adev prototype discover-charters
```

Stdout is a single JSON array of `{module, title, path}` objects — one per charter found under `.context-index/specs/features/`. Handle the result based on the number of charters found:

- **Zero charters:** Error and stop. Error code: `NO_CHARTERS`.
  > No charters found under `.context-index/specs/features/`. Run `/adev:brainstorm` first to create a charter.

- **One charter:** Auto-select with confirmation:
  > Using charter: `<module>` — `<charter title>`. Proceed? (yes / pick a different one)
  
  If the user confirms, use that charter. If they decline, stop (no other charters to pick from).

- **Multiple charters:** List and prompt:
  > Available charters:
  >   1. `<module>` — `<charter title>`
  >   2. `<module>` — `<charter title>`
  > → Which module should this prototype target? (number or name)

#### 0b. Context Construction

Once a module is resolved:

1. Load the charter at `.context-index/specs/features/<module>/charter.md`. Extract approach context from the **Business Intent** and **Capability Map** sections.
2. Load `.context-index/constitution.md` for constraint validation. If missing: error and stop. Error code: `NO_CONSTITUTION`.
   > Constitution not found. Run `/adev:init` to set up the context index.
3. Load `.context-index/platform-context.yaml` for framework defaults. If missing: warn and proceed. Error code: `NO_PLATFORM_CONTEXT`.
   > No platform context found. Framework defaults will not be pre-selected.

#### 0c. Closed Charter Warning

Check the charter's YAML frontmatter for `status: closed`. If closed, warn but do not block:

> Note: The `<module>` charter is closed. You can still prototype against it, but consider whether a new charter is needed.

Proceed to Step 1.

### Step 1: Load Context and Heuristics

1. Read the charter at `.context-index/specs/features/<module>/charter.md`.
2. Read `.context-index/constitution.md` for constraint validation.
3. Read `.context-index/platform-context.yaml` for framework defaults (if it exists).
4. Load module heuristics via the CLI:

```bash
adev heuristics retrieve --module <module> --format text
```

Stdout is either rendered markdown blocks (one per heuristic, separated by blank lines) or the literal sentinel `__NONE__` when no heuristics match. The verb exits 0 regardless — retrieval failures degrade to `__NONE__` so heuristic loading stays non-blocking.

If heuristics are found (output is not `__NONE__`), present them to the user:

> **Previous design learnings for this module:**
>
> (heuristic summaries)

If `retrieveHeuristics()` fails or returns empty, proceed silently. Do not block the session.

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill prototype
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

### Step 2: Tier Selection

**If `--tier` was provided as an argument:**

Validate that the value is one of `wireframe`, `mockup`, or `functional`. If valid, use it directly — skip the interactive prompt. If invalid: error and stop (do NOT re-prompt). Error code: `INVALID_TIER`.

> Invalid tier: `<value>`. Options: wireframe, mockup, functional.

**If `--framework` was provided as an argument:**

- If `--tier functional` (or functional tier was selected interactively): validate that the value is one of `react`, `vue`, `svelte`, or `vanilla`. If valid, skip the framework prompt. If invalid: error and stop (do NOT re-prompt). Error code: `INVALID_FRAMEWORK`.
- If the tier is NOT functional: ignore `--framework` with a note. Error code: `FRAMEWORK_IGNORED`.
  > Note: `--framework` only applies to the functional tier. Ignoring for `<tier>` tier.

**If `--tier` was NOT provided,** present three tier options:

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

Start the server via the CLI. The verb keeps the HTTP server alive for the rest of the skill session (the process must be backgrounded so the parent can read the printed port):

```bash
adev prototype start-server --dir <tmpDir> &
```

The verb prints a single JSON object `{port: <number|null>}` on stdout. Port range is 3210–3219; `null` indicates all ports are unavailable or permission was denied. Read the port from the first line of stdout, then continue with the feedback loop.

**If server starts successfully (port is a number):**

> Prototype server running at **http://127.0.0.1:<port>/**
> Open this URL in your browser to preview.

**If the printed `port` is `null` (all ports busy or permission error):**

Fall back to file-path mode:

> Could not start HTTP server (ports 3210-3219 unavailable or permission denied).
> Open the prototype files directly: `<tmpDir>/index.html`

Continue with the feedback loop regardless. Error codes: `SERVER_PORT_EXHAUSTED`, `SERVER_PERMISSION_ERROR`.

### Step 5: Feedback Loop

This is a conversational loop. The initial generation counts as iteration 1.

**Visual Reference Tracker:** At the start of the feedback loop, create a visual reference tracker. Derive `<ADEV_ROOT>` from this skill file by stripping `skills/prototype/` from its path.

```javascript
import { createVisualReferenceTracker } from '<ADEV_ROOT>/lib/visual-references.mjs';
const tracker = createVisualReferenceTracker();
```

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
5. **Visual reference detection:** If the user's input contains a file path ending in `.png`, `.jpg`, `.jpeg`, or `.webp`, handle it as a visual reference capture (see Step 5a below). Visual reference capture can happen alongside change feedback — process both the reference and any design feedback in the same round.

### Step 5a: Visual Reference Capture

Visual references can be captured at any point during the active session — during the feedback loop, at session start, or after approval. When a user provides an image file path:

1. **Validate the source path.** Derive `<ADEV_ROOT>` from this skill file by stripping `skills/prototype/` from its path.

```javascript
import { validateSourcePath, copyVisualReference } from '<ADEV_ROOT>/lib/visual-references.mjs';
const result = validateSourcePath(sourcePath, projectRoot);
```

   - If `result.valid === false`:
     - `IMAGE_NOT_FOUND`: "File not found: `<path>`. Please check the path and try again."
     - `IMAGE_SYMLINK`: "Path is a symlink. Please provide a direct file path."
     - `IMAGE_TOO_LARGE`: "Image is too large (`<size>` MB, max 10 MB). Please resize and retry."
     - `UNSUPPORTED_FORMAT`: "Unsupported image format: `.<ext>`. Supported formats: PNG, JPG, WebP. Please convert and re-provide."
     - Do not save the image. Continue the feedback loop.
   - If `result.external === true`: Prompt the user:
     > Image is outside the project directory. Proceed? (yes/no)
     If the user declines, skip the capture and continue.

2. **Prompt for description if not provided.** If the user did not include a description with the image path:
   > What does this image show? (used for the filename, e.g., 'homepage-hero-layout')
   Wait for the user's description before proceeding.

3. **Copy the reference.**

```javascript
const copyResult = copyVisualReference({
  sourcePath,
  module,
  description,
  projectRoot,
});
```

4. **Track and confirm.**

```javascript
tracker.add({ path: copyResult.destinationPath, description });
```

   Confirm to the user:
   > Saved visual reference to `<copyResult.destinationPath>`

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
3. Ensure `.adev/` is gitignored via the CLI:

```bash
adev prototype ensure-gitignore
```

The verb appends `.adev/` to the project's `.gitignore` (idempotent — checks for existing entries and parent globs first). Stdout is `OK` on success; exit 1 only when `.gitignore` is unwritable.

4. Remove the temp directory.
5. Stop the HTTP server.

If `.adev/` directory is not writable: error with code `PERSIST_WRITE_ERROR`. Suggest discard or fix permissions.

**Discard (ephemeral persistence):**

1. Remove the temp directory and all prototype files.
2. Stop the HTTP server.

### Step 7: Cleanup

The HTTP server MUST always be stopped when the session ends, regardless of keep/discard choice. No orphaned server processes.

Stop the server. The server is owned by the backgrounded `adev prototype start-server` process spawned in Step 4. Kill it with the recorded PID (e.g., `kill $SERVER_PID`) or let the parent skill session terminate, which will reap the child via SIGHUP.

**Note:** If the conversation ends mid-session (terminal closed, browser tab closed), the server process dies with the Claude Code session. Temp files are cleaned by the OS. This is an inherent limitation of skill-driven sessions, not a bug.

### Step 8: Heuristics Capture

After the prototype session completes (keep or discard), **propose** design decisions based on what you observed during the session. Review the prototyping iterations, user feedback, and design choices made, then present a numbered list:

> **Design decisions from this session:**
>
> 1. [decision derived from prototyping — e.g., "dark theme works well for developer tutorials"]
> 2. [decision derived from prototyping — e.g., "nav bar with step numbers is clear navigation"]
> 3. ...
>
> Would you like to save these as heuristics? You can edit, remove, add, or say "skip" to proceed without saving.

Propose 2-4 decisions. Base them on concrete observations: layout choices that worked, user feedback during iterations, visual patterns that were confirmed or rejected, interaction patterns that emerged. Do not ask the user to recall — you were present for the entire session.

**Handling responses:**

- **User provides "none", "skip", or empty response:** Proceed to Step 8b (Return to Brainstorm) or Step 9 (Session Summary) without saving heuristics. This is not an error — not every session produces reusable insights.

- **User confirms or edits the proposed decisions (1-4 total):** For each decision, invoke `/adev:learn` to persist it as a module-scoped heuristic:
  - The decision text as the heuristic content
  - Module scope set to the current `<module>` (from brainstorm context or `--module` argument)
  - Tag with `source: prototype` to identify the heuristic's origin
  - Include the prototype tier and iteration number where the decision emerged (if identifiable)
  - Track `heuristics_saved` count for the return contract (Step 8b)

  If `/adev:learn` fails for any heuristic (import error, write error), this is non-blocking:
  - Log the error
  - Report: "Heuristic capture failed — you can save these manually with `/adev:learn` later"
  - Proceed to session completion (do not block the prototype session). Error code: `HEURISTIC_SAVE_ERROR`.

- **User provides more than 4 design decisions:** Ask the user to prioritize:

  > You've identified N decisions. To keep heuristics focused, please select the 4 most important ones, or confirm you want to save all N.

  If the user confirms saving all, proceed. If the user narrows to 4, save only the selected ones.

- **User provides 0 decisions after the prompt (blank input):** Same as "skip" — proceed without saving heuristics.

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

When invoked standalone (not from brainstorm), output a session summary after heuristics capture. When invoked from brainstorm, skip this step — the return-to-brainstorm contract handles the result.

> **Prototype Session Complete**
>
> - **Module:** `<module>`
> - **Tier:** `<wireframe|mockup|functional>`
> - **Iterations:** `<iteration_count>` (number of Feedback Iteration cycles including the initial generation)
> - **Persistence:** `"project"` (kept at `.adev/prototype/<module>/`) | `"ephemeral"` (discarded)
> - **Visual references:** `<count>` captured
> - **Heuristics saved:** `<count>`

If visual references were captured during the session (tracker.count() > 0), append the tracker summary:

```
tracker.summary(module)
```

This outputs: "Captured N visual reference(s) in `.context-index/references/<module>/visuals/`:" followed by a list of `{ path, description }` pairs.

No return-to-brainstorm step is performed. The session ends here.

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
