# Feature Completeness Definition of Done

Full instructions for `SKILL.md` Step 6. After Step 5.5, verify lifecycle
artifact completeness. This is distinct from `/adev:validate` (which checks code
correctness) — this checks that all lifecycle bookkeeping is done.

**Checklist:**

1. **All epic issues closed:** If the plan has an associated epic (via issue board), check that ALL issues in the epic are now closed. If not, report which issues remain open.
2. **Source manifest stamped:** Verify the spec has a `source-manifest` block in frontmatter (done in Step 5).
3. **Spec status updated:** Verify the spec status is `implemented` (done in Step 5).
4. **Charter capability status updated:** Verify the charter's Capability Map has the capability status set to `implemented` (done in Step 5).
5. **Epic closed:** If all issues in the epic are now closed, update the epic status to `closed`. Use `updateEpic(epicId, { status: 'closed' })` from the issue adapter.

**Output format:**
```
Feature Completeness DoD:
  [x] All epic issues closed (N/N)
  [x] Source manifest stamped (sha: abc1234)
  [x] Spec status: implemented
  [x] Charter capability: implemented
  [x] Epic closed: epic-N

— or —

  [x] All epic issues closed (N/N)
  [x] Source manifest stamped (sha: abc1234)
  [x] Spec status: implemented
  [x] Charter capability: implemented
  [ ] Epic NOT closed — 2 issues still open (issue-4, issue-5)
```

If any item fails, report it but do NOT block completion. The implementation is
done; the DoD gaps are informational for follow-up.
