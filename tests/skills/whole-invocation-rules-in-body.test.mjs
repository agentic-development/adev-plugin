// tests/skills/whole-invocation-rules-in-body.test.mjs
//
// Instructions that govern a WHOLE INVOCATION must live in SKILL.md itself, not
// behind a conditional-loading pointer.
//
// WHY THIS EXISTS. Progressive disclosure moves sections an agent needs only
// sometimes into references/. Three classes must not move, because they apply to
// every run of the skill regardless of which branch it takes:
//
//   1. the Load Skill Extensions block  — guarded by skills-extension-coverage
//   2. the dispatch-discipline rules    — guarded by skills-dispatch-turn-discipline
//   3. `## Prerequisites`               — guarded HERE
//
// The mechanical split carried all three out of at least one body, and (1) and
// (2) were caught by their existing guards. (3) had none: it was verified once
// by hand and then unpinned, which is exactly the posture the other two exist to
// prevent.
//
// The failure is the silent kind. skills/implement/SKILL.md's `--no-batch` /
// `--parallel` conflict check is only meaningful because EVERY invocation passes
// through Prerequisites before reaching Step 1/2/2.5 — Step 2.5 takes over
// entirely when --parallel routes there, bypassing Step 2's paragraph. Behind a
// pointer the section still reads coherently while ceasing to fire.
//
// These assertions read SKILL.md DIRECTLY. They are about WHERE an instruction
// lives, so readSkillSurface() would defeat them — see the scope note on that
// helper in tests/helpers.mjs.
//
// Spec: .context-index/specs/cross-cutting/skill-body-progressive-disclosure.spec.md

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

/**
 * Skills whose Prerequisites gate real preconditions. Kept explicit rather than
 * "every skill that has the heading", so that deleting the heading fails here
 * instead of quietly shrinking the guard's remit.
 */
const PREREQUISITE_SKILLS = ["implement", "validate", "build"];

const body = (slug) =>
  readFileSync(join(PLUGIN_ROOT, "skills", slug, "SKILL.md"), "utf8");

for (const slug of PREREQUISITE_SKILLS) {
  test(`${slug}: ## Prerequisites is in the body, not a companion`, () => {
    const md = body(slug);
    assert.ok(
      /^## Prerequisites\s*$/m.test(md),
      `skills/${slug}/SKILL.md must carry the "## Prerequisites" heading itself`,
    );

    // The heading alone is not enough: an extracted section leaves the heading
    // behind with a summary and a pointer. That shape is what this rejects.
    const start = md.indexOf("\n## Prerequisites");
    const rest = md.slice(start + 1);
    const nextH2 = rest.slice(3).search(/\n## /);
    const section = nextH2 === -1 ? rest : rest.slice(0, nextH2 + 3);

    assert.ok(
      !/Conditional loading/.test(section),
      `skills/${slug}/SKILL.md Prerequisites is behind a conditional-loading ` +
        `pointer — a precondition an agent may skip reading is not a precondition`,
    );
    assert.ok(
      !existsSync(join(PLUGIN_ROOT, "skills", slug, "references", "prerequisites.md")),
      `skills/${slug}/references/prerequisites.md exists — Prerequisites must ` +
        `not have a companion at all, or the body's copy will drift from it`,
    );
    assert.ok(
      section.length > 400,
      `skills/${slug}/SKILL.md Prerequisites is ${section.length} bytes — too ` +
        `short to be the real section, so it was probably reduced to a stub`,
    );
  });
}

test("implement's batch-flag conflict check is inside Prerequisites", () => {
  // The concrete case the invariant exists for. Asserted on the body's own
  // Prerequisites slice, not on the concatenated surface: reading the surface
  // would find CONFLICTING_BATCH_FLAGS wherever it appeared, including inside
  // the Step 2 companion, which is precisely the placement being ruled out.
  const md = body("implement");
  const start = md.indexOf("\n## Prerequisites");
  const rest = md.slice(start + 1);
  const nextH2 = rest.slice(3).search(/\n## /);
  const section = nextH2 === -1 ? rest : rest.slice(0, nextH2 + 3);

  assert.match(
    section,
    /CONFLICTING_BATCH_FLAGS/,
    "the --no-batch/--parallel conflict must be checked unconditionally, in " +
      "Prerequisites — Step 2.5 bypasses Step 2's own batch paragraph entirely",
  );
});
