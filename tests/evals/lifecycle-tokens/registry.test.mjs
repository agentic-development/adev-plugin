import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadScenarioRegistry } from "./registry.mjs";

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

describe("loadScenarioRegistry", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lifecycle-registry-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads scenarios in deterministic order", () => {
    writeJson(join(tempDir, "zeta.json"), {
      scenario_id: "zeta",
      scenario_name: "Zeta",
      complexity_tags: ["happy-path"],
      start_phase_id: "brainstorm",
      terminal_phase_ids: ["validate"],
      max_total_steps: 10,
      max_phase_visits: 2,
      max_subagent_events_per_phase: 3,
      phases: [
        { id: "brainstorm", name: "Brainstorm", skill_name: "adev-brainstorm" },
        { id: "validate", name: "Validate", skill_name: "adev-validate" },
      ],
      branches: [
        { branch_id: "branch-1", from_phase_id: "brainstorm", to_phase_id: "validate", trigger_type: "on_success" },
      ],
    });
    writeJson(join(tempDir, "alpha.json"), {
      scenario_id: "alpha",
      scenario_name: "Alpha",
      complexity_tags: ["happy-path"],
      start_phase_id: "brainstorm",
      terminal_phase_ids: ["validate"],
      max_total_steps: 10,
      max_phase_visits: 2,
      max_subagent_events_per_phase: 3,
      phases: [
        { id: "brainstorm", name: "Brainstorm", skill_name: "adev-brainstorm" },
        { id: "validate", name: "Validate", skill_name: "adev-validate" },
      ],
      branches: [
        { branch_id: "branch-1", from_phase_id: "brainstorm", to_phase_id: "validate", trigger_type: "on_success" },
      ],
    });

    const scenarios = loadScenarioRegistry(tempDir);
    assert.deepEqual(scenarios.map((scenario) => scenario.scenario_id), ["alpha", "zeta"]);
  });

  it("rejects invalid scenario ids", () => {
    writeJson(join(tempDir, "bad.json"), {
      scenario_id: "../bad",
      scenario_name: "Bad",
      complexity_tags: ["happy-path"],
      start_phase_id: "brainstorm",
      terminal_phase_ids: ["validate"],
      max_total_steps: 10,
      max_phase_visits: 2,
      max_subagent_events_per_phase: 3,
      phases: [
        { id: "brainstorm", name: "Brainstorm", skill_name: "adev-brainstorm" },
        { id: "validate", name: "Validate", skill_name: "adev-validate" },
      ],
      branches: [],
    });

    assert.throws(() => loadScenarioRegistry(tempDir), /invalid_scenario_id/);
  });

  it("rejects scenarios missing lifecycle anchors or limits", () => {
    writeJson(join(tempDir, "missing.json"), {
      scenario_id: "missing",
      scenario_name: "Missing",
      complexity_tags: ["happy-path"],
      phases: [
        { id: "brainstorm", name: "Brainstorm", skill_name: "adev-brainstorm" },
      ],
      branches: [],
    });

    assert.throws(() => loadScenarioRegistry(tempDir), /missing_lifecycle_anchor|invalid_execution_limit/);
  });

  it("rejects unsupported trigger types", () => {
    writeJson(join(tempDir, "bad-trigger.json"), {
      scenario_id: "bad-trigger",
      scenario_name: "Bad Trigger",
      complexity_tags: ["review-loop"],
      start_phase_id: "brainstorm",
      terminal_phase_ids: ["validate"],
      max_total_steps: 10,
      max_phase_visits: 2,
      max_subagent_events_per_phase: 3,
      phases: [
        { id: "brainstorm", name: "Brainstorm", skill_name: "adev-brainstorm" },
        { id: "validate", name: "Validate", skill_name: "adev-validate" },
      ],
      branches: [
        { branch_id: "branch-1", from_phase_id: "brainstorm", to_phase_id: "validate", trigger_type: "sometimes" },
      ],
    });

    assert.throws(() => loadScenarioRegistry(tempDir), /invalid_branch_trigger/);
  });

  it("rejects empty registries", () => {
    assert.throws(() => loadScenarioRegistry(tempDir), /empty_registry/);
  });

  it("rejects missing max_subagent_events_per_phase", () => {
    writeJson(join(tempDir, "missing-cap.json"), {
      scenario_id: "missing-cap",
      scenario_name: "Missing Cap",
      complexity_tags: ["happy-path"],
      start_phase_id: "brainstorm",
      terminal_phase_ids: ["validate"],
      max_total_steps: 10,
      max_phase_visits: 2,
      phases: [
        { id: "brainstorm", name: "Brainstorm", skill_name: "adev-brainstorm" },
        { id: "validate", name: "Validate", skill_name: "adev-validate" },
      ],
      branches: [],
    });

    assert.throws(() => loadScenarioRegistry(tempDir), /invalid_execution_limit/);
  });
});
