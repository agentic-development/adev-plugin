---
spec: .context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md
charter: .context-index/specs/features/eval-harness/charter.md
date: 2026-08-21
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 1
file-sha: c3e618d85a1f346544fc9108a1d19e89e809666966e5b75488890ab21da11bec
---

# Architecture Review: rubric-set-change-imminent

> **Date:** 2026-08-21
> **Spec:** `.context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md`
> **Charter:** `.context-index/specs/features/eval-harness/charter.md`
> **Verdict:** BLOCK
> **Rigor tier:** full (risk_level `medium` → `review_mode: full`)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | plugin:review-specs/termination-reviewer-prompt.md |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Reviewer-domain-fit initiative; scope retargeted to the four default reviewers. |
| security-reviewer | Reviewer-domain-fit initiative; OWASP scope relocated to the web-service domain extension. |

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

**RI-1 — `blocker`** · `misattributed-error-code` · anchor `migration-of-the-three-existing-rubrics`
The three legacy rubrics are **not** rejected with `RUBRIC_LEGACY_SCALE`. They declare a nested `scoring:` map and omit 10 of 12 `REQUIRED_TOP_LEVEL_KEYS`, so `assertNoNestedMaps` (pass 4) throws first. `tests/lib/evals/rubric-legacy-scale.test.mjs:210` asserts `err.code === "RUBRIC_NESTED_MAP"` and its comment states they "never reach this pass". Verified independently.
**Fix:** name `RUBRIC_NESTED_MAP` (with `RUBRIC_MISSING_KEY` as the second independent rejection).

**RI-2 — `blocker`** · `catalog-class-skill-mismatch` · anchor `the-eleven-rubrics`
The `assess` row cites `spec-code-drift` and `missing-issue-binding`; the fixture spec's allowlist for those classes is `hygiene, validate, debug` and `reconcile, issues, status`. `assess` is in neither, so the `assess` detector rubric has no permitted class and the "four detector rubrics cite a PV plus twin" criterion is unsatisfiable without amending the fixture spec.

**RI-3 — `warning`** — `repomap` cites `dead-export`, allowlisted to `codehealth` only.

**RI-4 — `warning`** — The fixture spec permits an `issues` rubric to cite `missing-issue-binding`; this spec's criterion forbids any producer citing a catalog id.

**RI-5 — `warning`** — The `document` row scores `docs/architecture.md`, but the cited `undocumented-public-api` ground truth is defined against `docs/api.md`.

**RI-6 — `warning`** — "verdict table contract (`lib/evals/score-schema.mjs`)" points at the wrong module; that file holds verdict *enums*, the rendered table lives in `lib/cli/eval.mjs`.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

**WR-1 — `blocker`** · `no-caller` · anchor `consumers`
The 11 scenarios have no reader. `RUBRIC_SCENARIO_MISSING` checks the file exists; nothing reads its content. `npm run test:evals` maps to `scripts/run-tests.mjs --evals`, which collects only `*.test.mjs` under `tests/evals/` — and Required Files declares none there. The chain breaks at the far end too: `adev eval score --input` takes a *verdict set*, and nothing in this spec produces one from a scenario run.
**Fix:** name the executor and the verdict-set production step, or declare the CI-integration capability a dependency and drop the `npm run test:evals` criterion.

**WR-2 — `warning`** — `output:` and `artifact:` have no resolver; no rule constrains their form or resolves `artifact:` paths against the fixture.

**WR-3 — `warning`** — `RUBRIC_CITATION_UNRESOLVED` is a code nothing emits; the spec says the check is implemented once under the fixture spec's name. The criterion demanding all eight codes be asserted names a code with no implementation.

**WR-4 — `warning`** — The `eval`/`sync`/`issues` "must cite that spec as `reference`" requirement has no predicate; it is prose only.

**WR-5 — `warning`** — Two cited pairs are out of sync with the seed's `covers_skills`, and no rule enforces the coupling, so the drift fails no gate.

**WR-6 — `warning`** — The baseline-fidelity escape hatch records an issue id "in a rubric comment"; `parseYaml` discards comments, so no check can read it back.

**WR-7 — `suggestion`** — `tiers.yaml` and the 11 rubrics are fully wired. Verified: 31 skill directories matching the 11+12+7+1 partition, `skill`/`scenario` already in `OPTIONAL_TOP_LEVEL_KEYS`, point budgets matching `skills/eval/default-rubric.yaml` verbatim.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** FAIL

**CON-1 — `blocker`** · `domain-model` · anchor `source-values-and-the-two-kinds-of-skill-in-this-tier`
`assess` is a detector here and a non-detector in the declared hard prerequisite. `skills/assess/SKILL.md` does scan a project, favouring this spec — but the two must agree before either is planned. (Same conflict as RI-2, reached from the classification side.)

**CON-3 — `warning`** — `RUBRIC_TIER_UNCOVERED` is scoped verbatim to `change_imminent`, so the twelve core-lifecycle rubrics are never coverage-checked — the exact failure the rule names. The core spec is contractually forbidden from restating the rule, so the fix belongs here: reword bucket-agnostically.

**CON-2 — `warning`** — `covers_skills` drift (`repomap`/`dead-export`, `issues`/`missing-issue-binding`) is caught by no rule.

**CON-4 — `warning`** — "Tier" is used in two unrelated senses (CI tiers A/B/C, and `tiers.yaml` set membership) without disambiguation, which the charter's Vocabulary attribute forbids.

**CON-5 — `warning`** — The `npm run test:evals` gate criterion depends on the unspecified CI-integration capability, which the header does not list as a prerequisite.

**CON-6 — `suggestion`** — "11 judge dispatches per Tier C run per criterion" should read 36, one per criterion; the core spec's 86-dispatch arithmetic already assumes 36.

**CON-7 — `suggestion`** — Scenario filenames depart from the cited precedent (`plan-scenario.md`) without the one-line reason given for the `skill` departure.

**CON-8 — `suggestion`** — The charter says 30 skills and names three tiers; `tiers.yaml` declares 31 and four buckets. Amend the charter.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** FAIL

**BD-6 — `blocker`** · `artifact-leakage` · anchor `scenarios`
Working directory is the spec's only containment mechanism, and for `issues` it contains nothing: `resolveStorageRoot` returns `tasks.db_path` if set, else `dirname(git rev-parse --git-common-dir)`. The fixture is inside this repo, so a scenario run resolves to the real `.beads/` board while the fixture's own store is never touched. `.context-index/manifest.yaml` sets `tasks.backend: beads` with no `db_path`, so the escape is open. `.gitignore` has no `skill-regression` entry, so nothing downstream catches it.
**Fix:** require `tasks.db_path` contained under the fixture root, and assert `resolveStorageRoot(fixtureManifest, fixtureProjectDir)` returns a path inside the fixture.

**BD-5 — `warning`** — `npm run test:evals` drives eleven side-effecting skills with no consent step, where `exec-consent.mjs` is fail-closed by contract.

**BD-1 — `warning`** — `scenario` is a new path-valued field resolved by this spec's own test with no stated containment mechanism; an escaping path that exists must not report as "present".

**BD-2 — `warning`** — `artifact:<path>` has no containment rule, unlike the analogous `CATALOG_PATH_ESCAPE`. The `document` row's `docs/architecture.md` makes the ambiguity live.

**BD-3 — `warning`** — The `deploy` rubric scores a pipeline transcript from fixture-authored `shell` steps; the spec is silent on their shape.

**BD-7 — `warning`** — Run outputs have no declared location; `/adev:prototype` persists outside `project/`.

**BD-4 / BD-8 — `suggestion`** — `tiers.yaml` bucket tokens should be constrained to the `skills/` directory-name grammar so a token cannot reparse as a boolean; the `sync` rewrite target should be stated as fixture-owned.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS

No findings. The trigger fired on the skill *name* `bugfix-loop` in the Open Questions section, not on a construct. The rubric→catalog citation relationship is strictly one-directional (no feedback edge), and the eight conformance rules are single-pass assertions over finite sets.

---

## Summary

**Total findings:** 29 (5 blockers, 18 warnings, 6 suggestions)

**Action required:** Revise the spec.

1. **`assess` is classified two ways across two specs** (RI-2, CON-1) — and its cited classes are outside the fixture's allowlist. Reconcile in one place; `skills/assess/SKILL.md` favours "detector".
2. **The scenarios have no executor** (WR-1) — `npm run test:evals` provably discovers nothing for this tier, and no artifact converts a scenario run into the verdict set `adev eval score` consumes.
3. **The issue board escapes to the real one** (BD-6) — same root cause the fixture spec's review found independently.
4. **`RUBRIC_LEGACY_SCALE` is the wrong code** (RI-1) — verified against the shipped test that asserts `RUBRIC_NESTED_MAP`.
5. **`RUBRIC_TIER_UNCOVERED` covers one bucket** (CON-3) — must be reworded here, since the core spec is forbidden from restating it.
