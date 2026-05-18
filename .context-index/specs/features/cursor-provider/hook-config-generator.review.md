---
last-reviewed-revision: 2
file-sha: 8cedb8288615aab5eee54605cc4e28c6d36dafa7926502b776979a99516508d5
---

# Architecture Review: hook-config-generator

> **Date:** 2026-05-17
> **Spec:** .context-index/specs/features/cursor-provider/hook-config-generator.spec.md
> **Charter:** .context-index/specs/features/cursor-provider/charter.md
> **Revision under review:** 2 (re-review after revision applied to rev 1 findings)
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS

Revision 2 resolves the rev 1 warning (SA-1) and suggestion (SA-2).

- **SA-1 (rev 1, warning) — RESOLVED.** Rev 2 replaces the rejected `PreToolUse/Edit → beforeReadFile + afterFileEdit` fan-out with a direct mapping `PreToolUse/Edit → preToolUse(matcher: "Edit")`. The new "Hook Intent and Semantic Invariant" section classifies every existing hook as fail-closed (PreToolUse) or advisory (PostToolUse/Stop) and codifies the invariant: "every fail-closed Claude hook MUST map to a Cursor event that fires **before** the corresponding tool action." The "Earlier design rejected" callout documents why the rev 1 mapping was wrong (Principle 4 violation: post-write `afterFileEdit` cannot honor exit-2 deny from `lifecycle-gate-edit.sh`, `constitution-linter.sh`, `context-preflight.sh`). A new acceptance criterion enforces the invariant. Semantics are now correct end-to-end.

- **SA-2 (rev 1, suggestion) — RESOLVED.** Rev 2 adds explicit defaults for `failClosed` (true for the fail-closed intent class, false for advisory) and `timeout` (30s fail-closed, 60s advisory), sourced as named constants alongside the translation table. The "Per-entry defaults" subsection makes the sourcing rule unambiguous. A new acceptance criterion enforces both fields and their per-class defaults.

No new structural findings in rev 2.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

Revision 2 resolves the rev 1 suggestion (SEC-1).

- **SEC-1 (rev 1, suggestion) — RESOLVED.** Rev 2 adds two fail-loud failure modes:
  1. Generator throws `"Non-canonical hook command at <event>/<matcher>: <command>. Translation only supports the canonical bash-script form; new command shapes need explicit translation logic."` on any deviation from `bash "${CLAUDE_PLUGIN_ROOT}/hooks/<script>.sh"`.
  2. Generator additionally throws `"Hook script not found: hooks/<script>.sh referenced from <event>/<matcher>"` when a canonical-shaped command references a script missing on disk. This is a bonus defense beyond what SEC-1 asked for.

  A matching acceptance criterion ("The generator throws on any hook command that does not match the canonical `bash "${CLAUDE_PLUGIN_ROOT}/hooks/<script>.sh"` form (SEC-1)") is now present.

All other security dimensions remain N/A: build-time pure local file transform, no network, no untrusted input, no secrets, no auth. Risk level "low" remains appropriate.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

The rev 2 spec is internally consistent and complete. The translation table covers all 7 Claude event/matcher pairs in the canonical `hooks/hooks.json` (SessionStart, PreToolUse/Edit, PreToolUse/Bash, PostToolUse/Read, PostToolUse/Edit, PostToolUse/.*, Stop/.*). File names, npm script names, and module conventions remain consistent with the constitution and the parent charter. The new "Hook Intent and Semantic Invariant" section and the "Earlier design rejected" callout aid downstream readers without contradicting any other artifact.

One minor cross-artifact inconsistency:

- **ID:** CON-1
  - **Severity:** warning
  - **Location:** `.context-index/specs/features/cursor-provider/charter.md` — Domain Model → Relationships (line 64)
  - **Finding:** The parent charter still describes the relationship with the now-rejected mapping example: *"one Claude event may fan out to multiple Cursor events (e.g., `PreToolUse`/`Edit` → `beforeReadFile` + `afterFileEdit`)"*. The spec rev 2 replaces this exact mapping with a direct `preToolUse(matcher: "Edit")` (no fan-out), and rev 2's "Earlier design rejected" section explicitly disowns the charter's example. The Domain Model entity row for `HookEventTranslation` also keeps `failClosed?` / `timeout?` marked optional, while the spec now defines them as required per-entry defaults. These do not block implementation — the spec is authoritative for behavior — but a downstream reader of the charter will hit a contradiction.
  - **Recommendation:** Update the charter at next charter revision (already at charter-revision: 2; the spec frontmatter pins `charter-revision: 2` already so this is forward-looking, not blocking):
    1. Replace the fan-out example with the direct `preToolUse(matcher: "Edit")` mapping, or remove the parenthetical example entirely.
    2. Optionally promote `failClosed` and `timeout` from optional to required attributes on the `HookEventTranslation` entity row, matching the spec's new "Per-entry defaults" section.

No other consistency issues. The spec remains autonomous-lane (no protocol, install-path, or registration-format changes; no new dependencies). Acceptance criteria are well-formed and individually verifiable.

---

## Summary

**Total findings:** 1 (0 blockers, 1 warning, 0 suggestions)
**Prior findings resolution:** All three rev 1 findings (SA-1 warning, SA-2 suggestion, SEC-1 suggestion) are fully resolved by rev 2. The rev 1 warning was a Principle 4 (hook protocol compliance) semantic issue and is now correctly addressed by a direct pre-action mapping plus an explicit invariant section.
**New findings:** One new consistency warning (CON-1) flags a downstream charter contradiction; the spec itself is internally correct. CON-1 is non-blocking and addressable in a future charter revision.
**Action required:** Spec passes review with one note. Proceed to `/adev:plan --spec .context-index/specs/features/cursor-provider/hook-config-generator.spec.md`. Recommend folding the charter update for CON-1 into the next charter revision; not a planning blocker.
