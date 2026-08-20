---
kind: validate
spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
plan: .context-index/specs/features/eval-harness/scoring-engine.plan.md
charter: eval-harness
date: 2026-08-20
rigor_tier: quick
status: FAIL
---

# Validation Report: Rubric scoring engine and adev eval score verb

> **Date:** 2026-08-20
> **Spec:** `.context-index/specs/features/eval-harness/scoring-engine.spec.md`
> **Plan:** `.context-index/specs/features/eval-harness/scoring-engine.plan.md`
> **Rigor tier:** `quick` (explicit `--tier quick`) — Check 1 plus one synthesized spec+constitution compliance check; Checks 1.5, 1.6, 8 and 9 skipped by tier.
> **Overall Status:** FAIL

Registry loaded from `.context-index/governance/validate.yaml` with no warnings.
Domain resolved: `software` (source level: project). Workspace: none detected.
Infrastructure preflight: PASS (spec declares no `infra_requirements`).

---

## Check 1: Quality Gates — PASS (with notes)

Gate set resolved from the project's materialized `.context-index/governance/gates.yaml` via `adev domain load-gates --module eval-harness`.

### Check 1a — fast tier: PASS

| Gate | Command | Result |
|---|---|---|
| `test` | `npm test` | **PASS** (28.3s) — 7272 tests, 7270 pass, 0 fail, 2 todo, 989 suites |
| `quality-gate` | `npm test` | **PASS** (32.4s) — identical counts |

### Check 1b — integration tier: WARN (severity `warning`, non-blocking)

| Gate | Command | Result |
|---|---|---|
| `integration-test` | `npm run test:evals` | **FAIL** — 393 tests, 381 pass, **12 fail** |

The 12 failures are **pre-existing and unrelated to this spec**. None of the failing files
appear in `git diff 07b5ab04~1..HEAD`:

- `tests/evals/integration-sandbox/build-with-db.test.mjs` (6), `build-without-db.test.mjs` (2),
  `reality-check.test.mjs` (3) — all require PostgreSQL on port 5433, which is not running in
  this environment. These tests correctly **fail hard** rather than skipping, which is the
  intended project policy; they are not being suppressed here, they are being reported.
- `tests/evals/configurable-governance/tier2-dispatch-shape.test.mjs` (1) — governance
  dispatch-shape eval, last touched by `631a12ad` / `734ea5a9`, unrelated to eval-harness.

Because the gate's declared severity is `warning`, Check 1 does not block and validation
proceeded to the compliance check. **This does not excuse the failures** — they are real and
should be triaged separately (infra for the sandbox suite; a genuine regression triage for
`tier2-dispatch-shape`).

### Check 1c — e2e tier: SKIP

e2e tier — no gates configured, skipped.

**Per-gate attestation** emitted on one `validator_report` (`validate.check-1-quality-gates`)
carrying `gate_outcomes` for all three gates with their loader-computed `command_sha`, and
`--manifest-sha ca85164`.

---

## Check 2: Spec Compliance — FAIL

Every behavioral criterion BEH-1 … BEH-10 was verified against files read in this run.
All ten pass on their own terms. The FAIL is an **integration defect between BEH-9 and Task 11**
that no single criterion owns.

| Criterion | Verdict | Evidence |
|---|---|---|
| BEH-1 — verdict table + two distinct halves; blended total only when both numeric, rounded once, capped | PASS | `lib/evals/score.mjs:499-571`, halves 532-548, total 554-560; `buildVerdictTable` 421-434. Tests: `tests/lib/evals/score-result-assembly.test.mjs:14-43`, `score-tally.test.mjs:48-57` |
| BEH-2 — `not_applicable` out of element denominator, `unknown` out of criterion denominator | PASS | `lib/evals/score.mjs:318-326`; call sites 510-517. Tests: `score-tally.test.mjs:9-34`, `:36-46` |
| BEH-3 — two-clause insufficient-evidence rule; deterministic half unaffected; no blended total | PASS | `lib/evals/score.mjs:389-402`; independent resolution 537-548. Tests: `score-insufficient-evidence.test.mjs:12-21`, `:23-33`, `:35-48`, `:50-60` |
| BEH-4 — nothing to answer ⇒ `NOT_SCORED`, no NaN reaches the caller | PASS | `lib/evals/score.mjs:390`, `:392-394`. Tests: `score-not-scored.test.mjs:8-51` |
| BEH-5 — `met`/`not_met` with empty evidence ⇒ `SCORE_EMPTY_EVIDENCE` | PASS | `lib/evals/score.mjs:254-260`, `isEmptyEvidence` 180-182. Test: `score-verdict-validation.test.mjs:17-29` |
| BEH-6 — unknown id / missing id rejected | PASS | `lib/evals/score.mjs:236-242`, `:265-272`. Test: `score-verdict-validation.test.mjs:31-42` |
| BEH-7 — `buildJudgeContext` allow-list isolation | PASS | `lib/evals/score.mjs:626-651`, guard 642-645. Test: `score-judge-context.test.mjs:42-76` |
| BEH-8 — table always accompanies aggregate; status half by name, never `0` | PASS | `lib/cli/eval.mjs:153-156`, `:167-172`, `:181-183`. Test: `tests/cli/eval-score.test.mjs:18-40` |
| BEH-9 — path containment on both flags before either file is opened | PASS | `lib/cli/eval.mjs:95-101`, called 218-219 **before** `readFileSync` at 223 |
| BEH-10 — bad threshold ⇒ `SCORE_INVALID_THRESHOLD` before tallying; `100` in range | PASS | `lib/evals/score.mjs:149-153`; ordering at `:500-502`. Tests: `score-rubric-and-threshold.test.mjs:9-39` |
| Status partition mutually exclusive and exhaustive over the zero-denominator case | PASS | `lib/evals/score.mjs:389-402`; machine-checked sweep at `score-status-partition.test.mjs:25-41` |
| Determinism / stable key order | PASS | "do not reorder" comments at `score.mjs:423-424, 530-531, 543-544, 564-565`; no clock, no RNG. Test: `score-result-assembly.test.mjs:51-56` |
| Zero new external dependencies | PASS | `git diff 07b5ab04~1..HEAD -- package.json package-lock.json` → empty |

### FAIL-1 (blocking) — `adev eval score` rejects the default rubric in every real installation

`skills/eval/SKILL.md:110-118` resolves the Layer 3 rubric, defaulting to
`<ADEV_ROOT>/skills/eval/default-rubric.yaml`. `skills/eval/SKILL.md:163-165` then instructs the
agent to pass **that resolved path** to `adev eval score --rubric`. BEH-9's containment
(`lib/cli/eval.mjs:218`) checks it against the **project root**. In any real installation
`<ADEV_ROOT>` is the plugin cache directory, outside the project — so the default path is refused.

Reproduced in this run against the installed plugin copy:

```
$ node cli/index.mjs eval score \
    --rubric /Users/dpavancini/.claude/plugins/cache/agentic-development/adev/0.28.0-next.4/skills/eval/default-rubric.yaml \
    --input tests/fixtures/evals/verdicts/complete.json
UNSAFE_SCORE_PATH: path "…/skills/eval/default-rubric.yaml" escapes the project root.
exit 1
```

The containment behaviour is exactly what BEH-9 mandates, and `loadRubric`'s own
`UNSAFE_RUBRIC_PATH` containment predates this spec. What is **new in this diff** is Task 11
wiring Layer 3's `<ADEV_ROOT>`-resolved default into a project-root-contained verb. The spec's
stated purpose — "`adev eval score` exposes that to both consumers — `/adev:eval` Layer 3 and the
`tests/evals/` suite" — is therefore unmet for Layer 3's default configuration.

No test covers this: every CLI test passes an in-repo relative path. In this repository
`ADEV_ROOT === projectRoot`, which is why the defect is invisible to the suite.

**Remedy (spec-level decision required, not an autonomous fix):** either teach `containPath` an
ADEV_ROOT-aware allowance for the shipped rubric, or change `skills/eval/SKILL.md` to copy /
reference the default rubric from inside the project. Either way the spec needs a criterion
covering the plugin-root case, plus a regression test.

### Scope expansion — WARN

1. **Two error codes ship that the spec's nine-row Error Cases table does not enumerate:**
   `SCORE_INVALID_VERDICT_CONTEXT` (`lib/evals/score-schema.mjs:79`, raised at
   `lib/evals/score.mjs:584-593`) and `SCORE_INPUT_PARSE_ERROR` (`score-schema.mjs:87`, raised at
   `lib/cli/eval.mjs:234-239`). Both close real silent-failure holes and both are defensible —
   but `score-schema.mjs:71-78` prescribes its own remedy: *"add a one-line row for it to the
   spec rather than dropping the check."* That row was never added.
2. `resolveHalfStatus` is a public export (`lib/evals/score.mjs:389`) though the charter's
   Exposed-APIs table names only `loadRubric`, `scoreRubric`, `buildJudgeContext`,
   `collectRunRecord`. Justified (it is what makes the exhaustive partition sweep testable) but
   undeclared.
3. The spec's `source-manifest` omits the 9 new files under `tests/fixtures/evals/**` and both
   provider mirrors (`providers/{codex,opencode}/skills/eval/SKILL.md`), all touched by this diff.
   Drift detection will not see them as spec-tracked. `adev source-manifest verify` still returns
   PASS (`sha: ca85164`) because it only checks listed files.

### Test integrity — no weakening found

Every assertion-touching edit in `git log 07b5ab04~1..HEAD` was inspected. Two commits modify an
earlier task's test; both are isolation, not loosening:

- `27a4765c` — Task 2's threshold test passed an empty verdict set that Task 3's new validation
  correctly rejects; the input became a complete valid set. Assertion shape unchanged.
- `c81a7e9b` — Task 4's denominator test moved from `conforming.yaml` (threshold 40) to
  `threshold-100.yaml` so a 50%-unknown share would not trip BEH-3 clause 2. Verified: the two
  fixtures differ **only** in comments and `insufficient_evidence_threshold_percent: 40 → 100`
  (identical budgets); the assertions `=== 15`, `=== 15`, `=== null` are byte-identical to the
  original; and coverage of the "50% unknown at threshold 40 ⇒ INSUFFICIENT_EVIDENCE" case is
  retained by `score-insufficient-evidence.test.mjs:12-21`. Nothing was lost.

Three minor weak assertions (advisory, non-blocking):

1. `tests/cli/eval-score.test.mjs:65` — `/SCORE_(EMPTY_EVIDENCE|MISSING_VERDICT|UNKNOWN_VERDICT_ID)/`
   over a deterministic fixture that can only produce `SCORE_UNKNOWN_VERDICT_ID`. This is the one
   assertion in the set that would pass under a wrong-error regression.
2. `tests/lib/evals/score-result-assembly.test.mjs:47-48` — `assert.ok(Array.isArray(…) && length > 0)`;
   near-tautological, though `:16` already pins `length === 4`.
3. `tests/cli/eval-score.test.mjs:39` — `assert.doesNotMatch(stdout, /judged\s*[:|]\s*0\b/i)` is
   hard to fail; the paired `assert.match(stdout, /NOT_SCORED/)` at `:38` carries the weight.

No conditional skips, no try/catch-wrapped assertions, no assertions on clock or random data.

---

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries: PASS.** No approval boundary crossed. No skill added to the
  lifecycle order; `.claude-plugin/plugin.json` untouched; no hook-protocol change (`hooks/`
  absent from the diff); no CLI install-path change; zero new external dependencies. The single
  `cli/index.mjs` edit is one `VERB_REGISTRY` row (`cli/index.mjs:1974`).
- **Non-negotiable principles: PASS.**
  - Dependencies — `git diff 07b5ab04~1..HEAD -- package.json package-lock.json` is empty;
    `lib/cli/eval.mjs:28-30` imports only `node:util`, `node:fs`, `node:path`.
  - Skills primarily markdown — the arithmetic moved **out** of `skills/eval/SKILL.md` into
    `lib/evals/score.mjs`, which is the constitution's stated intent.
  - Pure ESM — all changed source files are `.mjs` with `import`/`export`; no CommonJS.
  - Version parity — `package.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`
    all read `0.27.8` and none appears in the diff. No version bump in a feature PR (ADR-0008).
- **Coding standards: PASS.** camelCase functions, kebab-case files, node-builtins-first import
  ordering (`lib/cli/eval.mjs:28-35`), coded errors in the engine and `process.exit(1)` in the CLI.
- **SKILL.md anti-patterns: PASS.** No `node -e`, no `Run inline Node.js:` heading, no
  `node --input-type=module -e` heredoc in `skills/eval/SKILL.md`. No H3 section carries both an
  inline-Node block and an `adev <verb>` call (there are no inline-Node blocks at all). No
  ```` ```javascript ```` fence exists; the two added fences are ```` ```bash ```` (the verb
  invocation, `:163-165`) and ```` ```text ```` (`:173-180`, explicitly labelled *"Descriptive
  reference — what the verb computes, not an instruction to compute it yourself"*, carrying no
  control flow). `hooks/pre-commit-no-inline-node.sh` run independently over the canonical file
  and both provider mirrors: **exit 0**. Load Skill Extensions block present and untouched at
  `skills/eval/SKILL.md:65-71`.
- **Commit trailers: PASS.** All 12 commits in `07b5ab04~1..HEAD` carry
  `Spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md`. The 11
  implementation commits carry `Plan-task: 1` … `Plan-task: 11`, contiguous with no gaps. The
  12th (`ca32e1f3`, the status stamp) correctly carries `Spec:` without `Plan-task:`.

---

## Check 1.5: Source Manifest Verification — SKIP

Skipped — quick rigor tier. Run informationally: `adev source-manifest verify` returned
**PASS — source manifest matches (sha: ca85164)**, and all 17 listed files are git-tracked with
no uncommitted changes under `lib/`, `cli/`, `skills/`, `tests/`, `docs/`, `providers/`. See
Scope-expansion item 3 for the manifest's coverage gap.

## Check 1.6: Code-Side Drift Warning — SKIP

Skipped — quick rigor tier. See the drift note below.

## Check 8: Boundary Compliance — SKIP

Skipped — quick rigor tier.

## Check 9: Transition Gates — SKIP

Skipped — quick rigor tier.

## Check 11: Visual Verification — SKIP

No UI files in the implementation diff — visual verification not applicable. (Case A: no UI
files, no Playwright MCP.)

---

## Cross-repo dependency validation — N/A

No workspace detected; the spec declares no cross-repo `depends-on` references.

---

## Advisory: shared claim on `docs/cli-reference.md`

Task 10 added an `eval` row and an `### eval` section to `docs/cli-reference.md`. That file is
claimed by the `source-manifest` of **nine** specs, including
`.context-index/specs/features/implementation/batched-task-dispatch.spec.md`. The framework
therefore stamped a `code_drift_detected` event on that spec:

```
{"event":"code_drift_detected","drift_source":"docs/cli-reference.md","drift_at":"2026-08-20T16:28:59.323Z"}
```

**This is correct bookkeeping, not a problem.** The hook fired exactly as designed; the diff to
`docs/cli-reference.md` is purely additive (one table row plus a new section) and touches nothing
batched-related, so `batched-task-dispatch.spec.md` still describes its implementation
accurately. Its `drift_detected: true` flag was already set before this run by two earlier
events (2026-08-18, on `skills/implement/SKILL.md` and `lib/implement/batching.mjs`), so this run
did not newly flip it.

**No resolution of the shared claim is required for this spec to ship.** The structural
observation worth recording separately: a per-file source manifest over a shared aggregate
reference doc will emit a drift event on all nine claiming specs every time any one of them adds
its own section. That is systemic noise in the drift signal, not a defect in this
implementation, and is a candidate for a hygiene-level follow-up (e.g. section-scoped claims on
aggregate docs).

---

## Heuristics — prior occurrences of this failure

The following heuristics are lessons learned from past work in this module. Use them as guidance,
not as hard rules.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from `~/.claude/projects/` (`message.usage` fields). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observation

---

**Summary:** 2 passed (Check 1 with notes, Check 4), 1 failed (Check 2), 5 skipped
(1.5, 1.6, 8, 9 by quick tier; 11 not applicable).

Fix FAIL-1 and re-run: `/adev:validate --spec .context-index/specs/features/eval-harness/scoring-engine.spec.md`

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12 and 13 have been
> relocated by `check-set-restructure.spec.md`. See `/adev:review-specs` (ADR compliance,
> cross-cutting compliance, specialist review, charter consistency), `/adev:hygiene` Audit Pass 20
> (platform drift), `/adev:reconcile` lifecycle-sync (lifecycle reconciliation), and
> `hooks/post-validate-extract-heuristics.{sh,mjs}` (heuristic extraction). The gaps in the
> surviving inventory are intentional.
