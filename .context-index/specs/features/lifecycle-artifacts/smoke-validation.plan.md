<!-- DO NOT EDIT statuses inline — see lifecycle log smoke-validation.jsonl -->
# Implementation Plan: Smoke Validation

> **Methodology:** adev
> **Charter:** .context-index/specs/features/lifecycle-artifacts/charter.md
> **Spec:** .context-index/specs/features/lifecycle-artifacts/smoke-validation.spec.md (revision 2)
> **Review:** PASS_WITH_NOTES (2026-05-14, SA-11 + SA-12 + CON-5 resolved in rev 2)
> **Platform:** N/A — this is a verification procedure, no implementation code

**Goal:** Execute the 8-step verification procedure that proves Layer 1 of epic-73 works end-to-end. Action-kind spec — no code shipped here, only verification steps.

**Architecture:** No new code. Tasks are CHECKS to run after all other Layer 1 work lands. The "tests" for each task are the procedure's verification commands.

---

## File Structure

**Reference (no creates/modifies):**
- All 11 specs under `.context-index/specs/features/lifecycle-artifacts/`
- `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md`
- `.context-index/specs/features/lifecycle-artifacts/charter.md` (Capability Map)

**Throwaway during execution (cleaned up by procedure):**
- Throwaway specs/charters created in Steps 2-3, deleted before Step 4

## Context Packets

### All Tasks Context
- Spec: smoke-validation.spec.md (the procedure itself)
- All other Layer 1 specs must be in `status: implemented` or beyond before this plan runs

## Parallelization

All tasks must be sequential (each verifies a prerequisite of the next). Run only after every other lifecycle-artifacts plan has been implemented and validated.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Verify kind coverage across 11 specs | small | smoke | all other Layer 1 plans implemented | 0 |
| 2 | Throwaway-spec authoring for each new spec kind | small | smoke | Task 1, specify-kind-routing | 0 |
| 3 | Throwaway-charter authoring for each new charter kind | small | smoke | Task 2, brainstorm-kind-routing | 0 |
| 4 | Run hygiene on lifecycle-artifacts; verify zero INVALID_KIND/MISSING_KIND | small | smoke | hygiene-kind-validity | 0 |
| 5 | `npm test` final suite run | small | smoke | all code-bearing plans | 0 |
| 6 | Verify ADR-0009 landed + Capability Map complete | small | smoke | — | 0 |
| 7 | Close-out: close issue-465; advance milestone | small | smoke | Tasks 1-6 | 0 |

---

### Task 1: Verify kind coverage across 11 specs [specialist: none]

**Charter capability:** Smoke validation suite
**Strategy:** smoke (verification only)
**Files:** 0
**Tests:** `bash` grep, see procedure
**Depends on:** All other Layer 1 plans implemented

- [ ] Run the YAML-quoting-tolerant grep from spec Step 1
- [ ] Verify each of the 6 spec kinds (`behavioral`, `refactor`, `action`, `skill`, `integration`, `artifact`) has count ≥ 1 across lifecycle-artifacts specs

### Task 2: Throwaway-spec authoring for each new spec kind [specialist: none]

**Charter capability:** Smoke validation suite
**Strategy:** smoke
**Files:** 0 permanent (throwaways created + deleted)
**Tests:** Manual invocation per spec Step 2
**Depends on:** Task 1, specify-kind-routing implemented

- [ ] For each new kind (action, skill, integration, artifact): invoke `/adev:specify --kind <kind>` against a scratch charter. Verify the produced spec has the correct H2 section structure for its kind. Delete the throwaway spec immediately.

### Task 3: Throwaway-charter authoring for each new charter kind [specialist: none]

**Charter capability:** Smoke validation suite
**Strategy:** smoke
**Files:** 0 permanent
**Tests:** Manual invocation per spec Step 3
**Depends on:** Task 2, brainstorm-kind-routing implemented

- [ ] For each new charter kind (module, cross-cutting, initiative): invoke `/adev:brainstorm --kind <kind>` for a scratch slug. Verify the produced charter has the correct H2 section structure. Delete throwaway charters.
- [ ] Run `git status --porcelain` to confirm no untracked throwaway artifacts remain before proceeding to Task 4

### Task 4: Run hygiene + verify zero issues [specialist: none]

**Charter capability:** Smoke validation suite
**Strategy:** smoke
**Files:** 0
**Tests:** Output of `/adev:hygiene --module lifecycle-artifacts`
**Depends on:** Task 3, hygiene-kind-validity implemented

- [ ] Invoke `/adev:hygiene --module lifecycle-artifacts`
- [ ] Verify zero `INVALID_KIND` and zero `MISSING_KIND` findings on the 11 Layer 1 specs (all have explicit `kind:` per the strict-on-write posture)

### Task 5: `npm test` final suite [specialist: none]

**Charter capability:** Smoke validation suite
**Strategy:** smoke
**Files:** 0
**Tests:** the full project test suite
**Depends on:** all code-bearing Layer 1 plans

- [ ] `npm test` from project root
- [ ] All tests pass

### Task 6: Verify ADR-0009 + Capability Map [specialist: none]

**Charter capability:** Smoke validation suite
**Strategy:** smoke
**Files:** 0
**Tests:** Manual inspection

- [ ] `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md` exists with status `Accepted`
- [ ] Charter Capability Map: every must-have row's Status is `validated` (or `review-passed` at minimum); no row reads `—` (already verified — all 14 are `review-passed`/`validated`)

### Task 7: Close-out [specialist: none]

**Charter capability:** Smoke validation suite
**Strategy:** smoke
**Files:** issue board state
**Tests:** N/A
**Depends on:** Tasks 1-6

- [ ] Close `issue-465` (Layer 1 tracker) with reason "Smoke validation passed"
- [ ] Update milestone `spec-and-charter-taxonomy` status toward `ship` when remaining ship_criteria also satisfied
- [ ] Per spec Step 8: the close-out issue is `issue-465`, distinct from `issue-463` (Layer 2 deferred) and `issue-464` (Layer 3 deferred). Layer 2/3 follow-up work remains open after Layer 1 ships.

---

## Quality Gates

- All 7 procedure tasks pass
- No throwaway artifacts left in the repo
- Layer 1 marked complete on the board
