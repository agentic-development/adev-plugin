import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const content = readFileSync(join(__dirname, "..", "..", "skills", "init", "SKILL.md"), "utf8");

function extractSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) return null;
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end === -1) return null;
  return text.substring(start, end);
}

test("Step 8b names the adev init prompt implementation-mode verb, not inline logic", () => {
  assert.match(content, /### Step 8b: Implementation mode/);
  assert.match(content, /adev init prompt implementation-mode/);
});

test("Step 8b states agent-default is listed first and empty input is rejected", () => {
  const section =
    extractSection(content, "### Step 8b", "### Step 9") ??
    extractSection(content, "### Step 8b", "Step 9/11");
  assert.ok(section, "Step 8b section not found");
  assert.match(section, /agent-default.*first/is);
  assert.match(section, /no (silent|default).*empty|empty.*(rejected|not accepted)/is);
});

test("Step 8b names the sensitive-path-floor-bypass warning by its BEH-6 term", () => {
  const section =
    extractSection(content, "### Step 8b", "### Step 9") ??
    extractSection(content, "### Step 8b", "Step 9/11");
  assert.ok(section, "Step 8b section not found");
  assert.match(section, /sensitive-path-floor-bypass warning/);
});

test("Step 8b names adev implementation-mode resolve for silent re-run resolution", () => {
  const section =
    extractSection(content, "### Step 8b", "### Step 9") ??
    extractSection(content, "### Step 8b", "Step 9/11");
  assert.ok(section, "Step 8b section not found");
  assert.match(section, /adev implementation-mode resolve/);
});

test("Step 8b closes with a Spec pointer to mode-resolution-core", () => {
  const section =
    extractSection(content, "### Step 8b", "### Step 9") ??
    extractSection(content, "### Step 8b", "Step 9/11");
  assert.ok(section, "Step 8b section not found");
  assert.match(
    section,
    /Spec: `?\.context-index\/specs\/cross-cutting\/mode-resolution-core\.spec\.md`?/,
  );
});

test("Step 8b's fenced display block preserves the /11 step-count denominator", () => {
  const section =
    extractSection(content, "### Step 8b", "### Step 9") ??
    extractSection(content, "### Step 8b", "Step 9/11");
  assert.ok(section, "Step 8b section not found");
  assert.match(section, /Step 8b\/11: Implementation Mode/);
});
