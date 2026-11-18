// The merged gate list is what /adev:validate Check 1, /adev:implement's
// integration gate and milestone ship criteria run. `kind`, `required` and
// `group` each change what a gate does (probabilistic gates are skipped,
// `required: false` caps severity at warning, e2e smoke runs before full), so
// the merge must carry them, and a probabilistic gate with no command — valid
// per the gates.yaml field table — must load rather than block materialize.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { cleanupTempDir, createTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";
import { mergeGates } from "../../lib/domains/merge-gates.mjs";
import { evaluateShipCriteria } from "../../lib/milestones.mjs";

const GATES = ".context-index/governance/gates.yaml";
const MANIFEST = ".context-index/manifest.yaml";

const FIXTURE = `materialized_at: 2026-11-17T00:00:00.000Z
gates:
  - id: lint
    command: ["npm", "run", "lint"]
    required: false
  - id: judge
    kind: probabilistic
    description: LLM review of UX copy
  - id: judge-cmd
    kind: probabilistic
    command: ["node", "judge.mjs"]
  - id: smoke
    command: ["npx", "playwright", "test"]
    tier: e2e
    group: smoke
`;

function cli(dir, args) {
  const r = spawnSync("node", [join(PLUGIN_ROOT, "cli", "index.mjs"), ...args], {
    cwd: dir,
    encoding: "utf8",
    timeout: 30_000,
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function withProject(fn) {
  return async () => {
    const dir = createTempDir();
    try {
      writeFixture(dir, MANIFEST, "project:\n  name: p\ndomain: software\n");
      writeFixture(dir, GATES, FIXTURE);
      await fn(dir);
    } finally {
      cleanupTempDir(dir);
    }
  };
}

describe("mergeGates carries the fields that change a gate's behaviour", () => {
  test("kind, required and group survive the merge; undeclared stays absent", () => {
    const { gates, warnings } = mergeGates(null, {
      gates: [
        { id: "a", command: ["x"], kind: "deterministic", required: false, group: "smoke" },
        { id: "b", command: ["y"] },
      ],
    });
    assert.deepEqual(warnings, []);
    assert.equal(gates[0].kind, "deterministic");
    assert.equal(gates[0].required, false);
    assert.equal(gates[0].group, "smoke");
    for (const k of ["kind", "required", "group"]) assert.ok(!(k in gates[1]), k);
  });

  test("an unknown kind warns and falls back to the deterministic default", () => {
    const { gates, warnings } = mergeGates(null, { gates: [{ id: "a", command: ["x"], kind: "fuzzy" }] });
    assert.equal(gates.length, 1);
    assert.ok(!("kind" in gates[0]));
    assert.equal(warnings[0].code, "INVALID_GATE_KIND");
  });

  test("a probabilistic gate without a command is kept; a deterministic one is still refused", () => {
    const { gates, warnings } = mergeGates(null, {
      gates: [
        { id: "judge", kind: "probabilistic" },
        { id: "broken" },
      ],
    });
    assert.deepEqual(gates.map((g) => g.id), ["judge"]);
    assert.ok(!("command" in gates[0]));
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, "INVALID_GATE");
  });
});

describe("consumers of the merged list", () => {
  test(
    "adev domain load-gates reports every declared field and no command_sha for a command-less gate",
    withProject((dir) => {
      const r = cli(dir, ["domain", "load-gates", "--module", "demo"]);
      assert.equal(r.status, 0, r.stderr);
      const { gates, warnings } = JSON.parse(r.stdout);
      assert.deepEqual(warnings, []);
      const byId = Object.fromEntries(gates.map((g) => [g.id, g]));
      assert.equal(byId.lint.required, false);
      assert.equal(byId.judge.kind, "probabilistic");
      assert.ok(!("command_sha" in byId.judge));
      assert.equal(byId["judge-cmd"].kind, "probabilistic");
      assert.equal(byId.smoke.group, "smoke");
    }),
  );

  test(
    "adev governance materialize accepts a probabilistic gate with no command",
    withProject((dir) => {
      const r = cli(dir, ["governance", "materialize", "--registry", "gates"]);
      assert.equal(r.status, 0, r.stderr);
    }),
  );

  test(
    "a ship criterion never executes a probabilistic gate, and fails when nothing runnable is left",
    withProject(async (dir) => {
      const ran = [];
      const runGate = async (gate) => {
        ran.push(gate.id);
        return { passed: true };
      };
      const evaluate = async (gates) => {
        const [result] = await evaluateShipCriteria(
          { name: "m", epic_id: "e", ship_criteria: [{ check: "gates_pass", gates }] },
          {},
          {},
          { projectRoot: dir, runGate },
        );
        return result;
      };

      const mixed = await evaluate(["lint", "judge-cmd"]);
      assert.deepEqual(ran, ["lint"]);
      assert.equal(mixed.passed, true);
      assert.ok(mixed.warnings.some((w) => w.includes("'judge-cmd' is probabilistic")));

      ran.length = 0;
      const only = await evaluate(["judge", "judge-cmd"]);
      assert.deepEqual(ran, []);
      assert.equal(only.passed, false);
      assert.match(only.detail, /no runnable gates/);
    }),
  );
});
