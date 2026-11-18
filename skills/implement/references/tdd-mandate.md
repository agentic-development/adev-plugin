## TDD: RED-GREEN-REFACTOR

This project's `implementation_mode` is `tdd`.

Every piece of production code requires a failing test first.

1. RED: Write one failing test that captures the next behavior to implement.
2. VERIFY RED: Run only the specific test file (e.g., `npx vitest run <path-to-test-file>`), not the full suite. Confirm it fails for the expected reason (missing feature, not a typo or import error). If it passes, you are testing existing behavior. Fix the test.
3. GREEN: Write the minimal code to make the test pass. Nothing more.
4. VERIFY GREEN: Run only the specific test file again. Confirm it passes. The full test suite runs at the quality-gate stage after review, not here.
5. REFACTOR: Clean up while keeping the test file green.
6. REPEAT for the next behavior.

No production code without a failing test first. No exceptions.
If you wrote code before the test, delete it and start over.

### Test Depth

Your prompt carries a `## Test Depth` section with the depth assigned to this task. It sets which case classes your RED tests must cover:

- `minimal`: the happy path plus the task's declared acceptance criteria.
- `standard`: everything in `minimal`, plus the declared error cases.
- `thorough`: everything in `standard`, plus boundary and edge conditions.

Cover at least the assigned classes. A depth raised by the floor (`floor_legs` names why, e.g. `sensitive-path`) is not optional.
