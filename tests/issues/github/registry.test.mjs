import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULT_BACKEND, getIssueManager, SUPPORTED_BACKENDS } from "../../../lib/issues/registry.mjs";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";

test("github backend returns GithubAdapter and never falls back to JSON", () => {
  assert.ok(SUPPORTED_BACKENDS.includes("github"));
  const m = getIssueManager({ tasks: { backend: "github", github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" } } }, process.cwd());
  assert.equal(m.name, "github");
  assert.throws(() => getIssueManager({ tasks: { backend: "github", github: { repo: "acme/board" } } }, process.cwd()), { code: "GITHUB_INVALID_CONFIG" });
});

const REGISTRY_URL = pathToFileURL(resolve(fileURLToPath(import.meta.url), "../../../../lib/issues/registry.mjs")).href;
const GITHUB = { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" };
const githubManifest = (extra = {}, github = GITHUB) => ({ tasks: { backend: "github", github, ...extra } });

function withProject(fn) {
  const dir = createTempDir();
  try {
    return fn(dir);
  } finally {
    cleanupTempDir(dir);
  }
}

// A stand-in `gh` placed first on PATH: it appends its argv to a log file and
// fails the way an unauthenticated `gh` does, so any spawn is observable and no
// request can reach GitHub. The real `gh` is shadowed and never runs.
function stubGh(dir) {
  const bin = join(dir, "stub-bin");
  const log = join(dir, "gh-calls.log");
  mkdirSync(bin, { recursive: true });
  const script = join(bin, "gh");
  writeFileSync(script, `#!/bin/sh\necho "$*" >> "${log}"\necho "To get started with GitHub CLI, please run:  gh auth login" >&2\nexit 4\n`);
  chmodSync(script, 0o755);
  return { bin, log };
}

function childEnv(bin) {
  const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  env.ADEV_SILENCE_DEFAULT_BACKEND_ADVISORY = "1";
  return env;
}

function runChild(dir, bin, body) {
  const src = `import { getIssueManager } from ${JSON.stringify(REGISTRY_URL)};\n${body}`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", src], { cwd: dir, env: childEnv(bin), encoding: "utf8", timeout: 15000 });
  assert.equal(r.status, 0, `child failed: ${r.stderr}`);
  return JSON.parse(r.stdout.trim().split("\n").pop());
}

test("adding github leaves the default backend as json", () => {
  assert.equal(DEFAULT_BACKEND, "json");
});

test("the returned manager is a GithubAdapter instance carrying the manifest and storage root", () => {
  withProject((dir) => {
    const dbPath = join(dir, "board-store");
    const m = getIssueManager(githubManifest({ claim_ttl_minutes: 90, db_path: dbPath }), dir);
    assert.ok(m instanceof GithubAdapter, "registry must return a GithubAdapter");
    assert.equal(m.name, "github");
    assert.equal(m.claimTtlMinutes, 90);
    assert.equal(m.storageRoot, dbPath);
    assert.deepEqual(m.home, { owner: "acme", repo: "board" });
  });
});

test("invalid tasks.github throws GITHUB_INVALID_CONFIG naming the key; nothing is returned", () => {
  withProject((dir) => {
    const cases = [
      [{ repo: "acme/board" }, "project"],
      [{ ...GITHUB, project: "https://gitlab.com/orgs/acme/projects/7" }, "project"],
      [{ ...GITHUB, repo: "acme" }, "repo"],
      [{ ...GITHUB, claim_settle_ms: 10001 }, "claim_settle_ms"],
      [{ ...GITHUB, type_source: "milestones" }, "type_source"],
    ];
    for (const [github, key] of cases) {
      assert.throws(() => getIssueManager(githubManifest({}, github), dir), { code: "GITHUB_INVALID_CONFIG", key });
    }
  });
});

test("a github backend with no tasks.github block throws instead of falling back to JSON", () => {
  withProject((dir) => {
    assert.throws(() => getIssueManager({ tasks: { backend: "github" } }, dir), { code: "GITHUB_INVALID_CONFIG", key: "tasks.github" });
  });
});

test("an unknown backend's UNKNOWN_BACKEND message lists github among the supported values", () => {
  withProject((dir) => {
    assert.throws(() => getIssueManager({ tasks: { backend: "jira" } }, dir), (err) => {
      assert.equal(err.code, "UNKNOWN_BACKEND");
      assert.match(err.message, /Supported: json, file, beads, github$/);
      return true;
    });
  });
});

test("construction through the registry spawns no gh process", () => {
  withProject((dir) => {
    const { bin, log } = stubGh(dir);
    const out = runChild(dir, bin, `
      const m = getIssueManager(${JSON.stringify(githubManifest())}, process.cwd());
      console.log(JSON.stringify({ name: m.name, ctor: m.constructor.name }));
    `);
    assert.deepEqual(out, { name: "github", ctor: "GithubAdapter" });
    assert.equal(existsSync(log), false, "gh must not be spawned at construction");
  });
});

test("first use with an unauthenticated gh throws GITHUB_AUTH_REQUIRED; no JSON data is returned", () => {
  withProject((dir) => {
    const { bin, log } = stubGh(dir);
    mkdirSync(join(dir, ".context-index", "tasks"), { recursive: true });
    writeFileSync(join(dir, ".context-index", "tasks", "tasks.json"), JSON.stringify({ version: 2, seq: 1, epics: [], issues: [{ id: "issue-1", title: "local", status: "open" }] }));
    const out = runChild(dir, bin, `
      const m = getIssueManager(${JSON.stringify(githubManifest())}, process.cwd());
      let result = null, code = null;
      try { result = await m.list({}); } catch (err) { code = err.code; }
      console.log(JSON.stringify({ name: m.name, code, result }));
    `);
    assert.deepEqual(out, { name: "github", code: "GITHUB_AUTH_REQUIRED", result: null });
    assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), ["api graphql --input -"]);
  });
});
