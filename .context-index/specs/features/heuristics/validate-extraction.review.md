# Architecture Review: validate-extraction

> **Date:** 2026-04-09
> **Spec:** .context-index/specs/features/heuristics/validate-extraction.md
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Verdict:** BLOCK
> **last-reviewed-revision:** 1
> **file-sha:** e55c1b3c667d87da575b46e1162938714eba42f7

## Structural Architect

**Verdict:** BLOCK

- **SA-10** [blocker] [Behaviors 4, 9] — Check 12 writes heuristics at `confidence: medium` directly. The store-and-helper spec does not explicitly allow callers to choose an initial confidence above `low`, and does not guarantee that auto-promotion thresholds apply at absolute evidence counts regardless of starting confidence. validate-extraction's Behavior 9 comment — "auto-promotes to `high` on the 3rd distinct-path recurrence" — is not guaranteed by the helper's current contract. Recommendation (on store-and-helper, not this spec): Add an explicit behavior clarifying that `writeHeuristic` accepts any initial confidence and that auto-promotion rules apply at absolute evidence counts regardless of starting confidence. (This is the same issue as SA-14 — fixing store-and-helper resolves it here.)
- **SA-11** [warning] [Behavior 4] — Scope is read from the target spec's `charter:` frontmatter. The `charter:` value is a charter slug, not necessarily a `manifest.yaml modules[].slug`. Recommendation: Clarify the mapping and handle the case where a charter has no corresponding module slug (fall back to `_global`).
- **SA-12** [warning] [Behavior 2] — First-run detection uses a sibling file pattern check. If a prior validation report was deleted and re-run, is that "first run"? Recommendation: Be explicit about the file pattern, location, and whether file absence after deletion is intentionally treated as first-run.
- **SA-13** [suggestion] [Behavior 10] — Id prefix is spec-slug (vs. recover's category prefix). Scoped uniqueness means collision is unlikely. Good.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-9** [warning] [collision] — Same 6-char hash concern as SEC-6. Additionally, two specs with identical titles would produce the same id for the default pattern template. Recommendation: Include the spec's file path (not just title) in the id-generation input; apply 8-char hash.
- **SEC-10** [suggestion] [data-exposure] — Patterns derived from context packets may capture environment-specific content. Recommendation: Distill to structural/behavioral lesson; do not copy packet content verbatim.
- **SEC-11** [suggestion] [other] — `spec-slug` derivation rule (used in both the first-run gate and the id generation) is not defined. Inconsistency between the gate and id would cause duplicate heuristics on repeat validations that are intended to be gated out. Recommendation: Explicitly specify the slug derivation rule and ensure the same rule is used in Behavior 2 and Behavior 10.

## Consistency Analyzer

**Verdict:** BLOCK (CON-21 is a blocker affecting this spec)

- **CON-11** [suggestion] [contract] — Evidence shape matches charter and store-and-helper. Noted as positive.
- **CON-12** [suggestion] [contract] — What happens when `writeHeuristic` is called with `confidence: medium` on an already-stored `medium` entry? Spec is silent. Recommendation (on store-and-helper): "On update, caller-supplied `confidence` is ignored; stored confidence (subject to auto-promotion) is authoritative."
- **CON-13** [suggestion] [domain-model] — `anti-pattern` is left empty for success heuristics. Consistent with store-and-helper error table, but charter entity definition does not mark the field optional. Minor charter-level suggestion.
- **CON-15** [suggestion] [pattern] — Same `projectRoot` resolution gap as CON-10.
- **CON-21** [blocker] [contract] — Spec omits any `title` derivation rule, but `title` is a required field per schema validation. Recommendation: Add rule like `"First-run PASS: <spec-title>"` or `"Success pattern for <spec-slug>"`.

## Cross-Spec Findings affecting this spec

- **SA-14** [blocker] — Same API contract gap as SA-10 (same root cause, dual-listed). Fixing store-and-helper resolves both.
- **SA-15** [warning] — Scope derivation divergence between recover and validate (see recover review).
- **SA-16** [warning] — Derived scope validation against `manifest.yaml modules[].slug` should be explicit.
- **SEC-12** [warning] [data-exposure] — Heuristics are git-tracked. Recommendation: see store-and-helper SEC-12.

---

## Summary

**Total findings:** 12 (2 blockers, 5 warnings, 5 suggestions)

**Blockers (must address before planning):**
- **SA-10 / SA-14** — Resolved by updating store-and-helper to document absolute-threshold auto-promotion semantics. No change to this spec required once the helper spec is updated.
- **CON-21** — Add `title` derivation rule to this spec (e.g., `"First-run PASS: <spec-title>"` or `"Success pattern for <spec-slug>"`).

**Action required:** Revise validate-extraction.md to add the `title` derivation rule. Revise store-and-helper.md to document absolute-threshold auto-promotion (resolves SA-10/SA-14). Re-run review once both are revised.
