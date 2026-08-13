---
kind: validate
spec: .context-index/specs/features/unified-gates/tiered-gates-default.spec.md
charter: unified-gates
verdict: PASS_WITH_NOTES
tier: quick
validated-revision: 2
date: 2026-08-13
---

# Validation Report: Tiered Gates by Default

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/unified-gates/tiered-gates-default.spec.md` (rev 2)
> **Plan:** `.context-index/specs/features/unified-gates/tiered-gates-default.plan.md` (7 tasks)
> **Rigor tier:** `quick` (explicit `--tier quick`)
> **Overall Status:** PASS_WITH_NOTES

Quick tier per `graduated-rigor-tiers.spec.md`: Check 1 runs with full fail-fast semantics,
followed by a single synthesized spec+constitution compliance check. Checks 1.5, 1.6, 8 and 9
are recorded SKIP with reason "Skipped — quick rigor tier." Check 11 evaluated its independent
trigger and skipped on Case A.

---

## Check 1: Quality Gates — PASS

Gates resolved via `adev domain load-gates --module unified-gates`
(`resolved_domain: software`, `source_level: default`).

| Sub-check | Gate | Command | Result |
|---|---|---|---|
| 1a fast | `quality-gate` | `["npm","test"]` | **PASS** — 5598 tests, 5596 pass, 0 fail, 2 pre-existing todo |
| 1b integration | `integration-test` | `["npm","run","--if-present","test:integration"]` | **PASS** — exit 0 (no-op; no `test:integration` script yet, which is the intended shipped behaviour) |
| 1c e2e | — | — | SKIP — no gates assigned to the e2e tier |

**Loader warning surfaced (not swallowed):** `INVALID_GATE — Gate 'test' command must be an
argv list (array), not a string — skipped.` See Finding 1.

## Check 2 + Check 4 (synthesized, quick tier): Spec + Constitution Compliance — PASS_WITH_NOTES

Every citation below comes from a file read during this validation run.

### Acceptance criteria — 13 of 13 PASS

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Template has live `test` (fast) + `integration-test` (integration); latter triggers `post-implement` | PASS | `templates/gates-template.yaml:45-66` — both entries uncommented; `integration-test` triggers `post-implement` at :66 |
| 2 | Every `command:` in template, software starter, both overlays is argv form | PASS | `templates/domains/software/gates.yaml:4,9`; `extensions/data-engineering/domain/gates.yaml:4,9`; `extensions/process-automation/domain/gates.yaml:4,9`. Template uses the `""` unwired sentinel by design (:49, :61), explicitly exempted |
| 3 | `mergeGates` on software starter yields ≥1 `tier: integration` gate at `severity: error` | PASS | Verified by executing `adev domain load-gates`: emitted `{"id":"integration-test","severity":"error","tier":"integration"}` |
| 4 | Both extension overlays yield an integration-tier gate | PASS | Both overlay files above, plus `tests/domains/starter-integration-tier.test.mjs` (13/13 pass) |
| 5 | `gate doctor` runs command-level checks on argv gates; no `empty-command` for an argv gate | PASS | `tests/lib/gates/doctor.test.mjs:210,764,821` |
| 6 | `gate doctor` on a fresh scaffold with new defaults exits 0, zero error findings | PASS | `tests/domains/starter-integration-tier.test.mjs` — 13 pass, 0 fail |
| 7 | `/adev:init` Step 7a documents seeding both tiers in argv form | PASS | `skills/init/SKILL.md:215-219` — names the no-op-if-absent idiom explicitly |
| 8 | `/adev:implement` Step 2-post sources integration gates from the merged list | PASS | `skills/implement/SKILL.md:597,600` — uses `adev domain load-gates`, and states it is the same source `/adev:validate` Check 1 uses |
| 9 | Step 2-post skips empty/non-argv commands with a named reason, executing nothing | PASS | `skills/implement/SKILL.md:601` — argv guard with named skip reason; correctly notes the merged list drops `kind`, so requiring a literal `kind: deterministic` would skip every integration gate |
| 10 | `docs/governance.md` documents the default and graduation path in one scoped section | PASS | One new `##` section (`The gate schema in gates.yaml`) with six `###` children including `command is argv-only`, `What a new scaffold ships`, `Graduating it` |
| 11 | This repo's own `governance/gates.yaml` is **not** modified | PASS | `git diff a810e462..HEAD -- .context-index/governance/gates.yaml` → empty |
| 12 | All quality gates pass | PASS | Check 1 above |
| 13 | No constitutional violations introduced | PASS | Check 4 below |

### Constitution compliance — PASS

- **Minimise external dependencies** — PASS. `package.json` dependency diff is empty.
- **Version parity** — PASS, and correctly *unbumped* at `0.27.8` across all three manifests.
  Per ADR-0008 release-please owns versions; a manual bump in a feature PR is the defect,
  not the omission.
- **Pure ESM / no inline-Node in SKILL.md** — PASS. `skills/init/SKILL.md` and
  `skills/implement/SKILL.md` contain no `node -e`, `node --input-type=module`, or
  `Run inline Node` patterns.
- **Architecture boundaries** — PASS. No new skill in the lifecycle order, no hook-protocol
  change, no CLI install-path change, no plugin-registration change.

## Check 1.5 / 1.6 / 8 / 9 — SKIP
Skipped — quick rigor tier.

## Check 11: Visual Verification — SKIP
No UI files in the implementation diff (Case A of the trigger-guard matrix). Diff contains
only `.mjs`, `.md`, and `.yaml` files.

---

## Findings (non-blocking)

**1. This repo's own `governance/gates.yaml` uses string-form `command` and is silently
skipped by the merge.** `adev domain load-gates` emits `INVALID_GATE` for gate `test`
(`command: "npm test"` at `.context-index/governance/gates.yaml:28`). **This is pre-existing,
not a regression:** `lib/domains/merge-gates.mjs` is untouched by this branch, and the
argv-only rejection is already present on `main` (`merge-gates.mjs:34-37`). It is also
deliberate — AC11 and Open Question 1 explicitly require this file to be left alone. The
practical effect is currently masked because the software domain default (`quality-gate`)
also runs `npm test`, so the suite still executes. Worth a human decision separately: the
header comment in that same file still documents `command: Shell command to execute`, which
implies the string form the loader now rejects.

**2. `splitOnOperators` behaviour change is broader than the task required.** It now ignores
quoted operator tokens for *every* command, including existing string-form gates, not only
the new argv-form ones. The implementer flagged this rather than letting it be discovered,
and pinned the prior behaviour with a negative-control test (`cd dist && npm test` still
splits). Blast radius is narrow: only a token whose entire value is exactly `&&`/`||`/`;`/
`|`/`&` *and* that arrived quoted. Assessed as a strict improvement, adequately covered.

**3. Spec/code drift in already-merged code.** `gate-doctor.spec.md` Behavior 3 still
describes the pre-change `empty-command` semantics. That spec belongs to issue-552, which is
merged to `main`. Out of scope here (a sibling-spec edit the plan already flags as a note),
but it is real drift against shipped code and should be reconciled.

---

**Summary:** 2 checks passed (Check 1; synthesized Check 2+4), 0 failed, 5 skipped
(1.5, 1.6, 8, 9 — quick tier; 11 — no UI files). 3 non-blocking findings recorded. No
blocking failures.
