// lib/cli/artifact.mjs
//
// `adev artifact commit` — atomically commit a lifecycle artifact that was
// written to a sibling `.tmp` file. Solves the "socket closed mid-write left
// the .validate.md missing" problem from the 2026-05-16 validation charter
// build retro (epic-85 / issue-496): the agent writes the long-form report
// body to `<spec-path>.validate.md.tmp` via the Write tool, then commits it
// with this verb, which performs a same-directory `fs.renameSync` — atomic
// on POSIX when both paths live on the same filesystem (guaranteed here
// because the temp sits adjacent to the destination).
//
// Why a verb and not a Bash `mv`: this verb enforces the artifact-kind /
// path convention (validate → `.validate.md`, review → `.review.md`, etc.)
// so an agent can't accidentally commit a temp file to a wrong destination.
// It also validates source non-emptiness, which catches the failure mode
// where the upstream Write tool truncated the temp file to zero bytes.
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — committing an artifact is a filesystem
//     operation, not a lifecycle step entry/exit.
//
// CLI surface:
//   adev artifact commit --spec <spec-path> --kind <validate|review>
//                        [--from <explicit-src>] [--to <explicit-dst>]
//   adev artifact --help
//
// Exit codes (per hook protocol):
//   0  rename succeeded (silent on success)
//   1  argument error, containment violation, missing/empty source,
//      or rename failure

import { parseArgs } from "node:util";
import { existsSync, statSync, renameSync, readFileSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

const USAGE =
  "usage: adev artifact commit --spec <p> --kind <validate|review> [--from <src>] [--to <dst>]";

const ARTIFACT_KINDS = new Map([
  ["validate", ".validate.md"],
  ["review", ".review.md"],
]);

/**
 * True when the file's first non-blank line is the `---` frontmatter delimiter.
 *
 * Mirrors the rule enforced by `lib/diagnostics/tier1/frontmatter-present.mjs`
 * ("a markdown body — e.g. a leading `#` heading — before `---` is rejected"),
 * so the writer and the diagnostic cannot disagree. Leading blank lines are
 * tolerated, matching that producer.
 *
 * Reads only the head of the file; a report body can be large and the answer
 * is decided by its first meaningful line.
 *
 * @param {string} absPath
 * @returns {boolean}
 */
export function hasLeadingFrontmatter(absPath) {
  let head;
  try {
    head = readFileSync(absPath, "utf8").slice(0, 4096);
  } catch {
    return false;
  }
  for (const line of head.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    return line.trim() === "---";
  }
  return false;
}

function resolveContained(absRoot, relPath) {
  const abs = isAbsolute(relPath) ? relPath : resolve(absRoot, relPath);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) return null;
  return abs;
}

export async function run({ projectRoot, argv }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (sub === "commit") {
    return runCommit({ projectRoot, argv: argv.slice(1) });
  }

  console.error(USAGE);
  console.error(`  unknown subcommand: ${sub} (expected commit)`);
  process.exit(1);
}

function runCommit({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        spec: { type: "string" },
        kind: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
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

  const absRoot = resolve(projectRoot);

  let absSrc;
  let absDst;

  if (v.from || v.to) {
    if (!v.from || !v.to) {
      console.error(USAGE);
      console.error("  --from and --to must be provided together");
      process.exit(1);
    }
    absSrc = resolveContained(absRoot, v.from);
    absDst = resolveContained(absRoot, v.to);
    if (!absSrc) {
      console.error(`source path escapes project root: ${v.from}`);
      process.exit(1);
    }
    if (!absDst) {
      console.error(`destination path escapes project root: ${v.to}`);
      process.exit(1);
    }
  } else {
    if (!v.spec) {
      console.error(USAGE);
      console.error("  --spec is required (unless --from and --to are both given)");
      process.exit(1);
    }
    if (!v.kind) {
      console.error(USAGE);
      console.error("  --kind is required (unless --from and --to are both given)");
      process.exit(1);
    }
    const ext = ARTIFACT_KINDS.get(v.kind);
    if (!ext) {
      console.error(USAGE);
      console.error(
        `  --kind must be one of: ${[...ARTIFACT_KINDS.keys()].join(", ")} (got ${JSON.stringify(v.kind)})`,
      );
      process.exit(1);
    }
    const absSpec = resolveContained(absRoot, v.spec);
    if (!absSpec) {
      console.error(`spec path escapes project root: ${v.spec}`);
      process.exit(1);
    }
    if (!absSpec.endsWith(".spec.md")) {
      console.error(`--spec must point to a .spec.md file (got ${v.spec})`);
      process.exit(1);
    }
    absDst = absSpec.replace(/\.spec\.md$/, ext);
    absSrc = `${absDst}.tmp`;
  }

  if (!existsSync(absSrc)) {
    console.error(`source artifact missing: ${absSrc}`);
    console.error("  expected the .tmp file written by the validate skill");
    process.exit(1);
  }

  let stat;
  try {
    stat = statSync(absSrc);
  } catch (err) {
    console.error(`stat failed on source: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }
  if (!stat.isFile()) {
    console.error(`source is not a regular file: ${absSrc}`);
    process.exit(1);
  }
  if (stat.size === 0) {
    console.error(`source is empty: ${absSrc}`);
    console.error("  refusing to commit a zero-byte artifact (likely truncated write)");
    process.exit(1);
  }

  // Frontmatter placement is a CONTRACT, not a preference. `adev/frontmatter-present`
  // (severity: error) requires the first non-blank line of a `.review.md` /
  // `.validate.md` to be the `---` delimiter, and `lib/specify-revise.mjs` cannot
  // parse an artifact whose frontmatter is not first. Prose alone did not hold the
  // line: 122 of 123 `.validate.md` and 153 of 202 `.review.md` files violate it,
  // and validate already routes through this verb — the rename simply never
  // inspected content. This is the single choke point both report kinds can pass
  // through, so the check belongs here rather than in skill prose (constitution.md:68).
  if (!hasLeadingFrontmatter(absSrc)) {
    console.error(`ARTIFACT_FRONTMATTER_NOT_FIRST: ${absSrc}`);
    console.error("  the first non-blank line must be the '---' frontmatter delimiter");
    console.error("  move the YAML frontmatter above any heading or HTML comment, then re-run");
    process.exit(1);
  }

  try {
    renameSync(absSrc, absDst);
  } catch (err) {
    console.error(`rename failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }
}

export function help() {
  console.log("adev artifact — commit lifecycle artifacts atomically");
  console.log("");
  console.log("Subcommands:");
  console.log("  commit --spec <spec-path> --kind <validate|review>");
  console.log("      Atomically rename <spec-path>.<kind>.md.tmp into place.");
  console.log("");
  console.log("  commit --from <src> --to <dst>");
  console.log("      Atomically rename an explicit source to destination.");
  console.log("      Both paths must be contained within the project root.");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  rename succeeded (silent on success)");
  console.log("  1  argument error, missing/empty source, or rename failure");
}
