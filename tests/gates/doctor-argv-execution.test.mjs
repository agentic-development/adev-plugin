/**
 * Task 9 — argv-array gate commands are executed WITHOUT a shell.
 *
 * Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
 *
 * The doctor loads gates.yaml directly and, before this task, joined every
 * argv-array command back into one string with `normaliseCommand` and handed
 * it to `sh -c`. `normaliseCommand` single-quotes every metacharacter-bearing
 * token, so no injection was reachable — but the spec's stated property ("no
 * contributed command is ever passed to a shell") rested entirely on that
 * quoting function. These tests pin the STRUCTURAL property instead: an
 * argv-array command is spawned as `argv[0]` + `argv.slice(1)` with
 * `shell: false`, and a string command keeps the `sh -c` path that project
 * authors own.
 *
 * The load-bearing discriminator is the shell BUILTIN: `exit 0` succeeds under
 * `sh -c` and is unresolvable as a binary under `shell: false`. Quoting alone
 * cannot produce that difference, so the first test cannot pass on the old
 * code path.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { runGateDoctor, normaliseCommand } from "../../lib/gates/doctor.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const GATES_REL = ".context-index/governance/gates.yaml";

/**
 * Write a gates.yaml (plus the minimal package.json a real project carries)
 * into a temp dir.
 *
 * @param {string} dir Temp dir root.
 * @param {Array<{id: string, command: string|string[], kind?: string}>} gates
 * @returns {string} Absolute path to the written gates.yaml.
 */
function gatesFixture(dir, gates) {
  const lines = ["gates:"];
  for (const gate of gates) {
    lines.push(`  - id: ${gate.id}`);
    lines.push(`    kind: ${gate.kind ?? "deterministic"}`);
    if (Array.isArray(gate.command)) {
      lines.push("    command:");
      for (const token of gate.command) lines.push(`      - ${JSON.stringify(token)}`);
    } else {
      lines.push(`    command: ${JSON.stringify(gate.command)}`);
    }
  }
  writeFixture(dir, GATES_REL, `${lines.join("\n")}\n`);
  writeFixture(
    dir,
    "package.json",
    `${JSON.stringify({ name: "argv-exec-fixture", version: "0.0.0", private: true }, null, 2)}\n`,
  );
  return join(dir, GATES_REL);
}

/**
 * Run the doctor against a fixture project with the reentrancy guard cleared,
 * so the suite still executes when it is itself run from inside a gate.
 *
 * @param {string} dir
 * @param {{ execute?: boolean }} [opts]
 */
function runDoctor(dir, opts = {}) {
  const env = { ...process.env };
  delete env.ADEV_GATE_DOCTOR;
  return runGateDoctor({
    projectRoot: dir,
    execute: opts.execute ?? true,
    timeoutMs: 20_000,
    env,
  });
}

/** Finding ids scoped to one gate. */
function idsFor(report, gateId) {
  return report.findings.filter((f) => f.gate === gateId).map((f) => f.id);
}

describe("argv-array gate commands are executed without a shell", () => {
  it("an argv-array command never reaches a shell — substitution stays literal", async () => {
    const dir = createTempDir();
    try {
      const marker = join(dir, "PWNED");
      const observed = join(dir, "observed.json");
      writeFixture(
        dir,
        "probe.cjs",
        `require("fs").writeFileSync(${JSON.stringify(observed)}, ` +
          `JSON.stringify(process.argv.slice(2)));\n`,
      );

      gatesFixture(dir, [
        // The last element is a command substitution. Under `sh -c` a shell
        // would be in a position to expand it; as an argv element it is inert.
        { id: "substitution", command: ["node", join(dir, "probe.cjs"), `$(touch ${marker})`] },
        // `exit` is a shell builtin with no binary anywhere on PATH: it runs
        // under `sh -c` and is ENOENT under `shell: false`. This is the
        // structural discriminator — quoting cannot produce this difference.
        { id: "builtin", command: ["exit", "0"] },
      ]);

      const report = await runDoctor(dir);

      // 1. The substitution never executed.
      assert.equal(existsSync(marker), false, "the command substitution must never execute");

      // 2. …and the gate genuinely ran, so (1) is not a vacuous pass.
      assert.equal(existsSync(observed), true, "the argv gate must actually have been spawned");
      assert.deepEqual(
        JSON.parse(readFileSync(observed, "utf8")),
        [`$(touch ${marker})`],
        "the substitution must reach the child as one literal argv element",
      );
      assert.equal(
        idsFor(report, "substitution").includes("gate-doctor/gate-not-executable"),
        false,
        "the argv gate must be executable",
      );

      // 3. The structural property: no shell interpreted the argv, so a shell
      //    builtin is not a runnable command.
      assert.equal(
        idsFor(report, "builtin").includes("gate-doctor/gate-not-executable"),
        true,
        "an argv gate naming a shell builtin must fail to execute — proving shell: false",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("a string command keeps the existing sh -c path", async () => {
    const dir = createTempDir();
    try {
      gatesFixture(dir, [{ id: "string-gate", command: "exit 0" }]);

      const report = await runDoctor(dir);
      const ids = idsFor(report, "string-gate");

      assert.equal(
        ids.includes("gate-doctor/gate-not-executable"),
        false,
        "a string command must still be interpreted by sh, where `exit` is a builtin",
      );
      assert.equal(
        ids.includes("gate-doctor/gate-failed"),
        false,
        "the string gate exits zero under sh -c",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("the shipped gates.yaml string form still runs", async () => {
    const dir = createTempDir();
    try {
      gatesFixture(dir, [{ id: "shipped-string", command: "true" }]);

      const report = await runDoctor(dir);

      assert.equal(typeof report, "object", "the doctor must return a report envelope");
      assert.equal(Array.isArray(report.findings), true, "the envelope must carry findings");
      assert.equal(
        idsFor(report, "shipped-string").includes("gate-doctor/gate-failed"),
        false,
        "`true` must run and exit zero",
      );
      assert.equal(
        idsFor(report, "shipped-string").includes("gate-doctor/gate-not-executable"),
        false,
        "`true` must be executable through sh -c",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("an argv gate whose binary does not exist reports gate-not-executable", async () => {
    const dir = createTempDir();
    try {
      gatesFixture(dir, [{ id: "missing-bin", command: ["adev-no-such-binary-xyz", "--check"] }]);

      const report = await runDoctor(dir);

      assert.equal(
        idsFor(report, "missing-bin").includes("gate-doctor/gate-not-executable"),
        true,
        "ENOENT under shell: false must still land on gate-not-executable",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("an argv gate that exits non-zero reports gate-failed", async () => {
    const dir = createTempDir();
    try {
      writeFixture(dir, "fail.cjs", "process.exitCode = 3;\n");
      gatesFixture(dir, [{ id: "failing", command: ["node", join(dir, "fail.cjs")] }]);

      const report = await runDoctor(dir);
      const ids = idsFor(report, "failing");

      assert.equal(ids.includes("gate-doctor/gate-failed"), true, "a non-zero exit is gate-failed");
      assert.equal(
        ids.includes("gate-doctor/gate-not-executable"),
        false,
        "a gate that ran and exited 3 is executable",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("an argv gate still receives the same static analysis", async () => {
    const dir = createTempDir();
    try {
      gatesFixture(dir, [{ id: "templated", command: ["npm", "run", "{{TEST_COMMAND}}"] }]);

      const report = await runDoctor(dir);
      const ids = idsFor(report, "templated");

      assert.equal(
        ids.includes("gate-doctor/unsubstituted-placeholder"),
        true,
        "placeholder detection must still see argv elements — the static section is unchanged",
      );
      assert.equal(
        ids.includes("gate-doctor/gate-failed"),
        false,
        "a placeholder gate is never spawned",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("normaliseCommand is still exported and still quotes metacharacters", () => {
    assert.equal(normaliseCommand(["touch", "a b"]), "touch 'a b'");
    assert.equal(normaliseCommand(["echo", "$(id -u)"]), "echo '$(id -u)'");
    assert.equal(normaliseCommand("npm test"), "npm test");
  });
});
