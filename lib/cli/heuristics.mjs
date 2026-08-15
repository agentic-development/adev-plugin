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
//   signature — derive a failure `signature`, the cross-scope recurrence key.
//              Two modes: derived (origins recover|validate|implement, hashes
//              normalized failure text) and inherited (origin review-specs,
//              reuses a blocker_id's hash component and hashes nothing).
//              Source spec: .context-index/specs/features/heuristics/
//              failure-signature-key.spec.md
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
//   - Does NOT export LIFECYCLE_STEP — every subcommand is observational
//     (extract), pure (signature), or a read-only/write-side-effect helper
//     (retrieve/write) invoked from inside other lifecycle steps. The
//     cli-driver pattern test will NOT assert requireGate-first on this module.
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
//   signature — single line: "<origin>-<8hex>". Nothing on stdout on any
//              error; the typed code goes to stderr (INVALID_SIGNATURE_ORIGIN,
//              EMPTY_SIGNATURE_TEXT, CONFLICTING_SIGNATURE_INPUT,
//              INVALID_BLOCKER_ID) and the process exits 1.
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
//   adev heuristics signature --origin <recover|validate|implement> --text <t>
//   adev heuristics signature --origin review-specs --blocker-id <id>
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
  deriveSignature,
  normalizeFailureText,
  parseHeuristicsFile,
  serializeHeuristic,
  atomicWrite,
  deriveHeuristicId,
  canonicalSpecSlug,
  listScopeFiles,
  serializeEntries,
  mergeEvidence,
  CONFIDENCE_RANK,
  applyContradictionInvariant,
} from "../heuristics.mjs";
import { parseBlockerId } from "../blocker-id.mjs";

const USAGE =
  "usage: adev heuristics <extract|retrieve|signature|migrate-keys|write> [flags]";

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

  if (sub === "signature") {
    return runSignature({ argv: argv.slice(1) });
  }

  if (sub === "migrate-keys") {
    return runMigrateKeys({ projectRoot, argv: argv.slice(1) });
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

// ── signature subcommand ─────────────────────────────────────────────────
//
// Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
//
// The verb has two modes. Derived mode (origins recover | validate |
// implement) hashes normalized failure text. Inherited mode (origin
// review-specs) hashes NOTHING — it reuses the hash component of a supplied
// blocker_id so one reviewer finding resolves to one identity across the
// retry loop and the store.
//
// Derivation reads no clock, no path, and no env var, so this subcommand
// never touches projectRoot.

const SIGNATURE_USAGE =
  "usage: adev heuristics signature --origin <recover|validate|review-specs|implement> " +
  "(--text <text> | --blocker-id <id>)";

/** The closed origin set. `review-specs` is the inherited-mode origin. */
const SIGNATURE_ORIGINS = ["recover", "validate", "review-specs", "implement"];

/** Max characters of a rejected origin echoed back to the operator. */
const ORIGIN_ECHO_MAX = 40;

/** CSI-style ANSI escape sequences (colour, cursor moves, erase). */
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_SEQUENCE = /\u001b\[[0-9;?]*[\u0020-\u002f]*[\u0040-\u007e]/g;

/**
 * C0 and C1 control characters (including a bare ESC and DEL), plus the two
 * Unicode line separators — U+2028/U+2029 sit outside C1 but still break a
 * one-line diagnostic into two.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/**
 * Make an untrusted argument safe to echo into a diagnostic: drop ANSI
 * escape sequences and every C0/C1 control character (so a crafted value
 * cannot repaint or forge terminal output), then truncate.
 *
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeForEcho(value) {
  const raw = typeof value === "string" ? value : String(value ?? "");
  const withoutAnsi = raw.replace(ANSI_ESCAPE_SEQUENCE, "");
  const withoutControls = withoutAnsi.replace(CONTROL_CHARACTERS, "");
  if (withoutControls.length <= ORIGIN_ECHO_MAX) return withoutControls;
  return `${withoutControls.slice(0, ORIGIN_ECHO_MAX)}...`;
}

/**
 * Emit a typed signature error on stderr and exit 1, leaving stdout empty.
 * @param {string} code
 * @param {string} detail
 */
function signatureError(code, detail) {
  console.error(SIGNATURE_USAGE);
  console.error(`${code}: ${detail}`);
  process.exit(1);
}

function runSignature({ argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        origin: { type: "string" },
        text: { type: "string" },
        "blocker-id": { type: "string" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(SIGNATURE_USAGE);
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }

  const v = parsed.values;
  if (v.help) {
    help();
    process.exit(0);
  }

  // Origin is validated FIRST. An illegal origin is reported even when the
  // text is also invalid — the caller has to fix the origin either way, and
  // reporting the text error would imply the origin was accepted.
  const origin = v.origin;
  if (typeof origin !== "string" || !SIGNATURE_ORIGINS.includes(origin)) {
    signatureError(
      "INVALID_SIGNATURE_ORIGIN",
      `'${sanitizeForEcho(origin)}' is not a legal origin. Legal set: ${SIGNATURE_ORIGINS.join(", ")}`,
    );
  }

  // Mode selection happens before `--text` is read, because the inherited
  // path rejects `--text` outright rather than falling through to hashing.
  // Both flags are tested for *presence*, not for a non-empty value: Behavior
  // 3b keys on the flag being supplied at all, so `--blocker-id ""` is a
  // conflict rather than a silent fall-through to derived mode.
  const blockerId = v["blocker-id"];
  const hasBlockerId = blockerId !== undefined;
  const hasText = v.text !== undefined;

  if (origin === "review-specs") {
    if (hasText) {
      signatureError(
        "CONFLICTING_SIGNATURE_INPUT",
        "origin 'review-specs' inherits its digest from --blocker-id and rejects --text",
      );
    }
    if (!hasBlockerId) {
      signatureError(
        "CONFLICTING_SIGNATURE_INPUT",
        "origin 'review-specs' requires --blocker-id",
      );
    }
    // Inherited mode: hash NOTHING. `parseBlockerId` has already extracted a
    // stable location hash from the finding, and reusing it verbatim is what
    // makes one reviewer finding resolve to one identity across the retry loop
    // and the store. Re-hashing the finding text here would mint a second
    // identity for the same finding.
    let locationHash;
    try {
      ({ locationHash } = parseBlockerId(blockerId));
    } catch (err) {
      signatureError(
        "INVALID_BLOCKER_ID",
        `${sanitizeForEcho(blockerId)} — ${sanitizeForEcho(err && err.message)}`,
      );
    }

    console.log(`review-specs-${locationHash}`);
    process.exit(0);
  }

  if (hasBlockerId) {
    signatureError(
      "CONFLICTING_SIGNATURE_INPUT",
      `--blocker-id is only valid with --origin review-specs (got '${sanitizeForEcho(origin)}')`,
    );
  }

  // Derived mode. `--text` must survive normalization: "!!!" is a non-empty
  // argument that normalizes to the empty string and must be rejected.
  if (!hasText || normalizeFailureText(v.text).length === 0) {
    signatureError(
      "EMPTY_SIGNATURE_TEXT",
      "--text is required and must contain at least one letter, digit, hyphen or underscore after normalization",
    );
  }

  console.log(deriveSignature(origin, v.text));
  process.exit(0);
}

// ── migrate-keys subcommand ──────────────────────────────────────────────
//
// Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
// Behavior 8 (classification), Behaviors 9-10 (rekey, merge, idempotency).
//
// A one-time, idempotent rekey of the entries whose `id` was produced by the
// old path-dependent validate-side rule — and NO others.
//
// The discriminator keys on WHICH RULE COMPOSED THE ID, read off the id
// itself. Evidence provenance is explicitly the wrong property: `/adev:retro`
// consolidation can merge entries, so a single entry may carry both
// `validation` and `recovery` evidence, and a provenance test would rekey such
// an entry and destroy a recover-produced id — breaking the byte-identity that
// `failure-capture.spec.md` Behavior 6 depends on.
//
// Proof by recomputing the legacy id is NOT available and is NOT required.
// The old rule hashed the ABSOLUTE spec path, which is not recoverable from a
// stored entry. The prefix test alone is sufficient, because the prefix
// already records which rule composed the key at write time and is unaffected
// by evidence the entry accretes later.

/**
 * The closed six-value diagnosis-category set that `/adev:recover` composes
 * ids from. **Authoritative source: `skills/recover/SKILL.md`.**
 *
 * This set is load-bearing: it is the entire discriminator for the migration.
 * An id carrying one of these prefixes was composed by the recover rule and is
 * never rekeyed, whatever evidence the entry accumulated later.
 */
export const RECOVER_CATEGORY_SLUGS = Object.freeze([
  "missing-context",
  "ambiguous-spec",
  "constraint-conflict",
  "novel-problem",
  "tool-failure",
  "budget-exhaustion",
]);

/**
 * Canonical `evidence[].source` vocabulary, and the drifted spellings that
 * fold onto it.
 *
 * `EvidenceRef.source` is unenforced and the live store has drifted to four
 * spellings. Folding happens **at read time only** — a folded value is never
 * written back, because doing so would violate the "left untouched" guarantee
 * for skipped entries and make a byte-identical second run impossible.
 * Repairing the stored vocabulary is a separate concern from rekeying.
 */
const EVIDENCE_SOURCE_ALIASES = Object.freeze({
  validation: "validation",
  recovery: "recovery",
  manual: "manual",
  validate: "validation",
  recover: "recovery",
  learn: "manual",
});

/** Suffix an evidence path must carry for the sibling mapping to be defined. */
const VALIDATE_REPORT_SUFFIX = ".validate.md";
const SPEC_SUFFIX = ".spec.md";

/**
 * Fold a stored `evidence[].source` spelling onto the canonical vocabulary.
 *
 * @param {unknown} source - The value as stored, which may be absent.
 * @returns {{folded: string, recognized: boolean}} `folded` is the canonical
 *   spelling when recognized, or the input unchanged when not. An
 *   unrecognized spelling is REPORTED, never silently dropped.
 */
export function foldEvidenceSource(source) {
  if (typeof source !== "string" || source.length === 0) {
    return { folded: "", recognized: false };
  }
  const canonical = EVIDENCE_SOURCE_ALIASES[source];
  if (canonical === undefined) return { folded: source, recognized: false };
  return { folded: canonical, recognized: true };
}

/**
 * Split an id into its composing prefix and digest.
 *
 * Every id is `<prefix>-<8 lowercase hex>`, so the prefix is everything before
 * that trailing group. Matching the prefix EXACTLY (rather than by
 * `startsWith`) matters: a spec named `missing-contextual-loader` must not be
 * mistaken for the `missing-context` category and protected from rekeying.
 *
 * @param {unknown} id - The stored value, which may not be a string.
 * @returns {string} The prefix, or the whole id when it does not carry a
 *   trailing 8-hex digest. A non-string yields `""`, which matches no slug.
 */
function idPrefix(id) {
  const safe = typeof id === "string" ? id : "";
  const m = safe.match(/^(.*)-[0-9a-f]{8}$/);
  return m ? m[1] : safe;
}

/**
 * Classify one stored entry for the rekey. Pure — reads no filesystem, no
 * clock, and never mutates the entry it is handed.
 *
 * The four rules apply in order, and rule 2 is a refinement of rule 1's
 * REASON CODE rather than a later branch: both skip, and the guard only
 * changes what the summary reports. Rule 1 must not short-circuit rule 2,
 * because the two labels have to stay distinguishable.
 *
 * @param {object} entry - An entry as returned by `parseHeuristicsFile`.
 * @returns {{action: "rekey"|"skip", reason: string, specPath?: string, unrecognizedSources: string[]}}
 *   `reason` is one of `out-of-scope`, `ambiguous`, `skipped-unrecoverable`,
 *   or `in-scope` on a rekey.
 */
export function classifyForRekey(entry) {
  const evidence = Array.isArray(entry?.evidence) ? entry.evidence : [];

  // Rule 4, applied at read time: fold aliases and collect anything the
  // vocabulary does not recognize, so the summary can report it.
  const unrecognizedSources = [];
  let carriesValidationEvidence = false;
  for (const ref of evidence) {
    const { folded, recognized } = foldEvidenceSource(ref?.source);
    if (!recognized && typeof ref?.source === "string" && ref.source.length > 0) {
      if (!unrecognizedSources.includes(ref.source)) unrecognizedSources.push(ref.source);
    }
    if (recognized && folded === "validation") carriesValidationEvidence = true;
  }

  // Rule 1: the prefix test.
  const isCategoryPrefixed = RECOVER_CATEGORY_SLUGS.includes(idPrefix(entry?.id));

  if (isCategoryPrefixed) {
    // Rule 2: the ambiguity guard. A spec slug could in principle collide with
    // a category slug — a spec named `tool-failure.spec.md` would yield an id
    // indistinguishable from a recover key. When the entry ALSO carries
    // validation evidence the two rules are indistinguishable, so the skip is
    // reported as ambiguous rather than out-of-scope. Skipping a rekey is
    // recoverable; destroying a recover id is not.
    return {
      action: "skip",
      reason: carriesValidationEvidence ? "ambiguous" : "out-of-scope",
      unrecognizedSources,
    };
  }

  // Rule 3: evidence path → spec path. The id hash input needs the spec path;
  // the evidence element holds the validate REPORT path. They are siblings by
  // construction, so the mapping is a suffix swap on the same stem.
  const reportRef = evidence.find(
    (ref) => typeof ref?.path === "string" && ref.path.endsWith(VALIDATE_REPORT_SUFFIX),
  );
  if (!reportRef) {
    // The mapping is undefined for this entry. Leave it alone rather than
    // guessing — the migration never invents a key.
    return { action: "skip", reason: "skipped-unrecoverable", unrecognizedSources };
  }

  const specPath =
    reportRef.path.slice(0, -VALIDATE_REPORT_SUFFIX.length) + SPEC_SUFFIX;

  return { action: "rekey", reason: "in-scope", specPath, unrecognizedSources };
}

const MIGRATE_KEYS_USAGE = "usage: adev heuristics migrate-keys [--dry-run]";

/**
 * Walk the store, classify every entry, rekey the in-scope ones, and report.
 *
 * @param {{projectRoot: string, argv: string[]}} params
 */
async function runMigrateKeys({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(MIGRATE_KEYS_USAGE);
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }

  if (parsed.values.help) {
    help();
    process.exit(0);
  }
  const dryRun = !!parsed.values["dry-run"];

  const absRoot = resolve(projectRoot);

  const summary = {
    rekeyed: 0,
    skippedOutOfScope: 0,
    skippedUnrecoverable: 0,
    merged: 0,
    ambiguous: [],
    unrecognizedSources: [],
    archived: [],
  };

  // Three passes, each a function boundary rather than a convention: READ
  // everything, CLASSIFY everything, and only then APPLY. A read failure
  // anywhere must leave the whole store in its prior state, so no write may be
  // reachable from inside the read or classify loops.
  let plans;
  try {
    plans = await readAllScopeFiles(absRoot);
  } catch (err) {
    console.error(`MIGRATION_READ_FAILED: ${err.file ?? absRoot} — ${err.message}`);
    process.exit(1);
  }

  for (const plan of plans) {
    plan.classifications = classifyPlan(plan, summary);
    Object.assign(plan, planRekey(plan, summary));
  }

  if (!dryRun) {
    assertNoArchiveConflict(plans);
    await applyPlans(plans);
  }

  printMigrationSummary(summary, { dryRun });
  process.exit(0);
}

/**
 * Refuse to start writing when any archive target already exists on disk, or
 * when two archived entries in this run would land on the same path.
 *
 * `archiveHeuristic` fails fast on a pre-existing target
 * (HEURISTICS_ARCHIVE_CONFLICT), and the migration must not be laxer with the
 * operator's data than the helper it stands in for. Checked across ALL plans
 * before the first write, so a conflict anywhere leaves the whole store in its
 * prior state.
 *
 * @param {object[]} plans
 */
function assertNoArchiveConflict(plans) {
  const claimed = new Set();
  for (const plan of plans) {
    for (const archived of plan.archivedEntries) {
      const reason = existsSync(archived.path)
        ? "already exists"
        : claimed.has(archived.path)
          ? "is claimed twice in this run"
          : null;
      if (reason !== null) {
        // Same concept the library raises as HEURISTICS_ARCHIVE_CONFLICT;
        // named for the migration because this is the verb's stderr surface.
        console.error(
          `MIGRATION_ARCHIVE_CONFLICT (HEURISTICS_ARCHIVE_CONFLICT): ${archived.path} ${reason} — refusing to overwrite an archived entry`,
        );
        process.exit(1);
      }
      claimed.add(archived.path);
    }
  }
}

/**
 * APPLY pass. The only place in the migration that writes, and it is reached
 * only after every file has been read and classified — so a read failure
 * anywhere leaves the whole store in its prior state.
 *
 * Each scope file is rewritten atomically (temp-then-rename via
 * {@link atomicWrite}), and a file with nothing to change is not rewritten at
 * all, so a skipped entry stays byte-identical.
 *
 * @param {object[]} plans
 */
async function applyPlans(plans) {
  for (const plan of plans) {
    if (!plan.changed) continue;
    for (const archived of plan.archivedEntries) {
      await atomicWrite(archived.path, serializeEntries([archived.entry]));
    }
    await atomicWrite(plan.file, serializeEntries(plan.finalEntries));
  }
}

/**
 * READ pass. Parses every scope file up front so a failure anywhere aborts
 * before a single byte is written.
 *
 * @param {string} absRoot
 * @returns {Promise<{file: string, entries: object[]}[]>}
 * @throws {Error} carrying a `file` property naming the file that failed.
 */
async function readAllScopeFiles(absRoot) {
  const files = await listScopeFiles(absRoot);
  const plans = [];
  for (const file of files) {
    try {
      plans.push({ file, entries: await parseHeuristicsFile(file) });
    } catch (err) {
      err.file = file;
      throw err;
    }
  }
  return plans;
}

/**
 * CLASSIFY pass. Pure with respect to the filesystem — it only reads the
 * already-parsed entries and accumulates counts into `summary`.
 *
 * @param {{file: string, entries: object[]}} plan
 * @param {object} summary - Mutated in place with the running counts.
 * @returns {{entry: object, result: object}[]}
 */
function classifyPlan(plan, summary) {
  const classifications = plan.entries.map((entry) => ({
    entry,
    result: classifyForRekey(entry),
  }));

  for (const { entry, result } of classifications) {
    for (const source of result.unrecognizedSources) {
      if (!summary.unrecognizedSources.includes(source)) {
        summary.unrecognizedSources.push(source);
      }
    }
    if (result.action === "rekey") {
      // Counted in planRekey, and only when the id actually CHANGES. Behavior
      // 10 requires a second run to report zero rekeyed, and on that run every
      // entry is still classified in-scope — it just recomputes to the id it
      // already has.
      continue;
    } else if (result.reason === "ambiguous") {
      // Counted separately, not folded into skipped-out-of-scope: an
      // ambiguous entry is one the migration could not tell apart, and an
      // operator needs to see that number on its own.
      summary.ambiguous.push(entry.id);
    } else if (result.reason === "out-of-scope") {
      summary.skippedOutOfScope += 1;
    } else {
      summary.skippedUnrecoverable += 1;
    }
  }

  return classifications;
}

/**
 * Merge a colliding pair per Behavior 9, then **re-apply the charter's
 * contradiction invariant to the merged result**.
 *
 * Unioning two `contradicted-by` arrays can push the merged entry to two or
 * more contradictions, and the charter states such an entry cannot remain at
 * `high`. Taking the higher confidence without re-checking would mint an entry
 * the invariant forbids. At two contradictions the entry is archived outright,
 * regardless of prior confidence.
 *
 * @param {object} existing
 * @param {object} incoming
 * @returns {{entry: object, archive: boolean}}
 */
function mergeColliding(existing, incoming) {
  const evidence = mergeEvidence(existing.evidence, incoming.evidence);
  const contradictedBy = mergeEvidence(existing.contradictedBy, incoming.contradictedBy);

  const rankA = CONFIDENCE_RANK[existing.confidence] ?? 0;
  const rankB = CONFIDENCE_RANK[incoming.confidence] ?? 0;
  const higher = rankB > rankA ? incoming.confidence : existing.confidence;

  // `created` is the birth date of the knowledge, so the merged entry keeps
  // the EARLIER of the two rather than whichever happened to be read first.
  const created =
    incoming.created && (!existing.created || incoming.created < existing.created)
      ? incoming.created
      : existing.created;

  // Fields the absorbed entry may carry and the surviving one may not. Only
  // the key was ever supposed to change, so dropping the incoming entry's
  // identity or classification would be a silent loss. `pattern` necessarily
  // matches — it is a hash input — so it needs no reconciliation.
  const signature = existing.signature ?? incoming.signature;
  const tags =
    Array.isArray(existing.tags) && existing.tags.length > 0 ? existing.tags : incoming.tags;
  const antiPattern = existing.antiPattern || incoming.antiPattern;

  // Re-apply the invariant to the MERGED result, not to either input. The rule
  // itself lives in lib/heuristics.mjs and is shared with `addContradiction`,
  // so the migration cannot drift from the incremental path.
  const { confidence, archive } = applyContradictionInvariant(higher, contradictedBy);

  const merged = { ...existing, evidence, contradictedBy, created, confidence };
  if (signature !== undefined) merged.signature = signature;
  if (Array.isArray(tags) && tags.length > 0) merged.tags = tags;
  if (antiPattern) merged.antiPattern = antiPattern;

  return { entry: merged, archive };
}

/**
 * Plan the rekey for one scope file: recompute ids for the `rekey`-classified
 * entries, merge same-scope collisions, and split out anything the merge
 * archived. Pure — it computes what to write without writing anything.
 *
 * @param {{file: string, classifications: {entry: object, result: object}[]}} plan
 * @param {object} summary - Mutated in place with `merged` / `archived`.
 * @returns {{finalEntries: object[], archivedEntries: {path: string, entry: object}[], changed: boolean}}
 */
function planRekey(plan, summary) {
  const scope = basename(plan.file, ".md");
  const archiveDir = join(dirname(plan.file), "archive");

  /** @type {object[]} */
  const finalEntries = [];
  /** Index of the FIRST occurrence of each id, and whether it was rekeyed. */
  const slotById = new Map();
  /**
   * Archival is tracked by SLOT INDEX, not by id. `finalEntries` can hold two
   * entries sharing one id — a pre-existing duplicate that was deliberately
   * not merged, plus a merged entry that landed on the same id — and an
   * id-keyed set would pull both out of the scope file and write both to the
   * same archive path, destroying one of them outright.
   */
  const archivedSlots = new Set();
  let changed = false;

  for (const { entry, result } of plan.classifications) {
    let next = entry;
    let rekeyed = false;
    if (result.action === "rekey") {
      const newId = deriveHeuristicId(
        canonicalSpecSlug(result.specPath),
        result.specPath,
        entry.pattern,
      );
      if (newId !== entry.id) {
        changed = true;
        rekeyed = true;
        summary.rekeyed += 1;
      }
      // Only the key changes. Every other field rides along untouched, and
      // evidence[].source keeps its stored spelling.
      next = { ...entry, id: newId };
    }

    const slot = slotById.get(next.id);
    if (slot === undefined) {
      slotById.set(next.id, { index: finalEntries.length, rekeyed });
      finalEntries.push(next);
      continue;
    }

    // Merge only a collision the migration CREATED. A pair that already shared
    // an id before the run is a pre-existing duplicate this spec did not
    // introduce, and merging it would rewrite entries the migration was told
    // to leave byte-identical.
    if (!rekeyed && !slot.rekeyed) {
      finalEntries.push(next);
      continue;
    }

    // A collision the migration created IS the duplicate-entry bug this spec
    // exists to fix.
    changed = true;
    summary.merged += 1;
    const { entry: merged, archive } = mergeColliding(finalEntries[slot.index], next);
    finalEntries[slot.index] = merged;
    slot.rekeyed = true;
    if (archive) archivedSlots.add(slot.index);
  }

  const archivedEntries = [];
  const remaining = [];
  for (const [index, entry] of finalEntries.entries()) {
    if (!archivedSlots.has(index)) {
      remaining.push(entry);
      continue;
    }
    summary.archived.push(entry.id);
    archivedEntries.push({
      path: join(archiveDir, `${scope}-${entry.id}.md`),
      entry: { ...entry, archived: today(), archivedReason: "contradicted" },
    });
  }

  return { finalEntries: remaining, archivedEntries, changed };
}

/**
 * Print the migration summary. Counts first, then the two operator-facing
 * lists — a collision merge is the duplicate-entry bug this spec exists to
 * fix, and an unrecognized `source` spelling is reported rather than silently
 * skipped.
 *
 * @param {{rekeyed: number, skippedOutOfScope: number, skippedUnrecoverable: number, merged: number, ambiguous: string[], unrecognizedSources: string[], archived: string[]}} summary
 */
function printMigrationSummary(summary, { dryRun = false } = {}) {
  console.log(dryRun ? "migrate-keys (dry run — nothing written):" : "migrate-keys:");
  // One uniform `key=value` line per count, so every key is greppable the
  // same way, and a distinct `detail:` prefix on the list rows so a grep for
  // a count never also matches a detail line.
  console.log(`rekeyed=${summary.rekeyed}`);
  console.log(`skipped-out-of-scope=${summary.skippedOutOfScope}`);
  console.log(`skipped-unrecoverable=${summary.skippedUnrecoverable}`);
  console.log(`merged=${summary.merged}`);
  console.log(`ambiguous=${summary.ambiguous.length}`);
  console.log(`unrecognized-sources=${summary.unrecognizedSources.length}`);
  console.log(`archived=${summary.archived.length}`);
  for (const id of summary.ambiguous) {
    console.log(`detail: ambiguous ${id} — prefix matches a diagnosis category and carries validation evidence`);
  }
  for (const source of summary.unrecognizedSources) {
    console.log(`detail: unrecognized evidence source '${source}'`);
  }
  for (const id of summary.archived) {
    console.log(`detail: archived after merge ${id} — two or more contradictions`);
  }
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
  console.log("  signature Derive a failure signature — the cross-scope recurrence key.");
  console.log("           adev heuristics signature --origin <o> --text <t>");
  console.log("           adev heuristics signature --origin review-specs --blocker-id <id>");
  console.log("");
  console.log("    --origin <o>            One of: recover, validate, review-specs, implement");
  console.log("    --text <t>              Failure text (derived mode: recover|validate|implement)");
  console.log("    --blocker-id <id>       Reviewer finding id (inherited mode: review-specs only)");
  console.log("");
  console.log("    Derived mode hashes the normalized failure text. Inherited mode hashes");
  console.log("    nothing — it reuses the blocker_id's own hash component.");
  console.log("");
  console.log("    Stdout: '<origin>-<8hex>' on success (nothing on any error)");
  console.log("    Stderr: INVALID_SIGNATURE_ORIGIN | EMPTY_SIGNATURE_TEXT |");
  console.log("            CONFLICTING_SIGNATURE_INPUT | INVALID_BLOCKER_ID");
  console.log("    Exit:   0 on success, 1 on any of the above");
  console.log("");
  console.log("  migrate-keys One-time, idempotent rekey of the heuristic store.");
  console.log("           adev heuristics migrate-keys [--dry-run]");
  console.log("");
  console.log("    --dry-run               Classify and report; write nothing");
  console.log("");
  console.log("    Rekeys exactly the entries whose id was produced by the old");
  console.log("    path-dependent validate-side rule, and no others. An id whose prefix");
  console.log("    is one of the six /adev:recover diagnosis categories was composed by");
  console.log("    the recover rule and is NEVER rekeyed.");
  console.log("");
  console.log("    Stdout: rekeyed / skipped-out-of-scope / skipped-unrecoverable /");
  console.log("            merged counts, plus ambiguous entries and unrecognized");
  console.log("            evidence-source spellings");
  console.log("    Stderr: 'MIGRATION_READ_FAILED: <file> — <error>'");
  console.log("    Exit:   0 on success, 1 when a store file cannot be read");
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
