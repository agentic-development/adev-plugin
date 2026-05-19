---
spec: .context-index/specs/features/session-awareness/post-commit-self-skip.spec.md
charter: .context-index/specs/features/session-awareness/charter.md
date: 2026-05-18
verdict: PASS_WITH_NOTES
last-reviewed-revision: 1
file-sha: b91b64694b398aef5b391c76a26a0a16abcbf878ed621d4e2c019ee2b2731732
---

# Architecture Review: post-commit-self-skip

> **Date:** 2026-05-18
> **Spec:** `.context-index/specs/features/session-awareness/post-commit-self-skip.spec.md`
> **Charter:** `.context-index/specs/features/session-awareness/charter.md`
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS

No findings.

The spec defines a single, well-contained behavior: a 6-case guard in `.githooks/post-commit` driven by one `git diff-tree` call and an exact prefix match (`.context-index/sessions/`). Module Impact Map names exactly one production file and one new test file. All decision points (happy path, prefix-collision, fail-open, empty-result) are enumerated in Behaviors and Error Cases. No new dependencies, no cross-module coupling, no constitutional or ADR conflict. The spec is structurally sound and ready for planning.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

No findings.

This is a local git hook with no auth, network, or PII surface. The guard reads only `git diff-tree` output, performs a bash prefix match (glob-safe within `[[ ... == prefix/* ]]`), and emits a fixed-text stderr diagnostic with no commit metadata or paths. Fail-open posture is appropriate here because the alternative (silently dropping capture) is the failure mode the spec exists to prevent.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

### CON-1 — suggestion — contract

- **This spec says:** Postconditions describe what is written or not written under `.context-index/sessions/`, but are silent on `.context-index/.session-tracking.jsonl`.
- **Conflicts with:** The existing `.githooks/post-commit` (lines 102-106) clears `.session-tracking.jsonl` *as a side effect of the writeSummary path*. On the skip path the JSONL is therefore not truncated, which is correct behavior (no substantive commit recorded => no session-state reset) but is not stated in the spec's invariants or postconditions. `session-log-schema.spec.md` documents the JSONL append-only contract but does not cover truncation policy.
- **Recommendation:** Add one line to Postconditions: "On the skip path, `.context-index/.session-tracking.jsonl` is NOT truncated; tool-call records continue to accumulate until the next non-session commit writes a capture and resets the JSONL." This documents the existing inherited behavior so `/adev:plan` task decomposition and `/adev:write-test` cases cover it explicitly. Non-blocking — the intended behavior is already correct.

---

## Summary

**Total findings:** 1 (0 blockers, 0 warnings, 1 suggestion)
**Action required:** Optional — the suggestion can be folded into the spec or addressed during planning; no rework required to unblock `/adev:plan`.
