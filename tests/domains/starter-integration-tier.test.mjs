/**
 * Task 2 — Live integration tier in the starters and overlays.
 *
 * Every assertion here reads a SHIPPED starter file from disk. No inline gate
 * fixture is permitted: the spec's "Systemic Pattern" section records that the
 * defect this closes was invisible precisely because no test exercised the
 * artifact a user actually receives.
 *
 * Plan decision D2 governs the gate id (`integration-test` is reused across the
 * template and all three domain surfaces on purpose).
 * Plan decision D3 governs the assertion style: `mergeGates` narrows every entry
 * to `{ id, command, description?, severity?, tier? }` and injects `__source`,
 * so assertions compare NAMED FIELDS, never deep-equality against the raw YAML.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseYaml } from "../../lib/profiles/yaml.mjs";
import { mergeGates } from "../../lib/domains/merge-gates.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

const INTEGRATION_COMMAND = ["npm", "run", "--if-present", "test:integration"];

/** The three shipped gate surfaces a scaffolded project can receive. */
const SURFACES = [
  {
    label: "software starter",
    path: "templates/domains/software/gates.yaml",
    fastGate: {
      id: "quality-gate",
      description: "Run project test suite",
      command: ["npm", "test"],
      severity: "error",
      tier: "fast",
    },
  },
  {
    label: "data-engineering overlay",
    path: "extensions/data-engineering/domain/gates.yaml",
    fastGate: {
      id: "data-quality",
      description: "Check schema validation and data fixture definitions",
      command: ["npm", "test"],
      severity: "error",
      tier: "fast",
    },
  },
  {
    label: "process-automation overlay",
    path: "extensions/process-automation/domain/gates.yaml",
    fastGate: {
      id: "flow-coverage",
      description: "Check integration point tests and recovery action tests",
      command: ["npm", "test"],
      severity: "error",
      tier: "fast",
    },
  },
];

function readSurface(relPath) {
  const raw = readFileSync(join(REPO_ROOT, relPath), "utf8");
  return { raw, doc: parseYaml(raw) };
}

describe("domain starters ship a live integration tier", () => {
  for (const surface of SURFACES) {
    describe(surface.label, () => {
      const { doc } = readSurface(surface.path);

      it("merges without warnings and yields an integration-tier gate", () => {
        const { gates, warnings } = mergeGates(doc, null);
        assert.deepEqual(
          warnings,
          [],
          `${surface.path} must merge cleanly, got: ${JSON.stringify(warnings)}`
        );
        const integration = gates.filter((g) => g.tier === "integration");
        assert.ok(
          integration.length >= 1,
          `${surface.path} must declare at least one tier: integration gate`
        );
      });

      it("the integration gate is error-severity and runs the no-op-if-absent argv command", () => {
        const { gates } = mergeGates(doc, null);
        const gate = gates.find((g) => g.tier === "integration");
        assert.ok(gate, "an integration-tier gate must exist");
        assert.equal(gate.id, "integration-test", "D2: the id is shared across surfaces");
        assert.equal(gate.severity, "error");
        assert.deepEqual(gate.command, INTEGRATION_COMMAND);
      });

      it("keeps the pre-existing fast-tier gate — this is an addition, not a replacement", () => {
        const { gates } = mergeGates(doc, null);
        const gate = gates.find((g) => g.id === surface.fastGate.id);
        assert.ok(gate, `${surface.fastGate.id} must survive the change`);
        // D3: named fields only — mergeGates narrows the entry and injects __source.
        assert.equal(gate.description, surface.fastGate.description);
        assert.deepEqual(gate.command, surface.fastGate.command);
        assert.equal(gate.severity, surface.fastGate.severity);
        assert.equal(gate.tier, surface.fastGate.tier);
      });

      it("every command in the file is an array of strings", () => {
        assert.ok(Array.isArray(doc.gates), "the file must declare a gates array");
        for (const entry of doc.gates) {
          assert.ok(
            Array.isArray(entry.command),
            `gate '${entry.id}' command must be an argv list, got ${typeof entry.command}`
          );
          assert.ok(entry.command.length > 0, `gate '${entry.id}' command must be non-empty`);
          for (const token of entry.command) {
            assert.equal(
              typeof token,
              "string",
              `gate '${entry.id}' argv token must be a string, got ${typeof token}`
            );
          }
        }
      });
    });
  }

  it("D2: an unwired governance sentinel never clobbers the starter's live integration gate", () => {
    const { doc: software } = readSurface("templates/domains/software/gates.yaml");
    // What a fresh scaffold's governance layer carries before /adev:init seeds it.
    const governance = { gates: [{ id: "integration-test", command: "" }] };

    const { gates, warnings } = mergeGates(software, governance);

    const gate = gates.find((g) => g.id === "integration-test");
    assert.ok(gate, "the starter's live integration gate must survive");
    assert.equal(gate.__source, "domain", "the sentinel must not override the domain gate");
    assert.deepEqual(gate.command, INTEGRATION_COMMAND);
    assert.equal(gate.tier, "integration");
    assert.equal(gate.severity, "error");

    const invalid = warnings.filter((w) => w.code === "INVALID_GATE");
    assert.equal(invalid.length, 1, "the dropped sentinel must be reported, not swallowed");
    assert.match(
      invalid[0].message,
      /integration-test/,
      "the INVALID_GATE warning must name the gate"
    );
    assert.equal(
      warnings.some((w) => w.code === "GATE_OVERRIDE"),
      false,
      "a rejected sentinel never reaches the override path"
    );
  });
});
