---
spec: .context-index/specs/features/task-management/backend-migration-rev-3-github-target.spec.md
charter: .context-index/specs/features/task-management/charter.md
verdict: BLOCK
tier: full
date: 2026-11-26
last-reviewed-revision: 1
file-sha: a0f9d8454fabb03a9f3d984ffcb48c15a5a114a2d5054705c659343e4010a8ab
---

# Architecture Review: backend-migration-rev-3-github-target

> **Date:** 2026-11-26
> **Spec:** .context-index/specs/features/task-management/backend-migration-rev-3-github-target.spec.md (revision 1; amends backend-migration.spec.md, target revision 3)
> **Charter:** .context-index/specs/features/task-management/charter.md (revision 10)
> **Verdict:** BLOCK
> **Rigor tier:** full (risk_level: high → `review_mode: full`)
> **Diff scope:** not scoped (`first-review`), full spec body delivered
> **Registry warnings:** `BROADEN_TOOL` ×2 and `BROADEN_NETWORK` for profile `browser-review` (no dispatched reviewer uses it)
> **Dispatch note:** each reviewer's prompt was assembled by `buildReviewerDispatches` (`lib/governance/dispatch-shape.mjs`) and delivered as a file the reviewer read in full, because the four prompts total ~865 KB. Model tiers: consistency-analyzer, wiring-reviewer and boundary-reviewer on `capable` (Sonnet); referent-integrity on `reasoning` (Opus).
> **Governance:** risk policy `high` sets `require_hitl_approval: true`, so a human must approve before `/adev:plan`.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-capable | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |

Not dispatched: `termination-reviewer` (triggered, score 0 < 1: no loop, retry or poll keywords in the spec).

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk; still resolvable for any project whose materialized review.yaml already names it. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via adev extension install web-service) where it fits the artifact class. Prompt retained on disk. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1 (warning, adr-compliance, `abort-envelope` / BEH-6):** BEH-6 redacts token-like material from every stdout/stderr message on the github path and says this does not contradict ADR 0014. But ADR 0014's Decision ("The `adev issues migrate` verb forwards `br` stderr verbatim ... no field-level redaction") is worded at verb level. Only its Context and Alternatives scope it to `br`. A reader of the ADR alone sees an undocumented exception. Recommendation: add a one-line scoped-exception note to ADR 0014 that points at BEH-6, the same pattern ADR 0016 used on 2026-11-26.
- **CON-2 (suggestion, contract, `behavioral-delta`):** base Behaviors 5 and 6 and 20–27 (claim lease) are not classified for a github target. Add 5 and 6 to the "apply unchanged" list, and add one sentence saying 20–27 are independent of migration.
- **CON-3 (suggestion, naming, `resume-ownership`):** BEH-4 cites "base Procedure Step 2" for `MIGRATE_RESUME_MISMATCH` and `MIGRATE_RESUME_INVALID`. The base spec names neither code. They exist only in `lib/cli/issues-migrate.mjs`. Reword the citation to point at the implementation.
- **CON-4 (suggestion, terminology, `behavioral-delta`):** the amendment's BEH-1..10 share an unprefixed ID namespace with the GitHub spec's BEH-1..41 in the same charter. The convention is documented, so this is a readability risk only. Consider an amendment-local prefix.

Confirmed consistent: GitHub spec BEH-29..32, 35 and 41 against amendment BEH-1/3/4/7/8/9. Sentinel paths, five keys, `SENTINEL_PATH_UNSAFE`, temp-rename and the commit rule against agent-reliable-state-artifacts charter rev 9. ADR 0016 external-board exception. Charter rev 10. `target-revision: 3`.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

- **RI-1 (blocker, misdescribed-existing-check, `acceptance-criteria`):** the Resume (BEH-4) acceptance criterion expects a state file recording `--include-closed`, re-run without it, to exit 1 with `MIGRATE_RESUME_MISMATCH`. BEH-4 presents this as an existing check that "still runs". In `lib/cli/issues-migrate.mjs`, lines 329–337 throw `MIGRATE_RESUME_MISMATCH` only when source or target differ. Lines 340–354 handle a `scope_args.includeClosed` mismatch with a `console.error` warning and continue. The base spec's Idempotency section says a scope mismatch is refused, but the code never refused it. As written, the AC cannot pass under BEH-4. Recommendation: either make the refusal an explicit new behavior in this delta (scope_args mismatch → `MIGRATE_RESUME_MISMATCH`, at least for github), or change the AC to use a source/target mismatch or to assert the existing warning.
- **RI-2 (warning):** the spec calls `lib/issues/github/migrate.mjs` an "existing .mjs module". It does not exist yet: plan Task 18 creates it. The seam grep AC currently exits 2.
- **RI-3 (warning):** the AC preamble says `cli/index.mjs` dispatches `adev issues migrate` to `run()`. The real dispatcher is `lib/cli/issues.mjs:114-117`, which passes only `projectRoot`, `argv` and `manifest`.
- **RI-4 (warning):** the plan's Task 18 test sketch passes a sixth `log` seam that the BEH-10 seam table does not list.
- **RI-5 (suggestion):** the snake_case envelope keys (`reset_at`, `target_id`, `unwritten_fields`) do not match the source field names (`resetAt` in `transport.mjs:78`). State the mapping.
- **RI-6 (suggestion):** BEH-6's literal-token redaction applies "when set and non-empty". The existing `redact()` in `lib/issues/github/errors.mjs` has an 8-character floor and no Authorization pattern. Name `redact()` and reconcile the two.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

- **WR-1 (blocker, write-only-state, `resume-ownership`):** on the github path, `.migrate-state.json` gets `last_successful_index` written after each successful item (BEH-4, atomic temp-rename). Nothing consumes it. BEH-4 says it "never decides which items are skipped" and is "for progress reporting only", but names no reporter. The resume-argument checks read the file's other keys (source, target, scope_args). They do not read the index. The resume AC proves the file can be ignored, not that anything reads the index. Recommendation: either name the progress-reporting consumer (a verb or an output line) and test it, or state that the github path does not write `last_successful_index`.
- **WR-2 (warning, `test-seams`):** the spec does not say how `exec`, `sleep` and `now` reach the adapter that `getIssueManager(manifest)` builds, or `lib/issues/github/migrate.mjs`. Name the receiving module for each seam, and add one wiring test in which an injected `exec` observes the preflight request.
- **WR-3 (warning, `dry-run-and-success-output`):** no module is named as owner of the sentinel writer. No criterion here checks that the sentinel blocks a later json or beads write (that check exists only in the GitHub spec). Name the owner, and add a cross-reference or an end-to-end "migrate, then a write throws" check.
- **WR-4 (warning, `abort-envelope`):** errors[] and the `github` output objects have no named consumer. If the operator is the intended consumer, say so. Also say whether a re-run's `legacy_id` lookup, rather than the operator, consumes `target_id`.
- **WR-5 (suggestion):** state whether `MIGRATE_CONFIRMATION_REQUIRED` and the changed `MIGRATE_UNKNOWN_BACKEND` text go into `docs/troubleshooting.md` and `docs/cli-reference.md`.
- **WR-6 (suggestion):** name the single output chokepoint for BEH-6 redaction.
- **WR-7 (suggestion):** cite `tests/issues/github/replay-transport.mjs` (GitHub plan task 12) as a prerequisite in Notes for Planning.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

- **BD-1 (warning, privilege-escalation, BEH-3):** on a non-interactive run without `--yes`, "Nothing left to do" skips confirmation, and BEH-8 then writes the read-only sentinel. That retires the local board with no consent from this run, and consent is never persisted. Recommendation: require `--yes` or an interactive confirmation whenever the sentinel is about to be created.
- **BD-2 (warning, input-trust, BEH-4):** "already present" relies on a `legacy_id` match alone. Two boards with colliding flat IDs migrated into one project would produce a false match, an `id_map` entry pointing at the wrong issue, and a retired source board. Require an unambiguous single match, or record board identity in the Legacy ID value or the sentinel.
- **BD-3 (warning, artifact-leakage, BEH-8):** BEH-8 leaves an existing sentinel byte-identical but does not say what happens when its recorded project differs from the current target. It also does not resolve the sentinel root under a linked `.beads/` worktree or a `resolveStorageRoot()` redirect. Refuse on a project mismatch, and say the sentinel root is the `resolveStorageRoot()`-resolved board root.
- **BD-4 (suggestion, BEH-7):** source titles and notes go to GitHub verbatim, possibly to a public repo. The disclosure could count the items whose notes will be published, and optionally scan for token patterns before publishing.
- **BD-5 (suggestion, BEH-6):** apply literal-token redaction only above a minimum length, and neutralize control or ANSI characters in echoed source IDs and messages.

Checklist: path containment, subprocess interpolation and destructive ops are consistent, apart from the gaps noted above.

## Heuristics: related prior lessons (signature-ranked)

The following heuristics are lessons learned from past work in this module, ranked with any exact matches for this blocker first. They are not necessarily prior occurrences of this blocker. Use them as guidance, not as hard rules.

- A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- Cache reads are 71% of session cost: minimize context accumulation (confidence: medium)

---

## Summary

**Total findings:** 22 (2 blockers, 10 warnings, 10 suggestions)
**Blockers (see `backend-migration-rev-3-github-target.blockers.md`):**
- `wiring-reviewer:write-only-state:d325cfe1`: WR-1, `last_successful_index` is written per item on the github path but nothing reads it.
- `referent-integrity:misdescribed-existing-check:dc99bcf0`: RI-1, the resume AC expects `MIGRATE_RESUME_MISMATCH` on a scope mismatch, but the existing check only warns.

**Action required:** run `/adev:specify --revise` on this amendment to resolve WR-1 and RI-1, then re-run `/adev:review-specs`. Address the boundary warnings BD-1 to BD-3 and CON-1 (ADR 0014 scoped-exception note) in the same revision where practical.
