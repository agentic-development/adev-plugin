/**
 * Content assertions for /adev:specify Step 4's domain-owned authoring
 * guidance loading, modeled on the house style of
 * tests/skills/specify-kind-routing.test.mjs.
 *
 * @see .context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT, readSkillSurface } from "../helpers.mjs";

const SKILL = join(PLUGIN_ROOT, "skills", "specify", "SKILL.md");

describe("specify Step 4 — domain-owned authoring guidance", () => {
  const content = readSkillSurface("specify");

  it("contains no hardcoded HTTP-status / drag-and-drop examples", () => {
    assert.ok(!content.includes("column not found → 404"));
    assert.ok(!content.includes("drags a card"));
  });

  it("calls adev domain load-guidance", () => {
    assert.match(content, /adev domain load-guidance/);
  });

  it("states an explicit empty-state fallback message", () => {
    assert.match(content, /No domain-specific authoring guidance available/i);
  });
});
