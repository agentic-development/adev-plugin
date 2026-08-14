---
topic: "Leaner review and validation — deterministic-first checks, coherent registry semantics, and what spec-kit and BMAD do differently"
date: "2026-08-14"
relates-to: "harness-simplification-study.md, check-set-restructure.spec.md, adev-plugin-paky, adev-plugin-03du"
sources:
  - internal
  - "github:github/spec-kit"
  - "github:bmad-code-org/BMAD-METHOD"
status: complete
---

## Summary

Three findings, in descending order of how cheaply they can be acted on.

1. **The board does not close on delivery.** Cross-checking `harness-simplification-study.md`'s
   roadmap against the 106 open issues found two items already shipped but still open, and two
   items never filed at all. The roadmap is not a reliable picture of what remains.

2. **The check-ID scheme and the registry-composition model are both incoherent**, in ways that
   are cheap to fix now and expensive later. Validate IDs are sparse decimal ordinals
   (`check-1.5`, `check-2`, `check-4`, `check-8`, `check-9`, `check-11`, `check-14` — 7 checks
   spanning ordinal space 1–14). Three registries in one directory use three different ID
   conventions and *two opposite composition models*.

3. **The deterministic layer adev needs already exists and is being bypassed.** The diagnostics
   registry (`lib/diagnostics/`, tiers 1–3, namespaced `adev/<aspect>` IDs) is the well-designed
   surface; validate's check registry is the legacy parallel one, and 5 of its 7 checks are
   `subagent-review` — including two that evaluate empty rulesets and *structurally cannot fail*.

Against spec-kit and BMAD, adev is the only one of the three with a real deterministic layer — and
the only one that routes mechanical checks through an LLM anyway. Its distinctive weakness is the
opposite of what the frameworks comparison might suggest: **adev's specs have no stable
requirement IDs**, which is precisely what makes spec-kit's coverage analysis mechanical and
adev's judgmental.

## Findings

### Internal

#### F1 — Roadmap-to-board cross-check

Mapping the study's Phases 0a–4 onto the board (459 issues, 106 open):

| Roadmap item | Board state |
|---|---|
| P0.1 test glob | closed (`adev-plugin-wok`) |
| P0.2 append-only reports | **open** `adev-plugin-mxn6` |
| P0.3 check-ID enum | **open** `adev-plugin-paky` |
| P0.4 `validated` requires `.validate.md` | **open** `adev-plugin-j5qw` — **but implemented** |
| P0.5 sessions capture | closed (`adev-plugin-i9dc`) |
| P0.6 no-op gate mappings | closed (`adev-plugin-zx5`) |
| P1 skill-compression matrix / golden suite / rubric / constitution tests | open (`adev-plugin-755`, `8dl4`, `27pp`, `7dpm`, `i0y6`) |
| P2 loop-convergence promotion | **open** `adev-plugin-7tax` |
| P2 batch systemic-failure detection | **NEVER FILED — 0 issues, open or closed** |
| P2 recover records | **open** `adev-plugin-r1qe` |
| P3 conditional HITL | open, 7 related (`adev-plugin-03du` is the config-fields core) |
| P4.1 delete/gate Checks 8, 9, 11 | **NEVER FILED — no issue targets these checks** |
| P4.2 prose dedup | **open** `adev-plugin-gwq2`, `lyli`, `sits` |

**Two already-delivered items still open.** `adev-plugin-j5qw` asks for a hygiene rule that
`status: validated` requires a co-located `.validate.md`. It exists:
`lib/diagnostics/tier2/validated-without-report.mjs`, registered in
`.context-index/governance/diagnostics.yaml:47` as `adev/validated-without-report`, `severity:
error`, `tier: 2`, `scope: spec`. Separately, `adev-plugin-9z5i` (check dedup between review-specs
and validate) was verified implemented and closed during this investigation — shipped 2026-05-16,
open for three months.

**Two never-filed items.** Batch-level systemic-failure detection (P2.3) has no issue. Neither
does the deletion of Checks 8/9/11 (P4.1) — the single highest-confidence waste in the entire
study.

The pattern matters more than the instances: a roadmap in a research artifact and a board that
tracks work are two representations of the same thing, and nothing reconciles them. Any planning
that reads either one alone will be wrong.

#### F2 — The empty-ruleset checks are still live, three months on

Verified against the working tree today:

```
.context-index/governance/boundaries.yaml   →  boundaries: []
.context-index/governance/gates.yaml        →  transitions: {}
.context-index/governance/validate.yaml     →  check-8-boundaries        (subagent-review, severity: error)
                                               check-9-transition-gates  (subagent-review, severity: error)
                                               check-11-visual-verification
```

Check 8 dispatches an LLM subagent per spec per run, at `severity: error`, to evaluate an empty
list. It cannot fail. The study measured 40 PASS / 0 FAIL for Check 8 and 39 PASS + 1 PWN / 0 FAIL
for Check 9; both remain unchanged and unfiled. Given the study's other measurement — **validate
costs ~95K tokens per dispatch versus ~25K for implement, and consumed ~1.05M of 1.48M tokens in
one session** — this is the cheapest available saving in the framework and nobody has claimed it.

Check 11 is now self-guarding (SKIPs rather than BLOCKs on non-UI diffs), so it is a smaller
target than the study implies.

#### F3 — Check-ID pathology

The current validate registry, in file order:

```
validate.check-1.5-source-manifest
validate.check-2-spec-compliance
validate.check-4-constitution
validate.check-8-boundaries
validate.check-9-transition-gates
validate.check-11-visual-verification
validate.check-14-gate-executability
```

Seven checks occupying ordinal positions 1.5 through 14. Every pathology of ordinal-in-identifier
naming is present at once:

- **Decimal interpolation.** `1.5` and (formerly) `1.6` exist because new checks needed to sort
  between 1 and 2. The ID encodes an ordering that no longer has meaning — the actual execution
  order is the `after:` dependency graph, which `1.5`/`2`/`4` only coincidentally agree with.
- **Gaps as tombstones.** 3, 5, 6, 7, 10, 12, 13 are absent. Some were relocated
  (5 and 6 → review-specs, 10 → hygiene Pass 20), some deleted (7, 12). The gaps are the only
  record of that history, and they are invisible to anyone reading the registry.
- **Resurrection hazard.** The system needed a `RESURRECTED_CHECK_ID` warning specifically because
  a removed ordinal can be innocently reused for an unrelated check. That warning is a symptom:
  the ID space is not append-only, so removal is unsafe.
- **The number carries no information.** `check-4` does not tell you it is the constitution check,
  what it depends on, whether it is deterministic, or what it costs. The slug does all the work;
  the ordinal does none, but is load-bearing for identity.
- **Free-text drift at the logging boundary.** The study found the same check logged under four
  spellings (`check-1.6-code-drift | drift | drift-detection | drift-warning`) because
  `adev report` accepts free text. `adev-plugin-paky` (enum-enforce check IDs) is the filed fix
  and is still open.

Compare the diagnostics registry in the same directory, which got this right:

```
adev/event-schema-valid          severity: error    tier: 1
adev/status-enum-legal           severity: error    tier: 1
adev/frontmatter-present         severity: error    tier: 1
adev/validated-without-report    severity: error    tier: 2
```

Namespaced, semantic, no ordinal, vendor-extensible (`<vendor>/<aspect>`), with first-wins
duplicate handling that emits `adev/diagnostic-duplicate-id`. The good scheme already exists in
this project — validate simply predates it.

#### F4 — Built-in vs customizable: three registries, three models

All three live in `.context-index/governance/`. Their composition semantics are mutually
inconsistent, and the inconsistency is documented in the code rather than resolved:

| Registry | Model | Evidence |
|---|---|---|
| `validate.yaml` | **Replace-all.** No bundled defaults read, no overlay merge. Missing file is a hard error. To keep a default you must copy it in by hand. | `lib/governance/validate-config.mjs:74` — *"This is the single-source model: no bundled-defaults read, no overlay merge."* |
| `review.yaml` | **Three-layer overlay.** Bundled defaults always load; domain profile replaces the reviewer list; project overlay merges field-by-field by `id`. | `lib/governance/review-config.mjs:53-79` |
| `diagnostics.yaml` | **Append with first-wins.** Bundled `plugin:` entries cannot be shadowed; later duplicates are dropped with a warning. | `.context-index/governance/diagnostics.yaml` header |

The practical consequences:

- **Silent capability loss on upgrade.** Because validate is replace-all, a new bundled check
  added upstream never reaches an existing project — the project's `validate.yaml` is authoritative
  and does not know the check exists. This is the same failure class as `adev-plugin-ogjm`
  (*"Existing scaffolds silently lose every gate with a string command, and upgrade never fixes
  them"*), which is filed for gates but not for checks.
- **Opposite mental models for adjacent files.** Editing `review.yaml` means "state my deltas."
  Editing `validate.yaml` means "state everything." Nothing in either file's name or location
  signals which.
- **The project's own registry has drifted from the bundled one.** Bundled gates declare
  `quality-gate` and `integration-test`; the project declares `test` and `integration-test`. Under
  a merge model that rename would be a visible override; under the current model it is invisible.

#### F5 — The determinism ladder

Of 7 validate checks, 2 are `deterministic-check` (`1.5-source-manifest`, `14-gate-executability`)
and 5 are `subagent-review`. Several of the 5 are wholly or partly mechanical:

| Check | Today | Mechanically decidable part |
|---|---|---|
| `check-8-boundaries` | subagent-review | **All of it.** Boundary rules are path patterns vs a git diff. No judgment required. |
| `check-9-transition-gates` | subagent-review | **All of it.** Gate presence per transition is a lookup. |
| `check-11-visual-verification` | subagent-review | The **trigger** (does the diff touch UI paths?) is deterministic; only the visual assessment is not. |
| `check-4-constitution` | subagent-review | Large parts. This project's own constitution is mostly mechanical: no CommonJS, `.mjs` only, version parity across three manifests, no hardcoded `~/.claude/` paths, no inline-Node in SKILL.md. All are greppable — and the inline-Node rule is *already* enforced deterministically by `.githooks/pre-commit-no-inline-node`. |
| `check-2-spec-compliance` | subagent-review | The scope-expansion sub-finding is a set difference between `source-manifest.files` and the diff. The "does code match spec" judgment genuinely is not. |

The pattern: **each of these is an LLM dispatch wrapped around a predicate.** The Agent SDK's own
verification ranking (rules-based > visual > LLM-judge) is cited in the prior study and points the
same way. Meanwhile `lib/diagnostics/` already provides the runner protocol, tiering, severity, and
registry semantics needed to host all of the mechanical parts.

### GitHub

Both frameworks cloned at HEAD 2026-08-14: `github/spec-kit` @ `bf88c9f`,
`bmad-code-org/BMAD-METHOD` @ `84d5b4b` (v6.11.0).

#### spec-kit — one read-only analysis pass, and stable requirement IDs

`templates/commands/analyze.md` (255 lines) is the whole review surface. One agent, not a panel.
Six detection passes — Duplication, Ambiguity, Underspecification, Constitution Alignment,
Coverage Gaps, Inconsistency — four severities (CRITICAL/HIGH/MEDIUM/LOW), a hard **50-finding cap
with an overflow summary**, and `STRICTLY READ-ONLY` as an operating constraint. Only constitution
MUST violations are automatically CRITICAL.

Two mechanisms adev lacks:

1. **Stable requirement IDs.** spec-kit specs carry `FR-###` and `SC-###` identifiers, tasks carry
   task IDs, and analyze builds a "requirements inventory" keyed by them. That makes its Coverage
   Gaps pass a *set operation* — "requirements with zero associated tasks", "tasks with no mapped
   requirement" — not a judgment call. **adev's behaviors are numbered list items in prose
   (`1. **When** … **then** …`) with no stable key.** This is why adev cannot mechanically answer
   "which behaviors have no test" — the same root cause found in
   `test-suite-size-oss-benchmark.md`, where 79% of test files had no spec link and 1,923 behaviors
   had no identifiers.

2. **A finding cap as a first-class design element.** The 50-finding limit directly targets the
   nitpick-churn failure mode; the prior study measured a 4.5:1 advisory-to-blocker ratio in adev's
   review corpus, which is that failure mode unmitigated.

spec-kit's deterministic layer is thin — ~1,791 LOC of bash across 6 scripts, almost all
scaffolding and prerequisite checking (`check-prerequisites.sh`, `setup-plan.sh`). **No mechanical
quality checks at all.** Its `checklist` command frames its purpose memorably:

> **Checklist Purpose: "Unit Tests for English"** … If your spec is code written in English, the
> checklist is its unit test suite. You're testing whether the requirements are well-written,
> complete, unambiguous, and ready for implementation — NOT whether the implementation works.

It is explicit that this is **not** verification/testing, and keeps the two concerns in separate
commands. adev blurs exactly this line: `review-specs` (is the spec good?) and `validate` (does the
code match it?) share five check families and, until `check-set-restructure`, duplicated them.

#### BMAD — ordinal rubrics with a deterministic grade function

BMAD v6.11.0 organises validation as per-skill checklists plus a **rubric walker**. From
`src/bmm-skills/plan/bmad-prd/references/validate.md`, the reviewer subagent is told to:

> Form a judgment per dimension — *strong / adequate / thin / broken* — and write findings only
> where they add information. Cite specific PRD locations and quote phrases. **Severity ranks impact
> on the PRD's usefulness, not how easy the fix is.**

Then the grade is **derived by rule, not by judgment**:

> *Excellent* = all dimensions strong/adequate, no high/critical findings · *Good* = ≤1 thin
> dimension, no critical findings · *Fair* = multiple thin dimensions or any high finding · *Poor* =
> any broken dimension or any critical finding

This is the transferable idea. The LLM emits a small, closed-vocabulary judgment per dimension; a
deterministic function maps the vector of judgments to the verdict. adev's verdict logic
(`blocker_threshold: 1` in `templates/review-specs/defaults.yaml`) is a cruder version of the same
move — it only counts blockers — and its severity vocabulary is not tied to a per-dimension rubric.

BMAD's checklists carry a **frontmatter schema** — `validation-target`, `validation-criticality`,
`required-inputs`, `optional-inputs`, `validation-rules` — making the checklist itself a structured
artifact rather than prose. adev's reviewer prompts have no equivalent schema.

BMAD also runs reviewers in parallel writing to `review-{slug}.md` and returning compact summaries,
with a mandatory synthesis pass — architecturally the same as adev's Step 4/Step 5. Its two
distinguishing features are the ordinal rubric with a rule-derived grade, and *"findings only where
they add information"* as an explicit instruction.

#### Comparison

| | adev | spec-kit | BMAD |
|---|---|---|---|
| Spec-review agents | 3 parallel specialists (+1 quick synthesized) | 1 analyze pass | rubric walker + N ad-hoc, parallel |
| Post-implementation checks | 7 (5 LLM, 2 deterministic) | none | per-skill DoD checklists |
| Deterministic quality layer | `lib/diagnostics/` tiers 1–3 | none (scaffolding scripts only) | none |
| Stable requirement IDs | **no** | **yes** (FR-###, SC-###) | story/epic IDs |
| Finding cap | none | 50 + overflow | "only where they add information" |
| Verdict derivation | blocker count ≥ 1 | severity heuristic, advisory | **rule over per-dimension ordinals** |
| Registry customization | 3 registries, 3 models | `.specify/extensions.yml` hooks | per-skill assets |

adev is the most mechanized of the three and the only one with a real deterministic engine. Its
gaps are not "needs more agents" — they are requirement IDs, a finding cap, and actually using the
deterministic layer it already built.

### Web

No web sources. The framework claims are from cloned source at a pinned commit; the prior study's
literature digest (Agent SDK verification ranking, MAST, self-correction results) is cited from
`harness-simplification-study.md` rather than re-researched.

## Code Examples

```yaml
# Proposed check ID scheme — namespaced and semantic, matching the diagnostics registry
# that already works. Source: derived from .context-index/governance/diagnostics.yaml.
#
# BEFORE                                  AFTER
# validate.check-1.5-source-manifest  ->  adev/source-manifest-current
# validate.check-2-spec-compliance    ->  adev/spec-compliance
# validate.check-4-constitution       ->  adev/constitution-compliance
# validate.check-8-boundaries         ->  adev/boundary-compliance
# validate.check-9-transition-gates   ->  adev/transition-gates
# validate.check-11-visual-verification-> adev/visual-verification
# validate.check-14-gate-executability -> adev/gate-executability
#
# Ordering comes from `after:` (already present), not from the identifier.
# Legacy IDs stay readable via an explicit alias table rather than gaps:
aliases:
  validate.check-2-spec-compliance: adev/spec-compliance
  validate.check-5-adrs: review-specs/adr-compliance      # relocated, not deleted
  validate.check-10-platform-drift: hygiene/platform-drift # relocated, not deleted
```

```yaml
# Proposed uniform composition model — one semantics for all three registries.
# Today validate.yaml is replace-all (validate-config.mjs:74), review.yaml is a
# three-layer overlay (review-config.mjs:53-79), diagnostics.yaml is append-first-wins.
checks:
  # Project entries are DELTAS against bundled + domain defaults, matching review.yaml.
  # Matching `id` overrides field-by-field; new `id` appends; `disabled: true` opts out
  # explicitly and visibly — which is what the current model cannot express, because a
  # check absent from the file is indistinguishable from a check the project never saw.
  - id: adev/boundary-compliance
    disabled: true
    disabled_reason: "boundaries: [] — nothing to evaluate"
```

```javascript
// The mechanical half of check-8, as a tier-2 diagnostic instead of an LLM dispatch.
// The runner protocol, severity, tiering and registry already exist in lib/diagnostics/.
// Source: shape derived from lib/diagnostics/tier2/validated-without-report.mjs.
export function run({ boundaries, changedFiles }) {
  if (!boundaries?.length) {
    return { fired: false, skipped: true, reason: 'no boundary rules declared' };
  }
  const violations = boundaries.flatMap((rule) =>
    changedFiles
      .filter((f) => matchesGlob(f, rule.pattern))
      .map((f) => ({ file: f, rule: rule.id, severity: rule.severity })),
  );
  return violations.length
    ? { fired: true, severity: 'error', violations }
    : { fired: false };
}
// Note the `skipped: true` branch: an empty ruleset becomes a visible SKIP costing
// nothing, rather than a ~95K-token dispatch that structurally cannot fail.
```

## Recommendations

Ordered by cost-to-value, cheapest first.

1. **Reconcile the roadmap against the board, then delete one of them.** Two shipped items sat open
   for three months and two never got filed. Either the study's roadmap becomes issues and stops
   being a plan, or the board stops being the source of truth. Running both unreconciled is how
   `9z5i` and `j5qw` happened. File the two missing items now: batch systemic-failure detection,
   and the Checks 8/9/11 disposition.

2. **Gate the empty-ruleset checks on non-empty config.** One conditional each for Checks 8 and 9:
   if the ruleset is empty, SKIP without dispatching. No behavior change (they have never failed in
   40 and 39 runs respectively), immediate token saving on the framework's most expensive step. This
   is a strictly smaller change than deleting them and needs no measurement work — the study already
   did it, and `check-set-restructure.spec.md`'s "measured no-op table" is the standing method.

3. **Adopt the diagnostics ID scheme for validate checks**, with an explicit alias table for
   relocated IDs. This subsumes `adev-plugin-paky` (enum-enforce check IDs): once IDs are a closed
   namespaced set with a registry, the enum is the registry, and free-text drift
   (`drift | drift-detection | drift-warning`) becomes unrepresentable rather than merely
   discouraged. Relocated checks get alias entries instead of ordinal tombstones, so the history
   that gaps currently encode becomes readable.

4. **Unify registry composition on the overlay model** (`review.yaml`'s), and add explicit
   `disabled: true` + `disabled_reason`. This closes the silent-capability-loss class for checks,
   the same defect `adev-plugin-ogjm` reports for gates. It also makes "this project deliberately
   does not run boundary checks" a statement in the file rather than an absence.

5. **Migrate the mechanical checks into `lib/diagnostics/`** as tier-2 runners: boundary compliance,
   transition gates, the scope-expansion half of spec compliance, and the constitution rules that
   are greppable (CommonJS, `.mjs`-only, version parity, hardcoded `~/.claude/`, inline-Node — the
   last already has a working deterministic implementation in
   `.githooks/pre-commit-no-inline-node`). Validate keeps only genuine judgment: does the code
   match the spec's intent, and does the UI look right. Deterministic checks also run in CI and
   pre-commit, where LLM checks cannot.

6. **Add stable behavior IDs to specs.** This is the largest item and the highest leverage. Give
   each behavior statement a stable `B###` key the way spec-kit uses `FR-###`/`SC-###`. It makes
   coverage a set operation instead of a judgment: behaviors with no test, tasks with no behavior,
   tests with no behavior. It is also the missing prerequisite for the per-behavior test
   granularity work in `test-suite-size-oss-benchmark.md` — that study's blocker was precisely that
   1,923 behaviors have no identifiers and 79% of test files have no spec link. One change unblocks
   both.

7. **Add a finding cap and a rule-derived verdict.** Adopt spec-kit's explicit cap (50 findings +
   overflow summary) against the measured 4.5:1 advisory-to-blocker ratio, and BMAD's pattern of
   per-dimension ordinal judgments (*strong / adequate / thin / broken*) fed to a deterministic
   grade function. This keeps the LLM doing what it is good at — a small closed-vocabulary judgment
   per dimension — and moves verdict derivation into code, where it is auditable and cannot drift.

8. **Separate "is the spec good" from "does the code match it" explicitly**, as spec-kit does with
   `checklist` vs `analyze`. `check-set-restructure` already moved five check families across that
   line; nothing currently states the line, so the next check will be filed on whichever side its
   author happens to think of first.

## References

### Internal Files
- `.context-index/research/harness-simplification-study.md` — the study this cross-checks; Parts 2–3 and the Phase 0–4 roadmap
- `.context-index/research/test-suite-size-oss-benchmark.md` — the behavior-ID gap from the test side
- `.context-index/specs/features/validation/check-set-restructure.spec.md` — prior check-removal work and the "measured no-op table" method
- `.context-index/governance/validate.yaml` — 7 checks, ordinal IDs 1.5–14
- `.context-index/governance/diagnostics.yaml` — the ID scheme worth adopting
- `.context-index/governance/review.yaml` — the composition model worth adopting
- `.context-index/governance/boundaries.yaml` — `boundaries: []`
- `.context-index/governance/gates.yaml` — `transitions: {}`
- `lib/governance/validate-config.mjs:74` — single-source model, no overlay
- `lib/governance/review-config.mjs:53-79` — three-layer overlay
- `lib/diagnostics/tier1/`, `lib/diagnostics/tier2/validated-without-report.mjs` — the deterministic runner protocol
- `.githooks/pre-commit-no-inline-node` — a constitution rule already enforced deterministically
- `templates/review-specs/defaults.yaml` — `blocker_threshold: 1`

### Board Issues
- `adev-plugin-paky` — enum-enforce check IDs (open; subsumed by recommendation 3)
- `adev-plugin-j5qw` — `validated` requires `.validate.md` (open; **already implemented**)
- `adev-plugin-9z5i` — review-specs/validate dedup (closed during this investigation; shipped 2026-05-16)
- `adev-plugin-03du` — four unconsumed governance config fields
- `adev-plugin-ogjm` — silent gate loss on upgrade (same class as the check-registry defect)
- `adev-plugin-7tax`, `adev-plugin-r1qe`, `adev-plugin-gwq2` — open P2/P4 roadmap items

### GitHub Sources
- `github/spec-kit` @ `bf88c9f` (2026-08-14) — `templates/commands/analyze.md`, `templates/commands/checklist.md`, `templates/checklist-template.md`, `scripts/bash/`
- `bmad-code-org/BMAD-METHOD` @ `84d5b4b`, v6.11.0 (2026-08-14) — `src/bmm-skills/plan/bmad-prd/references/validate.md`, `src/bmm-skills/v6-shims/bmad-dev-story/checklist.md`, `src/bmm-skills/plan/bmad-prd/assets/prd-validation-checklist.md`
