---
last-reviewed-revision: 1
file-sha: b1092433790427471899eba167c596f055e981ac
review-date: 2026-04-09
---

# Architecture Review: plan-mode-guard

> **Date:** 2026-04-09
> **Spec:** `.context-index/specs/features/hooks/plan-mode-guard.md`
> **Charter:** `.context-index/specs/features/hooks/charter.md` (revision 3)
> **Verdict:** BLOCK

## Structural Architect

**Verdict:** PASS (3 suggestions, 0 warnings, 0 blockers)

### SA-1 — suggestion
- **Location:** Architecture / Behaviors #4
- **Finding:** The contract for the Claude Code adapter's stdout payload is specified as a literal JSON snippet (`{"hookSpecificOutput": {"additionalContext": "<advisoryMessage>"}}`) but the spec does not reference where the `hookSpecificOutput` schema is defined or versioned.
- **Recommendation:** Add a one-line reference in the Architecture section pointing to the existing hook protocol documentation or the `context-preflight.sh` precedent (which uses the same envelope).

### SA-2 — suggestion
- **Location:** Architecture layer 1 (Core check)
- **Finding:** `checkPlanMode` is declared as exporting a function plus two constants (regex, advisory message template). The spec does not commit to whether the returned `advisoryMessage` is a fully-rendered string or a template with substitution slots.
- **Recommendation:** In Behavior #2, clarify that `advisoryMessage` is a fully-rendered static string (no interpolation) so consumers can assert exact equality in tests and adapters can inject it verbatim.

### SA-3 — suggestion
- **Location:** Behaviors #8, #9
- **Finding:** Behaviors #8 and #9 describe session-start injection for Claude Code and OpenCode. These are environmental observations, not behaviors owned by this spec's surface (lib + hook adapter + wrapper).
- **Recommendation:** Move #8 and #9 out of Behaviors into a separate "Integration Notes" or "Downstream Consumers" subsection to keep the behavioral contract tightly scoped.

## Security Reviewer

**Verdict:** PASS (3 suggestions, 0 warnings, 0 blockers)

### SEC-1 — suggestion (input-validation)
- **Finding:** `checkPlanMode` receives `tool_input.plan` but does not specify a type guard. A non-string value (array, object, number) could cause `.match()` or regex operations to throw, defeating fail-open guarantees.
- **Recommendation:** In `checkPlanMode`, type-check at entry: `if (typeof planText !== 'string') return { hasAdevInvocation: false, advisoryMessage: <template> }`. Document in the behavioral contract.

### SEC-2 — suggestion (data-exposure)
- **Finding:** If `advisoryMessage` were constructed by interpolating `planText`, a plan containing JSON control characters, ANSI escapes, or prompt-injection strings could be reflected back into the agent's context.
- **Recommendation:** Explicitly state in the behavioral contract that `advisoryMessage` is a static constant string with no interpolation of `planText`.

### SEC-3 — suggestion (input-validation)
- **Finding:** The regex `/\/adev:[a-z-]+/` has no length bound. Not ReDoS-vulnerable in itself, but an unbounded plan string would cause linear-time scanning on every plan-mode exit. Low priority in local threat model.
- **Recommendation:** Optionally cap `planText.length` (e.g., slice to 100KB) before regex matching.

## Consistency Analyzer

**Verdict:** BLOCK (1 blocker, 1 warning, 3 suggestions)

### CON-1 — **BLOCKER** (contract)
- **This Spec:** Behaviors #4 — adapter emits `hookSpecificOutput.additionalContext` JSON on **stdout**.
- **Conflicts With:** Parent charter `hooks` rev 3 — Hook Inventory row and Capability: Plan Mode Guard scope bullet both state the advisory is emitted **"to stderr"** ("emits to stderr suggesting the agent rewrite the plan").
- **Recommendation:** The **charter should change**. The `hookSpecificOutput.additionalContext` pattern is the Claude Code PreToolUse contract for injecting advisory context back into the agent loop; stderr would be invisible to the model and defeat the capability's stated intent. Bump charter to rev 4 and rewrite both the Hook Inventory description and the scope bullet to say "emits advisory via `hookSpecificOutput.additionalContext` JSON on stdout, exit 0". The spec is on the correct side of this contract; the charter is the outlier.

### CON-2 — warning (contract)
- **This Spec:** Touchpoints lists 7 files, adding `lib/plan-mode-check.mjs`, `hooks/plan-mode-guard.mjs`, and `tests/plan-mode-check.test.mjs` on top of the 4 charter-approved files.
- **Conflicts With:** `hooks` charter rev 3 Touchpoints table (4 rows: `plan-mode-guard.sh`, `hooks.json`, `using-adev/SKILL.md`, `plan-mode-guard.test.mjs`).
- **Recommendation:** Structural refinement (three-layer split for harness-agnostic reuse) is sound but expands the charter's approved scope. **Charter should change:** add the three files to Touchpoints, note the three-layer architecture in the Scope bullets, and bump to rev 4.

### CON-3 — suggestion (naming)
- **Finding:** Naming is fully compliant with CLAUDE.md (camelCase functions, kebab-case files). Minor nit: `plan-mode-check.mjs` (lib) vs `plan-mode-guard.mjs` (hook adapter) uses two different nouns (`check` vs `guard`) for related files.
- **Recommendation:** Non-blocking. Keep as-is; the spec documents that "check" is the pure predicate and "guard" is the hook enforcement layer.

### CON-4 — suggestion (terminology)
- **Finding:** Charter frontmatter says `revision: 3` but the capability subsection header still says "Capability: Plan Mode Guard (Revision 2)".
- **Recommendation:** Fix the stale header in the charter as part of the rev 4 bump.

### CON-5 — suggestion (terminology)
- **Finding:** Minor header naming drift ("Touchpoints" / "Change type"). Not flagged as actionable.
- **Recommendation:** No action; corpus-wide terminology sweep belongs in a separate hygiene pass.

## Domain Specialists

None dispatched — `specialists: []` in `manifest.yaml`.

---

## Summary

**Total findings:** 10 (1 blocker, 1 warning, 8 suggestions)

**Action required:** Fix the `hooks` charter (revision 3 → revision 4) to reconcile with the spec's correct architecture:

1. **CON-1 fix:** Update Hook Inventory row + Capability scope bullet to say the advisory is emitted as `hookSpecificOutput.additionalContext` JSON on stdout, not stderr. This is a factual correction — the stderr language was aspirational ("Approach B: advisory"); the correct implementation mechanism (matching `context-preflight.sh`) uses stdout JSON.

2. **CON-2 fix:** Expand the charter Touchpoints table to include the three additional files from the three-layer architecture: `lib/plan-mode-check.mjs` (new), `hooks/plan-mode-guard.mjs` (new), `tests/plan-mode-check.test.mjs` (new). Add a note about the three-layer split in Scope.

3. **CON-4 fix:** Update the "Capability: Plan Mode Guard (Revision 2)" section header to drop the stale label (or change to Revision 3/4).

After the charter is fixed and bumped to revision 4, update this spec's `charter-revision` field from 3 to 4 and re-run `/adev:review-specs --spec .context-index/specs/features/hooks/plan-mode-guard.md`.

The structural and security reviewers also noted three polish-level suggestions each; these are worth addressing in the re-review pass but are not blocking.
