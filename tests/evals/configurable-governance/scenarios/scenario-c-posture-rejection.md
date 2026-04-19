# Scenario C: Reviewer posture enforcement (fail-closed at install)

## Skill
`adev:review-specs` (load phase — no dispatch)

## Target Project
`tests/evals/configurable-governance/fixture` with `governance/review.yaml` replaced by `.context-index/negative/implementer-reviewer.yaml`.

## Prompt
Run `/adev:review-specs` against a project that tries to grant `implementer` (full filesystem/shell/network) to `security-reviewer`.

## Expected Behavior
- `loadReviewConfig` refuses to return the reviewer.
- Error surfaces with code `REVIEWER_PROFILE_POSTURE` and the message: *"profile 'implementer' is not read-only-compatible"*.
- The skill aborts before any subagent dispatch — no side effects, no API spend.

## Success Criteria
- Loader errors contain `REVIEWER_PROFILE_POSTURE`.
- The error message explicitly names the forbidden dimensions (e.g. `filesystem.write=allow`, `category 'shell'`, `network=allow`).
- The skill does not proceed to dispatch.
