# Implementation Plan: foo (fixture — inline Routing AND sidecar present)

> **Spec:** foo.spec.md

This plan body contains inline `**Routing:**` blocks (legacy migration noise)
AND a sibling `.routing.md`. The detector tolerates the inline blocks
because the sidecar is present; it must NOT flag
`PLAN_MUTATED_WITHOUT_SIDECAR`. The per-task git-history `--diff-filter=M`
check (handled by the existing detector path) still applies.

## Tasks

### Task t1: Stub task

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** legacy inline block that should be tolerated thanks to sidecar.

Files:
- Modify: src/foo.mjs

- [ ] Write failing test
- [ ] Implement
- [ ] Verify
