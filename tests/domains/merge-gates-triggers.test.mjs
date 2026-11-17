/**
 * `mergeGates` must carry a gate's `triggers` through to the merged entry.
 *
 * `/adev:implement` Step 2-post selects its gates from the merged list, and it
 * can only honour `triggers: [post-implement]` ("once, after the last task") if
 * the merged entry still says so. When the field was narrowed away, the only
 * consumer that could see triggers was Step 2h — the per-task loop — so every
 * `post-implement` gate ran after every task.
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

describe("mergeGates — triggers passthrough", () => {
  it("keeps a declared triggers list on the merged entry", () => {
    const triggers = ["post-implement"];
    const { gates, warnings } = mergeGates(null, {
      gates: [{ id: "suite", command: ["pytest"], tier: "fast", triggers }],
    });
    assert.deepEqual(warnings, []);
    assert.deepEqual(gates[0].triggers, ["post-implement"]);
    assert.notEqual(gates[0].triggers, triggers, "must be a copy, never the caller's array");
  });

  it("omits triggers when the gate declares none, so consumers can tell 'undeclared' from 'empty'", () => {
    const { gates } = mergeGates({ gates: [{ id: "q", command: ["npm", "test"], tier: "fast" }] }, null);
    assert.equal(Object.hasOwn(gates[0], "triggers"), false);
  });

  it("drops non-string trigger entries rather than passing them to a consumer", () => {
    const { gates } = mergeGates(null, {
      gates: [{ id: "suite", command: ["pytest"], triggers: ["post-task", 7, null] }],
    });
    assert.deepEqual(gates[0].triggers, ["post-task"]);
  });

  it("a governance override replaces the domain gate's triggers, it does not union them", () => {
    const { gates } = mergeGates(
      { gates: [{ id: "q", command: ["npm", "test"], triggers: ["post-task"] }] },
      { gates: [{ id: "q", command: ["npm", "test"], triggers: ["post-implement"] }] },
    );
    assert.deepEqual(gates[0].triggers, ["post-implement"]);
  });

  it("the shipped template's integration-test gate reaches the merged list still marked post-implement only", () => {
    const raw = parseYaml(readFileSync(join(REPO_ROOT, "templates/gates-template.yaml"), "utf8"));
    const seeded = { gates: raw.gates.map((g) => ({ ...g, command: ["echo", g.id] })) };
    const { gates } = mergeGates(null, seeded);
    const integration = gates.find((g) => g.id === "integration-test");
    assert.ok(integration, "template must ship an integration-test gate");
    assert.deepEqual(integration.triggers, ["post-implement"]);
  });
});
