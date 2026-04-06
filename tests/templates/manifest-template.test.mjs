import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "..", "..", "templates");

describe("manifest-template.yaml", () => {
  const content = readFileSync(join(TEMPLATE_DIR, "manifest-template.yaml"), "utf8");

  it("includes reminder_interval under tasks section", () => {
    assert.match(content, /reminder_interval:\s*25/);
  });

  it("has a comment explaining the reminder_interval field", () => {
    assert.match(content, /# .*reminder/i);
  });
});
