/**
 * Architectural test: plan files are immutable after the first `plan_task`
 * `pending` event for that plan.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md
 *       § Acceptance Criteria bullet 5 (plan files immutable post-authoring)
 *
 * The detector lives in `lib/plan-immutability.mjs`. This test runs the detector
 * against (a) a violation fixture that should yield exactly one violation, and
 * (b) the real repo, which should be clean.
 */

import { existsSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

test("plan-immutability: violation is detected (dynamic untracked fixture)", async () => {
  // Build the violation scenario in a temp dir so the plan file is genuinely
  // untracked by git → the detector falls back to mtime, which we control.
  // (The static checked-in fixture would be tracked by the parent repo and
  // appear "added-only" under --diff-filter=M, masking the violation.)
  const tmp = createTempDir();
  try {
    writeFixture(
      tmp,
      ".context-index/specs/features/x/foo.plan.md",
      "# Plan: foo\n\n### Task 1: Stub\n",
    );
    writeFixture(
      tmp,
      ".context-index/lifecycle-state/foo.jsonl",
      JSON.stringify({
        ts: "2020-01-01T00:00:00.000Z",
        event: "plan_task",
        plan: ".context-index/specs/features/x/foo.plan.md",
        task_id: "t1",
        status: "pending",
        notes: null,
      }) + "\n",
    );
    // Force plan mtime well after the pending event ts.
    const planPath = join(tmp, ".context-index/specs/features/x/foo.plan.md");
    const future = new Date("2030-01-01T00:00:00.000Z");
    utimesSync(planPath, future, future);

    const { detectMutatedPlans } = await import(
      "../../lib/plan-immutability.mjs"
    );
    const violations = await detectMutatedPlans(tmp);
    assert.equal(
      violations.length,
      1,
      `expected exactly one violation, got ${violations.length}: ${JSON.stringify(violations)}`,
    );
    assert.match(violations[0].path, /foo\.plan\.md$/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("plan-immutability: real repo has no violations", async () => {
  const { detectMutatedPlans } = await import(
    "../../lib/plan-immutability.mjs"
  );
  const violations = await detectMutatedPlans(process.cwd());
  assert.deepEqual(
    violations,
    [],
    `unexpected plan-file mutations:\n${JSON.stringify(violations, null, 2)}`,
  );
});

test("plan-immutability: clean fixture returns no violations", async () => {
  const fixtureRoot = "tests/fixtures/plan-immutability/clean";
  if (!existsSync(fixtureRoot)) {
    return; // optional fixture
  }
  const { detectMutatedPlans } = await import(
    "../../lib/plan-immutability.mjs"
  );
  const violations = await detectMutatedPlans(fixtureRoot);
  assert.deepEqual(
    violations,
    [],
    "clean fixture must yield zero violations",
  );
});

test("plan-immutability: detectMutatedPlans handles missing projectRoot gracefully", async () => {
  const { detectMutatedPlans } = await import(
    "../../lib/plan-immutability.mjs"
  );
  const violations = await detectMutatedPlans(
    "/tmp/__does-not-exist-plan-immutability__",
  );
  assert.deepEqual(violations, []);
});

// ────────────────────────────────────────────────────────────────────────
// Working-tree branch tests (PLAN_MUTATED_WITHOUT_SIDECAR)
//
// Spec: plan-routing-sidecar.spec.md Behaviors 6-7, Error Cases
//
// The legacy --diff-filter=M check misses inline `**Routing:**` blocks
// committed as a single `A` commit (the cursor-provider pattern). The
// working-tree branch greps the plan body for inline Routing/Scores/
// Rationale and flags PLAN_MUTATED_WITHOUT_SIDECAR when no sibling
// .routing.json exists at the same path — regardless of git history.
// ────────────────────────────────────────────────────────────────────────

// The new fixtures (clean-plan, mutate-then-single-add, sidecar-present-plus-
// inline) each carry a lifecycle log with a 2020-01-01 pending event so the
// detector enters its per-plan branch. Once the fixtures land in git, the
// detector uses `git log --diff-filter=M` (which returns null for plans
// committed as a single `A` commit), so no mtime check fires. Before the
// fixtures are tracked, we backdate mtimes to 2019-01-01 in each test so the
// untracked-fallback branch also yields null → no mtime violation, isolating
// the new PLAN_MUTATED_WITHOUT_SIDECAR working-tree check.

test("plan-immutability: clean fixture with no inline Routing and no sidecar yields no violations", async () => {
  const past = new Date("2019-01-01T00:00:00.000Z");
  const planPath = "tests/fixtures/plan-immutability/clean-plan/.context-index/specs/features/x/foo.plan.md";
  utimesSync(planPath, past, past);

  const { detectMutatedPlans } = await import("../../lib/plan-immutability.mjs");
  const violations = await detectMutatedPlans(
    "tests/fixtures/plan-immutability/clean-plan",
  );
  assert.deepEqual(
    violations,
    [],
    `clean fixture must yield zero violations; got: ${JSON.stringify(violations)}`,
  );
});

test("plan-immutability: mutate-then-single-add fixture flags PLAN_MUTATED_WITHOUT_SIDECAR", async () => {
  const past = new Date("2019-01-01T00:00:00.000Z");
  const planPath = "tests/fixtures/plan-immutability/mutate-then-single-add/.context-index/specs/features/x/foo.plan.md";
  utimesSync(planPath, past, past);

  const { detectMutatedPlans } = await import("../../lib/plan-immutability.mjs");
  const violations = await detectMutatedPlans(
    "tests/fixtures/plan-immutability/mutate-then-single-add",
  );
  // Expect at least one PLAN_MUTATED_WITHOUT_SIDECAR violation.
  const mutated = violations.filter((v) => v.code === "PLAN_MUTATED_WITHOUT_SIDECAR");
  assert.equal(
    mutated.length,
    1,
    `expected one PLAN_MUTATED_WITHOUT_SIDECAR violation, got all: ${JSON.stringify(violations, null, 2)}`,
  );
  assert.match(mutated[0].path, /foo\.plan\.md$/);
});

test("plan-immutability: sidecar-present-plus-inline fixture tolerates inline blocks (no PLAN_MUTATED_WITHOUT_SIDECAR)", async () => {
  const past = new Date("2019-01-01T00:00:00.000Z");
  const planPath = "tests/fixtures/plan-immutability/sidecar-present-plus-inline/.context-index/specs/features/x/foo.plan.md";
  utimesSync(planPath, past, past);

  const { detectMutatedPlans } = await import("../../lib/plan-immutability.mjs");
  const violations = await detectMutatedPlans(
    "tests/fixtures/plan-immutability/sidecar-present-plus-inline",
  );
  // The working-tree branch must NOT flag this case because the sidecar
  // is present — inline blocks are tolerated as legacy migration noise.
  const mutatedWithoutSidecar = violations.filter(
    (v) => v.code === "PLAN_MUTATED_WITHOUT_SIDECAR",
  );
  assert.deepEqual(
    mutatedWithoutSidecar,
    [],
    `unexpected PLAN_MUTATED_WITHOUT_SIDECAR violations: ${JSON.stringify(violations, null, 2)}`,
  );
});

test("plan-immutability: manifest exempt_commits suppresses a real modification violation", async () => {
  // Build a real git repo with a plan file, commit it, then commit a
  // modification — the M commit's hash is then listed under
  // hygiene.plan_immutability.exempt_commits[] and the detector should
  // suppress the violation that would otherwise fire.
  const { execSync } = await import("node:child_process");
  const tmp = createTempDir();
  try {
    execSync("git init -b main", { cwd: tmp, stdio: "ignore" });
    execSync('git config user.email "test@test.com"', { cwd: tmp, stdio: "ignore" });
    execSync('git config user.name "Test"', { cwd: tmp, stdio: "ignore" });
    execSync("git config commit.gpgsign false", { cwd: tmp, stdio: "ignore" });

    writeFixture(
      tmp,
      ".context-index/specs/features/x/foo.plan.md",
      "# Plan: foo\n\n### Task 1: Stub\n",
    );
    writeFixture(
      tmp,
      ".context-index/lifecycle-state/foo.jsonl",
      JSON.stringify({
        ts: "2020-01-01T00:00:00.000Z",
        event: "plan_task",
        plan: ".context-index/specs/features/x/foo.plan.md",
        task_id: "t1",
        status: "pending",
        notes: null,
      }) + "\n",
    );
    execSync("git add -A && git commit -m 'init'", { cwd: tmp, stdio: "ignore" });

    // Modify the plan file with a tracked commit — this creates the M event.
    writeFixture(
      tmp,
      ".context-index/specs/features/x/foo.plan.md",
      "<!-- DO NOT EDIT statuses inline -->\n# Plan: foo\n\n### Task 1: Stub\n",
    );
    execSync("git add -A && git commit -m 'stamp header'", { cwd: tmp, stdio: "ignore" });
    const modHash = execSync("git rev-parse HEAD", { cwd: tmp, encoding: "utf8" }).trim();

    // Without exemption: one violation expected.
    const { detectMutatedPlans } = await import(
      "../../lib/plan-immutability.mjs"
    );
    const beforeExempt = await detectMutatedPlans(tmp);
    assert.equal(beforeExempt.length, 1, "expected one violation before exempt-list applied");

    // With exemption recorded in manifest.yaml: violation suppressed.
    writeFixture(
      tmp,
      ".context-index/manifest.yaml",
      `hygiene:\n  plan_immutability:\n    exempt_commits:\n      - "${modHash}"\n`,
    );
    const afterExempt = await detectMutatedPlans(tmp);
    assert.deepEqual(afterExempt, [], "exempt_commits should suppress the violation");
  } finally {
    cleanupTempDir(tmp);
  }
});

// ────────────────────────────────────────────────────────────────────────
// Rewrite-durable exemptions (exempt_patch_ids)
//
// A commit SHA does not survive a history rewrite. `git filter-branch`, a
// rebase, or a squash merge re-hashes every commit it touches, so an
// `exempt_commits` entry recorded beforehand silently stops matching and the
// exemption evaporates. This is not hypothetical: every SHA in this repo's
// own exempt_commits list was orphaned by a filter-branch, which is what made
// `real repo has no violations` go red with 25 violations.
//
// `git patch-id --stable` hashes the diff rather than the commit, so it is
// invariant under rewriting.
// ────────────────────────────────────────────────────────────────────────

test("plan-immutability: exempt_commits stops matching after a history rewrite, exempt_patch_ids survives", async () => {
  const { execSync, execFileSync } = await import("node:child_process");
  const tmp = createTempDir();
  try {
    execSync("git init -b main", { cwd: tmp, stdio: "ignore" });
    execSync('git config user.email "test@test.com"', { cwd: tmp, stdio: "ignore" });
    execSync('git config user.name "Test"', { cwd: tmp, stdio: "ignore" });
    execSync("git config commit.gpgsign false", { cwd: tmp, stdio: "ignore" });

    writeFixture(tmp, ".context-index/specs/features/x/foo.plan.md", "# Plan: foo\n\n### Task 1: Stub\n");
    writeFixture(
      tmp,
      ".context-index/lifecycle-state/foo.jsonl",
      JSON.stringify({
        ts: "2020-01-01T00:00:00.000Z",
        event: "plan_task",
        plan: ".context-index/specs/features/x/foo.plan.md",
        task_id: "t1",
        status: "pending",
        notes: null,
      }) + "\n",
    );
    execSync("git add -A && git commit -m 'init'", { cwd: tmp, stdio: "ignore" });

    writeFixture(
      tmp,
      ".context-index/specs/features/x/foo.plan.md",
      "<!-- DO NOT EDIT statuses inline -->\n# Plan: foo\n\n### Task 1: Stub\n",
    );
    execSync("git add -A && git commit -m 'stamp header'", { cwd: tmp, stdio: "ignore" });

    const shaBefore = execSync("git rev-parse HEAD", { cwd: tmp, encoding: "utf8" }).trim();
    const patch = execFileSync("git", ["show", shaBefore, "--format=", "--patch"], {
      cwd: tmp,
      encoding: "utf8",
    });
    const patchId = execFileSync("git", ["patch-id", "--stable"], {
      cwd: tmp,
      input: patch,
      encoding: "utf8",
    })
      .trim()
      .split(" ")[0];

    // Rewrite history. `--amend` re-hashes the commit while leaving the diff
    // byte-identical — the same effect a rebase or filter-branch has, minus
    // the ceremony.
    execSync("git commit --amend --no-edit -m 'stamp header (rewritten)'", {
      cwd: tmp,
      stdio: "ignore",
    });
    const shaAfter = execSync("git rev-parse HEAD", { cwd: tmp, encoding: "utf8" }).trim();
    assert.notEqual(shaAfter, shaBefore, "amend must produce a new SHA for this test to mean anything");

    const { detectMutatedPlans } = await import("../../lib/plan-immutability.mjs");

    // The pre-rewrite SHA is now stale. This is the regression: the exemption
    // was recorded and approved, yet the violation fires again.
    writeFixture(
      tmp,
      ".context-index/manifest.yaml",
      `hygiene:\n  plan_immutability:\n    exempt_commits:\n      - "${shaBefore}"\n`,
    );
    const staleSha = await detectMutatedPlans(tmp);
    assert.equal(
      staleSha.length,
      1,
      "a SHA-keyed exemption must go stale after a rewrite (guards the premise of this test)",
    );

    // The patch id is unchanged by the rewrite, so the exemption still applies.
    writeFixture(
      tmp,
      ".context-index/manifest.yaml",
      `hygiene:\n  plan_immutability:\n    exempt_patch_ids:\n      - "${patchId}"\n`,
    );
    assert.deepEqual(
      await detectMutatedPlans(tmp),
      [],
      "exempt_patch_ids must survive the rewrite and suppress the violation",
    );

    // Both lists together: either may match.
    writeFixture(
      tmp,
      ".context-index/manifest.yaml",
      `hygiene:\n  plan_immutability:\n    exempt_commits:\n      - "${shaBefore}"\n    exempt_patch_ids:\n      - "${patchId}"\n`,
    );
    assert.deepEqual(
      await detectMutatedPlans(tmp),
      [],
      "both lists must be read when present, matching if either hits",
    );

    // An unrelated patch id must not suppress anything.
    writeFixture(
      tmp,
      ".context-index/manifest.yaml",
      `hygiene:\n  plan_immutability:\n    exempt_patch_ids:\n      - "${"0".repeat(40)}"\n`,
    );
    assert.equal(
      (await detectMutatedPlans(tmp)).length,
      1,
      "a non-matching patch id must not suppress a real violation",
    );
  } finally {
    cleanupTempDir(tmp);
  }
});

// ────────────────────────────────────────────────────────────────────────
// Nested-root git history leak
//
// When projectRoot is not itself a working-tree root, git resolves upward and
// answers about the ENCLOSING repository. A checked-in fixture then inherits
// every commit that ever touched it in the parent repo, and a deliberately
// backdated mtime is ignored in favour of the parent's commit date. That is
// what made `clean fixture with no inline Routing and no sidecar` go red.
// ────────────────────────────────────────────────────────────────────────

test("plan-immutability: a nested project root does not inherit the enclosing repo's history", async () => {
  const { execSync } = await import("node:child_process");
  const tmp = createTempDir();
  try {
    execSync("git init -b main", { cwd: tmp, stdio: "ignore" });
    execSync('git config user.email "test@test.com"', { cwd: tmp, stdio: "ignore" });
    execSync('git config user.name "Test"', { cwd: tmp, stdio: "ignore" });
    execSync("git config commit.gpgsign false", { cwd: tmp, stdio: "ignore" });

    // The fixture is a "project" nested inside the outer repo, exactly like
    // tests/fixtures/plan-immutability/* inside this repo.
    const nested = "fixture/.context-index";
    writeFixture(tmp, `${nested}/specs/features/x/foo.plan.md`, "# Plan: foo\n\n### Task 1: Stub\n");
    writeFixture(
      tmp,
      `${nested}/lifecycle-state/foo.jsonl`,
      JSON.stringify({
        ts: "2020-01-01T00:00:00.000Z",
        event: "plan_task",
        plan: "fixture/.context-index/specs/features/x/foo.plan.md",
        task_id: "t1",
        status: "pending",
        notes: null,
      }) + "\n",
    );
    execSync("git add -A && git commit -m 'add fixture'", { cwd: tmp, stdio: "ignore" });

    // Someone later edits the fixture in the OUTER repo. This is an M-commit
    // dated now — far after the fixture's synthetic 2020 pending event.
    writeFixture(
      tmp,
      `${nested}/specs/features/x/foo.plan.md`,
      "# Plan: foo\n\n### Task 1: Stub\n\n<!-- touched later -->\n",
    );
    execSync("git add -A && git commit -m 'edit fixture'", { cwd: tmp, stdio: "ignore" });

    // Backdate the mtime the way the fixture-based tests do.
    const past = new Date("2019-01-01T00:00:00.000Z");
    utimesSync(join(tmp, `${nested}/specs/features/x/foo.plan.md`), past, past);

    const { detectMutatedPlans } = await import("../../lib/plan-immutability.mjs");
    const violations = await detectMutatedPlans(join(tmp, "fixture"));
    assert.deepEqual(
      violations,
      [],
      `the enclosing repo's history must not be attributed to a nested project root; got: ${JSON.stringify(violations)}`,
    );

    // Control: the same detector run at the actual working-tree root DOES see
    // the modification, so the guard above is narrow rather than a blanket
    // disabling of the git branch.
    writeFixture(tmp, ".context-index/specs/features/x/bar.plan.md", "# Plan: bar\n");
    writeFixture(
      tmp,
      ".context-index/lifecycle-state/bar.jsonl",
      JSON.stringify({
        ts: "2020-01-01T00:00:00.000Z",
        event: "plan_task",
        plan: ".context-index/specs/features/x/bar.plan.md",
        task_id: "t1",
        status: "pending",
        notes: null,
      }) + "\n",
    );
    execSync("git add -A && git commit -m 'add bar'", { cwd: tmp, stdio: "ignore" });
    writeFixture(tmp, ".context-index/specs/features/x/bar.plan.md", "# Plan: bar\n\nmutated\n");
    execSync("git add -A && git commit -m 'mutate bar'", { cwd: tmp, stdio: "ignore" });

    const atRoot = await detectMutatedPlans(tmp);
    assert.equal(
      atRoot.filter((v) => v.path && v.path.endsWith("bar.plan.md")).length,
      1,
      "a genuine post-pending modification at the working-tree root must still be detected",
    );
  } finally {
    cleanupTempDir(tmp);
  }
});
