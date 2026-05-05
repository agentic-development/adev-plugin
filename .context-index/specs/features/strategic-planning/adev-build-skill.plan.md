# Implementation Plan: adev:build Orchestrator — One-Step-Per-Invocation Dispatch

> **Methodology:** adev
> **Charter:** .context-index/specs/features/strategic-planning/charter.md
> **Spec:** .context-index/specs/features/strategic-planning/adev-build-skill.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-05)
> **Platform:** JavaScript (ESM), Node.js, node:test, no framework

**Goal:** Implement the One-Step-Per-Invocation dispatch model so the build orchestrator executes exactly one pipeline step per turn, persists state, and re-invokes itself for the next step via the Skill tool — preventing context accumulation from causing step-skipping.

**Architecture:** The build skill is a pure markdown SKILL.md. The change restructures the orchestrator's main loop from a sequential "run all steps" model to a "dispatch one, persist, re-invoke" model. The orchestrator reads build state from disk at start, determines the next step, dispatches one subagent, records the result, then either re-invokes `/adev:build --resume --spec <path>` via the Skill tool (if more steps remain) or prints the final summary and exits. Tests assert the SKILL.md contains the required structural instructions. No compiled code changes.

---

## File Structure

**Modify:**
- `skills/build/SKILL.md` — add One-Step-Per-Invocation section, modify the Build Pipeline section to enforce one-step-per-turn semantics, add self-re-invocation protocol, add verbose reasoning output instruction
- `skills/build/resume-mode.md` — fix inconsistent valid step names list (line 25 vs line 34)

**Create:**
- `tests/skills/build-one-step-dispatch.test.mjs` — assertions for one-step-per-invocation behaviors

**Reference (read, do not modify):**
- `tests/skills/build-full-pipeline.test.mjs` — follow test pattern
- `tests/helpers.mjs` — use `PLUGIN_ROOT` import

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` (Behaviors 22-28; AC section: One-Step-Per-Invocation Dispatch)
- Charter: `.context-index/specs/features/strategic-planning/charter.md` (capability: `/adev:build` orchestrator)
- Sample: `tests/skills/build-full-pipeline.test.mjs` (test file pattern to follow)

### Task 2 Context
- Spec: `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` (Behaviors 13-15, 26; AC section: Subagent and Fork Isolation)
- Existing: `skills/build/SKILL.md` — Delegation Protocol and Build Pipeline sections

### Task 3 Context
- Spec: `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` (Behavior 5a, valid step names)
- Existing: `skills/build/resume-mode.md` — line 25 inconsistency

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3

All tasks share `skills/build/SKILL.md` and must run sequentially.

---

## Task 1: One-Step-Per-Invocation Dispatch Model [specialist: none]

**Charter capability:** `/adev:build` orchestrator — resumability and context isolation
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/build/SKILL.md`
- Create: `tests/skills/build-one-step-dispatch.test.mjs`

**Tests:** `tests/skills/build-one-step-dispatch.test.mjs`

**Context to load:**
- `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` (Behaviors 22-28; AC: One-Step-Per-Invocation Dispatch)
- `tests/skills/build-full-pipeline.test.mjs` (test pattern)

- [x] **Write failing test**

```javascript
// tests/skills/build-one-step-dispatch.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "build", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

describe("adev:build SKILL.md — One-Step-Per-Invocation Dispatch", () => {
  it("declares one-step-per-invocation as a named section or principle", () => {
    assert.match(skill, /[Oo]ne.?[Ss]tep.?[Pp]er.?[Ii]nvocation|one step per turn|exactly one.*step.*per turn/i,
      "Must name One-Step-Per-Invocation as a structural concept");
  });

  it("states orchestrator executes exactly ONE step per turn", () => {
    assert.match(skill, /exactly one|exactly ONE|one step per turn/i,
      "Must state that only one step is dispatched per turn");
  });

  it("describes self-re-invocation via Skill tool after step completion", () => {
    assert.match(skill, /re-invok|re.invoke.*Skill tool|Skill tool.*resume/i,
      "Must describe re-invocation via Skill tool for continuation");
  });

  it("re-invocation uses --resume to continue from persisted state", () => {
    assert.match(skill, /re-invok.*--resume|--resume.*re-invok|invoke.*build.*--resume/i,
      "Re-invocation must use --resume flag to read state from disk");
  });

  it("each re-invocation starts with fresh context (no memory of prior turns)", () => {
    assert.match(skill, /fresh context|clean context|no memory.*prior|context.*fork/i,
      "Must state that re-invocation has a fresh/clean context");
  });

  it("pipeline position determined solely from build state file on disk", () => {
    assert.match(skill, /build.state.*source of truth|state file.*determines|read.*build.state.*before/i,
      "Pipeline position must come from build state file, not conversation context");
  });

  it("orchestrator MUST read build state before taking any action", () => {
    assert.match(skill, /read.*build.state.*before|MUST.*determine.*step.*reading|state file.*first/i,
      "Must read state file before any dispatch action");
  });

  it("final step (or stop condition) exits without re-invocation", () => {
    assert.match(skill, /does NOT re-invok|without re-invok|exit.*without.*re-invok|stop.*re-invok/i,
      "Final step must exit without re-invoking");
  });

  it("prints one-line progress report between steps", () => {
    assert.match(skill, /progress report|Step.*completed.*Next|one-line.*progress/i,
      "Must print a progress report between steps");
  });

  it("--verbose causes reasoning output but does not change one-step-per-turn", () => {
    assert.match(skill, /--verbose.*reasoning|verbose.*does not change|verbose.*one.*step/i,
      "--verbose must add reasoning output without changing dispatch model");
  });

  it("orchestrator prompt contains only dispatch-loop instructions", () => {
    assert.match(skill, /dispatch.loop|read state.*determine.*dispatch.*record|narrow task.*dispatch/i,
      "Orchestrator prompt must be limited to dispatch-loop instructions");
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/build-one-step-dispatch.test.mjs`
Expected: FAIL — the one-step-per-invocation dispatch model is not yet described in the SKILL.md

- [x] **Implement**

Edit `skills/build/SKILL.md` — add a new section `## One-Step-Per-Invocation Dispatch` after the `## Delegation Protocol` section (before the `## Build Pipeline` section). This is the core structural mechanism:

```markdown
## One-Step-Per-Invocation Dispatch

The build orchestrator executes **exactly one pipeline step per turn**, then yields control. This is the primary structural mechanism preventing the agent from skipping steps or inlining work due to accumulated context.

### Dispatch Loop (the only thing the orchestrator does)

On every invocation (whether fresh `--spec` or `--resume`), the orchestrator performs this loop exactly once:

1. **Read build state.** Read `.context-index/build-state/<slug>.json` BEFORE taking any action. The build state file is the single source of truth for pipeline position — not in-context memory, not the conversation history, not prior subagent results. If no state file exists (fresh build), create one with all steps pending.

2. **Determine next step.** Scan the `steps` array for the first step without `status: completed` or `status: skipped`. Evaluate that step's skip conditions against disk artifacts. If skip conditions are met, mark it `skipped` and advance to the next — but dispatch at most ONE non-skipped step.

3. **Dispatch ONE subagent.** Dispatch exactly one subagent via the Agent tool for the determined step. Wait for its STEP_RESULT.

4. **Record result.** Write the STEP_RESULT to build state (step status, timestamp, verdict, error if any). Update `status` and `updated` fields.

5. **Re-invoke or stop.**
   - If more steps remain AND no stop condition is met: print a one-line progress report (`"Step N (<name>) — <verdict>. Next: Step N+1 (<name>)."`) and re-invoke `/adev:build --resume --spec <path>` via the Skill tool. The re-invocation starts a fresh turn with a clean forked context — it has no memory of the current turn.
   - If all steps are complete (or a stop condition is met): do NOT re-invoke. Print the final summary and exit.

### Why One Step Per Turn

This model prevents the "finish the work" failure mode where accumulated context causes the agent to skip lifecycle steps. By executing one step per turn and re-invoking with a fresh context, the orchestrator never accumulates enough context to feel compelled to shortcut. Each turn has a single, narrow task: dispatch one subagent.

### Verbose Mode

When `--verbose` is set, the orchestrator prints its reasoning before each dispatch: which step was selected, why it was not skipped, what context packet was assembled. This is diagnostic output only — it does NOT change the one-step-per-turn behavior. The orchestrator still dispatches exactly one step and re-invokes.
```

Additionally, update the `## Key Principles` section to add principle 8:

```markdown
8. **One step per turn.** The orchestrator dispatches exactly one pipeline step per invocation, persists state, and re-invokes itself for the next step. It never runs two or more steps in a single turn. This prevents context accumulation from causing step-skipping. See the One-Step-Per-Invocation Dispatch section.
```

- [x] **Verify test passes**

Run: `node --test tests/skills/build-one-step-dispatch.test.mjs`
Expected: PASS — all 11 assertions pass

- [x] **Commit**

Branch (if not already created): `feat/strategic-planning/build-one-step-dispatch`

```bash
git add skills/build/SKILL.md tests/skills/build-one-step-dispatch.test.mjs
git commit -m "feat(strategic-planning): add One-Step-Per-Invocation dispatch model to adev:build

Spec: .context-index/specs/features/strategic-planning/adev-build-skill.spec.md
Plan-task: 1"
```

---

## Task 2: Reinforce Subagent Isolation and State-First Protocol [specialist: none]

**Depends on:** Task 1

**Charter capability:** `/adev:build` orchestrator — subagent and fork isolation
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/build/SKILL.md`

**Tests:** `tests/skills/build-one-step-dispatch.test.mjs` (existing assertions cover state-first reading)

**Context to load:**
- `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` (Behaviors 13-15, 26; AC: Subagent and Fork Isolation)

- [x] **Write failing test**

Add to existing test file `tests/skills/build-one-step-dispatch.test.mjs`:

```javascript
  it("subagent prompts include pipeline context fields (spec_path, title, phase, mode, position)", () => {
    assert.match(skill, /spec_path.*spec_title.*phase.*pipeline_mode|PIPELINE_CONTEXT/i,
      "Subagent prompts must include pipeline context");
  });

  it("step context assembled from disk artifacts, never from prior subagent memory", () => {
    assert.match(skill, /from disk|artifact.*on disk|never.*from.*memory|not from.*prior.*subagent/i,
      "Step context must be assembled from disk artifacts");
  });

  it("subagents return structured STEP_RESULT with status, verdict, artifacts, summary, error", () => {
    assert.match(skill, /STEP_RESULT.*status.*verdict|status.*COMPLETED.*FAILED.*BLOCKED/i,
      "Subagents must return STEP_RESULT structure");
  });

  it("resumed builds assemble step context from disk, not from session memory", () => {
    assert.match(skill, /resumed.*disk|resume.*artifact|read from disk.*ensure/i,
      "Resumed builds must read context from disk");
  });
```

- [x] **Verify test fails**

Run: `node --test tests/skills/build-one-step-dispatch.test.mjs`
Expected: Some assertions may already pass (the existing SKILL.md has PIPELINE_CONTEXT and STEP_RESULT). Verify which ones fail, if any.

- [x] **Implement**

Review existing SKILL.md content. The existing Delegation Protocol section already covers:
- Pipeline context (PIPELINE_CONTEXT block with spec_path, spec_title, phase, pipeline_mode, etc.)
- Step context from disk artifacts
- STEP_RESULT format (status, verdict, artifacts, summary, error)
- "Read from disk" rule

If all assertions already pass against existing content, this task requires no SKILL.md changes — mark as verified. If any fail, add the missing language to the relevant section.

Additionally, in the `## Build Pipeline` section introductory paragraph, add explicit language reinforcing the one-step model:

```markdown
The orchestrator executes exactly one of these steps per invocation. After dispatch and state persistence, it re-invokes itself for the next step. See One-Step-Per-Invocation Dispatch above.
```

- [x] **Verify test passes**

Run: `node --test tests/skills/build-one-step-dispatch.test.mjs`
Expected: PASS — all assertions pass

- [x] **Commit**

```bash
git add skills/build/SKILL.md tests/skills/build-one-step-dispatch.test.mjs
git commit -m "feat(strategic-planning): reinforce subagent isolation and state-first protocol in adev:build

Spec: .context-index/specs/features/strategic-planning/adev-build-skill.spec.md
Plan-task: 2"
```

---

## Task 3: Fix Resume Mode Valid Step Names Inconsistency [specialist: none]

**Depends on:** Task 2

**Charter capability:** `/adev:build` orchestrator — resume support
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/build/resume-mode.md`

**Tests:** `tests/skills/build-full-pipeline.test.mjs` (existing assertion: `--from valid step names include specify`)

**Context to load:**
- `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` (Behavior 5a)
- `skills/build/resume-mode.md` (line 25 inconsistency)

- [x] **Write failing test**

No new test file needed. Verify with existing test `build-full-pipeline.test.mjs` (which reads the main SKILL.md, not resume-mode.md). Add a focused assertion to the one-step test file:

```javascript
// Add to tests/skills/build-one-step-dispatch.test.mjs
import { readFileSync } from "fs";
const RESUME_PATH = join(PLUGIN_ROOT, "skills", "build", "resume-mode.md");
const resumeMode = readFileSync(RESUME_PATH, "utf8");

describe("resume-mode.md — valid step names consistency", () => {
  it("all occurrences of valid step names include specify", () => {
    const stepListMatches = resumeMode.match(/[Vv]alid step names:.*$/gm);
    for (const match of stepListMatches || []) {
      assert.match(match, /specify/,
        `All valid step name lists must include specify: "${match}"`);
    }
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/build-one-step-dispatch.test.mjs`
Expected: FAIL — line 25 in resume-mode.md lists `review, plan, route, implement, validate` without `specify`

- [x] **Implement**

Edit `skills/build/resume-mode.md` line 25 — change:
```
Valid step names: `review`, `plan`, `route`, `implement`, `validate`.
```
To:
```
Valid step names: `specify`, `review`, `plan`, `route`, `implement`, `validate`.
```

- [x] **Verify test passes**

Run: `node --test tests/skills/build-one-step-dispatch.test.mjs`
Expected: PASS

Run full suite: `npm test`
Expected: PASS — no regressions

- [x] **Commit**

```bash
git add skills/build/resume-mode.md tests/skills/build-one-step-dispatch.test.mjs
git commit -m "fix(strategic-planning): fix resume-mode valid step names to include specify

Spec: .context-index/specs/features/strategic-planning/adev-build-skill.spec.md
Plan-task: 3"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - Orchestrator executes exactly ONE pipeline step per turn
  - After dispatching one subagent and recording result, orchestrator re-invokes itself via Skill tool
  - Each re-invocation starts with a fresh forked context — no memory of prior turns
  - Pipeline position is determined solely from build state file on disk
  - Orchestrator prompt contains only dispatch-loop instructions
  - Final step (or stop condition) exits without re-invocation and prints summary
  - `--verbose` causes reasoning output but does not change one-step-per-turn behavior
  - Subagent prompts include pipeline context (spec path, title, phase, pipeline mode, position, workspace, issue board)
  - Step context assembled from disk artifacts, never from prior subagent memory
  - Subagents return structured STEP_RESULT
  - Resumed builds assemble step context from disk
  - Valid step names consistently include `specify` across all files
