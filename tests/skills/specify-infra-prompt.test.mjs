import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "specify", "SKILL.md");

describe("adev:specify SKILL.md — Infrastructure Requirements Prompt (Behavior 5)", () => {
  it("SKILL.md exists", () => {
    assert.ok(existsSync(SKILL_PATH));
  });

  it("contains Step 4.5 for infrastructure requirements collection", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("Step 4.5") || c.includes("Infrastructure Requirements"),
      "Must include Step 4.5 or an Infrastructure Requirements heading"
    );
  });

  it("asks whether capability interacts with external systems", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("external system") || c.includes("external systems"),
      "Must ask about external systems"
    );
  });

  it("prompts for env var names only — not actual values", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("names only") || c.includes("env var name") || c.includes("MUST NOT") || c.includes("never record actual"),
      "Must instruct: env var names only, never actual credential values"
    );
  });

  it("writes infra_requirements: into spec frontmatter", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("infra_requirements"),
      "Must write infra_requirements: field into frontmatter"
    );
  });

  it("supports infra_requirements: unknown when author skips", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("infra_requirements: unknown") || c.includes("unknown"),
      "Must support infra_requirements: unknown fallback"
    );
  });

  it("Step 4.5 is placed after Step 4 (Interactive Spec Authoring) and before Step 5 (Write the Spec)", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    const step4Idx = c.indexOf("### Step 4: Interactive Spec Authoring");
    const step45Idx = c.indexOf("Step 4.5");
    const step5Idx = c.indexOf("### Step 5: Write the Spec");
    assert.ok(step4Idx !== -1, "Step 4 must exist");
    assert.ok(step45Idx !== -1, "Step 4.5 must exist");
    assert.ok(step5Idx !== -1, "Step 5 must exist");
    assert.ok(step4Idx < step45Idx, "Step 4.5 must appear after Step 4");
    assert.ok(step45Idx < step5Idx, "Step 4.5 must appear before Step 5");
  });
});
