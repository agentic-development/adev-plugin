---
spec: .context-index/specs/features/implementation/batched-task-dispatch.spec.md
charter: .context-index/specs/features/implementation/charter.md
date: 2026-08-18
verdict: PASS_WITH_NOTES
rigor-tier: quick
review-round: 1
last-reviewed-revision: 1
file-sha: 7e3716d961ce81db7066e877f52be304eb605f1607d0f85d60575dec1fec7ab4
---

# Architecture Review: batched-task-dispatch

> **Date:** 2026-08-18
> **Spec:** `.context-index/specs/features/implementation/batched-task-dispatch.spec.md`
> **Charter:** `.context-index/specs/features/implementation/charter.md`
> **Verdict:** PASS_WITH_NOTES
> **Rigor tier:** `quick` (explicit `--tier quick` override; `risk_level: high` in this spec's frontmatter would otherwise resolve `policies.high.review_mode: full` per `.context-index/governance/risk-policies.yaml`. This is a deliberate operator override, not an oversight, and is not second-guessed by this review.)
> **Revision reviewed:** 1 (round 1)

## Registry Warnings

| Code | Message |
|---|---|
| `BROADEN_TOOL` | Profile `browser-review`: `allow_add` broadens posture by adding mcp_server `playwright`. |
| `BROADEN_TOOL` | Profile `browser-review`: `allow_add` broadens posture by adding category `web-fetch`. |
| `BROADEN_NETWORK` | Profile `browser-review`: network broadened `deny` → `read-only`. |

Registry `errors`: none. Registry `notes`: none. `verdict_rules.blocker_threshold: 1`. These warnings originate from an unrelated reviewer profile (`browser-review`) and do not bear on this spec's content.

## Transition Gate Note

`.context-index/governance/gates.yaml` declares no `spec-to-plan` transition (the entry is commented out), so no `approver_role` applies to this gate. Informational only.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| `quick-synthesized-reviewer` | Quick Synthesized Review | subagent | `reviewer-capable` | `plugin:review-specs/quick-synthesized-reviewer-prompt.md` |

Per the `quick` rigor tier (`graduated-rigor-tiers.spec.md`), the three registry defaults (`structural-architect`, `security-reviewer`, `consistency-analyzer`) were **not** dispatched this round; the bundled synthesized-reviewer prompt covers all three lenses (structural, security, consistency) in one pass. The rendered context pack was the union of the `architecture`/`security`/`consistency` pack definitions (constitution, platform context, parent charter, sibling specs `review-provenance.spec.md` and `graduated-review-depth.spec.md`, `risk-policies.yaml`, `gates.yaml`, the directly-cited cross-cutting specs `incremental-artifact-writes.spec.md` and `graduated-rigor-tiers.spec.md`, and ADR-0018), delivered under a nonce-scoped fence. No profile-disallowed tool call was surfaced by the harness.

Heuristics for module `implementation` were injected (3 blocks, tier `summary`) — all concern token-cost measurement and none bore on the findings.

No reviewers are disabled.

## Quick Synthesized Review (quick-synthesized-reviewer)

**Verdict:** PASS_WITH_NOTES

No security-lens findings: the mechanism only reads local plan/manifest/routing artifacts already trusted by the existing skill, applies a fail-closed eligibility gate, and introduces no new external input, auth boundary, or credential handling.

**SA-1 — `warning`** — Location: Arguments table / Failure Modes table.
`implement.max_batch_size` gets explicit throw-on-malformed validation (`INVALID_MAX_BATCH_SIZE` on non-integer/non-finite/`<1`), but the per-run flag `--max-batch <n>` is described only as "Per-run override of `implement.max_batch_size`" with no stated validation contract. It is unspecified whether a malformed flag value goes through the same throw path, silently disables the cap, or falls back to the manifest default — and the cap is the one lever bounding compounding risk inside a batch.
*Recommendation:* add a Failure Modes row (or an Arguments-table note) stating `--max-batch` is validated through the same `INVALID_MAX_BATCH_SIZE` path before it can override the manifest value.

**CON-1 — `warning`** — Location: Output Contract C.2; System Constitution Reference ("Commit-per-task recovery contract").
The spec twice anchors the one-commit-per-task prohibition to "`incremental-artifact-writes.spec.md` Integration Point 2." That spec's "Integration Points" section is enumerated 1–6 by ecosystem-integration point (e.g., "2. `/adev:implement` ↔ this pattern"), not by a section titled or numbered as a standalone one-commit-per-task rule. The substantive invariant is genuinely present in that spec's Behaviors (Behavior 3: "one git commit per logical chunk … the commit IS the checkpoint"), so this reads as a citation-precision slip rather than a false claim.
*Recommendation:* re-point the citation to Behavior 3 (or re-verify against the current spec text) before this citation propagates into `/adev:specify --revise` tooling that treats section anchors as stable.

**CON-2 — `suggestion`** — Location: System Constitution Reference, "Requires Human Approval" bullet.
The spec discharges the constitutional boundary on default-on dispatch-shape change by asserting "The project owner authorized default-on... on 2026-08-17," with no ADR, issue, or commit reference — only spec prose recording the claim.
*Recommendation:* attach a durable pointer (ADR id, issue id, or commit sha) so `/adev:retro` and `/adev:hygiene` can trace this approval independently of this spec's text.

**SA-2 — `suggestion`** — Location: Frontmatter (`drift_detected: true`) vs. Output Contract A.
Frontmatter flags `drift_detected: true` but the body never states what drifted. Output Contract A relies on a specific line citation (`skills/plan/SKILL.md:472`) and a corpus stat ("153 of 165 existing plans") that are only valid if the source-manifest files match the spec's description — exactly the assumption `drift_detected` calls into question.
*Recommendation:* add a one-line drift note confirming the cited line/stat were re-checked against current source, or explain what the detected drift was.

---

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict in the header, computed from post-cap findings — PASS (zero warnings/blockers), PASS_WITH_NOTES (>=1 warning, zero blockers), BLOCK (>= `verdict_rules.blocker_threshold` blockers, default 1). No severity cap was applied: the finding set contained no `blocker`-severity entries, so nothing was clamped.

---

## Summary

**Total findings:** 4 (0 blockers, 2 warnings, 2 suggestions)

**Action required:** none blocking. The spec is ready for `/adev:plan`. Two warnings are worth landing before or during planning:

1. **SA-1** — state (or add a Failure Modes row for) `--max-batch`'s validation contract, mirroring `INVALID_MAX_BATCH_SIZE`.
2. **CON-1** — re-point the `incremental-artifact-writes.spec.md` "Integration Point 2" citation to the section that actually carries the one-commit-per-logical-chunk invariant (Behavior 3), or re-verify the anchor.

The two suggestions (durable pointer for the human-approval record; a drift note explaining `drift_detected: true`) are optional polish and do not block planning.
