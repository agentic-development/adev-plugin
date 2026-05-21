// End-to-end behavior tests for the cursor sync-target writer.
//
// Spec: .context-index/specs/features/cursor-provider/sync-target-output.spec.md
// Plan: .context-index/specs/features/cursor-provider/sync-target-output.plan.md
//
// The writer behavior is described in skills/sync/SKILL.md (cursor format
// section). These tests exercise it through the companion helper
// `lib/sync/cursor-writer.mjs`, which exists per constitution Principle 2:
// "companion code is allowed but must not be required for the skill to
// function". The helper is a pure reproduction of the markdown-described
// algorithm so the contract is automatically verifiable under `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";
import {
  composeCursorContent,
  writeCursorSyncOutput,
  countBodyWords,
  CURSOR_BODY_OVERSIZE,
} from "../../lib/sync/cursor-writer.mjs";

// ─── Fixture builders ──────────────────────────────────────────────────────

function seedProject(dir, { constitution, manifest } = {}) {
  const con =
    constitution ??
    [
      "# Constitution: test-project",
      "",
      "## Identity",
      "",
      "test-project is a fixture used by cursor-format tests; it exists to validate the .cursor/rules/adev.mdc pointer-projection contract.",
      "",
      "## Non-Negotiable Principles",
      "",
      "1. Be deterministic.",
    ].join("\n");
  const man =
    manifest ??
    [
      "project:",
      "  name: test-project",
      "sync:",
      "  targets:",
      "    - path: .cursor/rules/adev.mdc",
      "      format: cursor",
      "      providers: [cursor]",
    ].join("\n");
  writeFixture(dir, ".context-index/constitution.md", con);
  writeFixture(dir, ".context-index/manifest.yaml", man);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test("happy path — writes valid .cursor/rules/adev.mdc from fixture constitution", (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  seedProject(dir);

  const outPath = join(dir, ".cursor", "rules", "adev.mdc");
  writeCursorSyncOutput({ projectRoot: dir, targetPath: outPath });

  assert.ok(existsSync(outPath), "writer must create .cursor/rules/adev.mdc");
  const content = readFileSync(outPath, "utf8");

  // Begins with frontmatter.
  assert.ok(content.startsWith("---\n"), "file must begin with frontmatter open marker");

  // Frontmatter contains the two required keys.
  const fmEnd = content.indexOf("\n---\n", 4);
  assert.ok(fmEnd > 0, "frontmatter must have a closing --- marker");
  const fm = content.slice(4, fmEnd);
  assert.match(fm, /^description:\s+.+$/m, "frontmatter must declare a description");
  assert.match(
    fm,
    /^alwaysApply:\s+true\s*$/m,
    "alwaysApply must be the literal boolean true (no quotes)",
  );

  // Body word count <= 200.
  assert.ok(countBodyWords(content) <= 200, "body word count must be <= 200");

  // Contains the User Additions marker.
  assert.ok(content.includes("\n# User Additions\n"), "file must contain the User Additions marker");

  // .tmp sibling must not linger.
  assert.ok(
    !existsSync(outPath + ".tmp"),
    ".tmp sibling must be removed after a successful atomic rename",
  );
});

test("frontmatter shape — alwaysApply is the literal boolean true (not string)", (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  seedProject(dir);

  const outPath = join(dir, ".cursor", "rules", "adev.mdc");
  writeCursorSyncOutput({ projectRoot: dir, targetPath: outPath });
  const content = readFileSync(outPath, "utf8");

  // Hand-parse the YAML — alwaysApply MUST be `true` unquoted, not `"true"`.
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(fmMatch, "frontmatter must be present");
  const fm = fmMatch[1];

  const alwaysApplyLine = fm.split("\n").find((l) => l.startsWith("alwaysApply:"));
  assert.ok(alwaysApplyLine, "alwaysApply key must be present");
  assert.equal(
    alwaysApplyLine.trim(),
    "alwaysApply: true",
    "alwaysApply must serialize as `alwaysApply: true` (unquoted boolean)",
  );

  const descLine = fm.split("\n").find((l) => l.startsWith("description:"));
  assert.ok(descLine, "description key must be present");
  // Single line; no embedded \n (already split-by-line so this is guaranteed)
  // but the value should be <= 200 chars after the prefix.
  const descValue = descLine.replace(/^description:\s*/, "").trim();
  assert.ok(descValue.length > 0, "description must be non-empty");
  assert.ok(descValue.length <= 200, "description must be <= 200 characters");
});

test("re-sync preserves User Additions byte-for-byte", (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  seedProject(dir);

  const outPath = join(dir, ".cursor", "rules", "adev.mdc");
  // First write to seed the file.
  writeCursorSyncOutput({ projectRoot: dir, targetPath: outPath });

  // Now hand-edit the User Additions block with fixture content
  // (including unicode and a deliberate trailing-whitespace line).
  const original = readFileSync(outPath, "utf8");
  const markerIdx = original.indexOf("\n# User Additions\n");
  assert.ok(markerIdx > 0);
  const userAdditions = [
    "",
    "## Project-specific overrides",
    "",
    "- Use Π for the constant.",
    "- Trailing whitespace below is intentional:   ",
    "- 漢字 example.",
    "",
  ].join("\n");
  const seeded = original.slice(0, markerIdx + "\n# User Additions\n".length) + userAdditions;
  writeFileSync(outPath, seeded);

  // Re-sync.
  writeCursorSyncOutput({ projectRoot: dir, targetPath: outPath });
  const after = readFileSync(outPath, "utf8");
  const afterMarkerIdx = after.indexOf("\n# User Additions\n");
  assert.ok(afterMarkerIdx > 0);
  const afterUserAdditions = after.slice(afterMarkerIdx + "\n# User Additions\n".length);
  assert.equal(
    afterUserAdditions,
    userAdditions,
    "User Additions content must be preserved byte-for-byte across re-sync",
  );
});

test("re-sync replaces existing Learned Lessons block in the correct position", (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  seedProject(dir);

  const outPath = join(dir, ".cursor", "rules", "adev.mdc");
  // Seed a file with a stale Learned Lessons block at EOF (legacy placement).
  const legacy = [
    "---",
    "description: stale",
    "alwaysApply: true",
    "---",
    "",
    "Old body content.",
    "",
    "# User Additions",
    "",
    "User content.",
    "",
    "## Learned Lessons",
    "",
    "- legacy lesson 1 (_global) — placed at EOF by the old writer",
    "- legacy lesson 2 (_global) — should be removed on re-sync",
    "",
  ].join("\n");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, legacy);

  // Re-sync with fresh high-confidence heuristics.
  const heuristics = [
    "## Learned Lessons",
    "",
    "- new lesson (_global) — placed before User Additions per the new contract",
  ].join("\n");
  writeCursorSyncOutput({ projectRoot: dir, targetPath: outPath, heuristics });

  const after = readFileSync(outPath, "utf8");

  // The Learned Lessons heading must appear exactly once.
  const headingCount = (after.match(/^## Learned Lessons\b/gm) || []).length;
  assert.equal(headingCount, 1, "Learned Lessons heading must appear exactly once");

  // The Learned Lessons section must sit immediately before # User Additions.
  const llIdx = after.indexOf("\n## Learned Lessons\n");
  const uaIdx = after.indexOf("\n# User Additions\n");
  assert.ok(llIdx > 0 && uaIdx > 0, "both sections must be present");
  assert.ok(llIdx < uaIdx, "Learned Lessons must appear before User Additions");

  // The legacy EOF lesson lines must be gone.
  assert.ok(
    !after.includes("legacy lesson 1"),
    "stale legacy Learned Lessons content must be removed",
  );
});

test("oversized body throws CURSOR_BODY_OVERSIZE and writes no file", (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  seedProject(dir, {
    // No specific manifest tweak needed — we force oversize via the body parameter.
  });

  const outPath = join(dir, ".cursor", "rules", "adev.mdc");
  // Use the composer directly with an oversized body to assert the throw.
  const bigBody = new Array(220).fill("word").join(" ");

  assert.throws(
    () => composeCursorContent({ description: "ok", body: bigBody }),
    /CURSOR_BODY_OVERSIZE/,
    "composing oversized body must throw CURSOR_BODY_OVERSIZE",
  );

  // And the writer wrapper must clean up + not leave a .tmp.
  assert.throws(
    () =>
      writeCursorSyncOutput({
        projectRoot: dir,
        targetPath: outPath,
        bodyOverride: bigBody,
      }),
    /CURSOR_BODY_OVERSIZE/,
    "writeCursorSyncOutput must propagate CURSOR_BODY_OVERSIZE",
  );

  assert.ok(!existsSync(outPath), ".cursor/rules/adev.mdc must NOT be written on oversize");
  assert.ok(!existsSync(outPath + ".tmp"), ".tmp file must NOT remain on oversize");
  // And the named export must be the same string token used in the error.
  assert.equal(CURSOR_BODY_OVERSIZE, "CURSOR_BODY_OVERSIZE");
});

test("--dry-run does not write .cursor/rules/adev.mdc", (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  seedProject(dir);

  const outPath = join(dir, ".cursor", "rules", "adev.mdc");
  const result = writeCursorSyncOutput({
    projectRoot: dir,
    targetPath: outPath,
    dryRun: true,
  });

  assert.ok(!existsSync(outPath), "dry-run must not write the target file");
  assert.ok(!existsSync(outPath + ".tmp"), "dry-run must not leave a .tmp file");
  assert.ok(typeof result === "object" && typeof result.content === "string");
  assert.ok(
    result.content.startsWith("---\n"),
    "dry-run must return the proposed content for diff inspection",
  );
});

test("sibling files in .cursor/rules/ are untouched (SA-1)", (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  seedProject(dir);

  // Seed a sibling rule file BEFORE sync.
  const siblingPath = join(dir, ".cursor", "rules", "other.mdc");
  const siblingContent = [
    "---",
    "description: a sibling rule owned by the user",
    "alwaysApply: false",
    "---",
    "",
    "User-authored content — adev MUST NOT touch this file.",
  ].join("\n");
  mkdirSync(dirname(siblingPath), { recursive: true });
  writeFileSync(siblingPath, siblingContent);

  const outPath = join(dir, ".cursor", "rules", "adev.mdc");
  writeCursorSyncOutput({ projectRoot: dir, targetPath: outPath });

  // Sibling must be byte-for-byte unchanged.
  const siblingAfter = readFileSync(siblingPath, "utf8");
  assert.equal(
    siblingAfter,
    siblingContent,
    "sibling files in .cursor/rules/ must be byte-for-byte unchanged after sync",
  );

  // .cursor/rules/ must contain exactly two files: other.mdc and adev.mdc.
  const entries = readdirSync(join(dir, ".cursor", "rules")).sort();
  assert.deepEqual(
    entries,
    ["adev.mdc", "other.mdc"],
    ".cursor/rules/ must contain only the user's sibling and adev.mdc",
  );
});
