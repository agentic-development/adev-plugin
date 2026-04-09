# Architecture Review: recover-extraction (re-review r2)

> **Date:** 2026-04-09
> **Spec:** .context-index/specs/features/heuristics/recover-extraction.md
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2
> **file-sha:** 266cd85d5274fe427a5c0a7203c4a7bd2d6e5cfd

## Previously-Flagged Blockers — Status

- **CON-21** (missing title derivation) — **RESOLVED**. New Title Derivation Rule with 6 category labels and 120-char cap.

## Structural Architect (r2)

**Verdict:** PASS

All previously-identified warnings (SA-6 scope derivation, SA-7 hash normalization) RESOLVED. Three suggestions:
- **SA-NEW-4** [suggestion] — Normalization strips "punctuation except `-` and `_`" but doesn't define Unicode/emoji/control-character handling. Recommend ASCII-only filtering for determinism.
- **SA-NEW-5** [info] — Spec references store-and-helper Behaviors by number; cross-reference by name would be more robust against renumbering.
- **SA-NEW-6** [suggestion] — Evidence dedup on `(path, date)` means same-path-same-date from different sources could drop one — extremely unlikely but worth a charter note.

## Security Reviewer (r2)

**Verdict:** PASS

All SEC-6, SEC-7, SEC-8 RESOLVED. No new findings.

## Consistency Analyzer (r2)

**Verdict:** PASS_WITH_NOTES

CON-6, CON-7, CON-10, CON-21 all RESOLVED. Two notes:
- **CON-NEW-3** [note] [contract] — Unlike validate-extraction, this spec has no proactive title truncation rule. If an agent generates a summary that pushes past 120 chars, the `writeHeuristic` schema error causes silent SKIP. Recommend: add explicit truncation ("truncate to 117 chars + `...`") or clarify the SKIP behavior is acceptable.
- **CON-NEW-4** [note] [contract] — Scope Derivation Rule reads active plan path from `.active-plan` OR `--task` argument but doesn't specify precedence when both are present.

---

## Summary

**Total findings (r2):** 5 (0 blockers, 0 warnings, 5 notes/suggestions)

**Action required:** None blocking. Spec unlocks planning.

**Status transition:** `review-blocked` → `review-passed`
