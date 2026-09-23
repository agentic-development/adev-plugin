// tests/skills-dispatch-turn-discipline.test.mjs
//
// Coverage test for the subskill-turn-end-stall bug
// (adev-plugin-subskill-turn-end-stall-9hmh): a dispatching skill that
// backgrounds an Agent() call, or that ends its own turn to wait for one,
// strands the pipeline — nothing wakes a subagent that has already yielded.
// skills/build/SKILL.md and skills/implement/SKILL.md already carried the
// "don't background" rule; nothing anywhere carried the "don't end your
// turn waiting" rule, and four dispatching skills (plan, validate, eval,
// research, write-test) carried neither.
//
// Spec: .context-index/specs/cross-cutting/universal-skill-extensions.spec.md
// documents the sibling precedent this test models itself on
// (tests/skills-extension-coverage.test.mjs): verbatim per-skill
// restatement enforced by a coverage test, not a shared runtime include —
// this repo has no markdown-include mechanism, so a shared fragment would
// be new infrastructure with no other user.

import { test } from "node:test";
import assert from "node:assert";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, "..", "skills");

// Deliberately hand-curated, not grep-derived at test time: a generic
// "dispatch|subagent" grep also matches route, recover, hygiene, and
// sample, none of which call the Agent tool themselves (they describe
// dispatch that some *other* skill performs, or hand off via a suggested
// follow-up command rather than a live Agent() call). Verified by reading
// each candidate's dispatch prose before inclusion. Update this list by the
// same method — read the candidate skill, confirm it issues its own
// Agent({...}) call — when a skill starts or stops dispatching subagents.
const DISPATCHING_SKILLS = [
  "build",
  "implement",
  "review-specs",
  "plan",
  "brainstorm",
  "validate",
  "eval",
  "research",
  "write-test",
];

// Anchor substring already present in build/SKILL.md and implement/SKILL.md
// before this fix; extended verbatim to every other dispatching skill so
// grepping the corpus for the sync-dispatch rule finds one consistent
// phrase everywhere it is required.
const SYNC_DISPATCH_ANCHOR = "backgrounds Agent dispatches by default";

// Verbatim across all nine files (see fix commit) — the rule this issue
// found nowhere in the corpus at all. Kept as one literal string, not
// composed fragments, so a future edit that quietly weakens the wording in
// one file trips this test instead of drifting silently.
const NO_WAIT_ANCHOR = "Never end your turn to wait for a dispatched subagent.";

// The stale pseudo-syntax this issue found verbatim in plan and brainstorm.
// `Agent` is the only dispatch mechanism this repo's skills use; `Task tool`
// was left over from an earlier harness API and never actually executes.
const STALE_DISPATCH_SYNTAX = /Task tool \(general-purpose\)/;

function listSkillDirs() {
  return readdirSync(SKILLS_DIR)
    .filter((d) => {
      try {
        return statSync(join(SKILLS_DIR, d)).isDirectory();
      } catch {
        return false;
      }
    })
    .filter((d) => {
      try {
        return statSync(join(SKILLS_DIR, d, "SKILL.md")).isFile();
      } catch {
        return false;
      }
    });
}

for (const slug of DISPATCHING_SKILLS) {
  test(`skills/${slug}/SKILL.md states the synchronous-dispatch rule`, () => {
    const path = join(SKILLS_DIR, slug, "SKILL.md");
    const md = readFileSync(path, "utf8");
    assert.ok(
      md.includes(SYNC_DISPATCH_ANCHOR),
      `skills/${slug}/SKILL.md dispatches subagents but does not state the ` +
        `"${SYNC_DISPATCH_ANCHOR}" rule — a backgrounded Agent() dispatch ` +
        `returns a task ID instead of a result and stalls the pipeline.`
    );
  });

  test(`skills/${slug}/SKILL.md states the don't-wait-for-a-dispatch rule`, () => {
    const path = join(SKILLS_DIR, slug, "SKILL.md");
    const md = readFileSync(path, "utf8");
    assert.ok(
      md.includes(NO_WAIT_ANCHOR),
      `skills/${slug}/SKILL.md dispatches subagents but does not state ` +
        `that ending a turn to wait for one is a protocol violation ` +
        `(adev-plugin-subskill-turn-end-stall-9hmh).`
    );
  });
}

test("no companion under skills/*/references/ contains stale dispatch syntax", () => {
  // The sweep below covers SKILL.md bodies. Progressive disclosure moved a large
  // amount of dispatch prose into references/ companions, and this guard did not
  // follow it — so the corpus it protects shrank silently as the split landed.
  // At the time this was added exactly one file still carried the stale form: an
  // ORPHANED duplicate of brainstorm's charter-reviewer prompt, unreferenced by
  // any skill, which is how it survived. It was deleted; this keeps the class shut.
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (e.name.endsWith(".md")) out.push(p);
    }
    return out;
  };
  const offenders = [];
  let scanned = 0;
  for (const slug of DISPATCHING_SKILLS) {
    const refs = join(SKILLS_DIR, slug, "references");
    if (!existsSync(refs)) continue;
    for (const f of walk(refs)) {
      scanned++;
      if (STALE_DISPATCH_SYNTAX.test(readFileSync(f, "utf8"))) {
        offenders.push(f.replace(SKILLS_DIR + "/", ""));
      }
    }
  }
  assert.ok(scanned > 0, "no companions scanned — the sweep is not running");
  assert.deepEqual(
    offenders,
    [],
    "companions using the stale `Task tool (general-purpose)` form, which never " +
      "executes — use `Agent({...})`:\n  " + offenders.join("\n  "),
  );
});

test("no skills/*/SKILL.md contains stale 'Task tool (general-purpose)' dispatch syntax", () => {
  const offenders = [];
  for (const slug of listSkillDirs()) {
    const path = join(SKILLS_DIR, slug, "SKILL.md");
    const md = readFileSync(path, "utf8");
    if (STALE_DISPATCH_SYNTAX.test(md)) offenders.push(slug);
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Stale "Task tool (general-purpose)" dispatch syntax found in: ${offenders.join(", ")}. ` +
      `The dispatch mechanism is the Agent tool (Agent({...})) — Task tool never existed.`
  );
});
