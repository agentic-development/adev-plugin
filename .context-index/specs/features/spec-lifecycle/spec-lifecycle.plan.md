# Implementation Plan: Spec Lifecycle

> **Methodology:** adev
> **Charter:** .context-index/specs/features/spec-lifecycle/charter.md
> **Specs:** All 12 must-have specs (consolidated plan)
> **Review:** PASS_WITH_NOTES (2026-03-27)
> **Platform:** Node.js, JavaScript ESM, node:test, npm

**Goal:** Add versioning, status management, source manifests, session capture, and status queries to the adev lifecycle.

**Architecture:** Three code layers — lib helpers (source-manifest, session-parser, session-summary) provide pure functions tested with node:test; hooks (.githooks/ for git native, hooks/ for Claude Code) wire into commit and session events; SKILL.md updates add lifecycle instructions to existing skills. Templates are updated to scaffold new fields for new projects.

---

## File Structure

**Create:**
- `lib/source-manifest.mjs` — computeManifest + verifyManifest
- `lib/session-parser.mjs` — parseSession + resolveLogPath
- `lib/session-summary.mjs` — writeSummary + readSummary
- `hooks/session-capture.sh` — Claude Code PostToolUse hook
- `.githooks/prepare-commit-msg` — commit trailer injection
- `.githooks/post-commit` — session summary persistence
- `skills/status/SKILL.md` — status query skill
- `tests/lib/source-manifest.test.mjs` — source manifest tests
- `tests/lib/session-parser.test.mjs` — session parser tests
- `tests/lib/session-summary.test.mjs` — session summary tests
- `tests/hooks/session-capture.test.mjs` — session capture hook tests
- `tests/githooks/prepare-commit-msg.test.mjs` — trailer injection tests

**Modify:**
- `templates/charter-template.md` — add status/revision/updated frontmatter + Status column
- `templates/live-spec-template.md` — add revision/charter-revision/updated/tracker-ref
- `templates/manifest-template.yaml` — add integrations.session_capture section
- `hooks/hooks.json` — register session-capture.sh
- `cli/index.mjs` — scaffold .githooks/ and .context-index/sessions/
- `skills/brainstorm/SKILL.md` — charter status lifecycle + capability status + tracker-ref
- `skills/specify/SKILL.md` — closed-charter gate + revision tracking + capability status + tracker-ref
- `skills/review-specs/SKILL.md` — drift snapshot + capability status + revision tracking
- `skills/plan/SKILL.md` — drift detection gate + plan-test mapping + capability status
- `skills/implement/SKILL.md` — source manifest + capability status + structured commits
- `skills/validate/SKILL.md` — source manifest verification + capability status
- `skills/hygiene/SKILL.md` — drift scanning + session analysis
- `.claude-plugin/plugin.json` — register adev:status skill

**Reference (read, do not modify):**
- `.context-index/constitution.md`
- `.context-index/platform-context.yaml`
- `tests/helpers.mjs` — test utilities

---

## Parallelization

- **Group A (sequential):** Tasks 1-3 (templates — foundation for everything)
- **Group B (parallel with A):** Tasks 4-6 (lib files — independent of templates)
- **Group C (after A+B):** Tasks 7-9 (hooks — depend on lib files)
- **Group D (after A):** Tasks 10-16 (skill updates — depend on templates)
- **Group E (after B+C+D):** Tasks 17-18 (CLI + adev:status — depend on everything)
- **Group F (after all):** Task 19 (registration + integration)

---

### Task 1: Update Charter Template [specialist: none]

**Charter capability:** Template Updates, Charter Status Lifecycle, Capability Status Column, Tracker Reference Field
**Specs:** template-updates, charter-status-lifecycle, capability-status-column, tracker-reference-field
**Files:**
- Modify: `templates/charter-template.md`
- Test: verify template content inline

- [ ] **Add frontmatter** to charter template: `status: draft`, `revision: 1`, `updated: {{ date }}`, commented `# tracker-ref:`
- [ ] **Add Status column** to Capability Map table with default `—`
- [ ] **Verify** template has all required fields

---

### Task 2: Update Spec Template [specialist: none]

**Charter capability:** Template Updates, Spec Revision Tracking, Tracker Reference Field
**Specs:** template-updates, spec-revision-tracking, tracker-reference-field
**Files:**
- Modify: `templates/live-spec-template.md`
- Test: verify template content inline

- [ ] **Add frontmatter** fields: `revision: 1`, `charter-revision: 1`, `updated: {{ date }}`, commented `# tracker-ref:`
- [ ] **Verify** template has all required fields

---

### Task 3: Update Manifest Template [specialist: none]

**Charter capability:** Template Updates
**Specs:** template-updates
**Files:**
- Modify: `templates/manifest-template.yaml`
- Test: verify template content inline

- [ ] **Add** `integrations:` section with `session_capture:` and `provider: none` default with comments explaining entire/native/none options
- [ ] **Verify** template has the new section

---

### Task 4: Implement source-manifest.mjs [specialist: none]

**Charter capability:** Source Manifest
**Specs:** source-manifest
**Files:**
- Create: `lib/source-manifest.mjs`
- Create: `tests/lib/source-manifest.test.mjs`

- [ ] **Write failing tests** for `computeManifest`:
  - Computes deterministic SHA for given files
  - Sorts file paths alphabetically
  - Uses per-file hashing (not concatenation)
  - Returns `{ sha, files, computedAt }`
  - Throws `FILES_NOT_FOUND` for missing files
  - Throws `PATH_OUTSIDE_ROOT` for paths outside project root
  - Returns `{ sha: null, files: [], computedAt }` for empty list
- [ ] **Write failing tests** for `verifyManifest`:
  - Returns `{ matches: true, currentSha }` when files unchanged
  - Returns `{ matches: false, currentSha }` when files changed
  - Returns `{ matches: false, currentSha: null, missingFiles }` when files deleted
- [ ] **Verify tests fail** — `node --test tests/lib/source-manifest.test.mjs`
- [ ] **Implement** `lib/source-manifest.mjs`:
  - `computeManifest(filePaths, projectRoot)` — validate paths, hash per-file, sort hashes, hash list, return manifest
  - `verifyManifest(manifest, projectRoot)` — recompute and compare
  - Uses only `crypto`, `fs/promises`, `path`
- [ ] **Verify tests pass** — `node --test tests/lib/source-manifest.test.mjs`
- [ ] **Commit** `feat(spec-lifecycle): implement source-manifest.mjs`

---

### Task 5: Implement session-parser.mjs [specialist: none]

**Charter capability:** Session Capture Pipeline
**Specs:** session-capture-pipeline
**Files:**
- Create: `lib/session-parser.mjs`
- Create: `tests/lib/session-parser.test.mjs`
- Create: `tests/fixtures/session-sample.jsonl` — fixture JSONL

- [ ] **Write failing tests** for `resolveLogPath`:
  - Returns path for `claude-code` agent
  - Returns `null` for unknown agent
  - Validates resolved path is child of `~/.claude/projects/`
- [ ] **Write failing tests** for `parseSession`:
  - Parses JSONL into condensed transcript
  - Returns only metadata (role, turnIndex, timestamp) — no message content
  - Extracts filesModified and toolCalls (name + file only)
  - Skips malformed JSONL lines with warning
  - Returns `null` for missing/unreadable files
  - Returns `null` when provider is `none`
  - When provider is `entire`, returns `null` (native parsing disabled — Entire owns capture)
- [ ] **Verify tests fail** — `node --test tests/lib/session-parser.test.mjs`
- [ ] **Implement** `lib/session-parser.mjs`:
  - `resolveLogPath(agent)` — hash project root, resolve path, validate path is child of `~/.claude/projects/`
  - `parseSession(logPath, agent)` — stream JSONL, strip content, return metadata only; route by provider (native=parse, entire=null, none=null)
  - Uses only `fs/promises`, `path`, `crypto`
- [ ] **Verify tests pass** — `node --test tests/lib/session-parser.test.mjs`
- [ ] **Commit** `feat(spec-lifecycle): implement session-parser.mjs`

---

### Task 6: Implement session-summary.mjs [specialist: none]

**Charter capability:** Session Summary Persistence
**Specs:** session-summary-persistence
**Files:**
- Create: `lib/session-summary.mjs`
- Create: `tests/lib/session-summary.test.mjs`

- [ ] **Write failing tests** for `writeSummary`:
  - Creates markdown file with YAML frontmatter and content sections
  - Uses `<date>-<short-hash>.md` naming
  - Creates output directory if missing
  - Appends counter suffix for duplicate names
  - Never throws on write failure (logs warning)
- [ ] **Write failing tests** for `readSummary`:
  - Parses frontmatter and content sections into structured object
  - Returns `null` for non-existent file
  - Returns partial object for malformed file
- [ ] **Verify tests fail** — `node --test tests/lib/session-summary.test.mjs`
- [ ] **Implement** `lib/session-summary.mjs`:
  - `writeSummary(condensed, metadata, outputDir)` — build markdown, write with counter suffix
  - `readSummary(summaryPath)` — parse YAML frontmatter + sections
  - Uses only `fs/promises`, `path`
- [ ] **Verify tests pass** — `node --test tests/lib/session-summary.test.mjs`
- [ ] **Commit** `feat(spec-lifecycle): implement session-summary.mjs`

---

### Task 7: Create session-capture.sh hook [specialist: none]

**Charter capability:** Session Capture Pipeline
**Specs:** session-capture-pipeline
**Files:**
- Create: `hooks/session-capture.sh`
- Modify: `hooks/hooks.json` — register PostToolUse hook
- Create: `tests/hooks/session-capture.test.mjs`

- [ ] **Write failing tests**:
  - Hook reads manifest provider config
  - When provider=native: appends JSONL line to `.context-index/.session-tracking.jsonl`
  - When provider=none: exits 0 with no output
  - Output is valid JSON
  - Temp file has correct format: `{"tool","files","specs","timestamp"}`
- [ ] **Verify tests fail** — `node --test tests/hooks/session-capture.test.mjs`
- [ ] **Implement** `hooks/session-capture.sh`:
  - Read provider from manifest
  - If native: append tracking line with tool name, files, specs, timestamp
  - Follow hook protocol (JSON stdin, exit 0, JSON stdout)
  - File permissions 0600
- [ ] **Register** in `hooks/hooks.json`: PostToolUse matcher for all tools
- [ ] **Verify tests pass** — `node --test tests/hooks/session-capture.test.mjs`
- [ ] **Commit** `feat(spec-lifecycle): add session-capture hook`

---

### Task 8: Create prepare-commit-msg hook [specialist: none]

**Charter capability:** Structured Commit Trailers
**Specs:** structured-commit-trailers
**Files:**
- Create: `.githooks/prepare-commit-msg`
- Create: `tests/githooks/prepare-commit-msg.test.mjs`

- [ ] **Write failing tests**:
  - Reads `.context-index/.session-tracking.jsonl` and injects `Spec:` trailers
  - Injects `Plan-task:` trailers when present
  - Injects `Session:` trailer with session ID
  - Does not add duplicate trailers
  - Exits 0 silently when tracking file missing
  - Sanitizes values (no newlines, valid path pattern)
- [ ] **Verify tests fail** — `node --test tests/githooks/prepare-commit-msg.test.mjs`
- [ ] **Implement** `.githooks/prepare-commit-msg`:
  - Read tracking file, extract unique spec/task/session refs
  - Sanitize values (strip newlines, validate path pattern `[a-zA-Z0-9_./-]+`)
  - Append trailers to commit message file ($1)
  - Always exit 0
- [ ] **Make executable** `chmod +x .githooks/prepare-commit-msg`
- [ ] **Verify tests pass** — `node --test tests/githooks/prepare-commit-msg.test.mjs`
- [ ] **Commit** `feat(spec-lifecycle): add prepare-commit-msg hook for trailers`

---

### Task 9: Create post-commit hook [specialist: none]

**Charter capability:** Session Summary Persistence
**Specs:** session-summary-persistence
**Depends on:** Task 6
**Files:**
- Create: `.githooks/post-commit`

- [ ] **Implement** `.githooks/post-commit`:
  - Guard: `command -v node >/dev/null 2>&1 || exit 0`
  - Read commit metadata (hash, date, author)
  - Read specs-touched from commit trailers
  - Call `node -e "import {writeSummary} from './lib/session-summary.mjs'; ..."` with metadata
  - Content sections left as placeholders for /adev:retro
  - Always exit 0, never block
- [ ] **Make executable** `chmod +x .githooks/post-commit`
- [ ] **Commit** `feat(spec-lifecycle): add post-commit hook for session summaries`

---

### Task 10: Update adev:brainstorm SKILL.md [specialist: none]

**Charter capability:** Charter Status Lifecycle, Capability Status Column, Tracker Reference Field
**Specs:** charter-status-lifecycle, capability-status-column, tracker-reference-field
**Files:**
- Modify: `skills/brainstorm/SKILL.md`

- [ ] **Add to Step 5 (Write Charter):** Set frontmatter `status: draft`, `revision: 1`, `updated: <today>`. Ensure Capability Map has `Status` column with `—` default.
- [ ] **Add to Step 7 (User Reviews):** On approval, update `status: approved`, increment `revision`.
- [ ] **Add to Step 2 (Clarify):** Optionally ask for `tracker-ref` during charter creation.
- [ ] **Add to --module mode:** When modifying approved charter, set `status: evolving`, increment `revision`.
- [ ] **Commit** `feat(spec-lifecycle): add lifecycle fields to adev:brainstorm`

---

### Task 11: Update adev:specify SKILL.md [specialist: none]

**Charter capability:** Charter Status Lifecycle, Spec Revision Tracking, Capability Status Column, Tracker Reference Field
**Specs:** charter-status-lifecycle, spec-revision-tracking, capability-status-column, tracker-reference-field
**Files:**
- Modify: `skills/specify/SKILL.md`

- [ ] **Add closed-charter gate:** Before spec creation, check charter `status`. If `closed`, block with `CHARTER_CLOSED`.
- [ ] **Add to spec creation:** Set `revision: 1`, `charter-revision: <N>`, `updated: <today>`. Optionally ask for `tracker-ref`.
- [ ] **Add capability status update:** After writing spec, update charter's Capability Map Status to `specified`.
- [ ] **Commit** `feat(spec-lifecycle): add lifecycle fields to adev:specify`

---

### Task 12: Update adev:review-specs SKILL.md [specialist: none]

**Charter capability:** Git Drift Detection, Capability Status Column, Spec Revision Tracking
**Specs:** git-drift-detection, capability-status-column, spec-revision-tracking
**Files:**
- Modify: `skills/review-specs/SKILL.md`

- [ ] **Add to Step 6 (Save Review):** Record `last-reviewed-revision` and `file-sha` (via `git hash-object`) in `.review.md`.
- [ ] **Add to Step 7 (Update Status):** After updating spec status, also update the corresponding capability's Status to `review-passed` in the charter's Capability Map table.
- [ ] **Add revision handling:** Do not increment spec revision on status-only changes.
- [ ] **Commit** `feat(spec-lifecycle): add drift snapshot to adev:review-specs`

---

### Task 13: Update adev:plan SKILL.md [specialist: none]

**Charter capability:** Git Drift Detection, Plan-Test Mapping, Capability Status Column
**Specs:** git-drift-detection, plan-test-mapping, capability-status-column
**Files:**
- Modify: `skills/plan/SKILL.md`

- [ ] **Enhance Step 1 (Review Gate):** Add dual drift check — compare spec `revision` vs `last-reviewed-revision` AND `git hash-object` vs `file-sha` from `.review.md`. Block on drift.
- [ ] **Add to Task Structure:** Each task must include `tests:` field referencing test file(s).
- [ ] **Add capability status update:** Update charter Capability Map Status to `planned`.
- [ ] **Commit** `feat(spec-lifecycle): add drift detection + test mapping to adev:plan`

---

### Task 14: Update adev:implement SKILL.md [specialist: none]

**Charter capability:** Source Manifest, Capability Status Column, Structured Commit Trailers
**Specs:** source-manifest, capability-status-column, structured-commit-trailers
**Files:**
- Modify: `skills/implement/SKILL.md`

- [ ] **Add capability status updates:** Set `implementing` at start, `implemented` after all tasks pass.
- [ ] **Add source manifest:** After GREEN, compute manifest via `lib/source-manifest.mjs` and stamp in spec frontmatter.
- [ ] **Add commit trailer guidance:** Structured commits with `Spec:`, `Plan-task:`, `Session:` trailers.
- [ ] **Commit** `feat(spec-lifecycle): add source manifest + capability status to adev:implement`

---

### Task 15: Update adev:validate SKILL.md [specialist: none]

**Charter capability:** Source Manifest, Capability Status Column
**Specs:** source-manifest, capability-status-column
**Files:**
- Modify: `skills/validate/SKILL.md`

- [ ] **Add source manifest verification:** Call `verifyManifest` and report match/drift.
- [ ] **Add capability status update:** Set `validated` on pass.
- [ ] **Commit** `feat(spec-lifecycle): add source manifest verification to adev:validate`

---

### Task 16: Update adev:hygiene SKILL.md [specialist: none]

**Charter capability:** Git Drift Detection
**Specs:** git-drift-detection
**Files:**
- Modify: `skills/hygiene/SKILL.md`

- [ ] **Add lifecycle audit pass:** Scan all specs for revision drift, file drift, charter-revision staleness, capability status inconsistencies.
- [ ] **Commit** `feat(spec-lifecycle): add lifecycle auditing to adev:hygiene`

---

### Task 17: Update cli/index.mjs [specialist: none]

**Charter capability:** Template Updates
**Specs:** template-updates
**Depends on:** Tasks 8, 9
**Files:**
- Modify: `cli/index.mjs`

- [ ] **Add .githooks scaffolding:** During init, copy `.githooks/prepare-commit-msg` and `.githooks/post-commit` to project. Run `git config core.hooksPath .githooks`.
- [ ] **Add sessions directory:** Create `.context-index/sessions/` during scaffold.
- [ ] **Add idempotency:** If `.githooks/` exists, don't overwrite — write as `<name>.adev` and warn.
- [ ] **Write tests:** Test scaffolding creates hooks, sets git config, handles existing hooks.
- [ ] **Verify** `node --test tests/cli.test.mjs`
- [ ] **Commit** `feat(spec-lifecycle): scaffold .githooks/ and sessions/ in adev:init`

---

### Task 18: Create adev:status SKILL.md [specialist: none]

**Charter capability:** Status Query Skill
**Specs:** status-query-skill
**Depends on:** Tasks 4, 5, 6
**Files:**
- Create: `skills/status/SKILL.md`

- [ ] **Write SKILL.md** with three modes:
  - `--spec <path>`: Read frontmatter, verify source manifest, query git log, read sessions, check plan tasks
  - `--charter <name>`: Read charter frontmatter + Capability Map, list specs with statuses
  - `--all`: Aggregate across all charters/specs, report project-wide status
  - Default (no args) → `--all`
- [ ] **Include:** tracker-ref display, charter-revision staleness warning, source drift highlighting
- [ ] **Commit** `feat(spec-lifecycle): create adev:status skill`

---

### Task 19: Register and Integrate [specialist: none]

**Charter capability:** Template Updates, Session Capture Pipeline
**Specs:** template-updates, session-capture-pipeline
**Depends on:** All previous tasks
**Files:**
- Modify: `.claude-plugin/plugin.json` — add adev:status to skills
- Modify: `hooks/hooks.json` — verify session-capture registration

- [ ] **Register** `adev:status` in `.claude-plugin/plugin.json`
- [ ] **Verify** all hooks registered in `hooks/hooks.json`
- [ ] **Run full test suite** `npm test`
- [ ] **Commit** `feat(spec-lifecycle): register adev:status skill and finalize integration`

---

## Quality Gates

After all tasks are complete:

- [ ] Tests pass: `npm test`
- [ ] All 12 specs' acceptance criteria satisfied
- [ ] No constitutional violations introduced
- [ ] Charter Capability Map updated with correct statuses
