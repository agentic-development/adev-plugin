---
spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
plan: .context-index/specs/cross-cutting/explicit-governance-registries.plan.md
date: 2026-08-16
---

# Validation Report: Explicit Governance Registries

> **Date:** 2026-08-16
> **Spec:** .context-index/specs/cross-cutting/explicit-governance-registries.spec.md (revision 5)
> **Plan:** .context-index/specs/cross-cutting/explicit-governance-registries.plan.md
> **Overall Status:** PASS_WITH_NOTES

---

## Process note (read first)

This is a re-run after the prior validate run FAILed on Acceptance Criterion 11 (the twelve
bundled entries in `diagnostics.yaml`/`validate.yaml` carried no `source:`, so the DDR-6
execution-bearing-field sub-finding silently skipped them). Commit `e3cef1dd` fixed this with a
`pluginProvidedFields()` helper in `lib/hygiene/registry-drift.mjs` (fires on non-project `source`
OR a `plugin:`-prefixed value in `command`/`runner`/`prompt`/`pattern`, reporting
`source: plugin-referenced` for value-only rows) and amended AC 11 to scope the `source:` stamp
requirement to materialized registries.

Given the prior run's dispatch defect (two subagents raced, wrote conflicting artifacts directly to
disk, and one discarded a real defect), this run did not delegate whole checks to self-reporting
subagents. The top-level agent ran Checks 1, 1.5, 1.6, 8, 9, and 11 directly against the live CLI
in this worktree, and split Check 2 (29 acceptance criteria) and Check 4 across four independent,
read-only, non-writing forks, each instructed to ground every verdict in an actual Read/Bash call
and to report FAILs rather than paper over them. The top-level agent then independently re-ran the
cited test files itself (transitions, materialize, registry-marker, boundaries, boundary-rules-corpus,
registry-drift-pass-19, deterministic-check-migration, gate-outcomes, report-gate-outcomes,
doctor-consumer-parity, lifecycle-state, explicit-governance-registries-contract — 748 additional
test executions across these files, 0 failures) and re-ran the live CLI verbs (`adev boundaries
check --json`, `adev gate transitions --json` x2, `adev governance drift --json`, `adev gate doctor
--json`) to corroborate the forks' claims before recording any verdict below.

One correction to the dispatch brief: the "17 execution-bearing findings" figure was described as
"Pass 19 execution-bearing findings" (Hygiene Audit Pass 19, not a count of 19) — the live count is
correctly 17 (`validate: 8, diagnostics: 4, review: 3, gates: 2`), confirmed both by hand-reading
the four registry files and by a live `adev governance drift --json` run.

---

## Check 1: Quality Gates — PASS
- Tests: PASS — `npm test` (node:test): 6429 tests, 6427 pass, 0 fail, 2 todo, duration ~57.1s.
- Lint: not configured (commented out in `governance/gates.yaml`).
- Typecheck: not configured (commented out in `governance/gates.yaml`).
- `quality-gate` (domain:software, `npm test`): PASS (same run as above).
- `integration-test` (`npm run --if-present test:integration`): PASS — no-op, script absent from `package.json`.

## Check 1.5: Source Manifest Verification — PASS_WITH_NOTES
- `adev source-manifest verify --spec <path>`: WARN — manifest drifted (stamped sha `35d210b`, current sha `bf3de1d`). Expected: the fix commit `e3cef1dd` (and its preceding commits back to the stamp) modified files in the manifest after it was stamped.
- Implementation-existence check: all 104 files listed in the manifest confirmed present in `git log --oneline -1 -- <file>` — none untracked or uncommitted.
- Non-blocking per Check 1.5's contract; does not affect the aggregate verdict beyond contributing the PASS_WITH_NOTES note.

## Check 1.6: Code-Side Drift Warning — PASS
- `adev verify spec --spec <path> --check-drift`: `{"drifted":false,"drift_source":null,"drift_at":null}`.
- `drift_detected` frontmatter flag: not set.

## Check 2: Spec Compliance — PASS
All 29 acceptance criteria verified PASS. Verified by four independent read-only investigations
(each grounded in Read-tool citations and live test/CLI runs) plus the top-level agent's own
independent re-runs of the cited tests and CLI verbs. No criterion returned FAIL. One item carries
an architectural note, not a defect:

- AC 1 (Check 8 SKIP not PASS on empty `boundaries.yaml`, no subagent dispatch): PASS — `lib/governance/boundaries.mjs:195-205`; `tests/governance/boundaries.test.mjs` ("no rules declared records SKIP and dispatches nothing").
- AC 2 (Check 9 SKIP not PASS on empty `transitions`): PASS — `lib/governance/transitions.mjs:348-351`; `tests/governance/transitions.test.mjs`.
- AC 3 (Checks 8/9 carry `kind: deterministic-check`): PASS — `.context-index/governance/validate.yaml` lines for `validate.check-8-boundaries` / `validate.check-9-transition-gates`, confirmed by direct read.
- AC 4 (`boundaries.yaml` regex-decidable rules with fire/no-fire fixtures): PASS — 3 enabled rules, each with `tests/fixtures/governance/<id>.{violating,clean}`; `tests/governance/boundary-rules-corpus.test.mjs` (58/58 pass, including "no rule fires on the current tree").
- AC 5 (`transitions` names only real-argv gates; hygiene Pass 8 passes): PASS — `gates.yaml` transitions require only `test` (`command: ["npm","test"]`); `tests/governance/transitions-config.test.mjs` (4/4 pass).
- AC 6 (registries list every entry that runs, nothing extra): PASS — live `adev governance materialize --registry {gates,review,diagnostics} --dry-run --json` returns `changed:false` for all three.
- AC 7 (byte-identical effective set before/after materialization, per registry, test-asserted): PASS — `tests/governance/registry-effective-set.test.mjs`.
- AC 8 (`enabled:false` reported as deliberately disabled with reason): PASS — `lib/governance/enablement.mjs::resolveEnablement`; live Check 8 run returned a populated `disabled` array with `disabled_reason`; `tests/governance/enabled-flag.test.mjs`.
- AC 9 (gate doctor and Check 1 operate on the same gate set, test-asserted): PASS — `tests/gates/doctor-consumer-parity.test.mjs` (81/81 pass); live `adev gate doctor --json` shows no gate-set divergence finding.
- AC 10 (Hygiene Pass 19 reports drift for all four registries): PASS — `lib/hygiene/registry-drift.mjs` `REGISTRY_NAMES` covers `validate`, `review`, `diagnostics`, `gates`; live `adev governance drift --json` returns findings across all four.
- AC 11 (source: stamp scoped to materialized registries + plugin-prefix disjunct, `plugin-referenced` label, disabled-bundled-entry audit unaffected): PASS — `lib/hygiene/registry-drift.mjs::pluginProvidedFields`; fire condition `src !== "project" || pluginFields.length > 0`; value-only rows report `source: plugin-referenced`; audit 2 (`disabled-bundled-entry`) confirmed to still use `entrySource()`/`isBundledOrDomain()` alone. Live `adev governance drift --json`: 17 execution-bearing findings (`validate:8, diagnostics:4, review:3, gates:2`). `tests/hygiene/registry-drift-pass-19.test.mjs` 23/23 pass, including the narrowness pin (a hand-authored `command` with no `source:`/no `plugin:` value is NOT promoted).
- AC 12 (marked-but-unmarked registry raises `REGISTRY_NOT_MATERIALIZED`; exempt registries never raise): PASS — `lib/governance/registry-marker.mjs::assertMaterialized`; `tests/governance/registry-marker.test.mjs` (43/43 pass, including a non-empty `review.yaml` fixture).
- AC 13 (loader decides from project file alone, no defaults read): PASS — `tests/governance/registry-marker.test.mjs` ("materialization is decided from the project file alone").
- AC 14 (extension install into a marked-unmaterialized registry refused; exempt unaffected): PASS — `tests/lib/extensions/governance-marker-gate.test.mjs` (12/12 pass).
- AC 15 (round trip: raise → materialize → proceed → byte-identical re-materialize incl. unchanged `materialized_at`): PASS — same test file plus `registry-effective-set.test.mjs` ("a second materialize run leaves the effective set alone"); live dry-run showed `marker_written:false` on second run.
- AC 16 (fresh `/adev:init` scaffold carries `materialized_at` on all three marked registries, never raises on first run): PASS, with a noted architectural caveat — `gates.yaml`/`review.yaml` scaffolding is driven by agent-followed `skills/init/SKILL.md` prose (frozen marker literal in the templates), not the deterministic `scaffoldContextKit()` path (which only auto-copies `diagnostics-template.yaml`). This is consistent with the codebase's established pattern of testing SKILL.md prose directly (`tests/lib/extensions/governance-marker-gate.test.mjs` verifies it via template `cpSync`), not a gap unique to this spec, so it is not recorded as a defect — but no test drives the actual interactive init flow end-to-end.
- AC 17 (stale `ts` before `computed-at` → SKIP `stale-gate-record`): PASS — `lib/governance/transitions.mjs::isFresh`; `tests/governance/transitions.test.mjs:248`.
- AC 18 (`manifest_sha` mismatch → SKIP `stale-gate-record` even if `ts` recent; absent → judged on `ts` alone): PASS — `transitions.mjs` lines 224-226; tests at lines 281 and 314.
- AC 19 (hand-appended `gate_outcomes` for an id absent from `gates.yaml` → SKIP `unattested-gate-record`, does not satisfy `required_gates`): PASS — `evaluateOutcome()`; adversarial test bypasses `reportValidator` via direct `appendEvent()`.
- AC 20 (`command_sha` mismatch → SKIP `unattested-gate-record`): PASS — `transitions.mjs` lines 267-275; test with a forged sha.
- AC 21 (missing `command_sha` judged on gate-id membership alone, pre-upgrade fixture): PASS — `transitions.mjs` lines 281-286; test asserts `verdict:"pass"`, `command_attested:false`.
- AC 22 (`--gate-outcomes` flag + `reportValidator` persistence, round-trip test): PASS — `lib/cli/report.mjs`; `lib/lifecycle-state.mjs::reportValidator`; round-trip proven at both unit and CLI-spawn level.
- AC 23 (no new `CANONICAL_EVENTS` variant, test pinning the list): PASS — `lib/lifecycle-events.mjs` 16-entry set unchanged; `gate_outcomes`/`manifest_sha` are payload fields on the existing `validator_report` variant; `tests/lifecycle/gate-outcomes.test.mjs` pins `EXPECTED_VARIANTS` with `deepEqual`.
- AC 24 (FAIL naming every required gate without a passing record; never executes a gate): PASS — static import check (no `child_process`), source-text regex test for `exec|execFile|spawn|fork(`, and a behavioral test proving a `touch <marker>` gate command is never actually run.
- AC 25 (catastrophic-backtracking pattern terminates within the 250ms budget, records failure naming the rule): PASS — `PER_FILE_BUDGET_MS = 250` (`lib/governance/boundaries.mjs:80`); test uses `(a+)+$` against a crafted input, asserts `BOUNDARY_PATTERN_TIMEOUT`; completed in 273ms live.
- AC 26 (file above the 1MB cap produces a finding at the rule's own severity, not a silent SKIP): PASS — `MAX_INPUT_BYTES = 1024*1024`; fixtures genuinely padded past the cap; `severity: rule.severity`, not hardcoded.
- AC 27 (Hygiene flags `enabled:false` on `bundled`/`domain:*` entries): PASS — `isBundledOrDomain()` AND-condition confirmed; negative fixtures (project-sourced `enabled:false`) confirmed NOT to fire.
- AC 28 (no check identifier changed; no check moved between surfaces): PASS — spec's own RENAMED section states "None"; `check-8`/`check-9` ids present only in `validate.yaml` and `skills/validate/checks/`, absent from `review.yaml`/`diagnostics.yaml`.
- AC 29 (all quality gates pass; no constitutional violations): PASS — see Check 1 and Check 4 below.

## Check 4: Constitution Compliance — PASS
- Architecture boundaries: PASS. No unauthorized dependency, no hook-protocol change (`hooks/` absent from the spec's source manifest), no install-path or plugin-registration change. `lib/governance/boundary-worker.mjs` uses only `node:worker_threads`; `package.json` dependencies block unchanged on this branch.
- Non-negotiable principles: PASS for all five — minimize external deps (grep for `require(`/`module.exports` across new `lib/governance/*.mjs` and `lib/cli/{boundaries,governance}.mjs` returned no matches), skills primarily markdown (both rewritten check bodies are prose calling a CLI verb, explicitly say "Do not re-implement the rule algorithm"), pure ESM (clean), hook protocol unaffected, version parity (`package.json` and `.claude-plugin/plugin.json` both `0.27.8`, and the version-parity test in the `npm test` run passed).
- Coding standards: PASS. camelCase functions/vars and kebab-case files confirmed by sample (`boundaries.mjs`, `boundary-worker.mjs`, `registry-marker.mjs`, `materialize.mjs`); Node-builtins-first import ordering confirmed in `lib/governance/transitions.mjs` and `lib/cli/gate.mjs`.
- **Open governance question (report only, not adjudicated):** three new CLI verbs shipped under `--auto` — `adev boundaries check`, `adev governance {materialize,drift,reviewers}`, `adev gate transitions`. The constitution's "Requires Human Approval" list has no literal "new CLI verb" clause. This is not asserted as a violation, and not treated as pre-approved — it is a named unresolved governance question for a human to decide whether the "Requires Human Approval" list should be extended to cover new CLI surface.

## Check 8: Boundary Compliance — PASS
- Live `adev boundaries check --json`: `verdict: PASS`, "no boundary violations in 81 changed file(s) against 3 rule(s)".
- `no-manual-version-bump` reported in the `disabled` array with its `disabled_reason` (Invariant 5 — a disabled rule is distinguishable from an absent one).

## Check 9: Transition Gates — PASS
- Live `adev gate transitions --transition implement-to-validate --spec <path> --json`: `verdict: PASS`, gate `test` → `recorded-pass`, `command_attested: true`.
- Live `adev gate transitions --transition validate-to-merge --spec <path> --json`: same result.

## Check 11: Visual Verification — N/A (SKIP)
- No UI files (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, `components/**`, `pages/**`, `views/**`, `public/**`) present among the spec's 104-file source manifest. Case A of the trigger-guard matrix: "No UI files in implementation diff — visual verification not applicable."

---

**Summary:** 8 checks dispatched (1, 1.5, 1.6, 2, 4, 8, 9, 11) — 7 PASS, 1 PASS_WITH_NOTES (Check 1.5, non-blocking source-manifest drift), 0 FAIL, 1 N/A (Check 11, no UI files). All 29 acceptance criteria verified PASS.

**Known open items (reported, not fixed — out of this validation run's scope):**
- The three new CLI verbs (`adev boundaries check`, `adev governance {materialize,drift,reviewers}`, `adev gate transitions`) are a named unresolved governance question — see Check 4.
- 30 of 39 `/adev:implement` commits on this spec's history carry an unparseable `Spec:` trailer (a blank line before the trailer from the two-`-m` commit form). Not being rewritten — re-hashing the implement commit history is the failure mode that broke this repo's plan-immutability exemptions before. (A spot check of the four most recent fix commits on this branch, `7cfc09fe..e3cef1dd`, found all four trailers parseable.)
- `npm test` mutates tracked `.context-index/lifecycle-state/*.jsonl` files and can write `drift_detected: true` into unrelated spec frontmatter — a pre-existing test-isolation leak. Two concurrent `npm test` runs can collide. This run executed `npm test` once, as instructed.
- `skills/hygiene/SKILL.md` is 65,350 of a hard 65,536-byte cap. No check in this run needed to edit it; flagged for awareness only.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.
