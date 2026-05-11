# Live Spec: Pre-existing Failure Protocol

<!-- Live Spec within the adev:write-test charter.
     Parent Charter: .context-index/specs/features/adev:write-test/charter.md -->

---
charter: adev:write-test
status: validated
risk_level: high
milestone: v1
revision: 1
charter-revision: 1
created: 2026-03-27
updated: 2026-05-04
source-manifest:
  sha: "794bc64"
  files:
    - skills/write-test/SKILL.md
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
drift_source: skills/write-test/SKILL.md
drift_at: 2026-05-11T00:13:36.884Z
---

## Behavioral Contract

### Preconditions

- `adev:write-test --red` has been invoked
- The project has a detectable test command from the allowlisted framework detection table (framework detection has run)
- The working tree has uncommitted changes (otherwise stash is a no-op and the check is skipped)
- No `.context-index/.write-test.lock` file exists (concurrent execution guard)

### Behaviors

1. **When** `--red` is invoked **then** the skill runs the test command before writing any tests. If all tests pass, it proceeds immediately to authoring — no stash is needed.

2. **When** `--red` is invoked and one or more tests are already failing **then** the skill must prove those failures predate the current changes before proceeding. It runs `git stash --include-untracked` (to stash both tracked and untracked files, preventing contamination of the clean-branch check), re-runs the failing tests on the clean branch with a 60-second timeout, records the output, then runs `git stash pop` to restore changes — regardless of whether the test run succeeded, errored, or timed out.

3. **When** the stash check confirms a failure existed before current changes (test still fails on clean branch) **then** the skill attaches a Pre-existing Failure Record to the Handoff Block and proceeds to authoring. The record documents: the stash SHA, the test output before stash pop, and the test output after stash pop.

4. **When** the stash check shows a failure did NOT exist before current changes (test passes on clean branch) **then** the skill blocks with: "Test `<name>` passes on the clean branch but fails with your changes. Your changes caused this failure. Fix it before writing new tests." It does not proceed to authoring.

5. **When** `git stash pop` fails for any reason **then** the skill blocks immediately, reports the stash SHA, and instructs the user to run `git stash pop` manually to restore their work. It does not attempt any further git operations.

6. **When** the working tree has no uncommitted changes **then** the stash step is skipped entirely. A note is recorded in the Handoff Block: `preexisting_check: skipped (clean tree)`.

### Postconditions

- If any tests were failing before `--red` was invoked, each has either a Pre-existing Failure Record in the Handoff Block or caused the skill to block
- The working tree is in the same state as before the stash protocol ran
- `git stash pop` has been executed if `git stash` was executed

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Lock file exists | Block with "Another adev:write-test instance is running. Wait for it to complete or remove `.context-index/.write-test.lock` if stale." | CONCURRENT_EXECUTION |
| `git stash --include-untracked` fails | Block with git error message. Do not proceed. | GIT_STASH_FAILED |
| Intermediate test run times out (> 60s) | Kill the process. Proceed to `git stash pop`. Block with TIMEOUT_ERROR. | TIMEOUT_ERROR |
| `git stash pop` fails | Block immediately. Report stash SHA. Instruct manual recovery. Do not attempt further operations. | GIT_POP_FAILED |
| Test command not found | Block with "Test command not detected. Run framework detection first." | FRAMEWORK_NOT_DETECTED |
| Failure caused by current changes | Block with failing test name and instruction to fix before authoring new tests. | REGRESSION_DETECTED |
| Stash produces empty diff (no changes to stash) | Skip stash protocol. Record `preexisting_check: skipped (clean tree)` in handoff block. | — |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — The git stash sequence is a set of bash commands instructed by the skill. The skill's SKILL.md describes when and how to run them; no compiled helper is needed.
- **Principle:** "Hook protocol compliance" — This protocol does not use hooks. It is an in-skill bash execution sequence, not a PreToolUse hook. The distinction matters: hooks run before Claude acts; this protocol is Claude acting deliberately.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add protocol to `SKILL.md` | Document the full stash sequence in the RED phase prerequisites section of the skill | Small |
| Define Pre-existing Failure Record format | Add record schema to the Handoff Block format (stash SHA, before/after outputs, verdict) | Small |
| Write integration tests | Test the protocol logic using `runHook` / bash test helpers in `tests/adev:write-test/` | Medium |

## Acceptance Criteria

- [ ] When tests pass before `--red`, the stash protocol is skipped and authoring proceeds
- [ ] When tests fail before `--red` and the failure predates current changes, a Pre-existing Failure Record is attached to the Handoff Block
- [ ] When tests fail before `--red` and the failure is caused by current changes, the skill blocks with the failing test name and a fix instruction
- [ ] Uses `git stash --include-untracked` to prevent untracked files from contaminating the clean-branch check
- [ ] Creates `.context-index/.write-test.lock` before stash and removes it after stash pop (even on failure)
- [ ] `git stash pop` always executes after `git stash` — even if the intermediate test run errors or times out
- [ ] Intermediate test run is killed and stash pop proceeds if the test command does not complete within 60 seconds
- [ ] A failed `git stash pop` causes an immediate block with the stash SHA for manual recovery
- [ ] A clean working tree skips the stash protocol and records `preexisting_check: skipped (clean tree)` in the Handoff Block
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
