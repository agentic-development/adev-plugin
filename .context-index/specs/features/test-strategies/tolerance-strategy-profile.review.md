# Architecture Review: tolerance-strategy-profile

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/test-strategies/tolerance-strategy-profile.spec.md`
> **Charter:** `.context-index/specs/features/test-strategies/charter.md`
> **Rigor tier:** full
> **Verdict:** BLOCK
> **last-reviewed-revision:** 1
> **file-sha:** 6bc5d8b122edb31e02841852005fdff8e088c6632d94aa873ef9f7d7dfe75937

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

> Domain: `software` (source: default). Reviewed as part of the four-spec
> revision-5 non-code strategy set.

## Structural Architect (structural-architect)

**Verdict:** BLOCK

- **SA-1** · blocker · `behaviors-6` · `structural-architect:contract:af76c143` — **Unsatisfiable cascade order.** Behavior 6 demands a position *after* `threshold` **and** *before* `fixture` in a fixed linear rule list where `fixture` (index 3) precedes `threshold` (index 6). No single insertion point satisfies both, and reordering shipped rules is expressly forbidden by this spec's own acceptance criterion that `threshold` detection stay unchanged. Restate as pattern-level exclusions.
- **SA-3** · blocker · `acceptance-criteria` · `structural-architect:contract:17676c8d` — **Required profile fields unspecified.** The spec asserts all 8 contract fields load without fallback but never specifies `seed_data_rule` or `permitted_tools`; `profiles.mjs` falls back to `unit` on an empty `permitted_tools` array.
- **SA-9** · warning · `behaviors-6` — `expectations/**`, `dq/**`, and `data_quality/**` are the directory conventions of Great Expectations and Soda Core, both listed as **`fixture`** typical tools in `registry.mjs` and `strategy-type-registry.spec.md`. The non-collision argument is made only against `threshold`; the real collision risk is with `fixture`, and the "before `fixture`" claim is the one that cannot be implemented (SA-1).
- **SA-5 / SA-6** · warning — Shared with the set: incomplete sibling-update list, and multi-path resolution in `detectTaskStrategy` is per-file, not global.
- **SA-10** · suggestion · `problem-and-motivation` — **The distinctness argument holds.** `threshold`'s preconditions (benchmark binary on `$PATH`, reachable target, warm-up) and all seven of its shipped gaming blockers are latency-specific and would have to be made conditional to absorb data bands; keeping them separate is correct. But "declared before, immutable, no post-hoc widening" is common to both and should be factored as a cross-strategy pattern rather than duplicated.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

- **SEC-1** · blocker · `behaviors-8` · `security-reviewer:secrets:ce6b6f19` — **Verbatim measurement command may embed credentials.** No env-var-only rule constrains the measurement command recorded in the handoff block.
- **SEC-5** · suggestion · `behaviors-8` — The band-declaration **file path** has no project-root containment check, unlike `evidence_ref`. Apply the same rule.
- **No issues found:** band immutability and the exact-metrics list are adequate as designed; no way found to abuse the band mechanism to make an unverified change appear verified beyond the credential path above.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-4 / CON-5 / CON-6** · warning/suggestion — Shared with the set: `manifest-schema-extension.spec.md` "one of the 8 types" is stale and unowned; the Module Impact Map's "count assertions" undercounts the 9-bearing ID arrays; the `cross-strategy-gaming-patterns` update instruction is copy-pasted and already satisfied.
- **CON-7** · suggestion · `behavioral-contract` — `reconciliation-strategy-profile.spec.md` Behavior 5 references this spec by name for tolerance smuggling; there is no reciprocal backlink. Add one for discoverability.

---

## Summary

**Total findings:** 9 (2 blockers, 4 warnings, 3 suggestions)
**Action required:** Revise to revision 2 addressing SA-1 and SA-3 (and SEC-1), then re-review. The core design question — whether `tolerance` should exist separately from `threshold` — was reviewed explicitly and answered **yes**; the blockers are about how detection precedence and profile fields are expressed, not about the strategy's existence.


---

# Round 2 — quick-tier re-review of revision 2 (2026-08-13)

> **Reviewer:** quick-synthesized-reviewer (all three lenses)
> **Verdict:** BLOCK → revised to **revision 3**

**Round-1 blocker partition, verified against shipped code:**

| Round-1 blocker | Bucket |
|---|---|
| SA-1 unsatisfiable cascade order | **addressed** — appending after the trailing `integration` rule is implementable; `models/**/*.sql` → `fixture`, `k6/**` → `threshold`, `migrations/` → `schema` all verified true in `detection.mjs` |
| SA-2 visual AC unachievable | **addressed** — the honest note now matches the code |
| SA-3 seed_data_rule / permitted_tools | **addressed** — `REQUIRED_FIELDS` counts empty arrays as missing (`profiles.mjs:194`), so non-empty defaults do fix it; no contradiction with `UNIT_PROFILE`, which never passes through that validation |
| SA-4 post-hoc-baseline substrate | **inadequately addressed** → SA-12 |
| SEC-1 credentials in recorded commands | **addressed** |
| SEC-2 unauthenticated operator_deferred | **persistent** → SEC-6 |
| CON-1 error-code collision | **addressed** (CON-2 and CON-3 also fixed) |

**Round-2 findings on this spec**

- **SA-13** · blocker · `behaviors-6` — Cascade ambiguity among the three new rules. **Fixed in revision 3:** `tolerance` is second of the three, ahead of `snapshot`, which is what makes `tolerances/x.baseline.json` resolve here.

**Status of revision 3:** finding closed by construction; not independently re-reviewed.
