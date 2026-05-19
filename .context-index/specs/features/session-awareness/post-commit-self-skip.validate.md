# Validation Report: Post-commit hook self-skips on session-capture-only commits

> **Date:** 2026-05-19
> **Spec:** .context-index/specs/features/session-awareness/post-commit-self-skip.spec.md
> **Plan:** .context-index/specs/features/session-awareness/post-commit-self-skip.plan.md
> **Overall Status:** FAIL

---

## Check 1: Quality Gates — FAIL

- Tests: FAIL — `npm test` reports 3425 pass / 1 fail / 2 todo across 3428 tests.
- The failing test is `tests/skills/plan-task-immutability.test.mjs:63` ("plan-immutability: real repo has no violations").
- Detector output (the assertion diff):

  ```
  unexpected plan-file mutations:
  [
    {
      "path": ".../session-awareness/post-commit-self-skip.plan.md",
      "firstPendingTs": "2026-05-19T12:37:32.470Z",
      "lastModifiedTs": "2026-05-19T12:39:12.741Z"
    }
  ]
  ```

- Root cause: the plan file under validation was mutated ~1m40s after the first `plan_task` `pending` event for that plan. The detector falls back to mtime because the plan file is still untracked by git in this branch. This violates the architectural invariant from `agent-reliable-state-artifacts/plan-task-events.spec.md` § Acceptance Criteria bullet 5 (plan files immutable post-authoring).
- Auto-fix: not applicable — this is an architectural test failure, not a lint/format issue.

Per fail-fast policy, Checks 2, 4, 8, 9, 11 are skipped. Checks 1.5 and 1.6 ran (they execute regardless of Check 1 because they are metadata/advisory).

[Quality gates failed. Checks 2-13 skipped. Fix the above and re-run /adev:validate.]

## Check 1.5: Source Manifest Verification — PASS

- Stamped SHA `16779ee` matches the current contents of `.githooks/post-commit` and `tests/hooks/post-commit-self-skip.test.mjs`.
- Both source files are committed:
  - `.githooks/post-commit` — committed in `4b4b6f5 feat(hooks): self-skip post-commit on sessions-only commits`
  - `tests/hooks/post-commit-self-skip.test.mjs` — committed in `c34e7dd test(hooks): integration tests for post-commit self-skip`

## Check 1.6: Code-Side Drift — PASS

- `adev verify spec --check-drift` returned `{"drifted":false,"drift_source":null,"drift_at":null}`. No drift since stamping.

## Check 2: Spec Compliance — SKIPPED

Skipped due to Check 1 fail-fast.

## Check 4: Constitution Compliance — SKIPPED

Skipped due to Check 1 fail-fast.

## Check 8: Boundary Compliance — SKIPPED

Skipped due to Check 1 fail-fast.

## Check 9: Transition Gates — SKIPPED

Skipped due to Check 1 fail-fast.

## Check 11: Visual Verification — N/A

No UI files (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.css`, etc.) in the implementation diff. Implementation touches `.githooks/post-commit` (bash) and `tests/hooks/post-commit-self-skip.test.mjs` (Node test). Visual verification is not applicable.

---

**Summary:** 2 passed, 1 failed, 4 skipped, 1 N/A. The post-commit self-skip implementation itself appears correct (source manifest matches, no drift, hook + tests committed cleanly), but a project-wide architectural test surfaced a real plan-immutability violation against this spec's plan file: the plan was modified ~1m40s after its first `plan_task pending` lifecycle event. Resolve the plan-immutability violation (either commit the plan as-is so the detector uses git history, or record the modification as an exempted commit in `manifest.yaml hygiene.plan_immutability.exempt_commits`) and re-run `/adev:validate`.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, 13 have been relocated by `check-set-restructure.spec.md`. See `/adev:review-specs`, `/adev:hygiene` Audit Pass 20, `/adev:reconcile` lifecycle-sync, and `hooks/post-validate-extract-heuristics.{sh,mjs}` for the new homes.
