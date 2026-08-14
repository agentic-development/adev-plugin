// Chained git-hook wrapper behavior (adev-plugin-sewt).
//
// Chaining is reached whenever a project already has a foreign core.hooksPath
// (husky, lefthook, ...) at install time, and it is the DEFAULT choice — so
// pressing Enter selects it. The generated wrapper therefore has to be correct
// on machines other than the one that ran the installer.
//
// The defects these tests pin down:
//   A. the wrapper failed OPEN — a missing or non-executable hook was skipped
//      with a silent `exit 0`, making a disabled guard indistinguishable from
//      a passing one.
//   B. the wrapper embedded the installing machine's ABSOLUTE path, so on a
//      teammate's clone the original hook silently stopped running.
//
// Every assertion here runs the generated script through a real bash, because
// the defect is in emitted shell, not in JS control flow.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, chmodSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildChainedHook } from "../cli/index.mjs";
import { createTempDir, cleanupTempDir } from "./helpers.mjs";

/**
 * Run a generated wrapper and capture status + stderr, without throwing.
 */
function runWrapper(hookDir, hookName, args = []) {
  try {
    const stdout = execFileSync("bash", [join(hookDir, hookName), ...args], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
    };
  }
}

/** Materialise a wrapper plus optional .adev / original hooks. */
function scaffold(dir, { adev, original, adevExecutable = true, originalExecutable = true } = {}) {
  const hookDir = join(dir, ".githooks");
  mkdirSync(hookDir, { recursive: true });

  if (adev !== undefined) {
    const p = join(hookDir, "pre-commit.adev");
    writeFileSync(p, `#!/usr/bin/env bash\n${adev}\n`);
    chmodSync(p, adevExecutable ? 0o755 : 0o644);
  }

  const originalDir = join(dir, ".husky");
  mkdirSync(originalDir, { recursive: true });
  if (original !== undefined) {
    const p = join(originalDir, "pre-commit");
    writeFileSync(p, `#!/usr/bin/env bash\n${original}\n`);
    chmodSync(p, originalExecutable ? 0o755 : 0o644);
  }

  const wrapper = buildChainedHook("pre-commit.adev", ".husky/pre-commit", "pre-commit");
  const wrapperPath = join(hookDir, "pre-commit");
  writeFileSync(wrapperPath, wrapper);
  chmodSync(wrapperPath, 0o755);
  return { hookDir, originalDir };
}

// ── AC-3: no absolute path may reach the committed wrapper ──────────────────

test("the generated wrapper contains no absolute filesystem path", () => {
  const wrapper = buildChainedHook("pre-commit.adev", ".husky/pre-commit", "pre-commit");

  // The installing machine's home/checkout must never be baked in: .githooks/
  // is tracked, so the wrapper is committed and read on other machines.
  assert.doesNotMatch(
    wrapper,
    /ORIGINAL="\//,
    "ORIGINAL was assigned an absolute path — it will not exist on a teammate's clone",
  );
  assert.doesNotMatch(wrapper, /\/Users\/|\/home\/|C:\\\\/, "wrapper leaks a machine-specific path");
});

test("the wrapper resolves the original relative to the repo, not the cwd", () => {
  // A hook runs with cwd = repo root, but that is a git implementation detail
  // rather than a guarantee worth relying on; the wrapper should anchor itself.
  const wrapper = buildChainedHook("pre-commit.adev", ".husky/pre-commit", "pre-commit");
  assert.match(
    wrapper,
    /HOOK_DIR|rev-parse --show-toplevel/,
    "wrapper must anchor the original path to the repo root or its own directory",
  );
});

// ── AC-1: a missing or non-executable .adev hook must fail LOUDLY ───────────

test("a missing .adev hook exits non-zero and names the path", () => {
  const dir = createTempDir();
  try {
    const { hookDir } = scaffold(dir, { original: "exit 0" }); // no .adev at all
    const r = runWrapper(hookDir, "pre-commit");

    assert.notEqual(r.status, 0, "a missing adev hook must not pass silently");
    assert.match(r.stderr, /pre-commit\.adev/, "the diagnostic must name the missing path");
  } finally {
    cleanupTempDir(dir);
  }
});

test("a present-but-non-executable .adev hook exits non-zero and says so", () => {
  const dir = createTempDir();
  try {
    // Observed in this repo 2026-08-14: .adev files were mode -rw-r--r--.
    // The exec bit does not survive archive/restore, zip, or some CI checkouts.
    const { hookDir } = scaffold(dir, {
      adev: "exit 0",
      original: "exit 0",
      adevExecutable: false,
    });
    const r = runWrapper(hookDir, "pre-commit");

    assert.notEqual(r.status, 0, "a non-executable adev hook must not be skipped silently");
    assert.match(r.stderr, /pre-commit\.adev/, "the diagnostic must name the path");
    assert.match(r.stderr, /executable|chmod/i, "the diagnostic must say how to fix it");
  } finally {
    cleanupTempDir(dir);
  }
});

// ── AC-2: same contract for the chained original ───────────────────────────

test("a missing chained original exits non-zero and names it", () => {
  const dir = createTempDir();
  try {
    const { hookDir } = scaffold(dir, { adev: "exit 0" }); // no original
    const r = runWrapper(hookDir, "pre-commit");

    assert.notEqual(r.status, 0, "a missing original must not pass silently");
    assert.match(r.stderr, /husky|pre-commit/, "the diagnostic must name the missing original");
  } finally {
    cleanupTempDir(dir);
  }
});

test("a non-executable chained original exits non-zero", () => {
  const dir = createTempDir();
  try {
    const { hookDir } = scaffold(dir, {
      adev: "exit 0",
      original: "exit 0",
      originalExecutable: false,
    });
    const r = runWrapper(hookDir, "pre-commit");

    assert.notEqual(r.status, 0, "a non-executable original must not be skipped silently");
  } finally {
    cleanupTempDir(dir);
  }
});

// ── The happy path must still work, and ordering must be preserved ─────────

test("both hooks executable: both run, adev first, wrapper exits 0", () => {
  const dir = createTempDir();
  try {
    const marker = join(dir, "order.txt");
    const { hookDir } = scaffold(dir, {
      adev: `echo adev >> ${marker}`,
      original: `echo original >> ${marker}`,
    });
    const r = runWrapper(hookDir, "pre-commit");

    assert.equal(r.status, 0, `expected success, got ${r.status}: ${r.stderr}`);
    const order = execFileSync("cat", [marker], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(order, ["adev", "original"], "adev hook must run before the original");
  } finally {
    cleanupTempDir(dir);
  }
});

test("a blocking adev hook short-circuits the original and propagates its code", () => {
  const dir = createTempDir();
  try {
    const marker = join(dir, "ran.txt");
    const { hookDir } = scaffold(dir, {
      adev: "exit 2",
      original: `echo original >> ${marker}`,
    });
    const r = runWrapper(hookDir, "pre-commit");

    assert.equal(r.status, 2, "the adev hook's exit code must propagate unchanged");
    let originalRan = true;
    try {
      execFileSync("cat", [marker], { stdio: "pipe" });
    } catch {
      originalRan = false;
    }
    assert.equal(originalRan, false, "the original must not run after a blocking adev hook");
  } finally {
    cleanupTempDir(dir);
  }
});

test("hook arguments are forwarded to both hooks", () => {
  const dir = createTempDir();
  try {
    const marker = join(dir, "args.txt");
    const { hookDir } = scaffold(dir, {
      adev: `echo "adev:$1" >> ${marker}`,
      original: `echo "original:$1" >> ${marker}`,
    });
    const r = runWrapper(hookDir, "pre-commit", ["COMMIT_MSG_FILE"]);

    assert.equal(r.status, 0, r.stderr);
    const out = execFileSync("cat", [marker], { encoding: "utf8" });
    assert.match(out, /adev:COMMIT_MSG_FILE/);
    assert.match(out, /original:COMMIT_MSG_FILE/);
  } finally {
    cleanupTempDir(dir);
  }
});

// ── Injection and containment (adev-plugin-hookspath-command-injection) ─────
//
// `core.hooksPath` is read with `git config --get` and flows into the emitted
// bash. `$(...)` expands INSIDE double quotes, so a crafted value becomes code
// in a file that is chmod 755, tracked, and run by git on every commit. The
// payload executes while the shell computes the variable — before any -e/-x
// check — so the fail-closed guard does not contain it.
//
// Precondition is prior config-write access (an npm postinstall, a bootstrap
// script), NOT a hostile clone: .git/config is never tracked and never
// transferred by clone. That was verified before these tests were written.

import { execFileSync as execFile } from "node:child_process";

/** Emit a wrapper for a hostile path and run it; return whether the payload fired. */
function payloadFires(hostilePath, sentinel) {
  const dir = createTempDir();
  try {
    rmSync(sentinel, { force: true });
    const hookDir = join(dir, ".githooks");
    mkdirSync(hookDir, { recursive: true });
    writeFileSync(join(hookDir, "pre-commit.adev"), "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(join(hookDir, "pre-commit.adev"), 0o755);

    const wrapper = buildChainedHook("pre-commit.adev", hostilePath, "pre-commit");
    const wrapperPath = join(hookDir, "pre-commit");
    writeFileSync(wrapperPath, wrapper);
    chmodSync(wrapperPath, 0o755);

    try {
      execFile("bash", [wrapperPath], { stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      /* non-zero exit is expected — we only care whether the payload ran */
    }
    return existsSync(sentinel);
  } finally {
    rmSync(sentinel, { force: true });
    cleanupTempDir(dir);
  }
}

test("a $(...) payload in the chained path does not execute", () => {
  const sentinel = join(tmpdir(), "adev-injection-probe-cmdsub");
  assert.equal(
    payloadFires(`$(touch ${sentinel})/h/pre-commit`, sentinel),
    false,
    "command substitution in core.hooksPath reached the generated shell",
  );
});

test("a backtick payload in the chained path does not execute", () => {
  const sentinel = join(tmpdir(), "adev-injection-probe-backtick");
  assert.equal(
    payloadFires("`touch " + sentinel + "`/h/pre-commit", sentinel),
    false,
    "backtick substitution in core.hooksPath reached the generated shell",
  );
});

test("the emitted wrapper never contains an unquoted expansion of the chained path", () => {
  // Belt and braces alongside the execution tests: the path must be emitted as
  // a single-quoted bash literal, where $ and ` are inert.
  const wrapper = buildChainedHook("pre-commit.adev", "$(id)/h/pre-commit", "pre-commit");
  const line = wrapper.split("\n").find((l) => l.trimStart().startsWith("ORIGINAL="));
  assert.ok(line, "wrapper must assign ORIGINAL");
  // $REPO_ROOT is ours and must expand, so it stays double-quoted. The
  // untrusted path must sit in a single-quoted literal where $ and ` are inert.
  assert.match(line, /'\$\(id\)\/h\/pre-commit'/, "the untrusted path must be a single-quoted literal");

  // Strip the one legitimate double-quoted span ("$REPO_ROOT") and assert no
  // double-quoted region remains that could expand the payload.
  const withoutOurExpansion = line.replace(/"\$REPO_ROOT"/, "");
  assert.doesNotMatch(
    withoutOurExpansion,
    /"/,
    "no other double-quoted span may carry the untrusted path — $() expands inside one",
  );
});

test("a single quote in the chained path cannot break out of the literal", () => {
  const sentinel = join(tmpdir(), "adev-injection-probe-quote");
  assert.equal(
    payloadFires(`'$(touch ${sentinel})'/h/pre-commit`, sentinel),
    false,
    "an embedded single quote escaped the literal",
  );
});
