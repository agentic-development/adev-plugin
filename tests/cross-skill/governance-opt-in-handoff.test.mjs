import { test } from "node:test";
import assert from "node:assert/strict";
import { writeRegistrySelection } from "../../lib/governance/registry-scaffold.mjs";
import { loadReviewConfig } from "../../lib/governance/review-config.mjs";
import { loadValidateConfig } from "../../lib/governance/validate-config.mjs";
import { createTempDir } from "../helpers.mjs";

test("a partial operator selection at scaffold time is exactly what review-specs dispatches", async () => {
  const dir = await createTempDir();
  writeRegistrySelection(dir, "review", [
    { id: "consistency-analyzer", name: "consistency-analyzer", dispatch: "always",
      profile: "reviewer-capable", context_pack: "base", severity_cap: "blocker",
      prompt: "plugin:review-specs/consistency-analyzer-prompt.md", source: "project" },
  ]);
  const cfg = loadReviewConfig(dir);
  assert.equal(cfg.errors.length, 0);
  assert.deepEqual(cfg.reviewers.map(r => r.id), ["consistency-analyzer"]);
});

test("an empty operator selection reads as zero enabled reviewers, the exact BEH-4 predicate", async () => {
  const dir = await createTempDir();
  writeRegistrySelection(dir, "review", []);
  const cfg = loadReviewConfig(dir);
  assert.equal(cfg.errors.length, 0);
  assert.equal(cfg.reviewers.filter(r => r.enabled !== false).length, 0);
});

test("an empty validate selection reads as zero enabled checks, the exact BEH-5 predicate", async () => {
  const dir = await createTempDir();
  writeRegistrySelection(dir, "validate", []);
  const cfg = loadValidateConfig(dir);
  assert.equal(cfg.errors.length, 0);
  assert.equal(cfg.checks.filter(c => c.enabled !== false).length, 0);
});
