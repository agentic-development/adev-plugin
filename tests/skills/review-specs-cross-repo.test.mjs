import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("review-specs SKILL.md — cross-repo references", () => {
  const content = readFileSync(join(__dirname, "..", "..", "skills", "review-specs", "SKILL.md"), "utf8");

  it("validates cross-repo depends-on references", () => {
    assert.ok(content.includes("@repo-slug") || content.includes("cross-repo"),
      "Should validate cross-repo references");
  });

  it("checks referenced spec status", () => {
    assert.ok(content.includes("draft") && content.includes("superseded"),
      "Should check referenced spec status");
  });

  it("skips validation when no workspace detected", () => {
    assert.ok(content.includes("no workspace detected"),
      "Should skip when no workspace");
  });
});
