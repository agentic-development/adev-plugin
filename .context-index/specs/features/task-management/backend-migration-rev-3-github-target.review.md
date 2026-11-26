---
spec: .context-index/specs/features/task-management/backend-migration-rev-3-github-target.spec.md
charter: .context-index/specs/features/task-management/charter.md
verdict: PASS_WITH_NOTES
tier: full
date: 2026-11-26
last-reviewed-revision: 2
file-sha: be4eb7fe99f6c6c27b6953db3f0aa555589322445da5527592a65cbd10f90f2e
---

# Architecture Review: backend-migration-rev-3-github-target

> **Date:** 2026-11-26
> **Spec:** .context-index/specs/features/task-management/backend-migration-rev-3-github-target.spec.md (revision 2; amends backend-migration.spec.md, target revision 3)
> **Charter:** .context-index/specs/features/task-management/charter.md (revision 10)
> **Verdict:** PASS_WITH_NOTES
> **Rigor tier:** full (risk_level: high → `review_mode: full`)
> **Diff scope:** not scoped (`no-content-changed` against the committed revision), so the full spec body was delivered
> **Prior round:** revision 1 BLOCK (WR-1, RI-1). Both blockers and the listed warnings were addressed in revision 2 (commit 052bf86f). Every reviewer confirms that its prior findings are resolved.
> **Registry warnings:** `BROADEN_TOOL` ×2 and `BROADEN_NETWORK` for profile `browser-review`. No dispatched reviewer uses that profile.
> **Dispatch note:** prompts were assembled by `buildDispatchPlan` / `buildReviewerDispatches` (`node cli/index.mjs governance dispatch`), because the installed `adev` predates the `dispatch` verb. Each prompt was delivered as a file that the reviewer read in full. Model tiers:
> - `capable` (Sonnet): consistency-analyzer, wiring-reviewer, boundary-reviewer.
> - `reasoning` (Opus): referent-integrity.
> **Governance:** risk policy `high` sets `require_hitl_approval: true`, so a human must approve before `/adev:plan`.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-capable | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |

Not dispatched: `termination-reviewer` (triggered, score 0 < 1).

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk; still resolvable for any project whose materialized review.yaml already names it. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via adev extension install web-service) where it fits the artifact class. Prompt retained on disk. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

Prior round: WR-1, RI-1 and CON-1 (ADR 0014 note) are resolved, and so are RI-2..4, WR-2..4 and BD-1..3. Base Behaviors 1–27 are now classified for a github target, which closes the earlier CON-2.

- **CON-1 (warning, contract, `argument-surface-and-dispatch` / BEH-3):** BEH-3 still requires confirmation on a nothing-left-to-do re-run when the sentinel is absent. GitHub spec BEH-41 says "A re-run that has nothing left to create or link needs no confirmation", with no sentinel qualifier. The narrowing here is sound, but the two specs disagree on the same behavior. Recommendation: add a one-line BEH-41 amendment, or a pointer from the GitHub spec to this one. The fix belongs in the other spec.
- **CON-2 (warning, contract, `dry-run-and-success-output` / BEH-8):** BEH-8 commits the beads sentinel on `beads-board` but never pushes it. Charter rev 9 says the sentinel is "committed on the `beads-board` branch in the same sync that retires the board, so every clone that syncs the board sees it read-only. Never left local-only". An unpushed commit is still local-only to every other clone. Recommendation: either state that the guarantee is partly met until `beads-board-direct-sync` (`issue-vtj7lp`) lands, with an operator-visible stderr line saying the board is not retired for other clones until pushed, or amend the charter row.
- **CON-2b (suggestion, terminology, BEH-6):** ADR 0014's new note says `redact()` replaces `Authorization:` credentials, but the code does not do that yet. Reword the note to "will replace", or add a status line.
- **CON-3 (suggestion, naming):** BEH IDs appear out of document order (…4, 11, 5…8, 12, 9, 10) and share an unprefixed namespace with GitHub spec BEH-1..41. Either renumber them or use an amendment-local prefix. This is readability only.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES

Prior round: RI-1..6, CON-1, WR-1 and BD-3 are resolved. A sample of the referents checked:
- `SUPPORTED_BACKENDS`
- `READONLY_BACKENDS`
- the `GithubAdapter` seams constructor
- `replayExec`
- `redact()` and its constants
- plan Tasks 14, 18 and 19
- charter rev 9 sentinel table
- ADR 0016 exception
- GitHub spec BEH-14, BEH-29–35 and BEH-41

- **RI-1 (warning, BEH-4):** the spec says the resume-argument checks "run at the start of every run". Today `loadResumeState()` runs only on the live path, after both board reads and after the `--dry-run` early return (`lib/cli/issues-migrate.mjs:999-1033`). BEH-5 step 2 and BEH-7 require moving them, but the spec presents that as already true. Recommendation: describe today's placement accurately and add the reorder to the Task 18 notes.
- **RI-2 (warning, BEH-2):** today `--from github --to github` exits with `MIGRATE_GITHUB_UNAVAILABLE`, because that check comes before the NOOP check (`:917-944`). The spec states the reverse order as fact. Recommendation: mark it as a required reorder.
- **RI-3 (warning, BEH-5):** the spec calls the envelope "existing", but today's `errors[]` entries are `{ id, index, stderr }`, and stderr gets two lines (`:512`, `:523`, `:549`, `:1075`). The `{ source_id, code, message }` shape and the single stderr line are new for github. Recommendation: say so, and state that json and beads keep the current shape.
- **RI-4 (warning, BEH-10):** plan Task 18 declares `migrateToGithub({ source, target, scope, log })`. That signature has no `exec`, `sleep` or `now`, and it has `log`. Recommendation: add the signature reconciliation to Notes for Planning.
- **RI-5 (suggestion):** plan Task 11 names the partial-create properties `e.id` and `e.unwritten`. Name them directly.
- **RI-6 (suggestion):** `redact()` does not read the environment. State that the verb's sinks call `redact(s, [GH_TOKEN, GITHUB_TOKEN])`.
- **RI-7 (suggestion):** base Procedure Step 1 also says "reject `file` with `MIGRATE_TARGET_READONLY`". Say that this clause stays.
- **RI-8 (suggestion):** plan Task 14 defines sentinel paths for json and beads only. Add `file` → `board-read-only.json` to the Task 14 note.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

Prior round: WR-1 (the reader of `last_successful_index` and its acceptance criteria), WR-2..5 and WR-7 are resolved. WR-6 is mostly resolved.

- **WR-8 (warning, `abort-envelope` / BEH-6 vs BEH-10):** BEH-6 names a "stderr writer" as a redaction sink, but no such function is named, and BEH-10 says stderr lines "still go through `console.error`". With no single stderr chokepoint, one raw `console.error` can bypass `redact()`. Recommendation: name the one function every github-path stderr line passes through. Add a criterion that sends a token-shaped string through a non-error stderr line, such as the progress warning or the write set.
- **WR-9 (suggestion, BEH-4):** state how `last_successful_index` advances for items skipped by `legacy_id`, and for failures in the replay phase.
- **WR-10 (suggestion):** the `--yes` chain is complete. No action needed.
- **WR-11 (suggestion):** optionally drive the beads "sentinel blocks writes" case through a real `BeadsAdapter` write, not only `assertWritable`.
- **WR-12 (suggestion):** every new code has a producer, a trigger, a test and a docs home. No action needed.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

Prior round: BD-1 and BD-3 are resolved. BD-2 is partly resolved and its residual is carried below as BD-6. The redaction half of prior BD-5 is resolved.

- **BD-1 (warning, privilege posture, BEH-3 / BEH-8):** for a beads source with nothing left to do and the sentinel already present, the verb commits the sentinel without confirmation. The spec treats the file's presence as proof of earlier consent, but the file can come from another checkout or be written by hand. Recommendation: require `--yes` or a prompt for the commit-only path, or state explicitly that the file is the accepted consent proxy and why.
- **BD-2 (warning, destructive ops, BEH-8 step 2):** `git status --porcelain -- adev-read-only.json` is also empty for a gitignored, untracked file. In that case the verb would skip the commit and report the sentinel as committed. Recommendation: check tracking directly, for example `git ls-files --error-unmatch`, check that the file is unmodified, and add a criterion for the ignored-file case.
- **BD-3 (suggestion, path containment, BEH-8 / BEH-12):** suppose `.beads/` is a plain directory. Then `git rev-parse --abbrev-ref HEAD` reports the main checkout's branch. Recommendation: also require `git rev-parse --show-toplevel` to be realpath-equal to `<root>/.beads`, and state that containment of a not-yet-existing sentinel is checked on the realpath of its parent directory.
- **BD-4 (suggestion, BEH-8):** the beads commit runs repository commit hooks. Say in the write set that `--yes` also covers that commit.
- **BD-5 (warning, input trust, BEH-4 / BEH-6 / BEH-11):** `MIGRATE_TARGET_FOREIGN_LEGACY_ID` echoes raw `legacy_id` values read from GitHub. Other output also echoes GitHub-supplied and source-supplied text with no control-character handling. Recommendation: validate target `legacy_id` values with `parseId` before echoing, and cap and escape echoed strings at the output chokepoint.
- **BD-6 (warning, privilege posture, BEH-11 / BEH-3):** this is the residual of prior BD-2. A board with colliding flat IDs, migrated into the same project, passes the provenance check. Only confirmation limits the damage, and `--yes` bypasses it. Recommendation: when items are already present but there is neither a sentinel nor a state file, either require interactive confirmation even with `--yes` or print a prominent warning. Alternatively, record board identity in the sentinel.

## Heuristics

The following heuristics are lessons learned from past work in this module, ranked by confidence. Use them as guidance, not as hard rules.

- A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- Cache reads are 71% of session cost: minimize context accumulation (confidence: medium)

---

## Summary

**Total findings:** 23 (0 blockers, 11 warnings, 12 suggestions)
**Action required:** none blocks planning. Before `/adev:plan`:
- **Human approval:** the high risk policy requires it.
- **Cheap to fold into the github plan's Task 18/19 reconciliation:** RI-1 to RI-4 (current-code placement and shape statements) and WR-8 (one named stderr chokepoint).
- **Worth a decision before implementation:** CON-2 (an unpushed beads sentinel versus charter rev 9's "never local-only") and BD-1, BD-2, BD-5 and BD-6 (sentinel commit consent and tracking, echoing untrusted text, the colliding-ID residual).
- **Belongs in the GitHub spec:** CON-1, a BEH-41 sentinel qualifier.
