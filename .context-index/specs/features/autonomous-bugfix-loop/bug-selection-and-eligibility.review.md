---
last-reviewed-revision: 6
file-sha: b5a17a2dc26d41b9cbfa6fcd06a394f12c6a6890ec571c878bda6110ad07f1b4
---

# Architecture Review: bug-selection-and-eligibility (round 6)

> **Date:** 2026-08-19
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Verdict:** PASS_WITH_NOTES
> **Rigor tier:** full
> **Note:** Revision 6 was written to close round 5's sole blocker, RI-1 (a Preconditions bullet mis-cited `.context-index/specs/features/heuristics/store-and-helper.spec.md` for a "Scope Derivation Rule" that does not exist there, and mischaracterized even the correct precedent as supporting BEH-11's fail-closed design when it is actually permissive). The revision corrects the citation to point at `validate-extraction.spec.md` (Check 12) and `recover-extraction.spec.md` (Step 7) — the files that actually define the Scope Derivation Rule — and drops the false "mirrors existing prior art / not a novel mechanism" framing, replacing it with an explicit statement that BEH-11 deliberately diverges from that (permissive, fallback-to-`_global`) precedent because it gates autonomous action rather than tagging a stored artifact. **The Referent Integrity Reviewer independently re-verified RI-1 this round and confirms it is genuinely fixed** — both cited files and sections exist, and the permissive/fail-closed contrast is now accurately described. No blocker was found this round. Two new non-blocking warnings (RI-1/RI-2, renumbered within this round) and a suggestion (RI-3) were raised by the Referent Integrity Reviewer as unrelated observations; four warnings and a suggestion carried over from round 5 (WR-1–WR-5) as expected, unimplemented-verb wiring gaps.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | plugin:review-specs/termination-reviewer-prompt.md |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk; still resolvable for any project whose materialized review.yaml already names it. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via `adev extension install web-service`) where it fits the artifact class. Prompt retained on disk. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

Zero findings. Verified charter-revision alignment (`task-management/charter.md` revision 8's `affected_modules` field), sibling-spec dependency citations (`per-issue-attempt-cap.spec.md`'s three-verdict set), domain-model consistency across both backends, the P0–P4 mapping, the `UNSUPPORTED_TYPE`/`INVALID_TYPE` disambiguation, constitution compliance, and completed-work claims (beads round-trip, `set-modules` CLI verb, cited tests) all against the actual worktree state. Explicitly re-checked item 6 (Cross-Cutting Spec Compliance): confirmed the revision-6 citation to the heuristics module's Scope Derivation Rule (`validate-extraction.spec.md` Check 12 / `recover-extraction.spec.md` Step 7) is accurate, and that the spec correctly frames BEH-11's fail-closed posture as an intentional divergence from that permissive precedent rather than a claimed match. No naming, pattern, contract, domain-model, or terminology drift found.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES

**Round-5 blocker (RI-1) re-verification: CONFIRMED FIXED**, independently re-checked (not by re-reading the prior round's conclusion): both `.context-index/specs/features/heuristics/validate-extraction.spec.md` (Scope Derivation Rule heading, Check 12, and the Error Case row confirming the `_global`-fallback/permissive disposition) and `.context-index/specs/features/heuristics/recover-extraction.spec.md` (Scope Derivation Rule heading, Step 7, manifest `modules[].slug` check, `_global` fallback) exist exactly where the revised bullet cites them, and both are accurately described. The revised bullet's framing — that BEH-11 deliberately diverges from this permissive precedent rather than mirroring it — is accurate on inspection. No blocker remains on this referent.

Other previously-verified referents (`getIssueManager`, `lib/issues/json-adapter.mjs` merge, `lib/issues/beads-adapter.mjs` `CONTEXT_FIELDS`/`_toIssue()`, `lib/cli/issues-set-modules.mjs`, the `set-modules`/beads-adapter test suites, `INVALID_TYPE` collision, `task-management/charter.md` revision 8, `per-issue-attempt-cap.spec.md` BEH-4, `assertSafeScalar`/`exec-payload.mjs`, `tasks.claim_ttl_minutes`, and the still-absent `lib/cli/issues-next.mjs`) were all re-checked and check out.

- **RI-1** (warning, new this round, unrelated to the round-5 blocker of the same numeral) — The Preconditions "v1 producer" bullet and the checked Acceptance Criterion both describe `set-modules` as "exercised end-to-end (both backends, through the real CLI dispatch path)" in `tests/issues/set-modules.test.mjs` and `tests/issues/beads-adapter.test.mjs`. On inspection, `set-modules.test.mjs` explicitly scopes itself to the JSON backend via real CLI dispatch, while `beads-adapter.test.mjs` exercises the beads write path at the adapter level (`update()`/`_toIssue()`), not through CLI dispatch or `IssueManager.get()`/`list()`. The underlying capability is genuinely covered on both backends — this is a description-accuracy gap, not a missing referent. Recommend rewording to state the CLI-dispatch coverage is JSON-only and the beads coverage is adapter-level.
- **RI-2** (warning) — `getIssueManager(manifest)` (`lib/issues/registry.mjs`) silently defaults to the `json` backend with a warning when `tasks.backend` is unconfigured, rather than throwing. The spec does not claim otherwise, but an implementer wiring the `ISSUE_BOARD_NOT_CONFIGURED` error case through `getIssueManager` alone would never reach it — the verb must check `manifest.tasks.backend` explicitly before calling `getIssueManager()`. Also notes `"file"` is a third supported-but-deprecated backend the "json or beads" phrasing omits.
- **RI-3** (suggestion) — The claim that the heuristics Scope Derivation Rule is "the codebase's only other `modules[].slug` membership check" is slightly broad: `lib/cli/test-policy.mjs` and `lib/lifecycle-gate-helpers.mjs` also perform `modules[].slug` lookups (for config resolution, not gating). Recommend narrowing to "the only other such check in a *gating* path."

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

- **WR-1** (warning, carried over from round 5): `adev issues next` (BEH-1–BEH-11) still has no producer — `lib/cli/issues-next.mjs` does not exist, so its join with `/adev:bugfix-loop`'s per-turn call sequence is named but untested. Expected; Task Map/Acceptance Criteria correctly leave this unchecked.
- **WR-2** (warning, new framing this round): `adev issues set-modules`'s write side and `adev issues next`'s read side (BEH-6/7/10/11) are each unit-tested in isolation; no cited test calls `set-modules` and then `adev issues next` to confirm a tagged bug's candidacy actually changes. Expected pending BEH-11's implementation.
- **WR-3** (warning, carried over from round 5's WR-3): `tasks.bugfix_loop.excluded_modules` manifest key has no producer or consumer anywhere in the codebase yet, and the Tests row does not clearly distinguish a manifest-configured additive entry from the four hardcoded reserved tags. Expected, self-referenced planned work.
- **WR-4** (warning, carried over from round 5's WR-4, reframed): The three Error Cases codes (`ISSUE_BOARD_NOT_CONFIGURED`, `UNSUPPORTED_TYPE`, `INVALID_PRIORITY_BOUND`) have a plausible but not code-level-named consumer in `bugfix-loop-skill.spec.md`'s Failure Modes. Expected pending both verbs' implementation.
- **WR-5** (suggestion, no finding — fully wired): BEH-6/BEH-7's reserved-tag safety list and exclusion logic are self-contained and re-checked as sound; no gap.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS

Re-checked all six checklist items fresh this round. Path containment, subprocess interpolation, and destructive filesystem operations remain not applicable (no new mechanism introduced). Input trust (BEH-11's refuse-don't-coerce posture) and privilege posture (per-invocation re-validation, no cached consent) remain sound. Artifact leakage: confirmed both backend adapters use full-object `JSON.stringify`/`JSON.parse` reserialization for `agent_context.adev` (beads) and the JSON store, not a raw-text splice, so the disclosed unvalidated-write-then-validated-read design does not share the structural-corruption failure mode the checklist item targets. Re-confirmed BD-1 (round-4's resolved blocker) stays resolved and that revision 6's only change — the Preconditions citation/framing fix — introduces no new mechanism, path, subprocess, write target, or persistence behavior, so it does not alter any item's disposition. Zero findings.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS

Zero findings, re-confirmed fresh this round. This spec remains a single-invocation, read-only selection query with no loop, retry, or polling construct introduced. The `AttemptRecord.last_verdict` consult (BEH-5) reads state produced by the sibling `per-issue-attempt-cap` spec's own retry machinery, which this spec neither owns nor introduces.

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated*
> verdict in the header above, computed from post-cap findings across all
> reviewers — PASS (zero warnings/blockers), PASS_WITH_NOTES (>=1 warning,
> zero blockers), BLOCK (>= `verdict_rules.blocker_threshold` blockers,
> default 1). See `configurable-reviewers.spec.md` behaviors 37-38. An
> individual reviewer signals a blocker by emitting FAIL with a
> blocker-severity finding, which is what the `reportReviewer` snippet in
> Step 6a records.

---

## Summary

**Total findings:** 8 (0 blockers, 6 warnings, 2 suggestions)
**Action required:** None to unblock. Round 5's sole blocker (RI-1: mis-cited/mischaracterized heuristics precedent) is confirmed genuinely resolved by revision 6's corrected citation and framing. This round's warnings (RI-1/RI-2 new, WR-1–WR-4 carried over) and suggestions (RI-3, WR-5) all concern the still-unimplemented `adev issues next`/`issues-set-modules` verb-pair's untested joins and two description-accuracy nits — expected at this stage, tracked for the implementation and testing steps, and none block `/adev:plan`. The spec is ready to proceed to planning.
