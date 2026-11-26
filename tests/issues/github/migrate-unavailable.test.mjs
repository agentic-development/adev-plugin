/**
 * `adev issues migrate --to github` must refuse with MIGRATE_GITHUB_UNAVAILABLE
 * before constructing any adapter or writing anything: once github is a
 * supported backend, the generic copy path would otherwise write to a real
 * GitHub project without the confirmation, visibility disclosure, pacing, and
 * resume semantics the github migration path requires.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { PLUGIN_ROOT, createTempDir, cleanupTempDir } from "../../helpers.mjs";

const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");
const GITHUB_BLOCK = "  github:\n    project: https://github.com/orgs/acme/projects/7\n    repo: acme/board\n";
const BOARD = JSON.stringify({
  version: 2,
  seq: 1,
  epics: [],
  issues: [{ id: "issue-1", title: "seeded", status: "open", type: "task", priority: 2 }],
}, null, 2) + "\n";

function makeProject({ githubBlock = true, backend = "json" } = {}) {
  const dir = createTempDir();
  mkdirSync(join(dir, ".context-index", "tasks"), { recursive: true });
  const manifest = `project:\n  name: test\ntasks:\n  backend: ${backend}\n${githubBlock ? GITHUB_BLOCK : ""}`;
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), manifest);
  writeFileSync(join(dir, ".context-index", "tasks", "tasks.json"), BOARD);

  // A stand-in `gh` first on PATH logs every spawn and fails like an
  // unauthenticated `gh`, so no request can reach GitHub and any attempt is visible.
  const bin = join(dir, "stub-bin");
  const ghLog = join(dir, "gh-calls.log");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "gh"), `#!/bin/sh\necho "$*" >> "${ghLog}"\necho "gh auth login" >&2\nexit 4\n`);
  chmodSync(join(bin, "gh"), 0o755);
  return { dir, bin, ghLog, manifest };
}

function migrate(project, args) {
  const env = { ...process.env, PATH: `${project.bin}${delimiter}${process.env.PATH ?? ""}` };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  env.ADEV_SILENCE_DEFAULT_BACKEND_ADVISORY = "1";
  const r = spawnSync(process.execPath, [CLI, "issues", "migrate", ...args], { cwd: project.dir, env, encoding: "utf8", timeout: 15000 });
  return { exitCode: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const refusalLines = (stderr) => stderr.split("\n").filter((l) => l.includes("MIGRATE_GITHUB_UNAVAILABLE"));

function assertUntouched(project, result) {
  assert.doesNotMatch(result.stderr, /MIGRATE_UNKNOWN_BACKEND|GITHUB_INVALID_CONFIG|GITHUB_AUTH_REQUIRED/);
  assert.equal(existsSync(project.ghLog), false, "no gh process may be spawned");
  assert.equal(readFileSync(join(project.dir, ".context-index", "tasks", "tasks.json"), "utf8"), BOARD);
  assert.equal(readFileSync(join(project.dir, ".context-index", "manifest.yaml"), "utf8"), project.manifest);
  assert.equal(existsSync(join(project.dir, ".context-index", "tasks", ".migrate-state.json")), false);
}

test("migrate --to github refuses with MIGRATE_GITHUB_UNAVAILABLE, exit 1, and no gh request or write", () => {
  const project = makeProject();
  try {
    const result = migrate(project, ["--to", "github"]);
    assert.equal(result.exitCode, 1, `stderr: ${result.stderr}`);
    assert.equal(refusalLines(result.stderr).length, 1, `stderr: ${result.stderr}`);
    assertUntouched(project, result);
  } finally {
    cleanupTempDir(project.dir);
  }
});

test("migrate --to github --dry-run is refused the same way: no target read, no report", () => {
  const project = makeProject();
  try {
    const result = migrate(project, ["--to", "github", "--dry-run"]);
    assert.equal(result.exitCode, 1, `stderr: ${result.stderr}`);
    assert.equal(refusalLines(result.stderr).length, 1, `stderr: ${result.stderr}`);
    assert.equal(result.stdout.includes("{"), false, "no dry-run report may be printed");
    assertUntouched(project, result);
  } finally {
    cleanupTempDir(project.dir);
  }
});

test("migrate --from json --to github --include-closed is refused the same way", () => {
  const project = makeProject();
  try {
    const result = migrate(project, ["--from", "json", "--to", "github", "--include-closed"]);
    assert.equal(result.exitCode, 1, `stderr: ${result.stderr}`);
    assert.equal(refusalLines(result.stderr).length, 1, `stderr: ${result.stderr}`);
    assertUntouched(project, result);
  } finally {
    cleanupTempDir(project.dir);
  }
});

test("the refusal precedes adapter construction: a missing tasks.github block still yields MIGRATE_GITHUB_UNAVAILABLE", () => {
  const project = makeProject({ githubBlock: false });
  try {
    const result = migrate(project, ["--to", "github"]);
    assert.equal(result.exitCode, 1, `stderr: ${result.stderr}`);
    assert.equal(refusalLines(result.stderr).length, 1, `stderr: ${result.stderr}`);
    assertUntouched(project, result);
  } finally {
    cleanupTempDir(project.dir);
  }
});

test("github as the migration source is refused the same way: --from github, or a github manifest backend as the implicit source", () => {
  for (const [options, args] of [
    [{}, ["--from", "github", "--to", "beads"]],
    [{ backend: "github" }, ["--to", "json"]],
    [{ backend: "github" }, ["--to", "json", "--dry-run"]],
  ]) {
    const project = makeProject(options);
    try {
      const result = migrate(project, args);
      assert.equal(result.exitCode, 1, `${args.join(" ")} stderr: ${result.stderr}`);
      assert.equal(refusalLines(result.stderr).length, 1, `${args.join(" ")} stderr: ${result.stderr}`);
      assert.equal(result.stdout.includes("{"), false, "no dry-run report may be printed");
      assert.doesNotMatch(result.stderr, /BEADS_NOT_AVAILABLE|MIGRATE_NOOP/);
      assertUntouched(project, result);
    } finally {
      cleanupTempDir(project.dir);
    }
  }
});
