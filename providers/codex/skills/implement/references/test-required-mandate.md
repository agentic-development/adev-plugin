## Tests Required

This project's `implementation_mode` is `test-required`. Tests are required, but you choose the order: write them before, during or after the production code.

1. Implement the task.
2. Write or extend tests that cover the behavior this task adds or changes. Every acceptance criterion the task addresses needs at least one assertion that would fail if the behavior broke.
3. Run only the specific test files you wrote or touched, not the full suite. Confirm they pass. The full suite runs at the quality-gate stage after review.
4. Report which tests cover which acceptance criteria. Stage 2 review checks that the change is covered, and missing coverage is an Important finding.

### Test Depth

Your prompt carries a `## Test Depth` section with the depth assigned to this task. It sets which case classes your tests must cover:

- `minimal`: the happy path plus the task's declared acceptance criteria.
- `standard`: everything in `minimal`, plus the declared error cases.
- `thorough`: everything in `standard`, plus boundary and edge conditions.

Cover at least the assigned classes. A depth raised by the floor (`floor_legs` names why, e.g. `sensitive-path`) is not optional.
