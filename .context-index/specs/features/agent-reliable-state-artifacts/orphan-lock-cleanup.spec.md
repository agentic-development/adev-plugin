---
charter: agent-reliable-state-artifacts
kind: behavioral
status: validated
risk_level: medium
milestone: 0.27.1
revision: 1
charter-revision: 6
charter-extension: true
created: 2026-05-18
updated: 2026-05-19
tracker-ref: issue-505
source-manifest:
  sha: "8af72f4"
  files:
    - lib/issues/json-adapter.mjs
    - tests/issues/json-adapter-orphan-lock.test.mjs
  computed-at: "2026-05-19T12:09:25.442Z"
---

<!-- partial_schema: spec@1 -->

# Live Spec: Orphan-lock cleanup for the JSON issue board CAS layer

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     Follow-up to concurrent-write-protection.spec.md (validated). That spec
     introduced O_EXCL acquisition of tasks.json.lock for CAS coordination
     but left no recovery path when the lock-holder is killed mid-write
     (SIGKILL, OS crash, container OOM). This spec adds transparent
     orphan-lock recovery so the issue board self-heals instead of wedging
     read-only until manual cleanup. Filed as charter-extension; roll into
     charter rev 8 in a follow-up sweep. Parent Charter:
     .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->

## Behavioral Contract

<!-- The CAS layer acquires `tasks.json.lock` via openSync(O_EXCL) before
     each write and releases it in `finally`. If the process is killed
     between acquire and release, the lock persists. Every subsequent
     mutator hits EEXIST, which the existing wrapper surfaces as
     STALE_BOARD_WRITE_RETRY → STALE_BOARD_WRITE after the retry budget
     is exhausted. The board becomes effectively read-only until someone
     manually deletes the lock. This spec adds an "is the prior holder
     still alive?" check before treating EEXIST as a live contention. -->

### Preconditions

- The JSON adapter is loaded via `getIssueManager(manifest)` with `tasks.backend: json`.
- `tasks.json.lock` is excluded from version control (already enforced by `.gitignore` since the concurrent-write-protection landing).
- The lock file's mtime is a usable liveness signal on the host filesystem (POSIX `stat(2)` and Node `fs.statSync` return seconds-resolution mtime; the 30-second default tolerates ~1s mtime granularity comfortably).
- `manifest.tasks.cas_lock_stale_seconds` is either unset (default applies) or a positive integer ≥ 5.

### Invariants

- **Lock semantics unchanged on the happy path.** When no orphan exists, the acquire path is byte-for-byte identical to today's `openSync(path, "wx")` call. The orphan-recovery branch only activates on `EEXIST`.
- **One recovery per acquire attempt.** A single `acquire()` call attempts orphan recovery at most once. If the post-recovery retry also hits `EEXIST`, the wrapper bubbles up the existing `STALE_BOARD_WRITE_RETRY` path; recovery does NOT loop.
- **Recovery does not consume CAS retry budget.** Orphan recovery is sub-step of one CAS attempt. The outer wrapper's `MAX_CAS_RETRIES` budget is unchanged.
- **Configurable threshold has a floor.** `cas_lock_stale_seconds` < 5 is rejected at manifest load with a clear error — too-small thresholds risk false-positive orphan detection under load.

### Behaviors

1. **When** the lock-acquire helper calls `openSync(lockPath, "wx")` and receives `EEXIST` **then** before reporting contention, it calls `statSync(lockPath)` and computes `ageSeconds = (Date.now() - mtime.getTime()) / 1000`.

2. **When** `ageSeconds > manifest.tasks.cas_lock_stale_seconds` (default 30) **then** the helper treats the lock as orphaned: it calls `unlinkSync(lockPath)`, then retries `openSync(lockPath, "wx")` exactly once.

3. **When** the post-recovery retry succeeds **then** the helper proceeds with the write as normal and emits exactly one warning to stderr per process: `[adev] recovered orphaned tasks.json.lock (age: <N>s, threshold: <M>s)`. Subsequent recoveries in the same process do not re-emit (one-time warning per process lifetime).

4. **When** the post-recovery retry also fails with `EEXIST` **then** the helper does NOT recover again. It throws the existing `STALE_BOARD_WRITE_RETRY` so the outer CAS wrapper applies its standard retry-budget logic. (A new writer raced into the slot between unlink and retry — this is live contention, not orphan state.)

5. **When** `ageSeconds <= cas_lock_stale_seconds` **then** the helper treats the lock as held by a live writer and throws `STALE_BOARD_WRITE_RETRY` immediately (today's behavior). No `unlink`, no recovery.

6. **When** `statSync(lockPath)` itself fails with `ENOENT` (the lock disappeared between the failed `openSync` and the `statSync`) **then** the helper retries `openSync(lockPath, "wx")` exactly once. This is the "naturally released" race; it consumes no recovery slot.

7. **When** the manifest sets `tasks.cas_lock_stale_seconds` **then** the helper uses that value. When unset, the default is `30`. When set to a non-integer or to a value `< 5`, manifest load rejects with `INVALID_CAS_LOCK_STALE_SECONDS` and a message naming the offending value and the floor.

### Postconditions

- The on-disk lock file is either held by the current process (acquire succeeded) or absent and the process did not acquire (acquire threw). There is no third state where the lock exists but no writer holds it AND no recovery was attempted.
- Every orphan recovery emits exactly one stderr warning per process lifetime, including the observed age and the configured threshold so operators can spot a pattern (e.g., process being killed repeatedly).
- The `IssueManagerInterface` contract is unchanged. Callers observe at most the existing `STALE_BOARD_WRITE` / `STALE_BOARD_WRITE_RETRY` outcomes; orphan recovery is invisible at the API surface.
- The CAS retry budget (`MAX_CAS_RETRIES`, default 3) is unchanged; orphan recovery is a sub-step within one acquire attempt and does not count against it.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Lock present, `ageSeconds <= threshold` | Throw to outer wrapper for CAS retry | `STALE_BOARD_WRITE_RETRY` (existing) |
| Lock present, `ageSeconds > threshold`, unlink succeeds, retry succeeds | Proceed with write; emit one-time warning | (no error) |
| Lock present, `ageSeconds > threshold`, unlink fails (EACCES, EPERM, EBUSY) | Throw with original error wrapped | `ORPHAN_LOCK_UNLINK_FAILED` (new) |
| Lock present, `ageSeconds > threshold`, unlink succeeds, retry hits EEXIST again | Throw to outer wrapper (do NOT loop) | `STALE_BOARD_WRITE_RETRY` (existing) |
| Lock disappeared between failed openSync and statSync (ENOENT on stat) | Retry openSync once | (no error if retry succeeds) |
| `cas_lock_stale_seconds` set to non-integer or `< 5` | Reject at manifest load | `INVALID_CAS_LOCK_STALE_SECONDS` (new) |

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins (`fs`, `path`, `child_process`, `crypto`, `node:test`)." — Applies because the entire recovery path uses only `node:fs` (`statSync`, `unlinkSync`, `openSync`); no new dependency is introduced.
- **Principle:** "Hook protocol compliance" — N/A; this spec only touches `lib/issues/json-adapter.mjs`. No hooks are added or modified.
- **Principle:** Implicit project value of self-healing infrastructure — applies because the current behavior leaves the issue board read-only after any abrupt termination, requiring operator intervention. Self-recovery is the strictly weaker contract that adds no risk of silent data loss (the original lock file's purpose — guarding concurrent writes — is still satisfied).

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|------------------|
| `lib/issues/json-adapter.mjs` | Direct | Add orphan-recovery branch in the lock-acquire path of `_write`. Extract acquire logic into a small helper for testability. Read `cas_lock_stale_seconds` from manifest with default fallback. |
| `lib/manifest.mjs` | Validation | Add `cas_lock_stale_seconds` validation at load time (integer ≥ 5; reject otherwise). |
| `tests/lib/issues/json-adapter-orphan-lock.test.mjs` | New | Unit tests covering all 6 behaviors and 6 error-case rows. Uses Node's built-in test runner. |

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Extract acquire helper | Refactor the inline `openSync(lockPath, "wx")` in `_write` into a private `_acquireLock(lockPath)` helper. Pure refactor; no behavior change. | small |
| Implement orphan recovery | Add stat → age-check → unlink → retry-once logic to `_acquireLock`. Wire up the one-time stderr warning. | small |
| Manifest validation | Add `cas_lock_stale_seconds` to manifest schema with default 30, floor 5. | small |
| Unit tests | Cover 6 behaviors + 6 error cases. Mock `Date.now()` and use `fs.utimesSync` to set lock mtime. | medium |

## Acceptance Criteria

- [ ] `_acquireLock` helper exists in `lib/issues/json-adapter.mjs` and is the single call site for `openSync(lockPath, "wx")`.
- [ ] When a `tasks.json.lock` older than `cas_lock_stale_seconds` is present and the holder is no longer writing, a CAS mutation succeeds without operator intervention and a single stderr warning is emitted.
- [ ] When a fresh (`ageSeconds <= threshold`) lock is present, recovery is NOT attempted; the existing `STALE_BOARD_WRITE_RETRY` path fires.
- [ ] When orphan recovery fires twice in one process, only the first emits a stderr warning.
- [ ] Manifest with `tasks.cas_lock_stale_seconds: 3` is rejected at load with `INVALID_CAS_LOCK_STALE_SECONDS`.
- [ ] `unlinkSync` failure during recovery raises `ORPHAN_LOCK_UNLINK_FAILED` with the original error in the cause chain.
- [ ] Unit tests cover all 6 behaviors and all 6 error-case rows; they run under `npm test` without external dependencies.
- [ ] All quality gates pass (tests, lint, typecheck via existing harness).
- [ ] No constitutional violations introduced (only `node:fs` built-ins; no new dependencies).
