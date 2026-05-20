<!-- partial_schema: spec@1 -->

---
charter: session-awareness
kind: behavioral
status: review-passed
risk_level: medium
milestone: 0.28.0
revision: 4
charter-revision: 6
created: 2026-05-20
updated: 2026-05-20
tracker-ref: issue-527
supersedes:
  - .context-index/specs/features/session-awareness/post-commit-self-skip.spec.md
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
     for back-compat.

     Rev 2 addresses the rev 1 review BLOCK (3 security blockers + 8 warnings).
     Key additions: transcript redaction policy (SEC-1), session_id charset
     validation (SEC-2), transcript_path containment (SEC-3), paired-marker
     idempotency for both post-commit removal and gitignore (SA-3 + SEC-5),
     PreCompact-after-SessionEnd skip-if-present (SA-2), CLI verb naming for the
     init prompt step (SA-5), expanded Module Impact Map (SA-6), symmetric
     gitignore removal on capture: off (SA-7), supersession bookkeeping for
     post-commit-self-skip.spec.md (SA-8), pinned bash-wrapper gate-check
     (SEC-6), stable stderr diagnostic format (SEC-7), and full session_id in
     filenames (resolves CON-3 — supersedes the prior 8-char prefix).

     Rev 3 addresses the rev 2 review's two warnings without changing any
     behavior: SEC-9 expands the redaction pattern list (adds PEM private-key
     blocks, Slack/Google/Stripe keys, distinguishes Stripe `sk_` from
     LLM `sk-`), SEC-10 tightens containment to realpath-vs-realpath
     comparison for both transcript_path and the transcripts-root anchor, plus
     a manifest-walk-from-realpath rule for the cwd check. The dropped
     `platform-context.yaml` override clause incidentally resolves the
     duplicated SA-10 / CON-9 suggestion.

     Rev 4 adds optional SessionEnd frontmatter fields consumed by the
     downstream Retro Session Consumption spec (`retro-session-consumption
     .spec.md`, rev 1). Six optional fields land in the SessionEnd-rendered
     `.md` file: `cost_usd`, `input_tokens`, `output_tokens`, `model`
     (sourced from Claude Code transcript usage blocks), and `issue`,
     `epic` (sourced from `.context-index/.execution-state.json` at
     SessionEnd time when status is active). All six are strictly optional —
     absent fields are not errors, and downstream consumers (retro) must
     tolerate absence per their own contract. No behavior change in the
     hook scripts themselves; the new fields are populated inside the
     existing Node helper invoked by Task 5 (shared hook helper) and
     Task 6 (fromTranscript), so the existing 22-task plan absorbs the
     work without adding a new plan task. -->

## Behavioral Contract

### Preconditions

- `manifest.yaml` exists with at least the `project` block; the `integrations.session_capture` block is created by the init wizard.
- For `capture: hook`: the Claude Code harness is the active runtime (SessionEnd / PreCompact events exist only there); `hooks/session-end.sh` and `hooks/pre-compact.sh` are registered in `hooks/hooks.json`.
- For `capture: post-commit`: `.githooks/post-commit` still contains the legacy session-capture block wrapped in paired sentinels (`# >>> adev:session-capture >>>` / `# <<< adev:session-capture <<<`). One-time migration adds the sentinels for legacy projects.
- For `capture: off`: no preconditions beyond the manifest entry; both legacy and new hooks are unregistered or no-op.
- `lib/session-summary.mjs` exposes `fromTranscript(transcriptPath, opts)` and `redactSecrets(text)` (added by this spec).
- `lib/session-capture.mjs` exposes `detectExistingCapture(projectRoot)`, `validateSessionId(id)`, and `validateTranscriptPath(path, cwd)` (new module added by this spec).
- `adev init prompt session-capture` CLI verb exists as the prompt-driver invoked from `skills/init/SKILL.md` (no inline-Node in the skill).

### Invariants

- **Capture is observational, never blocking.** All session-capture hooks exit 0 in every code path, including malformed payloads, filesystem errors, and transcript parse failures. Failures emit a single diagnostic line to stderr (see *Stderr diagnostic format* invariant); they never block Claude Code's session lifecycle.
- **`integrations.session_capture.capture` is one of `hook`, `post-commit`, `off`.** Any other value is rejected by the init wizard and treated as `off` at hook runtime (fail-safe).
- **`capture: off` writes nothing.** Neither legacy nor new triggers write to `.context-index/sessions/` when capture is off, regardless of which scripts happen to be on disk.
- **Bash-wrapper gate (SEC-6).** Each new hook script's first non-trivial step is a `grep`/`awk` on `manifest.yaml` for `capture:`. The Node helper is **not** spawned unless `capture` is `hook`. This pins the disable-fast-path to the wrapper level — no filesystem side effects (including `mkdir -p`) occur on the disabled path.
- **Atomic writes (SEC-4).** Every session file is written via temp-rename `<path>.tmp-<pid>-<8hex>` → `<path>`, where `<8hex>` is 8 hex characters from `crypto.randomBytes(4)`. The random suffix prevents collisions across worktrees or recycled PIDs. The rename is atomic per POSIX; last-writer-wins at the rename syscall is the intentional resolution for concurrent fires.
- **One file per session per day.** PreCompact and SessionEnd from the same `session_id` write to the same path `<YYYY-MM-DD>-<session_id>.md` (full session_id, sanitized per the *Session ID charset* invariant). Last write wins, EXCEPT a PreCompact write MUST NOT overwrite an existing file whose YAML frontmatter contains `kind: session-end` (SA-2 — handles delayed-delivery PreCompact-after-SessionEnd).
- **Session ID charset (SEC-2).** `session_id` from the hook payload must match `^[A-Za-z0-9_-]+$` (Claude session IDs are UUID-like). The hook rejects any session_id outside this charset by exiting 0 with stderr diagnostic; no file is written.
- **Working directory check (SEC-10).** `cwd` from the hook payload must be an absolute path. After `realpath` resolution the helper walks upward starting from the **resolved** path looking for `manifest.yaml`; the walk must NOT start from the raw input. Hooks reject (exit 0, stderr) when `cwd` is not absolute or when no `manifest.yaml` is found in the realpath-resolved ancestry.
- **Transcript path containment (SEC-3, SEC-10).** `transcript_path` from the hook payload must (a) end in `.jsonl`, and (b) after `realpath` resolution be a path-prefix child of the Claude Code transcripts root **also after its own realpath resolution**. The transcripts root is `~/.claude/projects/<cwd-encoded>/` (resolved against `process.env.HOME`); both operands of the prefix comparison must be the `realpath`-resolved forms — never compare resolved-vs-raw, which lets symlinks escape (e.g., `~/.claude` → `/tmp/...`). Hooks reject (exit 0, stderr) any path failing containment; `fromTranscript()` never opens a file outside this root.
- **Transcript redaction (SEC-1, SEC-9).** `fromTranscript()` calls `redactSecrets()` over every user-facing token before rendering the markdown body. Redaction patterns include:
  - **PEM private-key blocks** — multiline match `-----BEGIN (RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END \1?PRIVATE KEY-----`; the entire block (header + body + footer) is replaced with `[REDACTED:private-key]`. Highest-impact pattern; processed first.
  - **AWS access keys** — `AKIA[A-Z0-9]{16}` → `[REDACTED:aws-access-key]`
  - **GitHub tokens** — `gh[pousr]_[A-Za-z0-9]{36,}` → `[REDACTED:github-token]`
  - **OpenAI / Anthropic keys** — `sk-(ant-)?[A-Za-z0-9_-]{20,}` (hyphen separator) → `[REDACTED:llm-key]`
  - **Stripe keys** — `sk_(live|test)_[0-9A-Za-z]{24,}` (underscore separator — distinct from the LLM-key pattern; do not collapse) → `[REDACTED:stripe-key]`
  - **Slack tokens** — `xox[abprs]-[0-9A-Za-z-]+` → `[REDACTED:slack-token]`
  - **Google API keys** — `AIza[0-9A-Za-z_-]{35}` → `[REDACTED:google-api-key]`
  - **Generic JWTs** — `eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}` → `[REDACTED:jwt]`
  - **`Authorization: Bearer …` headers** — `(?i)authorization:\s*bearer\s+[A-Za-z0-9._-]+` → `Authorization: [REDACTED:bearer]`
  - **`.env`-style secret KEY=VALUE** — `KEY` matches `(?i)(api[_-]?key|token|secret|password|auth|private[_-]?key)`, value is any non-whitespace run → replaces the value with `[REDACTED:env-secret]`
  Redaction applies unconditionally regardless of `gitignored` value — defense-in-depth against accidental `git add`. Pattern order is significant: PEM block first (multiline, may contain `KEY=VALUE`-like tail), then specific key patterns, then generic Bearer / env-secret fallbacks.
- **Detection is pure.** `detectExistingCapture(projectRoot)` is a read-only function over `.githooks/post-commit` (looks for the sentinel block or, on legacy projects, the legacy capture-write call signature) and tracked `.context-index/sessions/*.md`. It never writes.
- **Configurability is per-project, read on every fire.** Hooks re-read `manifest.yaml:integrations.session_capture` on each invocation. No cached state. A manifest edit takes effect on the next event without re-running the installer.
- **Stored config trumps detection (SA-4).** When the manifest already contains `integrations.session_capture.capture`, the value there wins over `detectExistingCapture()` signals — but the init wizard surfaces a one-line warning when the two disagree (stored=`post-commit` but legacy block already removed, or stored=`hook` but `.githooks/post-commit` still contains the legacy block). The warning is informational; the stored config is applied as-is.
- **No silent migration.** Existing projects (detection signals present) default to `post-commit, gitignored: false` in the init prompt. The user must explicitly opt in to `hook` mode. The installer does not auto-rewrite existing project configs.
- **Paired-marker idempotency (SA-3, SEC-5).** Installer-managed regions in `.githooks/post-commit` and `.gitignore` are delimited by paired sentinels: `# >>> adev:session-capture >>>` … `# <<< adev:session-capture <<<` for post-commit; `# >>> adev:session-capture-gitignore >>>` … `# <<< adev:session-capture-gitignore <<<` for `.gitignore`. The installer reads, writes, and removes content strictly between matched markers. User-authored content outside the markers is never touched. If sentinels are absent on a project that has the legacy capture (pre-rev-2), the installer prints a manual-migration instruction and does not guess at boundaries.
- **Stderr diagnostic format (SEC-7).** Hook stderr lines have the shape `[adev:session-capture] <reason-code> <project-relative-path?>` where `<reason-code>` is one of `parse-error`, `path-error`, `permission-error`, `payload-error`, `validation-error`, or `disabled`. No interpolated user content; no absolute paths beyond a project-relative output filename when one is referenced.
- **Optional SessionEnd frontmatter (rev 4 — for retro consumption).** When `fromTranscript()` succeeds, it MAY emit additional frontmatter keys derived from the transcript's usage blocks: `cost_usd: <float>` (sum across assistant turns), `input_tokens: <int>`, `output_tokens: <int>`, `model: <string>` (most-frequent model across turns; ties broken by last-used). When `.context-index/.execution-state.json` exists and has `status: "active"` with a non-empty `issueBinding`, the shared hook helper MAY also emit `issue: <issue-id>` (from `issueBinding`) and `epic: <epic-id>` (resolved from the issue's `epicId` on the issue board, when present). All six fields are strictly optional — absent fields are not errors at the producer side, and downstream consumers (retro) tolerate absence per their own contract. Field absence reasons documented in Error Cases.

### Behaviors

1. **When** the user runs `/adev:init` in a project where `detectExistingCapture(projectRoot)` returns `{ existing: false }` **then** `skills/init/SKILL.md` invokes `adev init prompt session-capture` which presents `integrations.session_capture.capture` with `hook` as default-accept and `integrations.session_capture.gitignored` with `true` as default-accept.

2. **When** the user runs `/adev:init` in a project where `detectExistingCapture(projectRoot)` returns `{ existing: true, signals: [...] }` **then** `adev init prompt session-capture` presents `post-commit` and `false` as default-accept, surfacing the detected signals in the prompt body so the user understands why the default flipped.

3. **When** the user re-runs `/adev:init` on a project that already has `integrations.session_capture.capture` set **then** the prompt verb reads current manifest values and offers them as default-accept (no detection override), AND when detection signals contradict the stored value, the prompt surfaces a one-line informational warning (e.g., "manifest says `capture: post-commit` but no legacy block detected — config will be applied as-is").

4. **When** the user accepts the prompts **then** `adev init prompt session-capture` writes the chosen values under `integrations.session_capture.{capture,gitignored}` in `manifest.yaml`, preserving any existing `provider` key verbatim (the `provider` key is owned by a separate concern; this verb never modifies it).

5. **When** the installer runs with `capture: hook` in the manifest **then** it (a) registers `hooks/session-end.sh` and `hooks/pre-compact.sh` in `hooks/hooks.json` under the `SessionEnd` and `PreCompact` matchers respectively, idempotently; AND (b) removes the legacy session-capture block from `.githooks/post-commit` — strictly the content between paired `# >>> adev:session-capture >>>` / `# <<< adev:session-capture <<<` markers. If the markers are absent on a project where `detectExistingCapture()` reports `existing: true`, the installer prints a manual-migration instruction and does not modify the file.

6. **When** the installer runs with `capture: post-commit` **then** it leaves `.githooks/post-commit` intact (sentinel-wrapped legacy block remains) and removes any prior `session-end.sh` / `pre-compact.sh` entries from `hooks/hooks.json`. The new bash scripts may remain on disk but are not registered.

7. **When** the installer runs with `capture: off` **then** it registers neither new hook, removes the sentinel-bounded legacy block from `.githooks/post-commit` if present, AND removes the sentinel-bounded gitignore block from `.gitignore` if it was previously added by the installer (SA-7). User-authored content outside the markers is never touched. Pre-existing files under `.context-index/sessions/` are preserved on disk (no deletion); the installer prints a one-line hint listing the directory so the user can clean up manually if desired (SEC-8).

8. **When** Claude Code fires `SessionEnd` with payload `{ session_id, transcript_path, cwd, reason }` and the project manifest has `capture: hook` AND all three of *Session ID charset*, *Working directory check*, and *Transcript path containment* invariants pass **then** `hooks/session-end.sh` invokes the Node helper which calls `fromTranscript(transcriptPath)` from `lib/session-summary.mjs`, renders the summary markdown body with redaction applied (per *Transcript redaction* invariant), writes YAML frontmatter including the required keys `kind: session-end`, `session_id`, `date`, plus any of the six optional keys per the *Optional SessionEnd frontmatter* invariant (`cost_usd`, `input_tokens`, `output_tokens`, `model`, `issue`, `epic`) whose source data was available, and atomically renames to `<cwd>/.context-index/sessions/<YYYY-MM-DD>-<session_id>.md`.

9. **When** Claude Code fires `PreCompact` and `capture: hook` AND all validation invariants pass AND the target path does NOT already exist with `kind: session-end` in its frontmatter **then** `hooks/pre-compact.sh` performs the same render-and-write as Behavior 8, but emits `kind: pre-compact` in the frontmatter. PreCompact captures act as recovery snapshots; the SessionEnd write overwrites with the final transcript.

10. **When** PreCompact fires AND the target path exists with `kind: session-end` frontmatter **then** the hook exits 0 with `[adev:session-capture] disabled <project-relative-path>` to stderr, no overwrite. (SA-2 — handles delayed-delivery PreCompact-after-SessionEnd.)

11. **When** any hook fires and the bash-wrapper gate-check reads `capture` as `off`, `post-commit`, or any value other than `hook` (including missing/unset) **then** the hook exits 0 immediately without spawning the Node helper or touching the filesystem (SEC-6).

12. **When** any hook fires and any of these validations fail — `session_id` outside `^[A-Za-z0-9_-]+$`, `cwd` not an absolute path inside a `manifest.yaml`-bearing directory, `transcript_path` outside the Claude Code transcripts root or not ending in `.jsonl` — **then** the hook exits 0 with the appropriate stderr diagnostic (`validation-error session-id`, `validation-error cwd`, or `path-error transcript`) and writes NO file (SEC-2, SEC-3).

13. **When** the installer runs with `gitignored: true` **then** it appends `.context-index/sessions/` to the project `.gitignore` strictly between paired markers (`# >>> adev:session-capture-gitignore >>>` / `# <<< adev:session-capture-gitignore <<<`). The operation is idempotent — re-running does not duplicate the entry, and only content between markers is touched.

14. **When** the installer runs with `gitignored: false` **then** it removes the sentinel-bounded gitignore block if previously added by the installer; it does NOT add a new block. User-authored `.context-index/sessions/` entries outside the markers are preserved.

15. **When** a session-capture consumer (`/adev:work`, `/adev:status`, `/adev:hygiene`, `/adev:retro`) reads `.context-index/sessions/` and the directory is missing, empty, or contains only files outside the consumer's analysis window **then** the consumer proceeds without warning or error (graceful absence).

16. **When** `fromTranscript()` is called on a malformed transcript (missing file, invalid JSONL, missing expected payload fields) **then** it returns a minimal placeholder summary (date, redacted-where-relevant session_id, reason code) rather than throwing. The hook still writes the placeholder file with `kind: placeholder` in the frontmatter; the hook stderr diagnostic uses `parse-error` (SA-1).

### Postconditions

- After install with `capture: hook, gitignored: true`: `.context-index/sessions/` is in `.gitignore` between adev's paired markers, `hooks/hooks.json` lists session-end.sh and pre-compact.sh under their matchers, and the sentinel-bounded session-capture block in `.githooks/post-commit` has been removed.
- After install with `capture: post-commit, gitignored: false`: no change to `.gitignore`, `hooks/hooks.json` has no session-related entries, `.githooks/post-commit` retains its sentinel-bounded legacy capture block.
- After install with `capture: off`: `hooks/hooks.json` has no session-related entries, the sentinel-bounded legacy block in `.githooks/post-commit` is removed, the sentinel-bounded `.gitignore` block is removed if previously written by adev. User-authored content outside the markers is preserved in both files. Pre-existing files under `.context-index/sessions/` remain on disk (no deletion); the installer's exit message lists the directory for manual cleanup.
- After any SessionEnd or PreCompact fire with `capture: hook` and all validations passing: exactly one file exists at `.context-index/sessions/<YYYY-MM-DD>-<session_id>.md` reflecting the most recent permissible event for that session_id (`kind: session-end` blocks subsequent `kind: pre-compact` overwrites).

### Error Cases

| Condition | Expected Behavior |
|---|---|
| `manifest.yaml` missing `integrations.session_capture` block | Hooks treat as `capture: off` (fail-safe); installer writes the block on next init run |
| Invalid `capture` value (e.g., `manual`) in manifest | Hook treats as `off`; init wizard rejects on input with a clear error naming the three valid values |
| Hook payload missing `session_id` | Hook exits 0, stderr `[adev:session-capture] payload-error session-id-missing`, writes no file |
| Hook payload missing `transcript_path` | Hook exits 0, stderr `[adev:session-capture] payload-error transcript-path-missing`, writes no file |
| Hook payload `session_id` contains chars outside `^[A-Za-z0-9_-]+$` (path-injection attempt) | Hook exits 0, stderr `[adev:session-capture] validation-error session-id`, writes no file (SEC-2) |
| Hook payload `cwd` not absolute OR outside a `manifest.yaml`-bearing directory after `realpath` | Hook exits 0, stderr `[adev:session-capture] validation-error cwd`, writes no file |
| Hook payload `transcript_path` outside Claude Code transcripts root, or not ending `.jsonl` | Hook exits 0, stderr `[adev:session-capture] path-error transcript`, writes no file (SEC-3) |
| PreCompact fires after SessionEnd already wrote the target file | Hook exits 0, stderr `[adev:session-capture] disabled <project-relative-path>`, no overwrite (SA-2) |
| `fromTranscript()` throws (filesystem error reading transcript) | Hook exits 0, writes minimal placeholder file with `kind: placeholder`, stderr `[adev:session-capture] parse-error <project-relative-path>` |
| `redactSecrets()` throws (unexpected exception) | Hook exits 0, writes placeholder file (NOT raw transcript), stderr `[adev:session-capture] parse-error <project-relative-path>` — never persists unredacted content on redaction failure |
| `.context-index/sessions/` directory missing when hook fires | Hook creates via `mkdir -p`; on permission failure, exits 0 with stderr `[adev:session-capture] permission-error sessions-dir` |
| User edits `manifest.yaml:integrations.session_capture` without re-running installer | Configuration is read on each hook fire; manifest change takes effect on next event |
| Init wizard cancelled (Ctrl-C) before answering session-capture prompts | No manifest mutation; existing values (if any) preserved |
| Installer run on a project where `.githooks/post-commit` has the legacy block but NO sentinel markers | Installer prints a one-line manual-migration instruction and does not modify the file (SA-3) |
| Installer run on existing project with sentinel-bounded block already removed | Installer no-ops on the removal step (idempotent) |
| `git diff-tree` unavailable when `capture: post-commit` (legacy path) | Pre-rev-4 behavior unchanged (fail-open to capture path) |
| Manifest stores `capture: post-commit` but `detectExistingCapture()` finds no legacy block (or vice versa) | Init wizard surfaces an informational warning; stored config applied as-is (SA-4) |
| Transcript JSONL has no parseable usage blocks (rev 4) | `cost_usd`, `input_tokens`, `output_tokens`, `model` are omitted from SessionEnd frontmatter; required keys still written; no error |
| Transcript usage blocks present but contain non-numeric values for cost/tokens (rev 4) | Affected optional fields are omitted from frontmatter (skip-on-malformed); other valid fields still written; stderr diagnostic only if `--verbose` |
| `.context-index/.execution-state.json` missing or `status: idle` (rev 4) | `issue` and `epic` are omitted from SessionEnd frontmatter; required keys still written; no error |
| `.execution-state.json` has `issueBinding` but the referenced issue has no parent `epicId` (rev 4) | `issue` is written; `epic` is omitted; no error |
| `.execution-state.json` references an issue id that is not present on the issue board (rev 4) | `issue` field is written with the recorded id; `epic` omitted; downstream retro renders the row with `(unknown)` annotation per its own contract |

## System Constitution Reference

- **Principle 1 — Minimize external dependencies.** Two new bash hook scripts (no new deps), one new entry point in `lib/session-summary.mjs` plus `redactSecrets()` (Node built-ins only), one new module `lib/session-capture.mjs` (also Node built-ins). One new CLI verb `adev init prompt session-capture` lives in `lib/cli/`. No new package dependencies introduced.
- **Principle 2 — Skills are primarily markdown.** The init wizard prompt step in `skills/init/SKILL.md` is a markdown step naming the CLI verb `adev init prompt session-capture`. No inline-Node directive, no `node --input-type=module -e` heredoc, no `node -e`. Pre-commit `no-inline-node` hook enforces this.
- **Principle 3 — Pure ESM.** `lib/session-summary.mjs` extensions, `lib/session-capture.mjs`, and the new CLI verb implementation all use ESM. No CommonJS introduced.
- **Principle 4 — Hook protocol compliance.** Both new hooks read the SessionEnd / PreCompact JSON payload from stdin per Claude Code's contract, exit 0 always (fail-safe; capture is observational, never blocks Claude Code), and emit no stdout JSON. Stderr is used only for diagnostics in the documented stable format (per the *Stderr diagnostic format* invariant). Consistent with ADR 0014's verbatim-passthrough rationale for stderr policy (CON-5).

## Module Impact Map

| Module | Impact | Changes Required |
|---|---|---|
| `hooks/` | High | NEW: `hooks/session-end.sh`, `hooks/pre-compact.sh`. Bash wrappers gate-check `manifest.yaml` for `capture: hook` before spawning the Node helper (SEC-6). UPDATE: `hooks/hooks.json` entries under SessionEnd/PreCompact matchers, gated on capture mode. |
| `lib/session-summary.mjs` | Medium | Add `fromTranscript(transcriptPath, opts)` — derives summary markdown from a Claude Code transcript JSONL, applying `redactSecrets()`. Add `redactSecrets(text)` — applies the documented secret-pattern redaction list (SEC-1). Existing git-derived path unchanged. |
| `lib/session-capture.mjs` | High | NEW module. Exposes `detectExistingCapture(projectRoot)` returning `{ existing: bool, signals: string[] }`, `validateSessionId(id)`, `validateTranscriptPath(path, cwd)`, and the shared Node helper invoked by both new hook scripts (manifest read, validation chain, frontmatter render, atomic write with `<path>.tmp-<pid>-<8hex>` temp name). |
| `lib/cli/init-prompt-session-capture.mjs` | Medium | NEW. Implements the `adev init prompt session-capture` CLI verb: reads current manifest, runs `detectExistingCapture()`, presents the prompt sequence, writes the chosen values back to manifest preserving any existing `provider` key (SA-5). |
| `cli/index.mjs` (installer + verb registration) | Medium | Register the new `adev init prompt session-capture` verb. In the installer flow: read `integrations.session_capture`; dispatch to mode-specific paths (`hook`/`post-commit`/`off`); manage sentinel-bounded blocks in `.githooks/post-commit` and `.gitignore`; remove the manual-batching warning text at the documented line range. |
| `skills/init/SKILL.md` | Low | Add a prompt step that names `adev init prompt session-capture` as the entry point. No inline-Node, no JS fences with control-flow logic — pure markdown referencing the CLI verb (Principle 2 + pre-commit `no-inline-node` hook). |
| `templates/` (gitignore template + installer's append logic) | Low | Provide the paired-marker block template (`# >>> adev:session-capture-gitignore >>>` … `# <<< adev:session-capture-gitignore <<<`). Idempotent reads/writes/removes operate strictly between markers (SEC-5). |
| `.githooks/post-commit` (installer-managed block only) | Medium | One-time migration wraps the legacy capture block in `# >>> adev:session-capture >>>` / `# <<< adev:session-capture <<<` markers. After migration, the installer reads/writes/removes only between markers (SA-3). |
| `/adev:work`, `/adev:status`, `/adev:hygiene`, `/adev:retro` (consumers) | Low | Regression coverage only: tests verify each handles empty/missing `.context-index/sessions/` and capture-off mode without warnings (CON-4, charter Quality Attribute: Graceful absence). No production-code changes expected; consumers already read the directory defensively. |
| `tests/hooks/post-commit-self-skip.test.mjs` (legacy regression) | Low | Gate the test on `capture: post-commit` in its fixture, OR move under `tests/legacy/`. The behavior it asserts only applies to the back-compat path. |
| `.context-index/specs/features/session-awareness/post-commit-self-skip.spec.md` | Low | Frontmatter update: `status: superseded`, add `superseded-by: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md` (SA-8). Body content unchanged (historical record). |
| `tests/` | High | New test files: `tests/hooks/session-end.test.mjs`, `tests/hooks/pre-compact.test.mjs`, `tests/lib/session-capture-detect.test.mjs`, `tests/lib/session-capture-validate.test.mjs`, `tests/lib/session-summary-from-transcript.test.mjs`, `tests/lib/session-summary-redact.test.mjs`, `tests/cli/init-prompt-session-capture.test.mjs`, `tests/cli/install-session-capture.test.mjs`. |

## Actionable Task Map

| Task | Description | Complexity |
|---|---|---|
| Manifest schema | Add `integrations.session_capture.{capture, gitignored}` keys to manifest documentation/comments. Validate values in the prompt verb. | small |
| `validateSessionId()` / `validateTranscriptPath()` / `validateCwd()` (SEC-2, SEC-3) | New helpers in `lib/session-capture.mjs`. Charset + containment checks with `realpath` resolution. | small |
| `redactSecrets(text)` (SEC-1) | New helper in `lib/session-summary.mjs`. Applies the documented pattern list, returning text with `[REDACTED:<class>]` substitutions. | small |
| `detectExistingCapture()` | New helper in `lib/session-capture.mjs`. Reads `.githooks/post-commit` for the sentinel block (and legacy signature fallback), globs tracked `.context-index/sessions/*.md`. Returns `{ existing, signals }`. | small |
| Hook helper module | Shared Node helper in `lib/session-capture.mjs`: reads manifest, runs validation chain, calls `fromTranscript()`, atomically writes with PID+random temp name, checks for prior `kind: session-end` on PreCompact path. | medium |
| `fromTranscript()` (extends `lib/session-summary.mjs`) | Reads transcript JSONL, applies `redactSecrets()`, derives same markdown shape as the existing git-derived summarizer. Returns placeholder on parse failure. | medium |
| `hooks/session-end.sh` | Bash wrapper: gate-check manifest for `capture: hook` (no Node spawn otherwise), then exec Node helper with SessionEnd args via stdin. | small |
| `hooks/pre-compact.sh` | Bash wrapper, same pattern with PreCompact args. | small |
| `adev init prompt session-capture` CLI verb (SA-5) | New verb in `lib/cli/init-prompt-session-capture.mjs` + registration in `cli/index.mjs`. Runs detection, presents prompts, writes manifest. | medium |
| Installer config branch | `cli/index.mjs`: read manifest config, dispatch to the three modes (`hook`/`post-commit`/`off`). Idempotent. | medium |
| Installer gitignore management (SEC-5) | Paired-marker append on `gitignored: true`, paired-marker removal on `gitignored: false` or `capture: off`. Reads/writes/removes only between markers. | small |
| Installer post-commit cleanup (SA-3) | Sentinel-bounded removal when `capture: hook` or `off`. When sentinels absent on a project with detection signals, print manual-migration instruction and skip. | small |
| One-time post-commit migration (SA-3) | Add a sentinel-wrapping step that runs once on `adev upgrade` to wrap the existing legacy capture block. Detect prior application via the markers. | small |
| Remove manual-batching warning | Delete the lines from `cli/index.mjs` install output. | trivial |
| Supersede bookkeeping (SA-8) | Update `.context-index/specs/features/session-awareness/post-commit-self-skip.spec.md` frontmatter to `status: superseded` and `superseded-by: <this spec path>`. Body unchanged. | trivial |
| Tests — hooks | `tests/hooks/session-end.test.mjs`, `tests/hooks/pre-compact.test.mjs` with synthesized payloads. Cover validation rejections (SEC-2, SEC-3) and PreCompact-skip-on-SessionEnd (SA-2). | medium |
| Tests — detector | Cover new project, existing-post-commit project, tracked-sessions project, both signals, manifest-vs-detection conflict (SA-4). | small |
| Tests — validators | `tests/lib/session-capture-validate.test.mjs`. Cover session_id charset, cwd absolute+manifest-bearing, transcript_path containment + extension. | small |
| Tests — fromTranscript | Cover happy path, malformed JSONL, missing file, redaction patterns (cover each pattern class). | medium |
| Tests — installer | `tests/cli/install-session-capture.test.mjs`. Cover the three modes end-to-end with fixture manifests; sentinel-block round-trips; user-content preservation outside markers. | medium |
| Tests — init prompt verb | `tests/cli/init-prompt-session-capture.test.mjs`. Cover prompt defaults for new vs. existing projects, conflict warnings, manifest write preserving `provider` key. | small |
| Consumer regression tests (CON-4, SA-6) | Verify `/adev:work`, `/adev:status`, `/adev:hygiene`, `/adev:retro` baseline behaviors degrade silently when sessions/ is empty or capture is off. | small |
| Smoke test | Manual: run `/adev:init` on a fresh tempdir, verify hooks + gitignore wired correctly. | trivial |

## Acceptance Criteria

- [ ] `manifest.yaml:integrations.session_capture` accepts `capture` (`hook`/`post-commit`/`off`) and `gitignored` (bool) keys, alongside the existing `provider` key which is preserved verbatim.
- [ ] `adev init prompt session-capture` CLI verb prompts for `capture` and `gitignored` with detection-based defaults (new project → `hook, true`; existing project → `post-commit, false`).
- [ ] `skills/init/SKILL.md` invokes the prompt via the CLI verb only — no inline-Node, no node -e, no node --input-type=module -e (pre-commit hook enforces).
- [ ] When manifest stores a value but `detectExistingCapture()` signals contradict it, the prompt surfaces an informational warning and applies the stored config as-is.
- [ ] `detectExistingCapture(projectRoot)` is exposed from `lib/session-capture.mjs` and returns `{ existing: bool, signals: string[] }`.
- [ ] `validateSessionId(id)` rejects (returns false / throws — pick the contract in plan) any session_id outside `^[A-Za-z0-9_-]+$`.
- [ ] `validateTranscriptPath(path, cwd)` rejects any path outside the Claude Code transcripts root or not ending in `.jsonl`.
- [ ] `validateCwd(cwd)` rejects non-absolute paths or paths outside a `manifest.yaml`-bearing directory after `realpath` resolution.
- [ ] `redactSecrets(text)` redacts the full documented pattern list with `[REDACTED:<class>]` substitutions: PEM private-key blocks (header + body + footer, multiline match), AWS access keys, GitHub tokens, OpenAI/Anthropic `sk-` keys, Stripe `sk_(live|test)_` keys (separator distinguishes from LLM keys), Slack tokens, Google API keys, JWTs, `Authorization: Bearer` headers, and `.env`-style secret KEY=VALUE pairs. PEM block matcher runs first; pattern order is asserted by tests.
- [ ] `validateTranscriptPath()` compares the `realpath`-resolved `transcript_path` against the `realpath`-resolved transcripts-root anchor (`~/.claude/projects/<cwd-encoded>/`); resolved-vs-raw comparisons are rejected by test coverage.
- [ ] `validateCwd()` walks upward starting from the `realpath`-resolved `cwd` (not the raw input) when looking for the `manifest.yaml`-bearing directory.
- [ ] Hooks gate-check `manifest.yaml` in the bash wrapper BEFORE spawning the Node helper — verified by test that a `capture: off` invocation never executes the Node helper.
- [ ] On `capture: hook`, installer idempotently registers `session-end.sh` and `pre-compact.sh` in `hooks/hooks.json` under the `SessionEnd` and `PreCompact` matchers.
- [ ] On `capture: hook` or `capture: off`, installer removes sentinel-bounded session-capture block from `.githooks/post-commit`; user content outside markers is preserved.
- [ ] On `capture: post-commit`, installer leaves `.githooks/post-commit` intact (sentinel block remains).
- [ ] When the sentinel block is absent on a project where `detectExistingCapture()` reports `existing: true`, installer prints a manual-migration instruction and does not modify the file.
- [ ] Installer is idempotent across re-runs (no duplicate hook registrations, no duplicate `.gitignore` entries, no extra blank lines accumulated between markers).
- [ ] SessionEnd hook writes `<YYYY-MM-DD>-<session_id>.md` atomically with frontmatter `kind: session-end, session_id, date` and redacted body content when `capture: hook` and all validations pass.
- [ ] PreCompact hook writes the same path with `kind: pre-compact`, BUT skips when the file already exists with `kind: session-end`.
- [ ] Atomic write uses `<path>.tmp-<pid>-<8hex>` temp name with `crypto.randomBytes(4).toString('hex')` suffix.
- [ ] Hooks exit 0 in all error paths (malformed payload, charset violation, path containment violation, missing transcript, permission errors, redaction failure).
- [ ] Hook stderr diagnostics follow `[adev:session-capture] <reason-code> <project-relative-path?>` and contain no interpolated user content or absolute paths beyond a project-relative filename.
- [ ] Hooks read manifest on every fire; runtime config changes take effect without re-running the installer.
- [ ] On `gitignored: true`, installer appends sentinel-bounded `.context-index/sessions/` block to `.gitignore`; on `gitignored: false`, installer removes the block. User-authored entries outside markers preserved.
- [ ] On `capture: off` transition, installer's exit message lists existing files under `.context-index/sessions/` for user awareness (no deletion).
- [ ] `lib/session-summary.mjs::fromTranscript(transcriptPath)` renders the same markdown shape as the existing git-derived path on a happy-path transcript, with redaction applied.
- [ ] `fromTranscript()` returns a placeholder summary (does not throw) on malformed transcripts; placeholder file carries `kind: placeholder` in frontmatter; raw unredacted content is NEVER persisted on redaction failure.
- [ ] All four consumers (`/adev:work`, `/adev:status`, `/adev:hygiene`, `/adev:retro` baseline) handle empty/missing `.context-index/sessions/` without warnings (regression covered by tests).
- [ ] `post-commit-self-skip.spec.md` frontmatter updated to `status: superseded` with `superseded-by` pointer.
- [ ] Manual-batching warning text removed from `cli/index.mjs` install output.
- [ ] All quality gates pass (`npm test`).
- [ ] No new external dependencies (Principle 1).
- [ ] No inline-Node patterns introduced in `skills/init/SKILL.md` (Principle 2 + pre-commit hook).
- [ ] All new code is pure ESM (Principle 3).
- [ ] All new hooks exit 0 in every documented path (Principle 4).
- [ ] Pre-commit hooks pass (no protected-branch or inline-Node violations).
- [ ] (Rev 4) When transcript usage blocks are parseable, SessionEnd writes optional frontmatter fields `cost_usd`, `input_tokens`, `output_tokens`, `model` alongside the required keys. Field absence is not a failure.
- [ ] (Rev 4) When `.context-index/.execution-state.json` has `status: "active"` with a non-empty `issueBinding`, SessionEnd writes optional `issue:` (from `issueBinding`) and `epic:` (from the issue's `epicId` on the board, when present) frontmatter fields.
- [ ] (Rev 4) Malformed usage data, malformed execution-state, or missing source files do not block the SessionEnd write — required keys are always present, and only the optional fields whose source data was unavailable are omitted.
- [ ] (Rev 4) Tests cover each optional field's presence-and-absence path independently, including the `issueBinding present but epic absent` and `transcript usage blocks malformed` cases.
