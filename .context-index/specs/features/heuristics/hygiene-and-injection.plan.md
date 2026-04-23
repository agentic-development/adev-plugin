# Implementation Plan: Hygiene and Injection

> **Methodology:** adev
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Spec:** .context-index/specs/features/heuristics/hygiene-and-injection.md
> **Review:** PASS_WITH_NOTES (2026-04-23)
> **Platform:** Node.js, JavaScript ESM, node:test

**Goal:** Add hygiene Pass 16 (heuristic index staleness + orphan tags) and widen heuristic injection to debug, brainstorm, specify, review-specs, and validate skills.

**Architecture:** Two independent work streams. Hygiene: add Pass 16 instructions to `skills/hygiene/SKILL.md` with `--check heuristics` routing and `--fix` auto-sync. Injection: add `retrieveHeuristics` calls to 5 existing SKILL.md files following the established pattern from implement and plan injection. All changes are skill markdown edits — no new library code needed.

---

## File Structure

**Modify:**
- `skills/hygiene/SKILL.md` — Add Pass 16: Heuristic Index Health
- `skills/debug/SKILL.md` — Add heuristic injection in Phase 1
- `skills/brainstorm/SKILL.md` — Add heuristic injection in Step 1
- `skills/specify/SKILL.md` — Add heuristic injection in Step 2
- `skills/review-specs/SKILL.md` — Add heuristics in reviewer context
- `skills/validate/SKILL.md` — Add heuristic injection in validation context

**Create:**
- `tests/skills/hygiene-heuristic-pass.test.mjs` — Tests for Pass 16
- `tests/skills/heuristic-injection-widening.test.mjs` — Tests for 5 skill injections

**Reference (read, do not modify):**
- `skills/implement/SKILL.md` — Existing injection pattern to follow
- `skills/plan/SKILL.md` — Existing injection pattern to follow
- `lib/heuristics.mjs` — retrieveHeuristics API

## Context Packets

### Task 1 Context
- Spec: `hygiene-and-injection.md` (criteria 1-4)
- Charter: `charter.md` (capability: Hygiene Pass 16)
- Reference: `skills/hygiene/SKILL.md` (existing 15 passes)

### Task 2 Context
- Spec: `hygiene-and-injection.md` (criteria 5-11)
- Charter: `charter.md` (capabilities: Debug/Brainstorm/Specify/Review-Specs/Validate Injection)
- Reference: `skills/implement/SKILL.md` (injection pattern, Step 1 item 11)
- Reference: `skills/plan/SKILL.md` (injection pattern, Step 2 item 12)

## Parallelization

- Group A: Task 1 (hygiene pass)
- Group B: Task 2 (skill injection)
- Groups A and B are independent and can run in parallel

---

### Task 1: Hygiene Pass 16 — Heuristic Index Health [specialist: none]

**Charter capability:** Hygiene Pass 16
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/hygiene/SKILL.md`
- Test: `tests/skills/hygiene-heuristic-pass.test.mjs`

**Tests:** `tests/skills/hygiene-heuristic-pass.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skillContent = readFileSync(
  new URL("../../skills/hygiene/SKILL.md", import.meta.url), "utf8"
);

describe("hygiene SKILL.md Pass 16", () => {
  it("defines Pass 16: Heuristic Index Health", () => {
    assert.ok(skillContent.includes("Pass 16") || skillContent.includes("Audit Pass 16"));
  });
  it("defines STALE_INDEX check", () => {
    assert.ok(skillContent.includes("STALE_INDEX"));
  });
  it("defines ORPHAN_TAG check", () => {
    assert.ok(skillContent.includes("ORPHAN_TAG"));
  });
  it("supports --check heuristics flag", () => {
    assert.ok(skillContent.includes("heuristics") && skillContent.includes("--check"));
  });
  it("supports --fix auto-sync for STALE_INDEX", () => {
    assert.ok(skillContent.includes("--fix") && skillContent.includes("sync"));
  });
  it("reports SKIP when store directory missing", () => {
    assert.ok(skillContent.includes("SKIP") || skillContent.includes("No heuristic store"));
  });
  it("references retrieveHeuristics or readHeuristics", () => {
    assert.ok(skillContent.includes("retrieveHeuristics") || skillContent.includes("readHeuristics"));
  });
  it("references Learned Lessons section in sync targets", () => {
    assert.ok(skillContent.includes("Learned Lessons"));
  });
});
```

- [ ] **Verify test fails** — Run: `node --test tests/skills/hygiene-heuristic-pass.test.mjs`

- [ ] **Implement**

Add `## Audit Pass 16: Heuristic Index Health` to `skills/hygiene/SKILL.md` after Pass 15. Also update the `--check` argument list to include `heuristics`.

```markdown
## Audit Pass 16: Heuristic Index Health

**Goal:** Verify heuristic index in sync targets is current and tags are well-distributed.

**Steps:**

1. Check if `.context-index/memory/heuristics/` exists. If not, report SKIP:
   "No heuristic store found — nothing to audit."

2. **STALE_INDEX check:** Read all heuristics via `readHeuristics(projectRoot, { minConfidence: 'high' })`.
   For each sync target in `manifest.yaml`, read the file and extract the `## Learned Lessons` section.
   Compare: any high-confidence heuristic whose title is not present in any sync target's
   Learned Lessons section is flagged as STALE_INDEX (severity: warn).

3. **ORPHAN_TAG check:** Read all scope files. Collect every `tags` entry across all heuristics.
   Count occurrences of each tag. Any tag appearing exactly once is flagged as ORPHAN_TAG
   (severity: info) with a suggestion to normalize or remove.

4. If no STALE_INDEX and no ORPHAN_TAG findings: report PASS with count of indexed entries
   and total unique tags.

5. **--fix behavior:** If STALE_INDEX detected and `--fix` provided, invoke `/adev:sync`
   to regenerate the index, then re-check. ORPHAN_TAG has no auto-fix — report:
   "Orphan tags are advisory. Use /adev:learn --promote or edit heuristic files manually."

6. **--check heuristics:** When provided, run only this pass (skip passes 1-15).
```

- [ ] **Verify test passes** — Run: `node --test tests/skills/hygiene-heuristic-pass.test.mjs`
- [ ] **Commit:** `feat(hygiene): add Pass 16 for heuristic index health`

---

### Task 2: Widen Heuristic Injection to 5 Skills [specialist: none]

**Charter capability:** Debug Injection, Brainstorm Injection, Specify Injection, Review-Specs Injection, Validate Injection
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/debug/SKILL.md`
- Modify: `skills/brainstorm/SKILL.md`
- Modify: `skills/specify/SKILL.md`
- Modify: `skills/review-specs/SKILL.md`
- Modify: `skills/validate/SKILL.md`
- Test: `tests/skills/heuristic-injection-widening.test.mjs`

**Tests:** `tests/skills/heuristic-injection-widening.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skills = {
  debug: readFileSync(new URL("../../skills/debug/SKILL.md", import.meta.url), "utf8"),
  brainstorm: readFileSync(new URL("../../skills/brainstorm/SKILL.md", import.meta.url), "utf8"),
  specify: readFileSync(new URL("../../skills/specify/SKILL.md", import.meta.url), "utf8"),
  "review-specs": readFileSync(new URL("../../skills/review-specs/SKILL.md", import.meta.url), "utf8"),
  validate: readFileSync(new URL("../../skills/validate/SKILL.md", import.meta.url), "utf8"),
};

for (const [name, content] of Object.entries(skills)) {
  describe(`${name} SKILL.md heuristic injection`, () => {
    it("references retrieveHeuristics", () => {
      assert.ok(content.includes("retrieveHeuristics"),
        `${name} should reference retrieveHeuristics`);
    });
    it("uses summary tier", () => {
      assert.ok(content.includes("summary") || content.includes("tier"),
        `${name} should specify summary tier`);
    });
    it("includes the canonical preamble", () => {
      assert.ok(content.includes("lessons learned") || content.includes("guidance, not as hard rules"),
        `${name} should include the heuristic preamble`);
    });
    it("specifies non-blocking behavior", () => {
      assert.ok(content.includes("proceed without") || content.includes("non-blocking"),
        `${name} should be non-blocking on failure`);
    });
  });
}

describe("debug SKILL.md keyword derivation", () => {
  it("specifies keyword extraction from error message", () => {
    assert.ok(skills.debug.includes("keyword") || skills.debug.includes("keywords"));
  });
  it("specifies stop word filtering", () => {
    assert.ok(skills.debug.includes("stop") || skills.debug.includes("filter"));
  });
});
```

- [ ] **Verify test fails** — Run: `node --test tests/skills/heuristic-injection-widening.test.mjs`

- [ ] **Implement**

For each skill, add a heuristic loading step following the established pattern from `skills/implement/SKILL.md` Step 1 item 11 and `skills/plan/SKILL.md` Step 2 item 12. The injection block to add to each skill:

**debug/SKILL.md — Phase 1 (context loading):**
```markdown
N. **Heuristics:** Load module-scoped heuristics for the buggy file's module.
   Derive keywords from the error message: split on whitespace and punctuation,
   filter to tokens of 3+ characters, remove stop words (the, and, is, was, not,
   for, with, from, this, that, etc.), take the first 5 unique tokens.
   If fewer than 3 tokens extracted, pass empty keywords array.
   Run inline Node.js:
   ```javascript
   const { retrieveHeuristics, renderHeuristic } = await import('<ADEV_ROOT>/lib/heuristics.mjs');
   const entries = await retrieveHeuristics(projectRoot, moduleSlug, { tier: 'summary', keywords });
   ```
   If the call fails or returns empty, proceed without heuristics — non-blocking.
   Prepend: "The following heuristics are lessons learned from past work in this
   module. Use them as guidance, not as hard rules."
```

**brainstorm/SKILL.md — Step 1 (explore context):**
```markdown
N. **Heuristics:** Load module-scoped heuristics for the target module.
   If the module is new (no existing scope file), use `_global` only.
   Call `retrieveHeuristics(projectRoot, moduleSlug, { tier: 'summary' })`.
   Non-blocking. Include preamble.
```

**specify/SKILL.md — Step 2 (load context):**
```markdown
N. **Heuristics:** Load module-scoped heuristics for the charter module.
   Call `retrieveHeuristics(projectRoot, charterModule, { tier: 'summary' })`.
   Non-blocking. Include preamble.
```

**review-specs/SKILL.md — Step 4 (dispatch reviewers):**
```markdown
Add to reviewer context pack: `## Heuristics` section with heuristics from
`retrieveHeuristics(projectRoot, specCharterModule, { tier: 'summary' })`.
Prepend: "The following heuristics are lessons learned from past work in this
module. Use them as guidance, not as hard rules."
Non-blocking — if retrieval fails, dispatch without heuristics.
```

**validate/SKILL.md — validation context loading:**
```markdown
N. **Heuristics:** Load module-scoped heuristics for the spec's charter module.
   Call `retrieveHeuristics(projectRoot, charterModule, { tier: 'summary' })`.
   Non-blocking. Include preamble.
```

- [ ] **Verify test passes** — Run: `node --test tests/skills/heuristic-injection-widening.test.mjs`
- [ ] **Commit:** `feat(skills): widen heuristic injection to debug/brainstorm/specify/review-specs/validate`

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied
