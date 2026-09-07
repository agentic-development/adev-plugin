// lib/cli/source-manifest.mjs
//
// `adev source-manifest` — CLI surface for source-manifest verify and
// source-manifest compute.
//
// Multi-mode verb per spec Behavior 9 — CLI-verb naming is canonical and
// shared. The single verb dispatches to `verify` (read-side, used during
// validate) and `compute` (write-side, used during implement to stamp the
// manifest into a spec frontmatter).
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — verify is an observational metadata
//     check inside the validate step; compute is a stamping helper inside
//     the implement step. Neither is a lifecycle-step entry/exit. The
//     cli-driver pattern test (tests/cli-driver-pattern.test.mjs) does NOT
//     assert requireGate-first on this module.
//
// CLI surface:
//   adev source-manifest verify  --spec <p> [--quiet]
//   adev source-manifest compute --files <p1>,<p2>,... [--out <path>]
//   adev source-manifest --help
//
// Exit codes (per hook protocol):
//   0  verify PASS / verify SKIP (no manifest) / verify WARN (drift)
//      / compute success
//   1  argument error, spec/path containment failure, missing source file,
//      verify FAIL (missing files in manifest), unexpected error

import { parseArgs } from "node:util";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { resolveContained } from "../path-safety.mjs";

import {
  computeManifest,
  extractManifestFromFrontmatter,
  verifyManifest,
} from "../source-manifest.mjs";

const USAGE =
  "usage: adev source-manifest <verify|compute> [flags]";

/**
 * Extract the `source-manifest` YAML block from a spec's frontmatter. Pure
 * string scan to keep the helper zero-dep (per Constitution Principle 1).
 * Returns `{ sha, files, computedAt }` or null when absent / unparseable.
 *
 * Mirrors the shape returned by lib/source-manifest.mjs::computeManifest so
 * that `verifyManifest` can consume it directly.
 */
// Delegates to `extractManifestFromFrontmatter` in lib/source-manifest.mjs so
// there is a single source of truth for frontmatter parsing. The lib's regex
// pattern handles specs that open with content before the frontmatter
// (e.g. a `# H1` heading or HTML comment block — common in this repo),
// whereas an earlier in-CLI parser required `---` at byte 0 and silently
// returned null for ~65% of specs. See debug intervention 2026-05-18.
function readManifestFromSpec(absSpec) {
  return extractManifestFromFrontmatter(absSpec);
}

export async function run({ projectRoot, argv }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (sub === "verify") {
    return await runVerify({ projectRoot, argv: argv.slice(1) });
  }
  if (sub === "compute") {
    return await runCompute({ projectRoot, argv: argv.slice(1) });
  }

  console.error(USAGE);
  console.error(`  unknown subcommand: ${sub} (expected verify or compute)`);
  process.exit(1);
}

async function runVerify({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        spec: { type: "string" },
        quiet: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }

  const v = parsed.values;

  if (v.help) {
    help();
    process.exit(0);
  }

  if (!v.spec) {
    console.error(USAGE);
    console.error("  verify requires --spec");
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);
  const absSpec = resolveContained(absRoot, v.spec);
  if (!absSpec) {
    console.error(`spec not found: ${v.spec}`);
    process.exit(1);
  }
  if (!existsSync(absSpec)) {
    console.error(`spec not found: ${v.spec}`);
    process.exit(1);
  }

  const manifest = readManifestFromSpec(absSpec);
  if (!manifest) {
    // No source-manifest block — observational SKIP, per Check 1.5 prose.
    if (!v.quiet) {
      console.log(
        "Check 1.5: SKIP — no source manifest found. Run /adev:implement to stamp one.",
      );
    }
    process.exit(0);
  }

  // Delegate to lib/source-manifest.mjs::verifyManifest.
  let result;
  try {
    result = await verifyManifest(manifest, absRoot);
  } catch (err) {
    console.error(`source-manifest verify failed: ${err.message ?? err}`);
    process.exit(1);
  }

  // Missing files → FAIL (Check 1.5 reports FAIL for missing).
  if (Array.isArray(result.missingFiles) && result.missingFiles.length > 0) {
    console.log(
      `Check 1.5: FAIL — missing source files: ${result.missingFiles.join(", ")}`,
    );
    process.exit(1);
  }

  if (result.matches) {
    if (!v.quiet) {
      console.log(
        `Check 1.5: PASS — source manifest matches (sha: ${manifest.sha})`,
      );
    }
    process.exit(0);
  }

  // SHA mismatch but no missing files → drift (WARN). Per Check 1.5,
  // drift is non-blocking — exit 0, but emit a WARN line listing the
  // drifted file(s). We approximate "drifted" as the manifest.files set
  // when SHA does not match: the underlying verifyManifest does not yet
  // report per-file diffs, so we surface the bulk WARN with the file
  // list (Check 1.5 prose allows this — "List each drifted file"; when
  // we cannot identify which subset diverged, we list the full set).
  const fileList = manifest.files.join(", ");
  console.log(
    `Check 1.5: WARN — source manifest drifted (expected sha ${manifest.sha}, ` +
      `actual ${result.currentSha ?? "?"}). Files: ${fileList}`,
  );
  process.exit(0);
}

async function runCompute({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        files: { type: "string" },
        out: { type: "string" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }

  const v = parsed.values;

  if (v.help) {
    help();
    process.exit(0);
  }

  if (v.files === undefined || v.files === null) {
    console.error(USAGE);
    console.error("  compute requires --files <p1>,<p2>,...");
    process.exit(1);
  }

  const fileList = v.files
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (fileList.length === 0) {
    console.error(USAGE);
    console.error("  --files is empty (expected comma-separated paths)");
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);

  // Containment check on every file before delegating to computeManifest —
  // the lib does its own check + throws PATH_OUTSIDE_ROOT, but pre-checking
  // here gives a clearer error message and consistent exit code.
  for (const f of fileList) {
    const abs = resolveContained(absRoot, f);
    if (!abs) {
      console.error(`path escapes project root: ${f}`);
      process.exit(1);
    }
  }

  let result;
  try {
    result = await computeManifest(fileList, absRoot);
  } catch (err) {
    if (err && err.code === "FILES_NOT_FOUND") {
      const missing = (err.missingFiles ?? []).join(", ");
      console.error(`source-manifest compute: file not found: ${missing}`);
      process.exit(1);
    }
    if (err && err.code === "PATH_OUTSIDE_ROOT") {
      console.error(`path escapes project root: ${err.message}`);
      process.exit(1);
    }
    console.error(`source-manifest compute failed: ${err.message ?? err}`);
    process.exit(1);
  }

  const json = JSON.stringify(result);

  if (v.out) {
    const absOut = resolveContained(absRoot, v.out);
    if (!absOut) {
      console.error(`--out path escapes project root: ${v.out}`);
      process.exit(1);
    }
    try {
      mkdirSync(dirname(absOut), { recursive: true });
      writeFileSync(absOut, json + "\n");
    } catch (err) {
      console.error(`source-manifest compute: write failed: ${err.message ?? err}`);
      process.exit(1);
    }
    process.exit(0);
  }

  console.log(json);
  process.exit(0);
}

export function help() {
  console.log("Usage: adev source-manifest <verify|compute> [flags]");
  console.log("");
  console.log("Source-manifest verify and compute. Replaces the inline-Node");
  console.log("blocks formerly embedded in skills/validate/SKILL.md (Check 1.5)");
  console.log("and skills/implement/SKILL.md (Step 5 — Compute source manifest).");
  console.log("");
  console.log("Subcommands:");
  console.log("");
  console.log("  verify --spec <path> [--quiet]");
  console.log("    Read the spec's source-manifest frontmatter block and");
  console.log("    verify the listed source files against the stamped SHA.");
  console.log("    Stdout (single line):");
  console.log("      Check 1.5: PASS  — source manifest matches");
  console.log("      Check 1.5: WARN  — source manifest drifted");
  console.log("      Check 1.5: SKIP  — no source manifest found");
  console.log("      Check 1.5: FAIL  — missing source files");
  console.log("    Exit codes:");
  console.log("      0  PASS, WARN (drift), or SKIP (no manifest)");
  console.log("      1  FAIL (missing files), argument error, or spec not found");
  console.log("    --quiet suppresses PASS/SKIP stdout (errors + WARN still emitted).");
  console.log("");
  console.log("  compute --files <p1>,<p2>,... [--out <path>]");
  console.log("    Compute a deterministic SHA-256 manifest over the listed");
  console.log("    files (project-root-relative). Output is a JSON object");
  console.log("    matching `computeManifest()` return shape:");
  console.log("      { sha, files, computedAt }");
  console.log("    Stdout: pretty single-line JSON unless --out is supplied,");
  console.log("    in which case the JSON is written to <path> instead.");
  console.log("    Exit codes:");
  console.log("      0  success");
  console.log("      1  argument error, missing file, or path traversal");
}
