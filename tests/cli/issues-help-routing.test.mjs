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

describe("adev issues --help routing", () => {
  const cases = [
    ["create", /^usage: adev issues create <title>/m],
    ["stale", /^usage: adev issues stale \[--json\]/m],
    ["claim", /^usage: adev issues claim <id> --owner <name>/m],
    ["migrate", /^Usage: adev issues migrate --to <backend>/m],
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

  it("keeps the short-circuit for verbs that do not dispatch subcommands", () => {
    // `route` is a plain new-contract verb: cli/index.mjs must still answer
    // its --help directly, so the opt-out stays scoped to dispatchers.
    const r = run(["route", "--help"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /route/i);
  });
});
