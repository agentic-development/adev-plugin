<!-- partial_schema: spec@1 -->

---
charter: session-awareness
kind: behavioral
status: review-blocked
risk_level: medium
milestone: 0.28.0
revision: 1
charter-revision: 6
created: 2026-05-20
updated: 2026-05-20
tracker-ref: issue-527
---

# Live Spec: Hook-Driven Session Capture with Init-Time Configuration

<!-- Bundles two capabilities from session-awareness charter rev 6:
       1. Hook-Driven Session Capture — SessionEnd + PreCompact triggers replace
          the legacy post-commit capture; sessions/ gitignored by default.
       2. Init-Time Capture Configuration — /adev:init prompts for the new
          manifest keys with detection-based defaults (new vs. existing project).

     Supersedes the design direction of post-commit-self-skip.spec.md (validated
     0.27.1, marked superseded in charter rev 4). The legacy post-commit path
     remains available behind `integrations.session_capture.capture: post-commit`
     for back-compat. -->

## Behavioral Contract

### Preconditions

- `manifest.yaml` exists with at least the `project` block; the `integrations.session_capture` block is created by the init wizard.
- For `capture: hook`: the Claude Code harness is the active runtime (SessionEnd / PreCompact events exist only there); `hooks/session-end.sh` and `hooks/pre-compact.sh` are registered in `hooks/hooks.json`.
- For `capture: post-commit`: `.githooks/post-commit` still contains the legacy session-capture block (installer keeps it intact for projects on this mode).
- For `capture: off`: no preconditions beyond the manifest entry; both legacy and new hooks are unregistered or no-op.
- `lib/session-summary.mjs` exposes `fromTranscript(transcriptPath, opts)` (added by this spec).
- `lib/session-capture.mjs` exposes `detectExistingCapture(projectRoot)` (new module added by this spec).

### Invariants

- **Capture is observational, never blocking.** All session-capture hooks exit 0 in every code path, including malformed payloads, filesystem errors, and transcript parse failures. Failures emit a single diagnostic line to stderr; they never block Claude Code's session lifecycle.
- **`integrations.session_capture.capture` is one of `hook`, `post-commit`, `off`.** Any other value is rejected by the init wizard and treated as `off` at hook runtime (fail-safe).
- **`capture: off` writes nothing.** Neither legacy nor new triggers write to `.context-index/sessions/` when capture is off, regardless of which scripts happen to be on disk. The hooks themselves read the manifest on each fire and gate writes on this value.
- **Atomic writes.** Every session file is written via temp-rename (`<path>.tmp-<pid>` → `<path>`). Partial writes never reach the final filename.
- **One file per session per day.** PreCompact and SessionEnd from the same `session_id` write to the same path `<YYYY-MM-DD>-<session_id_short>.md` (session_id_short = first 8 characters). Last write wins. PreCompact serves as a recovery snapshot if SessionEnd never fires.
- **Detection is pure.** `detectExistingCapture(projectRoot)` is a read-only function over `.githooks/post-commit` and tracked `.context-index/sessions/*.md` paths. It never writes.
- **Configurability is per-project, read on every fire.** Hooks re-read `manifest.yaml:integrations.session_capture` on each invocation. No cached state. A manifest edit takes effect on the next event without re-running the installer.
- **No silent migration.** Existing projects (detection signals present) default to `post-commit, gitignored: false` in the init prompt. The user must explicitly opt in to `hook` mode for any change to occur. The installer does not auto-rewrite existing project configs.

### Behaviors

1. **When** the user runs `/adev:init` in a project where `detectExistingCapture(projectRoot)` returns `{ existing: false }` **then** the wizard prompts for `integrations.session_capture.capture` with `hook` as default-accept and `integrations.session_capture.gitignored` with `true` as default-accept.

2. **When** the user runs `/adev:init` in a project where `detectExistingCapture(projectRoot)` returns `{ existing: true, signals: [...] }` **then** the wizard prompts with `post-commit` and `false` as default-accept and surfaces the detected signals in the prompt body so the user knows why.

3. **When** the user re-runs `/adev:init` on a project that already has `integrations.session_capture` set **then** the wizard reads current values and offers them as default-accept for each prompt (no detection override).

4. **When** the installer runs with `capture: hook` in the manifest **then** it registers `hooks/session-end.sh` and `hooks/pre-compact.sh` in `hooks/hooks.json` under the `SessionEnd` and `PreCompact` matchers respectively, and removes the legacy session-capture block from `.githooks/post-commit` if present.

5. **When** the installer runs with `capture: post-commit` **then** it leaves `.githooks/post-commit` intact and does NOT register the new SessionEnd / PreCompact hooks (removing them from `hooks/hooks.json` if they were previously registered).

6. **When** the installer runs with `capture: off` **then** it registers neither new hook AND removes the legacy session-capture block from `.githooks/post-commit` if present. No session writes from any path.

7. **When** Claude Code fires `SessionEnd` with payload `{ session_id, transcript_path, cwd, reason }` and the project manifest has `capture: hook` **then** `hooks/session-end.sh` invokes a Node helper that calls `fromTranscript(transcriptPath)` from `lib/session-summary.mjs`, renders the summary markdown body, and writes it atomically to `<cwd>/.context-index/sessions/<YYYY-MM-DD>-<session_id_short>.md` (session_id_short = first 8 characters of session_id).

8. **When** Claude Code fires `PreCompact` and `capture: hook` **then** `hooks/pre-compact.sh` performs the same write to the same path. Last write wins per (date, session_id_short). PreCompact captures act as recovery snapshots; SessionEnd overwrites with the final transcript.

9. **When** any hook fires and reads `manifest.yaml:integrations.session_capture.capture` equal to `off` or unset **then** the hook exits 0 immediately without writing.

10. **When** the installer runs with `gitignored: true` **then** it appends `.context-index/sessions/` to the project `.gitignore` under an annotated comment block (`# Added by adev install (session_capture.gitignored=true)`). The append is idempotent — re-running the installer does not duplicate the entry.

11. **When** the installer runs with `gitignored: false` **then** it does NOT add or remove the gitignore entry (user remains free to manage `.gitignore` manually).

12. **When** a session-capture consumer (`/adev:work`, `/adev:status`, `/adev:hygiene`) reads `.context-index/sessions/` and the directory is missing, empty, or only contains files older than the consumer's analysis window **then** the consumer proceeds without warning or error (graceful absence).

13. **When** `fromTranscript()` is called on a malformed transcript (missing or invalid JSONL lines) **then** it returns a minimal placeholder summary (date, session_id, "transcript could not be parsed") rather than throwing. The hook still writes the placeholder to the session file.

### Postconditions

- After install with `capture: hook, gitignored: true`: `.context-index/sessions/` is in `.gitignore`, `hooks/hooks.json` lists session-end.sh and pre-compact.sh, `.githooks/post-commit` no longer contains the session-capture block.
- After install with `capture: post-commit, gitignored: false`: no change to `.gitignore`, `hooks/hooks.json` has no session-related entries, `.githooks/post-commit` retains the legacy block.
- After install with `capture: off`: `hooks/hooks.json` has no session-related entries, `.githooks/post-commit` has no legacy block, `.gitignore` is untouched (additions removed only if previously written by adev — never removes user-authored entries).
- After any SessionEnd or PreCompact fire with `capture: hook`: exactly one file exists at `.context-index/sessions/<date>-<sid_short>.md` reflecting the most recent event for that session_id.

### Error Cases

| Condition | Expected Behavior |
|---|---|
| `manifest.yaml` missing `integrations.session_capture` block | Hooks treat as `capture: off` (fail-safe); installer writes the block on next init run |
| Invalid `capture` value (e.g., `manual`) in manifest | Hook treats as `off`; init wizard rejects on input with a clear error naming the three valid values |
| `hooks/session-end.sh` invoked with payload missing `session_id` | Hook exits 0, emits stderr diagnostic, writes no file |
| `hooks/session-end.sh` invoked with payload missing `transcript_path` | Same as above |
| `fromTranscript()` throws (filesystem error reading transcript) | Hook exits 0, writes minimal placeholder file noting the error |
| `.context-index/sessions/` directory missing when hook fires | Hook creates via `mkdir -p`; on permission failure, exits 0 with stderr diagnostic |
| User edits `manifest.yaml:integrations.session_capture` without re-running installer | Configuration is read on each hook fire; manifest change takes effect on next event |
| Init wizard cancelled (Ctrl-C) before answering session-capture prompts | No manifest mutation; existing values (if any) preserved |
| Installer run on existing project with `capture: hook` but legacy post-commit block already manually removed | Installer no-ops on the removal step (idempotent) |
| `git diff-tree` unavailable when `capture: post-commit` (legacy path) | Pre-rev-4 behavior unchanged (fail-open to capture path) |

## System Constitution Reference

- **Principle 1 — Minimize external dependencies.** Two new bash hook scripts (no new deps), one new entry point in `lib/session-summary.mjs` (Node built-ins only), one new module `lib/session-capture.mjs` (also Node built-ins). No new package dependencies introduced.
- **Principle 2 — Skills are primarily markdown.** The init wizard prompt is added to `skills/init/SKILL.md` as a markdown step invoking the `adev` CLI (or a documented prompt mechanism). No inline-Node directive added to the SKILL.md.
- **Principle 3 — Pure ESM.** `lib/session-summary.mjs::fromTranscript()` and `lib/session-capture.mjs` both use ESM. No CommonJS introduced.
- **Principle 4 — Hook protocol compliance.** Both new hooks read the SessionEnd / PreCompact JSON payload from stdin per Claude Code's contract, exit 0 always (fail-safe; capture is observational, never blocks Claude Code), and emit no stdout JSON. Stderr is used only for diagnostics.

## Module Impact Map

| Module | Impact | Changes Required |
|---|---|---|
| `hooks/` | High | NEW: `hooks/session-end.sh`, `hooks/pre-compact.sh`. UPDATE: `hooks/hooks.json` entries gated on capture mode. |
| `lib/session-summary.mjs` | Medium | Add `fromTranscript(transcriptPath, opts)` — derives summary markdown from a Claude Code transcript JSONL. Existing git-derived path unchanged. |
| `lib/session-capture.mjs` | High | NEW module. Exposes `detectExistingCapture(projectRoot)` returning `{ existing: bool, signals: string[] }`; also houses the shared Node helper invoked by both new hook scripts (path resolution, atomic write, manifest read). |
| `cli/index.mjs` (installer) | Medium | Read `integrations.session_capture` block. Apply mode-specific actions: register/unregister hooks in `hooks.json`, remove legacy block from `.githooks/post-commit`, append-or-skip gitignore entry. Remove the manual-batching warning text at the documented line range. |
| `skills/init/SKILL.md` | Low | NEW prompt step describing the two new manifest keys with detection-based defaults. No inline-Node. |
| `templates/` (gitignore template or installer's gitignore-append logic) | Low | Idempotent append of `.context-index/sessions/` under annotated comment block, gated on `gitignored: true`. |
| `.githooks/post-commit` (installer-managed block only) | Medium | The session-capture portion of this hook is removed by the installer when capture mode is `hook` or `off`. Other post-commit logic untouched. |
| `tests/` | High | New test files: `tests/hooks/session-end.test.mjs`, `tests/hooks/pre-compact.test.mjs`, `tests/lib/session-capture-detect.test.mjs`, `tests/lib/session-summary-from-transcript.test.mjs`, `tests/cli/install-session-capture.test.mjs`. |

## Actionable Task Map

| Task | Description | Complexity |
|---|---|---|
| Manifest schema | Add `integrations.session_capture.{capture, gitignored}` keys to the manifest documentation/comments. Validate in init wizard. | small |
| `detectExistingCapture()` | New `lib/session-capture.mjs`; reads `.githooks/post-commit` for the capture block signature and globs tracked `.context-index/sessions/*.md`. Returns `{ existing, signals }`. | small |
| Hook helper module | In `lib/session-capture.mjs`: shared helper that reads manifest, parses hook payload, calls `fromTranscript()`, writes atomically. Used by both bash hooks. | medium |
| `fromTranscript()` | Extension to `lib/session-summary.mjs`. Reads transcript JSONL, derives same markdown shape as the existing git-derived summarizer. | medium |
| `hooks/session-end.sh` | Bash wrapper: reads stdin, invokes Node helper with SessionEnd args. | small |
| `hooks/pre-compact.sh` | Bash wrapper, same pattern with PreCompact args. | small |
| Installer config branch | `cli/index.mjs`: read manifest config, dispatch to the three modes (`hook`/`post-commit`/`off`). Idempotent. | medium |
| Installer gitignore append | Idempotent append under annotated block. | small |
| Installer post-commit cleanup | Remove legacy session-capture block when capture mode is `hook` or `off`. | small |
| Init wizard prompt step | New prompt sequence in `skills/init/SKILL.md` + supporting CLI/helper as needed. | medium |
| Remove manual-batching warning | Delete the lines from `cli/index.mjs` install output. | trivial |
| Tests — hooks | Per-hook unit tests with synthesized SessionEnd / PreCompact payloads. | medium |
| Tests — detector | Cover new project, existing-post-commit project, tracked-sessions project, both signals. | small |
| Tests — fromTranscript | Cover happy path, malformed JSONL, missing file. | small |
| Tests — installer | Cover the three modes end-to-end with fixture manifests. | medium |
| Consumer regression tests | Verify `/adev:work`, `/adev:status`, `/adev:hygiene` degrade silently when sessions/ is empty or capture is off. | small |
| Smoke test | Manual: run `/adev:init` on a fresh tempdir, verify hooks + gitignore wired correctly. | trivial |

## Acceptance Criteria

- [ ] `manifest.yaml:integrations.session_capture` accepts `provider`, `capture` (`hook`/`post-commit`/`off`), and `gitignored` (bool) keys.
- [ ] `/adev:init` prompts for `capture` and `gitignored` with detection-based defaults (new project → `hook, true`; existing project → `post-commit, false`).
- [ ] `detectExistingCapture(projectRoot)` is exposed from `lib/session-capture.mjs` and used by the init prompt.
- [ ] Installer registers `session-end.sh` and `pre-compact.sh` in `hooks/hooks.json` when `capture: hook`.
- [ ] Installer removes the legacy session-capture block from `.githooks/post-commit` when `capture: hook` or `capture: off`.
- [ ] Installer leaves `.githooks/post-commit` intact when `capture: post-commit`.
- [ ] Installer is idempotent across re-runs (no duplicate gitignore entries, no double-registered hooks).
- [ ] `SessionEnd` hook writes `<YYYY-MM-DD>-<session_id_short>.md` atomically when `capture: hook`.
- [ ] `PreCompact` hook writes to the same path; last write wins.
- [ ] Hooks exit 0 in all error paths (malformed payload, missing transcript, permission errors).
- [ ] Hooks read manifest on every fire; runtime config changes take effect without re-running the installer.
- [ ] Installer appends `.context-index/sessions/` to project `.gitignore` (idempotent, annotated block) when `gitignored: true`.
- [ ] `lib/session-summary.mjs::fromTranscript(transcriptPath)` renders the same markdown shape as the existing git-derived path on a happy-path transcript.
- [ ] `fromTranscript()` returns a placeholder summary (not throw) on malformed transcripts.
- [ ] All four consumers (`/adev:work`, `/adev:status`, `/adev:hygiene`, `/adev:retro` baseline) handle empty/missing `.context-index/sessions/` without warnings (regression covered by tests).
- [ ] Manual-batching warning text removed from `cli/index.mjs` install output.
- [ ] All quality gates pass (`npm test`).
- [ ] No new external dependencies (Principle 1).
- [ ] No inline-Node patterns introduced in `skills/init/SKILL.md` (Principle 2 + pre-commit hook).
- [ ] All new code is pure ESM (Principle 3).
- [ ] All new hooks exit 0 in every documented path (Principle 4).
- [ ] Pre-commit hooks pass (no protected-branch or inline-Node violations).
