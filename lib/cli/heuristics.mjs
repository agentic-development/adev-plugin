// lib/cli/heuristics.mjs
//
// `adev heuristics <subcommand>` — CLI surface for heuristic lifecycle
// operations called from skill prose. Multi-mode helper (spec Behavior 9 —
// CLI-verb naming is canonical and shared across PRs).
//
// Subcommands:
//   extract  — /adev:validate Check 13 (Success Heuristic Extraction).
//              Wraps `writeHeuristic` with charter-scope inference + ID
//              derivation + first-run gating.
//   retrieve — heuristic retrieval for context-packet injection. Wraps
//              `retrieveHeuristics` + `renderHeuristic`. Used by
//              skills/{implement,plan,prototype,brainstorm,debug,
//              review-specs,specify,validate}/SKILL.md.
//   write    — direct `writeHeuristic` invocation for skills that supply
//              their own id/scope/title/pattern (e.g., skills/recover
//              Step 7 lesson-capture).
//
// Source spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// PR 1 introduced `extract`; PR 8-9 (this sweep-finish) adds `retrieve`
// and `write` to lift inline-Node retrieval / write blocks from the
// remaining 10 lifecycle/non-lifecycle skills.
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — all three subcommands are
//     observational (extract) or read-only/write-side-effect (retrieve/write)
//     helpers invoked from inside other lifecycle steps. The cli-driver
//     pattern test will NOT assert requireGate-first on this module.
//
// Exit codes:
//   0  success OR SKIP (extract is observational; retrieve/write succeed
//      on empty result / non-fatal error degradation)
//   1  argument error or spec containment failure
//
// Stdout per subcommand:
//   extract  — single line: "Check 13: Success Heuristic Extracted — <id>
//              (scope: <scope>, confidence: <confidence>)" or
//              "Check 13: SKIP — <reason>"
//   retrieve — JSON object {count, rendered} when --format=json (default),
//              rendered markdown blocks separated by \n\n when --format=text.
//              Empty result emits {count:0, rendered:""} or "__NONE__"
//              respectively.
//   write    — single line: "Heuristic written: <id> (scope: <scope>,
//              confidence: <confidence>)" on success;
//              "heuristics: extraction skipped — <error>" on failure
//              (exit still 0 — best-effort lesson capture, matches
//              skills/recover/SKILL.md Step 7 prose).
//
// Usage:
//   adev heuristics extract  --spec <p> --report <p> [--pattern <t>] [--check-first-run]
//   adev heuristics retrieve --module <slug> [--injection-limit N] [--keyword K]...
//                            [--tier index|summary|full] [--format json|text]
//   adev heuristics write    --id <id> --scope <scope> --title <t> --pattern <p>
//                            [--anti-pattern <t>] [--confidence low|medium|high]
//                            [--evidence-source <s>] [--evidence-path <p>]
//                            [--evidence-date <YYYY-MM-DD>]

import { parseArgs } from "node:util";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

import {
  writeHeuristic,
  retrieveHeuristics,
  renderHeuristic,
} from "../heuristics.mjs";

const USAGE =
  "usage: adev heuristics <extract|retrieve|write> [flags]";

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

  if (sub === "retrieve") {
    return runRetrieve({ projectRoot, argv: argv.slice(1) });
  }

  if (sub === "write") {
    return runWrite({ projectRoot, argv: argv.slice(1) });
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

// ── retrieve subcommand ──────────────────────────────────────────────────

async function runRetrieve({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        module: { type: "string" },
        "injection-limit": { type: "string" },
        keyword: { type: "string", multiple: true },
        tier: { type: "string" },
        format: { type: "string", default: "json" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error("usage: adev heuristics retrieve --module <slug> [--injection-limit N]");
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }

  const v = parsed.values;
  if (v.help) {
    help();
    process.exit(0);
  }

  if (!v.module) {
    console.error("usage: adev heuristics retrieve --module <slug> [--injection-limit N]");
    console.error("  missing --module");
    process.exit(1);
  }

  if (v.format !== "json" && v.format !== "text") {
    console.error(`--format must be one of: json, text (got ${JSON.stringify(v.format)})`);
    process.exit(1);
  }

  let injectionLimit;
  if (v["injection-limit"] !== undefined) {
    const n = Number(v["injection-limit"]);
    if (!Number.isInteger(n) || n < 0) {
      console.error(`--injection-limit must be a non-negative integer (got ${JSON.stringify(v["injection-limit"])})`);
      process.exit(1);
    }
    injectionLimit = n;
  }

  if (v.tier !== undefined && !["index", "summary", "full"].includes(v.tier)) {
    console.error(`--tier must be one of: index, summary, full (got ${JSON.stringify(v.tier)})`);
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);
  const opts = {};
  if (injectionLimit !== undefined) opts.injectionLimit = injectionLimit;
  if (Array.isArray(v.keyword) && v.keyword.length > 0) opts.keywords = v.keyword;
  if (v.tier !== undefined) opts.tier = v.tier;

  let entries;
  try {
    entries = await retrieveHeuristics(absRoot, v.module, opts);
  } catch (err) {
    // Per skill prose: retrieve failures are non-blocking. Emit empty result.
    if (v.format === "text") {
      console.log("__NONE__");
    } else {
      console.log(JSON.stringify({ count: 0, rendered: "", error: err && err.message ? err.message : String(err) }));
    }
    process.exit(0);
  }

  const tier = v.tier ?? "summary";
  const rendered = entries.map((e) => renderHeuristic(e, tier)).join("\n\n");

  if (v.format === "text") {
    console.log(entries.length > 0 ? rendered : "__NONE__");
  } else {
    console.log(JSON.stringify({ count: entries.length, rendered }));
  }
  process.exit(0);
}

// ── write subcommand ─────────────────────────────────────────────────────

async function runWrite({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        id: { type: "string" },
        scope: { type: "string" },
        title: { type: "string" },
        pattern: { type: "string" },
        "anti-pattern": { type: "string" },
        confidence: { type: "string", default: "low" },
        "evidence-source": { type: "string" },
        "evidence-path": { type: "string" },
        "evidence-date": { type: "string" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(
      "usage: adev heuristics write --id <id> --scope <s> --title <t> --pattern <p> [...]",
    );
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }

  const v = parsed.values;
  if (v.help) {
    help();
    process.exit(0);
  }

  const missing = [];
  for (const flag of ["id", "scope", "title", "pattern"]) {
    if (!v[flag]) missing.push(`--${flag}`);
  }
  if (missing.length > 0) {
    console.error(
      "usage: adev heuristics write --id <id> --scope <s> --title <t> --pattern <p> [...]",
    );
    console.error(`  missing: ${missing.join(", ")}`);
    process.exit(1);
  }

  if (!["low", "medium", "high"].includes(v.confidence)) {
    console.error(
      `--confidence must be one of: low, medium, high (got ${JSON.stringify(v.confidence)})`,
    );
    process.exit(1);
  }

  // Evidence flags travel together: if any one is set, all three must be set.
  const evFlags = ["evidence-source", "evidence-path", "evidence-date"];
  const evPresent = evFlags.filter((f) => v[f] !== undefined && v[f] !== "");
  if (evPresent.length > 0 && evPresent.length < 3) {
    console.error(
      "--evidence-source, --evidence-path, --evidence-date must be supplied together",
    );
    process.exit(1);
  }

  const evidence = [];
  if (evPresent.length === 3) {
    evidence.push({
      source: v["evidence-source"],
      path: v["evidence-path"],
      date: v["evidence-date"],
    });
  }

  const entry = {
    id: v.id,
    scope: v.scope,
    title: v.title,
    pattern: v.pattern,
    antiPattern: v["anti-pattern"] ?? "",
    confidence: v.confidence,
    evidence,
  };

  const absRoot = resolve(projectRoot);
  try {
    const h = await writeHeuristic(absRoot, entry);
    console.log(
      `Heuristic written: ${h.id} (scope: ${h.scope}, confidence: ${h.confidence})`,
    );
    process.exit(0);
  } catch (err) {
    // Per skills/recover/SKILL.md Step 7 prose: failures degrade to a stderr
    // note and exit 0. Lesson capture is best-effort.
    const msg = err && err.message ? err.message : String(err);
    process.stderr.write(`heuristics: extraction skipped — ${msg}\n`);
    process.exit(0);
  }
}

export function help() {
  console.log("Usage: adev heuristics <subcommand> [flags]");
  console.log("");
  console.log("Subcommands:");
  console.log("");
  console.log("  extract  /adev:validate Check 13 — first-run PASS heuristic capture.");
  console.log("           adev heuristics extract --spec <p> --report <p>");
  console.log("                                   [--pattern <t>] [--check-first-run]");
  console.log("");
  console.log("    --spec <path>           Live Spec file (project-relative or absolute)");
  console.log("    --report <path>         Validation report path recorded in evidence[]");
  console.log("    --pattern <text>        Override the default success-factor pattern");
  console.log("    --check-first-run       SKIP if <spec-slug>.validate.md already exists");
  console.log("");
  console.log("    Stdout: 'Check 13: Success Heuristic Extracted — <id> (scope: <s>, confidence: <c>)'");
  console.log("            'Check 13: SKIP — <reason>'");
  console.log("    Exit:   0 on success AND on SKIP. 1 only on argument errors.");
  console.log("");
  console.log("  retrieve Pull module-scoped heuristics for context-packet injection.");
  console.log("           adev heuristics retrieve --module <slug>");
  console.log("                                    [--injection-limit N] [--keyword K]...");
  console.log("                                    [--tier index|summary|full]");
  console.log("                                    [--format json|text]");
  console.log("");
  console.log("    --module <slug>         Module scope (use '_global' for global-only)");
  console.log("    --injection-limit N     Cap on number of heuristics returned");
  console.log("    --keyword K             Boost match (repeatable, up to 10 total)");
  console.log("    --tier <t>              Rendering tier (default: summary)");
  console.log("    --format <fmt>          Output format: json (default) | text");
  console.log("");
  console.log("    Stdout: --format json → {count, rendered} JSON object");
  console.log("            --format text → rendered markdown blocks (or '__NONE__' when empty)");
  console.log("    Exit:   0 always (errors degrade to empty result per skill prose)");
  console.log("");
  console.log("  write    Direct heuristic write. Caller supplies id/scope/title/pattern.");
  console.log("           adev heuristics write --id <id> --scope <s> --title <t> --pattern <p>");
  console.log("                                 [--anti-pattern <t>]");
  console.log("                                 [--confidence low|medium|high]");
  console.log("                                 [--evidence-source <s> --evidence-path <p>");
  console.log("                                  --evidence-date <YYYY-MM-DD>]");
  console.log("");
  console.log("    Stdout: 'Heuristic written: <id> (scope: <s>, confidence: <c>)'");
  console.log("    Stderr: 'heuristics: extraction skipped — <error>' on failure");
  console.log("    Exit:   0 always (lesson capture is best-effort per skills/recover prose)");
}
