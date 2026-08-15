/**
 * Task 2 — the gate doctor and the gate CONSUMERS must be looking at the same
 * set of gates.
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 *
 * The defect, reproduced from the repo's own files at planning time:
 *
 *   .context-index/governance/gates.yaml declared `command: "npm test"` — a
 *   YAML string. `lib/domains/merge-gates.mjs::validateGate` requires an argv
 *   list and DROPS anything else with an INVALID_GATE warning, so
 *   `adev domain load-gates` returned a gate set with no `test` in it. Meanwhile
 *   `lib/gates/doctor.mjs::loadGates` reads the raw file and happily analysed
 *   `test`, pronouncing healthy a gate no consumer would ever run.
 *
 * One file, two consumers, two answers. These tests pin the two findings that
 * make that visible, and pin the shipped governance file's argv form so the
 * reproduction cannot come back.
 *
 * Fixtures are seeded the way production resolves them — a manifest, a custom
 * domain directory under .context-index/domains/, and a governance gates.yaml —
 * because the whole point is that the doctor walks the SAME path the consumers
 * walk. No injection option is used; `runGateDoctor` takes none.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runGateDoctor } from "../../lib/gates/doctor.mjs";
import { mergeGates } from "../../lib/domains/merge-gates.mjs";
import { parseYaml } from "../../lib/profiles/yaml.mjs";
import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const GATES_REL = ".context-index/governance/gates.yaml";

/**
 * Run the doctor statically against a fixture project, with the reentrancy
 * guard cleared so the suite behaves the same whether or not it is itself
 * running inside a gate.
 *
 * @param {string} dir Project root.
 */
function runDoctor(dir) {
  const env = { ...process.env };
  delete env.ADEV_GATE_DOCTOR;
  return runGateDoctor({ projectRoot: dir, gatesPath: GATES_REL, env });
}

/** All finding ids emitted by a report. */
function ids(report) {
  return report.findings.map((f) => f.id);
}

/**
 * Seed a CUSTOM domain that contributes one gate, plus the manifest that
 * selects it. `software` is a bundled domain and cannot be overridden
 * (`BUNDLED_OVERRIDE_BLOCKED`), so a custom domain is the only honest way to
 * put a domain-only gate in front of `loadDomainConfig`.
 *
 * @param {string} dir Project root.
 * @param {string} domain Custom domain name.
 * @param {string} gateId The gate the domain contributes.
 */
function seedCustomDomain(dir, domain, gateId) {
  writeFixture(dir, ".context-index/manifest.yaml", `project:\n  domain: ${domain}\n`);
  writeFixture(
    dir,
    `.context-index/domains/${domain}/gates.yaml`,
    `gates:\n  - id: ${gateId}\n    command: ["npm", "run", "x"]\n    tier: fast\n`,
  );
}

describe("gate-set divergence between the raw file and the merged consumer view", () => {
  it("reports divergence and names the id each side is missing", async () => {
    const dir = createTempDir();
    try {
      seedCustomDomain(dir, "fixture-domain", "domain-only");
      writeFixture(dir, GATES_REL, 'gates:\n  - id: proj-only\n    command: ["npm", "test"]\n');

      const report = await runDoctor(dir);
      const f = report.findings.find((x) => x.id === "gate-doctor/gate-set-divergence");

      assert.ok(f, `divergence must be reported; got ${JSON.stringify(ids(report))}`);
      assert.equal(f.severity, "warning");
      assert.match(
        f.message,
        /domain-only/,
        "a gate the consumers run but the raw file never mentions must be named",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("names a raw gate the consumers drop", async () => {
    const dir = createTempDir();
    try {
      // No domain overlay contributions of its own, so the only asymmetry is
      // the dropped string-form gate.
      seedCustomDomain(dir, "fixture-domain", "shared");
      writeFixture(
        dir,
        GATES_REL,
        'gates:\n  - id: shared\n    command: ["npm", "run", "x"]\n' +
          '  - id: dropped\n    command: "npm test"\n',
      );

      const report = await runDoctor(dir);
      const f = report.findings.find((x) => x.id === "gate-doctor/gate-set-divergence");

      assert.ok(f, `divergence must be reported; got ${JSON.stringify(ids(report))}`);
      assert.match(
        f.message,
        /dropped/,
        "a gate declared in gates.yaml that no consumer runs must be named",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("stays silent when both views agree", async () => {
    const dir = createTempDir();
    try {
      seedCustomDomain(dir, "fixture-domain", "agreed");
      writeFixture(dir, GATES_REL, 'gates:\n  - id: agreed\n    command: ["npm", "run", "x"]\n');

      const report = await runDoctor(dir);

      assert.equal(
        ids(report).includes("gate-doctor/gate-set-divergence"),
        false,
        `identical gate sets must not be reported as divergent; got ${JSON.stringify(ids(report))}`,
      );
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe("shell-form gate commands", () => {
  it("flags a shell-form command its consumers drop", async () => {
    const dir = createTempDir();
    try {
      writeFixture(dir, GATES_REL, 'gates:\n  - id: test\n    command: "npm test"\n');

      const report = await runDoctor(dir);
      const f = report.findings.find((x) => x.id === "gate-doctor/shell-form-command");

      assert.ok(f, `shell-form must be reported; got ${JSON.stringify(ids(report))}`);
      assert.equal(f.severity, "error");
      assert.equal(f.gate, "test");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("does not fire on an argv-list command", async () => {
    const dir = createTempDir();
    try {
      writeFixture(dir, GATES_REL, 'gates:\n  - id: test\n    command: ["npm", "test"]\n');

      const report = await runDoctor(dir);

      assert.equal(
        ids(report).includes("gate-doctor/shell-form-command"),
        false,
        "the argv form is the correct form and must never be flagged",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("does not fire on a gate that declares no command at all", async () => {
    const dir = createTempDir();
    try {
      writeFixture(dir, GATES_REL, 'gates:\n  - id: test\n    command: ""\n');

      const report = await runDoctor(dir);
      const idList = ids(report);

      assert.equal(
        idList.includes("gate-doctor/shell-form-command"),
        false,
        "an unwired sentinel is empty-command, not shell-form — one gate, one diagnosis",
      );
      assert.ok(idList.includes("gate-doctor/empty-command"));
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── The shipped file the reproduction came from ─────────────────────────────

describe("this repo's own governance gates.yaml", () => {
  it("declares every command in argv form, so no consumer drops it", () => {
    const doc = parseYaml(readFileSync(join(PLUGIN_ROOT, GATES_REL), "utf8"));
    assert.ok(Array.isArray(doc.gates) && doc.gates.length > 0, "the file must declare live gates");

    for (const gate of doc.gates) {
      assert.ok(
        Array.isArray(gate.command),
        `gate '${gate.id}' must declare command as an argv list, not a ${typeof gate.command}`,
      );
    }
  });

  it("survives mergeGates against the software starter with no INVALID_GATE warning", () => {
    const governance = parseYaml(readFileSync(join(PLUGIN_ROOT, GATES_REL), "utf8"));
    const domain = parseYaml(
      readFileSync(join(PLUGIN_ROOT, "templates/domains/software/gates.yaml"), "utf8"),
    );

    const { gates, warnings } = mergeGates(domain, governance);

    assert.deepEqual(
      warnings.filter((w) => w.code === "INVALID_GATE"),
      [],
      "no shipped gate may be silently dropped by the merge",
    );
    const test = gates.find((g) => g.id === "test");
    assert.ok(test, "the 'test' gate must reach the merged set every consumer reads");
    assert.deepEqual(test.command, ["npm", "test"]);
  });
});
