## TDD: RED-GREEN-REFACTOR

Every piece of production code requires a failing test first.

1. RED: Write one failing test that captures the next behavior to implement.
2. VERIFY RED: Run only the specific test file (e.g., `npx vitest run <path-to-test-file>`), not the full suite. Confirm it fails for the expected reason (missing feature, not a typo or import error). If it passes, you are testing existing behavior. Fix the test.
3. GREEN: Write the minimal code to make the test pass. Nothing more.
4. VERIFY GREEN: Run only the specific test file again. Confirm it passes. The full test suite runs at the quality-gate stage after review, not here.
5. REFACTOR: Clean up while keeping the test file green.
6. REPEAT for the next behavior.

No production code without a failing test first. No exceptions.
If you wrote code before the test, delete it and start over.

### Test Integrity

When a test fails unexpectedly:

1. INVESTIGATE FIRST. Before changing any assertion, look at the actual behavior:
   - For UI: take a browser snapshot, read the DOM, check console errors.
   - For API: read the actual response body, status code, headers.
   - For logic: add a console.log or debugger, read the actual value.
   Understand WHY the test failed before deciding what to change.
   Then check project context before proposing a fix:
   - Read the Live Spec's acceptance criteria — is the test asserting
     the right behavior, or is the spec different from what you assumed?
   - Check `.context-index/adrs/` for known constraints or trade-offs
     in the affected area.
   - Check the Feature Charter's behavioral contract — the bug may be
     "working as specified" (spec problem, not code problem).
   If the context says the test is correct, fix the code. If the context
   says the behavior is correct, the spec or test needs updating (escalate).

2. KEEP ASSERTIONS STRICT. Never loosen a matcher to make a test pass:
   - Do not change `getByText("Submit")` to `getByText(/submit/i)`.
   - Do not change `toEqual(expected)` to `toContain(partial)`.
   - Do not change `toBe(false)` to `toBeFalsy()`.
   If the exact value is wrong, fix the code that produces it.

3. NO CONDITIONAL SKIPS. Never write:
   - `if (element.isVisible()) { ... } else { skip }`
   - `try { assert(...) } catch { /* ignore */ }`
   - `expect(items.length).toBeGreaterThanOrEqual(0)` (always passes)
   If the element should be visible, assert it. If the data should exist, assert it.
   A test that cannot fail is not a test.

4. FIX THE APP, NOT THE TEST. When a test reveals a real issue:
   - The test is doing its job. Do not punish it.
   - Fix the application code so the test passes as originally written.
   - Only change the test if the REQUIREMENT changed (and update the spec too).

5. SEED BEFORE YOU ASSERT. Every test must control its own data:
   - Set up deterministic seed data (fixtures, factories, builders) at the start
     of the test. Do not rely on data left by other tests or existing in the DB.
   - Assert against the exact seed values, not against "whatever came back."
   - Bad: `expect(users.length).toBeGreaterThan(0)` (passes if DB has any row).
   - Good: seed 3 users → `expect(users).toHaveLength(3)` and check names.
   If you cannot assert exact values, you did not control the input.
