// lib/cli/skill-ext.mjs
//
// adev skill-ext load --skill <name>
//
// Query primitive: reads skill extension content from two layers under
// .context-index/skill-extensions/ and writes the concatenated result to stdout.
//
// Layers (in order):
//   1. Extension layers: _<ext-name>/<skill>.md (lexicographic by ext name)
//   2. Project layer:    <skill>.md
//
// If no non-empty content is found, outputs __NONE__ and exits 0.
// Exit codes:
//   0  success (content or __NONE__)
//   1  argument or I/O error
//
// NOTE: skill-ext.mjs does NOT export LIFECYCLE_STEP — it is a query primitive,
// not a lifecycle-bound step. (CON-1 from plan review.)

import { parseArgs } from "node:util";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";

const SKILL_NAME_RE = /^[a-zA-Z0-9_-]+$/;

const USAGE = "usage: adev skill-ext load --skill <name>";

export async function run({ projectRoot, argv }) {
  // sub-verb dispatch: only "load" is supported
  const sub = argv[0];

  if (sub === "--help" || sub === "-h" || !sub) {
    help();
    process.exit(sub ? 0 : 1);
  }

  if (sub !== "load") {
    process.stderr.write(`unknown sub-verb: ${sub}\n${USAGE}\n`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        skill: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: false,
    });
  } catch {
    process.stderr.write(`${USAGE}\n`);
    process.exit(1);
  }

  if (parsed.values.help) {
    help();
    process.exit(0);
  }

  const skillName = parsed.values.skill;
  if (!skillName) {
    process.stderr.write(`MISSING_SKILL_ARG\n${USAGE}\n`);
    process.exit(1);
  }

  // Validate skill name — reject path traversal characters (SEC-1 / CON-1)
  if (!SKILL_NAME_RE.test(skillName)) {
    process.stderr.write(`INVALID_SKILL_NAME: skill name must match [a-zA-Z0-9_-]+\n`);
    process.exit(1);
  }

  // Locate the extensions directory
  const absRoot = resolve(projectRoot);
  const extBase = join(absRoot, ".context-index", "skill-extensions");

  if (!existsSync(extBase)) {
    // .context-index/skill-extensions doesn't exist — verify .context-index exists
    const contextIndex = join(absRoot, ".context-index");
    if (!existsSync(contextIndex)) {
      process.stderr.write(`NO_CONTEXT_INDEX: .context-index/ not found at project root\n`);
      process.exit(1);
    }
    // .context-index exists but skill-extensions dir doesn't — no content
    process.stdout.write("__NONE__");
    process.exit(0);
  }

  // Resolve the canonical allowed base path for containment checks (SEC-1)
  let allowedBase;
  try {
    allowedBase = realpathSync(extBase);
  } catch {
    process.stderr.write(`READ_ERROR: could not resolve extension directory\n`);
    process.exit(1);
  }

  // Helper: safely read a file with containment check
  function safeRead(candidatePath) {
    let realPath;
    try {
      realPath = realpathSync(candidatePath);
    } catch {
      // File doesn't exist (not a real-path error for missing files)
      return null;
    }
    // Containment check: resolved path must be under allowedBase
    if (!realPath.startsWith(allowedBase + sep) && realPath !== allowedBase) {
      process.stderr.write(`READ_ERROR: resolved path escapes extension directory (symlink escape)\n`);
      process.exit(1);
    }
    try {
      const content = readFileSync(candidatePath, "utf8");
      return content.length > 0 ? content : null;
    } catch (err) {
      process.stderr.write(`READ_ERROR: could not read ${candidatePath}: ${err.message}\n`);
      process.exit(1);
    }
  }

  const chunks = [];

  // Step 1: Read extension layers (_<ext-name>/) in lexicographic order
  let entries;
  try {
    entries = readdirSync(extBase);
  } catch (err) {
    process.stderr.write(`READ_ERROR: could not list extension directory: ${err.message}\n`);
    process.exit(1);
  }

  const extDirs = entries
    .filter((name) => name.startsWith("_"))
    .sort(); // lexicographic order

  for (const extDir of extDirs) {
    const extPath = join(extBase, extDir);
    let stat;
    try {
      stat = statSync(extPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const skillFilePath = join(extPath, `${skillName}.md`);
    if (!existsSync(skillFilePath)) continue;

    const content = safeRead(skillFilePath);
    if (content !== null) {
      chunks.push(content);
    }
  }

  // Step 2: Read project-level file (<skill>.md)
  const projectFilePath = join(extBase, `${skillName}.md`);
  if (existsSync(projectFilePath)) {
    const content = safeRead(projectFilePath);
    if (content !== null) {
      chunks.push(content);
    }
  }

  // Output result
  if (chunks.length === 0) {
    process.stdout.write("__NONE__");
  } else {
    // SA-1: join with \n\n (one blank line between chunks)
    process.stdout.write(chunks.join("\n\n"));
  }
  process.exit(0);
}

export function help() {
  console.log("Usage: adev skill-ext load --skill <name>");
  console.log("");
  console.log("Read skill extension content from .context-index/skill-extensions/");
  console.log("and write concatenated result to stdout.");
  console.log("");
  console.log("Layers (in order):");
  console.log("  1. Extension layers: _<ext-name>/<skill>.md (sorted lexicographically)");
  console.log("  2. Project layer:    <skill>.md");
  console.log("");
  console.log("Output:");
  console.log("  Concatenated content (blank line between layers), or __NONE__ if no content.");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  success (content or __NONE__)");
  console.log("  1  argument or I/O error");
  console.log("");
  console.log("Error codes (written to stderr):");
  console.log("  MISSING_SKILL_ARG    --skill argument not provided");
  console.log("  INVALID_SKILL_NAME   skill name contains invalid characters");
  console.log("  NO_CONTEXT_INDEX     .context-index/ not found at project root");
  console.log("  READ_ERROR           file present but unreadable (permissions, symlink escape)");
}
