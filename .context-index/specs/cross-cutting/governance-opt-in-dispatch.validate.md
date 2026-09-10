---
partial_schema: validate-report@1
spec: .context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md
plan: .context-index/specs/cross-cutting/governance-opt-in-dispatch.plan.md
date: 2026-09-10
overall_status: PASS_WITH_NOTES
rigor_tier: full
---

# Validation Report: Live Spec: Governance Opt-In Dispatch

> **Date:** 2026-09-10
> **Spec:** .context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md
> **Plan:** .context-index/specs/cross-cutting/governance-opt-in-dispatch.plan.md
> **Overall Status:** PASS_WITH_NOTES
> **Rigor tier:** full (risk_level not declared → default medium → validate_mode: full)

---

## Check 1: Quality Gates — PASS_WITH_NOTES

Gate source: project's materialized `.context-index/governance/gates.yaml` (3 gates: `test`, `quality-gate`, `integration-test`), resolved via `adev domain load-gates --module _global`.

**Check 1a (fast tier):**
- `test` (npm test): PASS — 7810 pass / 0 fail / 2 todo, 35.8s
- `quality-gate` (npm test, same command): PASS (same run)

**Check 1b (integration tier):**
- `integration-test` (npm run test:evals), severity: warning: WARN — 369 pass / 25 fail, 15.3s. All 25 failures are in `tests/evals/integration-sandbox/reality-check.test.mjs` (a `reality-check`/confidence-scoring integration sandbox test, pre-existing and unrelated to this spec's files — none of the failing assertions touch governance/review/validate/init code). Severity is `warning` (governance/gates.yaml explicit), so non-blocking per Check 1 semantics.

**Check 1c (e2e tier):** no gates configured — skipped.

No `--fix` requested; no fast-tier lint/format failures to auto-fix.

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify` → PASS, sha `a87b0af` matches current file contents for all 22 manifest files. Git-tracked check: `git log --oneline -1 -- <file>` confirmed a commit exists for every one of the 22 listed files (no untracked/uncommitted-only files).

## Check 1.6: Code-Side Drift Warning — PASS

`adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`. No drift detected.

## Check 2: Spec Compliance — PASS_WITH_NOTES

All 7 behaviors and 8 acceptance criteria verified by reading actual source:

- **BEH-1/BEH-2** (explicit per-check selection, empty selection writes literal `checks: []`): `lib/governance/registry-scaffold.mjs:69-122` (`writeRegistrySelection`) — entries.length===0 path writes `${header}${rootKey}: []\n` (line 106-107), non-empty path calls `spliceRegistryEntries(header, rootKey, entries)` (line 108). `skills/init/SKILL.md:499-559` (Step 7d.0) presents an unchecked-by-default checklist, calls `adev governance scaffold --registry validate --entries ...`, preserves the sub-step-2 idempotency no-op guard (line 512-516) unchanged.
- **BEH-3** (Step 7c always writes `review.yaml`, empty selection carries `materialized_at` marker): `skills/init/SKILL.md:458-488` — "Always write ... regardless of whether the operator selected anything"; `registry-scaffold.mjs:110-112` stamps the marker unconditionally when `registry === "review"`.
- **BEH-4** (standing warning on zero enabled reviewers): `skills/review-specs/SKILL.md:190-204` — exact predicate `reviewers.filter(r => r.enabled !== false).length === 0`, warning text present, review still completes.
- **BEH-5** (standing warning vs. hard-crash distinction): `skills/validate/SKILL.md:137-154` (this skill's own preflight, confirmed live in this run's loaded instructions) — absent file still throws `MISSING_VALIDATE_CONFIG`; exists-but-empty warns and proceeds.
- **BEH-6** (overlay base is operator's own selection, warnings surfaced): `skills/init/SKILL.md:369-377` (Step 7c.0) and `540-551` (Step 7d.0 sub-step 4) — overlay applied against the sub-step-3 selection, `RISK_TIER_OVERLAY_UNKNOWN_ID` collected for the Step 7 summary.
- **BEH-7** (cross-skill handoff test + partial-selection overlay coverage): `tests/cross-skill/governance-opt-in-handoff.test.mjs` (3 tests, all pass) and `tests/risk-tiers/tier-overlay-referential-integrity.test.mjs` `describe('tier overlays vs. a partial operator selection', ...)` (lines 54+); docstring corrected to describe both the full-bundle and partial-selection cases (lines 1-15), no longer claims only the full-bundle path.
- CLI verb `adev governance scaffold`: `lib/cli/governance.mjs:61,277-348` implements `--registry`/`--entries` (JSON literal or `@path`), a dedicated `GOVERNANCE_SCAFFOLD_ENTRIES_INVALID` re-throw naming `--entries` on parse failure (line 324-330), documented at `docs/cli-reference.md:288-293`.
- Stale "bundled defaults" claims: `skills/init/SKILL.md:198-204` and `docs/governance.md:22,38` corrected (confirmed by direct read — no residual "ship enabled" / "use bundled defaults" claims).
- All 22 spec-manifest test files pass: ran `node --test` directly on all 9 spec-relevant suites (`governance-opt-in-dispatch-contract`, `registry-scaffold` (lib+cli), `governance-opt-in-handoff`, `init-governance-explicit-selection`, `init-risk-tier-overlay-baseline`, `review-specs-zero-reviewers-warning`, `validate-zero-checks-warning`, `tier-overlay-referential-integrity`) → 48/48 pass, 0 fail.

**Finding (does not block — see note):** `.context-index/specs/features/review/charter.md`'s **Invariants** section (not the Capability Map, which was correctly updated — the "Bundled defaults preservation" row is now "Explicit opt-in dispatch", status `validated`) still reads: *"Bundled defaults must preserve current behavior: in the absence of `governance/review.yaml`, `/adev:review-specs` produces identical output to today's hardcoded flow."* This is now false — BEH-4 makes the absent-file case dispatch zero reviewers **with a standing warning**, not "identical output to today's hardcoded flow" (no warning existed pre-spec). The regression test added for this claim (`tests/skills/init-governance-explicit-selection.test.mjs:62-65`, `"review charter no longer claims no-governance-file means no change"`) string-matches the literal phrase `/projects with no governance file see no change/`, which the charter's actual (differently-worded) stale sentence does not contain — so the test passes green without the underlying claim actually being corrected. This is a **documentation drift**, not a runtime defect: the spec's own Acceptance Criteria list only names `skills/init/SKILL.md` and `docs/governance.md` for this correction (charter.md is out of the explicit AC list, though it was in the plan's Task 8 file list). Recommend a follow-up edit to the Invariants bullet and either a broader-matching or additional test assertion. Not spec-compliance-blocking since the AC as literally written is satisfied.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** No unauthorized boundary crossed — no new services/DB tables, no auth flow changes, no new external dependencies (`registry-scaffold.mjs` imports only existing internal modules + `node:fs`/`node:path`).
- **Non-negotiable principles:** Pure ESM confirmed (`import`/`export` throughout `lib/governance/registry-scaffold.mjs`, `lib/cli/governance.mjs`); no `require`/`module.exports` found. Skills name `adev governance scaffold` rather than embedding Node — `hooks/pre-commit-no-inline-node.sh` run clean (exit 0) against the modified SKILL.md files.
- **Coding standards / anti-patterns:** No change-narration comments found in `registry-scaffold.mjs` (its header comments cite the spec's BEH numbers alongside the constraint being enforced, not bare provenance). All 13 implement-phase commits (`1e5c928c`, `b6e72b7f`, `5773fa18`, `34e02ac4`, `7960f545`, `cd60654a`, `fb97c1d1`, `feb0e737`, `5f3b3f58`, `dfd86ce5`, `c76d208d`, `4b8a7adc`, `7ae22c8b`) carry `Spec:` and (except `dfd86ce5`, a doc-completion-event commit with no single plan task) `Plan-task:` trailers.

## Check 8: Boundary Compliance — PASS

`adev boundaries check --json` → verdict `PASS`, reason "no boundary violations in 26 changed file(s) against 3 rule(s)". 0 findings. 1 rule disabled (`no-manual-version-bump`) with its `disabled_reason` recorded (not this spec's concern). No registry warnings.

## Check 9: Transition Gates — PASS

`adev gate transitions --transition implement-to-validate --spec <path> --json` → verdict `PASS`, reason "every required gate has a fresh, attested, passing outcome". Gate `test`: verdict `pass`, reason `recorded-pass`, `command_attested: true`.

## Check 11: Visual Verification — N/A

No UI files in the implementation diff (all 22 manifest files are `.mjs`, `.md`, or `.yaml` under `lib/`, `skills/`, `docs/`, `templates/`, `tests/`, `.context-index/specs/`). SKIP per Case A of the trigger guard: "No UI files in implementation diff — visual verification not applicable."

---

**Summary:** 6 passed, 0 failed, 1 skipped (Check 11, N/A — no UI files) checks; 2 of the 6 passes carry non-blocking notes (Check 1's warning-severity integration-tier failures, pre-existing and unrelated to this spec; Check 2's charter.md documentation-drift finding).

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode). Also the right tool for this report's Check 2 finding (`review/charter.md` Invariants drift).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.
