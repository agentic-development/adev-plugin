// tests/evals/skill-disclosure/artifact-shape.eval.mjs
//
// TIER 2 — artifact shape. Free, static, no dispatch.
//
// Progressive disclosure can change WHAT a skill produces without changing whether a
// string exists somewhere in its surface. The instruction that says "emit section X"
// still ships; it just moved into a companion the agent may not open on this path.
//
// This tier asks a cheaper question than "did the agent behave the same": it asks
// whether the skill still *instructs* the same artifact shape, and whether the
// instruction sits somewhere the agent on that path will actually reach.
//
// Concretely, for each skill that writes a lifecycle artifact: the sections that
// artifact must contain are enumerated here, and each must be named either in the
// body (always read) or in a companion the body points at (reachable). A section
// named ONLY in an unreachable file is the regression — it is still in the repo, so
// every prose assertion passes, and no agent will ever be told to emit it.
//
// Deliberately NOT an LLM judge and not a diff of generated output. Both are Tier 3.
//
// Run: node --test tests/evals/skill-disclosure/artifact-shape.eval.mjs
// (excluded from `npm test` by the tests/evals/ rule in scripts/run-tests.mjs)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Artifact contracts. Each entry: a skill, and the section headings the artifact it
 * writes must carry. Sourced from the skills' own report/output templates — these are
 * the shapes downstream skills and humans depend on.
 */
/**
 * Anchors are CONTENT, never headings.
 *
 * The first version of this file listed section headings — and a heading is exactly
 * what progressive disclosure LEAVES BEHIND in the body as a stub. So the string was
 * always reachable, the check could not fail, and a probe that removed a pointer
 * still passed. Each anchor below is a phrase that lives only in the companion
 * carrying the substance, so losing the pointer to that companion strands it.
 */
const CONTRACTS = [
  {
    skill: "validate",
    artifact: ".validate.md",
    anchors: [
      { section: "Overall Status", text: "__NONE__" },
      { section: "Report Format", text: "Note for users comparing with historic reports:" },
    ],
  },
  {
    skill: "review-specs",
    artifact: ".review.md",
    anchors: [
      { section: "Disabled Reviewers", text: "no reason given" },
      { section: "Reviewers Dispatched", text: "Prompt/Skill" },
    ],
  },
  {
    skill: "plan",
    artifact: ".plan.md",
    anchors: [
      { section: "Test Infrastructure Requirements", text: "Context to load:" },
    ],
  },
];

/** The body plus every companion the body can reach, following pointers transitively. */
function reachableSurface(skill) {
  const bodyPath = join(ROOT, "skills", skill, "SKILL.md");
  const body = readFileSync(bodyPath, "utf8");
  const seen = new Map([[`skills/${skill}/SKILL.md`, body]]);

  const queue = [body];
  while (queue.length) {
    const text = queue.shift();
    for (const m of text.matchAll(
      /<ADEV_ROOT>\/(skills\/[a-z-]+\/(?:references|scripts)\/[A-Za-z0-9._/-]+?\.(?:md|ya?ml))/g,
    )) {
      const rel = m[1];
      if (seen.has(rel)) continue;
      const abs = join(ROOT, rel);
      if (!existsSync(abs)) continue;
      const t = readFileSync(abs, "utf8");
      seen.set(rel, t);
      queue.push(t);
    }
  }
  return seen;
}

for (const { skill, artifact, anchors } of CONTRACTS) {
  test(`${skill}: every ${artifact} section is reachable from the body`, () => {
    const surface = reachableSurface(skill);
    const joined = [...surface.values()].join("\n");

    const unreachable = [];
    for (const { section, text } of anchors) {
      if (!joined.includes(text)) unreachable.push(`${section} — anchor "${text}" not reachable`);
    }
    assert.deepEqual(
      unreachable,
      [],
      `${skill} no longer names these ${artifact} sections anywhere reachable from ` +
        `its body — the artifact contract is broken for anyone following the ` +
        `conditional-loading pointers:\n  ` + unreachable.join("\n  "),
    );
  });

  test(`${skill}: no ${artifact} section is stranded in an unreachable file`, () => {
    // The regression this tier exists for. A section named ONLY in a companion that
    // nothing points at still satisfies every prose assertion in tests/, because
    // those read the whole tree. It is invisible to an agent, which reads only what
    // the body sends it to.
    const reachable = reachableSurface(skill);
    const reachableText = [...reachable.values()].join("\n");

    const skillDir = join(ROOT, "skills", skill);
    const all = [];
    const walk = (d) => {
      if (!existsSync(d)) return;
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".md")) all.push(p);
      }
    };
    walk(join(skillDir, "references"));

    const stranded = [];
    for (const { section, text } of anchors) {
      if (reachableText.includes(text)) continue;
      for (const f of all) {
        if (readFileSync(f, "utf8").includes(text)) {
          stranded.push(`${section} -> substance only in ${f.replace(ROOT + "/", "")}, which no pointer chain reaches`);
        }
      }
    }
    assert.deepEqual(
      stranded,
      [],
      `${skill} sections exist on disk but in files no pointer chain reaches:\n  ` +
        stranded.join("\n  "),
    );
  });
}
