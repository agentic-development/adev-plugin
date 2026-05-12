# Architecture Review: milestones-migration

> **Date:** 2026-05-11 (round 2)
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/milestones-migration.spec.md
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Verdict:** PASS

last-reviewed-revision: 2
file-sha: 66d2b70e94b7b3539c91dbef3f3f96de975102a3

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Round 1 → Round 2

Rev 1 returned BLOCK due to CON-1 (the consistency reviewer tagged `tasks.db_path` semantic ambiguity as blocker; the reviewer's own summary contradicted this, calling the spec PASS_WITH_NOTES). Rev 2 added the worked example, fixed CON-2 wording, pinned `loadMilestones` as synchronous (CON-5), strengthened SEC-1 storageRoot containment, and pinned the temp-file naming (SEC-2). This round-2 review verifies fixes and confirms the spec is unblocked.

## Structural Architect (structural-architect)

**Verdict:** PASS

### Rev-1 Resolution Audit

- **SA-1 (suggestion, worktree-local YAML lifecycle):** RESOLVED — Postconditions + AC + Preconditions together cover the case. `lib/milestones.mjs` always resolves via `resolveStorageRoot` and never reads YAML.
- **SA-2 (suggestion, SKILL.md boundary):** RESOLVED — AC cleanly separates code consumers (`lib/deploy.mjs`) from skill prose (delegated to the cross-cutting skill-cleanup spec).
- **SA-3 (suggestion, worktree-collapse impact):** RESOLVED — Worktree Behavior Decision explicitly states the migration tool detects the worktree-only case and copies to main repo.

### Cross-Spec Consistency of the `tasks.db_path` Worked Example

The worked example appears in three locations and is technically correct against `lib/issues/resolve-root.mjs` (which returns `dbPath` directly as the storage root):

| Location | Input | tasks.json output | milestones.json output |
|---|---|---|---|
| Worktree Behavior Decision | `/Users/alice/work/sharedstate` | `/Users/alice/work/sharedstate/.context-index/tasks/tasks.json` | `/Users/alice/work/sharedstate/.context-index/milestones.json` |
| Acceptance Criteria test | `/tmp/adev-shared-XYZ` | `/tmp/adev-shared-XYZ/.context-index/tasks/tasks.json` | `/tmp/adev-shared-XYZ/.context-index/milestones.json` |
| Behaviors row | `/Users/alice/work/sharedstate` | `/Users/alice/work/sharedstate/.context-index/tasks/tasks.json` | `/Users/alice/work/sharedstate/.context-index/milestones.json` |

All three apply the same rule (`<db_path>/.context-index/<artifact>`). Byte-consistent across locations.

### New Findings (rev 2)

No new findings.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

### Rev-1 Resolution Audit

- **SEC-1 (warning, storageRoot positive containment):** RESOLVED — Path Safety item 2 requires `fs.statSync(resolvedStorageRoot).isDirectory() === true`; AC and Error Cases include `/etc/passwd` rejection test.
- **SEC-2 (suggestion, temp-file naming):** RESOLVED — Path Safety item 3 pins shape to `<finalPath>.<crypto.randomBytes(4).toString('hex')>.tmp` matching `lib/build-state.mjs::atomicWriteJson`. 8 hex chars provide entropy against case-insensitive-FS collision.
- **SEC-3 (suggestion, path leakage in errors):** NOT ADDRESSED — Error Cases still embed resolved path in `INVALID_PROJECT_ROOT` / `INVALID_STORAGE_PATH` messages. Sibling lifecycle-event-log keeps paths off user-facing messages. Carry forward as suggestion; spec author may either align with sibling or document acceptable-for-operator-local.
- **SEC-4 (suggestion, stale-YAML signal):** NOT ADDRESSED — AC states YAML is "ignored and untouched" but emits no user-facing warning pointing to the migration tool. Confused-deputy window remains. Carry forward as suggestion.
- **SEC-5 (suggestion, free-text untrusted):** NOT ADDRESSED — No producer-side declaration on `defer_reason` / `ship_criteria[].confirm` as untrusted text. Cross-reference into the rendering layer / skill-cleanup spec recommended. Carry forward as suggestion.
- **SEC-6 (suggestion, git-trust inheritance):** NOT ADDRESSED — Worktree Behavior Decision doesn't document milestone integrity inherits `resolveStorageRoot`'s `execFileSync('git')` trust boundary. Carry forward as suggestion.

### New Findings (rev 2)

### Finding SEC-7

- **Severity:** suggestion
- **Category:** path-traversal (TOCTOU)
- **Location:** Path Safety item 3 — realpath-prefix containment check.
- **Finding:** The realpath-prefix check is performed once at write time, then the temp-file write + rename happens. Between the check and the rename, a concurrent symlink swap under `<storageRoot>/.context-index/` could redirect the rename target (CWE-367). Window is small; exploitation requires local write access (which already implies trust). Spec doesn't qualify the temporal limit.
- **Recommendation:** Document as accepted residual risk for an operator-local tool. Mirrors the same residual-risk class present in `lib/build-state.mjs`.

### Finding SEC-8

- **Severity:** suggestion
- **Category:** input-validation
- **Location:** Behaviors — "When `loadMilestones` is called and the parsed JSON has no `milestones` key or a non-array value at that key **then** an empty array is returned."
- **Finding:** Silent permissive read on shape-mismatch (returns `[]`) makes a corrupted-but-syntactically-valid `milestones.json` (e.g., `{"milestones": "wiped"}`) indistinguishable from a missing file. This is preserved-from-today behavior (parity-correct) but worth flagging.
- **Recommendation:** Consider tightening in a follow-up — emit a one-time warning when the file exists but the shape is unexpected. Not a blocker; spec preserves today's contract intentionally.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS (rev-1 blocker resolved)

### Rev-1 Resolution Audit

- **CON-1 (prior blocker, `tasks.db_path` semantic):** RESOLVED — Worked example added in three locations; pin "`db_path` is treated as the parent of `.context-index/`" matches the actual `resolveStorageRoot` semantic. AC adds end-to-end test for the unified-knob behavior. **Severity re-judgement:** the prior blocker tag is superseded; rev 2's one-paragraph clarification is sufficient and the recommendation has been adopted verbatim.
- **CON-2 (warning, snake_case misleading):** RESOLVED — Bullet reworded to "lowercase single-word field at the milestone level" matching `milestone-lifecycle/charter.md` line 59.
- **CON-3 (suggestion, `active` status missing):** NOT ADDRESSED — Status enum still lists only `planned`, `shipped`, `deferred`. Carry forward as suggestion.
- **CON-4 (suggestion, property-vs-parity test terminology):** PARTIALLY RESOLVED — Actionable Task Map uses "Tests: parity"; AC still says "Property test covers the round-trip" (mixed usage). Carry forward as suggestion.
- **CON-5 (suggestion, sync vs async):** RESOLVED — New AC pins `loadMilestones` as synchronous; tolerates `lib/deploy.mjs::await` without making the function async.
- **CON-6 (suggestion, validation cadence rationale):** NOT ADDRESSED — Path Safety item 1 doesn't append the function-module-vs-class rationale. Carry forward as suggestion.

### New Findings (rev 2)

No new findings.

---

## Summary

**Total findings:** 0 blockers, 0 warnings, 8 suggestions (4 carried forward unaddressed + 2 new + 2 partial/not-addressed CON-3/CON-6).

**Status:** PASS — the rev-1 blocker is resolved and no warning-class findings remain. The 8 suggestion-level findings can be addressed in a follow-up rev (low priority) or rolled into the cross-cutting skill-cleanup spec where relevant (SEC-3 path-leakage messaging, SEC-5 untrusted-text declaration). Spec is ready for planning. `/adev:plan --spec milestones-migration.spec.md` may proceed.

**Suggestion summary (carried-forward + new):**
- SEC-3 path leakage in error messages
- SEC-4 stale-YAML signal absence
- SEC-5 free-text untrusted-input declaration
- SEC-6 git-trust inheritance documentation
- SEC-7 TOCTOU residual risk acknowledgement
- SEC-8 silent shape-mismatch read
- CON-3 `active` status omission
- CON-4 property-vs-parity test terminology
- CON-6 function-module validation cadence rationale
