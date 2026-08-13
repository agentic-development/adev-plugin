---
spec: .context-index/specs/features/maintenance/hygiene-test-debt.spec.md
charter: maintenance
date: 2026-08-13
tier: quick
status: PASS
validated-revision: 5
---

# Validation Report: Test-Debt Audit Pass for /adev:hygiene

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/maintenance/hygiene-test-debt.spec.md` (rev 5)
> **Plan:** none — task map authored inline in the spec (8 tasks)
> **Rigor tier:** quick (operator-selected; risk flagged and accepted before work began)
> **Overall Status:** PASS

---

## Lifecycle note (read this first)

`/adev:build` was not used. The arc ran as `/adev:specify` → `/adev:review-specs --tier quick`
→ inline plan/implement → `/adev:validate --tier quick`. Plan and implement were driven
directly by the delivering agent rather than dispatched as subagents, because the issue
board resolves to a different worktree (`/Users/dpavancini/Development/adev-plugin`) and
`/adev:plan` writes to it automatically when `tasks.backend` is configured — which this
run was forbidden to do. The `plan` and `implement` lifecycle events carry notes recording
this. No `.plan.md` artifact exists; the spec's Actionable Task Map is the plan of record
and every commit carries `Spec:` / `Plan-task:` trailers.

## Check 1: Quality Gates — PASS

- `npm test` (fast tier, `governance/gates.yaml:24`): **PASS** — 5590 tests, 5588 pass,
  0 fail, 2 todo.

**Flakiness note.** An intermediate full-suite run reported 6 failures, all in files this
change never touches: three `adev diagnose` timing assertions, one
`adev verify spec --check-drift` <100 ms budget, and two provider-install tests that took
49 s and 154 s. Each was re-run in isolation with the change present and passed. Two
sibling agents were running concurrently in other worktrees; these are load-sensitive
performance assertions, not regressions. The final full run is clean.

## Check 2 + Check 4: Synthesized Compliance — PASS (after remediation)

A quick-tier synthesized reviewer ran spec compliance and constitution compliance in one
pass and returned **FAIL** with three proven defects. All are now fixed or explicitly
scoped out, and the spec was revised to rev 5 to match reality.

### Acceptance criteria

| Criterion | Verdict | Evidence |
|---|---|---|
| Verb exists, registered, exits 0 clean and with findings | PASS | `cli/index.mjs:1744`; `tests/cli/test-debt.test.mjs` |
| Five detector codes, individually selectable | PASS | `lib/hygiene/test-debt.mjs:22-28`; `lib/cli/test-debt.mjs:93-96` |
| Never writes/deletes/rewrites a scanned test file | PASS | Only `readdirSync, readFileSync, lstatSync, existsSync` imported; no write surface exists |
| Dogfood produces non-zero APPEND_CHAIN / PLAN_TASK_STRUCTURED / PROSE_ASSERTION | PASS | See numbers below; asserted by two dogfood tests |
| SKILL.md documents Pass 23, `test-debt` in `--check`, four prose sites → 23, no inline Node | PASS | `skills/hygiene/SKILL.md:3, 8, 12, 13, 42, 1105`; provider mirrors identical |
| Drift-pass test updated 22 → 23 + enum assertion | PASS | `tests/skills/hygiene-test-policy-drift-pass.test.mjs` |
| Charter no longer claims 11 passes, carries Capability Map | PASS | `charter.md` rev 2 |
| `coverage_exclude` NOT applied; test asserts non-zero `scannedFileCount` | PASS | Key absent from `discoverTestFiles`; test at `tests/lib/hygiene-test-debt.test.mjs` |
| Walk does not descend symlinked directories | PASS | `lib/hygiene/test-debt.mjs:202`; covered by test |
| Manifest keys optional; documented defaults asserted | PASS | 4 of 6 value-asserted, 2 behaviourally exercised |
| No composite score, no defect-asserting language | PASS | Zero hits for `score`/`broken`/`must fix`; CLI prints "heuristic candidates for human review, not defects" |
| All quality gates pass | PASS | See Check 1 |
| No constitutional violations | PASS | See below |

### Constitution compliance

| Item | Verdict |
|---|---|
| Zero new external dependencies | PASS — `package.json` / `plugin.json` diff is empty |
| Pure ESM `.mjs` | PASS |
| No inline Node in `skills/hygiene/SKILL.md` | PASS — direct pattern scan for all three forbidden patterns returns zero hits in the canonical file and both provider mirrors. Pass 23 names `adev test-debt scan`. |
| No H3 containing both inline-Node and `adev <verb>` | PASS (vacuously — no inline-Node patterns exist) |
| Naming: camelCase functions, kebab-case files | PASS |
| No version bump (ADR-0008) | PASS — empty diff |

### Defects found and remediated (spec rev 5)

| ID | Defect | Disposition |
|---|---|---|
| D1 | The CLI hands the pass `manifest: null`, never `undefined`, so the documented missing-manifest degrade note was **unreachable on every real CLI run**. Proven empirically. | **Fixed** in `lib/hygiene/test-debt.mjs`; covered by a lib test and a CLI-level test. |
| D2 | Behavior 12 required independent project-root resolution and a `PROJECT_ROOT_UNRESOLVED` code. No verb in this repo does its own root resolution — `cli/index.mjs` supplies `process.cwd()` to all 30+ verbs. | **Scoped out**, spec narrowed. Changing shared driver substrate for one advisory pass is the wrong blast radius. Handed to a human as Open Question 4. |
| D3 | `maskTemplateLiterals` desynced on a stray backtick in a comment or quoted string, silently blinding Class A extraction for the rest of the file — a false **negative**, so the pass looked clean while seeing nothing. 8 real test files have odd backtick counts. Proven empirically. | **Fixed** — the scanner now tracks line comments, block comments, and quoted strings. Three regression tests added. |
| D4 | A fourth anchor class `literal` existed in code but not in the spec's anchor table. | **Documented** in rev 5. Zero observed false positives. |
| D6 | `--root` naming a path inside the root that does not exist raised `PATH_OUTSIDE_ROOT`, claiming a containment violation that never occurred. | **Fixed** — now `INVALID_ROOT`, with a test asserting the codes are not conflated. |
| D5 | Test-integrity observations: dogfood test omitted `PLAN_TASK_STRUCTURED`; one decorative assertion could never fail. | **Fixed** — assertion added, decorative one removed. |

Two `D5` items are accepted as-is: the `… and N more` cap path has no test, and Class B
extraction reads unmasked source while Class A reads masked source (spec rev 4 says
"before Class A extraction", so this is compliant, but the asymmetry is undocumented).

---

## Dogfood result — this repository

The spec requires the pass be run against this repo and the numbers recorded, on the
principle that a zero result is evidence the detection is wrong rather than evidence the
repo is clean.

```
verdict: WARN   scannedFileCount: 455

APPEND_CHAIN          30
REV_NUMBERED           0
PLAN_TASK_STRUCTURED  19
DEAD_TEST_REFERENCE    0
PROSE_ASSERTION       25
```

Largest append chains: `lib/issues/json-adapter.mjs` (23 test files),
`lib/lifecycle-state.mjs` (22), `lib/governance/validate-config.mjs` (10),
`lib/extensions/install.mjs` (8), `lib/migrate-state-artifacts.mjs` (7).

`REV_NUMBERED: 0` and `DEAD_TEST_REFERENCE: 0` are genuine — this repo has no
rev-numbered test filenames, and no resolvable dead references survive the anchor rules.

**The 25 `PROSE_ASSERTION` files are not the ~103-109 quoted in the audit.** 115 test
files reference `SKILL.md` and 227 reference a `.md` path, but only 25 also clear the 0.5
containment-assertion ratio. The audit's figure counted files that *touch* markdown; this
pass counts files whose *assertions* are predominantly markdown containment. The lower
number is the more defensible one. Remediation of those files is issue-557's territory,
not this change's.

Three false-positive classes were found by dogfooding and closed **before** the pass was
wired into hygiene: fixture-tree anchors reduced to bare literals, loop variables collapsed
into phantom paths, and fixture source-code strings read as real imports.

---

**Summary:** 2 checks passed, 0 failed. Checks 1.5, 1.6, 8, 9 skipped — quick rigor tier.
Check 11 (visual verification) N/A — no UI files in the diff.
