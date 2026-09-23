---
spec: .context-index/specs/features/eval-harness/baseline-provenance-and-percent-regression.spec.md
charter: .context-index/specs/features/eval-harness/charter.md
date: 2026-08-21
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 1
file-sha: 6d2e441c262dff7105613b4ddc6cafd369f27bf73bb51736a844801a5b6a48d8
---

# Architecture Review: baseline-provenance-and-percent-regression

> **Date:** 2026-08-21
> **Spec:** `.context-index/specs/features/eval-harness/baseline-provenance-and-percent-regression.spec.md`
> **Charter:** `.context-index/specs/features/eval-harness/charter.md`
> **Verdict:** BLOCK
> **Rigor tier:** full (risk_level `medium` → `review_mode: full`)

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

**WR-3 — `blocker`** · `no-caller` · anchor `preconditions`
`compareScores(baseline, candidate)` has no constructible argument. `lib/evals/score.mjs:566-571` returns exactly `{verdicts, deterministic, judged, total}` — no `rubric_id`, no `version`, no `model_id`, no `pricing_table`, no `run_record`. `adev eval score --json` prints that object verbatim, so the file `--candidate <path>` names cannot carry the four fields BEH-3 and the two mismatch errors read.
**Fix:** name the producer of the composite side object and its shape — extend `scoreRubric`'s return, or specify a wrapper joining score + RunRecord + rubric identity — and say which this spec owns.

**WR-2 — `blocker`** · `no-caller` · anchor `interface`
`adev eval baseline record --rubric <id> [--promote]` supplies only `rubricId` and `promote`. `runRecord`, `score`, and `opts.recordedAt` are all required — `BASELINE_NO_TIMESTAMP` makes the last mandatory precisely so the library cannot substitute a clock read — and no flag, stdin contract, or discovery rule supplies any of them. This is a no-caller gap independent of when `collectRunRecord` lands. *(The reviewer confirms the library half is genuinely buildable against synthetic records, so the Open Question's handling is honest for `compareScores`.)*

**WR-4 — `blocker`** · `orphaned-event-field` · anchor `behaviors-12`
`TRACE_FIXTURE_STALE` cannot be emitted. `compareScores` is a two-argument signature with no parameter for a disclosure-fidelity result, and "pass-through … when present" implies the signal arrives from outside. Row 3 is unreachable, yet the AC requires all six rows covered by a test.
**Fix:** add the drift signal to the signature and name its supplier, or defer row 3 and BEH-12 to the disclosure-fidelity spec.

**WR-5 — `warning`** — The three subverbs' registration surfaces are unnamed. Verified: no `VERB_REGISTRY` entry is needed (`eval` is registered at `cli/index.mjs:1978`); the surfaces are the `switch (sub)` at `lib/cli/eval.mjs:55-62`, `help()` at `:320-340`, and `docs/cli-reference.md` (`:64`, `:930`). `tests/docs/reference-section.test.mjs` asserts only a section per *top-level* verb, so three undocumented subverbs pass `npm test`.

**WR-7 — `warning`** — No exit-code contract for `adev eval compare`, unlike `adev eval score` whose codes are documented. The capability's entire value is gating, and the gate mechanism is unspecified.

**WR-6 — `warning`** — Visual Expectations lists the default CLI output as "a verdict table and the two deltas"; `findings` is absent, defeating the "one round trip surfaces every problem" postcondition for the default surface.

**WR-8 — `warning`** — `recorded_at` is written on every baseline and read by no behavior; `compareScores` explicitly ignores it and the spec never says `baseline show` prints it.

**WR-9 — `warning`** — `UNSAFE_BASELINE_PATH`'s trigger is vague: both functions take a rubric *id*, so the only escape vector is a traversal-bearing `rubric_id`, never identified as untrusted input.

**WR-10 — `warning`** — The `compareToBaseline` collision is asserted against a symbol absent from the repo.

**WR-1 — no finding** — The `baseline-schema.mjs` / `baseline.mjs` pair mirrors the two shipped schema-module pairs; chain complete.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** FAIL

**BD-1 — `blocker`** · `path-containment` · anchor `interface`
The only path written is *derived*: `.context-index/evals/baselines/<rubric_id>.json`. `rubric_id` is read out of a rubric YAML with no charset or shape constraint anywhere in the loader, and rubrics may be caller-pointed or plugin-shipped — so it is externally-supplied input interpolated into a **write** path. The stated mitigation is written as if a caller passed a path; no caller does, so it does not cover the actual vector. `lib/extensions/exec-payload.mjs::payloadDir` faces the identical shape and refuses a bad name *before* `join`, then re-checks with `assertContained`. Compounding: neither function takes `projectRoot`, so the containment base is an implicit `process.cwd()` no test can pin.
**Fix:** validate `rubric_id` against a fixed pattern before any `join`, contain the result the way `loadRubric` does, and add `{ projectRoot }` to both signatures.

**BD-2 — `blocker`** · `input-trust` · anchor `error-cases`
A stored baseline is hand-editable, git-mergeable, `--promote`-overwritable state read straight into arithmetic. Validation is presence-only. BEH-8 divides by the baseline's attainable maximum — a maximum of `0`, negative, or a numeric string yields `NaN`/`Infinity`. **`NaN < 0` is false, so rows 4 and 5 both fall through to row 6: a corrupted baseline reports `no_regression`** — the exact "broken harness reporting clean results indefinitely" the spec invokes to justify throwing on rubric mismatch. `lib/evals/score.mjs` sets the opposite precedent with `SCORE_INVALID_VERDICT`.
**Fix:** refuse a `score` half that is neither a finite non-negative number nor a member of the closed status enum, and an attainable maximum that is not finite and `> 0`, before any division. Add a criterion that a corrupted baseline throws rather than yielding `no_regression`.

**BD-3 — `warning`** — Commit posture is unstated, and `.gitignore` does not cover `.context-index/evals/`, so baselines are git-visible by default while `run_record` passes through verbatim.

**BD-4 — `warning`** — `promote: true` is an unconditional overwrite with no stated atomicity; a non-atomic write leaves a truncated file on interruption, which BEH-2's "writes nothing" does not cover.

**BD-5 — `suggestion`** — The containment criterion covers only the lexical case; `loadRubric`'s second check exists for a link *inside* the root pointing out, and `tests/lib/evals/rubric-path-containment.test.mjs` covers both.

**Items 2 and 4 — no finding.** Nothing builds a command string or spawns a subprocess. BEH-2's `BASELINE_EXISTS`-unless-`promote` is a fail-closed, per-invocation, non-persisted gate mirroring `exec-consent.mjs`.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

**RI-1 — `blocker`** · `nonexistent-module-export` · anchor `interface`
`lib/evals/read-trace.mjs` does not exist at HEAD — `lib/evals/` holds four files, and repo-wide hits for `compareToBaseline` are this spec and a session log. The module exists only on the unmerged branch `chore/skills/progressive-disclosure` (commit `8368d8b6`). The spec states in the present indicative that it "already exports" the function, and the entire `compareScores` justification rests on a collision that does not exist in the tree this will be planned against — while the `collectRunRecord` dependency *is* disclosed.
**Fix:** restate as a pending dependency naming the branch, and add it to Open Questions. The naming decision stands on its own merits.

**RI-2 — `blocker`** · `stale-file-path` · anchor `interface`
`tests/evals/skill-disclosure/` does not exist at HEAD. Separately, the charter's Naming attribute declares this charter's fixtures live in `tests/evals/skill-regression/`.

**RI-3 — `warning`** — The spec attributes the `UNSAFE_RUBRIC_PATH`/`UNSAFE_SCORE_PATH` precedent to the charter's Security attribute, which actually names `UNSAFE_TEMPLATE_PATH`. The codes are real; the attribution is stale.

**RI-4 — `warning`** — "the disclosure-fidelity check" is the only unnamed dependency in an otherwise fully-named interface table.

**RI-5 — `warning`** — The charter declares `snapshotReadTrace()` / `readTraceSince(marker)` / `compareReadTrace(observed, expected)`; the branch implementation exports `snapshot` / `since` / `compareToBaseline`. All differ, so the collision is invisible to a reader working from the charter.

**RI-6 / RI-7 — `suggestion`** — Reference the prefixed export names (`HALF_STATUS_NOT_SCORED`); note the unrelated `scoreRubric` in `lib/parallel/eval/report.mjs`.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

**CON-4 — `warning`** — `lib/evals/score.mjs:486-487` documents the **judged** half as also able to be `NOT_SCORED`, which the decision table never mentions. For a rubric with no `quality_dimensions`, `judged_delta` is `null`, **`null != 0` is true in JS**, and row 5 returns `judge-attributable` — implying judged movement that could not have occurred. Row 2 guards only the deterministic half.
**Fix:** restate row 5 as `deterministic_delta == 0` **and** `judged_delta` is a number **and** `!= 0`. Add a criterion for a `NOT_SCORED` judged half; existing criteria cover only `INSUFFICIENT_EVIDENCE`.

**CON-2 — `warning`** — The `no_regression` claim is **verified correct** against charter revision 4. The *handling* conflicts: `skills/hygiene/SKILL.md:562-564` and `skills/status/SKILL.md:62` flag `CHARTER_STALE` when a spec's `charter-revision` is below the charter's, so the moment the task-map row lands the charter reaches 5 while this spec stamps 4 — a self-inflicted staleness flag the spec never plans to clear. Editing an approved charter is also a `/adev:brainstorm --module` governance action, not an implementation task `/adev:plan` decomposes with TDD expectations.
**Fix:** resolve in the charter first (revision 5 adding `no_regression` *and* the six absent interface entries), then re-stamp `charter-revision: 5` and delete the task-map row.

**CON-1 — `warning`** — Same nonexistent-module finding as RI-1, with the added note that the real hazard is `compareScores` vs the charter's declared `compareReadTrace`.

**CON-5 — `warning`** — "Tier C" is unqualified; the charter's Vocabulary attribute requires naming the vocabulary.

**CON-3 / CON-6 — `suggestion`** — `no_regression` makes three casing styles in one enum; prefer `no-regression` for consistency with `judge-attributable`, settled at the charter. The `.context-index/evals/baselines/` placement is sound and is what ADR-0016 clause 1 requires — worth citing.

**Context-pack note:** the dispatched pack carried only the constitution, platform context, and target spec — no charter, siblings, or ADRs (the `base` pack, per the registry). The reviewer read those from the repo directly.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS

No findings. The decision procedure is six statically enumerated rows, first match wins, with an unconditional `otherwise` at row 6 — total, bounded at ≤ 6, and deterministic (BEH-10 forbids clock reads and randomness). Judged-verdict sampling is explicitly deferred and forbidden in v1, so there is no sampling loop in scope.

---

## Summary

**Total findings:** 27 (7 blockers, 15 warnings, 5 suggestions)

**Action required:** Revise the spec.

1. **The interface does not close** (WR-2, WR-3, WR-4) — `compareScores` has no constructible argument, the record verb cannot pass its required arguments, and row 3 is unreachable. Three of the six decision rows and both mismatch errors read fields nothing produces.
2. **Two JS-truthiness holes in the decision table** (BD-2, CON-4) — `NaN < 0` is false, so a corrupted baseline reports `no_regression`; `null != 0` is true, so an unscored judged half reports `judge-attributable`. Both defeat guards the spec argues for elsewhere.
3. **`rubric_id` is untrusted input in a write path** (BD-1) — and neither function takes `projectRoot`, so containment has no pinnable base.
4. **Present-tense claims about an unmerged branch** (RI-1, RI-2, CON-1) — `lib/evals/read-trace.mjs` and `tests/evals/skill-disclosure/` exist only on `chore/skills/progressive-disclosure`.
5. **The charter revision is a governance action, not a task** (CON-2) — and leaving it in the task map self-inflicts `CHARTER_STALE`.
