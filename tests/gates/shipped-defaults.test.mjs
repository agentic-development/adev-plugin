/**
 * Task 7 — shipped-defaults parity and a doctor-clean fresh scaffold.
 *
 * Spec: .context-index/specs/features/unified-gates/tiered-gates-default.spec.md
 *
 * Tasks 1-6 each test their own file. This file tests the COMPOSITION: the
 * exact bytes a scaffolded project receives. The spec's "Systemic Pattern"
 * section names the failure this closes — *no test exercises the artifact a
 * user actually receives* — so every fixture here is READ FROM DISK and the
 * temp-dir scaffold is built by COPYING shipped files. A hand-written inline
 * gate fixture in this file would defeat its entire purpose.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseYaml } from "../../lib/profiles/yaml.mjs";
import { mergeGates } from "../../lib/domains/merge-gates.mjs";
import { runGateDoctor } from "../../lib/gates/doctor.mjs";
import { PLUGIN_ROOT, createTempDir, cleanupTempDir } from "../helpers.mjs";

/** Every shipped surface that declares gate commands, as repo-relative paths. */
const GATE_SURFACES = [
  "templates/gates-template.yaml",
  "templates/domains/software/gates.yaml",
  "extensions/data-engineering/domain/gates.yaml",
  "extensions/process-automation/domain/gates.yaml",
];

/** The three domain starters a scaffold can be initialised from. */
const STARTERS = [
  ["software", "templates/domains/software/gates.yaml"],
  ["data-engineering", "extensions/data-engineering/domain/gates.yaml"],
  ["process-automation", "extensions/process-automation/domain/gates.yaml"],
];

const TEMPLATE_REL = "templates/gates-template.yaml";
const GATES_REL = ".context-index/governance/gates.yaml";

/**
 * The argv commands /adev:init Step 7a seeds into the template's two live
 * tiers (skills/init/SKILL.md, Step 7a: Foundation files).
 */
const SEEDED_COMMANDS = [
  ["npm", "test"],
  ["npm", "run", "--if-present", "test:integration"],
];

/** Read a shipped file from the repo, failing loudly when it is absent. */
function readShipped(relPath) {
  const abs = join(PLUGIN_ROOT, relPath);
  assert.ok(existsSync(abs), `shipped surface must exist on disk: ${relPath}`);
  const text = readFileSync(abs, "utf8");
  assert.ok(text.length > 0, `shipped surface must not be empty: ${relPath}`);
  return text;
}

/** All finding ids emitted by a doctor report. */
function ids(report) {
  return report.findings.map((f) => f.id);
}

/**
 * Build a temp-dir project mirroring a fresh /adev:init scaffold by COPYING
 * the shipped template — never by authoring YAML inline.
 *
 * @param {string} dir Temp dir root.
 * @param {boolean} seed When true, replace both `command: ""` sentinels with
 *   the argv commands /adev:init Step 7a specifies. When false, the template
 *   is left exactly as `cpSync` delivered it.
 * @returns {string} Absolute path to the scaffolded gates.yaml.
 */
function scaffoldFreshProject(dir, seed) {
  mkdirSync(join(dir, ".context-index", "governance"), { recursive: true });
  const gatesAbs = join(dir, GATES_REL);
  copyFileSync(join(PLUGIN_ROOT, TEMPLATE_REL), gatesAbs);

  if (seed) {
    const original = readFileSync(gatesAbs, "utf8");
    // Only the two LIVE entries are indented exactly four spaces; every
    // commented example is prefixed with `  # `.
    const sentinel = /^ {4}command: ""[^\n]*$/gm;
    const hits = original.match(sentinel) ?? [];
    assert.equal(hits.length, 2, "the shipped template must carry exactly two live sentinels");

    let i = 0;
    const seeded = original.replace(sentinel, () => {
      const argv = SEEDED_COMMANDS[i++];
      return `    command: [${argv.join(", ")}]`;
    });
    writeFileSync(gatesAbs, seeded);
  }

  // A minimal package.json — a fresh scaffold has one; it must not declare
  // scripts the doctor could follow into.
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "fresh-scaffold", version: "0.0.0", private: true }, null, 2)}\n`,
  );

  return gatesAbs;
}

// ── Part 1: argv parity sweep across every shipped surface ──────────────────

describe("shipped gate surfaces are argv-form everywhere", () => {
  it("declares a non-empty surface list", () => {
    assert.ok(GATE_SURFACES.length > 0, "the surface list must not be empty — a vacuous sweep passes trivially");
    assert.equal(GATE_SURFACES.length, 4, "all four shipped gate surfaces must be swept");
  });

  for (const rel of GATE_SURFACES) {
    it(`${rel}: no command value is a non-empty quoted string`, () => {
      const content = readShipped(rel);

      // Vacuity guard: a file with no `command:` at all would pass the
      // offender check for the wrong reason.
      const declared = content.match(/command:/g) ?? [];
      assert.ok(
        declared.length > 0,
        `${rel} must declare at least one command — matching zero commands is a vacuous pass`,
      );

      // The same matcher Task 3 landed in tests/templates/gates-template.test.mjs
      // (commit d4513eab), copied verbatim rather than re-derived: live YAML and
      // commented examples alike, with the `""` unwired sentinel as the one
      // permitted quoted value.
      const quoted = /command:\s*(["'])((?:(?!\1).)*)\1/g;
      const offenders = [];
      for (const match of content.matchAll(quoted)) {
        if (match[2] !== "") offenders.push(match[0]);
      }
      assert.deepEqual(
        offenders,
        [],
        `every command in ${rel} must be argv form; string-form commands found: ${offenders.join(", ")}`,
      );
    });
  }
});

// ── Part 2: no starter ships a fast-only tier map ───────────────────────────

describe("every domain starter declares an integration tier", () => {
  for (const [name, rel] of STARTERS) {
    it(`${name} yields at least one tier: integration gate after merge`, () => {
      const doc = parseYaml(readShipped(rel));
      assert.ok(Array.isArray(doc.gates), `${rel} must declare a live gates array`);

      const { gates } = mergeGates(doc, null);
      assert.ok(gates.length > 0, `${rel} must survive the merge with at least one gate`);
      assert.ok(
        gates.some((g) => g.tier === "integration"),
        `${name} ships a fast-only tier map — the integration tier would be unreachable by default`,
      );
    });
  }
});

// ── Part 3: doctor-clean on a fresh scaffold ────────────────────────────────

describe("gate doctor on a fresh scaffold", () => {
  it("an init-seeded argv scaffold reports zero errors and only tolerated warnings", async () => {
    const dir = createTempDir();
    try {
      const gatesAbs = scaffoldFreshProject(dir, true);

      // Pin the seeded shape rather than trusting the regex: a mis-targeted
      // replacement would leave the doctor assertions passing for the wrong reason.
      const seededDoc = parseYaml(readFileSync(gatesAbs, "utf8"));
      const byId = new Map(seededDoc.gates.map((g) => [g.id, g]));
      assert.deepEqual(byId.get("test").command, ["npm", "test"]);
      assert.deepEqual(byId.get("integration-test").command, [
        "npm",
        "run",
        "--if-present",
        "test:integration",
      ]);

      // projectRoot and gatesPath are passed EXPLICITLY. Relying on cwd would
      // point the doctor at this repo's real governance/gates.yaml and the
      // test would pass for the wrong reason.
      const report = await runGateDoctor({ projectRoot: dir, gatesPath: GATES_REL });

      // The acceptance bar is exit 0 / zero ERROR-severity findings, not zero findings.
      assert.equal(
        report.summary.errors,
        0,
        `a fresh seeded scaffold must be doctor-clean; got: ${JSON.stringify(report.findings)}`,
      );
      assert.equal(report.findings.filter((f) => f.severity === "error").length, 0);

      // The regression Task 1 closed: an argv-form command is diagnosable, so
      // neither seeded gate may be reported as command-less.
      const emptyCommand = report.findings.filter((f) => f.id === "gate-doctor/empty-command");
      assert.deepEqual(
        emptyCommand,
        [],
        "a seeded argv gate must never be reported as declaring no command",
      );

      // Tolerated BY NAME: a fresh scaffold has no CI config, and neither
      // `npm test` nor `npm run --if-present test:integration` exposes an
      // identifiable runner. Asserted as a closed set so an unexpected
      // warning still fails.
      const tolerated = new Set(["gate-doctor/ci-config-missing", "gate-doctor/runner-unknown"]);
      for (const id of ids(report)) {
        assert.ok(tolerated.has(id), `unexpected finding on a fresh seeded scaffold: ${id}`);
      }
      assert.ok(
        ids(report).includes("gate-doctor/ci-config-missing"),
        "a scaffold with no CI config must still say so",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("the unseeded template copied verbatim reports zero errors and named sentinel warnings", async () => {
    const dir = createTempDir();
    try {
      scaffoldFreshProject(dir, false);

      const report = await runGateDoctor({ projectRoot: dir, gatesPath: GATES_REL });

      assert.equal(
        report.summary.errors,
        0,
        `an unwired scaffold is not a broken scaffold; got: ${JSON.stringify(report.findings)}`,
      );
      assert.equal(report.findings.filter((f) => f.severity === "error").length, 0);

      // Exactly — a multiset, because `empty-command` must appear once per
      // unwired tier. Set membership would hide a dropped tier.
      assert.deepEqual(
        ids(report).slice().sort(),
        [
          "gate-doctor/ci-config-missing",
          "gate-doctor/empty-command",
          "gate-doctor/empty-command",
        ],
        `unexpected finding set on an unseeded scaffold: ${JSON.stringify(ids(report))}`,
      );

      const named = report.findings
        .filter((f) => f.id === "gate-doctor/empty-command")
        .map((f) => f.gate)
        .sort();
      assert.deepEqual(
        named,
        ["integration-test", "test"],
        "each unwired tier must be named — silence is the failure mode",
      );

      for (const f of report.findings) {
        assert.equal(f.severity, "warning", `finding ${f.id} must be warning severity`);
      }
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── Part 4: the unseeded scaffold is safe through the merge path ────────────

describe("mergeGates over an unseeded scaffold", () => {
  it("drops both sentinels by name and leaves the starter's integration gate live", () => {
    const dir = createTempDir();
    try {
      const gatesAbs = scaffoldFreshProject(dir, false);
      const governance = parseYaml(readFileSync(gatesAbs, "utf8"));
      const domain = parseYaml(readShipped("templates/domains/software/gates.yaml"));

      // mergeGates(domainOverlay, governanceOverlay) — lib/domains/merge-gates.mjs.
      const { gates, warnings } = mergeGates(domain, governance);

      // Both sentinel entries are dropped with a NAMED INVALID_GATE warning.
      // `INVALID_GATE` is the warning CODE; the message is the sentence.
      const invalid = warnings.filter((w) => w.code === "INVALID_GATE");
      for (const id of ["test", "integration-test"]) {
        assert.ok(
          invalid.some(
            (w) => w.message === `Gate '${id}' missing required command field — skipped.`,
          ),
          `the INVALID_GATE warning must name '${id}' with the missing-command message`,
        );
      }
      assert.equal(
        gates.some((g) => g.id === "test"),
        false,
        "the template's unwired fast sentinel must never survive the merge",
      );

      // Decision D2: id reuse is deliberate. validateGate rejects the falsy
      // command and returns null, so the governance entry never enters byId
      // and never clobbers the live domain gate — and never reaches the
      // override branch either.
      assert.equal(
        warnings.some((w) => w.code === "GATE_OVERRIDE"),
        false,
        "a rejected sentinel must never be reported as overriding the domain gate",
      );
      const integration = gates.find((g) => g.id === "integration-test");
      assert.ok(integration, "the starter's live integration gate must survive the merge");
      assert.equal(integration.tier, "integration");
      assert.deepEqual(integration.command, ["npm", "run", "--if-present", "test:integration"]);
      assert.equal(integration.__source, "domain", "the surviving gate is the domain starter's");

      // Nothing reaches an executor with nothing to run.
      for (const gate of gates) {
        assert.ok(Array.isArray(gate.command), `gate '${gate.id}' command must be an argv list`);
        assert.ok(gate.command.length > 0, `gate '${gate.id}' must not carry an empty argv list`);
      }
    } finally {
      cleanupTempDir(dir);
    }
  });
});
