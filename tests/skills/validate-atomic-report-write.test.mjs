/**
 * Doc test: skills/validate/SKILL.md must describe the atomic write protocol
 * for the .validate.md report and reference the `adev artifact commit` verb.
 *
 * Filed per epic-85 / issue-496 (validation charter build retro 2026-05-16).
 *
 * This test locks the verb to the skill: if the SKILL.md edit is reverted
 * but `lib/cli/artifact.mjs` remains, validation reports would silently
 * fall back to the non-atomic Write-to-final-path flow that caused the
 * missing .validate.md during the original retro's build.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillSurface } from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(__dirname, "../../skills/validate/SKILL.md");

describe("validate SKILL.md — atomic .validate.md write protocol (issue-496)", () => {
  const content = readSkillSurface("validate");

  it("instructs the skill to write to a .tmp file before committing (+3 more contract assertions)", () => {
    // instructs the skill to write to a .tmp file before committing
    assert.match(
    content,
    /\.validate\.md\.tmp/,
    "SKILL.md should reference the <spec-slug>.validate.md.tmp path",
    );

    // references the `adev artifact commit` verb for the final rename
    assert.match(
    content,
    /adev artifact commit/,
    "SKILL.md should invoke `adev artifact commit` to finalize the report",
    );

    // passes --kind validate to the commit verb
    assert.match(
    content,
    /adev artifact commit[^\n]*--kind\s+validate/,
    "the artifact commit invocation should specify --kind validate",
    );

    // passes --spec pointing to the .spec.md path
    assert.match(
    content,
    /adev artifact commit[^\n]*--spec[^\n]*\.spec\.md/,
    "the artifact commit invocation should reference the .spec.md path",
    );
  });

  it("explains why the two-step write is necessary (avoid partial reports)", () => {
    // The instruction body should mention the failure mode the verb mitigates
    // so a future editor understands the rationale and does not "simplify"
    // back to a single Write call.
    const lower = content.toLowerCase();
    const mentionsAtomic =
      lower.includes("atomic") ||
      lower.includes("partial") ||
      lower.includes("mid-write") ||
      lower.includes("truncat");
    assert.ok(
      mentionsAtomic,
      "SKILL.md should explain the atomic / mid-write / truncation rationale",
    );
  });

  it("does NOT instruct a direct Write to the canonical .validate.md", () => {
    // Catch a future regression where someone reverts the protocol to a
    // direct write. The literal instruction "Write ... to <...>.validate.md"
    // without `.tmp` is the smell. We allow references to `.validate.md` in
    // prose (e.g., the migration footer), but not as a write target.
    //
    // Heuristic: look for the legacy instruction "Write the validation
    // report to ... .validate.md" without a .tmp suffix nearby.
    const legacyDirectWrite =
      /Write the validation report to[^.]*\.validate\.md\b(?!\.tmp)/;
    assert.ok(
      !legacyDirectWrite.test(content),
      "SKILL.md must not direct a Write to the canonical .validate.md path; use the .tmp + commit flow",
    );
  });
});
