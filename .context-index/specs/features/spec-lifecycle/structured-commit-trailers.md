# Live Spec: Structured Commit Trailers

---
charter: spec-lifecycle
status: validated
risk_level: medium
milestone: v1
revision: 1
charter-revision: 1
created: 2026-03-27
updated: 2026-03-28
source-manifest:
  sha: "67a8425"
  files:
    - .githooks/prepare-commit-msg
  computed-at: "2026-04-01T13:43:22.538Z"
---

## Behavioral Contract

### Preconditions

- `.githooks/prepare-commit-msg` is installed and `core.hooksPath` points to `.githooks/`
- A session tracking file exists (written by `hooks/session-capture.sh` during the session)
- The commit is being made in a git repository with `.context-index/` present

### Behaviors

1. **When** a commit is created and the session tracking file contains spec references **then** `.githooks/prepare-commit-msg` appends `Spec: <relative-spec-path>` trailer(s) to the commit message for each spec touched during the session.

2. **When** a commit is created and the session tracking file contains plan task references **then** the hook appends `Plan-task: <task-number>` trailer(s) to the commit message.

3. **When** a commit is created during an active session **then** the hook appends `Session: <session-id>` trailer where session-id is `<date>T<time>-<short-hash>` derived from the session start.

4. **When** the commit message already contains the same trailer **then** the hook does not add a duplicate.

5. **When** the session tracking file does not exist or is empty **then** the hook exits silently with code 0 — no trailers are added, no error is raised.

6. **When** the commit is an `--amend` or `merge` commit **then** the hook still processes and appends trailers if applicable.

7. **When** `git log --grep="Spec: <path>"` is run **then** it returns all commits that touched the specified spec, enabling per-spec commit history queries.

### Postconditions

- Commits made during adev sessions have `Spec:`, `Plan-task:`, and/or `Session:` trailers
- Trailers follow git trailer convention (key-value after a blank line at the end of the commit message)
- Commits made outside of adev sessions (no tracking file) are unaffected

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Session tracking file missing | Hook exits 0, no trailers added | — (graceful) |
| Session tracking file malformed | Hook exits 0, no trailers added, logs warning to stderr | — (graceful) |
| `prepare-commit-msg` hook not installed | No trailers injected (silent — user may not have run `/adev:init`) | — (not installed) |
| Commit message file unwritable | Hook exits 0, logs warning — never blocks a commit | — (graceful) |

## System Constitution Reference

- **Principle:** "Hook protocol compliance" — `.githooks/prepare-commit-msg` is a bash script following git hook conventions (receives commit msg file as $1, exit 0 to proceed).
- **Principle:** "Minimize external dependencies" — Trailer injection uses bash string manipulation and `echo`/`sed`, no external tools.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create `.githooks/prepare-commit-msg` | Bash script that reads session tracking file and appends trailers to commit message | medium |
| Define session tracking file format | JSON or simple key=value format written by `hooks/session-capture.sh` | small |
| Write tests | Test trailer injection, duplicate prevention, missing tracking file, amend commits | medium |

## Acceptance Criteria

- [ ] Commits during adev sessions have `Spec:` trailers linking to touched specs
- [ ] Commits during adev sessions have `Plan-task:` trailers when plan tasks are active
- [ ] Commits during adev sessions have `Session:` trailers with session ID
- [ ] Duplicate trailers are not added
- [ ] Missing or empty tracking file results in no trailers, no error
- [ ] `git log --grep="Spec: <path>"` returns relevant commits
- [ ] Hook never blocks a commit (always exits 0)
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
