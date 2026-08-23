### Step 5: Resume

Re-dispatch the implementation with the enriched context.

1. Summarize the corrective action taken.
2. If the fix involved updating a context packet, spec, or plan, verify the changes are saved.
3. Suggest the next command. **Persona adaptation:** Adapt the chat summary to the active persona's output rules.
   ```
   Corrective context injected. Ready to resume.

   Next step: /adev:implement <plan-path> --task <N>
   ```
4. If the plan was split (BUDGET_EXHAUSTION), suggest running the first subtask:
   ```
   Plan updated with split tasks. Resume with:

   /adev:implement <plan-path> --task 3a
   ```
