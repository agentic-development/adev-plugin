/**
 * Tests for lib/reality-check.mjs
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { execSync } from "node:child_process";
import {
  createTempDir,
  cleanupTempDir,
  writeFixture,
} from "../helpers.mjs";

import {
  verifySpecImplemented,
  verifyIssueCompleted,
  verifyCapabilityStatus,
  formatConfidenceNote,
  CONFIDENCE,
} from "../../lib/reality-check.mjs";

// ---------------------------------------------------------------------------
// Helper: create a temp git repo for tests that need git
// ---------------------------------------------------------------------------

function createTempGitDir() {
  const dir = createTempDir();
  execSync("git init -b main", { cwd: dir, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "ignore" });
  execSync("git config commit.gpgsign false", { cwd: dir, stdio: "ignore" });
  return dir;
}

// ---------------------------------------------------------------------------
// verifySpecImplemented
// ---------------------------------------------------------------------------

describe("verifySpecImplemented", () => {
  test("returns none confidence when spec file does not exist", () => {
    const result = verifySpecImplemented("/nonexistent/spec.md");
    assert.equal(result.implemented, false);
    assert.equal(result.confidence, CONFIDENCE.NONE);
  });

  test("returns low confidence when no plan and no source-manifest", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, "spec.spec.md", "---\nstatus: implemented\n---\n# Spec\n");
      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      assert.equal(result.implemented, false);
      assert.equal(result.confidence, CONFIDENCE.LOW);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("returns high confidence when plan files exist and are committed", () => {
    const tmp = createTempGitDir();
    try {
      writeFixture(tmp, "spec.spec.md", "---\nstatus: implemented\n---\n# Spec\n\nTests at tests/feature.test.mjs\n");
      writeFixture(tmp, "spec.plan.md", `# Plan

**Create:**
- lib/feature.mjs — the module
- tests/feature.test.mjs — tests

**Reference (read, do not modify):**
- README.md
`);
      writeFixture(tmp, "lib/feature.mjs", "export function hello() {}\n");
      writeFixture(tmp, "tests/feature.test.mjs", "import { test } from 'node:test';\ntest('pass', () => {});\n");

      // Commit all files
      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      assert.equal(result.confidence, CONFIDENCE.HIGH);
      assert.equal(result.implemented, true);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("returns medium confidence when files committed but no tests found", () => {
    const tmp = createTempGitDir();
    try {
      writeFixture(tmp, "spec.spec.md", "---\nstatus: implemented\n---\n# Spec\n");
      writeFixture(tmp, "spec.plan.md", `# Plan

**Create:**
- lib/feature.mjs — the module

**Reference (read, do not modify):**
- README.md
`);
      writeFixture(tmp, "lib/feature.mjs", "export function hello() {}\n");

      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      assert.equal(result.confidence, CONFIDENCE.MEDIUM);
      assert.equal(result.implemented, true);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("returns none confidence when plan files are missing from disk", () => {
    const tmp = createTempGitDir();
    try {
      writeFixture(tmp, "spec.spec.md", "---\nstatus: implemented\n---\n# Spec\n");
      writeFixture(tmp, "spec.plan.md", `# Plan

**Create:**
- lib/feature.mjs — the module
- lib/missing.mjs — does not exist

**Reference (read, do not modify):**
- README.md
`);
      writeFixture(tmp, "lib/feature.mjs", "export function hello() {}\n");
      // lib/missing.mjs intentionally NOT created

      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      assert.equal(result.confidence, CONFIDENCE.NONE);
      assert.equal(result.implemented, false);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("returns low confidence when files exist but are not committed", () => {
    const tmp = createTempGitDir();
    try {
      // Initial commit with just README
      writeFixture(tmp, "README.md", "init\n");
      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      // Add spec and plan
      writeFixture(tmp, "spec.spec.md", "---\nstatus: implemented\n---\n# Spec\n");
      writeFixture(tmp, "spec.plan.md", `# Plan

**Create:**
- lib/feature.mjs — the module

**Reference (read, do not modify):**
- README.md
`);
      writeFixture(tmp, "lib/feature.mjs", "export function hello() {}\n");
      // NOT committed — only on disk

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      assert.equal(result.confidence, CONFIDENCE.LOW);
      assert.equal(result.implemented, false);
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ---------------------------------------------------------------------------
// verifyIssueCompleted
// ---------------------------------------------------------------------------

describe("verifyIssueCompleted", () => {
  test("returns none confidence when plan file not found", () => {
    const result = verifyIssueCompleted(
      { plan_ref: "nonexistent.plan.md", plan_task: 1 },
      { projectRoot: "/tmp" }
    );
    assert.equal(result.completed, false);
    assert.equal(result.confidence, CONFIDENCE.NONE);
  });

  test("returns medium confidence when all checkboxes checked", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, "plan.md", `# Plan

### Task 1: Do something

- [x] **Write failing test**
- [x] **Verify test fails**
- [x] **Implement**
- [x] **Verify test passes**
- [x] **Commit**

### Task 2: Other
`);
      const result = verifyIssueCompleted(
        { plan_ref: "plan.md", plan_task: 1 },
        { projectRoot: tmp }
      );
      assert.equal(result.completed, true);
      assert.equal(result.confidence, CONFIDENCE.MEDIUM);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("returns none confidence when checkboxes are unchecked", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, "plan.md", `# Plan

### Task 1: Do something

- [x] **Write failing test**
- [ ] **Verify test fails**
- [ ] **Implement**
- [ ] **Verify test passes**
- [ ] **Commit**
`);
      const result = verifyIssueCompleted(
        { plan_ref: "plan.md", plan_task: 1 },
        { projectRoot: tmp }
      );
      assert.equal(result.completed, false);
      assert.equal(result.confidence, CONFIDENCE.NONE);
      assert.ok(result.reason.includes("4/5 checkboxes unchecked"));
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("returns low confidence when no plan_ref or spec_ref", () => {
    const result = verifyIssueCompleted({ title: "Some issue" }, { projectRoot: "/tmp" });
    assert.equal(result.completed, false);
    assert.equal(result.confidence, CONFIDENCE.LOW);
  });
});

// ---------------------------------------------------------------------------
// formatConfidenceNote
// ---------------------------------------------------------------------------

describe("formatConfidenceNote", () => {
  test("formats a high confidence validation note", () => {
    const note = formatConfidenceNote("Validated", "high", {
      reportPath: ".context-index/specs/features/x/x-validation.md",
      filesVerified: 5,
      testsPass: true,
    });
    assert.ok(note.includes("Validated: HIGH confidence"));
    assert.ok(note.includes("Files verified: 5"));
    assert.ok(note.includes("Tests: PASS"));
  });

  test("formats a bug-fixed note", () => {
    const note = formatConfidenceNote("Bug fixed", "high", {
      testsPass: true,
      specPath: ".context-index/specs/features/hooks/merge-guard.md",
    });
    assert.ok(note.includes("Bug fixed: HIGH confidence"));
    assert.ok(note.includes("Tests: PASS"));
    assert.ok(note.includes("Spec:"));
  });

  test("formats a low confidence note", () => {
    const note = formatConfidenceNote("Reconciled", "low", {});
    assert.ok(note.includes("Reconciled: LOW confidence"));
  });
});

// ---------------------------------------------------------------------------
// CONFIDENCE export
// ---------------------------------------------------------------------------

describe("CONFIDENCE constants", () => {
  test("exports all four levels", () => {
    assert.equal(CONFIDENCE.HIGH, "high");
    assert.equal(CONFIDENCE.MEDIUM, "medium");
    assert.equal(CONFIDENCE.LOW, "low");
    assert.equal(CONFIDENCE.NONE, "none");
  });
});
