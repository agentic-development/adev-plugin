---
spec: .context-index/specs/features/eval-harness/rubric-set-core-lifecycle.spec.md
charter: .context-index/specs/features/eval-harness/charter.md
date: 2026-08-21
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 1
file-sha: 411760c8889b725342fc91c9521dda48abb3a4b637e839dcb7b352bd141b4e90
---

# Architecture Review: rubric-set-core-lifecycle

> **Date:** 2026-08-21
> **Spec:** `.context-index/specs/features/eval-harness/rubric-set-core-lifecycle.spec.md`
> **Charter:** `.context-index/specs/features/eval-harness/charter.md`
> **Verdict:** BLOCK
> **Rigor tier:** full (risk_level `high` → `review_mode: full`)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | plugin:review-specs/termination-reviewer-prompt.md |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Reviewer-domain-fit initiative; scope retargeted to the four default reviewers. |
| security-reviewer | Reviewer-domain-fit initiative; OWASP scope relocated to the web-service domain extension. |

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

**WR-1 — `blocker`** · `no-caller` · anchor `consumers`
"Repointing" the compression drivers is not a path change. `run-eval.mjs:111` compiles `new RegExp(el.match_pattern,'im')` and `:230` reads `rubric.scoring?.required_element_weight`; `matrix-integrity.test.mjs:294` greps `match_pattern` against `variants/<variant>/<skill>.md`. The unified schema has `source` + `met_when` and no `scoring:` block. After a repoint, `match_pattern` is `undefined`, `new RegExp(undefined)` compiles to `/(?:)/`, **every element matches every input**, and the harness reports 100% while asserting nothing.
**Fix:** name what actually consumes a unified-schema rubric (`adev eval score`), or state the drivers are retired rather than repointed. Add a test asserting the repointed driver still fails a variant that dropped an element.

**WR-2 — `blocker`** · `dangling-consumer` · anchor `consumers`
A third consumer exists that the spec does not name: `tests/lib/evals/rubric-legacy-scale.test.mjs:208` loads `tests/evals/skill-compression/rubrics/plan.yaml` by literal path. It lives in `tests/lib/`, the **default `npm test` bucket**, so deleting the file breaks the spec's own "`npm test` passes" gate on every PR. Verified: readers of that directory are `run-eval.mjs`, `matrix-integrity.test.mjs`, `rubric-legacy-scale.test.mjs`, plus `package.json:35`.
**Fix:** name it and state its disposition — retarget the legacy-shape assertion at `tests/fixtures/evals/rubrics/legacy-weight-scale.yaml`, which already exists as a purpose-built stand-in, before deleting the real files.

**WR-3 — `blocker`** · `no-caller` · anchor `required-files`
The 12 scenarios have no executor. `npm run test:evals` collects only `*.test.mjs` under `tests/evals/`, and neither tier spec creates one there. The Tier B acceptance criterion asserts a run that no listed artifact performs.

**WR-4 — `warning`** — `RUBRIC_TIER_UNCOVERED` fires only for `change_imminent`, so a missing core-lifecycle rubric trips no rule — contradicting both "no new test" and "the coverage test asserts 23 of them".

**WR-5 — `warning`** — The `covers_skills` same-commit rule this spec calls load-bearing is enforced by discipline, not by a predicate.

**WR-7 — `warning`** — The issue id recorded "in a rubric comment" has no reader; `parseYaml` discards comments.

**WR-6 — `suggestion`** — `RUBRIC_LEGACY_SURVIVES` reads a directory this spec empties, and git does not track empty directories; state the ENOENT disposition.

**WR-8 — no finding** — `reference` → `buildJudgeContext`, the 7-element floor → `RUBRIC_CORE_ELEMENT_FLOOR`, and the orchestrator refusal assertion → the fixture's lifecycle-state scaffolding are all fully wired.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** FAIL

**CON-1 — `blocker`** · `contract` · anchor `consumers`
Same finding as WR-1, reached from the contract side, plus one more: Required Files deletes `scenarios/{brainstorm,plan,specify}-scenario.md`, which are the inputs `matrix-integrity.test.mjs:67-71` names as producing `outputs/<variant>/<skill>/output.md`. No replacement is named for the 4×3 variant matrix, whose semantics (score a compressed *prompt*) are not the skill-regression semantics (score a *run* against the fixture). The AC "both still run" is unachievable by a path change, and the task map's "medium" understates it.

**CON-2 — `blocker`** · `contract` · anchor `additional-conformance-rules`
The "coverage test asserts 23" claim ships without a predicate that covers it, and contradicts "no new test". No declared rule fails when a `core_lifecycle` slug has no rubric file.

**CON-5 — `warning`** — `RUBRIC_LEGACY_SURVIVES` as worded forbids *any* file under `tests/evals/skill-compression/rubrics/` forever, which converts migration into removal and blocks a charter-declared consumer from ever holding a conforming rubric. Narrow it to reject *legacy-shaped* rubrics (a `weight` field, a 1–5 scale, or `match_pattern`) anywhere under `tests/evals/`.

**CON-3 — `warning`** — Four skills are classed "producer" here while citing catalog ids, which the shared contract couples to "detector"; the sibling's AC says no producer cites a catalog id.

**CON-4 — `warning`** — `brainstorm` cites `charter-scope-escape` here, but the fixture spec lists `brainstorm` among skills with no planted violation. (The fixture spec is internally inconsistent on this too.)

**CON-6 — `suggestion`** — "restates no part of the shared contract" and "governs this tier unchanged" are both inaccurate given Difference 2 quotes and overrides two contract values.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

**RI-1 — `blocker`** · `wrong-error-code` · anchor `difference-3-this-tier-owns-the-legacy-rubric-migration`
`RUBRIC_LEGACY_SCALE` is unreachable for these three files — `assertNoNestedMaps` throws first on the top-level `scoring:` map, and `RUBRIC_MISSING_KEY` would fire second even if it were flattened. Executing `loadRubric` over all three returns `RUBRIC_NESTED_MAP: … nests a map at "scoring.required_element_weight"`.
**Load-bearing consequence:** the criterion "`loadRubric` raises `RUBRIC_LEGACY_SCALE` on none of them" is trivially satisfied by a rubric rejected for a different reason, so it certifies nothing.
**Fix:** name the real code, and restate the criterion positively — "every migrated rubric loads without error and declares no numeric `weight`".

**RI-2 — `warning`** — Same field-level coupling as WR-1, stated as path coupling.

**RI-3 — `warning`** — The `work` refusal assertion is anchored on plural "lifecycle-state files" for the `shipping-rates` slice; the fixture spec declares only `create-order.jsonl`. The `review-pending` status is recoverable from spec frontmatter, so the assertion is not undecidable — but the referent as named is not created.

**RI-4 — `suggestion`** — The table's "Catalog classes cited" column names *classes*, while `CATALOG_UNRESOLVED_CITATION` resolves *ids*; no rubric can literally cite `skill-regression:spec-code-drift`.

**RI-5 — `suggestion`** — Required Files omits `tests/lib/evals/rubric-coverage.test.mjs` as a file this spec modifies, though the task map extends it.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** FAIL

**BD-1 — `blocker`** · `destructive-operation` · anchor `consumers`
Same third-consumer deletion hazard as WR-2, with the diagnosis of *why* it was missed: the wrong `RUBRIC_LEGACY_SCALE` premise. Notes additionally that `rubric-schema-and-loader.spec.md`'s known-constraint note confirms the fractional `1.5`/`2.5` weights would escape `RUBRIC_LEGACY_SCALE` anyway.

**BD-2 — `blocker`** · `destructive-operation` · anchor `the-twelve-rubrics`
This is the first tier to score **mutating** skills — `implement` (writes diffs and commits), `debug` (writes a fix diff), `validate` (auto-fixes), `specify`/`plan`/`brainstorm` (write artifacts), `build` (chains all of them) — against a git-tracked in-repo directory. A `debug` or `validate` run that does its job repairs the `spec-code-drift` PV or the `esm-violation`, destroying the ground truth every rubric in both tiers cites, and turns the catalog-integrity test red for a reason that looks nothing like its cause.
**Fix:** copy `project/` into a per-run temp tree, or declare the tracked fixture read-only and fail on a dirty fixture after a run. Add a byte-identical-after-run criterion, applying the same falsification discipline the spec already uses for `RUBRIC_LEGACY_SURVIVES`.

**BD-3 — `warning`** — Run-produced artifacts have no declared location. `.gitignore:45` ignores `tests/evals/skill-compression/outputs/` and `matrix-integrity.test.mjs:262` asserts that entry exists — the repo already treats this as a checked rule. There is no counterpart for `skill-regression`.

**BD-4 — `warning`** — Scoring `validate`/`build` executes the fixture's `gates.yaml`. The existing contract is sound (argv list, `INVALID_GATE` on a string), but no catalog rule validates executable content in a scaffolding file.

**BD-5 — `suggestion`** — *Answering the dispatched question:* the spec's architecture-boundary claim is **sound** — authoring rubrics is not "adding new skills to the lifecycle order", and pointing escalation toward the human gate is correct. One gap in the reverse direction: after an approved reordering, the `work` and `build` rubrics go red, and a red rubric is indistinguishable from a regression. State that an approved order change carries a same-change rubric update with a `version` bump.

**Items 1 and 3 pass clean** — path containment is inherited from `loadRubric`'s realpath containment and the fixture's `CATALOG_PATH_ESCAPE`; input trust is consistent, notably "Migration is a rewrite, not a translation… pretending [4-and-up is `met`] would invent a threshold no author chose", which is the repo's refuse-don't-sanitize posture.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS

No findings. The only repetition is bounded enumeration over a fixed set (12 rubrics, 92 elements, 50 criteria), whose cardinality is fixed at authoring time by `tiers.yaml` — the set is the cap. The nightly Tier C recurrence is owned by an already-shipped engine and a separate capability.

---

## Summary

**Total findings:** 23 (8 blockers, 10 warnings, 5 suggestions)

**Action required:** Revise the spec.

1. **The migration is a rewrite, not a repoint** (WR-1, CON-1, RI-2, BD-1) — four reviewers, one conclusion. `new RegExp(undefined)` matches everything, so a repointed driver goes green while asserting nothing.
2. **A third consumer is in the default test bucket** (WR-2, BD-1) — deleting the legacy rubrics breaks `npm test`, contradicting the spec's own gate.
3. **The wrong rejection code makes an acceptance criterion vacuous** (RI-1) — verified against the shipped test.
4. **This tier scores mutating skills against committed ground truth** (BD-2) — with no containment stated, a successful `debug` run destroys the fixture.
5. **No predicate covers this tier's rubric coverage** (CON-2, WR-4) — the fix belongs in the change-imminent spec, which owns the rule.
