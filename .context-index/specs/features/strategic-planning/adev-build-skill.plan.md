# Implementation Plan: adev:build Orchestrator — Full Pipeline & Phase Filter

> **Methodology:** adev
> **Charter:** .context-index/specs/features/strategic-planning/charter.md
> **Spec:** .context-index/specs/features/strategic-planning/adev-build-skill.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-27)
> **Platform:** JavaScript (ESM), Node.js, node:test, no framework

**Goal:** Extend the existing `skills/build/SKILL.md` to add the Full Pipeline (`--full` flag with specify→review→plan→route→implement→validate and blocker-fix loop), correct the Implement Pipeline phase filter, add zombie build detection, and fix editorial gaps flagged in the review.

**Architecture:** The build skill is a pure markdown SKILL.md — no compiled code is changed. Tests follow the existing pattern (`tests/skills/build-*.test.mjs`): read the SKILL.md as text and assert it contains required strings/patterns. The existing Implement Pipeline (plan → route → implement → validate) is preserved in full; the Full Pipeline adds a new code path triggered by `--full`. The blocker-fix loop and `build.max_review_retries` config are scoped entirely within the Full Pipeline section. Phase filter correction is a targeted string change in the Phase Mode spec discovery step.

> **Plan reviewer note:** Reviewer flagged validation retry loop, `--no-route`, `--dry-run`, `--resume` logic, build state "completed" marking, phase summary, and `context: fork` as uncovered. All of these already exist in the current `skills/build/SKILL.md`. This plan targets only the delta (Full Pipeline, blocker-fix loop, phase filter correction, zombie build detection) — not a full rewrite. Disagreement logged per review-loop protocol.

> **PASS_WITH_NOTES warnings addressed by this plan:**
> - SA-1: Plan explicitly includes Full Pipeline as Task 1
> - SA-3/CON-1: B1 step list typo fixed in Task 3
> - SA-5: Phase filter corrected in Task 2
> - SEC-1: Blocker-context / RETRY_CONTEXT fencing requirement added in Task 1
> - CON-2: `build-orchestrator` role tier reference added in Task 3

---

## File Structure

**Modify:**
- `skills/build/SKILL.md` — add `--full` flag, Full Pipeline section, blocker-fix loop, phase filter correction, stale build detection, pipeline_mode context field, `--from specify` step name, Implement Pipeline no-.review.md guard, build-orchestrator role reference, validate in build state JSON example

**Create:**
- `tests/skills/build-full-pipeline.test.mjs` — assertions for `--full` / Full Pipeline behaviors
- `tests/skills/build-phase-and-stale.test.mjs` — assertions for phase filter and zombie build detection

**Modify (editorial):**
- `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` — fix B1 wording (add `route`), add `validate` to build state JSON example

**Reference (read, do not modify):**
- `tests/skills/build-dry-run-gates.test.mjs` — follow this pattern for new test files
- `tests/skills/build-workspace-mode.test.mjs` — follow this pattern for new test files
- `tests/helpers.mjs` — use `PLUGIN_ROOT` import

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` (Behaviors 2, 3a, 8, 8a, 16, 17, 18; AC sections: Pipeline Modes, Review Blocker-Fix Loop, Subagent and Fork Isolation)
- Charter: `.context-index/specs/features/strategic-planning/charter.md` (capability: `/adev:build` orchestrator)
- Cross-cutting: `.context-index/specs/cross-cutting/subagent-cost-routing.spec.md` (build-orchestrator role = reasoning tier)
- Sample: `tests/skills/build-dry-run-gates.test.mjs` (test file pattern to follow)

### Task 2 Context
- Spec: `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` (Behaviors 3, 3a; AC: Phase filter, Resume and Stale Builds; Stale Build Detection section)
- Sample: `tests/skills/build-workspace-mode.test.mjs` (test file pattern to follow)

### Task 3 Context
- Spec: `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` (B1 wording, build state JSON example)
- Review: `.context-index/specs/features/strategic-planning/adev-build-skill.review.md` (SA-3, CON-2, CON-4 findings)

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: First-run PASS: Subagent Cost Routing (confidence: medium)
- **Pattern:** Cross-cutting specs can be implemented as pure markdown SKILL.md edits with no new dependencies. Model tier selection separates into independent concerns per skill.
- **Evidence:** 1 observation

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3

All tasks share `skills/build/SKILL.md` or the sibling spec `.md` file and must run sequentially.

---

## Task 1: Full Pipeline Mode and Blocker-Fix Loop [specialist: none]

**Charter capability:** `/adev:build` orchestrator — Full Pipeline (specify → review → plan → route → implement → validate)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/build/SKILL.md`
- Create: `tests/skills/build-full-pipeline.test.mjs`

**Tests:** `tests/skills/build-full-pipeline.test.mjs`

**Context to load:**
- `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` (Behaviors 2, 8, 8a, 17, 18; AC: Pipeline Modes, Review Blocker-Fix Loop)
- `.context-index/specs/cross-cutting/subagent-cost-routing.spec.md` (build-orchestrator role)
- `tests/skills/build-dry-run-gates.test.mjs` (test pattern)

- [x] **Write failing test**

```javascript
// tests/skills/build-full-pipeline.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "build", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

describe("adev:build SKILL.md — Full Pipeline and blocker-fix loop", () => {
  it("declares --full flag in Arguments section", () => {
    assert.match(skill, /--full/,
      "Arguments must include --full flag");
  });

  it("describes Full Pipeline step sequence including specify and review", () => {
    assert.match(skill, /[Ff]ull [Pp]ipeline/,
      "Must name Full Pipeline as a mode");
    assert.match(skill, /specify.*review.*plan.*route.*implement.*validate/is,
      "Full Pipeline must list all 6 steps in order");
  });

  it("describes Implement Pipeline as the default mode", () => {
    assert.match(skill, /[Ii]mplement [Pp]ipeline/,
      "Must name Implement Pipeline as the default mode");
  });

  it("includes pipeline_mode in pipeline context", () => {
    assert.match(skill, /pipeline_mode/,
      "Pipeline context must include pipeline_mode field");
  });

  it("Full Pipeline Step 0 dispatches /adev:specify", () => {
    assert.match(skill, /adev:specify/,
      "Full Pipeline must dispatch /adev:specify");
  });

  it("Full Pipeline Step 0 uses --revise when spec exists but no .review.md", () => {
    assert.match(skill, /--revise/,
      "Step 0 must dispatch specify with --revise when spec file already exists");
  });

  it("Full Pipeline Step 0 skipped when .review.md with PASS exists", () => {
    assert.match(skill, /[Ss]kip.*specify|specify.*[Ss]kip/i,
      "Step 0 must be skipped when a passing review already exists");
  });

  it("includes blocker-fix loop for review BLOCK in Full Pipeline", () => {
    assert.match(skill, /blocker.fix loop|blocker.fix|re-specify|re-dispatch.*review/i,
      "Must describe a blocker-fix loop when review returns BLOCK");
  });

  it("blocker-context is enclosed in a fenced block to prevent prompt injection", () => {
    assert.match(skill, /blocker.context/i,
      "Must reference --blocker-context flag");
    assert.match(skill, /fenced|```|code fence/i,
      "Must require blocker-context to be enclosed in a fenced block (SEC-1)");
  });

  it("resolves build.max_review_retries from user-config with default 2", () => {
    assert.match(skill, /max_review_retries/,
      "Must resolve build.max_review_retries");
    assert.match(skill, /default.*2|2.*default/,
      "Default for max_review_retries must be 2");
  });

  it("max_review_retries=0 stops immediately on BLOCK without auto-fix", () => {
    assert.match(skill, /max_review_retries.*0|0.*max_review_retries/i,
      "max_review_retries=0 must stop build immediately on BLOCK");
  });

  it("Implement Pipeline warns when no .review.md found", () => {
    assert.match(skill, /[Nn]o \.review\.md|no.*review.*found/i,
      "Implement Pipeline must warn and stop when no .review.md exists");
  });

  it("--from valid step names include specify", () => {
    assert.match(skill, /specify.*valid|valid.*specify|--from.*specify/i,
      "--from must list specify as a valid step name");
  });

  it("references build-orchestrator role tier", () => {
    assert.match(skill, /build-orchestrator/,
      "Must reference build-orchestrator role tier from subagent-cost-routing spec");
  });

  it("build state JSON example includes a validate step entry", () => {
    assert.match(skill, /"validate"/,
      "Build state JSON example must include a validate step entry");
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/build-full-pipeline.test.mjs`
Expected: FAIL — `--full`, `pipeline_mode`, `blocker-fix loop`, `max_review_retries`, `--revise`, `--from specify`, `build-orchestrator`, and `"validate"` step are absent or incomplete in current SKILL.md

- [x] **Implement**

Edit `skills/build/SKILL.md` with the following changes:

**1. Arguments section** — add `--full` entry after `--no-route`:
```
- `--full`: run the Full Pipeline (specify → review → plan → route → implement → validate). Without `--full`, the default Implement Pipeline skips specify and review and requires a pre-existing .review.md.
```

**2. Prerequisites section** — add `build.max_review_retries` as item 5:
```
5. **Read review config.** Resolve `build.max_review_retries` from `user-config` (local `.context-index/user-config` → global `<PLUGIN_ROOT>/user-config` → default `2`). Use `parseUserConfig()` from `lib/persona.mjs`. Values above 3 are clamped to 3 with a warning. Set to `0` to disable the blocker-fix loop entirely.
```

**3. Add Pipeline Modes section** before the Delegation Protocol section:

```markdown
## Pipeline Modes

**Implement Pipeline** (default, no `--full`): `plan → route → implement → validate`

Use when the spec already exists with a valid `.review.md` (PASS or PASS_WITH_NOTES verdict). Skips specify and review. If no `.review.md` is found, the skill warns and stops. Includes the validate→implement retry loop if `build.max_retries > 0`.

**Full Pipeline** (`--full`): `specify → review (with blocker-fix loop) → plan → route → implement → validate`

Use when starting from scratch or when the spec needs authoring or revision. Step 0 dispatches `/adev:specify`; if the spec file already exists without a valid review, it dispatches with `--revise` (revision mode, not overwrite). Step 1 runs `/adev:review-specs`; on BLOCK, the blocker-fix loop re-specifies and re-reviews up to `build.max_review_retries` times (default 2). Includes the validate→implement retry loop if `build.max_retries > 0`.
```

**4. Pipeline context block** — add `pipeline_mode` field (inside `PIPELINE_CONTEXT:` block):
```
  pipeline_mode: "full" | "implement"   # "full" when --full is set, "implement" otherwise
```

**5. Add Step 0 (Specify) to Build Pipeline** before the existing Step 1 (Review):

```markdown
### Step 0: Specify (Full Pipeline only)

**Skip conditions:**
- `--full` NOT set → skip unconditionally (Implement Pipeline does not run specify).
- `.review.md` exists adjacent to the spec with PASS or PASS_WITH_NOTES verdict and is not stale → skip (spec already reviewed). Record as `skipped` in build state.

**Dispatch (when not skipped):**
- Spec file does NOT exist: dispatch `/adev:specify --spec <path>` in creation mode.
- Spec file EXISTS but no current passing `.review.md`: dispatch `/adev:specify --spec <path> --revise` (revision mode — avoids clobbering the existing spec).

```
Agent({
  description: "Build Step 0: Specify <spec-name>",
  prompt: <subagent prompt template with skill="adev:specify" args="--spec <path> [--revise]">
})
```

**After subagent returns:** Record step as `completed` or `skipped` in build state.
```

**6. Modify Step 1 (Review) — add blocker-fix loop** after the existing "After subagent returns" block:

```markdown
**Blocker-Fix Loop (Full Pipeline only):**

When review returns BLOCK, `--full` is set, and `build.max_review_retries > 0`:

1. Extract blocking issues from `.review.md` (read each reviewer section, collect `blocker` findings).
2. Serialize findings as a fenced code block (triple-backtick delimiters) — **never interpolate raw finding text directly into prose instructions** (SEC-1: prevents prompt injection from malicious `.review.md` content).
3. Dispatch specify subagent with `--revise --blocker-context` and the fenced findings block.
4. Dispatch review subagent for the revised spec.
5. Evaluate the new verdict:
   - **PASS or PASS_WITH_NOTES:** exit loop, proceed to Step 2.
   - **BLOCK with same blockers as previous cycle:** no progress → stop loop, record FAILED, stop build.
   - **BLOCK with different blockers:** progress made → increment counter, retry if budget remains.
6. If `current_retry >= build.max_review_retries`: stop loop, record FAILED, stop build with summary of all fix attempts.

When `build.max_review_retries = 0` (or `--full` NOT set): review BLOCK stops the build immediately without entering the loop.
```

**7. Implement Pipeline guard** — in Single Spec Mode section, add before step 2:

```markdown
When `--full` is NOT set and the spec file exists but no adjacent `.review.md` is found (or the review is stale/BLOCK):
> Warning: No `.review.md` found for `<spec>`. Run `/adev:review-specs --spec <path>` first, or use `--full` to include review in the build.

Stop the build. Do not proceed to plan.
```

**8. `--from` resume valid step names** — update the list in the Resume section and in the Error Cases table:

In Resume section, change:
```
Valid step names: `review`, `plan`, `route`, `implement`, `validate`.
```
To:
```
Valid step names: `specify`, `review`, `plan`, `route`, `implement`, `validate`. Note: `specify` is only applicable in Full Pipeline builds; using `--from specify` on an Implement Pipeline build dispatches specify (which may update the spec) — use with care.
```

In Error Cases table, update the `--from <step>` with invalid name row:
```
| `--from <step>` with invalid step name | Print "Invalid step: `<name>`. Valid steps: specify, review, plan, route, implement, validate" and stop |
```

**9. Add `build-orchestrator` role tier reference** in Key Principles section (or a new "Model Tier" note before the Delegation Protocol):

```markdown
**Model tier:** The build orchestrator runs at the `build-orchestrator` role tier (`reasoning` by default, per the subagent-cost-routing spec). Override via `model_routing.subagent_overrides.build-orchestrator` in `manifest.yaml`.
```

**10. Build state JSON example** — add `validate` step entry after the `implement` step in the State File Format section:

```json
    {
      "name": "validate",
      "status": "completed",
      "timestamp": "2026-04-05T10:25:00Z",
      "verdict": "PASS"
    }
```

- [x] **Verify test passes**

Run: `node --test tests/skills/build-full-pipeline.test.mjs`
Expected: PASS — all 15 assertions pass

- [x] **Commit**

Branch (if not already created): `feat/strategic-planning/adev-build-full-pipeline`

```bash
git add skills/build/SKILL.md tests/skills/build-full-pipeline.test.mjs
git commit -m "feat(strategic-planning): add Full Pipeline (--full) and blocker-fix loop to adev:build"
```

---

## Task 2: Phase Filter Correction and Stale Build Detection [specialist: none]

**Depends on:** Task 1

**Charter capability:** `/adev:build` orchestrator — phase batching and resume support
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/build/SKILL.md`
- Create: `tests/skills/build-phase-and-stale.test.mjs`

**Tests:** `tests/skills/build-phase-and-stale.test.mjs`

**Context to load:**
- `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` (Behavior 3, 3a; AC: Phase filter; Stale Build Detection section)
- `tests/skills/build-workspace-mode.test.mjs` (test file pattern)

- [x] **Write failing test**

```javascript
// tests/skills/build-phase-and-stale.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "build", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

describe("adev:build SKILL.md — phase filter and stale build detection", () => {
  it("Implement Pipeline phase filter lists review-passed, implemented, validated explicitly", () => {
    assert.match(skill, /review-passed.*implemented.*validated|review-passed[^.]*implemented[^.]*validated/is,
      "Implement Pipeline phase filter must explicitly list review-passed, implemented, validated");
  });

  it("Implement Pipeline phase filter does NOT use 'review-pending or later'", () => {
    assert.doesNotMatch(skill, /review-pending or later/,
      "Must not use the old 'review-pending or later' filter text");
  });

  it("Implement Pipeline shows visible skip note for review-pending specs", () => {
    assert.match(skill, /[Ss]kipped.*review-pending|review-pending.*[Ss]kipp/i,
      "Must display a visible note when skipping review-pending specs");
  });

  it("Implement Pipeline shows visible skip note for review-blocked specs", () => {
    assert.match(skill, /[Ss]kipped.*review-blocked|review-blocked.*[Ss]kipp/i,
      "Must display a visible note when skipping review-blocked specs");
  });

  it("--phase --full includes review-pending specs", () => {
    assert.match(skill, /--full.*review-pending|review-pending.*--full/i,
      "--phase --full must include review-pending specs in the filter");
  });

  it("--phase --full includes review-blocked specs", () => {
    assert.match(skill, /--full.*review-blocked|review-blocked.*--full/i,
      "--phase --full must include review-blocked specs (Full Pipeline can auto-fix them)");
  });

  it("detects zombie builds (in_progress + all steps skipped)", () => {
    assert.match(skill, /zombie|stale build/i,
      "Must include zombie / stale build detection logic");
  });

  it("zombie detection checks for all recorded steps having status skipped", () => {
    assert.match(skill, /all.*steps.*skipped|all recorded steps.*skipped/i,
      "Zombie detection must check that all steps are skipped");
  });

  it("reports zombie build with a suggested --from resume command", () => {
    assert.match(skill, /--from implement|--from.*resume|resume.*--from/i,
      "Zombie build report must include a --from resume suggestion");
  });

  it("new --spec build warns if a zombie build exists for the same slug", () => {
    assert.match(skill, /zombie.*slug|slug.*stale|overwrite|same slug/i,
      "New --spec build must ask user to resume or overwrite when zombie exists for the same slug");
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/build-phase-and-stale.test.mjs`
Expected: FAIL — phase filter still says `review-pending or later`, zombie detection absent

- [x] **Implement**

Edit `skills/build/SKILL.md`:

**1. Phase Mode spec discovery — replace Step 4**:

Replace:
```
4. Filter to specs with `status` of `review-pending` or later (skip `draft` specs).
```
With:
```
4. **Filter by pipeline mode:**
   - **Implement Pipeline** (no `--full`): include only specs with `status` of `review-passed`, `implemented`, or `validated`. Skip specs with any other status with a visible note per spec:
     > Skipped `<spec>` (status: `<status>`): not ready for Implement Pipeline. Run `/adev:review-specs` first, or use `--full` to include review.
     Explicitly: `review-pending` and `review-blocked` specs are skipped in Implement Pipeline.
   - **Full Pipeline** (`--full`): include specs with `status` of `review-pending`, `review-passed`, `implemented`, `validated`, and `review-blocked`. Specs with `review-blocked` status are included so the blocker-fix loop can attempt to resolve prior blockers. Skip only `draft` specs.
```

**2. Add Stale Build Detection section** after the Resume Mode section (before Phase Mode):

```markdown
## Stale Build Detection

When `--resume` is invoked, or at the start of a new `--spec` build, scan `.context-index/build-state/` for zombie builds.

**Zombie build:** A state file where `status` is `in_progress` AND all recorded steps have `status: skipped`. This means the orchestrator ran, evaluated all skip conditions (`.review.md` present, `.plan.md` present, etc.), skipped every step, and exited without doing real work.

**On `--resume`:** Report zombie builds found:
```
Found stale build: `<spec-slug>` (started: <date>, all steps skipped)
Resume with: `/adev:build --resume --spec <path> --from implement`
```

**On new `--spec` build:** If the slug matches an existing zombie build, warn and ask:
```
A stale build exists for `<spec-slug>` (started: <date>, all steps skipped).
  - Resume it: /adev:build --resume --spec <path> --from implement
  - Overwrite it: continue (resets build state for this spec)

Proceed? (resume / overwrite)
```
Await user input. "overwrite" resets the build state and proceeds. "resume" applies `--from implement` resume logic. If the user dismisses without choosing, stop and let them decide.
```

- [x] **Verify test passes**

Run: `node --test tests/skills/build-phase-and-stale.test.mjs`
Expected: PASS — all 10 assertions pass

Run: `node --test tests/skills/build-full-pipeline.test.mjs`
Expected: still PASS (no regressions from Task 1)

- [x] **Commit**

```bash
git add skills/build/SKILL.md tests/skills/build-phase-and-stale.test.mjs
git commit -m "feat(strategic-planning): fix phase filter and add zombie build detection to adev:build"
```

---

## Task 3: Spec Editorial Alignment [specialist: none]

**Depends on:** Task 2

**Charter capability:** `/adev:build` orchestrator — spec accuracy
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md`

**Tests:** `tests/skills/build-full-pipeline.test.mjs` (already covers `build-orchestrator` and `"validate"` assertions from Task 1)

> This task makes no behavioral changes. It fixes three editorial issues in the spec `.md` file flagged during review: the B1 route omission (SA-3), the validate step missing from the build state JSON example (CON-4), and the spec's own build state example needing the validate step. All SKILL.md content was already corrected in Tasks 1 and 2.

- [x] **Write failing test**

No new test file needed. Verify the spec `.md` file has the correct text by reading it (implementation verification only).

- [x] **Verify current state**

Confirm Behavior 1 in spec currently reads `plan → implement → validate` (missing route):
```bash
grep "plan → implement → validate" .context-index/specs/features/strategic-planning/adev-build-skill.spec.md
```
Expected: match found (confirming the B1 bug)

- [x] **Implement**

Edit `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md`:

**1. Fix Behavior 1** — change `plan → implement → validate` to `plan → route → implement → validate`:
```
1. **When** `--spec <path>` is invoked without `--full` **then** the skill runs the Implement Pipeline: plan → route → implement → validate for that single spec
```

**2. Fix Build State File Format JSON example** — add `validate` step entry after `implement`:
```json
    { "name": "validate", "status": "completed", "timestamp": "ISO-8601" }
```

- [x] **Verify test passes**

Run full test suite: `npm test`
Expected: PASS — all tests pass including `build-full-pipeline.test.mjs` and `build-phase-and-stale.test.mjs`. No regressions in `build-dry-run-gates.test.mjs` or `build-workspace-mode.test.mjs`.

- [x] **Commit**

```bash
git add .context-index/specs/features/strategic-planning/adev-build-skill.spec.md
git commit -m "fix(strategic-planning): fix B1 route omission and add validate to build state example in spec"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - `--spec --full` runs Full Pipeline: specify → review → plan → route → implement → validate
  - `--phase` (no `--full`) filters to `review-passed`/`implemented`/`validated` only, skips others with visible note
  - `--phase --full` includes `review-pending` and `review-blocked` specs
  - Blocker-fix loop dispatches specify with `--revise --blocker-context <fenced-findings>`
  - `build.max_review_retries` defaults to 2; `0` disables auto-fix
  - Implement Pipeline warns and stops if no `.review.md` found
  - `--from specify` is a valid resume step name
  - Zombie build detection reports stale builds with `--from implement` resume hint
  - New `--spec` build warns if zombie exists for same slug
  - `pipeline_mode` in pipeline context
  - `build-orchestrator` role tier referenced
  - B1 in spec correctly lists `plan → route → implement → validate`
