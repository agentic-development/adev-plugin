// lib/cli/eval.mjs
//
// `adev eval score` — CLI surface wrapping lib/evals/rubric.mjs (loadRubric)
// and lib/evals/score.mjs (scoreRubric) so skills can drive rubric-based
// scoring via a CLI subcommand instead of inline Node, per the
// cli-driver-surface charter "no inline Node in SKILL.md" rule.
//
// Named `eval`, not `eval-score`: `run()` dispatches on `argv[0]` so the
// Run-cost record capability can add `adev eval cost` beside `score` without
// a second VERB_REGISTRY entry. `score` is the only subcommand today.
//
// Subverbs:
//   adev eval score --rubric <path|default> --input <path> [--json]
//
// Exit codes:
//   0  success
//   1  argument error, containment failure, unreadable/missing/unparsable
//      input, or a rejection raised by loadDefaultRubric()/loadRubric()/
//      scoreRubric()
//
// This module never restates the scoring engine's contract — it only
// contains paths, reads the verdict-set file, calls loadRubric/scoreRubric,
// and renders their result. All arithmetic, status resolution, and error
// vocabulary live in lib/evals/.

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { codedError } from "../errors.mjs";
import { isContained, lenientRealpath, resolveContained } from "../path-safety.mjs";
import { loadRubric } from "../evals/rubric.mjs";
import { scoreRubric } from "../evals/score.mjs";
import { getPluginRoot } from "../profiles/index.mjs";

const USAGE = "usage: adev eval <score> [flags]";
const SCORE_USAGE = "usage: adev eval score --rubric <path|default> --input <path> [--json]";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];
  if (!sub) {
    console.error(USAGE);
    process.exit(1);
  }
  // Real-path the root FIRST, matching loadRubric's own containment sequence
  // (lib/evals/rubric.mjs): on macOS a project root under /var is itself
  // reached through a symlink (/var -> /private/var), so comparing a
  // real-pathed candidate against a non-real root would reject every
  // contained path as unsafe.
  const absRoot = lenientRealpath(resolve(projectRoot));

  switch (sub) {
    case "score":
      return cmdScore(absRoot, argv.slice(1));
    default:
      console.error(`unknown subverb: ${sub}\n${USAGE}`);
      process.exit(1);
  }
}

/**
 * Build the `UNSAFE_SCORE_PATH` error.
 *
 * Reports the caller-supplied path verbatim (never the resolved one),
 * matching the `UNSAFE_RUBRIC_PATH` precedent `loadRubric` set: the resolved
 * form would leak filesystem layout outside the project root, and the
 * caller can only act on the input it actually passed.
 *
 * @param {string} offending - the path exactly as the caller supplied it
 * @returns {Error}
 */
function unsafeScorePathError(offending) {
  const err = codedError(
    "UNSAFE_SCORE_PATH",
    `UNSAFE_SCORE_PATH: path "${offending}" escapes the project root.`,
  );
  err.offendingPath = offending;
  return err;
}

/**
 * Contain a caller-supplied path against `absRoot`, following the same
 * ordered sequence `loadRubric` uses: resolve-against-root, then
 * `lenientRealpath` the result to resolve any symlink escape, then confirm
 * containment again on the real path. Nothing is read from disk here — this
 * is a pure path check, so a traversal or symlink escape is refused without
 * ever touching file content.
 *
 * @param {string} absRoot - real-pathed project root
 * @param {string} rawPath - the path exactly as the caller supplied it
 * @returns {string} the real, contained absolute path
 * @throws {Error} `code: 'UNSAFE_SCORE_PATH'` naming `rawPath` verbatim
 */
function containPath(absRoot, rawPath) {
  const abs = resolveContained(absRoot, rawPath);
  if (abs === null) throw unsafeScorePathError(rawPath);
  const real = lenientRealpath(abs);
  if (!isContained(real, absRoot)) throw unsafeScorePathError(rawPath);
  return real;
}

/**
 * The one `--rubric` value that is a KEYWORD rather than a path (BEH-11).
 * Matched as an exact literal: `Default`, `default.yaml`, and `./default` are
 * all paths and take the BEH-9 containment branch.
 */
const DEFAULT_RUBRIC_KEYWORD = "default";

/**
 * Load the plugin's shipped default rubric (BEH-11).
 *
 * The plugin root comes from `getPluginRoot()` — which derives it from a lib
 * module's own `__dirname` — and from nowhere else. It is deliberately NOT
 * read from an environment variable such as `CLAUDE_PLUGIN_ROOT`, nor
 * threaded in from the caller: this is the one branch permitted to skip
 * project-root containment, and its whole safety argument is that the
 * location it resolves is unforgeable. A caller-settable root would be a
 * weaker posture than the containment it skips.
 *
 * Nothing is stat-ed or read here: `loadRubric` is the single reader, and it
 * applies its own resolve/realpath/re-check sequence against the plugin
 * root, exactly as the path branch does against the project root. Its
 * `RUBRIC_NOT_FOUND` — which it raises for an absent file AND for one that
 * exists but cannot be read — is re-coded to `SCORE_DEFAULT_RUBRIC_MISSING`,
 * matching the spec row that names "absent or unreadable" as one input with
 * one code. Every other loader code passes through untouched: a shipped
 * rubric that is readable but corrupt is a parse/schema fault, not a missing
 * one, and must keep its own code.
 *
 * @returns {object} the loaded rubric
 * @throws {Error} `code: 'SCORE_DEFAULT_RUBRIC_MISSING'` naming the resolved
 *   plugin path, when the shipped rubric is absent or unreadable
 * @throws {Error} every other code `loadRubric` raises, unchanged
 */
function loadDefaultRubric() {
  const pluginRoot = lenientRealpath(resolve(getPluginRoot()));
  const shipped = join(pluginRoot, "skills", "eval", "default-rubric.yaml");
  try {
    return loadRubric(shipped, { projectRoot: pluginRoot });
  } catch (err) {
    if (err && err.code === "RUBRIC_NOT_FOUND") {
      throw codedError(
        "SCORE_DEFAULT_RUBRIC_MISSING",
        `SCORE_DEFAULT_RUBRIC_MISSING: the shipped default rubric at "${shipped}" is absent ` +
        `or unreadable: ${err.message}`,
      );
    }
    throw err;
  }
}

/**
 * Right-pad `s` with spaces to width `w`.
 *
 * @param {string} s
 * @param {number} w
 * @returns {string}
 */
function pad(s, w) {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

/**
 * Render the verdict table: one row per declared id, in the order
 * `scoreRubric` returned them (rubric-declaration order: elements then
 * criteria). Column widths are computed from the data on every call, never
 * hardcoded, so the table stays aligned whatever ids a rubric declares.
 *
 * Evidence is deliberately NOT a column here — it is free text and would
 * make every default-mode run's paste-into-conversation width unbounded,
 * which defeats the entire point of a compact default. Evidence is only
 * ever available via `--json`.
 *
 * @param {Array<{id: string, kind: string, verdict: string}>} verdicts
 * @returns {string}
 */
function renderTable(verdicts) {
  const headers = ["id", "kind", "verdict"];
  const rows = verdicts.map((v) => [v.id, v.kind, v.verdict]);
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const lines = [headers.map((h, i) => pad(h, widths[i])).join("   ").trimEnd()];
  for (const row of rows) {
    lines.push(row.map((c, i) => pad(c, widths[i])).join("   ").trimEnd());
  }
  return lines.join("\n");
}

/**
 * Render one half (`deterministic` or `judged`) for the aggregate line.
 *
 * A half whose `status` is `null` is trustworthy: print its exact `points`
 * and `max` from the engine, unrounded — the engine rounds once, at the
 * blend, and a renderer that rounded again for display would be a second
 * rounding site that could disagree with `--json`. A half carrying a
 * status string is rendered BY THAT NAME, never as a number and never
 * coerced from a `null` points to `0` (BEH-8).
 *
 * @param {string} label - `deterministic` or `judged`
 * @param {{status: string|null, points: number|null, max: number|null}} half
 * @returns {string}
 */
function renderHalf(label, half) {
  if (half.status === null) return `${label}: ${half.points}/${half.max}`;
  return `${label}: ${half.status}`;
}

/**
 * Render the aggregate line: both halves, then `total`. `total` prints as
 * `n/a` — never `0`, never omitted, never synthesised from one numeric half
 * — whenever `scoreRubric` returned `null` for it (i.e. either half carries
 * a status).
 *
 * @param {object} result - `scoreRubric`'s return value
 * @returns {string}
 */
function renderAggregateLine(result) {
  const det = renderHalf("deterministic", result.deterministic);
  const judged = renderHalf("judged", result.judged);
  const total = result.total === null ? "total: n/a" : `total: ${result.total.points}/${result.total.max}`;
  return `${det}   ${judged}   ${total}`;
}

/**
 * Render the full default (non-`--json`) output: the verdict table together
 * with the aggregate line, always both, never the aggregate alone (BEH-8).
 *
 * @param {object} result - `scoreRubric`'s return value
 * @returns {string}
 */
function renderResult(result) {
  return `${renderTable(result.verdicts)}\n\n${renderAggregateLine(result)}`;
}

function cmdScore(absRoot, argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        rubric: { type: "string" },
        input: { type: "string" },
        json: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch {
    console.error(SCORE_USAGE);
    process.exit(1);
  }

  const { rubric: rubricArg, input: inputArg, json: jsonOutput } = parsed.values;
  if (!rubricArg) {
    console.error(`--rubric is required\n${SCORE_USAGE}`);
    process.exit(1);
  }
  if (!inputArg) {
    console.error(`--input is required\n${SCORE_USAGE}`);
    process.exit(1);
  }

  try {
    // Contain BOTH paths before reading either, so a traversal or symlink
    // escape on EITHER flag is refused by one uniform code before any file
    // is opened (BEH-9). loadRubric() re-contains --rubric again on its own
    // below — that duplicate check is deliberate (base packet: "one uniform
    // code before either file is opened").
    //
    // The single exception is the literal `default`, which names a known
    // location inside the plugin rather than a caller-supplied path, and so
    // is bounded by the plugin root instead (BEH-11). --input is a path in
    // every case and is contained here unconditionally.
    const useDefaultRubric = rubricArg === DEFAULT_RUBRIC_KEYWORD;
    if (!useDefaultRubric) containPath(absRoot, rubricArg);
    const inputReal = containPath(absRoot, inputArg);

    let source;
    try {
      source = readFileSync(inputReal, "utf8");
    } catch (readErr) {
      throw codedError(
        "SCORE_INPUT_NOT_FOUND",
        `SCORE_INPUT_NOT_FOUND: no verdict input file exists at "${inputReal}" (${readErr.message}).`,
      );
    }

    let verdictSet;
    try {
      verdictSet = JSON.parse(source);
    } catch (parseErr) {
      throw codedError(
        "SCORE_INPUT_PARSE_ERROR",
        `SCORE_INPUT_PARSE_ERROR: verdict input "${inputReal}" is not valid JSON: ${parseErr.message}`,
      );
    }

    const rubric = useDefaultRubric
      ? loadDefaultRubric()
      : loadRubric(rubricArg, { projectRoot: absRoot });
    const result = scoreRubric(rubric, verdictSet);

    // Nothing is printed until every step above has succeeded — a rejected
    // path, input, rubric, or verdict set produces no table, partial or
    // otherwise (BEH-8's "never the aggregate alone" extends to "never a
    // table alongside an error").
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderResult(result));
    }
    process.exit(0);
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }
}

export function help() {
  console.log("Usage: adev eval <subverb> [flags]");
  console.log("");
  console.log("Subverbs:");
  console.log("  score --rubric <path|default> --input <path> [--json]   score a verdict set against a rubric");
  console.log("");
  console.log("`score` prints the verdict table together with the aggregate line by default;");
  console.log("evidence is omitted from that default table (it is free text and would make every");
  console.log("run's paste unbounded in width) and is only available via --json. --input, and");
  console.log("every --rubric value that is a path, are containment-checked against the project");
  console.log("root before either file is opened; an escape exits non-zero with");
  console.log("UNSAFE_SCORE_PATH, and a missing or unreadable --input exits non-zero with");
  console.log("SCORE_INPUT_NOT_FOUND.");
  console.log("");
  console.log("The literal --rubric default is a keyword, not a path: it names the plugin's");
  console.log("shipped skills/eval/default-rubric.yaml and is bounded by the plugin root");
  console.log("instead of the project root. Only that exact spelling is a keyword, and the");
  console.log("plugin root is derived from the CLI's own location on disk, never from an");
  console.log("environment variable. If the shipped rubric is absent, the verb exits non-zero");
  console.log("with SCORE_DEFAULT_RUBRIC_MISSING.");
}
