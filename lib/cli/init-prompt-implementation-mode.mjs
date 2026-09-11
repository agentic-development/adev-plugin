// lib/cli/init-prompt-implementation-mode.mjs
//
// `adev init prompt implementation-mode` — interactive prompt verb that lets
// a project pick its `implementation_mode` (tdd | test-required |
// agent-default), per skills/init/SKILL.md. Unlike session-capture's
// accept-on-enter pattern, this prompt requires an explicit typed choice
// (BEH-5) and surfaces a bypass warning before writing `agent-default`
// (BEH-6), since that mode disables the sensitive-path test-depth floor.
//
// Contract:
//   run({ projectRoot, argv, manifest, __scriptedInput }) — async, returns void
//   help() — prints usage to stdout
//
// Args:
//   --mode <tdd|test-required|agent-default>   Skip prompt; use this value
//
// Accepted interactive input is the full mode name, case-insensitively
// (e.g. "Agent-Default"). No abbreviations are accepted — the menu lists
// only 3 short, distinct names, so typing the full name is not onerous and
// avoids ambiguous-prefix bugs as a 4th mode is added later.
//
// Exit codes:
//   0  success
//   1  invalid argument (e.g., --mode other)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import readline from "node:readline";

import {
  IMPLEMENTATION_MODE_NAMES,
} from "../implementation-modes/constants.mjs";

const USAGE =
  "usage: adev init prompt implementation-mode [--mode tdd|test-required|agent-default]";

/**
 * Menu order (BEH-5): `agent-default` first, remaining modes alphabetical.
 * Derived from IMPLEMENTATION_MODE_NAMES (not a hardcoded literal array) so
 * a future 4th mode added to constants.mjs is picked up automatically (WR-2).
 *
 * @returns {string[]}
 */
function menuOrder() {
  return [...IMPLEMENTATION_MODE_NAMES].sort((a, b) => {
    if (a === "agent-default") return -1;
    if (b === "agent-default") return 1;
    return a.localeCompare(b);
  });
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Prompt for the top-level `implementation_mode` manifest key.");
  console.log("Writes the result back to .context-index/manifest.yaml.");
  console.log("");
  console.log(`Modes (in menu order): ${menuOrder().join(", ")}`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode" && i + 1 < argv.length) {
      out.mode = argv[++i];
    }
  }
  return out;
}

/**
 * Read the top-level `implementation_mode:` value from manifest.yaml, if
 * present. Pure string scan (no YAML dep) — a malformed manifest never
 * blocks the init prompt, the worst case is treating the key as absent.
 *
 * @param {string} manifestPath
 * @returns {string|null}
 */
function readImplementationMode(manifestPath) {
  if (!existsSync(manifestPath)) return null;
  let raw;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^implementation_mode:\s*(.*)$/);
    if (m) {
      return m[1].replace(/\s+#.*$/, "").trim();
    }
  }
  return null;
}

/**
 * Splice-write the top-level `implementation_mode:` line, preserving every
 * other line verbatim (BD-2/CON-2 — no full YAML reparse/reserialize).
 *
 * - If a top-level `implementation_mode:` line exists, replace only that line.
 * - Else if a top-level `risk_tier:` line exists, insert immediately after it.
 * - Else append at end-of-file.
 *
 * Idempotent: re-running with the same value produces byte-identical output.
 *
 * @param {string} manifestPath
 * @param {string} mode
 */
function writeImplementationMode(manifestPath, mode) {
  const raw = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : "";
  const lines = raw.length > 0 ? raw.split(/\r?\n/) : [];
  const newLine = `implementation_mode: ${mode}`;

  const existingIndex = lines.findIndex((l) => /^implementation_mode:\s*/.test(l));
  if (existingIndex >= 0) {
    if (lines[existingIndex] === newLine) return;
    lines[existingIndex] = newLine;
    writeFileSync(manifestPath, lines.join("\n"));
    return;
  }

  mkdirSync(dirname(manifestPath), { recursive: true });

  const riskTierIndex = lines.findIndex((l) => /^risk_tier:\s*/.test(l));
  if (riskTierIndex >= 0) {
    lines.splice(riskTierIndex + 1, 0, newLine);
    writeFileSync(manifestPath, lines.join("\n"));
    return;
  }

  const hadTrailingNewline = raw.endsWith("\n") || raw.length === 0;
  const body = raw.length > 0 && !hadTrailingNewline ? `${raw}\n${newLine}\n` : `${raw}${newLine}\n`;
  writeFileSync(manifestPath, body);
}

/** Thrown when the input stream closes (EOF/Ctrl-D) while a question is pending. */
class InputClosedError extends Error {
  constructor() {
    super("input closed before a valid choice was made");
    this.name = "InputClosedError";
  }
}

/**
 * Prompt for one line, pulling from the interface's own async line iterator
 * rather than calling `rl.question()`. On piped (non-TTY) stdin containing
 * more than one line, `rl.question()`'s one-shot 'line' listener only
 * reliably delivers the FIRST line — a second `.question()` call (this
 * module's re-prompt-on-blank loop, BEH-5) hangs forever waiting for a
 * 'line' event that already fired and was consumed. The async iterator does
 * not have this problem: it is the documented way to read successive lines,
 * and correctly serves one buffered line per call, TTY or piped alike. On
 * stream close (EOF/Ctrl-D) the iterator's `next()` resolves with
 * `done: true` instead of hanging, which this function turns into a clean
 * `InputClosedError` rejection.
 */
async function promptText(iterator, question) {
  process.stdout.write(question);
  const { value, done } = await iterator.next();
  if (done) throw new InputClosedError();
  return value;
}

function printSensitivePathFloorBypassWarning() {
  console.log("");
  console.log("  [sensitive-path-floor-bypass warning]");
  console.log("  Choosing agent-default means /adev:implement never calls");
  console.log("  `adev test-policy resolve` for this project. The pre-existing");
  console.log("  sensitive-path floor — which forces `thorough` test depth on");
  console.log("  auth, crypto, secrets, and CI paths, defined in");
  console.log("  .context-index/governance/sensitive-paths.yaml plus built-in");
  console.log("  defaults — will never fire while agent-default is active.");
  console.log("  This is a deliberate trade-off, not a bug.");
  console.log("");
}

/**
 * @param {{ projectRoot: string, argv: string[], manifest: any, __scriptedInput?: string[] }} ctx
 */
export async function run({ projectRoot, argv, manifest: _manifest, __scriptedInput }) {
  const args = parseArgs(argv);
  const order = menuOrder();

  if (args.mode !== undefined && !IMPLEMENTATION_MODE_NAMES.has(args.mode)) {
    console.error(`Error: mode must be one of: ${order.join(", ")}`);
    process.exit(1);
  }

  const manifestPath = join(projectRoot, ".context-index", "manifest.yaml");
  const existing = readImplementationMode(manifestPath);

  console.log("");
  console.log("  Implementation Mode");
  console.log("  ────────────────────");
  if (existing && IMPLEMENTATION_MODE_NAMES.has(existing)) {
    console.log(`  Stored: ${existing}`);
  } else {
    console.log("  Stored: (none)");
  }
  console.log("");
  order.forEach((name, i) => {
    console.log(`  ${i + 1}. ${name}`);
  });
  console.log("");

  let chosenMode = args.mode;

  if (chosenMode === undefined) {
    const scripted = Array.isArray(__scriptedInput) ? [...__scriptedInput] : null;
    const rl = scripted
      ? null
      : readline.createInterface({ input: process.stdin, output: process.stdout });
    const iterator = rl ? rl[Symbol.asyncIterator]() : null;

    const nextAnswer = async (question) => {
      if (scripted) {
        console.log(question);
        return (scripted.shift() ?? "").trim();
      }
      return (await promptText(iterator, question)).trim();
    };

    try {
      // BEH-5: no silent accept-on-enter — blank input is rejected and
      // re-prompted rather than treated as "use the default."
      for (;;) {
        const ans = await nextAnswer("  Choose implementation mode (type the name): ");
        if (ans === "") {
          console.log("  You must type a choice. Please enter one of: " + order.join(", "));
          continue;
        }
        const match = order.find(
          (name) => name === ans || name.toLowerCase() === ans.toLowerCase(),
        );
        if (!match) {
          console.log(
            `  Unrecognized choice "${ans}". You must type a choice matching one of: ${order.join(", ")}`,
          );
          continue;
        }
        chosenMode = match;
        break;
      }
    } catch (err) {
      if (err instanceof InputClosedError) {
        console.error("Error: input closed before a valid choice was made.");
        process.exit(1);
      }
      throw err;
    } finally {
      if (rl) rl.close();
    }
  }

  if (!IMPLEMENTATION_MODE_NAMES.has(chosenMode)) {
    console.error(`Error: mode must be one of: ${order.join(", ")}`);
    process.exit(1);
  }

  // BEH-6: warn BEFORE writing when the chosen mode bypasses the
  // sensitive-path test-depth floor.
  if (chosenMode === "agent-default") {
    printSensitivePathFloorBypassWarning();
  }

  writeImplementationMode(manifestPath, chosenMode);

  console.log("");
  console.log(`  Wrote: implementation_mode: ${chosenMode}`);
  console.log("");
}

export default { run, help };
