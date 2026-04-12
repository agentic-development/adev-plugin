---
name: adev:plan
description: "Constitution-gated planning. Decomposes reviewed Live Specs into ordered implementation tasks with TDD expectations and context routing hints. In OpenCode, invoke with skill({ name: 'adev:plan' })"
---

# Plan Implementation

Decompose a reviewed Live Spec into an ordered task list ready for `adev:implement`. Every task follows TDD (write failing test, verify fail, implement, verify pass, commit) and traces back to a charter capability.

**Announce at start:** "I'm using the adev:plan skill to create the implementation plan."

## Arguments

- `--spec <path>`: plan a specific spec (required unless a spec path is obvious from conversation context)
- `--phase <name>`: plan all specs matching a phase/milestone across all modules (e.g., `--phase v1`)
- `--dry-run`: show the plan structure without writing it

## Phase Planning Mode (`--phase`)

When `--phase <name>` is provided:

1. **Scan all specs:** Read all `.md` files under `.context-index/specs/features/` (excluding `charter.md` and `*.plan.md` and `*.review.md`). Parse frontmatter for the `milestone` field.
2. **Filter by phase:** Select specs whose `milestone` matches `<name>` (case-insensitive).
3. **Report matching specs** before planning.
4. **Warn on non-reviewed specs:** Specs without review-passed status are flagged.
5. **Ordering:** Plan specs in dependency order.
6. **Output:** For each qualifying spec, run the standard planning process. At the end, produce a phase summary.

## Step 1: Review Gate

Before planning, verify the spec has passed architecture review.

1. Identify the spec file path. If `--spec` was provided, use that. Otherwise, ask the user.
2. Look for a `.review.md` file adjacent to the spec.
3. If no review file exists, **block**:
   ```
   This spec has not been reviewed yet.
   Run skill({ name: "adev:review-specs", args: { spec: "<path>" } }) before planning.
   ```
4. Read the review file. Extract the `Verdict`.
5. If verdict is `BLOCK`, **block**.
6. Compare file modification times. If the spec is newer than the review file, **block**.
7. If verdict is `PASS` or `PASS_WITH_NOTES`, proceed.

## Step 2: Load Context

Read these files in order:

1. **Constitution:** `.context-index/constitution.md` — principles, boundaries, quality gates, coding standards
2. **Platform context:** `.context-index/platform-context.yaml` — tech stack
3. **Orientation:** `.context-index/orientation/architecture.md` if it exists
4. **ADRs:** `.context-index/adrs/*.md`
5. **External references:** `.context-index/references/**/*.md` if they exist
6. **Parent charter:** `.context-index/specs/features/<module>/charter.md`
7. **The spec:** The Live Spec itself
8. **Review report:** The `.review.md` file
9. **Cross-cutting specs:** `.context-index/specs/cross-cutting/*.md`
10. **Samples:** `.context-index/samples/` if it exists
11. **Boundary rules:** `.context-index/governance/boundaries.yaml` if it exists
12. **Heuristics:** Load module-scoped heuristics for inclusion in the plan. Derive the module slug from the spec's `charter:` frontmatter field. Run inline Node.js using `retrieveHeuristics` and `renderHeuristic` from `lib/heuristics.mjs`, passing the module slug and `heuristics.injection_limit` from manifest.yaml (if configured). If the call fails or returns empty, proceed without heuristics — heuristic injection is non-blocking. Store the rendered output for use in Step 5.

## Step 3: Constitution Validation

Before writing any tasks, validate that the planned work stays within constitutional boundaries.

1. Check each acceptance criterion against the constitution's "Architecture Boundaries" section.
2. If any criterion would require crossing stated boundaries, flag it.
3. If the user confirms, include the task but mark it: `### Task N: [Title] [REQUIRES HUMAN APPROVAL]`

Check each planned file path against boundary patterns from `governance/boundaries.yaml`.

## Step 4: Specialist Routing

Read `.context-index/manifest.yaml` and check the `specialists` section. For each planned task, determine if a specialist should handle it:

- Match file paths against each specialist's `trigger_patterns`
- Match task description keywords against `trigger_keywords`
- Scoring: 2 points per pattern match (plus depth bonus), 1 point per keyword match
- Highest-scoring specialist becomes the primary tag. If no match, tag as `[specialist: none]`

## Step 5: Write the Plan

### Plan Location

Save the plan adjacent to the spec:
- Spec at `.context-index/specs/features/<module>/<task>.md` → `.context-index/specs/features/<module>/<task>.plan.md`

### Plan Document Header

```markdown
# Implementation Plan: <Feature Name>

> **Methodology:** adev
> **Charter:** .context-index/specs/features/<module>/charter.md
> **Spec:** .context-index/specs/features/<module>/<task>.md
> **Review:** <PASS|PASS_WITH_NOTES> (YYYY-MM-DD)
> **Platform:** <framework> <version>, <language>, <key deps>

**Goal:** <One sentence describing what this builds>

**Architecture:** <2-3 sentences about the approach>

---
```

### File Structure Section

```markdown
## File Structure

**Create:**
- `src/components/Dashboard.tsx` — Main dashboard component
- `tests/components/Dashboard.test.tsx` — Dashboard unit tests

**Modify:**
- `src/app/layout.tsx:15-20` — Add dashboard route

**Reference:**
- `.context-index/samples/<pattern>-sample.md` — Follow this pattern
```

### Context Packet Section

```markdown
## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/<module>/<task>.md` (criteria 1-3)
- Charter: `.context-index/specs/features/<module>/charter.md` (capability: <name>)
- Sample: `.context-index/samples/<pattern>-sample.md`
- ADR: `.context-index/adrs/<relevant-adr>.md`
- Heuristics: <N> entries for module `<M>` (IDs: <id1>, <id2>, ...)
```

### Heuristics Section

If heuristics were loaded in Step 2, add a `## Heuristics` section to the plan after Context Packets and before Task Structure:

```markdown
## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `adev:implement` reads from the live heuristic store.

<rendered heuristic blocks from Step 2>
```

If no heuristics are available, omit this section entirely.

### Task Structure

Each task follows TDD. Steps are granular (2-5 minutes each).

```markdown
### Task N: <Component Name> [specialist: <name|none>]

**Charter capability:** <which capability from the charter this implements>
**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts:123-145`
- Test: `tests/exact/path/to/test.ts`

- [ ] **Write failing test**
  ```typescript
  describe('specificBehavior', () => {
    it('should do the expected thing', () => {
      const result = functionUnderTest(input);
      expect(result).toEqual(expected);
    });
  });
  ```

- [ ] **Verify test fails**
  Run: `<test command> -- <path to test file>`

- [ ] **Implement**
  ```typescript
  export function functionUnderTest(input: InputType): OutputType {
    return expected;
  }
  ```

- [ ] **Verify test passes**
  Run: `<test command> -- <path to test file>`

- [ ] **Commit**
  ```bash
  git add <specific files>
  git commit -m "feat(<module>): add specific feature"
  ```
```

### Quality Gates Section

```markdown
## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `<test command>`
- [ ] Lint passes: `<lint command>`
- [ ] Type check passes: `<typecheck command>`
- [ ] All acceptance criteria from spec satisfied
```

## Step 6: Plan Review Loop

After writing the complete plan, dispatch a plan-reviewer subagent.

**If the reviewer returns "Issues Found":**
1. Fix them in the plan.
2. Re-dispatch the reviewer with the updated plan.
3. Maximum 3 iterations. If exceeded, present remaining issues to the user.

**If the reviewer returns "Approved":**
Proceed to execution handoff.

## Step 7: Execution Handoff

After the plan is saved and reviewed:

```
Plan complete and saved to <path to plan file>.

<N> tasks covering <M> acceptance criteria from the spec.
<S> tasks tagged with specialist routing.

To implement: skill({ name: "adev:implement", args: { plan: "<path>" } })
```

## Dry-Run Mode

If `--dry-run` is passed, perform Steps 1-4 and show the planned structure without writing files.
