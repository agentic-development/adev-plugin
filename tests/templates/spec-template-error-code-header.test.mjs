// tests/templates/spec-template-error-code-header.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = [
  join(__dirname, "..", "..", "templates", "spec-template.behavioral.md"),
  join(__dirname, "..", "..", "templates", "spec-template.refactor.md"),
];

describe("spec templates — domain-neutral Error Cases header", () => {
  for (const path of TEMPLATES) {
    it(`${path} carries an Error Code column and no HTTP Status column`, () => {
      const content = readFileSync(path, "utf8");
      assert.ok(content.includes("| Condition | Expected Behavior | Error Code |"));
      assert.ok(!content.includes("HTTP Status"));
    });
  }
});
