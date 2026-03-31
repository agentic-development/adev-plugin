/**
 * Shared test utilities for adev-plugin E2E tests.
 */

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
 * Create an isolated temp directory for a single test.
 * @returns {string} Absolute path to the temp dir.
 */
export function createTempDir() {
  return mkdtempSync(join(tmpdir(), "adev-test-"));
}

/**
 * Remove a temp directory and all its contents.
 * @param {string} dirPath
 */
export function cleanupTempDir(dirPath) {
  rmSync(dirPath, { recursive: true, force: true });
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
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
export function runHook(hookName, { env = {}, cwd, stdin } = {}) {
  const hookPath = join(PLUGIN_ROOT, "hooks", hookName);
  const result = spawnSync("bash", [hookPath], {
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
  // Create initial commit so branch exists
  writeFileSync(join(dir, "README.md"), "init\n");
  execSync("git add README.md && git commit -m init", { cwd: dir, stdio: "ignore" });
  if (branch !== "main") {
    execSync(`git checkout -b ${branch}`, { cwd: dir, stdio: "ignore" });
  }
  return dir;
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
