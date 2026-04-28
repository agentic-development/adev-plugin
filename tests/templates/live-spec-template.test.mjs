import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(__dirname, "..", "..", "templates", "live-spec-template.md");

describe("live-spec-template.md — infra_requirements field", () => {
  const content = readFileSync(TEMPLATE, "utf8");

  it("frontmatter contains infra_requirements field (commented)", () => {
    assert.ok(
      content.includes("infra_requirements"),
      "Template must include infra_requirements field or comment"
    );
  });

  it("frontmatter comment explains infra_requirements is for external systems", () => {
    assert.ok(
      content.includes("infra_requirements") &&
        (content.includes("external") || content.includes("systems") || content.includes("infra")),
      "infra_requirements comment must reference external systems"
    );
  });

  it("template includes security note: env var names only, no actual values", () => {
    assert.ok(
      content.includes("infra_requirements") &&
        (content.includes("names only") || content.includes("no actual values") || content.includes("MUST NOT")),
      "Template must include security note about env var names only"
    );
  });
});
