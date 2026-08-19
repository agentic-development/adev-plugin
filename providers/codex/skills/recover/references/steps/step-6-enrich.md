### Step 6: Enrich

Write a recovery record for retrospective analysis. This feeds into `/adev:hygiene` and `/adev:retro`.

1. Create `.context-index/hygiene/recoveries/` directory if it does not exist.
2. Write the recovery record to `.context-index/hygiene/recoveries/<date>-<task-slug>.md` using the format below.
3. Print confirmation:
   ```
   Recovery record saved: .context-index/hygiene/recoveries/2026-03-19-user-profile-api.md
   Root cause: MISSING_CONTEXT
   Outcome: resolved
   ```

#### Recovery Record Format

```markdown
# Recovery Record: <task-slug>

> **Date:** YYYY-MM-DD
> **Task:** <task reference from plan>
> **Root Cause:** MISSING_CONTEXT | AMBIGUOUS_SPEC | CONSTRAINT_CONFLICT | NOVEL_PROBLEM | TOOL_FAILURE | BUDGET_EXHAUSTION
> **Time to Recovery:** <minutes from start of /adev:recover to resume>
> **Outcome:** resolved | escalated | deferred

## Diagnosis

<What was found. Evidence that led to the root cause classification.>

## Corrective Action

<What was done. Files modified, context added, spec clarified, task split, etc.>

## Prevention

<What should change to prevent recurrence. Spec update, sample addition, constitution clarification, context packet improvement, etc.>
```
