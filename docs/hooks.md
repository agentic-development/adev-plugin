[adev docs](README.md) > Reference

# Hooks Reference

adev uses hooks to enforce governance, track context reads, and capture session activity. Hooks fire automatically during Claude Code sessions based on trigger points and tool matchers. For background on how hooks fit into gate-based governance, see [Core Concepts](concepts.md).

## Hook Protocol

All hooks follow the same protocol:

- **Input:** Hooks read JSON from stdin and `CLAUDE_TOOL_INPUT_*` environment variables
- **Output:** Hooks write JSON to stdout
- **Exit codes:**
  - `exit 0` — allow (the operation proceeds)
  - `exit 2` — block (the operation is rejected with a message to the user)
- **Registration:** Hooks are registered in `hooks/hooks.json` with trigger points and matchers

> **Security note:** Custom hook scripts should validate and sanitize all stdin input before processing. Hook scripts receive arbitrary JSON from the tool pipeline and must not blindly trust or execute input content. Use JSON parsing with error handling and validate expected fields before acting on them.

## Summary Table

| Hook | Trigger Point | Matcher | Behavior | Purpose |
|------|---------------|---------|----------|---------|
| `session-start` | SessionStart | `startup\|resume\|clear\|compact` | Advisory | Inject project context at session start |
| `context-preflight` | PreToolUse | Edit | Blocks | Validate context exists before edits |
| `constitution-linter` | PreToolUse | Edit | Blocks | Block edits that violate the constitution |
| `lifecycle-gate.sh pre-edit` | PreToolUse | Edit | Blocks | Block edits that bypass lifecycle gates |
| `merge-guard` | PreToolUse | Bash | Blocks | Block merges to protected branches |
| `lifecycle-gate.sh pre-bash` | PreToolUse | Bash | Blocks | Block bash commands that bypass lifecycle gates |
| `plan-body-write-guard` | PreToolUse | `Write\|Edit` | Blocks | Block direct writes to immutable plan-task bodies |
| `gaming-gate` | PreToolUse | `Write\|Edit` | Blocks | Block a test-file Write/Edit that introduces a new gaming-detector violation |
| `sync-trigger` | PostToolUse | Edit | Advisory | Trigger sync after constitution edits |
| `session-capture` | PostToolUse | `.*` (all) | Advisory | Capture session activity for retrospectives; also tracks which `.context-index/` files have been read (folded-in former `context-read-tracker`) |
| `issue-reminder` | PostToolUse | `.*` (all) | Advisory | Remind about relevant open issues |
| `lifecycle-gate.sh advisory` | PostToolUse | `.*` (all) | Advisory | Emit advisory warnings about lifecycle state |
| `post-validate-extract-heuristics` | Stop | `.*` | Advisory | Extract reusable heuristics from the session after `/adev:validate` completes |
| `session-end` | SessionEnd | `.*` | Advisory | Write a session summary to `.context-index/sessions/` when Claude Code ends a session (registered dynamically when `integrations.session_capture.capture: hook`) |
| `pre-compact` | PreCompact | `.*` | Advisory | Write a session summary before Claude Code compacts the transcript, skipping if SessionEnd already wrote one for this session (registered dynamically when `integrations.session_capture.capture: hook`) |

---

## SessionStart Hooks

These hooks fire when a Claude Code session starts, resumes, or is cleared/compacted.

### session-start

**Script:** `hooks/session-start.sh`
**Matcher:** `startup|resume|clear|compact`
**Behavior:** Advisory (exit 0 always)

**Purpose:** Injects project context at session startup or resume. Reads the context index to provide the agent with project identity, active plans, open issues, and recent session history so it can resume work effectively.

**What it does:**
- Detects the project's context index and loads key artifacts
- Injects a context summary into the session
- Reports active implementation state if a plan is in progress

---

## PreToolUse Hooks

These hooks fire before a tool executes. Blocking hooks (exit 2) prevent the tool from running.

### context-preflight

**Script:** `hooks/context-preflight.sh`
**Matcher:** Edit
**Behavior:** Blocks

**Purpose:** Validates that the agent has read necessary context before editing files. Prevents edits to spec-tracked code without first reading the relevant spec.

**What triggers a block:**
- Editing a file covered by a spec without having read the spec in this session

**What the user sees:**
- An error message identifying the file and the spec that should be read first

**Resolution:**
1. Read the spec file identified in the error message
2. Retry the edit

---

### constitution-linter

**Script:** `hooks/constitution-linter.sh`
**Matcher:** Edit
**Behavior:** Blocks

**Purpose:** Blocks edits that violate the constitution's non-negotiable principles. Checks proposed edits against principle patterns (e.g., blocking CommonJS in an ESM project).

**What triggers a block:**
- Editing a file in a way that violates a declared principle (e.g., using `require()` in a pure-ESM project)

**What the user sees:**
- An error message identifying the violated principle and the problematic edit

**Resolution:**
1. Revise the edit to comply with the constitution
2. If the principle itself needs updating, edit `constitution.md` first, then run `/adev:sync`

---

### lifecycle-gate.sh pre-edit

**Script:** `hooks/lifecycle-gate.sh pre-edit` (consolidated dispatcher — see [lifecycle-gate.sh](#lifecycle-gatesh-dispatcher) below)
**Matcher:** Edit
**Behavior:** Blocks

**Purpose:** Blocks edits that bypass lifecycle gates. Prevents direct edits to implementation files when the spec has not been reviewed, or edits to spec files when a plan is in progress.

**Domain-aware gate config:** File exclusion patterns are loaded from the domain profile's `gate-config.yaml` overlay via `lib/domains/merge-gate-config.mjs`. The `software` profile ships with 44 file exclusion patterns (e.g., `*.test.*`, `.context-index/**`, `README.md`, `docs/**`, `node_modules/**`). When no domain profile is configured, empty exclusion lists are used (strictest mode -- everything is tracked). File exclusions can also be set via `user-config` using the `lifecycle.gate.file_exclusions` key.

**What triggers a block:**
- Editing implementation files when the governing spec's review status is not "passed"
- Editing spec files while an active implementation plan exists for that spec

**What the user sees:**
- An error message explaining which lifecycle gate was violated

**Resolution:**
1. For missing review: run `/adev:review-specs` on the governing spec
2. For active plan conflict: complete or abandon the current plan before editing the spec

---

### merge-guard

**Script:** `hooks/merge-guard.sh`
**Matcher:** Bash
**Behavior:** Blocks

**Purpose:** Blocks merge commands to protected branches. Prevents `git merge` or `git push` to branches listed in `completion.protected_branches` (default: main, master).

**What triggers a block:**
- Running `git merge` targeting a protected branch
- Running `git push` to a protected branch

**What the user sees:**
- An error message identifying the protected branch and suggesting to open a PR instead

**Resolution:**
1. Create a pull request: `gh pr create --base main`
2. Or, if you need to merge directly, remove the branch from `protected_branches` in `manifest.yaml` (not recommended)

---

### lifecycle-gate.sh pre-bash

**Script:** `hooks/lifecycle-gate.sh pre-bash` (consolidated dispatcher — see [lifecycle-gate.sh](#lifecycle-gatesh-dispatcher) below)
**Matcher:** Bash
**Behavior:** Blocks

**Purpose:** Blocks bash commands that bypass lifecycle gates. Prevents running implementation commands (e.g., file creation, code generation) when lifecycle prerequisites are not met.

**Domain-aware gate config:** Bash passthrough patterns are loaded from the domain profile's `gate-config.yaml` overlay via `lib/domains/merge-gate-config.mjs`. The `software` profile ships with 32 bash passthrough commands (e.g., `git status`, `npm test`, `ls`, `cat`, `grep`). When no domain profile is configured, empty passthrough lists are used (strictest mode -- all commands are gated). Bash passthrough commands can also be set via `user-config` using the `lifecycle.gate.bash_passthrough` key.

**What triggers a block:**
- Running bash commands that create or modify implementation files without a reviewed spec

**What the user sees:**
- An error message explaining the lifecycle prerequisite that is missing

**Resolution:**
1. Complete the required lifecycle step (review, plan, etc.) before running the command
2. If the command is not implementation-related, it may be a false positive — check the hook's matcher configuration

---

### lifecycle-gate.sh dispatcher

**Script:** `hooks/lifecycle-gate.sh`

The three lifecycle-gate rows above (`pre-edit`, `pre-bash`, and `advisory`, below) all resolve to this single script, registered three times in `hooks/hooks.json` with a trailing argv surface argument — e.g. `bash "${CLAUDE_PLUGIN_ROOT}/hooks/lifecycle-gate.sh" pre-edit`. Dispatch is read from `$1` only; the script never infers its surface from stdin fields. An unknown or missing surface argument exits 0 with a stderr diagnostic (fail-open — a mis-registration must be loudly visible but never a block).

This consolidates what were formerly three separate scripts (`lifecycle-gate-edit.sh`, `lifecycle-gate-bash.sh`, `lifecycle-gate-advisory.sh`) sharing an almost-identical skeleton (level resolution, execution-state read, enforcement-message rendering). File-exclusion and bash-passthrough checks are delegated to `hooks/_lifecycle-gate-check.mjs --surface file|bash`.

---

### gaming-gate

**Script:** `hooks/gaming-gate.sh` (helper: `hooks/_gaming-gate-check.mjs`)
**Matcher:** `Write|Edit`
**Behavior:** Blocks

**Purpose:** Wires the 8 test-gaming detectors in `lib/test-strategies/gaming.mjs` (4 shared cross-strategy patterns plus 4 integration-specific patterns) into a deterministic enforcement point. Fires on every `Write`/`Edit` of a test file, reconstructs the file content the pending call would produce (without performing the write), and blocks the call before it lands if that content introduces a gaming violation not already present in the file's current on-disk content.

**Regression-only, not whole-file:** the gate compares violations in the reconstructed post-edit content against the pre-edit on-disk content and blocks only on violations that are *new*. This is why writing a brand-new test file is held to the full standard (the pre-edit baseline is empty, so any matched pattern in the new content blocks), while editing an existing file only blocks on newly introduced violations — pre-existing debt in an untouched region of the file does not retroactively block an unrelated edit.

**What triggers a block:**
- The pending `Write`/`Edit` content contains a `DISABLED_TESTS`, `EMPTY_ASSERTIONS`, `SWALLOWED_ASSERTIONS`, or `CONDITIONAL_ASSERTIONS` pattern not present in the file today (any test file)
- For test files whose path or filename contains an `integration` token: also `BOUNDARY_MOCKING`, `CI_BYPASS`, `CREDENTIAL_ABSENT_PASS`, or `AGENT_SKIP`

**Exemptions:** non-test files (per `isTestFile()`), and the gaming detectors' own fixture test files (`tests/lib/test-strategies/gaming*.mjs`, `tests/lib/test-strategies/integration-gaming*.mjs`, `tests/test-strategies/gaming-agent-skip.test.mjs`) — these intentionally embed gaming-pattern strings as fixtures and are never scanned.

**What the user sees:**
- A stderr message naming each new violation's pattern id, line number, and description, followed by exit 2 (the write/edit is refused; the file on disk is unchanged)

**Resolution:**
1. Remove or fix the flagged pattern in the content you were about to write
2. If the flag is a false positive on a detector fixture file that doesn't match the exemption list, extend `isDetectorFixtureFile()` in `lib/test-strategies/gaming-gate.mjs`

See: `.context-index/specs/features/test-strategies/gaming-detector-gate-enforcement.spec.md`

---

## PostToolUse Hooks

These hooks fire after a tool executes. They are always advisory (exit 0) and do not block operations.

### sync-trigger

**Script:** `hooks/sync-trigger.sh`
**Matcher:** Edit
**Behavior:** Advisory

**Purpose:** Detects edits to `constitution.md` and reminds the agent to run `/adev:sync` to propagate changes to agent configuration files.

**What it does:**
- Checks if the edited file is `constitution.md`
- If so, emits a reminder to run `/adev:sync`

---

### session-capture

**Script:** `hooks/session-capture.sh`
**Matcher:** `.*` (all tools)
**Behavior:** Advisory

**Purpose:** Captures session activity for retrospective analysis. Records tool invocations, file changes, and timing data that `/adev:retro` uses to compute delivery metrics. Also touches `.context-index/.context-preflight-ok` whenever the tool call read a `.context-index/` file — this folds in the former standalone `context-read-tracker` hook, since session-capture's `.*` matcher is a superset of context-read-tracker's `Read`-only matcher. The touch runs unconditionally, independent of the capture-provider gate below.

**What it does:**
- Touches `.context-index/.context-preflight-ok` when the read file path is under `.context-index/` (so `context-preflight` can verify the agent read context before editing)
- Logs tool invocations with timestamps (only when the manifest provider is `native`)
- Records file paths and operation types
- Delegates the JSONL-append logic to `lib/session-capture.mjs`'s `tool-use` capture path

> **Note:** This is the legacy PostToolUse capture surface, kept around for projects on `integrations.session_capture.capture: post-commit`. New projects default to the SessionEnd / PreCompact hooks below, which capture once per session instead of once per tool call.

---

### issue-reminder

**Script:** `hooks/issue-reminder.sh`
**Matcher:** `.*` (all tools)
**Behavior:** Advisory

**Purpose:** Reminds the agent about relevant open issues when working on related files. Helps maintain awareness of known bugs, pending tasks, and related work items.

**What it does:**
- Checks if the current file or operation relates to any open issues
- If relevant issues exist, emits a reminder with issue IDs and titles

---

### lifecycle-gate.sh advisory

**Script:** `hooks/lifecycle-gate.sh advisory` (consolidated dispatcher — see [lifecycle-gate.sh dispatcher](#lifecycle-gatesh-dispatcher) above)
**Matcher:** `.*` (all tools)
**Behavior:** Advisory

**Purpose:** Emits non-blocking advisory warnings about lifecycle state. Unlike the blocking lifecycle gates, this hook warns about best-practice violations without preventing the operation.

**What it does:**
- Checks for lifecycle state issues that are not severe enough to block
- Emits advisory warnings (e.g., "spec is stale", "plan has uncompleted tasks")
- Warnings are informational and do not prevent the operation

---

## SessionEnd Hooks

These hooks fire when Claude Code ends a session. They are registered dynamically by `adev install` when `integrations.session_capture.capture: hook` is set (see [Configuration](configuration.md#integrations)). When `capture: post-commit` or `capture: off`, no SessionEnd entry is added to `hooks/hooks.json`.

### session-end

**Script:** `hooks/session-end.sh`
**Matcher:** `.*`
**Behavior:** Advisory (exit 0 always; failures log to stderr)

**Purpose:** Writes a session summary to `.context-index/sessions/<date>-<sessionId>.md` so `/adev:retro` can read concrete session activity (tool calls, files touched, durations) instead of inferring from git alone.

**What it does:**
- Reads the JSON payload Claude Code passes on stdin (`session_id`, `cwd`, `transcript_path`, plus optional fields)
- Validates the inputs (session id shape, real cwd, transcript path inside the project)
- Calls `lib/session-summary.mjs::fromTranscript()` to render a redacted markdown summary
- Writes the file atomically via `lib/session-capture.mjs::runCapture()` (skipping the write if a sibling capture already exists for the same session id)
- Returns exit 0 on every branch — capture failures must never block Claude Code

**Configuration knobs:**
- `integrations.session_capture.capture: hook` (default for new projects) — enables this hook
- `integrations.session_capture.gitignored: true` (default) — keeps the written summaries out of git via a paired-marker block in `.gitignore`

---

## PreCompact Hooks

These hooks fire when Claude Code is about to compact the in-memory transcript. Like SessionEnd, they are registered dynamically by `adev install` only in `hook` capture mode.

### pre-compact

**Script:** `hooks/pre-compact.sh`
**Matcher:** `.*`
**Behavior:** Advisory (exit 0 always)

**Purpose:** Captures a session summary before the transcript is compacted, so retros still see the session's activity in long-running flows that never hit SessionEnd.

**What it does:**
- Reuses the SessionEnd capture pipeline (`runCapture()`)
- Skips the write if a SessionEnd capture for the same session has already landed (the SA-2 skip-if-session-end branch in `lib/session-capture.mjs`)
- Returns exit 0 unconditionally

**Why it exists:** SessionEnd may not fire on long-running interactive sessions that compact mid-flight. PreCompact gives `/adev:retro` a chance to consume a partial session record before context is dropped.

---

## Git Hooks

In addition to the Claude Code hooks above, `npx @adev-org/adev-cli install` also installs four **git hooks** into your project's `.githooks/` directory and points `git config core.hooksPath` at that directory. These hooks fire on git operations (not on Claude Code tool calls) and operate on commit content rather than tool input.

> **Note on dual hook surfaces.** Claude Code hooks (above) gate *tool calls* during an agent session. Git hooks (below) gate or annotate *commits* regardless of whether the commit was made by an agent or by a human at the terminal. The two surfaces are orthogonal — both can be active in the same project.

### Summary Table

| Hook | Stage | Behavior | Purpose |
|------|-------|----------|---------|
| `pre-commit` | Pre-commit | Blocks | Run the protected-branch check and the no-inline-Node-in-SKILL.md guard |
| `prepare-commit-msg` | Prepare commit message | Advisory | Inject default `Author-type` and `Operator` trailers into the commit template |
| `commit-msg` | Validate commit message | Blocks | Enforce manifest-required trailers (e.g., `Author-type`, `Operator`, optionally `Spec`) |
| `post-commit` | After commit lands | Advisory | Auto-generate a session summary file in `.context-index/sessions/` |

### pre-commit

**Script:** `.githooks/pre-commit`
**Behavior:** Blocks

**Purpose:** Runs a chain of pre-commit checks before the commit is created. Currently chains the no-inline-Node check (`hooks/pre-commit-no-inline-node.sh`) for `skills/**/SKILL.md` files. Additional project-specific checks can be added to the chain.

**Exit codes:**
- `exit 0` — all checks passed; commit proceeds
- `exit 1` — a check crashed (treat as hard error)
- `exit 2` — a check rejected the commit (policy violation; commit blocked)

Bypass with `git commit --no-verify` only when justified. Provider mirrors under `providers/*/skills/**` are out of scope for the no-inline-Node guard.

### prepare-commit-msg

**Script:** `.githooks/prepare-commit-msg`
**Behavior:** Advisory

**Purpose:** Injects `Author-type` and `Operator` trailers into the commit message template before the user (or agent) writes the subject line. The trailers identify the actor that produced the commit (e.g., `Author-type: agent/claude-code`, `Operator: <user>/local`) and feed into provenance tracking per `manifest.yaml::provenance`.

### commit-msg

**Script:** `.githooks/commit-msg`
**Behavior:** Blocks (when `provenance.require_hooks: true` in manifest)

**Purpose:** Validates that the commit message contains all trailers listed in `manifest.yaml::provenance.required_trailers` (e.g., `Author-type`, `Operator`). When `provenance.require_hooks` is `false` (default), missing trailers produce a warning but allow the commit. When `true`, missing trailers reject the commit with `exit 2`.

`Spec:` and `Plan-task:` trailers are listed in `provenance.recommended_trailers` and are advisory by default — `/adev:implement` adds them automatically; manual commits touching spec-tracked code should add them.

### post-commit

**Script:** `.githooks/post-commit`
**Behavior:** Advisory (always exits 0; never blocks)

**Purpose:** Auto-generates one session summary file per commit at `.context-index/sessions/<date>-<shortSHA>.md`. The file contains structured commit metadata (date, type, mode, agent, specs-touched, commits) plus the commit subject and body — pre-parsed so that `/adev:retro`, `/adev:hygiene`, and audit skills can walk recent activity without re-parsing `git log`.

**What it writes:**
- One markdown file per commit at `.context-index/sessions/<YYYY-MM-DD>-<short-sha>.md`
- Includes `specs-touched` derived from the commit's `Spec:` trailer (multiple specs supported, comma-separated)
- Always exits 0 — if `node` is unavailable or any step fails, the hook quietly no-ops

**Adopter convention for these files (important — see issue `adev-plugin-4l8t`, legacy id `issue-518`):**

| Question | Answer |
|---|---|
| Are they tracked content? | **Yes** by default. The installer's `adev:gitignore` paired-marker block (canonical list at `lib/gitignore-paths.mjs`) ignores ephemeral adev artifacts — lifecycle state, hygiene reports, atomic-write temps, the prototype workspace, and more — but **does not** include `.context-index/sessions/` (session files are separately owned by `lib/session-capture-installer.mjs::appendSessionCaptureGitignoreBlock`). So `git status` will show session files after each commit. |
| How should they be committed? | **Batch them periodically** under one `chore(sessions): record YYYY-MM-DD transcripts` commit at session end or once per day. Do not interleave them with feature commits — that pollutes diff scope. The session file referencing the *most recent* commit will always be "one behind" (it's generated *after* the commit lands), which is fine; the next batch picks it up. |
| Can I gitignore them instead? | **Yes**, if your project does not run `/adev:retro` or other audit skills that consume the files. Add `.context-index/sessions/` to your `.gitignore`. You will lose the pre-parsed session-activity surface but `git log` still has the canonical commit record. |
| Why not auto-batch in the post-commit hook? | Auto-batching would create amend-loops, fight with `rebase`/`squash`, and surprise users with extra commits they didn't author. The convention is intentionally manual. |

**Distinction from `.session-tracking.jsonl`:** The `.context-index/.session-tracking.jsonl` file (written by the **Claude Code** `session-capture` PostToolUse hook, documented above) is a separate, **gitignored** telemetry stream — one line per tool call. The post-commit `.md` files are a separate, **tracked** per-commit summary stream. Names are similar; sources, contents, and tracking conventions differ.

### Chained hooks (when the project already uses husky, lefthook, …)

If `core.hooksPath` already points somewhere other than `.githooks/` when you run `adev install` or `adev upgrade`, the installer offers three choices. **Chaining is the default** — pressing Enter selects it.

Chaining rewrites your hooks. For each hook name, the real body is copied to `.githooks/<name>.adev` and the tracked `.githooks/<name>` is **replaced** by a ~40-line wrapper that runs the adev hook first, then yours. The installer warns before doing this and lists the files it will rewrite, because in a repo with substantial hooks the resulting diff is large (639 deleted lines across four hooks, in one observed case) and is easy to mistake for corruption.

| Question | Answer |
|---|---|
| Is `.githooks/<name>` (the wrapper) tracked? | **Yes.** It is the hook git executes. It must be committed for chaining to work for anyone else on the team. |
| Are `.githooks/*.adev` (the bodies) tracked? | **No — gitignored.** They are regenerated from the plugin's own `hooks/` on every install and upgrade, so a committed copy would silently diverge from the installed plugin version. The pattern ships in the `adev:gitignore` managed block (canonical list at `lib/gitignore-paths.mjs`). |
| What happens if a `.adev` body is missing on a fresh clone? | The wrapper **fails closed**: it exits non-zero with a diagnostic naming the path, and tells you to run `adev upgrade`. It does not silently skip. Run `adev install` or `adev upgrade` after cloning to regenerate them. |
| What if a hook loses its executable bit? | Same — non-zero exit, with the `chmod +x` command in the message. The exec bit does not survive archive/restore, zip, some CI checkouts, or Windows/WSL, so this is a state hooks reach in practice. |
| Can I make it skip instead of failing? | Set `ADEV_HOOK_CHAIN_ALLOW_MISSING=1`. The skip is then announced on stderr rather than silent. Use it deliberately — a guard that is skipped without saying so is indistinguishable from a guard that approved the commit. |

**Why fail closed.** The wrapper's whole job is to run guards. Earlier versions guarded both hooks with `[ -x ]` and fell through to `exit 0`, which collapses three distinct states — absent, present-but-not-executable, and runnable — into "skip silently". When that happened, protected-branch blocking, conventional-commit validation, provenance trailer injection, and the inline-Node policy check all stopped running locally with no signal. CI still catches some of it at PR time (see ADR-0007), but by then every local guard has been off for the whole branch.

**Portability.** The wrapper resolves your original hook relative to its own directory (`.githooks/..`), never as an absolute path from the machine that ran the installer. An absolute path would not exist on a teammate's clone, and — before the fail-closed change — that turned into their original hooks silently not running.
