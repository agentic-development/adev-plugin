// lib/cli/prototype.mjs
//
// `adev prototype <subcommand>` — multi-mode CLI surface for the helpers
// invoked from `skills/prototype/SKILL.md`. Replaces inline-Node blocks
// that previously called `lib/prototype-args.mjs::{validateModuleName,
// discoverCharters}` and `lib/prototype-server.mjs::{startServer,
// ensureGitignore}` directly.
//
// Source spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// PR 8-9 (sweep finish): extracts 4 of the 6 prototype inline blocks.
// Line 115's `retrieveHeuristics` call uses the existing `adev heuristics
// retrieve --format text` verb; line 350's comment-only block is removed
// without a new verb.
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP. /adev:prototype is itself not a
//     lifecycle step; these are observational helpers inside the skill.
//
// Subcommands:
//   validate-module-name --module <name>
//                        → wraps lib/prototype-args.mjs::validateModuleName.
//                          Stdout: "true" or "false". Exit always 0.
//
//   discover-charters    → wraps lib/prototype-args.mjs::discoverCharters.
//                          Stdout: single JSON array (matches former inline
//                          block's `JSON.stringify(discoverCharters(...))`).
//                          Exit 0 on success; 1 if projectRoot is invalid.
//
//   start-server --dir <path>
//                        → wraps lib/prototype-server.mjs::startServer.
//                          Stdout: single JSON object `{port}` where port is
//                          the bound port number or null. Exit 0 on success
//                          (including null-port fallback); 1 only on
//                          argument errors.
//                          Note: the server is started, used, then the
//                          process exits — startServer's close() is not
//                          callable from a one-shot CLI. The skill prose
//                          documents that the server lifecycle is bound to
//                          the Claude Code session; this verb mirrors that.
//
//   ensure-gitignore     → wraps lib/prototype-server.mjs::ensureGitignore.
//                          Stdout: "OK" on success. Exit 0; 1 only on
//                          argument errors / unwritable target.

import { parseArgs } from "node:util";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { validateModuleName, discoverCharters } from "../prototype-args.mjs";
import { startServer, ensureGitignore } from "../prototype-server.mjs";

const USAGE =
  "usage: adev prototype <validate-module-name|discover-charters|start-server|ensure-gitignore> [flags]";

/**
 * Containment check (mirrors lib/cli/gate.mjs SEC-1): resolve `relPath`
 * against `absRoot` and reject anything that escapes the tree.
 */
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

  if (sub === "validate-module-name") {
    return runValidateModuleName(argv.slice(1));
  }

  if (sub === "discover-charters") {
    return runDiscoverCharters({ projectRoot, argv: argv.slice(1) });
  }

  if (sub === "start-server") {
    return runStartServer({ projectRoot, argv: argv.slice(1) });
  }

  if (sub === "ensure-gitignore") {
    return runEnsureGitignore({ projectRoot, argv: argv.slice(1) });
  }

  console.error(USAGE);
  console.error(`  unknown subcommand: ${sub}`);
  process.exit(1);
}

// ── validate-module-name ─────────────────────────────────────────────────

function runValidateModuleName(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { module: { type: "string" }, help: { type: "boolean" } },
      allowPositionals: false,
    });
  } catch {
    console.error("usage: adev prototype validate-module-name --module <name>");
    process.exit(1);
  }
  const v = parsed.values;
  if (v.help) {
    help();
    process.exit(0);
  }
  if (!v.module) {
    console.error("usage: adev prototype validate-module-name --module <name>");
    console.error("  missing --module");
    process.exit(1);
  }
  const ok = validateModuleName(v.module);
  console.log(ok ? "true" : "false");
  process.exit(0);
}

// ── discover-charters ────────────────────────────────────────────────────

function runDiscoverCharters({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { help: { type: "boolean" } },
      allowPositionals: false,
    });
  } catch {
    console.error("usage: adev prototype discover-charters");
    process.exit(1);
  }
  if (parsed.values.help) {
    help();
    process.exit(0);
  }
  const charters = discoverCharters(resolve(projectRoot));
  console.log(JSON.stringify(charters));
  process.exit(0);
}

// ── start-server ─────────────────────────────────────────────────────────

async function runStartServer({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        dir: { type: "string" },
        "port-only": { type: "boolean", default: false },
        help: { type: "boolean" },
      },
      allowPositionals: false,
    });
  } catch {
    console.error("usage: adev prototype start-server --dir <path> [--port-only]");
    process.exit(1);
  }
  const v = parsed.values;
  if (v.help) {
    help();
    process.exit(0);
  }
  if (!v.dir) {
    console.error("usage: adev prototype start-server --dir <path>");
    console.error("  missing --dir");
    process.exit(1);
  }

  // Containment is relaxed for --dir: prototype temp dirs may live under
  // os.tmpdir(), which is outside the project tree. Validate existence
  // and that it's a directory, but do not enforce project-root containment.
  const absDir = isAbsolute(v.dir) ? v.dir : resolve(projectRoot, v.dir);
  if (!existsSync(absDir)) {
    console.error(`directory not found: ${v.dir}`);
    process.exit(1);
  }
  let st;
  try {
    st = statSync(absDir);
  } catch {
    console.error(`directory not found: ${v.dir}`);
    process.exit(1);
  }
  if (!st.isDirectory()) {
    console.error(`not a directory: ${v.dir}`);
    process.exit(1);
  }

  const server = await startServer(absDir);
  if (!server) {
    console.log(JSON.stringify({ port: null }));
    process.exit(0);
  }

  // Print the port immediately, then keep the process alive so the
  // HTTP server keeps serving for the rest of the parent skill session.
  // This matches the prior inline-Node behavior: the Node process that
  // runs `startServer` stays alive because the HTTP server keeps the
  // event loop active. Callers that only need the port (e.g., a probe)
  // can pass --port-only to exit immediately after printing.
  //
  // Skills that want a detached server should background the call:
  //   adev prototype start-server --dir "$D" &
  console.log(JSON.stringify({ port: server.port }));

  if (v["port-only"]) {
    await server.close();
    process.exit(0);
  }

  // Block forever — process exits when the operator kills it or the
  // parent session closes.
  await new Promise(() => {});
}

// ── ensure-gitignore ─────────────────────────────────────────────────────

function runEnsureGitignore({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { help: { type: "boolean" } },
      allowPositionals: false,
    });
  } catch {
    console.error("usage: adev prototype ensure-gitignore");
    process.exit(1);
  }
  if (parsed.values.help) {
    help();
    process.exit(0);
  }
  try {
    ensureGitignore(resolve(projectRoot));
    console.log("OK");
    process.exit(0);
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }
}

export function help() {
  console.log("Usage: adev prototype <subcommand> [flags]");
  console.log("");
  console.log("Subcommands:");
  console.log("");
  console.log("  validate-module-name --module <name>");
  console.log("    Stdout: 'true' if name matches kebab-case rules, else 'false'.");
  console.log("    Exit:   0 always.");
  console.log("");
  console.log("  discover-charters");
  console.log("    Stdout: single JSON array of {module, title, path} for every");
  console.log("            charter found under .context-index/specs/features/.");
  console.log("    Exit:   0 on success; 1 on argument errors.");
  console.log("");
  console.log("  start-server --dir <path> [--port-only]");
  console.log("    Stdout: single JSON object {port: <number|null>}.");
  console.log("            Port range 3210–3219; null when all are unavailable");
  console.log("            or permission is denied.");
  console.log("    Without --port-only the process keeps running so the HTTP server");
  console.log("    stays alive (matches the inline-Node behavior). Background the");
  console.log("    call with `&` to detach. Pass --port-only to print the port and");
  console.log("    exit immediately (useful for tests / port probes).");
  console.log("    Exit:   0 on success (including port-null fallback); 1 on");
  console.log("            argument errors / missing --dir.");
  console.log("");
  console.log("  ensure-gitignore");
  console.log("    Add `.adev/` to the project's .gitignore (idempotent).");
  console.log("    Stdout: 'OK' on success.");
  console.log("    Exit:   0 on success; 1 if .gitignore is unwritable.");
}
