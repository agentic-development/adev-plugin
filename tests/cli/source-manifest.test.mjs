// tests/cli/source-manifest.test.mjs
//
// Tests for `adev source-manifest` (lib/cli/source-manifest.mjs) — Task 5 of
// the inline-Node extraction sweep. Extracts the `verifyManifest` reference
// from skills/validate/SKILL.md (Check 1.5) and the `computeManifest`
// inline-Node block from skills/implement/SKILL.md (Step 5) into a single
// CLI verb with two subcommands.
//
// Spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// Plan: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.plan.md (Task 5)
// Source SKILL.md behavior:
//   skills/validate/SKILL.md "Check 1.5: Source Manifest Verification"
//   skills/implement/SKILL.md "Step 5: Update Spec Status and Source Manifest"
//
// Contract (driver-substrate.spec.md):
//   - Module exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — source-manifest verify is an
//     observational metadata check inside the validate step; compute is a
//     stamping helper inside the implement step. Neither is a step entry/exit.
//     The cli-driver pattern test will NOT assert requireGate-first.
//   - Exit codes:
//       0  verify PASS / drift detected (WARN) / compute success
//       1  argument error, spec/path containment failure, or unexpected error
//
// CLI surface:
//   adev source-manifest verify --spec <p>
//                               [--quiet]
//   adev source-manifest compute --files <p1>,<p2>,...
//                                [--out <path>]
//   adev source-manifest --help

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-srcmanifest-test-")));
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
    // ignore
  }
}

function writeSpec(dir, relPath, body) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  return abs;
}

function writeSrc(dir, relPath, body) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  return relPath;
}

// ── Driver-substrate contract ─────────────────────────────────────────────

test("lib/cli/source-manifest.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/source-manifest.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/source-manifest.mjs does NOT export LIFECYCLE_STEP (observational helper, not a lifecycle step)", async () => {
  const mod = await import("../../lib/cli/source-manifest.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Usage / argument errors ──────────────────────────────────────────────

test("adev source-manifest with no subcommand exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "source-manifest"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|verify|compute/i);
  } finally {
    cleanup(dir);
  }
});

test("adev source-manifest with unknown subcommand exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "source-manifest", "bogus"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|verify|compute|bogus/i);
  } finally {
    cleanup(dir);
  }
});

test("adev source-manifest --help exits 0 and prints usage with both subcommands", () => {
  const r = spawnSync("node", [CLI, "source-manifest", "--help"], {
    encoding: "utf8",
  });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /source-manifest/);
  assert.match(r.stdout, /verify/);
  assert.match(r.stdout, /compute/);
});

// ── verify: argument errors ──────────────────────────────────────────────

test("adev source-manifest verify without --spec exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "source-manifest", "verify"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--spec|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("adev source-manifest verify with out-of-bounds --spec path exits 1 (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "source-manifest", "verify", "--spec", "../../../etc/passwd"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /spec not found|escapes/i);
  } finally {
    cleanup(dir);
  }
});

test("adev source-manifest verify with missing --spec file exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "source-manifest",
        "verify",
        "--spec",
        ".context-index/specs/features/m/no-such.spec.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /spec not found/i);
  } finally {
    cleanup(dir);
  }
});

// ── verify: no source-manifest block ─────────────────────────────────────

test("adev source-manifest verify exits 0 with a SKIP note when spec has no source-manifest block", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/foo.spec.md";
    writeSpec(dir, specRel, "---\ncharter: m\n---\n# Live Spec: Foo\n");
    const r = spawnSync(
      "node",
      [CLI, "source-manifest", "verify", "--spec", specRel],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.match(r.stdout, /no source manifest|skip/i);
  } finally {
    cleanup(dir);
  }
});

// ── verify: PASS path ────────────────────────────────────────────────────

test("adev source-manifest verify exits 0 with PASS when source files match the stamped SHA", () => {
  const dir = makeTempProject();
  try {
    writeSrc(dir, "lib/feature.mjs", "export const x = 1;\n");
    writeSrc(dir, "tests/feature.test.mjs", "// tests\n");

    // Compute manifest first to get a real SHA.
    const r0 = spawnSync(
      "node",
      [
        CLI,
        "source-manifest",
        "compute",
        "--files",
        "lib/feature.mjs,tests/feature.test.mjs",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r0.status, 0, `compute failed: ${r0.stderr}`);
    const manifest = JSON.parse(r0.stdout);
    assert.ok(manifest.sha, "compute must return a sha");

    // Stamp the manifest into the spec frontmatter.
    const specRel = ".context-index/specs/features/m/foo.spec.md";
    const body = [
      "---",
      "charter: m",
      "source-manifest:",
      `  sha: "${manifest.sha}"`,
      "  files:",
      "    - lib/feature.mjs",
      "    - tests/feature.test.mjs",
      `  computed-at: "${manifest.computedAt}"`,
      "---",
      "# Live Spec: Foo",
      "",
    ].join("\n");
    writeSpec(dir, specRel, body);

    const r = spawnSync(
      "node",
      [CLI, "source-manifest", "verify", "--spec", specRel],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.match(r.stdout, /PASS|match/i);
  } finally {
    cleanup(dir);
  }
});

// ── verify: H1-prefixed frontmatter (regression for Bug 2) ──────────────

test("adev source-manifest verify recognizes the manifest when the spec opens with an H1 heading before frontmatter", () => {
  // Regression test: ~65% of specs in this repo begin with `# H1` BEFORE the
  // YAML frontmatter block. The CLI's readManifestFromSpec parser previously
  // required `body.startsWith("---\n")` and silently SKIP-ed all such specs.
  // This test forces the parser to handle pre-frontmatter content (an H1
  // heading, comments, blank lines) the same way `lib/source-manifest.mjs`
  // already does.
  const dir = makeTempProject();
  try {
    writeSrc(dir, "lib/feature.mjs", "export const x = 1;\n");
    writeSrc(dir, "tests/feature.test.mjs", "// tests\n");

    // Compute a real SHA over the source files.
    const r0 = spawnSync(
      "node",
      [
        CLI,
        "source-manifest",
        "compute",
        "--files",
        "lib/feature.mjs,tests/feature.test.mjs",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r0.status, 0, `compute failed: ${r0.stderr}`);
    const manifest = JSON.parse(r0.stdout);

    // Write a spec whose first line is an H1 heading, NOT `---`.
    const specRel = ".context-index/specs/features/m/h1-prefixed.spec.md";
    const body = [
      "# Refactoring Spec: Some Feature",
      "",
      "<!-- A comment block before frontmatter — also common in this repo. -->",
      "",
      "---",
      "charter: m",
      "source-manifest:",
      `  sha: "${manifest.sha}"`,
      "  files:",
      "    - lib/feature.mjs",
      "    - tests/feature.test.mjs",
      `  computed-at: "${manifest.computedAt}"`,
      "---",
      "",
      "## Behavioral Contract",
      "",
    ].join("\n");
    writeSpec(dir, specRel, body);

    const r = spawnSync(
      "node",
      [CLI, "source-manifest", "verify", "--spec", specRel],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(
      r.status,
      0,
      `stderr: ${r.stderr}\nstdout: ${r.stdout}`,
    );
    assert.match(
      r.stdout,
      /PASS|match/i,
      `H1-prefixed spec must be recognized; got: ${r.stdout}`,
    );
    assert.doesNotMatch(
      r.stdout,
      /SKIP/i,
      `H1-prefixed spec must not silently SKIP; got: ${r.stdout}`,
    );
  } finally {
    cleanup(dir);
  }
});

// ── verify: drift (WARN) ─────────────────────────────────────────────────

test("adev source-manifest verify exits 0 with WARN when a source file has drifted", () => {
  const dir = makeTempProject();
  try {
    writeSrc(dir, "lib/feature.mjs", "export const x = 1;\n");
    writeSrc(dir, "tests/feature.test.mjs", "// tests\n");

    // Compute manifest, then modify a file so the SHA no longer matches.
    const r0 = spawnSync(
      "node",
      [
        CLI,
        "source-manifest",
        "compute",
        "--files",
        "lib/feature.mjs,tests/feature.test.mjs",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r0.status, 0, `compute failed: ${r0.stderr}`);
    const manifest = JSON.parse(r0.stdout);

    // Drift the implementation file.
    writeSrc(dir, "lib/feature.mjs", "export const x = 2;\n");

    const specRel = ".context-index/specs/features/m/foo.spec.md";
    const body = [
      "---",
      "charter: m",
      "source-manifest:",
      `  sha: "${manifest.sha}"`,
      "  files:",
      "    - lib/feature.mjs",
      "    - tests/feature.test.mjs",
      `  computed-at: "${manifest.computedAt}"`,
      "---",
      "# Live Spec: Foo",
      "",
    ].join("\n");
    writeSpec(dir, specRel, body);

    const r = spawnSync(
      "node",
      [CLI, "source-manifest", "verify", "--spec", specRel],
      { encoding: "utf8", cwd: dir },
    );
    // Drift is a WARN, not a FAIL — exit 0, but stdout signals drift.
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.match(r.stdout, /WARN|drift|diverged/i);
    // Expect at least one drifted-file reference.
    assert.match(r.stdout, /lib\/feature\.mjs/);
  } finally {
    cleanup(dir);
  }
});

// ── verify: missing files (FAIL) ─────────────────────────────────────────

test("adev source-manifest verify exits 1 with FAIL when a manifest file no longer exists", () => {
  const dir = makeTempProject();
  try {
    writeSrc(dir, "lib/feature.mjs", "export const x = 1;\n");

    const r0 = spawnSync(
      "node",
      [CLI, "source-manifest", "compute", "--files", "lib/feature.mjs"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r0.status, 0, `compute failed: ${r0.stderr}`);
    const manifest = JSON.parse(r0.stdout);

    // Delete the source file.
    rmSync(join(dir, "lib", "feature.mjs"));

    const specRel = ".context-index/specs/features/m/foo.spec.md";
    const body = [
      "---",
      "charter: m",
      "source-manifest:",
      `  sha: "${manifest.sha}"`,
      "  files:",
      "    - lib/feature.mjs",
      `  computed-at: "${manifest.computedAt}"`,
      "---",
      "# Live Spec: Foo",
      "",
    ].join("\n");
    writeSpec(dir, specRel, body);

    const r = spawnSync(
      "node",
      [CLI, "source-manifest", "verify", "--spec", specRel],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.match(r.stdout + r.stderr, /FAIL|missing/i);
    assert.match(r.stdout + r.stderr, /lib\/feature\.mjs/);
  } finally {
    cleanup(dir);
  }
});

// ── verify: --quiet suppresses PASS chatter ──────────────────────────────

test("adev source-manifest verify --quiet emits no stdout on PASS", () => {
  const dir = makeTempProject();
  try {
    writeSrc(dir, "lib/feature.mjs", "export const x = 1;\n");

    const r0 = spawnSync(
      "node",
      [CLI, "source-manifest", "compute", "--files", "lib/feature.mjs"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r0.status, 0, `compute failed: ${r0.stderr}`);
    const manifest = JSON.parse(r0.stdout);

    const specRel = ".context-index/specs/features/m/foo.spec.md";
    const body = [
      "---",
      "charter: m",
      "source-manifest:",
      `  sha: "${manifest.sha}"`,
      "  files:",
      "    - lib/feature.mjs",
      `  computed-at: "${manifest.computedAt}"`,
      "---",
      "# Live Spec: Foo",
      "",
    ].join("\n");
    writeSpec(dir, specRel, body);

    const r = spawnSync(
      "node",
      [CLI, "source-manifest", "verify", "--spec", specRel, "--quiet"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    // --quiet suppresses the chatty PASS line. Allow trailing newline.
    assert.ok(
      r.stdout.length < 5,
      `expected near-empty stdout under --quiet, got: ${JSON.stringify(r.stdout)}`,
    );
  } finally {
    cleanup(dir);
  }
});

// ── compute: argument errors ─────────────────────────────────────────────

test("adev source-manifest compute without --files exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "source-manifest", "compute"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--files|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("adev source-manifest compute with empty --files exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "source-manifest", "compute", "--files", ""],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--files|empty|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("adev source-manifest compute with path traversal exits 1 (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "source-manifest", "compute", "--files", "../../../etc/passwd"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /escapes|outside|path/i);
  } finally {
    cleanup(dir);
  }
});

test("adev source-manifest compute with missing file exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "source-manifest", "compute", "--files", "lib/no-such.mjs"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /not found|missing|lib\/no-such\.mjs/i);
  } finally {
    cleanup(dir);
  }
});

// ── compute: happy path ──────────────────────────────────────────────────

test("adev source-manifest compute emits JSON manifest to stdout", () => {
  const dir = makeTempProject();
  try {
    writeSrc(dir, "lib/a.mjs", "const a = 1;\n");
    writeSrc(dir, "lib/b.mjs", "const b = 2;\n");

    const r = spawnSync(
      "node",
      [
        CLI,
        "source-manifest",
        "compute",
        "--files",
        "lib/a.mjs,lib/b.mjs",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(typeof parsed.sha, "string");
    assert.strictEqual(parsed.sha.length, 7);
    assert.deepStrictEqual(parsed.files, ["lib/a.mjs", "lib/b.mjs"]);
    assert.ok(parsed.computedAt);
    // computedAt is an ISO timestamp.
    assert.match(parsed.computedAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    cleanup(dir);
  }
});

test("adev source-manifest compute is deterministic across runs (same files → same sha)", () => {
  const dir = makeTempProject();
  try {
    writeSrc(dir, "lib/a.mjs", "const a = 1;\n");
    writeSrc(dir, "lib/b.mjs", "const b = 2;\n");

    const r1 = spawnSync(
      "node",
      [CLI, "source-manifest", "compute", "--files", "lib/a.mjs,lib/b.mjs"],
      { encoding: "utf8", cwd: dir },
    );
    const r2 = spawnSync(
      "node",
      [CLI, "source-manifest", "compute", "--files", "lib/b.mjs,lib/a.mjs"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r1.status, 0);
    assert.strictEqual(r2.status, 0);
    const m1 = JSON.parse(r1.stdout);
    const m2 = JSON.parse(r2.stdout);
    // SHA is order-independent (per computeManifest contract).
    assert.strictEqual(m1.sha, m2.sha);
    // Files are sorted.
    assert.deepStrictEqual(m1.files, m2.files);
  } finally {
    cleanup(dir);
  }
});

test("adev source-manifest compute with --out writes manifest JSON to file and exits 0", () => {
  const dir = makeTempProject();
  try {
    writeSrc(dir, "lib/a.mjs", "const a = 1;\n");

    const outRel = ".context-index/.tmp/manifest.json";
    const r = spawnSync(
      "node",
      [
        CLI,
        "source-manifest",
        "compute",
        "--files",
        "lib/a.mjs",
        "--out",
        outRel,
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    // The file should now exist + parse as JSON.
    const written = readFileSync(join(dir, outRel), "utf8");
    const parsed = JSON.parse(written);
    assert.strictEqual(typeof parsed.sha, "string");
    assert.deepStrictEqual(parsed.files, ["lib/a.mjs"]);
  } finally {
    cleanup(dir);
  }
});
