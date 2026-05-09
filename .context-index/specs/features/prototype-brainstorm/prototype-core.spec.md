# Live Spec: Prototype Core

<!-- Live Spec within the prototype-brainstorm charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/prototype-brainstorm/charter.md -->

---
charter: prototype-brainstorm
status: validated
risk_level: medium
milestone: 1
revision: 3
charter-revision: 2
created: 2026-05-07
updated: 2026-05-08
source-manifest:
  sha: "5d99123"
  files:
    - lib/prototype-server.mjs
    - skills/prototype/SKILL.md
    - tests/lib/prototype-server.test.mjs
  computed-at: "2026-05-08T10:23:01.417Z"
---

## Behavioral Contract

This spec covers the core prototype loop: the agent generates prototype files at a user-chosen fidelity tier, serves them over localhost, iterates based on conversational feedback, and persists or discards the result.

### Preconditions

- The skill has been invoked with a valid module name (either passed from `/adev:brainstorm` context or via `--module <name>`)
- A charter exists at `.context-index/specs/features/<module>/charter.md` (when invoked standalone)
- Node.js runtime is available (for HTTP server)
- Platform context (`.context-index/platform-context.yaml`) is loaded for framework defaults
- Constitution (`.context-index/constitution.md`) exists for constraint validation (validated by the invoking path — standalone validates directly, brainstorm validates before dispatch)

### Behaviors

1. **When** the skill starts (standalone or from brainstorm) and existing module heuristics are available via `retrieveHeuristics(projectRoot, module)` **then** they are surfaced to the user before tier selection: "Previous design learnings for this module:" followed by heuristic summaries. If `retrieveHeuristics()` fails or returns empty, the skill proceeds silently.

2. **When** the user invokes `/adev:prototype` (standalone or from brainstorm) **then** the skill presents the three tier options — wireframe, mockup, functional — with a one-line description of each, and waits for selection.

3. **When** the user selects the "wireframe" tier **then** the agent generates bare HTML files with semantic structure (headings, lists, containers, placeholder text) and no CSS beyond basic layout resets. The output communicates information hierarchy, not visual design. The `Prototype Artifact.framework` attribute is set to `html` (sentinel value indicating no JavaScript framework — used for both wireframe and mockup tiers).

4. **When** the user selects the "mockup" tier **then** the agent generates HTML + CSS files with visual styling (colors, typography, spacing, borders) that convey design intent. No JavaScript is included. The `Prototype Artifact.framework` attribute is set to `html`.

5. **When** the user selects the "functional" tier **then** the agent asks for framework preference (React, Vue, Svelte, or vanilla JS), generates an interactive single-page application with mock data, and includes the minimal boilerplate needed to run (e.g., a single `index.html` with CDN imports — no build step).

6. **When** prototype files are generated (any tier) **then** a Node.js HTTP server starts on `localhost`, binding explicitly to `127.0.0.1` via `server.listen(port, '127.0.0.1', callback)` — binding to all interfaces (`0.0.0.0`) is a constitutional violation. The server uses only the `http`, `fs`, `path`, and `os` built-in modules. It binds to an available port starting from 3210, incrementing sequentially (3210, 3211, ..., 3219), and the agent reports the URL to the user. All prototype files are generated into a temp directory created via `fs.mkdtempSync(path.join(os.tmpdir(), 'adev-prototype-'))`.

7. **When** the HTTP server starts successfully **then** it serves files from the prototype directory with correct MIME types using an explicit allowlist (`text/html`, `text/css`, `application/javascript`, `application/json`, `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`, `font/woff`, `font/woff2`), with `index.html` as the default document. Files whose names begin with a dot (e.g., `.env`, `.gitignore`) are rejected with HTTP 403 regardless of extension. File extensions not in the allowlist are served as `application/octet-stream` with `Content-Disposition: attachment`. The server must validate that the resolved file path (after URL decoding and `fs.realpathSync`) starts with the `fs.realpathSync`-normalized prototype directory root — this ensures correct comparison on case-insensitive file systems (macOS HFS+, Windows NTFS). Requests containing `%` characters after URL decoding are rejected with HTTP 400 (prevents double-encoded path traversal via `%252F`). Requests that escape the serve root (e.g., `/../`) are rejected with HTTP 403.

8. **When** the server port is unavailable (EADDRINUSE) **then** the server retries on the next sequential port, up to 10 attempts (3210-3219). If all fail, the skill falls back to reporting the file path for manual opening and continues the feedback loop without blocking.

9. **When** the HTTP server fails for a non-port reason (EACCES, unexpected error) **then** the skill logs the error, falls back to file-path mode, and continues without blocking.

10. **When** the user provides text feedback after viewing the prototype in the browser **then** the agent clears all files in the temp directory (clean-slate regeneration — prevents stale files from prior iterations persisting), regenerates the prototype files into the same temp directory, and increments `Feedback Iteration.iteration_number` by 1. The HTTP server serves the updated files (no restart needed — same directory), and the agent notifies the user to refresh. The initial generation (before any feedback) counts as iteration 1.

11. **When** the user indicates approval (e.g., "looks good", "approved", "done") **then** the feedback loop ends and the skill proceeds to the persistence choice. The HTTP server remains active during the persistence prompt so the user can take a final look before deciding.

12. **When** the feedback loop ends **then** the skill asks: "Keep these prototype files (saved to `.adev/prototype/<module>/`, gitignored) or discard (temp files removed)?" The domain values map as: "keep" → `project` persistence, "discard" → `ephemeral` persistence.

13. **When** the user chooses "keep" (project persistence) **then** the prototype files are copied to `.adev/prototype/<module>/` (the `<module>` value must be re-validated against `^[a-z0-9][a-z0-9-]*$` before path construction as defense-in-depth). A `.gitignore` entry for `.adev/` is ensured — the skill checks whether `.adev/` or a parent pattern already exists before appending (pattern-aware, not just exact line match). If no `.gitignore` exists at the project root, one is created. The temp directory is removed and the HTTP server is stopped.

14. **When** the user chooses "discard" (ephemeral persistence) **then** the temp directory and all prototype files are removed, the HTTP server is stopped, and no files persist.

15. **When** the prototype session completes (keep or discard) **then** the HTTP server process is always stopped — no orphaned server processes remain. If the conversation ends mid-session (terminal closed, browser tab closed), the server process dies with the Claude Code session and temp files are cleaned by the OS eventually — this is an inherent limitation of skill-driven sessions, not a bug to solve.

### Postconditions

- If "keep" (project persistence): prototype files exist at `.adev/prototype/<module>/`, `.adev/` is gitignored, no temp files remain, server is stopped.
- If "discard" (ephemeral persistence): no prototype files exist anywhere, server is stopped.
- The prototype tier selection is immutable for the session — changing tier requires a new invocation.
- No prototype artifacts are committed to git (ephemeral are in temp, project-scoped are gitignored).

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Invalid tier selection (interactive prompt) | Re-prompt with valid options | INVALID_TIER |
| Invalid tier via `--tier` CLI argument | Error with valid options; do not re-prompt (see `standalone-invocation.spec.md`) | INVALID_TIER |
| Invalid framework selection (functional tier) | Re-prompt with valid options (react/vue/svelte/vanilla) | INVALID_FRAMEWORK |
| No charter found for `--module` (standalone mode) | Error: "No charter found at `.context-index/specs/features/<module>/charter.md`. Run `/adev:brainstorm` first." | CHARTER_NOT_FOUND |
| All 10 server port attempts fail (3210-3219) | Fall back to file-path mode; log warning | SERVER_PORT_EXHAUSTED |
| Request path escapes prototype directory root | Reject with HTTP 403; log warning | SERVER_PATH_TRAVERSAL |
| Request URL contains `%` after decoding (double-encoded) | Reject with HTTP 400 | SERVER_DOUBLE_ENCODE |
| Request targets a dotfile (name starts with `.`) | Reject with HTTP 403 | SERVER_DOTFILE |
| Server bind fails (EACCES) | Fall back to file-path mode; log permission error | SERVER_PERMISSION_ERROR |
| File write fails (disk full, permissions) | Error with normalized message (error code + description, raw path stripped); skill cannot proceed | FILE_WRITE_ERROR |
| `.adev/` directory not writable (keep mode) | Error; suggest discard or fix permissions | PERSIST_WRITE_ERROR |
| User sends empty feedback | Re-prompt: "Please describe what you'd like changed, or say 'done' to finish." | EMPTY_FEEDBACK |

## System Constitution Reference

- **"Minimize external dependencies"** — The HTTP server uses only Node.js `http`, `fs`, `path`, and `os` built-ins. Prototype generation is agent-authored code, not template-engine output. No npm install required for any tier.
- **"Skills are primarily markdown"** — The SKILL.md defines the prototype workflow as structured instructions. The HTTP server helper (`lib/prototype-server.mjs`) is companion code that the skill invokes but does not require — file-path fallback ensures the skill functions without it.
- **"Pure ESM"** — The server helper and any generated boilerplate use ESM imports (`.mjs` extension).
- **"No hardcoded paths to `~/.claude/`"** — Prototype paths use project-relative `.adev/prototype/<module>/` or OS temp directories. No user-home references.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1: Tier selection UI | Implement the three-tier prompt with descriptions; validate input | small |
| T2: Wireframe generator | Agent instructions for generating semantic HTML prototype files | small |
| T3: Mockup generator | Agent instructions for generating styled HTML/CSS prototype files | small |
| T4: Functional generator | Framework prompt + agent instructions for interactive SPA generation with CDN imports | medium |
| T5: HTTP server helper | `lib/prototype-server.mjs` — zero-dep localhost server with port scanning, MIME allowlist, path traversal guard (realpathSync + double-encode rejection), dotfile blocking, graceful shutdown. Exports: `startServer(rootDir, options?) → Promise<{ port, close }>` | large |
| T6: Server fallback | File-path fallback when server fails; unified interface regardless of mode | small |
| T7: Feedback loop | Conversational iteration: accept feedback, regenerate, notify user to refresh | medium |
| T8: Persistence choice | Keep/discard prompt, file copy to `.adev/prototype/<module>/`, gitignore management, cleanup | medium |
| T9: Server lifecycle | Ensure server starts after generation and stops on session completion (keep or discard) | small |

## Acceptance Criteria

- [ ] Existing module heuristics surfaced before tier selection (non-blocking on failure)
- [ ] Tier selection presents three options with descriptions; invalid input re-prompts (interactive) or errors (CLI argument)
- [ ] Wireframe tier generates HTML-only files with semantic structure, no visual styling
- [ ] Mockup tier generates HTML + CSS files with visual design intent
- [ ] Functional tier prompts for framework, generates interactive SPA with mock data and CDN imports (no build step)
- [ ] HTTP server binds explicitly to `127.0.0.1` (not `0.0.0.0`) on available port using only Node.js built-ins (`http`, `fs`, `path`, `os`)
- [ ] Server serves files with allowlisted MIME types (including `image/svg+xml`) and `index.html` as default; unknown extensions served as `application/octet-stream` with `Content-Disposition: attachment`
- [ ] Server rejects path traversal attempts using `fs.realpathSync`-normalized comparison with HTTP 403
- [ ] Server rejects double-encoded URLs (containing `%` after decode) with HTTP 400
- [ ] Server rejects dotfile requests (names starting with `.`) with HTTP 403
- [ ] Port conflict triggers automatic retry (up to 10 ports)
- [ ] Server failure falls back to file-path mode without blocking the skill
- [ ] Feedback iteration uses clean-slate regeneration (temp directory cleared before rewrite); `Feedback Iteration.iteration_number` incremented on each cycle (starting at 1)
- [ ] User notified to refresh browser after each regeneration
- [ ] "Done" / approval ends the feedback loop; server remains active during persistence prompt
- [ ] "Keep" copies files to `.adev/prototype/<module>/` (module name re-validated), pattern-aware `.gitignore` check, cleans up temp
- [ ] "Discard" removes all temp files and prototype artifacts
- [ ] HTTP server is always stopped when the session ends (no orphaned processes)
- [ ] No prototype files are committed to git (temp or gitignored)
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
