/**
 * Tests that the public schema doc at
 * .context-index/memory/heuristics/_format.md exists and covers the
 * required sections described by the store-and-helper plan.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const formatDocPath = resolve(
  projectRoot,
  ".context-index",
  "memory",
  "heuristics",
  "_format.md",
);

describe("heuristics _format.md schema doc", () => {
  it("exists and is non-empty", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.ok(content.length > 0, "_format.md must not be empty");
  });

  it("documents the Frontmatter Schema", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /Frontmatter Schema/);
    // spot-check key fields
    for (const field of [
      "id",
      "scope",
      "title",
      "pattern",
      "anti-pattern",
      "confidence",
      "evidence",
      "contradicted-by",
      "created",
      "updated",
      "archived",
    ]) {
      assert.match(
        content,
        new RegExp(`\\b${field.replace("-", "[-]")}\\b`),
        `frontmatter field '${field}' must be documented`,
      );
    }
  });

  it("documents the Confidence Lifecycle with promotion thresholds", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /Confidence Lifecycle/);
    assert.match(content, /\blow\b/);
    assert.match(content, /\bmedium\b/);
    assert.match(content, /\bhigh\b/);
    assert.match(content, /2 distinct/);
    assert.match(content, /3 distinct/);
  });

  it("documents the ID Namespace Convention", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /ID Namespace Convention/);
    assert.match(content, /<category-slug>/);
    assert.match(content, /<spec-slug>/);
  });

  it("documents the Redaction Advisory", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /Redaction Advisory/);
    assert.match(content, /distill generalizations/);
  });
});
