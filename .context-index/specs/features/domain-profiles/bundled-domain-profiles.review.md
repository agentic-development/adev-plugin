# Architecture Review: bundled-domain-profiles

> **Date:** 2026-05-08
> **Spec:** .context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md
> **Charter:** .context-index/specs/features/domain-profiles/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 3
> **file-sha:** 526cef77374859fe8f596c037e675de7d23d0b4c

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS

- **SA-1 (suggestion):** Charter Capability Map assigns different priorities to the two bundled profiles (Should-have vs. Nice-to-have) but the spec treats them symmetrically. If process-automation is deferred, Behavior 11 ("exactly five files" for both) would need a phase guard.
- **SA-2 (suggestion):** Both profiles use `tool: none`, meaning the `tool` field with a non-none MCP server name is untested by any bundled profile. Ensure integration tests cover a non-none tool value via test fixtures.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

- **SEC-1 (suggestion):** `pluginRoot` resolved via `fs.realpathSync()` may interact with `npm link` during development — a linked install could resolve to the developer's source tree. Document that `pluginRoot` passed to `loadOverlay()` must already be resolved at the call site.
- **SEC-2 (suggestion):** Empty `domain:` value in charter frontmatter must be checked before regex validation in `resolveDomain()` to avoid false `INVALID_DOMAIN_NAME` on empty string. Ensure ordering in the resolution spec.
- **SEC-3 (suggestion):** `loadOverlay()` does not explicitly guard against `domain: "software"` — it relies on callers never passing it. Consider adding an explicit guard for defense-in-depth.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1 (warning):** Bundled reviewer entries (Behaviors 3, 8) specify `id` and `merge_strategy: append` but are silent on whether optional fields (`dispatch`, `profile`, `severity_cap`, `context_pack`) are explicitly set or inherit defaults. Add a clarifying sentence referencing domain-aware-skill-integration.spec.md Behavior 6 for default inheritance.

---

## Summary

**Total findings:** 6 (0 blockers, 1 warning, 5 suggestions)
**Action required:** The warning (CON-1) is a minor clarification. You can proceed to `/adev:plan`.
