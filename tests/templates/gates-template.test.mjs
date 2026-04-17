import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "..", "..", "templates");

describe("gates-template.yaml", () => {
  const content = readFileSync(join(TEMPLATE_DIR, "gates-template.yaml"), "utf8");

  it("should contain commented examples with all unified fields", () => {
    const requiredFields = ["id", "name", "kind", "tier", "command", "scope", "required", "severity", "triggers"];
    for (const field of requiredFields) {
      assert.ok(content.includes(field), `Template must include field: ${field}`);
    }
  });

  it("should include tier values in examples", () => {
    assert.ok(content.includes("fast"), "Template should show fast tier");
    assert.ok(content.includes("integration"), "Template should show integration tier");
    assert.ok(content.includes("e2e"), "Template should show e2e tier");
  });

  it("should include group field for e2e gates", () => {
    assert.ok(content.includes("group"), "Template should include group field for e2e gates");
  });

  it("should include severity values in examples", () => {
    assert.ok(content.includes("error"), "Template should show error severity");
    assert.ok(content.includes("warning"), "Template should show warning severity");
  });

  it("should include transitions section", () => {
    assert.ok(content.includes("transitions"), "Template should include transitions section");
    assert.ok(content.includes("required_gates"), "Template should include required_gates");
  });
});
