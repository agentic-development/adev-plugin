---
kind: validate
spec: .context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md
plan: .context-index/specs/features/output-personas/skill-output-rules-wiring.plan.md
charter: output-personas
spec-revision: 16
source-manifest-sha: "73f2517"
date: 2026-08-21
tier: full
overall-status: PASS_WITH_NOTES
---

# Validation Report: Skill Output Rules Wiring

> **Date:** 2026-08-21
> **Spec:** `.context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md` (revision 16)
> **Plan:** `.context-index/specs/features/output-personas/skill-output-rules-wiring.plan.md`
> **Rigor tier:** full (risk_level `medium` → `policies.medium.validate_mode: full`)
> **Implementation range:** `ef667a9f..ada81383` (9 commits)
> **Overall Status:** PASS_WITH_NOTES

Registry loaded clean from `.context-index/governance/validate.yaml` (8 checks, 0 disabled, 0 loader
warnings). Domain resolved to `software` (source level: default). No workspace detected — repo-scoped
validation, no cross-repo `depends-on`. Spec declares no `infra_requirements`, so infrastructure
preflight did not run. `adev skill-ext load --skill validate` returned `__NONE__`. Three
`output-personas` heuristics were retrieved and carried into the run as guidance.

---

## Check 1: Quality Gates — PASS_WITH_NOTES

Gate set resolved from the project's materialized `.context-index/governance/gates.yaml` via
`adev domain load-gates` (3 gates, no domain overlay merged at run time).

### Check 1a (fast) — PASS

| Gate | Command | Result | Duration |
|---|---|---|---|
| `test` | `npm test` | **PASS** | 36.2s |
| `quality-gate` | `npm test` | **PASS** | 35.8s |

`ℹ tests 7063 · pass 7061 · fail 0 · skipped 0 · todo 2`. The two `todo` entries are pre-existing and
unrelated to this spec.

### Check 1b (integration) — WARN (non-blocking)

| Gate | Command | Result |
|---|---|---|
| `integration-test` | `npm run test:evals` | **FAIL** at `severity: warning` |

`ℹ tests 391 · pass 366 · fail 25` in the working tree. **This is not a regression.** The claim was
falsified rather than asserted: two detached worktrees were created and the eval suite run in each.

| Tree | Result |
|---|---|
| `c73c5611` (last commit before the build) | 389 tests, 376 pass, **13 fail** |
| `ada81383` (the build's final commit) | 389 tests, 376 pass, **13 fail** |
| dirty working tree | 391 tests, 366 pass, 25 fail |

The build introduces **zero** eval regressions — the counts at the pre-build and post-build commits are
identical. The extra 12 failures appear only in the working tree and trace to unrelated uncommitted
changes (`governance/review.yaml`, `manifest.yaml`, `templates/review-specs/defaults.yaml`,
`tests/governance/context-pack-consistency-glob.test.mjs`, plus a 104-file frontmatter-ordering sweep)
that predate this run. Severity `warning`, so Checks 1.5–14 proceeded.

### Check 1c (e2e) — SKIP

e2e tier — no gates configured, skipped.

### Per-gate attestation

One `validator_report` emitted for the whole check, carrying `gate_outcomes` for all three gates with
`command_sha` verbatim from the resolved set, stamped `--manifest-sha 73f2517`.

---

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify` → `Check 1.5: PASS — source manifest matches (sha: 73f2517)`, exit 0.
All 14 listed files unchanged since stamping.

Validator-side git-tracked check: each of the 14 files resolves to a real commit
(`skills/*` → `7460ae2b`/`39fa5875`/`76758873`/`34ef2082`, mirrors → `e3791efa`, test + charter →
`1ce766dd`). No file exists on disk while untracked or merely staged.

---

## Check 1.6: Code-Side Drift — PASS

`adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`. No
unresolved `code_drift_detected` event. Non-blocking check, nothing to report.

---

## Check 2: Spec Compliance — PASS_WITH_NOTES (12 PASS / 1 PARTIAL / 0 FAIL)

| # | Acceptance Criterion | Verdict |
|---|---|---|
| 1 | Task-1 test exists, observed failing before the wiring, passes after | **PASS** |
| 2 | All 19 named sections carry a `**Terse form:**` marker with a terse rendering (BEH-1) | **PASS** |
| 3 | No marker appears outside the 19 named sections (BEH-1) | **PASS** |
| 4 | No governed section reproduces disk-artifact content; each names a repo-relative path (BEH-2) | **PASS** (note) |
| 5 | No governed section emits an absolute filesystem path (BEH-2) | **PASS** |
| 6 | Each terse form emits at most one table of its own; further tables render as count + invocation (BEH-3) | **PASS** |
| 7 | Every footnote names the three overlays by literal filename, no path interpolation (BEH-7) | **PASS** (note) |
| 8 | No governed section relies on a sentence/paragraph count as its sole constraint (BEH-8) | **PASS** |
| 9 | Modified-file set is exactly the 4 SKILL.md + mirrors + test file + charter capability row | **PARTIAL** |
| 10 | `providers/*` regenerated; `tests/sync/provider-skill-parity.test.mjs` passes | **PASS** |
| 11 | Charter capability row describes the four-skill increment and records what it taught | **PASS** (note) |
| 12 | All quality gates pass (`npm test`) | **PASS** |
| 13 | No constitutional violations introduced | **PASS** |

**AC-1 — RED state empirically reproduced, not taken on trust.** A detached worktree at `ef667a9f`
(the test-first commit) ran `node --test tests/skills/terse-form-markers.test.mjs` and failed with 2
failing tests: `MISSING_TERSE_FORM` (57 violations = 19 sections × 3 trees) and `BEH-7` (12 violations
= 4 files × 3 trees). On HEAD the same suite is 10/10 green. Recorded honestly: 7 of the then-9 tests
passed **vacuously** at RED because they iterate over markers that did not yet exist. BEH-2 and BEH-8
were therefore falsified independently rather than inferred from the RED run.

**AC-2 / AC-3 — marker inventory verified by independent scan.** Canonical: `status` 10 (L97, L132,
L170, L259, L303, L328, L352, L408, L435, L493), `route` 2 (L242, L276), `sample` 4 (L141, L186, L221,
L247), `learn` 3 (L116, L193, L214) = **19**. `skills/status/SKILL.md` carries exactly 10 `^### Mode: `
headings (L44/99/134/172/273/305/330/354/416/437), so the spec's normative pattern and the marker set
agree. The 9 literal headings named in the spec's governed-sections table all exist verbatim. Mirrors
carry 38, total 57.

**AC-4 (note).** Every named path is repo-relative (`.context-index/samples/<name>.md`,
`.context-index/memory/heuristics/<scope>.md`, `<plan-stem>.routing.json`,
`.context-index/hygiene/drift-report.md`). `skills/learn/SKILL.md:116` handles the no-artifact-yet case
explicitly. **Note:** `skills/route/SKILL.md:242`'s terse form retains the full per-task routing table
*and* names the sidecar carrying the same scores — a mild strain against the inherited anti-redundancy
rule. BEH-2 scopes this spec's own obligation to path *form* only, which is met, so this is a note, not
a failure.

**AC-6 — judged by reading, not by trusting the guard.** Exactly one terse form in the increment
contains a literal markdown table: `skills/status/SKILL.md:261-265` (`--all`'s counts roll-up),
followed by five count+narrower-invocation substitutions at L267-271. `--backlog` (L408-414) has no
table and five count+pointer bullets. BEH-3's "no narrower invocation exists → count alone" branch
fires exactly once (`--all`'s Recent Sessions), matching the spec's prediction.

**AC-7 (note).** One `**Persona adaptation:**` footnote per file — `status:12`, `route:211`,
`sample:125`, `learn:201` — each naming `templates/verbosity/terse.md`, `normal.md`, and `deep.md` by
literal filename with no interpolation. `skills/status/SKILL.md:14-16` carries the canonical
terse-form-marker grammar and the table-substitution recipe. **Note (pre-existing shape, not a
regression):** in `route`/`sample`/`learn` the footnote lives *inside one governed section* and reads
"this section", so 12 of the 19 governed sections carry a marker with no locally visible statement of
what it means. Only `status`'s footnote is file-scoped. BEH-7's obligation is conditional on a footnote
appearing and constrains its content, not its count or placement — so this passes as written, and is
recorded as input for the widening spec.

**AC-9 — PARTIAL. Scope expansion inside `charter.md`.** At file level the diff is exactly the declared
set: `git diff c73c5611..ada81383 --name-only` returns 15 paths — the 4 canonical SKILL.md, the 8
mirrors, `tests/skills/terse-form-markers.test.mjs`, `charter.md`, and the spec itself (routine
self-stamp). Nothing under `lib/`, `hooks/`, `templates/`, or another spec's artifacts. **But** commit
`1ce766dd` (Plan-task 8, +30/-9 on the charter) also swept in pre-existing uncommitted charter work
that belongs to the sibling persona-resolution effort: the `revision: 3 → 6` bump, rewritten Scope
bullets, two new Data Model rows (`Verbosity`, `VerbosityOverlay`), the `Init persona prompt`
capability row, and three Interface-Contract rows. Evidence it is not this spec's work: `charter.md`
was already listed modified in the session-start `git status` before any build commit; the absorbed
text cites `lib/persona.mjs:183` and `issue-wqpgxl`, neither of which this spec touches; and a single
commit cannot account for a three-revision jump. AC-9 scopes the charter change to "the charter
capability row". Severity **warning** per the check's own rule — it raises the verdict to
PASS_WITH_NOTES but does not fail Check 2. Recommended action: none blocking; the commit's provenance
now misattributes ~30 lines of persona-axis charter work to this spec.

**AC-11 (note).** `charter.md:80` reads "Wires the verbosity axis into 19 mandated-output sections
across four skills (`status`, `route`, `sample`, `learn`)…" — the stale "17" is gone and all four
skills plus the count are named. `charter.md:90-105` adds a five-point lessons section that discloses
the guard limitation (point 2), the SA-4 deletion rationale (point 5), and the accepted sibling-spec
sha drift. **Note:** lesson 5's reasoning is inaccurate — it argues the SA-4 deletion of `status`'s
"omit file paths and technical detail" clause was load-bearing because it would have forbidden naming
`/adev:status --spec <path>` at product+terse, but the same prohibition still lives at the
higher-precedence persona layer (`templates/personas/product.md:13`, `:29`), which SKILL.md cannot
override. The deletion is safe; the stated justification is not the operative one.

### Test-integrity findings (all note-level, none blocking)

- **`UNIX_ABS_PATH_RE` widening in `7460ae2b` — legitimate, claim independently falsified.** Adding
  `:` to the class only extends how far a match *runs*; it never prevents one from starting. Probed
  side by side: `/Users/…`, `/etc/passwd` and `C:\Users\foo` still flag under both regexes, while
  `/adev:status --spec <path>` stops false-flagging. The exemption uses `continue`, not `break`, so a
  line carrying both a slash-command and a real absolute path still flags. Strictly a false-positive
  fix, marginally stronger than the original — not a weakening-to-pass.
- **The `status` L126/L378 rewrite — legitimate de-brittling.** Deriving the duplicate pair by heading
  text rather than pinning line numbers survives task 2 shifting `status` down four lines, and the new
  `a.endLine < b.startLine` non-swallowing assertion is coverage the pinned version never had. Small
  loss: heading *identity* is no longer pinned, so a future file where a different pair became
  duplicated would pass. A `heading.includes("--milestone")` assertion would restore it at zero
  brittleness cost.
- **BEH-8's guard is vacuous for 17 of 19 sections.** `isCountOnlyBlock` returns `false` for a block
  with zero bullets, so `"Emit at most 3 sentences."` as bare prose would not be flagged. Only `--all`
  and `--backlog` carry bullets. AC-8 holds by reading, not by this test.
- **BEH-3's assertion is a proxy.** It counts *literal* markdown tables in a block whose content is a
  *description* of rendering; a terse form saying "render all four tables" in prose would pass. AC-6
  was therefore verified by reading.
- **Loose matchers in the charter-row test.** `!row.includes("17")` would false-trip on "170";
  `row.includes("19")` and `row.includes(skill)` are bare substring checks; the backtick branch of
  `nameSkill` is dead because the `|| row.includes(skill)` fallback subsumes it.
- **`MARKER_OUT_OF_SCOPE` scans only the four governed skills** — a marker added to a fifth skill goes
  undetected. Acceptable at this spec's declared scope; it will matter for the widening spec.

No conditional skips, no `try/catch` around assertions, no runtime-data assertions, no always-true
assertions. All eight violation-collecting tests use the strict `assert.deepEqual(violations, [])`.

### Known guard limitation — assessed, does **not** undermine any acceptance criterion

The implementer disclosed that the "marker is the last block of its governed section" assertion is
heading-triggered only: it finds a violation only when another *heading* follows the marker inside the
section extent, so a marker placed mid-body with trailing prose in a heading-free section would pass
undetected. The disclosure is accurate — confirmed by reading the assertion, which searches
`allSections` for a heading in `(markerLine, section.endLine]` and nothing else.

The gap admits **no defect today**. All 19 sections were enumerated programmatically and the content
after each marker measured, twice and independently:

- **17 of 19** have zero content lines after the marker — it is literally the last line of the section.
- **2 of 19** have content after, and in both cases it is the terse form's *own body*: `status --all`
  (marker L259; roll-up table L261-265 plus five substitution bullets L267-271, extent ends L272) and
  `status --backlog` (marker L408; five substitution bullets L410-414, extent ends L415).

AC-2 (marker plus rendering present), AC-3 (placement), and AC-6 (table discipline) are all satisfied
on the actual content regardless of whether the guard could catch a hypothetical mid-body marker. The
limitation is a **future-regression risk for the widening spec, not a present defect** — correctly
recorded as such at `charter.md:97`.

**Related placement observation the guard also cannot see:** two `status` markers sit at the end of
their `### Mode:` extent but render visually nested under an H4 — L259 beneath `#### Recent Sessions`
(L225) and L493 beneath `#### Repo-Mode-Inside-Workspace Advisory` (L485). Both are correct under the
stated extent rule and both were deliberate, but a reader of the rendered markdown may misread the
`--all` terse form as belonging to Recent Sessions. Cosmetic; a one-line "(applies to the whole `--all`
mode)" clarifier would remove the ambiguity.

### Note on the headline decision-gate claim

The implement step judged the decision-gate constraint "sufficient" for *authoring* all three gates
(`sample` `#### Present Results`, `sample` `## --refresh Mode`, `learn` `## Step 4`) and then qualified
it explicitly. This validation does not upgrade that qualification. The three terse forms do declare
the decision material as their own content — `sample:247` names the action column as "the evidence the
following prompt asks the user to approve"; `learn:116` renders pattern and anti-pattern in full plus
the save prompt — but declaring what a section *offers* is a skill-layer authoring rule with **no
runtime guarantee**. Nothing authored here prevents the session overlay
(`skills/using-adev/SKILL.md:137`) from trimming the offered evidence, and **no run in this increment
was observed rendering any gate under an actual terse overlay.** The overlay-level guarantee remains
`issue-uvarlt`'s to deliver, exactly as `charter.md:100` records.

---

## Cross-Repo Dependency Validation — N/A

`detectWorkspace(cwd)` returned `null`. No workspace, no cross-repo `depends-on` references.

---

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries: PASS.** No approval-gated area touched — the 15-file diff contains nothing
  under `hooks/`, `cli/`, or `lib/`, so the hook stdin/stdout contract, the CLI install path structure,
  and the plugin registration format are all untouched. No new skill entered the lifecycle order (all
  four edited skills already existed at `c73c5611`; every entry is `M`, none `A`). `package.json`
  dependency blocks are byte-identical across the range. **No version bump:** `package.json:3`,
  `.claude-plugin/plugin.json:3`, and `.cursor-plugin/plugin.json:3` all read `0.28.0-next.3` at both
  ends and none appears in the diff — release-please's authority is intact. Everything in the diff
  falls under the constitution's autonomous set ("Editing skill markdown content", "Adding tests",
  "Updating specs/ADRs when code changes affect their assumptions").
- **Non-negotiable principles: PASS.** P1 — `tests/skills/terse-form-markers.test.mjs:25-29` imports
  only `node:test`, `node:assert/strict`, `node:fs`, `node:path`, and the in-repo `../helpers.mjs`;
  zero external packages. P2 — every added SKILL.md line is prose; no companion code is required for
  any skill to function. P3 — the new test is pure ESM; `require(`, `module.exports`, `__dirname`, and
  `__filename` are all absent. P4 — vacuously honored, no `hooks/` file in the diff. P5 — version
  parity preserved (both manifests at `0.28.0-next.3`).
- **Coding standards: PASS.** camelCase functions (`skillPath`, `scanSections`, `governedSections`,
  `extractTerseFormBlock`, `findAbsolutePathLines`, `countTablesOpened`, `isCountOnlyBlock`),
  SCREAMING_SNAKE module constants matching sibling-test convention, kebab-case filename under
  `tests/skills/` per the context-routing table, and Node built-ins imported before the relative import.
- **Anti-patterns: PASS.** No inline-Node pattern anywhere in the four SKILL.md files
  (`Run inline Node`, `node --input-type=module`, `node -e ` all return zero matches), so the
  per-H3-section both-forms rule is vacuously satisfied. The single fenced JavaScript block in the
  scope (`skills/learn/SKILL.md:122`) is a pre-existing heuristic-entry object literal with no imports
  and no control flow, and is untouched by this diff. No hardcoded `~/.claude/` in any added line.
  Enforcement re-run rather than assumed: `tests/skills-no-inline-node.test.mjs` → 3/3 pass;
  `tests/skills-extension-coverage.test.mjs` → 31/31 pass, with explicit green lines confirming all
  four edited skills still carry their Load Skill Extensions block.
- **Commit trailers: PASS.** All 9 commits in `ef667a9f~1..ada81383` carry
  `Spec: .context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md`,
  `Author-type: agent/claude-code`, `Operator: dpavancini/local`, and `Issue: epic-dym2ol`.
  `Plan-task:` runs 1-8 in order across the eight implementation commits; the ninth (`ada81383`, the
  status/manifest stamp) correctly omits it, since the constitution scopes that trailer to "when
  implementing a plan task".

---

## Check 8: Boundary Compliance — PASS

`adev boundaries check --json` → `verdict: PASS`, reason `no boundary violations in 248 changed file(s)
against 3 rule(s)`. Zero findings; `summary`: 0 errors, 0 warnings, 0 infos.

- Disabled: `no-manual-version-bump` — "the boundary evaluator matches file content, not diffs; a
  version field is not a version bump, so this rule would fire on package.json forever. Needs a
  diff-aware evaluator."
- Registry warnings: none.

The 248-file count reflects the dirty working tree, not this build's 15-file diff.

---

## Check 9: Transition Gates — PASS

`adev gate transitions --transition implement-to-validate --spec <spec> --json` → `verdict: PASS`,
reason `transition "implement-to-validate": every required gate has a fresh, attested, passing
outcome`.

| Gate | Verdict | Reason | Attested |
|---|---|---|---|
| `test` | pass | `recorded-pass` | `command_attested: true` |

The outcome the comparator read back is the one Check 1 wrote this run, stamped with the spec's
`source-manifest` sha `73f2517`.

---

## Check 11: Visual Verification — SKIP

Case A of the trigger matrix: no UI files in the implementation diff (all 15 paths are `.md` or
`.mjs`; nothing matches `*.tsx|jsx|vue|svelte|css|scss|html` and nothing lives under `components/`,
`pages/`, `views/`, `public/`, or `app/**`), and no Playwright MCP server available. Visual
verification is not applicable to this spec.

---

## Check 14: Gate Executability and Test Collection — PASS (4 warnings)

`adev gate doctor --json` → 0 errors, 4 warnings. Registry severity is `warning`, so this does not
affect the aggregate.

| Finding | Gate | Meaning |
|---|---|---|
| `gate-doctor/runner-unknown` | `test` | `npm test` delegates to `scripts/run-tests.mjs`, which the doctor cannot statically identify, so collection was not verified. |
| `gate-doctor/runner-unknown` | `quality-gate` | Same command, same limitation. |
| `gate-doctor/runner-unknown` | `integration-test` | `npm run test:evals`, same limitation. |
| `gate-doctor/ci-gate-not-invoked` | `integration-test` | `npm run test:evals` appears in no CI workflow — the eval suite only constrains whoever remembers to run it locally, which is consistent with the 13 pre-existing failures found at `c73c5611`. |

Pre-existing project configuration, unrelated to this spec. Recorded for the operator, not remediated.

---

**Summary:** 8 checks produced a verdict — **6 PASS** (1.5, 1.6, 4, 8, 9, 11-as-SKIP), **3
PASS_WITH_NOTES** (1, 2, 14), **0 FAIL**. Check 11 recorded SKIP under Case A. No check blocked and no
acceptance criterion failed; one (AC-9) is PARTIAL at warning severity.

## Findings for follow-up (none blocking)

| # | Finding | Severity | Suggested owner |
|---|---|---|---|
| 1 | Spec declares `charter-revision: 5`; charter is at `revision: 6`. The value was never valid — the charter sat at `revision: 3` from 2026-05-18 until commit `1ce766dd` jumped it to 6. Sibling specs in this charter correctly declare `charter-revision: 3`. `skills/status/SKILL.md:459-465` documents this exact staleness check, so `/adev:status` will flag this spec. | warning | `/adev:reconcile` or a one-line frontmatter fix |
| 2 | Commit `1ce766dd` (Plan-task 8) swept ~30 lines of pre-existing, uncommitted sibling charter work (Scope bullets, two Data Model rows, `Init persona prompt` row, three Interface-Contract rows, the revision bump) into this spec's provenance. | warning | note only; history is not worth rewriting |
| 3 | The "marker is last block" guard is heading-triggered only — a mid-body marker with trailing prose in a heading-free section passes undetected. No defect today (17/19 sections end at the marker; the other 2 are followed only by their own terse body). | warning | the widening spec |
| 4 | 12 of the 19 governed sections carry a marker with no locally visible footnote explaining it; only `status`'s footnote is file-scoped. | note | the widening spec |
| 5 | `charter.md:104` lesson 5 misattributes the SA-4 deletion's load-bearing rationale — the same prohibition survives at `templates/personas/product.md:13,:29`, a higher-precedence layer. | note | charter edit |
| 6 | `route/SKILL.md:242` renders the full routing table *and* names the sidecar holding the same scores. | note | the widening spec |
| 7 | BEH-8's `isCountOnlyBlock` and BEH-3's literal-table count are proxy assertions that a prose-only violation would slip past. | note | the widening spec |
| 8 | `npm run test:evals` fails 13/389 at `c73c5611` and at `ada81383` alike, and is invoked by no CI workflow. Pre-existing, unrelated to this spec. | warning | separate issue |
| 9 | This repo's CLI has no `adev implement batches`, no `adev implement resolve-depth`, and no `report --type review-round`; `buildReviewRoundTrailer` is absent from `lib/lifecycle-state.mjs`. Graduated review depth was unavailable during implement, so every task took the full two-stage review and review-round provenance landed as `reviewer_report` lifecycle events rather than `Review-round:` commit trailers. **Environment gap, not an implementation defect.** | note | CLI follow-up |
| 10 | `adev verify issue` returned `confidence: none` for `issue-goyfov`, reporting the 8 provider mirrors "missing from disk". They are present and committed at `e3791efa` — `verifyIssueCompleted` does not brace-expand the plan's `providers/{codex,opencode}/skills/{status,route,sample,learn}/SKILL.md` path form. The issue was therefore noted, not auto-closed. | warning | `lib/` follow-up |
| 11 | The four SKILL.md files appear in `source-manifest.files[]` of 15 other specs, whose recorded shas are now advisory-stale. ADR-0011 (restamping authority) is **Rejected**, so no restamping mechanism exists. Recorded at `charter.md:104`, deliberately not repaired. | informational | none — accepted side effect |

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, and 13 have been
> relocated by `check-set-restructure.spec.md`. See `/adev:review-specs` (ADR compliance, cross-cutting
> compliance, specialist review, charter consistency — now Check 2's scope-expansion sub-finding),
> `/adev:hygiene` Audit Pass 20 (platform drift), `/adev:reconcile` lifecycle-sync (lifecycle
> reconciliation), and `hooks/post-validate-extract-heuristics.{sh,mjs}` (heuristic extraction). The
> gaps in the surviving inventory are intentional.
