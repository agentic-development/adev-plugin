# Implementation Plan: Prototype Core

> **Methodology:** adev
> **Charter:** .context-index/specs/features/prototype-brainstorm/charter.md
> **Spec:** .context-index/specs/features/prototype-brainstorm/prototype-core.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-08)
> **Platform:** Node.js, JavaScript (ESM), node:test, npm

**Goal:** Implement the core prototype loop — tier selection, file generation, zero-dep HTTP server, conversational feedback iteration, and file persistence/cleanup.

**Architecture:** The prototype skill is implemented as a SKILL.md (conversational instructions) supported by a companion library module `lib/prototype-server.mjs` that handles HTTP server lifecycle, MIME type handling, and security validation. The SKILL.md orchestrates the prototype session flow (tier selection, generation, feedback, persistence) while the server helper provides the programmatic HTTP serving with port scanning and path traversal protection. Tests validate the server helper's security and functional properties using `node:test` and the project's established test helpers.

---

## File Structure

**Create:**
- `skills/prototype/SKILL.md` — Skill instructions for the prototype session workflow
- `lib/prototype-server.mjs` — Zero-dep HTTP server helper with port scanning, MIME allowlist, path traversal guard, dotfile blocking, graceful shutdown
- `tests/lib/prototype-server.test.mjs` — Unit tests for the HTTP server helper

**Modify:**
- `.gitignore` — Ensure `.adev/` is gitignored (if not already present)

**Reference (read, do not modify):**
- `.context-index/samples/general-library-module-graph.md` — Follow this pattern for library module structure (pure ESM, import ordering, naming conventions)
- `.context-index/samples/general-test-helpers.md` — Follow test utility patterns
- `tests/helpers.mjs` — Use shared test utilities
- `.context-index/specs/features/prototype-brainstorm/charter.md` — Charter for capability tracing
- `lib/heuristics.mjs` — Used by skill for loading module heuristics at session start

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/prototype-core.spec.md` (Behaviors 6-9, Error Cases: SERVER_*)
- Charter: `.context-index/specs/features/prototype-brainstorm/charter.md` (capability: Local HTTP serving)
- Sample: `.context-index/samples/general-library-module-graph.md` (follow pure ESM library pattern)
- Sample: `.context-index/samples/general-test-helpers.md` (follow test conventions)
- Constitution: `.context-index/constitution.md` (Non-Negotiable Principles #1 pure ESM, #3 minimize deps)
- Review: `.context-index/specs/features/prototype-brainstorm/prototype-core.review.md` (SEC-10: realpathSync ENOENT handling, SEC-11: SVG script risk, SEC-12: validation pipeline ordering)

### Task 2 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/prototype-core.spec.md` (Behaviors 6-9, Error Cases: SERVER_*)
- Task 1 artifacts: `lib/prototype-server.mjs` (the module under test)
- Sample: `.context-index/samples/general-test-helpers.md` (test patterns)
- Source files: `tests/helpers.mjs` (shared test utilities — createTempDir, cleanupTempDir)
- Review: `.context-index/specs/features/prototype-brainstorm/prototype-core.review.md` (SEC-12: validation pipeline ordering must be tested)

### Task 3 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/prototype-core.spec.md` (Behaviors 1-5, 10-15, Error Cases: INVALID_TIER, INVALID_FRAMEWORK, EMPTY_FEEDBACK, PERSIST_WRITE_ERROR)
- Charter: `.context-index/specs/features/prototype-brainstorm/charter.md` (capabilities: Tiered prototype generation, Conversational feedback loop, File persistence choice)
- Source files: `lib/prototype-server.mjs` (server API to reference in skill instructions)
- Source files: `lib/heuristics.mjs` (export signatures — retrieveHeuristics for B1)
- Review: `.context-index/specs/features/prototype-brainstorm/prototype-core.review.md` (CON-A: heuristics failure behavior, CON-B: iteration semantics)

### Task 4 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/prototype-core.spec.md` (Behavior 13, Error Case: PERSIST_WRITE_ERROR)
- Source files: `lib/prototype-server.mjs` (server close API for cleanup)
- Constitution: `.context-index/constitution.md` (Anti-Patterns — no hardcoded paths to `~/.claude/`)

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

No module-scoped heuristics found for `prototype-brainstorm`. Global heuristics loaded (3 entries) but none are directly relevant to this implementation domain.

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2 tests the module created in Task 1)
- Group B (depends on Task 1): Task 3 (SKILL.md references `lib/prototype-server.mjs` API)
- Group C (depends on Task 1, Task 3): Task 4 (gitignore management depends on skill's persistence flow)

Tasks 2 and 3 can run in parallel after Task 1 completes (no shared file dependencies between test file and SKILL.md).

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | HTTP server helper | large | unit | — | 1 create |
| 2 | Server security and functional tests | medium | unit | Task 1 | 1 create |
| 3 | Prototype skill (SKILL.md) | large | unit | Task 1 | 1 create |
| 4 | Gitignore management and persistence cleanup | small | unit | Task 1, Task 3 | 0 create, 1 modify |

---

### Task 1: HTTP Server Helper [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=3
**Rationale:** Well-specified server helper with explicit security pipeline ordering, direct golden sample match for library module pattern, and single-file scope.

**Charter capability:** Local HTTP serving
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/prototype-server.mjs`

**Tests:** `tests/lib/prototype-server.test.mjs` — tested in Task 2

**Context to load:**
- `.context-index/samples/general-library-module-graph.md` (follow library module pattern)
- `.context-index/specs/features/prototype-brainstorm/prototype-core.spec.md` (Behaviors 6-9)

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('prototype-server', () => {
  it('exports startServer function', async () => {
    const mod = await import('../../lib/prototype-server.mjs');
    assert.equal(typeof mod.startServer, 'function');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/prototype-server.test.mjs`
Expected: FAIL — module `../../lib/prototype-server.mjs` not found

- [x] **Implement**

Create `lib/prototype-server.mjs` exporting `startServer(rootDir, options?)` that:

1. **Port scanning (Behavior 6, 8):** Binds to `127.0.0.1` starting at port 3210, incrementing up to 3219 on EADDRINUSE. Returns `{ port, close }` on success. Falls back to `null` after 10 failures.

2. **MIME allowlist (Behavior 7):** Serves files with an explicit allowlist map:
   - `text/html`, `text/css`, `application/javascript`, `application/json`
   - `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`
   - `font/woff`, `font/woff2`
   - Unknown extensions → `application/octet-stream` with `Content-Disposition: attachment`
   - `index.html` as default document

3. **Security validation pipeline (Behavior 7, Review SEC-12 ordering):** Process requests in this explicit order:
   1. URL-decode the request path
   2. Reject if decoded path contains `%` (double-encode guard → HTTP 400)
   3. Resolve the file path against the serve root
   4. `fs.realpathSync` the resolved path (handle ENOENT → HTTP 404 with generic body, per SEC-10)
   5. `startsWith` comparison against `realpathSync`-normalized root (path traversal → HTTP 403)
   6. Check if filename starts with `.` (dotfile → HTTP 403)

4. **Graceful shutdown (Behavior 15):** `close()` returns a Promise that resolves when the server is fully closed.

5. **Error handling (Behavior 9):** Non-port errors (EACCES, etc.) cause `startServer` to return `null` without throwing.

6. **Built-in modules only:** Import from `http`, `fs`, `path`, `os` only.

```javascript
import { createServer } from 'node:http';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { join, extname, basename, resolve } from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const START_PORT = 3210;
const MAX_PORT_ATTEMPTS = 10;

export async function startServer(rootDir, options = {}) {
  // Normalize rootDir via realpathSync for consistent comparisons
  // Port scan loop: try ports 3210-3219
  // Request handler: security pipeline in order
  // Return { port, close } or null on failure
}
```

- [x] **Verify test passes**

Run: `node --test tests/lib/prototype-server.test.mjs`
Expected: PASS

- [x] **Commit**

Branch: `feat/prototype-brainstorm/prototype-core`

```bash
git add lib/prototype-server.mjs
git commit -m "feat(design): add zero-dep HTTP server helper for prototype serving

Spec: .context-index/specs/features/prototype-brainstorm/prototype-core.spec.md
Plan-task: 1"
```

---

### Task 2: Server Security and Functional Tests [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Test expectations are explicit in spec and review findings; follows established test helper patterns with standard HTTP fetch assertions.

**Charter capability:** Local HTTP serving
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/lib/prototype-server.test.mjs`

**Tests:** `tests/lib/prototype-server.test.mjs`

**Context to load:**
- `lib/prototype-server.mjs` (the module under test)
- `tests/helpers.mjs` (createTempDir, cleanupTempDir utilities)
- `.context-index/specs/features/prototype-brainstorm/prototype-core.review.md` (SEC-10, SEC-11, SEC-12)

- [x] **Write failing test**

```javascript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../helpers.mjs';
import { startServer } from '../../lib/prototype-server.mjs';

describe('prototype-server', () => {
  let tmpDir;
  let server;

  before(() => {
    tmpDir = createTempDir();
    writeFileSync(join(tmpDir, 'index.html'), '<h1>Test</h1>');
    writeFileSync(join(tmpDir, 'style.css'), 'body { color: red; }');
    writeFileSync(join(tmpDir, '.env'), 'SECRET=value');
  });

  after(async () => {
    if (server) await server.close();
    cleanupTempDir(tmpDir);
  });

  it('starts server and serves index.html as default', async () => {
    server = await startServer(tmpDir);
    assert.ok(server, 'server should start');
    assert.ok(server.port >= 3210 && server.port <= 3219);
    const res = await fetch(`http://127.0.0.1:${server.port}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html');
    const body = await res.text();
    assert.ok(body.includes('<h1>Test</h1>'));
  });

  it('serves CSS with correct MIME type', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/style.css`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/css');
  });

  it('rejects dotfile requests with 403', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/.env`);
    assert.equal(res.status, 403);
  });

  it('rejects path traversal with 403', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/../../../etc/passwd`);
    assert.equal(res.status, 403);
  });

  it('rejects double-encoded URLs with 400', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/%252Fetc%252Fpasswd`);
    assert.equal(res.status, 400);
  });

  it('returns 404 for non-existent files (SEC-10: no stack trace)', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/nonexistent.html`);
    assert.equal(res.status, 404);
    const body = await res.text();
    assert.ok(!body.includes('Error:'), 'should not expose stack trace');
    assert.ok(!body.includes(tmpDir), 'should not expose file paths');
  });

  it('serves unknown extensions as octet-stream with attachment disposition', async () => {
    writeFileSync(join(tmpDir, 'data.xyz'), 'binary');
    const res = await fetch(`http://127.0.0.1:${server.port}/data.xyz`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/octet-stream');
    assert.ok(res.headers.get('content-disposition')?.includes('attachment'));
  });

  it('gracefully closes server', async () => {
    await server.close();
    server = null;
    // Attempting to connect should fail
    try {
      await fetch('http://127.0.0.1:3210/');
    } catch (e) {
      assert.ok(e, 'connection should fail after close');
    }
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/prototype-server.test.mjs`
Expected: FAIL — tests fail against initial stub implementation

- [x] **Implement**

Ensure `lib/prototype-server.mjs` passes all security and functional tests. This is primarily a test-writing task — the implementation was done in Task 1. Fix any issues found by the tests. Add edge case tests:

- Port retry behavior (bind to port 3210 first, verify server picks next port)
- Server returns `null` when all 10 ports exhausted
- `realpathSync` handles symlinks correctly (resolved path must still start with root)

- [x] **Verify test passes**

Run: `node --test tests/lib/prototype-server.test.mjs`
Expected: PASS — all security and functional tests green

Run: `npm test`
Expected: PASS — full test suite including new tests

- [x] **Commit**

```bash
git add tests/lib/prototype-server.test.mjs
git commit -m "test(design): add security and functional tests for prototype server

Covers MIME types, dotfile blocking, path traversal, double-encode
rejection, ENOENT handling (SEC-10), and graceful shutdown.

Spec: .context-index/specs/features/prototype-brainstorm/prototype-core.spec.md
Plan-task: 2"
```

---

### Task 3: Prototype Skill (SKILL.md) [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=3
**Rationale:** All 15 behaviors fully specified with error cases; no curated SKILL.md golden sample but existing skills provide discoverable patterns; novel composition of tier selection, server, feedback loop, and persistence.

**Charter capability:** Tiered prototype generation, Conversational feedback loop, File persistence choice, Visual reference capture, Heuristics capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `skills/prototype/SKILL.md`

**Tests:** `tests/lib/prototype-server.test.mjs` — skill is markdown; tested indirectly through server tests and integration. No additional test file for SKILL.md (skills are primarily markdown instructions, not executable logic).

**Context to load:**
- `.context-index/specs/features/prototype-brainstorm/prototype-core.spec.md` (all behaviors)
- `.context-index/specs/features/prototype-brainstorm/charter.md` (all capabilities)
- `lib/prototype-server.mjs` (API surface to reference)
- `lib/heuristics.mjs` (retrieveHeuristics API for B1)
- `.context-index/specs/features/prototype-brainstorm/prototype-core.review.md` (CON-A, CON-B warnings to address)

- [x] **Write failing test**

No separate test file — skills are markdown. Verification is that the SKILL.md exists and follows constitution principle #2 (no executable logic inside SKILL.md).

```javascript
// Validation check (inline during implementation):
// 1. File exists at skills/prototype/SKILL.md
// 2. File does not contain import/export/require statements
// 3. File references lib/prototype-server.mjs for server operations
```

- [x] **Verify test fails**

Run: `ls skills/prototype/SKILL.md`
Expected: FAIL — file does not exist

- [x] **Implement**

Create `skills/prototype/SKILL.md` covering the full prototype session workflow:

1. **Session start and heuristics (Behavior 1):** Load module heuristics via `retrieveHeuristics(projectRoot, module)`. Surface results if available, proceed silently on failure (addressing CON-A: use "proceeds silently" behavior as spec says).

2. **Tier selection (Behaviors 2-5):** Present three tiers with descriptions. Validate selection. Set framework attribute for functional tier.

3. **File generation:** Instructions for generating prototype files per tier:
   - Wireframe: semantic HTML, basic layout resets, no CSS styling
   - Mockup: HTML + CSS with visual styling intent
   - Functional: prompt for framework, generate SPA with CDN imports, no build step

4. **Server startup (Behavior 6):** Run inline Node.js to start server:
   ```javascript
   import { startServer } from '<ADEV_ROOT>/lib/prototype-server.mjs';
   import { mkdtempSync } from 'fs';
   import { join } from 'path';
   import { tmpdir } from 'os';
   const tmpDir = mkdtempSync(join(tmpdir(), 'adev-prototype-'));
   // ... generate files into tmpDir ...
   const server = await startServer(tmpDir);
   ```

5. **Fallback (Behaviors 8-9):** When `startServer` returns `null`, report file path for manual opening.

6. **Feedback loop (Behaviors 10-11):** Accept text feedback, clear temp directory (all files and subdirectories — addressing SA-2), regenerate, notify to refresh. Increment iteration counter (starting at 1 for initial generation — clarifying CON-B). Handle empty feedback (re-prompt).

7. **Persistence (Behaviors 12-14):** Present keep/discard choice. Keep: copy to `.adev/prototype/<module>/` (re-validate module name against `^[a-z0-9][a-z0-9-]*$`), ensure `.adev/` in `.gitignore` (pattern-aware check). Discard: remove temp dir. Both: stop server.

8. **Server lifecycle (Behavior 15):** Always stop server on session end.

9. **Error handling:** Cover all error codes from spec error table.

- [x] **Verify test passes**

Run: `ls skills/prototype/SKILL.md`
Expected: File exists

Run: `npm test`
Expected: PASS — no regression

- [x] **Commit**

```bash
git add skills/prototype/SKILL.md
git commit -m "feat(design): add prototype skill for tiered prototype generation

Implements tier selection, HTTP serving, feedback loop, and persistence
choice as structured markdown instructions.

Spec: .context-index/specs/features/prototype-brainstorm/prototype-core.spec.md
Plan-task: 3"
```

---

### Task 4: Gitignore Management and Persistence Cleanup [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=4
**Rationale:** Persistence behaviors well-defined but pattern-aware gitignore edge cases require some inference; small scope with single file modification.

**Charter capability:** File persistence choice
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 3
**Files:**
- Modify: `.gitignore` (ensure `.adev/` pattern)
- Test: `tests/lib/prototype-server.test.mjs` (add persistence-related tests)

**Tests:** `tests/lib/prototype-server.test.mjs` — add tests for gitignore pattern-aware check and temp directory cleanup

**Context to load:**
- `.context-index/specs/features/prototype-brainstorm/prototype-core.spec.md` (Behaviors 13-14)
- `.context-index/constitution.md` (Anti-Patterns — no hardcoded paths)

- [x] **Write failing test**

```javascript
describe('gitignore management', () => {
  it('ensureGitignore adds .adev/ when not present', () => {
    const { ensureGitignore } = await import('../../lib/prototype-server.mjs');
    // Test with a temp .gitignore file
    const tmpDir = createTempDir();
    writeFileSync(join(tmpDir, '.gitignore'), 'node_modules/\n');
    ensureGitignore(tmpDir);
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf8');
    assert.ok(content.includes('.adev/'));
    cleanupTempDir(tmpDir);
  });

  it('ensureGitignore does not duplicate when .adev/ already present', () => {
    const tmpDir = createTempDir();
    writeFileSync(join(tmpDir, '.gitignore'), 'node_modules/\n.adev/\n');
    const { ensureGitignore } = await import('../../lib/prototype-server.mjs');
    ensureGitignore(tmpDir);
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf8');
    const matches = content.match(/\.adev\//g);
    assert.equal(matches.length, 1, 'should not duplicate .adev/ entry');
    cleanupTempDir(tmpDir);
  });

  it('ensureGitignore detects parent patterns covering .adev/', () => {
    const tmpDir = createTempDir();
    writeFileSync(join(tmpDir, '.gitignore'), '.adev\n');
    const { ensureGitignore } = await import('../../lib/prototype-server.mjs');
    ensureGitignore(tmpDir);
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf8');
    // .adev already covers .adev/, should not add redundant entry
    assert.ok(!content.includes('.adev/\n') || content.split('.adev').length <= 3);
    cleanupTempDir(tmpDir);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/prototype-server.test.mjs`
Expected: FAIL — `ensureGitignore` not exported

- [x] **Implement**

Add `ensureGitignore(projectRoot)` to `lib/prototype-server.mjs`:

1. Read `.gitignore` at project root (create if absent)
2. Pattern-aware check: search for `.adev/`, `.adev`, or parent glob patterns that cover `.adev/`
3. If not covered, append `.adev/` with a comment line
4. Module name validation helper: `validateModuleName(name)` checking `^[a-z0-9][a-z0-9-]*$`

- [x] **Verify test passes**

Run: `node --test tests/lib/prototype-server.test.mjs`
Expected: PASS

Run: `npm test`
Expected: PASS — full suite green

- [x] **Commit**

```bash
git add lib/prototype-server.mjs tests/lib/prototype-server.test.mjs
git commit -m "feat(design): add gitignore management and module name validation

Pattern-aware .gitignore check for .adev/ directory, module name
validation for persistence path construction.

Spec: .context-index/specs/features/prototype-brainstorm/prototype-core.spec.md
Plan-task: 4"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [ ] Heuristics surfaced before tier selection (B1)
  - [ ] Tier selection with three options (B2-5)
  - [ ] HTTP server binds to 127.0.0.1 with port scanning (B6, B8)
  - [ ] MIME allowlist with security pipeline (B7)
  - [ ] Server fallback to file-path mode (B8-9)
  - [ ] Clean-slate feedback regeneration with iteration counting (B10)
  - [ ] Approval ends loop, server stays active during persistence prompt (B11)
  - [ ] Keep/discard persistence with gitignore management (B12-14)
  - [ ] Server always stopped on session end (B15)
  - [ ] No prototype files committed to git
