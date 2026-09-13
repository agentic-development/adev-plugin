// tests/skills/debug-completion-and-auto.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillSurface } from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

test("debug SKILL.md declares --auto in the Arguments section (BEH-5)", () => {
  const md = readSkillSurface("debug");
  assert.match(
    md,
    /## Arguments[\s\S]{0,600}--auto/,
    "Arguments section must document --auto",
  );
});

test("debug SKILL.md skips the interactive ADR prompt under --auto and records a note instead (BEH-5)", () => {
  const md = readSkillSurface("debug");
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
  const md = readSkillSurface("debug");
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
  const md = readSkillSurface("debug");
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

test("debug SKILL.md writes a FAILING-CHECKS block into issue notes on the PARKED path under --auto (BEH-8, RI-1 fix)", () => {
  const md = readSkillSurface("debug");
  assert.match(md, /FAILING-CHECKS:/, "Phase 6 must define the FAILING-CHECKS: notes block");
  // RI-1: the FAILING-CHECKS write must land in the SAME update() call the
  // PARKED branch already makes -- not a separate write, and not a false
  // claim that format-note is invoked on this branch.
  assert.match(
    md,
    /Fix applied but not yet validated[\s\S]{0,400}FAILING-CHECKS|FAILING-CHECKS[\s\S]{0,400}Fix applied but not yet validated/,
    "the FAILING-CHECKS block must be appended to the existing PARKED-path notes string, in the same update() call",
  );
});

test("debug SKILL.md merges Phase 6 step 3's insight note into step 4's single update() call, for both the closing and parking branch (BEH-5/BEH-8 wiring)", () => {
  const md = readSkillSurface("debug");
  const step4Idx = md.indexOf("Update issue board with confidence");
  assert.ok(step4Idx !== -1, "Phase 6 step 4 heading must exist");
  const step4Window = md.slice(step4Idx, step4Idx + 2500);
  assert.match(
    step4Window,
    /insight note/i,
    "step 4 must reference merging step 3's insight note into its update() call(s)",
  );
  assert.match(
    step4Window,
    /FAILING-CHECKS[\s\S]{0,600}insight note|insight note[\s\S]{0,600}FAILING-CHECKS/i,
    "the PARKED branch must concatenate FAILING-CHECKS and the insight note in the same update() call",
  );
});

test("debug SKILL.md resolves ADEV_ISSUE_OWNER for both claim and release (BEH-9, RI-2 fix)", () => {
  const md = readSkillSurface("debug");
  assert.match(md, /ADEV_ISSUE_OWNER/, "Phase 1.6 must document ADEV_ISSUE_OWNER resolution");
  // RI-2: the same resolved owner value must be reused at the release call,
  // not re-derived as a second hardcoded "${USER}/local" literal.
  const claimIdx = md.indexOf("adev issues claim");
  const releaseIdx = md.indexOf("adev issues release");
  assert.ok(claimIdx !== -1 && releaseIdx !== -1, "both claim and release commands must be present");
  const releaseWindow = md.slice(releaseIdx, releaseIdx + 400);
  assert.match(
    releaseWindow,
    /ADEV_ISSUE_OWNER|resolved owner|same owner/i,
    "the release command must reuse the ADEV_ISSUE_OWNER-resolved owner, not a fresh hardcoded literal",
  );
});

test("using-adev persona overlay names ADEV-DEBUG as persona-exempt (BEH-6)", () => {
  const md = read("skills/using-adev/SKILL.md");
  assert.match(md, /## Persona Output Override/);
  assert.match(
    md,
    /ADEV-DEBUG/,
    "the persona overlay must explicitly name ADEV-DEBUG in the completion-token exemption bullet",
  );
});
