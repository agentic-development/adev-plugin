// Reads `adev implement --help`, so docs tests compare the reference against
// the contract the CLI prints instead of a copy of it.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

export function implementHelp() {
  return execFileSync(process.execPath, [join(PLUGIN_ROOT, "cli/index.mjs"), "implement", "--help"], {
    cwd: PLUGIN_ROOT,
    encoding: "utf8",
  });
}

/** The codes listed under `Exit codes (<subverb>):`. */
export function helpExitCodes(help, subverb) {
  const block = help.split(`Exit codes (${subverb}):\n`)[1];
  assert.ok(block, `implement --help has no exit-code block for ${subverb}`);
  const body = block.split(/\n\s*\n/)[0];
  return [...new Set(body.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g) ?? [])];
}

/** The subverb's synopsis, up to the first blank line. */
export function helpSynopsis(help, subverb) {
  const start = help.indexOf(`  ${subverb} `);
  assert.ok(start !== -1, `implement --help has no synopsis for ${subverb}`);
  return help.slice(start).split(/\n\s*\n/)[0];
}

/** The flags in the subverb's synopsis. */
export function helpSynopsisFlags(help, subverb) {
  return [...new Set(helpSynopsis(help, subverb).match(/--[a-z][a-z-]*/g))];
}

/** The optional `[--flag ...]` groups in the subverb's synopsis, verbatim. */
export function helpOptionalGroups(help, subverb) {
  return [...new Set(helpSynopsis(help, subverb).match(/\[--[^\]]+\]/g) ?? [])];
}
