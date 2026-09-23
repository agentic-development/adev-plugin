// lib/cli/partial.mjs
//
// `adev partial {detect,resume,discard,inspect,commit}` — CLI surface wrapping
// lib/partial-artifact.mjs so adopting skills can drive .partial-artifact
// recovery via subcommands instead of inline Node per the cli-driver-surface
// charter "no inline Node in SKILL.md" rule.
//
// Subverbs:
//   adev partial detect     --root <dir>                              — list *.partial under <dir>
//   adev partial inspect    --artifact <path>                         — schema marker + lock state (read-only)
//   adev partial resume     --artifact <path>                         — informational: last coherent section
//   adev partial discard    --artifact <path> --spec <p>              — unlink + emit partial_recovery event
//   adev partial check-size --artifact <final-path> [--expected <n>]  — runaway-write guard; exit 2 over cap
//   adev partial commit     --artifact <path>                         — atomic rename `.partial` -> final (Behavior 2)
//
// All subverbs enforce path-containment via lib/partial-artifact.mjs::assertWithin.
// Exit codes:
//   0  success
//   1  argument error, containment failure, or missing file (inspect/resume on a
//      missing artifact reports missing fields in JSON rather than erroring; only
//      containment + arg-parse failures exit 1; commit exits 1 on a missing/empty
//      source or a frontmatter-guard failure — see cmdCommit)

import { parseArgs } from "node:util";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { safeRealpath as realpathOr, lenientRealpath } from "../path-safety.mjs";
import { safeUnlink } from "../safe-unlink.mjs";
import { hasLeadingFrontmatter } from "./artifact.mjs";

import {
  assertNotOversize,
  assertWithin,
  commitPartial,
  expectedSize,
  findPartials,
  isAllowedSchema,
  loadPartialKnobs,
  lockPath,
  partialPath,
  validateSchemaMarker,
} from "../partial-artifact.mjs";
import { reportPartialRecovery } from "../lifecycle-state.mjs";

const USAGE =
  "usage: adev partial <detect|inspect|resume|discard|check-size|commit> [--root <dir>] [--artifact <path>] [--spec <spec-path>] [--expected <bytes>]";

/**
 * Artifact kinds `adev/frontmatter-present` covers (tier1/frontmatter-present.mjs
 * docstring; `incremental-artifact-writes.spec.md` Preconditions "Marker placement"
 * bullet). Only these kinds carry a YAML-frontmatter contract — `.plan.md` has none,
 * so `cmdCommit` never runs the frontmatter guard for a plan artifact.
 */
const FRONTMATTER_REQUIRED_SUFFIXES = [".spec.md", ".charter.md", ".review.md", ".validate.md"];

function requiresLeadingFrontmatter(finalPath) {
  return FRONTMATTER_REQUIRED_SUFFIXES.some((suffix) => finalPath.endsWith(suffix));
}

export async function run({ projectRoot, argv }) {
  const sub = argv[0];
  if (!sub) {
    console.error(USAGE);
    process.exit(1);
  }
  // realpathSync normalises symlinks (e.g., macOS /var → /private/var) so
  // the containment check matches user-supplied paths regardless of which
  // form (symlinked or real) the caller used. Fallback to resolve() when
  // the project root has not yet been created on disk.
  const absRoot = realpathOr(resolve(projectRoot));

  switch (sub) {
    case "detect":
      return cmdDetect(absRoot, argv.slice(1));
    case "inspect":
      return cmdInspect(absRoot, argv.slice(1));
    case "resume":
      return cmdResume(absRoot, argv.slice(1));
    case "discard":
      return cmdDiscard(absRoot, argv.slice(1));
    case "check-size":
      return cmdCheckSize(absRoot, argv.slice(1));
    case "commit":
      return cmdCommit(absRoot, argv.slice(1));
    default:
      console.error(`unknown subverb: ${sub}\n${USAGE}`);
      process.exit(1);
  }
}

// ── detect ──────────────────────────────────────────────────────────────────

function cmdDetect(absRoot, argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { root: { type: "string" } },
      allowPositionals: false,
    });
  } catch {
    console.error("usage: adev partial detect --root <dir>");
    process.exit(1);
  }
  const rootArg = parsed.values.root || ".";
  const resolvedRoot = lenientRealpath(isAbsolute(rootArg) ? rootArg : resolve(absRoot, rootArg));
  let containedRoot;
  try {
    containedRoot = assertWithin(absRoot, resolvedRoot);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const partials = findPartials(containedRoot);
  console.log(
    JSON.stringify({
      partials: partials.map((p) => ({
        path: p,
        relative: p.startsWith(absRoot + sep) ? p.slice(absRoot.length + 1) : p,
        size: safeSize(p),
        mtime: safeMtime(p),
      })),
    })
  );
  process.exit(0);
}

// ── inspect (read-only) ────────────────────────────────────────────────────

function cmdInspect(absRoot, argv) {
  const { artifact } = parseArtifactArgs(absRoot, argv, "inspect");
  const exists = existsSync(artifact);
  if (!exists) {
    console.log(
      JSON.stringify({
        partial_exists: false,
        schema_marker: null,
        schema_allowed: false,
        lock_exists: false,
      })
    );
    process.exit(0);
  }
  const marker = readSchemaMarker(artifact);
  const allowed = marker ? isAllowedSchema(marker) : false;
  const lock = lockOf(artifact);
  console.log(
    JSON.stringify({
      partial_exists: true,
      schema_marker: marker,
      schema_allowed: allowed,
      lock_exists: existsSync(lock),
      size: safeSize(artifact),
      mtime: safeMtime(artifact),
    })
  );
  process.exit(0);
}

// ── resume (informational; does NOT modify the partial) ────────────────────

function cmdResume(absRoot, argv) {
  const { artifact } = parseArtifactArgs(absRoot, argv, "resume");
  const exists = existsSync(artifact);
  if (!exists) {
    console.log(
      JSON.stringify({
        partial_exists: false,
        schema_marker: null,
        last_section: null,
      })
    );
    process.exit(0);
  }
  const body = readFileSync(artifact, "utf8");
  const marker = readSchemaMarker(artifact);
  console.log(
    JSON.stringify({
      partial_exists: true,
      schema_marker: marker,
      schema_allowed: marker ? isAllowedSchema(marker) : false,
      last_section: lastCoherentSection(body),
    })
  );
  process.exit(0);
}

// ── discard (mutating; unlinks and records lifecycle event) ────────────────

function cmdDiscard(absRoot, argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        artifact: { type: "string" },
        spec: { type: "string" },
      },
      allowPositionals: false,
    });
  } catch {
    console.error("usage: adev partial discard --artifact <path> --spec <spec-path>");
    process.exit(1);
  }
  const { artifact: artifactArg, spec: specArg } = parsed.values;
  if (!artifactArg) {
    console.error("--artifact is required");
    process.exit(1);
  }
  if (!specArg) {
    console.error("--spec is required (lifecycle log target)");
    process.exit(1);
  }
  let absArtifact;
  try {
    const resolved = lenientRealpath(isAbsolute(artifactArg) ? artifactArg : resolve(absRoot, artifactArg));
    absArtifact = assertWithin(absRoot, resolved);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  let priorTs;
  try {
    priorTs = statSync(absArtifact).mtime.toISOString();
  } catch {
    priorTs = new Date().toISOString();
  }

  safeUnlink(absArtifact);
  safeUnlink(lockOf(absArtifact));

  // Compute project-root-relative artifact path for the event payload
  // (SEC-3 data-exposure boundary: no absolute paths in the lifecycle log).
  const relArtifact = absArtifact.startsWith(absRoot + sep)
    ? absArtifact.slice(absRoot.length + 1)
    : absArtifact;

  try {
    reportPartialRecovery(absRoot, specArg, {
      artifact_path: relArtifact,
      prior_partial_ts: priorTs,
      action: "discarded",
      dispatch_mode: "foreground",
    });
  } catch (err) {
    // Lifecycle write failures are surfaced but the unlink already happened.
    console.error(`partial_recovery write failed: ${err.message}`);
    process.exit(1);
  }
  console.log(JSON.stringify({ discarded: relArtifact, action: "discarded" }));
  process.exit(0);
}

// ── commit (mutating; atomic rename per Behavior 2) ─────────────────────────

function cmdCommit(absRoot, argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { artifact: { type: "string" } },
      allowPositionals: false,
    });
  } catch {
    console.error("usage: adev partial commit --artifact <path>");
    process.exit(1);
  }
  const arg = parsed.values.artifact;
  if (!arg) {
    console.error("--artifact is required");
    process.exit(1);
  }
  // Accept either the `.partial` path or the already-final path — mirrors
  // check-size's normalization so callers can pass whichever they have.
  const normalized = arg.endsWith(".partial") ? arg.slice(0, -".partial".length) : arg;
  let finalAbs;
  try {
    const resolved = lenientRealpath(isAbsolute(normalized) ? normalized : resolve(absRoot, normalized));
    finalAbs = assertWithin(absRoot, resolved);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const partialAbs = partialPath(finalAbs);
  if (!existsSync(partialAbs)) {
    console.error(`source artifact missing: ${partialAbs}`);
    process.exit(1);
  }
  let stat;
  try {
    stat = statSync(partialAbs);
  } catch (err) {
    console.error(`stat failed on source: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }
  if (!stat.isFile()) {
    console.error(`source is not a regular file: ${partialAbs}`);
    process.exit(1);
  }
  if (stat.size === 0) {
    console.error(`source is empty: ${partialAbs}`);
    console.error("  refusing to commit a zero-byte artifact (likely truncated write)");
    process.exit(1);
  }

  // Mirrors `adev artifact commit`'s guard (lib/cli/artifact.mjs) so both
  // commit paths a lifecycle artifact can travel enforce the same contract:
  // `adev/frontmatter-present` (severity: error) requires the first non-blank
  // line of the four frontmatter-carrying kinds to be `---`.
  if (requiresLeadingFrontmatter(finalAbs) && !hasLeadingFrontmatter(partialAbs)) {
    console.error(`ARTIFACT_FRONTMATTER_NOT_FIRST: ${partialAbs}`);
    console.error("  the first non-blank line must be the '---' frontmatter delimiter");
    console.error("  move the YAML frontmatter above any heading or HTML comment, then re-run");
    process.exit(1);
  }

  try {
    commitPartial(finalAbs);
  } catch (err) {
    console.error(`rename failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }
  // Behavior 2: the commit step also unlinks the sidecar lock. Best-effort —
  // the rename already succeeded, so a lock already gone is not an error.
  safeUnlink(lockPath(finalAbs));

  const relFinal = finalAbs.startsWith(absRoot + sep) ? finalAbs.slice(absRoot.length + 1) : finalAbs;
  console.log(JSON.stringify({ committed: relFinal }));
  process.exit(0);
}

// ── shared helpers ──────────────────────────────────────────────────────────

// ── check-size ─────────────────────────────────────────────────────────────

function cmdCheckSize(absRoot, argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        artifact: { type: "string" },
        expected: { type: "string" },
      },
      allowPositionals: false,
    });
  } catch {
    console.error("usage: adev partial check-size --artifact <final-path> [--expected <bytes>]");
    process.exit(1);
  }
  const arg = parsed.values.artifact;
  if (!arg) {
    console.error("--artifact is required");
    process.exit(1);
  }
  // `--artifact` is the FINAL path (without `.partial`). If the caller
  // passes the partial form, strip the suffix so `assertNotOversize` can
  // call `partialPath()` correctly. The final path typically doesn't exist
  // on disk yet (we're checking the in-progress partial), so resolution uses
  // `lenientRealpath` — it walks existing parent directories (normalising
  // any symlink segments, e.g. macOS's /var -> /private/var) and appends the
  // non-existent trailing component literally, unlike `safeRealpath`, which
  // gives up and returns the raw unresolved path the instant any component
  // is missing.
  const normalized = arg.endsWith(".partial") ? arg.slice(0, -".partial".length) : arg;
  const rawFinal = isAbsolute(normalized) ? normalized : resolve(absRoot, normalized);

  let finalAbs;
  try {
    const resolved = lenientRealpath(rawFinal);
    finalAbs = assertWithin(absRoot, resolved);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const knobs = loadPartialKnobs(absRoot);
  const expectedOverride = parsed.values.expected
    ? Number.parseInt(parsed.values.expected, 10)
    : null;
  const expected =
    expectedOverride && Number.isFinite(expectedOverride) && expectedOverride > 0
      ? expectedOverride
      : expectedSize(finalAbs, knobs);
  const cap = expected * knobs.partial_oversize_multiplier;
  const partial = partialPath(finalAbs);
  const actual = safeSize(partial);

  try {
    if (expectedOverride && Number.isFinite(expectedOverride) && expectedOverride > 0) {
      // Manual expected-size override path: compare directly so the knob-driven
      // helper isn't second-guessing the caller. assertNotOversize is the
      // canonical path when no override is supplied.
      if (actual !== null && actual > cap) {
        const err = new Error(
          `Partial ${partial} (${actual} bytes) exceeds ${knobs.partial_oversize_multiplier}× expected (${expected} bytes, cap=${cap}).`,
        );
        err.code = "PARTIAL_ARTIFACT_OVERSIZE";
        throw err;
      }
    } else {
      assertNotOversize(finalAbs, { projectRoot: absRoot });
    }
  } catch (err) {
    if (err && err.code === "PARTIAL_ARTIFACT_OVERSIZE") {
      console.log(JSON.stringify({ ok: false, code: err.code, actual, expected, cap, partial }));
      process.exit(2);
    }
    console.error(err.message || String(err));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, actual, expected, cap, partial }));
}

function parseArtifactArgs(absRoot, argv, subverb) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { artifact: { type: "string" } },
      allowPositionals: false,
    });
  } catch {
    console.error(`usage: adev partial ${subverb} --artifact <path>`);
    process.exit(1);
  }
  const arg = parsed.values.artifact;
  if (!arg) {
    console.error(`--artifact is required`);
    process.exit(1);
  }
  let abs;
  try {
    const resolved = lenientRealpath(isAbsolute(arg) ? arg : resolve(absRoot, arg));
    abs = assertWithin(absRoot, resolved);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  return { artifact: abs };
}

/**
 * Read the partial_schema marker from the artifact, if any. Looks at the
 * first ~4 KB of the file for a `partial_schema: <marker>` token surrounded
 * by any prose (HTML comments, JSON keys, YAML frontmatter — the marker
 * grammar is restrictive enough that a naive scan is safe).
 */
function readSchemaMarker(absArtifact) {
  let body;
  try {
    const fd = readFileSync(absArtifact, { encoding: "utf8" });
    body = fd.slice(0, 4096);
  } catch {
    return null;
  }
  const m = body.match(/partial_schema:\s*([a-z][a-z0-9-]{0,31}@[0-9]{1,3})/);
  if (!m) return null;
  try {
    validateSchemaMarker(m[1]);
    return m[1];
  } catch {
    return null;
  }
}

/**
 * Return the last fully-formed `## Section` block (markdown-aware
 * heuristic). A torn final section (no closing newline after the heading)
 * is dropped. Returns null if no `## ` headings are present.
 */
function lastCoherentSection(body) {
  if (typeof body !== "string" || body.length === 0) return null;
  const lines = body.split("\n");
  // Find indices of every "## " heading line.
  const headIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) headIndices.push(i);
  }
  if (headIndices.length === 0) return null;
  // Walk backwards looking for the most recent heading whose section block
  // is followed by at least one content line.
  for (let h = headIndices.length - 1; h >= 0; h--) {
    const start = headIndices[h];
    const end = h + 1 < headIndices.length ? headIndices[h + 1] : lines.length;
    const block = lines.slice(start, end).join("\n").trimEnd();
    // A "coherent" section has at least one non-heading line of content.
    const contentLines = lines.slice(start + 1, end).filter((l) => l.trim().length > 0);
    if (contentLines.length > 0) {
      return block;
    }
  }
  return null;
}

function lockOf(absArtifact) {
  // absArtifact ends with `.partial`; lockPath expects the final-path form.
  if (absArtifact.endsWith(".partial")) {
    const finalP = absArtifact.slice(0, -".partial".length);
    return lockPath(finalP);
  }
  // If the caller passes the final-path form directly, use lockPath.
  return lockPath(absArtifact);
}

function safeSize(path) {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

function safeMtime(path) {
  try {
    return statSync(path).mtime.toISOString();
  } catch {
    return null;
  }
}

export function help() {
  console.log("Usage: adev partial <subverb> [flags]");
  console.log("");
  console.log("Subverbs:");
  console.log("  detect     --root <dir>                                  list *.partial files under <dir>");
  console.log("  inspect    --artifact <path>                             show schema marker + lock state (read-only)");
  console.log("  resume     --artifact <path>                             informational: last coherent section");
  console.log("  discard    --artifact <path> --spec <spec-path>          unlink partial + lock; record partial_recovery");
  console.log("  check-size --artifact <final-path> [--expected <bytes>]  runaway-write guard; exit 2 over cap");
  console.log("  commit     --artifact <path>                             atomic rename `.partial` -> final; enforces");
  console.log("                                                            frontmatter-first for spec/charter/review/validate");
  console.log("");
  console.log("All --artifact and --root paths are containment-checked against the project root.");
}
