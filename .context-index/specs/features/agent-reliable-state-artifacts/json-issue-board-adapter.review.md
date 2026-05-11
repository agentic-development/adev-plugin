# Architecture Review: json-issue-board-adapter

> **Date:** 2026-05-11 (round 2)
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Verdict:** PASS_WITH_NOTES

last-reviewed-revision: 3
file-sha: 20a74ee517e60e2dd6420d344f40078242b7fb48

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Round 1 → Round 3

- Revision 1 returned 2 blockers (CON-3, CON-5) + 8 warnings + 7 suggestions.
- Revision 2 fixed both blockers + cross-spec warnings; round 2 review surfaced 1 new blocker (CON-8) + 1 new warning (CON-9) + 5 minor suggestions.
- Revision 3 (this review) applied all round-2 fixes.

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

Round-1 warnings (SA-2, SA-3, SA-4) all resolved. Round-1 suggestions either resolved or carry-over. Round-2 surfaced 3 suggestions, applied in revision 3:

- SA-1 (open suggestion): temp-file naming convention not specified. Implementers inherit from `lib/build-state.mjs` exemplar. Non-blocking carryover.
- SA-8 (suggestion): duplicate legacy-read behavior bullets — accepted as documentation reinforcement.
- SA-9 (suggestion): stale `FileAdapter` reference in AC line 99 — **resolved in rev 3** (now references `lib/issues/markdown-parser.mjs`).
- SA-10 (suggestion): canonical deprecation message duplicated across sections — **resolved in rev 3** (Error Cases now cross-references the canonical message in the deprecation-semantics section).

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

All 4 prior findings (SEC-1, SEC-2, SEC-3, SEC-4) resolved by revision 2. Round 2 surfaced 3 suggestions:

- SEC-NEW-1 (from sibling reviewer, suggestion): `INVALID_BOARD_SHAPE` error message could embed dynamic content. Accept as low-risk in local-CLI threat model; future hardening if external log aggregation use case emerges.
- SEC-5 (suggestion): `INVALID_PROJECT_ROOT` includes resolved path — low risk in local-CLI context; accepted.
- SEC-6 (suggestion): orphan temp file cleanup deferred — **resolved in rev 3** (best-effort cleanup-on-failure now committed in Postconditions).

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

Round-1 blockers (CON-3, CON-5) resolved by rev 2. Round-1 warnings (CON-1, CON-2, CON-6, CON-7) either resolved by rev 2 or addressed in rev 3:

- CON-6 (warning): temp-file cleanup — **resolved in rev 3** (Postconditions now commit to best-effort `fs.unlinkSync` mirroring `lib/build-state.mjs`).

Round-2 surfaced:
- CON-8 (blocker): epic `plan_ref` vs issue `planRef`/`planTask` granularity scope unclear — **resolved in rev 3** (new "Granularity invariant scope" section makes explicit that the invariant applies to Issues only; epics may carry `plan_ref` without violation; Naming Conventions section now documents the three field-naming domains: issues, epics, events).
- CON-9 (warning): cross-reference to sibling spec's StateProjection convention — **resolved in rev 3** (Naming Conventions section now references the sibling spec for projection field names).

---

## Summary

**Total findings:** 0 blockers, 0 warnings, 4 suggestions (SA-1 carryover; SA-8 documentation; SEC-NEW-1 sibling-flagged; SEC-5 path disclosure).

**Status:** Ready for planning. `/adev:plan --spec json-issue-board-adapter.spec.md` may proceed. The 4 remaining suggestions are accepted as PASS_WITH_NOTES per the verdict — none are blocking, and the architectural contracts (interface parity, atomic writes, granularity invariant, path safety, file-backend deprecation) are all locked in.
