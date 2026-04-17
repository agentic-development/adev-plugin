import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("tiered-test-gates specs are superseded", () => {
  const specsDir = join(__dirname, "..", "..", ".context-index", "specs", "features", "tiered-test-gates");
  const specFiles = readdirSync(specsDir).filter(f => f.endsWith(".md") && f !== "charter.md" && !f.endsWith(".review.md") && !f.endsWith(".plan.md"));

  for (const file of specFiles) {
    it(file + " should have status: superseded", () => {
      const content = readFileSync(join(specsDir, file), "utf8");
      assert.ok(content.includes("status: superseded"), file + " must be superseded");
    });
  }

  it("should have exactly 5 superseded specs", () => {
    assert.equal(specFiles.length, 5, "Expected 5 tiered-test-gates specs");
  });
});
