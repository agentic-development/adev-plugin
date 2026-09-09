---
last-reviewed-revision: 1
file-sha: b64228fdbdab5168fd37b0fdf469df0978d84ded7d4a175799736476bf0eb837
---

# Architecture Review: risk-tier-bundles

> **Date:** 2026-09-07
> **Spec:** .context-index/specs/features/setup/risk-tier-bundles.spec.md
> **Charter:** .context-index/specs/features/setup/charter.md
> **Verdict:** PASS_WITH_NOTES
> **Rigor tier:** quick (resolved from `risk_level: low` → `policies.low.review_mode: quick`)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Reviewer | subagent | reviewer-capable | plugin:review-specs/quick-synthesized-reviewer-prompt.md |

## Quick Synthesized Reviewer (quick-synthesized-reviewer)

**Verdict:** PASS_WITH_NOTES

**CON-1** — Severity: **warning**
Location: Frontmatter / System Constitution Reference section
Finding: This spec adds a wholly new capability ("Risk Tier Bundles") to the `setup` charter's scope, but the charter's Capability Map (`.context-index/specs/features/setup/charter.md`) has no corresponding row, and unlike the sibling `managed-gitignore-block.spec.md` — which introduces a comparably charter-extending capability and explicitly flags this with `charter-extension: true` frontmatter plus an HTML comment noting "The charter's next revision should add a Capability Map row" — this spec's frontmatter omits `charter-extension: true` and carries no equivalent flag. This breaks the established in-repo convention for how charter-extending Live Specs self-identify.
Recommendation: Add `charter-extension: true` to the frontmatter and a comment noting the charter's Capability Map needs a "Risk Tier Bundles" row on its next revision, matching the gitignore spec's pattern.

**SA-1** — Severity: suggestion
Location: Error Cases table, last row (⚠ UNHANDLED)
Finding: The spec correctly self-flags that Diagnostic Mode's governance line doesn't verify materialized `review.yaml`/`validate.yaml` actually reflect the manifest's `risk_tier`. This is already documented as a known gap rather than a silent omission, so no correction is required — noting it only because it's the one genuine drift-risk surface in an otherwise tightly-scoped extraction.
Recommendation: None required now; worth tracking alongside the deferred re-adoption path (`adev-plugin-j7pq.5.2`).

---

## Summary

**Total findings:** 2 (0 blockers, 1 warning, 1 suggestion)
**Action required:** Add `charter-extension: true` to the spec frontmatter and a "Risk Tier Bundles" row to the setup charter's Capability Map (CON-1), matching the `managed-gitignore-block.spec.md` precedent. Not a hard blocker — you may proceed to `/adev:plan` or address the warning first.
