/**
 * `adev issues migrate` through the CLI, with a stand-in `gh` first on PATH:
 * `--to github` dispatches to the github migration path, whose first network
 * step is the preflight through the single fixed `gh api graphql --input -`
 * argv, so an unauthenticated `gh` stops the run there with nothing written.
 * Migration out of a GitHub board stays refused with MIGRATE_GITHUB_UNAVAILABLE
 * before any adapter is constructed.
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
const linesStartingWith = (stderr, code) => stderr.split("\n").filter((l) => l.startsWith(code));

function assertNothingWritten(project) {
  assert.equal(readFileSync(join(project.dir, ".context-index", "tasks", "tasks.json"), "utf8"), BOARD);
  assert.equal(readFileSync(join(project.dir, ".context-index", "manifest.yaml"), "utf8"), project.manifest);
  assert.equal(existsSync(join(project.dir, ".context-index", "tasks", ".migrate-state.json")), false);
  assert.equal(existsSync(join(project.dir, ".context-index", "tasks", ".migrate-unanchored.json")), false);
  assert.equal(existsSync(join(project.dir, ".context-index", "tasks", "board-read-only.json")), false);
}

function assertUntouched(project, result) {
  assert.doesNotMatch(result.stderr, /MIGRATE_UNKNOWN_BACKEND|GITHUB_INVALID_CONFIG|GITHUB_AUTH_REQUIRED/);
  assert.equal(existsSync(project.ghLog), false, "no gh process may be spawned");
  assertNothingWritten(project);
}

test("migrate --to github dispatches to the github path: preflight runs through the fixed gh argv, an unauthenticated gh stops it with nothing written", () => {
  for (const args of [["--to", "github"], ["--to", "github", "--dry-run"], ["--from", "json", "--to", "github", "--include-closed"]]) {
    const project = makeProject();
    try {
      const result = migrate(project, args);
      assert.equal(result.exitCode, 1, `${args.join(" ")} stderr: ${result.stderr}`);
      assert.equal(refusalLines(result.stderr).length, 0, `${args.join(" ")} stderr: ${result.stderr}`);
      assert.equal(linesStartingWith(result.stderr, "GITHUB_AUTH_REQUIRED").length, 1, `${args.join(" ")} stderr: ${result.stderr}`);
      assert.deepEqual(readFileSync(project.ghLog, "utf8").trim().split("\n"), ["api graphql --input -"]);
      assert.equal(result.stdout.includes("{"), false, "no envelope or report may be printed");
      assertNothingWritten(project);
    } finally {
      cleanupTempDir(project.dir);
    }
  }
});

test("migrate --to github with no tasks.github block fails on the config with GITHUB_INVALID_CONFIG before any gh spawn", () => {
  const project = makeProject({ githubBlock: false });
  try {
    const result = migrate(project, ["--to", "github", "--yes"]);
    assert.equal(result.exitCode, 1, `stderr: ${result.stderr}`);
    assert.equal(linesStartingWith(result.stderr, "GITHUB_INVALID_CONFIG").length, 1, `stderr: ${result.stderr}`);
    assert.equal(existsSync(project.ghLog), false, "no gh process may be spawned");
    assertNothingWritten(project);
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
