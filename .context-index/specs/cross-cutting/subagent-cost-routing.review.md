# Architecture Review: subagent-cost-routing

> **Date:** 2026-04-26
> **Spec:** `.context-index/specs/cross-cutting/subagent-cost-routing.md`
> **Charter:** cross-cutting (no parent charter)
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 5
> **file-sha:** 0bada8faa9244999eaa95aa485c52cf53f950ea4

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

---

## Review History

This spec underwent two review passes (revision 3 → BLOCK, revision 4 → intermediate fixes, revision 5 → PASS_WITH_NOTES). Key blockers resolved:

- **SEC-1 (BLOCK):** Unvalidated model string from session files. **Resolved in revision 4** — Behavior 7a defines validation pattern, enforcement point (session-capture.sh), and one-time stderr advisory.
- **SA-B1 (downgraded from prior BLOCK):** Integration narrative ambiguity on session-capture.sh passthrough. **Resolved in revision 4** — Integration Point 4 now says "must include" with explicit code-change note; Module Impact Map updated.
- **CON-1 (downgraded from prior BLOCK):** Annotation format update target not specified. **Resolved in revision 4** — SKILL.md Step 2/4 referenced in Integration Point 2 and Module Impact Map.

---

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

**SA-W1 — RESOLVED (revision 4)**
- Multi-model delta attribution: Behavior 7 now has last-entry-wins documentation. Behavior 9 has matching advisory.

**SA-W2 — RESOLVED (revision 4)**
- Behavior 3 fallback chain: now specifies full three-step fallback (model_routing.default → role table → capable).

**SA-W3 — RESOLVED (revision 4)**
- Error-case acceptance criteria: four new criteria covering invalid tier, threshold out-of-range, unknown role fallback, model validation.

**SA-W4 — RESOLVED (revision 4)**
- `single-task-impl` parenthetical: replaced with explicit reference to Behavior 5.

**SA-W5 — RESOLVED (revision 5)**
- Empty-string validation case: merged into single validation-fail row in Error Cases table with advisory via Behavior 7a. No longer a separate silent path.

**SA-W6 — RESOLVED (revision 5)**
- Duplicate acceptance criterion for `auto_agent_fast_threshold` outside 1–5: removed.

**SA-S1 — suggestion (carried)**
- No forward-reference for `model_tiers` absent case. Cross-spec dependency on `model-routing.md` fallback behavior. Acceptable.

**SA-S4 — suggestion (carried)**
- "Dispatched By" column in Role-to-Tier Defaults table still absent. Deferred to post-implementation revision.

---

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

**SEC-1 — RESOLVED (revision 4/5)**
- Model string validation contract now complete: pattern `^[a-zA-Z0-9._:/-]{1,128}$`, enforcement point designated as `session-capture.sh`, one-time stderr advisory, cursor-file deduplication. Empty-string case covered by same path (revision 5). Blocker cleared.

**SEC-2 — RESOLVED (revision 5)**
- Routing score dimension validation: Behavior 4 now includes an explicit "Score validation" paragraph requiring integer validation of `novelty` and `pattern_coverage` in range 1–5 before threshold comparison. Fallback to `capable` with stderr advisory on invalid values. Error Cases table row added.

**SEC-3 — RESOLVED (revision 5)**
- Advisory surfacing: all advisory-emitting error cases now specify `stderr` as destination. Behavior 3 prose updated. Addresses both the model-validation path and the manifest config error paths.

**SEC-4 — RESOLVED (revision 5)**
- `null` and absent `cost_usd` treated equivalently: Error Cases table row confirms parity.

**SEC-6 — RESOLVED (revision 5)**
- Non-numeric/null `auto_agent_fast_threshold`: new Error Cases row added with stderr advisory and default fallback.

**SEC-5 — suggestion (carried)**
- `<hash>` in `~/.claude/projects/<hash>/` derivation not confirmed as platform-generated. Low priority; forward-reference acceptable given implementation is in `session-file-reader.mjs` which is already implemented.

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

**CON-1 — RESOLVED (revision 4)**
- `skills/route/SKILL.md` Step 2/4 referenced in both Module Impact Map and Integration Point 2.

**CON-2 — RESOLVED (revision 4)**
- Task added to Actionable Task Map for updating `token-cost-logging.md` Extended Schema Definition.

**CON-3 — RESOLVED (revision 4)**
- Task added to Actionable Task Map for `templates/manifest-template.yaml` scaffolding.

**CON-4 — RESOLVED (revision 4)**
- `fast_tier_threshold` renamed to `auto_agent_fast_threshold` throughout. Applied consistently in Behavior 4, Error Cases, Manifest Configuration Format, and Acceptance Criteria.

**CON-5 — RESOLVED (revision 4)**
- Annotation field `**Model Tier:**` now Title Case throughout. Explanatory note in Integration Point 2 confirms convention.

**CON-6 — RESOLVED (revision 4)**
- Behavior 10 advisory now uses `usage.model` consistently.

**CON-7 — RESOLVED (revision 5)**
- Behavior 4 decision table column header updated from `model_tier` to `Model Tier`.

**CON-8 — RESOLVED (revision 5)**
- Module Impact Map and Actionable Task Map task descriptions updated to use `**Model Tier:**` instead of `model_tier`.

---

## Summary

**Total findings across both review passes:** 20 original + 8 introduced during revision = 28 total
**Resolved before finalizing:** 27
**Remaining warnings:** 2 (suggestions only)

**Remaining suggestions (non-blocking):**
- SA-S4: "Dispatched By" column in Role-to-Tier Defaults table — deferred to post-implementation
- SEC-5: `<hash>` derivation confirmation — low priority, implementation already exists

**Action required:** None — spec is ready for planning.
Run `/adev:plan --spec .context-index/specs/cross-cutting/subagent-cost-routing.md` to proceed.
