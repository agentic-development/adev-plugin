---
kind: validate-report
spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
plan: .context-index/specs/features/eval-harness/scoring-engine.plan.md
charter: eval-harness
spec-revision: 9
rigor-tier: quick
head: e1f075d5
manifest-sha: 428bd5d
status: PASS
verdict: PASS_WITH_NOTES
date: 2026-08-20
---

# Validation Report: Rubric scoring engine and adev eval score verb

> **Date:** 2026-08-20
> **Spec:** `.context-index/specs/features/eval-harness/scoring-engine.spec.md` (revision 9)
> **Plan:** `.context-index/specs/features/eval-harness/scoring-engine.plan.md`
> **Rigor tier:** `quick` (explicit `--tier quick`) — Check 1 plus one synthesized spec+constitution compliance check; Checks 1.5, 1.6, 8, 9 and 14 recorded SKIP
> **HEAD:** `e1f075d5` · **Registry warnings:** none · **Workspace:** not detected
> **Overall Status:** PASS (with notes)

This is a **delta round**. The previous validate of this spec returned FAIL on a
reproduced defect: `adev eval score --rubric default` was refused on any real
install because `skills/eval/SKILL.md` passed an `<ADEV_ROOT>`-resolved path
while BEH-9 containment checks the **project** root. Spec revisions 6–9 added
BEH-11 (keyword resolution bounded by a module-derived plugin root, never an
environment variable) and BEH-12 (the skill passes the literal token). This
round implemented exactly that, in seven commits `15cbb37b..e1f075d5`.

---

## Check 1: Quality Gates — PASS (with a warning-severity integration failure)

Gate set resolved from the project's materialized `governance/gates.yaml` via
`adev domain load-gates --module eval-harness` (domain `software`, source level
`project`). No legacy `gates:` section in `manifest.yaml`.

### Check 1a — fast tier: PASS

| Gate | Command | Severity | Result |
|---|---|---|---|
| `test` | `npm test` | error | **PASS** (39.7 s) |
| `quality-gate` | `npm test` | error | **PASS** (same command, same run) |

`npm test`: **7294 tests, 7292 pass, 0 fail, 0 skipped, 2 todo.** The two todos
are pre-existing and unrelated to this spec.

### Check 1b — integration tier: WARN (non-blocking)

| Gate | Command | Severity | Result |
|---|---|---|---|
| `integration-test` | `npm run test:evals` | **warning** | **FAIL** (exit 1) |

381 pass / 12 fail across 116 suites. Every failure is pre-existing
infrastructure breakage unrelated to the eval-harness scoring engine:

- `PostgreSQL IS running on port 5433`, `seed data is loaded` — Postgres offline.
- `npm test exits with code 0`, `at least one test passed`, `zero tests failed`,
  `failure is a connection error, not a logic error`, `no test file uses skip
  guards for infrastructure`, `no test file uses describe.skipIf` — all inside
  the integration-sandbox fixture project, downstream of the offline Postgres.
- `detects spec as implemented with HIGH or MEDIUM confidence`, `evidence
  includes committed files`, `verifies spec, generates confidence note, produces
  audit trail` — reality-check fixture, same sandbox.
- `all three stages carry a nonce-fenced target spec…` — Tier 2 context-pack
  test, unrelated module.

None of the twelve touch `lib/evals/`, `lib/cli/eval.mjs`, or any file in the
spec's source manifest. Severity is `warning`, so Check 1 does not fail and
Checks 2/4 were not skipped.

### Check 1c — e2e tier

No gates configured for the e2e tier — skipped.

### Per-gate outcome attestation

Emitted once for the whole check, `--manifest-sha 428bd5d`:

| id | verdict | tier | command_sha |
|---|---|---|---|
| `test` | `pass` | fast | `527c484bcc3bb219e92ed61f99ff968f31143f89e53fda93d09b74c0ce3177d4` |
| `quality-gate` | `pass` | fast | `527c484bcc3bb219e92ed61f99ff968f31143f89e53fda93d09b74c0ce3177d4` |
| `integration-test` | `fail` | integration | `9e6a54d23534258f784b28304c370e52ef93b8fb94ddd7fb879938a6735e941e` |

---

## Check 2: Spec Compliance — PASS (with notes)

Every acceptance criterion in the spec's `## Acceptance Criteria` list was
verified against files read in this run. Full per-criterion evidence is in the
synthesized check's record; the criteria specific to this delta round are
restated here with the orchestrator's own independent verification.

### Delta-round criteria (BEH-11 / BEH-12)

- **`--rubric default` resolves the shipped rubric and succeeds even when the
  plugin root lies outside the project root (BEH-11): PASS.** Verified
  **end to end, outside the test suite**, by building a plugin root and a
  project root as sibling directories in a scratch area and invoking the real
  entrypoint: `--rubric default` exited 0 and printed the shipped rubric's
  eleven-row table and `deterministic: 10/10   judged: 12/15   total: 22/25`.
  Implementation: `lib/cli/eval.mjs:138-153` (`loadDefaultRubric`), branch at
  `lib/cli/eval.mjs:275-276`.
- **The plugin root is derived from the module's own location; no code path
  reads it from the environment (BEH-11): PASS.**
  `grep -n "process.env" lib/cli/eval.mjs` returns **nothing**. The root comes
  from `getPluginRoot()` at `lib/profiles/index.mjs:28-30`
  (`join(__dirname, "..", "..")`, `__dirname` from `import.meta.url`). A
  whole-file static guard exists at
  `tests/cli/eval-default-rubric-keyword.test.mjs:127-136`, asserted over the
  entire file rather than one code path.
- **A decoy `CLAUDE_PLUGIN_ROOT` does not redirect `--rubric default`: PASS.**
  Verified end to end: with both `CLAUDE_PLUGIN_ROOT` and `ADEV_ROOT` pointed at
  a decoy tree carrying a rubric at the exact relative path the keyword branch
  reads, the shipped rubric still loaded and the shipped table still printed.
- **`skills/eval/SKILL.md` and both provider mirrors pass the literal `default`
  (BEH-12): PASS.** `skills/eval/SKILL.md:171`,
  `providers/codex/skills/eval/SKILL.md:171`,
  `providers/opencode/skills/eval/SKILL.md:171` — all
  `adev eval score --rubric default --input <verdict file path>`.
- **The regression test runs through `dispatch()` with the plugin root outside
  the project root, and asserts the argument the skill's documented flow passes:
  PASS.** `tests/cli/eval-default-rubric-e2e.test.mjs` spawns
  `join(pluginRoot, "cli", "index.mjs")` with `cwd: projectRoot`, asserts the
  roots are non-nested, and extracts the `--rubric` value from the real
  `### Step 3` section rather than hardcoding `default`.
- **No live emitter of `--rubric` passes a path to the shipped rubric (BEH-12):
  PASS.** The spec's acceptance predicate,
  `grep -rnE -- "--rubric[ =][^ ]*default-rubric\.yaml" skills/ providers/ docs/`,
  was run by the orchestrator and returns **0 matches** (pre-state was 2, at
  `docs/cli-reference.md:851-852`). The in-suite sweep at
  `tests/skills/eval-rubric-keyword-emission.test.mjs:229-279` is self-guarded:
  it fails if the walker finds no files, and proves its predicate bites on the
  repo-relative, absolute plugin-cache, and backtick-wrapped forms while not
  matching `default`.
- **A non-`default` `--rubric` value is still containment-checked against the
  project root, unchanged (BEH-9, BEH-11): PASS.** Verified end to end:
  `--rubric ../../../etc/passwd` exits 1 with
  `UNSAFE_SCORE_PATH: path "../../../etc/passwd" escapes the project root.`
  Implementation: `lib/cli/eval.mjs:275-277`, `:301`.
- **The documented invocation is corrected: PASS.**
  `docs/cli-reference.md:821` now reads
  `eval score --rubric <path|default> --input <path> [--json]`; the blanket
  containment sentence is narrowed to "every `--rubric` *path* value"
  (`:832`); a new paragraph (`:843-854`) names the plugin-root boundary, the
  never-from-an-environment-variable rule, and `SCORE_DEFAULT_RUBRIC_MISSING`;
  both examples (`:867-868`) use `--rubric default`.

### Pre-existing criteria (BEH-1 … BEH-10)

All PASS. Highlights, all cited from files read this run:

- BEH-1 halves as distinct addressable fields and a blended total only when both
  are numeric — `lib/evals/score.mjs:532-548`, `:554-560`, `:566-571`.
- BEH-2 denominator exclusions — `lib/evals/score.mjs:318-326`, wired `:510-517`.
- BEH-3 both clauses, including the threshold-independent one —
  `lib/evals/score.mjs:392-399`.
- BEH-4 `NOT_SCORED` — `lib/evals/score.mjs:390-394`.
- Disjointness and exhaustiveness over the zero-denominator case —
  `lib/evals/score.mjs:389-402`, swept by
  `tests/lib/evals/score-status-partition.test.mjs:25-41`.
- BEH-10 threshold validation before tallying — `lib/evals/score.mjs:149-153`,
  ordering asserted at `tests/lib/evals/score-rubric-and-threshold.test.mjs:33`.
- BEH-5/6/7/8 — `lib/evals/score.mjs:236-272`, `:626-651`;
  `lib/cli/eval.mjs:205-208`, `:233-235`, `:308-312`.
- Determinism — fixed key order at `lib/evals/score.mjs:423-424`, `:530-531`,
  `:543-544`, `:564-565`; no clock or randomness imported. Asserted by
  `JSON.stringify` equality, not `deepEqual`, at
  `tests/lib/evals/score-result-assembly.test.mjs:51-56`.

### Error-code table completeness — PASS

Twelve codes are constructed in the implementation, twelve are declared in
`SCORE_ERROR_CODES` (`lib/evals/score-schema.mjs:63-89`), and twelve rows appear
in the spec's Error Cases table. Three-way parity holds with no orphans in
either direction.

`loadRubric`'s own codes (`UNSAFE_RUBRIC_PATH`, `RUBRIC_NOT_FOUND`, …) pass
through the verb but are **not** omissions: they are tabled by
`rubric-schema-and-loader.spec.md`, and this spec's Preconditions scope the
engine to already-loaded rubrics. Only `RUBRIC_NOT_FOUND` is re-coded, and only
on the `default` branch.

### Test integrity findings (non-blocking)

None invalidates a criterion. No conditional skips, no `try/catch`-wrapped
assertions, and no tautological assertions were found in the new or modified
test files.

1. **Loose matcher (pre-existing).** `tests/cli/eval-score.test.mjs:65` asserts
   `/SCORE_(EMPTY_EVIDENCE|MISSING_VERDICT|UNKNOWN_VERDICT_ID)/` against a
   deterministic fixture whose last entry makes the code unambiguously
   `SCORE_UNKNOWN_VERDICT_ID`. A three-way alternation where one exact value is
   known lets two distinct regressions pass. **Recommended fix.**
2. **One-directional error-code check.**
   `tests/lib/evals/score-schema-contract.test.mjs:10-21` asserts membership of a
   hand-copied list in `SCORE_ERROR_CODES`. Neither a code declared-but-untabled
   nor a table row never implemented would fail it. Parity was verified by grep
   in this run instead of by machine. **Recommended fix:** assert both
   directions, or derive the list from the spec table.
3. **Presence-only assertion.** `tests/cli/eval-score.test.mjs:32` asserts the
   three aggregate keys exist, not their values. Mitigated: the exact aggregate
   is pinned to the digit at `tests/cli/eval-default-rubric-e2e.test.mjs:563-568`.
4. **Near-unfalsifiable fixture guards.**
   `tests/cli/eval-default-rubric-e2e.test.mjs:452-455` — `contains()` between
   two `mkdtempSync` results can essentially never be true. These document the
   fixture's shape; the load-bearing assertions in the same file are exact and
   falsifiable.
5. **Fragile teardown.** `tests/cli/eval-default-rubric-keyword.test.mjs:185`
   calls `chmodSync(shipped, …)` unconditionally in `finally`, so a failure
   before the `cpSync` at `:172` would surface as ENOENT and mask the real
   error. The `chmodSync(shipped, 0o000)` case fails loudly rather than skipping
   under a root runner, which is the correct posture.

Positive finding: the re-anchored `tests/skills/eval-default-rubric.test.mjs:99-128`
asserts its extraction regex matches the real prose, **rejects** a decoy
sentence, and reads a relocated filename out of a synthetic sentence — so the
extractor cannot silently degrade to a vacuous pass.

### Guard falsification (performed by the orchestrator, not reported second-hand)

`tests/cli/eval-default-rubric-e2e.test.mjs` was falsified independently. In a
scratch copy of the repository, `loadDefaultRubric` was changed to
`process.env.CLAUDE_PLUGIN_ROOT || getPluginRoot()` — the exact defect BEH-11
prohibits. Both cases went **RED**, through two different channels:

- Case 1 (disjoint-id decoy) — `AssertionError: expected a successful score, got
  exit 1, stderr: SCORE_UNKNOWN_VERDICT_ID: verdict id "spec_criteria_referenced"
  is not declared by the rubric's required_elements or quality_dimensions.`
  The **exit-code** channel.
- Case 2 (same-id decoy, two kinds flipped, budgets inverted) —
  `AssertionError: the table row for error_paths_asserted must carry the SHIPPED
  rubric's kind (element)`. The actual output carried the decoy's kinds and the
  decoy's aggregate `deterministic: 15/15   judged: 8/10   total: 23/25`. The
  **printed-output** channel, which reaches exit 0 and so cannot be explained by
  an error.

Neither assertion is vacuous: `assertDecoyIsLoadable` proves each decoy loads
cleanly through `loadRubric` before the run, so "the decoy was simply rejected"
is excluded as an explanation for the shipped values appearing.

### Scope-expansion sub-finding — none

`git diff --name-only 15cbb37b~1..e1f075d5` touched 13 files. Twelve appear
verbatim in the spec's `source-manifest.files`; the thirteenth is the spec
itself. Commit `43fa6281` explicitly completed the manifest.

---

## Cross-Repo Dependency Validation — N/A

No workspace detected; the spec declares no cross-repo `depends-on` references.

---

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries: PASS.** No lifecycle-order change, no hook-protocol
  change, no CLI install-path change, no plugin-registration change, no new
  dependency. `hooks/` untouched. Changes confined to `lib/cli/`, `lib/evals/`,
  `skills/eval/`, `providers/*/skills/eval/`, `docs/`, `tests/`, and the spec.
- **Non-negotiable principles: PASS.**
  1. *Minimize external dependencies* — `package.json` and `package-lock.json`
     unmodified across all seven commits; `lib/evals/score.mjs:23-35` and
     `lib/cli/eval.mjs:29-37` import only `node:*` and relative modules.
  2. *Skills are primarily markdown* — `skills/eval/SKILL.md` contains no
     `javascript` fence at all; the descriptive block at `:183-190` is a `text`
     fence explicitly labelled "not an instruction to compute it yourself".
  3. *Pure ESM* — every changed code file is `.mjs` with `import`/`export`; no
     `require` or `module.exports` in the diff.
  4. *Hook protocol compliance* — N/A, no hook touched.
  5. *Version parity* — correctly **not** bumped. None of `package.json`,
     `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json` were modified,
     as CLAUDE.md requires for a feature/fix PR (release-please owns bumps).
- **Coding standards: PASS.**
  - No inline-Node and no executable logic in SKILL.md — asserted by
    `tests/skills/eval-layer3-scoring-verb.test.mjs:32-34` and confirmed by a
    fence grep in this run.
  - The skill names `adev eval score`; the body lives in `lib/cli/eval.mjs`,
    registered in `cli/index.mjs`.
  - No hardcoded `~/.claude/` paths; the root is derived at
    `lib/profiles/index.mjs:28-30`.
  - camelCase functions, kebab-case files, built-ins imported first.
  - **Commit trailers:** all seven commits carry `Spec:`, a `Plan-task:`,
    `Author-type: agent/claude-code`, and `Operator: dpavancini/local`.
  - **Provider mirror parity:** both mirrors carry the BEH-12 text at line
    numbers identical to the canonical file;
    `tests/sync/provider-skill-parity.test.mjs` runs inside the green suite.

---

## Check 1.5: Source Manifest Verification — SKIP

Skipped — quick rigor tier. (Stamped by `/adev:implement` at `sha: 428bd5d`,
33 files, drift cleared; carried on the Check 1 attestation as `--manifest-sha`.)

## Check 1.6: Code-Side Drift Warning — SKIP

Skipped — quick rigor tier.

## Check 8: Boundary Compliance — SKIP

Skipped — quick rigor tier.

## Check 9: Transition Gates — SKIP

Skipped — quick rigor tier.

## Check 11: Visual Verification — SKIP

No UI files in the implementation diff (Case A). None of the 13 changed files
matches a UI pattern, and Playwright MCP is not available. Not applicable — this
spec defines a library function and a CLI verb with no user interface, as its
own `## Visual Expectations` section states.

## Check 14: Gate Executability — SKIP

Skipped — quick rigor tier.

---

## Commit hygiene

The seven commits `15cbb37b..e1f075d5` touch only eval-harness scoring files
plus this spec. **No `.context-index/sessions/*` capture was committed**, and no
other session's in-flight work appears in any of them. Nothing is staged. The
working tree carries exactly the three deliberately-uncommitted pipeline-state
files (`lifecycle-state/scoring-engine.jsonl`, `scoring-engine.plan.md`,
`scoring-engine.routing.json`) plus the untracked session captures, which were
never staged.

---

## Known, pre-existing, not this round's defects

Confirmed and recorded; none fails this build.

- **Issue board never updated.** `adev issues claim` fails with
  `SHADOW_ISSUE_BOARD` plus a `br` payload exceeding the `execFileSync` default
  buffer (`lib/issues/beads-adapter.mjs::_runBr` sets no `maxBuffer`). Tracked as
  `adev-plugin-gjl4`.
- **Stale projection plan-task ids.** The projection still carries `task-1..task-6`
  as `pending` from the revision-5 plan; that work shipped in
  `07b5ab04..ca32e1f3`. This round's ids are `t1..t6`, all done.
- **Integration-tier gate knowingly red** — see Check 1b.

---

**Summary:** 3 passed (Check 1, Check 2, Check 4), 0 failed, 6 skipped
(1.5, 1.6, 8, 9, 11, 14 — five by quick tier, Check 11 by trigger guard).
Aggregate verdict **PASS_WITH_NOTES**. The defect the previous round FAILed on
is closed at the level the spec demanded: verified end to end with the plugin
root outside the project root, and guarded by a test proven to go red when the
defect is reintroduced.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11
> (when no UI files), 12, and 13 have been relocated by
> `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — ADR compliance (formerly Check 5), cross-cutting
>   compliance (formerly Check 6), specialist review (formerly Check 7), and
>   charter consistency (formerly Check 3, now covered by Check 2's
>   scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — lifecycle reconciliation (formerly Check 12).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — heuristic extraction
>   (formerly Check 13), now a non-blocking Stop-event hook.
