# Architecture Review: extension-core

> **Date:** 2026-05-11
> **Spec:** .context-index/specs/features/extensions/extension-core.spec.md
> **Charter:** .context-index/specs/features/extensions/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2
> **file-sha:** f2dd731eabf920b385091152a134e45fb4bd4bec

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1** | `warning` | Behavior 1: URI classification rule (c) is a catch-all ("otherwise → npm"), making the fallthrough error condition unreachable. The actual validation happens in Behavior 3 (npm name pattern). **Recommendation:** Remove the unreachable error sentence from Behavior 1, or reword to clarify that invalid npm names fail at Behavior 3.

- **SA-2** | `warning` | Behavior 8, Charter interfaces: Ownership of `installExtension()` across module boundaries is ambiguous. It's unclear whether this module owns the function and delegates to sibling modules, or whether it's a shared orchestrator. **Recommendation:** State explicitly that extension-core owns `installExtension()` and delegates content operations to content-installation and registration to cli-and-registration.

- **SA-3** | `suggestion` | Behavior 5: The `provides` field is validated but no behavior in this spec consumes it. Sibling specs reference `provides.domain-profile`, `provides.governance`, etc. **Recommendation:** Note that `provides` is consumed by content-installation and cli-and-registration specs.

- **SA-4** | `suggestion` | Behavior 8: Credential stripping is specified but silent vs. warning behavior is not stated. **Recommendation:** Add one sentence clarifying stripping is silent.

- **SA-5** | `warning` | Behavior 9: Re-install "updates existing entry" but doesn't describe content-layer behavior. **Consolidation note:** Content-installation Behavior 4 (overwrite domain profiles), governance merge (project-wins is inherently idempotent), and cli-and-registration Behavior 3 (update in place) collectively define re-install content semantics. This is correct module separation, but the orchestration flow could be stated more explicitly. **Recommendation:** Add a note that re-install delegates to sibling specs for content operations.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

Previous blockers (SEC-1: command injection, SEC-2: path traversal) confirmed fixed in rev 2. No new blockers.

- **SEC-1** | `warning` | Behavior 3: No URI length cap before regex evaluation. Pathologically long strings reach spawn argument construction. **Recommendation:** Add maximum URI length cap (e.g., 2048 characters) checked before classification.

- **SEC-2** | `warning` | Error Cases: `SOURCE_RESOLUTION` errors include raw npm/git stderr which may contain credential-bearing URIs. Credential stripping (Behavior 8) only applies to the stored `source_uri`. **Recommendation:** Apply URI sanitization to error messages as well.

- **SEC-3** | `suggestion` | Behavior 2: Local path resolution scope (within project or unrestricted) is not stated. Given the threat model (local user with filesystem access), unrestricted is reasonable but should be documented.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1** | `suggestion` | Charter ExtensionStamp entity does not document credential stripping — spec is more precise. **Recommendation:** Consider updating charter for completeness.

- **CON-2** | `suggestion` | Tilde expansion (`~/path`) not addressed in URI classification rules. Shell typically expands `~` before the CLI receives it, so this is a non-issue for CLI invocation. **Recommendation:** Add a note that tilde expansion is the shell's responsibility.

- **CON-3** | `warning` | `requires` object optionality is unclear between charter and spec. **Recommendation:** Clarify in charter whether `requires` is optional (it is, per Behavior 7).

---

## Summary

**Total findings:** 10 (0 blockers, 5 warnings, 5 suggestions)
**Action required:** No blockers. Warnings are advisory — the spec can proceed to planning. Consider addressing SA-1 (unreachable error), SA-2 (ownership clarity), and SEC-1/SEC-2 (URI length cap, error message sanitization) before implementation.
