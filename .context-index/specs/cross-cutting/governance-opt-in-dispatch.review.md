---
last-reviewed-revision: 2
file-sha: dc5d3054a2978856b1bb79a78bcd5740511e7f4e00bbddad8567759d0b472ef7
---

# Architecture Review: governance-opt-in-dispatch

> **Date:** 2026-09-09
> **Spec:** .context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md
> **Charter:** (cross-cutting — affects setup, review, reviewer-domain-fit, validation; no single owning charter)
> **Verdict:** PASS_WITH_NOTES
> **Rigor tier:** full (resolved from default `risk_level: medium` → `policies.medium.review_mode: full`; no `risk_level` frontmatter declared on this cross-cutting spec)

This is revision 2 of this spec, re-reviewed fresh after a revision-1 BLOCK verdict (see prior `.review.md` history). All 7 findings from the revision-1 review (WR-1 through WR-5, BD-1, CON-2) were independently re-checked against this revision's text by the relevant reviewers below and confirmed addressed.

## Registry Warnings

`adev governance reviewers --json` reported the following warnings (unrelated to the dispatched reviewer set for this spec — they concern the `browser-review` profile, not any of the four reviewers below):

- `BROADEN_TOOL`: Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'.
- `BROADEN_TOOL`: Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'.
- `BROADEN_NETWORK`: Profile 'browser-review': network broadened 'deny' → 'read-only'.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |

`termination-reviewer` was not dispatched — triggered-mode, zero keyword matches (loop/retry/poll/polling/iterate/iteration/recurring/convergence/auto-retry) against the target spec text.

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk; still resolvable for any project whose materialized review.yaml already names it. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via adev extension install web-service) where it fits the artifact class. Prompt retained on disk. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

Context pack rendered was `base` only (constitution + platform context) — the reviewer's own tool access was used to independently verify sibling/cross-cutting/ADR claims beyond the rendered pack; it self-reported partial coverage (3 of 19 ADRs, 2 of ~35 cross-cutting/sibling specs, chosen by direct relevance).

**CON-1** — Severity: warning
Category: contract
This Spec: Behavioral Contract's premise — "`assertMaterialized` treats [an absent `review.yaml`] as a legitimate absent state" — and BEH-3's design rest on file-absence being a distinct, non-raising state.
Conflicts With: `.context-index/specs/cross-cutting/explicit-governance-registries.spec.md` (Migration Path Step 5 / Error Cases table) states the invariant more broadly — read literally it could be taken to include the absent-file case, though the actual code (`lib/governance/registry-marker.mjs::assertMaterialized`) deliberately carves out file-absence as a distinct legitimate state. The target spec is accurate to the implementation; the two specs' prose is not obviously reconcilable side by side.
Recommendation: Add a footnote in the Behavioral Contract citing this carve-out against `explicit-governance-registries.spec.md`'s Error Cases table so a future reader doesn't have to rediscover the code is the tiebreaker. Low urgency — does not block, since it accurately describes real behavior.

**CON-2** — Severity: suggestion
Category: domain-model
BEH-1/BEH-3 never state what `source:` value (if any) the newly-written entries carry — `explicit-governance-registries.spec.md`'s DDR-4 vocabulary (`bundled`/`project`/`domain:<slug>`/`extension:<name>`) feeds Hygiene Pass 19. Pre-existing gap (current Step 7c/7d scaffold writes don't set `source:` either), not introduced by this spec. Consider having Task 2/3 stamp `source:` while the write path is being touched anyway; not required for this spec's own acceptance criteria.

**CON-3** — Severity: suggestion
Category: terminology
"Standing warning" is coined fresh in this spec with no prior usage elsewhere in the corpus. No action needed — the spec's own Coverage Gaps section already flags the exact wording/placement as an open `/adev:plan`-time question.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES

All 11 referents checked (CLI verbs, functions, files, error codes, config keys) were independently verified against real repo content — file/line citations recorded by the reviewer for each. No referent was found missing, renamed, or behaviorally different from the spec's description.

**RI-4** — Severity: warning
Referent: `spliceRegistryEntries` / DDR-7 / "the same...mechanism `materialize.mjs` already applies to this class of file" (BEH-1)
Finding: The function and the "7 checks and 20 comment lines → three lines" incident are both real (confirmed in `governance-splice.mjs`'s own docstring), but `lib/governance/materialize.mjs` (`resolveRegistryName`) explicitly *refuses* `validate.yaml` with `MATERIALIZE_REGISTRY_EXEMPT` — it never touches that file. The actual existing caller applying `spliceRegistryEntries` to `validate.yaml` is `lib/extensions/content-install.mjs` (extension-install path), a different caller of the same shared function.
Recommendation: Reword BEH-1 to credit `content-install.mjs` as the existing caller precedent for `validate.yaml`, rather than `materialize.mjs`, to avoid implying `materialize.mjs`'s marker/materialize semantics extend to `validate.yaml`.

Remaining 10 findings (RI-1, RI-2, RI-3, RI-5 through RI-11) are all `suggestion`-severity confirmations with no corrective action needed — every citation checked out accurate against source.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

No blockers: every producer the spec introduces has a named consumer and a concrete trigger, either already live in the codebase or assigned to a specific task in the spec's own Task Map (Tasks 2-6, 9). Revision 2 closes the prior BLOCK-worthy write-only gap on BEH-6 (WR-1 in the revision-1 review) by naming a concrete consumer (Step 7 summary line) and trigger for the overlay's `warnings` return value.

**WR-4** — Severity: warning
Location: BEH-4, Task 4
Producer: `adev governance reviewers --json` zero-enabled-reviewer count.
Consumer: `skills/review-specs/SKILL.md` Step 3 (confirmed current text handles `errors`/`warnings`/`notes` but not yet a zero-enabled-count check — a real, not-yet-present addition this spec's Task 4 covers).
Finding: Wired via a named task, but no test exercises the SKILL.md prose actually printing the warning — only the underlying data computation (`enabled !== false` count) is testable directly.
Recommendation: Name what evidence (e.g., a fixture-driven assertion on the computed count, if not the prose itself) will demonstrate this path fired.

**WR-5** — Severity: warning
Location: BEH-5, Task 5
Same gap as WR-4, mirrored for `/adev:validate`'s zero-enabled-checks warning. Recommendation: same as WR-4.

**WR-6** — Severity: warning
Location: BEH-6, Task 6
Producer: `applyReviewTierOverlay`/`applyValidateTierOverlay`'s `warnings` return value (confirmed populated today, e.g. `RISK_TIER_OVERLAY_UNKNOWN_ID`).
Consumer: Step 7 summary line (planned, Task 6) — confirmed `skills/init/SKILL.md` Step 7c.0/7d.0 currently consume only `reviewers`/`checks`, not `warnings`; this revision names a concrete consumer and trigger, closing the revision-1 gap.
Finding: `tests/risk-tiers/tier-overlay-referential-integrity.test.mjs` (Task 9) verifies `warnings` *compute* correctly but not that Step 7's summary *prints* them.
Recommendation: State what confirms the summary line actually renders the overlay's warnings, not just that the function returns them correctly.

WR-1, WR-2, WR-3 (BEH-1, BEH-2, BEH-3 respectively) are `suggestion`-severity — fully wired, chain complete, only the cross-skill hand-off test (Task 9) is still planned rather than existing.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

The spec introduces no new trust-boundary crossings. Items 1 (path containment), 2 (subprocess interpolation), and 3 (input trust) are not applicable / already correctly addressed — no new untrusted-input surface, no subprocess changes, no new path resolution from untrusted input.

**BD-1** — Severity: warning
Checklist item: 6 (Destructive filesystem operations)
Location: BEH-1, Task 2
Finding: BEH-1 correctly commits to `spliceRegistryEntries` and explicitly rejects a generic reserialize, citing the real precedent incident (verified against `governance-splice.mjs`'s own docstring and `materialize.mjs`'s DDR-7 application of the same pattern). Gap: the spec never states `spliceRegistryEntries`'s failure mode if it throws mid-write on a malformed existing `validate.yaml` — unlike `applyExecPayload`'s single-file rmSync+copyFileSync (no partial-state window), a text splice has more surface for an unstated failure mode.
Recommendation: Add one line to BEH-1 or Task 2 confirming the failure mode is "throw before write, file untouched" (consistent with a pure text-in/text-out design), so implementers don't have to infer it.

**BD-2** — Severity: suggestion
Checklist item: 4 (Privilege posture)
The selection surface pulls from trusted, plugin-shipped content (`templates/domains/*/reviewers.yaml`, `extensions/*/domain/*.yaml`), not adversarial extension input, so `exec-consent.mjs`'s per-install consent model correctly does not apply — worth stating explicitly since "reviewer/check selection" superficially resembles a consent flow.

**BD-3** — Severity: suggestion
Checklist item: 5 (Artifact leakage)
BEH-2/BEH-3's explicit `checks: []`/`reviewers: []` writes are a clean, deliberate persisted-artifact design — no gap found.

---

## Summary

**Total findings:** 23 (0 blockers, 6 warnings, 17 suggestions)
**Action required:** No blockers — the spec is ready for `/adev:plan`. All 6 warnings are worth folding into a follow-up spec touch-up before or during planning, though none block progression: CON-1 (reconcile absent-file-state phrasing against `explicit-governance-registries.spec.md`), RI-4 (correct the `materialize.mjs` → `content-install.mjs` attribution in BEH-1), WR-4/WR-5/WR-6 (name what test evidence demonstrates the BEH-4/5/6 warnings actually print, not just that their underlying data computes correctly), and BD-1 (state `spliceRegistryEntries`'s failure mode on a mid-write throw).
