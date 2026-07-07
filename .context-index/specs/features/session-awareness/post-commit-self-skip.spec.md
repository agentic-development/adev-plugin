---
charter: session-awareness
kind: behavioral
status: superseded
superseded-by: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md
risk_level: low
milestone: 0.27.1
revision: 1
charter-revision: 1
charter-extension: true
created: 2026-05-19
updated: 2026-05-20
tracker-ref: issue-458
source-manifest:
  sha: "e1ede30"
  files:
    - .githooks/post-commit
    - tests/hooks/post-commit-self-skip.test.mjs
  computed-at: "2026-07-03T22:27:11.313Z"
---

<!-- partial_schema: spec@1 -->

# Live Spec: Post-commit hook self-skips on session-capture-only commits

<!-- Live Spec within the session-awareness charter.
     Adds a guard to `.githooks/post-commit` that exits without writing a
     new capture file when the commit being recorded only touches the
     `.context-index/sessions/` directory. Prevents the recursive "1 commit
     -> 1 capture file -> 1 commit -> 1 capture file" amplification seen
     when agents commit in-session.

     Filed as charter-extension; roll into a session-awareness charter
     revision in a follow-up sweep. Companion to issue-521 (rolling daily
     log, deferred).

     Parent Charter: .context-index/specs/features/session-awareness/charter.md -->

## Behavioral Contract

<!-- The current `.githooks/post-commit` hook writes one capture file per
     commit, unconditionally. Agents committing in-session create capture
     files, which themselves must be committed (otherwise they vanish on
     branch switches), which triggers more capture files. The amplification
     is bounded (each iteration touches strictly fewer non-session files
     until the set is empty) but noisy: a single substantive commit can
     leave 3-5 hook-artifact commits in its wake.

     This spec adds a single guard: if every file in the commit is inside
     `.context-index/sessions/`, the hook exits 0 without writing. Any
     mixed commit (one source file + N session files) still captures
     normally so we never lose a substantive session record. -->

### Preconditions

- `.githooks/post-commit` is the active post-commit hook (installed via `core.hooksPath = .githooks` or symlinked from `.git/hooks/post-commit`).
- `git diff-tree` is available in `PATH` (POSIX git; already a hook precondition).
- The commit being recorded has at least one changed file (the hook is not invoked on no-op commits).
- The check uses git's view of changed files (not the working tree), so amended commits, merges, and reverts are all handled by the same primitive.

### Invariants

- **Default behavior unchanged for substantive commits.** Any commit touching at least one file outside `.context-index/sessions/` writes a capture file exactly as today. The skip only applies when the entire changeset is confined to the sessions directory.
- **No silent loss.** When the hook skips, the prior commit's substantive content was already recorded in its own capture file. The recursion that this guard breaks is itself the loss-of-signal source — skipping a sessions-only commit drops zero new information.
- **Non-blocking, exit 0.** The guard never blocks the commit. Failure paths (e.g., `git diff-tree` returns non-zero, unexpected output) fall through to the existing capture path — the default is to capture, not to silently skip.
- **Single-file-system primitive.** The guard reads only the commit's file list via `git diff-tree`. It does NOT read file contents, does NOT inspect the working tree, and does NOT shell out to anything else.

### Behaviors

1. **When** `.githooks/post-commit` fires for a commit `<sha>` **then** it reads the changed-file list via `git diff-tree --no-commit-id --name-only -r <sha>`.

2. **When** every line of that file list is a non-empty path whose first path component is `.context-index/sessions/` **then** the hook exits 0 immediately and writes no capture file.

3. **When** any line of that file list is outside `.context-index/sessions/` (including the empty case where `git diff-tree` returns no rows) **then** the hook proceeds with the existing capture-write path unchanged. The capture file records all files in the commit, session-directory entries included.

4. **When** `git diff-tree` returns a non-zero exit code **then** the hook proceeds with the existing capture-write path (fail-open to the established behavior, never silently skip).

5. **When** the commit touches a path *similar to but not inside* the sessions directory (e.g., `.context-index/sessions-archive/foo.md` or `.context-index/sessions.bak`) **then** the hook does NOT treat it as session-only. The prefix match is strictly `.context-index/sessions/` with the trailing slash to prevent false positives on sibling directories.

6. **When** the skip path is taken **then** the hook MAY emit a single line of diagnostic output (`session-capture skipped: sessions-only commit`) to stderr so an operator running `git commit -v` can see why no capture appeared. This is informational only and never affects exit status.

### Postconditions

- For a sessions-only commit: no file is written under `.context-index/sessions/` by this hook invocation, and the hook exits 0.
- For any other commit: the capture file is written exactly as today, with the same filename, content, and side effects (session-tracking JSONL append).
- The hook's exit code remains 0 in all success and skip paths. Failure paths (filesystem error in capture-write, unexpected `git diff-tree` failure) follow the existing fail-open behavior.

### Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| `git diff-tree` fails (non-zero exit) | Fall through to existing capture path |
| `git diff-tree` returns no rows (empty result, unexpected) | Fall through to existing capture path |
| Commit touches `.context-index/sessions-archive/` only (non-session path with shared prefix) | Capture written (false-prefix match guarded) |
| Mixed commit: one source file + N session files | Capture written normally |
| Sessions-only commit | Hook exits 0, no capture written |
| Hook invoked outside a git repo (`git rev-parse HEAD` fails) | Existing guard already exits 0; unchanged |

## System Constitution Reference

- **Principle:** "Hook protocol compliance — hooks read JSON from stdin + env vars, exit 0 (allow) or 2 (block), output JSON to stdout." — Applies because this is a git hook (not a Claude Code hook), but the same fail-open discipline applies: never block, never lose signal on unexpected input.
- **Principle:** "Minimize external dependencies — prefer Node.js built-ins." — Applies because the guard adds only one `git diff-tree` call (already used by the hook) and a bash prefix-match. No new dependencies, no Node code added.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|------------------|
| `.githooks/post-commit` | Direct | Add early-exit guard after the existing `CHANGED_FILES=$(git diff-tree ...)` call. ~8 lines of bash. |
| `tests/hooks/post-commit*.test.mjs` | New | Unit/integration tests covering all 6 behaviors. Use `git init` in a tempdir + run the hook against synthesized commits. |

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add self-skip guard | Insert prefix-match check after `CHANGED_FILES` is computed; early-exit on sessions-only. | small |
| Add integration test | `tests/hooks/post-commit-self-skip.test.mjs`: tempdir git repo, exercise sessions-only / mixed / non-session / empty commits. | small |
| Smoke verification | Manually run a sessions-only commit in this repo, confirm no new capture file. | trivial |

## Acceptance Criteria

- [ ] `.githooks/post-commit` early-exits with no capture written when the commit touches only `.context-index/sessions/` paths.
- [ ] `.githooks/post-commit` writes a capture file unchanged for any commit touching at least one non-session file.
- [ ] Prefix match is exact: `.context-index/sessions-archive/` and `.context-index/sessions.bak` do NOT trigger skip.
- [ ] On `git diff-tree` failure, the hook falls through to capture (fail-open).
- [ ] Diagnostic stderr line emitted on skip path so operators can confirm the behavior.
- [ ] Integration tests cover sessions-only, mixed, non-session, and prefix-collision cases.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations introduced.
