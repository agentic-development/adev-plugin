import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "fs";
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

  it("should not contain a gates: section", () => {
    const gatesLine = content.split("\n").find(line => /^gates:/.test(line.trim()));
    assert.equal(gatesLine, undefined, "manifest-template should not contain a top-level gates: section");
  });

  it("should not reference governance precedence over manifest gates", () => {
    assert.ok(!content.includes("take precedence over the gates:"), "Should not reference gates precedence");
  });
});

describe("format-documentation.md template", () => {
  const templatePath = join(TEMPLATE_DIR, "format-documentation.md");

  it("exists in templates directory", () => {
    assert.ok(existsSync(templatePath), "format-documentation.md should exist");
  });

  it("documents execution state file schema", () => {
    const content = readFileSync(templatePath, "utf8");
    assert.ok(content.includes("Execution State File"), "should document execution state");
    assert.ok(content.includes("status"), "should list status field");
    assert.ok(content.includes("planRef"), "should list planRef field");
    assert.ok(content.includes("currentTask"), "should list currentTask field");
  });

  it("documents session tracking JSONL schema", () => {
    const content = readFileSync(templatePath, "utf8");
    assert.ok(content.includes("Session Tracking Log"), "should document session tracking");
    assert.ok(content.includes("tool"), "should list tool field");
    assert.ok(content.includes("files"), "should list files field");
    assert.ok(content.includes("timestamp"), "should list timestamp field");
  });

  it("has revision frontmatter", () => {
    const content = readFileSync(templatePath, "utf8");
    assert.match(content, /revision:\s*1/);
  });

  it("is self-contained with no plugin source references", () => {
    const content = readFileSync(templatePath, "utf8");
    assert.ok(!content.includes("lib/execution-state.mjs"), "should not reference plugin source");
    assert.ok(!content.includes("require("), "should not reference require()");
    assert.ok(!content.includes("import "), "should not reference imports");
  });
});
