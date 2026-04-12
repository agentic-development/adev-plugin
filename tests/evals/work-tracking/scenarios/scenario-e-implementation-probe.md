# Scenario E: Implementation Probe

## Skill
Implementation probe in `/adev:implement`

## Target Project
`tests/evals/work-tracking/fixture` — fixture repo with crafted git history

## Prompt
Before implementing the auth/login.md spec, check if the target files already exist and tests pass. The plan (login.plan.md) specifies 3 tasks targeting lib/login.mjs and tests/login.test.mjs.

Also check the session-mgmt.md spec — it has no plan, so probe by checking if any code files match the spec's domain keywords.

## Expected Behavior
The implementation probe should:
1. Read the plan's task file lists
2. Check if those files already exist in the repo
3. Run tests if test files exist
4. Report whether each task appears already implemented

## Success Criteria
- Detects lib/login.mjs already exists for login spec tasks 1-2
- Detects tests/login.test.mjs already exists for login spec task 3
- Reports tests pass (or at minimum that test file exists and is syntactically valid)
- Recommends marking login spec issues as "Already implemented" instead of re-implementing
- Reports session-mgmt.md has no plan and no detectable implementation files
- Does NOT claim dashboard/metrics.md is implemented (spec is draft, no code exists)
- Distinguishes "code exists and matches plan" from "code exists but plan doesn't exist"
