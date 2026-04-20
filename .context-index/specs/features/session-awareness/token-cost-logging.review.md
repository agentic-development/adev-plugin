# Architecture Review: token-cost-logging

> **Date:** 2026-04-20
> **Spec:** .context-index/specs/features/session-awareness/token-cost-logging.md
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2
> **file-sha:** 0289cdb45dd217c5bf8fee86f12e606ae28048bc

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS

All previous findings (SA-1 through SA-5) resolved in revision 2.

- **SA-6** | suggestion | **Location Resolution** — The scan strategy references a hardcoded path (`~/.claude/projects/`). CLAUDE.md anti-patterns state "No hardcoded paths to `~/.claude/`." The spec should note this as an accepted exception since it reads Claude Code's own data, not plugin data.

- **SA-7** | suggestion | **Cursor File section** — The cursor file path `.token-cursor.json` is mentioned but its full path (`.context-index/.token-cursor.json`) could be stated more consistently across sections. The gitignore section uses the full path but the Cursor File header does not.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

All previous findings (SEC-1 through SEC-4) resolved in revision 2. No new findings.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

All previous findings (CON-1 through CON-6) resolved in revision 2:

- CON-3 (blocker): Cursor file separation now explicitly justified — session-scoped byte-offset cache vs plan-scoped execution state. Different lifecycles, different consumers.
- CON-1/4 (warnings): Session-log-schema update now a formal co-requirement in task map.
- CON-2 (suggestion): Model ID handling clarified — hook-internal data extraction, not skill-level dispatch.
- CON-5 (suggestion): Terminology consistent across behaviors.
- CON-6 (suggestion): Delta rationale explicitly documented.

No new findings.

---

## Revision History

### Revision 1 → BLOCK (15 findings: 1 blocker, 7 warnings, 7 suggestions)

All findings resolved in revision 2:
- CON-3 (blocker): Added cursor file justification separating it from execution state
- SA-1: Defined precise resolution contract (Input/Output/Failure mode)
- SA-2: Added `last_offset > file_size` to Behavior 4 triggers
- SA-4: Specified `format_warning_emitted` in cursor file for warning dedup
- SEC-1: Added Gitignore Requirements section covering both files
- SEC-2: Added 50 MB file size cap in resolution steps and error cases
- CON-1/4: Made session-log-schema update a co-requirement
- CON-2: Clarified hook-internal model ID extraction vs Model Routing
- CON-6: Added delta rationale in Behavior 3
- SEC-3: Specified generic stderr messages (no paths)
- SEC-4: Noted price table is static/read-only, no credentials

### Revision 2 → PASS_WITH_NOTES (2 suggestions)

## Summary

**Total findings:** 2 (0 blockers, 0 warnings, 2 suggestions)
**Action required:** None — suggestions are minor and can be addressed during implementation. The spec is ready for planning.
