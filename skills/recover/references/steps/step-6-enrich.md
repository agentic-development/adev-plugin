### Step 6: Enrich

Write a recovery record for retrospective analysis. This feeds into `/adev:hygiene` and `/adev:retro`.

1. Create `.context-index/hygiene/recoveries/` directory if it does not exist.
2. Write the recovery record to `.context-index/hygiene/recoveries/<date>-<task-slug>.md` using the format below.
3. Emit the `recovery_record` lifecycle event so the projection's
   `interventions[]` fold has the producer it has always consumed. Run this
   only when the stalled task is tracked by a spec — a recovery with no spec
   has no log to append to, and this step is skipped silently:

   ```bash
   adev report --type recovery \
       --spec <specPath> \
       --ref .context-index/hygiene/recoveries/<date>-<task-slug>.md \
       --category <MISSING_CONTEXT|AMBIGUOUS_SPEC|CONSTRAINT_CONFLICT|NOVEL_PROBLEM|TOOL_FAILURE|BUDGET_EXHAUSTION> \
       --note "<≤200-char summary of root cause and corrective action>"
   ```

   `--ref` must be project-root-relative — the verb rejects absolute paths.
   Use `--type recovery`, not `--type intervention --kind recover`: the latter
   emits `debug_intervention`, which is the debug channel, not this one.
   The step is non-blocking — if the verb exits non-zero, log the failure and
   continue to Step 7.
4. Print confirmation:
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
