# Implementation Plan: foo (fixture — inline Routing without sidecar)

> **Spec:** foo.spec.md

This plan body contains inline `**Routing:**` / `**Scores:**` / `**Rationale:**`
blocks (the legacy `/adev:route` pattern) but NO sibling `.routing.json` exists.
The detector must flag this as `PLAN_MUTATED_WITHOUT_SIDECAR` regardless of
git history shape (i.e., even when the plan is committed as a single `A` commit
and never modified post-add).

## Tasks

### Task t1: Stub task

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** mechanical refactor; well-specified contract.

Files:
- Modify: src/foo.mjs

- [ ] Write failing test
- [ ] Implement
- [ ] Verify
