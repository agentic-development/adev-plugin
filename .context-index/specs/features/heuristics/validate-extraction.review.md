# Architecture Review: validate-extraction (re-review r2)

> **Date:** 2026-04-09
> **Spec:** .context-index/specs/features/heuristics/validate-extraction.md
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2
> **file-sha:** 8ea61c021f413a1cc2e396d67beaafad80acf745
> **note:** SHA updated post-review in commit 3e7d6e9 to reflect prose-only fix addressing this review's own finding: CON-NEW-5 ("guaranteed by construction" language softened for pathological filenames; path separator normalization added). No new review was required for a finding that originated in this review.

## Previously-Flagged Blockers — Status

- **SA-10** (auto-promotion semantics, dual of SA-14) — **RESOLVED** via store-and-helper r2 Behaviors 9-13.
- **CON-21** (missing title derivation) — **RESOLVED**. New Title Derivation Rule with explicit 117+`...` truncation.

## Structural Architect (r2)

**Verdict:** PASS

All SA-10, SA-11, SA-12, CON-21 RESOLVED. Three suggestions:
- **SA-NEW-7** [suggestion] — Title truncation to 117 chars doesn't address mid-word or mid-multibyte-character splits. Fine for ASCII titles; implementation detail.
- **SA-NEW-8** [suggestion] — Behavior 7 success-factor priority order: "first match wins; additional factors are ignored" would remove ambiguity.
- **SA-NEW-9** [info] — Id derivation input asymmetry with recover is intentional; canonicalize in `_format.md`.

## Security Reviewer (r2)

**Verdict:** PASS_WITH_NOTES

All SEC-9, SEC-10, SEC-11 RESOLVED. Three new notes:
- **SEC-NEW-4** [medium] [file-path-safety] — ID hash input includes absolute file path lowercased; on non-POSIX systems path separators could differ from `path.basename()` output. Recommend normalizing `\` → `/` before hashing. Not operational today (POSIX target) but worth a portability note.
- **SEC-NEW-5** [low] — Accidental deletion of a `-validation.md` file triggers re-extraction. Because `writeHeuristic` is upsert-keyed on `id`, this updates the existing entry rather than duplicating — invariant preserved; intentional behavior.
- **SEC-NEW-6** [low] — Title derivation lifts the spec heading directly. Deliberate, and headings are already public in git.

## Consistency Analyzer (r2)

**Verdict:** PASS_WITH_NOTES

CON-12, CON-15, CON-17, CON-21 all RESOLVED. Two notes:
- **CON-NEW-5** [warning] [contract] — "Guaranteed by construction" safe-slug claim is not strictly true for pathological filenames (e.g., `--foo.md` strips to empty → `-<hash>` fails pattern). The SKIP path covers it functionally. Recommend softening to "guaranteed for well-formed spec filenames; pathological cases fall back to SKIP via schema validation."
- **CON-NEW-6** [note] [domain-model] — Same-slug specs in different directories: first-run detection is directory-scoped (safe); id derivation includes absolute path (safe). Documented for reviewers.

---

## Summary

**Total findings (r2):** 8 (0 blockers, 1 warning, 7 notes/suggestions)

**Action required:** None blocking. Spec unlocks planning. CON-NEW-5 is the only warning worth a quick prose fix; all other findings are informational.

**Status transition:** `review-blocked` → `review-passed`
