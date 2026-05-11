# Architecture Review: cli-and-registration

> **Date:** 2026-05-11
> **Spec:** .context-index/specs/features/extensions/cli-and-registration.spec.md
> **Charter:** .context-index/specs/features/extensions/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2
> **file-sha:** dc6091a0f27fa7a316888744d6df21c0d6c3a46c

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1** | `warning` | Behavior 2: Hook commands registered with absolute paths are not portable across machines or worktrees. **Recommendation:** Define whether paths are absolute or relative-to-plugin-root, and specify re-resolution if absolute.

- **SA-2** | `warning` | Behavior 5, 9: Provider detection checks directory existence only. A stale directory without valid config creates phantom registrations. **Recommendation:** Require stronger provider-active signal (e.g., config file presence).

- **SA-3** | `suggestion` | Behavior 3: Dedup key appears to be event/name alone. A single extension with multiple hooks for the same event would lose entries. **Recommendation:** Clarify dedup key is `(extension-name, event)` or `(extension-name, skill-name)`.

- **SA-4** | `warning` | Behavior 2: Hook `event` field values are not validated against a safe character pattern. Path containment (Behavior 2b) catches traversal attempts, but defense-in-depth recommends validating `event` at schema level. **Recommendation:** Validate `event` against `^[a-zA-Z0-9_-]+$` in extension-core manifest validation or in this spec's preconditions.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

Previous blocker (SEC-1: hook command path traversal) confirmed fixed in rev 2. No new blockers.

- **SEC-1** | `warning` | Behavior 2: The `command` value written to hooks.json should be re-derived from the destination path, not taken from the extension manifest. **Recommendation:** Specify that `command` is the canonical absolute path to the installed copy.

- **SEC-2** | `warning` | Behavior 1: The `description` field from the extension manifest has no length cap or character restriction. Control characters could corrupt hooks.json. **Recommendation:** Enforce max length (e.g., 256 chars) and strip control characters. Ensure hooks.json is written via `JSON.stringify`.

- **SEC-3** | `suggestion` | Behavior 6: Install report may expose temp paths or system layout in CI logs. **Recommendation:** Display paths relative to projectRoot where possible.

- **SEC-4** | `suggestion` | Behavior 9: Provider detection scope should be explicitly limited to projectRoot (no parent traversal). **Recommendation:** Add acceptance criterion.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1** | `suggestion` | Error Cases: `WARN_NO_PROVIDER` uses a `WARN_` prefix not used by sibling specs. **Recommendation:** Rename to `NO_PROVIDER` or document `WARN_*` as a non-fatal code category.

- **CON-2** | `warning` | Behavior 5: Multi-provider partial failure semantics not defined. **Recommendation:** Document whether registration is best-effort or atomic.

- **CON-3** | `suggestion` | hooks.json schema (skills array shape, hooks array shape) is assumed but not documented in charter. **Recommendation:** Add schema to charter interface contracts.

> **Governance note:** This spec has `risk_level: low`. Per `governance/risk-policies.yaml`, low-risk specs do not require review. Review performed at user's explicit request via `--charter extensions`.

---

## Summary

**Total findings:** 11 (0 blockers, 6 warnings, 5 suggestions)
**Action required:** No blockers. Warnings are advisory — the spec can proceed to planning. Consider addressing SA-4/SEC-2 (field validation), SA-1 (path portability), and CON-2 (multi-provider semantics) before implementation.
