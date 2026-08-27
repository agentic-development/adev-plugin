// lib/cli/repomap.mjs
//
// `adev repomap generate` / `adev repomap check-deps` — CLI surface for the
// tree-sitter + PageRank pipeline in `lib/repomap/index.mjs` and the
// dependency probe in `lib/repomap/check-deps.mjs`.
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — repomap generation is a maintenance
//     utility invoked from `/adev:repomap`, not a lifecycle step entry/exit.
//
// CLI surface:
//   adev repomap generate [--mode tree-sitter|regex] [--format json|text]
//   adev repomap check-deps [--format json|text]
//
// Exit codes (generate):
//   0  artifacts written (tree-sitter or regex mode)
//   1  argument error, or --mode tree-sitter requested but unavailable
//
// Exit codes (check-deps):
//   0  web-tree-sitter resolvable
//   1  web-tree-sitter not resolvable, or argument error

import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { run as runRepomapPipeline } from "../repomap/index.mjs";
import { isTreeSitterAvailable } from "../repomap/check-deps.mjs";

const USAGE =
  "usage: adev repomap <generate|check-deps> [--mode tree-sitter|regex] [--format json|text]";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (sub === "generate") return runGenerate(projectRoot, argv.slice(1));
  if (sub === "check-deps") return runCheckDeps(argv.slice(1));

  console.error(USAGE);
  console.error(`  unknown subcommand: ${sub}`);
  process.exit(1);
}

async function runGenerate(projectRoot, rest) {
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        mode: { type: "string" },
        format: { type: "string", default: "text" },
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

  if (v.mode !== undefined && v.mode !== "tree-sitter" && v.mode !== "regex") {
    console.error(`--mode must be one of: tree-sitter, regex (got ${JSON.stringify(v.mode)})`);
    process.exit(1);
  }
  if (v.format !== "json" && v.format !== "text") {
    console.error(`--format must be one of: json, text (got ${JSON.stringify(v.format)})`);
    process.exit(1);
  }

  try {
    await runRepomapPipeline(projectRoot, v.mode);
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }

  const summary = summarizeArtifacts(projectRoot);

  if (v.format === "json") {
    console.log(JSON.stringify(summary));
  } else {
    console.log(formatSummary(summary));
  }
}

async function runCheckDeps(rest) {
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        format: { type: "string", default: "text" },
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
  if (v.format !== "json" && v.format !== "text") {
    console.error(`--format must be one of: json, text (got ${JSON.stringify(v.format)})`);
    process.exit(1);
  }

  const available = isTreeSitterAvailable();

  if (v.format === "json") {
    console.log(JSON.stringify({ available }));
  } else {
    console.log(available ? "web-tree-sitter: available" : "web-tree-sitter: not installed");
  }

  process.exit(available ? 0 : 1);
}

/**
 * Read back the artifacts `runRepomapPipeline` just wrote and derive a small
 * summary. The pipeline itself returns nothing (it logs progress to
 * stderr) — this reads only its documented output files, never re-derives
 * their contents.
 *
 * @param {string} projectRoot
 * @returns {{mode: string, artifacts: string[], files: number|null, edges: number|null, symbols: number|null, topSymbol: {name: string, score: number}|null}}
 */
function summarizeArtifacts(projectRoot) {
  const hygieneDir = join(projectRoot, ".context-index", "hygiene");
  const repoMapPath = join(hygieneDir, "repo-map.md");
  const graphPath = join(hygieneDir, "dependency-graph.json");
  const ranksPath = join(hygieneDir, "symbol-ranks.json");

  const artifacts = [];
  let mode = "unknown";

  if (existsSync(repoMapPath)) {
    artifacts.push("repo-map.md");
    const firstLines = readFileSync(repoMapPath, "utf-8").split("\n", 5);
    const parserLine = firstLines.find((l) => l.startsWith("> Parser:"));
    if (parserLine) mode = parserLine.slice("> Parser:".length).trim();
  }

  let files = null;
  let edges = null;
  if (existsSync(graphPath)) {
    artifacts.push("dependency-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
    files = Array.isArray(graph.nodes) ? graph.nodes.length : null;
    edges = Array.isArray(graph.edges) ? graph.edges.length : null;
  }

  let symbols = null;
  let topSymbol = null;
  if (existsSync(ranksPath)) {
    artifacts.push("symbol-ranks.json");
    const ranks = JSON.parse(readFileSync(ranksPath, "utf-8"));
    symbols = Array.isArray(ranks.symbols) ? ranks.symbols.length : null;
    if (Array.isArray(ranks.symbols) && ranks.symbols.length > 0) {
      const top = ranks.symbols[0];
      topSymbol = { name: top.name, score: top.score };
    }
  }

  return { mode, artifacts, files, edges, symbols, topSymbol };
}

function formatSummary(summary) {
  const lines = [
    "Repository map generated.",
    "",
    `  Parser mode: ${summary.mode}`,
  ];
  if (summary.files !== null) lines.push(`  Files: ${summary.files}`);
  if (summary.edges !== null) lines.push(`  Edges: ${summary.edges}`);
  if (summary.symbols !== null) lines.push(`  Symbols: ${summary.symbols}`);
  if (summary.topSymbol) {
    lines.push(`  Top symbol: ${summary.topSymbol.name} (score ${summary.topSymbol.score})`);
  }
  lines.push("", "Artifacts written to .context-index/hygiene/:");
  for (const a of summary.artifacts) lines.push(`  - ${a}`);
  return lines.join("\n");
}

export function help() {
  console.log("Usage: adev repomap generate [--mode tree-sitter|regex] [--format json|text]");
  console.log("       adev repomap check-deps [--format json|text]");
  console.log("");
  console.log("Generate the repo-map.md / dependency-graph.json / symbol-ranks.json");
  console.log("artifacts. Wraps lib/repomap/index.mjs::run and lib/repomap/check-deps.mjs.");
  console.log("");
  console.log("generate:");
  console.log("  --mode <mode>     Force tree-sitter or regex parsing (default: auto-detect)");
  console.log("  --format <fmt>    Output format: text (default) | json");
  console.log("");
  console.log("check-deps:");
  console.log("  --format <fmt>    Output format: text (default) | json");
  console.log("  Exit 0 if web-tree-sitter is resolvable, 1 otherwise.");
}
