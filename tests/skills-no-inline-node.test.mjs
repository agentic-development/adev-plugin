// tests/skills-no-inline-node.test.mjs
//
// Sweep-progress guard for the cli-driver-surface charter (Inline-Node
// Extraction Sweep). Scans canonical `skills/*/SKILL.md` files for the
// forbidden inline-Node patterns and fails if a non-allowlisted skill
// contains any of them.
//
// Spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// Plan: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.plan.md
//
// Forbidden patterns (per spec Behaviors 6, 7, and Constitution Anti-Pattern):
//   - "Run inline Node"   — step directive in SKILL.md prose
//   - `node --input-type=module -e` — heredoc invocation
//   - `node -e`           — bare invocation
//
// ALLOWLIST semantics (spec Behavior 7):
//   Skills that still contain inline-Node blocks are listed in ALLOWLIST.
//   Each extraction PR REMOVES one entry. Sweep completes when ALLOWLIST
//   is empty. The list never grows — that is enforced by code review and
//   by the regression-prevention pre-commit hook (spec Behavior 8).
//
// Scope (spec In Scope): canonical `skills/*/SKILL.md` ONLY. The mirrored
// `providers/*/skills/*/SKILL.md` trees are out of scope per the charter
// (provider-mirror sync is a follow-up charter).

import { test } from "node:test";
import assert from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, "..", "skills");

// The narrow `--input-type=module` qualifier is required so we do not
// over-match unrelated `--input-type=commonjs` usages (spec Behavioral
// Contract paragraph).
const FORBIDDEN = /Run inline Node|node\s+--input-type=module\s+-e|node\s+-e/;

// Seeded from
//   grep -rl "Run inline Node\|node --input-type=module -e\|node -e" skills/*/SKILL.md
// at Task 0 authoring time (2026-05-15). 15 canonical skills × 51 inline
// blocks remained at that point. Each extraction PR removed one entry once
// the skill's inline blocks all reached zero. Allowlist shrinks
// monotonically and is empty when the sweep is complete.
//
// PR 7 (long-tail PR 1 — context/state primitives bundle): build, hygiene,
// status reached zero inline blocks. Removed from allowlist.
//
// PR 8-9 (sweep finish): all 12 remaining skills converted. Allowlist is
// now empty. Acceptance sentinel (per spec Behavior 6 + AC 7): zero
// forbidden-regex matches across skills/*/SKILL.md AND empty ALLOWLIST.
export const ALLOWLIST = new Set();

function listSkillDirs() {
  return readdirSync(SKILLS_DIR)
    .filter((d) => {
      try {
        return statSync(join(SKILLS_DIR, d)).isDirectory();
      } catch {
        return false;
      }
    });
}

test("no inline-Node patterns in non-allowlisted SKILL.md files", () => {
  const violations = [];
  for (const skill of listSkillDirs()) {
    if (ALLOWLIST.has(skill)) continue;
    const path = join(SKILLS_DIR, skill, "SKILL.md");
    let content;
    try {
      content = readFileSync(path, "utf8");
    } catch {
      // No SKILL.md in this directory — not a canonical skill, skip.
      continue;
    }
    if (FORBIDDEN.test(content)) violations.push(skill);
  }
  assert.deepStrictEqual(
    violations,
    [],
    `Inline-Node patterns found in non-allowlisted SKILL.md files: ${violations.join(", ")}.\n` +
      `Either (a) remove the inline block and replace with an \`adev <verb>\` call, or\n` +
      `(b) if this is a known mid-sweep skill, add the skill name to ALLOWLIST in this file.\n` +
      `New SKILL.md files must NEVER introduce inline-Node patterns — only ALLOWLIST-shrinking is allowed.`,
  );
});

test("allowlisted skills actually contain inline-Node blocks (no stale entries)", () => {
  // If a skill is on the allowlist but contains zero inline-Node blocks,
  // that means an extraction PR forgot to shrink the allowlist. This test
  // catches stale entries so the allowlist tracks reality.
  const stale = [];
  for (const skill of ALLOWLIST) {
    const path = join(SKILLS_DIR, skill, "SKILL.md");
    let content;
    try {
      content = readFileSync(path, "utf8");
    } catch {
      // ALLOWLISTed skill has no SKILL.md — also stale.
      stale.push(skill);
      continue;
    }
    if (!FORBIDDEN.test(content)) stale.push(skill);
  }
  assert.deepStrictEqual(
    stale,
    [],
    `Stale ALLOWLIST entries (skill no longer contains inline-Node): ${stale.join(", ")}.\n` +
      `Remove these entries from ALLOWLIST in this file — the extraction is complete.`,
  );
});

test("ALLOWLIST is a Set of strings and not empty until sweep completes", () => {
  // Sweep-complete sentinel: when ALLOWLIST is empty, the entire sweep is
  // done. This test is intentionally weak — it accepts empty (final state).
  // The first two tests enforce the actual invariants.
  assert.ok(ALLOWLIST instanceof Set);
  for (const entry of ALLOWLIST) {
    assert.strictEqual(
      typeof entry,
      "string",
      `ALLOWLIST entries must be strings, got: ${typeof entry}`,
    );
  }
});
