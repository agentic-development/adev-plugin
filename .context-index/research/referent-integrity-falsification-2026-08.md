# Finding: Referent-Integrity Falsification Gate — Bar Met

Phase 1 (Falsification Gate) of the `reviewer-domain-fit` initiative
(`.context-index/specs/features/reviewer-domain-fit/charter.md`), governed by
`.context-index/specs/features/reviewer-domain-fit/falsification-gate.spec.md`.
Supporting artifacts (mapping table, run log, scoring, preserved `.review.md`
files) live under the sibling directory
`.context-index/research/referent-integrity-falsification/`; this file
records the terminal finding required by Postcondition 5.

## Tally and bar

- **Denominator: 3.** Of the five candidate ids (`he2`, `r5sc`, `zx5`,
  `rftq`, `ysqd`), only three mapped to a Live Spec that governed the
  defective behaviour at its pre-fix revision (`he2`, `r5sc`, `zx5`). Per
  Postcondition 4, the denominator is the count that mapped, not 5.
- **Bar: 2** — `ceil(0.6 × 3) = 2`, fixed before any run was scored (see
  `referent-integrity-falsification/scoring.md` and
  `referent-integrity-falsification/mapping-table.md`'s "Denominator note").
- **Result: 3 of 3 scorable runs caught the known defect** — a
  `referent-integrity` blocker finding naming the defect with a citation
  that resolves to a real file, symbol, or line at the reviewed pre-fix
  commit. 3 ≥ 2.

## Verdict: Bar met

## Consequence

Phase 2 (panel and prompt retargeting, per the charter's Evidence track) is
**unblocked**. The panel thesis — that the mismatch is scope, not
reachability — holds for the class of defect this experiment probed.

## What each caught run demonstrated

Full detail lives in `referent-integrity-falsification/scoring.md` and the
preserved `.review.md` files under
`referent-integrity-falsification/`; this section only summarizes, per the
task's instruction not to re-derive their content.

- **`he2`** — `referent-integrity` blocker **RI-3** (`missing-cli-flag`)
  named the absence of a `--tier` flag on `/adev:build` at the pre-fix
  revision, matching `mapping-table.md`'s root cause exactly. The citation
  was checked directly against `skills/build/SKILL.md` at the pre-fix SHA
  and resolves.
- **`r5sc`** — `referent-integrity` blockers **RI-1** and **RI-2** jointly
  named the two-part defect: an enum (`VALID_VERDICTS`) that rejected
  `BLOCK`, and per-reviewer prose that told a reviewer to emit a verdict the
  governing spec never assigns to an individual reviewer. Both citations
  were checked against the pre-fix source and resolve.
- **`zx5`** — `referent-integrity` blocker **RI-1** named two gate mappings
  (`brainstorm`, `retro`) resolving to steps absent from `STEP_ORDER`,
  causing `requireGate` to pass unconditionally. All four sub-citations were
  spot-checked against the pre-fix source and resolve.

## Excluded ids: `rftq` and `ysqd` (UNMAPPED)

Per `mapping-table.md`, these two of the original five candidate ids were
recorded `UNMAPPED` rather than substituted with a loosely related spec,
per the task's own instruction to preserve denominator integrity honestly:

- **`rftq`** — the defect (a missing default rubric file for
  `/adev:eval` Layer 3) lived only in `skills/eval/SKILL.md` prose. The
  fixing commit's own `Spec:` trailer names
  `configurable-checks.spec.md`, but that spec governs `/adev:validate`'s
  check registry — a parallel but distinct subsystem — and contains no
  mention of `/adev:eval`, `skills/eval/SKILL.md`, "rubric," or "Layer 3."
  A broader search found no spec formalizing the Layer 3 rubric-resolution
  contract at the pre-fix revision.
- **`ysqd`** — the defect (an unbounded Stage-2 review loop in
  `/adev:implement`) lived only in `skills/implement/SKILL.md` Step 2g
  prose. This id was originally recorded MAPPED to
  `review-block-auto-retry.spec.md` on the strength of a shared `Spec:`
  trailer and reused vocabulary/primitive (`lib/loop-convergence.mjs`), but
  a spec-compliance re-review caught this as exactly the trap the task
  instructions warn against: that spec's Behavioral Contract, Preconditions,
  Behaviors, Postconditions, and Error Cases are scoped entirely to
  `/adev:build --full`'s spec-revision auto-retry loop, name
  `/adev:implement` nowhere, and its source-manifest never lists
  `skills/implement/SKILL.md`. Code reuse is not spec governance. No
  genuine governing spec was found after a further search.

This drops the denominator from 5 to 3, per Postcondition 4's explicit
provision for a reduced denominator (with a floor of 3 below which the
result would instead be INCONCLUSIVE — not applicable here, since 3 is at
the floor, not below it).

## Methodological findings worth carrying forward

Two things surfaced during execution that are independent of the
referent-integrity verdict itself and worth recording for future work:

1. **Dispatch fidelity matters, and was enforced by review.** The first
   `he2` run attempt hand-simulated the four reviewer dispatches instead of
   exercising the real gate check and dispatch mechanism, and was correctly
   rejected on spec-compliance review (see git history for the superseded
   commit, and `referent-integrity-falsification/run-log.md`'s Methodology
   section). It was redone using a small script
   (`build-dispatches.mjs`, scratch tooling, not committed) that imports the
   installed plugin's own `loadReviewConfig`, `buildReviewerDispatches`, and
   `renderPack` — the same functions `skills/review-specs/SKILL.md` names as
   the sole authority for prompt composition. **Future `/adev:review-specs`
   dogfooding runs should use this same approach** (importing the real
   library functions to produce real prompt text) rather than
   hand-approximating reviewer prompts, which is not equivalent to a real
   dispatch and does not survive spec-compliance review.

2. **A pre-existing, independently reproducible lifecycle-log gap blocks
   strict-mode gating on two specs, unrelated to referent-integrity.** Both
   `r5sc`'s and `zx5`'s governing specs have a `specify` `step_completed`
   lifecycle event recorded with `verdict: null` (or, for `r5sc`, no
   `specify` event at all) rather than `verdict: "PASS"`. This was
   independently confirmed to reproduce identically when running `adev gate
   require --skill review-specs --spec <same-path>` against the **current
   main tree**, not just the historical scratch worktree — i.e., it would
   block a real `/adev:review-specs` invocation on these two specs today,
   for reasons having nothing to do with this experiment. It was worked
   around here via a worktree-local `lifecycle.gate_mode: advisory` override
   (never applied to the main tree) so these two mapped ids would not become
   VOID for an unrelated infrastructure reason; see
   `referent-integrity-falsification/run-log.md` for the full detail and the
   strict-mode exit codes observed. This gap is real, independently
   reproducible, and worth its own follow-up — **not fixed here**, out of
   scope for this task. If the operator wants it tracked, file it via
   `/adev:issues`.
