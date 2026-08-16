import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import { loadReviewConfig } from "../../lib/governance/review-config.mjs";
import { resolveExtends } from "../../lib/governance/context-pack.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

// Reviewers are no longer bundled-by-default (explicit-governance-registries
// removed the three-layer merge): a project's own materialized review.yaml is
// now the whole reviewer set. This mirrors what `adev governance materialize`
// writes from `templates/domains/software/reviewers.yaml`, and is what makes a
// fresh temp project exercise the same bundled prompts this test targets.
const MATERIALIZED_REVIEW_YAML = `reviewers:
  - id: structural-architect
    name: Structural Architect
    dispatch: always
    profile: reviewer-reasoning
    context_pack: architecture
    severity_cap: blocker
    prompt: plugin:review-specs/structural-architect-prompt.md
    source: domain:software
  - id: security-reviewer
    name: Security Reviewer
    dispatch: always
    profile: reviewer-capable
    context_pack: security
    severity_cap: blocker
    prompt: plugin:review-specs/security-reviewer-prompt.md
    source: domain:software
  - id: consistency-analyzer
    name: Consistency Analyzer
    dispatch: always
    profile: reviewer-fast
    context_pack: consistency
    severity_cap: blocker
    prompt: plugin:review-specs/consistency-analyzer-prompt.md
    source: domain:software
materialized_at: 2026-08-16T00:00:00.000Z
`;

// CON-1: the heading is `## Input`; "You will receive:" is body text below it,
// and consistency-analyzer-prompt.md is currently the ONLY bundled prompt with
// such a section. The coverage assertion below stops this passing vacuously.
//
// WHAT THIS TEST PROVES — AND WHAT IT DOES NOT:
//   * One-directional by design. It checks bullets → titles only: a prompt may
//     not promise context the pack does not deliver. A *titled include with no
//     bullet* is NOT flagged. That asymmetry is deliberate (Behavior 22q closes
//     "promising undelivered context", not "delivering unannounced context");
//     a bijection would over-constrain packs that legitimately carry more than
//     a prompt enumerates.
//   * Matching is loose substring in both directions, so false positives are
//     possible — a short title (`ADRs`) could be satisfied by incidental prose,
//     and the `t.includes(b)` direction lets a vague bullet ("Specs") satisfy a
//     specific title ("Sibling Specs"). It catches wording drift, not nuance.
//   * Exactly ONE bullet is exempt, by exact match, not substring: the target
//     spec is appended as its own fenced block by buildDispatch and is not a
//     pack include. An exact match keeps a future bullet that merely mentions
//     the phrase (e.g. "Specs adjacent to the target spec") in scope.
//   * Formatting-sensitive. Only `- ` bullets at column 0 under a literal
//     `## Input` heading are seen; `* `, indented sub-bullets, or a renamed
//     heading make the section invisible. `entries.length >= 1` guards total
//     invisibility only, not a partially-missed list.
//
// NOTE: JS has no \Z; the lookahead means "next H2 or end of input".
const INPUT_SECTION_RE = /^## Input\s*$([\s\S]*?)(?=^## |$(?![\s\S]))/m;

// Appended separately by buildDispatch as a fenced target-spec block, so it is
// legitimately absent from the pack's titled includes. Exact match only.
const TARGET_SPEC_BULLET = "the target spec being reviewed";

/** @returns {string[]|null} bullets under `## Input`, or null when there is no such section. */
function inputBullets(promptText) {
  const m = promptText.match(INPUT_SECTION_RE);
  return m === null
    ? null
    : m[1].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim());
}

/** Reviewers in subagent (prompt) mode that declare an `## Input` section. */
function reviewersWithInputSection(cfg) {
  return cfg.reviewers
    .filter((r) => Boolean(r.promptPath))
    .map((r) => ({ reviewer: r, bullets: inputBullets(readFileSync(r.promptPath, "utf8")) }))
    .filter((entry) => entry.bullets !== null);
}

describe("Behavior 22q — bundled prompt Input bullets map to titled pack includes", () => {
  test("at least one bundled prompt declares an Input section", () => {
    const repo = createTempDir();
    try {
      writeFixture(repo, ".context-index/governance/review.yaml", MATERIALIZED_REVIEW_YAML);
      const cfg = loadReviewConfig(repo);
      const withInput = reviewersWithInputSection(cfg);
      assert.ok(
        withInput.length >= 1,
        "no bundled prompt has an ## Input section — assertion would be vacuous"
      );
    } finally {
      cleanupTempDir(repo);
    }
  });

  test("every Input bullet maps to a titled include in that reviewer's resolved pack", () => {
    const repo = createTempDir();
    try {
      writeFixture(repo, ".context-index/governance/review.yaml", MATERIALIZED_REVIEW_YAML);
      const cfg = loadReviewConfig(repo);
      const entries = reviewersWithInputSection(cfg);
      assert.ok(entries.length >= 1, "no bundled prompt has an ## Input section — assertion would be vacuous");
      for (const { reviewer, bullets } of entries) {
        const { includes, errors } = resolveExtends(reviewer.context_pack, cfg.contextPacks);
        assert.equal(errors.length, 0, JSON.stringify(errors));
        const titles = includes.map((i) => (i?.title ?? "").toLowerCase());
        // The target spec is interpolated separately and is not a pack include.
        const packBullets = bullets.filter((b) => b.toLowerCase() !== TARGET_SPEC_BULLET);
        for (const bullet of packBullets) {
          const b = bullet.toLowerCase();
          assert.ok(
            titles.some((t) => t && (b.includes(t) || t.includes(b.replace(/^the /, "")))),
            `${reviewer.id}: Input bullet "${bullet}" has no titled include in pack '${reviewer.context_pack}' (titles: ${titles.join(", ")})`
          );
        }
      }
    } finally {
      cleanupTempDir(repo);
    }
  });
});
