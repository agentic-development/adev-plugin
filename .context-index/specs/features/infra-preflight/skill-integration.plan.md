<!-- DO NOT EDIT statuses inline — see lifecycle log skill-integration.jsonl -->
# Implementation Plan: Skill Integration — Infrastructure Preflight

> **Methodology:** adev
> **Charter:** .context-index/specs/features/infra-preflight/charter.md
> **Spec:** .context-index/specs/features/infra-preflight/skill-integration.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-01)
> **Platform:** Node.js, JavaScript (ESM), node:test

**Goal:** Add infrastructure preflight steps to 7 SKILL.md files (implement, validate, build, write-test, debug, eval, recover) so skills verify external system availability before executing code or tests.

**Architecture:** All changes are SKILL.md markdown edits — no new executable files. Each skill calls `runPreflight()` from `lib/infra-preflight.mjs` via inline Node.js (same pattern as heuristics loading). Mandatory skills (implement, validate, build, write-test) block on failure; conditional skills (debug, eval, recover) have per-skill policies for blocking vs. advisory. The `--no-infra` flag and `ADEV_NO_INFRA=1` env var provide a user-only bypass. Tests use static content-presence assertions following the pattern in `tests/skills/specify-feature-binding.test.mjs`.

---

## File Structure

**Modify:**
- `skills/implement/SKILL.md` — Insert Step 1.5: Infrastructure Preflight, add --no-infra arg, add ADEV_DISPATCHED_BY for write-test dispatch
- `skills/validate/SKILL.md` — Insert Preflight: Infrastructure Verification after Prerequisites
- `skills/build/SKILL.md` — Add --no-infra arg and ADEV_NO_INFRA=1 passthrough, no preflight step
- `skills/write-test/SKILL.md` — Insert preflight after Step 1, add dispatch detection, strategy-aware skip
- `skills/debug/SKILL.md` — Insert preflight at end of Phase 1 with three-tier resolution
- `skills/eval/SKILL.md` — Insert preflight after prerequisites, layer-aware skip
- `skills/recover/SKILL.md` — Insert preflight after Detect, corrective context injection for infra root causes

**Create:**
- `tests/skills/skill-integration-preflight.test.mjs` — Static content-presence tests for all 7 SKILL.md files

**Reference (read, do not modify):**
- `lib/infra-preflight.mjs` — API: `runPreflight()`, `parseInfraRequirements()`, `formatPreflightReport()`
- `.context-index/specs/features/infra-preflight/skill-integration.spec.md` — Behavioral contract
- `tests/skills/specify-feature-binding.test.mjs` — Test pattern reference

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (Behaviors 1-8)
- Charter: `.context-index/specs/features/infra-preflight/charter.md` (capability: Skill Integration — Mandatory)
- Reference: `skills/implement/SKILL.md` (current structure for insertion point)
- Reference: `lib/infra-preflight.mjs` (API signatures for invocation pattern)

### Task 2 Context
- Spec: `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (Behaviors 1-5, 9-10)
- Reference: `skills/validate/SKILL.md` (current structure for insertion point)

### Task 3 Context
- Spec: `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (Behaviors 11-12)
- Reference: `skills/build/SKILL.md` (current Arguments section)

### Task 4 Context
- Spec: `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (Behaviors 1-5, 13-15)
- Reference: `skills/write-test/SKILL.md` (current Step 1 for insertion point)

### Task 5 Context
- Spec: `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (Behaviors 1-5, 16-18)
- Reference: `skills/debug/SKILL.md` (Phase 1 end for insertion point)

### Task 6 Context
- Spec: `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (Behaviors 1-5, 19-20)
- Reference: `skills/eval/SKILL.md` (prerequisites section for insertion point)

### Task 7 Context
- Spec: `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (Behaviors 1-5, 21-22)
- Reference: `skills/recover/SKILL.md` (Step 1 Detect for insertion point)

### Task 8 Context
- Spec: `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (all Behaviors — full AC list)
- Reference: `tests/skills/specify-feature-binding.test.mjs` (test pattern)
- Reference: all 7 SKILL.md files (content to assert against)

## Parallelization

- Group A (independent): Task 1 (implement SKILL.md)
- Group B (independent): Task 2 (validate SKILL.md)
- Group C (independent): Task 3 (build SKILL.md)
- Group D (independent): Task 4 (write-test SKILL.md)
- Group E (independent): Task 5 (debug SKILL.md)
- Group F (independent): Task 6 (eval SKILL.md)
- Group G (independent): Task 7 (recover SKILL.md)
- Group H (depends on Tasks 1-7): Task 8 (content-presence tests)

Tasks 1-7 modify independent files with no shared dependencies. They can all run in parallel. Task 8 asserts on the output of Tasks 1-7 and must run last.

---

### Task 1: Add preflight step to implement SKILL.md [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Well-specified mandatory skill integration with explicit behavioral contracts (Behaviors 1-8), single-file SKILL.md edit, and mechanical insertion pattern.

**Charter capability:** Skill Integration (Mandatory)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/implement/SKILL.md` — Insert Step 1.5 and update Arguments section
- Test: `tests/skills/skill-integration-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (Behaviors 1-8)
- `lib/infra-preflight.mjs` (API for invocation pattern)

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const IMPLEMENT_PATH = join(PLUGIN_ROOT, "skills", "implement", "SKILL.md");

describe("implement SKILL.md — Infrastructure Preflight", () => {
  it("contains Infrastructure Preflight step heading", () => {
    const c = readFileSync(IMPLEMENT_PATH, "utf8");
    assert.ok(c.includes("Infrastructure Preflight"), "Must include Infrastructure Preflight step");
  });
  it("preflight step is after Load Context and before Execute Tasks", () => {
    const c = readFileSync(IMPLEMENT_PATH, "utf8");
    const loadCtx = c.indexOf("Step 1: Load Context");
    const preflight = c.indexOf("Infrastructure Preflight");
    const step2 = c.indexOf("Step 2:");
    assert.ok(loadCtx < preflight, "Preflight must appear after Step 1: Load Context");
    assert.ok(preflight < step2, "Preflight must appear before Step 2");
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: FAIL — "Infrastructure Preflight" not found in implement SKILL.md

- [ ] **Implement**

Edit `skills/implement/SKILL.md`:

1. Add `--no-infra` to the Arguments section with documentation: "Skip infrastructure preflight verification. User-only control — the agent must never set this flag or `ADEV_NO_INFRA` autonomously."

2. Insert a new section between Step 1 (Load Context) and Step 2 (Per-Task Execution Loop):

   **Step 1.5: Infrastructure Preflight** — Resolve `--no-infra` flag and `ADEV_NO_INFRA` env var (read once at entry, `1` activates bypass). Trust boundary: the library only honors `options.noInfra`, never reads `process.env.ADEV_NO_INFRA`. Call `runPreflight(specPath, planPath, options)` via inline Node.js using the heuristics-loading pattern (plugin root resolution, JSON output parsing). If `passed: false`, display `formatPreflightReport(report)` and block with the options message including `--task N` hint when plan has mixed strategies. If `passed: true` with `skipped: true`, emit "Infrastructure preflight skipped (--no-infra)." Handle lib load failures and `runPreflight()` exceptions per spec Behaviors 4-5.

3. In the Step 2a subagent dispatch section, add: when dispatching write-test subagents, set `ADEV_DISPATCHED_BY=implement` in the subagent environment. Include agent prohibition note.

- [ ] **Verify test passes**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/implement/SKILL.md tests/skills/skill-integration-preflight.test.mjs
git commit -m "feat(implementation): add infrastructure preflight step to implement SKILL.md"
```

---

### Task 2: Add preflight step to validate SKILL.md [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Well-specified mandatory skill integration with explicit placement and blocking message (Behaviors 9-10), single-file edit.

**Charter capability:** Skill Integration (Mandatory)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/validate/SKILL.md` — Insert Preflight section and update Arguments
- Test: `tests/skills/skill-integration-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (Behaviors 1-5, 9-10)

- [ ] **Write failing test**

```javascript
describe("validate SKILL.md — Infrastructure Preflight", () => {
  it("contains Preflight: Infrastructure Verification heading", () => {
    const c = readFileSync(VALIDATE_PATH, "utf8");
    assert.ok(c.includes("Infrastructure Verification"), "Must include Infrastructure Verification");
  });
  it("preflight is after Prerequisites and before Step 0: Load Check Registry", () => {
    const c = readFileSync(VALIDATE_PATH, "utf8");
    const prereq = c.indexOf("Implementation exists");
    const preflight = c.indexOf("Infrastructure Verification");
    const step0 = c.indexOf("Step 0: Load Check Registry");
    assert.ok(prereq < preflight, "Preflight must appear after Prerequisites");
    assert.ok(preflight < step0, "Preflight must appear before Step 0");
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: FAIL

- [ ] **Implement**

Edit `skills/validate/SKILL.md`:

1. Add `--no-infra` to the Arguments section.
2. Insert "Preflight: Infrastructure Verification" section after the three Prerequisites conditions and before the Workspace-Aware Validation Mode section (which precedes Step 0). Include `--no-infra`/`ADEV_NO_INFRA` flag resolution, inline Node.js invocation, validate-specific blocking message (options 1 and 2 only, no `--task N`), lib load failure handling, and exception handling.

- [ ] **Verify test passes**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/validate/SKILL.md tests/skills/skill-integration-preflight.test.mjs
git commit -m "feat(validation): add infrastructure preflight step to validate SKILL.md"
```

---

### Task 3: Add --no-infra passthrough to build SKILL.md [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Simplest task -- document --no-infra arg and ADEV_NO_INFRA passthrough, no preflight step to insert, single-file edit.

**Charter capability:** Skill Integration (Mandatory)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/build/SKILL.md` — Add --no-infra argument and passthrough documentation
- Test: `tests/skills/skill-integration-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (Behaviors 11-12)

- [ ] **Write failing test**

```javascript
describe("build SKILL.md — Infrastructure Preflight", () => {
  it("documents --no-infra in Arguments", () => {
    const c = readFileSync(BUILD_PATH, "utf8");
    assert.ok(c.includes("--no-infra"), "Must document --no-infra in Arguments");
  });
  it("propagates via ADEV_NO_INFRA=1 env var", () => {
    const c = readFileSync(BUILD_PATH, "utf8");
    assert.ok(c.includes("ADEV_NO_INFRA"), "Must document ADEV_NO_INFRA passthrough");
  });
  it("does NOT contain its own preflight step", () => {
    const c = readFileSync(BUILD_PATH, "utf8");
    assert.ok(!c.includes("Step 1.5: Infrastructure Preflight"), "Build must NOT have its own preflight step");
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: FAIL — `--no-infra` not found

- [ ] **Implement**

Edit `skills/build/SKILL.md`:

1. Add `--no-infra` to the Arguments section: "Skip infrastructure preflight verification in implement and validate sub-skills. Propagated via `ADEV_NO_INFRA=1` environment variable. User-only control — the agent must never set this flag or `ADEV_NO_INFRA` autonomously."
2. In the Delegation Protocol / Subagent Prompt Template section, add a note that when `--no-infra` is passed, the orchestrator sets `ADEV_NO_INFRA=1` in the environment for implement and validate subagent dispatches. Build does NOT add its own preflight step — each sub-skill runs its own.

- [ ] **Verify test passes**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/build/SKILL.md tests/skills/skill-integration-preflight.test.mjs
git commit -m "feat(strategic-planning): add --no-infra passthrough to build SKILL.md"
```

---

### Task 4: Add preflight step to write-test SKILL.md [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Well-specified with dispatch detection (ADEV_DISPATCHED_BY) and strategy-aware skip adding minor novelty over basic insertion.

**Charter capability:** Skill Integration (Mandatory)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/write-test/SKILL.md` — Insert preflight after Step 1, dispatch detection, strategy-aware skip
- Test: `tests/skills/skill-integration-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (Behaviors 1-5, 13-15)

- [ ] **Write failing test**

```javascript
describe("write-test SKILL.md — Infrastructure Preflight", () => {
  it("contains Infrastructure Preflight step", () => {
    const c = readFileSync(WRITETEST_PATH, "utf8");
    assert.ok(c.includes("Infrastructure Preflight"), "Must include preflight step");
  });
  it("skips preflight when ADEV_DISPATCHED_BY=implement", () => {
    const c = readFileSync(WRITETEST_PATH, "utf8");
    assert.ok(c.includes("ADEV_DISPATCHED_BY"), "Must check ADEV_DISPATCHED_BY env var");
  });
  it("skips preflight when strategy is unit", () => {
    const c = readFileSync(WRITETEST_PATH, "utf8");
    const preflightSection = c.slice(c.indexOf("Infrastructure Preflight"));
    assert.ok(preflightSection.includes("unit"), "Must skip for unit strategy");
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: FAIL

- [ ] **Implement**

Edit `skills/write-test/SKILL.md`:

1. Add `--no-infra` to invocation modes / arguments.
2. Insert "Step 1.5: Infrastructure Preflight" between Step 1 (Model Tier Resolution) and Step 1b (Strategy Profile Resolution). Include: dispatch detection via `ADEV_DISPATCHED_BY=implement` env var (skip if set), strategy-aware skip for `unit` strategy, `--no-infra`/`ADEV_NO_INFRA` flag resolution, inline Node.js invocation (spec path from `--spec`, plan path is `null`), blocking message.
3. Add agent prohibition: "The agent must not set `ADEV_DISPATCHED_BY=implement` except when dispatching from implement. Setting it to bypass preflight is prohibited."

- [ ] **Verify test passes**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/write-test/SKILL.md tests/skills/skill-integration-preflight.test.mjs
git commit -m "feat(implementation): add infrastructure preflight step to write-test SKILL.md"
```

---

### Task 5: Add preflight step to debug SKILL.md [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=3
**Rationale:** Three-tier resolution strategy (args > active plan > inference) with non-blocking advisory adds composition novelty, but all tiers are well-specified.

**Charter capability:** Skill Integration (Conditional)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/debug/SKILL.md` — Insert preflight at end of Phase 1 with three-tier resolution
- Test: `tests/skills/skill-integration-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (Behaviors 1-5, 16-18)

- [ ] **Write failing test**

```javascript
describe("debug SKILL.md — Infrastructure Preflight", () => {
  it("contains Infrastructure Preflight step in Phase 1", () => {
    const c = readFileSync(DEBUG_PATH, "utf8");
    assert.ok(c.includes("Infrastructure Preflight"), "Must include preflight step");
  });
  it("preflight is after Phase 1: Reproduce and before Phase 2: Investigate", () => {
    const c = readFileSync(DEBUG_PATH, "utf8");
    const phase1 = c.indexOf("Phase 1: Reproduce");
    const preflight = c.indexOf("Infrastructure Preflight");
    const phase2 = c.indexOf("Phase 2: Investigate");
    assert.ok(phase1 < preflight, "Preflight must be after Phase 1");
    assert.ok(preflight < phase2, "Preflight must be before Phase 2");
  });
  it("documents three-tier resolution (args > active plan > inference)", () => {
    const c = readFileSync(DEBUG_PATH, "utf8");
    const preflightSection = c.slice(c.indexOf("Infrastructure Preflight"));
    assert.ok(preflightSection.includes("active plan") || preflightSection.includes("active-plan"), "Must document active plan tier");
    assert.ok(preflightSection.includes("inference") || preflightSection.includes("Inference"), "Must document inference tier");
  });
  it("uses non-blocking advisory for tier 3 (inference)", () => {
    const c = readFileSync(DEBUG_PATH, "utf8");
    assert.ok(c.includes("advisory") || c.includes("Advisory") || c.includes("warning"), "Must use non-blocking advisory for inferred infra");
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: FAIL

- [ ] **Implement**

Edit `skills/debug/SKILL.md`:

1. Add `--no-infra` to the Arguments section.
2. Insert a new step at the end of Phase 1 (after step 3 "Check recent changes" and after the Heuristics substep, before Phase 2: Investigate) titled "Infrastructure Preflight". Include:
   - Three-tier spec/plan resolution: (1) `--spec` argument with `.plan.md` sibling lookup, (2) `.context-index/hygiene/.active-plan` check, (3) module inference via `manifest.yaml` paths with `.plan.md` sibling lookup (cap at 10 specs).
   - Skip when no tier yields `infra_requirements`.
   - Non-blocking advisory with hard user pause when tier 3 (inference) fails. Blocking when tier 1 or 2 fails.
   - `--no-infra`/`ADEV_NO_INFRA` flag resolution, inline Node.js invocation, agent prohibition.

- [ ] **Verify test passes**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/debug/SKILL.md tests/skills/skill-integration-preflight.test.mjs
git commit -m "feat(implementation): add infrastructure preflight step to debug SKILL.md"
```

---

### Task 6: Add preflight step to eval SKILL.md [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Layer-aware skip logic adds minor novelty; otherwise straightforward conditional skill integration with single-file edit.

**Charter capability:** Skill Integration (Conditional)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/eval/SKILL.md` — Insert preflight after prerequisites, layer-aware skip
- Test: `tests/skills/skill-integration-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (Behaviors 1-5, 19-20)

- [ ] **Write failing test**

```javascript
describe("eval SKILL.md — Infrastructure Preflight", () => {
  it("contains Infrastructure Preflight step", () => {
    const c = readFileSync(EVAL_PATH, "utf8");
    assert.ok(c.includes("Infrastructure Preflight"), "Must include preflight step");
  });
  it("preflight is after prerequisites and before Layer 1", () => {
    const c = readFileSync(EVAL_PATH, "utf8");
    const prereq = c.indexOf("validate");
    const preflight = c.indexOf("Infrastructure Preflight");
    const layer1 = c.indexOf("Layer 1:");
    assert.ok(preflight < layer1, "Preflight must be before Layer 1");
  });
  it("skips preflight for --layer 1 and --layer 2", () => {
    const c = readFileSync(EVAL_PATH, "utf8");
    const preflightSection = c.slice(c.indexOf("Infrastructure Preflight"));
    assert.ok(preflightSection.includes("--layer 1") || preflightSection.includes("layer 1") || preflightSection.includes("Layer 1"), "Must skip for layer 1");
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: FAIL

- [ ] **Implement**

Edit `skills/eval/SKILL.md`:

1. Add `--no-infra` to the Arguments section.
2. Insert "Preflight: Infrastructure Verification" section after Prerequisites and before Layer 1. Include: layer-aware skip for `--layer 1` and `--layer 2`, plan path resolution via `.plan.md` sibling glob (pass `null` if absent), `--no-infra`/`ADEV_NO_INFRA` flag resolution, inline Node.js invocation, blocking message, agent prohibition.

- [ ] **Verify test passes**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/eval/SKILL.md tests/skills/skill-integration-preflight.test.mjs
git commit -m "feat(validation): add infrastructure preflight step to eval SKILL.md"
```

---

### Task 7: Add preflight step to recover SKILL.md [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Corrective context injection for infra root causes adds minor novelty; well-specified behavior with formatPreflightReport integration.

**Charter capability:** Skill Integration (Conditional)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/recover/SKILL.md` — Insert preflight after Detect, corrective context injection
- Test: `tests/skills/skill-integration-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (Behaviors 1-5, 21-22)

- [ ] **Write failing test**

```javascript
describe("recover SKILL.md — Infrastructure Preflight", () => {
  it("contains Infrastructure Preflight step", () => {
    const c = readFileSync(RECOVER_PATH, "utf8");
    assert.ok(c.includes("Infrastructure Preflight"), "Must include preflight step");
  });
  it("preflight is after Detect and before Gather Evidence", () => {
    const c = readFileSync(RECOVER_PATH, "utf8");
    const detect = c.indexOf("Step 1: Detect");
    const preflight = c.indexOf("Infrastructure Preflight");
    const gather = c.indexOf("Step 2: Gather Evidence");
    assert.ok(detect < preflight, "Preflight must be after Step 1: Detect");
    assert.ok(preflight < gather, "Preflight must be before Step 2: Gather Evidence");
  });
  it("includes formatted preflight report in corrective context for infra root causes", () => {
    const c = readFileSync(RECOVER_PATH, "utf8");
    assert.ok(c.includes("formatPreflightReport"), "Must reference formatPreflightReport for corrective context");
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: FAIL

- [ ] **Implement**

Edit `skills/recover/SKILL.md`:

1. Add `--no-infra` to the Arguments section.
2. Insert "Step 1.5: Infrastructure Preflight" between Step 1 (Detect) and Step 2 (Gather Evidence). Include: spec and plan path resolution from detected task's plan reference, always run if `infra_requirements` present, `--no-infra`/`ADEV_NO_INFRA` flag resolution, inline Node.js invocation, blocking on failure, agent prohibition.
3. In Step 4 (Inject) or equivalent corrective context section, add: when root cause is classified as infrastructure-related (TOOL_FAILURE with connection/credentials indicators), include the formatted preflight report (via `formatPreflightReport()`, not the raw PreflightReport object) in the corrective context. When root cause is not infra-related, omit the report.

- [ ] **Verify test passes**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/recover/SKILL.md tests/skills/skill-integration-preflight.test.mjs
git commit -m "feat(implementation): add infrastructure preflight step to recover SKILL.md"
```

---

### Task 8: Write comprehensive content-presence tests [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=3
**Rationale:** Test file follows specify-feature-binding.test.mjs golden sample pattern; cross-cutting assertions combine 7 skill checks but each is mechanical string matching.

**Charter capability:** Skill Integration (Mandatory), Skill Integration (Conditional)
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/skills/skill-integration-preflight.test.mjs` — Full test suite
- Test: `tests/skills/skill-integration-preflight.test.mjs`

**Context to load:**
- `.context-index/specs/features/infra-preflight/skill-integration.spec.md` (all acceptance criteria)
- `tests/skills/specify-feature-binding.test.mjs` (test pattern reference)

- [ ] **Write failing test**

Consolidate all per-task tests into the final comprehensive test file. Add cross-cutting assertions:

```javascript
describe("Cross-cutting preflight assertions", () => {
  const allSkillPaths = [IMPLEMENT_PATH, VALIDATE_PATH, BUILD_PATH, WRITETEST_PATH, DEBUG_PATH, EVAL_PATH, RECOVER_PATH];

  it("all 7 SKILL.md files document --no-infra", () => {
    for (const p of allSkillPaths) {
      const c = readFileSync(p, "utf8");
      assert.ok(c.includes("--no-infra"), `${p} must document --no-infra`);
    }
  });

  it("all 7 SKILL.md files contain agent prohibition for --no-infra", () => {
    for (const p of allSkillPaths) {
      const c = readFileSync(p, "utf8");
      assert.ok(
        c.includes("agent must never") || c.includes("agent must not"),
        `${p} must contain agent prohibition instruction`
      );
    }
  });

  it("write-test SKILL.md contains ADEV_DISPATCHED_BY prohibition", () => {
    const c = readFileSync(WRITETEST_PATH, "utf8");
    assert.ok(
      c.includes("ADEV_DISPATCHED_BY") && (c.includes("must not set") || c.includes("prohibited")),
      "write-test must prohibit autonomous ADEV_DISPATCHED_BY setting"
    );
  });

  it("ADEV_NO_INFRA documentation: read once at entry, only '1' activates, lib never reads process.env", () => {
    const c = readFileSync(IMPLEMENT_PATH, "utf8");
    assert.ok(c.includes("ADEV_NO_INFRA"), "Must document ADEV_NO_INFRA env var");
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: FAIL if any cross-cutting assertion is not yet met by prior tasks

- [ ] **Implement**

Review all 7 SKILL.md files and ensure cross-cutting requirements are fully met. Fix any gaps. Finalize the test file with all per-skill and cross-cutting assertions.

- [ ] **Verify test passes**

Run: `node --test tests/skills/skill-integration-preflight.test.mjs`
Expected: PASS — all content-presence assertions pass

- [ ] **Commit**

```bash
git add tests/skills/skill-integration-preflight.test.mjs
git commit -m "test(implementation): add content-presence tests for skill integration preflight"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
