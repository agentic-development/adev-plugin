# Implementation Plan: Plan Injection

> **Methodology:** adev
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Spec:** .context-index/specs/features/heuristics/plan-injection.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-12)
> **Platform:** Node.js, JavaScript (ESM), node:test

**Goal:** Add heuristic injection to `/adev:plan` so generated plans include per-task heuristic references in context packets and a top-level `## Heuristics` section.

**Architecture:** The plan skill gains a heuristic loading step during context loading and two output sections: `- Heuristics:` entries in each task's context packet manifest, and a `## Heuristics` section after Context Packets. All changes are SKILL.md markdown edits.

---

## File Structure

**Modify:**
- `skills/plan/SKILL.md` — Add heuristic loading and plan output sections

**Create:**
- `tests/skills/plan-heuristic-injection.test.mjs` — Eval tests

**Reference:**
- `lib/heuristics.mjs` — `retrieveHeuristics`, `renderHeuristic`
- `.context-index/specs/features/heuristics/retrieval-filtering.spec.md` — Protocol conventions

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/heuristics/plan-injection.spec.md` (Behaviors 1-6)
- Current SKILL.md: `skills/plan/SKILL.md` (Step 2, Step 5 Context Packet Section)

### Task 2 Context
- Spec: `.context-index/specs/features/heuristics/plan-injection.spec.md` (all AC)

---

### Task 1: Add heuristic loading and plan output sections [specialist: none]

**Charter capability:** Plan Injection
**Files:**
- Modify: `skills/plan/SKILL.md`
- Test: `tests/skills/plan-heuristic-injection.test.mjs`

**Tests:** `tests/skills/plan-heuristic-injection.test.mjs`

- [ ] **Write failing test**

```javascript
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('plan SKILL.md heuristic injection', () => {
  it('Step 2 includes heuristic loading instruction', async () => {
    const content = await readFile('skills/plan/SKILL.md', 'utf8');
    assert.ok(content.includes('retrieveHeuristics'), 'Must reference retrieveHeuristics');
    assert.ok(content.includes('lib/heuristics.mjs'), 'Must reference lib/heuristics.mjs');
  });

  it('Context Packet Section includes Heuristics entry template', async () => {
    const content = await readFile('skills/plan/SKILL.md', 'utf8');
    assert.ok(content.includes('- Heuristics:'), 'Must include Heuristics entry in context packets');
  });

  it('plan output includes ## Heuristics section template', async () => {
    const content = await readFile('skills/plan/SKILL.md', 'utf8');
    assert.ok(content.includes('## Heuristics'), 'Must include Heuristics section');
    assert.ok(content.includes('review convenience'), 'Must note snapshot is for review convenience');
  });

  it('documents non-blocking semantics', async () => {
    const content = await readFile('skills/plan/SKILL.md', 'utf8');
    assert.ok(
      content.includes('proceed without heuristics') || content.includes('non-blocking'),
      'Must document non-blocking behavior'
    );
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/plan-heuristic-injection.test.mjs`
Expected: FAIL

- [ ] **Implement**

Three additions to `skills/plan/SKILL.md`:

1. **Step 2 (Load Context) — add item 12:** After item 11 (Boundary rules):

```markdown
12. **Heuristics:** Load module-scoped heuristics for inclusion in the plan. Run inline Node.js using `retrieveHeuristics` and `renderHeuristic` from `lib/heuristics.mjs`, passing the spec's `charter:` module slug and `heuristics.injection_limit` from manifest. If the call fails or returns empty, proceed without heuristics — heuristic injection is non-blocking. Store the rendered output for use in Step 5.
```

2. **Context Packet Section — add Heuristics entry:** In the context packet template, add after the last entry:

```markdown
- Heuristics: <N> entries for module `<M>` (IDs: <id1>, <id2>, ...)
```

3. **After Context Packets, before Parallelization Hints — add section:**

```markdown
### Heuristics Section

If heuristics were loaded in Step 2, add a `## Heuristics` section to the plan after Context Packets and before Parallelization:

\`\`\`markdown
## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

<rendered heuristic blocks from Step 2>
\`\`\`

If no heuristics are available, omit this section entirely.
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/plan-heuristic-injection.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/plan/SKILL.md tests/skills/plan-heuristic-injection.test.mjs
git commit -m "feat(heuristics): add heuristic injection to plan SKILL.md"
```

---

## Quality Gates

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
