# Architecture Review: prototype-core

> **Date:** 2026-05-08
> **Spec:** .context-index/specs/features/prototype-brainstorm/prototype-core.spec.md
> **Charter:** .context-index/specs/features/prototype-brainstorm/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 3
> **file-sha:** cd0ffaf181a005b4101b910753deb98ce92d978f

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-capable (reasoning tier) | bundled |
| security-reviewer | Security Reviewer | subagent | reviewer-capable (capable tier) | bundled |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-capable (capable tier) | bundled |

## Structural Architect (structural-architect)

**Verdict:** PASS

All prior findings (CON-3 blocker, SA-1/SA-2/SA-4/SA-5/SA-6/SA-7/SA-8 warnings, SEC-3/SEC-4/SEC-9 warnings) confirmed as adequately resolved.

- **SA-1** (suggestion, completeness): Behavior 7 double-encode check (`%` after URL decode) may reject legitimate filenames containing percent characters (e.g., `50%off.html`). **Recommendation:** Add note that prototype filenames must not contain percent characters, or narrow check to `%[0-9A-Fa-f]{2}` patterns.

- **SA-2** (suggestion, completeness): Behavior 10 "clears all files" does not address subdirectories. Functional-tier prototypes may generate nested structures (components/, assets/). **Recommendation:** Clarify "clears all files and subdirectories" or "recursively empties the temp directory."

- **SA-3** (suggestion, cross-spec): Residual inconsistency — standalone-invocation error table says INVALID_TIER "re-prompt" for CLI argument, but prototype-core explicitly says "do not re-prompt" for the CLI case. **Recommendation:** Align standalone-invocation error table.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

Prior fixes verified: SEC-3 (realpathSync — adequate), SEC-4 (double-encode rejection — adequate), SEC-5 (normalized error messages — adequate), SEC-6 (dotfile rejection — adequate), SEC-7 (module re-validation — adequate), SEC-9 (explicit 127.0.0.1 — adequate).

### New findings from fixes

- **SEC-10** (warning, info-disclosure): `fs.realpathSync` throws ENOENT for non-existent paths. Behavior 7 does not specify how this exception is handled — could expose stack traces or crash the server. **Recommendation:** Add: "If `fs.realpathSync` throws ENOENT, the server responds with HTTP 404 and a generic body — no stack trace or path information."

- **SEC-11** (warning, network): `image/svg+xml` added to MIME allowlist, but SVG can contain embedded JavaScript (`<script>` elements). Browser receiving `Content-Type: image/svg+xml` from localhost will execute scripts. Low real-world risk for agent-generated localhost prototype. **Recommendation:** Either add a `Content-Security-Policy` header, document as accepted risk, or remove SVG from allowlist and serve as attachment.

- **SEC-12** (warning, path-traversal): Behavior 7 validation steps have no defined order. Double-encode check must run *before* `fs.realpathSync` to prevent filesystem access with encoded paths. **Recommendation:** Add explicit ordered pipeline: (1) URL-decode, (2) reject if `%` present, (3) resolve path, (4) realpathSync, (5) startsWith comparison, (6) dotfile check.

### Carried accepted risks

- **SEC-1** (warning, resource-exhaustion): No maximum served file size. Accepted risk for localhost.
- **SEC-2** (warning, resource-exhaustion): Port range 3210-3219 shared across concurrent invocations. Accepted risk.
- **SEC-8** (suggestion, resource-exhaustion): Feedback loop has no iteration limit. Accepted risk for interactive use.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

All prior findings verified as resolved: CON-3 (blocker — iteration counter, now in B10), CON-1 (svelte in domain model), CON-2 (html sentinel clarified), CON-4 (INVALID_TIER split), CON-5 (brainstorm-integration cross-ref), CON-6 (built-in module list), CON-7 (screenshot annotated Phase 2), CON-8 (server active during prompt), CON-9 (clean-slate regen), CON-10 (heuristics surfacing added as B1).

### New findings

- **CON-A** (warning, cross-spec): Heuristics load failure behavior conflicts. prototype-core B1 says "proceeds silently" but brainstorm-integration error table HEURISTIC_LOAD_ERROR says "Warning logged." **Recommendation:** Align — either both log a warning or both proceed silently.

- **CON-B** (warning, domain-model): `iteration_number` initial value semantics ambiguous. B10 says "initial generation counts as iteration 1" — so `iteration_count = 1` even with zero feedback rounds. standalone-invocation B8 outputs `iteration_count` which users would interpret as "number of feedback rounds." **Recommendation:** Clarify whether iteration_count counts generation events (initial=1) or feedback rounds (initial=0).

- **CON-C** (warning, cross-spec): Charter quality attribute says "Server uses only Node.js `http` and `fs` built-ins" but spec now correctly lists `http`, `fs`, `path`, `os`. Charter is stale. **Recommendation:** Update charter Quality Attributes and Dependencies table to include `path` and `os`.

- **CON-D** (warning, cross-spec): standalone-invocation error table INVALID_TIER row says "re-prompt" but prototype-core explicitly says "do not re-prompt" for CLI arguments. standalone-invocation B5 itself doesn't say re-prompt. **Recommendation:** Update standalone-invocation error table to "do not re-prompt."

- **CON-E** (suggestion, coverage): B10 asserts "HTTP server serves updated files (no restart needed)" but no acceptance criterion covers it. **Recommendation:** Add AC for no-restart regeneration.

- **CON-F** (suggestion, terminology): "feedback loop," "prototype loop," and "prototype session" still used interchangeably (unresolved from prior CON-11). **Recommendation:** Standardize on "prototype session" (outer) and "feedback loop" (inner).

- **CON-G** (suggestion, cross-spec): visual_references empty array vs null/absent still not explicitly stated (unresolved from prior CON-12). **Recommendation:** Add explicit note in brainstorm-integration B4 or visual-reference-capture B9.

---

## Summary

**Total findings:** 16 (0 blockers, 9 warnings, 7 suggestions)
**Prior blocker CON-3:** RESOLVED — iteration counter now defined in Behavior 10.
**New warnings:** SEC-10 (realpathSync ENOENT handling), SEC-11 (SVG script execution), SEC-12 (validation pipeline order), CON-A (heuristics failure behavior), CON-B (iteration semantics), CON-C (charter stale), CON-D (INVALID_TIER re-prompt). SEC-1/SEC-2 carried as accepted risks.
**Action required:** None blocking. Warnings are documentation improvements addressable during planning or implementation. SEC-12 (validation ordering) is the highest-priority warning — recommend addressing before implementation to prevent subtle security bugs.
