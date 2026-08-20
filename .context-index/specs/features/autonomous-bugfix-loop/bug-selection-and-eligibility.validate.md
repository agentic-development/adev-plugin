---
artifact: validate
spec: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
plan: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.plan.md
date: 2026-08-20
tier: full
verdict: PASS_WITH_NOTES
---

# Validation Report: Bug Selection Verb and Eligibility Filter

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
> **Plan:** .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.plan.md
> **Rigor Tier:** full (resolved: no `--tier` override, no routing "easy" signal; `risk_level: medium` → `risk-policies.yaml` → `policies.medium.validate_mode: full`)
> **Overall Status:** PASS_WITH_NOTES

---

## Check 1: Quality Gates — PASS_WITH_NOTES

Gate set resolved via `adev domain load-gates --module autonomous-bugfix-loop` (materialized `governance/gates.yaml`, software domain).

**Check 1a (fast tier):**
- `test` (`npm test`, severity: error): **PASS** — 7218 tests, 7216 pass, 0 fail, 2 pre-existing `todo` (unrelated to this spec — general test-quality-guard fixtures), duration 39.6s.
- `quality-gate` (`npm test`, severity: error): **PASS** — same command/result as above (duplicate gate definition, same `command_sha`).

**Check 1b (integration tier):**
- `integration-test` (`npm run test:evals`, severity: **warning**): **FAIL** (non-blocking) — 393 tests, 381 pass, 12 fail. All 12 failures are infrastructure-dependent: Postgres is not reachable on port 5433 in this worktree and the `pg` npm package is not installed (`ERR_MODULE_NOT_FOUND: Cannot find package 'pg'`), causing cascading failures in `tests/orders.integration.test.mjs`, `tests/evals/integration-sandbox/*` (build-without-db, reality-check phases), and the "Tier 2 / context-pack" fenced-target eval. None of the 12 failing tests touch `lib/issues/eligibility.mjs`, `lib/cli/issues-next.mjs`, or any other file in this spec's source-manifest. Because `integration-test` is `severity: warning`, this does not block Check 1 or the aggregate verdict — but it is not silently ignored either: recorded here as a genuine FAIL against a pre-existing environmental gap (missing Postgres/`pg` in this worktree), not caused by this spec's implementation.

**Check 1c (e2e tier):** no gates assigned — skipped ("e2e tier — no gates configured, skipped").

**Per-Gate Outcome Attestation:** emitted via `adev report --type validator --validator validate.check-1-quality-gates --gate-outcomes @.claude-tmp-gate-outcomes.json --manifest-sha 5545be7` — `{test: pass, quality-gate: pass, integration-test: fail}`, each carrying its resolved `command_sha`.

Raises the check from PASS to **PASS_WITH_NOTES** (warning-severity tier failure).

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify --spec <spec-path>` → `Check 1.5: PASS — source manifest matches (sha: 5545be7)`.

Implementation-existence check (git-tracked, per file in the manifest):

| File | Committed in |
|---|---|
| docs/cli-reference.md | b5d7901f |
| lib/cli/issues-next.mjs | b5d7901f |
| lib/cli/issues-stale.mjs | b5d7901f |
| lib/cli/issues.mjs | b5d7901f |
| lib/issues/eligibility.mjs | 5f3b2b6b |
| lib/issues/interface.mjs | b5d7901f |
| templates/manifest-template.yaml | b5d7901f |
| tests/issues/next.test.mjs | b5d7901f |

All 8 listed files are committed to git — no untracked/staged-only source files.

## Check 1.6: Code-Side Drift Warning — PASS

`adev verify spec --spec <spec-path> --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`. No drift detected.

## Check 2: Spec Compliance — PASS

Dispatched as a subagent-review check (per-criterion, file:line-cited). Full findings:

- **BEH-1** (highest-priority eligible bug or `{"bug": null}`) — PASS. `lib/issues/eligibility.mjs:211-236` (`selectNextEligibleBug`), `lib/cli/issues-next.mjs:103-117`. Tested `tests/issues/next.test.mjs:319-330`.
- **BEH-8/P0-P4↔0-4 mapping** — PASS. `lib/issues/eligibility.mjs:27` (`PRIORITY_LABEL_TO_NUMBER`). Tested `:53-56`, `:40-51`.
- **P0/P1 safety boundary (never returned regardless of flags)** — PASS. `lib/issues/eligibility.mjs:216-217` (floor check independent of `maxPriorityBound`). Tested `tests/issues/next.test.mjs:197-204` — deliberately seeds `maxPriorityBound: 3` (which would numerically admit P0/P1) to prove the floor is a real boundary, not a default.
- **BEH-10 (fail-closed, no `affected_modules`)** — PASS. `lib/issues/eligibility.mjs:117`. Tested `:83-87` (both `undefined` and `[]`).
- **BEH-6 (multi-module blast radius excluded)** — PASS. `lib/issues/eligibility.mjs:118`. Tested `:66-69`.
- **BEH-7 (reserved/manifest-excluded modules excluded unconditionally)** — PASS. `lib/issues/eligibility.mjs:87,96-100,120-121`. Tested `:71-76` (all 4 reserved tags), `:78-81` (manifest-configured).
- **BEH-11 (unrecognized slug fail-closed)** — PASS. `lib/issues/eligibility.mjs:122-123`. Tested `:89-92`.
- **`set-modules` round-trip** — pre-checked in spec (out of this plan's scope; verified by prior revision's `tests/issues/set-modules.test.mjs`/`tests/issues/beads-adapter.test.mjs`, not re-verified here).
- **BEH-3 (non-expired lease excluded)** — PASS. `lib/issues/eligibility.mjs:146-151` (`isLeaseExcluded`), composed at `:219`. Tested `:108-132`. Note: only unit-level coverage exists for the claimed-bug scenario — no CLI end-to-end test for it. Minor gap, not a failure.
- **BEH-4 (blocked bugs excluded)** — PASS. `lib/issues/eligibility.mjs:172-178` (`hasOpenBlockingDependencies`), composed at `:220`. Tested at predicate (`:134-149`), composition (`:206-216`), and CLI end-to-end (`:332-340`) levels.
- **BEH-5 (attempt-cap exact 3-value exclusion set, zero-attempts default)** — PASS. `lib/issues/eligibility.mjs:181,191-194`. Tested `:152-159`, composition `:229-237`.
- **BEH-2 (FIFO tie-break)** — PASS. `lib/issues/eligibility.mjs:228-233`. Tested `:182-189`.
- **Error Cases (`UNSUPPORTED_TYPE`, `INVALID_PRIORITY_BOUND`, `ISSUE_BOARD_NOT_CONFIGURED`)** — PASS. `lib/issues/eligibility.mjs:42-61,70-79`, `lib/cli/issues-next.mjs:54-64`. CLI end-to-end tested `:305-317`, `:299-303`.
- **All quality gates pass (`npm test`)** — PASS (see Check 1).
- **No constitutional violations** — PASS (see Check 4).

**Test integrity:** no loose matchers, conditional skips, or tautological assertions found. The P0/P1 floor test and the full-board dependency test are explicitly constructed as single-candidate fixtures so a false negative cannot be masked by another eligible bug winning the tie-break.

**Scope Expansion Sub-Finding:** None. Two files beyond the plan's own Task 1-5 Create/Modify list were touched (`lib/issues/interface.mjs`, `lib/cli/issues-stale.mjs` — a dedup refactor extracting `resolveClaimTtlMinutes`), but both are explicitly present in the spec's `source-manifest.files` (8/8), so this is in-scope, not scope expansion. Other diffed files belong to the sibling `per-issue-attempt-cap` spec and the already-shipped `set-modules` producer work.

## Cross-Repo Dependency Validation — N/A

No workspace detected (`lib/workspace.mjs`; no workspace config file at project root) and the spec carries no `depends-on` cross-repo references. Workspace-aware validation mode not entered.

## Check 4: Constitution Compliance — PASS

Dispatched as a subagent-review check with the Evidence Contract (file:line or grep + rationale for every finding).

- **Architecture Boundaries: PASS** — `git diff HEAD~10 -- package.json` empty (no dependency change); imports across all touched files are `node:util`/relative only (`lib/issues/eligibility.mjs:22`, `lib/cli/issues-next.mjs:16-25`). `lib/cli/issues.mjs`'s new `next` dispatcher branch mirrors the pre-existing `stale`/`set-modules` pattern exactly — no hook-protocol, CLI-install-path, or plugin-registration change.
- **Non-Negotiable Principles: PASS** — Minimize dependencies (empty package.json diff); Pure ESM (import/export throughout, zero `require`/`module.exports` matches); Skills-primarily-markdown and Hook-protocol-compliance N/A (no SKILL.md or hooks/ file touched); Version parity PASS (no package.json/plugin.json bump in the diff).
- **Coding Standards: PASS** — kebab-case filenames (`eligibility.mjs`, `issues-next.mjs`, `next.test.mjs`), camelCase exports (`resolvePriorityBound`, `isModuleEligible`, etc.), Node-builtins-first import ordering in `issues-next.mjs:16-25`, no hardcoded `~/.claude/` paths (zero grep matches).
- **Commit trailer compliance: PASS** — all five feat commits (c3fe604f, 3922bff8, 64e3959f, 5f3b2b6b, b5d7901f) carry `Spec:` and `Plan-task: N` trailers per `git log -1 --format=fuller`.

## Check 8: Boundary Compliance — PASS

`adev boundaries check --json` → verdict `PASS`, reason: "no boundary violations in 258 changed file(s) against 3 rule(s)". `findings: []`. One rule disabled (`no-manual-version-bump`, reason: "the boundary evaluator matches file content, not diffs..." — pre-existing, unrelated to this spec). No registry warnings.

## Check 9: Transition Gates — PASS

`adev gate transitions --transition implement-to-validate --spec <spec-path> --json` → verdict `PASS`, reason: "every required gate has a fresh, attested, passing outcome". `test`: `recorded-pass`, `command_attested: true` (resolved after Check 1's `gate_outcomes` attestation landed in the lifecycle log).

## Check 11: Visual Verification — SKIP (N/A)

No UI files in the spec's source-manifest (`docs/cli-reference.md`, `lib/cli/issues-next.mjs`, `lib/cli/issues-stale.mjs`, `lib/cli/issues.mjs`, `lib/issues/eligibility.mjs`, `lib/issues/interface.mjs`, `templates/manifest-template.yaml`, `tests/issues/next.test.mjs` — no `.tsx`/`.jsx`/`.vue`/`.svelte`/`.css`/`.scss`/`.html`, no `components/`/`pages/`/`views/`/`public/`/`app/**/page.*`). Case A of the trigger-guard matrix: "No UI files in implementation diff — visual verification not applicable."

---

**Summary:** 6 passed, 0 failed, 1 passed-with-notes, 1 skipped (N/A) checks. Check 1's integration tier (`npm run test:evals`, severity: warning) failed 12/393 tests due to a pre-existing environmental gap in this worktree (Postgres unreachable on port 5433, `pg` package not installed) — unrelated to any file in this spec's implementation and non-blocking per its declared severity. All spec-relevant behaviors (BEH-1 through BEH-11), the constitution, boundaries, and transition-gate attestation are green.

**Observation (non-blocking, out of this check-set's scope):** every `validator_report`/`step` event emitted during this run carries a `diagnostic_warnings: ["adev/frontmatter-present"]` annotation. This fires because both the spec and plan files begin with a leading `<!-- partial_schema: ... -->` HTML comment before the `---` frontmatter delimiter, which `lib/diagnostics/tier1/frontmatter-present.mjs` treats as a violation (it tolerates leading blank lines but not a leading comment). This preamble comment is a repo-wide convention present in essentially every `.spec.md`/`.plan.md`/`.charter.md` file inspected in this run (not something introduced by this spec's implementation), and it does not affect the computed aggregate verdict. Flagged here for `/adev:hygiene` or a follow-up issue, not treated as a validate-check failure.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.
