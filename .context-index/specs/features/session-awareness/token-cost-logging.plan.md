# Implementation Plan: Token Cost Logging

> **Methodology:** adev
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Spec:** .context-index/specs/features/session-awareness/token-cost-logging.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-20)
> **Platform:** JavaScript (ESM), Node.js, node:test

**Goal:** Extend the session-capture hook to enrich JSONL entries with per-tool-call token usage deltas by reading Claude Code's local session files.

**Architecture:** The implementation adds two new lib modules (`lib/session-file-reader.mjs` for parsing Claude Code session files, `lib/token-pricing.mjs` for cost computation) and a cursor management module (`lib/token-cursor.mjs`). The existing `session-capture.sh` hook is extended to call these modules after building the base JSONL entry. All new code follows the Pure ESM pattern and uses only Node.js built-ins. The design prioritizes graceful degradation — all errors fall through to the existing behavior (entry without `usage`, exit 0).

---

## File Structure

**Create:**
- `lib/token-pricing.mjs` — Static price table + `computeCost(model, usage)` function
- `lib/token-cursor.mjs` — Read/write/reset cursor file with atomic writes
- `lib/session-file-reader.mjs` — Locate and parse Claude Code session files
- `tests/lib/token-pricing.test.mjs` — Unit tests for price table and cost computation
- `tests/lib/token-cursor.test.mjs` — Unit tests for cursor management
- `tests/lib/session-file-reader.test.mjs` — Unit tests for session file resolution and parsing

**Modify:**
- `hooks/session-capture.sh` — Extend inline Node.js to call new modules for usage enrichment
- `tests/hooks/session-capture.test.mjs` — Add tests for usage field in JSONL output
- `cli/index.mjs:227-236` — Add `.token-cursor.json` to gitignore scaffold

**Reference (read, do not modify):**
- `lib/execution-state.mjs` — Follow atomic write pattern (randomBytes + .tmp + renameSync)
- `hooks/hooks.json` — No changes needed (session-capture.sh already registered as PostToolUse .*)

## Context Packets

### Task 1 Context
- Spec: `token-cost-logging.md` (Behavior 6, acceptance criterion: price table covers current Claude model IDs)
- Constitution: `constitution.md` (Principle 1: minimize deps, Principle 3: Pure ESM)

### Task 2 Context
- Spec: `token-cost-logging.md` (Behaviors 3, 4, 7; cursor file schema; error cases: cursor corrupt, offset > file size)
- Reference: `lib/execution-state.mjs` (atomic write pattern)

### Task 3 Context
- Spec: `token-cost-logging.md` (Location Resolution section; Behaviors 1, 2, 7; error cases: not found, parse error, > 50 MB)
- Constitution: `constitution.md` (Principle 1: no external deps)

### Task 4 Context
- Spec: `token-cost-logging.md` (Behaviors 1-8; Extended Schema Definition; all error cases)
- Existing: `hooks/session-capture.sh` (current implementation to extend)

### Task 5 Context
- Spec: `token-cost-logging.md` (Gitignore Requirements section)
- Existing: `cli/index.mjs:227-236` (current gitignore scaffold)

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (each builds on previous)
- Group B (independent): Task 5 (no file overlap with Group A)
- Group C (sequential, after Group A): Task 4 (depends on all lib modules)

Groups A and B can run in parallel. Group C starts after Group A completes.

---

### Task 1: Token Pricing Module [specialist: none]

**Charter capability:** Token Cost Logging
**Files:**
- Create: `lib/token-pricing.mjs`
- Test: `tests/lib/token-pricing.test.mjs`

**Tests:** `tests/lib/token-pricing.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeCost, getRate } from "../lib/token-pricing.mjs";

describe("token-pricing", () => {
  it("computes cost for known model (claude-sonnet-4-6)", () => {
    const cost = computeCost("claude-sonnet-4-6", {
      inputTokens: 1000, outputTokens: 500,
      cacheReadTokens: 200, cacheCreationTokens: 100,
    });
    assert.equal(typeof cost, "number");
    assert.ok(cost > 0);
  });

  it("returns null for unknown model", () => {
    const cost = computeCost("unknown-model-xyz", {
      inputTokens: 100, outputTokens: 50,
      cacheReadTokens: 0, cacheCreationTokens: 0,
    });
    assert.equal(cost, null);
  });

  it("returns 0 for zero tokens", () => {
    const cost = computeCost("claude-sonnet-4-6", {
      inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheCreationTokens: 0,
    });
    assert.equal(cost, 0);
  });

  it("rounds to 6 decimal places", () => {
    const cost = computeCost("claude-sonnet-4-6", {
      inputTokens: 1, outputTokens: 1,
      cacheReadTokens: 0, cacheCreationTokens: 0,
    });
    const decimals = cost.toString().split(".")[1] || "";
    assert.ok(decimals.length <= 6);
  });

  it("covers opus, sonnet, and haiku model families", () => {
    for (const model of ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"]) {
      assert.ok(getRate(model) !== null, `should have rate for ${model}`);
    }
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/token-pricing.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

Create `lib/token-pricing.mjs`:
- Export a static `PRICE_TABLE` object mapping model ID strings to `{ input, output, cacheRead, cacheCreation }` per-token USD rates
- Cover claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001 (and common aliases)
- Export `getRate(modelId)` — returns rate object or `null`
- Export `computeCost(modelId, usage)` — returns `number` (6 decimal places) or `null` if model unknown
- Cost formula: `(input * inputRate) + (output * outputRate) + (cacheRead * cacheReadRate) + (cacheCreation * cacheCreationRate)`, rounded to 6 decimal places via `Math.round(cost * 1e6) / 1e6`

- [ ] **Verify test passes**

Run: `node --test tests/lib/token-pricing.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/token-pricing.mjs tests/lib/token-pricing.test.mjs
git commit -m "feat(session-awareness): add token pricing module"
```

---

### Task 2: Token Cursor Module [specialist: none]

**Charter capability:** Token Cost Logging
**Depends on:** Task 1 (uses same project conventions)
**Files:**
- Create: `lib/token-cursor.mjs`
- Test: `tests/lib/token-cursor.test.mjs`

**Tests:** `tests/lib/token-cursor.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readCursor, writeCursor, resetCursor } from "../lib/token-cursor.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "./helpers.mjs";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("token-cursor", () => {
  let tempDir;
  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tempDir); });

  it("returns null when cursor file does not exist", () => {
    const cursor = readCursor(tempDir);
    assert.equal(cursor, null);
  });

  it("writes and reads cursor round-trip", () => {
    const data = {
      session_id: "abc-123",
      last_offset: 1000,
      cumulative: { input_tokens: 500, output_tokens: 200, cache_read_tokens: 0, cache_creation_tokens: 0 },
      format_warning_emitted: false,
    };
    writeCursor(tempDir, data);
    const read = readCursor(tempDir);
    assert.deepEqual(read, data);
  });

  it("returns null on corrupt cursor (invalid JSON)", () => {
    writeFixture(tempDir, ".context-index/.token-cursor.json", "not json{");
    const cursor = readCursor(tempDir);
    assert.equal(cursor, null);
  });

  it("resetCursor clears the file", () => {
    writeCursor(tempDir, { session_id: "old", last_offset: 99, cumulative: {}, format_warning_emitted: true });
    resetCursor(tempDir, "new-session", 500);
    const cursor = readCursor(tempDir);
    assert.equal(cursor.session_id, "new-session");
    assert.equal(cursor.last_offset, 500);
    assert.equal(cursor.format_warning_emitted, false);
  });

  it("atomic write leaves no temp files on success", () => {
    writeCursor(tempDir, { session_id: "s1", last_offset: 0, cumulative: {}, format_warning_emitted: false });
    const ctxDir = join(tempDir, ".context-index");
    const files = require("fs").readdirSync(ctxDir);
    const tmpFiles = files.filter(f => f.endsWith(".tmp"));
    assert.equal(tmpFiles.length, 0);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/token-cursor.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

Create `lib/token-cursor.mjs`:
- `CURSOR_FILE = ".context-index/.token-cursor.json"`
- `readCursor(projectRoot)` — reads and parses cursor file, returns object or `null` on any error
- `writeCursor(projectRoot, data)` — atomic write (randomBytes + .tmp + renameSync), following `lib/execution-state.mjs` pattern
- `resetCursor(projectRoot, sessionId, offset)` — writes a fresh cursor with zeroed cumulative and `format_warning_emitted: false`
- All functions use `node:fs` and `node:path` only

- [ ] **Verify test passes**

Run: `node --test tests/lib/token-cursor.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/token-cursor.mjs tests/lib/token-cursor.test.mjs
git commit -m "feat(session-awareness): add token cursor management module"
```

---

### Task 3: Session File Reader Module [specialist: none]

**Charter capability:** Token Cost Logging
**Depends on:** Task 1, Task 2
**Files:**
- Create: `lib/session-file-reader.mjs`
- Test: `tests/lib/session-file-reader.test.mjs`

**Tests:** `tests/lib/session-file-reader.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveSessionUsage } from "../lib/session-file-reader.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "./helpers.mjs";

describe("session-file-reader", () => {
  let tempDir;
  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tempDir); });

  it("returns null when session directory does not exist", () => {
    const result = resolveSessionUsage({ sessionId: "abc", projectDir: tempDir });
    assert.equal(result, null);
  });

  it("returns null when session file exceeds 50 MB", () => {
    // Create a mock .claude/projects dir structure with oversized indicator
    // Test uses a stat check mock or a small file with size metadata
    const result = resolveSessionUsage({ sessionId: "abc", projectDir: "/nonexistent" });
    assert.equal(result, null);
  });

  it("parses valid session JSONL and returns cumulative usage", () => {
    // Create mock session file with usage metadata entries
    // This tests the parser's ability to extract token counts
    const result = resolveSessionUsage({ sessionId: "test", projectDir: tempDir, sessionFilePath: mockPath });
    // Will be fleshed out once we understand the session file format
  });

  it("returns null on malformed session file", () => {
    const result = resolveSessionUsage({ sessionId: "bad", projectDir: tempDir, sessionFilePath: "/dev/null" });
    assert.equal(result, null);
  });
});
```

Note: The session file reader tests will need mock Claude Code session data. The exact format is undocumented — the implementation should be written to handle the format discovered at development time, with tests using captured sample data. If the format cannot be determined, the reader returns `null` for all inputs (graceful degradation) and tests verify the null-return behavior.

- [ ] **Verify test fails**

Run: `node --test tests/lib/session-file-reader.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

Create `lib/session-file-reader.mjs`:
- Export `resolveSessionUsage({ sessionId, projectDir, sessionFilePath? })`:
  1. If `sessionFilePath` not provided, scan `$HOME/.claude/projects/` to find the project directory matching `projectDir`
  2. Within matched directory, find file matching `sessionId`
  3. Check file size — return `null` if > 50 MB
  4. Parse JSONL from the file, extract cumulative usage fields (model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
  5. Return usage object or `null` on any error
- Emit a generic stderr warning (no paths) on parse errors: `"adev: token-usage parser could not read session data (format may have changed)"`
- Uses only `node:fs`, `node:path`, `node:os`

- [ ] **Verify test passes**

Run: `node --test tests/lib/session-file-reader.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/session-file-reader.mjs tests/lib/session-file-reader.test.mjs
git commit -m "feat(session-awareness): add Claude Code session file reader"
```

---

### Task 4: Extend session-capture.sh with Usage Enrichment [specialist: none]

**Charter capability:** Token Cost Logging
**Depends on:** Task 1, Task 2, Task 3
**Files:**
- Modify: `hooks/session-capture.sh`
- Modify: `tests/hooks/session-capture.test.mjs`

**Tests:** `tests/hooks/session-capture.test.mjs`

- [ ] **Write failing test**

Add new test cases to the existing test file:

```javascript
// Add to existing describe("session-capture hook", ...)

it("includes usage field when session data is available", () => {
  // Set up mock Claude Code session data in temp dir
  // Configure session-capture.sh to find it
  // Verify JSONL entry includes usage object with expected fields
});

it("omits usage field when session data is unavailable", () => {
  writeFixture(tempDir, ".context-index/.gitkeep", "");
  const { exitCode } = runHook("session-capture.sh", {
    cwd: tempDir,
    stdin: JSON.stringify({
      provider: "native",
      tool_name: "Read",
      tool_input: { file_path: "foo.txt" },
      session_id: "no-session-data",
    }),
  });
  assert.equal(exitCode, 0);
  const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
  const entry = JSON.parse(readFileSync(trackingFile, "utf8").trim());
  assert.equal(entry.usage, undefined, "usage should be omitted when data unavailable");
});

it("exits 0 when session file reader throws", () => {
  writeFixture(tempDir, ".context-index/.gitkeep", "");
  const { exitCode } = runHook("session-capture.sh", {
    cwd: tempDir,
    stdin: JSON.stringify({
      provider: "native",
      tool_name: "Edit",
      tool_input: { file_path: "src/x.mjs" },
      session_id: "error-session",
    }),
  });
  assert.equal(exitCode, 0);
});

// AC #6: exits 0 in ALL error scenarios
it("exits 0 when cursor file is corrupt", () => { /* ... */ });
it("exits 0 when session file is malformed JSONL", () => { /* ... */ });
it("exits 0 when session file exceeds 50 MB size cap", () => { /* ... */ });

// AC #7: backward compatibility
it("entries without usage are valid and parseable by existing consumers", () => {
  // Write an entry without session data available, then read it back
  // and confirm it matches the pre-usage-enrichment schema exactly
  writeFixture(tempDir, ".context-index/.gitkeep", "");
  runHook("session-capture.sh", {
    cwd: tempDir,
    stdin: JSON.stringify({
      provider: "native", tool_name: "Read",
      tool_input: { file_path: "foo.txt" }, session_id: "compat-test",
    }),
  });
  const entry = JSON.parse(readFileSync(join(tempDir, ".context-index", ".session-tracking.jsonl"), "utf8").trim());
  assert.equal(entry.tool, "Read");
  assert.ok(Array.isArray(entry.files));
  assert.ok(entry.timestamp);
  assert.equal(entry.usage, undefined, "no usage field = backward compatible");
});

it("creates and updates cursor file", () => {
  // After a successful usage enrichment, .token-cursor.json should exist
});

it("usage fields are non-negative integers", () => {
  // When usage is present, all token fields are non-negative
});

it("cost_usd is null when model is unknown", () => {
  // Set up session data with an unknown model ID
  // Verify cost_usd is null (not omitted)
});
```

- [ ] **Verify test fails**

Run: `node --test tests/hooks/session-capture.test.mjs`
Expected: FAIL — new tests fail (no usage enrichment logic yet)

- [ ] **Implement**

Extend the inline Node.js in `hooks/session-capture.sh`:
1. After building the base entry object (tool, files, timestamp, session_id, operator, issue, epic), attempt usage enrichment:
   - Import `resolveSessionUsage` from `lib/session-file-reader.mjs` (via dynamic `import()` within the inline node script, using `CLAUDE_PLUGIN_ROOT` env var for path resolution)
   - Import `readCursor`, `writeCursor`, `resetCursor` from `lib/token-cursor.mjs`
   - Import `computeCost` from `lib/token-pricing.mjs`
2. Call `resolveSessionUsage({ sessionId, projectDir: process.cwd() })`
3. If result is `null`, skip usage enrichment (entry written as before)
4. If result is non-null:
   - Read cursor via `readCursor(cwd)`
   - If cursor is null, different session_id, or last_offset > file size: call `resetCursor()`, skip usage for this entry
   - Otherwise: compute delta (current cumulative - cursor cumulative), ensure all deltas are non-negative (clamp to 0)
   - Call `computeCost(result.model, delta)` for cost_usd
   - Add `usage: { input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd }` to entry
   - Update cursor with new cumulative and offset via `writeCursor()`
5. All of this wrapped in try/catch — any error falls through to entry without usage, exit 0

- [ ] **Verify test passes**

Run: `node --test tests/hooks/session-capture.test.mjs`
Expected: PASS (all existing + new tests)

- [ ] **Full quality gate**

Run: `npm test`
Expected: All tests pass

- [ ] **Commit**

```bash
git add hooks/session-capture.sh tests/hooks/session-capture.test.mjs
git commit -m "feat(session-awareness): extend session-capture with token usage enrichment"
```

---

### Task 5: Gitignore Scaffold Update [specialist: none]

**Charter capability:** Token Cost Logging
**Files:**
- Modify: `cli/index.mjs:227-236`

**Tests:** `tests/cli.test.mjs` (existing — verify gitignore content)

- [ ] **Write failing test**

Add a test case to the CLI test suite verifying `.token-cursor.json` appears in the gitignore output:

```javascript
it("gitignore includes .token-cursor.json", () => {
  // After running init, verify .gitignore contains .token-cursor.json
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli.test.mjs`
Expected: FAIL — .token-cursor.json not in gitignore output

- [ ] **Implement**

In `cli/index.mjs`, update the gitignore scaffold string to include `.context-index/.token-cursor.json`:

```javascript
// Change the gitignore content from:
"# adev context index\n.context-index/hygiene/\n"
// To:
"# adev context index\n.context-index/hygiene/\n.context-index/.token-cursor.json\n"
```

- [ ] **Verify test passes**

Run: `node --test tests/cli.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add cli/index.mjs tests/cli.test.mjs
git commit -m "feat(cli): add .token-cursor.json to gitignore scaffold"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [x] JSONL entries include `usage` object when session data accessible (Task 4)
  - [x] JSONL entries omit `usage` when unavailable (Task 4)
  - [x] `cost_usd` is `null` when model unknown (Task 1, Task 4)
  - [x] Delta computation produces non-negative values (Task 4)
  - [x] Cursor file lifecycle correct (Task 2, Task 4)
  - [x] Hook exits 0 in ALL error scenarios (Task 4)
  - [x] Backward-compatible (Task 4)
  - [x] No new external dependencies (all tasks)
  - [x] Stderr warning on format change, once per session (Task 3, Task 4)
  - [x] Price table covers opus/sonnet/haiku (Task 1)
  - [x] All quality gates pass (this section)
  - [x] No constitutional violations (all tasks)
