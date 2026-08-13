# Architecture Review: reconciliation-strategy-profile

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/test-strategies/reconciliation-strategy-profile.spec.md`
> **Charter:** `.context-index/specs/features/test-strategies/charter.md`
> **Rigor tier:** full
> **Verdict:** BLOCK
> **last-reviewed-revision:** 1
> **file-sha:** 445303fde8d0d275a97ab98056df676f33dc796381d42a03e5b7e20098cf698b

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

- **SA-3** · blocker · `acceptance-criteria` · `structural-architect:contract:17676c8d` — **Required profile fields unspecified.** The spec asserts all 8 contract fields load without fallback but never specifies `seed_data_rule` or `permitted_tools`. `profiles.mjs` treats an empty `permitted_tools` array as a missing field and falls back to `unit`. The spec also states adev ships no tooling and the project supplies read commands, leaving `permitted_tools` undefined by construction.
- **SA-5** · warning · `charter-extension-note` — Sibling-update obligations stale/incomplete: `cross-strategy-gaming-patterns.spec.md` already says "any registered strategy type"; three count-assertion sites exist, not two; `docs/test-strategies.md`, `docs/concepts.md:104`, `strategy-profile-contract.spec.md` AC, `strategy-detection-heuristics.spec.md` Behavior 16, and the charter's own Strategy Type Registry capability row are all missed. `tests/evals/…:740` runs a profile-contract sweep over every registered strategy that the new profile must satisfy.
- **SA-6** · warning · `behaviors-6` — `detectTaskStrategy` iterates file paths in the outer loop, so "checked before `fixture`" holds only within a single path. For `["models/x.sql", "reconciliation/y.sql"]` the first *file* wins, not the higher-precedence rule. State multi-path resolution explicitly.
- **Noted (no finding):** this is the only one of the three new strategies whose declared cascade position (after `schema`, before `fixture`) is implementable against the shipped rule list as written.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

- **SEC-1** · blocker · `behaviors-9` · `security-reviewer:secrets:94aff010` — **Verbatim read commands may embed credentials.** The handoff block carries source and target read commands verbatim with no rule that credentials be referenced via named env vars, so an inline connection string lands in a committed artifact. Reconciliation is the highest-exposure case in this set: it names two live systems.
- **No issues found:** the tolerance-smuggling and one-sided-read gaming blockers are adequate as designed; no constitution violations (no drivers introduced).

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-3** · warning · `error-cases` — Error-code prefix `RECON_` breaks the convention that the prefix is the full `strategy_id` (`SNAPSHOT_`, `TOLERANCE_`, `THRESHOLD_`, `FIXTURE_`, `VISUAL_`, `INTEGRATION_` all match verbatim). Align to `RECONCILIATION_*` or document the abbreviation as intentional.
- **CON-4** · warning · `charter-extension-note` — `manifest-schema-extension.spec.md` Behavior 1 still hardcodes "one of the 8 types" and is in no sibling-update list.
- **CON-5** · warning · `module-impact-map` — "count assertions" undercounts the 9-bearing ID arrays and describe titles in `tests/evals/test-strategies/test-strategies.test.mjs`.
- **CON-8** · suggestion · `behaviors-8` — Behavior 8 names `infra_partial` for one-system-reachable, but the `RECON_DEFERRED_INFRA` row implies `infra_unavailable` without stating it in prose. Add the symmetric sentence.

---

## Summary

**Total findings:** 8 (2 blockers, 5 warnings, 1 suggestion)
**Action required:** Revise to revision 2 addressing SA-3 and SEC-1, then re-review. Structurally this spec is the soundest of the three profiles — its cascade position is implementable and its three-leg contract drew no structural objection.
