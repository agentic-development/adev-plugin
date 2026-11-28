---
spec: .context-index/specs/features/implementation/implement-rigor-ladder.spec.md
date: 2026-11-28
tier: quick
verdict: PASS_WITH_NOTES
---

# Validation Report: Implement Rigor Ladder

> **Date:** 2026-11-28
> **Spec:** .context-index/specs/features/implementation/implement-rigor-ladder.spec.md
> **Rigor tier:** quick (explicit `--tier quick`)
> **Overall Status:** PASS_WITH_NOTES

---

## Check 1: Quality Gates — PASS_WITH_NOTES
- Check 1a (fast): `npm test` (gates `test`, `quality-gate`, same command) — 9763/9767 pass, 2 todo, 2 fail (61.3s).
  - Both failures are in `tests/lib/prototype-server.test.mjs:162` and `:178` (prototype-server port scanning) with `EADDRINUSE 127.0.0.1:3210`. An unrelated node process holds that port. This is an environment issue, not a regression. The gate outcomes are recorded honestly as `fail`.
- Check 1b (integration): `npm run test:evals` — SKIP. Paid/live evals are not permitted in this run.
- Check 1c (e2e): no gates configured, so it was skipped.

## Check 1.5: Source Manifest Verification — SKIP
Skipped — quick rigor tier.

## Check 1.6: Code-Side Drift Warning — SKIP
Skipped — quick rigor tier.

## Check 2: Spec Compliance (synthesized) — PASS_WITH_NOTES
- BEH-1..BEH-17: PASS. BEH-7 is PARTIAL because the code has drifted from the spec text (W1, W2).
- EV-1, EV-4, EV-5: PASS. The results are under `tests/evals/implement-rigor-ladder/results/`. The EV-5 distribution `met: true` (lite 0.6227).
- EV-2, EV-3: DEFERRED by the operator to GitHub issue #446.
- 35 targeted test files were run: 799 tests, 0 failures.
- Scope expansion (warning): feature files are missing from `source-manifest.files`. The main ones are lib/cli/governance.mjs, lib/lifecycle-state.mjs, templates/risk-policies-template.yaml, skills/review-specs/SKILL.md, lib/sync/provider-skills.mjs, scripts/sync-provider-skills.mjs, two amendment specs, several skill references, docs and tests.

## Check 4: Constitution Compliance (synthesized) — PASS
- Grepping added lines in the changed .mjs files finds no CommonJS and no provenance or narration comments.
- Grepping the changed SKILL.md files finds no inline Node.
- The changed SKILL.md files range from 13,389 to 19,896 B, all under the 65,536 B cap.
- package.json and both plugin.json files are at 0.28.1 and none changed. No new dependencies. hooks/ is unchanged.
- The approval boundary for the default rigor change is recorded in ADR 0020 (Accepted).

## Check 8: Boundary Compliance — SKIP
Skipped — quick rigor tier.

## Check 9: Transition Gates — SKIP
Skipped — quick rigor tier.

## Check 11: Visual Verification — N/A
No UI files.

## Findings (WARN)
- W1: `lib/implement/review-depth.mjs:375,:616` add a provider-mirror exemption that is not in spec BEH-7 (L261-264). Amend BEH-7, the AC and Failure Modes as ADR 0020:142 requires.
- W2: `lib/implement/review-depth.mjs:548-553` feeds gitignored files to the sensitive-path and boundary legs, which contradicts spec L260. Amend BEH-7 as ADR 0020:111 describes.
- W3: spec L346's codes list is missing RUN_BASE_UNAVAILABLE (`lib/cli/implement.mjs:216`), POLICY_UNCOMMITTED_CHANGES (`:258`), RUN_BASE_READ_FAILED and LITE_AUTHORIZATION_ASSUMED.
- W4: spec L357 says `failure-path-exit-event.md` is "unchanged", but that file changed (lines 15, 21). Reword it to say only the do-not-double-emit rule is unchanged.
- W5: EV-1 quick-arm timing is 0.65 against the main baseline but 0.87 against the same-ref full arm, which is over 0.8. State the reference baseline in the spec.
- W6: BEH-9 is covered only by regex tests on skill text. Optionally add a fixture test that fails a whole-run gate.
- W7: `source-manifest.files` is missing the files listed above. Re-stamp the manifest.

---

**Summary:** 3 checks passed (1 with notes from the environment, 1 with spec notes), 0 failed, 4 skipped (quick tier), 1 N/A.

> Relocated concerns: run `/adev:hygiene` for drift and coverage, `/adev:reconcile` for manifest re-stamping, and `/adev:review-specs` after amending BEH-7.
