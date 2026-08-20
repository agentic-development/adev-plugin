<!-- partial_schema: spec@1 -->

---
charter: eval-harness
kind: behavioral
status: review-pending
risk_level: medium
milestone: v1
revision: 1
charter-revision: 4
created: 2026-08-20
updated: 2026-08-20
---

# Live Spec: Rubric scoring engine and adev eval score verb

## Behavioral Contract

`scoreRubric(rubric, verdicts)` aggregates a resolved verdict set against a loaded Rubric into a verdict table plus a numeric total, and `adev eval score` exposes that to both consumers — `/adev:eval` Layer 3 and the `tests/evals/` suite. The engine decides nothing about whether a criterion is met; it tallies what the deterministic elements and the judges already resolved.

It is the single place the Layer 3 arithmetic exists. That arithmetic currently lives as prose in `skills/eval/SKILL.md`, which the constitution's anti-pattern list says belongs in a CLI verb — this spec moves it, rather than adding a second copy.

The result keeps the deterministic and judged halves separately addressable. A single blended total would make the charter's split-delta rule uncomputable downstream without re-deriving the element/criterion partition, so the partition is part of the engine's output contract, not an implementation detail.

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — The engine is arithmetic over an already-parsed structure. It needs nothing beyond built-ins, and adding a statistics or assertion dependency for it would require an ADR.
- **Principle:** "Pure ESM — all `.mjs` files, no CommonJS" — Ships as `lib/evals/score.mjs` with named exports, alongside the already-shipped `lib/evals/rubric.mjs`.
- **Anti-pattern:** "No executable logic inside SKILL.md files. Skills name a CLI subcommand; the helper body lives in `lib/cli/` or `scripts/`" — Applies directly. `skills/eval/SKILL.md` Step 3 currently carries the aggregate formula as a fenced text block the agent evaluates in-head. This spec relocates that computation behind `adev eval score`, resolving an existing tension rather than creating one.
- **Anti-pattern:** "Fenced JavaScript in SKILL.md must be descriptive-reference only, never executable directive" — After this lands, the formula block in `skills/eval/SKILL.md` documents what the verb computes; the skill calls the verb.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Verdict-set validation | Reject unknown ids, missing verdicts, illegal enum values, and empty evidence before any arithmetic runs | medium |
| Tally with denominator exclusion | Count met/not_met per list, excluding `not_applicable` from elements and `unknown` from criteria | medium |
| Insufficient-evidence guard | Compare the `unknown` share against the rubric threshold; produce the `INSUFFICIENT_EVIDENCE` result and reduced attainable maximum | medium |
| Zero-denominator handling | A term with no answered entries contributes 0 and says so, never `NaN` | small |
| Result assembly | Verdict table plus separately addressable deterministic and judged halves, total, and attainable maximum | medium |
| `buildJudgeContext` | Assemble the single-criterion judge context and prove isolation | small |
| `adev eval score` verb | Wrap the engine; table-with-aggregate output and a `--json` shape | medium |
| Unit tests | Verdict sets exercising every enum value, both guards, and every error code | medium |

## Visual Expectations

Not applicable. This spec defines a library function and a CLI verb with no user interface. Its observable surface is a returned object, a rendered table, and a set of named errors.

## Acceptance Criteria

- [ ] A complete verdict set produces a verdict table, deterministic and judged halves as distinct fields, a total, and an attainable maximum (BEH-1)
- [ ] The total is rounded and capped at `layer3_max_points` (BEH-1)
- [ ] `not_applicable` is excluded from the element denominator and `unknown` from the criterion denominator (BEH-2)
- [ ] An `unknown` share above `insufficient_evidence_threshold_percent` yields `INSUFFICIENT_EVIDENCE`, contributes 0, and reports the reduced attainable maximum (BEH-3)
- [ ] A zero denominator contributes 0 and is reported as such — no `NaN` reaches a caller (BEH-4)
- [ ] A `met` or `not_met` verdict with empty evidence is rejected with `SCORE_EMPTY_EVIDENCE` (BEH-5)
- [ ] An unknown verdict id or a missing verdict is rejected with its named error (BEH-6)
- [ ] `buildJudgeContext` output carries one criterion and no other criterion's id, verdict, or running total (BEH-7)
- [ ] `adev eval score` never emits an aggregate without its verdict table; `--json` carries both (BEH-8)
- [ ] The deterministic and judged halves are addressable without re-deriving the element/criterion partition
- [ ] Identical rubric and verdicts produce byte-identical output across runs
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations — zero new external dependencies

## Preconditions

- A Rubric produced by `loadRubric` is supplied. The engine never reads or parses a rubric file itself; a rubric that failed to load never reaches it.
- A verdict set is supplied by the caller. The engine dispatches no judges and evaluates no `met_when` conditions — it receives resolutions and tallies them.
- No network access and no external system is required.

## Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `scoreRubric(rubric, verdicts)` receives a complete, valid verdict set **then** it returns the verdict table, the deterministic half and the judged half as distinct addressable fields, a total that is their sum rounded and capped at `layer3_max_points`, and the attainable maximum.
- **BEH-2** — **When** tallying **then** `not_applicable` entries are excluded from the deterministic denominator and `unknown` entries from the judged denominator, so a criterion a judge could not decide neither helps nor hurts the score.
- **BEH-3** — **When** the share of `unknown` among `quality_dimensions` exceeds `insufficient_evidence_threshold_percent` **then** the result is `INSUFFICIENT_EVIDENCE`, the judged half contributes 0, and the reported attainable maximum is reduced by `layer3_max_points` rather than the total being presented as if fully earned.
- **BEH-4** — **When** either answered-entry count is zero **then** that half contributes 0 and the result states that it did, and no `NaN` or division-by-zero value reaches the caller.
- **BEH-5** — **When** a verdict carries `met` or `not_met` with empty evidence **then** the engine rejects the verdict set with `SCORE_EMPTY_EVIDENCE` naming the entry id, because absence of evidence is expressible only as `unknown`.
- **BEH-6** — **When** the verdict set names an id the rubric does not declare **then** `SCORE_UNKNOWN_VERDICT_ID`; **when** it omits an id the rubric does declare **then** `SCORE_MISSING_VERDICT`, each naming the id — a partial verdict set never scores as though it were complete.
- **BEH-7** — **When** `buildJudgeContext(criterion)` is called **then** its output contains that criterion's fields and no other criterion's identifier, no other criterion's verdict, and no running total, so single-criterion isolation is a property of the builder rather than of prose a judge is trusted to honour.
- **BEH-8** — **When** `adev eval score --rubric <path> --input <path>` runs **then** it emits the verdict table together with the aggregate and never the aggregate alone; `--json` returns one object carrying the table, both halves, the total, and the attainable maximum.

## Postconditions

- The deterministic and judged halves are separately addressable in the result, so a downstream comparison can classify `judge-attributable` movement without re-deriving the element/criterion partition.
- A numeric total is never returned or printed without its verdict table.
- The same rubric and the same verdict set yield byte-identical output; no clock read and no randomness occurs anywhere in the scoring path.
- The engine performs no filesystem writes, spawns no process, and opens no network connection.
- A rejected verdict set produces no partial score: validation completes before any arithmetic runs.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `met` or `not_met` verdict with empty evidence | Throw, naming the entry id | `SCORE_EMPTY_EVIDENCE` |
| Verdict names an id the rubric does not declare | Throw, naming the id | `SCORE_UNKNOWN_VERDICT_ID` |
| Rubric declares an id the verdict set omits | Throw, naming the id | `SCORE_MISSING_VERDICT` |
| Element verdict outside `met`/`not_met`/`not_applicable`, or criterion verdict outside `met`/`not_met`/`unknown` | Throw, naming the entry id and the illegal value | `SCORE_INVALID_VERDICT` |
| Duplicate verdict for one id | Throw, naming the id | `SCORE_DUPLICATE_VERDICT` |
| Rubric argument is not a Rubric produced by `loadRubric` | Throw, naming the expected origin | `SCORE_INVALID_RUBRIC` |
| `unknown` share above the rubric threshold | Not an error — result is `INSUFFICIENT_EVIDENCE` with a reduced attainable maximum | — |
