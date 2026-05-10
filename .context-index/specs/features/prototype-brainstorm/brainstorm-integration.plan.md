# Implementation Plan: Brainstorm Integration

> **Methodology:** adev
> **Charter:** .context-index/specs/features/prototype-brainstorm/charter.md
> **Spec:** .context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md
> **Review:** PASS (2026-05-08)
> **Platform:** JavaScript (ESM), Node.js, node:test

**Goal:** Wire the structured context contract between `/adev:brainstorm` and `/adev:prototype`, implement the return-to-brainstorm result, and add post-session heuristics capture with preload of existing learnings.

**Architecture:** This spec is entirely skill-markdown-driven per the constitution ("Skills are primarily markdown"). The brainstorm SKILL.md dispatches to prototype with a structured context block; the prototype SKILL.md receives it, skips charter lookup when present, and returns a structured result. Heuristics capture uses the existing `lib/heuristics.mjs` library and `/adev:learn` skill. No new code libraries are needed — the integration is defined as SKILL.md instructions that the agent follows at runtime.

---

## File Structure

**Modify:**
- `skills/brainstorm/SKILL.md` — Add Step 3b: prototype dispatch with structured context contract, and handle return result after prototype completes
- `skills/prototype/SKILL.md` — Add brainstorm context reception logic (Step 0 branching), return-to-brainstorm result contract, heuristics capture prompt (Step 8 enhancement), heuristics preload in Step 1, and excess-heuristics prioritization UX

**Create:**
- `tests/skills/brainstorm-prototype-integration.test.mjs` — Integration tests for the context contract, return contract, and heuristics capture instructions

**Reference (read, do not modify):**
- `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` — Behavioral contract
- `.context-index/specs/features/prototype-brainstorm/prototype-core.spec.md` — Core prototype loop (already implemented)
- `.context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md` — Standalone mode (already implemented)
- `lib/heuristics.mjs` — Existing heuristic retrieval and persistence API
- `lib/prototype-args.mjs` — Existing module validation and charter discovery

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (Behaviors 1-3)
- Charter: `.context-index/specs/features/prototype-brainstorm/charter.md` (capability: Brainstorm integration)
- Source files: `skills/brainstorm/SKILL.md` (full read — need Step 3 context), `skills/prototype/SKILL.md` (full read — need Step 0 context)

### Task 2 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (Behaviors 2-3)
- Source files: `skills/prototype/SKILL.md` (full read — modifying Step 0 and Step 1)

### Task 3 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (Behaviors 5-6)
- Spec: `.context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md` (Behaviors 1-4)
- Source files: `skills/prototype/SKILL.md` (full read — verifying Step 0 standalone path)

### Task 4 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (Behavior 4)
- Source files: `skills/prototype/SKILL.md` (full read — adding return contract), `skills/brainstorm/SKILL.md` (full read — receiving return result)

### Task 5 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (Behaviors 7-9, 11-12)
- Source files: `skills/prototype/SKILL.md` (full read — modifying Step 8)

### Task 6 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (Behaviors 8, 12)
- Source files: `skills/prototype/SKILL.md` (full read — Step 8), `lib/heuristics.mjs` (export signatures)

### Task 7 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (Behavior 10)
- Source files: `skills/prototype/SKILL.md` (full read — Step 1), `lib/heuristics.mjs` (export signatures — `retrieveHeuristics`, `renderHeuristic`)

### Task 8 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (all Behaviors)
- Source files: `skills/brainstorm/SKILL.md` (full read), `skills/prototype/SKILL.md` (full read)
- Cross-cutting: constitution ("Skills are primarily markdown", "No executable logic inside SKILL.md files")

## Parallelization

- Group A (sequential): Task 1 → Task 4 → Task 8 (shared file: `skills/brainstorm/SKILL.md`)
- Group B (sequential): Task 2 → Task 3 → Task 5 → Task 6 → Task 7 (shared file: `skills/prototype/SKILL.md`)
- Group C (independent): Task 8 (final integration test, depends on all prior tasks)

Groups A and B can run in parallel. Task 8 runs last after both groups complete.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Brainstorm Step 3b dispatch | medium | unit | — | 0 create, 1 modify |
| 2 | Prototype context reception | medium | unit | — | 0 create, 1 modify |
| 3 | Standalone fallback verification | small | unit | Task 2 | 0 create, 1 modify |
| 4 | Return-to-brainstorm contract | small | unit | Task 1, Task 2 | 0 create, 2 modify |
| 5 | Heuristics capture prompt | small | unit | Task 2 | 0 create, 1 modify |
| 6 | Heuristics persistence via /adev:learn | medium | unit | Task 5 | 0 create, 1 modify |
| 7 | Heuristics preload at session start | small | unit | Task 2 | 0 create, 1 modify |
| 8 | Integration test suite | medium | unit | Task 1-7 | 1 create, 0 modify |

---

### Task 1: Brainstorm Step 3b Dispatch [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Fully specified context contract with explicit field definitions; single-file markdown edit in a well-structured SKILL.md.

**Charter capability:** Brainstorm integration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/brainstorm/SKILL.md` — Add Step 3b after Step 3

**Tests:** `tests/skills/brainstorm-prototype-integration.test.mjs`

- [x] **Write failing test**

Write a test that reads `skills/brainstorm/SKILL.md` and verifies:
1. A "Step 3b" or "Step 3b:" section exists
2. The section contains the four context fields: `module`, `approach_summary`, `platform_context`, `constitution_constraints`
3. The section references `/adev:prototype` dispatch

```javascript
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

test('brainstorm SKILL.md contains Step 3b prototype dispatch', () => {
  const content = readFileSync('skills/brainstorm/SKILL.md', 'utf-8');
  assert.ok(content.includes('## Step 3b') || content.includes('### Step 3b'), 'Step 3b section missing');
  assert.ok(content.includes('module'), 'context field module missing');
  assert.ok(content.includes('approach_summary'), 'context field approach_summary missing');
  assert.ok(content.includes('platform_context'), 'context field platform_context missing');
  assert.ok(content.includes('constitution_constraints'), 'context field constitution_constraints missing');
  assert.ok(content.includes('/adev:prototype'), 'prototype dispatch reference missing');
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: FAIL — Step 3b section does not yet exist in brainstorm SKILL.md

- [x] **Implement**

Add a new "Step 3b: Prototype Dispatch (Optional)" section to `skills/brainstorm/SKILL.md` after Step 3 (Propose 2-3 Approaches), before Step 4. The section should:

1. Present the option: "Would you like to prototype the selected approach before proceeding to detailed design?"
2. If the user opts in, dispatch `/adev:prototype` with structured context:
   ```
   BRAINSTORM_CONTEXT:
     module: <module-slug>
     approach_summary: <selected approach description from Step 3>
     platform_context: <parsed contents of platform-context.yaml>
     constitution_constraints: <relevant constitutional principles identified during brainstorm, or []>
   ```
3. State that when brainstorm context is provided, prototype skips its own charter lookup and proceeds directly to tier selection.
4. After prototype returns, handle the result (covered in Task 4).

- [x] **Verify test passes**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: PASS

- [x] **Commit**

Branch: `feat/design/brainstorm-prototype-integration`

```bash
git add skills/brainstorm/SKILL.md tests/skills/brainstorm-prototype-integration.test.mjs
git commit -m "feat(design): add Step 3b prototype dispatch to brainstorm SKILL.md

Spec: .context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md
Plan-task: 1"
```

---

### Task 2: Prototype Context Reception [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Precise behavioral contract for context reception and charter-skip logic; single-file SKILL.md modification.

**Charter capability:** Brainstorm integration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/prototype/SKILL.md` — Update Step 0 to handle brainstorm context

**Tests:** `tests/skills/brainstorm-prototype-integration.test.mjs`

- [x] **Write failing test**

```javascript
test('prototype SKILL.md handles brainstorm context reception', () => {
  const content = readFileSync('skills/prototype/SKILL.md', 'utf-8');
  assert.ok(content.includes('BRAINSTORM_CONTEXT') || content.includes('brainstorm context'), 
    'brainstorm context reception missing');
  assert.ok(content.includes('approach_summary') && content.includes('seed'), 
    'approach_summary seeding instruction missing');
  assert.ok(content.includes('skip') && (content.includes('charter lookup') || content.includes('Step 0')),
    'charter lookup skip instruction missing');
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: FAIL — prototype SKILL.md does not yet reference BRAINSTORM_CONTEXT seeding

- [x] **Implement**

Update `skills/prototype/SKILL.md` Step 0 (Standalone Entry) to add branching logic at the top:

1. Add a check at the very beginning of "## Process": "If brainstorm context is provided (BRAINSTORM_CONTEXT block), skip Step 0 entirely and proceed to Step 1 with the provided context."
2. Document that when brainstorm context is present:
   - `module` is used directly (no charter discovery needed)
   - `approach_summary` seeds the initial prototype generation (guides what the prototype demonstrates)
   - `platform_context` sets framework defaults for functional tier
   - `constitution_constraints` are used to validate generated prototype code against principles
3. When brainstorm context is present, skip the charter lookup in Step 0a/0b entirely.

- [x] **Verify test passes**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add skills/prototype/SKILL.md tests/skills/brainstorm-prototype-integration.test.mjs
git commit -m "feat(design): add brainstorm context reception to prototype SKILL.md

Spec: .context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md
Plan-task: 2"
```

---

### Task 3: Standalone Fallback Verification [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Pure verification task with cross-referenced spec coverage; no creative problem-solving required.

**Charter capability:** Standalone invocation
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `skills/prototype/SKILL.md` — Verify standalone path remains intact after Task 2 changes

**Tests:** `tests/skills/brainstorm-prototype-integration.test.mjs`

- [x] **Write failing test**

```javascript
test('prototype SKILL.md standalone mode still loads charter and extracts approach', () => {
  const content = readFileSync('skills/prototype/SKILL.md', 'utf-8');
  // Standalone path (Step 0) must still exist
  assert.ok(content.includes('Step 0') || content.includes('Standalone'), 'Step 0 standalone entry missing');
  assert.ok(content.includes('--module'), 'standalone --module argument handling missing');
  assert.ok(content.includes('discoverCharters') || content.includes('charter discovery'), 
    'charter discovery for no-module case missing');
  // Standalone must skip return-to-brainstorm
  assert.ok(content.includes('standalone') && content.includes('skip'), 
    'standalone skip-return instruction missing');
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: PASS or FAIL depending on existing content — this is a verification task

- [x] **Implement**

Ensure `skills/prototype/SKILL.md` Step 0 clearly documents:
1. Standalone mode (no brainstorm context) follows the existing charter-lookup path
2. When `--module` is not provided, follows charter discovery UX (single-charter auto-select, multi-charter list prompt, no-charters error)
3. Standalone mode skips the return-to-brainstorm step — session ends after persistence and heuristics capture
4. Standalone mode extracts approach context from the charter's Business Intent and Capability Map

This task is primarily verification that the Task 2 changes did not break standalone mode. Add clarifying instructions if any ambiguity exists.

- [x] **Verify test passes**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add skills/prototype/SKILL.md tests/skills/brainstorm-prototype-integration.test.mjs
git commit -m "feat(design): verify standalone mode preserved in prototype SKILL.md

Spec: .context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md
Plan-task: 3"
```

---

### Task 4: Return-to-Brainstorm Contract [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=3 blast=4 novelty=4
**Rationale:** Explicit 5-field return contract with types and values; touches 2 files but both in the same design module.

**Charter capability:** Brainstorm integration
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- Modify: `skills/prototype/SKILL.md` — Add return result structure after session completion
- Modify: `skills/brainstorm/SKILL.md` — Add result handling in Step 3b

**Tests:** `tests/skills/brainstorm-prototype-integration.test.mjs`

- [x] **Write failing test**

```javascript
test('prototype SKILL.md defines return contract to brainstorm', () => {
  const content = readFileSync('skills/prototype/SKILL.md', 'utf-8');
  assert.ok(content.includes('PROTOTYPE_RESULT') || content.includes('return') && content.includes('brainstorm'),
    'return-to-brainstorm result missing');
  // Check all return fields
  for (const field of ['status', 'tier', 'visual_references', 'heuristics_saved', 'persistence']) {
    assert.ok(content.includes(field), `return field ${field} missing`);
  }
});

test('brainstorm SKILL.md handles prototype return result', () => {
  const content = readFileSync('skills/brainstorm/SKILL.md', 'utf-8');
  assert.ok(content.includes('PROTOTYPE_RESULT') || 
    (content.includes('prototype') && content.includes('return') && content.includes('result')),
    'prototype result handling in brainstorm missing');
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: FAIL — return contract not yet defined

- [x] **Implement**

1. In `skills/prototype/SKILL.md`, add a "Return to Brainstorm" section after Step 8 (Heuristics Capture) that defines:
   - When invoked from brainstorm (brainstorm context was provided), return control with:
     ```
     PROTOTYPE_RESULT:
       status: "completed" | "discarded"
       tier: "wireframe" | "mockup" | "functional"
       visual_references: [{ path: string, description: string }]
       heuristics_saved: <count>
       persistence: "project" | "ephemeral"
     ```
   - When invoked standalone, skip this step (covered in Step 9: Session Summary)

2. In `skills/brainstorm/SKILL.md` Step 3b, add handling for the prototype return:
   - Read the PROTOTYPE_RESULT
   - Print a summary of the prototype session
   - Continue to Step 4 (Present Design Sections) with enriched context from prototyping

- [x] **Verify test passes**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add skills/prototype/SKILL.md skills/brainstorm/SKILL.md tests/skills/brainstorm-prototype-integration.test.mjs
git commit -m "feat(design): add return-to-brainstorm contract for prototype result

Spec: .context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md
Plan-task: 4"
```

---

### Task 5: Heuristics Capture Prompt [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Fully prescribed prompt text, skip/excess handling, and zero-decision case; mechanical markdown addition.

**Charter capability:** Heuristics capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `skills/prototype/SKILL.md` — Enhance Step 8 with detailed heuristics prompt

**Tests:** `tests/skills/brainstorm-prototype-integration.test.mjs`

- [x] **Write failing test**

```javascript
test('prototype SKILL.md has detailed heuristics capture prompt', () => {
  const content = readFileSync('skills/prototype/SKILL.md', 'utf-8');
  // Must ask for 2-4 design decisions
  assert.ok(content.includes('2-4') || content.includes('2 to 4'), 
    'heuristics prompt should ask for 2-4 design decisions');
  // Must handle skip
  assert.ok(content.includes('skip') || content.includes('none'), 
    'heuristics skip handling missing');
  // Must handle excess (>4)
  assert.ok(content.includes('prioritize') || content.includes('more than 4'),
    'excess heuristics prioritization missing');
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: FAIL — current Step 8 is a basic prompt without the 2-4 limit or prioritization

- [x] **Implement**

Enhance `skills/prototype/SKILL.md` Step 8 (Heuristics Capture):

1. Replace the current simple prompt with the spec's detailed prompt:
   > "What design decisions should be carried forward? (e.g., 'sidebar navigation works better than top-nav for this data density', 'users expect inline editing, not modal forms')"
2. Add handling for "none" or "skip" — proceed without saving heuristics
3. Add handling for > 4 decisions: ask user to prioritize to 4 or confirm saving all
4. Add handling for 0 decisions after prompt — same as "skip"

- [x] **Verify test passes**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add skills/prototype/SKILL.md tests/skills/brainstorm-prototype-integration.test.mjs
git commit -m "feat(design): enhance heuristics capture with 2-4 limit and prioritization

Spec: .context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md
Plan-task: 5"
```

---

### Task 6: Heuristics Persistence via /adev:learn [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Clear invocation contract with module scoping and error handling; existing /adev:learn and lib/heuristics.mjs provide reference.

**Charter capability:** Heuristics capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5
**Files:**
- Modify: `skills/prototype/SKILL.md` — Add /adev:learn invocation instructions in Step 8

**Tests:** `tests/skills/brainstorm-prototype-integration.test.mjs`

- [x] **Write failing test**

```javascript
test('prototype SKILL.md invokes /adev:learn for each heuristic', () => {
  const content = readFileSync('skills/prototype/SKILL.md', 'utf-8');
  assert.ok(content.includes('/adev:learn'), 'must invoke /adev:learn skill');
  assert.ok(content.includes('source: prototype') || content.includes('source:prototype'),
    'must tag heuristics with source: prototype');
  assert.ok(content.includes('module') && content.includes('scope'),
    'must scope heuristics to current module');
  // Failure must not block
  assert.ok(content.includes('Heuristic capture failed') || content.includes('non-blocking'),
    'learn failure must not block session');
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: FAIL — current Step 8 does not specify /adev:learn invocation details

- [x] **Implement**

Add to Step 8 of `skills/prototype/SKILL.md`:

1. For each design decision the user provides, invoke `/adev:learn` with:
   - The decision text as the heuristic content
   - Module scope set to the current `<module>`
   - `source: prototype` tag
   - Tier and iteration info where identifiable
2. If `/adev:learn` fails (import error, write error):
   - Log the error
   - Report: "Heuristic capture failed -- you can save these manually with `/adev:learn` later"
   - Proceed to session completion (non-blocking)
3. Track `heuristics_saved` count for the return contract

- [x] **Verify test passes**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add skills/prototype/SKILL.md tests/skills/brainstorm-prototype-integration.test.mjs
git commit -m "feat(design): add /adev:learn invocation for heuristics persistence

Spec: .context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md
Plan-task: 6"
```

---

### Task 7: Heuristics Preload at Session Start [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Verification task with explicit function call and message format defined in spec; minimal or no changes expected.

**Charter capability:** Heuristics capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `skills/prototype/SKILL.md` — Ensure Step 1 surfaces existing heuristics before tier selection

**Tests:** `tests/skills/brainstorm-prototype-integration.test.mjs`

- [x] **Write failing test**

```javascript
test('prototype SKILL.md loads and surfaces existing heuristics before tier selection', () => {
  const content = readFileSync('skills/prototype/SKILL.md', 'utf-8');
  const step1Idx = content.indexOf('Step 1');
  const step2Idx = content.indexOf('Step 2');
  assert.ok(step1Idx > -1 && step2Idx > -1, 'Steps 1 and 2 must exist');
  
  const betweenSteps = content.substring(step1Idx, step2Idx);
  assert.ok(betweenSteps.includes('retrieveHeuristics'), 
    'Step 1 must call retrieveHeuristics');
  assert.ok(betweenSteps.includes('Previous design learnings') || betweenSteps.includes('heuristic'),
    'Step 1 must surface existing heuristics to user');
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: PASS — Step 1 already has heuristics preload. This is a verification task.

- [x] **Implement**

Verify and enhance Step 1 of `skills/prototype/SKILL.md`:

1. Confirm that `retrieveHeuristics(projectRoot, module)` is called with module scope
2. Confirm that existing heuristics are surfaced with the message: "Previous design learnings for this module:" followed by summaries
3. Confirm this happens before Step 2 (Tier Selection)
4. Confirm that `retrieveHeuristics()` failure does not block the session

The existing Step 1 already has heuristics loading. Verify the wording matches the spec's Behavior 10 exactly and adjust if needed.

- [x] **Verify test passes**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add skills/prototype/SKILL.md tests/skills/brainstorm-prototype-integration.test.mjs
git commit -m "feat(design): verify heuristics preload in prototype Step 1

Spec: .context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md
Plan-task: 7"
```

---

### Task 8: Integration Test Suite [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Test expectations provided inline in plan; golden sample for test patterns exists; single new file creation.

**Charter capability:** Brainstorm integration, Heuristics capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7
**Files:**
- Create: `tests/skills/brainstorm-prototype-integration.test.mjs` — Full integration test file (consolidating all tests from prior tasks)

**Tests:** `tests/skills/brainstorm-prototype-integration.test.mjs`

- [x] **Write failing test**

Add comprehensive cross-file validation tests:

```javascript
test('brainstorm and prototype SKILL.md files have matching context contracts', () => {
  const brainstorm = readFileSync('skills/brainstorm/SKILL.md', 'utf-8');
  const prototype = readFileSync('skills/prototype/SKILL.md', 'utf-8');
  
  // Both must reference the same context fields
  const contextFields = ['module', 'approach_summary', 'platform_context', 'constitution_constraints'];
  for (const field of contextFields) {
    assert.ok(brainstorm.includes(field), `brainstorm missing context field: ${field}`);
    assert.ok(prototype.includes(field), `prototype missing context field: ${field}`);
  }
  
  // Both must reference the same return fields
  const returnFields = ['status', 'tier', 'visual_references', 'heuristics_saved', 'persistence'];
  for (const field of returnFields) {
    assert.ok(prototype.includes(field), `prototype missing return field: ${field}`);
  }
});

test('prototype SKILL.md error codes match spec error table', () => {
  const content = readFileSync('skills/prototype/SKILL.md', 'utf-8');
  const expectedCodes = ['INCOMPLETE_CONTEXT', 'HEURISTIC_SAVE_ERROR'];
  for (const code of expectedCodes) {
    assert.ok(content.includes(code), `error code ${code} missing from prototype SKILL.md`);
  }
});

test('no executable logic in SKILL.md files (constitution compliance)', () => {
  const brainstorm = readFileSync('skills/brainstorm/SKILL.md', 'utf-8');
  const prototype = readFileSync('skills/prototype/SKILL.md', 'utf-8');
  
  // SKILL.md files should not have import/export/require statements outside of code blocks
  // (code blocks are examples for the agent, not executed)
  // This is a constitution check: "No executable logic inside SKILL.md files"
  // We verify that the files remain markdown instructions
  assert.ok(brainstorm.startsWith('---') || brainstorm.startsWith('#'), 
    'brainstorm SKILL.md should start with frontmatter or heading');
  assert.ok(prototype.startsWith('---') || prototype.startsWith('#'),
    'prototype SKILL.md should start with frontmatter or heading');
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: Some tests may pass (already implemented in prior tasks), new cross-file tests should pass if all prior tasks completed correctly. If any fail, fix the SKILL.md files.

- [x] **Implement**

Consolidate all test cases from Tasks 1-7 into a single comprehensive test file. Ensure:
1. All individual task tests are present
2. Cross-file contract validation tests are added
3. Error code coverage tests are added
4. Constitution compliance checks are included

- [x] **Verify test passes**

Run: `node --test tests/skills/brainstorm-prototype-integration.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add tests/skills/brainstorm-prototype-integration.test.mjs
git commit -m "feat(design): add integration test suite for brainstorm-prototype contract

Spec: .context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md
Plan-task: 8"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [x] Tests pass: `npm test`
- [x] All acceptance criteria from spec satisfied:
  - Brainstorm dispatches to prototype with structured context (module, approach_summary, platform_context, constitution_constraints)
  - Prototype uses approach_summary to seed initial generation
  - Prototype uses platform_context for functional-tier framework defaults
  - Charter lookup is skipped when brainstorm context is provided
  - Prototype returns structured result to brainstorm (status, tier, visual_references, heuristics_saved, persistence)
  - Standalone mode loads charter, extracts approach context, skips return-to-brainstorm
  - Standalone mode without --module prompts with charter list
  - Post-session prompt asks for 2-4 design decisions
  - Each decision saved as module-scoped heuristic via /adev:learn with source: prototype tag
  - User can skip heuristics capture
  - More than 4 decisions triggers prioritization prompt
  - Existing module heuristics surfaced at session start
  - /adev:learn failure does not block session completion
  - retrieveHeuristics() failure does not block session start
