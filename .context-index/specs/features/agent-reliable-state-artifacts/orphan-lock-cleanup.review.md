<!-- Architecture review artifact (rendered from lifecycle log).
     Downstream skills MUST NOT parse this file for verdict — read state.steps.review
     from `lib/lifecycle-state.mjs::currentState()` instead. -->

---
last-reviewed-revision: 1
file-sha: 189f6eaf4b8d13ea657feb81e249e0349c674e965f119b41b6952ebaa2fab6b0
---

# Architecture Review: orphan-lock-cleanup

> **Date:** 2026-05-18
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/orphan-lock-cleanup.spec.md
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer    | Security Reviewer    | subagent | reviewer-capable   | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast      | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1 (warning)** — Behaviors #1, #6 + Postconditions. The `statSync` ENOENT race (Behavior #6) and the orphan-recovery branch (Behavior #2) both produce "retry openSync exactly once" but the spec does not specify how they interact with Invariant #2 ("one recovery per acquire attempt"). If Behavior #6's natural-release retry itself encounters EEXIST because a fresh writer raced in, can orphan recovery be invoked, or must the helper bubble STALE_BOARD_WRITE_RETRY? Recommendation: add an explicit clause stating that Behavior #6's retry is a separate path; an ENOENT-on-stat retry that itself hits EEXIST falls through to STALE_BOARD_WRITE_RETRY without re-entering orphan recovery (or, conversely, that it MAY re-enter — pick one).
- **SA-2 (warning)** — Module Impact Map + Acceptance Criteria. The Module Impact Map says `lib/manifest.mjs` "Add `cas_lock_stale_seconds` validation at load time", but `lib/manifest.mjs` is currently a thin YAML loader with no schema-validation surface (lines 45–62). The adjacent sibling spec `concurrent-write-protection.spec.md` resolves the parallel `cas_max_retries` knob via a regex scrape inside the `JsonAdapter` constructor (see `lib/issues/json-adapter.mjs` lines 219–228), not via a central validator. Recommendation: pick one approach explicitly. The regex-in-constructor pattern is the precedent and avoids introducing a new validation surface; whatever is chosen, update both the Module Impact Map row and Behavior #7 to be unambiguous.
- **SA-3 (suggestion)** — Behavior #6. The phrase "it consumes no recovery slot" introduces the concept of a "recovery slot" that does not otherwise exist in the spec; the only constraint is Invariant #2 ("one recovery per acquire attempt"). Recommendation: rephrase as "this is the lock-naturally-released race; it is not orphan recovery and does not count against Invariant #2."

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- **SEC-1 (warning)** — Category: data-exposure. Behavior #3 + Postconditions. The stderr warning template `[adev] recovered orphaned tasks.json.lock (age: <N>s, threshold: <M>s)` is safe if implemented verbatim, but the spec does not explicitly forbid interpolating the absolute `lockPath`. If future implementation drift expands to `recovered orphaned <lockPath>`, the absolute filesystem path under `.context-index/` would land in CI logs and operator terminals. Recommendation: add an acceptance criterion: "The warning message uses the literal string `tasks.json.lock`; the absolute `lockPath` MUST NOT appear in the message."
- **SEC-2 (warning)** — Category: input-validation. Behavior #7 + Error Cases row 6. The spec rejects "non-integer or `< 5`" but leaves ambiguous what happens for strings, null, booleans, arrays, or numbers like `30.5`. The "unset" branch (silently default to 30) is path-sensitive — a malformed value should NOT silently fall through to the default. Recommendation: clarify Behavior #7 to explicitly say "anything that is not a JavaScript integer `>= 5` (strings, null, booleans, arrays, floats, `NaN`) is rejected with `INVALID_CAS_LOCK_STALE_SECONDS`; only absence of the key triggers default fallback."
- **SEC-3 (suggestion)** — Category: input-validation. Behavior #2 + Postconditions. The orphan recovery branch invokes `unlinkSync(lockPath)`. The current `lockPath` (`this.filePath + ".lock"`) is already path-contained by the SEC-2 defenses in `json-issue-board-adapter.spec.md`. Recommendation: add an invariant explicitly preserving this: "Orphan recovery operates on the same `lockPath` value already used by the existing acquire path; no new path-derivation logic is introduced."

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1 (warning)** — Category: naming. Behaviors / Error Cases. The sibling spec `concurrent-write-protection.spec.md` lines 12–15 explicitly notes "Error codes renamed to follow the subject-first BOARD_* convention" (revision 2). This spec introduces `ORPHAN_LOCK_UNLINK_FAILED` and `INVALID_CAS_LOCK_STALE_SECONDS`, neither of which follows the BOARD_* convention. Conflicts with: `concurrent-write-protection.spec.md` lines 12–15 ("subject-first BOARD_* convention"). Recommendation: rename to `BOARD_ORPHAN_LOCK_UNLINK_FAILED` and either `BOARD_INVALID_LOCK_STALE_SECONDS` or `INVALID_BOARD_LOCK_STALE_SECONDS`, matching the sibling's taxonomy.
- **CON-2 (warning)** — Category: contract. Charter Capability Map vs. this spec. The parent charter (`agent-reliable-state-artifacts/charter.md`) Capability Map (lines 147–170) does not list orphan-lock recovery. The spec is correctly filed as `charter-extension: true` and notes "roll into charter rev 8 in a follow-up sweep" (line 11) — acceptable as a documented deferral, but the spec does not name the capability that the follow-up should add. Conflicts with: `agent-reliable-state-artifacts/charter.md` Capability Map. Recommendation: name the capability explicitly in the spec's lead comment (e.g., "Capability Map row to add in rev 8: 'Orphan-lock recovery for JSON CAS layer'") so the deferred sweep has a definitive entry to insert.
- **CON-3 (suggestion)** — Category: pattern. Acceptance Criteria + Module Impact Map. The sibling spec `concurrent-write-protection.spec.md` line 110 documents the manifest-knob pattern as "Export `MAX_CAS_RETRIES = 3` as the default. Add optional manifest knob `tasks.cas_max_retries`". This spec lacks the symmetric export for `cas_lock_stale_seconds`. Recommendation: add an Acceptance Criterion: "Export `DEFAULT_CAS_LOCK_STALE_SECONDS = 30` from `lib/issues/json-adapter.mjs` mirroring the existing `MAX_CAS_RETRIES` export pattern" — this aids testability (tests need to override the default without manifest munging) and matches the sibling's convention.
- **CON-4 (suggestion)** — Category: terminology. Spec frontmatter. ADR 0009 (`lifecycle-artifact-taxonomy.md`) § 3 mandates `kind:` on new artifacts authored after 2026-05-14. This spec is dated 2026-05-18 (post-cutover) but the frontmatter lacks `kind:`. The sibling `concurrent-write-protection.spec.md` correctly declares `kind: behavioral`. Conflicts with: `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md` § 3 "Validation posture: strict on write". Recommendation: add `kind: behavioral` to the frontmatter (matches the sibling and the spec's actual section shape: Preconditions / Invariants / Behaviors / Postconditions / Error Cases).

---

## Summary

**Total findings:** 10 (0 blockers, 6 warnings, 4 suggestions)
**Action required:** The spec is structurally sound and ready for planning. Recommended (non-blocking) follow-ups before `/adev:plan`: (a) decide manifest-validation surface (SA-2) and align Module Impact Map; (b) rename new error codes to the BOARD_* convention adopted by the sibling CAS spec (CON-1); (c) add `kind: behavioral` to frontmatter per ADR-0009 (CON-4). The remaining warnings are clarifications; the suggestions are alignment polish.

Cross-repo references: none present in `depends-on`; cross-repo validation skipped.
Approver role (informational, from `governance/gates.yaml`): none configured for `spec-to-plan`.
