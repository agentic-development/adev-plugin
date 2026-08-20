/**
 * `adev issues <sub> --help` routes to the SUB-verb's help, not the parent's.
 *
 * cli/index.mjs short-circuits on `--help` appearing anywhere in a verb's args
 * and calls the module's own `help()`. For a parent dispatcher that swallowed
 * every sub-verb's help: `adev issues create --help` printed the subcommand
 * list, so create's flags were unreachable from the CLI. Dispatchers now opt
 * out with `dispatchesSubcommandHelp` and route help themselves.
 *
 * Covers:
 * - each sub-verb's --help prints that sub-verb's usage, exit 0
 * - bare `adev issues --help` still prints the parent help, exit 0
 * - bare `adev issues` (no subcommand) remains a usage error, exit 1
 * - the opt-out is scoped: a non-dispatcher verb keeps the short-circuit
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../cli/index.mjs", import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

/** The parent dispatcher's own first line — never valid as a sub-verb's help. */
const PARENT_USAGE = /^Usage: adev issues <subcommand> \[args\]$/m;

/**
 * The sub-verbs the parent `help()` advertises, read back off the CLI itself.
 *
 * Parsing the printed `Subcommands:` block keeps the coverage below exhaustive
 * without anyone remembering to extend a hand-maintained list: a tenth sub-verb
 * that lands with its help unwired fails here on the day it lands.
 */
function listedSubcommands() {
  const r = run(["issues", "--help"]);
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split("\n");
  const start = lines.indexOf("Subcommands:");
  assert.notEqual(start, -1, "parent help printed no `Subcommands:` block");
  const subs = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^ {2}(\S+) {2,}\S/.exec(line);
    if (!m) break; // the block ends at the first blank/non-entry line
    subs.push(m[1]);
  }
  return subs;
}

describe("adev issues --help routing", () => {
  const cases = [
    ["create", /^usage: adev issues create <title>/m],
    ["stale", /^usage: adev issues stale \[--json\]/m],
    ["claim", /^usage: adev issues claim <id> --owner <name>/m],
    ["migrate", /^Usage: adev issues migrate --to <backend>/m],
    ["board", /^usage: adev issues board/m],
    ["epic", /^usage: adev issues epic/m],
    ["list", /^usage: adev issues list/m],
    ["ready", /^usage: adev issues ready/m],
    ["update", /^usage: adev issues update <id>/m],
    ["close", /^usage: adev issues close <id>/m],
    ["dep", /^usage: adev issues dep <id>/m],
    ["release", /^usage: adev issues release <id>/m],
  ];

  for (const [sub, pattern] of cases) {
    it(`\`issues ${sub} --help\` prints ${sub}'s own usage`, () => {
      const r = run(["issues", sub, "--help"]);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, pattern);
      // The tell for the old bug: the parent's subcommand list.
      assert.doesNotMatch(r.stdout, /^Subcommands:$/m);
    });
  }

  // `milestone` is not in the table above because that loop asserts the output
  // carries no `Subcommands:` heading — the tell for the parent list. Milestone
  // is itself a dispatcher, so it legitimately prints a `Subcommands:` block of
  // its own. The discriminator here is the PARENT's usage line.
  it("`issues milestone --help` prints milestone's own usage, not the parent's", () => {
    const r = run(["issues", "milestone", "--help"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^usage: adev issues milestone <create\|list\|ship\|defer>/m);
    assert.doesNotMatch(r.stdout, PARENT_USAGE);
  });

  // Second level: `issues milestone <sub> --help` must reach the leaf usage,
  // never milestone's own subcommand list. This is why the `milestone` branch
  // in lib/cli/issues.mjs passes `--help` through instead of intercepting it.
  const milestoneCases = [
    ["create", /^usage: adev issues milestone create <name>/m],
    ["list", /^usage: adev issues milestone list$/m],
    ["ship", /^usage: adev issues milestone ship <name>/m],
    ["defer", /^usage: adev issues milestone defer <name>/m],
  ];

  for (const [sub, pattern] of milestoneCases) {
    it(`\`issues milestone ${sub} --help\` prints ${sub}'s own usage`, () => {
      const r = run(["issues", "milestone", sub, "--help"]);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, pattern);
      // Neither the parent list nor milestone's own subcommand list.
      assert.doesNotMatch(r.stdout, PARENT_USAGE);
      assert.doesNotMatch(r.stdout, /^Subcommands:$/m);
    });
  }

  it("bare `issues --help` prints the parent help and succeeds", () => {
    const r = run(["issues", "--help"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^Usage: adev issues <subcommand>/m);
    assert.match(r.stdout, /^Subcommands:$/m);
  });

  it("bare `issues` with no subcommand is still a usage error", () => {
    const r = run(["issues"]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^Subcommands:$/m);
  });

  it("every advertised sub-verb answers --help with its own usage", () => {
    const subs = listedSubcommands();
    // Sanity: the block parsed, and it is the whole dispatch table.
    assert.ok(subs.length >= 13, `parsed only ${subs.length} subcommands: ${subs}`);

    // `migrate` predates the `usage:` convention and prints `Usage:` — a real,
    // deliberate difference in that one verb's help, exempted by name rather
    // than by loosening the regex for the other twelve. Its exact string is
    // still pinned by the `cases` table above.
    const capitalisedUsage = new Set(["migrate"]);

    for (const sub of subs) {
      const r = run(["issues", sub, "--help"]);
      assert.equal(r.status, 0, `\`issues ${sub} --help\` exited ${r.status}: ${r.stderr}`);
      const usage = capitalisedUsage.has(sub)
        ? new RegExp(`^Usage: adev issues ${sub}\\b`, "m")
        : new RegExp(`^usage: adev issues ${sub}\\b`, "m");
      assert.match(r.stdout, usage, `\`issues ${sub} --help\` printed no usage line`);
      // Never the parent's own help — the tell for an unwired sub-verb.
      assert.doesNotMatch(
        r.stdout,
        PARENT_USAGE,
        `\`issues ${sub} --help\` fell through to the parent help`,
      );
    }
  });

  it("keeps the short-circuit for verbs that do not dispatch subcommands", () => {
    // `route` is a plain new-contract verb: cli/index.mjs must still answer
    // its --help directly, so the opt-out stays scoped to dispatchers.
    const r = run(["route", "--help"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /route/i);
  });
});
