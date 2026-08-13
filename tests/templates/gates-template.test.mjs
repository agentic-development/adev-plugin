/**
 * Task 3 — the shipped `templates/gates-template.yaml`.
 *
 * This file previously asserted with `content.includes(field)`, which a fully
 * commented-out template satisfies. That is exactly the "no test exercises the
 * artifact a user actually receives" failure the spec's Systemic Pattern section
 * records, so the assertions now PARSE the template and assert over the document.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseYaml } from "../../lib/profiles/yaml.mjs";
import { mergeGates } from "../../lib/domains/merge-gates.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "..", "..", "templates");

/** The nine documented gate fields every live entry must carry. */
const GATE_FIELDS = [
  "id",
  "name",
  "kind",
  "tier",
  "command",
  "scope",
  "required",
  "severity",
  "triggers",
];

describe("gates-template.yaml", () => {
  const content = readFileSync(join(TEMPLATE_DIR, "gates-template.yaml"), "utf8");
  const doc = parseYaml(content);

  const liveById = new Map((doc.gates ?? []).map((g) => [g.id, g]));

  it("ships live fast and integration tier entries", () => {
    assert.ok(Array.isArray(doc.gates), "gates must be a live YAML array, not all comments");

    const test = liveById.get("test");
    assert.ok(test, "a live `test` gate must be declared");
    assert.equal(test.tier, "fast");

    const integration = liveById.get("integration-test");
    assert.ok(integration, "a live `integration-test` gate must be declared");
    assert.equal(integration.tier, "integration");
  });

  it("each live entry carries all nine documented fields", () => {
    for (const id of ["test", "integration-test"]) {
      const gate = liveById.get(id);
      assert.ok(gate, `live gate '${id}' must exist`);
      for (const field of GATE_FIELDS) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(gate, field),
          `live gate '${id}' must declare field: ${field}`
        );
      }
    }
  });

  it("the integration gate is triggered post-implement", () => {
    const integration = liveById.get("integration-test");
    assert.ok(Array.isArray(integration.triggers), "triggers must be a list");
    assert.ok(
      integration.triggers.includes("post-implement"),
      "integration-test must trigger on post-implement"
    );
  });

  it("both live entries carry the empty-string unwired sentinel — not an empty array", () => {
    for (const id of ["test", "integration-test"]) {
      const gate = liveById.get(id);
      // Strict: `command: []` is truthy, passes BOTH validateGate guards, and would
      // reach an executor carrying an empty argv list. Only "" is the sentinel.
      assert.equal(
        gate.command,
        "",
        `live gate '${id}' command must be the exact empty string sentinel`
      );
      assert.equal(
        Array.isArray(gate.command),
        false,
        `live gate '${id}' command must not be an array sentinel`
      );
    }
  });

  it("mergeGates drops both sentinel entries with a named INVALID_GATE warning", () => {
    const { gates, warnings } = mergeGates(null, doc);

    assert.equal(
      gates.some((g) => g.id === "test" || g.id === "integration-test"),
      false,
      "an unwired sentinel gate must never survive the merge"
    );

    const invalid = warnings.filter((w) => w.code === "INVALID_GATE");
    for (const id of ["test", "integration-test"]) {
      assert.ok(
        invalid.some((w) => w.message.includes(`'${id}'`)),
        `the INVALID_GATE warning must name '${id}' — silence is the failure mode`
      );
    }
  });

  it("transitions is live and empty", () => {
    assert.ok(doc.transitions !== undefined, "transitions must be a live key");
    assert.equal(typeof doc.transitions, "object");
    assert.notEqual(doc.transitions, null);
    assert.equal(Array.isArray(doc.transitions), false);
    assert.deepEqual(Object.keys(doc.transitions), [], "transitions must ship unpopulated");
  });

  it("no command value anywhere in the file is a non-empty quoted string", () => {
    // Live YAML and commented examples alike. The `""` unwired sentinel is the one
    // permitted quoted value; every other command must be argv form.
    const quoted = /command:\s*(["'])((?:(?!\1).)*)\1/g;
    const offenders = [];
    for (const match of content.matchAll(quoted)) {
      if (match[2] !== "") offenders.push(match[0]);
    }
    assert.deepEqual(
      offenders,
      [],
      `every command must be argv form; string-form commands found: ${offenders.join(", ")}`
    );
  });

  it("documents all three tiers and both severity values", () => {
    assert.ok(content.includes("fast"), "Template should show fast tier");
    assert.ok(content.includes("integration"), "Template should show integration tier");
    assert.ok(content.includes("e2e"), "Template should show e2e tier");
    assert.ok(content.includes("error"), "Template should show error severity");
    assert.ok(content.includes("warning"), "Template should show warning severity");
  });

  it("documents the e2e-only group field and the transitions section", () => {
    assert.ok(content.includes("group"), "Template should include group field for e2e gates");
    assert.ok(content.includes("transitions"), "Template should include transitions section");
    assert.ok(content.includes("required_gates"), "Template should include required_gates");
  });
});
