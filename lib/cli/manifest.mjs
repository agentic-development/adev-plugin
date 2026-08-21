// lib/cli/manifest.mjs
//
// adev manifest lint [--json]
//
// Structural checks on `.context-index/manifest.yaml` that operate on the raw
// text, not the parsed object — checks like duplicate-top-level-key detection
// need the text because YAML parsing itself is where the signal is lost
// (last-wins, silently). `/adev:hygiene`'s Governance Policy Health pass
// calls this verb rather than re-reading the manifest by hand.
//
// Contract (driver-substrate): exports `run({ projectRoot, argv })` and
// `help()`. Does NOT export LIFECYCLE_STEP — a lint is neither a lifecycle
// step entry nor exit.
//
// Exit codes:
//   0  no findings
//   1  argument error, or manifest.yaml not found
//   2  findings present (advisory content, non-zero so scripts can branch)

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { findDuplicateTopLevelKeys } from "../manifest.mjs";

const USAGE = "usage: adev manifest lint [--json]";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];
  if (sub === "--help" || sub === "-h" || sub === "help") {
    help();
    process.exit(0);
  }
  if (sub !== undefined && sub !== "lint") {
    console.error(USAGE);
    console.error(`  unknown subcommand ${JSON.stringify(sub)} (expected: lint)`);
    process.exit(1);
  }

  const rest = sub === "lint" ? argv.slice(1) : argv;
  const asJson = rest.includes("--json");

  const absRoot = resolve(projectRoot);
  const manifestPath = join(absRoot, ".context-index", "manifest.yaml");
  if (!existsSync(manifestPath)) {
    console.error(`manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const text = readFileSync(manifestPath, "utf8");
  const duplicates = findDuplicateTopLevelKeys(text);

  if (asJson) {
    console.log(JSON.stringify({ duplicates }));
  } else if (duplicates.length === 0) {
    console.log("manifest lint: no duplicate top-level keys");
  } else {
    console.log("manifest lint: duplicate top-level keys found");
    for (const { key, lines } of duplicates) {
      console.log(`  ${key}: declared at lines ${lines.join(", ")} — later block silently wins, earlier is dead config`);
    }
  }

  process.exit(duplicates.length > 0 ? 2 : 0);
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Lints .context-index/manifest.yaml's raw text for structural defects that");
  console.log("silent last-wins YAML parsing would otherwise hide.");
  console.log("");
  console.log("Checks:");
  console.log("  - duplicate top-level keys (e.g. two `build:` blocks) — the later one");
  console.log("    silently wins; the earlier is dead config with zero signal that it");
  console.log("    stopped taking effect (adev-plugin-gkfv.2).");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  no findings");
  console.log("  1  argument error, or manifest.yaml not found");
  console.log("  2  findings present");
}
