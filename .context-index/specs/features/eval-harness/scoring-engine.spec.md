<!-- partial_schema: spec@1 -->

---
charter: eval-harness
kind: behavioral
status: review-pending
risk_level: medium
milestone: v1
revision: 3
charter-revision: 4
created: 2026-08-20
updated: 2026-08-20
---

# Live Spec: Rubric scoring engine and adev eval score verb

## Behavioral Contract

`scoreRubric(rubric, verdicts)` aggregates a resolved verdict set against a loaded Rubric into a verdict table plus a numeric total, and `adev eval score` exposes that to both consumers — `/adev:eval` Layer 3 and the `tests/evals/` suite. The engine decides nothing about whether a criterion is met; it tallies what the deterministic elements and the judges already resolved.

It is the single place the Layer 3 arithmetic exists. That arithmetic currently lives as prose in `skills/eval/SKILL.md`, which the constitution's anti-pattern list says belongs in a CLI verb — this spec moves it, rather than adding a second copy.

The result keeps the deterministic and judged halves separately addressable. A single blended total would make the charter's split-delta rule uncomputable downstream without re-deriving the element/criterion partition, so the partition is part of the engine's output contract, not an implementation detail.

**A half's value is a number or an explicit status, never a number standing in for the absence of one.** `0` means "scored, and earned nothing". A half that could not be scored says so by name — `INSUFFICIENT_EVIDENCE` when the judges answered `unknown` too often to be trusted, `NOT_SCORED` when no entry applied. This extends upward the rule the rubric schema already applies per criterion, where `unknown` is a first-class verdict rather than a silent zero: absence of an answer is reported as absence at every level, not converted into a figure that reads as a result.

**This changes `/adev:eval` Layer 3's observable behaviour**, and the change is intended rather than incidental. Today `skills/eval/SKILL.md` discards the whole layer when evidence is insufficient, which is coherent there because Layer 3 is one of four layers in a 0-100 score. Under a split-halves result it is not: it throws away a deterministic tally that was computed correctly because a judge was uncertain about something else. Updating that skill's reporting is part of this spec's work, not a follow-up.

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — The engine is arithmetic over an already-parsed structure. It needs nothing beyond built-ins, and adding a statistics or assertion dependency for it would require an ADR.
- **Principle:** "Pure ESM — all `.mjs` files, no CommonJS" — Ships as `lib/evals/score.mjs` with named exports, alongside the already-shipped `lib/evals/rubric.mjs`.
- **Anti-pattern:** "No executable logic inside SKILL.md files. Skills name a CLI subcommand; the helper body lives in `lib/cli/` or `scripts/`" — Applies directly. `skills/eval/SKILL.md` Step 3 currently carries the aggregate formula as a fenced text block the agent evaluates in-head. This spec relocates that computation behind `adev eval score`, resolving an existing tension rather than creating one.
- **Anti-pattern:** "Fenced JavaScript in SKILL.md must be descriptive-reference only, never executable directive" — After this lands, the formula block in `skills/eval/SKILL.md` documents what the verb computes; the skill calls the verb.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Verdict-set validation | Reject unknown ids, missing verdicts, illegal enum values, duplicates, and empty evidence before any arithmetic runs | medium |
| Tally with denominator exclusion | Count met/not_met per half, excluding `not_applicable` from the deterministic denominator and `unknown` from the judged one | medium |
| Insufficient-evidence guard | Compare the `unknown` share against the rubric threshold; set the judged half's value to the status `INSUFFICIENT_EVIDENCE`, leaving the deterministic half's points and maximum unchanged | medium |
| Not-scored handling | A half whose rubric declares no entries, or whose deterministic entries are all `not_applicable`, carries the status `NOT_SCORED`; no `NaN` or division-by-zero value is ever produced | small |
| Status precedence | Enforce that the two statuses are mutually exclusive per half, per BEH-3 and BEH-4, so a half with declared-but-unanswerable criteria resolves to `INSUFFICIENT_EVIDENCE` and never to `NOT_SCORED` | small |
| Result assembly | Verdict table plus separately addressable halves, each a number-with-maximum or a status; a blended total only when both halves are numeric | medium |
| `buildJudgeContext` | Assemble the single-criterion judge context and prove isolation | small |
| `adev eval score` verb | Wrap the engine; table-with-aggregate output, a `--json` shape, and path containment on `--rubric`/`--input` | medium |
| Update `skills/eval/SKILL.md` Layer 3 | Replace the in-prose aggregate formula with a call to `adev eval score`, and replace the whole-layer discard with the half-level status reporting this spec defines. Required, not optional: leaving it discarding all of Layer 3 on `INSUFFICIENT_EVIDENCE` while the engine keeps the deterministic half numeric would leave the engine's only in-repo consumer contradicting it | medium |
| Unit tests | Verdict sets exercising every enum value, both statuses, the precedence rule, and every error code | medium |

## Visual Expectations

Not applicable. This spec defines a library function and a CLI verb with no user interface. Its observable surface is a returned object, a rendered table, and a set of named errors.

## Acceptance Criteria

- [ ] A complete verdict set produces a verdict table plus deterministic and judged halves as distinct fields, each a number-with-maximum or a status (BEH-1)
- [ ] A blended total appears only when both halves are numeric, rounded and capped at `layer3_max_points` (BEH-1)
- [ ] `not_applicable` is excluded from the element denominator and `unknown` from the criterion denominator (BEH-2)
- [ ] An `unknown` share above `insufficient_evidence_threshold_percent` sets the judged half to the status `INSUFFICIENT_EVIDENCE` while the deterministic half reports its points unchanged (BEH-3)
- [ ] A half with no entry to answer carries the status `NOT_SCORED`, and a 100% `unknown` judged half carries `INSUFFICIENT_EVIDENCE` — no `NaN` reaches a caller (BEH-4)
- [ ] The two statuses are mutually exclusive: no verdict set produces a half that satisfies both conditions (BEH-3, BEH-4)
- [ ] `skills/eval/SKILL.md` Layer 3 calls `adev eval score` and reports half-level statuses rather than discarding the whole layer
- [ ] A traversal or unreadable path on `--rubric`/`--input` exits non-zero with its named error and reads nothing (BEH-9)
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

- **BEH-1** — **When** `scoreRubric(rubric, verdicts)` receives a complete, valid verdict set **then** it returns the verdict table and the deterministic half and judged half as distinct addressable fields, each carrying either its earned points and its own attainable maximum, or an explicit status from the closed set `INSUFFICIENT_EVIDENCE` / `NOT_SCORED`. A blended total is produced only when both halves are numeric, and is then their sum rounded and capped at `layer3_max_points`.
- **BEH-2** — **When** tallying **then** `not_applicable` entries are excluded from the deterministic denominator and `unknown` entries from the judged denominator, so a criterion a judge could not decide neither helps nor hurts the score.
- **BEH-3** — **When** the rubric declares at least one `quality_dimensions` entry and the share of `unknown` among them exceeds `insufficient_evidence_threshold_percent` **then** the judged half's value is the status `INSUFFICIENT_EVIDENCE`, not a number. The deterministic half reports its earned points and attainable maximum unchanged, and no blended total is produced. A consumer reads `deterministic: 8/10, judged: INSUFFICIENT_EVIDENCE` and is never handed a figure that implies the judges scored zero when in fact they did not answer. This holds at a 100% `unknown` share, which is a judged half that was asked and could not answer — not an unscored one.
- **BEH-4** — **When** a half has no entry to answer — the rubric declares none for that half, or every deterministic entry resolved `not_applicable` — **then** that half's value is the status `NOT_SCORED`, not a number, and no `NaN` or division-by-zero value reaches the caller. The two statuses are mutually exclusive by construction: `INSUFFICIENT_EVIDENCE` requires at least one declared entry, `NOT_SCORED` requires none answerable, so no half can satisfy both and no precedence rule is needed. A half that scored nothing (`0`), one that could not be judged, and one with nothing to judge are three distinguishable outcomes.
- **BEH-5** — **When** a verdict carries `met` or `not_met` with empty evidence **then** the engine rejects the verdict set with `SCORE_EMPTY_EVIDENCE` naming the entry id, because absence of evidence is expressible only as `unknown`.
- **BEH-6** — **When** the verdict set names an id the rubric does not declare **then** `SCORE_UNKNOWN_VERDICT_ID`; **when** it omits an id the rubric does declare **then** `SCORE_MISSING_VERDICT`, each naming the id — a partial verdict set never scores as though it were complete.
- **BEH-7** — **When** `buildJudgeContext(criterion)` is called **then** its output contains that criterion's fields and no other criterion's identifier, no other criterion's verdict, and no running total, so single-criterion isolation is a property of the builder rather than of prose a judge is trusted to honour.
- **BEH-8** — **When** `adev eval score --rubric <path> --input <path>` runs **then** it emits the verdict table together with the aggregate and never the aggregate alone; `--json` returns one object carrying the table, both halves — each a number or a status — and the blended total when both halves are numeric. A half carrying a status is rendered by that status name, never as `0`.
- **BEH-9** — **When** either `--rubric` or `--input` resolves outside the project root through traversal or a symlink, or names a file that cannot be read **then** the verb exits non-zero with `UNSAFE_SCORE_PATH` or `SCORE_INPUT_NOT_FOUND` respectively, reporting the offending path verbatim and reading no content, matching the `UNSAFE_RUBRIC_PATH` precedent the shipped loader set.

## Postconditions

- The deterministic and judged halves are separately addressable in the result, so a downstream comparison can classify `judge-attributable` movement without re-deriving the element/criterion partition.
- A numeric total is never returned or printed without its verdict table.
- No half is ever reported as `0` when it was not scored. `0` is reserved for a half that was scored and earned nothing, so a consumer can distinguish a genuine zero from an absent answer without inspecting the verdict table.
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
| `--rubric` or `--input` escapes the project root by traversal or symlink | Exit non-zero, reporting the path verbatim; read nothing | `UNSAFE_SCORE_PATH` |
| `--input` names a file that does not exist or cannot be read | Exit non-zero, naming the resolved path | `SCORE_INPUT_NOT_FOUND` |
| `unknown` share above the rubric threshold | Not an error — the judged half carries the status `INSUFFICIENT_EVIDENCE` and the deterministic half is unaffected | — |
| A half has no entry to answer (none declared, or all deterministic entries `not_applicable`) | Not an error — that half carries the status `NOT_SCORED`, never `INSUFFICIENT_EVIDENCE` | — |
