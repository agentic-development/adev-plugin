/**
 * Shared test utilities for adev-plugin E2E tests.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync } from "fs";
import { join, resolve, dirname } from "path";
import { execSync, spawnSync } from "child_process";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Resolved path to the plugin repository root. */
export const PLUGIN_ROOT = resolve(__dirname, "..");

/**
 * Run `fn`, assert that it threw, and return the thrown error.
 *
 * `assert.throws()` is a void assertion — it returns `undefined` and cannot
 * hand the error back for further inspection, so `const err = assert.throws(fn)`
 * is always `undefined`. Wrapping it this way preserves its strictness (a call
 * that throws nothing still fails the assertion) while exposing the error so
 * `.code` / `.message` assertions can run against it.
 *
 * @param {() => any} fn - the call expected to throw.
 * @returns {Error} the error `fn` threw.
 */
export function captureThrow(fn) {
  let thrown;
  assert.throws(fn, (err) => {
    thrown = err;
    return true;
  });
  return thrown;
}

/**
 * Create an isolated temp directory for a single test.
 * @returns {string} Absolute path to the temp dir.
 */
export function createTempDir() {
  return mkdtempSync(join(tmpdir(), "adev-test-"));
}

/**
 * Remove a temp directory and all its contents.
 *
 * The `maxRetries`/`retryDelay` options absorb transient filesystem races
 * (ENOTEMPTY observed on macOS when the directory contains symlinks the
 * CLI install just created — `providers/opencode` symlinks the plugin into
 * the temp HOME, and the recursive walk can race with the symlink target
 * still being written).
 *
 * @param {string} dirPath
 */
export function cleanupTempDir(dirPath) {
  rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

/**
 * Write a fixture file inside a temp directory.
 * Creates intermediate directories as needed.
 * @param {string} baseDir - The temp dir root.
 * @param {string} relativePath - Path relative to baseDir (e.g. ".context-index/manifest.yaml").
 * @param {string} content - File content.
 */
export function writeFixture(baseDir, relativePath, content) {
  const fullPath = join(baseDir, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

/**
 * Execute a hook script and capture its output.
 * @param {string} hookName - Script basename, e.g. "merge-guard.sh".
 * @param {object} options
 * @param {Record<string, string>} [options.env] - Extra environment variables (merged with process.env).
 * @param {string} [options.cwd] - Working directory for the hook.
 * @param {string} [options.stdin] - Data to pipe into the hook's stdin.
 * @param {string[]} [options.args] - Extra argv passed to the script (e.g. dispatch surface).
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
export function runHook(hookName, { env = {}, cwd, stdin, args = [] } = {}) {
  const hookPath = join(PLUGIN_ROOT, "hooks", hookName);
  const result = spawnSync("bash", [hookPath, ...args], {
    env: { ...process.env, ...env },
    cwd: cwd || process.cwd(),
    input: stdin || "",
    encoding: "utf8",
    timeout: 10_000,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

/**
 * Create an isolated temp directory initialized as a git repo.
 * @param {object} [opts]
 * @param {string} [opts.branch] - Branch to create and checkout (default: "main").
 * @returns {string} Absolute path to the temp dir (git repo root).
 */
export function createTempGitRepo({ branch = "main" } = {}) {
  const dir = createTempDir();
  execSync("git init -b main", { cwd: dir, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "ignore" });
  execSync("git config commit.gpgsign false", { cwd: dir, stdio: "ignore" });
  // Create initial commit so branch exists
  writeFileSync(join(dir, "README.md"), "init\n");
  execSync("git add README.md && git commit -m init", { cwd: dir, stdio: "ignore" });
  if (branch !== "main") {
    execSync(`git checkout -b ${branch}`, { cwd: dir, stdio: "ignore" });
  }
  return dir;
}

/**
 * Initialize an existing directory as a git repo with test-safe config
 * (no user commit yet). Unlike `createTempGitRepo()`, this operates on a
 * directory the caller already created/populated (e.g. an adev-scaffolded
 * temp project), so it does not create the directory or an initial commit.
 * @param {string} dir - Existing directory to `git init` in place.
 */
export function initGitRepo(dir) {
  execSync("git init -b main", { cwd: dir, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "ignore" });
  execSync("git config commit.gpgsign false", { cwd: dir, stdio: "ignore" });
}

/**
 * Write a file and commit it in a git repo.
 * @param {string} dir - Git repo working directory.
 * @param {string} filename - File to write (relative to `dir`).
 * @param {string} message - File content and commit message (both set to this value).
 */
export function commitFile(dir, filename, message) {
  writeFileSync(join(dir, filename), `${message}\n`);
  execSync(`git add ${filename} && git commit -m "${message}"`, { cwd: dir, stdio: "ignore" });
}

/**
 * Turn an existing directory into a git repo that is `behindCount` commits
 * behind a freshly-created bare "origin" remote — the fixture shape used to
 * exercise ahead/behind freshness checks against a real git remote.
 *
 * Bootstraps: a bare origin repo, an initial commit + push from `dir` (with
 * `origin/HEAD` set so default-branch resolution works the way `git clone`
 * sets it up), then a disposable "pusher" clone that pushes `behindCount`
 * additional commits to origin — leaving `dir` behind by exactly that many.
 * The pusher clone is cleaned up before returning; `dir` and the bare repo
 * are left for the caller to clean up (the bare repo's path is returned).
 *
 * @param {string} dir - Existing directory to turn into the "local" repo (not yet a git repo).
 * @param {object} [opts]
 * @param {number} [opts.behindCount] - Commits to push to origin beyond `dir`'s HEAD (default: 0).
 * @returns {{ bareDir: string }} Absolute path to the bare origin repo.
 */
export function createBehindOriginFixture(dir, { behindCount = 0 } = {}) {
  const bareDir = mkdtempSync(join(tmpdir(), "adev-behind-origin-bare-"));
  const pusherDir = mkdtempSync(join(tmpdir(), "adev-behind-origin-pusher-"));

  execSync("git init --bare -b main", { cwd: bareDir, stdio: "ignore" });

  initGitRepo(dir);
  commitFile(dir, "README.md", "init");
  execSync(`git remote add origin ${bareDir}`, { cwd: dir, stdio: "ignore" });
  execSync("git push origin main", { cwd: dir, stdio: "ignore" });
  // Default-branch resolution (e.g. computeFreshness's
  // resolveDefaultRemoteBranch) reads refs/remotes/origin/HEAD, which a
  // plain `remote add` + `push` never sets the way `git clone` does.
  execSync("git remote set-head origin main", { cwd: dir, stdio: "ignore" });

  execSync(`git clone ${bareDir} ${pusherDir}`, { stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: pusherDir, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: pusherDir, stdio: "ignore" });
  execSync("git config commit.gpgsign false", { cwd: pusherDir, stdio: "ignore" });
  for (let i = 0; i < behindCount; i += 1) {
    commitFile(pusherDir, `f${i}.txt`, `commit-${i}`);
  }
  execSync("git push origin main", { cwd: pusherDir, stdio: "ignore" });

  cleanupTempDir(pusherDir);
  return { bareDir };
}

/**
 * Run a git hook script (from .githooks/) in a temp git repo.
 * @param {string} hookName - Script basename, e.g. "pre-commit".
 * @param {object} options
 * @param {string} [options.cwd] - Working directory (must be a git repo).
 * @param {string} [options.stdin] - Data to pipe into stdin.
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
export function runGitHook(hookName, { cwd, stdin } = {}) {
  const hookPath = join(PLUGIN_ROOT, ".githooks", hookName);
  const result = spawnSync("bash", [hookPath], {
    env: { ...process.env },
    cwd: cwd || process.cwd(),
    input: stdin || "",
    encoding: "utf8",
    timeout: 10_000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

/**
 * Execute the adev CLI with simulated interactive input.
 * @param {string} command - CLI command (e.g., "init", "uninstall")
 * @param {string[]} inputs - Array of inputs to simulate (one per prompt)
 * @param {object} opts
 * @param {Record<string, string>} [opts.env] - Extra environment variables
 * @param {string} [opts.cwd] - Working directory
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
export function runCLI(command, inputs = [], { env = {}, cwd } = {}) {
  const input = inputs.join("\n") + "\n";
  const result = spawnSync("node", [join(PLUGIN_ROOT, "cli", "index.mjs"), command], {
    env: { ...process.env, ...env },
    cwd: cwd || process.cwd(),
    input,
    encoding: "utf8",
    timeout: 30_000,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}
