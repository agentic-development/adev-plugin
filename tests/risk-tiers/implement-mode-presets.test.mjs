import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRiskTierConfig } from "../../lib/risk-tiers/tier-config.mjs";
import {
  loadRigorPolicies,
  parseRigorPolicies,
  RIGOR_MODES,
  RISK_LEVELS,
} from "../../lib/governance/rigor-mode.mjs";
import { PLUGIN_ROOT } from "../helpers.mjs";

const PRESET_FILES = {
  standard: join(PLUGIN_ROOT, "templates", "risk-policies-template.yaml"),
  prototype: join(PLUGIN_ROOT, "templates", "risk-tiers", "prototype", "risk-policies.yaml"),
  strict: join(PLUGIN_ROOT, "templates", "risk-tiers", "strict", "risk-policies.yaml"),
};
const MODE_FIELDS = ["review_mode", "validate_mode", "implement_mode"];

function presetPolicies(tier) {
  return loadRiskTierConfig(tier, "risk-policies", PLUGIN_ROOT).policies;
}

function implementModes(policies) {
  return Object.fromEntries(RISK_LEVELS.map((level) => [level, policies[level].implement_mode]));
}

describe("preset implement_mode values", () => {
  it("standard template: quick at every level (risk-level floor still forces full for non-auto-agent high-risk tasks)", () => {
    assert.deepEqual(implementModes(presetPolicies("standard")), {
      high: "quick",
      medium: "quick",
      low: "quick",
    });
  });

  it("standard tier resolves to templates/risk-policies-template.yaml", () => {
    const direct = parseRigorPolicies(readFileSync(PRESET_FILES.standard, "utf8"), PRESET_FILES.standard);
    assert.deepEqual(presetPolicies("standard"), direct);
  });

  it("prototype preset is already quick at every level and unchanged (CON-4)", () => {
    assert.deepEqual(implementModes(presetPolicies("prototype")), {
      high: "quick",
      medium: "quick",
      low: "quick",
    });
  });

  it("strict preset unchanged: full at every level", () => {
    const policies = presetPolicies("strict");
    for (const level of RISK_LEVELS) {
      for (const field of MODE_FIELDS) {
        assert.equal(policies[level][field], "full", `${level}.${field}`);
      }
    }
  });

  it("no preset ships lite (lite arrives only through BEH-12)", () => {
    for (const tier of Object.keys(PRESET_FILES)) {
      const policies = presetPolicies(tier);
      for (const [level, entry] of Object.entries(policies)) {
        for (const [field, value] of Object.entries(entry)) {
          assert.notEqual(value, "lite", `${tier}: ${level}.${field}`);
        }
      }
    }
  });

  it("every preset declares implement_mode explicitly at every level, so no level relies on the resolver fallback", () => {
    for (const tier of Object.keys(PRESET_FILES)) {
      const policies = presetPolicies(tier);
      assert.deepEqual(Object.keys(policies).sort(), [...RISK_LEVELS].sort(), tier);
      for (const level of RISK_LEVELS) {
        assert.ok(Object.hasOwn(policies[level], "implement_mode"), `${tier}: ${level}.implement_mode missing`);
        assert.ok(RIGOR_MODES.includes(policies[level].implement_mode), `${tier}: ${level}.implement_mode`);
      }
    }
  });

  it("every preset passes strict risk-policies validation", () => {
    for (const [tier, file] of Object.entries(PRESET_FILES)) {
      const policies = parseRigorPolicies(readFileSync(file, "utf8"), file);
      assert.deepEqual(policies, presetPolicies(tier), tier);
    }
  });

  it("this repository matches the standard template", () => {
    const repo = loadRigorPolicies(PLUGIN_ROOT);
    assert.deepEqual(Object.keys(repo).sort(), [...RISK_LEVELS].sort());
    assert.deepEqual(implementModes(repo), implementModes(presetPolicies("standard")));
    assert.deepEqual(implementModes(repo), { high: "quick", medium: "quick", low: "quick" });
    for (const entry of Object.values(repo)) {
      for (const [field, value] of Object.entries(entry)) {
        assert.notEqual(value, "lite", `repo ${field}`);
      }
    }
  });
});
