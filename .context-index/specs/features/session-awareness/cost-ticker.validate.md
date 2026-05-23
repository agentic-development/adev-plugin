# Validation Report: Per-Spec Cost Ticker

> **Date:** 2026-05-22
> **Spec:** .context-index/specs/features/session-awareness/cost-ticker.spec.md
> **Plan:** .context-index/specs/features/session-awareness/cost-ticker.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS

- Tests (`npm test`): PASS — 4087/4087 passing, 2 todo, 0 failed (duration 196.9s)
- Domain gate set: `software` (resolved_domain: software, source_level: default)
- Tier summary: fast — `npm test` — PASS

## Check 1.5: Source Manifest Verification — PASS

- CLI: `adev source-manifest verify --spec .context-index/specs/features/session-awareness/cost-ticker.spec.md`
- Result: `Check 1.5: PASS — source manifest matches (sha: 93e83cd)`
- 9 files stamped: `cli/index.mjs`, `lib/cli/cost.mjs`, `lib/cost-formatters.mjs`, `lib/cost-summary.mjs`, `skills/build/SKILL.md`, `tests/cli/cost-summary.test.mjs`, `tests/lib/cost-formatters.test.mjs`, `tests/lib/cost-summary.test.mjs`, `tests/skills/build/cost-ticker-prose.test.mjs`
- All files verified committed (latest commits between `4444b812` and `c9be2efa`)

## Check 1.6: Code-Side Drift Warning — PASS

- CLI: `adev verify spec --spec ... --check-drift` returned `{"drifted":false,"drift_source":null,"drift_at":null}`
- No drift detected.

## Check 2: Spec Compliance — PASS

Evidence is grounded in reads of the actual files (`lib/cost-summary.mjs`, `lib/cost-formatters.mjs`, `lib/cli/cost.mjs`, `cli/index.mjs`, `skills/build/SKILL.md`, all four test files).

- **AC: `adev cost summary --spec <fixture>` matches hand-computed totals:** PASS — `tests/lib/cost-summary.test.mjs:148` exercises the deterministic-fixture path; `aggregate()` in `lib/cost-summary.mjs:308` sums per-field via `addUsage()` (line 94).
- **AC: `--format json` matches Behavior 3 schema:** PASS — `formatJson()` in `lib/cost-formatters.mjs:145` emits `{spec, issue_id, totals, checkpoints, model_breakdown, skipped_lines}`; precision preserved by aggregator (`round6` / `round3` at lines 75-81).
- **AC: `--include-checkpoints` text output contains per-checkpoint + `total` row:** PASS — `formatText()` lines 111-133 build the table with a `total` row appended.
- **AC: Missing JSONL produces "no usage data yet" / null totals; exit 0:** PASS — `aggregate()` returns `totals: null` when JSONL is absent (line 428); `formatText` line 88 emits the sentinel; CLI exits 0 (`lib/cli/cost.mjs:231`).
- **AC: `--quiet` with no data → zero output, exit 0:** PASS — `lib/cli/cost.mjs:202-205` short-circuits when `noData && v.quiet`.
- **AC: `--since` and default resolution:** PASS — explicit `--since` validated at `lib/cli/cost.mjs:125-131`; default resolves to most-recent `review:started` via `defaultSinceFromReview()` in `lib/cost-summary.mjs:289`.
- **AC: `--spec` + `--epic` → exit 1 / CONFLICTING_FILTERS:** PASS — `lib/cli/cost.mjs:113-116`; covered by test at `tests/cli/cost-summary.test.mjs:43`.
- **AC: Malformed JSONL lines skipped + stderr note:** PASS — aggregator increments `skipped_lines` on parse error (`lib/cost-summary.mjs:369`) and oversize (line 422); CLI emits `(note: skipped N malformed lines)` at `lib/cli/cost.mjs:219`.
- **AC: `ADEV_BUILD_TICKER=1` → stderr with `[cost]` prefix:** PASS — `lib/cli/cost.mjs:188-191`; covered by `tests/cli/cost-summary.test.mjs:78`.
- **AC: `/adev:build` SKILL.md calls verb after each step:** PASS — `skills/build/SKILL.md:294-308` is the new "Cost ticker between steps" section after each of review/plan/route/implement/validate.
- **AC: `/adev:build --auto` appends `--quiet`:** PASS — `skills/build/SKILL.md:301` shows the `--auto` branch with `--quiet`.
- **AC: `build.cost_warn_usd` threshold emits one stderr line per crossing; invalid value suppresses:** PASS — `lib/cli/cost.mjs:225-229` (sticky-per-build dedup intentionally pushed to orchestrator per SA-1); invalid handling at `lib/cli/cost.mjs:197-199`; tests at `tests/cli/cost-summary.test.mjs:138` and `:157`.
- **AC: Read-only contract — `.context-index/` snapshot diff is empty:** PASS — `tests/cli/cost-summary.test.mjs:209` (Task 6 integration test).
- **AC: `npm test` passes:** PASS — see Check 1.
- **AC: No constitutional violations:** PASS — see Check 4.

Test integrity: assertions are strict (`assert.equal`, `assert.match` against explicit fixtures); no loose matchers, no conditional skips, no always-true assertions found in any of the four new test files.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** PASS — no new dependencies; no protected boundary crossed (no new skill in lifecycle order, no hook-protocol change, no install-path change, no plugin.json change). Implementation lives in `lib/`, CLI verb registered in `cli/index.mjs:1531`, build prose updated — all autonomous-scope changes.
- **Non-negotiable principles:** PASS
  - P1 (minimize external deps): only Node.js built-ins used (`node:fs`, `node:path`, `node:util`).
  - P2 (skills primarily markdown): `skills/build/SKILL.md` additions are descriptive prose pointing to the `adev cost summary` verb; no executable logic embedded.
  - P3 (pure ESM): all three new lib files use `import`/`export`; no `require`/`module.exports` (verified via grep).
  - P4 (hook protocol): N/A — no hook changes.
  - P5 (version parity): not touched in this spec.
- **Coding standards:** PASS — camelCase functions, kebab-case files (`cost-summary.mjs`, `cost-formatters.mjs`, `cost-ticker-prose.test.mjs`); built-ins before relative imports; `process.exit(1)` for argument errors.

## Check 8: Boundary Compliance — N/A

`.context-index/governance/boundaries.yaml` declares `boundaries: []` (empty list with documentation-only example comments). No rules to evaluate.

## Check 9: Transition Gates — N/A

`.context-index/governance/gates.yaml` declares `transitions: {}` (no transitions configured). SKIP.

## Check 11: Visual Verification — N/A

No UI files in implementation diff (no `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, or files under `components/`, `pages/`, `views/`, `public/`, `app/**`). Per the Check 11 trigger guard (Case A), visual verification is not applicable.

---

**Summary:** 8 checks dispatched, 6 PASS, 2 N/A, 0 FAIL, 0 SKIP. Quality gates green (`npm test` 4087/4087). Source manifest sha matches across 9 files; no code-side drift. All 15 acceptance criteria from the spec verified against actual file contents with file:line citations. Constitution compliance verified across all five non-negotiable principles. No governance boundary rules or transition gates configured (N/A).

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
