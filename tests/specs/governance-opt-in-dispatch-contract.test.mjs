import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SPEC = ".context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md";

test("the UI-placement Coverage Gap is closed, not left open", () => {
  const spec = readFileSync(SPEC, "utf8");
  assert.doesNotMatch(spec, /is undecided|not yet resolved by this spec/i);
  assert.match(spec, /enhance.*in place|Step 7c\.3\/7d\.1/i);
});

test("revision is bumped past 2", () => {
  const spec = readFileSync(SPEC, "utf8");
  const m = spec.match(/^revision:\s*(\d+)/m);
  assert.ok(m && Number(m[1]) > 2, "revision must be bumped");
});

const RISK_TIER_SPEC = ".context-index/specs/features/setup/risk-tier-bundles.spec.md";

test("risk-tier-bundles Postcondition names the operator's selection, not the full domain bundle", () => {
  const spec = readFileSync(RISK_TIER_SPEC, "utf8");
  assert.ok(!/the resolved domain's bundle would have produced on its own/.test(spec));
  assert.match(spec, /operator's own Step 7c\/7d selection/);
});

test("BEH-13/14/15 name the unknown-id signal for an unselected overlay target", () => {
  const spec = readFileSync(RISK_TIER_SPEC, "utf8");
  assert.match(spec, /RISK_TIER_OVERLAY_UNKNOWN_ID/);
});

test("the four risk-tier overlay templates no longer claim the domain bundle as their base", () => {
  for (const f of [
    "templates/risk-tiers/prototype/review-overlay.yaml",
    "templates/risk-tiers/prototype/validate-overlay.yaml",
    "templates/risk-tiers/strict/review-overlay.yaml",
    "templates/risk-tiers/strict/validate-overlay.yaml",
  ]) {
    const text = readFileSync(f, "utf8");
    assert.ok(!/resolved domain's bundled reviewer defaults|resolved domain's scaffolded validate\.yaml/.test(text), f);
  }
});
