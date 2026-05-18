<!-- partial_schema: plan@1 -->

# Implementation Plan: Brainstorm Step 8 Capability Grouping Suggestions

> **Methodology:** adev
> **Charter:** .context-index/specs/features/design/charter.md
> **Spec:** .context-index/specs/features/design/brainstorm-spec-grouping.spec.md
> **Review:** PASS (2026-05-18)
> **Platform:** Node.js (ESM, .mjs), npm, node:test

**Goal:** Enrich `/adev:brainstorm` Step 8 so that, before handing off to `/adev:specify`, it renders a deterministic Spec Organization Plan (capability grouping table, optional ASCII dependency graph, three named heuristic citations) whenever the charter has at least two must-have capabilities.

**Architecture:** A pure markdown-only edit to `skills/brainstorm/SKILL.md` Step 8 — no companion code, no new flags, no new files written by the skill. Three heuristics (`cohesion`, `dependency-chain`, `blast-radius`) are defined inline in the SKILL.md so the rendering stays reproducible across model runs. Edge-case behavior (0 / 1 / >12 capabilities, conflicting heuristics, user override) is encoded directly into the Step 8 prose. A node:test fixture in `tests/skills/` asserts the SKILL.md contract (sections present, heuristics defined, failure modes documented) and pins the cursor-provider 5-spec grouping as a regression scenario.

---

## File Structure

**Create:**
- `tests/skills/brainstorm-spec-grouping.test.mjs` — node:test asserting Step 8 contract (sections, heuristics, failure modes, regression fixture)

**Modify:**
- `skills/brainstorm/SKILL.md:523-537` — replace Step 8 body with Spec Organization Plan section while preserving the `/adev:specify` handoff terminal state

**Reference (read, do not modify):**
- `.context-index/specs/features/design/brainstorm-spec-grouping.spec.md` — Output Contract, Failure Modes, Acceptance Criteria
- `.context-index/specs/features/design/charter.md` — Design charter Key Behaviors (brainstorming-is-a-gate, specify-is-1:1-to-spec)
- `.context-index/specs/features/design/brainstorm-product-bootstrap.spec.md` — sibling spec pattern (additive Step 5b) to mirror the additive Step 8 style
- `.context-index/specs/features/design/specify-creates-feature.spec.md` — confirms `/adev:specify` handoff contract is unchanged
- `tests/skills/brainstorm-kind-routing.test.mjs` — golden pattern for skill-markdown contract tests (uses `existsSync` + `readFileSync` + substring assertions against `PLUGIN_ROOT`)
- `tests/helpers.mjs` — exports `PLUGIN_ROOT` used by the new test

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/design/brainstorm-spec-grouping.spec.md` (Output Contract sections 1-5, Failure Modes table)
- Charter: `.context-index/specs/features/design/charter.md` (capability: capability-grouping output in brainstorm)
- Source files: `skills/brainstorm/SKILL.md` (Step 8 block, lines 523-537) — full read for the implementer
- Sibling spec: `.context-index/specs/features/design/brainstorm-product-bootstrap.spec.md` — confirms additive-step pattern
- Heuristics: 0 entries scoped to module `design` (heuristic store contains no design-module entries; project-wide heuristics seen but not module-bound)

### Task 2 Context
- Spec: `.context-index/specs/features/design/brainstorm-spec-grouping.spec.md` (Acceptance Criteria — all bullets, especially the cursor-provider 5-spec regression scenario)
- Source files:
  - `tests/skills/brainstorm-kind-routing.test.mjs` (full read — golden pattern for markdown-contract tests)
  - `tests/helpers.mjs` (full read — exports `PLUGIN_ROOT`)
  - `skills/brainstorm/SKILL.md` (post-edit content from Task 1, full read — assertions reference its sections and heuristic names)
- Boundary rules: `governance/boundaries.yaml` reports `boundaries: []` — no constraints

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2 asserts Task 1's SKILL.md edit)

No parallelism is available — both tasks touch overlapping conceptual ground (the Step 8 contract) and Task 2 must read the post-edit SKILL.md to assert against it.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Rewrite brainstorm Step 8 with Spec Organization Plan | medium | unit | — | 0 create, 1 modify |
| 2 | Add Step 8 contract test with cursor-provider regression fixture | medium | unit | Task 1 | 1 create, 0 modify |

---

## Task Structure

### Task 1: Rewrite brainstorm Step 8 with Spec Organization Plan [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Pure markdown edit to a single SKILL.md file with explicit Output Contract, Failure Modes table, and a sibling additive-step pattern (`brainstorm-product-bootstrap.spec.md`) as direct reference; low blast radius and no boundary crossings.

**Charter capability:** Design — `adev:brainstorm` (enriches the terminal handoff so downstream `/adev:specify` calls have a deterministic starting grouping)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/brainstorm/SKILL.md:523-537`

**Tests:** `tests/skills/brainstorm-spec-grouping.test.mjs` — created in Task 2; Task 1's edit is exercised indirectly by the Task 2 contract test that reads the post-edit SKILL.md.

**Context to load:**
- `.context-index/specs/features/design/brainstorm-spec-grouping.spec.md` (Output Contract + Failure Modes)
- `.context-index/specs/features/design/brainstorm-product-bootstrap.spec.md` (additive-step pattern reference)
- `skills/brainstorm/SKILL.md` (full file — Step 8 is at lines 523-537 but the surrounding Steps 6-7 inform tone and terminal-state wording)

- [ ] **Write failing test**

  This task's TDD pair is the contract test authored in Task 2. To honor the "write failing test first" rule, scaffold the test file's failing assertion in Task 2 first, then return here to implement Task 1's edit — OR, equivalently, run Task 2's RED step before this task's implement step. The plan orders Task 1 before Task 2 for narrative clarity (the edit is the unit of value); the implementer should physically interleave: write Task 2's failing test → implement Task 1's edit → verify Task 2 passes → commit each as separate commits.

  In practice, the implementer authors `tests/skills/brainstorm-spec-grouping.test.mjs` with the assertions described in Task 2 BEFORE editing SKILL.md, runs it, observes failures referencing missing strings (`"Spec Organization Plan"`, heuristic names, failure-mode rows), and only then proceeds to the Implement step below.

- [ ] **Verify test fails**

  Run: `node --test tests/skills/brainstorm-spec-grouping.test.mjs`
  Expected: FAIL — assertions for `"Spec Organization Plan"`, `"cohesion"`, `"dependency-chain"`, `"blast-radius"`, and the Failure Modes substrings cannot find them in the current SKILL.md.

- [ ] **Implement**

  Replace the current Step 8 block (`skills/brainstorm/SKILL.md` lines 523-537) with a Spec Organization Plan section that includes, in order:

  1. **Charter-size routing** — explicit branches for the four edge cases from the spec's Failure Modes table:
     - 0 must-have capabilities → render only "No must-have capabilities yet — extend the charter or proceed to `/adev:specify` directly."
     - exactly 1 must-have capability → skip the grouping table, render the existing single-capability prompt (preserved from the current Step 8 wording).
     - ≥2 and ≤12 must-have capabilities → render the full Spec Organization Plan (grouping table + optional ASCII graph).
     - >12 must-have capabilities → render the table for the top 12 by Priority/Milestone and append the note: "Charter has N capabilities; grouping shown for top 12. Consider splitting the charter."

  2. **Three heuristic definitions, inline.** Define `cohesion`, `dependency-chain`, and `blast-radius` verbatim in the SKILL.md so the model produces stable rationales across runs (spec §Output Contract item 3). The definitions are:
     - **cohesion** — capabilities sharing an invariant (e.g., a multi-file version-parity rule) belong together
     - **dependency-chain** — capability X consumes capability Y → both in one spec unless Y is reused by other specs
     - **blast-radius** — capabilities that touch the same module/file cluster belong together; capabilities that touch independent surfaces should split

  3. **Capability grouping table** rendered as:
     ```
     | Spec | Capabilities | Rationale |
     |---|---|---|
     | <spec-slug> | <cap-1>, <cap-2> | <cohesion / dependency-chain / blast-radius reason> |
     ```
     with the explicit constraint that each rationale cell cites exactly ONE of the three heuristic names.

  4. **ASCII dependency graph** — render the inline diagram (per spec Output Contract item 2) when ≥2 grouped specs have ordering dependencies; omit entirely when independent.

  5. **Heuristic conflict rule** — when two heuristics disagree on the same capability pair, choose the more conservative grouping (separate specs) and emit the note: "ambiguous: `<cap-1>` and `<cap-2>` — cohesion suggests together, blast-radius suggests apart."

  6. **Retained capability list and dual-path handoff** — after the Spec Organization Plan, retain the existing top-priority capability list and offer the user two paths:
     - Specify one *group* (writes one spec covering N capabilities, using the proposed grouping)
     - Specify one *capability* (override the grouping for that single spec)

  7. **Override stickiness** — when the user picks "specify one capability" overriding the group, do not re-render the grouping table on subsequent turns of the same session.

  8. **Terminal state preserved** — the section still ends with "**The terminal state is invoking `/adev:specify`.** Do NOT invoke `/adev:plan`, `/adev:implement`, or any other implementation skill." (verbatim, from current line 536).

  9. **No new files written by Step 8** — this is a chat-only enrichment. Output is durable only via the user's subsequent `/adev:specify` calls (spec §Output Contract item 5).

  No companion code is added (Constitution Principle 2 — Skills are primarily markdown). No new external dependencies (Constitution Principle 1). The change is pure markdown.

- [ ] **Verify test passes**

  Run: `node --test tests/skills/brainstorm-spec-grouping.test.mjs`
  Expected: PASS — all SKILL.md substring assertions resolve.

  Also run the full suite to confirm no regressions in sibling brainstorm tests:
  Run: `npm test`
  Expected: PASS (existing `brainstorm-kind-routing`, `brainstorm-bootstrap`, `brainstorm-workspace-bootstrap`, `brainstorm-prototype-integration` continue to pass).

- [ ] **Commit**

  Branch (if not already created): `feat/design/brainstorm-spec-grouping`

  ```bash
  git add skills/brainstorm/SKILL.md
  git commit -m "feat(design): add Spec Organization Plan to brainstorm Step 8

  Spec: .context-index/specs/features/design/brainstorm-spec-grouping.spec.md
  Plan-task: 1"
  ```

---

### Task 2: Add Step 8 contract test with cursor-provider regression fixture [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Pure pattern application of the cited golden test `tests/skills/brainstorm-kind-routing.test.mjs` with 11 explicitly enumerated substring assertions; single new test file, no boundary crossings.

**Charter capability:** Design — `adev:brainstorm` (regression coverage for the new Step 8 output contract)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/skills/brainstorm-spec-grouping.test.mjs`

**Tests:** `tests/skills/brainstorm-spec-grouping.test.mjs` — the test file itself is the unit under construction; it asserts the SKILL.md contract authored in Task 1.

**Context to load:**
- `tests/skills/brainstorm-kind-routing.test.mjs` — golden pattern for skill-markdown contract assertions (imports `PLUGIN_ROOT` from `../helpers.mjs`, uses `readFileSync` + substring/index checks)
- `tests/helpers.mjs` — exports `PLUGIN_ROOT`
- `.context-index/specs/features/design/brainstorm-spec-grouping.spec.md` (full Acceptance Criteria — every criterion that depends on SKILL.md content gets a matching assertion)
- `skills/brainstorm/SKILL.md` (post-Task-1 — the file under assertion)

- [ ] **Write failing test**

  Create `tests/skills/brainstorm-spec-grouping.test.mjs` as a `node:test` suite mirroring the style of `tests/skills/brainstorm-kind-routing.test.mjs`. The suite asserts:

  1. **Step 8 section exists** — substring `## Step 8: Transition to Specification` is present.
  2. **Spec Organization Plan heading is rendered** — substring `Spec Organization Plan` appears between Step 8 and Step 9 (or end-of-file). Use `indexOf` ordering checks like `kind-routing.test.mjs:36-40`.
  3. **All three heuristics are defined inline** — the SKILL.md contains the literal strings `cohesion`, `dependency-chain`, `blast-radius`, AND each appears alongside its defining gloss (`invariant`, `consumes`, `module/file cluster`) within Step 8.
  4. **Capability grouping table shape is present** — substring `| Spec | Capabilities | Rationale |` appears within Step 8.
  5. **ASCII dependency-graph cue is documented** — substring matching the spec's diagram (e.g., `─→`) appears within Step 8, paired with conditional wording ("when ≥2 grouped specs have ordering dependencies").
  6. **All five failure-mode rows are documented** — each of these substrings appears within Step 8: `0 must-have`, `exactly 1`, `>12`, `ambiguous`, `override`.
  7. **Heuristic conflict rule is encoded** — substring `cohesion suggests together, blast-radius suggests apart` (verbatim from the spec) appears within Step 8.
  8. **Override stickiness is documented** — substring along the lines of `do not re-render the grouping table on subsequent turns` appears within Step 8.
  9. **Terminal-state preservation** — the existing line `The terminal state is invoking \`/adev:specify\`` is still present within Step 8 (verbatim — protect the downstream `/adev:specify` contract from drift).
  10. **No new files written by Step 8** — substring `No new files` (or equivalent — wording-stable test against the spec §Output Contract item 5 contract) appears within Step 8.
  11. **Cursor-provider regression fixture** — the test declares a JS-data fixture representing the 12 capabilities of the (hypothetical) cursor-provider charter and the spec's documented 5-spec grouping (manifest+parity, adapter+sanitization, hook-generator+tests, CLI-integration, sync-target). The fixture is documented in the test file as a frozen reference scenario; for now, this assertion verifies the fixture's shape (12 caps, 5 groups, each group cites exactly one heuristic) rather than re-running the heuristic engine — the engine is the markdown prompt itself, which is exercised by Step 8 at runtime, not by this test. A `TODO(plan-task-implement)` comment notes the future expansion when/if a JS extractor is added.

  Pattern for the test (mirrors `brainstorm-kind-routing.test.mjs:1-15`):

  ```javascript
  import { describe, it, before } from "node:test";
  import assert from "node:assert/strict";
  import { existsSync, readFileSync } from "node:fs";
  import { join } from "node:path";
  import { PLUGIN_ROOT } from "../helpers.mjs";

  const SKILL_PATH = join(PLUGIN_ROOT, "skills", "brainstorm", "SKILL.md");

  describe("adev:brainstorm SKILL.md — Step 8 Spec Organization Plan", () => {
    let content;
    let step8Block;

    before(() => {
      assert.ok(existsSync(SKILL_PATH), "skills/brainstorm/SKILL.md must exist");
      content = readFileSync(SKILL_PATH, "utf8");
      const start = content.indexOf("## Step 8: Transition to Specification");
      assert.ok(start !== -1, "Step 8 heading must exist");
      // Step 8 is currently the final ## section before Key Principles
      const end = content.indexOf("## Key Principles", start);
      step8Block = content.slice(start, end === -1 ? content.length : end);
    });

    // ... individual `it(...)` assertions covering checks 1-11 above
  });
  ```

- [ ] **Verify test fails**

  This step's RED phase happens BEFORE Task 1's implement step (see Task 1's preamble). At that point, the SKILL.md still contains the legacy Step 8 wording (lines 523-537), so assertions 2-10 above all fail with messages naming the missing strings.

  Run: `node --test tests/skills/brainstorm-spec-grouping.test.mjs`
  Expected: FAIL — assertions for `Spec Organization Plan`, the three heuristic names, the table-shape substring, the dependency-graph cue, and the failure-mode substrings are not found.

- [ ] **Implement**

  Author the full test file with all 11 assertions (the `it(...)` blocks plus the cursor-provider fixture). No production code is touched in this task — the "implementation" IS the test.

- [ ] **Verify test passes**

  Run: `node --test tests/skills/brainstorm-spec-grouping.test.mjs`
  Expected: PASS (after Task 1's SKILL.md edit is in place).

  Run: `npm test`
  Expected: PASS — full suite stays green.

- [ ] **Commit**

  Branch (already created in Task 1): `feat/design/brainstorm-spec-grouping`

  ```bash
  git add tests/skills/brainstorm-spec-grouping.test.mjs
  git commit -m "test(design): add Step 8 contract test with cursor-provider regression fixture

  Spec: .context-index/specs/features/design/brainstorm-spec-grouping.spec.md
  Plan-task: 2"
  ```

---

## Task Ordering

Order is enforced by the dependency annotation on Task 2 (`Depends on: Task 1`). However, per TDD the implementer physically interleaves the steps as documented in Task 1's preamble — Task 2's RED phase runs first, then Task 1's Implement, then Task 2 GREEN — committing each task as a distinct commit so the `Plan-task:` trailer stays accurate.

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test` (from `.context-index/governance/gates.yaml::test`, tier=fast, severity=error, triggers post-task and post-implement)
- All acceptance criteria from the spec satisfied:
  - `skills/brainstorm/SKILL.md` Step 8 renders the Capability Grouping table whenever the charter has ≥2 must-have capabilities — covered by Task 1 + Task 2 assertions 2, 4.
  - Each row's rationale cites exactly one of: `cohesion`, `dependency-chain`, `blast-radius` — covered by Task 1 (heuristic definitions + table constraint wording) + Task 2 assertions 3, 11.
  - When ≥2 grouped specs have ordering dependencies, an ASCII dependency graph is rendered; when independent, the graph is omitted — covered by Task 1 + Task 2 assertion 5.
  - The three heuristics are defined inline in the SKILL.md so the rendering is reproducible across model runs — covered by Task 1 (verbatim inline definitions) + Task 2 assertion 3.
  - Edge cases (0 caps, 1 cap, >12 caps, conflicting heuristics, user override) are handled — covered by Task 1 (charter-size routing + conflict rule + override stickiness) + Task 2 assertions 6, 7, 8.
  - `/adev:specify` continues to work whether the user follows the suggested grouping or overrides it — covered by Task 1 (dual-path handoff + terminal-state preservation) + Task 2 assertion 9.
  - The cursor-provider charter's 5-spec grouping is reproducible — covered by Task 2 assertion 11 (frozen-fixture form).
  - No new external dependencies; pure SKILL.md edit — Constitution Principle 1 + 2 satisfied by design (no `package.json` change; no companion code).
  - Lifecycle event log records spec status transitions per existing `/adev:specify` Step 5.5 contract — unchanged by this work (Task 1 explicitly preserves the `/adev:specify` handoff terminal state).
