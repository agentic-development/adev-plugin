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
