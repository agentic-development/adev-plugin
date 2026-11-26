---
spec: .context-index/specs/features/task-management/github-board-backend.spec.md
charter: .context-index/specs/features/task-management/charter.md
verdict: BLOCK
tier: full
date: 2026-11-26
last-reviewed-revision: 4
file-sha: 2a2f1ddbbd297d41c9dab49d1820780256e9b1730d1cde6b5a1d5b78d9f89df9
---

# Architecture Review: github-board-backend

> **Date:** 2026-11-26
> **Spec:** .context-index/specs/features/task-management/github-board-backend.spec.md (revision 4)
> **Charter:** .context-index/specs/features/task-management/charter.md (github capabilities introduced in charter revision 10)
> **Verdict:** BLOCK
> **Rigor tier:** full (risk_level: high → `review_mode: full`)
> **Diff scope:** scoped (`diff-scoped`) against the committed revision 3. Changed anchors: `live-spec-github-board-backend`, `acceptance-criteria`, `behaviors`, `field-placement-and-the-read-path`, `write-path`, `migration-to-github`, `error-cases`, `behavioral-contract`, `actionable-task-map`, `conformance-and-docs`.
> **Prior round:** revision 3 BLOCK on RI-1 (BEH-14) and TR-1 (BEH-11).
> - **TR-1 and RI-4 are resolved.** BEH-11 now has a visited set, `GITHUB_SUBISSUE_CYCLE` and an Error Cases row. Referent-integrity checked these against `lib/issues/github-adapter.mjs:164-190`.
> - **RI-1 is re-raised.** The rewritten BEH-14 says `/adev:specify` and `/adev:plan` reach the board through the CLI verbs, and they do not.
> - **BD-1 is new.** It sits in BEH-39, which revision 4 did not change. The diff scope delivered the whole Behaviors section because the anchor changed.
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

The consistency analyzer found prior RI-1 and TR-1 resolved from the spec text. It did not check the skill sources.

- **CON-1 (warning, contract):** `/adev:sync` and other readers of `tasks.backend` have no github case. `constitution-sync.spec.md` and `adev-issues-skill.spec.md` both fall back to file for an unknown backend. Repeats prior CON-2 / WR-1.
- **CON-2 (warning, BEH-3/BEH-40):** BEH-40 allows only one fixed argv, but the local `gh` probes BEH-3 needs fall outside it. Enumerate the closed argv set. Repeats prior CON-3.
- **CON-3 (warning, BEH-26):** the charter row says `setup --check` exits non-zero on drift; BEH-26 exits non-zero only on missing fields. Reconcile in the charter, so this is `external`. Repeats prior CON-1.
- **CON-4 (suggestion, BEH-29/BEH-14):** cite the amendment's envelope in BEH-29, and name the `GITHUB_PARTIAL_CREATE` properties in BEH-14.
- **CON-5 (suggestion, BEH-38):** the amendment's new codes are not in this spec's Error Cases table, so the docs-coverage test does not see them.
- **CON-6 (suggestion, BEH-22/BEH-30):** map `legacy_id` to the charter's `MigrationIdMap`, and abstention to its "rollback".
- **CON-7 (suggestion, BEH-32):** the beads-topology refusal happens after the items are written. Add a pre-write topology check, or say the refusal is resumable.
- **CON-8 (suggestion):** `beads-board-git-topology.spec.md` counts "8 subcommands". Update the count when the `github` branch lands.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

**Verified referents:**
- `GITHUB_SUBISSUE_CYCLE` and `walkTree` (visited set seeded with the root, throw on revisit with `{ id }`, `[]` for an unresolved root);
- `_resolve` with `GITHUB_AMBIGUOUS_LEGACY_ID`;
- the `create` and `epic` subcommands at `lib/cli/issues.mjs:76,85`;
- every companion-owned code.

**Findings:**

- **RI-1 (blocker, BEH-14, `nonexistent-skill-error-path`, defect):** BEH-14 says "`/adev:specify` and `/adev:plan` reach the board through those verbs". They do not.
  - `/adev:specify` calls `getIssueManager(manifest).create(...)` in-process (`skills/specify/references/modes/standard-mode.md:296,325`). Its Step 5.6 catches any adapter throw, logs it, and does not block (`:329`).
  - `/adev:plan` calls `create(...)` in-process in its feature mode (`skills/plan/references/feature-mode.md:35-48`), epic mode (`epic-mode.md:15`) and release mode (`release-mode.md:65-69`). Only `steps/step-7-execution-handoff.md:37` uses a verb, `adev issues epic`.
  - So `GITHUB_PARTIAL_CREATE` reaches both skills as a thrown error, not as a verb's non-zero exit.
  - Recommendation: describe the real paths. Then either state what `/adev:plan` does with the thrown code, or move its board writes onto the verbs with a task.
- **RI-2 (warning, BEH-20):** `fenceBlock` needs a nonce, and BEH-20 names no source for it. The text also still claims fencing for all five verbs. Repeats prior RI-2.
- **RI-3 (suggestion):** word the header as "github capabilities introduced in charter revision 10".

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

The wiring reviewer considered prior RI-1 and TR-1 resolved from the spec text.

- **WR-1 (warning, BEH-1):** `lib/session-capture.mjs` and `skills/sync/SKILL.md` read `tasks.backend` and have no github case. No test covers them.
- **WR-2 (warning, BEH-8):** no criterion traces a reserved `module:` label through to fail-closed eligibility.
- **WR-3 (warning, BEH-14):** state that a fixture drives both `create` and `epic` to `GITHUB_PARTIAL_CREATE`.
- **WR-4 (warning, BEH-30):** cite amendment BEH-4 as the reader of `.migrate-state.json`.
- **WR-5 (warning, BEH-26):** add one criterion per `setup --check` drift category.
- **WR-6 (suggestion, BEH-32/BEH-33):** say which adapter methods run the sentinel guard.
- **WR-7, WR-8 (suggestion):** the chains are complete. No action.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** FAIL

- **BD-1 (blocker, BEH-39, `path-containment`, defect):** BEH-39 and BEH-37 name `resolveContained()` as the containment primitive.
  - That function is lexical only: `lib/path-safety.mjs:31-35` is `abs.startsWith(absRoot + sep)`. It never calls realpath.
  - `spec_ref` and `planRef` are writable by anyone with project write. A symlinked directory in the repo can therefore pass the lexical check and resolve outside the root.
  - Recommendation: require realpath'd containment, equivalent to `assertContained` in `lib/extensions/exec-payload.mjs`, for `spec_ref`/`planRef` consumers, for the fixture recorder, and for the sentinel. Refuse an unresolvable candidate, and refuse a symlinked sentinel with `SENTINEL_PATH_UNSAFE`.
- **BD-2 (warning, BEH-3/BEH-40/BEH-32):** the preflight argv set is not enumerated, and BEH-32 does not state the git commit argv. Repeats prior BD-1.
- **BD-3 (warning, BEH-39/BEH-8/BEH-20):**
  - No refusal predicates for `type`, `priority`, `milestone` or `title`.
  - No `assertSafeScalar`-class check on github values bound for YAML.
  - Repeats prior BD-3.
- **BD-4 (warning, BEH-3/BEH-13):**
  - A manifest-supplied project or repo receives every later write without any consent step.
  - "Maintainer-only storage" overstates the trust boundary.
  - Repeats prior BD-4.
- **BD-5 (suggestion):**
  - Require recorder-authored fixture content.
  - Refuse URL extras.
  - Clear `GH_HOST` from the environment under the fixed argv.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS_WITH_NOTES

Prior TR-1, the unbounded `walkTree`, is resolved.

- **TR-1 (warning, BEH-10):** sub-issue and blocked-by continuation pages have no numeric bound of their own. Repeats prior TR-2.
- **TR-2 (warning, BEH-10):** revision 4 takes `totalCount` from each page's own response, matching the shipped `transport.mjs` `paginate()`. The bound therefore has no fixed ceiling. A server that keeps raising `totalCount` while returning fresh cursors never trips it. State a fixed bound, such as the first page's `totalCount`.
- **TR-3 (warning, BEH-35):** say which layer owns the migration's rate-limit wait, what is re-issued after it, and what the run-level counters cover.
- **TR-4 (suggestion):** collect the numeric bounds in one place.
- **Out of scope, noted:** a `GITHUB_PARTIAL_CREATE` before the `Legacy ID` write leaves an item that BEH-30 cannot find. The spec does not state the write order that prevents this.

## Heuristics — related prior lessons (signature-ranked)

The following heuristics are lessons learned from past work in this module, ranked with any exact matches for this blocker first. They are not necessarily prior occurrences of this blocker. Use them as guidance, not as hard rules.

- A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- Cache reads are 71% of session cost: minimize context accumulation (confidence: medium)

---

## Summary

**Total findings:** 28 (2 blockers, 15 warnings, 11 suggestions)

**Blockers** (sidecar: `github-board-backend.blockers.md`):
- `referent-integrity:nonexistent-skill-error-path:b3ff7d35` (RI-1, `behaviors-14`)
- `boundary-reviewer:path-containment:31c90e3e` (BD-1, `behaviors-39`)

**Action required:** revise BEH-14 and BEH-39 with `/adev:specify --revise`, then re-review.
- **BEH-14:** describe the in-process `create()` paths as they are. `/adev:specify` already handles the throw without blocking. For `/adev:plan`, decide whether it needs handling or should call the verbs.
- **BEH-39:** require realpath'd containment (`assertContained`-equivalent) instead of `resolveContained()`.

Also consider TR-2: revision 4's per-page `totalCount` wording leaves the item-page bound without a fixed ceiling.
