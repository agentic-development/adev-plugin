---
partial_schema: spec@1
charter: eval-harness
kind: artifact
status: review-pending
risk_level: high
milestone: v1
revision: 1
charter-revision: 4
created: 2026-08-21
updated: 2026-08-21
---

# Artifact Spec: Rubric Set — Core Lifecycle Tier

<!-- Artifact Spec within the eval-harness charter.
     Parent Charter: .context-index/specs/features/eval-harness/charter.md
     Delivers the charter capability "Rubric set, core lifecycle tier".
     Depends on:
       - hermetic-fixture-and-ground-truth-catalog.spec.md (the catalog these cite)
       - rubric-set-change-imminent.spec.md (the SHARED per-skill rubric contract,
         referenced here and deliberately not restated) -->

## Relationship to the Change-Imminent Tier

The per-skill rubric contract — `rubric_id` naming, the point budgets, the
policies, the flat-YAML discipline, the three `source` forms, `tiers.yaml`, and
the eight conformance rules — is declared once, in
`rubric-set-change-imminent.spec.md`, and governs this tier unchanged. This
spec does not restate it. If the contract changes, it changes there and both
tiers move together; a copy here would drift the first time one tier was
revised and the other was not.

This spec declares only what is **different** about the twelve core-lifecycle
skills, and there are three differences that matter.

### Difference 1 — these rubrics may assert the specified contract, not only current behaviour

The change-imminent tier scores its skills as they behave **today**, because
those skills are queued for demotion, merge, or deletion and a baseline taken
after the change would measure the change against itself. None of these twelve
is queued for anything. Each has a SKILL.md and, in most cases, a governing
spec under `.context-index/specs/features/`.

So a judged criterion here anchors its `reference` on **the skill's own
specified contract** — its SKILL.md, and its governing spec where one exists —
rather than on an observation of current output. Where the two disagree, the
rubric follows the spec and the disagreement is the finding. That is a stronger
assertion than the other tier can make, and it is available only because these
skills are not about to move.

### Difference 2 — a higher deterministic floor

The shared contract sets a floor of 5 deterministic elements and 3–6 judged
criteria. This tier tightens the floor to **7 deterministic elements**, keeping
the 3–6 judged range unchanged.

The reason is Tier placement, not thoroughness for its own sake. Deterministic
elements run in Tier B, on every skill change; judged criteria run in Tier C,
nightly and pre-release. These twelve skills carry the highest blast radius in
the repository — a regression in `implement` or `validate` corrupts work that
`hygiene` then reports as healthy — and a regression in one of them should be
caught by the PR that causes it, not by the next nightly. Raising the
deterministic floor is what buys that; raising the judged count would only make
the nightly more expensive.

### Difference 3 — this tier owns the legacy-rubric migration

`tests/evals/skill-compression/rubrics/{brainstorm,plan,specify}.yaml` score
`quality_dimensions` on a 1–5 scale with `weight` fields, and their
`required_elements` carry `match_pattern` rather than `source` + `met_when`.
`lib/evals/rubric.mjs` already rejects all three with `RUBRIC_LEGACY_SCALE`.
All three name skills in **this** tier, so the charter's "migration of the
three existing skill-compression rubrics from 1-5 scales to binary verdicts"
lands here.

Migration is a rewrite, not a translation. A 1–5 `weight` does not map onto a
binary verdict, and pretending it does — "4 and up is `met`" — would invent a
threshold no author chose. Each of the three legacy rubrics is re-authored
against the shared contract, and the legacy file is deleted in the same change
rather than left beside its replacement for a reader to pick between.

The existing scenarios (`tests/evals/skill-compression/scenarios/*.md`) drive a
skill against a *described* project stated in prose inside the scenario file.
The new scenarios drive it against the hermetic fixture on disk. That is the
substantive gain: a described project cannot be asserted against, so the legacy
rubrics could only regex-match the skill's own narration of what it did.

## The Twelve Rubrics

Same table shape as the change-imminent tier. Element and criterion text is
authored at implementation time; this table fixes what each rubric is about.

| Skill | Kind | Scored input | Catalog classes cited | Elements / criteria |
|---|---|---|---|---|
| `hygiene` | detector | the audit report and its checklists | `spec-code-drift`, `stale-spec-frontmatter`, `missing-issue-binding`, `orphan-source-file` | 9 / 5 |
| `validate` | detector | the PASS/FAIL report | `esm-violation`, `spec-code-drift` | 8 / 5 |
| `review-specs` | detector | the review + blockers sidecars | `charter-scope-escape` | 8 / 5 |
| `debug` | detector | the diagnosis and the fix diff | `spec-code-drift` | 8 / 4 |
| `route` | detector | the four-dimension routing table | `plan-task-without-test` | 7 / 3 |
| `specify` | producer | the written `.spec.md` | `charter-scope-escape` | 8 / 5 |
| `plan` | producer | the written `.plan.md` | `plan-task-without-test` | 8 / 4 |
| `write-test` | producer | the failing tests and the handoff block | `plan-task-without-test` | 7 / 4 |
| `brainstorm` | producer | the written charter | `charter-scope-escape` | 7 / 4 |
| `implement` | producer | the task diffs and per-task review records | — | 8 / 5 |
| `build` | orchestrator | the pipeline transcript and the artifacts each stage left | — | 7 / 3 |
| `work` | orchestrator | the classification and the skill it routed to | — | 7 / 3 |

Totals: 92 deterministic elements, 50 judged criteria. Every row meets the
tier's 7-element floor and sits inside the shared 3–6 judged range.

### The two orchestrators score routing, not artifacts

`build` and `work` do not produce an artifact of their own — they decide which
skill runs next and hand off. Scoring them on the artifacts their children
wrote would double-count those children's rubrics and, worse, would mark an
orchestrator `not_met` for a downstream skill's regression. Their rubrics
therefore assert on the **decision**: given a fixture state, did the skill
classify it correctly, pick the right next step, and refuse the steps whose
gates were not satisfied?

That last clause is what makes them worth scoring at all. `work` reading a
fixture whose `shipping-rates` spec is `review-pending` must route to
`/adev:review-specs` and must **not** route to `/adev:plan`. The fixture's
lifecycle-state files are what make that assertion decidable, which is why the
catalog carries them as scaffolding rather than as ground truth.

### Citing a catalog id outside its declared `covers_skills`

Several rows above cite classes whose catalog entries were seeded with a
narrower `covers_skills` — `missing-issue-binding` was seeded for `reconcile`,
`issues`, and `status`, and `hygiene` cites it here. That is allowed, and it is
not free: **the citing change must extend the entry's `covers_skills` in the
same commit.** The field is the catalog's record of who depends on an entry,
and it is what tells a later author which rubrics they are about to break by
re-classing or deleting it. A citation that does not appear there is a
dependency nobody can see.

## Required Files

| Path | Layer | Created by |
|---|---|---|
| `tests/evals/skill-regression/rubrics/<skill>.yaml` × 12 | repo | this spec |
| `tests/evals/skill-regression/scenarios/<skill>.md` × 12 | repo | this spec |
| `tests/evals/skill-compression/rubrics/{brainstorm,plan,specify}.yaml` | repo | this spec — **deleted** |
| `tests/evals/skill-compression/scenarios/{brainstorm,plan,specify}-scenario.md` | repo | this spec — **deleted** |

No new manifest and no new test: `tiers.yaml` and
`tests/lib/evals/rubric-coverage.test.mjs` are authored by the change-imminent
spec and already declare this tier's membership. This tier fills the twelve
files that manifest is already asserting must exist, plus the two rules below.

## Consumers

Identical to the change-imminent tier: `tests/lib/evals/rubric-coverage.test.mjs`,
`adev eval score`, and `npm run test:evals`. No new CLI verb and no new library
module — this tier is rubric content for an engine that already shipped.

One consumer changes rather than gains a caller:
`tests/evals/skill-compression/run-eval.mjs` and
`tests/evals/skill-compression/matrix-integrity.test.mjs` load the three legacy
rubrics by path. Deleting those files without updating both drivers turns a
migration into a broken harness, so both are repointed at
`tests/evals/skill-regression/rubrics/` in the same change.

## Additional Conformance Rules

The eight rules from the shared contract apply unchanged. This tier adds two,
enforced by the same `tests/lib/evals/rubric-coverage.test.mjs`:

| Rule | Rejected when | Failure it prevents |
|---|---|---|
| `RUBRIC_CORE_ELEMENT_FLOOR` | a `core_lifecycle` rubric declares fewer than 7 `required_elements` | a high-blast-radius skill whose per-PR Tier B coverage is thinner than the tier promises |
| `RUBRIC_LEGACY_SURVIVES` | any file remains under `tests/evals/skill-compression/rubrics/` after migration | two rubrics for one skill, on two incompatible scales, with nothing saying which is current |

`RUBRIC_LEGACY_SURVIVES` reads a directory that this spec empties. It is worth
a rule rather than a one-time deletion because the failure it prevents is not
"someone forgot to delete" — it is "someone restored the old file when the new
one was inconvenient", which no amount of care at migration time prevents.

## System Constitution Reference

- **Principle 1, "Minimize external dependencies"** — Rubric content and
  scenario markdown only. No new module, no new verb, no new dependency.
- **Principle 2, "Skills are primarily markdown"** — The twelve skills being
  scored are markdown instructions, and what a rubric asserts about them is
  what they cause to happen on disk, not what their prose says. Every
  deterministic element therefore reads an artifact or an output span, never
  the SKILL.md itself.
- **Architecture boundary, "Requires Human Approval: adding new skills to the
  lifecycle order"** — This tier scores the lifecycle order as it stands and
  changes none of it. `work` and `build` rubrics assert the *existing* routing,
  so a rubric that would require reordering is a signal to stop and escalate,
  not to edit the order.
- **Charter invariant, "A numeric aggregate is never reported without its
  verdict table"** — These twelve rubrics are the ones most likely to be
  quoted as a single number in a status report. The aggregate exists for trend
  tracking; the verdict table is the result.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Detector rubrics + scenarios (5) | `hygiene`, `validate`, `review-specs`, `debug`, `route` — the five that cite catalog ids and need both twins | large |
| Producer rubrics + scenarios (5) | `specify`, `plan`, `write-test`, `brainstorm`, `implement` | large |
| Orchestrator rubrics + scenarios (2) | `build`, `work` — routing-decision assertions against fixture lifecycle state | medium |
| Legacy migration | Re-author `brainstorm`, `plan`, `specify` against the shared contract; delete the six legacy files; repoint `run-eval.mjs` and `matrix-integrity.test.mjs` | medium |
| Two additional conformance rules | Extend `tests/lib/evals/rubric-coverage.test.mjs` with `RUBRIC_CORE_ELEMENT_FLOOR` and `RUBRIC_LEGACY_SURVIVES`, each with a rejecting input | small |
| `covers_skills` extensions | Extend the catalog entries this tier cites beyond their seeded skill lists | small |

## Acceptance Criteria

**Artifact shape**

- [ ] All 12 `rubrics/<skill>.yaml` and all 12 `scenarios/<skill>.md` exist, one per slug in `tiers.yaml`'s `core_lifecycle`.
- [ ] Every rubric loads through `lib/evals/rubric.mjs::loadRubric` without error and satisfies the shared contract in `rubric-set-change-imminent.spec.md`.
- [ ] Every rubric declares at least 7 `required_elements` and between 3 and 6 `quality_dimensions`.
- [ ] This spec restates no part of the shared contract — verified by review, since a copy is what the reference exists to prevent.

**Reference anchoring**

- [ ] Every judged criterion's `reference` names the skill's SKILL.md, its governing spec, or a named repository contract — never "current output" and never an unanchored standard.
- [ ] Where a rubric's assertion and the skill's current behaviour disagree, the rubric follows the spec and the disagreement is filed as an issue named in a rubric comment.

**Orchestrators**

- [ ] The `work` and `build` rubrics assert on routing decisions and cite no artifact a downstream skill wrote.
- [ ] The `work` rubric asserts at least one *refusal*: a next step the fixture's lifecycle state makes ineligible, which the skill must not take.

**Catalog citations**

- [ ] Every cited `skill-regression:<id>` resolves in `catalog.yaml`, and every `PV` citation is accompanied by its `KC` twin.
- [ ] Every catalog entry cited by this tier lists the citing skill in its `covers_skills`.

**Migration**

- [ ] `tests/evals/skill-compression/rubrics/` contains no files, and neither does the matching scenario set for those three skills.
- [ ] `tests/evals/skill-compression/run-eval.mjs` and `matrix-integrity.test.mjs` load rubrics from `tests/evals/skill-regression/rubrics/` and both still run.
- [ ] No migrated rubric carries a `weight` field or a 1–5 scale; `loadRubric` raises `RUBRIC_LEGACY_SCALE` on none of them.
- [ ] The migration is proven by re-introduction, not only by a green run: restoring one legacy file makes `RUBRIC_LEGACY_SURVIVES` fail, and the test is confirmed red before the file is removed again.

**Coverage check**

- [ ] `RUBRIC_CORE_ELEMENT_FLOOR` and `RUBRIC_LEGACY_SURVIVES` are each proven by a deliberately broken input asserting the named code.
- [ ] With both tiers landed, `tiers.yaml`'s `change_imminent` and `core_lifecycle` buckets are fully backed by rubric files and the coverage test asserts 23 of them.

**Gates**

- [ ] `npm test` passes.
- [ ] `npm run test:evals` runs this tier's Tier B deterministic pass without an API key.
- [ ] No constitutional violations introduced.

## Open Questions

- **Cost of a full Tier C run is not yet known and is not bounded here.** With
  both tiers landed, one nightly judged pass is 86 judge dispatches (36 from
  the change-imminent tier, 50 from this one), one per criterion, plus the
  runs that produce their inputs. The charter's "Budget thresholds as failing
  verdicts" capability is what will price and bound that, and it is a separate
  v1 capability with no spec yet. Until it lands, the nightly's cost is
  observed rather than governed. This blocks neither tier from being authored,
  but it should be answered before Tier C is switched on in CI rather than
  after the first invoice.
