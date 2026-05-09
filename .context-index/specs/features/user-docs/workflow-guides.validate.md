# Validation Report: Workflow Guides

**Spec:** `.context-index/specs/features/user-docs/workflow-guides.spec.md`
**Date:** 2026-05-09
**Verdict:** PASS

---

## Check Results

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Governance gates | SKIP | No governance/gates.yaml in project |
| 2 | Quality gates (`npm test`) | PASS | Docs tests pass (40/40 after test fix); repomap tests fail due to missing `web-tree-sitter` dep (pre-existing, unrelated) |
| 3 | Spec acceptance criteria | PASS | All 9 acceptance criteria verified against implementation |
| 4 | Charter consistency | PASS | All four workflow guide capabilities updated to `validated` |
| 5 | Constitution compliance | PASS | Pure markdown docs, no code, no dependencies, no anti-patterns |
| 6 | ADR compliance | PASS | No ADRs relevant to documentation feature |
| 7 | Specialist review | SKIP | No specialists configured |
| 8 | Governance boundary check | SKIP | No governance/gates.yaml |
| 9 | Transition gates | SKIP | No governance/gates.yaml |
| 10 | Visual verification | SKIP | No UI files |
| 11 | Lifecycle reconciliation | ADVISORY | No epic or issues exist for workflow-guides spec in the task board; recommend creating via `/adev:reconcile` |
| 12 | Cross-link integrity | PASS | All relative links in all four guides resolve to existing files |
| 13 | Heuristic extraction | See below |

## Acceptance Criteria Verification

- [x] `docs/design-phase.md` covers design skills (brainstorm, specify, review-specs, prototype) with examples
- [x] `docs/build-phase.md` covers build skills (plan, route, implement, write-test, build) with examples
- [x] `docs/validate-debug.md` covers validation skills (validate, debug, eval, recover) with examples
- [x] `docs/maintain.md` covers maintenance skills (issues, status, hygiene, retro, codehealth, repomap, reconcile, sample) with examples
- [x] Each skill mention includes what it does, when to use it, and a link to reference
- [x] Phase transitions and gates are documented
- [x] All four guides are reachable from docs/README.md
- [x] Skill descriptions match current SKILL.md content
- [x] No constitutional violations introduced

## Issues Found and Fixed

1. **Test bug (fixed):** Tests checked for `skills.md` but the actual skill reference file is `skill-reference.md`. The docs correctly link to `skill-reference.md`. Fixed the test assertions in `tests/docs/workflow-guides.test.mjs` to match the actual file name.

## Advisory Notes

- No epic/issues tracked for this spec in the task board. Consider running `/adev:reconcile` to create retroactive tracking.
- The `npm test` suite has pre-existing failures in `tests/repomap/parse.test.mjs` due to missing `web-tree-sitter` dependency -- unrelated to this spec.

## Files Verified

- `docs/design-phase.md` — Design Phase Guide
- `docs/build-phase.md` — Build Phase Guide
- `docs/validate-debug.md` — Validate & Debug Guide
- `docs/maintain.md` — Maintain Phase Guide
- `docs/README.md` — Table of Contents with workflow guide links
- `docs/skill-reference.md` — Skill Reference (link target)
- `tests/docs/workflow-guides.test.mjs` — Test file (fixed)

## Files Modified

- `tests/docs/workflow-guides.test.mjs` — Fixed 4 test assertions (`skills.md` -> `skill-reference.md`)
- `.context-index/specs/features/user-docs/workflow-guides.spec.md` — Status updated to `validated`
- `.context-index/specs/features/user-docs/charter.md` — Four workflow guide capabilities updated to `validated`
