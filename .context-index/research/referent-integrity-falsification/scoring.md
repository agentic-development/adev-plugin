# Scoring: Referent-Integrity Falsification Runs

Task 5 of the `reviewer-domain-fit` Falsification Gate (Phase 1). Scores the
three preserved `.review.md` runs recorded by Task 4 against the denominator
and bar fixed here, before any run is examined.

## Denominator and bar (fixed before scoring)

Per `mapping-table.md`, of the five candidate ids (`he2`, `r5sc`, `zx5`,
`rftq`, `ysqd`), three are `MAPPED` to a governing Live Spec — `he2`, `r5sc`,
`zx5` — and two (`rftq`, `ysqd`) are `UNMAPPED` (no Live Spec formalizes their
defect at the pre-fix revision). **Denominator = 3.**

Denominator (3) is not `< 3` — it sits at the floor, not below it — so the
experiment is **not automatically INCONCLUSIVE** on denominator grounds alone.
Since denominator `< 5`, the bar is scaled: **bar = ceil(0.6 × 3) = 2**.

Task 4 recorded all three runs as `RECORDED` (no `VOID` runs), so all three
are scorable. This section was written before any `.review.md` was read for
scoring purposes.

## Per-run scoring

| Id | Defect named (yes/no + finding id) | Citation resolves (yes/no + what was checked) | Caught |
|----|----|----|----|
| he2 | Yes — `referent-integrity` blocker `RI-3` (`missing-cli-flag`, `--tier` on `/adev:build`) states no `--tier` flag exists on `/adev:build`; matches `mapping-table.md`'s root cause (build lacked `--tier` propagation, fixed in `df11ba5d`). Text read directly, not inferred from the file's own "historical defect" label. | Yes — `git show d5d2d554:skills/build/SKILL.md \| grep -in tier` at the pre-fix SHA confirms no `--tier` flag/mention in the Arguments/Invocation sections; the only "tier" hits are gate-tier and model-tier senses, exactly as RI-3 claims. | Yes |
| r5sc | Yes — `referent-integrity` blockers `RI-1` (`unsupported-enum-value`, `BLOCK` rejected by `adev report`'s `VALID_VERDICTS`) and `RI-2` (`verdict-scope-mismatch`, per-reviewer template told to emit `BLOCK`) jointly match `mapping-table.md`'s two-part root cause (`0476a7bc` widened `VALID_VERDICTS`; `8d8d5c5a` fixed the per-reviewer prose). Text read directly. | Yes — `git show 104a06e6:lib/cli/report.mjs \| sed -n '60,68p'` at the pre-fix SHA confirms line 64: `VALID_VERDICTS = new Set(["PASS", "PASS_WITH_NOTES", "FAIL"])` — no `BLOCK`, exactly as RI-1 cites. | Yes |
| zx5 | Yes — `referent-integrity` blocker `RI-1` (`nonexistent-lifecycle-step`) states `brainstorm`/`retro` map to steps absent from `STEP_ORDER`, so `requireGate` exits 0 unconditionally; matches `mapping-table.md`'s root cause (no-op gate mappings, fixed in `3f28515c`). Text read directly. | Yes — spot-checked all four sub-citations against `c0a43569` (pre-fix SHA): `lib/cli/gate.mjs:25-33` is exactly `SKILL_STEP_MAP` with `brainstorm`/`retro` entries; `lib/lifecycle-state.mjs:1563` is exactly `STEP_ORDER = ['specify','review','plan','route','implement','validate']` (no `brainstorm`/`retro`); `priorStepOf` at `:1615-1621` and the `requireGate` early-return at `:1647-1648` match verbatim; `tests/cli/gate.test.mjs` has zero `brainstorm`/`retro` matches, confirming "never exercises either." | Yes |

## Raw tally

**3 caught out of 3 scorable runs** (denominator 3, bar 2 → 3 ≥ 2).
