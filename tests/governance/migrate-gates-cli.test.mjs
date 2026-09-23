// tests/governance/migrate-gates-cli.test.mjs
//
// Contract tests for `adev governance migrate-gates` — repairs legacy
// shell-string `command:` values in governance/gates.yaml (dropped at load
// by `mergeGates`, SEC-2, INVALID_GATE) outside the `adev upgrade` path.
//
// Regression coverage: adev-plugin-gate-migration-unreachable-q6e9.
// `migrateLegacyGateCommands()` (cli/index.mjs) already ships this repair,
// but only from `cmdUpgrade` — a plugin-cache version bump never calls it,
// so a project that only ever upgraded that way stays broken forever. This
// verb is the same repair (lib/migrate-gate-commands.mjs), reachable on its
// own so a caller other than `adev upgrade` — starting with `/adev:init`'s
// diagnostic mode — can run it.

import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { cleanupTempDir, createTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";
import { stampMarker } from "../../lib/governance/registry-marker.mjs";

const GATES = ".context-index/governance/gates.yaml";

function runCli(dir, args) {
  const result = spawnSync("node", [join(PLUGIN_ROOT, "cli", "index.mjs"), ...args], {
    cwd: dir,
    encoding: "utf8",
    timeout: 30_000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function withDir(fn) {
  return async () => {
    const dir = createTempDir();
    try {
      await fn(dir);
    } finally {
      cleanupTempDir(dir);
    }
  };
}

const LEGACY_GATES = [
  "gates:",
  "  - id: python-tests",
  '    command: "npm test"',
  "    tier: fast",
  "  - id: deploy",
  '    command: "npm run build && npm run deploy"',
  "    tier: integration",
  "",
].join("\n");

describe("adev governance migrate-gates", () => {
  test(
    "reports no file and exits 0 when governance/gates.yaml is absent",
    withDir(async (dir) => {
      const r = runCli(dir, ["governance", "migrate-gates", "--json"]);
      assert.strictEqual(r.exitCode, 0, `stderr: ${r.stderr}`);
      const out = JSON.parse(r.stdout);
      assert.strictEqual(out.exists, false);
      assert.deepStrictEqual(out.migrated, []);
      assert.deepStrictEqual(out.skipped, []);
    }),
  );

  test(
    "migrates a safe shell-string command to argv and reports the unsafe one as skipped",
    withDir(async (dir) => {
      writeFixture(dir, GATES, stampMarker(LEGACY_GATES, "2026-08-15T00:00:00Z"));

      const r = runCli(dir, ["governance", "migrate-gates", "--json"]);
      assert.strictEqual(r.exitCode, 0, `stderr: ${r.stderr}`);
      const out = JSON.parse(r.stdout);

      assert.strictEqual(out.changed, true);
      assert.strictEqual(out.migrated.length, 1);
      assert.deepStrictEqual(out.migrated[0], { from: "npm test", to: ["npm", "test"] });
      assert.strictEqual(out.skipped.length, 1);
      assert.strictEqual(out.skipped[0].command, "npm run build && npm run deploy");
      assert.match(out.skipped[0].reason, /shell metacharacters/);

      const rewritten = readFileSync(join(dir, GATES), "utf8");
      assert.match(rewritten, /command:\s*\[npm, test\]/);
      // The unsafe command is left untouched, verbatim.
      assert.match(rewritten, /command:\s*"npm run build && npm run deploy"/);
      // The materialized_at marker survives the rewrite unchanged.
      assert.match(rewritten, /materialized_at: 2026-08-15T00:00:00Z/);
    }),
  );

  test(
    "--dry-run reports the change but writes nothing",
    withDir(async (dir) => {
      const before = stampMarker(LEGACY_GATES, "2026-08-15T00:00:00Z");
      writeFixture(dir, GATES, before);

      const r = runCli(dir, ["governance", "migrate-gates", "--dry-run", "--json"]);
      assert.strictEqual(r.exitCode, 0, `stderr: ${r.stderr}`);
      const out = JSON.parse(r.stdout);
      assert.strictEqual(out.dry_run, true);
      assert.strictEqual(out.changed, true);
      assert.strictEqual(out.migrated.length, 1);

      const untouched = readFileSync(join(dir, GATES), "utf8");
      assert.strictEqual(untouched, before);
    }),
  );

  test(
    "a gates.yaml already in argv form is a no-op",
    withDir(async (dir) => {
      const content = stampMarker(
        'gates:\n  - id: test\n    command: ["npm", "test"]\n    tier: fast\n',
        "2026-08-15T00:00:00Z",
      );
      writeFixture(dir, GATES, content);

      const r = runCli(dir, ["governance", "migrate-gates", "--json"]);
      assert.strictEqual(r.exitCode, 0, `stderr: ${r.stderr}`);
      const out = JSON.parse(r.stdout);
      assert.strictEqual(out.changed, false);
      assert.deepStrictEqual(out.migrated, []);
      assert.deepStrictEqual(out.skipped, []);

      assert.strictEqual(readFileSync(join(dir, GATES), "utf8"), content);
    }),
  );

  test(
    "non-JSON output names the migrated command",
    withDir(async (dir) => {
      writeFixture(dir, GATES, stampMarker(LEGACY_GATES, "2026-08-15T00:00:00Z"));
      const r = runCli(dir, ["governance", "migrate-gates"]);
      assert.strictEqual(r.exitCode, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /migrated gate command: "npm test" -> \[npm, test\]/);
      assert.match(r.stdout, /needs a shell and was left as-is/);
    }),
  );
});
