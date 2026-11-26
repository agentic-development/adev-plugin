---
spec: .context-index/specs/features/task-management/github-board-backend.spec.md
charter: .context-index/specs/features/task-management/charter.md
verdict: BLOCK
tier: full
date: 2026-11-26
last-reviewed-revision: 5
file-sha: 41d9745b83f782fb89b6679815fccee842ca08b18b60fcac6b92af960ee02f0a
---

# Architecture Review: github-board-backend

> **Date:** 2026-11-26
> **Spec:** .context-index/specs/features/task-management/github-board-backend.spec.md (revision 5)
> **Charter:** .context-index/specs/features/task-management/charter.md (github capabilities introduced in charter revision 10)
> **Verdict:** BLOCK
> **Rigor tier:** full (risk_level: high → `review_mode: full`)
> **Diff scope:** scoped (`diff-scoped`) against the committed revision 4.
> **Prior round:** revision 4 BLOCK on RI-1 (BEH-14) and BD-1 (BEH-39). Both are resolved; their own reviewers confirmed it.
> **New blocker:** TR-1 escalates the prior-round termination warning about continuation pages. Revision 5 left that text unchanged.
> **Registry warnings:** `BROADEN_TOOL` ×2 and `BROADEN_NETWORK` for profile `browser-review`. No dispatched reviewer uses that profile.
> **Dispatch note:** prompts were assembled by `node cli/index.mjs governance dispatch` (worktree CLI). Each prompt was delivered as a file that the reviewer read in full. Model tiers:
> - `capable` (Sonnet): consistency-analyzer, wiring-reviewer, boundary-reviewer.
> - `reasoning` (Opus): referent-integrity.
> - `fast` (Haiku): termination-reviewer.
> **Governance:** risk policy `high` sets `require_hitl_approval: true`.

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

- **CON-1 (warning, BEH-5):** pin the shape `parseId()` returns for gh IDs (`legacy: false, github: true`, at `lib/issues/id-utils.mjs:159`). State that tiered inference, `tier_prefix`, `MAX_DEPTH_EXCEEDED` and `e<N>` epic IDs do not apply on github.
- **CON-2 (warning, BEH-3/BEH-40):** list the closed set of local probe argv and the git commit argv. Narrow BEH-40's "exactly" to requests sent to GitHub. Repeats prior CON-2.
- **CON-3 (warning, Error Cases):** the table has no rows for `BOARD_READ_ONLY_MIGRATED`, `SENTINEL_PATH_UNSAFE` or `MIGRATE_SENTINEL_COMMIT_FAILED`. The amendment's new codes are also missing, so BEH-38's docs test, which reads this table, never sees them.
- **CON-4 (warning, BEH-30):** two follow-ups for the new `.migrate-unanchored.json`.
  - The amendment's BEH-5 pre-write order does not list it. That is an `external` fix in the amendment.
  - `lib/gitignore-paths.mjs` registers `.migrate-state.json` but not this file.
- **CON-5 (warning, BEH-39/BEH-8):** `next_action` and `type` are narrower on github than in `next-action-and-type-fields.spec.md`. That spec normalizes newlines and accepts any free-text type. Either declare a github difference or normalize the same way.
- **CON-6 (warning, BEH-21–23):** state the CLI exit code for each `GITHUB_*` claim error, so `lifecycle-integration.spec.md`'s exit-2 halt is not turned into a warning.
- **CON-7 (suggestion):** `/adev:specify` Step 5.6-3 finds the parent epic by a `"Charter:"` prefix in `notes`, which is untrusted on github.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES

Prior RI-1 is resolved: the in-process `create()` paths in specify and plan are now described as they are. Prior BD-1 is resolved as a referent: `assertContained` exists at `lib/extensions/exec-payload.mjs:158` and resolves symlinks with `realpathSync`.

- **RI-1 (warning, BEH-39/AC):** `lib/reality-check.mjs:432-433,467-468` resolves `plan_ref` (snake case) and `spec_ref` with no containment. Name `plan_ref`, and assign the fix to a task.
- **RI-2 (warning, BEH-10):** the shipped `transport.mjs:231` `paginate()` and `board-read.mjs:47` both recompute the bound on every page. The fixed-from-page-1 rule needs a code change.
- **RI-3 (warning, BEH-20):** no `fenceBlock` nonce source is named. Repeats prior RI-2.
- **RI-4 (suggestion):** cross-reference `MIGRATE_UNANCHORED_ITEM` in the amendment's BEH-5 order.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

- **WR-1 (warning):** `/adev:sync` and session capture have no github case. Repeats the prior finding.
- **WR-2 (warning):** no end-to-end test that a reserved `module:` label leads to fail-closed eligibility.
- **WR-3 (warning):** no criterion asserts the `resuming: N of M` line. Add one, or cite the amendment's criterion.
- **WR-4 (warning):** no criterion covers the dry-run read of `.migrate-unanchored.json`.
- **WR-5 (warning):** no criterion per `setup --check` drift category, and none for the exit-code split.
- **WR-6 (suggestion):** name the write methods that run the sentinel guard.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

Prior BD-1 is resolved. BEH-39, BEH-32 and BEH-37 now require realpath containment and refuse a symlinked sentinel.

- **BD-1 (warning, BEH-39/BEH-8):** no refusal predicates for `type` and `milestone`, and no `assertSafeScalar`-class check on values that reach YAML.
- **BD-2 (warning, BEH-30):** `.migrate-unanchored.json` lacks the sentinel's realpath and symlink rules. Validate `source_id`/`target_id` on read.
- **BD-3 (warning, BEH-3/BEH-32/BEH-39):** list the local probe and git argv arrays, and refuse shell metacharacters in `branch`.
- **BD-4 (warning):** a manifest-named project receives steady-state writes without consent. Record that as an accepted risk, or add a first-use disclosure.
- **BD-5 (suggestion):** require recorder-authored fixture content, and clear `GH_HOST`/`GH_ENTERPRISE_TOKEN` in the transport's child environment.

## Termination Reviewer (termination-reviewer)

**Verdict:** FAIL

- **TR-1 (blocker, BEH-10, `missing-iteration-cap`, defect):** continuation pages for sub-issue and blocked-by connections have no stated bound.
  - BEH-10's `ceil(totalCount / 100) + 1` uses the project item count. If continuation pages are excluded from it, they are unbounded. If they are included, a legitimate item with many sub-issues trips the bound falsely.
  - Recommendation: give each continuation connection its own bound and say it does not count toward the item-page bound. Name `GITHUB_PAGINATION_INVALID` as the outcome for both.
  - **Orchestrator note:** the shipped `continueConnection()` in `lib/issues/github/board-read.mjs:33-52` already does this. Each connection has its own `ceil(totalCount / 100) + 1` bound, the embedded first page counts as page 1, and a repeated cursor throws `GITHUB_PAGINATION_INVALID`. The fix is to state that rule in BEH-10 and to fix the bound from the connection's first page.
- **TR-2 (warning, BEH-10):** the bound taken from the first page is finite but has no ceiling of its own. State a maximum accepted `totalCount` or page count.
- **TR-3 (warning, BEH-35):** say whether the rate-limited request is re-issued after a wait, and whether each re-issue counts as one of the 5 waits.
- **Fully bounded:** `walkTree`, the migration copy and re-run, `MIGRATE_UNANCHORED_ITEM`, pacing, claim settle, and confirmation.

## Heuristics — related prior lessons (signature-ranked)

The following heuristics are lessons learned from past work in this module, ranked with any exact matches for this blocker first. They are not necessarily prior occurrences of this blocker. Use them as guidance, not as hard rules.

- A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- Cache reads are 71% of session cost: minimize context accumulation (confidence: medium)

---

## Summary

**Total findings:** 25 (1 blocker, 20 warnings, 4 suggestions)
**Blocker:** `termination-reviewer:missing-iteration-cap:b3601130` (TR-1, `behaviors-10`). Sidecar: `github-board-backend.blockers.md`.
**Action required:** revise BEH-10 to state the per-connection continuation bound, which the shipped `continueConnection()` already enforces. Then re-review.
