/**
 * Work Tracking Eval Integration Tests
 *
 * Runs deterministic checks against the fixture repo to verify
 * work-tracking infrastructure works correctly. Tests the actual
 * code (buildReverseIndex, git trailer parsing, issue board state)
 * against known fixture states.
 *
 * The fixture is created by setup-fixture.sh and contains crafted
 * git history with specific trailer patterns.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { buildReverseIndex } from "../../../lib/source-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixture");
const SETUP_SCRIPT = join(__dirname, "setup-fixture.sh");

/**
 * Helper: run git command in fixture dir
 */
function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: FIXTURE_DIR, encoding: "utf-8" }).trim();
}

/**
 * Helper: extract trailers from a commit message
 */
function getTrailers(commitRef) {
  try {
    return git(`log --format='%(trailers)' -1 ${commitRef}`);
  } catch {
    return "";
  }
}

/**
 * Helper: get commits touching a file, newest first
 */
function commitsForFile(filePath) {
  return git(`log --format='%H %s' -- ${filePath}`).split("\n").filter(Boolean);
}

/**
 * Helper: check if all commits for a file have a specific trailer key
 */
function allCommitsHaveTrailer(filePath, trailerKey) {
  const commits = git(`log --format='%H' -- ${filePath}`).split("\n").filter(Boolean);
  for (const sha of commits) {
    const trailers = getTrailers(sha);
    if (!trailers.includes(`${trailerKey}:`)) return false;
  }
  return true;
}

/**
 * Helper: check if any commit for a file has a specific trailer key
 */
function anyCommitHasTrailer(filePath, trailerKey) {
  const commits = git(`log --format='%H' -- ${filePath}`).split("\n").filter(Boolean);
  for (const sha of commits) {
    const trailers = getTrailers(sha);
    if (trailers.includes(`${trailerKey}:`)) return true;
  }
  return false;
}

describe("Work Tracking Eval: Fixture Setup", () => {
  before(() => {
    // Recreate fixture from scratch for deterministic state
    execSync(`bash ${SETUP_SCRIPT} ${FIXTURE_DIR}`, { stdio: "pipe" });
  });

  after(() => {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  });

  it("fixture exists with expected files", () => {
    assert.ok(existsSync(join(FIXTURE_DIR, "lib/login.mjs")));
    assert.ok(existsSync(join(FIXTURE_DIR, "lib/drifted.mjs")));
    assert.ok(existsSync(join(FIXTURE_DIR, "lib/untraced.mjs")));
    assert.ok(existsSync(join(FIXTURE_DIR, "lib/orphan.mjs")));
    assert.ok(existsSync(join(FIXTURE_DIR, "tests/login.test.mjs")));
  });

  // =========================================================================
  // Scenario A: Full lifecycle trailer flow
  // =========================================================================
  describe("Scenario A: Full Lifecycle Trailers", () => {
    it("lib/login.mjs is fully traced (all commits have Spec + Plan-task + Issue)", () => {
      assert.ok(allCommitsHaveTrailer("lib/login.mjs", "Spec"));
      assert.ok(allCommitsHaveTrailer("lib/login.mjs", "Plan-task"));
      assert.ok(allCommitsHaveTrailer("lib/login.mjs", "Issue"));
      assert.ok(allCommitsHaveTrailer("lib/login.mjs", "Author-type"));
    });

    it("tests/login.test.mjs is fully traced", () => {
      assert.ok(allCommitsHaveTrailer("tests/login.test.mjs", "Spec"));
      assert.ok(allCommitsHaveTrailer("tests/login.test.mjs", "Author-type"));
    });

    it("lib/drifted.mjs is partially traced (first commit traced, second not)", () => {
      const commits = commitsForFile("lib/drifted.mjs");
      assert.equal(commits.length, 2, "Expected 2 commits for drifted.mjs");

      // Newest commit (first in list) should NOT have Spec:
      const newestSha = commits[0].split(" ")[0];
      const newestTrailers = getTrailers(newestSha);
      assert.ok(!newestTrailers.includes("Spec:"), "Newest commit should not have Spec:");

      // Oldest commit (last in list) should have Spec:
      const oldestSha = commits[1].split(" ")[0];
      const oldestTrailers = getTrailers(oldestSha);
      assert.ok(oldestTrailers.includes("Spec:"), "Oldest commit should have Spec:");
    });

    it("lib/untraced.mjs has no lifecycle trailers", () => {
      assert.ok(!anyCommitHasTrailer("lib/untraced.mjs", "Spec"));
      assert.ok(!anyCommitHasTrailer("lib/untraced.mjs", "Plan-task"));
      assert.ok(!anyCommitHasTrailer("lib/untraced.mjs", "Session"));
      assert.ok(!anyCommitHasTrailer("lib/untraced.mjs", "Issue"));
    });

    it("lib/orphan.mjs has Author-type: human and Lifecycle: untracked", () => {
      const commits = commitsForFile("lib/orphan.mjs");
      const sha = commits[0].split(" ")[0];
      const trailers = getTrailers(sha);
      assert.ok(trailers.includes("Author-type: human"));
      assert.ok(trailers.includes("Lifecycle: untracked"));
    });
  });

  // =========================================================================
  // Scenario B: Lifecycle bypass detection
  // =========================================================================
  describe("Scenario B: Lifecycle Bypass Detection", () => {
    it("detects manifest-claimed file with untracked commit (drift)", () => {
      // lib/drifted.mjs is claimed by widgets.md but has a post-impl commit without Spec:
      const commits = commitsForFile("lib/drifted.mjs");
      const newestSha = commits[0].split(" ")[0];
      const trailers = getTrailers(newestSha);
      assert.ok(!trailers.includes("Spec:"), "Drifted commit should lack Spec: trailer");
      assert.ok(commits[0].includes("patch metrics"), "Should be the patch commit");
    });

    it("identifies claiming spec for drifted file via reverse index", async () => {
      const specsDir = join(FIXTURE_DIR, ".context-index/specs/features");
      const index = await buildReverseIndex(specsDir, FIXTURE_DIR);
      assert.equal(
        index.get("lib/drifted.mjs"),
        ".context-index/specs/features/dashboard/widgets.md"
      );
    });

    it("unclaimed files are correctly identified", async () => {
      const specsDir = join(FIXTURE_DIR, ".context-index/specs/features");
      const index = await buildReverseIndex(specsDir, FIXTURE_DIR);
      assert.equal(index.has("lib/untraced.mjs"), false);
      assert.equal(index.has("lib/orphan.mjs"), false);
    });

    it("fully traced files are not false-positived", async () => {
      const specsDir = join(FIXTURE_DIR, ".context-index/specs/features");
      const index = await buildReverseIndex(specsDir, FIXTURE_DIR);
      // login.mjs is claimed AND all commits have Spec:
      assert.equal(
        index.get("lib/login.mjs"),
        ".context-index/specs/features/auth/login.md"
      );
      assert.ok(allCommitsHaveTrailer("lib/login.mjs", "Spec"));
    });
  });

  // =========================================================================
  // Scenario C: Reverse index and code-follows-specs
  // =========================================================================
  describe("Scenario C: Reverse Index", () => {
    it("builds correct reverse index from fixture specs", async () => {
      const specsDir = join(FIXTURE_DIR, ".context-index/specs/features");
      const index = await buildReverseIndex(specsDir, FIXTURE_DIR);

      // 3 claimed files total
      assert.equal(index.size, 3);
      assert.equal(index.get("lib/login.mjs"), ".context-index/specs/features/auth/login.md");
      assert.equal(index.get("tests/login.test.mjs"), ".context-index/specs/features/auth/login.md");
      assert.equal(index.get("lib/drifted.mjs"), ".context-index/specs/features/dashboard/widgets.md");
    });

    it("unclaimed file count matches expected", async () => {
      const specsDir = join(FIXTURE_DIR, ".context-index/specs/features");
      const index = await buildReverseIndex(specsDir, FIXTURE_DIR);

      const allSourceFiles = ["lib/login.mjs", "lib/drifted.mjs", "lib/untraced.mjs", "lib/orphan.mjs", "tests/login.test.mjs"];
      const unclaimed = allSourceFiles.filter(f => !index.has(f));
      assert.equal(unclaimed.length, 2); // untraced.mjs, orphan.mjs
    });
  });

  // =========================================================================
  // Scenario D: Backlog aggregation (issue board state checks)
  // =========================================================================
  describe("Scenario D: Backlog State", () => {
    it("epic-1 has all issues closed but is still open (stale)", () => {
      const board = readFileSync(join(FIXTURE_DIR, ".context-index/tasks/tasks.md"), "utf-8");
      // epic-1 is open
      assert.ok(board.includes("epic-1"));
      const epic1Block = board.match(/### epic-1[\s\S]*?(?=### epic-2)/)?.[0] || "";
      assert.ok(epic1Block.includes("status: open"));

      // All 3 issues (issue-1, issue-2, issue-3) are closed
      for (const id of ["issue-1", "issue-2", "issue-3"]) {
        const issueBlock = board.match(new RegExp(`### ${id}[\\s\\S]*?(?=###|$)`))?.[0] || "";
        assert.ok(issueBlock.includes("status: closed"), `${id} should be closed`);
      }
    });

    it("issue-4 has orphaned planRef (file doesn't exist)", () => {
      const board = readFileSync(join(FIXTURE_DIR, ".context-index/tasks/tasks.md"), "utf-8");
      const issue4Block = board.match(/### issue-4[\s\S]*?(?=###|$)/)?.[0] || "";
      const planRef = issue4Block.match(/planRef:\s*(.+)/)?.[1]?.trim();
      assert.ok(planRef, "issue-4 should have a planRef");
      assert.ok(!existsSync(join(FIXTURE_DIR, planRef)), "planRef should point to nonexistent file");
    });

    it("issue-5 is deferred (stale — no update in 26+ days)", () => {
      const board = readFileSync(join(FIXTURE_DIR, ".context-index/tasks/tasks.md"), "utf-8");
      const issue5Block = board.match(/### issue-5[\s\S]*?(?=###|$)/)?.[0] || "";
      assert.ok(issue5Block.includes("status: deferred"));
      assert.ok(issue5Block.includes("2026-03-15"), "Should show original deferral date");
    });

    it("session-mgmt spec is review-passed with no plan (unplanned)", () => {
      const spec = readFileSync(join(FIXTURE_DIR, ".context-index/specs/features/auth/session-mgmt.md"), "utf-8");
      assert.ok(spec.includes("status: review-passed"));
      assert.ok(!existsSync(join(FIXTURE_DIR, ".context-index/specs/features/auth/session-mgmt.plan.md")));
    });

    it("metrics spec is draft (lowest priority backlog)", () => {
      const spec = readFileSync(join(FIXTURE_DIR, ".context-index/specs/features/dashboard/metrics.md"), "utf-8");
      assert.ok(spec.includes("status: draft"));
    });

    it("auth charter has v2 capabilities (SSO, OAuth)", () => {
      const charter = readFileSync(join(FIXTURE_DIR, ".context-index/specs/features/auth/charter.md"), "utf-8");
      assert.ok(charter.includes("SSO Integration"));
      assert.ok(charter.includes("v2"));
      assert.ok(charter.includes("OAuth Providers"));
      assert.ok(charter.includes("nice-to-have"));
    });

    it("orphan.mjs matches SSO capability keyword", () => {
      const orphanCode = readFileSync(join(FIXTURE_DIR, "lib/orphan.mjs"), "utf-8");
      assert.ok(orphanCode.includes("SSO") || orphanCode.includes("sso"));
    });
  });

  // =========================================================================
  // Scenario E: Implementation probe
  // =========================================================================
  describe("Scenario E: Implementation Probe", () => {
    it("login spec plan task files already exist", () => {
      // Plan says tasks target lib/login.mjs and tests/login.test.mjs
      assert.ok(existsSync(join(FIXTURE_DIR, "lib/login.mjs")));
      assert.ok(existsSync(join(FIXTURE_DIR, "tests/login.test.mjs")));
    });

    it("login spec has a plan with 3 tasks", () => {
      const plan = readFileSync(join(FIXTURE_DIR, ".context-index/specs/features/auth/login.plan.md"), "utf-8");
      assert.ok(plan.includes("tasks: 3"));
      assert.ok(plan.includes("Task 1"));
      assert.ok(plan.includes("Task 2"));
      assert.ok(plan.includes("Task 3"));
    });

    it("session-mgmt spec has no plan (cannot probe)", () => {
      assert.ok(!existsSync(join(FIXTURE_DIR, ".context-index/specs/features/auth/session-mgmt.plan.md")));
    });

    it("metrics spec has no implementation files", () => {
      // No code files related to metrics exist
      assert.ok(!existsSync(join(FIXTURE_DIR, "lib/metrics.mjs")));
    });
  });

  // =========================================================================
  // Scenario F: Issue chain tracing
  // =========================================================================
  describe("Scenario F: Issue Chain Tracing", () => {
    it("issue-2 traces to commit with Issue: issue-2 trailer", () => {
      const log = git("log --format='%H %(trailers:key=Issue)' --all");
      const lines = log.split("\n").filter(l => l.includes("Issue: issue-2"));
      assert.ok(lines.length > 0, "Should find commit(s) with Issue: issue-2");
    });

    it("issue-2 links to plan task 2 via trailers", () => {
      // Find the commit with Issue: issue-2
      const log = git("log --format='%H' --all --grep='Issue: issue-2'");
      const sha = log.split("\n")[0]?.trim();
      assert.ok(sha, "Should find commit with Issue: issue-2");
      const trailers = getTrailers(sha);
      assert.ok(trailers.includes("Plan-task: 2"));
    });

    it("issue-2 links to auth/login.md spec via trailers", () => {
      const log = git("log --format='%H' --all --grep='Issue: issue-2'");
      const sha = log.split("\n")[0]?.trim();
      const trailers = getTrailers(sha);
      assert.ok(trailers.includes("Spec: .context-index/specs/features/auth/login.md"));
    });

    it("epic-1 all 3 issues are closed in board", () => {
      const board = readFileSync(join(FIXTURE_DIR, ".context-index/tasks/tasks.md"), "utf-8");
      for (const id of ["issue-1", "issue-2", "issue-3"]) {
        const block = board.match(new RegExp(`### ${id}[\\s\\S]*?(?=###|$)`))?.[0] || "";
        assert.ok(block.includes("epicId: epic-1"), `${id} should belong to epic-1`);
        assert.ok(block.includes("status: closed"), `${id} should be closed`);
      }
    });

    it("drifted.mjs maps back to widgets.md via reverse index", async () => {
      const specsDir = join(FIXTURE_DIR, ".context-index/specs/features");
      const index = await buildReverseIndex(specsDir, FIXTURE_DIR);
      assert.equal(
        index.get("lib/drifted.mjs"),
        ".context-index/specs/features/dashboard/widgets.md"
      );
    });

    it("drifted.mjs has post-manifest untracked commit", () => {
      const commits = commitsForFile("lib/drifted.mjs");
      // Newest commit should lack Spec: trailer
      const sha = commits[0].split(" ")[0];
      const trailers = getTrailers(sha);
      assert.ok(!trailers.includes("Spec:"));
    });

    it("JSONL has entries with issue and epic fields", () => {
      const jsonl = readFileSync(join(FIXTURE_DIR, ".context-index/.session-tracking.jsonl"), "utf-8");
      const lines = jsonl.trim().split("\n").map(l => JSON.parse(l));
      const withIssue = lines.filter(l => l.issue);
      assert.ok(withIssue.length >= 3, "Should have entries with issue field");
      assert.ok(withIssue.some(l => l.epic), "Should have entries with epic field");
    });

    it("JSONL has entries without issue (lifecycle bypass sessions)", () => {
      const jsonl = readFileSync(join(FIXTURE_DIR, ".context-index/.session-tracking.jsonl"), "utf-8");
      const lines = jsonl.trim().split("\n").map(l => JSON.parse(l));
      const withoutIssue = lines.filter(l => l.session_id && !l.issue);
      assert.ok(withoutIssue.length >= 1, "Should have session entries without issue");
    });
  });
});
