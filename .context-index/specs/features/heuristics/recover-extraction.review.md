# Architecture Review: recover-extraction

> **Date:** 2026-04-09
> **Spec:** .context-index/specs/features/heuristics/recover-extraction.md
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Verdict:** BLOCK
> **last-reviewed-revision:** 1
> **file-sha:** 68a1f86036c192ffcecea8577224a2554d70c20c

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-6** [warning] [Behavior 2] — Scope derivation rule is described by example only. Recommendation: Specify as "the segment under `features/` that matches a `modules[].slug` in `manifest.yaml`, else `_global`".
- **SA-7** [warning] [Behavior 13] — Deterministic id based on root-cause text assumes exact textual equality. Any rewording defeats recurrence detection. Recommendation: Specify a normalization rule (lowercase, collapse whitespace, strip punctuation) OR soften the recurrence postcondition.
- **SA-8** [suggestion] — Initial confidence `low` is consistent with store-and-helper auto-promotion. Noted as positive.
- **SA-9** [suggestion] — Empty `anti-pattern` for `NOVEL_PROBLEM` is consistent with store-and-helper error table. Noted as positive.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-6** [warning] [collision] — 6-character hex hash = 24 bits → ~50% collision at ~5,000 distinct root causes in a long-lived project. Recommendation: Increase to 8 characters (32 bits) and document that true id collisions silently merge unrelated entries.
- **SEC-7** [warning] [data-exposure] — Behavior 5 quotes the ambiguous spec phrase verbatim. Specs can embed credentials. Recommendation: Paraphrase or abstract; do not quote literal strings containing obvious sensitive patterns.
- **SEC-8** [suggestion] [file-path-safety] — Scope derivation from plan path needs explicit normalization (`path.basename()` of the segment), and the result must be validated against `manifest.yaml` slugs before being passed to `writeHeuristic`. Related to SEC-1 on store-and-helper.

## Consistency Analyzer

**Verdict:** BLOCK (CON-21 is a blocker affecting this spec)

- **CON-6** [suggestion] [contract] — Evidence shape matches charter and store-and-helper. Noted as positive. Minor: dedup key is `(path, date)` only; `source` is not part of dedup. Implementer reading only this spec would not know this.
- **CON-7** [suggestion] [naming] — Hash length (6 chars) differs from `session-summary.mjs` (7-char `shortHash`). Not a conflict since both extraction specs agree on 6, but hash algorithm family (SHA-256 hex) should be stated explicitly.
- **CON-8** [suggestion] [contract] — Deduplication is keyed on `id`; this is implicit from Behavior 12's deference to the helper. Recommendation: Add a one-sentence clarification.
- **CON-10** [suggestion] [pattern] — `projectRoot` resolution source not documented for the inline Node invocation from the skill. All lib helpers require an absolute `projectRoot`. Recommendation: Document where `projectRoot` comes from in the skill execution context.
- **CON-21** [blocker] [contract] — The spec omits any `title` derivation rule, but `title` is a required field per store-and-helper's schema validation. `writeHeuristic` will throw `HEURISTICS_SCHEMA_ERROR` at runtime. Recommendation: Add a `title` derivation rule per diagnosis category (e.g., `"<category-label>: <short-root-cause-summary>"`).

## Cross-Spec Findings affecting this spec

- **SA-15** [warning] — Scope derivation differs structurally between recover (plan path) and validate (charter frontmatter). Could produce divergent scopes for the same feature. Recommendation: Add a shared scope-resolution helper to store-and-helper OR document the expected mapping rule in both consumer specs.
- **SA-16** [warning] — Neither consumer spec says whether derived scope is validated against `manifest.yaml modules[].slug`. Recommendation: Add a one-liner: "derived scope is validated against `manifest.yaml modules[].slug`; unknown scopes fall back to `_global`."
- **SEC-12** [warning] [data-exposure] — Heuristics are git-tracked. No redaction guidance. Recommendation: See store-and-helper SEC-12.
- **SEC-13** [suggestion] [collision] — id namespace convention (category prefix vs. spec-slug prefix) should be documented in `_format.md` to prevent future extraction points from colliding.

---

## Summary

**Total findings:** 11 (1 blocker, 5 warnings, 5 suggestions)

**Blockers (must address before planning):**
- **CON-21** — Add `title` derivation rule (all 6 diagnosis categories need a title template)

**Action required:** Revise recover-extraction.md to address the blocker and the warnings (especially SA-6, SA-7, SEC-8 for scope-derivation explicitness). Re-run review once revised.
