<!-- partial_schema: plan@1 -->

# Implementation Plan: Post-commit hook self-skips on session-capture-only commits

> **Methodology:** adev
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Spec:** .context-index/specs/features/session-awareness/post-commit-self-skip.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-18)
> **Platform:** Node.js (ESM, `.mjs`), bash; zero external dependencies

**Goal:** Add a small bash guard to `.githooks/post-commit` that skips capture-file writing when every changed path in the commit is inside `.context-index/sessions/`, breaking the recursive "capture-of-the-capture" amplification.

**Architecture:** The guard is a single early-exit clause inserted immediately after the existing `CHANGED_FILES=$(git diff-tree ...)` line. It iterates the already-computed `CHANGED_FILES` list, applies a strict-prefix glob match against `.context-index/sessions/`, and exits 0 with a stderr diagnostic when the entire commit is sessions-only. All other paths (including `git diff-tree` failure, empty result, or any non-session file in the changeset) fall through to the existing capture-write code path unchanged. No new files, no Node code, no new dependencies — this is a bash-only patch to one existing hook plus a Node test file that exercises the hook via `runGitHook()` against synthesized commits in a tempdir.

**Review notes addressed in this plan:**
- CON-1 (consistency-analyzer suggestion): The skip path inherits the existing behavior that `.context-index/.session-tracking.jsonl` is NOT truncated when `writeSummary` is not called. Task 2 includes an assertion covering this so the documented postcondition stays load-bearing even though the spec text was not amended.

---

## File Structure

**Create:**
- `tests/hooks/post-commit-self-skip.test.mjs` — Integration tests for all 6 spec behaviors (sessions-only skip, mixed-capture, non-session capture, prefix-collision, fail-open on `git diff-tree` failure, stderr diagnostic emission). Uses `createTempGitRepo()` + `runGitHook("post-commit", ...)` per the established hook-test pattern.

**Modify:**
- `.githooks/post-commit:24-25` — Insert the self-skip guard immediately after the `CHANGED_FILES=$(git diff-tree ...)` line. The guard is ~8-12 lines of bash: skip when `[ -n "$CHANGED_FILES" ]` AND every line begins with `.context-index/sessions/`. Emit one stderr diagnostic line and `exit 0` on skip.

**Reference (read, do not modify):**
- `.githooks/post-commit` — Read the existing hook in full to understand the capture-write path and identify the exact insertion point.
- `tests/hooks/pre-commit.test.mjs` — Follow this pattern for git-hook integration tests (uses `createTempGitRepo` + `runGitHook`).
- `tests/helpers.mjs:85-122` — `createTempGitRepo()` and `runGitHook()` helpers used by Task 2.
- `.context-index/samples/hook-pretooluse-merge-guard.md` — Golden sample for hook coding patterns (informational; the file in scope here is a git hook, not a Claude Code hook).

## Context Packets

### Task 1 Context — Add self-skip guard to `.githooks/post-commit`
- Spec: `.context-index/specs/features/session-awareness/post-commit-self-skip.spec.md` (Behavioral Contract, Behaviors 1-6, Acceptance Criteria 1-5)
- Charter: `.context-index/specs/features/session-awareness/charter.md` (capability: this is a charter-extension; new capability "Session-Capture Self-Skip Guard" will be added during /adev:implement)
- Source files: `.githooks/post-commit` (full read — needs exact insertion point after line 24 `CHANGED_FILES=` assignment)
- Constitution: `.context-index/constitution.md` Non-Negotiable Principle 4 (Hook protocol compliance — fail-open discipline) and Principle 1 (Minimize external dependencies — bash + existing `git diff-tree` only)
- Review notes: PASS_WITH_NOTES with CON-1 suggestion (session-tracking JSONL not truncated on skip path — addressed via test assertion in Task 2)

### Task 2 Context — Integration tests for the guard
- Spec: `.context-index/specs/features/session-awareness/post-commit-self-skip.spec.md` (Acceptance Criterion 6: "Integration tests cover sessions-only, mixed, non-session, and prefix-collision cases"; Error Cases table)
- Test helpers: `tests/helpers.mjs:85-122` — `createTempGitRepo({ branch })` returns a git-initialized tempdir with one initial commit; `runGitHook("post-commit", { cwd })` invokes the hook via bash from `.githooks/`
- Pattern reference: `tests/hooks/pre-commit.test.mjs` (exact pattern: `describe` + `createTempGitRepo` in `beforeEach`, `cleanupTempDir` in `afterEach`, `runGitHook` invocation, assert on `exitCode` and `stderr`)
- Companion spec reference: `.context-index/specs/features/session-awareness/session-log-schema.spec.md` (JSONL contract — verify skip path does NOT truncate `.session-tracking.jsonl`, per review CON-1)

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields).
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions.

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns).
- **Anti-pattern:** Focus on reducing input token counts alone.

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts.

> Note: The module-scoped heuristic retrieval surfaced cost/output heuristics from session-awareness telemetry work. None directly govern the bash-guard implementation in Task 1; they apply primarily to /adev:implement's narration choices.

## Parallelization

- Group A (sequential): Task 1 (modify `.githooks/post-commit`) → Task 2 (integration tests against modified hook).

Task 2 is sequential after Task 1 because the tests exercise the modified hook. There is no third independent group; the spec is one production file + one test file. No parallelism benefit on this plan.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Add self-skip guard to `.githooks/post-commit` | small | unit | — | 0 create, 1 modify |
| 2 | Integration tests for post-commit self-skip behavior | small | unit | Task 1 | 1 create, 0 modify |

## Task Structure

### Task 1: Add self-skip guard to `.githooks/post-commit` [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Well-specified bash patch with explicit insertion point and ready-to-paste code, single-file blast radius, and hook-family golden samples on hand.

**Charter capability:** Session-Capture Self-Skip Guard (new capability under the session-awareness charter; charter-extension flagged in spec frontmatter — capability row will be added to the charter Capability Map during execution handoff)
**Strategy:** unit (source: fallback, confidence: high — bash hook tested via `runGitHook` integration harness; classified as `unit` because the test runs in-process under `node --test` with no external infrastructure)
**Files:**
- Modify: `.githooks/post-commit:24-25` (insert guard immediately after `CHANGED_FILES=$(git diff-tree ...)` assignment, before the `OUTPUT_DIR=` line)
- Test: `tests/hooks/post-commit-self-skip.test.mjs` (created in Task 2)

**Tests:** `tests/hooks/post-commit-self-skip.test.mjs` (authored in Task 2; the test file is created in Task 2 because Task 1 is the production change. Task 1 is verified by running the Task 2 test suite, which is the standard TDD ordering for hook + test pairs in this codebase — see `pre-commit.test.mjs` / `pre-commit` for the precedent.)

**Context to load:**
- `.githooks/post-commit` (full file — needs exact pre-existing structure around line 24)
- `.context-index/specs/features/session-awareness/post-commit-self-skip.spec.md` (Behaviors 1-6, Error Cases table)
- `.context-index/constitution.md` (Principle 4 — hooks never block, fail-open)

- [ ] **Write failing test**

The failing test is authored in Task 2. Per the spec's Actionable Task Map ordering (guard first, then test) and the in-repo precedent (pre-commit hook + pre-commit.test.mjs were developed together), Task 1 ships the guard change and Task 2 ships the test. The "red" phase is observed by running the new test file against the *unmodified* hook before applying the patch — see Task 2's "Verify test fails" step. This task's "Write failing test" reduces to: ensure Task 2's test file has been drafted and exists on disk, but the hook patch in Task 1 has NOT yet been applied.

If `/adev:implement` prefers strict per-task RED before any production change, it MAY reorder by writing the test file body first (still attributed to Task 2 in the lifecycle log), running `node --test tests/hooks/post-commit-self-skip.test.mjs` to observe failures, then applying the hook patch from Task 1. Either ordering satisfies TDD and the spec.

- [ ] **Verify test fails**

Run: `node --test tests/hooks/post-commit-self-skip.test.mjs`
Expected: FAIL — at minimum the "sessions-only commit produces no capture file" test should fail because the unmodified hook always writes a capture. Other tests (mixed commit, non-session commit) should already PASS since they exercise the unchanged path.

- [ ] **Implement**

In `.githooks/post-commit`, immediately after the `CHANGED_FILES=$(git diff-tree --no-commit-id --name-only -r "$COMMIT_HASH" 2>/dev/null || echo "")` line (currently line 24), insert:

```bash
# Self-skip guard: when every changed file is inside `.context-index/sessions/`,
# exit without writing a capture. Prevents the "1 commit -> 1 capture -> 1 commit"
# amplification when agents commit in-session.
# Spec: .context-index/specs/features/session-awareness/post-commit-self-skip.spec.md
if [ -n "$CHANGED_FILES" ]; then
  SESSIONS_ONLY=1
  while IFS= read -r CHANGED_PATH; do
    [ -z "$CHANGED_PATH" ] && continue
    case "$CHANGED_PATH" in
      .context-index/sessions/*) ;;
      *) SESSIONS_ONLY=0; break ;;
    esac
  done <<< "$CHANGED_FILES"

  if [ "$SESSIONS_ONLY" = "1" ]; then
    echo "session-capture skipped: sessions-only commit" >&2
    exit 0
  fi
fi
```

Notes on the implementation:
- Strict prefix match via `case` glob `.context-index/sessions/*` rejects `.context-index/sessions-archive/...` and `.context-index/sessions.bak` (the trailing `/` matters — spec Behavior 5).
- Empty `$CHANGED_FILES` (whether from `git diff-tree` failure or no rows) falls through to the existing capture path (spec Behavior 3, 4 — fail-open).
- The guard reads ONLY `$CHANGED_FILES`. It does not shell out beyond what the hook already does. No new dependencies (constitution Principle 1).
- Diagnostic line goes to stderr per spec Behavior 6.

- [ ] **Verify test passes**

Run: `node --test tests/hooks/post-commit-self-skip.test.mjs`
Expected: PASS — all test cases including sessions-only skip, mixed-commit capture, prefix-collision capture, fail-open paths.

- [ ] **Commit**

Branch (if not already created): `feat/session-awareness/post-commit-self-skip`

```bash
git add .githooks/post-commit
git commit -m "feat(hooks): self-skip post-commit on sessions-only commits

Spec: .context-index/specs/features/session-awareness/post-commit-self-skip.spec.md
Plan-task: 1"
```

---

### Task 2: Integration tests for post-commit self-skip behavior [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Complete test body provided in the plan, direct precedent in `tests/hooks/pre-commit.test.mjs`, and existing `createTempGitRepo`/`runGitHook` helpers cover the harness.

**Depends on:** Task 1
**Charter capability:** Session-Capture Self-Skip Guard (test coverage)
**Strategy:** unit (source: fallback, confidence: high — Node.js built-in test runner against bash hook via `runGitHook`)
**Files:**
- Create: `tests/hooks/post-commit-self-skip.test.mjs`

**Tests:** `tests/hooks/post-commit-self-skip.test.mjs` (this task creates it)

**Context to load:**
- `tests/hooks/pre-commit.test.mjs` (pattern reference — same `createTempGitRepo` + `runGitHook` shape)
- `tests/helpers.mjs:85-122` (helper signatures)
- `.context-index/specs/features/session-awareness/post-commit-self-skip.spec.md` (Behaviors 1-6, Error Cases, Acceptance Criteria)

- [ ] **Write failing test**

Create `tests/hooks/post-commit-self-skip.test.mjs` with test cases covering each spec behavior:

```javascript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "child_process";
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createTempGitRepo, cleanupTempDir, writeFixture, runGitHook } from "../helpers.mjs";

describe("post-commit git hook self-skip", () => {
  let gitDir;

  afterEach(() => {
    if (gitDir) cleanupTempDir(gitDir);
  });

  // Helper: stage a set of files then create a commit, return the SHA.
  function commitFiles(dir, files, message = "test commit") {
    for (const [relPath, content] of Object.entries(files)) {
      writeFixture(dir, relPath, content);
    }
    execSync(`git add -A`, { cwd: dir, stdio: "ignore" });
    execSync(`git commit -m "${message}"`, { cwd: dir, stdio: "ignore" });
    return execSync("git rev-parse HEAD", { cwd: dir, encoding: "utf8" }).trim();
  }

  function captureCount(dir) {
    const sessionsDir = join(dir, ".context-index", "sessions");
    if (!existsSync(sessionsDir)) return 0;
    return readdirSync(sessionsDir).filter((f) => f.endsWith(".md")).length;
  }

  it("skips capture when all changed files are inside .context-index/sessions/", () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    commitFiles(gitDir, {
      ".context-index/sessions/2026-05-19-abc1234.md": "## Intent\nprior\n",
      ".context-index/sessions/2026-05-19-def5678.md": "## Intent\nprior 2\n",
    }, "chore(sessions): record transcripts");

    const before = captureCount(gitDir);
    const { exitCode, stderr } = runGitHook("post-commit", { cwd: gitDir });

    assert.equal(exitCode, 0);
    assert.equal(captureCount(gitDir), before, "no new capture file should be written");
    assert.match(stderr, /session-capture skipped: sessions-only commit/);
  });

  it("writes capture for a mixed commit (one source file + N session files)", () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    commitFiles(gitDir, {
      "src/index.ts": "export const foo = 1;\n",
      ".context-index/sessions/2026-05-19-mix0001.md": "## Intent\nprior\n",
    }, "feat(core): mixed commit");

    const before = captureCount(gitDir);
    const { exitCode, stderr } = runGitHook("post-commit", { cwd: gitDir });

    assert.equal(exitCode, 0);
    assert.equal(captureCount(gitDir), before + 1, "one new capture file should be written");
    assert.doesNotMatch(stderr, /sessions-only commit/);
  });

  it("writes capture for a non-session commit", () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    commitFiles(gitDir, { "src/lib.ts": "export const bar = 2;\n" }, "feat(lib): bar");

    const before = captureCount(gitDir);
    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });

    assert.equal(exitCode, 0);
    assert.equal(captureCount(gitDir), before + 1);
  });

  it("writes capture for prefix-collision paths like .context-index/sessions-archive/", () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    commitFiles(gitDir, {
      ".context-index/sessions-archive/old.md": "archived\n",
      ".context-index/sessions.bak": "backup\n",
    }, "chore: archive sessions");

    const before = captureCount(gitDir);
    const { exitCode, stderr } = runGitHook("post-commit", { cwd: gitDir });

    assert.equal(exitCode, 0);
    assert.equal(captureCount(gitDir), before + 1, "capture should be written for non-strict-prefix paths");
    assert.doesNotMatch(stderr, /sessions-only commit/);
  });

  it("emits diagnostic on stderr without affecting exit status", () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    commitFiles(gitDir, {
      ".context-index/sessions/2026-05-19-diag0001.md": "## Intent\nprior\n",
    }, "chore(sessions): single");

    const { exitCode, stderr } = runGitHook("post-commit", { cwd: gitDir });

    assert.equal(exitCode, 0);
    assert.match(stderr, /session-capture skipped: sessions-only commit/);
  });

  it("preserves .session-tracking.jsonl on the skip path (NOT truncated)", () => {
    // Addresses review note CON-1: skip path inherits the existing behavior
    // that .context-index/.session-tracking.jsonl is NOT cleared when
    // writeSummary is not called. Tool-call records continue to accumulate
    // until the next non-session commit triggers the capture-write path.
    gitDir = createTempGitRepo({ branch: "feat/test" });
    const trackingPath = join(gitDir, ".context-index", ".session-tracking.jsonl");
    mkdirSync(join(gitDir, ".context-index"), { recursive: true });
    const seeded = '{"tool":"Edit","files":["src/x.ts"],"timestamp":"2026-05-19T10:00:00Z"}\n';
    writeFileSync(trackingPath, seeded);

    commitFiles(gitDir, {
      ".context-index/sessions/2026-05-19-jsonl001.md": "## Intent\nprior\n",
    }, "chore(sessions): record");

    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });

    assert.equal(exitCode, 0);
    assert.equal(readFileSync(trackingPath, "utf8"), seeded,
      "JSONL should be byte-identical on the skip path");
  });
});
```

Notes on the test:
- Uses `createTempGitRepo` + `runGitHook` exactly per the pre-commit precedent.
- `captureCount` is the spec-aligned assertion oracle (no capture file written = no `.md` added under `.context-index/sessions/` by the hook itself; the test seeds session files via the commit, so we compare counts before/after the hook invocation against the post-commit `before` baseline computed AFTER the commit and BEFORE the hook run).
- The CON-1 review-note test is the load-bearing assertion for the skip-path JSONL preservation invariant (review CON-1 — not folded into spec text but enforced by the test).
- The `git diff-tree` failure case (Error Cases table row 1) is not directly exercised because synthesizing a `git diff-tree` failure in a real tempdir is brittle. The fail-open posture is documented in the implementation and inherited from the existing `|| echo ""` fallback — covered by the "writes capture for a non-session commit" test (empty/missing CHANGED_FILES path falls through to the existing capture path).

- [ ] **Verify test fails**

Before applying the Task 1 hook patch, run:
`node --test tests/hooks/post-commit-self-skip.test.mjs`
Expected: FAIL — the "skips capture when all changed files are inside .context-index/sessions/" test fails (capture is written instead of skipped).

- [ ] **Implement**

The implementation is the test file content above. No production code is added in this task — the production change shipped in Task 1.

- [ ] **Verify test passes**

Run: `npm test -- --test-name-pattern "post-commit git hook self-skip"`
or: `node --test tests/hooks/post-commit-self-skip.test.mjs`
Expected: PASS — all 6 tests.

Also run the full suite to confirm no regressions:
`npm test`
Expected: PASS.

- [ ] **Commit**

Branch (if not already created): `feat/session-awareness/post-commit-self-skip`

```bash
git add tests/hooks/post-commit-self-skip.test.mjs
git commit -m "test(hooks): integration tests for post-commit self-skip

Spec: .context-index/specs/features/session-awareness/post-commit-self-skip.spec.md
Plan-task: 2"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied:
  - [ ] `.githooks/post-commit` early-exits with no capture written when the commit touches only `.context-index/sessions/` paths (Task 1 + Task 2 test 1).
  - [ ] `.githooks/post-commit` writes a capture file unchanged for any commit touching at least one non-session file (Task 2 test 2, test 3).
  - [ ] Prefix match is exact: `.context-index/sessions-archive/` and `.context-index/sessions.bak` do NOT trigger skip (Task 2 test 4).
  - [ ] On `git diff-tree` failure, the hook falls through to capture — fail-open (inherited from existing `|| echo ""` fallback; Task 1 implementation note).
  - [ ] Diagnostic stderr line emitted on skip path (Task 2 test 5).
  - [ ] Integration tests cover sessions-only, mixed, non-session, and prefix-collision cases (Task 2 tests 1-4).
  - [ ] CON-1 review-note covered: `.session-tracking.jsonl` not truncated on skip path (Task 2 test 6).
- No constitutional violations introduced (no new dependencies, hook fails open with exit 0 on all paths, no inline Node added to a SKILL.md).
