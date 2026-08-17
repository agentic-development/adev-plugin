---
rigor-tier: quick
last-reviewed-revision: 1
file-sha: 8d01d9847098b6903ef61289d1c250ba042e0e110c42ff45e87c9bdf6f8ba406
---

# Architecture Review: using-adev-help-surface

> **Date:** 2026-08-17
> **Spec:** .context-index/specs/features/setup/using-adev-help-surface.spec.md
> **Charter:** .context-index/specs/features/setup/charter.md
> **Verdict:** PASS

**Rigor tier:** `quick` (explicit `--tier quick` on invocation; consistent with the spec's `risk_level: low` frontmatter and this project's `risk-policies.yaml` `low.review_mode: quick`).

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Reviewer | subagent | reviewer-capable | plugin:review-specs/quick-synthesized-reviewer-prompt.md |

No reviewers disabled.

## Quick Synthesized Reviewer (quick-synthesized-reviewer)

**Verdict:** PASS

- `SA-1` **suggestion** — *Invocation Modes / Output Contract*: The spec has no explicit Preconditions/Postconditions subsections, unlike the sibling behavioral spec in this charter (`managed-gitignore-block.spec.md`), which states both explicitly. Postconditions are only implied via Output Contract bullets ("no file writes... no lifecycle events"); preconditions (e.g., `.context-index/` initialized, `docs/README.md` existing as the doc index) are never stated. Recommendation: add a short Preconditions note for parity with sibling specs in this charter.
- `SA-2` **suggestion** — *Failure Modes, row 3*: The row "'What should I do?' question is answered with a concrete routing decision instead of a conceptual explanation" is framed as a runtime Failure Mode with a User Recovery column, but its actual "recovery" ("Implementer corrects the SKILL.md prose") is a pre-ship authoring note, not something a user does at runtime. This duplicates Acceptance Criteria item 2. Recommendation: either drop this row (already covered by Acceptance Criteria) or move it to a "Non-Goals"/implementation note rather than the Failure Modes table.

Consistency check: cross-referenced against `.context-index/specs/features/setup/charter.md` — the charter's Key Behaviors section (revision 4, same date) already states this exact division of responsibility (docs-first fallback order, deferral to `/adev:work`, no-routing boundary), and the "Interactive onboarding & help Q&A" capability row is already present in the Capability Map. No contradiction with the constitution, ADRs, or `/adev:work`'s charter language.

Security check: pure prose/instruction change to an existing skill — no new code, CLI verb, secret handling, or external input parsing beyond conversational trigger-phrase matching. No trust-boundary or injection surface introduced.

Structural check: the ambiguity-resolution rule (skill-name present -> "how X works", else "what should I do") is well-defined. Failure modes for unknown skill names and doc-insufficient detail are both covered. The scope boundary against "Requires Human Approval: Adding new skills to the lifecycle order" is correctly and explicitly disclaimed as not applicable.

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated*
> verdict, computed from post-cap findings across all reviewers — PASS (zero
> warnings/blockers), PASS_WITH_NOTES (>=1 warning, zero blockers), BLOCK
> (>= `verdict_rules.blocker_threshold` blockers, default 1).

---

## Summary

**Total findings:** 2 (0 blockers, 0 warnings, 2 suggestions)
**Action required:** None. The spec is ready for planning; the two suggestions are optional polish for the author to consider before or during `/adev:plan`.

**Governance notes:** `adev governance reviewers --json` returned no errors for the materialized `review.yaml`. It surfaced three unrelated warnings about the `browser-review` profile (`BROADEN_TOOL` x2 for `playwright`/`web-fetch`, `BROADEN_NETWORK` deny→read-only) — informational only, not applicable to the reviewer dispatched for this quick-tier review. No `spec-to-plan` `approver_role` is configured in `.context-index/governance/gates.yaml` (the transition entry is present but commented out).
