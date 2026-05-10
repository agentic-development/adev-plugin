# Implementation Plan: Session Log Schema

> **Methodology:** adev
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Spec:** .context-index/specs/features/session-awareness/session-log-schema.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-06)
> **Platform:** JavaScript ESM, Node.js, node:test

**Goal:** Align the existing `session-capture.sh` hook and its tests with the formalized JSONL schema, removing undocumented fields and tightening input validation.

**Architecture:** The session-capture hook already exists and is functional. This plan addresses three divergences between the implementation and the spec: (1) an undocumented `specs` field in JSONL output, (2) a missing `tool_name` that writes `"unknown"` instead of skipping the entry, and (3) missing `.gitignore` entry for the tracking file. All changes are within the hooks module boundary.

---

## File Structure

**Modify:**
- `hooks/session-capture.sh:44-49` — Remove `specs` field, add `tool_name` guard
- `tests/hooks/session-capture.test.mjs` — Update existing tests, add schema validation tests

**Reference (read, do not modify):**
- `.context-index/specs/features/session-awareness/session-log-schema.spec.md` — Schema contract
- `.context-index/samples/hook-sessionstart-session-start.md` — Hook pattern reference

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/session-awareness/session-log-schema.spec.md` (Schema Definition, Error Cases)
- Charter: `.context-index/specs/features/session-awareness/charter.md` (capability: Session Log Schema)
- Constitution: `.context-index/constitution.md` (Principle 4: Hook protocol compliance)

### Task 2 Context
- Spec: `.context-index/specs/features/session-awareness/session-log-schema.spec.md` (Acceptance Criteria, Field Constraints)
- Charter: `.context-index/specs/features/session-awareness/charter.md` (capability: Session Log Schema)

## Parallelization

- Group A (sequential): Task 1 → Task 2 (shared files)

---

### Task 1: Align session-capture.sh with schema [specialist: none]

**Charter capability:** Session Log Schema
**Files:**
- Modify: `hooks/session-capture.sh:44-49`
- Test: `tests/hooks/session-capture.test.mjs`

**Tests:** `tests/hooks/session-capture.test.mjs`

- [ ] **Write failing tests**

Add test: when `tool_name` is missing from stdin, the hook should NOT write an entry (exits 0 silently).

```javascript
it("does not write entry when tool_name is missing", () => {
  const { exitCode } = runHook("session-capture.sh", {
    cwd: tempDir,
    stdin: JSON.stringify({ provider: "native" }),
  });

  assert.equal(exitCode, 0);

  const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
  assert.ok(!existsSync(trackingFile), "should NOT write when tool_name missing");
});
```

Add test: JSONL entries should NOT contain a `specs` field.

```javascript
it("does not include specs field in JSONL output", () => {
  writeFixture(tempDir, ".context-index/.gitkeep", "");

  runHook("session-capture.sh", {
    cwd: tempDir,
    stdin: JSON.stringify({
      provider: "native",
      tool_name: "Read",
      tool_input: { file_path: "foo.txt" },
    }),
  });

  const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
  const entry = JSON.parse(readFileSync(trackingFile, "utf8").trim());
  assert.equal(entry.specs, undefined, "specs field should not be present");
});
```

Update existing test: "records tool_name as unknown when not provided" must be replaced with the new "does not write entry when tool_name is missing" test above (the old behavior wrote `tool: "unknown"`, the new behavior skips the write entirely).

- [ ] **Verify tests fail**

Run: `node --test tests/hooks/session-capture.test.mjs`
Expected: FAIL — first test fails because current code writes `tool: "unknown"` instead of skipping; second test fails because `specs` field exists.

- [ ] **Implement**

In `hooks/session-capture.sh`, modify the inline Node.js:

1. Add guard after extracting `toolName`: if `tool_name` is falsy (empty string, undefined, null), output `{}\n` to stdout and `return` without writing any entry. The guard condition is: `if (!toolName) { process.stdout.write("{}\n"); return; }`.
2. Remove the `specs: []` line from the entry object construction.

```javascript
const toolName = input.tool_name || "";
if (!toolName) {
  process.stdout.write("{}\n");
  return;
}

const entry = {
  tool: toolName,
  files: filePath ? [filePath] : [],
  timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
};
```

3. Update the existing test "records tool_name as unknown when not provided" — this test now expects no file written instead of `tool: "unknown"`.

- [ ] **Verify tests pass**

Run: `node --test tests/hooks/session-capture.test.mjs`
Expected: PASS — all tests including new ones

- [ ] **Commit**

Branch: `feat/session-awareness/execution-state-file` (current branch)

```bash
git add hooks/session-capture.sh tests/hooks/session-capture.test.mjs
git commit -m "fix(hooks): align session-capture with session-log-schema spec"
```

---

### Task 2: Add schema validation tests [specialist: none]

**Charter capability:** Session Log Schema
**Depends on:** Task 1
**Files:**
- Modify: `tests/hooks/session-capture.test.mjs`

**Tests:** `tests/hooks/session-capture.test.mjs`

- [ ] **Write confirmation tests** (these validate existing correct behavior after Task 1 — they are regression/confirmation tests, not red-green-refactor cycles, since the behaviors they test are already implemented correctly)

Add comprehensive schema validation tests. Also verify existing coverage for AC6 and AC7:
- AC6 (provider not native → no write): already covered by existing tests "exits 0 with empty JSON when provider=none" and "exits 0 with empty JSON when provider=entire" — verify they still pass.
- AC7 (file created on first write): already covered by existing test "creates .context-index directory if missing" — verify it still passes.

```javascript
it("timestamp is ISO 8601 UTC truncated to seconds", () => {
  writeFixture(tempDir, ".context-index/.gitkeep", "");
  runHook("session-capture.sh", {
    cwd: tempDir,
    stdin: JSON.stringify({
      provider: "native",
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
    }),
  });

  const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
  const entry = JSON.parse(readFileSync(trackingFile, "utf8").trim());
  // Verify ISO 8601 format with no milliseconds
  assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

it("session_id is omitted (not null) when not provided", () => {
  writeFixture(tempDir, ".context-index/.gitkeep", "");
  runHook("session-capture.sh", {
    cwd: tempDir,
    stdin: JSON.stringify({
      provider: "native",
      tool_name: "Read",
      tool_input: { file_path: "foo.txt" },
    }),
  });

  const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
  const entry = JSON.parse(readFileSync(trackingFile, "utf8").trim());
  assert.ok(!("session_id" in entry), "session_id should be omitted, not null");
});

it("files is always an array (empty when no file_path)", () => {
  writeFixture(tempDir, ".context-index/.gitkeep", "");
  runHook("session-capture.sh", {
    cwd: tempDir,
    stdin: JSON.stringify({
      provider: "native",
      tool_name: "Bash",
    }),
  });

  const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
  const entry = JSON.parse(readFileSync(trackingFile, "utf8").trim());
  assert.ok(Array.isArray(entry.files), "files should be an array");
  assert.equal(entry.files.length, 0);
});

it("each line is valid independent JSON", () => {
  writeFixture(tempDir, ".context-index/manifest.yaml", "provider: native\n");

  runHook("session-capture.sh", {
    cwd: tempDir,
    stdin: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "a.ts" } }),
  });
  runHook("session-capture.sh", {
    cwd: tempDir,
    stdin: JSON.stringify({ tool_name: "Read", tool_input: { file_path: "b.ts" } }),
  });

  const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
  const lines = readFileSync(trackingFile, "utf8").trim().split("\n");
  for (const line of lines) {
    const entry = JSON.parse(line); // should not throw
    assert.ok(entry.tool, "tool field required");
    assert.ok(Array.isArray(entry.files), "files field required");
    assert.ok(entry.timestamp, "timestamp field required");
  }
});
```

- [ ] **Verify all tests pass** (confirmation tests validate existing correct behavior — they should pass immediately after Task 1)

Run: `node --test tests/hooks/session-capture.test.mjs`
Expected: PASS — all existing + new tests

- [ ] **Run full quality gates**

Run: `npm test`
Expected: PASS — no regressions across the entire test suite

- [ ] **Commit**

```bash
git add tests/hooks/session-capture.test.mjs
git commit -m "test(hooks): add schema validation tests for session-log-schema"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied:
  - Each line in `.session-tracking.jsonl` is valid JSON matching the schema
  - `tool` field is always present and non-empty
  - `files` field is always present (empty array when no files)
  - `timestamp` is ISO 8601 UTC truncated to seconds
  - `session_id` is omitted (not null) when not available
  - Hook exits 0 and writes nothing when provider is not "native"
  - File is created on first write without header or preamble
  - Existing `session-capture.sh` implementation matches this schema (or is updated to match)
  - No new dependencies added
  - No constitutional violations introduced
