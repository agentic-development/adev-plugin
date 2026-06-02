// tests/skills/completion-tokens.test.mjs
//
// Drift guard for the completion-tokens cross-cutting charter (/goal-friendly
// terminal tokens). Asserts that the canonical terminal SKILL.md files instruct
// emitting a transcript-provable `ADEV-<SKILL>: <STATE>` token as their final
// line, and that the persona overlay exempts those tokens from trimming.
//
// Spec: .context-index/specs/cross-cutting/completion-tokens/completion-tokens.spec.md
// Plan: .context-index/specs/cross-cutting/completion-tokens/completion-tokens.plan.md
//
// Scope: canonical `skills/*/SKILL.md` only — provider mirrors under
// `providers/*/skills/` are regenerated from these by scripts/sync-provider-skills.mjs.

import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

// The canonical token grammar from the spec (Behavior B8 / acceptance criteria).
const TOKEN_GRAMMAR = /^ADEV-[A-Z]+: [A-Z_]+$/;

function assertGrammar(token) {
  assert.ok(
    TOKEN_GRAMMAR.test(token),
    `token "${token}" must match the completion-token grammar ^ADEV-[A-Z]+: [A-Z_]+$`,
  );
}

test("validate SKILL.md emits the ADEV-VALIDATE completion token", () => {
  const md = read("skills/validate/SKILL.md");
  for (const tok of ["ADEV-VALIDATE: PASS", "ADEV-VALIDATE: FAIL"]) {
    assertGrammar(tok);
    assert.ok(
      md.includes(tok),
      `skills/validate/SKILL.md must instruct emitting "${tok}"`,
    );
  }
  // The directive must tie the token to being the final/last line of output.
  assert.match(
    md,
    /ADEV-VALIDATE[\s\S]{0,400}?(final line|last line)|(final line|last line)[\s\S]{0,400}?ADEV-VALIDATE/i,
    "validate SKILL.md must require the ADEV-VALIDATE token as the final line of output",
  );
});

test("build SKILL.md emits the ADEV-BUILD completion token with all three states", () => {
  const md = read("skills/build/SKILL.md");
  for (const tok of ["ADEV-BUILD: COMPLETE", "ADEV-BUILD: FAILED", "ADEV-BUILD: BLOCKED"]) {
    assertGrammar(tok);
    assert.ok(
      md.includes(tok),
      `skills/build/SKILL.md must instruct emitting "${tok}"`,
    );
  }
  assert.match(
    md,
    /ADEV-BUILD[\s\S]{0,400}?(final line|last line)|(final line|last line)[\s\S]{0,400}?ADEV-BUILD/i,
    "build SKILL.md must require the ADEV-BUILD token as the final line of output",
  );
  // The BLOCKED state must be pinned to the convergence stop-verdicts (spec B5).
  for (const verdict of ["BUDGET_EXHAUSTED", "NO_PROGRESS", "REGRESSED", "PASS_PENDING_HUMAN"]) {
    assert.ok(
      md.includes(verdict),
      `build SKILL.md must map the convergence verdict "${verdict}" to ADEV-BUILD: BLOCKED`,
    );
  }
});

test("using-adev persona overlay exempts completion tokens from trimming", () => {
  const md = read("skills/using-adev/SKILL.md");
  assert.match(
    md,
    /## Persona Output Override/,
    "using-adev SKILL.md must have a Persona Output Override section",
  );
  assert.match(
    md,
    /completion token/i,
    "the persona overlay must name completion tokens as persona-exempt output",
  );
});
