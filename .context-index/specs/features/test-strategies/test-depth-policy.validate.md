# Validation Report: Test Depth Policy and Escalation-Only Coverage Scaling

> **Date:** 2026-08-13
> **Spec:** .context-index/specs/features/test-strategies/test-depth-policy.spec.md
> **Plan:** .context-index/specs/features/test-strategies/test-depth-policy.plan.md
> **Rigor Tier:** full (resolved from risk_level: medium → policies.medium.validate_mode: full; no --tier override, no routing signal)
> **Overall Status:** PASS (PASS_WITH_NOTES)

---

## Check 1: Quality Gates — PASS
- Check 1a (fast tier): `npm test` — PASS (175.6s). 4398 tests, 4396 pass, 0 fail, 2 pre-existing todo, 592 suites.
- Check 1b (integration tier): no gates configured — skipped.
- Check 1c (e2e tier): no gates configured — skipped.
- Gate source: domain gates (software) merged with governance/gates.yaml. Note: governance/gates.yaml's `test` gate uses a string-form command (`"npm test"`) which is invalid under the quality-gate kind's argv-list requirement and was skipped with a WARN; the domain starter's `quality-gate` (`["npm","test"]`) ran in its place — same effective command, no gap in coverage.

## Check 1.5: Source Manifest Verification — PASS_WITH_NOTES
- WARN — source manifest drifted: expected sha `f665551`, actual `ecb6c79`. Files touched since stamping include the spec itself, the charter, both governance yaml files, and the bulk of the lib/skills/docs/tests file set.
- Implementation existence: all 66 manifest files exist on disk and have git history (`git log --oneline -1 -- <file>` non-empty for every entry) — none are uncommitted-only.
- This drift is expected and already self-declared: the spec's own frontmatter carries `drift_detected: true`, consistent with Check 1.6 below.

## Check 1.6: Code-Side Drift Warning — PASS_WITH_NOTES (non-blocking)
- WARN — `drift_detected` flag is set. Drift source: `.context-index/specs/features/test-strategies/charter.md`, drift_at `2026-08-13T01:24:57.048Z`.
- Non-blocking per check definition; recorded for operator awareness. Recommend re-stamping the source manifest or confirming the spec still reflects the charter's current (revision-3) content.

## Check 2: Spec Compliance — PASS_WITH_NOTES
All 20 acceptance-criteria groups verified PASS by reading actual source and test files (not plan checkboxes):
- Two-axis split (granularity plan-time / depth authoring-time): PASS — `lib/test-strategies/policy.mjs:23-90`, `lib/test-strategies/depth.mjs:217-232`.
- Depth chain, static, first-match-wins: PASS — `lib/test-strategies/depth.mjs:66-80`.
- Escalation monotonic-upward-only, `escalation_skipped` discriminator: PASS — `lib/test-strategies/depth.mjs:125-162`; 9/9 depth tests pass.
- Sensitive-path floor (union, malformed-file degrade, applied last, `floor_legs`/`floor_inputs`): PASS — `lib/test-strategies/sensitive-paths.mjs:1-21`, `lib/test-strategies/depth.mjs:173-196`.
- `readTaskFiles` Behavior 8: PASS — `lib/test-strategies/task-files.mjs:1-97`, 7/7 tests pass.
- `adev test-policy` CLI verb suite: PASS — `lib/cli/test-policy.mjs:30-433`.
- `test_depth_assigned` event canon (both registries): PASS — `lib/lifecycle-events.mjs:70-78`, `lib/diagnostics/event-schemas.mjs:188-196`.
- `resolveRigorMode` unchanged: PASS.
- Gaming blockers depth-invariant (Behavior 19): PASS — `lib/test-strategies/gaming.mjs` takes no depth parameter (grep-confirmed).
- `/adev:status` event-based counting + plan-test-mapping amendment: PASS — `lib/lifecycle-state.mjs:1266-1519`, amendment spec file exists targeting rev 2.
- `/adev:hygiene` test-policy drift pass (Behavior 20): PASS — `skills/hygiene/SKILL.md:1055-1073`.
- Standalone `/adev:write-test` pinned to `standard`: PASS — `skills/write-test/SKILL.md:45`.
- `/adev:specify` `test_depth:` frontmatter: PASS — `skills/specify/SKILL.md:177`.
- `/adev:init` emission + placeholder guard: PASS — `skills/init/SKILL.md:214-249,217,482`.
- Charter revision 3 (capability row, `TestDepthAssignment` entity, Consumed-API row, qualified Out-of-Scope, `charter-revision: 3`): PASS — `charter.md:31,55,88,117`, spec frontmatter line 8.
- Self-hosting `sensitive-paths.yaml` extension: PASS — `.context-index/governance/sensitive-paths.yaml:7-10`.
- Risk-policy `test_depth` defaults match spec: PASS — `risk-policies.yaml:20,27,34`.
- Documentation (6 files + upgrade note + advisory-floor statement): PASS — `tests/docs/test-depth-policy-docs.test.mjs` 9/9.
- Full test suite: PASS — 4398 tests, 4396 pass, 0 fail, 2 pre-existing todo.

**Test Integrity:** No anti-patterns found (no loose matchers, conditional skips, unfalsifiable assertions, or silently-weakened tests) across spot-checked test files.

### Scope Expansion Sub-Finding — WARN (does not fail Check 2)
Files changed outside `source-manifest.files` (via `git diff <merge-base>..HEAD --stat`), all process/artifact byproducts rather than functional scope creep:
- `.context-index/adrs/0017-test-depth-resolution-point.md` (new) — the governing ADR, cited throughout the spec/plan but not listed in the manifest.
- `.context-index/manifest.yaml` — `adev_version` bump only.
- `.context-index/lifecycle-state/plan-test-mapping.jsonl`, `test-depth-policy.jsonl` — generated event logs.
- `test-depth-policy.plan.md`, `.review.md`, `.routing.json` — this spec's own lifecycle artifacts.
- `.context-index/sessions/*.md` (13 files) — auto-generated session logs.

Recommended action: consider adding `.context-index/adrs/0017-test-depth-resolution-point.md` to a future manifest re-stamp since it is a substantive, hand-authored governance artifact; the remaining items are routine lifecycle byproducts and do not need manifest inclusion.

## Cross-Repo Dependency Validation — N/A
No workspace detected (`detectWorkspace()` returned `null`); no cross-repo `depends-on` references in the spec.

## Check 4: Constitution Compliance — PASS
- Architecture boundaries: PASS — no new skill added to lifecycle order, no hook protocol change, no CLI install-path change, no plugin registration change, no external dependency added (`package.json` deps unchanged; `lib/cli/test-policy.mjs:11` self-documents zero external deps). The one governance-schema addition (`test_depth_assigned` canonical event) is self-annotated `[BOUNDARY: human-approved]`, governed by ADR-0009.
- Non-negotiable principles: PASS — minimize deps (no new deps), skills primarily markdown (zero inline-Node/require/module.exports across touched SKILL.md files, grep-confirmed), pure ESM (import/export only, zero CommonJS across sampled `.mjs` files), hook protocol N/A (no `hooks/` file touched), version parity confirmed (`package.json` and `.claude-plugin/plugin.json` both `0.27.8`).
- Coding standards: PASS — kebab-case files, camelCase exports, correct import ordering (builtins then relative) in `lib/cli/test-policy.mjs:13-25` and `lib/governance/rigor-mode.mjs:10-12`, error handling via `.code`-bearing `Error` objects propagating to `process.exit(1)`, no hardcoded `~/.claude/` paths, no inline-Node in any touched SKILL.md (grep-confirmed across all 7 touched top-level SKILL.md files), no new skill so "Load Skill Extensions" requirement not triggered.

## Check 8: Boundary Compliance — PASS
- `.context-index/governance/boundaries.yaml` exists but defines zero rules (`boundaries: []`) — no rule to violate.

## Check 9: Transition Gates — N/A (SKIP)
- `governance/gates.yaml` `transitions:` is empty (`{}`) — no transitions configured.

## Check 11: Visual Verification — N/A (SKIP)
- No UI files in the implementation diff (all touched files are `.mjs`, `.md`, `.yaml`) — visual verification not applicable (Case A of the trigger-guard matrix).

---

**Summary:** 6 passed, 0 failed, 2 skipped (N/A — not applicable to this spec: transition gates, visual verification) checks. 2 checks carry non-blocking WARN notes (source-manifest drift; scope-expansion process artifacts). No blocking failures.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.
