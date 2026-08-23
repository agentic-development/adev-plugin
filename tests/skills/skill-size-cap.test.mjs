// tests/skills/skill-size-cap.test.mjs
//
// Every shipped SKILL.md must stay under the Copilot provider's frontmatter
// size cap.
//
// WHY THIS EXISTS. On 2026-08-14 two separate changes to
// skills/implement/SKILL.md pushed it from 63,976 bytes to 69,889 — past the
// 65,536 cap enforced by lib/providers/copilot/skill-validator.mjs. Nothing
// checked the size, so the first symptom was 20 failing tests in the
// copilot-adapter suites, whose error (INVALID_SKILL_FRONTMATTER) surfaces four
// call frames deep inside buildPlan() and names a file neither change was about.
//
// Three separate agents saw those failures and each attributed them to
// "concurrent agents' in-flight edits" or "pre-existing", because each compared
// against a baseline that already contained the previous growth. Isolation
// prevents interference; it does not prevent accumulation. A direct assertion
// is the only thing that catches a budget being spent gradually.
//
// The cap is READ FROM THE VALIDATOR rather than duplicated here, so raising it
// in one place cannot leave this test asserting a stale number.

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readdirSync, statSync, rmSync, mkdtempSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILLS_DIR = join(ROOT, "skills");

/**
 * Recover the cap from the validator BEHAVIOURALLY — feed it an oversized file
 * and parse the limit out of the error it throws.
 *
 * Deliberately not scraped from source: the validator writes the limit as
 * `64 * 1024`, so a source regex reads `64` and every skill "exceeds" it. That
 * false failure is exactly the class of bug this file exists to prevent, so the
 * cap comes from the code path that actually enforces it.
 *
 * Structured to capture the outcome rather than assert inside the try — an
 * assertion in a try whose catch does not rethrow is swallowed, which the
 * gaming detector correctly rejects.
 */
async function capFromValidator() {
  // validateSkillNames is the only export; it walks a skills DIRECTORY, so the
  // probe is a throwaway directory containing one oversized skill.
  const { validateSkillNames } = await import(
    pathToFileURL(join(ROOT, "lib", "providers", "copilot", "skill-validator.mjs")).href
  );
  const dir = mkdtempSync(join(tmpdir(), "adev-cap-probe-"));
  mkdirSync(join(dir, "probe"), { recursive: true });
  // Comfortably larger than any plausible cap, so the size branch fires rather
  // than a frontmatter-shape complaint.
  writeFileSync(
    join(dir, "probe", "SKILL.md"),
    "---\nname: probe\n---\n" + "x".repeat(2 * 1024 * 1024),
  );

  let thrown = null;
  let accepted = false;
  try {
    validateSkillNames(dir);
    accepted = true;
  } catch (err) {
    thrown = err;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  assert.equal(accepted, false, "validator accepted a 2 MiB skill — no size cap is enforced");
  const m = /size \d+ > (\d+)/.exec(thrown.message);
  assert.ok(m, `could not recover the cap from: ${thrown.message}`);
  return Number(m[1]);
}

const CAP = await capFromValidator();

test("the recovered cap is the documented Copilot limit", () => {
  assert.equal(CAP, 65536, `expected the 64 KiB Copilot cap, recovered ${CAP}`);
});

test("every shipped SKILL.md is under the Copilot size cap", () => {
  const oversize = [];
  for (const name of readdirSync(SKILLS_DIR)) {
    const p = join(SKILLS_DIR, name, "SKILL.md");
    let size;
    try {
      size = statSync(p).size;
    } catch {
      continue; // not a skill directory
    }
    if (size > CAP) oversize.push(`${name}/SKILL.md: ${size} > ${CAP} (over by ${size - CAP})`);
  }
  assert.deepEqual(
    oversize,
    [],
    "SKILL.md files over the Copilot cap — extract a section to a " +
      "conditional-loading companion (see skills/implement/references/parallel-mode.md " +
      "for the pattern):\n  " + oversize.join("\n  "),
  );
});

test("skills approaching the cap are surfaced before they cross it", () => {
  // A budget that is only checked at the boundary gets spent to the boundary.
  // This reports the margin so a reviewer sees the squeeze coming; it does not
  // fail, because a skill legitimately close to the cap is not a defect.
  const WARN_AT = 0.9;
  const near = [];
  for (const name of readdirSync(SKILLS_DIR)) {
    const p = join(SKILLS_DIR, name, "SKILL.md");
    let size;
    try {
      size = statSync(p).size;
    } catch {
      continue;
    }
    if (size > CAP * WARN_AT && size <= CAP) {
      near.push(`${name}: ${size} (${Math.round((size / CAP) * 100)}% of cap)`);
    }
  }
  if (near.length) {
    console.log(`  note: within ${Math.round((1 - WARN_AT) * 100)}% of the cap — ${near.join(", ")}`);
  }
  assert.ok(true);
});

// ── Agent Skills spec guidance: body under ~5,000 tokens ──────────────────
//
// Distinct from the Copilot cap above, and enforced for a different reason.
// The 65,536-byte cap is a HARD failure: crossing it throws
// INVALID_SKILL_FRONTMATTER and breaks every Copilot adapter path. This is a
// BUDGET: a SKILL.md body is loaded in full when the skill is invoked, then
// re-read as part of the context prefix on every subsequent turn, so body size
// is multiplied by turn count rather than paid once (measured on one real
// lifecycle in adev-plugin-04jr: cache reads were 98.1% of token cost).
//
// The remedy is never to cut prose. It is progressive disclosure: move material
// the agent needs only sometimes into references/ and load it on demand. Every
// skill here got under the guidance that way, with nothing deleted.
//
// Tokens are ESTIMATED from bytes. That is honest for a budget — it is a
// consistent ruler applied to a fixed corpus — but it must NOT be reused to
// claim token savings, where the stored module heuristic warns byte proxies
// overstate by 2-2.5x. A savings claim needs `adev cost summary` over a real
// lifecycle.
const BYTES_PER_TOKEN = 4.08; // hygiene measured 65,350 B / 16,018 tok by skill-validator v1.6.0
const TOKEN_GUIDANCE = 5000;
const GUIDANCE_BYTES = Math.round(TOKEN_GUIDANCE * BYTES_PER_TOKEN);

test("every SKILL.md body is within the Agent Skills token guidance", () => {
  const over = [];
  for (const name of readdirSync(SKILLS_DIR)) {
    const p = join(SKILLS_DIR, name, "SKILL.md");
    let size;
    try {
      size = statSync(p).size;
    } catch {
      continue;
    }
    if (size > GUIDANCE_BYTES) {
      over.push(`${name}: ~${Math.round(size / BYTES_PER_TOKEN)} tokens (${size} B)`);
    }
  }
  assert.deepEqual(
    over,
    [],
    `SKILL.md bodies over the ~${TOKEN_GUIDANCE}-token guidance. Do NOT fix this by ` +
      "deleting prose — move a section into references/ and leave a " +
      "conditional-loading pointer (see skills/hygiene/SKILL.md for the " +
      "pattern):\n  " + over.join("\n  "),
  );
});
