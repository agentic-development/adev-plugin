/**
 * Realpath containment for board-path consumers (GitHub board spec BEH-39, BEH-37,
 * BEH-32): a `spec_ref` / `plan_ref` that resolves outside the repository — through
 * a symlink, a `..` segment, an absolute path, or not at all — is refused before the
 * file is read.
 *
 * The primary assertions drive `adev verify issue` as a subprocess. The outside
 * targets are written so the verifier would accept them, so a followed symlink
 * shows up as `completed: true`; the mode-000 variants prove the file is never
 * opened (reading one makes the verb exit 1).
 *
 * The recorder cases call the exported pure `fixturePath()` only: no spawn, no
 * `gh`, no token, no network.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";
import { verifyIssueCompleted, CONFIDENCE } from "../../lib/reality-check.mjs";
import { FIXTURES_REL, fixturePath } from "../../scripts/record-github-fixtures.mjs";

const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");

const SPEC_REFUSAL = { completed: false, confidence: CONFIDENCE.NONE, reason: "spec_ref resolves outside the repository" };
const PLAN_REFUSAL = { completed: false, confidence: CONFIDENCE.NONE, reason: "plan_ref resolves outside the repository" };

// Doubles as its own plan (a path without `.spec.md` maps to itself), naming one
// committed in-repo file: verifySpecImplemented accepts it at medium confidence.
const ACCEPTED_SPEC = "# Spec\n\n**Create:**\n- `src/a.mjs` — implementation\n---\n";
const ACCEPTED_PLAN = "# Plan\n\n### Task 1: Do it\n- [x] write\n- [x] verify\n";

const dirs = [];
after(() => dirs.forEach(cleanupTempDir));

/**
 * outer/
 *   repo/      git repo: committed src/a.mjs, an accepted in-repo spec and plan
 *   outside/   accepted spec.md and plan.md, plus mode-000 copies
 *   x.md       accepted spec, reachable from the repo as `../x.md`
 */
function layout() {
  const outer = createTempDir();
  dirs.push(outer);
  const repo = join(outer, "repo");
  const outside = join(outer, "outside");
  mkdirSync(repo);
  writeFixture(repo, ".context-index/manifest.yaml", 'project:\n  name: t\n  adev_version: "0.22.0"\n');
  writeFixture(repo, "src/a.mjs", "export const a = 1;\n");
  writeFixture(repo, ".context-index/specs/m/a.spec.md", "---\nstatus: implemented\n---\n# A\n");
  writeFixture(repo, ".context-index/specs/m/a.plan.md", ACCEPTED_SPEC);
  writeFixture(repo, "plans/real.plan.md", ACCEPTED_PLAN);
  execSync("git init -q -b main && git config user.email t@t.t && git config user.name t && git config commit.gpgsign false && git add -A && git commit -q -m init", { cwd: repo, stdio: "ignore" });

  writeFixture(outside, "spec.md", ACCEPTED_SPEC);
  writeFixture(outside, "plan.md", ACCEPTED_PLAN);
  writeFixture(outside, "locked-spec.md", ACCEPTED_SPEC);
  writeFixture(outside, "locked-plan.md", ACCEPTED_PLAN);
  chmodSync(join(outside, "locked-spec.md"), 0o000);
  chmodSync(join(outside, "locked-plan.md"), 0o000);
  writeFixture(outer, "x.md", ACCEPTED_SPEC);

  mkdirSync(join(repo, "docs"));
  symlinkSync(outside, join(repo, "docs", "evil"));
  symlinkSync(join(outside, "never-created.md"), join(repo, "docs", "dangling.md"));
  symlinkSync(join(repo, "plans", "real.plan.md"), join(repo, "docs", "plan-alias.md"));

  // In-repo specs whose derived sibling `.plan.md` is a symlink.
  const unplannedSpec = "---\nstatus: implemented\n---\n# Sibling\n";
  writeFixture(repo, "docs/a.spec.md", unplannedSpec);
  symlinkSync(join(outside, "spec.md"), join(repo, "docs", "a.plan.md"));
  writeFixture(repo, "docs/b.spec.md", unplannedSpec);
  symlinkSync(join(outside, "locked-spec.md"), join(repo, "docs", "b.plan.md"));
  writeFixture(repo, "docs/c.spec.md", unplannedSpec);
  symlinkSync(join(repo, ".context-index", "specs", "m", "a.plan.md"), join(repo, "docs", "c.plan.md"));
  return { outer, repo, outside };
}

function verifyIssue(repo, issue) {
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  const r = spawnSync("node", [CLI, "verify", "issue", "--issue-json", JSON.stringify(issue)], {
    cwd: repo,
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
  return { status: r.status, stderr: r.stderr, result: r.status === 0 ? JSON.parse(r.stdout) : null };
}

// ── spec_ref ────────────────────────────────────────────────────────────────

test("spec_ref through a directory symlink to an accepted outside spec is refused", () => {
  const { repo } = layout();
  const r = verifyIssue(repo, { title: "t", spec_ref: "docs/evil/spec.md" });
  assert.equal(r.status, 0, `verify issue exited ${r.status}: ${r.stderr}`);
  assert.deepEqual(r.result, SPEC_REFUSAL);
});

test("spec_ref through a directory symlink is refused without opening the outside file", () => {
  const { repo } = layout();
  const r = verifyIssue(repo, { title: "t", spec_ref: "docs/evil/locked-spec.md" });
  assert.equal(r.status, 0, `verify issue exited ${r.status}: ${r.stderr}`);
  assert.deepEqual(r.result, SPEC_REFUSAL);
});

test("spec_ref with a `..` segment to an accepted spec outside the repo is refused", () => {
  const { repo } = layout();
  const r = verifyIssue(repo, { title: "t", spec_ref: "../x.md" });
  assert.equal(r.status, 0, `verify issue exited ${r.status}: ${r.stderr}`);
  assert.deepEqual(r.result, SPEC_REFUSAL);
});

test("spec_ref given as an absolute path outside the repo is refused", () => {
  const { repo, outside } = layout();
  const r = verifyIssue(repo, { title: "t", spec_ref: join(outside, "spec.md") });
  assert.equal(r.status, 0, `verify issue exited ${r.status}: ${r.stderr}`);
  assert.deepEqual(r.result, SPEC_REFUSAL);
});

test("spec_ref that does not exist is refused the same way", () => {
  const { repo } = layout();
  const r = verifyIssue(repo, { title: "t", spec_ref: ".context-index/specs/m/missing.spec.md" });
  assert.equal(r.status, 0, `verify issue exited ${r.status}: ${r.stderr}`);
  assert.deepEqual(r.result, SPEC_REFUSAL);
});

test("spec_ref that is a dangling symlink pointing outside is refused", () => {
  const { repo } = layout();
  const r = verifyIssue(repo, { title: "t", spec_ref: "docs/dangling.md" });
  assert.equal(r.status, 0, `verify issue exited ${r.status}: ${r.stderr}`);
  assert.deepEqual(r.result, SPEC_REFUSAL);
});

test("an in-repo spec whose sibling .plan.md is a symlink to an accepted outside plan is refused", () => {
  const { repo } = layout();
  const r = verifyIssue(repo, { title: "t", spec_ref: "docs/a.spec.md" });
  assert.equal(r.status, 0, `verify issue exited ${r.status}: ${r.stderr}`);
  assert.deepEqual(r.result, SPEC_REFUSAL);
});

test("an in-repo spec whose sibling .plan.md links outside is refused without opening that plan", () => {
  const { repo } = layout();
  const r = verifyIssue(repo, { title: "t", spec_ref: "docs/b.spec.md" });
  assert.equal(r.status, 0, `verify issue exited ${r.status}: ${r.stderr}`);
  assert.deepEqual(r.result, SPEC_REFUSAL);
});

test("an in-repo sibling .plan.md reached through an in-repo symlink is still used", () => {
  const { repo } = layout();
  const r = verifyIssue(repo, { title: "t", spec_ref: "docs/c.spec.md" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.result, {
    completed: true,
    confidence: CONFIDENCE.MEDIUM,
    reason: "Spec implementation verified (medium confidence)",
  });
});

test("a spec_ref or plan_ref naming an in-repo directory is refused, not crashed on", () => {
  const { repo } = layout();
  const spec = verifyIssue(repo, { title: "t", spec_ref: "src" });
  assert.equal(spec.status, 0, `verify issue exited ${spec.status}: ${spec.stderr}`);
  assert.deepEqual(spec.result, SPEC_REFUSAL);
  const plan = verifyIssue(repo, { title: "t", plan_ref: "plans", plan_task: 1 });
  assert.equal(plan.status, 0, `verify issue exited ${plan.status}: ${plan.stderr}`);
  assert.deepEqual(plan.result, PLAN_REFUSAL);
});

test("a normal in-repo spec_ref still verifies", () => {
  const { repo } = layout();
  const r = verifyIssue(repo, { title: "t", spec_ref: ".context-index/specs/m/a.spec.md" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.result, {
    completed: true,
    confidence: CONFIDENCE.MEDIUM,
    reason: "Spec implementation verified (medium confidence)",
  });
});

// ── plan_ref ────────────────────────────────────────────────────────────────

test("plan_ref through a directory symlink to an accepted outside plan is refused", () => {
  const { repo } = layout();
  const r = verifyIssue(repo, { title: "t", plan_ref: "docs/evil/plan.md", plan_task: 1 });
  assert.equal(r.status, 0, `verify issue exited ${r.status}: ${r.stderr}`);
  assert.deepEqual(r.result, PLAN_REFUSAL);
});

test("plan_ref through a directory symlink is refused without opening the outside file", () => {
  const { repo } = layout();
  const r = verifyIssue(repo, { title: "t", plan_ref: "docs/evil/locked-plan.md", plan_task: 1 });
  assert.equal(r.status, 0, `verify issue exited ${r.status}: ${r.stderr}`);
  assert.deepEqual(r.result, PLAN_REFUSAL);
});

test("plan_ref with a `..` segment outside the repo is refused", () => {
  const { repo } = layout();
  const r = verifyIssue(repo, { title: "t", plan_ref: "../outside/plan.md", plan_task: 1 });
  assert.equal(r.status, 0, `verify issue exited ${r.status}: ${r.stderr}`);
  assert.deepEqual(r.result, PLAN_REFUSAL);
});

test("plan_ref that does not exist is refused the same way", () => {
  const { repo } = layout();
  const r = verifyIssue(repo, { title: "t", plan_ref: "plans/missing.plan.md", plan_task: 1 });
  assert.equal(r.status, 0, `verify issue exited ${r.status}: ${r.stderr}`);
  assert.deepEqual(r.result, PLAN_REFUSAL);
});

test("a refused plan_ref does not fall through to a valid spec_ref", () => {
  const { repo } = layout();
  const r = verifyIssue(repo, { title: "t", plan_ref: "docs/evil/plan.md", plan_task: 1, spec_ref: ".context-index/specs/m/a.spec.md" });
  assert.equal(r.status, 0, `verify issue exited ${r.status}: ${r.stderr}`);
  assert.deepEqual(r.result, PLAN_REFUSAL);
});

test("a normal in-repo plan_ref still verifies, including through an in-repo symlink", () => {
  const { repo } = layout();
  const expected = { completed: true, confidence: CONFIDENCE.MEDIUM, reason: "All 2 checkboxes checked" };
  for (const planRef of ["plans/real.plan.md", "docs/plan-alias.md"]) {
    const r = verifyIssue(repo, { title: "t", plan_ref: planRef, plan_task: 1 });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.result, expected, planRef);
  }
});

// ── library supplement: the root itself reached through a symlink ───────────

test("verifyIssueCompleted realpaths the root too: a symlinked projectRoot keeps in-repo refs valid", () => {
  const { outer, repo } = layout();
  const alias = join(outer, "repo-alias");
  symlinkSync(repo, alias);
  assert.deepEqual(verifyIssueCompleted({ title: "t", plan_ref: "plans/real.plan.md", plan_task: 1 }, { projectRoot: alias }), {
    completed: true,
    confidence: CONFIDENCE.MEDIUM,
    reason: "All 2 checkboxes checked",
  });
  assert.deepEqual(verifyIssueCompleted({ title: "t", spec_ref: "docs/evil/spec.md" }, { projectRoot: alias }), SPEC_REFUSAL);
});

// ── fixture recorder: fixturePath() only, never main() ──────────────────────

function recorderRoot() {
  const outer = createTempDir();
  dirs.push(outer);
  const root = join(outer, "repo");
  const outside = join(outer, "outside");
  mkdirSync(root);
  mkdirSync(outside);
  return { outer, root, outside };
}

test("fixturePath refuses a symlinked ancestor of the fixtures directory pointing outside", () => {
  const { root, outside } = recorderRoot();
  mkdirSync(join(outside, "conformance", "fixtures"), { recursive: true });
  mkdirSync(join(root, "tests"));
  symlinkSync(outside, join(root, "tests", "issues"));
  assert.throws(() => fixturePath(root, "a-case.json"), { code: "RECORDER_PATH_ESCAPE" });
});

test("fixturePath refuses a fixture file that is a symlink to an outside file", () => {
  const { root, outside } = recorderRoot();
  writeFixture(outside, "target.json", "{}\n");
  mkdirSync(join(root, FIXTURES_REL), { recursive: true });
  symlinkSync(join(outside, "target.json"), join(root, FIXTURES_REL, "a-case.json"));
  assert.throws(() => fixturePath(root, "a-case.json"), { code: "RECORDER_PATH_ESCAPE" });
});

test("fixturePath refuses a fixture file that is a dangling symlink pointing outside", () => {
  const { root, outside } = recorderRoot();
  mkdirSync(join(root, FIXTURES_REL), { recursive: true });
  symlinkSync(join(outside, "never-created.json"), join(root, FIXTURES_REL, "a-case.json"));
  assert.throws(() => fixturePath(root, "a-case.json"), { code: "RECORDER_PATH_ESCAPE" });
});

test("fixturePath accepts a repo root reached through a symlink and returns the real path it checked", () => {
  const { outer, root } = recorderRoot();
  mkdirSync(join(root, FIXTURES_REL), { recursive: true });
  const alias = join(outer, "repo-alias");
  symlinkSync(root, alias);
  assert.equal(fixturePath(alias, "a-case.json"), join(realpathSync(root), FIXTURES_REL, "a-case.json"));
});

test("fixturePath returns the real path when the fixtures directory does not exist yet", () => {
  const { outer, root } = recorderRoot();
  const alias = join(outer, "repo-alias");
  symlinkSync(root, alias);
  assert.equal(fixturePath(alias, "a-case.json"), join(realpathSync(root), FIXTURES_REL, "a-case.json"));
});

test("fixturePath writes through an in-fixtures symlink to its real target", () => {
  const { root } = recorderRoot();
  mkdirSync(join(root, FIXTURES_REL), { recursive: true });
  writeFixture(root, join(FIXTURES_REL, "target.json"), "{}\n");
  symlinkSync(join(root, FIXTURES_REL, "target.json"), join(root, FIXTURES_REL, "a-case.json"));
  assert.equal(fixturePath(root, "a-case.json"), join(realpathSync(root), FIXTURES_REL, "target.json"));
});

test("fixturePath refuses a file name carrying any path separator or a bare dot segment", () => {
  const { root } = recorderRoot();
  mkdirSync(join(root, FIXTURES_REL, "sub"), { recursive: true });
  for (const name of ["sub/a.json", "a\\b.json", "..", "."]) {
    assert.throws(() => fixturePath(root, name), { code: "RECORDER_PATH_ESCAPE" }, name);
  }
});
