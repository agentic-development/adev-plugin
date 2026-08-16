// lib/cli/heuristics.mjs
//
// `adev heuristics <subcommand>` — CLI surface for heuristic lifecycle
// operations called from skill prose. Multi-mode helper (spec Behavior 9 —
// CLI-verb naming is canonical and shared across PRs).
//
// Subcommands:
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
// PR 8-9 (the sweep-finish) added `retrieve` and `write` to lift inline-Node
// retrieval / write blocks from the remaining 10 lifecycle/non-lifecycle
// skills. The validate-side capture verb this module opened with was retired
// once the PostToolUse hook (hooks/post-validate-extract-heuristics.mjs) took
// over capture — see
// .context-index/specs/features/heuristics/failure-capture.spec.md.
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`. The
//     dispatcher still supplies `manifest`; no surviving subcommand reads it
//     (charter-scope lookup belonged to the retired capture verb), so `run`
//     destructures only what it uses.
//   - Does NOT export LIFECYCLE_STEP — every subcommand is pure (signature)
//     or a read-only/write-side-effect helper (retrieve/write/migrate-keys)
//     invoked from inside other lifecycle steps. The cli-driver pattern test
//     will NOT assert requireGate-first on this module.
//
// Exit codes:
//   0  success (retrieve/write succeed on empty result / non-fatal error
//      degradation)
//   1  argument error
//
// Stdout per subcommand:
//   retrieve — JSON object {count, rendered} when --format=json (default),
//              rendered markdown blocks separated by \n\n when --format=text.
//              Empty result emits {count:0, rendered:""} or "__NONE__"
//              respectively. A retrieval that THREW emits a THIRD key —
//              {count:0, rendered:"", error:"<message>"}. Exit is 0 either way
//              (retrieval is non-blocking per skill prose).
//
//              A broken store does NOT reach that third shape. retrieveHeuristics
//              swallows both readHeuristics failures in bare `catch {}`, so a
//              missing, unreadable, or malformed store observably yields the
//              ordinary two-key empty result — which is exactly what the spec's
//              Error Cases row describes. The `error` key is defensive coverage
//              for an unexpected throw, not the store-failure contract. The two
//              shapes are still distinct and must not be collapsed into one.
//   signature — single line: "<origin>-<8hex>", or the bare "<8hex>" under
//              --digest-only. Nothing on stdout on any
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
//   adev heuristics retrieve --module <slug> [--injection-limit N] [--keyword K]...
//                            [--signature <sig>]
//                            [--tier index|summary|full] [--format json|text]
//   adev heuristics signature --origin <recover|validate|implement> --text <t>
//   adev heuristics signature --origin review-specs --blocker-id <id>
//   adev heuristics signature --origin validate --check-id <id> [--check-id <id>]...
//   adev heuristics write    --id <id> --scope <scope> --title <t> --pattern <p>
//                            [--anti-pattern <t>] [--signature <sig>]
//                            [--confidence low|medium|high]
//                            [--evidence-source <s>] [--evidence-path <p>]
//                            [--evidence-date <YYYY-MM-DD>]

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import {
  writeHeuristic,
  retrieveHeuristics,
  renderHeuristic,
  deriveSignature,
  deriveValidateFailureSignature,
  deriveDigest,
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
  resolveErrorInjectionLimit,
  DEFAULT_ERROR_INJECTION_LIMIT,
} from "../heuristics.mjs";
import { loadManifest } from "../manifest.mjs";
import { parseBlockerId } from "../blocker-id.mjs";

const USAGE =
  "usage: adev heuristics <retrieve|signature|migrate-keys|write> [flags]";

/**
 * Compute today's date as YYYY-MM-DD. Matches lib/heuristics.mjs::today().
 */
function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function run({ projectRoot, argv }) {
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

  console.error(USAGE);
  process.exit(1);
}

// ── retrieve subcommand ──────────────────────────────────────────────────

// One constant rather than two copies: the parse-error and the missing-flag
// branches previously printed the same literal, and a flag added to one but
// not the other is invisible until an operator hits the other branch.
const RETRIEVE_USAGE =
  "usage: adev heuristics retrieve --module <slug> [--injection-limit N] " +
  "[--keyword K]... [--signature <sig>] [--tier index|summary|full] [--format json|text]";

async function runRetrieve({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        module: { type: "string" },
        "injection-limit": { type: "string" },
        keyword: { type: "string", multiple: true },
        signature: { type: "string" },
        tier: { type: "string" },
        format: { type: "string", default: "json" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(RETRIEVE_USAGE);
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }

  const v = parsed.values;
  if (v.help) {
    help();
    process.exit(0);
  }

  if (!v.module) {
    console.error(RETRIEVE_USAGE);
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

  // A --signature retrieval is by definition error-time, so it takes the tighter
  // default. The guard below is textually identical to the forwarding condition
  // further down: a whitespace-only --signature is not forwarded to the library,
  // so it is not an error-time retrieval at all and correctly keeps the
  // entry-time default of 8. An explicit --injection-limit always wins.
  if (injectionLimit === undefined && typeof v.signature === "string" && v.signature.trim()) {
    try {
      injectionLimit = resolveErrorInjectionLimit(loadManifest(absRoot));
    } catch {
      injectionLimit = DEFAULT_ERROR_INJECTION_LIMIT;
    }
  }

  const opts = {};
  if (injectionLimit !== undefined) opts.injectionLimit = injectionLimit;
  if (Array.isArray(v.keyword) && v.keyword.length > 0) opts.keywords = v.keyword;
  if (v.tier !== undefined) opts.tier = v.tier;
  // `--signature` is FORWARDED, never VALIDATED. It is deliberately the only
  // retrieve flag with no argument-error branch: a signature is machine-composed
  // from partial failure data, and an empty or whitespace-only value means "the
  // caller could not derive one", not "the caller made a mistake". Not
  // forwarding it degrades the run to a plain module retrieval at exit 0.
  // Exiting 1 here would turn an unfindable heuristic into an operator error
  // and break the non-blocking contract every calling skill relies on.
  // Match semantics (exact equality, low-floor exemption, budget allocation)
  // stay in lib/heuristics.mjs::retrieveHeuristics — the CLI adds no policy.
  if (typeof v.signature === "string" && v.signature.trim()) opts.signature = v.signature;

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
  "(--text <text> | --blocker-id <id> | --check-id <id>...) [--digest-only]";

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
        "check-id": { type: "string", multiple: true },
        "digest-only": { type: "boolean", default: false },
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
  const hasCheckId = Array.isArray(v["check-id"]) && v["check-id"].length > 0;

  // `--digest-only` (Behavior 5a) emits the bare digest so a caller can compose
  // its own prefix — /adev:recover builds `<category-slug>-<digest>`. It is a
  // derived-mode-only flag: inherited mode has no digest of its own to hand
  // back, it reuses the blocker_id's hash component. Both conflicts share one
  // code with their own detail, and both are checked before `--text` so
  // `--digest-only --blocker-id x` reports the conflict, not a missing --text.
  const digestOnly = v["digest-only"] === true;
  if (digestOnly) {
    if (hasBlockerId) {
      signatureError(
        "CONFLICTING_SIGNATURE_INPUT",
        "--digest-only derives its digest from --text and cannot be used with --blocker-id",
      );
    }
    if (origin === "review-specs") {
      signatureError(
        "CONFLICTING_SIGNATURE_INPUT",
        "origin 'review-specs' inherits its digest from --blocker-id and cannot be used with --digest-only",
      );
    }
    // `--check-id` composes its input through deriveValidateFailureSignature,
    // which returns the prefixed signature and never exposes a bare digest.
    // Rejecting the pair keeps the wrong answer from being emitted silently:
    // without this branch the flag is ignored and the caller receives a full
    // `validate-<digest>` where it asked for `<digest>`.
    if (hasCheckId) {
      signatureError(
        "CONFLICTING_SIGNATURE_INPUT",
        "--digest-only derives its digest from --text and cannot be used with --check-id",
      );
    }
  }

  // `--check-id` is the validate FAIL path's input form: the caller hands over
  // the live verdict's failing check ids and `deriveValidateFailureSignature`
  // does the whole composition. It is therefore derived-mode-only and mutually
  // exclusive with both other input forms — accepting it alongside `--text` or
  // `--blocker-id` would silently pick one input and discard the other.
  if (hasCheckId) {
    if (origin === "review-specs") {
      signatureError(
        "CONFLICTING_SIGNATURE_INPUT",
        "origin 'review-specs' inherits its digest from --blocker-id and rejects --check-id",
      );
    }
    if (hasText) {
      signatureError(
        "CONFLICTING_SIGNATURE_INPUT",
        "--check-id derives the signature from the failing check ids and cannot be used with --text",
      );
    }
    if (hasBlockerId) {
      signatureError(
        "CONFLICTING_SIGNATURE_INPUT",
        "--check-id derives the signature from the failing check ids and cannot be used with --blocker-id",
      );
    }
  }

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

  // Derived mode via `--check-id`. The raw ids go straight to the ONE shared
  // composition — the dedupe, sort, join, sanitization and hash all stay in
  // `deriveValidateFailureSignature`, so the read side here and the capture
  // side in `hooks/post-validate-extract-heuristics.mjs` cannot drift. Every
  // id is marked FAIL because a caller only passes ids it already selected as
  // non-PASS; the helper's own outcome filter then keeps them all.
  if (hasCheckId) {
    const sig = deriveValidateFailureSignature(
      v["check-id"].map((id) => ({ id, outcome: "FAIL" })),
    );
    if (sig === null) {
      signatureError(
        "EMPTY_SIGNATURE_TEXT",
        "--check-id values must contain at least one character in [A-Za-z0-9._-] after sanitization",
      );
    }
    console.log(sig);
    process.exit(0);
  }

  // Derived mode. `--text` must survive normalization: "!!!" is a non-empty
  // argument that normalizes to the empty string and must be rejected.
  if (!hasText || normalizeFailureText(v.text).length === 0) {
    signatureError(
      "EMPTY_SIGNATURE_TEXT",
      "--text is required and must contain at least one letter, digit, hyphen or underscore after normalization",
    );
  }

  // The digest itself does not depend on the origin — only the composed form
  // carries the prefix.
  console.log(
    digestOnly
      ? deriveDigest(v.text, normalizeFailureText)
      : deriveSignature(origin, v.text),
  );
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

/**
 * Suffixes an evidence path may carry for the sibling mapping to be defined.
 *
 * There are two, not one. `.validate.md` is the current convention; older
 * reports were written as `<stem>-validation.md` and three such entries are
 * live in this repository's store (`workspace-aware-vision-validation.md`,
 * `adev-build-skill-validation.md`, `unified-gate-system-validation.md`).
 * Recognizing only the current suffix strands those entries as
 * `skipped-unrecoverable` forever — the silent-skip failure this migration
 * exists to eliminate. Ordered longest-first so `-validation.md` is tested
 * before any shorter suffix that could prefix-match it.
 */
const VALIDATE_REPORT_SUFFIXES = Object.freeze(["-validation.md", ".validate.md"]);
const SPEC_SUFFIX = ".spec.md";

/**
 * Map a validate-report evidence path to its sibling spec path.
 *
 * @param {string} reportPath - The stored evidence path.
 * @returns {string|null} The spec path, or `null` when no known report suffix
 *   matches — in which case the caller skips rather than guessing.
 */
function specPathFromReport(reportPath) {
  for (const suffix of VALIDATE_REPORT_SUFFIXES) {
    if (reportPath.endsWith(suffix)) {
      return reportPath.slice(0, -suffix.length) + SPEC_SUFFIX;
    }
  }
  return null;
}

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
  // construction, so the mapping is a suffix swap on the same stem — across
  // every report-suffix convention the store actually contains, not just the
  // current one.
  let specPath = null;
  for (const ref of evidence) {
    if (typeof ref?.path !== "string") continue;
    const mapped = specPathFromReport(ref.path);
    if (mapped) {
      specPath = mapped;
      break;
    }
  }
  if (specPath === null) {
    // The mapping is undefined for this entry. Leave it alone rather than
    // guessing — the migration never invents a key.
    return { action: "skip", reason: "skipped-unrecoverable", unrecognizedSources };
  }

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
        signature: { type: "string" },
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

  // `signature` is set only when a non-empty value was supplied. Unlike
  // `antiPattern` (above), the key must stay ABSENT otherwise: validateEntry
  // rejects a `signature` that is present but fails SIGNATURE_PATTERN, and ""
  // fails it. Validation of a supplied value stays in validateEntry — the
  // catch below degrades a malformed signature to stderr + exit 0.
  if (v.signature !== undefined && v.signature !== "") {
    entry.signature = v.signature;
  }

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
  console.log("  retrieve Pull module-scoped heuristics for context-packet injection.");
  console.log("           adev heuristics retrieve --module <slug>");
  console.log("                                    [--injection-limit N] [--keyword K]...");
  console.log("                                    [--signature <sig>]");
  console.log("                                    [--tier index|summary|full]");
  console.log("                                    [--format json|text]");
  console.log("");
  console.log("    --module <slug>         Module scope (use '_global' for global-only)");
  console.log("    --injection-limit N     Cap on number of heuristics returned");
  console.log("    --keyword K             Boost match (repeatable, up to 10 total)");
  console.log("    --signature <sig>       Exact-match recurrence key, e.g. the output of");
  console.log("                            'adev heuristics signature'. Matches rank above");
  console.log("                            confidence, are exempt from the low-confidence");
  console.log("                            floor, and are allocated off the top of the");
  console.log("                            injection limit. Never an argument error: an");
  console.log("                            empty or unmatched value simply returns no");
  console.log("                            signature hits.");
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
  console.log("           adev heuristics signature --origin validate --check-id <id> [--check-id <id>]...");
  console.log("           adev heuristics signature --origin <o> --text <t> --digest-only");
  console.log("");
  console.log("    --origin <o>            One of: recover, validate, review-specs, implement");
  console.log("    --text <t>              Failure text (derived mode: recover|validate|implement)");
  console.log("    --blocker-id <id>       Reviewer finding id (inherited mode: review-specs only)");
  console.log("    --check-id <id>         Failing check id from a live validate verdict");
  console.log("                            (repeatable). The ids are deduped, sanitized,");
  console.log("                            sorted and hashed by the one shared composition,");
  console.log("                            so order and duplicates do not matter. Derived");
  console.log("                            mode only — conflicts with --text, --blocker-id");
  console.log("                            and review-specs.");
  console.log("    --digest-only           Print the bare 8-hex digest with no origin prefix,");
  console.log("                            for callers that compose their own key. Derived mode");
  console.log("                            only — conflicts with --blocker-id and review-specs.");
  console.log("");
  console.log("    Derived mode hashes the normalized failure text. Inherited mode hashes");
  console.log("    nothing — it reuses the blocker_id's own hash component.");
  console.log("");
  console.log("    Stdout: '<origin>-<8hex>' on success (nothing on any error)");
  console.log("            '<8hex>' with --digest-only");
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
  console.log("                                 [--anti-pattern <t>] [--signature <sig>]");
  console.log("                                 [--confidence low|medium|high]");
  console.log("                                 [--evidence-source <s> --evidence-path <p>");
  console.log("                                  --evidence-date <YYYY-MM-DD>]");
  console.log("");
  console.log("    --signature <sig>       Cross-scope recurrence key, e.g. the output of");
  console.log("                            'adev heuristics signature'. Omitted when unset;");
  console.log("                            EXISTING-wins on re-write of the same id (a");
  console.log("                            divergent incoming value is reported on stderr).");
  console.log("");
  console.log("    Stdout: 'Heuristic written: <id> (scope: <s>, confidence: <c>)'");
  console.log("    Stderr: 'heuristics: extraction skipped — <error>' on failure");
  console.log("    Exit:   0 always (lesson capture is best-effort per skills/recover prose)");
}
