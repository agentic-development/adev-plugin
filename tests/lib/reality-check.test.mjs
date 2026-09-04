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

  test("expands a plan path combining brace and glob syntax to find committed files", () => {
    // Reproduces the skill-output-rules-wiring case: a plan declares a
    // modified-file set using shell-brace form crossed with a glob, and all
    // the files it expands to are present and committed. Before the fix,
    // the literal brace/glob string was passed straight to existsSync(),
    // always missed, and confidence bottomed out at NONE even though every
    // file existed.
    const tmp = createTempGitDir();
    try {
      writeFixture(tmp, "spec.spec.md", "---\nstatus: implemented\n---\n# Spec\n\nTests at tests/feature.test.mjs\n");
      writeFixture(tmp, "spec.plan.md", `# Plan

**Create:**
- providers/{cursor,windsurf}/skills/output-rules/*.md — provider mirrors
- tests/feature.test.mjs — tests

**Reference (read, do not modify):**
- README.md
`);
      writeFixture(tmp, "providers/cursor/skills/output-rules/SKILL.md", "# Cursor mirror\n");
      writeFixture(tmp, "providers/windsurf/skills/output-rules/SKILL.md", "# Windsurf mirror\n");
      writeFixture(tmp, "tests/feature.test.mjs", "import { test } from 'node:test';\ntest('pass', () => {});\n");

      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      const failMessages = result.evidence.filter((e) => e.type === "fail").map((e) => e.message);
      assert.deepEqual(failMessages, [], `Expected no false-negative failures, got: ${JSON.stringify(failMessages)}`);
      // 3 file-existence passes (2 glob-expanded mirrors + the literal test
      // file) plus 1 "Test file exists" pass from the spec's own test-file
      // detection step (step 5, a separate evidence entry).
      const passCount = result.evidence.filter((e) => e.type === "pass").length;
      assert.equal(passCount, 4, "expected both expanded provider mirrors plus the test file to pass");
      assert.equal(result.confidence, CONFIDENCE.HIGH);
      assert.equal(result.implemented, true);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("reports a legitimately empty glob match as missing, not unverifiable", () => {
    const tmp = createTempGitDir();
    try {
      writeFixture(tmp, "spec.spec.md", "---\nstatus: implemented\n---\n# Spec\n");
      writeFixture(tmp, "spec.plan.md", `# Plan

**Create:**
- lib/nonexistent/*.mjs — nothing here

**Reference (read, do not modify):**
- README.md
`);
      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      const failMessages = result.evidence.filter((e) => e.type === "fail").map((e) => e.message);
      assert.equal(failMessages.length, 1);
      assert.match(failMessages[0], /missing from disk/);
      assert.equal(result.evidence.some((e) => e.type === "unverifiable"), false);
      assert.equal(result.confidence, CONFIDENCE.NONE);
      assert.equal(result.implemented, false);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("reports an unparseable brace path as unverifiable and excludes it from confidence", () => {
    const tmp = createTempGitDir();
    try {
      writeFixture(tmp, "spec.spec.md", "---\nstatus: implemented\n---\n# Spec\n\nTests at tests/feature.test.mjs\n");
      writeFixture(tmp, "spec.plan.md", `# Plan

**Create:**
- lib/{unterminated.mjs — malformed brace group
- lib/feature.mjs — the module
- tests/feature.test.mjs — tests

**Reference (read, do not modify):**
- README.md
`);
      writeFixture(tmp, "lib/feature.mjs", "export function hello() {}\n");
      writeFixture(tmp, "tests/feature.test.mjs", "import { test } from 'node:test';\ntest('pass', () => {});\n");

      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      const unverifiable = result.evidence.filter((e) => e.type === "unverifiable");
      assert.equal(unverifiable.length, 1);
      assert.match(unverifiable[0].message, /unbalanced braces/);
      // The unparseable entry must not count as evidence of absence — the
      // other two (real, resolvable) files are present and committed, so
      // confidence should reflect THEM, not be dragged to NONE by the
      // entry we couldn't even parse.
      const failMessages = result.evidence.filter((e) => e.type === "fail");
      assert.equal(failMessages.length, 0);
      assert.equal(result.confidence, CONFIDENCE.HIGH);
      assert.equal(result.implemented, true);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("returns low confidence, not high, when every declared path is unverifiable", () => {
    // An unparseable path must not be silently treated as satisfied: with
    // zero resolvable entries there is no real evidence of completion, so
    // confidence must not reach HIGH/MEDIUM even though nothing failed.
    const tmp = createTempGitDir();
    try {
      writeFixture(tmp, "spec.spec.md", "---\nstatus: implemented\n---\n# Spec\n");
      writeFixture(tmp, "spec.plan.md", `# Plan

**Create:**
- lib/{unterminated.mjs — malformed brace group

**Reference (read, do not modify):**
- README.md
`);
      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      assert.equal(result.evidence.filter((e) => e.type === "unverifiable").length, 1);
      assert.equal(result.evidence.filter((e) => e.type === "fail").length, 0);
      assert.equal(result.confidence, CONFIDENCE.LOW);
      assert.equal(result.implemented, false);
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

  test("strips a trailing line-ref suffix from a backtick-quoted plan path", () => {
    // Plan entries can annotate the exact span to touch, e.g.
    // `lib/feature.mjs:518-662` — the ":518-662" is not part of the path on
    // disk. Before the fix, every one of these entries failed existsSync()
    // and confidence bottomed out at NONE even on a fully implemented spec.
    const tmp = createTempGitDir();
    try {
      writeFixture(tmp, "spec.spec.md", "---\nstatus: implemented\n---\n# Spec\n\nTests at tests/feature.test.mjs\n");
      writeFixture(tmp, "spec.plan.md", `# Plan

**Create:**
- \`lib/feature.mjs:12-40\` — the module
- \`tests/feature.test.mjs\` — tests

**Reference (read, do not modify):**
- README.md
`);
      writeFixture(tmp, "lib/feature.mjs", "export function hello() {}\n");
      writeFixture(tmp, "tests/feature.test.mjs", "import { test } from 'node:test';\ntest('pass', () => {});\n");

      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      assert.equal(result.confidence, CONFIDENCE.HIGH);
      assert.equal(result.implemented, true);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("merges a bullet's wrapped continuation lines instead of treating each as its own path", () => {
    // A long description commonly wraps onto an indented continuation line
    // with no "- " prefix of its own. Before the fix, splitting on every
    // "\n" treated that continuation text as a separate bullet, and the raw
    // prose fragment (e.g. "primary comparator term") got existsSync()-
    // checked as if it were a file path — always failing, always dragging
    // confidence down to NONE regardless of the real files.
    const tmp = createTempGitDir();
    try {
      writeFixture(tmp, "spec.spec.md", "---\nstatus: implemented\n---\n# Spec\n\nTests at tests/feature.test.mjs\n");
      writeFixture(tmp, "spec.plan.md", `# Plan

**Create:**
- \`lib/feature.mjs:1409-1431\` — compute the derived value; add it as the
  primary comparator term
- \`tests/feature.test.mjs\` — tests

**Reference (read, do not modify):**
- README.md
`);
      writeFixture(tmp, "lib/feature.mjs", "export function hello() {}\n");
      writeFixture(tmp, "tests/feature.test.mjs", "import { test } from 'node:test';\ntest('pass', () => {});\n");

      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      const failMessages = result.evidence.filter((e) => e.type === "fail").map((e) => e.message);
      assert.deepEqual(failMessages, [], `Expected no false-positive failures, got: ${JSON.stringify(failMessages)}`);
      assert.equal(result.confidence, CONFIDENCE.HIGH);
      assert.equal(result.implemented, true);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("extracts a bare (non-backtick) path from a bullet whose continuation line has no em dash", () => {
    // A bare-path bullet's own description can wrap without ever using an
    // em dash on the continuation line. Before the fix, the bareMatch regex
    // anchored `$` to the true end of the (continuation-merged) bullet
    // string, which could never be reached without an em dash present
    // somewhere in the tail — so the match failed outright and the entry
    // was silently dropped from planFiles, instead of being extracted.
    const tmp = createTempGitDir();
    try {
      writeFixture(tmp, "spec.spec.md", "---\nstatus: implemented\n---\n# Spec\n\nTests at tests/feature.test.mjs\n");
      writeFixture(tmp, "spec.plan.md", `# Plan

**Create:**
- lib/feature.mjs — compute the derived value and use it as the
  primary comparator term
- tests/feature.test.mjs — tests

**Reference (read, do not modify):**
- README.md
`);
      writeFixture(tmp, "lib/feature.mjs", "export function hello() {}\n");
      writeFixture(tmp, "tests/feature.test.mjs", "import { test } from 'node:test';\ntest('pass', () => {});\n");

      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      const failMessages = result.evidence.filter((e) => e.type === "fail").map((e) => e.message);
      assert.deepEqual(failMessages, [], `Expected no false-positive failures, got: ${JSON.stringify(failMessages)}`);
      assert.equal(result.confidence, CONFIDENCE.HIGH);
      assert.equal(result.implemented, true);
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

  test("falls back to source-manifest files when no plan file exists (high confidence with tests)", () => {
    const tmp = createTempGitDir();
    try {
      writeFixture(
        tmp,
        "spec.spec.md",
        `---
status: validated
source-manifest:
  sha: "abc1234"
  files:
    - lib/feature.mjs
    - tests/feature.test.mjs
  computed-at: "2026-04-15T00:00:00.000Z"
---
# Spec

Tests at tests/feature.test.mjs
`,
      );
      writeFixture(tmp, "lib/feature.mjs", "export function hello() {}\n");
      writeFixture(
        tmp,
        "tests/feature.test.mjs",
        "import { test } from 'node:test';\ntest('pass', () => {});\n",
      );
      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      assert.equal(result.confidence, CONFIDENCE.HIGH);
      assert.equal(result.implemented, true);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("falls back to source-manifest files when no plan file exists (medium confidence without tests)", () => {
    const tmp = createTempGitDir();
    try {
      writeFixture(
        tmp,
        "spec.spec.md",
        `---
status: validated
source-manifest:
  sha: "abc1234"
  files:
    - lib/feature.mjs
  computed-at: "2026-04-15T00:00:00.000Z"
---
# Spec
`,
      );
      writeFixture(tmp, "lib/feature.mjs", "export function hello() {}\n");
      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      assert.equal(result.confidence, CONFIDENCE.MEDIUM);
      assert.equal(result.implemented, true);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("returns none from source-manifest when files missing from disk", () => {
    const tmp = createTempGitDir();
    try {
      writeFixture(
        tmp,
        "spec.spec.md",
        `---
status: validated
source-manifest:
  sha: "abc1234"
  files:
    - lib/feature.mjs
    - lib/missing.mjs
  computed-at: "2026-04-15T00:00:00.000Z"
---
# Spec
`,
      );
      writeFixture(tmp, "lib/feature.mjs", "export function hello() {}\n");
      // lib/missing.mjs intentionally absent
      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      assert.equal(result.confidence, CONFIDENCE.NONE);
      assert.equal(result.implemented, false);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("prefers plan files over source-manifest when both are present", () => {
    const tmp = createTempGitDir();
    try {
      // Plan lists feature.mjs (committed); source-manifest lists a missing file.
      // If the verifier preferred source-manifest, confidence would be NONE.
      // Plan must take precedence and yield MEDIUM.
      writeFixture(
        tmp,
        "spec.spec.md",
        `---
status: validated
source-manifest:
  sha: "abc1234"
  files:
    - lib/missing.mjs
  computed-at: "2026-04-15T00:00:00.000Z"
---
# Spec
`,
      );
      writeFixture(
        tmp,
        "spec.plan.md",
        `# Plan

**Create:**
- lib/feature.mjs — the module

**Reference (read, do not modify):**
- README.md
`,
      );
      writeFixture(tmp, "lib/feature.mjs", "export function hello() {}\n");
      execSync("git add -A && git commit -m init", { cwd: tmp, stdio: "ignore" });

      const result = verifySpecImplemented(join(tmp, "spec.spec.md"), { projectRoot: tmp });
      assert.equal(result.confidence, CONFIDENCE.MEDIUM);
      assert.equal(result.implemented, true);
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
