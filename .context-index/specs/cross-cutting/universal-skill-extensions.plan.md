<!-- partial_schema: plan@1 -->

# Implementation Plan: Universal Skill Extensions

> **Methodology:** adev
> **Charter:** cross-cutting (no feature charter — spec lives under `.context-index/specs/cross-cutting/`)
> **Spec:** .context-index/specs/cross-cutting/universal-skill-extensions.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-30)
> **Platform:** Node.js (ESM `.mjs`), node:test, zero-dep CLI

**Goal:** Wire the universal `adev skill-ext load --skill <slug>` call into every `skills/<name>/SKILL.md` so project-level and extension-pack instructions append to any skill's execution context — not only `/adev:implement`.

**Architecture:** The CLI verb already exists and is universal; only the SKILL.md prose is missing the call. The implementation is a mechanical, additive insertion across 30 SKILL.md files (the `implement` skill is already wired and MUST NOT be touched). A new test globs `skills/*/SKILL.md` and asserts byte-exact framing + per-skill slug correctness, and a contributor rule in `CLAUDE.md` Anti-Patterns enforces that future skills include the block. The review notes (SA-1/SA-2/CON-1) inform the test contract: the coverage test asserts the byte-exact framing prose (CON-1) and the per-skill slug match (SA-1/SA-2 framing).

---

## File Structure

**Create:**
- `tests/skills-extension-coverage.test.mjs` — asserts every `skills/*/SKILL.md` contains a Load Skill Extensions block with the correct bare-slug arg and the byte-exact framing prose. Mirrors the structural pattern of `tests/skills-no-inline-node.test.mjs`.

**Modify (30 SKILL.md files — sweep):**
- `skills/assess/SKILL.md` — insert block (no Load Context step → H3 sub-step near top)
- `skills/brainstorm/SKILL.md` — insert block (numbered Step 1 → sub-step at end)
- `skills/build/SKILL.md` — insert block (orchestrator; insert at earliest setup)
- `skills/codehealth/SKILL.md` — insert block (per placement rules)
- `skills/debug/SKILL.md` — insert block (per placement rules)
- `skills/deploy/SKILL.md` — insert block (per placement rules)
- `skills/document/SKILL.md` — insert block (per placement rules)
- `skills/eval/SKILL.md` — insert block (per placement rules)
- `skills/hygiene/SKILL.md` — insert block (per placement rules)
- `skills/init/SKILL.md` — insert block (no setup step → new H3 sub-step near top after Prerequisites)
- `skills/issues/SKILL.md` — insert block (per placement rules)
- `skills/learn/SKILL.md` — insert block (per placement rules)
- `skills/plan/SKILL.md` — insert block (Step 2 Load Context → after primary context bundle)
- `skills/prototype/SKILL.md` — insert block (per placement rules)
- `skills/reconcile/SKILL.md` — insert block (per placement rules)
- `skills/recover/SKILL.md` — insert block (per placement rules)
- `skills/repomap/SKILL.md` — insert block (per placement rules)
- `skills/research/SKILL.md` — insert block (per placement rules)
- `skills/retro/SKILL.md` — insert block (per placement rules)
- `skills/review-specs/SKILL.md` — insert block (per placement rules)
- `skills/route/SKILL.md` — insert block (per placement rules)
- `skills/sample/SKILL.md` — insert block (per placement rules)
- `skills/specify/SKILL.md` — insert block (per placement rules)
- `skills/standalone/SKILL.md` — insert block (per placement rules)
- `skills/status/SKILL.md` — insert block (per placement rules)
- `skills/sync/SKILL.md` — insert block (per placement rules)
- `skills/using-adev/SKILL.md` — insert block (no setup step → new H3 sub-step near top)
- `skills/validate/SKILL.md` — insert block (per placement rules)
- `skills/work/SKILL.md` — insert block (per placement rules)
- `skills/write-test/SKILL.md` — insert block (per placement rules)

**Modify (docs + contributor rules):**
- `CLAUDE.md` — add Anti-Pattern rule under "Anti-Patterns to Avoid" requiring new skills to include the Load Skill Extensions block; reference this spec.
- `docs/extensions.md` — update wording around `provides.skill_extensions` to clarify that ALL skills now consume their extension file (not only `/adev:implement`).

**Reference (read, do not modify):**
- `skills/implement/SKILL.md:57-63` — the canonical block; MUST remain byte-for-byte unchanged.
- `.context-index/specs/features/cli/skill-ext-load.spec.md` — the verb's per-call contract.
- `tests/skills-no-inline-node.test.mjs` — structural pattern for the new coverage test (`listSkillDirs`, per-skill loop, ALLOWLIST shape).
- `lib/extensions/content-install.mjs::installSkillExtensions` — already handles arbitrary skill keys; confirms no install-side change needed.

---

## Context Packets

### Task 1 Context (coverage test — RED)
- Spec: `.context-index/specs/cross-cutting/universal-skill-extensions.spec.md` (Acceptance Criteria 1-3, 6, 8; Error Cases rows 1-2)
- Reference: `skills/implement/SKILL.md` (lines 57-63 — the canonical block; pattern source for the byte-exact framing assertion)
- Sample: `tests/skills-no-inline-node.test.mjs` (sweep-test pattern: `listSkillDirs`, per-skill iteration, ALLOWLIST sentinel, narrow regex)
- Constitution: Principle 2 (skills are primarily markdown), Principle 3 (Pure ESM .mjs)
- Heuristics: none injected (no module-scoped heuristics for `skills/` sweep)
- Reviewer note CON-1: test MUST assert byte-exact framing prose, not just the verb substring

### Task 2 Context (insert block into 30 SKILL.md files)
- Spec: `.context-index/specs/cross-cutting/universal-skill-extensions.spec.md` (Insertion Placement Rules; Behaviors 1-6)
- Reference: `skills/implement/SKILL.md:57-63` (canonical block — DO NOT touch, mirror its exact prose)
- Reviewer note SA-1/SA-2: the "(19 skills)" and "30/31" counts in the spec are informational; the test enforces the actual coverage. Implement against the test, not against the prose counts.
- Per-skill placement guidance:
  - Skills with "Load Context" or "Step 2: Load Context" H2/H3 (most skills): insert immediately after the primary context load
  - Skills with numbered Step 1 setup but no Load Context (e.g., `init`, `assess`, `using-adev`): insert as H3 sub-step near top, after Prerequisites if present
- Constitution: Principle 2; Anti-Patterns (no inline Node, no fenced-JS executable directives — the inserted block uses only bash fence + prose, compliant)

### Task 3 Context (CLAUDE.md contributor rule)
- Spec: `.context-index/specs/cross-cutting/universal-skill-extensions.spec.md` (Postconditions bullet 2; Behaviors bullet 6 — forward enforcement)
- Reference: `CLAUDE.md` lines 62-69 (Anti-Patterns section — add new bullet here)
- Constitution: Coding Standards / Patterns to Follow

### Task 4 Context (docs/extensions.md update)
- Spec: `.context-index/specs/cross-cutting/universal-skill-extensions.spec.md` (Module Impact Map — contributor docs row; Actionable Task Map — docs update)
- Reference: `docs/extensions.md` lines 85-111 (the `provides.skill_extensions` section)
- Constraint: do not change install-side behavior wording; only clarify universal consumption

---

## Heuristics

> Snapshot from plan generation. At execution time, `/adev:implement` reads from the live store.

No module-scoped heuristics matched the `skills` sweep (no `--module skills` heuristics in the store). The general-purpose heuristics on cost-aware skill design are informational and do not change the implementation.

---

## Parallelization

- Group A (foundation, sequential): Task 1 (write failing coverage test) → Task 2 (sweep insertion turns Task 1 green)
- Group B (independent of A): Task 3 (CLAUDE.md contributor rule) — different file, no overlap with the SKILL.md sweep
- Group C (independent of A and B): Task 4 (docs/extensions.md update) — different file

Groups B and C can run in parallel with Group A, but `/adev:implement` defaults to sequential execution. Task 2 MUST follow Task 1 (TDD RED → GREEN). Tasks 3 and 4 have no ordering constraint.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Write failing coverage test for universal Load Skill Extensions block | small | unit | — | 1 create |
| 2 | Insert Load Skill Extensions block into 30 SKILL.md files | medium | unit | Task 1 | 0 create, 30 modify |
| 3 | Add CLAUDE.md Anti-Pattern rule requiring the block in new skills | small | unit | — | 0 create, 1 modify |
| 4 | Update docs/extensions.md to reflect universal consumption | small | unit | — | 0 create, 1 modify |

---

### Task 1: Write failing coverage test for universal Load Skill Extensions block [specialist: none]

**Charter capability:** Cross-cutting — universal skill-extension coverage (no feature charter; the spec is mode `cross-cutting`).
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/skills-extension-coverage.test.mjs`

**Tests:** `tests/skills-extension-coverage.test.mjs` — this task IS the test authoring task. The test starts RED (most SKILL.md files lack the block) and Task 2 turns it GREEN.

**Context to load:**
- `.context-index/specs/cross-cutting/universal-skill-extensions.spec.md` (Acceptance Criteria 1-3, 6; Insertion Placement Rules)
- `skills/implement/SKILL.md` lines 57-63 (canonical block — source of truth for byte-exact assertions)
- `tests/skills-no-inline-node.test.mjs` (structural pattern)

- [ ] **Write failing test**

```javascript
// tests/skills-extension-coverage.test.mjs
//
// Coverage test for universal Load Skill Extensions block.
// Spec: .context-index/specs/cross-cutting/universal-skill-extensions.spec.md
//
// Asserts every skills/<name>/SKILL.md contains a Load Skill Extensions
// block that calls `adev skill-ext load --skill <dir-name>` and that the
// uniform framing prose appears verbatim. The /adev:implement skill is
// already wired and serves as the byte-for-byte reference.

import { test } from "node:test";
import assert from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, "..", "skills");

const FRAMING_PROSE =
  'The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides).';

function listSkillDirs() {
  return readdirSync(SKILLS_DIR)
    .filter((d) => {
      try { return statSync(join(SKILLS_DIR, d)).isDirectory(); }
      catch { return false; }
    })
    .filter((d) => {
      try { return statSync(join(SKILLS_DIR, d, "SKILL.md")).isFile(); }
      catch { return false; }
    });
}

for (const slug of listSkillDirs()) {
  test(`skills/${slug}/SKILL.md contains Load Skill Extensions block`, () => {
    const md = readFileSync(join(SKILLS_DIR, slug, "SKILL.md"), "utf8");

    // Per-skill slug match (Acceptance Criterion 2).
    const expectedCall = `adev skill-ext load --skill ${slug}`;
    assert.ok(
      md.includes(expectedCall),
      `skills/${slug}/SKILL.md must call: ${expectedCall}`,
    );

    // Byte-exact framing prose (Acceptance Criterion 3; reviewer note CON-1).
    assert.ok(
      md.includes(FRAMING_PROSE),
      `skills/${slug}/SKILL.md must contain the uniform framing prose verbatim`,
    );
  });
}

test("/adev:implement existing block is unchanged (byte-for-byte sanity)", () => {
  const md = readFileSync(join(SKILLS_DIR, "implement", "SKILL.md"), "utf8");
  assert.ok(md.includes("adev skill-ext load --skill implement"));
  assert.ok(md.includes(FRAMING_PROSE));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills-extension-coverage.test.mjs`
Expected: FAIL — 30 of 31 per-skill assertions fail with "must call: adev skill-ext load --skill &lt;slug&gt;" (only `implement` passes). The framing-prose assertion fails for all 30 unwired skills.

- [ ] **Implement**

This task is test-authoring only. The implementation that turns the test GREEN is Task 2. No production code in this step.

- [ ] **Verify test passes**

N/A for this task — the test is intentionally RED. The implement skill records the RED state as the handoff to Task 2.

- [ ] **Commit**

Branch (create if not already): `feat/cross-cutting/universal-skill-extensions`

```bash
git add tests/skills-extension-coverage.test.mjs
git commit -m "test(skills): add universal Load Skill Extensions coverage test

Spec: .context-index/specs/cross-cutting/universal-skill-extensions.spec.md
Plan-task: 1"
```

---

### Task 2: Insert Load Skill Extensions block into 30 SKILL.md files [specialist: none]

**Charter capability:** Cross-cutting — universal skill-extension coverage.
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `skills/assess/SKILL.md`, `skills/brainstorm/SKILL.md`, `skills/build/SKILL.md`, `skills/codehealth/SKILL.md`, `skills/debug/SKILL.md`, `skills/deploy/SKILL.md`, `skills/document/SKILL.md`, `skills/eval/SKILL.md`, `skills/hygiene/SKILL.md`, `skills/init/SKILL.md`, `skills/issues/SKILL.md`, `skills/learn/SKILL.md`, `skills/plan/SKILL.md`, `skills/prototype/SKILL.md`, `skills/reconcile/SKILL.md`, `skills/recover/SKILL.md`, `skills/repomap/SKILL.md`, `skills/research/SKILL.md`, `skills/retro/SKILL.md`, `skills/review-specs/SKILL.md`, `skills/route/SKILL.md`, `skills/sample/SKILL.md`, `skills/specify/SKILL.md`, `skills/standalone/SKILL.md`, `skills/status/SKILL.md`, `skills/sync/SKILL.md`, `skills/using-adev/SKILL.md`, `skills/validate/SKILL.md`, `skills/work/SKILL.md`, `skills/write-test/SKILL.md`
- Must NOT touch: `skills/implement/SKILL.md` (already wired; Acceptance Criterion 4 — byte-for-byte unchanged)

**Tests:** `tests/skills-extension-coverage.test.mjs` (turns GREEN once all 30 inserts are correct).

**Context to load:**
- `skills/implement/SKILL.md` lines 57-63 (canonical reference block)
- Spec Insertion Placement Rules section (placement decision tree)
- Each target SKILL.md (read to choose correct insertion point)

- [ ] **Write failing test**

Already authored in Task 1. The test is currently RED. Do not re-author.

- [ ] **Verify test fails**

Run: `node --test tests/skills-extension-coverage.test.mjs`
Expected: still FAIL (RED carry-over from Task 1) before any insertion.

- [ ] **Implement**

For EACH of the 30 SKILL.md files, insert the following block. Substitute `<bare-slug>` with the parent directory name (e.g., `specify`, `plan`, `init`):

````markdown
**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill <bare-slug>
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.
````

**Placement decision (per spec Insertion Placement Rules):**

1. **Skill has a "Load Context" or "Step 2: Load Context" section** → insert immediately after the primary context bundle is loaded (mirror the placement pattern in `skills/implement/SKILL.md:57-63`).
2. **Skill has a numbered Step 1 / Step 2 doing setup or prerequisite checks, but no explicit Load Context** → insert as a final sub-step at the end of that setup step.
3. **Skill has no setup step at all** (likely candidates: `init`, `using-adev`, `assess`) → insert as a new H3 sub-step titled `### Load Skill Extensions` near the top of the body, after any Prerequisites section.

**Per-file workflow:**
- Read the SKILL.md to identify the correct insertion point per the decision tree above.
- Insert the block (with the correct `<bare-slug>` substituted).
- DO NOT touch `skills/implement/SKILL.md`.
- DO NOT modify any other section of the touched SKILL.md beyond inserting the block.

**Guardrails:**
- The block contains ONLY a bash fence + prose. No JavaScript. No inline-Node patterns. The no-inline-Node pre-commit hook (`.githooks/pre-commit-no-inline-node`) MUST continue to pass on every modified file.
- Per-H3-section both-forms anti-pattern: if the chosen insertion point is inside an H3 that already invokes a different `adev <verb>`, the block is still compliant (it adds another `adev` call to the same H3, which is allowed; the forbidden pairing is `node -e` AND `adev <verb>` in the same H3 — the inserted block contains neither inline-Node nor any non-`adev` executable).

- [ ] **Verify test passes**

Run: `node --test tests/skills-extension-coverage.test.mjs`
Expected: PASS — all 31 per-skill assertions pass (30 newly wired + `implement` already wired). Framing-prose assertion passes for all 31.

Also run the no-inline-Node sweep guard to confirm no regression:
```bash
node --test tests/skills-no-inline-node.test.mjs
```
Expected: PASS (the inserted block contains no `Run inline Node`, no `node --input-type=module -e`, no `node -e`).

Also run the full test suite:
```bash
npm test
```
Expected: PASS overall. No pre-existing test fails or requires modification (Acceptance Criterion 8).

- [ ] **Commit**

Branch (same as Task 1): `feat/cross-cutting/universal-skill-extensions`

```bash
git add skills/assess/SKILL.md skills/brainstorm/SKILL.md skills/build/SKILL.md \
        skills/codehealth/SKILL.md skills/debug/SKILL.md skills/deploy/SKILL.md \
        skills/document/SKILL.md skills/eval/SKILL.md skills/hygiene/SKILL.md \
        skills/init/SKILL.md skills/issues/SKILL.md skills/learn/SKILL.md \
        skills/plan/SKILL.md skills/prototype/SKILL.md skills/reconcile/SKILL.md \
        skills/recover/SKILL.md skills/repomap/SKILL.md skills/research/SKILL.md \
        skills/retro/SKILL.md skills/review-specs/SKILL.md skills/route/SKILL.md \
        skills/sample/SKILL.md skills/specify/SKILL.md skills/standalone/SKILL.md \
        skills/status/SKILL.md skills/sync/SKILL.md skills/using-adev/SKILL.md \
        skills/validate/SKILL.md skills/work/SKILL.md skills/write-test/SKILL.md
git commit -m "feat(skills): wire universal Load Skill Extensions block into 30 SKILL.md files

Spec: .context-index/specs/cross-cutting/universal-skill-extensions.spec.md
Plan-task: 2"
```

---

### Task 3: Add CLAUDE.md Anti-Pattern rule requiring the block in new skills [specialist: none]

**Charter capability:** Cross-cutting — forward enforcement via contributor docs (spec Behavior 6, Postcondition 2).
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `CLAUDE.md` (Anti-Patterns to Avoid section, lines ~62-69)

**Tests:** `tests/skills-extension-coverage.test.mjs` (the test enforces the rule's outcome; the prose rule is documentation enforcement for future skills, caught by the test on PR).

**Context to load:**
- `CLAUDE.md` lines 62-69 (existing Anti-Patterns bullets — match their style)
- `.context-index/specs/cross-cutting/universal-skill-extensions.spec.md` (reference path for the rule)

- [ ] **Write failing test**

No new automated test — the contributor rule is human-readable documentation. The universal-coverage test from Task 1 enforces the actual outcome.

Manual verification: `grep -n "Load Skill Extensions" CLAUDE.md` should return zero matches before this task.

- [ ] **Verify test fails**

Run: `grep -c "Load Skill Extensions" CLAUDE.md`
Expected: `0` (rule not yet present).

- [ ] **Implement**

Add a new bullet to the "Anti-Patterns to Avoid" section of `CLAUDE.md`, alongside the existing inline-Node and fenced-JS bullets. Suggested wording:

```markdown
- **New skills MUST include a Load Skill Extensions block.** Every new `skills/<name>/SKILL.md` MUST contain a block that invokes `adev skill-ext load --skill <name>` (bare slug, matching the parent directory) and the uniform framing prose: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* This is required so project-level and extension-pack instructions can append to the skill's execution context. Coverage is enforced by `tests/skills-extension-coverage.test.mjs`. See `.context-index/specs/cross-cutting/universal-skill-extensions.spec.md`.
```

- [ ] **Verify test passes**

Run: `grep -c "Load Skill Extensions" CLAUDE.md`
Expected: `>= 1`.

Run: `npm test`
Expected: PASS (no regression).

- [ ] **Commit**

Branch (same): `feat/cross-cutting/universal-skill-extensions`

```bash
git add CLAUDE.md
git commit -m "docs(constitution): require Load Skill Extensions block in new skills

Spec: .context-index/specs/cross-cutting/universal-skill-extensions.spec.md
Plan-task: 3"
```

---

### Task 4: Update docs/extensions.md to reflect universal consumption [specialist: none]

**Charter capability:** Cross-cutting — extension authoring documentation accuracy.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `docs/extensions.md` (the `provides.skill_extensions` section, lines ~85-111)

**Tests:** No automated test — documentation correctness. Manually verify against the spec's Behavioral Contract.

**Context to load:**
- `docs/extensions.md` lines 85-111
- `.context-index/specs/cross-cutting/universal-skill-extensions.spec.md` (Behavioral Contract, Integration Points)

- [ ] **Write failing test**

No automated test. Pre-state check: read `docs/extensions.md` and confirm any wording implying `/adev:implement` is the only consumer of skill extensions.

- [ ] **Verify test fails**

Manual: confirm a sentence in the `provides.skill_extensions` section either implies `/adev:implement` is special OR is silent on universal consumption.

- [ ] **Implement**

Edit `docs/extensions.md` `provides.skill_extensions` subsection to:
1. State that ALL adev skills consume their corresponding extension file (not only `/adev:implement`).
2. Reference the universal wiring spec: `.context-index/specs/cross-cutting/universal-skill-extensions.spec.md`.
3. Remove or rephrase any sentence implying `/adev:implement` is the only consumer.
4. Keep the install-side description unchanged (the install behavior already supports universal skill keys).

Suggested addition near the existing "Consumption" paragraph:

```markdown
**Universal consumption:** Every adev skill calls `adev skill-ext load --skill <slug>` during its earliest context-loading step. An extension pack can ship `provides.skill_extensions: { plan: "...", validate: "...", specify: "...", ... }` for any skill name and the corresponding skill will pick it up on its next invocation. See `.context-index/specs/cross-cutting/universal-skill-extensions.spec.md` for the coverage contract.
```

- [ ] **Verify test passes**

Manual: re-read the section and confirm wording reflects universal coverage.

Run: `npm test`
Expected: PASS (no regression).

- [ ] **Commit**

Branch (same): `feat/cross-cutting/universal-skill-extensions`

```bash
git add docs/extensions.md
git commit -m "docs(extensions): clarify universal skill-extension consumption

Spec: .context-index/specs/cross-cutting/universal-skill-extensions.spec.md
Plan-task: 4"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- No-inline-Node sweep guard passes: `node --test tests/skills-no-inline-node.test.mjs`
- Universal coverage test passes: `node --test tests/skills-extension-coverage.test.mjs`
- Pre-commit hook on every modified SKILL.md passes (`.githooks/pre-commit-no-inline-node`)
- `/adev:implement` block at `skills/implement/SKILL.md:57-63` is unchanged byte-for-byte (manual diff check)
- All Acceptance Criteria from the spec are satisfied:
  - All 31 skills under `skills/*/SKILL.md` contain a Load Skill Extensions block
  - Each block's `--skill <slug>` matches its parent directory name
  - Each block uses the uniform framing prose verbatim
  - `CLAUDE.md` Anti-Patterns contains the contributor rule
  - Coverage test exists and passes
  - No existing test fails or is modified
