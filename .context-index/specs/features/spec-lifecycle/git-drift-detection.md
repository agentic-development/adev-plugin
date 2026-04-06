# Live Spec: Git Drift Detection

---
charter: spec-lifecycle
status: validated
risk_level: high
milestone: v1
revision: 1
charter-revision: 1
created: 2026-03-27
updated: 2026-03-28
---

## Behavioral Contract

### Preconditions

- A spec has `status: review-passed` and a `.review.md` sidecar file exists
- The `.review.md` file records `last-reviewed-revision` and `file-sha` (git object hash of the spec at review time)
- Git is available in the project directory

### Behaviors

1. **When** `/adev:review-specs` passes a spec **then** it records `last-reviewed-revision: <spec's current revision>` and `file-sha: <git hash-object of spec file>` in the `.review.md` sidecar.

2. **When** `/adev:plan` is invoked for a spec **then** it checks two drift conditions before proceeding:
   - **Revision drift:** spec's `revision` > `.review.md`'s `last-reviewed-revision`
   - **File drift:** `git hash-object <spec-file>` differs from `.review.md`'s `file-sha`

3. **When** revision drift is detected (spec revision higher than reviewed revision) **then** `/adev:plan` blocks with: "Spec has been modified since review (revision <current> > reviewed <last>). Run `/adev:review-specs` before planning."

4. **When** file drift is detected (git hash differs but revision matches) **then** `/adev:plan` blocks with: "Spec file has been manually edited since review. Run `/adev:review-specs` before planning."

5. **When** neither drift condition is detected **then** `/adev:plan` proceeds normally.

6. **When** a spec has no `.review.md` file **then** `/adev:plan` blocks with: "Spec has not been reviewed. Run `/adev:review-specs` first."

7. **When** `/adev:hygiene` scans specs **then** it reports all specs with drift (revision or file) as needing re-review.

### Postconditions

- Every reviewed spec has a `.review.md` with `last-reviewed-revision` and `file-sha`
- Planning is blocked on any spec with detectable drift
- Both skill-based edits (caught by revision) and manual edits (caught by git hash) are detected

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Spec modified since review (revision drift) | `/adev:plan` blocks, directs user to re-review | REVISION_DRIFT |
| Spec file edited manually (file drift) | `/adev:plan` blocks, directs user to re-review | FILE_DRIFT |
| No `.review.md` exists | `/adev:plan` blocks, directs user to run review | NO_REVIEW |
| Git not available | `/adev:plan` falls back to revision-only check, warns about missing file drift detection | GIT_UNAVAILABLE |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Uses only `git hash-object` (always available in git repos) and integer comparison for revision check.
- **Principle:** "Hook protocol compliance" — Drift detection runs as a gate within skill instructions, not as a hook.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update `adev:review-specs/SKILL.md` | Record `last-reviewed-revision` and `file-sha` in `.review.md` | medium |
| Update `adev:plan/SKILL.md` | Add drift detection gate (revision + file hash check) | medium |
| Update `adev:hygiene/SKILL.md` | Add drift scan across all specs | small |
| Write tests | Test revision drift, file drift, no review, git unavailable | medium |

## Acceptance Criteria

- [ ] `/adev:review-specs` records `last-reviewed-revision` and `file-sha` in `.review.md`
- [ ] `/adev:plan` blocks on revision drift with `REVISION_DRIFT` message
- [ ] `/adev:plan` blocks on file drift with `FILE_DRIFT` message
- [ ] `/adev:plan` blocks on missing `.review.md` with `NO_REVIEW` message
- [ ] Manual edits to a reviewed spec are detected via `git hash-object` comparison
- [ ] Git unavailability falls back to revision-only check with a warning
- [ ] `/adev:hygiene` reports all drifted specs
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
