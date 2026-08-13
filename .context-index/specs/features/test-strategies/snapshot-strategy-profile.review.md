# Architecture Review: snapshot-strategy-profile

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/test-strategies/snapshot-strategy-profile.spec.md`
> **Charter:** `.context-index/specs/features/test-strategies/charter.md`
> **Rigor tier:** full
> **Verdict:** BLOCK
> **last-reviewed-revision:** 1
> **file-sha:** afcea9e676a5b6b4607ed0b73928062a2a17e1fb43fbc1cbc47efcf24699297b

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

> Domain: `software` (source: default). Reviewed as part of a four-spec set — the
> revision-5 non-code strategy family — so cross-spec findings appear in more
> than one report.

## Structural Architect (structural-architect)

**Verdict:** BLOCK

- **SA-1** · blocker · `behaviors-7` · `structural-architect:contract:95f77210` — **Unsatisfiable cascade order.** `detectTaskStrategy` is a fixed linear rule list (schema → policy → fixture → contract → visual → threshold → integration). Behavior 7 demands a position *after* `visual` **and** *before* `fixture`; no single insertion point satisfies both without reordering shipped rules, which the spec does not authorize. Restate precedence as pattern-level exclusions (which the spec already has) and drop the ordering claims that cannot be honoured.
- **SA-2** · blocker · `acceptance-criteria` · `structural-architect:contract:b4d8ed4a` — **Visual-precedence AC unachievable.** The shipped `visual` rule requires a UI extension (`.jsx`/`.tsx`/`.vue`/`.svelte`) *and* components adjacency, so `src/components/__snapshots__/Button.png` matches no rule today and returns `unit`. Passing this AC requires editing validated `visual` detection behaviour, which is not in the Module Impact Map.
- **SA-3** · blocker · `acceptance-criteria` · `structural-architect:contract:17676c8d` — **Required profile fields unspecified.** The spec asserts all 8 contract fields load without fallback, but never specifies `seed_data_rule` or `permitted_tools`. `profiles.mjs` treats an empty `permitted_tools` array as a missing field and falls back to `unit`, so the AC fails as written.
- **SA-4** · blocker · `behaviors-5` · `structural-architect:contract:9e69bc36` — **Post-hoc-baseline detector has no data substrate.** Detection is specified as comparing a baseline capture event timestamp against the first implementation commit, but no baseline capture event exists, and the proposed `strategy_verification` payload carries no capture timestamp or baseline checksum. `SNAPSHOT_NO_BASELINE` and `SNAPSHOT_BASELINE_OVERWRITE` share the gap.
- **SA-5** · warning · `charter-extension-note` — Sibling-update obligations are stale and incomplete. `cross-strategy-gaming-patterns.spec.md` already reads "any registered strategy type". There are **three** count-assertion sites, not two (`tests/lib/test-strategies/registry.test.mjs:31`, `tests/evals/test-strategies/test-strategies.test.mjs:924`, `tests/docs/advanced-guides.test.mjs:161`), plus `docs/test-strategies.md`, `docs/concepts.md:104`, `strategy-profile-contract.spec.md` AC, `strategy-detection-heuristics.spec.md` Behavior 16, and `charter.md`'s own Strategy Type Registry capability row.
- **SA-6** · warning · `behaviors-7` — `detectTaskStrategy` iterates **file paths** in the outer loop and rules inner, so "checked before" holds only within one path. Multi-path resolution must be stated explicitly.
- **SA-11** · suggestion · `problem-and-motivation` — Distinctness from `fixture` is well argued; distinctness from `visual` rests only on a file-extension carve-out. State the semantic discriminator (`snapshot` requires a machine-checkable declared delta; `visual` has no such concept).

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

- **SEC-1** · blocker · `behaviors-8` · `security-reviewer:secrets:ab8d345c` — **Verbatim capture command may embed credentials.** The handoff block carries the capture command verbatim with no rule that credentials be referenced via named env vars. `integration-strategy-profile.spec.md` warns that connection strings embed passwords, and the `infra_requirements` `probe` field is deliberately limited to `$VAR` expansion; this spec carries no equivalent constraint.
- **SEC-4** · suggestion · `behaviors-6` — Masking correctly precedes checksum, but is entirely self-declared by project-authored capture code with no check that unmasked content never reached disk. Consider checking the mask list against the source schema before accepting a baseline.
- **SEC-5** · suggestion · `behaviors-8` — `evidence_ref` gets a containment check; the baseline **storage locator** does not. Apply the same rule.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-4** · warning · `charter-extension-note` — `manifest-schema-extension.spec.md` Behavior 1 still hardcodes "one of the 8 types" (stale even before this revision) and is not in any sibling-update list.
- **CON-5** · warning · `module-impact-map` — "count assertions" undercounts: `tests/evals/test-strategies/test-strategies.test.mjs` has 9-bearing ID **arrays** and describe titles at lines 436, 740, and 922–924, not just `assert.equal(..., 9)` lines.
- **CON-6** · suggestion · `charter-extension-note` — The `cross-strategy-gaming-patterns` instruction is copy-pasted from the integration profile's note and misdescribes the sibling's current text; no action is needed there.

---

## Summary

**Total findings:** 11 (5 blockers, 4 warnings, 3 suggestions — SA-3 shared across the profile set)
**Action required:** Revise to revision 2 addressing the five blockers, then re-review. The cascade-ordering blockers (SA-1, SA-2) require restating precedence as pattern-level exclusions rather than positional claims about the shipped rule list.
