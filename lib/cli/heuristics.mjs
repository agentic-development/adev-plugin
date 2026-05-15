// lib/cli/heuristics.mjs
//
// `adev heuristics extract` — CLI surface for `/adev:validate` Check 13
// (Success Heuristic Extraction).
//
// On first-run PASS, /adev:validate writes a positive pattern heuristic
// at `medium` confidence into `.context-index/heuristics/<scope>.md`.
// This helper performs that work as a deterministic, testable CLI verb,
// replacing the inline-Node block previously embedded in
// `skills/validate/SKILL.md`.
//
// Source spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// Source SKILL.md behavior: skills/validate/SKILL.md "Check 13: Success Heuristic Extraction"
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — Check 13 is observational inside
//     the validate step, not a lifecycle step itself. The cli-driver
//     pattern test will NOT assert requireGate-first on this module.
//
// Exit codes:
//   0  success OR SKIP (Check 13 is observational; SKIP is informational)
//   1  argument error or spec containment failure
//
// Stdout (single line, matching Check 13 prose in skills/validate/SKILL.md):
//   "Check 13: Success Heuristic Extracted — <id> (scope: <scope>, confidence: <confidence>)"
//   "Check 13: SKIP — <reason>"
//
// Usage:
//   adev heuristics extract --spec <spec> --report <validation-report>
//                           [--pattern <text>] [--check-first-run]

import { parseArgs } from "node:util";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

import { writeHeuristic } from "../heuristics.mjs";

const USAGE =
  "usage: adev heuristics extract --spec <path> --report <path> [--pattern <text>] [--check-first-run]";

/**
 * Compute today's date as YYYY-MM-DD. Matches lib/heuristics.mjs::today().
 */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Spec-Slug Derivation Rule (per skills/validate/SKILL.md "Check 13"):
 *   1. Take spec basename without `.md`.
 *   2. Lowercase, replace non-alphanumerics with `-`.
 *   3. Collapse consecutive `-`; strip leading/trailing `-`.
 *
 * Returns an empty string for pathological filenames (caller treats this
 * as the "invalid spec slug" SKIP reason).
 */
export function specSlug(specPath) {
  const stem = basename(specPath, ".md");
  const lowered = stem.toLowerCase();
  const replaced = lowered.replace(/[^a-z0-9]/g, "-");
  const collapsed = replaced.replace(/-+/g, "-");
  return collapsed.replace(/^-+|-+$/g, "");
}

/**
 * ID Derivation Rule (per Check 13 spec):
 *   `<spec-slug>-<hash>` where hash is 8 lowercase hex chars of
 *   SHA-256(<normalized-lowercased-abs-path> + "|" + <pattern-text>).
 *   Path separators normalised to forward slashes before lowercasing.
 */
export function deriveId(specSlug, absSpecPath, patternText) {
  const normalisedPath = absSpecPath.split(sep).join("/").toLowerCase();
  const h = createHash("sha256");
  h.update(`${normalisedPath}|${patternText}`);
  return `${specSlug}-${h.digest("hex").slice(0, 8)}`;
}

/**
 * Title Derivation Rule: read first H1 from the spec file, strip leading
 * "Live Spec: " prefix, cap at 120 chars. Returns null if no heading found.
 */
function deriveTitle(specPath) {
  let body;
  try {
    body = readFileSync(specPath, "utf8");
  } catch {
    return null;
  }
  const lines = body.split("\n");
  for (const line of lines) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) {
      let t = m[1];
      if (t.startsWith("Live Spec: ")) {
        t = t.slice("Live Spec: ".length);
      }
      // Format: "First-run PASS: <title>" capped at 120.
      const prefix = "First-run PASS: ";
      const room = 120 - prefix.length;
      if (t.length > room) {
        t = t.slice(0, room - 3) + "...";
      }
      return prefix + t;
    }
  }
  return null;
}

/**
 * Parse YAML frontmatter `charter:` field. Returns the value or null.
 * Pure string scan — avoids depending on a YAML parser for a single field.
 */
function readCharterField(specPath) {
  let body;
  try {
    body = readFileSync(specPath, "utf8");
  } catch {
    return null;
  }
  // Frontmatter delimited by `---` lines at file start.
  if (!body.startsWith("---\n") && !body.startsWith("---\r\n")) return null;
  const end = body.indexOf("\n---", 4);
  if (end < 0) return null;
  const front = body.slice(4, end);
  for (const line of front.split(/\r?\n/)) {
    const m = line.match(/^charter:\s*(.+?)\s*$/);
    if (m) {
      // Strip surrounding quotes if any
      return m[1].replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

/**
 * Resolve scope. Per Check 13:
 *   1. Read `charter:` from spec frontmatter.
 *   2. basename() the value (defensive).
 *   3. Look up against `manifest.modules[].slug`.
 *   4. Use it as scope if matched; else fall back to `_global`.
 *   5. Return null if no charter field at all (caller SKIPs).
 */
function resolveScope(specPath, manifest) {
  const charter = readCharterField(specPath);
  if (!charter) return null;
  const safe = basename(charter); // strip traversal sequences
  const modules =
    manifest && Array.isArray(manifest.modules) ? manifest.modules : [];
  const slugs = modules.map((m) => m && m.slug).filter((s) => typeof s === "string");
  return slugs.includes(safe) ? safe : "_global";
}

/**
 * Default success-factor pattern when no --pattern argument supplied.
 */
function defaultPattern(title) {
  // Title already has the "First-run PASS: " prefix from deriveTitle().
  const base = title.replace(/^First-run PASS: /, "");
  return `First-run PASS for ${base}: implementation matched all acceptance criteria without revision`;
}

/**
 * Parse argv into normalised options.
 */
function parseExtractArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        spec: { type: "string" },
        report: { type: "string" },
        pattern: { type: "string" },
        "check-first-run": { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const v = parsed.values;
  return {
    ok: true,
    opts: {
      spec: v.spec ?? null,
      report: v.report ?? null,
      pattern: v.pattern ?? null,
      checkFirstRun: !!v["check-first-run"],
      help: !!v.help,
    },
  };
}

/**
 * Containment check (mirrors lib/cli/gate.mjs SEC-1 pattern): resolve
 * `relPath` against `absRoot` and reject anything that escapes the tree.
 * Returns the absolute path on success, or null on out-of-bounds.
 */
function resolveContained(absRoot, relPath) {
  const abs = isAbsolute(relPath) ? relPath : resolve(absRoot, relPath);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) return null;
  return abs;
}

export async function run({ projectRoot, argv, manifest }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (sub !== "extract") {
    console.error(USAGE);
    process.exit(1);
  }

  const parseResult = parseExtractArgs(argv.slice(1));
  if (!parseResult.ok) {
    console.error(USAGE);
    process.exit(1);
  }

  const { opts } = parseResult;

  if (opts.help) {
    help();
    process.exit(0);
  }

  if (!opts.spec) {
    console.error(USAGE);
    console.error("  missing --spec");
    process.exit(1);
  }
  if (!opts.report) {
    console.error(USAGE);
    console.error("  missing --report");
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);

  // Spec containment + existence
  const absSpec = resolveContained(absRoot, opts.spec);
  if (!absSpec) {
    console.error(`spec not found: ${opts.spec}`);
    process.exit(1);
  }
  if (!existsSync(absSpec)) {
    console.error(`spec not found: ${opts.spec}`);
    process.exit(1);
  }

  // Report containment is informational — we never read the report file
  // here, only record its path in evidence[]. But still apply containment
  // to keep evidence references stable + safe.
  const absReport = resolveContained(absRoot, opts.report);
  if (!absReport) {
    console.error(`report path escapes project root: ${opts.report}`);
    process.exit(1);
  }
  // Project-root-relative report path for evidence[]. Falls back to the
  // raw argument if it was already relative.
  const reportRel = isAbsolute(opts.report)
    ? absReport.startsWith(absRoot + sep)
      ? absReport.slice(absRoot.length + 1)
      : opts.report
    : opts.report;

  // ── First-run gating (opt-in via --check-first-run) ────────────────
  // When the caller asks us to check, look for a <spec-slug>.validate.md
  // sibling. If it exists, SKIP. This mirrors the Check 13 "First-Run
  // Detection Rule" in skills/validate/SKILL.md.
  const slug = specSlug(absSpec);
  if (slug === "") {
    console.log("Check 13: SKIP — invalid spec slug");
    process.exit(0);
  }

  if (opts.checkFirstRun) {
    const validateFile = join(dirname(absSpec), `${slug}.validate.md`);
    if (existsSync(validateFile)) {
      try {
        const st = statSync(validateFile);
        // Compare absolute paths to detect the caller passing the same
        // file as both --report and the implicit first-run marker.
        // In normal /adev:validate flow, the report is written AFTER
        // Check 13 — so the marker should not yet exist at this point.
        if (st.isFile()) {
          console.log("Check 13: SKIP — not first-run PASS");
          process.exit(0);
        }
      } catch {
        // ignore — fall through to extraction
      }
    }
  }

  // ── Scope derivation ────────────────────────────────────────────────
  const scope = resolveScope(absSpec, manifest);
  if (scope === null) {
    console.log("Check 13: SKIP — no charter scope");
    process.exit(0);
  }

  // ── Title + pattern derivation ─────────────────────────────────────
  let title = deriveTitle(absSpec);
  if (title === null) {
    // Fall back to spec-slug as title
    title = `First-run PASS: ${slug}`;
  }

  const patternText =
    typeof opts.pattern === "string" && opts.pattern.length > 0
      ? opts.pattern
      : defaultPattern(title);

  // ── ID derivation ───────────────────────────────────────────────────
  const id = deriveId(slug, absSpec, patternText);

  // ── writeHeuristic ──────────────────────────────────────────────────
  // Wrapped in try/catch so any failure degrades to SKIP — Check 13 is
  // observational and must never affect overall PASS/FAIL.
  try {
    const h = await writeHeuristic(absRoot, {
      id,
      scope,
      title,
      pattern: patternText,
      antiPattern: "",
      confidence: "medium",
      evidence: [{ source: "validation", path: reportRel, date: today() }],
    });
    console.log(
      `Check 13: Success Heuristic Extracted — ${h.id} (scope: ${h.scope}, confidence: ${h.confidence})`,
    );
    process.exit(0);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.log(`Check 13: SKIP — ${msg}`);
    process.exit(0);
  }
}

export function help() {
  console.log("Usage: adev heuristics extract --spec <path> --report <path>");
  console.log("                              [--pattern <text>] [--check-first-run]");
  console.log("");
  console.log("Extract a success heuristic from a first-run PASS validation.");
  console.log("Performs /adev:validate Check 13. Observational — exit code is");
  console.log("0 on success AND on SKIP. Exit 1 only on argument errors.");
  console.log("");
  console.log("Flags:");
  console.log("  --spec <path>           Live Spec file (project-relative or absolute)");
  console.log("  --report <path>         Validation report path recorded in evidence[]");
  console.log("  --pattern <text>        Override the default success-factor pattern");
  console.log("  --check-first-run       SKIP if <spec-slug>.validate.md already exists");
  console.log("");
  console.log("Stdout (one line):");
  console.log("  Check 13: Success Heuristic Extracted — <id> (scope: <s>, confidence: <c>)");
  console.log("  Check 13: SKIP — <reason>");
  console.log("");
  console.log("SKIP reasons:");
  console.log("  invalid spec slug      Spec basename produces empty slug after normalisation");
  console.log("  not first-run PASS     <spec-slug>.validate.md already exists (with --check-first-run)");
  console.log("  no charter scope       Spec frontmatter has no `charter:` field");
  console.log("  <error message>        writeHeuristic threw (e.g., HEURISTICS_SCHEMA_ERROR)");
}
