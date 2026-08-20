<!-- partial_schema: spec@1 -->

---
charter: eval-harness
kind: behavioral
status: review-pending
risk_level: medium
milestone: v1
revision: 8
charter-revision: 4
created: 2026-08-20
updated: 2026-08-20
source-manifest:
  sha: "ca85164"
  files:
    - cli/index.mjs
    - docs/cli-reference.md
    - lib/cli/eval.mjs
    - lib/evals/score-schema.mjs
    - lib/evals/score.mjs
    - skills/eval/SKILL.md
    - tests/cli/eval-score.test.mjs
    - tests/lib/evals/score-insufficient-evidence.test.mjs
    - tests/lib/evals/score-judge-context.test.mjs
    - tests/lib/evals/score-not-scored.test.mjs
    - tests/lib/evals/score-result-assembly.test.mjs
    - tests/lib/evals/score-rubric-and-threshold.test.mjs
    - tests/lib/evals/score-schema-contract.test.mjs
    - tests/lib/evals/score-status-partition.test.mjs
    - tests/lib/evals/score-tally.test.mjs
    - tests/lib/evals/score-verdict-validation.test.mjs
    - tests/skills/eval-layer3-scoring-verb.test.mjs
  computed-at: "2026-08-20T17:22:00.580Z"
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
| Insufficient-evidence guard | Validate the threshold is numeric and within `[0, 100]`; compare the `unknown` share against it, and treat an all-`unknown` judged half as insufficient regardless of threshold. Set the judged half's value to the status `INSUFFICIENT_EVIDENCE`, leaving the deterministic half's points and maximum unchanged | medium |
| Not-scored handling | A half whose rubric declares no entries, or whose deterministic entries are all `not_applicable`, carries the status `NOT_SCORED`; no `NaN` or division-by-zero value is ever produced | small |
| Status assignment | Implement BEH-3 and BEH-4 as disjoint preconditions rather than an ordered fallback, so a half with declared-but-unanswerable criteria resolves to `INSUFFICIENT_EVIDENCE` and one with nothing to answer to `NOT_SCORED`, with no region left unclaimed | small |
| Result assembly | Verdict table plus separately addressable halves, each a number-with-maximum or a status; a blended total only when both halves are numeric | medium |
| `buildJudgeContext` | Assemble the single-criterion judge context and prove isolation | small |
| `adev eval score` verb | Wrap the engine; table-with-aggregate output, a `--json` shape, and path containment on `--rubric`/`--input` | medium |
| `--rubric default` keyword resolution | Resolve the literal `default` to the plugin's shipped rubric with the plugin root as containment boundary, leaving path values on the BEH-9 project-root path. Derive the plugin root from the module's own location via `getPluginRoot()`; never read `CLAUDE_PLUGIN_ROOT` or any other caller-settable variable (BEH-11) | medium |
| Pass the keyword from the skill | Change `skills/eval/SKILL.md`'s rubric resolution so the shipped-default case emits `--rubric default` rather than an `<ADEV_ROOT>`-relative path, and mirror it to both provider copies (BEH-12) | small |
| End-to-end regression test | Three properties, none of which the repo's own layout can demonstrate on its own: (1) invoke through the real `dispatch()` -> verb-module wiring, not a stubbed internal helper, so what is proved is how the plugin root is actually obtained; (2) run with a plugin root OUTSIDE the project root, since here they are the same directory and a same-root test passes against the broken code; (3) assert on the argument `skills/eval/SKILL.md`'s documented flow actually passes, so a test calling `--rubric default` directly cannot pass while the real caller still sends a resolved path; (4) set `CLAUDE_PLUGIN_ROOT` to a decoy directory and assert the SHIPPED rubric still loads, so the environment-variable prohibition in BEH-11 is enforced by a failing test rather than by review alone | large |
| Correct the documented invocation | `docs/cli-reference.md` shows `--rubric skills/eval/default-rubric.yaml`, a project-root-relative path to the SHIPPED rubric that resolves only because this repository collapses `<ADEV_ROOT>` and the project root. `CLAUDE.md`'s Context Routing table names that file as the authority for CLI verb signatures, so an agent reading it reproduces the refused invocation. Change the example to `--rubric default` (BEH-12) | small |
| Update `skills/eval/SKILL.md` Layer 3 | Replace the in-prose aggregate formula with a call to `adev eval score`, and replace the whole-layer discard with the half-level status reporting this spec defines. Required, not optional: leaving it discarding all of Layer 3 on `INSUFFICIENT_EVIDENCE` while the engine keeps the deterministic half numeric would leave the engine's only in-repo consumer contradicting it | medium |
| Unit tests | Verdict sets exercising every enum value, both statuses, the disjoint-region assignment, and every error code | medium |

## Visual Expectations

Not applicable. This spec defines a library function and a CLI verb with no user interface. Its observable surface is a returned object, a rendered table, and a set of named errors.

## Acceptance Criteria

- [ ] A complete verdict set produces a verdict table plus deterministic and judged halves as distinct fields, each a number-with-maximum or a status (BEH-1)
- [ ] A blended total appears only when both halves are numeric, rounded and capped at `layer3_max_points` (BEH-1)
- [ ] `not_applicable` is excluded from the element denominator and `unknown` from the criterion denominator (BEH-2)
- [ ] An `unknown` share above `insufficient_evidence_threshold_percent` sets the judged half to the status `INSUFFICIENT_EVIDENCE` while the deterministic half reports its points unchanged (BEH-3)
- [ ] A judged half where every declared criterion resolved `unknown` carries `INSUFFICIENT_EVIDENCE` regardless of the rubric's threshold, including at `threshold: 100` (BEH-3)
- [ ] A half with no entry to answer carries the status `NOT_SCORED` (BEH-4)
- [ ] The two statuses are mutually exclusive, and exhaustive over the zero-denominator case: no verdict set produces a half satisfying both, and none reaches the numeric path with nothing answered (BEH-3, BEH-4)
- [ ] A non-numeric or out-of-range `insufficient_evidence_threshold_percent` is rejected with `SCORE_INVALID_THRESHOLD` before any tallying (BEH-10)
- [ ] `skills/eval/SKILL.md` Layer 3 calls `adev eval score` and reports half-level statuses rather than discarding the whole layer
- [ ] A traversal or unreadable path on `--rubric`/`--input` exits non-zero with its named error and reads nothing (BEH-9)
- [ ] `--rubric default` resolves the plugin's shipped rubric and succeeds even when the plugin root lies outside the project root (BEH-11)
- [ ] The plugin root is derived from the module's own location; no code path reads it from the environment (BEH-11)
- [ ] `skills/eval/SKILL.md` and both provider mirrors pass the literal `default`, not a resolved path (BEH-12)
- [ ] The regression test runs through `dispatch()` with the plugin root outside the project root, and asserts the argument the skill's documented flow passes (BEH-11, BEH-12)
- [ ] A decoy `CLAUDE_PLUGIN_ROOT` does not redirect `--rubric default`; the shipped rubric still loads (BEH-11)
- [ ] No emitter of the `--rubric` argument anywhere in the repository passes a path to the shipped rubric — skill, provider mirrors, and `docs/cli-reference.md` all use the keyword (BEH-12)
- [ ] A non-`default` `--rubric` value is still containment-checked against the project root, unchanged (BEH-9, BEH-11)
- [ ] Every error code the implementation can raise appears in the Error Cases table
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
- **BEH-3** — **When** the rubric declares at least one `quality_dimensions` entry and *either* every one of them resolved `unknown`, *or* the `unknown` share exceeds `insufficient_evidence_threshold_percent` **then** the judged half's value is the status `INSUFFICIENT_EVIDENCE`, not a number. The deterministic half reports its earned points and attainable maximum unchanged, and no blended total is produced. A consumer reads `deterministic: 8/10, judged: INSUFFICIENT_EVIDENCE` and is never handed a figure that implies the judges scored zero when in fact they did not answer. The first clause is threshold-independent by design: a half where nothing was answered has no denominator to divide by, so it must resolve to a status whatever the rubric's threshold says. Without it, a rubric declaring `insufficient_evidence_threshold_percent: 100` would satisfy neither this behaviour (100 does not *exceed* 100) nor BEH-4 (criteria were declared), and the half would reach the numeric path with a zero denominator.
- **BEH-4** — **When** a half has no entry to answer — the rubric declares none for that half, or every deterministic entry resolved `not_applicable` — **then** that half's value is the status `NOT_SCORED`, not a number, and no `NaN` or division-by-zero value reaches the caller. The two statuses are mutually exclusive by construction: `INSUFFICIENT_EVIDENCE` requires at least one declared `quality_dimensions` entry, `NOT_SCORED` requires none answerable, so no half satisfies both. Together with BEH-3's threshold-independent clause they are also exhaustive over the zero-denominator case, so no half reaches the numeric path without something to divide by. A half that scored nothing (`0`), one that could not be judged, and one with nothing to judge are three distinguishable outcomes.
- **BEH-5** — **When** a verdict carries `met` or `not_met` with empty evidence **then** the engine rejects the verdict set with `SCORE_EMPTY_EVIDENCE` naming the entry id, because absence of evidence is expressible only as `unknown`.
- **BEH-6** — **When** the verdict set names an id the rubric does not declare **then** `SCORE_UNKNOWN_VERDICT_ID`; **when** it omits an id the rubric does declare **then** `SCORE_MISSING_VERDICT`, each naming the id — a partial verdict set never scores as though it were complete.
- **BEH-7** — **When** `buildJudgeContext(criterion)` is called **then** its output contains that criterion's fields and no other criterion's identifier, no other criterion's verdict, and no running total, so single-criterion isolation is a property of the builder rather than of prose a judge is trusted to honour.
- **BEH-8** — **When** `adev eval score --rubric <path> --input <path>` runs **then** it emits the verdict table together with the aggregate and never the aggregate alone; `--json` returns one object carrying the table, both halves — each a number or a status — and the blended total when both halves are numeric. A half carrying a status is rendered by that status name, never as `0`.
- **BEH-9** — **When** either `--rubric` or `--input` resolves outside the project root through traversal or a symlink, or names a file that cannot be read **then** the verb exits non-zero with `UNSAFE_SCORE_PATH` or `SCORE_INPUT_NOT_FOUND` respectively, reporting the offending path verbatim and reading no content, matching the `UNSAFE_RUBRIC_PATH` precedent the shipped loader set.
- **BEH-11** — **When** `--rubric` carries the literal value `default` **then** the verb resolves the plugin's shipped `skills/eval/default-rubric.yaml` and loads it with the plugin root as its containment boundary, without applying project-root containment — because `default` is a keyword naming a known location, not a user-supplied path. Every other `--rubric` value is a path and is containment-checked against the project root per BEH-9, which is unchanged. **The plugin root is derived from the verb module's own location on disk** — the `__dirname`-derived `getPluginRoot()` in `lib/profiles/index.mjs` — **and never from a caller-settable environment variable such as `CLAUDE_PLUGIN_ROOT`.** Reading it from the environment would let a caller point the one branch that bypasses project-root containment at any directory, which is a weaker posture than the containment it is allowed to skip: the keyword's safety rests entirely on the location being unforgeable.
- **BEH-12** — **When** `skills/eval/SKILL.md`'s rubric resolution selects the shipped default **then** it passes the literal token `default` to `adev eval score --rubric`, and does not pre-resolve it to an `<ADEV_ROOT>`-relative path. A resolved path reaches the verb as an ordinary path argument, takes BEH-9's project-root branch, and is refused in every real install — BEH-11's keyword branch is never entered. The caller obligation is therefore part of the contract, not an implementation detail of the skill: BEH-11 without BEH-12 is correct in isolation and inert in practice, which is exactly the state `/adev:validate` reproduced. The provider mirrors need no separate clause: `tests/sync/provider-skill-parity.test.mjs` runs the real sync script as a quality gate, so a canonical fix cannot land without the mirrors following it.
- **BEH-10** — **When** the supplied Rubric's `insufficient_evidence_threshold_percent` is non-numeric or falls outside `[0, 100]` **then** the engine throws `SCORE_INVALID_THRESHOLD` naming the value, before any tallying runs. The shipped loader validates that top-level keys are *present*, not that they are well-typed, so the engine checks the one field whose corruption is silent rather than loud: a non-numeric threshold coerces to `NaN`, every share comparison against it returns `false`, and BEH-3's second clause would never fire for any verdict set while the rubric still looked valid. Re-validating one field of an already-loaded Rubric does not make the engine a loader — it reads no file and parses nothing.

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
| `insufficient_evidence_threshold_percent` is non-numeric, or outside `[0, 100]` | Throw before any tallying, naming the value (BEH-10). Distinct from `SCORE_INVALID_RUBRIC`, which covers a Rubric of the wrong origin: this one is a well-formed Rubric carrying a field the loader never type-checked | `SCORE_INVALID_THRESHOLD` |
| Every declared `quality_dimensions` entry resolved `unknown` | Not an error — the judged half carries `INSUFFICIENT_EVIDENCE` regardless of the rubric's threshold (BEH-3) | — |
| `--rubric` or `--input` escapes the project root by traversal or symlink | Exit non-zero, reporting the path verbatim; read nothing | `UNSAFE_SCORE_PATH` |
| `--input` names a file that does not exist or cannot be read | Exit non-zero, naming the resolved path | `SCORE_INPUT_NOT_FOUND` |
| `--input` names a readable file that is not valid JSON | Exit non-zero, naming the resolved path. Distinct from `SCORE_INPUT_NOT_FOUND`: the file was read, not missed | `SCORE_INPUT_PARSE_ERROR` |
| `buildJudgeContext` is given a non-object, or a criterion whose required fields are absent or hold `undefined`/`null` | Throw, naming the missing fields. Presence alone is insufficient — an all-`undefined` criterion would otherwise yield a context of blanks | `SCORE_INVALID_VERDICT_CONTEXT` |
| `--rubric default` is passed but the plugin's shipped rubric is absent or unreadable | Exit non-zero, naming the resolved plugin path (BEH-11) | `SCORE_DEFAULT_RUBRIC_MISSING` |
| `unknown` share above the rubric threshold | Not an error — the judged half carries the status `INSUFFICIENT_EVIDENCE` and the deterministic half is unaffected | — |
| A half has no entry to answer (none declared, or all deterministic entries `not_applicable`) | Not an error — that half carries the status `NOT_SCORED`, never `INSUFFICIENT_EVIDENCE` | — |
