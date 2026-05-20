---
spec: .context-index/specs/features/task-management/backend-migration.spec.md
charter: .context-index/specs/features/task-management/charter.md
verdict: PASS_WITH_NOTES
reviewers:
  - id: structural-architect
    mode: subagent
    profile: reviewer-reasoning
    prompt: plugin:review-specs/structural-architect-prompt.md
    verdict: PASS
  - id: security-reviewer
    mode: subagent
    profile: reviewer-capable
    prompt: plugin:review-specs/security-reviewer-prompt.md
    verdict: PASS_WITH_NOTES
  - id: consistency-analyzer
    mode: subagent
    profile: reviewer-fast
    prompt: plugin:review-specs/consistency-analyzer-prompt.md
    verdict: PASS_WITH_NOTES
last-reviewed-revision: 1
file-sha: 248d569afc291c01908a7ef02003b85d0b1f113edba6143f420b1295309c06f1
review-date: 2026-05-19
---

# Architecture Review: backend-migration

> **Date:** 2026-05-19
> **Spec:** `.context-index/specs/features/task-management/backend-migration.spec.md`
> **Charter:** `.context-index/specs/features/task-management/charter.md`
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS

The spec is structurally sound. API surface is fully covered by existing adapters
(`BeadsAdapter.create`/`createEpic`, `JsonAdapter.create`/`createEpic`, `addDependency`,
`getIssueManager`), all of which were verified to exist in `lib/issues/`. The Procedure
section sequences seven explicit steps with clear early-exit paths (dry-run, NOOP,
partial-failure). Module boundaries are respected: the spec consumes the
`task-management` charter's adapter contracts and defers storage concerns
(`.beads-map.json`, atomic temp-rename, `.migrate-state.json`) to the
`agent-reliable-state-artifacts` charter via explicit cross-references in
Integration Points #5 and the Module Impact Map.

### Findings

- **SA-1** — severity: `suggestion` — Location: Postconditions #6 and Behavior 17/18.
  - **Finding:** The `.migrate-state.json` schema (`{ source, target, last_successful_index, scope_args }`) is documented only in the Idempotency section. Behavior 17 and Postcondition 6 reference the file but do not name its fields, leaving readers to cross-reference.
  - **Recommendation:** Inline the schema reference in Behavior 17 (e.g., "...records `{source, target, last_successful_index, scope_args}` per the Idempotency contract...") so each behavioral When/then is self-contained.

- **SA-2** — severity: `suggestion` — Location: Procedure Step 5.
  - **Finding:** Step 5 says "On success: update `.migrate-state.json` with the new `last_successful_index`". For a 50-item migration this implies 50 atomic writes — fine, but the spec does not state whether the write is performed once per item (durable resume granularity) or batched. The choice is implementation-deferred but the resume guarantee in Postcondition #6 ("aborts mid-migration ... resumes from the next item") is only met if writes are per-item.
  - **Recommendation:** Add one sentence to Step 5: "The state file is written after each successful item creation (per-item granularity guarantees the resume contract in Postcondition #6)."

No blockers. The spec is ready for planning.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

The verb is a local CLI tool with no network surface, no HTTP endpoint, no PII, and
no secrets handling. The threat model is operator-local. The spec inherits
`execFileSync(arg-array)` safety from `BeadsAdapter` (verified at
`lib/issues/beads-adapter.mjs:55`) — no string-interpolated shell calls are
introduced.

### Findings

- **SEC-1** — severity: `warning` — Category: data-exposure — Location: Behavior 17, Error Cases table, Live-Run Output Shape.
  - **Finding:** On `MIGRATE_PARTIAL_FAILURE`, the run JSON includes `errors[]` populated from the underlying adapter's `BEADS_COMMAND_FAILED` error, which by code (`beads-adapter.mjs:62`) carries `err.stderr` verbatim. `br` stderr may include absolute filesystem paths, database paths, or environment-derived hints. The spec does not state whether stderr is forwarded raw or scrubbed before being emitted on stdout/stderr.
  - **Recommendation:** Add an explicit clause to Behavior 17 and the Live-Run Output Shape: stderr from the failing adapter is forwarded unmodified to the operator (consistent with existing `BEADS_COMMAND_FAILED` behavior in `lib/issues/beads-adapter.mjs`). Alternatively, document a redaction policy. Since the verb is operator-local, raw forwarding is acceptable but should be explicit.

- **SEC-2** — severity: `suggestion` — Category: input-validation — Location: Behavior 5, Behavior 6.
  - **Finding:** `--to` is validated against `{json, beads, file}` with `MIGRATE_UNKNOWN_BACKEND` and `--to file` is further rejected with `MIGRATE_TARGET_READONLY`. The spec does not explicitly state that the allowlist comes from `SUPPORTED_BACKENDS` in `lib/issues/registry.mjs` — using that constant (rather than a literal duplicate) closes the drift risk if a future backend is added.
  - **Recommendation:** State that `--to` and `--from` validation reads `SUPPORTED_BACKENDS` from `lib/issues/registry.mjs` (single source of truth). The spec's Integration Points #1 already alludes to this; promote it into the Behaviors section.

No blockers. No authentication, authorization, secrets, or rate-limiting concerns
apply to a local one-shot CLI verb.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

The spec is well-aligned with sibling specs and cross-cutting contracts. Error
code naming (`MIGRATE_*`) matches the existing convention (`UNKNOWN_BACKEND`,
`BEADS_NOT_AVAILABLE`, `BACKEND_READ_ONLY_DEPRECATED`, `PARSE_ERROR`). CLI flag
naming follows established adev conventions. Cross-cutting deferrals (atomic
temp-rename writes to `agent-reliable-state-artifacts`) are explicit.

### Findings

- **CON-1** — severity: `suggestion` — Category: naming — Location: Behavior 9 / Behavior 10.
  - **This Spec:** Lists the passthrough field set as `title, type, priority, notes, epicId, parent_id, planRef, spec_ref, next_action`.
  - **Conflicts With:** Existing field naming in `lib/issues/interface.mjs` and sibling specs mixes camelCase (`epicId`, `planRef`, `planTask`) and snake_case (`parent_id`, `spec_ref`, `next_action`).
  - **Recommendation:** This drift is documented in the `unified-create-api.spec.md` migration notes (legacy fields kept in camelCase, new fields adopt snake_case). No change needed in this spec — but adding one sentence noting "field naming follows the mixed-convention documented in `unified-create-api.spec.md`" would help future readers.

- **CON-2** — severity: `suggestion` — Category: contract — Location: Behavior 6 ("`--to file` is supplied"), Error Cases table.
  - **This Spec:** Rejects `--to file` at the migrate verb level with `MIGRATE_TARGET_READONLY`.
  - **Conflicts With:** `lib/issues/registry.mjs` still accepts `file` as a configured backend (with a deprecation warning) and the `FileAdapter` throws `BACKEND_READ_ONLY_DEPRECATED` only on writes — there is no registry-level rejection.
  - **Recommendation:** This is an intentional, narrower contract at the migrate verb (refusing the read-only-deprecated backend as a target), which is consistent with the spirit of the deprecation. No change required, but a one-line cross-reference in the spec ("the verb is stricter than the registry: it refuses `file` as a target outright rather than letting the FileAdapter's write methods throw") would clarify the intent.

- **CON-3** — severity: `suggestion` — Category: domain-model — Location: Postcondition #1, in-scope filter.
  - **This Spec:** Default in-scope filter is `status ∈ {open, in_progress, deferred}`; `--include-closed` includes all statuses.
  - **Conflicts With:** The charter's Domain Model lists status values as `open, in_progress, closed, deferred`. The spec's default-scope set is correct (exclude `closed`).
  - **Recommendation:** None. Confirmed aligned. Listed only to record the cross-check.

No naming, pattern, contract, or terminology blockers. The spec composes cleanly
with `backend-adapters.spec.md`, `unified-create-api.spec.md`, and the
`agent-reliable-state-artifacts` charter.

---

## Summary

**Total findings:** 7 (0 blockers, 1 warning, 6 suggestions)
**Action required:** Spec passes review with notes. The author may proceed to
`/adev:plan` and address SA-1, SA-2, SEC-1, SEC-2, CON-1, CON-2, and CON-3
either inline in the spec or in the implementation plan. SEC-1 (warning) is the
most impactful — document whether `br` stderr is forwarded raw on
`MIGRATE_PARTIAL_FAILURE` — but is not blocking.

**Governance note:** No `spec-to-plan` `approver_role` is configured in
`.context-index/governance/gates.yaml`. Risk-level `medium` requires review
(satisfied here) and does not require human-in-the-loop approval.
