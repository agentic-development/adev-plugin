# Golden Sample: Test Helpers

> **Pattern:** general
> **Source:** tests/helpers.mjs
> **Quality Score:** 80/100
> **Extracted:** 2026-03-28
> **Constitution Principles:** pure-esm, minimize-external-dependencies, hook-protocol-compliance

## Why This Is a Golden Sample

The constitution explicitly names `tests/helpers.mjs` as a pattern to follow (Coding Standards > Patterns to Follow). Every test file in the project imports from this module. It demonstrates the project's core conventions in a compact, well-documented form:

1. **Pure ESM** (Non-Negotiable Principle #3): Uses `import`/`export` exclusively. The `__dirname` workaround via `fileURLToPath(import.meta.url)` is the standard ESM pattern for resolving file paths -- this is the canonical way to do it in this project.
2. **Minimize external dependencies** (Non-Negotiable Principle #1): Uses only Node.js built-ins (`fs`, `path`, `child_process`, `os`, `url`). No test utility libraries.
3. **Hook protocol compliance** (Non-Negotiable Principle #4): The `runHook()` function encapsulates the hook execution contract -- piping stdin, setting env vars, capturing exit codes, stdout, and stderr. This is how hooks should be tested.
4. **Naming conventions**: camelCase functions, kebab-case would apply to filenames (helpers.mjs).

## The Code

```javascript
/**
 * Shared test utilities for adev-plugin E2E tests.
 */

// PRINCIPLE: Pure ESM — import ordering follows the convention:
// Node.js built-ins first, then relative imports.
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

// PRINCIPLE: Pure ESM — the standard __dirname replacement pattern.
// Every .mjs file in this project uses this when it needs directory resolution.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Resolved path to the plugin repository root. */
export const PLUGIN_ROOT = resolve(__dirname, "..");

/**
 * Create an isolated temp directory for a single test.
 * @returns {string} Absolute path to the temp dir.
 *
 * PATTERN: Each test gets its own temp directory to prevent cross-test
 * contamination. Used in beforeEach() hooks across all test files.
 */
export function createTempDir() {
  return mkdtempSync(join(tmpdir(), "adev-test-"));
}

/**
 * Remove a temp directory and all its contents.
 * @param {string} dirPath
 *
 * PATTERN: Paired with createTempDir() in afterEach() hooks.
 * Uses { recursive: true, force: true } to handle any directory state.
 */
export function cleanupTempDir(dirPath) {
  rmSync(dirPath, { recursive: true, force: true });
}

/**
 * Write a fixture file inside a temp directory.
 * Creates intermediate directories as needed.
 * @param {string} baseDir - The temp dir root.
 * @param {string} relativePath - Path relative to baseDir.
 * @param {string} content - File content.
 *
 * PRINCIPLE: Minimize external dependencies — uses mkdirSync({ recursive })
 * instead of a third-party mkdirp package.
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
 * @param {Record<string, string>} [options.env] - Extra env vars (merged with process.env).
 * @param {string} [options.cwd] - Working directory for the hook.
 * @param {string} [options.stdin] - Data to pipe into the hook's stdin.
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 *
 * PRINCIPLE: Hook protocol compliance — this function encapsulates the full
 * hook execution contract: stdin JSON input, env vars, exit codes, and
 * stdout/stderr capture. All hook tests use this instead of calling
 * spawnSync directly.
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
 * Execute the adev CLI with simulated interactive input.
 * @param {string} command - CLI command (e.g., "init", "uninstall")
 * @param {string[]} inputs - Array of inputs to simulate (one per prompt)
 * @param {object} opts
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 *
 * PATTERN: Same structure as runHook() but for CLI testing.
 * Uses a longer timeout (30s) because CLI operations may scaffold files.
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
```

## Test Coverage

This module does not have its own dedicated test file. Instead, it is validated transitively -- every hook test and CLI test imports and exercises these utilities. If `runHook()` or `writeFixture()` were broken, all hook tests would fail.

## Usage Guide

Reference this sample when:
- **Adding a new test file** -- import from `tests/helpers.mjs` and use `createTempDir`/`cleanupTempDir`/`writeFixture`/`runHook`
- **Adding a new test utility** -- follow the same pattern (pure ESM, JSDoc, Node built-ins only)
- **Writing ESM modules** that need `__dirname` -- use the `fileURLToPath(import.meta.url)` pattern shown here
- **Testing hooks** -- use `runHook()` rather than calling `spawnSync` directly

What to adapt:
- Add new utility functions following the same JSDoc + export pattern
- Adjust timeouts based on operation complexity

What to keep exactly:
- The import ordering (Node built-ins first)
- The `__dirname` resolution pattern
- The `{ exitCode, stdout, stderr }` return shape from `runHook()` and `runCLI()`
- The temp directory lifecycle (create in beforeEach, cleanup in afterEach)
