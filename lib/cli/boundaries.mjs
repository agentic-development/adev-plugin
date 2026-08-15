// lib/cli/boundaries.mjs
//
// adev boundaries check [--json] [--changed <path,...>] [--all]
//
// Evaluates `.context-index/governance/boundaries.yaml` against a set of files.
// All evaluation lives in lib/governance/boundaries.mjs; this module owns
// argument parsing, the changed-file default, output formatting and exit codes.
//
// Exit codes (the `adev gate doctor` convention — 0 clean, 2 findings, 1 the
// caller's own fault):
//   0  SKIP, PASS or WARN. A project declaring no rules SKIPs, as does a run
//      whose changed-file set is empty, and a SKIP must not block: nothing was
//      checked, which is not the same as a failure.
//      A warning-severity match is reported and does not block either.
//   2  FAIL — at least one error-severity finding, which includes a rule that
//      blew its evaluation budget or could not read an oversize file.
//   1  argument error, or a registry the evaluator refuses
//      (INVALID_BOUNDARY_PATTERN, BOUNDARIES_PARSE_ERROR, BOUNDARY_PATH_ESCAPE).
//
// The changed-file set, in precedence order:
//   1. `--changed <path,...>` — comma-separated, repeatable. Explicit wins.
//   2. `--all` — every tracked file (`git ls-files`). This is the whole-tree
//      sweep /adev:hygiene and the spec's tree-wide assertions want.
//   3. default — `git diff --name-only --diff-filter=ACMR HEAD` plus untracked,
//      not-ignored files. Deleted paths are dropped by the evaluator, which
//      ignores anything that no longer exists.
// Without git and without `--changed`, the verb exits 1 rather than guessing.

import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { resolve } from "node:path";

const USAGE =
  "usage: adev boundaries check [--json] [--changed <path,...>] [--all]";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];
  if (sub !== "check") {
    console.error(USAGE);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        json: { type: "boolean", default: false },
        changed: { type: "string", multiple: true },
        all: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch {
    console.error(USAGE);
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);

  let changed;
  try {
    changed = resolveChangedSet(absRoot, parsed.values);
  } catch (err) {
    console.error(err?.message ?? String(err));
    process.exit(1);
  }

  const { checkBoundaries } = await import("../governance/boundaries.mjs");

  let result;
  try {
    result = await checkBoundaries(absRoot, { changed });
  } catch (err) {
    console.error(`${err?.code ?? "ERROR"}: ${err?.message ?? String(err)}`);
    process.exit(1);
  }

  const summary = {
    errors: result.findings.filter((f) => f.severity === "error").length,
    warnings: result.findings.filter((f) => f.severity === "warning").length,
    infos: result.findings.filter((f) => f.severity === "info").length,
    files_checked: changed.length,
  };

  if (parsed.values.json) {
    console.log(JSON.stringify({ ...result, summary }, null, 2));
  } else {
    printReport(result, summary);
  }

  process.exit(result.verdict === "FAIL" ? 2 : 0);
}

/**
 * @param {string} absRoot
 * @param {{changed?: string[], all?: boolean}} values
 * @returns {string[]}
 */
function resolveChangedSet(absRoot, values) {
  if (values.changed && values.changed.length > 0) {
    return dedupe(
      values.changed.flatMap((entry) => entry.split(",")).map((p) => p.trim()).filter(Boolean),
    );
  }
  if (values.all) return dedupe(git(absRoot, ["ls-files", "-z"]));
  return dedupe([
    ...git(absRoot, ["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD"]),
    ...git(absRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
}

/**
 * `-z` throughout: a path containing a newline would otherwise silently split
 * into two nonexistent paths, and a boundary rule that never runs is the exact
 * failure mode this verb exists to prevent.
 */
function git(absRoot, args) {
  let out;
  try {
    out = execFileSync("git", args, {
      cwd: absRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    throw new Error(
      "could not derive the changed-file set from git " +
        `(${(err?.stderr || err?.message || "").toString().trim().split("\n")[0]}). ` +
        "Pass --changed <path,...> instead.",
    );
  }
  return out.split("\0").filter((p) => p !== "");
}

function dedupe(paths) {
  return [...new Set(paths)];
}

function printReport(result, summary) {
  console.log("# Boundary Check");
  console.log("");
  console.log(`${result.verdict}: ${result.reason}`);
  printDisabled(result);
  if (result.findings.length === 0) return;
  console.log("");
  for (const f of result.findings) {
    const mark = f.severity === "error" ? "[x]" : f.severity === "warning" ? "[!]" : "[i]";
    const where = f.line === null ? f.file : `${f.file}:${f.line}`;
    const rule = f.ruleId ? `${f.ruleId} — ` : "";
    console.log(`- ${mark} ${rule}${where}`);
    if (f.matchedLine !== null) console.log(`      ${f.matchedLine}`);
    console.log(`      ${f.message} (${f.code})`);
  }
  console.log("");
  console.log(
    `**Summary:** ${summary.errors} error(s), ${summary.warnings} warning(s), ` +
      `${summary.infos} note(s) over ${summary.files_checked} file(s).`,
  );
}

/**
 * Print the rules the registry declares but deliberately does not run, and the
 * schema warnings the load raised.
 *
 * `--json` has carried `disabled` and `warnings` since they existed; the human
 * report did not, so in a MIXED registry — some rules on, some off — the
 * operator saw no trace of the disabled ones and `DISABLED_WITHOUT_REASON` was
 * `--json`-only. A disabled rule that is invisible in the report is
 * indistinguishable from one nobody ever declared, which is exactly the
 * conflation `enabled: false` exists to remove.
 *
 * Both blocks are omitted entirely when empty: a report that says "0 disabled
 * rules" on every clean run trains the reader to skip the section.
 */
function printDisabled(result) {
  const disabled = result.disabled ?? [];
  const warnings = result.warnings ?? [];
  if (disabled.length > 0) {
    console.log("");
    console.log(`**Disabled rules** (${disabled.length}) — declared, deliberately not run:`);
    for (const d of disabled) {
      console.log(`- ${d.id}: ${d.disabled_reason ?? "no reason given"}`);
    }
  }
  if (warnings.length > 0) {
    console.log("");
    console.log("**Registry warnings:**");
    for (const w of warnings) console.log(`- ${w.code}: ${w.message}`);
  }
}

export function help() {
  console.log("Usage: adev boundaries check [--json] [--changed <path,...>] [--all]");
  console.log("");
  console.log("Evaluate .context-index/governance/boundaries.yaml against a set of files.");
  console.log("Each rule is a regex matched against file CONTENTS, honouring its");
  console.log("`exclude` globs. severity: error → FAIL; severity: warning → WARN.");
  console.log("");
  console.log("  --json              emit the machine-readable envelope instead of a report");
  console.log("  --changed <p,...>   comma-separated file list; repeatable. Explicit wins.");
  console.log("  --all               evaluate every tracked file (git ls-files)");
  console.log("");
  console.log("  With neither flag the set is `git diff --name-only --diff-filter=ACMR HEAD`");
  console.log("  plus untracked, not-ignored files. Without git, pass --changed.");
  console.log("");
  console.log("  The report names every rule declared with `enabled: false` and its");
  console.log("  `disabled_reason`, so a switched-off rule reads differently from one the");
  console.log("  project never declared. In --json those rows are the `disabled` array,");
  console.log("  and the top-level `warnings` array holds REGISTRY SCHEMA warnings —");
  console.log("  a different thing from `summary.warnings`, which counts findings.");
  console.log("");
  console.log("  A project declaring no rules records SKIP — never PASS, because nothing");
  console.log("  was checked — and no file is read. An empty changed set SKIPs for the");
  console.log("  same reason.");
  console.log("");
  console.log("  Fails closed: an unevaluatable rule (blown time budget, oversize input)");
  console.log("  is a finding, never silence. Binary files are skipped with an info note.");
  console.log("");
  console.log("  Exit codes:");
  console.log("    0  SKIP, PASS or WARN");
  console.log("    2  FAIL — one or more error-severity findings");
  console.log("    1  argument error, or a registry the evaluator refuses");
  console.log("       (INVALID_BOUNDARY_PATTERN, BOUNDARIES_PARSE_ERROR)");
}
