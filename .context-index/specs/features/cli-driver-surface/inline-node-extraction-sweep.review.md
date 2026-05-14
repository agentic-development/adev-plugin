---
spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
charter: .context-index/specs/features/cli-driver-surface/charter.md
date: 2026-05-14
verdict: PASS_WITH_NOTES
last-reviewed-revision: 1
file-sha: bc6bf2a44cdfd9db58126f7a88953f8fc67cfe96046f984fbb9915e476c40567
---

# Architecture Review: inline-node-extraction-sweep

> **Date:** 2026-05-14
> **Spec:** `.context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md`
> **Charter:** `.context-index/specs/features/cli-driver-surface/charter.md`
> **Verdict:** PASS_WITH_NOTES (initial: BLOCK; blocker resolved inline)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|---|---|---|---|---|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1** (warning): Allowlist source-of-truth ownership unclear; `/adev:plan` needs canonical 18-skill list. **Resolution:** Behavior 7 updated — allowlist seeded from `grep -rl ... skills/*/SKILL.md` at PR 1 time; command is canonical.
- **SA-2** (warning): No canonical CLI Verb Registry table — risk of verb collision/divergence in long tail. **Status:** Deferred — `/adev:plan` will produce the verb registry as part of decomposition; tracked in `extraction-sweep-progress.md`.
- **SA-3** (suggestion): Behavior 5 (requireGate-first) duplicates driver-substrate Behavior 3; cross-spec maintenance risk. **Status:** Deferred — cross-reference acceptable as long as both specs stay aligned during charter revisions.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

- **SEC-1** (suggestion, input-validation): Pre-commit hook code-fence false-positive concern not cross-referenced from this spec to `regression-prevention`. **Status:** Deferred — purely discoverability; implementation note suffices.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES (initial: BLOCK)

- **CON-1** (blocker, contract): Behavioral Contract opener grep pattern `node --input-type` (without `=module`) over-matches `--input-type=commonjs`; conflicts with Behavior 6 and regression-prevention's narrower `node --input-type=module -e` form. **Resolution:** Behavioral Contract opener standardized to `node --input-type=module -e`; explanation of why narrower form is required added inline.
- **CON-2** (warning, naming): "PRs 7–18" implies 18-PR fixed count; conflicts with PRs 2–3 spanning multiple skills. **Resolution:** Renamed to "PRs 7–N — Long tail"; explicit note that exact count is determined by `/adev:plan` decomposition.
- **CON-3** (warning, contract): `report.mjs` verb ownership ambiguous ("likely" same module for PR 2 and PR 3). **Resolution:** PR 2 and PR 3 task descriptions updated — both use `lib/cli/report.mjs` with `--type validator` / `--type step` modes (single verb, multi-mode, one dispatch entry).

---

## Summary

**Total findings:** 7 (1 blocker resolved, 3 warnings, 3 suggestions/deferred)
**Initial verdict:** BLOCK
**Post-resolution verdict:** PASS_WITH_NOTES
**Action required:** Spec ready for `/adev:plan`. The decomposition will materialize the Canonical CLI Verb Registry referenced by SA-2.
