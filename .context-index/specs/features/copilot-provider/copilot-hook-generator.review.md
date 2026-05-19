---
spec: .context-index/specs/features/copilot-provider/copilot-hook-generator.spec.md
charter: .context-index/specs/features/copilot-provider/charter.md
date: 2026-05-19
verdict: PASS_WITH_NOTES
last-reviewed-revision: 1
file-sha: b1fd1e733325ab46d3f0936d811328e967d9cebac5f03ed14cf182cefb059b8d
---

# Architecture Review: copilot-hook-generator

> **Date:** 2026-05-19
> **Spec:** `.context-index/specs/features/copilot-provider/copilot-hook-generator.spec.md`
> **Charter:** `.context-index/specs/features/copilot-provider/charter.md`
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1 (warning) — Behaviors §2 (event vocabulary list):** `Notification` canonical entry mapping is ambiguous. Task-map row says `Notification → errorOccurred-or-skip per Cloud-Agent rule`; Behavior §5 forbids emitting `notification`/`permissionRequest`. Spec must disambiguate whether `Notification` translates to `errorOccurred` or is dropped. Two implementations could pass the drift test with divergent output.
  - **Recommendation:** Add a Behavior clause that explicitly states the canonical→Copilot mapping for `Notification`, or model `cloudAgentSafe: false` as a drop-rather-than-translate flag.
- **SA-2 (warning) — Behaviors §2 + Postconditions (data flow ambiguity):** `cwd: "."` is hardcoded; `env` is "carried forward"; `timeoutSec` is "carried forward or defaulted to 30." Sources are not uniformly defined. Add a per-field source table (canonical | translation-table | hardcoded-default).
- **SA-3 (suggestion) — Behaviors §5 + Acceptance Criteria:** Cloud-Agent safety beyond emitted keys (e.g., runtime `permissionDecision: "ask"`) is out of scope for the generator; clarify the boundary.
- **SA-4 (suggestion) — Error Cases table:** Reconcile `DUPLICATE_EVENT_MAPPING` thrown "at module load time" with exit-code-1 semantics. Module-load throws surface as uncaught exceptions inside `import`, not normal CLI exits. Specify whether the check runs in the generator entrypoint (catchable, exits 1) or in the table module (uncatchable).
- **SA-5 (suggestion) — Module Boundaries:** `lib/providers/copilot/` and `scripts/` are not listed in the constitution's Context Routing table. Non-blocking; flag for hygiene.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- **SEC-3 (warning) — input-validation:** Drift-test error fidelity. If `tests/copilot-hooks-sync.test.mjs` wraps the in-memory generator run in a permissive try/catch, an `UNKNOWN_EVENT` or `UNMAPPED_TOOL_NAME` throw could be silently coerced or masked. Spec also does not require the test to fail when canonical `hooks/hooks.json` is missing.
  - **Recommendation:** Add an acceptance criterion: drift test MUST (a) let generator exceptions propagate unmodified, (b) assert canonical existence before comparison, (c) include a fixture-driven unit test that injects drift and asserts the failure + hint message.
- **SEC-1 (suggestion) — input-validation:** Specify tokenization rules for matcher rewrite — word-boundary (`\b`) anchors, longest-match-first ordering (so `MultiEdit` is not misrewritten as `Multiedit`), and a matcher size cap (e.g., 1 KB). Add a unit test for the `MultiEdit`/`Edit` overlap.
- **SEC-2 (suggestion) — input-validation:** Add an explicit Postcondition that the output path is constant relative to project root (no CLI override) and that the generator `path.resolve()`s and asserts `startsWith(projectRoot + path.sep)` before writing.
- **SEC-4 (suggestion) — data-exposure:** Prefer repo-relative paths in error messages; reserve absolute paths for `MISSING_CANONICAL` only, where they aid debugging.
- **SEC-5 (suggestion) — input-validation:** JS object literals silently discard duplicate keys. Require the translation table be authored as an array of `[claudeEvent, mapping]` pairs (or a `Map`) and validate via a `Set`-based duplicate check at module load.

**Explicitly NOT flagged:** No auth/authz surface; no secrets/credentials; no rate-limiting concern; no runtime injection vector into Copilot CLI.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1 (warning) — contract / domain-model:** `Notification → errorOccurred` mapping is not justified by the research artifact. `errorOccurred` fires on errors; Copilot's `notification` fires for user-facing notifications. The two events have distinct semantics. Either document the substitution rationale or map `Notification → notification` and rely on Cloud-Agent-safety drop.
- **CON-2 (warning) — terminology / contract:** Behaviors 3 and 4 mix "throws … to stderr" (JS exception) with "exits with code `1`" (process behavior). A thrown unhandled exception exits with code 1 by default, but the spec should clarify whether the implementation `throw`s and crashes or catches and calls `process.exit(1)` after writing the message to stderr.
- **CON-5 (warning) — contract / domain-model:** Spec adds `MultiEdit → edit` to the tool-name mapping; charter Domain Model (line 67) does not list `MultiEdit`. Update charter to mirror the spec's enrichment so the entity description matches the behavioral contract.
- **CON-3 (suggestion) — pattern:** Drift-test hint message format matches cursor-provider precedent. No action.
- **CON-4 (suggestion) — naming:** Spec breaks the translation table out into `lib/providers/copilot/event-table.mjs`. Cursor-provider folds the table into its `build-cursor-hooks.mjs`. Either refactor cursor for symmetry or document the deliberate structural improvement.
- **CON-6 (suggestion) — pattern:** Verify `providers/cursor/hooks.json` already uses two-space indent + sorted keys + trailing newline (the spec's stated determinism). Align if divergent.
- **CON-7 (suggestion) — contract:** Articulate the "drop vs translate" rule explicitly. Define `cloudAgentSafe: false` in the event-table data model as producing skip semantics. Add an acceptance criterion that the committed output contains zero entries for any `cloudAgentSafe: false` event.
- **CON-8 (suggestion) — terminology:** Use "Claude Code event" / "Claude Code tool name" at first reference per section for consistency with research and constitution.
- **CON-9 (suggestion) — contract:** Confirm the module-load-time duplicate check is in v1 scope; if so, add a task or acceptance criterion for it.
- **CON-10 (suggestion) — pattern:** Spec is silent on commit trailers. Implementation guidance is enforced by `/adev:implement`; no spec change needed.

---

## Summary

**Total findings:** 20 (0 blockers, 6 warnings, 14 suggestions)
**Action required:** The spec passes review with notes. The most material warnings are CON-1 (Notification mapping rationale), SA-1 / CON-7 (drop-vs-translate rule for Cloud-Agent-unsafe events), and SEC-3 (drift-test error fidelity). The user may proceed to `/adev:plan` or revise the spec to address the warnings first. Suggestions are advisory.

**Recommended quick fixes before planning:**
1. Disambiguate `Notification → errorOccurred` vs drop (CON-1, SA-1, CON-7) — add a `cloudAgentSafe: false` drop semantic and a Behavior clause stating the rule.
2. Tighten drift-test acceptance criteria to require unmodified exception propagation + canonical-existence check + fixture-driven drift test (SEC-3).
3. Update charter Domain Model to list `MultiEdit → edit` (CON-5).
4. Resolve `DUPLICATE_EVENT_MAPPING` throw-vs-exit semantics (SA-4, SEC-5) by specifying array/Map authoring + entrypoint validation.

These are 30-minute revisions; none block `/adev:plan`.
