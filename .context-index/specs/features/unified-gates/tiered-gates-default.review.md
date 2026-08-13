# Architecture Review: tiered-gates-default

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/unified-gates/tiered-gates-default.spec.md`
> **Charter:** `.context-index/specs/features/unified-gates/charter.md` (revision 4)
> **Rigor tier:** `quick` (explicit `--tier quick`; overrides `risk-policies.yaml` `medium.review_mode: full`)
> **Verdict:** BLOCK

last-reviewed-revision: 1
file-sha: c20edf8ca917ed08ce6efd2c03a2197488380a511693bafa3a8f3033c383a347

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Review | subagent | `general-purpose` harness agent with read-only constraints stated in-prompt (NOT a `resolveProfile`-enforced `reviewer-capable` profile — recorded honestly; no profile-level tool restriction was applied) | `plugin:review-specs/quick-synthesized-reviewer-prompt.md` — verified byte-identical between the worktree copy (`<ADEV_ROOT>=/Users/dpavancini/Development/adev-wave2-554/skills/review-specs/`) and the skill-loaded plugin-cache copy, so the dispatched prompt text is the worktree's |

Quick tier: the three bundled specialists (structural-architect, security-reviewer,
consistency-analyzer) were **not** dispatched. One synthesized reviewer covered all
three lenses in a single pass, per `graduated-rigor-tiers.spec.md`. The gate was not
skipped.

Module heuristics were retrieved (`adev heuristics retrieve --module unified-gates`)
and included in the reviewer's context pack.

## Quick Synthesized Review (quick-synthesized-reviewer)

**Verdict:** BLOCK

### SA-1 — blocker

- **blocker_id:** `quick-synthesized-reviewer:unreachable-postcondition:38c90edf`
- **section_anchor:** `### Postconditions`
- **Location:** `### Postconditions`, behaviors 4 and 5, `## Actionable Task Map`

**Finding.** The postcondition "Every newly scaffolded project declares at least two
tiers, and its integration tier executes (as a no-op or for real) at `post-implement`"
is not reachable through the mechanism this spec chooses.

`/adev:implement` Step 2-post (`skills/implement/SKILL.md` line 594) reads
`governance/gates.yaml` **directly** and filters `tier: integration`. It never calls
`adev domain load-gates` / `mergeGates`, so it never sees
`templates/domains/software/gates.yaml` or either extension overlay. The live
`[npm, run, --if-present, test:integration]` starter gate added by behaviors 4 and 5
is therefore visible only to `/adev:validate` Check 1b, which *does* use the merged
list (`skills/validate/SKILL.md` lines 99–108, 199). At `post-implement` the only
integration gate Step 2-post can see is the template's `integration-test` entry, whose
command is the `""` unwired sentinel.

Neither the Actionable Task Map nor the Acceptance Criteria contains a row touching
`/adev:implement`, so nothing in the planned work closes this gap.

**Recommendation.** Either add a behavior + task-map row routing Step 2-post through
`adev domain load-gates` (the merged list, as validate Check 1 already does), or narrow
the postcondition to state explicitly that `post-implement` execution depends on
`/adev:init` seeding the template entry, and that the domain-starter integration gate is
reachable only from `/adev:validate`.

### SA-2 — blocker

- **blocker_id:** `quick-synthesized-reviewer:unguarded-executor-path:1377c7ba`
- **section_anchor:** `### Behaviors`
- **Location:** `### Behaviors` (behavior 3), `### Error Cases`, `## Actionable Task Map`

**Finding.** Behavior 3 asserts that when a gate declares `command: ""`, "no gate with
an empty argv list reaches any executor." That guarantee is established only for the
`mergeGates` code path. It does not hold for `/adev:implement` Step 2-post.

Concretely: this spec makes the template's `integration-test` entry **live YAML** with
`command: ""`. Step 2-post reads raw `governance/gates.yaml`, filters
`tier: integration`, and then says only "Execute commands sequentially" — with no
non-empty-command check and no argv-form check. Compare Step 2h (per-task gates), which
explicitly guards: *"For each gate with `kind: deterministic` and non-empty `command`:
run it"* and logs "Skipped" when there is no command.

Today every template entry is commented out, so Step 2-post finds zero integration gates
and skips silently. After this spec, every scaffold whose `/adev:init` run did not seed a
command — a state this spec explicitly designs for; it is the entire reason the sentinel
and its named `INVALID_GATE` warning exist — hands a live, unwired gate to an unguarded
executor path at `post-implement`.

The sentinel-vs-`[]` analysis in "The default this spec chooses, and why" is **correct**
for `mergeGates` (verified by direct execution: `command: ""` is dropped with
`INVALID_GATE`; `command: []` survives with an empty argv list). The defect is that Step
2-post is the one consumer where that analysis needed to hold, and the spec does not
check it there.

**Recommendation.** Add a behavior mirroring Step 2h's guard (Step 2-post MUST skip any
gate whose `command` is empty or not an argv list, recording it as skipped), a task-map
row for `/adev:implement`, and an acceptance criterion asserting it.

### SA-3 — warning

- **Location:** `### Behaviors` (behavior 7), `## Acceptance Criteria`

**Finding.** "`adev gate doctor` on a fresh scaffold carrying the new defaults exits 0
with zero error-severity findings" is vacuously satisfiable. `lib/gates/doctor.mjs`'s
`loadGates` reads `.context-index/governance/gates.yaml` only — it never calls
`mergeGates` — so on a fresh scaffold it sees the `""` sentinels (yielding
`gate-doctor/empty-command`, severity *warning*) and never analyses the new starter
integration gate at all. The criterion passes without exercising the default it is meant
to verify. Behavior 7's enumeration of expected fresh-scaffold warnings
(`ci-config-missing`, `runner-unknown`) also omits `empty-command`, which is the direct
consequence of the sentinel this spec introduces.

**Recommendation.** Restate the criterion against a scaffold whose `gates.yaml` has been
seeded per behavior 8 (or against the merged gate set), and add `empty-command` to the
enumerated expected warnings for the unseeded case.

### SA-4 — warning

- **Location:** `### Behaviors` (behavior 6), `### Postconditions`

**Finding.** "`adev gate doctor` diagnoses every gate the loader accepts" overstates what
argv normalisation delivers. `doctor.mjs::scriptNameOf` maps `npm run <X>` to the token
immediately after `run`; for `npm run --if-present test:integration` it returns
`"--if-present"`, so `resolveCommandChain` finds no matching `package.json` script and
never follows the one-hop indirection into `scripts["test:integration"]`. The chain
analysis of gate-doctor behavior 7a — the doctor's original motivating case, where the
`**` glob lived in the script body rather than the gate command — is silently defeated by
the exact idiom this spec makes the default. (`test:integration` also escapes
`referencedPathsDetailed`, which only treats tokens containing `/` as paths; that part is
benign and produces no false error.)

**Recommendation.** Either add a task teaching `scriptNameOf` to skip `-`-prefixed tokens
after `run`, or downgrade the postcondition and record the blind spot in Known Limitations.

### CON-1 — warning

- **Location:** `### Root Cause`, Defect B

**Finding.** The spec cites `docs/governance.md` as already stating the correct rule,
quoting *"argv form only. `command: "npm test"` (string) fails load with
`QUALITY_GATE_COMMAND_SHELL`"*. That line (governance.md:285) sits in the
**`governance/validate.yaml` quality-gate hardening** section, and
`QUALITY_GATE_COMMAND_SHELL` is emitted by `lib/governance/validate-config.mjs`, not by
`merge-gates.mjs` (which emits `INVALID_GATE`). Recipe 3 (governance.md:377) does state
argv-only for gate commands generically, so the spec's *conclusion* survives, but
`docs/governance.md` has **no** section documenting the `governance/gates.yaml` gate
schema at all. The premise "the docs are right, only the template drifted" is inaccurate
for this loader.

**Recommendation.** Correct the citation to Recipe 3, and scope the Docs task-map row to
*adding* the missing `gates.yaml` schema section (including `INVALID_GATE`), not merely a
"shipped default" note.

### CON-2 — warning

- **Location:** `### The default this spec chooses, and why`; charter `## Quality Attributes`

**Finding.** An error-severity gate that exits 0 because the script is undefined reports
**PASS**. That is in tension with the charter's Transparency attribute: *"Every validation
report explicitly shows what ran, what was skipped, and why. No silent passes for
unchecked items."* A project can carry a permanently green integration tier that has never
executed anything.

**Recommendation.** Require the gate `description` and/or the GateResult rendering to
distinguish "no-op — `test:integration` undefined" from a genuine pass.

### SEC-1 — suggestion

- **Location:** `### Preconditions`

**Finding.** No new trust boundary is crossed. SEC-2 (argv-only) is preserved rather than
relaxed, the sentinel choice (`""` over `[]`) is the safe one given the loader's actual
semantics, and no `{{ }}` interpolation is introduced. Worth stating explicitly in
Preconditions that starter/overlay gates are repo-authored rather than user input, which
is why they are trusted to ship live commands.

---

## Verification Performed

These claims of the spec were checked against worktree source rather than taken on trust:

| Claim | Result |
|---|---|
| `merge-gates.mjs::validateGate` rejects string-form `command` (SEC-2) | CONFIRMED (`INVALID_GATE`, "must be an argv list (array), not a string — skipped") |
| `command: ""` is dropped with a named warning | CONFIRMED by direct execution ("missing required command field — skipped") |
| `command: []` is truthy and survives `validateGate` with an empty argv list | CONFIRMED by direct execution — the spec's rationale for rejecting `[]` as sentinel is correct |
| `[npm, run, --if-present, test:integration]` parses correctly under `lib/profiles/yaml.mjs` | CONFIRMED (4-element array; no colon mis-parse in flow sequence) |
| `npm run --if-present <undefined script>` exits 0 | CONFIRMED empirically (npm 11.6.2) |
| `transitions: {}` is already live YAML in the template | CONFIRMED — the issue text is stale, as the spec states |
| Template is fully commented out; starters hardcode `["npm","test"]` fast-tier only | CONFIRMED (Defects A and B reproduce) |
| `gate-doctor.spec.md` does not normatively pin `command` to a YAML string | CONFIRMED — it describes `command` behaviorally; several acceptance fixtures use string form, which argv normalisation keeps working. No contradiction. |
| No contradiction with `charter.md` revision 4 | CONFIRMED — the charter already carries a "Tiered Gates by Default" capability (status `specified`) whose text matches this spec |
| `docs/governance.md` "already documents argv-only" | PARTIALLY CONFIRMED — see CON-1 |
| `mergeGates` preserves gate metadata | NOT AS ASSUMED — it returns only `{id, command, description?, severity?, tier?}`, dropping `name`, `kind`, `scope`, `required`, `triggers`. Behaviors 4/5 assert only `tier` and `severity`, so they still hold; noted for planning. |

---

## Summary

**Total findings:** 7 (2 blockers, 4 warnings, 1 suggestion)

**Action required:** Run `/adev:specify --revise` on
`.context-index/specs/features/unified-gates/tiered-gates-default.spec.md` to address SA-1
and SA-2, then re-review.

**SA-1 and SA-2 share one root cause** — `/adev:implement` Step 2-post consumes raw
`governance/gates.yaml` instead of the merged gate list, so it neither sees the domain
starter's integration gate nor guards against the unwired sentinel. A single revision that
adds one behavior plus one `/adev:implement` task-map row closes both; they do not need two
passes.

The spec's core design (argv alignment, `""` over `[]` as the sentinel,
`npm run --if-present` as a verified no-op, activity where the stack is known) is sound and
every schema-level claim it makes was verified true. The blockers are about consumer
coverage, not about the chosen default.

**Transition note:** `.context-index/governance/gates.yaml` defines no `spec-to-plan`
transition, so no `approver_role` applies to this review.

**Lifecycle-log mapping note.** The lifecycle event enum (`lib/cli/report.mjs`
`VALID_VERDICTS`, `lib/lifecycle-state.mjs`) has no `BLOCK` member — it is
`PASS | PASS_WITH_NOTES | FAIL`. The consolidated `BLOCK` verdict of this report is
therefore recorded as `FAIL` in both the `reviewer_report` and the `step_completed`
events. The artifact and the log do not disagree. Enforcement was verified:
`adev gate require --skill plan --spec <this spec>` exits `2`.

The `UNKNOWN_REVIEWER_DEFAULTED` advisory emitted while writing the reviewer event is
expected — `quick-synthesized-reviewer` is not declared in the `software` domain's
`reviewers.yaml`, so its event severity defaulted to `warning`. Event severity does not
feed the consolidated verdict and does not soften this BLOCK.
