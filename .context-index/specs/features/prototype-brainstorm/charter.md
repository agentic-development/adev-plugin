---
status: approved
revision: 2
updated: 2026-05-07
---

# Feature Charter: Prototype Brainstorm

## Business Intent

The `/adev:prototype` skill exists to validate design direction through working prototypes before committing to detailed charter design. It bridges the gap between abstract approach selection (Step 3) and concrete design sections (Step 4) by giving users a tangible artifact they can see, interact with, and critique — reducing the risk of specifying and implementing a design that "felt right on paper" but doesn't work in practice.

## Scope and Boundaries

### In Scope

- Three-tier prototype generation: wireframe (bare HTML structure), mockup (styled HTML/CSS), functional (interactive app with user-chosen framework)
- Zero-dependency local HTTP server for serving prototype files
- Conversational feedback loop — user views in browser, describes changes in chat, agent iterates
- User-chosen file persistence: ephemeral (temp dir, cleaned up) or project-scoped (`.adev/prototype/<module>/`, gitignored)
- Capture and persist user-provided screenshots and reference images to `.context-index/references/<module>/visuals/`
- Heuristics capture of key design decisions after the prototype loop (via `/adev:learn`)
- Structured context input from brainstorm (chosen approach, platform context, module name)
- Invocable by `/adev:brainstorm` (Step 3b) and independently by users

### Out of Scope

- Click-tracking or structured in-browser feedback mechanisms (WebSocket event capture, `data-choice` elements)
- Screenshot-based feedback (Playwright dependency) — agent may use it opportunistically if available, but the skill does not depend on it
- Evolutionary prototypes — prototype code is never carried forward into implementation
- Backend/API prototyping (database connections, real API calls) — mock data only
- Deployment or hosting of prototypes beyond localhost
- Modifying the charter template structure (no new sections added to charters)
- Modifying downstream skills (specify, implement, validate) to consume visual references — that is their charter scope

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| brainstorm | internal module | Invokes prototype as optional Step 3b, passes approach context |
| `/adev:learn` | internal skill | Persists design decisions as module-scoped heuristics |
| `lib/heuristics.mjs` | shared library | Loads existing module heuristics at prototype start |
| constitution.md | context file | Constraint validation during prototype generation |
| platform-context.yaml | context file | Tech stack context for framework selection defaults |
| Node.js `http` | built-in module | Local HTTP server for serving prototype files |
| Node.js `fs` | built-in module | File generation, reading user-provided images, cleanup |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Prototype Session | A single prototype generation + feedback loop within a brainstorm | `module`, `tier` (wireframe/mockup/functional), `approach_context`, `persistence` (ephemeral/project), `status` (active/completed/discarded) |
| Prototype Artifact | The generated files comprising the prototype | `file_paths[]`, `tier`, `framework` (html/react/vue/svelte/vanilla — `html` is sentinel for wireframe/mockup tiers indicating no JS framework), `serving_port` |
| Visual Reference | A user-provided screenshot or image captured during prototyping | `path` (in `.context-index/references/<module>/visuals/`), `description`, `source` (user-upload; `screenshot` reserved for Phase 2 Playwright integration — see Out of Scope) |
| Feedback Iteration | A single round of user feedback + agent regeneration | `iteration_number`, `user_feedback` (text), `changes_made` (text) |

### Relationships

- A Prototype Session produces one Prototype Artifact (1:1)
- A Prototype Session contains one or more Feedback Iterations (1:N)
- A Prototype Session may capture zero or more Visual References (1:N)
- A Prototype Session belongs to one brainstorm conversation (N:1 — a brainstorm could theoretically re-prototype if the user pivots)

### Invariants

- A prototype artifact is always served locally; it never leaves localhost
- Visual references are committed to the context-index; prototype artifacts are never committed (ephemeral or gitignored)
- The prototype tier is chosen once per session and does not change mid-session (user starts a new session to change tier)
- Feedback iterations do not modify visual references — references are captured explicitly by user action, not automatically

## Capability Map

| Capability | Description | Priority | Phase | Status |
|-----------|-------------|----------|-------|--------|
| Tiered prototype generation | Generate prototype files at three complexity levels: wireframe (HTML structure), mockup (styled HTML/CSS), functional (interactive app with user-chosen framework) | must-have | 1 | validated |
| Local HTTP serving | Serve prototype files via zero-dep Node.js HTTP server with auto-refresh on regeneration | must-have | 1 | validated |
| Conversational feedback loop | Accept user feedback in chat, regenerate prototype, repeat until user approves | must-have | 1 | validated |
| File persistence choice | Ask user whether to keep prototype files (project-scoped, gitignored) or discard (temp dir, cleaned up) | must-have | 1 | validated |
| Visual reference capture | Save user-provided screenshots and images to `.context-index/references/<module>/visuals/` with descriptive filenames | must-have | 1 | validated |
| Heuristics capture | After prototype loop, save 2-4 key design decisions as module-scoped heuristics via `/adev:learn` | must-have | 1 | planned |
| Brainstorm integration | Accept structured context from `/adev:brainstorm` Step 3 (approach, module, platform) and return control after completion | must-have | 1 | planned |
| Standalone invocation | Invocable independently outside brainstorm for ad-hoc prototyping against an existing charter. Uses `--module <name>` to locate charter at `.context-index/specs/features/<module>/charter.md`. | should-have | 1 | validated |
| Multi-framework support | Structured templates for generating functional-tier prototypes in React, Vue, Svelte, or vanilla JS. In Phase 1, the agent generates framework code freeform; Phase 2 adds curated templates for consistency. | should-have | 2 | — |
| Live reload | Auto-refresh browser when prototype files are regenerated during feedback loop | nice-to-have | 2 | — |

## Deferred Capabilities

| Capability | Reason | Target Phase | Depends On |
|-----------|--------|-------------|------------|
| Multi-framework support | Phase 1 covers HTML and user-chosen framework; structured multi-framework templates deferred | 2 | Tiered prototype generation |
| Live reload | Auto-refresh is a UX enhancement; manual browser refresh is acceptable for phase 1 | 2 | Local HTTP serving |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `/adev:prototype` | skill invocation | Primary entry point. Accepts `--module <name>`, `--tier <wireframe\|mockup\|functional>`, optional `--framework <react\|vue\|svelte\|vanilla>`. When invoked standalone, reads charter for context. |
| `/adev:prototype` (from brainstorm) | skill dispatch | Accepts structured context: module, approach summary, platform context, constitution constraints. Returns control to brainstorm on completion. |
| Visual references output | file convention | Writes images to `.context-index/references/<module>/visuals/`. Downstream skills discover them via `visual-references` field in spec frontmatter. |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `/adev:learn` | heuristics | Invoked after prototype loop to persist design decisions as module-scoped heuristics |
| `retrieveHeuristics()` | `lib/heuristics.mjs` | Loads existing module heuristics at prototype start |
| `constitution.md` | context-index | Constraint validation during prototype generation |
| `platform-context.yaml` | context-index | Tech stack context for framework selection defaults |
| `charter.md` | context-index | Charter context when invoked standalone (not from brainstorm) |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Startup speed | HTTP server starts and serves prototype within 3 seconds of generation. No build step, no bundling — raw files served directly. |
| Zero dependencies | Server uses only Node.js `http` and `fs` built-ins. Prototype generation is agent-authored code, not template-engine output. No npm install required. |
| Cleanup reliability | Ephemeral prototypes are cleaned up when the skill completes (temp dir removed). Project-scoped prototypes persist in `.adev/prototype/<module>/` with `.adev/` gitignored. No orphaned files. |
| Isolation | Prototype server binds to `localhost` only. No network exposure. Port selection avoids conflicts (scan for available port). |
| Graceful degradation | If the HTTP server fails to start (port conflict, permissions), the skill falls back to writing files and telling the user the path to open manually. Prototyping is not blocked by server issues. |
| Image handling | Visual references are stored at original resolution. Filenames are slugified from user-provided descriptions. Supported formats: PNG, JPG, WebP. |
