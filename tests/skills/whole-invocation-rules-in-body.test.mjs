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
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

/**
 * Skills that MUST carry `## Prerequisites` in the body. Listed explicitly so
 * that deleting the heading fails here rather than quietly shrinking the guard's
 * remit — "every skill that currently has it" would let a relocation pass by
 * making itself out of scope.
 *
 * This is the full set that has the section today, not a sample. An earlier
 * version pinned only implement/validate/build, which was 3 of the 21 bodies
 * BEH-6 states the rule for unqualified: the other 18 could be relocated behind
 * a conditional-loading pointer with nothing failing.
 */
const REQUIRED_PREREQUISITE_SKILLS = [
  "assess",
  "brainstorm",
  "build",
  "codehealth",
  "deploy",
  "eval",
  "hygiene",
  "implement",
  "issues",
  "learn",
  "prototype",
  "reconcile",
  "recover",
  "research",
  "retro",
  "route",
  "sample",
  "specify",
  "status",
  "validate",
  "work",
];
const PREREQUISITE_SKILLS = REQUIRED_PREREQUISITE_SKILLS;

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
    // No length floor. An extracted section leaves a very specific shape behind —
    // a summary line plus a `> **Conditional loading:**` pointer — and the two
    // assertions above catch exactly that. A byte threshold tuned to
    // implement/validate/build would reject the legitimately short Prerequisites
    // that skills like `learn` and `issues` carry, which is how a guard ends up
    // scoped to whichever skills happened to pass it.
    assert.ok(
      section.trim().length > 0,
      `skills/${slug}/SKILL.md has an empty Prerequisites section`,
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

// ── Invariant 3: every companion pointer carries the <ADEV_ROOT> anchor ──────
//
// Stated by the spec, previously enforced by nothing. A bare `skills/...`
// pointer is repo-root-relative: cursor publishes to `~/.cursor/skills/adev-<name>/`,
// copilot under `.github/` or `~/.copilot/`, codex to `~/.agents/skills/<name>/`,
// and in a user project the agent's cwd is the *project* root — so the bare form
// resolves to nothing, or binds to a same-named file in a project-owned skills/
// tree that the pointer prose then tells the agent to trust.
//
// This sweep is the guard. It has to exist separately from resolveSkillPointer()
// because a resolver that accepts both forms cannot be what enforces one.
test("every companion pointer in skills/** is <ADEV_ROOT>-anchored", () => {
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(md|ya?ml)$/.test(e.name)) out.push(p);
    }
    return out;
  };

  const bare = [];
  let anchored = 0;
  for (const f of walk(join(PLUGIN_ROOT, "skills"))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(
      /(<ADEV_ROOT>\/)?skills\/[a-z-]+\/(?:references|scripts)\/[A-Za-z0-9._/-]+/g,
    )) {
      if (m[1]) anchored++;
      else bare.push(`${f.replace(PLUGIN_ROOT + "/", "")}: ${m[0]}`);
    }
  }

  assert.ok(anchored > 100, `only ${anchored} anchored pointers found — sweep is not running`);
  assert.deepEqual(
    [...new Set(bare)],
    [],
    "unanchored companion pointers (Invariant 3) — prefix each with <ADEV_ROOT>/:\n  " +
      [...new Set(bare)].join("\n  "),
  );
});
