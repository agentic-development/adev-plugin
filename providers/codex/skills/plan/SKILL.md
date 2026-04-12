---
name: adev:plan
description: "Constitution-gated planning. Decomposes reviewed Live Specs into ordered implementation tasks with TDD expectations and context routing hints. In Codex, invoke with $adev:plan"
---

# Plan Implementation

Decompose a reviewed Live Spec into an ordered task list ready for `$adev:implement`.

**Announce:** "I'm using the adev:plan skill to create the implementation plan."

## Arguments

- `--spec <path>`: plan a specific spec (required)
- `--phase <name>`: plan all specs matching a phase/milestone
- `--dry-run`: show structure without writing

## Step 1: Review Gate

Before planning, verify spec passed architecture review:

1. Look for `.review.md` adjacent to spec
2. If no review exists: **BLOCK**
3. If verdict is BLOCK: **BLOCK**
4. If spec is newer than review: **BLOCK**

```
This spec has not been reviewed yet.
Run $adev:review-specs before planning.
```

## Step 2: Load Context

Read:
1. Constitution
2. Platform context
3. Orientation
4. ADRs
5. Parent charter
6. The spec
7. Review report
8. Cross-cutting specs
9. Samples
10. Boundary rules
11. **Heuristics:** Load module-scoped heuristics for inclusion in the plan. Derive the module slug from the spec's `charter:` frontmatter field. Run inline Node.js using `retrieveHeuristics` and `renderHeuristic` from `lib/heuristics.mjs`, passing the module slug and `heuristics.injection_limit` from manifest.yaml (if configured). If the call fails or returns empty, proceed without heuristics — heuristic injection is non-blocking. Store the rendered output for use in Step 5.

## Step 3: Constitution Validation

Check each acceptance criterion against constitution boundaries. Flag violations.

If user confirms boundary crossing, mark task: `[REQUIRES HUMAN APPROVAL]`

## Step 4: Specialist Routing

Match tasks against specialists registry using scoring:
- Pattern score: 2 points per glob match
- Keyword score: 1 point per keyword match

Tag highest scorer or `[specialist: none]`

## Step 5: Write the Plan

### Plan Location

`.context-index/specs/features/<module>/<task>.plan.md`

### Plan Header

```markdown
# Implementation Plan: <Feature Name>

> **Methodology:** adev
> **Charter:** .context-index/specs/features/<module>/charter.md
> **Spec:** .context-index/specs/features/<module>/<task>.md
> **Review:** <PASS|PASS_WITH_NOTES> (YYYY-MM-DD)

**Goal:** <One sentence>

---
```

### Task Structure

Each task follows TDD:

```markdown
### Task N: <Title> [specialist: <name|none>]

**Files:** Create: `path`, Modify: `path:123-145`, Test: `tests/path`

- [ ] **Write failing test**
- [ ] **Verify test fails**
- [ ] **Implement**
- [ ] **Verify test passes**
- [ ] **Commit**
```

### Context Packets

After the file structure and before individual tasks, include a context packet manifest per task:

```markdown
## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/<module>/<task>.md` (criteria 1-3)
- Charter: `.context-index/specs/features/<module>/charter.md` (capability: <name>)
- Sample: `.context-index/samples/<pattern>-sample.md`
- Heuristics: <N> entries for module `<M>` (IDs: <id1>, <id2>, ...)
```

### Heuristics Section

If heuristics were loaded in Step 2, add a `## Heuristics` section to the plan after Context Packets and before Parallelization:

```markdown
## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `$adev:implement` reads from the live heuristic store.

<rendered heuristic blocks from Step 2>
```

If no heuristics are available, omit this section entirely.

## Step 6: Plan Review Loop

Dispatch plan-reviewer subagent. Fix issues, max 3 iterations.

## Step 7: Execution Handoff

```
Plan complete at <path>.

<N> tasks covering <M> acceptance criteria.

To implement: $adev:implement
```

## Dry-Run Mode

`--dry-run` shows structure without writing.
