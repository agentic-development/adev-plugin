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

const TOKEN_GRAMMAR = /^ADEV-[A-Z]+: [A-Z_]+$/;
function assertGrammar(token) {
  assert.ok(TOKEN_GRAMMAR.test(token), `token "${token}" must match ^ADEV-[A-Z]+: [A-Z_]+$`);
}

test("debug SKILL.md emits the ADEV-DEBUG completion token for FIXED and PARKED (BEH-1, BEH-2, BEH-4)", () => {
  const md = read("skills/debug/SKILL.md");
  for (const tok of ["ADEV-DEBUG: FIXED", "ADEV-DEBUG: PARKED"]) {
    assertGrammar(tok);
    assert.ok(md.includes(tok), `skills/debug/SKILL.md must instruct emitting "${tok}"`);
  }
  assert.match(
    md,
    /ADEV-DEBUG[\s\S]{0,400}?(final line|last line)|(final line|last line)[\s\S]{0,400}?ADEV-DEBUG/i,
    "debug SKILL.md must require the ADEV-DEBUG token as the final line of output",
  );
});

test("debug SKILL.md bounds --auto reproduction attempts and terminates UNREPRODUCIBLE (BEH-3, BEH-7)", () => {
  const md = read("skills/debug/SKILL.md");
  assert.match(
    md,
    /reproduction_attempt_limit/,
    "Phase 1 must reference tasks.bugfix_loop.reproduction_attempt_limit",
  );
  assert.match(md, /\bdefault(?:s|ing)? (?:of |to )?3\b/i, "default reproduction attempt limit must be 3");
  assert.ok(
    md.includes("ADEV-DEBUG: UNREPRODUCIBLE"),
    "Phase 1 must terminate with ADEV-DEBUG: UNREPRODUCIBLE when the bound is exhausted",
  );
  assert.match(
    md,
    /NO_INVESTIGATION_TARGET/,
    "Phase 1 must exit with NO_INVESTIGATION_TARGET under --auto when no target can be resolved",
  );
});

test("manifest template documents tasks.bugfix_loop.reproduction_attempt_limit", () => {
  const yaml = read("templates/manifest-template.yaml");
  assert.match(yaml, /reproduction_attempt_limit/);
});
