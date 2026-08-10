# Architecture Review: single-front-door

> **Date:** 2026-07-01
> **Spec:** .context-index/specs/cross-cutting/single-front-door.spec.md
> **Charter:** (cross-cutting — no parent charter)
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | inline (quick) | reviewer-reasoning | plugin:review-specs/defaults |
| security-reviewer | Security Reviewer | inline (quick) | reviewer-capable | plugin:review-specs/defaults |
| consistency-analyzer | Consistency Analyzer | inline (quick) | reviewer-fast | plugin:review-specs/defaults |

> Note: run as a quick inline review (not parallel subagents) at the user's request. The spec documents already-implemented, tested, green behavior (PR #199).

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1 (warning):** No automated test guards the documented contract. The skill-kind template's default acceptance criterion "Tests cover new invocation paths and failure modes" is not satisfied — the front-door behavior lives entirely in SKILL.md prose. Drift risk: a future edit could shrink the 26-route table, drop a "Next Step in the Lifecycle" footer, or re-flatten the gateway tiers with nothing failing. **Recommendation:** add a lightweight guard test asserting (a) `skills/work/SKILL.md` classification table references every skill slug under `skills/`, (b) each spine skill contains a `## Next Step in the Lifecycle` section, and (c) `build`/`validate` do **not** (terminal-token safety). Low cost, high drift protection.
- Behavioral contract, Output Contract, and Module Impact Map are otherwise complete and internally consistent. Feasibility is proven (implemented + green).

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- **SEC-1 (suggestion):** The front door deliberately lowers friction to reach lifecycle skills. The spec should state explicitly that reduced friction and the advisory rigor lane MUST NOT weaken hard gates — the non-main-branch stop in `/adev:implement`, destructive-action gates, and constitution checks remain in force regardless of lane. Currently implied ("keep the full arc for high blast-radius"), not stated as an invariant. No credential/input-handling surface is introduced; no blocker.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1 (warning):** Potential conflict with `lifecycle-gate.spec.md`. Conductor Mode's rigor lane offers to "skip optional gates (`review-specs`, `eval`) and route straight to implement + a fast validate." Under the default strict `lifecycle.gate_mode`, the `review` step is a **hard** prerequisite for `plan`/`implement` — skipping `/adev:review-specs` would make `adev gate require` exit 2 downstream, so the "express" path would stall rather than run fast. **Recommendation:** clarify in the spec that lane selection cannot bypass gates that are hard-required under strict mode — i.e., the express lane presupposes `gate_mode: advisory` for that work item, or narrows "skip" to genuinely optional steps (`eval`, `route`) while keeping `review-specs` when strict. This reconciles the front-door contract with the gate-chain contract.
- `affects:` slugs, cross-cutting placement, and constitution references are consistent with sibling specs (`model-routing`, `meta-tools`, `review-block-auto-retry`).

---

## Summary

**Total findings:** 3 (0 blockers, 2 warnings, 1 suggestion)
**Action required:** None blocking. The spec is ready for planning. Consider addressing CON-1 (reconcile the express-lane advisory with strict gate_mode) and SA-1 (add a drift-guard test) before or during implementation follow-ups; SEC-1 is a one-line invariant to add.

last-reviewed-revision: 1
file-sha: 94139ec02eaebad53005921e34817143396d0a77841ebf99c0cb32a82c991c37
