### Phase 5: Fix

**Goal:** Fix the root cause, not the symptom.

1. **Create a failing test case.**
   - Simplest possible reproduction as an automated test.
   - This test MUST fail before the fix and pass after.
   - If the test already exists and is failing, do NOT weaken it. Read the test,
     understand what it expects, then fix the code to satisfy the original assertion.
   - If you need to change the test, explain why the REQUIREMENT changed, not just
     why the code produces a different value.

2. **Implement a single fix.**
   - Address the root cause identified in Phase 4.
   - ONE change at a time.
   - No "while I'm here" improvements.
   - No bundled refactoring.
   - Stay within constitutional boundaries.

3. **Verify the fix.**
   - Failing test now passes.
   - No other tests broken.
   - Issue actually resolved end-to-end.

4. **Record the debug intervention in the lifecycle log.**

   If the bug is tracked by a spec, emit a `debug_intervention` event so the projection captures the intervention (replaces any prior "append to debug log" prose):

   ```javascript
   import { reportIntervention } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';
   reportIntervention(projectRoot, specPath, {
     kind: "debug",
     note: "<≤200-char operator summary of root cause and fix>",
   });
   ```

   Severity is stamped at write time by the lib. `notes` MUST NOT include API keys, tokens, file contents, or stack traces beyond the immediate error message (4 KB cap; ≤200 chars in practice).
