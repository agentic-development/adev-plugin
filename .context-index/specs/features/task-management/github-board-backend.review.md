---
spec: .context-index/specs/features/task-management/github-board-backend.spec.md
charter: .context-index/specs/features/task-management/charter.md
verdict: PASS_WITH_NOTES
tier: full
date: 2026-11-26
last-reviewed-revision: 6
file-sha: ed7c4e39f36316254a472dc3e00f0bd575df60a1e59ad0a90016e33201a767a3
---

# Architecture Review: github-board-backend

> **Date:** 2026-11-26
> **Spec:** .context-index/specs/features/task-management/github-board-backend.spec.md (revision 6)
> **Charter:** .context-index/specs/features/task-management/charter.md (github capabilities introduced in charter revision 10)
> **Verdict:** PASS_WITH_NOTES
> **Rigor tier:** full (risk_level: high → `review_mode: full`)
> **Diff scope:** scoped (`diff-scoped`) against the committed revision 5.
> **Prior round:** revision 5 BLOCK on TR-1 (continuation-page bound). TR-1 is resolved: BEH-10 now bounds each sub-issue and blocked-by continuation on its own. The termination and referent-integrity reviewers both confirm it. The rev 6 Error Cases rows resolve CON-3 for the spec's own codes.
> **Registry warnings:** `BROADEN_TOOL` ×2 and `BROADEN_NETWORK` for profile `browser-review`. No dispatched reviewer uses that profile.
> **Dispatch note:** prompts were assembled by `node cli/index.mjs governance dispatch` (worktree CLI). Each prompt was delivered as a file that the reviewer read in full. Model tiers:
> - `capable` (Sonnet): consistency-analyzer, wiring-reviewer, boundary-reviewer.
> - `reasoning` (Opus): referent-integrity.
> - `fast` (Haiku): termination-reviewer.
> **Governance:** risk policy `high` sets `require_hitl_approval: true`. Maintainer decisions for revisions 5 and 6 were taken in conversation on 2026-11-26.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-capable | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | registry prompt (via `adev governance dispatch`); triggered, score 2 ≥ 1 |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk; still resolvable for any project whose materialized review.yaml already names it. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via adev extension install web-service) where it fits the artifact class. Prompt retained on disk. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1 (warning, BEH-30):** `.migrate-unanchored.json` and `MIGRATE_UNANCHORED_ITEM` are not in the amendment's BEH-5 pre-write order. Add them between steps 6 and 7. The fix belongs in the amendment (`external`, remedy: `backend-migration-rev-3-github-target.spec.md`). Also register the file in `lib/gitignore-paths.mjs`.
- **CON-2 (warning, BEH-38):** the amendment's codes are not in this spec's Error Cases table, so the docs test does not see them. The codes are `MIGRATE_RESUME_*`, `MIGRATE_TARGET_FOREIGN_LEGACY_ID`, `MIGRATE_SENTINEL_PROJECT_MISMATCH`, `MIGRATE_GITHUB_UNAVAILABLE` and `MIGRATE_PARTIAL_FAILURE`.
- **CON-3 (warning, BEH-21–23):** no CLI exit codes are stated for claim errors. Per `backend-migration.spec.md` and `lifecycle-integration.spec.md`, `ISSUE_ALREADY_CLAIMED` exits 2.
- **CON-4 (warning, BEH-22):** the charter says "rolls back" where the spec says "abstains". Reconcile the wording, and say what happens to the loser's `claimed_at`.
- **CON-5 (warning, BEH-39):** the `next_action` and `type` refusal is narrower than `next-action-and-type-fields.spec.md`. Declare it a github difference.
- **CON-6 (warning, BEH-5):** pin the `parseId()` return shape for gh IDs.
- **CON-7 (suggestion):** reconcile `planRef` with the charter's and `reality-check`'s `plan_ref`.
- **CON-8 (suggestion):** on github, parent-epic lookup must not rely on a `notes` prefix.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES

Verified referents include the `interface.mjs` lease helpers, `CONFIG_KEYS`, the transport's fixed argv, the ID helpers and validators, `assertContained`, the specify and plan skill steps, the board worktree, and the companion commits.

- **RI-1 (warning, BEH-10):** the shipped `transport.mjs` `paginate()` and `board-read.mjs` `continueConnection()` recompute the bound on every page. The plan must state the code change.
- **RI-2 (warning, BEH-39/AC):** `lib/reality-check.mjs:433` reads `plan_ref` (snake case). Name it next to `planRef`, and assign the containment fix to a task.
- **RI-3 (warning, Error Cases):** the shipped `GITHUB_REQUEST_FAILED` and `GITHUB_TRANSPORT_INTERNAL` have no rows.
- **RI-4 (suggestion, BEH-32):** the restated sentinel rules are stricter than charter rev 9 (the check on read and on the parent directory), yet BEH-32 says the charter governs.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

- **WR-1 (warning):** `/adev:sync` and constitution-sync have no github consumer.
- **WR-2 (warning):** `.migrate-unanchored.json` is not in the gitignore registry or the amendment's check order.
- **WR-3 (warning):** no test traces a reserved `module:` label through to a fail-closed eligibility result.
- **WR-4 (warning):** no criterion covers the progress line or the dry-run read of `.migrate-unanchored.json`.
- **WR-5 (warning):** no criteria per `setup --check` drift category, for the exit-code split, or for a continuation tripping its own bound.
- **WR-6 (suggestion):** name the write methods the sentinel guard covers.
- **WR-7 (suggestion):** state how the fixture recorder is invoked.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

Prior BD-1 (realpath containment) stays resolved.

- **BD-1 (warning, BEH-39):** no refusal predicates for `type` and `milestone`; `next_action` lets through YAML-significant sequences.
- **BD-2 (warning, BEH-30):** `.migrate-unanchored.json` needs the sentinel's containment and symlink rules, and its IDs need validating on read.
- **BD-3 (warning):** list the local probe and git argv; refuse shell metacharacters in `branch`.
- **BD-4 (warning):** steady-state writes to a project named in the manifest have no consent step. Accept the risk, or add a first-use disclosure.
- **BD-5 (suggestion):** require recorder-authored fixtures, and clear `GH_HOST`/`GH_ENTERPRISE_TOKEN` in the transport's child environment.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS_WITH_NOTES

Prior TR-1 is resolved.

- **TR-2 (warning, BEH-10):** no absolute ceiling on the page bound, and nothing says what happens to a missing or non-integer `totalCount`.
- **TR-3 (suggestion, BEH-35):** say that each rate-limit response consumes one wait and that the same request is re-issued after it.
- **Fully bounded:** `walkTree`, item and connection pagination (apart from TR-2), the migration copy and re-run, pacing, claim settle, preflight, and confirmation.

## Heuristics

The following heuristics are lessons learned from past work in this module, ranked by confidence. Use them as guidance, not as hard rules.

- A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- Cache reads are 71% of session cost: minimize context accumulation (confidence: medium)

---

## Summary

**Total findings:** 26 (0 blockers, 19 warnings, 7 suggestions)
**Action required:** none blocks planning. The high risk policy requires human approval before `/adev:plan`. Fold these into the plan reconciliation:
- RI-1, RI-2, TR-2: the code deltas for the page bound and `reality-check.mjs`.
- CON-1, WR-2, BD-2: registration and hardening of `.migrate-unanchored.json`.
- CON-2, RI-3: the extra codes in the docs-coverage test.
