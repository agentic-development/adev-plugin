<!-- DO NOT EDIT statuses inline — see lifecycle log test-migration.jsonl -->
# Implementation Plan: Test Migration

> **Methodology:** adev
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/test-migration.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-12)
> **Platform:** Node.js (ESM `.mjs`), `node:test`, `node:assert`. No external test dependencies.

**Goal:** Migrate adev's own test surface from legacy markdown/YAML format assertions to JSON/JSONL assertions, and replace markdown column-variant tests with schema-version tests keyed off the JSON `version` field.

**Architecture:** All work is in `tests/` (and one tiny production-code touch in `lib/issues/json-adapter.mjs` to export a constant the new tests assert against). No new dependencies. The schema-version mechanism is already implemented in `lib/issues/json-adapter.mjs` (`UNSUPPORTED_BOARD_VERSION`, `version: 2` write/read tolerance) — the plan adds the test coverage that documents and protects it, plus an architectural guard against regression to column-count idioms.

**Review-warning resolutions:**
- **SA-2** resolved by Task 1 (export `UNSUPPORTED_VERSION_FALLBACK`) + Task 2 (tests assert via imported constant).
- **SA-3** resolved by Task 2's unknown-top-level-key round-trip case.
- **CON-1** addressed by Task 2's documentation of the `version: 3` → `version: 2` downgrade-on-write behavior; if the test reveals an actual round-trip-loss, file a follow-up issue against `json-issue-board-adapter.spec.md`.
- **CON-2** resolved by tasks referencing tests by `describe`/`it` name, never line numbers.

---

## File Structure

**Create:**
- `tests/lib/issues/json-adapter.schema-version.test.mjs` — Schema-version test surface (happy path, forward-compat, rejection variants)
- `tests/architectural-legacy-format-fixtures.test.mjs` — Architectural guard: no markdown/YAML shape assertions outside allowed paths; no `1[234]-column` idioms outside the sunset block

**Modify:**
- `lib/issues/json-adapter.mjs:58` — Export the existing `UNSUPPORTED_VERSION_FALLBACK` constant so tests can import it
- `tests/lib/issues/markdown-parser.test.mjs` — Wrap the three column-variant tests in a `describe("legacy-read regression (markdown adapter sunset)")` block with sunset comment; assertions stay; no test deletions

**Reference (read, do not modify):**
- `.context-index/specs/features/agent-reliable-state-artifacts/test-migration.spec.md` — Source spec
- `.context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md` — Canonical schema-version contract
- `lib/issues/json-adapter.mjs` (already-implemented schema-version mechanism at lines 210-246)
- `tests/architectural-execution-state.test.mjs`, `tests/architectural-milestones.test.mjs`, `tests/architectural-render-markdown.test.mjs` — Pattern reference for new architectural test

---

## Context Packets

### Task 1 Context
- Spec: `test-migration.spec.md` (Behaviors row 4; Error Cases row 2; Acceptance Criteria #2)
- Source file: `lib/issues/json-adapter.mjs:55-60` (full read of the constant block)
- No tests needed; export-only change validated by Task 2 importing it

### Task 2 Context
- Spec: `test-migration.spec.md` (Behaviors rows 2-4; Acceptance Criteria #2, #3; Error Cases rows 1-3)
- Sibling spec: `json-issue-board-adapter.spec.md` lines 112, 117, 137-138, 151, 174-175 (read in full)
- Source file: `lib/issues/json-adapter.mjs` lines 200-280 (the `_read` / `_write` and version-check paths)
- Test pattern: `tests/lib/issues/json-adapter.test.mjs` (existing patterns for `_read`/`_write` test setup)

### Task 3 Context
- Spec: `test-migration.spec.md` (Naming Conventions; Behaviors row 1; Acceptance Criteria #1)
- Source file: `tests/lib/issues/markdown-parser.test.mjs` (full read)
- Reference: Charter `agent-reliable-state-artifacts/charter.md` lines 51-60 (Out of Scope: markdown adapter retirement timeline)

### Task 4 Context
- Spec: `test-migration.spec.md` (Behaviors row 5; Acceptance Criteria #4; Error Cases row 4)
- Pattern reference: `tests/architectural-execution-state.test.mjs` (full read — same architectural test idiom)
- Files this test will scan: `tests/`, `lib/`

### Task 5 Context
- Spec: `test-migration.spec.md` (Behaviors row 6; Postconditions bullets 4-5; Acceptance Criteria #5; Error Cases row 5)
- Files this test will scan: `tests/lib/` recursively
- Allowed paths (carve-outs): `tests/lib/migrate-state-artifacts.*`, `tests/evals/`
- Read references: `tests/lib/migrate-state-artifacts.test.mjs` (to confirm the carve-out catches its fixtures)

### Task 6 Context
- Spec: `test-migration.spec.md` (CON-6 carve-out: read-tolerance tests for legacy `planRef`+`planTask` issues remain allowed under `tests/lib/issues/*`)
- Source file: `tests/lib/issues/json-adapter.test.mjs` (verify no existing test needs migration; if so, document as part of this task)

---

## Parallelization

- **Group A (sequential):** Task 1 → Task 2 (Task 2 imports the constant exported in Task 1)
- **Group B (independent):** Task 3 (touches only `tests/lib/issues/markdown-parser.test.mjs`)
- **Group C (sequential):** Task 4 → Task 5 (both touch `tests/architectural-legacy-format-fixtures.test.mjs`; Task 5 reuses helpers Task 4 declares)
- **Group D (sequential after A):** Task 6 (verifies Task 2's tests do not regress the legacy `planRef`+`planTask` read-tolerance)

Groups A, B, C can run in parallel. Group D must follow Group A.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Export `UNSUPPORTED_VERSION_FALLBACK` constant | small | unit | — | 0 create, 1 modify |
| 2 | Schema-version test suite for JsonAdapter | medium | unit | Task 1 | 1 create, 0 modify |
| 3 | Collapse markdown-parser column-variant tests under sunset block | small | unit | — | 0 create, 1 modify |
| 4 | Architectural test: no `1[234]-column` outside sunset block | small | unit | Task 3 | 1 create, 0 modify |
| 5 | Legacy-fixture-leak inventory test | medium | unit | Task 4 | 0 create, 1 modify |
| 6 | Confirm legacy planRef+planTask read-tolerance is preserved | small | unit | Task 2 | 0 create, 1 modify (if gap found) |

---

## Task Structure

### Task 1: Export `UNSUPPORTED_VERSION_FALLBACK` constant [specialist: none]

**Charter capability:** Test migration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/issues/json-adapter.mjs:58` (add `export ` prefix to the existing constant declaration)
- Test: `tests/lib/issues/json-adapter.schema-version.test.mjs` (the importing test is authored in Task 2)

**Tests:** Task 2's `tests/lib/issues/json-adapter.schema-version.test.mjs` imports this constant; if the import fails, Task 2's test file fails to load. That is the test for this task.

**Context to load:** `lib/issues/json-adapter.mjs:55-60` (the constant block).

- [x] **Write failing test** — Deferred to Task 2. This task is enabling work; the test is the import statement in Task 2's new file.

- [x] **Verify test fails** — N/A for this task individually; will be verified when Task 2's test file is authored and the import line is added before the constant is exported.

- [x] **Implement**

```javascript
// lib/issues/json-adapter.mjs:58
export const UNSUPPORTED_VERSION_FALLBACK =
  "tasks.json version field is not a valid integer >= 2. Run `adev migrate` to upgrade.";
```

(Single edit: prepend `export ` to the existing `const` declaration on line 58.)

- [x] **Verify** — Run `npm test`. All existing tests must continue to pass (export does not change runtime behavior).

- [x] **Commit**

Branch: `feat/agent-reliable-state-artifacts/test-migration`

```bash
git add lib/issues/json-adapter.mjs
git commit -m "feat(agent-reliable-state-artifacts): export UNSUPPORTED_VERSION_FALLBACK constant

Spec: .context-index/specs/features/agent-reliable-state-artifacts/test-migration.spec.md
Plan-task: 1"
```

---

### Task 2: Schema-version test suite for JsonAdapter [specialist: none]

**Charter capability:** Test migration
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/lib/issues/json-adapter.schema-version.test.mjs`
- Test: itself (this task authors its own test file)

**Tests:** `tests/lib/issues/json-adapter.schema-version.test.mjs`

**Context to load:**
- `.context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md` (lines 112, 117, 137-138, 151, 174-175)
- `lib/issues/json-adapter.mjs` lines 200-280 (the version-check paths)
- `tests/lib/issues/json-adapter.test.mjs` (test setup pattern: temp dir, manifest fixture, adapter instantiation)

- [x] **Write failing test**

Create the file with these `describe`/`it` blocks (named, not line-numbered):

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonAdapter, UNSUPPORTED_VERSION_FALLBACK } from "../../../lib/issues/json-adapter.mjs";

function setupBoard(t, boardContent) {
  const storageRoot = mkdtempSync(join(tmpdir(), "json-adapter-schema-version-"));
  t.after(() => rmSync(storageRoot, { recursive: true, force: true }));
  mkdirSync(join(storageRoot, ".context-index/tasks"), { recursive: true });
  writeFileSync(
    join(storageRoot, ".context-index/tasks/tasks.json"),
    JSON.stringify(boardContent, null, 2),
  );
  writeFileSync(join(storageRoot, ".context-index/manifest.yaml"), "tasks:\n  backend: json\n");
  return { adapter: new JsonAdapter(storageRoot), storageRoot };
}

describe("JsonAdapter — schema version", () => {
  it("reads version: 2 happy path", async (t) => {
    const { adapter } = setupBoard(t, { version: 2, epics: [], issues: [] });
    assert.deepEqual(await adapter.listEpics(), []);
    assert.deepEqual(await adapter.list(), []);
  });

  it("reads version: 3 forward-compat: preserves unknown fields on epics and issues; DROPS unknown top-level keys on write", async (t) => {
    // SA-3 / CON-1: cover unknown fields on epics, issues, AND top-level.
    // Behavior verified against lib/issues/json-adapter.mjs:_write (line 316):
    // _write reconstructs { version: 2, epics, issues } only — top-level unknown keys are dropped.
    const original = {
      version: 3,
      epics: [{ id: "epic-1", title: "E", status: "open", futureField: "epicX" }],
      issues: [{ id: "issue-1", title: "I", status: "open", priority: 2, type: "task", futureField: "issueX" }],
      futureTopLevel: { schema: "v3-metadata" },
    };
    const { adapter, storageRoot } = setupBoard(t, original);

    const epics = await adapter.listEpics();
    const issues = await adapter.list();
    assert.equal(epics[0].futureField, "epicX", "unknown epic field read");
    assert.equal(issues[0].futureField, "issueX", "unknown issue field read");

    await adapter.update("issue-1", { title: "I2" });
    const reread = JSON.parse(
      readFileSync(join(storageRoot, ".context-index/tasks/tasks.json"), "utf8"),
    );
    assert.equal(reread.version, 2, "writers always emit version: 2");
    assert.equal(reread.epics[0].futureField, "epicX", "unknown epic field preserved on round-trip");
    assert.equal(reread.issues[0].futureField, "issueX", "unknown issue field preserved on round-trip");
    // SA-3: assert the deterministic dropped-on-write behavior. This is a CON-1 contract gap
    // recorded as a follow-up against json-issue-board-adapter.spec.md.
    assert.equal(reread.futureTopLevel, undefined, "top-level unknown keys are dropped on write (documented contract gap)");
  });

  it("rejects version: 1 with UNSUPPORTED_BOARD_VERSION", async (t) => {
    const { adapter } = setupBoard(t, { version: 1, epics: [], issues: [] });
    await assert.rejects(() => adapter.list(), { code: "UNSUPPORTED_BOARD_VERSION" });
  });

  it("rejects version: 0 with UNSUPPORTED_BOARD_VERSION", async (t) => {
    const { adapter } = setupBoard(t, { version: 0, epics: [], issues: [] });
    await assert.rejects(() => adapter.list(), { code: "UNSUPPORTED_BOARD_VERSION" });
  });

  it("rejects non-numeric version using the canonical fixed-string fallback (SA-2 / SEC-4)", async (t) => {
    const { adapter } = setupBoard(t, { version: "v2", epics: [], issues: [] });
    await assert.rejects(() => adapter.list(), (err) => {
      assert.equal(err.code, "UNSUPPORTED_BOARD_VERSION");
      assert.equal(err.message, UNSUPPORTED_VERSION_FALLBACK, "fallback constant is used verbatim");
      assert.ok(!err.message.includes("v2"), "raw value must not be interpolated (SEC-4)");
      return true;
    });
  });
});
```

- [x] **Verify test fails** — Run `node --test tests/lib/issues/json-adapter.schema-version.test.mjs`. Expected: the file loads (Task 1's export succeeded). All 5 tests should PASS immediately because the JsonAdapter already implements this behavior; the test surface is what's missing, not the implementation. **If any test fails, that is the actual signal — the spec's claims about the existing mechanism are wrong.** Do not proceed; investigate and report. The "RED" phase for this task is "tests do not exist yet"; the failing condition is the absence of the file.

- [x] **Verify test passes** — Run `node --test tests/lib/issues/json-adapter.schema-version.test.mjs`. Expected: 5 PASS.

- [x] **Commit**

```bash
git add tests/lib/issues/json-adapter.schema-version.test.mjs
git commit -m "test(agent-reliable-state-artifacts): schema-version test suite for JsonAdapter

Spec: .context-index/specs/features/agent-reliable-state-artifacts/test-migration.spec.md
Plan-task: 2"
```

---

### Task 3: Collapse markdown-parser column-variant tests under sunset block [specialist: none]

**Charter capability:** Test migration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/lib/issues/markdown-parser.test.mjs` — wrap the three `it("parses a canonical 14-column...")`, `it("parses a legacy 13-column...")`, `it("parses a legacy 12-column...")` tests in a single `describe("legacy-read regression (markdown adapter sunset)")` block

**Tests:** Same file. Tests still pass after restructure (test bodies unchanged).

**Context to load:** `tests/lib/issues/markdown-parser.test.mjs` (full read); charter line 59 (markdown adapter removal timeline).

- [x] **Write failing test** — Not applicable; this is a restructure of existing passing tests. No new assertions.

- [x] **Verify** — Run `node --test tests/lib/issues/markdown-parser.test.mjs` before and after the restructure. Output must be identical (same 3 tests pass).

- [x] **Implement**

Wrap the three named tests (`"parses a canonical 14-column issue row"`, `"parses a legacy 13-column issue row (no spec_ref)"`, `"parses a legacy 12-column issue row (no spec_ref, no next_action)"`) in:

```javascript
describe("legacy-read regression (markdown adapter sunset)", () => {
  // Sunset: delete this block (and the column-variant fixtures) in the same PR that
  // removes tasks.backend: "file" from lib/issues/registry.mjs. See:
  // .context-index/specs/features/agent-reliable-state-artifacts/charter.md line 59
  // (Markdown `backend: file` removal — one-release-cycle deprecation window).

  it("parses a canonical 14-column issue row", () => { /* unchanged */ });
  it("parses a legacy 13-column issue row (no spec_ref)", () => { /* unchanged */ });
  it("parses a legacy 12-column issue row (no spec_ref, no next_action)", () => { /* unchanged */ });
});
```

- [x] **Verify test passes** — `node --test tests/lib/issues/markdown-parser.test.mjs`. 3 PASS, identical to pre-restructure.

- [x] **Commit**

```bash
git add tests/lib/issues/markdown-parser.test.mjs
git commit -m "test(agent-reliable-state-artifacts): nest column-variant tests under sunset describe block

Spec: .context-index/specs/features/agent-reliable-state-artifacts/test-migration.spec.md
Plan-task: 3"
```

---

### Task 4: Architectural test — no `1[234]-column` outside sunset block [specialist: none]

**Charter capability:** Test migration
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Create: `tests/architectural-legacy-format-fixtures.test.mjs`
- Test: itself

**Tests:** `tests/architectural-legacy-format-fixtures.test.mjs`

**Context to load:** `tests/architectural-execution-state.test.mjs` (pattern reference); `tests/architectural-milestones.test.mjs`.

- [x] **Write failing test**

Implement a scanner that walks `tests/` and `lib/`, ignores `node_modules`, `.git`, and `tests/lib/issues/markdown-parser.test.mjs` (the only allowed home for column-variant references), and asserts zero matches for `\b1[234]-column\b`.

```javascript
// Pattern reference: tests/architectural-execution-state.test.mjs (use its REPO_ROOT idiom).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SCAN_DIRS = ["tests", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);
const ALLOWED_FILES = new Set([
  "tests/lib/issues/markdown-parser.test.mjs", // sunset regression block
]);
const COLUMN_PATTERN = /\b1[234]-column\b/;

export function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) yield* walk(full);
    else if (stat.isFile() && (entry.endsWith(".mjs") || entry.endsWith(".js"))) yield full;
  }
}

export { REPO_ROOT };

describe("architectural — no legacy column-variant idioms outside sunset block", () => {
  it("no file under tests/ or lib/ matches /\\b1[234]-column\\b/ outside allowed files", () => {
    const violations = [];
    for (const scanDir of SCAN_DIRS) {
      for (const file of walk(join(REPO_ROOT, scanDir))) {
        const rel = relative(REPO_ROOT, file);
        if (ALLOWED_FILES.has(rel)) continue;
        const content = readFileSync(file, "utf8");
        if (COLUMN_PATTERN.test(content)) {
          violations.push(rel);
        }
      }
    }
    assert.deepEqual(violations, [], `Files with disallowed 1[234]-column references: ${violations.join(", ")}`);
  });
});
```

> Note: Before authoring, check whether `tests/helpers.mjs` already exports a recursive-walk helper. If yes, import it instead of redeclaring `walk()` (and remove the `export { walk }` here). Same applies to Task 5.

- [x] **Verify test fails** — Insert a temporary string `"// 14-column hack"` in any `lib/` file. Run `node --test tests/architectural-legacy-format-fixtures.test.mjs`. Expected: FAIL with that filename. Remove the temporary string.

- [x] **Verify test passes** — Run `node --test tests/architectural-legacy-format-fixtures.test.mjs`. Expected: PASS.

- [x] **Commit**

```bash
git add tests/architectural-legacy-format-fixtures.test.mjs
git commit -m "test(agent-reliable-state-artifacts): architectural guard against column-variant regression

Spec: .context-index/specs/features/agent-reliable-state-artifacts/test-migration.spec.md
Plan-task: 4"
```

---

### Task 5: Legacy-fixture-leak inventory test [specialist: none]

**Charter capability:** Test migration
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4 (uses the same file and shared helpers)
**Files:**
- Modify: `tests/architectural-legacy-format-fixtures.test.mjs` (created in Task 4) — append a second `describe` block to the SAME file. This makes shared helpers (`walk`, `REPO_ROOT`) available in-scope and avoids parallelization risk with Task 4.

**Tests:** Same file as Task 4. Two `describe` blocks total: column-variant guard (Task 4) and legacy-fixture-leak inventory (this task).

**Context to load:**
- Allowed paths: `tests/lib/migrate-state-artifacts.*`, `tests/evals/`, `tests/lib/issues/markdown-parser.test.mjs` (column-variant fixtures), `tests/architectural-legacy-format-fixtures.test.mjs` itself (this test names the legacy strings)
- Legacy strings to detect: `.execution-state.md`, `milestones.yaml`, `.context-index/build-state/` (pre-rename path)

- [x] **Write failing test**

```javascript
describe("architectural — no legacy storage-format assertions outside allowed paths", () => {
  const LEGACY_PATTERNS = [
    /\.execution-state\.md/,
    /milestones\.yaml/,
    /\.context-index\/build-state\//,
  ];
  const ALLOWED_DIR_PREFIXES = [
    "tests/lib/migrate-state-artifacts",
    "tests/evals/",
  ];
  const ALLOWED_FILES_SELF_REFERENCE = new Set([
    "tests/architectural-legacy-format-fixtures.test.mjs", // this file names the legacy strings in its patterns
    "tests/architectural-execution-state.test.mjs",
    "tests/architectural-milestones.test.mjs",
  ]);

  it("no file under tests/lib/ asserts against legacy markdown/YAML state artifact shapes", () => {
    const violations = [];
    for (const file of walk(join(REPO_ROOT, "tests/lib"))) {
      const rel = relative(REPO_ROOT, file);
      if (ALLOWED_DIR_PREFIXES.some((p) => rel.startsWith(p))) continue;
      if (ALLOWED_FILES_SELF_REFERENCE.has(rel)) continue;
      const content = readFileSync(file, "utf8");
      const hits = LEGACY_PATTERNS.filter((p) => p.test(content));
      if (hits.length > 0) {
        violations.push({ file: rel, patterns: hits.map((p) => p.source) });
      }
    }
    assert.deepEqual(violations, [], `Files with disallowed legacy-format references: ${JSON.stringify(violations, null, 2)}`);
  });
});
```

- [x] **Verify test fails** — Run the new test. If it fails on first run, that is the expected outcome — it has surfaced real legacy-fixture leaks. Each violation must be migrated (markdown shape → JSON shape, OR moved into an allowed path, OR added to the allow-list with a documented rationale). Iterate until the test passes.

- [x] **Verify test passes** — Run after all violations are addressed. Expected: PASS.

- [x] **Commit** — One commit for the test itself, separate commits for each batch of migrated fixtures (use `fix(<area>)` for fixture migrations).

```bash
git add tests/architectural-legacy-format-fixtures.test.mjs
git commit -m "test(agent-reliable-state-artifacts): legacy-fixture-leak inventory test

Spec: .context-index/specs/features/agent-reliable-state-artifacts/test-migration.spec.md
Plan-task: 5"
```

---

### Task 6: Confirm legacy `planRef`+`planTask` read-tolerance is preserved [specialist: none]

**Charter capability:** Test migration
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify (only if gap is found): `tests/lib/issues/json-adapter.test.mjs` to add a read-tolerance test for legacy issues carrying both `planRef` and `planTask`

**Tests:** Existing `tests/lib/issues/json-adapter.test.mjs` after the addition.

**Context to load:**
- Spec CON-6 carve-out
- `json-issue-board-adapter.spec.md` line 145 (CON-3 read-tolerance rule)
- `tests/lib/issues/json-adapter.test.mjs` (grep for "planTask" and "planRef" to see if a read-tolerance test already exists)

- [x] **Audit** — Grep `tests/lib/issues/json-adapter.test.mjs` for an existing test that exercises legacy in-board issues with both `planRef` and `planTask`. If one exists, no implementation work is needed — note the test name in the commit message and proceed to commit.

- [x] **If gap found, write failing test**

```javascript
describe("JsonAdapter — read-tolerance for legacy planRef+planTask issues (CON-3)", () => {
  it("returns issues with both planRef and planTask via list() without rejecting", async () => {
    // Pre-existing legacy issue authored before the granularity invariant
    const adapter = setupBoard({
      version: 2,
      epics: [],
      issues: [{
        id: "issue-legacy", title: "Legacy", status: "open", priority: 2, type: "task",
        planRef: "specs/features/foo/bar.plan.md", planTask: 3,
      }],
    });
    const issues = await adapter.list();
    assert.equal(issues.length, 1);
    assert.equal(issues[0].planRef, "specs/features/foo/bar.plan.md");
    assert.equal(issues[0].planTask, 3);
  });
});
```

- [x] **Verify test fails OR passes accordingly** — If the read-tolerance is already implemented (it should be per `json-issue-board-adapter.spec.md` line 145), the test passes immediately, which is the desired outcome.

- [x] **Commit**

```bash
git add tests/lib/issues/json-adapter.test.mjs
git commit -m "test(agent-reliable-state-artifacts): assert read-tolerance for legacy planRef+planTask issues

Spec: .context-index/specs/features/agent-reliable-state-artifacts/test-migration.spec.md
Plan-task: 6"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`).

- Tests pass: `npm test` (all existing tests + new tests)
- Architectural guard test passes: `node --test tests/architectural-legacy-format-fixtures.test.mjs`
- All acceptance criteria from `test-migration.spec.md` satisfied
- No new dependencies in `package.json`
- Spec frontmatter status → `validated`; charter Capability Map row → `validated`

---

## Follow-Up Obligations (not part of this plan; recorded for tracking)

1. **CON-1 contract clarification:** If Task 2's `version: 3` round-trip test reveals that top-level unknown keys are silently dropped, file a follow-up to revise `json-issue-board-adapter.spec.md` lines 112/117 to make the contract explicit (either "top-level unknown keys are preserved" or "top-level unknown keys are dropped — this is intentional"). Track as a revision to that spec, not as a change to this plan.

2. **Markdown adapter sunset coupling (SA-5):** Add a hook or test that fails when `tasks.backend: "file"` is removed from `SUPPORTED_BACKENDS` in `lib/issues/registry.mjs` *and* the sunset block in `tests/lib/issues/markdown-parser.test.mjs` still exists. Not part of this plan because the removal is a separate release-cycle event. Track as a charter-level follow-up.
