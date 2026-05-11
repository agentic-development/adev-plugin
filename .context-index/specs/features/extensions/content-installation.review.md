# Architecture Review: content-installation

> **Date:** 2026-05-11
> **Spec:** .context-index/specs/features/extensions/content-installation.spec.md
> **Charter:** .context-index/specs/features/extensions/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2
> **file-sha:** 976fc8e3f87623ce7d7fba505dc5248d0ba6fa4f

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1** | `suggestion` | Behavior 8: Path containment logic is independently specified here (for samples) and in cli-and-registration (for skills/hooks). Both are correct but could reference a shared utility. **Recommendation:** Consider extracting a shared `assertContainedPath` reference, or note both specs apply the same invariant.

- **SA-2** | `warning` | Behavior 5: The spec lists three governance target files but does not specify how extension manifest entries route to each file. The `provides.governance` shape (flat list with routing key, or per-file map) is unspecified. **Recommendation:** Define the manifest shape for `provides.governance` — either a map keyed by target filename or entries with a `target` field.

- **SA-3** | `warning` | Behaviors 1 vs 10: Domain profiles are installed directly by this spec while skills delegate to cli-and-registration. The mixed responsibility is intentional (domains are content, skills need provider registration) but should be documented. **Recommendation:** Add a note clarifying the delegation rationale.

- **SA-4** | `suggestion` | Behavior 9: Bundled skill name list source not defined. Domain profiles reference `BUNDLED_DOMAIN_NAMES` explicitly. **Recommendation:** Add `BUNDLED_SKILL_NAMES` from a constants module to preconditions.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

Previous blockers (SEC-2: sample path traversal, SEC-3: governance schema) confirmed fixed in rev 2. No new blockers.

- **SEC-1** | `warning` | Behavior 1: The `extends: <parent>` value in generated `domain.yaml` is taken from the extension manifest without validation. A malicious value could cause resolution errors at runtime. **Recommendation:** Validate `extends` value against the same kebab-case regex (`^[a-z][a-z0-9-]*$`) during install.

- **SEC-2** | `warning` | Behavior 5: Governance entry `id` character set is not restricted beyond length. Special YAML characters in `id` could produce malformed files on round-trip write. **Recommendation:** Restrict `id` to `^[a-zA-Z0-9._-]+$`.

- **SEC-3** | `suggestion` | Postconditions: Install report may expose governance field values. **Recommendation:** Limit report to file paths and operation types.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

- **CON-1** | `suggestion` | Behavior 7: "Extension values only fill in fields not already set" was flagged as contradicting ADR-0003, but this IS the correct per-field merge semantics. ADR-0003 says "field-overridden (project wins)" — meaning per-field, project values take precedence, extension fills gaps. No contradiction.

- **CON-2** | `suggestion` | Behavior 1: Lists "all provided files" but could explicitly enumerate all 7 domain profile files for completeness. The 7 files are already listed in the parenthetical.

- **CON-3** | `suggestion` | Behavior 9: Bundled skill name source should be explicit (mirrors SA-4).

---

## Summary

**Total findings:** 9 (0 blockers, 4 warnings, 5 suggestions)
**Action required:** No blockers. Warnings are advisory — the spec can proceed to planning. Consider addressing SA-2 (governance routing), SEC-1 (extends validation), and SEC-2 (id character set) before implementation.
