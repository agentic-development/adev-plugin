// tests/cli-init-ensure-gitignore.test.mjs
//
// Tests for the `adev init ensure-gitignore [--remove]` sub-verb. Covers:
//   1. ensure-gitignore writes the block
//   2. --remove excises the block
//   3. --remove on a file without the block is noop
//   4. setup.managed_gitignore: false blocks write but --remove still works
//
// Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
// Plan-task: 6

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run as runEnsureGitignore } from "../lib/cli/init-ensure-gitignore.mjs";

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "ensure-gi-"));
  mkdirSync(join(root, ".context-index"), { recursive: true });
  return root;
}

function withCapturedIO(fn) {
  const logs = { out: [], err: [], exitCode: null };
  const origLog = console.log;
  const origErr = console.error;
  const origExit = process.exit;
  console.log = (...args) => logs.out.push(args.join(" "));
  console.error = (...args) => logs.err.push(args.join(" "));
  process.exit = (code) => {
    logs.exitCode = code;
    // throw a sentinel so control returns and tests can assert on exitCode
    const err = new Error(`__captured_exit_${code}__`);
    err.__captured = true;
    err.code = code;
    throw err;
  };
  return (async () => {
    try {
      await fn();
    } catch (err) {
      if (!err?.__captured) {
        console.log = origLog;
        console.error = origErr;
        process.exit = origExit;
        throw err;
      }
    } finally {
      console.log = origLog;
      console.error = origErr;
      process.exit = origExit;
    }
    return logs;
  })();
}

test("ensure-gitignore writes the block (exit 0)", async () => {
  const root = makeRoot();
  try {
    writeFileSync(join(root, ".context-index", "manifest.yaml"), "project:\n  name: t\n");
    const logs = await withCapturedIO(() =>
      runEnsureGitignore({ projectRoot: root, argv: [], manifest: { project: { name: "t" } } }),
    );
    assert.equal(logs.exitCode, 0);
    const content = readFileSync(join(root, ".gitignore"), "utf8");
    assert.ok(content.includes("# >>> adev:gitignore >>>"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--remove excises the block (exit 0)", async () => {
  const root = makeRoot();
  try {
    // Seed the block first.
    writeFileSync(join(root, ".context-index", "manifest.yaml"), "");
    await withCapturedIO(() =>
      runEnsureGitignore({ projectRoot: root, argv: [], manifest: null }),
    );
    assert.ok(readFileSync(join(root, ".gitignore"), "utf8").includes("# >>> adev:gitignore >>>"));

    const logs = await withCapturedIO(() =>
      runEnsureGitignore({ projectRoot: root, argv: ["--remove"], manifest: null }),
    );
    assert.equal(logs.exitCode, 0);
    const content = readFileSync(join(root, ".gitignore"), "utf8");
    assert.ok(!content.includes("# >>> adev:gitignore >>>"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--remove on a file without the block is noop", async () => {
  const root = makeRoot();
  try {
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    const original = readFileSync(join(root, ".gitignore"), "utf8");

    const logs = await withCapturedIO(() =>
      runEnsureGitignore({ projectRoot: root, argv: ["--remove"], manifest: null }),
    );
    assert.equal(logs.exitCode, 0);
    const after = readFileSync(join(root, ".gitignore"), "utf8");
    assert.equal(after, original, "byte-identical when no block present");
    assert.ok(logs.out.some((l) => l.includes("noop")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("knob false blocks write but --remove bypasses the knob", async () => {
  const root = makeRoot();
  try {
    const manifest = { setup: { managed_gitignore: false } };
    writeFileSync(
      join(root, ".context-index", "manifest.yaml"),
      "setup:\n  managed_gitignore: false\n",
    );

    // (a) Write path: knob false → advisory, no .gitignore.
    const writeLogs = await withCapturedIO(() =>
      runEnsureGitignore({ projectRoot: root, argv: [], manifest }),
    );
    assert.equal(writeLogs.exitCode, 0);
    assert.ok(
      writeLogs.out.some((l) => l.includes("disabled by manifest")),
      "advisory must print when knob is false",
    );
    assert.ok(!existsSync(join(root, ".gitignore")), ".gitignore must not be created");

    // (b) Seed a block by toggling knob temporarily — we just write the block
    // directly to simulate a previously-installed state.
    writeFileSync(
      join(root, ".gitignore"),
      "# >>> adev:gitignore >>>\nfoo\n# <<< adev:gitignore <<<\n",
    );

    // --remove: bypass the knob.
    const removeLogs = await withCapturedIO(() =>
      runEnsureGitignore({ projectRoot: root, argv: ["--remove"], manifest }),
    );
    assert.equal(removeLogs.exitCode, 0);
    const after = readFileSync(join(root, ".gitignore"), "utf8");
    assert.ok(
      !after.includes("# >>> adev:gitignore >>>"),
      "--remove must succeed even when knob is false",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
