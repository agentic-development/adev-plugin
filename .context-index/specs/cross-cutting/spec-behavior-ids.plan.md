<!-- partial_schema: plan@1 -->

# Implementation Plan: Behavior IDs — stable referents for spec behaviors

> **Methodology:** adev
> **Charter:** — (cross-cutting spec; no parent feature charter)
> **Spec:** `.context-index/specs/cross-cutting/spec-behavior-ids.spec.md` (revision 2)
> **Review:** PASS_WITH_NOTES (2026-08-15) — all three warnings already applied to the spec on disk
> **Platform:** JavaScript (ESM), Node.js, npm, `node:test` (zero external deps)

**Goal:** Make every behavior in a newly authored or revised spec carry a stable, never-reused `BEH-<n>` identifier, so a reviewer finding filed against a behavior still resolves after the spec is revised.

**Architecture:** The entire deliverable is markdown. Authoring guidance lands in the standard-mode `Step 4` block of `skills/specify/SKILL.md` (the canonical statement) with one-line cross-references from the two non-delegating authoring sites (`--extract`, `--from-diff`); the three Behaviors-bearing spec templates carry the reshaped placeholder, which is the mechanism by which the convention reaches refactor mode (`cpSync` copies templates verbatim — constitution pattern "Templates are consumed verbatim"). A single new `node:test` suite locks both halves so a future template or skill edit cannot silently reintroduce bare ordinals. No library, validator, parser, or dependency is introduced — constitution Principle 2 ("Skills are primarily markdown") and Principle 1 ("Minimize external dependencies") are both load-bearing here.

**Review notes carried into this plan (PASS_WITH_NOTES):** the reviewer's three warnings were resolved in spec revision 2 before planning — `--amend` is excluded from Precondition 1 and documented in Out of Scope; Integration Point 1 attributes refactor-mode coverage to the template rather than to delegation (Task 4 is therefore the *only* thing that gives `--refactor` coverage, and Task 4's test assertions are what stop a future template edit from dropping it); and the reviewer-prompt work is restated as a deferred follow-up ("two edits plus two additions"). No plan task targets `skills/review-specs/`.

---

## File Structure

**Create:**
- `tests/behavior-id-convention.test.mjs` — the single new suite; asserts template shape and the presence of the authoring guidance

**Modify:**
- `skills/specify/SKILL.md:346-377` — standard-mode `### Step 4: Interactive Spec Authoring`, the **Behavioral Contract** sub-block (canonical statement of the convention + revision obligations)
- `skills/specify/SKILL.md:586-612` — `### Step 4: Generate Snapshot Spec` (`--extract`), the `**Behaviors**` bullet (one-line cross-reference)
- `skills/specify/SKILL.md:809-832` — `### Step 4: Generate Retroactive Spec` (`--from-diff`), the `**Behaviors**` bullet (one-line cross-reference)
- `templates/spec-template.behavioral.md:56-62` — convert `### Behaviors` ordered placeholder to the ID form + tombstone comment
- `templates/spec-template.refactor.md:132-136` — same conversion
- `templates/domains/software/spec-template.md:68-71` — **add** a placeholder list + tombstone comment under the bare `## Behaviors` heading (this template has no list placeholder today)

**Reference (read, do not modify):**
- `.context-index/specs/cross-cutting/spec-behavior-ids.spec.md` — the contract
- `tests/templates/spec-template.behavioral.test.mjs` — follow this pattern for template-shape assertions (`readFileSync` + `join(__dirname, "..", "..", "templates", …)`)
- `tests/skills-no-inline-node.test.mjs` — the existing SKILL.md sweep guard; do not duplicate its checks
- `.context-index/samples/general-test-helpers.md` — test-helper conventions
- `templates/spec-template.artifact.md`, `spec-template.skill.md`, `spec-template.integration.md`, `spec-template.action.md` — the four templates with **no** Behaviors section; the new test must exclude them deliberately, not by accident
- `skills/review-specs/*.md` — **out of scope**, deferred follow-up (spec Out of Scope). Do not edit.
- `providers/codex/skills/specify/SKILL.md`, `providers/opencode/skills/specify/SKILL.md` — provider mirrors, **out of scope** for this plan. No test enforces mirror parity today (verified), so leaving them unmirrored does not break `npm test`; it is recorded here as known drift.

## Context Packets

The spec has no `source-manifest.files[]` (it is a new cross-cutting spec), so packets fall back to: the spec body, the constitution's anti-pattern list, the concrete edit sites, and one sibling test as a pattern exemplar.

### Task 1 Context
- Spec: `spec-behavior-ids.spec.md` — "The convention" section (full), BEH-1, Acceptance Criteria 1
- Source file: `skills/specify/SKILL.md:346-377` (full read of the Step 4 block)
- Constitution: Anti-Patterns — "No executable logic inside SKILL.md files", "No `Run inline Node.js:` step directives", "Fenced JavaScript in SKILL.md must be descriptive-reference only"
- Test suite: `tests/behavior-id-convention.test.mjs` (created by this task)
- Heuristics: 3 entries for module `design` (see Heuristics section)

### Task 2 Context
- Spec: BEH-2, BEH-3, BEH-4, BEH-5, BEH-7; "Allocation" and "Tombstones" paragraphs; Error Cases table (rows 1, 2, 5)
- Source file: `skills/specify/SKILL.md:346-377` (as amended by Task 1)
- Cross-reference: `## Revise Mode (--revise <spec-path>)` at `skills/specify/SKILL.md:930` — read-only, to confirm the revise flow preserves untouched sections byte-identically (spec Integration Point 2)
- Test suite: `tests/behavior-id-convention.test.mjs` (extend)

### Task 3 Context
- Spec: Integration Points table (the five `Step 4` sites and their delegation status); Acceptance Criterion 4
- Source files: `skills/specify/SKILL.md:586-612` (`--extract`), `skills/specify/SKILL.md:809-832` (`--from-diff`)
- Read-only: `skills/specify/SKILL.md:882-901` (`--cross-cutting` Step 4 — already delegates, needs no edit) and `skills/specify/SKILL.md:731-739` (`--refactor` Step 7 — covered by the template, not by prose)
- Test suite: `tests/behavior-id-convention.test.mjs` (extend)

### Task 4 Context
- Spec: "The convention" fenced example; "Template survey" table; Acceptance Criteria 5 and 6
- Source files: `templates/spec-template.behavioral.md:56-62`, `templates/spec-template.refactor.md:132-136`, `templates/domains/software/spec-template.md:68-71`
- Sample/pattern: `tests/templates/spec-template.behavioral.test.mjs` (how template shape is asserted in this repo)
- Constitution: Pattern — "Templates are consumed verbatim by `cpSync()` — changes only affect new scaffolds"
- Test suite: `tests/behavior-id-convention.test.mjs` (extend)

### Task 5 Context
- Spec: Acceptance Criteria 6 and 7; "Template survey" table (the four no-Behaviors templates and why they are excluded)
- Source files: all seven spec templates (read-only enumeration), `templates/` directory listing
- Test suite: `tests/behavior-id-convention.test.mjs` (extend)

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: First-run PASS: /adev:brainstorm Kind Routing (confidence: medium)
- **Pattern:** Mirroring SKILL.md edits across all three provider variants (claude, opencode, codex) in lockstep ensures a single test fixture validates every provider; centralizing kind validation in `lib/kinds.mjs` keeps the strict-on-write enumeration consistent between authoring skills.
- **Evidence:** 1 observation
- **Plan note:** this heuristic argues for mirroring the `skills/specify/SKILL.md` edits into `providers/*/skills/specify/SKILL.md`. Those files are **outside this spec's declared file scope**, so no task does it. Recorded as known drift in File Structure. At implement time, file a follow-up issue so the drift has a tracker referent rather than living only in this plan's prose.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** Parse real session JSONL `message.usage` fields when evaluating token cost, not `bytes/4` estimates.
- **Evidence:** 1 observation — not applicable to this plan.

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** Reduce what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns).
- **Evidence:** 1 observation
- **Plan note:** applies to execution — tasks here edit small, precisely bounded markdown regions. Implementers should not echo whole template or SKILL.md bodies back into the conversation.

## Parallelization

- **Group A (sequential):** Task 1 → Task 2 → Task 3 — all three modify `skills/specify/SKILL.md`; Tasks 1 and 2 modify the *same* block (`Step 4`, lines 346-377).
- **Group B (independent of A on source files):** Task 4 — touches only `templates/**`, no overlap with Group A source files.
- **Group C (depends on all):** Task 5 — the cross-template sweep; requires Tasks 1-4 landed.

**Shared-suite caveat:** every task writes to the same test file, `tests/behavior-id-convention.test.mjs` (see Granularity note below). Group A and Group B are file-independent on *source* but not on the *suite*. Task 1 creates the suite; Group B may run concurrently with Group A only after Task 1 has landed, otherwise both would create the same file. Sequential execution is the safe default for a plan this small.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | State the BEH-`<n>` convention in standard-mode Step 4 | small | unit | — | 1 create, 1 modify |
| 2 | Add revision-time ID obligations to the same block | small | unit | Task 1 | 0 create, 2 modify |
| 3 | Cross-reference the convention from `--extract` and `--from-diff` | small | unit | Task 1 | 0 create, 2 modify |
| 4 | Reshape the Behaviors placeholder in the three templates | small | unit | — | 0 create, 4 modify |
| 5 | Sweep test: no Behaviors-bearing template renders a bare ordinal | small | unit | Tasks 1-4 | 0 create, 1 modify |

**Strategy resolution:** no `test_strategy` in spec frontmatter; `manifest.yaml` declares no `test_strategies` path globs; the task file paths are markdown and `node:test` files with no external system in reach. All five tasks resolve to `unit` (source: fallback, confidence: high). The **Strategy Summary** section is omitted per the skill's backward-compatibility rule (all tasks `unit`), and no **Test Infrastructure Requirements** section is emitted (all tasks `unit`, and the spec declares no `infra_requirements:`).

**Granularity:** `per-behavior` (source: manifest — `test_policy.granularity: per-behavior`). Under per-behavior, `resolveSuitePath()` would normally propose one suite per behavior statement (BEH-1 … BEH-5, BEH-7 → six suites). The spec's declared file scope permits **exactly one** new test file, so all six behaviors resolve to the single canonical suite `tests/behavior-id-convention.test.mjs`: Task 1 **creates** it, Tasks 2-5 **extend** it. This is the documented "extend, do not create" path — no task creates a second suite.

**Specialist routing:** `manifest.yaml` declares `specialists: []`. Every task is tagged `[specialist: none]`.

---

## Tasks

### Task 1: State the BEH-`<n>` convention in standard-mode Step 4 [specialist: none]

**Charter capability:** — (cross-cutting; maps to spec module `spec-lifecycle`)
**Behavior:** BEH-1
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/behavior-id-convention.test.mjs`
- Modify: `skills/specify/SKILL.md:346-377` (the **Behavioral Contract** sub-block of `### Step 4: Interactive Spec Authoring`)
- Test: `tests/behavior-id-convention.test.mjs`

**Tests:** `tests/behavior-id-convention.test.mjs` — **create** this suite (per-behavior granularity; this is the canonical suite for every behavior in the spec, see Granularity note).

**Context to load:**
- `.context-index/specs/cross-cutting/spec-behavior-ids.spec.md` — "The convention" section, BEH-1
- `tests/templates/spec-template.behavioral.test.mjs` — follow this pattern (plain `readFileSync` + `assert.ok`, no helpers needed)
- Constitution Anti-Patterns — the SKILL.md executable-content rules

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = readFileSync(join(ROOT, "skills", "specify", "SKILL.md"), "utf8");

// Isolate the standard-mode Step 4 block so the assertions cannot be
// satisfied by prose living somewhere else in the file.
//
// The boundary is `#{2,3} Step ` — a real *step* heading — NOT a bare
// `#{2,3} `. The guidance this suite asserts contains a fenced ```markdown
// example whose first line is `### Behaviors` at column 0; a bare-heading
// boundary would treat that fence line as the end of the section and
// silently truncate every assertion target that follows it.
function section(md, heading) {
  const start = md.indexOf(heading);
  assert.notEqual(start, -1, `missing heading: ${heading}`);
  const rest = md.slice(start + heading.length);
  const end = rest.search(/\n#{2,3} Step /);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("specify SKILL.md — behavior-ID convention (standard mode)", () => {
  const step4 = section(SKILL, "### Step 4: Interactive Spec Authoring");

  it("states the BEH-<n> identifier form", () => {
    assert.match(step4, /\*\*BEH-/, "Step 4 must state the bolded BEH- identifier form");
  });

  it("states that behaviors render as an unordered list", () => {
    assert.match(step4, /unordered/i);
  });

  it("states the allocate-above-the-highest-ever-used rule", () => {
    assert.match(step4, /never reused|never reuse/i);
    assert.match(step4, /highest/i);
  });

  it("names the retired-behavior-ids tombstone comment", () => {
    assert.ok(step4.includes("retired-behavior-ids"));
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/behavior-id-convention.test.mjs`
Expected: FAIL — four assertions fail; `Step 4` currently shows behaviors as plain `**When** … **then** …` bullets with no identifier.

- [ ] **Implement**

Edit the **Behavioral Contract** sub-block of `### Step 4: Interactive Spec Authoring` so it states the convention declaratively. Prose only — no `node -e`, no heredoc, no `Run inline Node.js:` heading, no fenced JavaScript. The block should say, in the skill's existing voice:

~~~markdown
**Behavioral Contract:**
Ask focused questions: what triggers this behavior, expected outcomes, failure scenarios. Write behaviors as an **unordered** list, each item opening with a bolded behavior ID, in the **When...then** format:

```markdown
### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** a user drags a card within the same column **then** the card's `position` updates and affected cards reindex.
- **BEH-2** — **When** a user drags a card to a different column **then** the card moves and both columns reindex.
```

A behavior ID is `BEH-<n>`, `<n>` a positive integer unique within *this* spec. IDs are spec-scoped — `BEH-3` in two specs are unrelated. The list is unordered deliberately: an ordered list re-renders `1. 2. 3.` alongside the IDs, leaving two competing referents for the same behavior.

**Allocation.** The next ID is one greater than the highest number ever used in this spec — counting live IDs *and* every ID listed in the `retired-behavior-ids` comment. Numbers are never reused; gaps carry no meaning.

**Tombstones.** The `<!-- retired-behavior-ids: … -->` comment sits immediately under the Behaviors heading and records every withdrawn ID. It is the allocator's memory: without it, deleting `BEH-5` and later inserting a behavior would resurrect `BEH-5` under new text.

Aim for 3-8 directly testable behavior statements.
~~~

- [ ] **Verify test passes**

Run: `node --test tests/behavior-id-convention.test.mjs`
Expected: PASS (4 assertions)

- [ ] **Commit**

Branch (if not already created): `feat/spec-lifecycle/behavior-ids`

```bash
git add skills/specify/SKILL.md tests/behavior-id-convention.test.mjs
git commit -m "feat(design): state the BEH-<n> behavior-ID convention in specify Step 4

Spec: .context-index/specs/cross-cutting/spec-behavior-ids.spec.md
Plan-task: 1"
```

---

### Task 2: Add revision-time ID obligations to the same block [specialist: none]

**Depends on:** Task 1
**Charter capability:** — (spec module `spec-lifecycle`)
**Behaviors:** BEH-2, BEH-3, BEH-4, BEH-5, BEH-7
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/specify/SKILL.md:346-377` (same block, as amended by Task 1)
- Modify: `tests/behavior-id-convention.test.mjs`
- Test: `tests/behavior-id-convention.test.mjs`

**Tests:** `tests/behavior-id-convention.test.mjs` — **extend** the existing suite with a `describe("… revision obligations")` block.

**Context to load:**
- Spec BEH-2 through BEH-5 and BEH-7; the Error Cases table (rows 1, 2, 5)
- `skills/specify/SKILL.md:930` (`## Revise Mode`) — read-only confirmation that untouched sections are preserved byte-identically

- [ ] **Write failing test**

```javascript
describe("specify SKILL.md — behavior-ID revision obligations", () => {
  const step4 = section(SKILL, "### Step 4: Interactive Spec Authoring");

  it("insertion does not renumber existing behaviors (BEH-2)", () => {
    assert.match(step4, /no other behavior'?s? ID changes|never renumber/i);
  });

  it("an in-place rewrite keeps the existing ID (BEH-3)", () => {
    assert.match(step4, /keeps? (its )?existing ID|keep the ID/i);
  });

  it("a deleted ID is tombstoned and never reassigned (BEH-4)", () => {
    // Deliberately `never reassigned` only — Task 1 already supplies
    // "never reused", so a `|never reused` alternation would be green
    // before this task's prose lands and would not witness BEH-4.
    assert.match(step4, /never reassigned/i);
    assert.ok(step4.includes("retired-behavior-ids"));
  });

  it("redefinition retires the old ID and mints a new one (BEH-5)", () => {
    assert.match(step4, /retire[sd]? the old ID|retire .* and mint/i);
  });

  it("legacy specs are not retro-migrated (BEH-7)", () => {
    assert.match(step4, /not retro-?migrat|legacy spec/i);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/behavior-id-convention.test.mjs`
Expected: FAIL — all five new assertions fail; Task 1 stated allocation but said nothing about revision. (The BEH-4 case asserts `never reassigned`, a phrase only this task's prose supplies — Task 1's "never reused" does not satisfy it.)

- [ ] **Implement**

Append a short **Revising behaviors** paragraph to the same **Behavioral Contract** sub-block. Prose only:

~~~markdown
**Revising behaviors.** Inserting a behavior at any position gives it the next unused ID and **no other behavior's ID changes** — never renumber to close a gap. Rewriting a behavior's wording *without changing which condition it governs* keeps its existing ID, so a finding already filed against that ID still resolves. If a rewrite changes *which* condition the behavior governs (different trigger, different subject), retire the old ID and mint a new one, so a citation against the old ID resolves to a tombstone rather than to unrelated text. A deleted behavior's ID is appended to `retired-behavior-ids` and is never reassigned.

Specs authored before this convention landed keep their ordinal behaviors and are **not retro-migrated**. Read a legacy spec as-is; do not mint IDs into it as a side effect of an unrelated revision.
~~~

Type `behavior's` with a plain ASCII apostrophe (`'`), not a typographic `’` — the first test alternation pins the ASCII form. (`never renumber` is the fallback alternation, so a typographic apostrophe would not fail the suite, but it would make the assertion pass for the wrong reason.)

- [ ] **Verify test passes**

Run: `node --test tests/behavior-id-convention.test.mjs`
Expected: PASS (9 assertions)

- [ ] **Commit**

```bash
git add skills/specify/SKILL.md tests/behavior-id-convention.test.mjs
git commit -m "feat(design): state behavior-ID revision obligations in specify Step 4

Spec: .context-index/specs/cross-cutting/spec-behavior-ids.spec.md
Plan-task: 2"
```

---

### Task 3: Cross-reference the convention from `--extract` and `--from-diff` [specialist: none]

**Depends on:** Task 1
**Charter capability:** — (spec module `spec-lifecycle`)
**Behavior:** BEH-1 (closes the enforcement gap for the two non-delegating authoring sites)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/specify/SKILL.md:586-612` (`### Step 4: Generate Snapshot Spec`, the `**Behaviors**` bullet)
- Modify: `skills/specify/SKILL.md:809-832` (`### Step 4: Generate Retroactive Spec`, the `**Behaviors**` bullet)
- Modify: `tests/behavior-id-convention.test.mjs`
- Test: `tests/behavior-id-convention.test.mjs`

**Tests:** `tests/behavior-id-convention.test.mjs` — **extend**.

**Context to load:**
- Spec Integration Points table — the five `Step 4` sites and which of them delegate
- Read-only: `skills/specify/SKILL.md:882-901` (`--cross-cutting` Step 4 — already delegates, needs no edit); `skills/specify/SKILL.md:731-739` (`--refactor` Step 7 — covered by the template in Task 4, not by prose)

- [ ] **Write failing test**

```javascript
describe("specify SKILL.md — non-delegating authoring sites cross-reference the convention", () => {
  for (const heading of [
    "### Step 4: Generate Snapshot Spec",
    "### Step 4: Generate Retroactive Spec",
  ]) {
    it(`${heading} references the BEH-<n> convention`, () => {
      const body = section(SKILL, heading);
      assert.match(body, /BEH-/, `${heading} must cross-reference the behavior-ID convention`);
    });
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/behavior-id-convention.test.mjs`
Expected: FAIL — both new assertions fail; neither mode-scoped Step 4 mentions behavior IDs today.

- [ ] **Implement**

In `### Step 4: Generate Snapshot Spec`, extend the existing `**Behaviors**` bullet:

~~~markdown
- **Behaviors** are derived from code paths. Each public function or API endpoint becomes one or more behavior statements. Render them with behavior IDs exactly as standard mode's *Step 4: Interactive Spec Authoring* describes: an unordered list, each item opening with a bolded `BEH-<n>`, under a `<!-- retired-behavior-ids: (none) -->` comment.
~~~

In `### Step 4: Generate Retroactive Spec`, extend its `**Behaviors**` bullet the same way:

~~~markdown
- **Behaviors** map to changes in the diff — each significant code change becomes a behavior statement. Render them with behavior IDs exactly as standard mode's *Step 4: Interactive Spec Authoring* describes: an unordered list, each item opening with a bolded `BEH-<n>`, under a `<!-- retired-behavior-ids: (none) -->` comment.
~~~

Leave the `--cross-cutting` Step 4 alone — it already says "Same process as standard mode". Leave `--refactor` Step 7 alone — its coverage comes from the template (Task 4), and that distinction is recorded in the spec's Integration Point 1 precisely so a future edit does not silently drop it.

- [ ] **Verify test passes**

Run: `node --test tests/behavior-id-convention.test.mjs`
Expected: PASS (11 assertions)

- [ ] **Commit**

```bash
git add skills/specify/SKILL.md tests/behavior-id-convention.test.mjs
git commit -m "feat(design): cross-reference behavior IDs from extract and from-diff modes

Spec: .context-index/specs/cross-cutting/spec-behavior-ids.spec.md
Plan-task: 3"
```

---

### Task 4: Reshape the Behaviors placeholder in the three templates [specialist: none]

**Charter capability:** — (spec module `lifecycle-artifacts`)
**Behaviors:** BEH-1, BEH-4 (the tombstone comment ships in the placeholder)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `templates/spec-template.behavioral.md:56-62`
- Modify: `templates/spec-template.refactor.md:132-136`
- Modify: `templates/domains/software/spec-template.md:68-71`
- Modify: `tests/behavior-id-convention.test.mjs`
- Test: `tests/behavior-id-convention.test.mjs`

**Tests:** `tests/behavior-id-convention.test.mjs` — **extend**.

**Context to load:**
- Spec "The convention" fenced example and the "Template survey" table
- `tests/templates/spec-template.behavioral.test.mjs` — the repo's template-assertion pattern
- Constitution Pattern — "Templates are consumed verbatim by `cpSync()`"

> **Why this task carries refactor mode.** `--refactor` never reaches standard-mode Step 4 (spec Integration Point 1). Its only exposure to the convention is `templates/spec-template.refactor.md`, copied verbatim. If a future edit reverts that template, refactor mode silently loses coverage and no skill prose reveals it — which is exactly what the assertions below prevent.

> **Note on `domains/software/spec-template.md`.** This template has a bare `## Behaviors` heading with a guidance comment and **no list placeholder at all**. The change here is an **addition**, not a conversion.

- [ ] **Write failing test**

```javascript
const BEHAVIORS_TEMPLATES = [
  ["templates", "spec-template.behavioral.md"],
  ["templates", "spec-template.refactor.md"],
  ["templates", "domains", "software", "spec-template.md"],
];

describe("spec templates — Behaviors placeholder carries behavior IDs", () => {
  for (const parts of BEHAVIORS_TEMPLATES) {
    const rel = parts.join("/");
    const body = readFileSync(join(ROOT, ...parts), "utf8");

    it(`${rel} renders the placeholder as an unordered BEH-<n> item`, () => {
      assert.match(
        body,
        /^- \*\*BEH-\d+\*\* — \*\*When\*\* .+ \*\*then\*\* .+$/m,
        `${rel} must render behaviors as "- **BEH-n** — **When** ... **then** ..."`
      );
    });

    it(`${rel} carries a retired-behavior-ids tombstone comment`, () => {
      assert.match(body, /<!-- retired-behavior-ids: \(none\) -->/, rel);
    });
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/behavior-id-convention.test.mjs`
Expected: FAIL — six new assertions fail: the behavioral and refactor templates render `1. **When** ...`, and the software template has no placeholder line at all.

- [ ] **Implement**

`templates/spec-template.behavioral.md` — replace the ordered placeholder under `### Behaviors`:

~~~markdown
### Behaviors

<!-- The core behavioral statements. Each should map to one or more test cases.
     Each behavior carries a spec-scoped ID of the form BEH-<n>. Allocate the next
     ID above the highest ever used in this spec (live or retired); never reuse a
     number. When a behavior is withdrawn, move its ID into the comment below. -->

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** ... **then** ...
- **BEH-2** — **When** ... **then** ...
- **BEH-3** — **When** ... **then** ...
~~~

`templates/spec-template.refactor.md` — same shape under its `### Behaviors` heading (two placeholder items, matching the template's existing count).

`templates/domains/software/spec-template.md` — **add** the placeholder under the existing `## Behaviors` heading, keeping the heading level and the existing guidance comment:

~~~markdown
## Behaviors

<!-- "When X happens, then Y is the result." Concrete, testable statements.
     Each behavior carries a spec-scoped ID of the form BEH-<n>; allocate above the
     highest ever used (live or retired) and never reuse a number. -->

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** ... **then** ...
- **BEH-2** — **When** ... **then** ...
~~~

Do **not** add a Behaviors section to `spec-template.artifact.md`, `spec-template.skill.md`, `spec-template.integration.md`, or `spec-template.action.md` — they omit it by design (spec "Template survey").

- [ ] **Verify test passes**

Run: `node --test tests/behavior-id-convention.test.mjs`
Expected: PASS (17 assertions)

- [ ] **Commit**

```bash
git add templates/spec-template.behavioral.md templates/spec-template.refactor.md templates/domains/software/spec-template.md tests/behavior-id-convention.test.mjs
git commit -m "feat(setup): render Behaviors placeholders with BEH-<n> IDs in spec templates

Spec: .context-index/specs/cross-cutting/spec-behavior-ids.spec.md
Plan-task: 4"
```

---

### Task 5: Sweep test — no Behaviors-bearing template renders a bare ordinal [specialist: none]

**Depends on:** Task 1, Task 2, Task 3, Task 4
**Charter capability:** — (spec module `lifecycle-artifacts`)
**Behavior:** BEH-1 (regression guard); Acceptance Criteria 6 and 7
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/behavior-id-convention.test.mjs`
- Test: `tests/behavior-id-convention.test.mjs`

**Tests:** `tests/behavior-id-convention.test.mjs` — **extend** with the discovery-based sweep.

**Context to load:**
- Spec Acceptance Criteria 6 and 7; the "Template survey" table (which templates have a Behaviors section and why the other four do not)

> Tasks 1-4 assert a **named** list of files. This task closes the loop the other way: it *discovers* every spec template, finds the ones that have a Behaviors section, and asserts none of them renders a bare ordinal. A newly added template, or a template that grows a Behaviors section later, is caught automatically instead of silently escaping the named list.

- [ ] **Write failing test**

```javascript
import { readdirSync } from "node:fs";

// Discover every spec template rather than hardcoding the list, so a template
// added later cannot escape the guard.
function discoverSpecTemplates() {
  const roots = [join(ROOT, "templates"), join(ROOT, "templates", "domains", "software")];
  const found = [];
  for (const dir of roots) {
    for (const name of readdirSync(dir)) {
      if (/^spec-template.*\.md$/.test(name)) found.push(join(dir, name));
    }
  }
  return found;
}

describe("spec templates — no bare behavior ordinals anywhere", () => {
  const templates = discoverSpecTemplates();

  it("discovers every spec template", () => {
    assert.ok(templates.length >= 7, `expected >= 7 spec templates, found ${templates.length}`);
  });

  for (const file of templates) {
    it(`${file.slice(ROOT.length + 1)} renders no ordinal behavior item`, () => {
      const body = readFileSync(file, "utf8");
      const start = body.search(/^#{2,3} Behaviors\s*$/m);
      if (start === -1) return; // template has no Behaviors section by design
      const rest = body.slice(start).replace(/^#{2,3} Behaviors\s*$/m, "");
      const end = rest.search(/\n#{2,3} /);
      const behaviors = end === -1 ? rest : rest.slice(0, end);

      assert.doesNotMatch(
        behaviors,
        /^\d+\.\s+\*\*When\*\*/m,
        "behavior statements must not render as an ordered-list ordinal"
      );
      assert.match(behaviors, /^- \*\*BEH-\d+\*\*/m, "behaviors must open with a bolded BEH- ID");
    });
  }
});
```

- [ ] **Verify test fails**

This task depends on Task 4, so the templates are already conforming and a plain run would go green immediately. The **primary** procedure is therefore the deliberate-revert check: temporarily revert one template's placeholder to `1. **When** ... **then** ...`, run `node --test tests/behavior-id-convention.test.mjs`, confirm the sweep FAILS naming that file, then restore the template and confirm it passes. A guard that has never been seen red is not a guard.

- [ ] **Implement**

No source change — this task's deliverable *is* the test. Confirm the guard behaves as designed:
- the four no-Behaviors templates (`artifact`, `skill`, `integration`, `action`) are skipped by the `start === -1` early return, not asserted against;
- the three Behaviors-bearing templates are each asserted.

- [ ] **Verify test passes**

Run: `node --test tests/behavior-id-convention.test.mjs`
Expected: PASS (full suite)

Then run the whole gate: `npm test`
Expected: PASS — in particular `tests/skills-no-inline-node.test.mjs` must still pass, confirming the `skills/specify/SKILL.md` edits introduced no inline-Node pattern and no both-forms violation within an H3 section.

- [ ] **Commit**

```bash
git add tests/behavior-id-convention.test.mjs
git commit -m "test(setup): sweep every spec template for bare behavior ordinals

Spec: .context-index/specs/cross-cutting/spec-behavior-ids.spec.md
Plan-task: 5"
```

---

## Acceptance Criteria Coverage

| # | Criterion (abbreviated) | Task(s) |
|---|---|---|
| 1 | Step 4 states form, unordered rendering, allocation, tombstone | 1 |
| 2 | Revision obligations (BEH-3, BEH-5, BEH-4) | 2 |
| 3 | Legacy specs not retro-migrated (BEH-7) | 2 |
| 4 | `--extract` and `--from-diff` cross-reference the convention | 3 |
| 5 | Three templates render the ID placeholder + tombstone comment | 4 |
| 6 | No Behaviors-bearing template renders a bare `N.` ordinal | 4, 5 |
| 7 | A test under `tests/` asserts criteria 5 and 6 across every template | 1 (creates suite), 4, 5 |
| 8 | Inserting a behavior changes exactly one line (BEH-2) | 2 (stated as an authoring obligation; witnessed by the spec's own Behaviors section) |
| 9 | `skills/specify/SKILL.md` still contains no inline Node | 1, 2, 3 (guarded by `tests/skills-no-inline-node.test.mjs` in Task 5's full-gate run) |
| 10 | All quality gates pass (`npm test`) | 5 |
| 11 | No constitutional violations introduced | all |

**Not covered by any task, by design:** the reviewer-prompt anchor guidance (spec Out of Scope — two edits to `structural-architect-prompt.md` / `security-reviewer-prompt.md`, two additions to `consistency-analyzer-prompt.md` / `quick-synthesized-reviewer-prompt.md`). Until that follow-up ships, new specs carry IDs but reviewers still cite ordinals, so the measured 36.7% dangling+shifted rate will not improve from this plan alone. That consequence is stated in the spec and is the accepted scope boundary, not an omission.

## Constitution Check

| Principle / Rule | Status |
|---|---|
| P1 — Minimize external dependencies | No new dependency; suite uses `node:test`, `node:fs`, `node:path`, `node:url` only |
| P2 — Skills are primarily markdown | The whole deliverable is markdown authoring guidance plus template shape; nothing must run for a conforming spec to be authored |
| P3 — Pure ESM | The new test file is `.mjs` with ESM imports |
| Anti-pattern — no executable logic / inline Node in SKILL.md | Tasks 1-3 add prose and fenced **markdown** examples only. No `node -e`, no `node --input-type=module -e` heredoc, no `Run inline Node.js:` heading, and no fenced `javascript` block in the edited sections |
| Anti-pattern — no both-forms violation in one H3 section | The edited H3 sections gain no `adev <verb>` invocation and no inline-Node block; the existing balance is unchanged |
| Pattern — templates consumed verbatim by `cpSync()` | Relied on deliberately: template edits change new scaffolds only, leaving ~247 existing specs untouched (BEH-7) |
| Architecture Boundaries — autonomous | "Editing skill markdown content", "Updating templates", "Adding tests" are all listed as agent-autonomous. No human-approval boundary is crossed; no lifecycle order change, no hook-protocol change, no version bump |

No boundary violations detected. `.context-index/governance/boundaries.yaml` defines no active rules (all example rules are commented out).

---

## Quality Gates

Gate definitions come from `.context-index/governance/gates.yaml` (it exists, so it supersedes the constitution's Quality Gates block).

- **`test` — Test Suite:** `npm test` (deterministic; blocking)
- **`integration-test` — Integration Tests (eval tier):** `npm run test:evals` (deterministic; run per its configured tier)
- **Lint / typecheck:** not configured in `gates.yaml` (both entries commented out) — skipped
- All acceptance criteria from the spec satisfied (see coverage table above)

After all tasks are complete, `/adev:validate` verifies the full gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.
