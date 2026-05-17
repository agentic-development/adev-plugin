---
spec: .context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md
charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md
verdict: PASS
date: 2026-05-17
last-reviewed-revision: 2
file-sha: 2244a7e175a4351a52cdce59e6b68744f9e4405911d6d9313c9ed0ca9bcb0273
---

# Architecture Review: concurrent-write-protection (revision 2)

> **Date:** 2026-05-17
> **Spec:** `.context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md` (revision 2)
> **Charter:** `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` (rev 6, approved; spec filed as `charter-extension: true`)
> **Verdict:** **PASS** (0 blockers, 0 warnings, 0 new suggestions)
> **Risk policy:** `high` — `require_hitl_approval: true` per `.context-index/governance/risk-policies.yaml`. User approval required before `/adev:plan`.
> **Previous review:** revision 1 returned PASS_WITH_NOTES (5 warnings, 9 suggestions). All warnings and 3 of 4 high-value suggestions addressed in revision 2.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer    | Security Reviewer    | subagent | reviewer-capable   | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast      | plugin:review-specs/consistency-analyzer-prompt.md |

---

## Structural Architect (structural-architect)

**Verdict:** PASS (all rev-1 findings RESOLVED, 0 new findings)

### Resolutions

| Finding | Status | Verification |
|---|---|---|
| SA-1 (caller-visible non-determinism on `create()` return) | RESOLVED | New Postconditions bullet explicitly names `create()`, states returned `Issue.id` is whatever the successful write stamped, identifies `_nextIssueId`/`nextChildId` as the derivation surface, instructs callers to use return value as source of truth. Wording is precise and actionable. |
| SA-2 (dead "id collision under retry" error case row) | RESOLVED | Replacement row scopes the failure to caller-supplied explicit `id` on `create()` colliding with a competing allocation; routes to the pre-existing `ID_MISMATCH` guard rather than inventing a new code; acknowledges retry budget is still consumed. Real, distinct failure mode. |
| SA-3 (TOCTOU honesty in behavior 8) | RESOLVED | Behavior 8 now states each operation has an observable outcome (commit or `STALE_BOARD_WRITE`), explicitly disclaims strict POSIX rename atomicity, frames the guarantee as "no silent loss." Constitution Reference paragraph reiterates "CAS is best-effort under POSIX rename semantics" and pushes stronger guarantees to flock/DB-backed adapters as out of scope. Acceptance criterion mirrors the weakened contract. |
| SA-4 (split `_read()`) | RESOLVED | Task Map "Split read primitive" row keeps `_read()` shape-stable for read-only call sites (`list`/`get`/`listEpics`/`walkTree`) and introduces `_readWithSeq()` returning `{ board, seq }` for mutators only. Acceptance criterion enforces both. |
| SA-5 (top-level-unknown-key drop in sibling spec) | RESOLVED | Constitution Reference bullet names sibling spec, identifies exact rule being amended, specifies new canonical schema `{version, seq, epics[], issues[]}`, commits to lockstep amendment with paired `Spec:` trailer. Acceptance criterion enforces the lockstep edit. Task Map schedules the work. |
| SA-6 (deprecated createEpic/updateEpic count) | RESOLVED | Behavior 1, acceptance criterion, and Task Map all enumerate exactly the six methods. Confirmed against `lib/issues/json-adapter.mjs` (lines 384, 474, 501, 572, 584, 604): exactly six mutating public methods. |

### Rename Audit

Scanned the full spec for stale `revision` references in CAS contexts. Only remaining `revision` tokens are: (a) frontmatter `revision: 2`, (b) `charter-revision: 6`, (c) terminology note that explicitly disambiguates the three uses, (d) comment block reference to "charter revision 7" follow-up sweep. All CAS-mechanism references uniformly use `seq`. Error codes consistently use `STALE_BOARD_WRITE`, `INVALID_BOARD_SEQ`, `STALE_BOARD_WRITE_RETRY` throughout. No leftover `STALE_WRITE`, `INVALID_REVISION`, or bare `revision` in CAS context. Rename is clean.

### New Findings

None. The spec is structurally sound: contracts match mechanism, cross-spec amendment is declared with a paired acceptance criterion, read primitive split is captured, mutator count is correct and consistent, rename is uniform. No regressions introduced.

---

## Security Reviewer (security-reviewer)

**Verdict:** PASS (SEC-1 RESOLVED, 0 new findings)

### Resolution

| Finding | Status | Verification |
|---|---|---|
| SEC-1 (bound `seq` integer at `Number.MAX_SAFE_INTEGER`) | RESOLVED | Error Cases table row for `INVALID_BOARD_SEQ` includes upper bound check; error message explicitly does NOT echo the offending value (routed through existing `safePrefix` / `MALFORMED_BOARD` sanitization); matching acceptance criterion added ("Hostile-seed test demonstrates that `seq > Number.MAX_SAFE_INTEGER` produces `INVALID_BOARD_SEQ` without echoing the value"); Task Map row "Hostile-seed test" added. All four resolution checkpoints satisfied. |

### Fresh pass on rev-2 changes (threat model unchanged: local-developer CLI, no network surface, trust principal is the developer)

1. **`create()` non-deterministic ID postcondition.** No data-exposure concern. The "predicted ID" is derived from `_nextIssueId` / `nextChildId` on a snapshot the caller already read — no secret in the ID space (monotonic integers/child indices), no trust boundary crossed by the divergence. A caller logging a pre-write predicted ID leaks only their own intent. No finding.

2. **`STALE_BOARD_WRITE` message fields.** All four fields (op name enum, captured seq int, current seq int, retry count int ≤ 3) are bounded primitives drawn from a closed set. Op name is enum of six mutator names; seqs are integers bounded by `INVALID_BOARD_SEQ` check at read time; retry count bounded by `MAX_CAS_RETRIES`. Spec explicitly forbids filesystem paths and document contents in the message. No leakage path. No finding.

3. **`ID_MISMATCH` re-thrown after retry (explicit caller-supplied `id` collision row).** The retry path consumes up to `MAX_CAS_RETRIES` budget even when failure is deterministic `ID_MISMATCH` rather than stale-seq conflict. Minor wasted-work concern but not security one in local-CLI threat model: caller is the developer, no remote attacker to cheaply burn budget, upper bound trivial. Existing `ID_MISMATCH` guard is same code path used today, no new trust boundary or input surface. No finding.

### New Findings

None. The rev-2 changes (rename `revision → seq`, BOARD_*-prefixed error codes, `create()` postcondition clarification, explicit `ID_MISMATCH` row, SEC-1 bound + sanitization) are all hardening or clarification edits within the existing trust boundary. No new authentication, authorization, data-exposure, input-validation, secrets, or rate-limiting surface introduced.

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS (all rev-1 findings RESOLVED, 0 new findings)

### Resolutions

| Finding | Status | Verification |
|---|---|---|
| CON-1 (`revision` collision) | RESOLVED | CAS counter is consistently `seq` throughout spec body, error codes, schema diagram, tasks, acceptance criteria. Zero leftover CAS-context `revision` references in new prose. The four remaining `revision` occurrences are in disjoint semantic domains (frontmatter spec doc version, charter-revision, "in revision 7" follow-up reference, terminology disambiguation note). |
| CON-3 (subject-first error naming) | RESOLVED | `STALE_BOARD_WRITE`, `STALE_BOARD_WRITE_RETRY`, `INVALID_BOARD_SEQ` match the established `BOARD_*` family in `json-issue-board-adapter.spec.md`. Internal/external distinction for `STALE_BOARD_WRITE_RETRY` is now explicit ("internal control flow; callers do not observe it"). |
| CON-4 (JSONL vs JSON divergence) | RESOLVED | New bullets under Constitution Reference correctly contrast append-only writes (lost-update-safe by construction; PIPE_BUF bounds interleaving, not overwriting) with whole-document rewrites (need CAS). Matches `lifecycle-event-log.spec.md` PIPE_BUF/O_APPEND claim verbatim. "Best-effort under POSIX rename" caveat preserved and integrated. |
| CON-5 (`_read`/`_write` external-caller cross-check) | RESOLVED | New task specifies grep targets (`lib/**`, `tests/**`, `cli/**`, `hooks/**`, `viz/**`, `providers/**`) and regex (`\._read\(|\._write\(`). Paired acceptance criterion asserts zero matches outside adapter file. Approach is sound. |
| CON-6 (manifest knob) | RESOLVED | `tasks.cas_max_retries` (default 3) added in both task table and acceptance criterion, with explicit citation of `lifecycle.gate_mode` / `tasks.legacy_read` precedent. Naming matches established convention. No conflict with existing manifest schema. |
| CON-2 / CON-7 | NO REGRESSION (intentionally deferred) | `MAX_CAS_RETRIES` constant naming and absent size cap on `tasks.json` remain as in rev 1. Neither is referenced inconsistently across the spec; leaving them is internally coherent. |

### New Findings

None. Specifically: rename to `seq` introduces no leftover `revision` references in CAS context. `seq` does not collide with any field name in sibling specs (JSONL spec uses `ts`/`event`; no `seq` overlap). Cross-spec amendment paragraph correctly identifies the exception to `json-issue-board-adapter.spec.md`'s "top-level unknown keys dropped on write" rule and commits to handling it in lockstep — correct mechanism since the sibling spec is `status: validated`. Error-code style alignment with `lifecycle-event-log.spec.md` (`LOG_TOO_LARGE`, `EVENT_TOO_LARGE`, `GATE_BLOCKED`) is now consistent. The `_readWithSeq()` addition does not conflict with any existing public-surface method name.

---

## Summary

**Total findings (revision 2):** 0 (down from 14 at revision 1).

| Reviewer | Verdict (rev 2) | Verdict (rev 1) | Findings resolved |
|---|---|---|---|
| Structural Architect | PASS | PASS_WITH_NOTES (3W, 3S) | SA-1, SA-2, SA-3, SA-4, SA-5, SA-6 |
| Security Reviewer    | PASS | PASS (0W, 1S)            | SEC-1 |
| Consistency Analyzer | PASS | PASS_WITH_NOTES (3W, 4S) | CON-1, CON-3, CON-4, CON-5, CON-6 |
| **Consolidated**     | **PASS** | **PASS_WITH_NOTES**  | **All warnings + 3 of 4 high-value suggestions** |

**Intentionally deferred suggestions (no regression):**
- CON-2: `MAX_CAS_RETRIES` constant naming (rev-1 suggestion was that `MAX_WRITE_RETRIES` is "also acceptable" — kept as-is)
- CON-7: tasks.json size cap (rev-1 suggestion was explicitly "out of scope for this spec")

**Action required:** The spec is clean and ready to proceed to `/adev:plan`. Risk-policy `high` requires user approval; user authorized continuation via "Now run the adev build command full" (2026-05-17).

### Risk-Policy / Approval Footer

- **Risk level:** `high` (declared in spec frontmatter)
- **Policy:** `require_review: true`, `require_hitl_approval: true`
- **Required approver:** (none declared in `.context-index/governance/gates.yaml` `spec-to-plan`)
- **Approval recorded:** user-authorized 2026-05-17 via build-pipeline directive.
