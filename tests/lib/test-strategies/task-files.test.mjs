import { test } from "node:test";
import assert from "node:assert/strict";
import { readTaskFiles } from "../../../lib/test-strategies/task-files.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../../helpers.mjs";

const PLAN = `
## Context Packets

### Task 1 Context
- Source files: \`src/foo.ts\`

## Task Structure

### Task 1: Context-pack library [specialist: none]
**Files:**
- Create: \`src/foo.ts\`
- Modify: \`src/bar.ts:12-20\`
- Test: \`tests/foo.test.ts\`

**Tests:** \`tests/foo.test.ts\`

### Task 2: Prototype Context Reception [specialist: none]
**Files:** \`src/baz.ts\` (no source changes), \`--dry-run\`, \`_acquireLock\`

### Task 9b: Suffixed heading [specialist: none]
**Files:**
- Create: \`src/suffixed.ts\`
`;

test("resolves t1 to the task-body region, not the preceding context packet", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, "plan.md", PLAN);
    const { targetPaths, available } = await readTaskFiles(`${dir}/plan.md`, "t1");
    assert.ok(targetPaths.includes("src/foo.ts"));
    assert.ok(targetPaths.includes("src/bar.ts")); // line range stripped
    assert.ok(targetPaths.includes("tests/foo.test.ts")); // Test: + Tests: field included
    assert.ok(available);
  } finally {
    await cleanupTempDir(dir);
  }
});

test("a task-body heading whose title contains the word Context still opens its region", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, "plan.md", PLAN);
    const { targetPaths } = await readTaskFiles(`${dir}/plan.md`, "t2");
    assert.ok(targetPaths.includes("src/baz.ts"));
    assert.ok(!targetPaths.some((p) => p.includes("dry-run")));
    assert.ok(!targetPaths.some((p) => p.includes("acquireLock")));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("a suffixed heading (Task 9b) resolves to no region and degrades visibly", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, "plan.md", PLAN);
    const { targetPaths, available } = await readTaskFiles(`${dir}/plan.md`, "t9b");
    assert.deepEqual(targetPaths, []);
    assert.equal(available, false);
  } finally {
    await cleanupTempDir(dir);
  }
});

test("a task whose parse yields zero paths degrades to available:false without throwing", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, "plan.md", "## Task Structure\n\n### Task 3: Prose only [specialist: none]\nNo files declared, just prose.\n");
    const { targetPaths, available } = await readTaskFiles(`${dir}/plan.md`, "t3");
    assert.deepEqual(targetPaths, []);
    assert.equal(available, false);
  } finally {
    await cleanupTempDir(dir);
  }
});

const FIELD_SCOPING_PLAN = `
## Task Structure

### Task 4: Field-scoping regression [specialist: none]
**Files:**
- Create: \`lib/real/path.mjs\`

**Tests:** \`tests/real/path.test.mjs\`

**Context to load:**
- \`lib/test-strategies/assignment.mjs:23-95\` (chain/warnings/source shape to mirror)
- See docs/notes on a/b handling for background
`;

test("token extraction is scoped to the Files: block and Tests: field, not the whole task region", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, "plan.md", FIELD_SCOPING_PLAN);
    const { targetPaths, available } = await readTaskFiles(`${dir}/plan.md`, "t4");
    assert.ok(targetPaths.includes("lib/real/path.mjs"));
    assert.ok(targetPaths.includes("tests/real/path.test.mjs"));
    // Nothing from the Context to load section should leak in — neither the
    // legitimate-looking path nor the garbage parenthetical token.
    assert.ok(!targetPaths.includes("lib/test-strategies/assignment.mjs"));
    assert.ok(!targetPaths.some((p) => p.includes("chain/warnings/source")));
    assert.ok(!targetPaths.some((p) => p.includes("a/b")));
    assert.ok(available);
  } finally {
    await cleanupTempDir(dir);
  }
});

test("prose-only task region containing a slash outside Files:/Tests: still degrades to available:false", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(
      dir,
      "plan.md",
      "## Task Structure\n\n### Task 7: Prose only [specialist: none]\n**Context to load:**\n- notes on chain/warnings/source handling, no real block here.\n",
    );
    const { targetPaths, available } = await readTaskFiles(`${dir}/plan.md`, "t7");
    assert.deepEqual(targetPaths, []);
    assert.equal(available, false);
  } finally {
    await cleanupTempDir(dir);
  }
});

const FENCED_HEADING_PLAN = `
## Task Structure

### Task 5: Fenced heading regression [specialist: none]
**Context to load:**
- some notes

- [ ] Write failing test

\`\`\`javascript
// example fixture literal embedded in this task's own body
### Task 1: Context-pack library [specialist: none]
some fixture body content, not a real Files block
\`\`\`

**Files:**
- Create: \`lib/real/after-fence.mjs\`

**Tests:** \`tests/real/after-fence.test.mjs\`

### Task 6: Next task [specialist: none]
**Files:**
- Create: \`lib/task6.mjs\`
`;

test("a heading-shaped line inside a fenced code block does not prematurely close the task region", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, "plan.md", FENCED_HEADING_PLAN);
    const { targetPaths, available } = await readTaskFiles(`${dir}/plan.md`, "t5");
    assert.ok(targetPaths.includes("lib/real/after-fence.mjs"));
    assert.ok(targetPaths.includes("tests/real/after-fence.test.mjs"));
    assert.ok(!targetPaths.includes("lib/task6.mjs")); // belongs to Task 6, region must not overrun
    assert.ok(available);
  } finally {
    await cleanupTempDir(dir);
  }
});
