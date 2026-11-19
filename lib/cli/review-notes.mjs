// adev review-notes show --spec <path> [--json]
//
// Reports a spec's latest review verdict (from the lifecycle log), whether the
// spec is byte-identical to what was reviewed (`.review.md` file-sha), and the
// open PASS_WITH_NOTES warnings parsed from `.review.md`.
//
// Contract (driver-substrate): exports `run({ projectRoot, argv })` and
// `help()`. Read-only; does not export LIFECYCLE_STEP.
//
// Exit codes:
//   0  report printed (including "no review report" and "no warnings")
//   1  argument error, or a spec path that is missing or escapes the project

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { readReviewNotes } from "../review-notes.mjs";

const USAGE = "usage: adev review-notes show --spec <path> [--json]";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];
  if (sub === "--help" || sub === "-h" || sub === "help") {
    help();
    process.exit(0);
  }
  if (sub !== "show") {
    console.error(USAGE);
    console.error(`  unknown subcommand ${JSON.stringify(sub ?? null)} (expected: show)`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        spec: { type: "string" },
        json: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    console.error(`  ${err.message}`);
    process.exit(1);
  }

  const { spec, json } = parsed.values;
  if (!spec) {
    console.error(USAGE);
    console.error("  --spec is required");
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);
  const absSpec = isAbsolute(spec) ? spec : resolve(absRoot, spec);
  // Out-of-tree and missing specs share one message so a probe outside the
  // project learns nothing an in-tree miss would not tell it.
  if (!absSpec.startsWith(absRoot + sep) || !existsSync(absSpec)) {
    console.error(`spec not found: ${spec}`);
    process.exit(1);
  }

  const notes = readReviewNotes(absRoot, absSpec);

  if (json) {
    console.log(JSON.stringify(notes));
    process.exit(0);
  }

  const unchanged = notes.unchangedSinceReview === null
    ? "unknown"
    : notes.unchangedSinceReview ? "yes" : "no";
  console.log(`spec: ${notes.spec}`);
  console.log(`review: ${notes.review ?? "(none)"}`);
  console.log(`verdict: ${notes.verdict ?? "(not recorded)"}`);
  console.log(`unchanged since review: ${unchanged}`);
  if (notes.warnings.length === 0) {
    console.log("warnings: none");
  } else {
    console.log(`warnings: ${notes.warnings.length}`);
    for (const w of notes.warnings) {
      console.log(`- ${w.id ?? "(no ID)"} [${w.section ?? "no section cited"}]: ${w.summary}`);
    }
  }
  process.exit(0);
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Reports a spec's latest review for /adev:plan carry-forward and");
  console.log("/adev:review-specs re-review advice.");
  console.log("");
  console.log("Required:");
  console.log("  --spec <path>   Live Spec whose sibling .review.md is read");
  console.log("");
  console.log("Optional:");
  console.log("  --json          Emit { spec, review, verdict, unchangedSinceReview, warnings[] }");
  console.log("                  warnings[]: { id, reviewer, section, summary } (id/section may be null)");
  console.log("");
  console.log("verdict comes from the lifecycle log; warnings is empty when it is PASS.");
  console.log("unchangedSinceReview is null when .review.md carries no sha256 file-sha.");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  report printed");
  console.log("  1  argument error / spec not found or outside the project root");
}
