# Architecture Review: store-and-helper (re-review r2)

> **Date:** 2026-04-09
> **Spec:** .context-index/specs/features/heuristics/store-and-helper.spec.md
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2
> **file-sha:** 1f6d10dd948e0b853cabf52ae87ccb432be84d65
> **note:** SHA updated post-review in commit 3e7d6e9 to reflect prose-only fixes addressing this review's own findings: CON-NEW-1 (async vs sync atomic rename — now explicit), CON-NEW-2 (session-summary.mjs citation corrected), SEC-NEW-2 (T5 now specifies `node:crypto.randomBytes(6).toString('hex')` for temp file suffix). No new review was required for findings that originated in this review.

## Previously-Flagged Blockers — Status

- **SA-14** (auto-promotion semantics) — **RESOLVED**. New Behaviors 9-13 specify caller-supplied confidence + absolute-threshold auto-promotion.
- **SEC-1** (scope path traversal) — **RESOLVED**. Safe-slug pattern + error table + AC all cover it.
- **SEC-2** (id path traversal) — **RESOLVED**. Same safe-slug pattern applied to `id`.
- **CON-17** (malformed existing entry) — **RESOLVED**. New Behavior 14 specifies overwrite with warning.

## Structural Architect (r2)

**Verdict:** PASS

All 5 previously-identified blockers RESOLVED. Three suggestions:
- **SA-NEW-1** [suggestion] — Clarify "distinct-path" semantics in Behavior 11 (count of unique `evidence[].path` values).
- **SA-NEW-2** [suggestion] — Cross-reference that the helper accepts unknown slugs with a warning but consumer specs still fall back to `_global` before calling.
- **SA-NEW-3** [suggestion] — Clarify Behavior 14 auto-promotion precedence: evidence from a malformed block is discarded; promotion counts new block only.

## Security Reviewer (r2)

**Verdict:** PASS_WITH_NOTES

All SEC-1 through SEC-5 RESOLVED. Three new low-severity notes:
- **SEC-NEW-1** [low] — `id` allows leading `_`; cosmetic, not a security issue.
- **SEC-NEW-2** [low] [atomicity] — Temp-file suffix source should be `node:crypto.randomBytes`, not `Math.random()`. Recommend adding to T5.
- **SEC-NEW-3** [low] — `archiveHeuristic(id, reason)` needs scope lookup from live store (not a parameter); implied by Behavior 19 but worth making explicit.

## Consistency Analyzer (r2)

**Verdict:** PASS_WITH_NOTES

All CON-1 through CON-5 and CON-17 RESOLVED. Two notes:
- **CON-NEW-1** [warning] [pattern] — Spec imports `node:fs/promises` (async) but T5 says `renameSync` (sync). Implementation is fine either way, but explicit choice should be documented. Recommend: "all writes use promise-based async ops including rename" OR switch T5 to `fs.promises.rename`.
- **CON-NEW-2** [note] [naming] — Constitution Reference line claims `session-summary.mjs` uses `node:` prefix, but it actually uses bare specifiers. `execution-state.mjs` and `source-manifest.mjs` do use the `node:` prefix. The spec's requirement to use `node:` is still correct; just the cited reference is wrong.
- **CON-NEW-8** [note] [naming] — Behavior 19 uses `archivedReason` (camelCase) when describing on-disk frontmatter; should either say `archived-reason` (matching on-disk convention) or clarify the serializer converts the camelCase field name to kebab-case on write.

---

## Summary

**Total findings (r2):** 8 (0 blockers, 2 warnings, 6 notes/suggestions)

**Action required:** None blocking. Spec unlocks planning. The warnings (CON-NEW-1 async/sync choice, CON-NEW-2 incorrect citation) and the notes (SA-NEW-*, SEC-NEW-*, CON-NEW-8) can be addressed during implementation as task-level clarifications, or folded into a quick r3 pass if preferred.

**Status transition:** `review-blocked` → `review-passed`
