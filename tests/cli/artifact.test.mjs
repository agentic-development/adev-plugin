// tests/cli/artifact.test.mjs
//
// Tests for `adev artifact commit` (lib/cli/artifact.mjs).
//
// Filed per epic-85 / issue-496 (validation charter build retro 2026-05-16):
// during the build, a socket closure during the validate step left the
// .validate.md report missing on disk even though all validator events
// fired. The verb solves this by enforcing a write-temp + atomic-rename
// flow.

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  realpathSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-artifact-test-")));
  mkdirSync(join(dir, ".context-index", "specs", "features", "m"), {
    recursive: true,
  });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
  );
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function writeTmpArtifact(dir, relSpecPath, kind, body) {
  const specAbs = join(dir, relSpecPath);
  const ext = kind === "validate" ? ".validate.md" : ".review.md";
  const dst = specAbs.replace(/\.spec\.md$/, ext);
  const tmp = `${dst}.tmp`;
  mkdirSync(dirname(tmp), { recursive: true });
  writeFileSync(tmp, body);
  return { tmp, dst };
}

// ── Driver-substrate contract ─────────────────────────────────────────────

test("lib/cli/artifact.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/artifact.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/artifact.mjs does NOT export LIFECYCLE_STEP (filesystem helper, not a step)", async () => {
  const mod = await import("../../lib/cli/artifact.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Usage / argument errors ───────────────────────────────────────────────

test("adev artifact with no subcommand exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "artifact"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|commit/i);
  } finally {
    cleanup(dir);
  }
});

test("adev artifact with unknown subcommand exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "artifact", "bogus"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /bogus|commit/i);
  } finally {
    cleanup(dir);
  }
});

test("adev artifact commit without --spec or --from exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "artifact", "commit"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--spec|--from/i);
  } finally {
    cleanup(dir);
  }
});

test("adev artifact commit --spec without --kind exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "artifact", "commit", "--spec", ".context-index/specs/features/m/x.spec.md"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--kind/i);
  } finally {
    cleanup(dir);
  }
});

test("adev artifact commit rejects unknown --kind", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "artifact",
        "commit",
        "--spec",
        ".context-index/specs/features/m/x.spec.md",
        "--kind",
        "bogus",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /kind|validate|review/i);
  } finally {
    cleanup(dir);
  }
});

test("adev artifact commit rejects --spec that is not a .spec.md path", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "artifact",
        "commit",
        "--spec",
        ".context-index/specs/features/m/notes.md",
        "--kind",
        "validate",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /\.spec\.md/i);
  } finally {
    cleanup(dir);
  }
});

test("adev artifact commit rejects --spec that escapes the project root", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "artifact", "commit", "--spec", "../../etc/passwd.spec.md", "--kind", "validate"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /escape|project root/i);
  } finally {
    cleanup(dir);
  }
});

// ── Source-validation errors ──────────────────────────────────────────────

test("adev artifact commit exits 1 when source .tmp is missing", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "artifact",
        "commit",
        "--spec",
        ".context-index/specs/features/m/x.spec.md",
        "--kind",
        "validate",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /missing|\.tmp/i);
  } finally {
    cleanup(dir);
  }
});

test("adev artifact commit rejects a zero-byte temp file", () => {
  const dir = makeTempProject();
  try {
    const { tmp, dst } = writeTmpArtifact(
      dir,
      ".context-index/specs/features/m/x.spec.md",
      "validate",
      "",
    );
    assert.ok(existsSync(tmp));
    const r = spawnSync(
      "node",
      [
        CLI,
        "artifact",
        "commit",
        "--spec",
        ".context-index/specs/features/m/x.spec.md",
        "--kind",
        "validate",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /empty|zero/i);
    // The temp file should remain for inspection; the destination should NOT
    // have been created.
    assert.ok(existsSync(tmp), "temp file should remain after failed commit");
    assert.ok(!existsSync(dst), "destination should not be created on failure");
  } finally {
    cleanup(dir);
  }
});

// ── Happy path ────────────────────────────────────────────────────────────

test("adev artifact commit renames .validate.md.tmp into place atomically", () => {
  const dir = makeTempProject();
  try {
    const body = "# Validation Report\n\nFull body here.\n";
    const { tmp, dst } = writeTmpArtifact(
      dir,
      ".context-index/specs/features/m/x.spec.md",
      "validate",
      body,
    );
    const r = spawnSync(
      "node",
      [
        CLI,
        "artifact",
        "commit",
        "--spec",
        ".context-index/specs/features/m/x.spec.md",
        "--kind",
        "validate",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(r.stdout, "", "silent on success");
    assert.ok(!existsSync(tmp), "temp file should be gone after rename");
    assert.ok(existsSync(dst), "destination should exist after rename");
    assert.strictEqual(readFileSync(dst, "utf8"), body);
  } finally {
    cleanup(dir);
  }
});

test("adev artifact commit works for kind=review as well", () => {
  const dir = makeTempProject();
  try {
    const body = "# Review Report\n\nReviewer findings.\n";
    const { tmp, dst } = writeTmpArtifact(
      dir,
      ".context-index/specs/features/m/x.spec.md",
      "review",
      body,
    );
    const r = spawnSync(
      "node",
      [
        CLI,
        "artifact",
        "commit",
        "--spec",
        ".context-index/specs/features/m/x.spec.md",
        "--kind",
        "review",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(!existsSync(tmp));
    assert.ok(existsSync(dst));
    assert.ok(dst.endsWith(".review.md"));
    assert.strictEqual(readFileSync(dst, "utf8"), body);
  } finally {
    cleanup(dir);
  }
});

test("adev artifact commit --from/--to commits an explicit src→dst pair", () => {
  const dir = makeTempProject();
  try {
    const tmpRel = ".context-index/specs/features/m/x.validate.md.tmp";
    const dstRel = ".context-index/specs/features/m/x.validate.md";
    const tmpAbs = join(dir, tmpRel);
    mkdirSync(dirname(tmpAbs), { recursive: true });
    const body = "content via --from/--to\n";
    writeFileSync(tmpAbs, body);
    const r = spawnSync(
      "node",
      [CLI, "artifact", "commit", "--from", tmpRel, "--to", dstRel],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(!existsSync(tmpAbs));
    assert.ok(existsSync(join(dir, dstRel)));
    assert.strictEqual(readFileSync(join(dir, dstRel), "utf8"), body);
  } finally {
    cleanup(dir);
  }
});

test("adev artifact commit --from without --to exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "artifact", "commit", "--from", "x.tmp"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--from|--to/i);
  } finally {
    cleanup(dir);
  }
});

test("adev artifact commit overwrites an existing destination (renameSync semantics)", () => {
  // This is the realistic re-run case: a prior .validate.md exists from an
  // earlier validation; the new commit replaces it.
  const dir = makeTempProject();
  try {
    const body = "new body\n";
    const { dst } = writeTmpArtifact(
      dir,
      ".context-index/specs/features/m/x.spec.md",
      "validate",
      body,
    );
    // Pre-populate the destination with stale content.
    writeFileSync(dst, "stale\n");
    const r = spawnSync(
      "node",
      [
        CLI,
        "artifact",
        "commit",
        "--spec",
        ".context-index/specs/features/m/x.spec.md",
        "--kind",
        "validate",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(readFileSync(dst, "utf8"), body);
  } finally {
    cleanup(dir);
  }
});
