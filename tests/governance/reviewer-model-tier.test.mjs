// tests/governance/reviewer-model-tier.test.mjs
//
// Every enabled reviewer must resolve to a concrete model id, and the skill must
// tell the orchestrator to pass it.
//
// WHY THIS EXISTS. lib/governance/dispatch-shape.mjs and both harness adapters
// already threaded a `modelIdFromTier` callback through to `dispatch.modelId`, but
// no production caller ever supplied that callback — only tests/profiles/adapters.test.mjs.
// So `modelId` was always undefined, every reviewer inherited the orchestrator's
// session model, and `platform-context.yaml:model_tiers` was documentation nothing
// read. Two full /adev:review-specs rounds ran with four of five reviewers above
// their assigned tier before anyone noticed, because NOTHING FAILS when a tier is
// not applied — the review still completes, just on the wrong model.
//
// That is the property under test: not "the mapping is correct" but "the mapping is
// reachable and non-null", which is what makes the tier config falsifiable at all.
//
// Bug: adev-plugin-reviewer-tier-not-applied-wohx

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";
import { loadModelTiers, resolveReviewerModel } from "../../lib/model-tiers.mjs";
import { loadReviewConfig } from "../../lib/governance/review-config.mjs";

test("platform-context declares a model for every known tier", () => {
  const tiers = loadModelTiers(PLUGIN_ROOT);
  for (const t of ["fast", "capable", "reasoning"]) {
    assert.ok(tiers[t], `model_tiers.${t} is not declared`);
    assert.doesNotMatch(
      tiers[t],
      /\s|#/,
      `model_tiers.${t} = ${JSON.stringify(tiers[t])} — trailing comment prose was not stripped`,
    );
  }
});

test("every enabled reviewer resolves to a concrete model", () => {
  const cfg = loadReviewConfig(PLUGIN_ROOT);
  const tiers = loadModelTiers(PLUGIN_ROOT);
  const unresolved = [];
  let resolved = 0;
  for (const r of cfg.reviewers ?? []) {
    if (r.enabled === false) continue;
    const { tier, model } = resolveReviewerModel(r, cfg.profiles, tiers);
    if (!model) unresolved.push(`${r.id} (profile=${r.profile}, tier=${tier ?? "none"})`);
    else resolved++;
  }
  assert.ok(resolved > 0, "no reviewer resolved a model — the sweep is not running");
  assert.deepEqual(
    unresolved,
    [],
    "reviewers with no resolvable model — they would silently inherit the session model:\n  " +
      unresolved.join("\n  "),
  );
});

test("the reviewers envelope carries the resolved model per reviewer", () => {
  // The orchestrator reads this envelope in Step 3 and passes `model` in Step 4.
  // If the field stops being emitted, the skill's instruction becomes unfollowable.
  const src = readFileSync(join(PLUGIN_ROOT, "lib", "cli", "governance.mjs"), "utf8");
  assert.match(src, /model_tiers:\s*tiers/, "envelope must expose the resolved tier map");
  assert.match(src, /resolveReviewerModel/, "envelope must resolve a model per reviewer");
});

test("review-specs instructs the orchestrator to pass the resolved model", () => {
  // Reading the step companion directly: this asserts WHERE the instruction lives.
  const step4 = readFileSync(
    join(PLUGIN_ROOT, "skills", "review-specs", "references", "steps",
         "step-4-dispatch-reviewers.md"),
    "utf8",
  );
  assert.match(
    step4,
    /`model`: the reviewer's resolved model id/,
    "Step 4's dispatch list must name `model` explicitly — naming only " +
      "prepareForDispatch's return omits it, which is the original defect",
  );
  assert.match(
    step4,
    /Passing this is not\s+optional/,
    "the instruction must be mandatory, not advisory",
  );
});
