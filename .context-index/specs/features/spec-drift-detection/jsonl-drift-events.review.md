# Architecture Review: jsonl-drift-events (rev 2)

> **Date:** 2026-05-18
> **Spec:** .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
> **Charter:** .context-index/specs/features/spec-drift-detection/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2
> **file-sha:** e883ef64798ae689dbc0b875b7bf5f7cc4d39983af619e807cb3ffcb8e808af6

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS

All rev 1 findings (SA-1, SA-2, SA-3) resolved. Behavior 3b explicitly establishes the `/adev:implement`-only-clears authority rule (SA-2). Behavior 5 documents the legacy-null operator guidance (SA-1). Step 4 enumerates three idempotency states (SA-3). New invariants (path canonicalization, JSON serialization, authority rule) are well-placed with matching error cases and acceptance criteria. Constitution principles 1-5 verified compliant. Module boundaries clean (delegation to `lib/lifecycle-state.mjs::appendEvent` reuses existing machinery). API signatures preserved. Migration Step 0 correctly ordered as prerequisite.

No findings.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

All four rev 1 security findings (SEC-1, SEC-2, SEC-3, SEC-4) resolved with explicit invariants, error cases, and acceptance criteria. Two optional pre-implementation notes (suggestions, non-blocking):

### SEC-5: `--dry-run` mode test coverage

- **Severity:** suggestion
- **Category:** input-validation
- **Finding:** Step 4 specifies `--dry-run` mode but does not explicitly assert that dry-run is side-effect-free in the acceptance criteria.
- **Recommendation:** Add a test in implementation phase that verifies dry-run produces the expected report without mutating any spec or JSONL.

### SEC-6: Per-spec lock-scope verification

- **Severity:** suggestion
- **Category:** rate-limiting
- **Finding:** Invariants 8/9 and error cases reference `lib/lifecycle-state.mjs::withLock(specPath, ...)` lock-protected appends. The spec assumes per-spec lock granularity (not global), so concurrent stamps on different specs do not block each other.
- **Recommendation:** Confirm in plan-phase that `withLock` (or equivalent) is per-spec-scoped; add a test asserting concurrent stamps on two different specs proceed in parallel.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

CON-4 (blocker from rev 1) resolved by explicit Migration Step 0 that registers `code_drift_detected` and `code_drift_cleared` in the canonical event-variant table of `lifecycle-event-log.spec.md` BEFORE Step 1 emits events. Acceptable resolution path (sequencing makes it a load-bearing migration step, not a deferred prerequisite).

CON-1 resolved: event names renamed to `code_drift_detected`/`code_drift_cleared` (domain-prefixed). CON-2 resolved: payload fields renamed to `drift_source`/`drift_at`. CON-3 resolved: explicit "REMOVE row from Deferred (no tombstone)" directive in Step 5 + acceptance criterion 5. CON-5 resolved: <100ms read-path performance criterion in Quality Attributes + acceptance criterion.

Minor non-finding observations (not flagged):
- Invariants section uses checklist format with the new path-canonicalization / JSON-serialization / authority-rule items embedded; numbering is implicit. Optional cleanup in a future rev for explicit numbering.
- Quality Attributes row headers mix attribute names with parenthesized issue IDs (`Read-path performance (CON-5)`) — acceptable for traceability.

No findings.

---

## Summary

**Total findings:** 2 (0 blockers, 0 warnings, 2 suggestions)

**Action required:** None to proceed. The two security suggestions (SEC-5 dry-run side-effect-free test, SEC-6 per-spec lock-scope verification) should be folded into plan-phase test scope but do not block planning.

**Verdict:** PASS_WITH_NOTES — proceed to `/adev:plan --spec .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md`.

### Rev 2 changes summary

Resolved from rev 1:
- **CON-4 (blocker)** → Migration Step 0 adds canonical events to `lifecycle-event-log.spec.md`
- **SA-2 (warning)** → Behavior 3b + Invariant: only `/adev:implement` clears drift
- **SEC-1 (warning)** → Invariant + Step 1/4 path canonicalization + `PATH_TRAVERSAL_REJECTED` error code
- **SEC-2 (warning)** → Invariant: `JSON.stringify` discipline
- **CON-1 (warning)** → Event names prefixed `code_*`
- **CON-3 (warning)** → Explicit "REMOVE Deferred row, no tombstone" directive
- **SA-1, SA-3, SEC-3, SEC-4, CON-2, CON-5 (suggestions)** → All folded in

New findings in rev 2:
- **SEC-5, SEC-6 (suggestions)** → Fold into plan-phase test scope
