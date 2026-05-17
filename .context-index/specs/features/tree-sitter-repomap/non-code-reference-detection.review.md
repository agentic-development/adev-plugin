---
last-reviewed-revision: 2
file-sha: 5ff4797915c8e68eed2d8bca0d007a77e881bc494f449513aa1a6783977f2409
---

# Architecture Review: non-code-reference-detection (rev 2)

> **Date:** 2026-05-17
> **Spec:** `.context-index/specs/features/tree-sitter-repomap/non-code-reference-detection.spec.md` (rev 2)
> **Charter:** `.context-index/specs/features/tree-sitter-repomap/charter.md`
> **Verdict:** PASS

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

## Structural Architect (structural-architect)

**Verdict:** PASS (4 suggestions, 0 warnings, 0 blockers)

All 9 rev-1 findings verified as resolved:

| Rev-1 ID | Status | Note |
|---|---|---|
| SA-1 | Resolved | `tags: string[]` on FileNode declared additive in Schema Evolution Rule; no `Symbol.kind` collision |
| SA-2 | Resolved | Edge `type: "doc-reference"` declared additive with consumer guidance |
| SA-3 | Resolved | Behavior 4 explicitly states post-rank annotation; PageRank sum-to-1.0 invariant preserved |
| SA-4 | Resolved | Path-detection roots derived from `manifest.yaml modules[].paths` with documented fallback |
| SA-5 | Resolved | Regex mode surfaces findings only in `repo-map.md`; no JSON artifacts |
| SA-6 | N/A | Confirmed false positive in rev-1 review |
| SA-7 | Resolved | `count` declared informational metadata; does not affect rank arithmetic |
| SA-8 | Resolved | `exports` resolution scoped to top-level + `import`/`default` conditionals |
| SA-9 | Resolved | Performance baseline clarified as pre-change fixture runtime |

New rev-2 suggestions (clarifying polish, not structural concerns):

- **SA-10** | suggestion | Behavior 4 (Ranker semantics). PageRank `score` field (unchanged, sums to 1.0) vs `references` count (incremented) — a reader may conflate the two. **Recommendation:** add one sentence to Behavior 4 explicitly distinguishing them.
- **SA-11** | suggestion | Behavior 3 — conditional precedence rule. `"import"` wins when both are present is well-defined, but the Behavior doesn't state what happens when neither `"import"` nor `"default"` is present (only `"require"`/`"node"`/etc.). The Error Cases row covers it implicitly. **Recommendation:** add a half-sentence to Behavior 3 stating "if a conditional object lacks both `"import"` and `"default"`, the entry is skipped with `REPOMAP_EXPORTS_UNSUPPORTED_SHAPE`."
- **SA-12** | suggestion | Schema Evolution Rule — sibling-spec amendment timing. Rule says consumers "MUST treat unknown edge types as `"unknown"` and ignore unknown fields" — a new normative requirement on downstream skills. Non-obvious that every downstream skill today already does this. **Recommendation:** add an acceptance criterion to verify each named downstream skill tolerates unknown edge `type` values, OR explicitly defer that verification with a tracked follow-up.
- **SA-13** | suggestion | Behavior 1 — extension list. Lists `mjs, js, ts, mts, cjs, sh, yaml` but doesn't say whether multi-language fixture projects (Python, Go, Rust — listed in charter language support) should also have their extensions matched in skill prose. **Recommendation:** add a sentence noting the extension list is pragmatic scoping to current codebase needs; multi-language extension support is a follow-up.

Module boundaries, ADR compliance, and constitution alignment all verified clean.

## Security Reviewer (security-reviewer)

**Verdict:** PASS (no findings)

Rev 2 preserves rev-1 security posture. The three rev-2 security-relevant changes were verified:

1. **Generalized path-traversal check** — strict tightening of input validation. Closes residual bypasses (absolute paths, symlink-relative escapes, URL-encoded forms, mixed separators) that a `..`-only check would miss.
2. **New `REPOMAP_EXPORTS_UNSUPPORTED_SHAPE` error code** — fail-closed posture. Removes potential attack surface (adversarial glob expansion or `null` confusion) rather than adding one.
3. **Manifest-driven path-detection roots** — manifest is part of the project's own trusted configuration, same trust level as `package.json`. Resolved paths still flow through the generalized path-traversal check.

Other rev-2 deltas (Schema Evolution Rule, `count` field, `referenceSources[]`, post-rank semantics, `REPOMAP_` prefix, regex-mode markdown-only surface) are schema/semantic clarifications with no security surface.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS (no findings)

All 6 rev-1 CON findings verified as resolved:

| Rev-1 ID | Status |
|---|---|
| CON-1 | Resolved — `tags: string[]` on FileNode; `Symbol.kind` enum unchanged |
| CON-2 | Resolved — edge type renamed to `"doc-reference"` (mechanism-style) |
| CON-3 | Resolved — all error codes prefixed `REPOMAP_*` |
| CON-4 | Resolved — `count` documented as informational metadata |
| CON-5 | Resolved — `referenceSources: string[]` declared on symbol-ranks |
| CON-6 | Resolved — regex mode reconciled with charter invariant |

No new consistency findings. Naming, domain-model alignment, contract compatibility, cross-cutting compliance, and constitution citations all verified.

---

## Summary

**Total findings:** 4 (0 blockers, 0 warnings, 4 suggestions)

**Cross-cutting themes:** All material rev-1 issues fully resolved. Remaining items are clarifying polish (sentence-level edits in Behaviors 1, 3, 4, and an acceptance criterion or follow-up for downstream-consumer tolerance verification).

**Verdict consolidation:** PASS — only suggestion-severity findings present.

**Action required:** None. Spec is ready for `/adev:plan`. Suggestions may be folded in as a small rev 3 polish pass or addressed during planning, at the author's discretion.

**Audit trail:** The rev-1 review with the original 15 findings is preserved in the lifecycle log under `lifecycle-state/non-code-reference-detection.jsonl`.
