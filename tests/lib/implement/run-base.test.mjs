// The run-base commit is the single source of implement's governance inputs for
// a whole run: an inline `lite` task edits the working tree, so anything read
// from disk mid-run could be changed by the task it is judging. These tests pin
// that commit ids are validated before git ever sees them, and that every read
// comes from the commit, never from the working tree.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateCommitId,
  readAtCommit,
  assertRepoRelative,
  loadGovernanceAtRunBase,
  loadPoliciesAtRunBase,
} from "../../../lib/implement/run-base.mjs";
import {
  parseRoutingSidecarText,
  readRoutingSidecar,
  sidecarPathFor,
} from "../../../lib/plan-routing-sidecar.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";

const REPO_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();

function write(dir, rel, text) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
}

function commitAll(dir, message) {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}

function initRepoWithCommit(t, files = { "README.md": "init\n" }) {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  for (const [rel, text] of Object.entries(files)) write(dir, rel, text);
  commitAll(dir, "base");
  return dir;
}

const POLICIES_REL = ".context-index/governance/risk-policies.yaml";
const SENSITIVE_REL = ".context-index/governance/sensitive-paths.yaml";
const BOUNDARIES_REL = ".context-index/governance/boundaries.yaml";
const PLAN_REL = ".context-index/specs/features/demo/demo.plan.md";
const SIDECAR_REL = ".context-index/specs/features/demo/demo.routing.json";

function sidecarBody(selectedAgent) {
  return JSON.stringify({
    version: 1,
    _generated_by: "test",
    entries: [
      {
        task_id: "t1",
        selected_agent: selectedAgent,
        scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.7, novelty: 0.6 },
        rationale: "seeded",
      },
    ],
  });
}

test("INVALID_COMMIT_ID for non-hex, short, leading-dash, unresolvable", (t) => {
  const repo = initRepoWithCommit(t);
  for (const bad of ["--output=x", "-abc", "abc123", "HEAD", "G".repeat(40), "a".repeat(40), "a".repeat(64), "", undefined]) {
    assert.throws(
      () => validateCommitId("--run-base", bad, { projectRoot: repo, kinds: ["commit"] }),
      (e) => e.code === "INVALID_COMMIT_ID" && /--run-base/.test(e.message),
      `expected INVALID_COMMIT_ID for ${JSON.stringify(bad)}`,
    );
  }
});

test("INVALID_COMMIT_ID rejects an uppercase spelling of a real commit id", (t) => {
  const repo = initRepoWithCommit(t);
  const head = git(repo, "rev-parse", "HEAD");
  assert.throws(
    () => validateCommitId("--run-base", head.toUpperCase(), { projectRoot: repo, kinds: ["commit"] }),
    { code: "INVALID_COMMIT_ID" },
  );
});

test("validateCommitId refuses a missing or empty kinds list with a coded error", (t) => {
  const repo = initRepoWithCommit(t);
  const head = git(repo, "rev-parse", "HEAD");
  for (const kinds of [undefined, [], "commit", [""]]) {
    assert.throws(
      () => validateCommitId("--run-base", head, { projectRoot: repo, kinds }),
      { code: "INVALID_COMMIT_KINDS" },
      `expected INVALID_COMMIT_KINDS for ${JSON.stringify(kinds)}`,
    );
  }
});

test("--run-base requires a commit; --base-sha accepts a commit or a tree", (t) => {
  const repo = initRepoWithCommit(t);
  const head = git(repo, "rev-parse", "HEAD");
  const tree = git(repo, "rev-parse", "HEAD^{tree}");
  const blob = git(repo, "rev-parse", "HEAD:README.md");
  assert.equal(validateCommitId("--run-base", head, { projectRoot: repo, kinds: ["commit"] }), head);
  assert.throws(
    () => validateCommitId("--run-base", tree, { projectRoot: repo, kinds: ["commit"] }),
    (e) => e.code === "INVALID_COMMIT_ID" && /--run-base/.test(e.message) && /commit/.test(e.message),
  );
  assert.equal(validateCommitId("--base-sha", tree, { projectRoot: repo, kinds: ["commit", "tree"] }), tree);
  assert.equal(validateCommitId("--base-sha", head, { projectRoot: repo, kinds: ["commit", "tree"] }), head);
  assert.throws(
    () => validateCommitId("--base-sha", blob, { projectRoot: repo, kinds: ["commit", "tree"] }),
    (e) => e.code === "INVALID_COMMIT_ID" && /--base-sha/.test(e.message),
  );
});

test("readAtCommit returns committed text, null when absent, ignores the working tree", (t) => {
  const repo = initRepoWithCommit(t, { "a/b.txt": "committed\n" });
  const head = git(repo, "rev-parse", "HEAD");
  write(repo, "a/b.txt", "edited in the working tree\n");
  write(repo, "a/new.txt", "untracked\n");
  assert.equal(readAtCommit(repo, head, "a/b.txt"), "committed\n");
  assert.equal(readAtCommit(repo, head, "a/new.txt"), null, "a file present only on disk is absent at the commit");
  assert.equal(readAtCommit(repo, head, "never/existed.yaml"), null);
});

// git translates its messages, so "absent" must not be decided from stderr
// text. The shim stands in for a localized git: it runs the real binary and
// rewrites the English path-absent messages to German.
function installLocalizedGitShim(t) {
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const binDir = createTempDir();
  t.after(() => cleanupTempDir(binDir));
  const shim = join(binDir, "git");
  writeFileSync(
    shim,
    [
      "#!/bin/sh",
      'err="$(mktemp)"',
      `${JSON.stringify(realGit)} "$@" 2>"$err"`,
      "status=$?",
      "sed -e 's/does not exist in/existiert nicht in/' -e 's/exists on disk, but not in/existiert auf der Festplatte, aber nicht in/' \"$err\" >&2",
      'rm -f "$err"',
      "exit $status",
      "",
    ].join("\n"),
  );
  chmodSync(shim, 0o755);
  const saved = { PATH: process.env.PATH, LC_ALL: process.env.LC_ALL, LANG: process.env.LANG };
  process.env.PATH = `${binDir}${delimiter}${process.env.PATH}`;
  process.env.LC_ALL = "de_DE.UTF-8";
  process.env.LANG = "de_DE.UTF-8";
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

test("readAtCommit returns null for an absent path under a localized git", (t) => {
  const repo = initRepoWithCommit(t, { "a/b.txt": "committed\n" });
  const head = git(repo, "rev-parse", "HEAD");
  write(repo, "a/new.txt", "untracked\n");
  installLocalizedGitShim(t);
  assert.equal(readAtCommit(repo, head, "never/existed.yaml"), null);
  assert.equal(readAtCommit(repo, head, "a/new.txt"), null);
  assert.equal(readAtCommit(repo, head, "a/b.txt"), "committed\n");
});

test("readAtCommit throws RUN_BASE_READ_FAILED when git cannot read the commit", (t) => {
  const notARepo = createTempDir();
  t.after(() => cleanupTempDir(notARepo));
  assert.throws(
    () => readAtCommit(notARepo, "a".repeat(40), ".context-index/governance/risk-policies.yaml"),
    (e) => e.code === "RUN_BASE_READ_FAILED" && e.message.includes("a".repeat(40)),
  );
  const repo = initRepoWithCommit(t);
  assert.throws(
    () => readAtCommit(repo, "b".repeat(40), "README.md"),
    { code: "RUN_BASE_READ_FAILED" },
  );
});

test("readAtCommit refuses a path that names a directory at the commit", (t) => {
  const repo = initRepoWithCommit(t, { "a/b.txt": "committed\n" });
  const head = git(repo, "rev-parse", "HEAD");
  assert.throws(() => readAtCommit(repo, head, "a"), { code: "RUN_BASE_READ_FAILED" });
});

test("readAtCommit refuses a path committed as a symlink instead of reading the link target", (t) => {
  const repo = initRepoWithCommit(t, { "real-policies.yaml": "policies:\n  medium:\n    implement_mode: full\n" });
  mkdirSync(join(repo, ".context-index/governance"), { recursive: true });
  symlinkSync("../../real-policies.yaml", join(repo, POLICIES_REL));
  write(repo, PLAN_REL, "# Plan\n");
  const runBase = commitAll(repo, "symlinked policy");
  assert.equal(git(repo, "ls-tree", runBase, "--", POLICIES_REL).split(" ")[0], "120000");
  assert.throws(
    () => readAtCommit(repo, runBase, POLICIES_REL),
    (e) => e.code === "RUN_BASE_READ_FAILED" && /symlink/.test(e.message),
  );
  assert.throws(
    () => loadGovernanceAtRunBase({ projectRoot: repo, runBase, planPath: PLAN_REL }),
    (e) => e.code === "RUN_BASE_READ_FAILED" && /symlink/.test(e.message),
  );
});

function withEnv(t, vars) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

for (const name of ["GIT_ICASE_PATHSPECS", "GIT_GLOB_PATHSPECS", "GIT_NOGLOB_PATHSPECS"]) {
  test(`readAtCommit reads a present file when the operator sets ${name}=1`, (t) => {
    const repo = initRepoWithCommit(t, { "a/b.txt": "committed\n" });
    const head = git(repo, "rev-parse", "HEAD");
    withEnv(t, { [name]: "1" });
    assert.equal(readAtCommit(repo, head, "a/b.txt"), "committed\n");
    assert.equal(readAtCommit(repo, head, "a/missing.txt"), null);
  });
}

test("readAtCommit matches the path literally, never as a glob", (t) => {
  const repo = initRepoWithCommit(t, { "a/b.txt": "committed\n" });
  const head = git(repo, "rev-parse", "HEAD");
  assert.equal(readAtCommit(repo, head, "a/*.txt"), null);
  assert.equal(readAtCommit(repo, head, "a/?.txt"), null);
});

test("readAtCommit resolves the path against a projectRoot nested below the repository top level", (t) => {
  const repo = initRepoWithCommit(t, {
    "sub/.context-index/governance/risk-policies.yaml": "nested\n",
    ".context-index/governance/risk-policies.yaml": "top level\n",
  });
  const head = git(repo, "rev-parse", "HEAD");
  assert.equal(readAtCommit(join(repo, "sub"), head, ".context-index/governance/risk-policies.yaml"), "nested\n");
  assert.equal(readAtCommit(join(repo, "sub"), head, "missing.yaml"), null);
});

test("readAtCommit refuses an unsafe path before invoking git", (t) => {
  const repo = initRepoWithCommit(t);
  const head = git(repo, "rev-parse", "HEAD");
  assert.throws(() => readAtCommit(repo, head, "../outside.txt"), { code: "INVALID_PLAN_PATH" });
});

test("assertRepoRelative rejects .., absolute, leading dash", () => {
  for (const p of ["../x", "/etc/passwd", "-x", "a/../../b", "..", "", undefined, ":(icase)x", ":/x", "./:x"]) {
    assert.throws(() => assertRepoRelative(p), { code: "INVALID_PLAN_PATH" }, `expected refusal for ${JSON.stringify(p)}`);
  }
});

test("assertRepoRelative returns the normalized path for a repo-relative input", () => {
  assert.equal(assertRepoRelative(".context-index/governance/risk-policies.yaml"), ".context-index/governance/risk-policies.yaml");
  assert.equal(assertRepoRelative("./a/./b.txt"), "a/b.txt");
  assert.equal(assertRepoRelative("a/x/../b.txt"), "a/b.txt");
});

test("loadGovernanceAtRunBase reads policies, boundaries, sensitive paths and sidecar from the commit", (t) => {
  const repo = initRepoWithCommit(t, {
    [POLICIES_REL]: "policies:\n  medium:\n    implement_mode: lite\n",
    [SENSITIVE_REL]: "sensitive_paths:\n  - src/payments/**\n",
    [BOUNDARIES_REL]: "boundaries:\n  - id: no-db\n    severity: error\n    pattern: 'src/db/'\n    exclude: []\n",
    [PLAN_REL]: "# Plan\n",
    [SIDECAR_REL]: sidecarBody("auto-agent"),
  });
  const runBase = git(repo, "rev-parse", "HEAD");

  write(repo, POLICIES_REL, "policies:\n  medium:\n    implement_mode: full\n");
  write(repo, SENSITIVE_REL, "sensitive_paths:\n  - src/other/**\n");
  write(repo, BOUNDARIES_REL, "boundaries:\n  - id: no-ui\n    severity: error\n    pattern: 'src/ui/'\n    exclude: []\n");
  write(repo, SIDECAR_REL, sidecarBody("human-only"));

  const result = loadGovernanceAtRunBase({ projectRoot: repo, runBase, planPath: PLAN_REL });
  assert.equal(result.policies.medium.implement_mode, "lite");
  assert.deepEqual(result.sensitivePaths, ["src/payments/**"]);
  assert.equal(result.boundaryCheck(["src/db/query.ts"]), true);
  assert.equal(result.boundaryCheck(["src/ui/view.ts"]), false);
  assert.equal(result.routingEntries.length, 1);
  assert.equal(result.routingEntries[0].selected_agent, "auto-agent");
  assert.deepEqual(result.warnings, []);
});

test("loadGovernanceAtRunBase accepts an absolute plan path inside the project", (t) => {
  const repo = initRepoWithCommit(t, { [PLAN_REL]: "# Plan\n", [SIDECAR_REL]: sidecarBody("auto-agent") });
  const runBase = git(repo, "rev-parse", "HEAD");
  const result = loadGovernanceAtRunBase({ projectRoot: repo, runBase, planPath: join(repo, PLAN_REL) });
  assert.equal(result.routingEntries[0].task_id, "t1");
});

test("loadGovernanceAtRunBase treats files absent at run_base exactly like files absent on disk", (t) => {
  const repo = initRepoWithCommit(t, { [PLAN_REL]: "# Plan\n" });
  const runBase = git(repo, "rev-parse", "HEAD");
  write(repo, POLICIES_REL, "policies:\n  medium:\n    implement_mode: lite\n");
  write(repo, SENSITIVE_REL, "sensitive_paths:\n  - src/payments/**\n");
  write(repo, BOUNDARIES_REL, "boundaries:\n  - id: no-db\n    severity: error\n    pattern: 'src/db/'\n    exclude: []\n");
  write(repo, SIDECAR_REL, sidecarBody("auto-agent"));

  const result = loadGovernanceAtRunBase({ projectRoot: repo, runBase, planPath: PLAN_REL });
  assert.equal(result.policies, null);
  assert.equal(result.sensitivePaths, undefined);
  assert.equal(result.boundaryCheck(["src/db/query.ts"]), false);
  assert.equal(result.routingEntries, null);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, "ROUTING_SIDECAR_MISSING");
  assert.equal(result.warnings[0].run_base, runBase);
  assert.match(result.warnings[0].message, new RegExp(runBase));
});

test("loadGovernanceAtRunBase throws INVALID_TIER naming run-base:<sha> for a malformed committed policy", (t) => {
  const repo = initRepoWithCommit(t, {
    [POLICIES_REL]: "policies:\n  medium:\n    implement_mode: bogus\n",
    [PLAN_REL]: "# Plan\n",
  });
  const runBase = git(repo, "rev-parse", "HEAD");
  write(repo, POLICIES_REL, "policies:\n  medium:\n    implement_mode: quick\n");
  assert.throws(
    () => loadGovernanceAtRunBase({ projectRoot: repo, runBase, planPath: PLAN_REL }),
    (e) => e.code === "INVALID_TIER" && e.message.includes(`run-base:${runBase}:${POLICIES_REL}`),
  );
});

test("loadGovernanceAtRunBase throws INVALID_SIDECAR_JSON for a malformed committed sidecar", (t) => {
  const repo = initRepoWithCommit(t, { [PLAN_REL]: "# Plan\n", [SIDECAR_REL]: "{ not json" });
  const runBase = git(repo, "rev-parse", "HEAD");
  write(repo, SIDECAR_REL, sidecarBody("auto-agent"));
  assert.throws(
    () => loadGovernanceAtRunBase({ projectRoot: repo, runBase, planPath: PLAN_REL }),
    (e) => e.code === "INVALID_SIDECAR_JSON" && e.message.includes(`run-base:${runBase}`),
  );
});

test("loadPoliciesAtRunBase returns the committed policies and text, ignoring the working tree", (t) => {
  const committed = "policies:\n  medium:\n    implement_mode: lite\n";
  const repo = initRepoWithCommit(t, { [POLICIES_REL]: committed });
  const runBase = git(repo, "rev-parse", "HEAD");
  write(repo, POLICIES_REL, "policies:\n  medium:\n    implement_mode: bogus\n");
  assert.deepEqual(loadPoliciesAtRunBase({ projectRoot: repo, runBase }), {
    policies: { medium: { implement_mode: "lite" } },
    text: committed,
    path: POLICIES_REL,
  });
});

test("loadPoliciesAtRunBase returns null policies and text when the file is absent at run_base", (t) => {
  const repo = initRepoWithCommit(t);
  const runBase = git(repo, "rev-parse", "HEAD");
  write(repo, POLICIES_REL, "policies:\n  medium:\n    implement_mode: lite\n");
  assert.deepEqual(loadPoliciesAtRunBase({ projectRoot: repo, runBase }), { policies: null, text: null, path: POLICIES_REL });
});

test("loadPoliciesAtRunBase labels a parse failure run-base:<sha>:<path> and validates runBase", (t) => {
  const repo = initRepoWithCommit(t, { [POLICIES_REL]: "policies:\n  high:\n    implement_mode: lite\n" });
  const runBase = git(repo, "rev-parse", "HEAD");
  assert.throws(
    () => loadPoliciesAtRunBase({ projectRoot: repo, runBase }),
    (e) => e.code === "LITE_NOT_ALLOWED_FOR_HIGH" && e.message.includes(`run-base:${runBase}:${POLICIES_REL}`),
  );
  const tree = git(repo, "rev-parse", "HEAD^{tree}");
  assert.throws(
    () => loadPoliciesAtRunBase({ projectRoot: repo, runBase: tree }),
    (e) => e.code === "INVALID_COMMIT_ID" && /--run-base/.test(e.message),
  );
});

test("loadGovernanceAtRunBase validates runBase as a commit id before reading", (t) => {
  const repo = initRepoWithCommit(t, { [PLAN_REL]: "# Plan\n" });
  assert.throws(
    () => loadGovernanceAtRunBase({ projectRoot: repo, runBase: "--output=x", planPath: PLAN_REL }),
    (e) => e.code === "INVALID_COMMIT_ID" && /--run-base/.test(e.message),
  );
});

test("parseRoutingSidecarText matches readRoutingSidecar on a real committed sidecar and on malformed input", (t) => {
  const planPath = join(REPO_ROOT, ".context-index/specs/features/implementation/batched-task-dispatch.plan.md");
  const p = sidecarPathFor(planPath);
  assert.deepEqual(parseRoutingSidecarText(readFileSync(p), p), readRoutingSidecar(planPath));

  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  const badPlan = join(dir, "bad.plan.md");
  writeFileSync(badPlan, "# Plan\n");
  writeFileSync(sidecarPathFor(badPlan), "{ not valid json");
  assert.throws(() => readRoutingSidecar(badPlan), { code: "INVALID_SIDECAR_JSON" });
  assert.throws(() => parseRoutingSidecarText("{ not valid json", "label"), { code: "INVALID_SIDECAR_JSON" });
});
