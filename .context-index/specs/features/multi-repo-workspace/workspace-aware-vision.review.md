---
last-reviewed-revision: 3
file-sha: 199d3111488dace5a2ae4fb7ebcd04b986128315
---

# Architecture Review: workspace-aware-vision (Re-review of Revision 3)

> **Date:** 2026-04-16
> **Spec:** .context-index/specs/features/multi-repo-workspace/workspace-aware-vision.md
> **Charter:** .context-index/specs/features/multi-repo-workspace/charter.md
> **Verdict:** PASS_WITH_NOTES
> **Prior Verdict:** BLOCK (rev 2) — all prior blockers and warnings resolved or acknowledged; see per-reviewer resolution notes.

## Structural Architect

**Verdict:** PASS (all findings below are `suggestion` severity)

### SA-1 — suggestion
- **Location:** B13 (Resolution anchor)
- **Finding:** The `<slug>/<module>` annotation "IS the resolution anchor" but is "display-only in release plan text; NOT persisted to work-item frontmatter." Readers navigating from persisted work items will not have the anchor available. The spec does not state how a consumer reading only frontmatter recovers the target repo.
- **Recommendation:** Clarify in B13 whether frontmatter consumers are expected to re-resolve via `resolveWorkspaceContext()` at read time, or whether the display-only constraint means frontmatter consumers are explicitly out of scope for this spec.

### SA-2 — suggestion
- **Location:** B14 (Inheritance rule)
- **Finding:** The Feature-edge inheritance rule produces O(|A|·|B|) edges per repo-pair. For a workspace with N repos × M features, the implicit edge set handed to the topo sort in B15 may be large. The 200-file cap from B22 bounds charter reads but not derived edge count.
- **Recommendation:** Add a sentence stating that, given the 200-charter cap, the derived edge count is bounded-by-construction (≤ 200² edges per pair-iteration worst case). No algorithmic change needed.

### SA-3 — suggestion
- **Location:** B21 vs. Preconditions (trust boundary on `resolveWorkspaceContext`)
- **Finding:** B21 scopes enforcement to "this spec's skills" with upstream hardening of `detectWorkspace` / `resolveWorkspaceContext` deferred as follow-up. This means `resolveWorkspaceContext()` — which B14 depends on — may return data derived from un-hardened paths. The interim trust contract is not enumerated.
- **Recommendation:** In B21, enumerate which fields of `resolveWorkspaceContext()`'s return value this spec re-validates (e.g., `siblingRepos[].path`) vs. which it trusts.

### SA-4 — suggestion
- **Location:** B23 (Advisory channel)
- **Finding:** Advisory emits to stdout. The constitution states hooks output JSON to stdout. A future hook that wraps `/adev:brainstorm` or `/adev:plan` would have its stdout JSON contract corrupted by the advisory line.
- **Recommendation:** Note in B23 that the advisory is emitted only from skill/CLI invocation surfaces; hook-invoked code paths are out of scope.

### Resolution assessment (from prior review)
- **SEC-1 (prior blocker):** Materially resolved. B21 specifies `path.resolve` + `startsWith(workspaceRoot + path.sep)` with rejection/continuation semantics and `PATH_ESCAPE` error code. Precondition explicitly names untrusted inputs.
- **SA-3 / CON-6 (prior charter conflict):** Materially resolved. All workspace `manifest.yaml` references removed; B16/B20 skip epic-board `create()` unconditionally. The charter's conditional language is a superset; this spec implements the stricter subset without conflict.
- Prior SA-1, SA-2, SA-4, SA-5, SA-6: all addressed with specific behavior text; no regressions.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES (SEC-5 warning; SEC-6 suggestion)

### Prior findings — RESOLVED
- **SEC-1 (prior blocker):** Closed. B21 path containment + B22 size caps + explicit Precondition on untrusted inputs.
- **SEC-2 (prior warning):** Closed. B22 enforces ≤200 charter files / ≤512 KB per file with defined overflow behavior.
- **SEC-3 (prior warning):** Closed. B7 strips `\x00-\x1F`, `\x7F`, ANSI CSI + truncates to 200 UTF-8 chars with ellipsis.
- **SEC-4 (prior warning):** Closed. B18 enforces `^[a-zA-Z0-9_-]+$` on both module and slug tokens before any filesystem lookup; raises `INVALID_MODULE_NAME`.

### SEC-5 — warning
- **Category:** input-validation
- **Finding:** B21 explicitly defers upstream hardening of `detectWorkspace` / `resolveWorkspaceContext`. Until that lands, a path from `adev-workspace.yaml` consumed by those functions before skill-level B21 runs could still escape containment. The spec narrows its guarantee to "inside skills specified here" but doesn't bound exposure if a downstream caller invokes `resolveWorkspaceContext` without the B21 guard.
- **Recommendation:** Track the follow-up hardening task as a named issue with a blocking label so it cannot be silently deferred. Alternatively, add a Postcondition stating "callers of `resolveWorkspaceContext` MUST apply B21 before passing any derived path to I/O operations" so the invariant is enforceable by code review.

### SEC-6 — suggestion
- **Category:** input-validation
- **Finding:** The 200-file cap in B22 uses "declaration order" as the truncation criterion. A crafted `adev-workspace.yaml` listing 200 attacker-controlled repos before legitimate ones would fill all cap slots with attacker content while silently dropping operator repos.
- **Recommendation:** Either apply the cap after sorting by an operator-controlled stable criterion, OR explicitly call out in a security note that declaration order in `adev-workspace.yaml` determines inclusion priority so operators are not surprised.

## Consistency Analyzer

**Verdict:** PASS (all prior findings resolved or acknowledged; remaining notes are informational)

### Prior findings — RESOLVED
- **CON-1 (pluralisation):** B4 explicitly states workspaces may hold multiple feature charters — plural by design.
- **CON-2 (prompt supersession):** B7 documents the supersession note for `@design/brainstorm-product-bootstrap` B3. Single-question contract preserved; only preface changes.
- **CON-3 (advisory channel):** B23 explicitly states stdout, once per invocation, and calls out exclusions (stderr, logs, hooks).
- **CON-4 (source annotation):** B13 explicitly decouples display-only annotation from `target-repo` frontmatter convention.
- **CON-5 (isolation ADR):** Added as a named follow-up task in the Task Map.
- **CON-6 (manifest.yaml naming):** Removed entirely. Spec's unconditional defer is a stricter subset of the charter's conditional description.

### Informational notes (no severity)
- **Charter / spec scope alignment:** The charter Capability Map row for "Workspace-Aware Release & Milestone Planning" describes a conditional gate on workspace `manifest.yaml`; the spec implements unconditional defer. This is intentional Phase 1 scope narrowing. Recommend aligning the charter row description in the same charter-revision cycle so the charter and spec describe the same Phase 1 behavior.
- **Feature-granularity inheritance:** B14 extends the repo-granularity topo-sort from `dependency-aware-planning` B2-3 to feature granularity. Additive; no conflict.

## Domain Specialists

No domain specialists registered in `.context-index/manifest.yaml` (`specialists: []`). None dispatched.

---

## Summary

**Total findings:** 7 (0 blockers, 1 warning, 6 suggestions)

All prior blockers and warnings from rev 2 are materially resolved. Remaining items:

- **1 warning (SEC-5):** Track the upstream-hardening follow-up as a blocking issue so it is not silently deferred. Mitigatable by adding a Postcondition stating callers must apply B21 before I/O.
- **6 suggestions:** Documentation/boundary clarifications (SA-1..SA-4, SEC-6) and an out-of-band charter-description alignment (consistency informational).

**Action required:** Spec is ready for planning. Proceed to `/adev:build` (or `/adev:plan --spec`) for this spec. The warning (SEC-5) and the suggestions can be folded into a subsequent spec revision or addressed during implementation — they do not block planning.
