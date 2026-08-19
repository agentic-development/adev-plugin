<!-- partial_schema: spec@1 -->

---
charter: implementation
kind: skill
status: implemented
risk_level: high
milestone:
revision: 11
charter-revision: 1
created: 2026-08-17
updated: 2026-08-19
research-ref: .context-index/research/tdd-cycle-graduation-design-analysis.md
depends-on:
  - .context-index/specs/features/implementation/review-provenance.spec.md
  - .context-index/specs/features/implementation/batched-task-dispatch.spec.md
relates-to: .context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md
source-manifest:
  sha: "2a12564"
  files:
    - .context-index/governance/risk-policies.yaml
    - docs/cli-reference.md
    - docs/skill-reference.md
    - lib/cli/implement.mjs
    - lib/cli/test-policy.mjs
    - lib/diagnostics/event-schemas.mjs
    - lib/governance/rigor-mode.mjs
    - lib/implement/review-depth.mjs
    - lib/lifecycle-events.mjs
    - lib/lifecycle-state.mjs
    - lib/manifest.mjs
    - providers/codex/skills/build/SKILL.md
    - providers/codex/skills/build/step4-tier-propagation.md
    - providers/codex/skills/implement/SKILL.md
    - providers/codex/skills/implement/feature-completeness-dod.md
    - providers/codex/skills/implement/graduated-review-depth.md
    - providers/codex/skills/implement/synthesized-reviewer-prompt.md
    - providers/opencode/skills/build/SKILL.md
    - providers/opencode/skills/build/step4-tier-propagation.md
    - providers/opencode/skills/implement/SKILL.md
    - providers/opencode/skills/implement/feature-completeness-dod.md
    - providers/opencode/skills/implement/graduated-review-depth.md
    - providers/opencode/skills/implement/synthesized-reviewer-prompt.md
    - skills/build/SKILL.md
    - skills/build/step4-tier-propagation.md
    - skills/implement/SKILL.md
    - skills/implement/feature-completeness-dod.md
    - skills/implement/graduated-review-depth.md
    - skills/implement/synthesized-reviewer-prompt.md
    - templates/risk-policies-template.yaml
    - tests/cli/implement-resolve-depth.test.mjs
    - tests/docs/implement-resolve-depth-docs.test.mjs
    - tests/governance/rigor-mode.test.mjs
    - tests/governance/risk-policies-implement-mode.test.mjs
    - tests/lib/implement/review-depth.test.mjs
    - tests/lib/manifest.test.mjs
    - tests/lifecycle/gate-outcomes.test.mjs
    - tests/lifecycle/review-depth-resolved-event.test.mjs
    - tests/skills/build-tier-propagation.test.mjs
    - tests/skills/implement-graduated-review-depth.test.mjs
    - tests/skills/implement-review-provenance.test.mjs
    - tests/skills/implement-synthesized-prompt.test.mjs
    - tests/skills/implement.test.mjs
  computed-at: "2026-08-19T20:27:40.286Z"
---

# Skill Spec: Graduated Review Depth in /adev:implement

<!-- Skill Spec within the implementation charter.
     Parent Charter: .context-index/specs/features/implementation/charter.md
     Source research: .context-index/research/tdd-cycle-graduation-design-analysis.md
     (Recommendations 3b, 4, 5, 6a). -->

<!-- SCOPE NOTE. The parent charter's Skills section already names "2-stage review"
     as a documented behavior of adev:implement, so graduating that review's depth
     modifies an in-charter behavior rather than extending charter scope. No
     `charter-extension: true` is set. The charter carries no Capability Map table
     (it is still an /adev:init draft), so no capability row is flipped to
     `specified` by this spec — recorded because /adev:specify Step 5 would
     normally perform that update.

     THIS SPEC SHIPS LAST OF THREE, and the ordering is a safety property rather
     than a convenience:
       1. review-provenance.spec.md    — makes review-round yield observable
       2. batched-task-dispatch.spec.md — cuts dispatch cost with every review intact
       3. this spec                     — thins the review layer itself
     Batching and review collapse are both dispatch reductions, and stacking them
     blind is the real hazard: five tasks at (1 implementer + 2 reviewers) is 15
     dispatches, which becomes 6 under collapse alone and 2 under both. Batching
     goes first because it never touches the defect-catching layer, so quality
     stays observable while cost falls. This spec touches exactly that layer, so
     it goes last, after provenance can show what changed. -->

<!-- MEASUREMENT HONESTY. The source research performed no yield measurement:
     research finding F-I9 established that no artifact this framework writes
     records how many review cycles a task consumed or what each cycle found, so
     "which rounds actually find things" is unanswerable from stored data today.
     Six research claims are tagged [NEEDS-YIELD].

     The quick-grant predicate's per-dimension threshold (B) is NOT justified by
     yield data — none exists. It was set to >= 0.6 per dimension after the
     project owner rejected an earlier, tighter revision (all four dimensions at
     the literal maximum, 1.0) as unacceptably restrictive: that version matched
     only 5.4% of this repository's own historical task corpus (22 of 406 task
     entries, computed directly from every .routing.json sidecar in
     .context-index/specs/, after excluding 12 entries with out-of-range or
     non-numeric scores per Section D's own fail-closed rule), while >= 0.6
     matches 66.0% (268/406) — 96.8% of tasks already routed auto-agent by
     /adev:route (268 of 277 auto-agent-routed, valid-score entries). The
     safety argument for this
     wider bar is therefore NOT "we measured it's safe" — it explicitly is not —
     it is architectural: every grant still passes through the mandatory floor
     pass (E) — six independent legs, evaluated per task, on both the
     provisional and final resolution — and `quick` still runs every check both
     stages perform today, only consolidated into one dispatch. Nothing above
     the floor is unconditional; the auto-agent-routing gate plus the floors are
     the actual backstop, not the score threshold's tightness. Widening the
     threshold further, or removing a floor leg, remains gated on
     `review-provenance.spec.md`'s data — this one change is not a precedent for
     skipping that gate again. -->

<!-- MEASUREMENT HONESTY, part 2. A reviewer will reasonably ask: doesn't a
     66.0%-wide grant population reintroduce the similarly-wide `routingEasy`
     signal (B) explicitly forbids reusing? The population size is now similar
     by coincidence, not by mechanism, and the mechanism is what the
     `routingEasy` prohibition is actually about. `resolveRigorMode()`'s
     `routingEasy === true → "quick"` short-circuit, if it applied to
     `implement`, would sit ABOVE policy in the precedence and grant `quick` as
     a single run-wide boolean with no further per-task check and no floor
     pass — review-specs/validate's own `quick` tier has no per-task floor
     mechanism at all. This spec's predicate, however wide its population, is
     evaluated per task and can NEVER skip the floor pass — a task that matches
     every row of (B) still resolves `full` if `risk_level: high`, a boundary is
     crossed, a sensitive path is touched, a Critical finding appears, its
     actual diff mismatches its declared scope, or it is dispatched inside a
     batch. The prohibition on reusing `routingEasy` is about that structural
     guarantee, not about keeping the eligible population small for its own
     sake. -->

## Invocation Modes

`/adev:implement` gains no new required flags. Review depth is resolved per
task, automatically, from artifacts that already exist on disk
(`<plan-stem>.routing.json`, the spec's `risk_level`, and
`.context-index/governance/risk-policies.yaml`).

### Existing behavior, unchanged under `full`

Under `full` — the default, and the outcome whenever any input is missing,
unusable, or contested — Step 2f (Stage 1: Spec Compliance) and Step 2g
(Stage 2: Code Quality) dispatch as two sequential fresh subagents exactly as
they do today. This spec adds no check and removes no check from the `full`
path.

### `quick`: one reviewer, both lenses

Under `quick`, Steps 2f and 2g **collapse into a single dispatch** carrying
**both** lenses. The synthesized reviewer receives the union of both stages'
inputs — task requirements, the implementer's report, the acceptance criteria
from the Live Spec, **and** the git diff, the constitution's Coding Standards,
any `DONE_WITH_CONCERNS` notes, and the secondary specialist matches — and
answers both stages' questions: Stage 1's missing-requirements / extra-work /
misunderstandings triad *and* every item in `code-quality-checklist.md`.

It remains a fresh subagent, still instructed to verify by reading code rather
than trusting the report, and still required to tag Critical/Important findings
with stable `cq-<n>` ids reused across cycles, so `lib/loop-convergence.mjs`
keeps working unchanged.

**`quick` never means skip.** This mirrors the invariant
`graduated-rigor-tiers.spec.md` already establishes for `/adev:review-specs` and
`/adev:validate`: the check set is preserved verbatim; only the dispatch count
changes, from two subagents to one. Dropping a stage is out of scope and would
be unsound for a specific reason — research finding F-I7 found that neither
stage's checks are uniquely covered anywhere (Stage 1 has an analogue in
`/adev:validate` Check 2, Stage 2's constitution half in Check 4). A dropped
stage therefore does not remove a check, it silently **defers** it to
`/adev:validate` at whole-spec scope, after a bad task-1 foundation has already
compounded through every later task. Deferral is rework cost wearing the costume
of a saving.

### One structural gap this collapse must not inherit

Stage 2 requires stable finding ids and runs them through
`evaluateStopCondition`; Stage 1 has only a bare "maximum 3 review cycles, then
escalate" with no id tracking and no convergence check. So Stage 1 can loop
three times on drifting findings today and nothing detects it.

The synthesized reviewer applies the id-tagging discipline and the convergence
check to **both** lenses. Collapsing the stages therefore closes that gap rather
than propagating it, and this is a coverage *increase* under `quick` — worth
stating because it partially offsets the dispatch reduction and is testable.

### `--tier` propagation, and why `full` and `quick` are not symmetric here

`/adev:implement` accepts `--tier full|quick`, matching the axis `/adev:route`,
`/adev:work`, and `/adev:build` already propagate to the other gate skills.
`/adev:build` propagates an operator-supplied `--tier` to `/adev:implement`
the same way it already does for Steps 1 and 5 (review-specs, validate) — but
as of this spec, Step 4 (Implement) in `skills/build/SKILL.md` has **no**
`--tier` propagation clause at all; its dispatch args are just `<plan-path>`.
**This spec commits to adding that clause** (Output Contract H) as part of
its own delivery, not as a pre-existing fact — an operator running
`/adev:build --tier full` today gets nothing forwarded to implement, and
every task falls through to whatever `implement_mode` the risk policy
resolves. Once added, the clause mirrors Steps 1 and 5's existing behavior
exactly: `/adev:build` forwards a tier only when the operator passed `--tier`
directly to `/adev:build` itself — never one `/adev:build` merely *resolved*
on review-specs' or validate's behalf via the routing signal (per
`skills/build/SKILL.md`'s own `--tier` documentation for those steps: *"When
absent, each of those steps resolves its own rigor tier... the build
orchestrator does not resolve or default this value itself"*). So every
`--tier` this skill will ever receive, direct or propagated, traces back to an
explicit operator instruction — never to an auto-derived one.

**`--tier full` is absolute.** It resolves `full` immediately and
unconditionally, for every task in the run, full stop — no predicate, no
floor, nothing overrides it (nothing needs to: floor legs only ever push
*toward* `full`). This closes the gap an earlier revision left open: without
this, an operator's explicit `--tier full` — issued because they expected
elevated scrutiny — could be silently downgraded back to `quick` by the
predicate in (B), with no advisory distinguishing the downgrade from an
ordinary grant. That is the opposite of what an explicit override is for.

**`--tier quick` is deliberately *not* absolute, and this is the load-bearing
asymmetry in this spec.** It does not force `quick` on any task. It only
*authorizes evaluating* the predicate in (B) on a run where the policy
baseline would otherwise skip that evaluation entirely (i.e. where
`implement_mode` for the spec's `risk_level` is `full`). Each task still has
to independently satisfy every row of predicate (B) to actually resolve
`quick`; a task that fails even one row resolves `full` regardless of the
flag.

Why the asymmetry is necessary, not incidental: `/adev:route`'s "easy"
predicate is 69% wide, and an operator who follows `/adev:route`'s own
printed recommendation can end up passing one blanket `--tier quick` to a
whole `/adev:build` run — intending it for `/adev:review-specs` and
`/adev:validate`, where `quick` already has no further per-task gate (it just
narrows scope, full stop, exactly like `--tier full` does for them). If
`--tier quick` behaved the same way here, that same blanket flag would
silently grant `quick` to every task in the run, including ones nowhere near
predicate (B)'s tight bar — reopening, through the flag, the exact 69%-wide
hole predicate (B) exists to close. Requiring the predicate to still hold,
flag or no flag, is what keeps that hole shut.

The floor pass (Output Contract E) still applies after either path, and still
wins: a floored task never resolves `quick`, even when the operator asked for
it and the predicate matched, because the floor legs (`risk_level: high`, a
crossed boundary, a sensitive path, a prior Critical finding on this task) are
safety properties, not conveniences. The escape hatch for a floored task is to
change a reviewable artifact (the spec's `risk_level`, or `boundaries.yaml`),
not a flag that leaves no trace in any reviewed file.

## Arguments

| Argument | Required | Description |
|---|---|---|
| `--tier full` | No | Absolute. Forces `full` for every task in the run, no exceptions. |
| `--tier quick` | No | **Not** absolute. Authorizes evaluating the quick-grant predicate (B) for this run even when the policy baseline is `full`; each task still must independently satisfy every row of (B) to actually resolve `quick`. A task failing any row resolves `full`. Still subject to the floor pass (E). |
| `--review-cycles <n>` | No | Per-run override of `implement.max_review_cycles`. Must satisfy `Number.isInteger(n) && n >= 1`; `0` is rejected with `INVALID_REVIEW_CYCLES` (a cap of `0` would dispatch no reviewer at all, violating "`quick` never means skip"). Precedence: `--review-cycles` (highest) → `implement.max_review_cycles` (manifest) → `3` (default). |

Both `--tier` values are validated by the existing `isValidTier()`; an
out-of-enumeration value throws `INVALID_TIER` — no new validator for the flag
itself.

| Surface | Location | Default | Validation |
|---|---|---|---|
| `implement_mode: full \| quick` | `.context-index/governance/risk-policies.yaml`, per risk level | `full` for `high` and `medium`, `quick` for `low` — mirroring the `review_mode` / `validate_mode` rows already in `templates/risk-policies-template.yaml` | Existing `isValidTier()`. An out-of-enumeration value resolves to `full` rather than throwing, matching how `resolveRigorMode()` already treats a malformed policy value |
| `implement.max_review_cycles` | `.context-index/manifest.yaml` | `3` — preserving today's hardcoded cap exactly | New `validateMaxReviewCycles()` in `lib/manifest.mjs`, a structural copy of the existing `validateMaxReviewRetries()`, throwing `INVALID_MAX_REVIEW_CYCLES` on non-integer / non-finite / **less than 1** (not merely non-negative — `0` is rejected for the same reason `--review-cycles: 0` is, above) |

## Output Contract

### A. Depth resolution

Resolved **twice** per task: provisionally at dispatch time (before RED/GREEN,
to decide the human-checkpoint pause and to brief the implementer), and
**finally** right before Stage 1/2 review actually dispatches — after GREEN,
against the real diff (see (E)'s `scope-mismatch` and `critical-finding` legs
for why the second pass exists and what it checks).

Both passes run the same function,
`resolveImplementReviewDepth({ spec, task, routingEntry, tierFlag, policies,
touchedFiles }) → { depth: 'full'|'quick', source: string, floor_applied:
boolean, floor_legs: string[], warnings: object[] }`, exported from
`lib/implement/review-depth.mjs` (new) and invoked via the CLI verb
`adev implement resolve-depth --spec <path> --plan <path> --task-id <id>
[--tier full|quick] [--base-sha <sha>]` (JSON on stdout; `--plan` is required
because a task id is only unique within its own plan — `slugFromSpec()` (K)
also derives its exclusion path from the spec, not the plan, so both are
needed independently; the constitution's cli-driver-surface rule
requires this named verb rather than an inline call, per the precedent
`adev test-policy resolve` sets in `test-depth-policy.spec.md`). `--base-sha`
is omitted on the provisional pass (no diff exists yet) and required on the
final pass.

**Only one SHA, not a range — because at final-pass time there is no head
commit yet.** Per (G), commit granularity is one commit per task, authored
*after* review passes; the final pass runs immediately after GREEN but
*before* that commit, so "head" is an uncommitted working tree, not a SHA.
The verb therefore diffs a single ref against the working tree, adapting —
not copying verbatim — `lib/cli/boundaries.mjs`'s union pattern of two calls.
Two prior revisions of this section pinned `git diff --name-only`, which
cannot report **which kind** of change a path underwent, and left git's
default rename-pairing on, which can silently collapse a delete-plus-add
pair into one `R100` record the moment either path is staged. Both defects
share one root cause — `--name-only` is the wrong primitive for a leg that
needs to distinguish addition from modification/deletion/type-change per
path — so this revision replaces the mechanism once, completely, rather than
patching it a third time:

```
git diff --no-renames --name-status -z <base-sha>
git ls-files --others --exclude-standard -z
```

- `--name-status` prints `<status-letter><TAB><path>` per record (`A`
  added, `M` modified, `D` deleted, `T` type-changed) — the per-file
  discrimination the `scope-mismatch` leg's second condition requires and
  `--name-only` structurally cannot supply.
- `--no-renames` disables git's default rename/copy pairing entirely, so a
  delete-plus-add is always reported as two independent `D`/`A` records,
  never collapsed into one `R100`/`C100` entry that would hide the deleted
  path's own status the moment it is staged. This spec has no use for rename
  *lineage* — it only needs "was this path touched, and how" — so disabling
  pairing loses nothing it needs and closes the collapse gap outright.
- The untracked-file call is unchanged from the prior revision, its output
  treated as status `A`, for the reason already established: no staging
  step exists anywhere before the final pass fires
  (`skills/implement/SKILL.md` never runs `git add`), so a freshly created
  file is genuinely untracked at final-pass time whenever the implementer
  hasn't separately staged it.

This is a departure from `lib/cli/boundaries.mjs`'s own default mode
(`--diff-filter=ACMR`, renames left on), which is correct for *that*
module's purpose — deciding whether a boundary rule applies to a changed
file, where a deleted path needs no check and rename lineage may matter.
Neither property transfers here: predicate (B)'s "additive-only" row exists
precisely so *"a task that only adds files cannot regress an existing
caller,"* and deleting, type-swapping, or renaming-away an out-of-scope
pre-existing file is that exact regression — more directly than a mere
modification, and one this spec's leg must see regardless of whether git
decided to describe it as a rename.

**`touchedFiles` is never accepted as a raw, self-reported argument.** An
earlier revision took a `--touched-files <csv>` flag directly from the
caller — a comma-delimited, self-attested value with no ground-truth
guarantee and a delimiter hazard (a filename containing a comma). This spec
instead has the verb compute the touched-file set **itself** via the git diff
above. `--base-sha` alone is a meaningful, checkable coordinate into git
history rather than a claim about what changed — see (I) for where that
single value comes from and why it is new work this spec delivers, not a
pre-existing capability.

`lib/implement/review-depth.mjs` **ports the structure** of
`lib/test-strategies/depth.mjs`'s escalation-plus-floor pattern — it does not
import `evalExpr` or `resolveFloor` from that module, because both are
module-private there. Only `resolveTestDepth` is exported. This spec
duplicates the pinned `when:` grammar and floor-pass shape as new,
implement-scoped private functions in the new module, rather than widening
`lib/test-strategies/depth.mjs`'s public surface for a caller outside its own
domain. `lib/test-strategies/depth.mjs` is read (not imported) for this
structural precedent and is listed in `source-manifest` on that basis.

Precedence:

1. **`--tier full`** — absolute. Resolves `full` immediately; nothing below
   this line runs. (See "`--tier` propagation" above for why this and `quick`
   are not symmetric.)
2. **Policy baseline** — `implement_mode` for the spec's `risk_level`, read via
   the existing `loadRigorPolicies()`. Absent file, absent key, or malformed
   value → `full`.
3. **Quick-grant predicate** — evaluated when the baseline is `quick` (stage 2)
   **or** `--tier quick` was supplied (which authorizes evaluation even when
   the baseline is `full`). A task is granted `quick` only by affirmatively
   matching every row of (B); failing any row keeps `full`.
4. **Floor pass** — forces `full`, unconditionally, overriding every stage
   above, including an explicit `--tier quick`.

The safety property: stage 3 can only *grant* `quick` and must match
affirmatively to do so; stage 4 can only *revoke* it and needs a single leg to
hold; stage 1 is the one absolute, unconditional exit. Every failure mode —
unreadable sidecar, unparseable expression, out-of-range score, missing
frontmatter — lands on `full`.

Advisories from this resolution do **not** persist via `plan_task` at all —
`plan-task-events.spec.md` (`status: validated`) closes that payload to
exactly `{plan, task_id, status, notes}`, and structured data belongs on a
new event variant in a follow-up spec by that spec's own rule, not squeezed
into `notes`. An earlier revision claimed a "free-form advisory channel" on
`plan_task` that does not exist; this revision withdraws that claim rather
than route around it. See (J) for where this data actually lands.

### B. The quick-grant predicate

A task is granted `quick` only when **all** of the following hold:

| Condition | Source | Rationale |
|---|---|---|
| `selected_agent == "auto-agent"` | `.routing.json` | The primary safety gate — a human or `/adev:route` already decided this task is safe for unsupervised execution. Necessary on its own, not sufficient without the row below. |
| All four dimensions `>= 0.6` | `.routing.json` `scores` | Each dimension scored `>= 3/5` by `/adev:route`. This is a confidence floor, not a demand for perfection — see the frontmatter comment above for why `1.0` was rejected as too narrow (5.4% of this repo's own task corpus) in favor of `0.6` (66.0%, i.e. 96.8% of auto-agent-routed tasks). |
| No governance boundary crossed | `boundaries.yaml` for the task's target paths | Same input the depth floor already consumes |
| Additive-only file changes | task's declared target files (dispatch-time declaration only) | A task that only adds files cannot regress an existing caller. **This row is a provisional-pass declaration, not a fact yet in evidence** — the final pass re-checks it against the real diff via the `scope-mismatch` floor leg (E), because nothing prevents an implementer from touching more than what was declared. |

**Reusing `/adev:route`'s "easy" signal directly (as a boolean short-circuit)
remains forbidden, even though this predicate's population is now similar in
size.** See the frontmatter comment for the full reasoning: the prohibition is
about a structural property — this predicate is evaluated per task and can
never skip the mandatory floor pass — not about keeping the eligible
population small for its own sake.

Scale and direction are pinned by `/adev:route`: sidecar dimensions are `0..1`
fractions produced by dividing the Step-2 integer `1..5` by 5, and **higher means
more agent-suitable** (low novelty and low blast radius both score *high*). A
predicate written against the wrong direction would invert the whole mechanism,
so (D) validates before comparing.

**Consequently `resolveRigorMode()`'s existing `routingEasy === true → "quick"`
short-circuit MUST NOT apply when `skill === "implement"`.** That leg sits above
policy in the current precedence and would grant `quick` as a single run-wide
boolean with no per-task floor pass at all — a materially weaker guarantee than
this predicate provides even at a wide population, because this predicate is
re-evaluated per task and the floor pass (E) never skippable. Its behavior for
`review-specs` and `validate` is unchanged.

### B.5 Cross-spec amendment: `graduated-rigor-tiers.spec.md`

`resolveRigorMode()` is owned by `graduated-rigor-tiers.spec.md`, whose
`affects:` list (`[review-specs, validate, route, work, init, build]`) omits
`implement`, and whose "Resolution helper (lib)" section states
`resolveRigorMode()`'s precedence — `tierOverride > routingEasy > policy(riskLevel)
> "full"` — unconditionally, with no per-skill exception. This spec changes
that function's behavior for `skill === "implement"` (the explicit
`implement_mode` key in (C); the `routingEasy` short-circuit not applying;
`--tier quick` being non-absolute where `tierOverride` is absolute for every
other skill) without a declared amendment to the spec that owns it — the
same defect class `review-provenance.spec.md` closed for
`plan-task-events.spec.md` by declaring its amendments as in-scope, landing
in lockstep, rather than leaving the owning spec silently stale.

**This spec is that amendment, and it has already landed on the owning
file, not merely been proposed here.** `graduated-rigor-tiers.spec.md`'s
`affects:` list now reads `[review-specs, validate, route, work, init, build,
implement]`, its "Resolution helper (lib)" section carries the stated
carve-out (*"For `skill === 'implement'`, `tierOverride: 'quick'` does not
win unconditionally... `tierOverride: 'full'` remains unconditional for every
skill, `implement` included"*), and its `revision`/`updated` frontmatter
fields were bumped (`2 → 3`, `2026-08-12 → 2026-08-19`) — mirroring exactly
how the cited precedent, `review-provenance.spec.md`, executed its own
amendments to `plan-task-events.spec.md` and `lifecycle-event-log.spec.md` by
editing those files directly rather than only describing the edit from the
dependent spec's side. `review-specs`, `validate`, `route`, `work`, `init`,
and `build`'s existing behavior is otherwise untouched — this is a documented
exception for one skill, not a change to the function's default contract.
`graduated-rigor-tiers.spec.md` is in `source-manifest` on this basis.

### C. Key derivation must become explicit

`resolveRigorMode()` currently derives its policy key as
`skill === "validate" ? "validate_mode" : "review_mode"`. Passing
`skill: "implement"` through it **today silently resolves against `review_mode`**
— inheriting `/adev:review-specs`' tier for an unrelated gate, with no error.
This spec replaces the ternary with an explicit map:

| `skill` | Policy key |
|---|---|
| `"validate"` | `validate_mode` |
| `"implement"` | `implement_mode` |
| anything else | `review_mode` (unchanged) |

An unrecognized `skill` keeps today's `review_mode` fallback, so no existing
caller changes behavior.

### D. Score-scale validation (fail-closed)

Before any dimension is compared, each of the four scores is validated as a
finite number within `0..1` inclusive.

`adev route emit-sidecar` already rejects out-of-range values with
`INVALID_ROUTING_ENTRY`, yet research finding F-I10 found a sidecar on disk
carrying un-normalized `1..5` scores — so upstream validation cannot be assumed.
This matters more at `>= 0.6` than it would have at the rejected `== 1.0`
alternative: an un-normalized raw score of `1` (the *worst* confidence rating
on the original `1..5` scale) numerically satisfies `1 >= 0.6` and falls
inside the `0..1` range, so it would be silently treated as a strong,
qualifying score instead of the weakest possible one — a fail-open the `== 1.0`
version would not have shared (a raw `1` never equals `1.0`... except that it
numerically does, so `== 1.0` was never actually safe here either; it was
merely less likely to be hit by coincidence). Un-normalized raw scores of `2`
through `5` are caught by the `0..1` range check below; only raw `1` slips
through undetected by range alone. Validation is therefore specified at the
read boundary, once, for every consumer of this module:

- Any score outside `0..1`, non-finite, or non-numeric → the task resolves
  `full`, and a `ROUTING_SCORE_OUT_OF_RANGE` advisory names the task, the
  dimension, and the offending value.
- Scores are **never coerced or rescaled**. Silently dividing a `1..5` score by 5
  would paper over a corrupt artifact that `/adev:route` should be made to
  rewrite.

Expression evaluation reuses the pinned `when:` grammar from
`lib/test-strategies/depth.mjs` (one comparator followed by a `0..1` float,
evaluated by regex and comparison — never `eval` or `new Function`). That
evaluator returns `false` on an unparseable expression, which composes correctly
here: a parse failure fails to *grant* `quick`, leaving `full`.

### E. Floor legs

The floor pass ports `resolveFloor()`'s structure from
`lib/test-strategies/depth.mjs` (duplicated, not imported — see (A) on why) —
applied last, in every resolution path, escalating only — with its three legs
preserved and two added:

| Leg | Condition | Evaluated on |
|---|---|---|
| `risk-level` | Spec frontmatter `risk_level: high` | Both passes |
| `boundary` | The task crosses a governance boundary | Both passes |
| `sensitive-path` | A target path matches the effective sensitive-path set (leg skipped when the target-path set is empty, matching the existing degraded mode) | Both passes |
| `critical-finding` | Any cycle on this task has produced a Critical finding | Final pass only (a prior cycle must exist) |
| `scope-mismatch` | **New — closes the gap the provisional pass cannot see.** The quick-grant predicate's "additive-only file changes" row (B) declares two things, and this leg re-checks both against the real diff (base SHA against the working tree, computed with the `--name-status --no-renames` + untracked union above) on the **final** pass: (1) no path outside the declared-additive set has any record — `A`, `M`, `D`, or `T` — in the union, and (2) every path inside that declared set that *does* appear has status `A`. A declared path that in fact already existed and was merely modified in place (`M`) holds this leg exactly like an undeclared extra path does; so does an undeclared path reported as `D` or `T` — a silent deletion or type-change of an out-of-scope file is the exact regression predicate (B)'s additive-only rationale exists to rule out, and `--no-renames` guarantees it is reported as its own `D` record rather than absorbed into a collapsed rename entry. Membership alone is not sufficient, and neither is restricting to additions/modifications only. |
| `batched-task` | **New.** The task is dispatched inside a batch (`batched-task-dispatch.spec.md`). Forces `full` unconditionally — see (G) for why quick-collapse and batching do not compose. | Both passes — batch membership is a static, plan-level fact known before RED begins, unlike `critical-finding` and `scope-mismatch`, which genuinely depend on what happens during implementation |

The `critical-finding` and `scope-mismatch` legs both exist because a
provisional, pre-implementation grant of `quick` can be invalidated by what
actually happened during implementation, and neither is knowable at dispatch
time — this is *why* depth resolution runs twice per task (A). Once either
leg holds, it holds for the remainder of the task: a task that has
demonstrated it can produce a Critical finding, or that its declared scope
didn't hold, does not get a thinner reviewer for its fix.

Whenever any leg holds, a `REVIEW_DEPTH_FLOOR_APPLIED` advisory names the legs,
emitted **whether or not the floor changed the resolved value** — exactly as
`DEPTH_FLOOR_APPLIED` already does — so a run that was never eligible for `quick`
is distinguishable from one floored back to `full`. A graduated run must be
auditable, never invisible.

### F. Cycle cap becomes configurable

The hardcoded "Maximum 3 review cycles per task" in Steps 2f and 2g is replaced
by `implement.max_review_cycles` (default `3`, so shipped behavior is unchanged).
`lib/loop-convergence.mjs` already consumes the remaining-cycle count and is
unchanged; only the source of the number moves, from a literal in SKILL.md prose
to the manifest. `skills/implement/SKILL.md` names this exact follow-up today.

Under `quick` the cap applies to the single synthesized loop rather than to two
separate loops, so worst-case reviewer dispatches per task fall from `2 × cap` to
`1 × cap`.

### G. Provenance and batching interaction

A task reviewed by the synthesized reviewer records that fact on its **single
task commit** — commit granularity is one commit per task, authored after review
passes, so there is no separate per-fix commit — via
a `Review-round: synthesized=<cycles>` trailer and a `review_round` event whose
`stage` is `synthesized`, per `review-provenance.spec.md`, which enumerates
that value ahead of this spec precisely so collapsed rounds are never conflated
with full ones in later analysis.

**Quick-collapse and batching do not compose, and a batched task always
resolves `full`.** `batched-task-dispatch.spec.md` (`status: validated`) has
an already-shipped, tested invariant preserved inside every batch: *"Both
review stages — Stage 1 then Stage 2, per task, at today's depth"* — two
sequential dispatches, unconditionally. That invariant was written and
validated before this spec's single-synthesized-reviewer shape existed, and
this spec does not get to silently reinterpret it. Rather than amend an
already-validated sibling spec's tested contract to accommodate a shape it
was never reviewed against, this spec adds the `batched-task` floor leg (E):
any task dispatched inside a batch forces `full`, full stop, regardless of
what the quick-grant predicate (B) or an explicit `--tier quick` would
otherwise resolve. `batched-task-dispatch.spec.md`'s own invariant is
therefore untouched by this spec, and every task inside a batch keeps
receiving exactly the two-stage review it was validated against.

Depth resolution remains **per task** in the sense that matters for solo
dispatch: outside a batch, each task resolves its own depth independently.

### H. `/adev:build` gains a `--tier` propagation clause for Step 4

`skills/build/SKILL.md` Step 4 (Implement) is amended to propagate an
operator-supplied `--tier` to its `/adev:implement` dispatch, mirroring the
clause Steps 1 and 5 (review-specs, validate) already carry:

> If `--tier <t>` was passed to `/adev:build`, append `--tier <t>` to the
> dispatched args so `/adev:implement` receives the explicit override. If
> `--tier` was not passed to `/adev:build`, dispatch without it —
> `/adev:implement` resolves its own rigor tier per this spec's precedence
> (Output Contract A).

This is a small, mechanical addition to an existing file already in
`source-manifest`, not a new mechanism — Steps 1 and 5's clauses are the
literal template. Without it, `/adev:build --tier full` — an operator's
explicit request for elevated scrutiny across the whole pipeline — silently
fails to reach implement at all, leaving every task to whatever the risk
policy resolves on its own.

### I. `skills/implement/SKILL.md` gains base-SHA capture — new work, not a pre-existing fact

An earlier revision of this spec claimed `/adev:implement` "already computes
and holds" a per-task base SHA, on the theory that Stage 2's reviewer already
receives a base/head diff range. **That claim was checked and is false.**
`lib/cli/implement.mjs` contains no reference to `sha`, `diff`, or `git`, and
`skills/implement/SKILL.md`'s only related text (Step 2g's dispatch-context
bullet, *"The git diff (base SHA before task, head SHA after task)"*) is an
instruction telling the dispatching agent what to hand a reviewer subagent —
not a captured, programmatically retrievable value. No step derives or
persists a task's boundary SHA anywhere today.

This spec corrects the claim and, mirroring (H)'s framing, commits to adding
the missing capture as new work: `skills/implement/SKILL.md` gains an
instruction, at task dispatch (immediately before RED begins), to capture
`git rev-parse HEAD` as the task's base SHA, and to pass it as `--base-sha`
to the final-pass `adev implement resolve-depth` call right before Stage 1/2
dispatch. No new persistence mechanism is introduced — the value is computed
fresh at the moment of use and threaded through the same dispatch, exactly as
Stage 2's diff range already is informally today. It is not stamped into any
lifecycle event or execution-state file, and nothing downstream may assume it
survives past that single dispatch.

### J. A new canonical event: `review_depth_resolved`

An earlier revision claimed resolution advisories persist via `plan_task`'s
"existing free-form advisory channel." No such channel exists —
`plan-task-events.spec.md` (`status: validated`) closes that payload to
`{plan, task_id, status, notes}`. This spec follows the same rule that spec
states for exactly this situation (*"becomes a new event variant in a
follow-up spec"*), the same rule `review-provenance.spec.md` already followed
for `review_round`, and mirrors the structurally near-identical precedent
`test_depth_assigned` already set for an analogous purpose (a resolved,
per-task policy decision with floor legs) in `lib/test-strategies/depth.mjs`.

One event per resolution pass (`resolveImplementReviewDepth()` runs twice per
task — provisional, final):

```json
{ "event": "review_depth_resolved", "plan": "<plan-path>", "task_id": "<id>",
  "pass": "final", "depth": "quick", "source": "predicate-grant",
  "floor_applied": false, "floor_legs": [] }
```

| Field | Meaning |
|---|---|
| `pass` | `provisional` or `final` — which of the two resolution passes (A) produced this event |
| `depth` | `full` or `quick` — the resolved value |
| `source` | Free-form string naming which precedence stage resolved it (`tier-full-absolute`, `policy-baseline`, `predicate-grant`, or `floor`) |
| `floor_applied` | Whether any floor leg (E) held |
| `floor_legs` | Names of the legs that held; empty when `floor_applied` is `false` |

**This lands the amendment in the owning spec directly, not merely as a
promise here** — the lesson an earlier revision of this spec learned the hard
way for `graduated-rigor-tiers.spec.md` (B.5). `lifecycle-event-log.spec.md`'s
Behaviors and Acceptance Criteria sections both now carry
`review_depth_resolved`'s registration (its own `revision`/`updated`
frontmatter bumped `5 → 6`, `2026-08-18 → 2026-08-19`), following the
four-step process: (1) this cross-spec amendment, (2) `CANONICAL_EVENTS` in
`lib/lifecycle-events.mjs` gains `'review_depth_resolved'`, (3)
`REQUIRED_FIELDS_BY_EVENT` in `lib/diagnostics/event-schemas.mjs` gains the
key allow-list above, (4) producer-test fixtures. The projection fold
surfaces these events under a new field `reviewDepthResolutions`, keyed
`` `${plan}::${task_id}::${pass}` `` with last-wins, mirroring
`testDepthAssignments` and `reviewRounds` exactly — not folded into
`unknownEvents[]`. `lifecycle-event-log.spec.md` and
`test-depth-policy.spec.md` are in `source-manifest` on this basis.

`REVIEW_DEPTH_FLOOR_APPLIED` and `ROUTING_SCORE_OUT_OF_RANGE` are echoed to
the operator-facing implement transcript as before, **and** persisted as the
structured `floor_applied`/`floor_legs` fields on this event — satisfying
"auditable, never invisible" with a queryable record instead of transcript
text alone, consistent with why `review-provenance.spec.md` exists at all.

### K. `scope-mismatch` excludes exactly one file, exactly one status — the proven collision, nothing wider

Without an exclusion, the `scope-mismatch` leg (E) fires on **every** task,
making the quick-grant path structurally unreachable in practice.
`.context-index/lifecycle-state/<slug>.jsonl` is git-tracked, and
`adev test-policy resolve` (invoked during RED, per
`skills/implement/SKILL.md`) appends a `test_depth_assigned` event to **the
current spec's own log** — inside the exact base-SHA-to-final-pass window the
leg diffs. That one path is never in any task's declared additive-only set,
because it is framework bookkeeping, not a task deliverable.

**An earlier revision of this exclusion was itself too broad** — a
directory-wide glob (`.context-index/lifecycle-state/**`) that dropped every
spec's lifecycle log, of any change-type, from consideration. That is a
strictly wider carve-out than the collision it was written to fix, and it is
exactly the failure mode this section's own rule (below) forbids: no other
governance surface (`sensitive-paths.yaml`, `boundaries.yaml`, or
`lib/test-strategies/sensitive-paths.mjs`'s defaults — none of which list this
path) backstops `scope-mismatch`, so a directory-wide exclusion would have
made it the *only* leg capable of ever flagging tampering with another spec's
audit log, and then disabled itself against exactly that case. The exclusion
is narrowed to precisely what was proven:

- **Path:** `.context-index/lifecycle-state/<slug>.jsonl`, where `<slug>` is
  derived from the **current task's own spec** via the existing
  `slugFromSpec()` (`lib/lifecycle-state.mjs`) — not a glob, and not any
  other spec's log.
- **Status:** `M` only. A status of `A` (the log file did not exist before
  this task) or `D` (the log file was deleted) is **not** excluded — neither
  is the append-only side effect the collision describes, and either is
  independently suspicious enough that `scope-mismatch` should still see it.

Only a record matching **both** conditions is dropped from the union, and
only *before* either condition of the `scope-mismatch` leg is evaluated. A
touch to any other spec's lifecycle log, or any non-`M` touch to this spec's
own log, remains fully visible to the leg. Widening this exclusion further —
to any other path, or to any other status — is a follow-up gated on finding
an equally concrete, proven collision, not a preemptive guess. That rule
applied to itself this round: the directory-wide version above did not
survive contact with it.

## Failure Modes

| Condition | Skill Behavior | User Recovery |
|---|---|---|
| `risk-policies.yaml` absent or unreadable | `loadRigorPolicies()` returns null; every task resolves `full`. | None needed — this is the safe default. |
| `implement_mode` holds a value outside `full \| quick` | Resolves `full`; advisory names the offending value. Consistent with `resolveRigorMode()`'s existing treatment of malformed policy values. | Fix `risk-policies.yaml`. |
| `--tier` holds an invalid value | Existing `InvalidTierError` / `INVALID_TIER`; the run stops. | Pass `full` or `quick`. |
| Routing sidecar missing | Unchanged: `ROUTING_SIDECAR_MISSING`, the skill stops, no fallback. | Run `/adev:route --plan <path>`, re-invoke. |
| A dimension score is out of range, non-finite, or non-numeric | Task resolves `full`; `ROUTING_SCORE_OUT_OF_RANGE` names task, dimension, value. Never coerced. | Re-run `/adev:route` to rewrite the sidecar. |
| Spec frontmatter has no `risk_level` | Treated as `medium` by the existing `RISK_LEVELS` fallback in `resolveRigorMode()`, whose default `implement_mode` is `full`. | Optionally declare `risk_level`. |
| Target-path set is empty (sensitive-path leg not evaluable) | That leg is skipped, matching `resolveFloor()`'s existing degraded mode; the other legs still evaluate. | None. Degraded-mode parity with test depth is intentional. |
| A Critical finding appears mid-task on a `quick` task | The `critical-finding` floor leg holds from that point; subsequent cycles run at `full`. Advisory names the leg. | None — this is the designed escalation. |
| `implement.max_review_cycles` non-integer, non-finite, or less than `1` | `INVALID_MAX_REVIEW_CYCLES` from `loadManifest()`; the run stops. `0` is explicitly rejected, not just negative values — a cap of `0` would dispatch no reviewer, violating "`quick` never means skip". | Fix the manifest. |
| `--review-cycles` supplied as `0`, non-integer, or non-finite | `INVALID_REVIEW_CYCLES`; the run stops before dispatch. Same reasoning as the manifest row above. | Pass an integer `>= 1`, or omit the flag. |
| `--tier full` and `--tier quick` both somehow reach resolution (e.g. a caller bug passing both) | The CLI parser rejects this at the argument-parsing layer, before `resolveImplementReviewDepth()` is ever called — `--tier` takes one value, not a list. | Pass one tier value. |
| A `quick` task's synthesized review does not converge | Identical to today's Stage 2 handling: `LOOP_NO_PROGRESS` / `LOOP_REGRESSED` / `LOOP_BUDGET_EXHAUSTED`, task not complete, `plan_task` `blocked` emitted, execution state `blocked`. | Fix findings and re-run, or `/adev:recover`. |
| A task's diff shows status `M` on **the current spec's own** `.context-index/lifecycle-state/<slug>.jsonl` (from `adev test-policy resolve` during RED) and nothing else outside the declared set | Excluded from the touched-file union (K) before either `scope-mismatch` condition evaluates; the leg does not hold on this basis alone. | None — this is the designed exclusion, not a gap. |
| A task's diff touches **any other spec's** lifecycle log, or shows status `A`/`D` on the current spec's own lifecycle log | **Not** excluded — (K)'s exclusion requires both the exact current-spec path and status `M`. The `scope-mismatch` leg holds exactly as it would for any other undeclared or out-of-scope touch. | None — this is the designed boundary of the exclusion, not a gap. A directory-wide or status-unconditional version of this exclusion was rejected during this spec's own review for being wider than the proven collision. |
| `reportReviewDepthResolved()` is called with a key outside its allow-list, an invalid `pass`, or an invalid `depth` | `EVENT_SCHEMA_INVALID`; the event is not written. | Fix the caller. |
| The final-pass diff touches a file outside the task's declared additive-only set, **or** modifies a file that was declared additive (change-type is not `A`) | The `scope-mismatch` floor leg holds either way; depth is re-resolved to `full` before Stage 1/2 dispatch, even if the provisional pass had granted `quick`. Advisory names the leg, the offending file, and which of the two conditions triggered it. | None — this is the designed escalation. The task still completes; it just gets the deeper review its actual diff earned. |
| `adev implement resolve-depth` is invoked with a routing sidecar entry for a task-id that doesn't exist in the plan | `ROUTING_ENTRY_MISSING`, matching the existing error code from Step 2a's routing read. | Re-run `/adev:route` so the sidecar and plan agree. |
| `adev implement resolve-depth` is invoked for the final pass without `--base-sha` | `MISSING_DIFF_RANGE`; the run stops rather than silently skipping the `scope-mismatch` leg. | Pass the base SHA captured per (I) at task dispatch. |
| Either half of the diff computation fails (unreadable base SHA, detached history, or the `git ls-files` call errors) | The verb surfaces the underlying git error rather than treating a partial or empty result as "no scope mismatch". | Fix the base SHA; do not treat a git failure as a clean diff. |
| An implementer creates a brand-new, never-staged file outside the declared additive-only set | The `git ls-files --others --exclude-standard -z` half of the union surfaces it as an untracked `A`; the `scope-mismatch` leg holds exactly as it would for a tracked-file violation. | None — this is the case the union exists to catch. |
| An implementer deletes or type-changes (e.g. symlink-swaps) a tracked file outside the declared additive-only set | `--name-status` reports `D`/`T` for the path; the `scope-mismatch` leg holds. | None — this is the case the per-status mechanism exists to catch; `boundaries.mjs`'s own choice to drop deleted paths does not transfer to this purpose. |
| An implementer stages (`git add`) a rename that pairs an out-of-scope deletion with an in-scope addition | `--no-renames` forces the pair to report as two independent `D`/`A` records rather than one collapsed `R100` entry; the out-of-scope `D` path is visible to the leg on its own. | None — this is the case `--no-renames` exists to catch. |
| A task is dispatched inside a batch | The `batched-task` floor leg (E) forces `full` unconditionally; the quick-grant predicate (B) is never evaluated for it. | None — this is the designed exclusion, preserving `batched-task-dispatch.spec.md`'s validated per-task two-stage invariant untouched. |

## System Constitution Reference

- **Requires Human Approval (constitution, Architecture Boundaries)** — Applies, and is why this spec ships last and behind two others. Thinning the review layer of `/adev:implement` is not covered by the "Autonomous (Agent May Decide)" list. The mechanism, and the specific `>= 0.6` per-dimension threshold, are both authorized as designed and confirmed here — collapse rather than cut, floors preserved and unconditional, the threshold set from this repository's own historical corpus rather than a guess (see the frontmatter comments). This explicit approval covers exactly `>= 0.6`; any *further* widening past it, or removal of a floor leg, is a separate decision still requiring yield data from `review-provenance.spec.md`, not a precedent this approval extends.
- **Principle 1 (Minimize external dependencies)** — Applies. Everything reuses `lib/governance/rigor-mode.mjs`, the ported structure of `lib/test-strategies/depth.mjs` and `lib/cli/boundaries.mjs` (diff computation), `lib/loop-convergence.mjs`, and Node built-ins. No new dependency.
- **Principle 2 (Skills are primarily markdown) and the cli-driver-surface rules** — Applies. Depth resolution lives in `lib/implement/review-depth.mjs` behind a named surface, not in SKILL.md prose; the synthesized reviewer's prompt is a companion file (`skills/implement/synthesized-reviewer-prompt.md`), following the precedent of `review-specs`' `quick-synthesized-reviewer-prompt.md`.
- **Autonomous — "Updating specs/ADRs when code changes affect their assumptions"** — Applies. This spec revises a standing research recommendation (below) rather than leaving it silently contradicted.

**Reconciliation note.** Prior research in this repo
(`review-validation-restructuring.md`, research finding F-I14) explicitly
concluded *"Keep existing 2-stage subagent review in /adev:implement."* This spec
narrows that conclusion rather than reversing it: that artifact predates the
`graduated-rigor-tiers` collapse pattern, and this spec changes the **dispatch
count**, not the **check set** — both lenses survive in the synthesized prompt and
the `full` path is untouched. Recorded explicitly so the divergence is reviewable
instead of appearing as unacknowledged drift.

**Dependency note.** `graduated-rigor-tiers.spec.md`, which introduced
`resolveRigorMode()` and the `full | quick` vocabulary this spec extends, is
itself still `status: review-pending`. If its review changes the tier semantics,
Output Contract A and C must be revised to match before implementation.

## Acceptance Criteria

- [ ] Under `full`, dispatch is byte-identical to today: two sequential reviewers, same inputs, same checks.
- [ ] Under `quick`, exactly one reviewer is dispatched, and its prompt contains both Stage 1's questions and every item of `code-quality-checklist.md`.
- [ ] The synthesized reviewer applies `cq-<n>` id tagging and `evaluateStopCondition` convergence to findings from **both** lenses; a test asserts a spec-compliance finding is id-tracked across cycles (the Stage 1 gap this collapse closes).
- [ ] A task failing any single row of the quick-grant predicate resolves `full`; a test covers each row independently.
- [ ] `routingEasy === true` does **not** yield `quick` when `skill === "implement"`, and a regression test asserts `review-specs` and `validate` still honour it.
- [ ] `resolveRigorMode({skill: "implement"})` resolves against `implement_mode`, never `review_mode`; a test asserts the explicit key map across all three branches.
- [ ] Out-of-range, non-finite, and non-numeric scores each resolve `full` with `ROUTING_SCORE_OUT_OF_RANGE`, and a test asserts no coercion or rescaling occurs.
- [ ] Each floor leg independently forces `full`, including over an explicit `--tier quick`; a test covers all five legs (including `scope-mismatch`).
- [ ] `REVIEW_DEPTH_FLOOR_APPLIED` is emitted whenever a leg holds, including when the resolved value was already `full`.
- [ ] The `critical-finding` and `scope-mismatch` legs both persist for the remainder of a task once triggered.
- [ ] An explicit `--tier full` resolves `full` unconditionally, even when the task's routing scores fully satisfy predicate (B) and no floor leg holds; a test asserts this is a terminal, first-stage resolution (nothing below it runs).
- [ ] An explicit `--tier quick` does **not** force `quick` on a task that fails predicate (B); a test asserts a task with e.g. `novelty: 0.4` resolves `full` even under a run-wide `--tier quick`.
- [ ] A task whose provisional-pass depth was `quick` but whose actual diff touches a file outside its declared additive-only set resolves `full` on the final pass; a test constructs exactly this divergence.
- [ ] A task whose actual diff modifies (not adds) a file that predicate B declared additive resolves `full` on the final pass, even though every touched file is a **member** of the declared set; a test constructs this case specifically (change-type `M` on a declared-additive path) to prove membership alone is insufficient.
- [ ] `adev implement resolve-depth`'s final pass computes its touched-file set itself as the union of `git diff --no-renames --name-status -z <base-sha>` (tracked changes, status-tagged `A`/`M`/`D`/`T`) and `git ls-files --others --exclude-standard -z` (untracked files, treated as status `A`) against the working tree (single ref, no head SHA); a test asserts there is no code path that accepts a caller-supplied file list as the primary source for the `scope-mismatch` leg.
- [ ] A test constructs a task that deletes, or symlink-swaps, a tracked file outside the declared additive-only set during a nominally-additive task, and asserts the `scope-mismatch` leg still fires — proving deletions and type-changes are visible to the leg, not just additions/modifications.
- [ ] A test constructs a task that deletes an out-of-scope tracked file and adds a new in-scope file with similar-enough content that `git diff` would pair them as a rename once staged, stages both (`git add`), and asserts the `scope-mismatch` leg still fires on the out-of-scope deletion — proving `--no-renames` prevents the collapse rather than merely widening the filter.
- [ ] A test constructs a task where the implementer creates a wholly new, never-staged file outside the declared additive-only set, and asserts the `scope-mismatch` leg still fires — proving the untracked-file half of the union is load-bearing, not decorative.
- [ ] `lib/implement/review-depth.mjs` exports `resolveImplementReviewDepth()` with the documented input/return shape, and `adev implement resolve-depth` prints its JSON result; a test asserts the CLI verb's output matches a direct call to the exported function for the same inputs.
- [ ] `skills/build/SKILL.md` Step 4 carries a `--tier` propagation clause mirroring Steps 1 and 5; a test or doc-contract check asserts the clause text names `/adev:implement` and the conditional-append behavior.
- [ ] `skills/implement/SKILL.md` captures `git rev-parse HEAD` as the task's base SHA immediately before RED begins, and passes it as `--base-sha` to the final-pass `resolve-depth` call; a test or doc-contract check asserts both the capture point and the pass-through.
- [ ] Every task dispatched inside a batch (`batched-task-dispatch.spec.md`) resolves `full` via the `batched-task` floor leg, regardless of predicate (B) or an explicit `--tier quick`; a test asserts a batch containing a task that would otherwise satisfy predicate (B) still resolves `full` for that task, and that `batched-task-dispatch.spec.md`'s own equivalence eval and acceptance criteria remain unmodified by this spec.
- [ ] `graduated-rigor-tiers.spec.md`'s `affects:` list and "Resolution helper (lib)" section are amended in lockstep with this spec (not after it) to document the `skill === "implement"` carve-out; `review-specs`/`validate`/`route`/`work`/`init`/`build`'s existing `tierOverride` behavior is unchanged, verified by a regression test.
- [ ] `review_depth_resolved` is registered in `CANONICAL_EVENTS` and `REQUIRED_FIELDS_BY_EVENT`, and `lifecycle-event-log.spec.md`'s Behaviors and Acceptance Criteria sections carry its registration on disk (not merely described in this spec); a test asserts a write does not land in `unknownEvents[]`.
- [ ] The projection surfaces `review_depth_resolved` under `reviewDepthResolutions`, keyed `plan::task_id::pass` with last-wins; a test asserts a `final`-pass event does not overwrite a `provisional`-pass event for the same task (distinct keys).
- [ ] `REVIEW_DEPTH_FLOOR_APPLIED` and `ROUTING_SCORE_OUT_OF_RANGE` are both echoed to the operator-facing transcript **and** persisted as `floor_applied`/`floor_legs` on `review_depth_resolved`; a test asserts the persisted record, not just the transcript text.
- [ ] A task whose only undeclared touch is a status-`M` record on **the current spec's own** `.context-index/lifecycle-state/<slug>.jsonl` (simulating a `test_depth_assigned` write during RED) does not trigger `scope-mismatch`; a test reproduces this exact collision against a real lifecycle-state file, matching the collision found live in this repository's own working tree during this spec's review.
- [ ] The exclusion does **not** apply to any other spec's lifecycle log, and does **not** apply to a status-`A` or status-`D` record on the current spec's own log; a test constructs each of these three cases and asserts `scope-mismatch` still fires for all three — proving the exclusion is exactly as narrow as (K) states, not a directory-wide or status-unconditional carve-out (the shape an earlier revision shipped and this spec's own review rejected as broader than the proven collision).
- [ ] The `scope-mismatch` exclusion is a single named check (exact path via `slugFromSpec()` + status `M`), not inline prose duplicated across call sites; a test asserts there is exactly one code path computing the excluded path, so a reviewer can audit widening attempts against a single diff line.
- [ ] `implement.max_review_cycles` defaults to `3`, rejects `0` with `INVALID_MAX_REVIEW_CYCLES`, validates per the Arguments table otherwise, and governs both the `full` stages and the `quick` synthesized loop.
- [ ] `--review-cycles` rejects `0` with `INVALID_REVIEW_CYCLES` and otherwise overrides the manifest value per the stated precedence.
- [ ] A task reviewed by the synthesized reviewer records the `synthesized` stage in both provenance channels defined by `review-provenance.spec.md` — the `Review-round:` trailer and the `review_round` event — and `findings` is populated for it, since the synthesized reviewer applies id tagging across both lenses.
- [ ] Outside a batch, depth resolves independently per task; a test asserts two solo-dispatched tasks in the same run can resolve differently (one `full`, one `quick`).
- [ ] No threshold in the shipped implementation is wider than this spec states; widening requires a new revision citing provenance data.
- [ ] All quality gates pass; no constitutional violations introduced.
