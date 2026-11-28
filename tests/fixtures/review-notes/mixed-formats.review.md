---
spec: .context-index/specs/features/demo/sample.spec.md
verdict: PASS_WITH_NOTES
last-reviewed-revision: 5
file-sha: <PENDING>
---

# Architecture Review: sample

> **Date:** 2026-11-01
> **Spec:** .context-index/specs/features/demo/sample.spec.md
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

### SA-1 — warning — Error Cases, "Store missing or unreadable" row

The error row names no exit code for the unreadable-store case.

### SA-2 — Projection requires lockstep amendment

- **Severity:** warning
- **Location:** Integration Points
- **Finding:** The projection change needs a matching edit to the event-log spec.
- **Recommendation:** Add the sibling amendment to the acceptance criteria.

### SA-3 — suggestion — Behaviors

Consider naming the helper.

- ~~**SA-4** (warning): stale path in Step 2~~ → Resolved in revision 4.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- **SEC-1** (warning, section: `behaviors-3`): Path containment is not re-asserted for the new `--out` flag.
- **SEC-2** (suggestion): Consider redacting tokens in notes. A warning here would be noisy.
- [warning] SEC-3: Lock file mode is unspecified. **Resolved:** mode 0600 is now stated.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

**CON-1** — Severity: warning (carried forward from revision-4 review, unresolved)

This Spec: The warning is named "floor warning" in the Task Map but "floor-bypass warning" in Behavior 6.
Recommendation: Standardize on the Behavior 6 name.

- **CON-2 — `suggestion`** · anchor `interface` — the warning wording could be shorter.
- **CON-3 — warning** — *Behavior 4, "Staleness" / AC 389* — same defect as CON-1 (counted there)

```markdown
- **CON-9** (warning): this is an example inside a code fence and must be ignored.
```

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

- **BD-1** | warning | Location: Behaviors §11 (sticky tracker)
  - **Finding:** The sticky tracker has no owner.
  - **Recommendation:** Name the verb that owns it.

- **BD-2** | `warning` | input-validation
  The `--since` flag is not validated.

- [BD-3] warning: Merge target wording is ambiguous.

---

## Summary

**Total findings:** 13 (0 blockers, 10 warnings, 3 suggestions)
**Action required:** Warnings SA-1, SA-2, SEC-1, CON-1, CON-3 carry forward to /adev:plan.

| SA-1 | warning | Error Cases | duplicate row in a summary table |
