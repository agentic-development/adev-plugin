# Architecture Review: plan-infra-requirements

> **Date:** 2026-04-27
> **Spec:** .context-index/specs/features/test-strategies/plan-infra-requirements.md
> **Charter:** .context-index/specs/features/test-strategies/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2
> **file-sha:** 044944fafbf162e38dde39aacb9eea847fe19123
> **Note:** All blockers resolved in the same review cycle. Remaining findings are warnings and suggestions — tracked above for follow-up.
> **Revision 2 addendum (2026-04-27):** Behavior 1 trigger made universal — section now emits when `infra_requirements:` is present in frontmatter OR when any non-unit strategy is assigned (not a hardcoded list of 4 strategies). Accommodates visual/fixture/threshold specs with real infrastructure requirements (Storybook, BigQuery, load-test envs). Preconditions, Behavior 2, error case, acceptance criteria, and Behavior 7 example updated accordingly. This change is additive/clarifying — no blockers introduced; verdict remains PASS_WITH_NOTES.

## Reviewers Dispatched

| ID | Name | Mode | Profile |
|----|------|------|---------|
| structural-architect | Structural Architect | subagent | reasoning |
| security-reviewer | Security Reviewer | subagent | capable |
| consistency-analyzer | Consistency Analyzer | subagent | capable |

---

## Structural Architect

**Verdict:** BLOCK

**SA-1** · warning · _Behavior numbering out of order: 1, 2, 3, 4, 7, 5, 6_
→ Renumber sequentially.

**SA-2** · blocker · _Behavior 7 governs `/adev:specify` from within a plan-scoped spec — ownership violation_
`plan-infra-requirements` is a test-strategies / plan spec. Behavior 7 mandates new interactive prompts and frontmatter output from the specify skill, which is a separate module with its own charter. This is an architecture boundary violation.
→ Extract Behavior 7 to a cross-cutting spec (e.g., `specify-infra-capture.md`). This spec retains only the consumer side: "When `infra_requirements:` is present in frontmatter, plan uses it as authoritative source."

**SA-3** · blocker · _Behavior 2 step 3 contradicts `strategy-detection-heuristics` (no content parsing)_
Example "files importing `@aws-sdk/*`" is import scanning — content parsing — which is prohibited by the review-passed detection-heuristics spec.
→ Remove the import example. Replace with a path-based example consistent with file-globbing-only constraint.

**SA-4** · warning · _Capability statement says plan "blocks planning when requirements cannot be determined" — contradicts Behavior 4 which explicitly says plan does NOT block_
→ Amend capability statement: "…surfaces unresolved requirements for human review."

**SA-5** · warning · _Behavior 5 (`infra_requirements:` frontmatter) should be documented in the Live Spec template, not the `manifest-schema-extension` spec — the field lives on spec files, not manifest.yaml_
→ Correct Actionable Task Map task to reference the Live Spec template.

**SA-6** · suggestion · _Behavior 2 and Behavior 5 present contradictory flows (sequential vs. skip-on-frontmatter)_
→ Add explicit conditional to Behavior 2: "If `infra_requirements:` present in spec frontmatter, skip step 3."

**SA-7** · suggestion · _Task 1 in Actionable Task Map targets the specify skill — contingent on SA-2 resolution_
→ If Behavior 7 is extracted, remove Task 1 from this spec's task map.

---

## Security Reviewer

**Verdict:** BLOCK

**SEC-1** · blocker · _No prohibition on actual credential values in `infra_requirements:` frontmatter_
Behavior 5 allows free-form `notes:` field. Behavior 7's specify prompt asks "What credentials or environment variables are needed?" — an agent could write actual values into notes or a custom key, committed to the repository. No guardrail exists.
→ Add explicit prohibition in Behavior 5 and Behavior 7: "This block MUST contain only env var NAMES and human-readable guidance. Actual credential values, tokens, connection strings with embedded passwords, or any secret material MUST NOT appear here."

**SEC-2** · warning · _Plan output (with credentials table) may be committed as a `.plan.md` file — no guidance on what may appear in that committed artifact_
→ Add note: plan output MUST contain only env var names and human-readable source guidance — no account IDs, ARNs, internal URLs, or actual values.

**SEC-3** · warning · _`.env.test` recommendation is passive; file may be accidentally committed if `.gitignore` not updated_
→ Change to requirement: "`.env.test` MUST be listed in `.gitignore`."

**SEC-4** · suggestion · _No guidance on secret rotation for declared credentials_
→ Add CI Notes sub-item recommending short-lived credentials (STS role assumption) over long-lived IAM user keys.

---

## Consistency Analyzer

**Verdict:** BLOCK

**CON-1** · blocker · _Behavior numbering disorder: 1, 2, 3, 4, 7, 5, 6 (same as SA-1)_ → Renumber.

**CON-2** · blocker · _Behavior 2 step 3 import scanning example contradicts detection-heuristics spec (same as SA-3)_ → Fix as SA-3.

**CON-3** · warning · _Behavior 6 amends `plan-integration` Behavior 4 without explicitly stating it — two specs produce conflicting instructions for plan's strategy summary format_
→ Add amendment note: "This behavior amends `plan-integration` Behavior 4. When this spec is active, the distribution summary includes a fourth 'infrastructure' column."

**CON-4** · warning · _Actionable Task Map says "document `infra_requirements` field in manifest schema extension spec" — wrong target; the field is on spec frontmatter, not manifest.yaml_
→ Change to "document in the Live Spec template."

**CON-5** · suggestion · _`contract` strategy excluded from Behavior 1 trigger list without explanation — contract tests may require live provider infrastructure_
→ Add clarifying note explaining the exclusion.

---

## Summary

**Total findings:** 16 (4 blockers, 6 warnings, 3 suggestions)

**Blockers to resolve:** SA-2 (Behavior 7 ownership — extract to cross-cutting spec), SA-3/CON-2 (import scanning contradiction), SEC-1 (no credential prohibition), CON-1 (behavior numbering)

**Action required:** Resolve blockers, then re-run `/adev:review-specs --spec .context-index/specs/features/test-strategies/plan-infra-requirements.md`
