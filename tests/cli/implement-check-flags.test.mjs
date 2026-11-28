// `adev implement check-flags` is /adev:implement's first action: it rejects
// conflicting tier flags and malformed risk policies before any lifecycle event
// exists, captures the run's single `run_base` commit, and reports whether
// `lite` is authorized and by what. Every case runs the real CLI in a temp git
// repo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";

const CLI = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..", "cli", "index.mjs");
const ENV = { ...process.env, NODE_OPTIONS: "" };

const SPEC = ".context-index/specs/features/demo/demo.spec.md";
const POLICIES_REL = ".context-index/governance/risk-policies.yaml";
const LIFECYCLE_DIR = ".context-index/lifecycle-state";

const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();

function write(dir, rel, text) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
}

function fixtureRepo(t, { riskLevel = "medium", policies } = {}) {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  write(dir, ".context-index/manifest.yaml", "project:\n  name: t\n");
  write(dir, SPEC, `---\nrisk_level: ${riskLevel}\n---\n# Demo\n`);
  if (policies !== undefined) write(dir, POLICIES_REL, policies);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  return dir;
}

function checkFlags(cwd, ...args) {
  return spawnSync("node", [CLI, "implement", "check-flags", ...args], { cwd, encoding: "utf8", env: ENV });
}

function okJson(r, dir) {
  assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.equal(existsSync(join(dir, LIFECYCLE_DIR)), false, "check-flags writes no lifecycle event");
  return JSON.parse(r.stdout);
}

const FLAG_CASES = [
  [["--lite", "--tier", "full"], "CONFLICTING_TIER_FLAGS"],
  [["--lite", "--tier", "quick"], "CONFLICTING_TIER_FLAGS"],
  [["--tier", "bogus"], "INVALID_TIER"],
  [["--tier", "Lite"], "INVALID_TIER"],
  [["--tier", ""], "INVALID_TIER"],
];

for (const [args, code] of FLAG_CASES) {
  test(`check-flags ${args.join(" ")} exits 1 with ${code} and writes no lifecycle event`, (t) => {
    const repo = fixtureRepo(t);
    const r = checkFlags(repo, "--spec", SPEC, ...args);
    assert.equal(r.status, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, new RegExp(code));
    assert.equal(r.stdout.trim(), "");
    assert.equal(existsSync(join(repo, LIFECYCLE_DIR)), false);
  });
}

const POLICY_CASES = [
  {
    label: "medium.implement_mode: bogus",
    body: "policies:\n  medium:\n    implement_mode: bogus\n",
    code: "INVALID_TIER",
    detail: /medium\.implement_mode/,
  },
  {
    label: "an unparseable risk-policies.yaml",
    body: "policies:\n  medium:\n    review_mode: full\n  : bad\n",
    code: "INVALID_TIER",
    detail: /does not parse/,
  },
  {
    label: "high.implement_mode: lite",
    body: "policies:\n  high:\n    implement_mode: lite\n",
    code: "LITE_NOT_ALLOWED_FOR_HIGH",
    detail: /high\.implement_mode/,
  },
];

for (const { label, body, code, detail } of POLICY_CASES) {
  test(`check-flags exits 1 with ${code} for ${label}, naming the run-base file, and writes no event`, (t) => {
    const repo = fixtureRepo(t, { policies: body });
    const head = git(repo, "rev-parse", "HEAD");
    const r = checkFlags(repo, "--spec", SPEC, "--lite");
    assert.equal(r.status, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, new RegExp(code));
    assert.match(r.stderr, detail);
    assert.ok(r.stderr.includes(`run-base:${head}:${POLICIES_REL}`), r.stderr);
    assert.equal(r.stdout.trim(), "");
    assert.equal(existsSync(join(repo, LIFECYCLE_DIR)), false);
  });
}

test("valid input prints { lite_authorized, lite_source, tier, run_base, warnings } with run_base = HEAD", (t) => {
  const repo = fixtureRepo(t);
  const out = okJson(checkFlags(repo, "--spec", SPEC, "--lite"), repo);
  assert.deepEqual(Object.keys(out).sort(), ["lite_authorized", "lite_source", "run_base", "tier", "warnings"]);
  assert.equal(out.run_base, git(repo, "rev-parse", "HEAD"));
  assert.match(out.run_base, /^[0-9a-f]{40}$/);
  assert.equal(out.lite_authorized, true);
  assert.equal(out.lite_source, "flag");
  assert.equal(out.tier, "lite");
  assert.deepEqual(out.warnings, []);
});

test("--tier lite is the same authorization as --lite", (t) => {
  const repo = fixtureRepo(t);
  const out = okJson(checkFlags(repo, "--spec", SPEC, "--tier", "lite"), repo);
  assert.deepEqual(
    { lite_authorized: out.lite_authorized, lite_source: out.lite_source, tier: out.tier },
    { lite_authorized: true, lite_source: "flag", tier: "lite" },
  );
});

test("--lite --tier lite is not a conflict", (t) => {
  const repo = fixtureRepo(t);
  const out = okJson(checkFlags(repo, "--spec", SPEC, "--lite", "--tier", "lite"), repo);
  assert.equal(out.lite_source, "flag");
});

test("no flag and no policy: lite not authorized, tier null, no warnings", (t) => {
  const repo = fixtureRepo(t);
  const out = okJson(checkFlags(repo, "--spec", SPEC), repo);
  assert.deepEqual(out, {
    lite_authorized: false,
    lite_source: null,
    tier: null,
    run_base: git(repo, "rev-parse", "HEAD"),
    warnings: [],
  });
});

test("policy authorization: no flag, medium implement_mode lite → lite_source policy", (t) => {
  const repo = fixtureRepo(t, { policies: "policies:\n  medium:\n    implement_mode: lite\n" });
  const out = okJson(checkFlags(repo, "--spec", SPEC), repo);
  assert.equal(out.lite_authorized, true);
  assert.equal(out.lite_source, "policy");
  assert.equal(out.tier, null);
});

test("policy authorization follows the spec's risk level", (t) => {
  const policies = "policies:\n  medium:\n    implement_mode: quick\n  low:\n    implement_mode: lite\n";
  const low = fixtureRepo(t, { riskLevel: "low", policies });
  assert.equal(okJson(checkFlags(low, "--spec", SPEC), low).lite_source, "policy");
  const medium = fixtureRepo(t, { riskLevel: "medium", policies });
  assert.equal(okJson(checkFlags(medium, "--spec", SPEC), medium).lite_authorized, false);
});

for (const tier of ["quick", "full"]) {
  test(`--tier ${tier} with policy lite → lite_authorized false`, (t) => {
    const repo = fixtureRepo(t, { policies: "policies:\n  medium:\n    implement_mode: lite\n" });
    const out = okJson(checkFlags(repo, "--spec", SPEC, "--tier", tier), repo);
    assert.equal(out.lite_authorized, false);
    assert.equal(out.lite_source, null);
    assert.equal(out.tier, tier);
  });
}

test("--lite --parallel → warnings includes LITE_SUPPRESSED_PARALLEL; lite_authorized stays true", (t) => {
  const repo = fixtureRepo(t);
  const out = okJson(checkFlags(repo, "--spec", SPEC, "--lite", "--parallel"), repo);
  assert.equal(out.lite_authorized, true);
  assert.equal(out.lite_source, "flag");
  assert.deepEqual(out.warnings.map((w) => w.code), ["LITE_SUPPRESSED_PARALLEL"]);
  assert.match(out.warnings[0].message, /--parallel/);
});

test("policy-authorized lite with --parallel also warns LITE_SUPPRESSED_PARALLEL", (t) => {
  const repo = fixtureRepo(t, { policies: "policies:\n  medium:\n    implement_mode: lite\n" });
  const out = okJson(checkFlags(repo, "--spec", SPEC, "--parallel"), repo);
  assert.deepEqual(out.warnings.map((w) => w.code), ["LITE_SUPPRESSED_PARALLEL"]);
});

test("--parallel without lite authorization adds no warning", (t) => {
  const repo = fixtureRepo(t);
  const out = okJson(checkFlags(repo, "--spec", SPEC, "--parallel"), repo);
  assert.equal(out.lite_authorized, false);
  assert.deepEqual(out.warnings, []);
});

// Authorization comes from run_base, but `adev test-policy resolve` reads the
// working-tree file, so a malformed uncommitted edit must still stop the run
// here, before any lifecycle event exists.
for (const { label, body, code } of [
  { label: "an out-of-set implement_mode", body: "policies:\n  medium:\n    implement_mode: bogus\n", code: "INVALID_TIER" },
  { label: "an unparseable file", body: "policies:\n  medium:\n    review_mode: full\n  : bad\n", code: "INVALID_TIER" },
  { label: "high.implement_mode: lite", body: "policies:\n  high:\n    implement_mode: lite\n", code: "LITE_NOT_ALLOWED_FOR_HIGH" },
]) {
  test(`an uncommitted working-tree policy with ${label} exits 1 with ${code}, naming the working-tree file`, (t) => {
    const repo = fixtureRepo(t, { policies: "policies:\n  medium:\n    implement_mode: lite\n" });
    write(repo, POLICIES_REL, body);
    const r = checkFlags(repo, "--spec", SPEC);
    assert.equal(r.status, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, new RegExp(code));
    assert.ok(r.stderr.includes(POLICIES_REL), r.stderr);
    assert.equal(r.stderr.includes("run-base:"), false, "the error must name the working-tree file");
    assert.equal(r.stdout.trim(), "");
    assert.equal(existsSync(join(repo, LIFECYCLE_DIR)), false);
  });
}

test("an uncommitted valid policy edit keeps the run_base authorization and warns POLICY_UNCOMMITTED_CHANGES", (t) => {
  const repo = fixtureRepo(t, { policies: "policies:\n  medium:\n    implement_mode: lite\n" });
  write(repo, POLICIES_REL, "policies:\n  medium:\n    implement_mode: quick\n");
  const out = okJson(checkFlags(repo, "--spec", SPEC), repo);
  assert.equal(out.lite_authorized, true);
  assert.equal(out.lite_source, "policy");
  assert.deepEqual(out.warnings.map((w) => w.code), ["POLICY_UNCOMMITTED_CHANGES"]);
  assert.ok(out.warnings[0].message.includes(out.run_base), out.warnings[0].message);
  assert.ok(out.warnings[0].message.includes(POLICIES_REL), out.warnings[0].message);
});

test("a policy file present only in the working tree does not authorize lite and warns POLICY_UNCOMMITTED_CHANGES", (t) => {
  const repo = fixtureRepo(t);
  write(repo, POLICIES_REL, "policies:\n  medium:\n    implement_mode: lite\n");
  const out = okJson(checkFlags(repo, "--spec", SPEC), repo);
  assert.equal(out.lite_authorized, false);
  assert.equal(out.lite_source, null);
  assert.deepEqual(out.warnings.map((w) => w.code), ["POLICY_UNCOMMITTED_CHANGES"]);
});

test("a committed policy unchanged in the working tree adds no warning", (t) => {
  const repo = fixtureRepo(t, { policies: "policies:\n  medium:\n    implement_mode: lite\n" });
  const out = okJson(checkFlags(repo, "--spec", SPEC), repo);
  assert.deepEqual(out.warnings, []);
});

test("a working-tree policy that differs from run_base only in CRLF line endings adds no warning", (t) => {
  const committed = "policies:\n  medium:\n    implement_mode: lite\n";
  const repo = fixtureRepo(t, { policies: committed });
  write(repo, POLICIES_REL, committed.replace(/\n/g, "\r\n"));
  const out = okJson(checkFlags(repo, "--spec", SPEC), repo);
  assert.equal(out.lite_source, "policy");
  assert.deepEqual(out.warnings, []);
});

test("a committed out-of-set test_depth exits 1 with INVALID_TEST_DEPTH", (t) => {
  const repo = fixtureRepo(t, { policies: "policies:\n  medium:\n    test_depth: bogus\n" });
  const r = checkFlags(repo, "--spec", SPEC);
  assert.equal(r.status, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.match(r.stderr, /INVALID_TEST_DEPTH/);
  assert.equal(existsSync(join(repo, LIFECYCLE_DIR)), false);
});

test("check-flags without --spec exits 1", (t) => {
  const repo = fixtureRepo(t);
  const r = checkFlags(repo, "--lite");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--spec/);
});

test("check-flags with an unreadable --spec exits 1 with INVALID_SPEC_PATH", (t) => {
  const repo = fixtureRepo(t);
  const r = checkFlags(repo, "--spec", "missing.spec.md");
  assert.equal(r.status, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.match(r.stderr, /INVALID_SPEC_PATH/);
  assert.equal(existsSync(join(repo, LIFECYCLE_DIR)), false);
});

test("check-flags outside a git repository exits 1 with RUN_BASE_UNAVAILABLE", (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  write(dir, ".context-index/manifest.yaml", "project:\n  name: t\n");
  write(dir, SPEC, "---\nrisk_level: medium\n---\n# Demo\n");
  const r = checkFlags(dir, "--spec", SPEC);
  assert.equal(r.status, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.match(r.stderr, /RUN_BASE_UNAVAILABLE/);
  assert.equal(r.stdout.trim(), "");
  assert.equal(existsSync(join(dir, LIFECYCLE_DIR)), false);
});

test("adev implement --help lists check-flags", (t) => {
  const repo = fixtureRepo(t);
  const r = spawnSync("node", [CLI, "implement", "--help"], { cwd: repo, encoding: "utf8", env: ENV });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /check-flags --spec <spec-path> \[--lite\] \[--tier full\|quick\|lite\] \[--parallel\]/);
  assert.match(r.stdout, /CONFLICTING_TIER_FLAGS/);
  assert.match(r.stdout, /INVALID_TEST_DEPTH/);
  assert.doesNotMatch(r.stdout, /never from the working tree/);
});
