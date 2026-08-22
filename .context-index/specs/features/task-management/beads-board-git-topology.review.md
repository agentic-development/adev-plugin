---
spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
charter: .context-index/specs/features/task-management/charter.md
verdict: BLOCK
reviewers:
  - id: consistency-analyzer
    mode: subagent
    profile: reviewer-fast
    prompt: plugin:review-specs/consistency-analyzer-prompt.md
    verdict: FAIL
  - id: referent-integrity
    mode: subagent
    profile: reviewer-reasoning
    prompt: plugin:review-specs/referent-integrity-prompt.md
    verdict: FAIL
  - id: wiring-reviewer
    mode: subagent
    profile: reviewer-capable
    prompt: plugin:review-specs/wiring-reviewer-prompt.md
    verdict: PASS_WITH_NOTES
  - id: boundary-reviewer
    mode: subagent
    profile: reviewer-capable
    prompt: plugin:review-specs/boundary-reviewer-prompt.md
    verdict: FAIL
last-reviewed-revision: 2
file-sha: b90530ccd933e3c3794d9b4a52ed83627c79b630f491919f18aa9826e6e87fd3
review-date: 2026-08-22
rigor-tier: full
---

# Architecture Review: beads-board-git-topology (revision 2)

> **Date:** 2026-08-22
> **Spec:** `.context-index/specs/features/task-management/beads-board-git-topology.spec.md`
> **Charter:** `.context-index/specs/features/task-management/charter.md`
> **Verdict:** BLOCK

This is a re-review of revision 2, which was written to address revision 1's BLOCK verdict (3 blockers: RI-7 scope-note tense, BD-1 gitignore mechanics, BD-2 no recovery path). Revision 2's fixes are only partially sound: the wording/scope fixes hold, but the *content* fixes cited a real function (`lib/gitignore-installer.mjs::ensureManagedBlock`) without verifying its actual API — three reviewers independently caught the same mismatch, and one surfaced a genuinely new design flaw (the checkpoint file's own location is unstated and could land inside `.beads/` itself).

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |

Rigor tier: **full** (unchanged from revision 1 — `risk_level: medium`). `termination-reviewer` not dispatched (no trigger keywords).

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** FAIL

Revision 1's CON-1 (missing error codes) is resolved — all error-case rows now carry named codes. CON-2 (unnamed CLI helper) only partially addressed.

- **CON-1 (blocker, contract-mismatch, section: behaviors)** — BEH-7 claims the `.gitignore` edit happens via `lib/gitignore-installer.mjs`, described as append-only, existence-checked, skipping if `.beads/` is already present. The real `ensureManagedBlock(projectRoot)` takes no per-call entry argument — it always splices the entire fixed `MANAGED_GITIGNORE_PATHS` block, which does not contain `.beads/`. There is no mechanism in the named module to add a single conditional entry at call time.
  `blocker_id: consistency-analyzer:contract-mismatch:fc210856`
- **CON-2 (blocker, unspecified-checkpoint-location, section: error-cases)** — `.board-migrate-state.json`'s storage path, `.gitignore` treatment, and write mechanics are never stated. An implementer following "mirror the pattern" with no path given could plausibly place it under `.beads/` itself — deleting the checkpoint in the same step it's meant to survive, defeating its own purpose.
  `blocker_id: consistency-analyzer:unspecified-checkpoint-location:8dd499c6`
- **CON-3** (warning, naming) — `BOARD_MIGRATE_PARTIAL_FAILURE` is confusingly close to the sibling `MIGRATE_PARTIAL_FAILURE` for a semantically distinct failure.
- **CON-4** (suggestion, module-boundary) — Task Map still doesn't name a dedicated implementation module for the `board migrate` verb, unlike the sibling `backend-migration.spec.md`'s explicit `lib/cli/issues-migrate.mjs`.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

**RI-7 (revision-1 blocker): RESOLVED.** The scope note now reads in future tense and accurately reflects that no `beads-board-direct-sync` spec exists yet — confirmed by a fresh search and reading the charter's Capability Map (`Status: —`).

Two new blockers surfaced in revision-2 content, both missing the required `finding_type`/`section_anchor` fields (logged as `LEGACY_REVIEWER_OUTPUT` — excluded from the auto-retry sidecar below, but real findings that must still be addressed):

- **RI-2 (blocker)** — Same underlying issue as CON-1/BD-1: `ensureManagedBlock` doesn't do what BEH-7 claims. Independently confirmed by direct source read.
- **RI-3 (blocker)** — The System Constitution Reference claims `lib/cli/issues.mjs`'s dispatcher has "exactly" 6 subcommands (`migrate`, `claim`, `release`, `stale`, `next`, `show`). The real dispatcher has 8 (`lib/cli/issues.mjs:39-108`) — also `set-modules` and `record-attempt`.
- **RI-1** (suggestion) — The `.migrate-state.json` mirror claim was checked against `backend-migration.spec.md` directly and is accurate.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

No blockers. Confirms WR-4 (revision-1 warning) resolved — `lib/cli/issues.mjs`'s dispatch pattern is real and consistent. WR-3 (revision-1 warning) only partially resolved — same root cause as CON-1/RI-2/BD-1.

- **WR-1** (warning) — `ensureManagedBlock`'s actual API doesn't match the per-path skip-if-present behavior BEH-7 describes.
- **WR-2** (warning) — `.board-migrate-state.json`'s location is unstated; same root issue as CON-2/BD-3.
- **WR-3** (suggestion) — No stated cleanup of `.board-migrate-state.json` after a successful resumed run (the sibling pattern removes it — `backend-migration.spec.md` BEH-18).
- **WR-4** (suggestion) — No dedicated module named for the `board` verb's implementation, mirroring CON-4.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** FAIL

Verified against `lib/gitignore-installer.mjs`, `lib/gitignore-paths.mjs`, `lib/cli/issues-migrate.mjs` (the real `.migrate-state.json` implementation), and `backend-migration.spec.md` in full — the most thorough verification of the four.

- **BD-1 (blocker, unverified-integration-claim, section: behaviors)** — Same mismatch as CON-1/RI-2, confirmed with the most precision: `.beads/` is not in `MANAGED_GITIGNORE_PATHS` (grepped in full), and the write mechanic is a whole-block splice/replace, not a guarded single-line append. Fixing this for real requires an undisclosed cross-spec change (adding `.beads/` to `MANAGED_GITIGNORE_PATHS`, owned by `setup/managed-gitignore-block.spec.md`) that this spec's Task Map never names.
  `blocker_id: boundary-reviewer:unverified-integration-claim:8ff7b6ff`
- **BD-2 (downgraded from revision-1 blocker to warning)** — Real progress: a checkpoint now exists where revision 1 had none. But the mirror to `backend-migration.spec.md`'s pattern is only superficial — that pattern resumes an additive loop of idempotent creates, never a physical delete. Directory removal isn't atomic; a crash mid-removal can leave `.beads/` as a corrupt partial directory that the checkpoint doesn't detect or clean up.
- **BD-3 (new blocker, unstated-artifact-location, section: error-cases)** — `.board-migrate-state.json` has no stated location or git-visibility, and no Task Map line registering it in the managed-gitignore list — unlike its sibling `.migrate-state.json`, which is explicit about both. Given BD-1's finding, there's a real risk this checkpoint gets committed to `main` — ironic for a spec whose whole point is removing board state from `main`'s tracked tree.
  `blocker_id: boundary-reviewer:unstated-artifact-location:ccc81dea`

Items 1–4 (path containment, subprocess interpolation, input trust, privilege posture) pass cleanly, unchanged from revision 1.

## Heuristics — related prior lessons (signature-ranked)

The following heuristics are lessons learned from past work in this module, ranked with any exact matches for this blocker first. They are not necessarily prior occurrences of this blocker. Use them as guidance, not as hard rules.

### Heuristic: A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- **Pattern:** When closing a coverage gap in a spec or acceptance criterion, state the executable check alongside the claim.
- **Anti-pattern:** Answer a repeatedly-missed surface by widening the assertion.
- **Evidence:** 1 observation

*(Identical `_global`-scope entry returned for all four blockers — no signature-specific matches in the store. Not evidence any of these has occurred before.)*

## Summary

**Total findings:** 12 (4 well-formed blockers + 2 legacy-output blockers = 6 blocker-severity findings, 3 warnings, 3 suggestions)
**Action required:** This spec is BLOCKED again. The root cause across CON-1/RI-2/BD-1/WR-1 is one thing: `lib/gitignore-installer.mjs::ensureManagedBlock()` does not support adding a single conditional `.beads/` entry — either `.beads/` needs to be added to `MANAGED_GITIGNORE_PATHS` (a cross-spec change, `setup/managed-gitignore-block.spec.md`) with that dependency named explicitly, or BEH-7/BEH-5 need a different, correctly-described write mechanism. The second root cause across CON-2/BD-3/WR-2 is: `.board-migrate-state.json` needs a stated location (outside `.beads/`) and its own gitignore registration. RI-3's incomplete subcommand list is a one-line fix. Run `/adev:specify --revise` again — this time verify every new source-code claim by reading the actual file before writing it into the spec, not asserting a plausible-sounding API.
