// tests/skills/debug-completion-and-auto.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

test("debug SKILL.md declares --auto in the Arguments section (BEH-5)", () => {
  const md = read("skills/debug/SKILL.md");
  assert.match(
    md,
    /## Arguments[\s\S]{0,600}--auto/,
    "Arguments section must document --auto",
  );
});

test("debug SKILL.md skips the interactive ADR prompt under --auto and records a note instead (BEH-5)", () => {
  const md = read("skills/debug/SKILL.md");
  assert.match(
    md,
    /--auto[\s\S]{0,800}(skip|suppress)[\s\S]{0,400}(ADR|prompt)/i,
    "Phase 6 step 3 must skip the interactive ADR prompt under --auto",
  );
  assert.match(
    md,
    /--auto[\s\S]{0,1200}format-note|format-note[\s\S]{0,400}--auto/,
    "Phase 6 step 3's --auto branch must record the insight as a note via format-note rather than drafting an ADR",
  );
  assert.match(
    md,
    /insight description/i,
    "the format-note --action value must carry the actual insight description, not a generic hardcoded label",
  );
  assert.match(
    md,
    /Do not call `update\(\)` here/,
    "Phase 6 step 3 must not write to the issue itself — it hands the note to step 4's single update() call site",
  );
});
