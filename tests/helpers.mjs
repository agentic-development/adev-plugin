/**
 * Shared test utilities for adev-plugin E2E tests.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { spawnSync } from "child_process";
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
