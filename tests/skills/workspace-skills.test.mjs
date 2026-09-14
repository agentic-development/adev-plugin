import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readSkillSurface } from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("workspace-aware skills", () => {
  it("plan SKILL.md supports workspace dependency ordering", () => {
    const content = readSkillSurface("plan")
      + "\n" + readFileSync(join(__dirname, "..", "..", "skills", "plan", "references", "milestone-mode.md"), "utf8");
    assert.ok(content.includes("workspace") && content.includes("topolog"),
      "Plan should support topological ordering in workspace");
  });

  it("plan SKILL.md defines from-depends-on-to convention", () => {
    const content = readSkillSurface("plan")
      + "\n" + readFileSync(join(__dirname, "..", "..", "skills", "plan", "references", "milestone-mode.md"), "utf8");
    assert.ok(content.includes("from") && content.includes("upstream"),
      "Plan should define dependency direction");
  });

  it("brainstorm SKILL.md supports workspace root", () => {
    const content = readSkillSurface("brainstorm");
    assert.ok(content.includes("workspace root") || content.includes("workspace-level"),
      "Brainstorm should handle workspace root");
  });

  it("status SKILL.md aggregates across repos", () => {
    const content = readSkillSurface("status");
    assert.ok(content.includes("workspace") && content.includes("aggregat"),
      "Status should aggregate across repos");
  });
});
