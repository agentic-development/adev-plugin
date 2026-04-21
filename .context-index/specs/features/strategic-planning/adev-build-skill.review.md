# Architecture Review: adev-build-skill

> **Date:** 2026-04-21
> **Spec:** .context-index/specs/features/strategic-planning/adev-build-skill.md
> **Charter:** .context-index/specs/features/strategic-planning/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 3

## Reviewers Dispatched

| ID | Name | Mode | Tier |
|----|------|------|------|
| structural-architect | Structural Architect | subagent | reasoning |
| security-reviewer | Security Reviewer | subagent | capable |
| consistency-analyzer | Consistency Analyzer | subagent | capable |

## Structural Architect

**Verdict:** PASS_WITH_NOTES

### Findings

- **SA-1 (warning):** Pipeline order mismatch between charter and spec. Charter In Scope and Capability Map say "review → route → plan → implement → validate". Spec Behavior 1 and SKILL.md say "review → plan → route → implement → validate". The spec is correct — route operates on a plan file and must come after plan. The charter ordering is stale and should be updated. Spec is internally consistent; this is a charter maintenance issue, not a spec defect.

- **SA-2 (warning):** Behavior 8 route skip condition is vague. Says "When routing is available" without defining what "available" means. SKILL.md is precise: route is skipped when `--no-route` flag is set. Behavior 8 should be rewritten to match.

- **SA-3 (warning):** `--from <step>` flag is fully specified in SKILL.md but absent from spec behaviors and error cases table.

- **SA-4 (warning):** `--no-route` flag is fully specified in SKILL.md but absent from spec behaviors. Only indirectly referenced via the vague Behavior 8.

- **SA-5 (warning):** `resolveWorkspaceContext` API call in SKILL.md uses wrong argument order — `(workspaceRoot, null)` but actual signature is `(workspaceRoot, config, currentRepoSlug)`. This is a SKILL.md implementation issue, not a spec defect.

- **SA-6 (warning):** Validate FAIL semantics create an exception to Behavior 3 ("any step fails → build stops") and the charter invariant ("must stop on failure"). The spec should explicitly note that validate is informational-only when retries are disabled.

- **SA-7 (suggestion):** Build state format section lacks retry_cycles and retry_history fields shown in the SKILL.md's retry state section.

- **SA-8 (suggestion):** Workspace-mode build behaviors are absent from this spec (covered by separate workspace-aware-build.md). A cross-reference would help reviewers assess SKILL.md completeness.

- **SA-9 (suggestion):** No behavior defined for concurrent `--spec` and `--phase` flags.

- **SA-10 (suggestion):** Dry-run behavior (Behavior 5) doesn't explicitly mention retry policy display, but AC-26 requires it.

- **SA-11 (suggestion):** Source manifest is consumed by the validate step context but not listed in consumed interfaces.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

### Findings

- **SEC-1 (warning):** Build state slug derived from spec filename without documented sanitization. A `--spec` path containing `../` could produce a slug that writes outside `.context-index/build-state/`. The slug algorithm should be documented (basename-only, alphanumeric + hyphens).

- **SEC-2 (warning):** RETRY_CONTEXT prompt block includes failure details from validation report files without sanitization. Content resembling skill instructions could influence subagent behavior (prompt injection via artifact). Recommend wrapping extracted content in code-fenced blocks.

- **SEC-3 (warning):** Step context fields (review_notes, route_annotations) have no length bounds. A large `.review.md` could consume subagent context window. Recommend truncation rule (e.g., 500 chars).

- **SEC-4 (warning):** `--phase <name>` value is interpolated into messages and build state JSON without validation. Should be restricted to safe identifier characters.

- **SEC-5 (suggestion):** Build state resume trusts the stored `spec` path without re-validating containment within the project tree.

- **SEC-6 (suggestion):** `context: fork` isolation is behavioral (harness convention), not a hard sandbox. Spec should acknowledge this trust boundary.

- **SEC-7 (suggestion):** Workspace cycle detection falls back to declaration order silently. Spec error cases should document this.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

### Findings

- **CON-1 (warning):** Pipeline order mismatch between charter and spec (same as SA-1). Charter has route before plan; spec and SKILL.md have plan before route. Charter is stale.

- **CON-2 (warning):** AC-26 says "shows retry policy from manifest" but the retry policy comes from `user-config`, not manifest. Every other spec reference correctly says user-config. This is a typo.

- **CON-3 (warning):** Behavior 8 route skip condition contradicts Step 3 skip condition (same as SA-2). Behavior 8 implies plan-availability gating; Step 3 uses `--no-route` flag gating.

- **CON-4 (warning):** Error cases table missing retry-specific failure modes (no-progress, regression, budget exhaustion). These are covered by behaviors 16-18 and AC-21/22/23 but absent from the error table.

- **CON-5 (warning):** Build state schema example omits the route step. SKILL.md shows all 5 steps.

- **CON-6 (warning):** `--from` flag error case absent from spec error cases table (same as SA-3).

- **CON-7 (suggestion):** `parseUserConfig()` returns a plain object, not `{ config, warnings }`. Warnings from config parsing are not propagated.

---

## Summary

**Total findings:** 25 (0 blockers, 15 warnings, 10 suggestions)
**Verdict: PASS_WITH_NOTES**

The spec is well-structured with strong coverage of the subagent dispatch model, context packet assembly, retry loop mechanics, and build state persistence. The architectural approach (Agent tool dispatch → Skill tool invocation → STEP_RESULT contract) is sound and addresses the original issue-124 root cause.

**Key items to address before planning:**

1. **Charter stale ordering** (SA-1/CON-1): Update charter In Scope and Capability Map to say "review → plan → route" (plan before route)
2. **AC-26 typo** (CON-2): Change "from manifest" to "from user-config"
3. **Behavior 8 rewrite** (SA-2/CON-3): Replace vague "routing is available" with "--no-route flag is not set"
4. **Error cases table gaps** (CON-4/CON-6): Add retry stop conditions and --from validation error
5. **Build state schema** (CON-5): Add route step to example
6. **Security hardening** (SEC-1/SEC-3): Document slug sanitization algorithm, add truncation bounds for context fields
