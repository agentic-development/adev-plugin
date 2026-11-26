---
spec: .context-index/specs/features/task-management/github-board-backend.spec.md
charter: .context-index/specs/features/task-management/charter.md
verdict: BLOCK
tier: full
date: 2026-11-25
last-reviewed-revision: 1
file-sha: be052bbce79870140b4ddacc0949a3d054f6dca7972bd757a51eba9db21a5965
---

# Architecture Review: github-board-backend

> **Date:** 2026-11-25
> **Spec:** .context-index/specs/features/task-management/github-board-backend.spec.md
> **Charter:** .context-index/specs/features/task-management/charter.md (revision 10)
> **Verdict:** BLOCK
> **Rigor tier:** full (risk_level: high → `review_mode: full`)
> **Diff scope:** first review — full context
> **Registry warnings:** `BROADEN_TOOL` ×2 and `BROADEN_NETWORK` for profile `browser-review` (not used by any dispatched reviewer)
> **Dispatch note:** each reviewer received its prompt verbatim from `adev governance dispatch` (`buildDispatchPlan` → `buildReviewerDispatches`), delivered as a file the reviewer read in full, because the five prompts total ~950 KB.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-capable | registry prompt (via `adev governance dispatch`) |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | registry prompt (via `adev governance dispatch`) |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | registry prompt (via `adev governance dispatch`) |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | registry prompt (via `adev governance dispatch`) |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | registry prompt (via `adev governance dispatch`); triggered, score 2 ≥ 1 |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | disabled in `.context-index/governance/review.yaml` (no reason surfaced by the registry envelope) |
| security-reviewer | disabled in `.context-index/governance/review.yaml` (no reason surfaced by the registry envelope) |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** FAIL

- **CON-1** (blocker, contract, `behaviors-16`, finding_class: decision) — BEH-16 lets `update(id, {status: "closed"})` follow `close()` semantics and lets a closed → other status change reopen the issue. `issue-epic-crud.spec.md` Error Cases (`update()` on closed issue → `ISSUE_CLOSED`; `update()` setting `closed` → `USE_CLOSE_METHOD`) and `interface.mjs::validateStatusTransition` say otherwise, and BEH-37's github-only differences omit reopen. Decision: conform to the shared contract, or keep reopen as a documented github difference and amend `issue-epic-crud.spec.md`.
- **CON-2** (warning, naming) — Spec config keys (`fields`, `claim_settle_ms`; no `status_field`, no type-source key) differ from the charter's `GithubBoardConfig` / `tasks.github.*` list. Reconcile both, and state whether `status_field` is configurable.
- **CON-3** (warning, contract) — BEH-32 / Postcondition 4 claim parity with a manifest-flip prompt; `backend-migration.spec.md` Behaviors 5 and 19 say the manifest is never written, even under `--auto`. (Same root cause as RI-1.)
- **CON-4** (warning, pattern) — BEH-29–31 make `legacy_id` the only idempotency source but say nothing about the `--to` allow-list (`MIGRATE_UNKNOWN_BACKEND`) or `.migrate-state.json` resume state in `backend-migration.spec.md`. State both and amend that spec.
- **CON-5** (suggestion) — State that `claim()` returns the same `takeover` object on a stale takeover as the json adapter, and list the delayed `branch`/`pr` write among the documented claim differences.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

- **RI-1** (blocker, misdescribed-cli-behavior, `behaviors-32`, finding_class: decision) — "prompts before flipping `tasks.backend` … exactly as the existing verb does": `lib/cli/issues-migrate.mjs:710-725` never writes the manifest, even under `--auto`, and has no prompt code. Decision: keep the never-write rule (print the suggestion), or add a confirmed github-only manifest flip and amend backend-migration Behavior 19.
- **RI-2** (warning) — Preconditions: "the operator has confirmed the run (or passed `--auto` …)" — the existing verb has no run-confirmation step and `--auto` changes nothing. Drop or specify.
- **RI-3** (warning) — `status_field` (charter `charter.md:54`, `:113`) is never defined in the spec; BEH-38's "every key" docs requirement misses it.
- **RI-4** (warning) — BEH-34 has `get()` throw `NOT_FOUND`, but the contract returns `Issue|null` (`json-adapter.mjs:1140-1143`). `get()` should return `null`; mutating methods throw `NOT_FOUND`.
- **RI-5** (suggestion) — `legacy_id` and `affected_modules` are not in the `Issue` typedef or `validateIssue`'s whitelist (`interface.mjs:10-31`, `:454-475`), which silently drops unknown fields. State the typedef/whitelist change.
- **RI-6** (suggestion) — BEH-21: `requireClaimable(issue, owner, { ttlMs, now })` takes `ttlMs`; write "with `ttlMs` derived from `claimTtlMinutes`".

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

- **WR-1** (warning) — The read-only marker (BEH-32 → BEH-33) has a named consumer but no defined location/format and no task for the json/beads adapter guard; add a task, define the format (json and beads), and add a migrate-then-write wiring test.
- **WR-2** (warning) — Adding `github` to `SUPPORTED_BACKENDS` changes `issues-migrate.mjs` `--to`/source validation, but `backend-migration.spec.md` is not amended and the github dispatch point, preflight/`setup --check` hook, and relation to `.migrate-state.json` are unstated. Add a wiring test through the real verb.
- **WR-3** (suggestion) — No task registers the `github` branch in the `lib/cli/issues.mjs` dispatcher; add it plus a `setup --check` test through the dispatcher.
- **WR-4** (warning) — `GITHUB_PARTIAL_CREATE`'s payload has no named consumer; name the callers (e.g. migrate resume) and test their behavior.
- **WR-5** (warning) — BEH-38's "every error code documented" claim has no executable check; add a test extracting the codes and grepping `docs/` (matches the module heuristic on coverage predicates).
- **WR-6** (suggestion) — BEH-20 fences only four verbs; list every render/prompt site (bugfix-loop prompts, `adev issues stale`) or state the four are exhaustive.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** FAIL

- **BD-1** (blocker, subprocess-interpolation, `behaviors-13`, finding_class: defect) — The value channel to `gh api graphql` is unspecified. `gh -F` reads `@<path>` values as local files, so a title or note `@/path/to/secret` would upload that file; interpolating values into the GraphQL document is a string-built command. Require a constant GraphQL document with all values as variables via raw `-f` or `--input -` (JSON on stdin), never `-F`; test `@`-prefixed and shell-metacharacter values transmit literally; transport accepts no caller-supplied argv tokens.
- **BD-2** (warning) — Decoded GitHub field values (`owner`, `next_action`, `spec_ref`, `planRef`, `branch`, `pr`, `legacy_id`, `module:`/`type:`/`priority:` labels) need per-field refuse-don't-sanitize validation on read (e.g. `GITHUB_INVALID_FIELD_VALUE`); `module:` slugs must match manifest slugs or reserved tags — say whether unknown ones are dropped or refused.
- **BD-3** (warning) — Path-typed fields (`spec_ref`, `planRef`) and the fixture recorder's output path need `assertContained`; URL normalization in BEH-6 needs a host check (`github.com`, matching owner/repo).
- **BD-4** (warning) — BEH-34: refuse resolution when two items share a `legacy_id` (e.g. `GITHUB_AMBIGUOUS_LEGACY_ID`) and reject `legacy_id` values that are not legacy-grammar IDs.
- **BD-5** (warning) — Migration publishes previously local notes; preflight should read repo/project visibility and the confirmation/`--dry-run` should print it with the count of notes published. Add a fixture-lint test for token patterns and non-allowlisted logins.
- **BD-6** (suggestion) — State that `--auto` is never inherited from config or a prior run, and that setup and migration print their full write set once before any write.
- **BD-7** (warning) — The read-only marker must be a separate sentinel file or an additive field written via the existing CAS/atomic-rename path, never a rewrite of board content; state its path containment.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS_WITH_NOTES

- **TR-1** (suggestion) — BEH-22: replace "backing off the same way" with "throws `ISSUE_ALREADY_CLAIMED` as above"; optionally cap `claim_settle_ms`.
- **TR-2** (warning) — Pagination (BEH-10/11) has no cap-trip verdict for a repeated cursor or a page count beyond expectation; throw a named code with no partial result.
- **TR-3** (warning) — Migration rate-limit waits (BEH-35) are bounded per wait but not in total; state a maximum cumulative wait or pause count per run, the `--auto` rule, and define "rate-limit pacing".
- **TR-4** (warning) — Migration's per-item loop doesn't say whether a `GITHUB_WRITE_FAILED` / `GITHUB_PARTIAL_CREATE` stops the run or is skipped; state that any per-item write error stops the run resumably, and that replay runs only after all items exist.

## Heuristics — related prior lessons (signature-ranked)

The following heuristics are lessons learned from past work in this module, ranked with any exact matches for this blocker first. They are not necessarily prior occurrences of this blocker. Use them as guidance, not as hard rules.

- *A universal coverage claim must ship with the predicate that checks it* (medium) — directly relevant to WR-5.
- *Use session JSONL for token measurement, not file-size estimates* (medium).
- *Cache reads are 71% of session cost — minimize context accumulation* (medium).

No exact signature match was returned for any of the three blockers.

---

## Summary

**Total findings:** 30 (3 blockers, 18 warnings, 9 suggestions)
**Blockers:** `boundary-reviewer:subprocess-interpolation:ddb9cac3` (BD-1, defect), `consistency-analyzer:contract:3efa0855` (CON-1, decision), `referent-integrity:misdescribed-cli-behavior:d976fd3e` (RI-1, decision) — see `github-board-backend.blockers.md`.
**Action required:** Resolve the two decision blockers (CON-1, RI-1) with the maintainer, fix BD-1, then `/adev:specify --revise .context-index/specs/features/task-management/github-board-backend.spec.md` and re-run `/adev:review-specs`. Most warnings share root causes with the blockers (CON-3 = RI-1; WR-2 + CON-4 = an amendment of `backend-migration.spec.md`; WR-1 + BD-7 = the read-only marker definition) and should be folded into the same revision.
**Governance:** risk policy `high` requires review and HITL approval before planning.
