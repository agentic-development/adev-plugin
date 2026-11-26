---
spec: .context-index/specs/features/task-management/github-board-backend.spec.md
charter: .context-index/specs/features/task-management/charter.md
verdict: BLOCK
tier: full
date: 2026-11-26
last-reviewed-revision: 3
file-sha: f7bf85d7db7dfebad4900b8177297a4430197c9356e29c765a2b46556ffb5276
---

# Architecture Review: github-board-backend

> **Date:** 2026-11-26
> **Spec:** .context-index/specs/features/task-management/github-board-backend.spec.md (revision 3)
> **Charter:** .context-index/specs/features/task-management/charter.md (github capabilities introduced in charter revision 10)
> **Verdict:** BLOCK
> **Rigor tier:** full (risk_level: high → `review_mode: full`)
> **Diff scope:** scoped (`diff-scoped`) against the committed revision 2. Changed anchors: `live-spec-github-board-backend`, `actionable-task-map`, `acceptance-criteria`, `preconditions`, `behaviors`, `migration-to-github`, `postconditions`, `error-cases`, `behavioral-contract`, `conformance-and-docs`.
> **Prior round:** revision 2 PASS_WITH_NOTES (17 warnings, 8 suggestions). Revision 3 changed only BEH-32, BEH-33, BEH-41, the Preconditions bullet, and the BEH-33 restatements (Task Map row 10, the BEH-33 acceptance criterion, Postconditions, the `BOARD_READ_ONLY_MIGRATED` Error Cases row). Reviewers found those changes consistent with the migration amendment and charter revision 9.
> **Blockers are re-raised prior-round warnings.** Both blockers (RI-1, TR-1) repeat findings the prior round rated as warnings (prior RI-1, prior TR-2). The reviewers raised them to blocker because revision 3 left BEH-14 and BEH-11 unchanged. Neither comes from the revision 3 delta.
> **Registry warnings:** `BROADEN_TOOL` ×2 and `BROADEN_NETWORK` for profile `browser-review`. No dispatched reviewer uses that profile.
> **Dispatch note:** prompts were assembled by `node cli/index.mjs governance dispatch` (worktree CLI). Each prompt (80–340 KB) was delivered as a file that the reviewer read in full. Model tiers:
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

Naming and the `tasks.github` key set match the charter. The `gh-` IDs, field placement, status map, migration flags and sentinel paths match the charter and the revision 3 migration amendment.

- **CON-1 (warning, contract, BEH-26/BEH-27):** this re-raises prior RI-3. BEH-26 exits 0 when only drift is found, but the charter row says "non-zero exit on drift" and lists no `--yes`. Align the charter row, or change BEH-26.
- **CON-2 (warning, contract):** this re-raises prior WR-1. `constitution-sync.spec.md`'s Error Cases send an unknown `tasks.backend` to file-backend guidance, and `adev-issues-skill.spec.md` falls back to file with a warning. Both conflict with BEH-1's no-fallback rule. Add a sync behavior and task, and exclude `github` from the fallback row.
- **CON-3 (warning, contract, BEH-3/BEH-40):** this re-raises prior BD-1. BEH-40 requires the single fixed argv for every request, but BEH-3's preflight needs checks that look like other argv. Enumerate the closed argv set, or derive auth and scopes through GraphQL.
- **CON-4 (warning, module-boundary, BEH-32):** a beads source whose `.beads/` is still tracked on `main` has no `beads-board` checkout, because `adev issues board migrate` has not run. State the outcome for that case, such as refusing with a remedy, and keep it consistent with amendment BEH-8.
- **CON-5 (warning, terminology, BEH-22/BEH-30):** this re-raises prior CON-4. Say that abstention is the charter's "rollback", state what happens to the loser's `claimed_at` overwrite, and name `legacy_id` as the realisation of `MigrationIdMap`.
- **CON-6 (suggestion, BEH-29):** point BEH-29 at the amendment's `MIGRATE_PARTIAL_FAILURE` envelope and its new codes. Say whether the BEH-38 docs-coverage test covers them.
- **CON-7 (suggestion, BEH-11/BEH-34):** this re-raises prior CON-5. State that `walkTree(<legacy id>)` resolves through `legacy_id`.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

Verified referents include:
- `validateIssue`, `validateStatusTransition`, `normalizeOwner`, `isClaimUnexpirable`, `requireClaimable`, `requireReleasable`;
- `SUPPORTED_BACKENDS` (includes `github`), `resolveStorageRoot`, `parseId`, `resolveContained`, `fenceBlock`, `manifestUpdateSuggestion`;
- the transport's fixed argv and page bound;
- every error code in source;
- the precondition commits e43a5831, 40284a89 and 983e01ad, and charter revision 9's sentinel section.

- **RI-1 (blocker, BEH-14, `nonexistent-skill-error-path`, defect):** this re-raises prior RI-1.
  - BEH-14 says `/adev:specify` and `/adev:plan` report `GITHUB_PARTIAL_CREATE` "through their existing non-blocking adapter-error path".
  - `/adev:specify` has that path (`skills/specify/references/shared/lifecycle-events.md:38`).
  - `/adev:plan` does not. It calls `create()` in `skills/plan/references/feature-mode.md:38-48`, `epic-mode.md:15` and `release-mode.md:65-69`, and `adev issues epic` (`createEpic`) in `steps/step-7-execution-handoff.md:37`. No non-blocking adapter-error handling exists under `skills/plan/`.
  - BEH-14 also names only `create()`.
  - Recommendation: drop `/adev:plan` from the consumer list. Otherwise, name the plan steps that surface the code and how they surface it, add a task, and extend BEH-14 to `createEpic`.
- **RI-2 (warning, BEH-20):** this re-raises prior RI-4. Four of the five verbs never render a body. `show` prints `notes` only under `--json`, and `fenceBlock` needs a nonce. Limit the fencing claim to `show`, state the JSON form, and name the nonce source.
- **RI-3 (warning, BEH-26/BEH-27):** the charter interface row disagrees with the spec on `--check`'s exit code and on `--yes`. This is the same issue as CON-1.
- **RI-4 (warning, BEH-11, Error Cases):** `lib/issues/github/errors.mjs:27` defines `GITHUB_SUBISSUE_CYCLE`, and `github-adapter.mjs:162,183` throws it, but neither BEH-11 nor the Error Cases table names it. As a result, BEH-38's docs-coverage test never requires it. Add the outcome to BEH-11 and add an Error Cases row.
- **RI-5 (suggestion):** the charter is at `revision: 26`. Revision 10 is where the github capabilities were introduced, so word the reference that way.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

- **WR-1 (warning, BEH-1/Postconditions):** this re-raises prior WR-1.
  - `lib/session-capture.mjs:698-738` treats any backend other than beads as `file` and reads `tasks.md`.
  - `skills/sync/SKILL.md:52-54` branches only on beads.
  - Add a task and test, or state that each reader was checked and name the grep that proves it.
- **WR-2 (warning, BEH-26):** this re-raises prior WR-2. No acceptance criterion asserts each `setup --check` drift category.
- **WR-3 (warning, `affected_modules`):** this re-raises prior WR-3. No criterion traces a home-repo `gh-<n>` item carrying a reserved `module:` label through to a fail-closed bugfix-loop classification. Name the bridge-amendment test that does this.
- **WR-4 (suggestion, BEH-14):** the `/adev:plan` consumer is questionable, and no test covers the specify and plan consumers. This is the same issue as RI-1.
- **WR-5 (suggestion, BEH-30/BEH-37):** cite migration amendment BEH-4 as the reader of `.migrate-state.json`. State whether the recorder's containment is tested or checked manually.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

The revision 3 changes hold up:
- BEH-41 counts the sentinel as a write.
- `--yes` is argv-only and is not implied by `--auto`.
- BEH-32 states the sentinel's commit status.

- **BD-1 (warning, BEH-3/BEH-40):** preflight's argv is not specified, the same issue as CON-3. Enumerate the closed set. Add that the beads sentinel commit uses an argv array with `--` before the pathspec.
- **BD-2 (suggestion, BEH-32/BEH-33):** state that both write and read go through `resolveContained()` against the realpath of `resolveStorageRoot()`, and that a symlinked sentinel is refused with `SENTINEL_PATH_UNSAFE`.
- **BD-3 (warning, BEH-39/BEH-8):** this re-raises prior BD-3.
  - No predicates exist for `type`, the Epic `milestone` or `priority`.
  - `next_action` has no check for YAML-significant sequences.
  - Titles are not validated before they reach other consumers.
- **BD-4 (warning, BEH-8):** this re-raises prior BD-4. "Maintainer-only storage" overstates the boundary: triage permission can write labels and types, and project write can write fields. State the real trust tiers.
- **BD-5 (suggestion, BEH-32/BEH-37):** state that the sentinel holds only the five keys. Extend the fixture lint so titles and bodies must be recorder-authored.
- **BD-6 (suggestion, BEH-33):** document the sanctioned unlock procedure, and note that a malformed sentinel still blocks.
- **BD-7 (suggestion, BEH-6):** parse URLs with `new URL()`. Refuse userinfo, port, query and fragment rather than stripping them.

## Termination Reviewer (termination-reviewer)

**Verdict:** FAIL

- **TR-1 (blocker, BEH-11, `missing-iteration-cap`, defect):** this re-raises prior TR-2. The transitive `walkTree` states no visit bound and no outcome on a cycle, and BEH-10's bound is not stated to apply to it. State a finite bound (a visited set) and a named verdict on a repeated node, such as a named code with no partial result. The code already throws `GITHUB_SUBISSUE_CYCLE` (see RI-4).
- **TR-2 (warning, BEH-10):** this re-raises prior TR-1. The bound and verdict for sub-issue and blocked-by continuation pages are not stated.
- **TR-3 (warning, BEH-10):** say which `totalCount` fixes the page bound, the first response's or each response's.
- **TR-4 (suggestion):** this re-raises prior TR-3. Keep the numeric bounds in BEH-35 and BEH-10 as the single source.
- Fully bounded: the claim settle re-read (BEH-22), the migration rate-limit waits (BEH-35), the migration item loop (BEH-29), and no automatic retry on read, write or network paths.

## Heuristics — related prior lessons (signature-ranked)

The following heuristics are lessons learned from past work in this module, ranked with any exact matches for this blocker first. They are not necessarily prior occurrences of this blocker. Use them as guidance, not as hard rules.

- A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- Cache reads are 71% of session cost: minimize context accumulation (confidence: medium)

---

## Summary

**Total findings:** 28 (2 blockers, 16 warnings, 10 suggestions)
**Blockers:**
- `referent-integrity:nonexistent-skill-error-path:6784c637` (RI-1, `behaviors-14`)
- `termination-reviewer:missing-iteration-cap:78cdd45d` (TR-1, `behaviors-11`)

The sidecar is `github-board-backend.blockers.md`.

**Action required:** revise BEH-14 and BEH-11 with `/adev:specify --revise`, then re-review. Both fixes are small:
- **BEH-14:** drop `/adev:plan` from the consumer list, or name its real path and cover `createEpic`.
- **BEH-11:** record the visited-set bound and the `GITHUB_SUBISSUE_CYCLE` outcome, and add the matching Error Cases row (RI-4).

Neither blocker involves the revision 3 delta, which the reviewers found consistent with the migration amendment and charter revision 9.
