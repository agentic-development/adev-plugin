<!-- partial_schema: plan@1 -->

# Implementation Plan: Hook-Driven Session Capture with Init-Time Configuration

> **Methodology:** adev
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Spec:** .context-index/specs/features/session-awareness/hook-driven-capture.spec.md
> **Review:** PASS (2026-05-20, rev 3)
> **Platform:** Node.js (ESM, `.mjs`), bash; zero external dependencies

**Goal:** Replace the post-commit-anchored session capture with SessionEnd + PreCompact hooks driving a per-project, gitignored-by-default `.context-index/sessions/` directory, configured at init time with detection-driven defaults.

**Architecture:** A new module `lib/session-capture.mjs` centralises detection, validation, and atomic writes; `lib/session-summary.mjs` gains `fromTranscript()` and `redactSecrets()`. Two new bash hook wrappers (`hooks/session-end.sh`, `hooks/pre-compact.sh`) gate-check the manifest before spawning the shared Node helper. A new CLI verb `adev init prompt session-capture` owns the init-wizard interaction; the installer (`cli/index.mjs`) dispatches three branches (`hook`/`post-commit`/`off`) and manages paired-marker idempotent regions in `.githooks/post-commit` and `.gitignore`. The legacy `post-commit-self-skip.spec.md` is bookmarked as superseded.

**Review notes addressed in this plan:**
- Rev 3 PASS verdict with no net-new findings across three reviewers.
- Four rev-2 suggestions carried forward as explicit plan tasks:
  - SA-9 (external-contracts fixture) → Task 19 pins a versioned payload-schema fixture under `tests/fixtures/claude-code-payloads/`.
  - SEC-11 (sentinel-mismatch error case) → Task 13 adds the unmatched-sentinel branch to the installer with the documented stderr diagnostic.
  - CON-8 (conflict-warning channel) → Task 9 anchors the warning rendering location (prompt body above the default-accept question).
  - CON-10 (stderr subject identifier) → Task 14 documents the optional second token as `<reason-code>[ <subject>] <project-relative-path?>` in the stderr-format helper.

---

## File Structure

**Create:**
- `lib/session-capture.mjs` — Shared Node module: `detectExistingCapture()`, `validateSessionId()`, `validateTranscriptPath()`, `validateCwd()`, and the shared hook-helper entry point.
- `lib/cli/init-prompt-session-capture.mjs` — Implements the `adev init prompt session-capture` verb.
- `hooks/session-end.sh` — Bash wrapper for the `SessionEnd` event; gate-checks manifest, then invokes the Node helper.
- `hooks/pre-compact.sh` — Bash wrapper for the `PreCompact` event; same pattern.
- `tests/fixtures/claude-code-payloads/session-end-v1.json` — Versioned reference payload for SessionEnd (SA-9 fixture).
- `tests/fixtures/claude-code-payloads/pre-compact-v1.json` — Versioned reference payload for PreCompact (SA-9 fixture).
- `tests/lib/session-capture-detect.test.mjs` — Tests for `detectExistingCapture()`.
- `tests/lib/session-capture-validate.test.mjs` — Tests for the three validators.
- `tests/lib/session-summary-redact.test.mjs` — Tests for the redaction pattern list and ordering.
- `tests/lib/session-summary-from-transcript.test.mjs` — Tests for `fromTranscript()` happy path + malformed-transcript placeholder behavior.
- `tests/hooks/session-end.test.mjs` — Tests SessionEnd hook end-to-end against the payload fixture.
- `tests/hooks/pre-compact.test.mjs` — Tests PreCompact hook including the skip-if-session-end-present branch (SA-2).
- `tests/cli/init-prompt-session-capture.test.mjs` — Tests the prompt verb (defaults, conflict warning, manifest preservation).
- `tests/cli/install-session-capture.test.mjs` — End-to-end installer tests across the three modes, sentinel-block round-trips, and sentinel-mismatch handling (SEC-11).

**Modify:**
- `lib/session-summary.mjs` — Add `fromTranscript(transcriptPath, opts)` and `redactSecrets(text)` exports. Existing git-derived path unchanged.
- `cli/index.mjs` — Register the new `adev init prompt session-capture` verb; add installer-side branches for `capture: hook` / `post-commit` / `off`; remove the manual-batching warning text.
- `hooks/hooks.json` — Add `SessionEnd` and `PreCompact` matcher entries pointing at the new bash scripts. Installer manages these idempotently.
- `skills/init/SKILL.md` — Add a prompt step that invokes `adev init prompt session-capture`. Markdown only (no inline-Node, no JS fences with control-flow).
- `templates/.gitignore` (if present) or installer's append logic in `cli/index.mjs` — Provide the paired-marker block template `# >>> adev:session-capture-gitignore >>>` … `# <<< adev:session-capture-gitignore <<<`.
- `.githooks/post-commit` — One-time migration wraps the legacy capture block in `# >>> adev:session-capture >>>` / `# <<< adev:session-capture <<<` markers.
- `.context-index/specs/features/session-awareness/post-commit-self-skip.spec.md` — Frontmatter update only (`status: superseded`, `superseded-by: <this spec path>`). Body unchanged.
- `tests/hooks/post-commit-self-skip.test.mjs` — Gate the test on a `capture: post-commit` fixture manifest (back-compat regression).

**Reference (read, do not modify):**
- `.context-index/specs/features/session-awareness/charter.md` — Capability map authority; flip statuses on completion.
- `.context-index/specs/features/session-awareness/post-commit-self-skip.plan.md` — Pattern for bash post-commit hook tests (`createTempGitRepo`, `runGitHook`).
- `.context-index/samples/hook-pretooluse-merge-guard.md` — Golden sample for Claude Code hook coding patterns.
- `.context-index/samples/hook-sessionstart-session-start.md` — Reference for a stdin-payload-reading bash hook.
- `.context-index/adrs/0014-backend-migration-stderr-policy.md` — Verbatim-passthrough rationale for stderr (anchors the stable diagnostic format invariant).
- `hooks/session-capture.sh` — Existing legacy bash script (read-only reference for the new wrappers).
- `lib/session-summary.mjs` — Current implementation; pattern for the new `fromTranscript()` extension.
- `tests/helpers.mjs` — `createTempDir()`, `cleanupTempDir()`, `writeFixture()`, `runHook()` helpers used throughout the new tests.

## Context Packets

### Task 1 Context — ADR (or charter update) recording the rev-3 design decisions
- Spec: `.context-index/specs/features/session-awareness/hook-driven-capture.spec.md` (full read — rev-3 design)
- Charter: `.context-index/specs/features/session-awareness/charter.md` (capability rows for Hook-Driven Session Capture and Init-Time Capture Configuration)

### Task 2 Context — `validateSessionId()`, `validateCwd()`, `validateTranscriptPath()` in `lib/session-capture.mjs`
- Spec: invariants "Session ID charset (SEC-2)", "Working directory check (SEC-10)", "Transcript path containment (SEC-3, SEC-10)"
- Acceptance criteria: validators are exposed from `lib/session-capture.mjs`; realpath-vs-realpath comparison for transcript_path and transcripts-root; cwd walk starts from realpath-resolved input
- Constitution: Principle 1 (no new deps; `realpath` available via `node:fs/promises`)

### Task 3 Context — `redactSecrets(text)` in `lib/session-summary.mjs`
- Spec: invariant "Transcript redaction (SEC-1, SEC-9)" — full pattern list, ordering rules (PEM block first), Stripe vs LLM `sk-` distinction
- Acceptance criteria: all listed pattern classes redacted with `[REDACTED:<class>]`, pattern order asserted by tests

### Task 4 Context — `detectExistingCapture(projectRoot)` in `lib/session-capture.mjs`
- Spec: invariant "Detection is pure"; behaviors 1-3 use the function output
- Charter Domain Model: defaults for new project vs existing project
- Reference: existing legacy block in `.githooks/post-commit`, behaviour of `lib/session-summary.mjs`

### Task 5 Context — Shared Node hook-helper entry point in `lib/session-capture.mjs`
- Spec: invariants "Atomic writes (SEC-4)", "One file per session per day", behaviors 8/9/10/16; postconditions table
- Constitution: Principle 1 (`crypto.randomBytes`, `node:fs/promises`, no new deps)
- Cross-reference: write pattern in existing `lib/_execution-state.mjs` or `hooks/_execution-state.mjs` (atomic temp-rename helpers)

### Task 6 Context — `fromTranscript(transcriptPath, opts)` in `lib/session-summary.mjs`
- Spec: behaviors 8 and 16; error cases for parse failures and redaction failures; invariant on redaction unconditional application
- Reference: existing git-derived summarizer in `lib/session-summary.mjs` for markdown shape parity

### Task 7 Context — `hooks/session-end.sh`
- Spec: invariants "Bash-wrapper gate (SEC-6)", "Stderr diagnostic format (SEC-7)", behavior 8
- Constitution: Principle 4 (exit 0 always, stdin JSON payload, no stdout)
- Reference: `hooks/session-capture.sh` (existing pattern), `lib/_parse-stdin.sh` (stdin parsing helper)

### Task 8 Context — `hooks/pre-compact.sh`
- Spec: invariants "Bash-wrapper gate (SEC-6)", "One file per session per day", behaviors 9 and 10 (SA-2 skip-if-session-end)
- Reference: same as Task 7

### Task 9 Context — `adev init prompt session-capture` CLI verb
- Spec: behaviors 1, 2, 3, 4; invariant "Stored config trumps detection (SA-4)"; CON-8 anchoring (warning rendered in prompt body above the default-accept question)
- Reference: existing `lib/cli/*.mjs` files in `lib/cli/` (cli-driver-surface charter); manifest read/write helpers in `lib/manifest.mjs`

### Task 10 Context — Register the verb in `cli/index.mjs`
- Spec: SA-5 (verb naming for the init-prompt step)
- Reference: existing verb registration shape in `cli/index.mjs`

### Task 11 Context — Installer dispatch by `capture` mode
- Spec: behaviors 5, 6, 7; postconditions table
- Constitution: Principle 5 (version parity untouched — manifest read only)

### Task 12 Context — Installer gitignore management (paired-marker idempotency)
- Spec: invariant "Paired-marker idempotency (SA-3, SEC-5)", behaviors 13 and 14
- Reference: existing append-to-`.gitignore` patterns in `cli/index.mjs`

### Task 13 Context — Installer post-commit cleanup + sentinel-mismatch branch (SEC-11)
- Spec: invariant "Paired-marker idempotency (SA-3)", behaviors 5 and 7, Error Cases row "Installer run on a project where `.githooks/post-commit` has the legacy block but NO sentinel markers"
- SEC-11 (deferred from rev 2): unmatched-sentinel case exits 0 with `[adev:session-capture] validation-error sentinel-mismatch <path>`, no modification.

### Task 14 Context — Stderr diagnostic helper with subject-token contract (CON-10)
- Spec: invariant "Stderr diagnostic format (SEC-7)"
- CON-10 (deferred from rev 2): document optional second token as subject identifier (`<reason-code>[ <subject>] <project-relative-path?>`)

### Task 15 Context — One-time post-commit migration (sentinel wrap)
- Spec: invariant "Paired-marker idempotency (SA-3)"
- Reference: idempotency contract from Task 12; existing `.githooks/post-commit`

### Task 16 Context — Remove manual-batching warning + update `hooks/hooks.json` registration
- Spec: Module Impact Map (`cli/index.mjs`, `hooks/hooks.json`)
- Trivial textual delete + idempotent JSON edit

### Task 17 Context — Add prompt step to `skills/init/SKILL.md`
- Spec: Module Impact Map (`skills/init/SKILL.md`); Principle 2 + pre-commit `no-inline-node` hook
- Reference: existing prompt steps in `skills/init/SKILL.md`

### Task 18 Context — `post-commit-self-skip.spec.md` frontmatter supersession + regression test gating
- Spec: SA-8 (supersession bookkeeping)
- Reference: existing frontmatter shape on the legacy spec

### Task 19 Context — Versioned Claude Code payload fixtures (SA-9)
- Spec: SA-9 (deferred from rev 2): pin versioned reference payloads under `tests/fixtures/claude-code-payloads/`
- Reference: actual SessionEnd / PreCompact payload shape from Claude Code's documentation / current real payloads

### Task 20 Context — Consumer regression tests (CON-4)
- Spec: behavior 15; charter Quality Attribute "Graceful absence"
- Targets: `/adev:work`, `/adev:status`, `/adev:hygiene`, `/adev:retro` baseline behaviour with empty/missing sessions directory

### Task 21 Context — End-to-end installer test
- Spec: postconditions block; behaviors 5/6/7 round-trips; SEC-11 sentinel-mismatch branch

### Task 22 Context — Smoke test (manual)
- Spec: full lifecycle on a fresh tempdir

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
- **Pattern:** When a skill writes an artifact to disk, instruct it to return only a structured summary to the conversation.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts.

## Parallelization

- Group A (sequential foundation): Task 1 → Task 2 → Task 3 → Task 4 — `lib/session-capture.mjs` and `lib/session-summary.mjs` foundational helpers.
- Group B (sequential, depends on A): Task 5 → Task 6 — shared hook helper + `fromTranscript()`.
- Group C (sequential, depends on B): Task 7 → Task 8 — bash hook wrappers.
- Group D (sequential, depends on A): Task 9 → Task 10 — init prompt verb + registration.
- Group E (sequential, depends on D): Task 11 → Task 12 → Task 13 → Task 14 → Task 15 → Task 16 — installer changes.
- Group F (independent until Group C done): Task 17 — `skills/init/SKILL.md` prompt step.
- Group G (sequential, depends on nothing structural): Task 18 — supersession bookkeeping.
- Group H (independent infrastructure): Task 19 — payload fixtures (can land at any time).
- Group I (depends on all of B + C + E): Task 20 → Task 21 → Task 22 — consumer regressions + end-to-end + smoke.

Groups D and B can run concurrently after Group A. Group F is independent of all structural tasks. Group H can land first to seed Group C tests.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Manifest schema documentation for `integrations.session_capture.{capture, gitignored}` | small | unit | — | 0 create, 1 modify |
| 2 | `validateSessionId()`, `validateCwd()`, `validateTranscriptPath()` helpers | small | unit | Task 1 | 1 create, 1 create (test) |
| 3 | `redactSecrets(text)` helper in `lib/session-summary.mjs` | small | unit | Task 1 | 0 create, 1 modify, 1 create (test) |
| 4 | `detectExistingCapture(projectRoot)` helper | small | unit | Task 2 | 1 modify, 1 create (test) |
| 5 | Shared hook-helper entry point in `lib/session-capture.mjs` | medium | unit | Task 2, Task 3, Task 4 | 1 modify |
| 6 | `fromTranscript(transcriptPath, opts)` extension to `lib/session-summary.mjs` | medium | unit | Task 3 | 1 modify, 1 create (test) |
| 7 | `hooks/session-end.sh` wrapper | small | unit | Task 5 | 1 create, 1 create (test) |
| 8 | `hooks/pre-compact.sh` wrapper (with SA-2 skip-if-session-end) | small | unit | Task 5 | 1 create, 1 create (test) |
| 9 | `adev init prompt session-capture` CLI verb (with CON-8 warning placement) | medium | unit | Task 4 | 1 create, 1 create (test) |
| 10 | Verb registration in `cli/index.mjs` | small | unit | Task 9 | 1 modify |
| 11 | Installer dispatch by `capture` mode | medium | unit | Task 10 | 1 modify |
| 12 | Installer gitignore paired-marker management | small | unit | Task 11 | 1 modify |
| 13 | Installer post-commit cleanup + SEC-11 sentinel-mismatch branch | small | unit | Task 11 | 1 modify |
| 14 | Stderr diagnostic helper with CON-10 subject-token contract | small | unit | Task 5 | 1 modify |
| 15 | One-time post-commit sentinel-wrap migration | small | unit | Task 13 | 1 modify |
| 16 | Remove manual-batching warning + `hooks/hooks.json` registration | trivial | unit | Task 11 | 2 modify |
| 17 | Add prompt step to `skills/init/SKILL.md` (markdown only) | trivial | unit | Task 10 | 1 modify |
| 18 | Supersede `post-commit-self-skip.spec.md` + gate legacy regression test | trivial | unit | — | 2 modify |
| 19 | Versioned Claude Code payload fixtures (SA-9) | small | unit | — | 2 create |
| 20 | Consumer regression coverage (CON-4) | small | unit | Task 11 | 1+ create (test) |
| 21 | End-to-end installer test (3 modes, sentinel round-trip, SEC-11) | medium | unit | Task 13, Task 15 | 1 create (test) |
| 22 | Smoke test (manual) | trivial | unit | Task 11, Task 15 | 0 |

---

## Task Structure

### Task 1: Manifest schema documentation for `integrations.session_capture.{capture, gitignored}` [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=4
**Rationale:** Trivial doc-comment edit to a single manifest line with explicit spec preconditions and existing comment style.

**Charter capability:** Init-Time Capture Configuration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/manifest.yaml:217-219` — Add inline comments documenting `capture` (`hook`/`post-commit`/`off`) and `gitignored` (boolean) keys alongside existing `provider: native` key.
- Test: `tests/cli/init-prompt-session-capture.test.mjs` (added in Task 9 — schema is validated through that verb test).

**Tests:** `tests/cli/init-prompt-session-capture.test.mjs` — Task 9 covers schema validation via the prompt verb (`capture` value rejection for non-enum values; this Task 1 lands only doc-comments).

**Context to load:**
- `.context-index/specs/features/session-awareness/hook-driven-capture.spec.md` (Preconditions, Postconditions)
- Existing `manifest.yaml:integrations` block

- [ ] **Write failing test (via Task 9)** — Schema validation lives in the prompt verb's tests. This task is documentation-only; the schema check it documents is verified in Task 9.

- [ ] **Verify test fails** — N/A for this doc task; the Task 9 test exercises the enum check.

- [ ] **Implement**

Add inline comments above the existing `integrations.session_capture` block in `manifest.yaml` documenting both new keys and the enum values for `capture`.

- [ ] **Verify test passes**

Run: `npm test` (Task 9 tests carry the assertion).

- [ ] **Commit**

Branch (if not already created): `feat/session-awareness/hook-driven-capture`

```bash
git add .context-index/manifest.yaml
git commit -m "docs(manifest): document integrations.session_capture keys"
```

### Task 2: `validateSessionId()`, `validateCwd()`, `validateTranscriptPath()` helpers [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Validators have explicit regex/realpath invariants and full error-case coverage; pure functions in a single new module with no curated sample for path-realpath comparison.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/session-capture.mjs` — Export the three validator functions.
- Create: `tests/lib/session-capture-validate.test.mjs`

**Tests:** `tests/lib/session-capture-validate.test.mjs` — Covers session_id charset (SEC-2), cwd realpath walk (SEC-10), transcript_path realpath-vs-realpath containment + `.jsonl` extension (SEC-3, SEC-10).

**Context to load:**
- Spec invariants "Session ID charset", "Working directory check", "Transcript path containment"
- `tests/helpers.mjs` — `createTempDir`, `cleanupTempDir`

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { validateSessionId, validateCwd, validateTranscriptPath } from '../../lib/session-capture.mjs';

test('validateSessionId rejects path injection attempts', () => {
  assert.strictEqual(validateSessionId('../../etc/passwd'), false);
  assert.strictEqual(validateSessionId('abc-123_DEF'), true);
});

test('validateCwd walks from realpath-resolved input, not raw', async () => {
  // Symlink that escapes to a manifest-bearing dir — only realpath walk should resolve correctly
  // ... full test scaffolding via createTempDir + symlinks
});

test('validateTranscriptPath compares realpath vs realpath', () => {
  // resolved-vs-raw should be rejected
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/session-capture-validate.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/session-capture.mjs'` (or `validateSessionId is not exported`).

- [ ] **Implement**

Implement the three validators in `lib/session-capture.mjs` using `node:fs/promises` (`realpath`, `stat`) and a regex `^[A-Za-z0-9_-]+$` for session ID. The transcripts root resolves via `path.join(process.env.HOME, '.claude/projects', cwdEncoded)`. Both operands of containment comparison must be `realpath`-resolved before string-prefix matching.

- [ ] **Verify test passes**

Run: `node --test tests/lib/session-capture-validate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/session-capture.mjs tests/lib/session-capture-validate.test.mjs
git commit -m "feat(session-awareness): add validators in lib/session-capture.mjs"
```

### Task 3: `redactSecrets(text)` helper in `lib/session-summary.mjs` [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Spec enumerates each pattern class, ordering rules, and replacement tokens with high precision; mechanical regex application in a single module.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/session-summary.mjs` — Add `redactSecrets(text)` export.
- Create: `tests/lib/session-summary-redact.test.mjs`

**Tests:** `tests/lib/session-summary-redact.test.mjs` — One test per pattern class (PEM, AWS, GH, OpenAI/Anthropic `sk-`, Stripe `sk_(live|test)_`, Slack, Google API, JWT, Bearer, env-style KEY=VALUE) and one ordering test asserting PEM redaction is applied before specific keys.

**Context to load:**
- Spec invariant "Transcript redaction (SEC-1, SEC-9)" — complete pattern list, ordering
- Existing `lib/session-summary.mjs` for the module's existing exports

- [ ] **Write failing test**

```javascript
import { redactSecrets } from '../../lib/session-summary.mjs';

test('redactSecrets handles PEM private-key block (multiline)', () => {
  const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----';
  assert.strictEqual(redactSecrets(pem), '[REDACTED:private-key]');
});

test('redactSecrets distinguishes Stripe sk_live_ from LLM sk-', () => {
  assert.match(redactSecrets('<EXAMPLE_STRIPE_KEY>'), /\[REDACTED:stripe-key\]/);
  assert.match(redactSecrets('<EXAMPLE_LLM_KEY>'), /\[REDACTED:llm-key\]/);
});

test('PEM redaction runs before specific key patterns (order matters)', () => {
  const text = '-----BEGIN PRIVATE KEY-----\nakey <EXAMPLE_LLM_KEY>...\n-----END PRIVATE KEY-----';
  // PEM block redacts the whole thing — the inner sk- pattern must not leak through
  assert.strictEqual(redactSecrets(text), '[REDACTED:private-key]');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/session-summary-redact.test.mjs`
Expected: FAIL — `redactSecrets is not exported`.

- [ ] **Implement**

Add `redactSecrets(text)` to `lib/session-summary.mjs`. Apply patterns in this order: PEM block (multiline, dotall), AWS, GitHub, OpenAI/Anthropic `sk-`, Stripe `sk_`, Slack, Google API, JWT, `Authorization: Bearer`, env-style `KEY=VALUE`. Use `String.prototype.replace` with the multiline `/s` flag on the PEM regex.

- [ ] **Verify test passes**

Run: `node --test tests/lib/session-summary-redact.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/session-summary.mjs tests/lib/session-summary-redact.test.mjs
git commit -m "feat(session-awareness): add redactSecrets to lib/session-summary.mjs"
```

### Task 4: `detectExistingCapture(projectRoot)` helper [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Pure read-only function with documented signal list and clear return contract; straightforward filesystem inspection in a single module.

**Charter capability:** Init-Time Capture Configuration
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `lib/session-capture.mjs` — Add `detectExistingCapture(projectRoot)` export returning `{ existing: bool, signals: string[] }`.
- Create: `tests/lib/session-capture-detect.test.mjs`

**Tests:** `tests/lib/session-capture-detect.test.mjs` — Cover: new-project (no signals), existing-post-commit (sentinel block in `.githooks/post-commit`), legacy-fallback (legacy capture signature without sentinels), tracked-sessions (`.context-index/sessions/*.md` exists in git index).

**Context to load:**
- Spec invariant "Detection is pure"
- Charter Domain Model: defaults for new vs existing project

- [ ] **Write failing test**

```javascript
import { detectExistingCapture } from '../../lib/session-capture.mjs';

test('detectExistingCapture returns existing:true when sentinel block present', async () => {
  const dir = await createTempDir();
  await writeFile(`${dir}/.githooks/post-commit`, '# >>> adev:session-capture >>>\n...\n# <<< adev:session-capture <<<');
  const result = await detectExistingCapture(dir);
  assert.strictEqual(result.existing, true);
  assert.ok(result.signals.includes('post-commit-sentinel-block'));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/session-capture-detect.test.mjs`
Expected: FAIL — `detectExistingCapture is not exported`.

- [ ] **Implement**

Pure-read helper: read `.githooks/post-commit` (look for sentinels, fall back to legacy signature `capture_session()` or similar), and glob `.context-index/sessions/*.md` via `node:fs/promises`. Never writes.

- [ ] **Verify test passes**

Run: `node --test tests/lib/session-capture-detect.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/session-capture.mjs tests/lib/session-capture-detect.test.mjs
git commit -m "feat(session-awareness): add detectExistingCapture"
```

### Task 5: Shared hook-helper entry point in `lib/session-capture.mjs` [specialist: none]

**Routing:** assisted-agent (score: 13/20)
**Scores:** spec=4 pattern=3 blast=3 novelty=3
**Rationale:** Composes validation chain, atomic write, frontmatter assembly, and PreCompact skip branch; touches behavior across multiple invariants and lacks a direct sample for atomic-write+frontmatter composition.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2, Task 3, Task 4
**Files:**
- Modify: `lib/session-capture.mjs` — Add the shared `runCapture({ event, payload, projectRoot })` entry point. Reads manifest, runs validation chain, calls `fromTranscript()`, atomically writes with `<path>.tmp-<pid>-<8hex>` temp name. On PreCompact, checks for existing `kind: session-end` frontmatter at the target path and skips if found.

**Tests:** Covered transitively by Task 7 / Task 8 hook tests (helper is the inner Node entry for both wrappers). A standalone test file is unnecessary because the helper has no public API beyond what the hooks exercise.

**Context to load:**
- Spec invariants "Atomic writes (SEC-4)", "One file per session per day", behaviors 8/9/10/16
- Atomic-write patterns in existing `hooks/_execution-state.mjs`

- [ ] **Write failing test** — Deferred to Task 7 / Task 8 (the helper is exercised through the hook tests; this is consistent with the cli-driver-surface charter's "thin verb wrappers around lib helpers" pattern).

- [ ] **Verify test fails** — N/A; covered in Tasks 7–8.

- [ ] **Implement**

Compose: `loadManifest()` → validators (early-return with stderr on rejection) → `fromTranscript()` → frontmatter assembly (`kind: session-end | pre-compact | placeholder`, `session_id`, `date`) → atomic `<path>.tmp-<pid>-<crypto.randomBytes(4).toString('hex')>` write → rename. PreCompact branch: read target file frontmatter (if exists), skip write when `kind: session-end` is present.

- [ ] **Verify test passes** — Via Tasks 7–8.

- [ ] **Commit**

```bash
git add lib/session-capture.mjs
git commit -m "feat(session-awareness): add runCapture helper for SessionEnd/PreCompact"
```

### Task 6: `fromTranscript(transcriptPath, opts)` extension to `lib/session-summary.mjs` [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=4 blast=5 novelty=3
**Rationale:** Existing git-derived summarizer provides markdown-shape parity reference; placeholder fallback and redaction integration are well-specified.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `lib/session-summary.mjs` — Add `fromTranscript(transcriptPath, opts)`.
- Create: `tests/lib/session-summary-from-transcript.test.mjs`

**Tests:** `tests/lib/session-summary-from-transcript.test.mjs` — Happy-path with a synthesized transcript JSONL (asserts markdown shape parity with the existing git-derived path). Malformed-JSONL placeholder behaviour (returns `{ kind: 'placeholder', ... }`, never throws). Redaction integration (secret in transcript → redacted in output).

**Context to load:**
- Spec behaviors 8 and 16; "Transcript redaction" invariant
- Existing summarizer in `lib/session-summary.mjs` for markdown shape

- [ ] **Write failing test**

```javascript
import { fromTranscript } from '../../lib/session-summary.mjs';

test('fromTranscript renders happy-path markdown', async () => {
  const path = await writeFixture('transcript.jsonl', '{"role":"user","content":"hi"}\n{"role":"assistant","content":"hello"}');
  const out = await fromTranscript(path);
  assert.match(out.body, /## Conversation/);
});

test('fromTranscript returns placeholder on malformed transcript (does not throw)', async () => {
  const out = await fromTranscript('/nonexistent/path.jsonl');
  assert.strictEqual(out.kind, 'placeholder');
});

test('fromTranscript applies redactSecrets to body', async () => {
  const path = await writeFixture('t.jsonl', '{"role":"user","content":"my key is <EXAMPLE_LLM_KEY>..."}');
  const out = await fromTranscript(path);
  assert.match(out.body, /\[REDACTED:llm-key\]/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/session-summary-from-transcript.test.mjs`
Expected: FAIL — `fromTranscript is not exported`.

- [ ] **Implement**

Read transcript JSONL line-by-line via `node:readline`. Apply `redactSecrets()` to every user-visible token before assembling the markdown body. On filesystem error or invalid JSONL, return `{ kind: 'placeholder', body: '<minimal placeholder>', ... }`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/session-summary-from-transcript.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/session-summary.mjs tests/lib/session-summary-from-transcript.test.mjs
git commit -m "feat(session-awareness): add fromTranscript to lib/session-summary.mjs"
```

### Task 7: `hooks/session-end.sh` bash wrapper [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=3
**Rationale:** Two golden samples (hook-pretooluse-merge-guard, hook-sessionstart-session-start) plus existing `hooks/session-capture.sh` provide direct templates; gate-check pattern is documented verbatim.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5
**Files:**
- Create: `hooks/session-end.sh`
- Create: `tests/hooks/session-end.test.mjs`

**Tests:** `tests/hooks/session-end.test.mjs` — Bash gate (`capture: off` never spawns Node), happy-path write, validation-error rejections (each of session_id/cwd/transcript_path), stderr-format compliance.

**Context to load:**
- Spec invariants "Bash-wrapper gate (SEC-6)", "Stderr diagnostic format (SEC-7)", behavior 8
- Existing `hooks/session-capture.sh` for stdin-payload bash pattern
- `lib/_parse-stdin.sh` stdin helper

- [ ] **Write failing test**

```javascript
test('session-end.sh exits 0 and writes nothing when capture: off', async () => {
  // ... synth manifest with capture: off, runHook('session-end', { stdin: validPayload })
  assert.strictEqual(result.exitCode, 0);
  assert.strictEqual(await ls('.context-index/sessions/').length, 0);
});

test('session-end.sh emits SEC-7 formatted stderr on validation error', async () => {
  // ... bad session_id
  assert.match(result.stderr, /^\[adev:session-capture\] validation-error session-id/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/hooks/session-end.test.mjs`
Expected: FAIL — `hooks/session-end.sh` does not exist.

- [ ] **Implement**

Write the bash wrapper:
```bash
#!/usr/bin/env bash
set -e
# Gate-check: bail before spawning Node when capture != hook.
MANIFEST="$CLAUDE_PROJECT_DIR/.context-index/manifest.yaml"
[ -f "$MANIFEST" ] || exit 0
CAPTURE=$(awk '/^[[:space:]]*capture:[[:space:]]*/{ print $2; exit }' "$MANIFEST")
[ "$CAPTURE" = "hook" ] || exit 0
# Spawn Node helper, passing stdin through verbatim.
exec node "$CLAUDE_PROJECT_DIR/lib/session-capture.mjs" --event session-end
```

- [ ] **Verify test passes**

Run: `node --test tests/hooks/session-end.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add hooks/session-end.sh tests/hooks/session-end.test.mjs
git commit -m "feat(hooks): add session-end.sh wrapper for SessionEnd capture"
```

### Task 8: `hooks/pre-compact.sh` bash wrapper [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=3
**Rationale:** Mirrors Task 7 pattern with golden-sample coverage; the SA-2 skip-if-session-end branch is fully specified and lives in the Node helper.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5
**Files:**
- Create: `hooks/pre-compact.sh`
- Create: `tests/hooks/pre-compact.test.mjs`

**Tests:** `tests/hooks/pre-compact.test.mjs` — Bash gate behaviour (same shape as Task 7), happy-path write with `kind: pre-compact`, SA-2 skip-if-session-end-present branch (preexisting `kind: session-end` file → no overwrite, stderr `disabled`).

**Context to load:**
- Spec invariants and behaviors 9 and 10 (SA-2 skip-if-session-end)

- [ ] **Write failing test**

```javascript
test('pre-compact.sh skips when target file already has kind: session-end', async () => {
  // ... pre-write a sessions/ file with kind: session-end, then fire PreCompact
  assert.strictEqual(result.exitCode, 0);
  assert.match(result.stderr, /^\[adev:session-capture\] disabled/);
  // ... assert file content unchanged
});
```

- [ ] **Verify test fails**

Run: `node --test tests/hooks/pre-compact.test.mjs`
Expected: FAIL — `hooks/pre-compact.sh` does not exist.

- [ ] **Implement**

Same wrapper shape as Task 7, but `--event pre-compact`. The skip-if-session-end check happens inside `runCapture()` (Task 5).

- [ ] **Verify test passes**

Run: `node --test tests/hooks/pre-compact.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add hooks/pre-compact.sh tests/hooks/pre-compact.test.mjs
git commit -m "feat(hooks): add pre-compact.sh wrapper with SA-2 skip"
```

### Task 9: `adev init prompt session-capture` CLI verb [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=3 blast=4 novelty=4
**Rationale:** Behaviors 1-4, SA-4, and CON-8 warning placement are all explicit; existing `lib/cli/` verb shapes provide patterns even without a curated CRUD-prompt sample.

**Charter capability:** Init-Time Capture Configuration
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Create: `lib/cli/init-prompt-session-capture.mjs`
- Create: `tests/cli/init-prompt-session-capture.test.mjs`

**Tests:** `tests/cli/init-prompt-session-capture.test.mjs` — Defaults for new project (`hook, true`) and existing project (`post-commit, false`); re-run on configured project (offers stored values); CON-8 conflict-warning rendering (warning text appears in prompt body above the default-accept question); manifest write preserves `provider` key verbatim; invalid `capture` value rejected with clear error.

**Context to load:**
- Spec behaviors 1, 2, 3, 4; SA-4; CON-8
- `lib/manifest.mjs` read/write helpers; existing `lib/cli/` verb shapes

- [ ] **Write failing test**

```javascript
test('prompt uses post-commit, false defaults when detection signals exist', async () => {
  // ... fixture project with legacy block in .githooks/post-commit
  const result = await runVerb('init prompt session-capture', { cwd });
  assert.match(result.stdout, /capture: post-commit \[default\]/);
  assert.match(result.stdout, /gitignored: false \[default\]/);
});

test('prompt renders CON-8 conflict warning ABOVE the default-accept question', async () => {
  // ... fixture: manifest says capture: post-commit but legacy block already removed
  const result = await runVerb('init prompt session-capture', { cwd });
  // The warning line must precede the "Accept default" prompt
  const warningIdx = result.stdout.indexOf('[warning]');
  const acceptIdx = result.stdout.indexOf('Accept');
  assert.ok(warningIdx > -1 && warningIdx < acceptIdx, 'warning must render before the accept-default question');
});

test('manifest write preserves provider key verbatim', async () => {
  // ... fixture with provider: native
  await runVerb('init prompt session-capture --capture hook --gitignored true', { cwd });
  const manifest = await loadManifest(cwd);
  assert.strictEqual(manifest.integrations.session_capture.provider, 'native');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/init-prompt-session-capture.test.mjs`
Expected: FAIL — verb not implemented.

- [ ] **Implement**

Implement `lib/cli/init-prompt-session-capture.mjs`:
1. Read current manifest via `loadManifest(projectRoot)`.
2. Run `detectExistingCapture(projectRoot)` from `lib/session-capture.mjs`.
3. If manifest already has values: offer those as defaults; if detection contradicts, prepend the conflict warning to the prompt body (CON-8 — rendered above the default-accept question).
4. If manifest is empty: defaults from detection (new: `hook, true`; existing: `post-commit, false`).
5. Validate user input: reject non-enum `capture` values with `Error: capture must be one of: hook, post-commit, off`.
6. Write back via `updateManifest(projectRoot, { integrations: { session_capture: { ...preservedProvider, capture, gitignored } } })`.

- [ ] **Verify test passes**

Run: `node --test tests/cli/init-prompt-session-capture.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/init-prompt-session-capture.mjs tests/cli/init-prompt-session-capture.test.mjs
git commit -m "feat(cli): add adev init prompt session-capture verb"
```

### Task 10: Verb registration in `cli/index.mjs` [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=5 blast=4 novelty=5
**Rationale:** Trivial single-line dispatch addition following the existing verb-registration shape in `cli/index.mjs`.

**Charter capability:** Init-Time Capture Configuration
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 9
**Files:**
- Modify: `cli/index.mjs` — Register the new `adev init prompt session-capture` verb in the dispatch table.

**Tests:** Covered by Task 9 (the verb test exercises the dispatch from the CLI entrypoint).

**Context to load:**
- Existing verb registration pattern in `cli/index.mjs` (any `init` sub-verb is a good reference)

- [ ] **Write failing test** — Covered by Task 9 (`runVerb('init prompt session-capture', ...)` invokes through `cli/index.mjs`).

- [ ] **Verify test fails** — Task 9 fails until this registration exists.

- [ ] **Implement**

Add the verb wiring in `cli/index.mjs` following the existing dispatch shape.

- [ ] **Verify test passes** — Task 9 tests pass.

- [ ] **Commit**

```bash
git add cli/index.mjs
git commit -m "feat(cli): register init prompt session-capture verb"
```

### Task 11: Installer dispatch by `capture` mode [specialist: none]

**Routing:** assisted-agent (score: 14/20)
**Scores:** spec=4 pattern=3 blast=3 novelty=4
**Rationale:** Three-branch installer dispatch composes Tasks 12, 13, 15, 16 with cross-file post-conditions; well-specified but no direct sample for capture-mode dispatch.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 10
**Files:**
- Modify: `cli/index.mjs` — Read `integrations.session_capture.capture` in the installer flow and dispatch to the three branches.

**Tests:** `tests/cli/install-session-capture.test.mjs` (created in Task 21; this task lands the production code that Task 21 tests).

**Context to load:**
- Spec behaviors 5, 6, 7; postconditions table
- Existing installer flow in `cli/index.mjs`

- [ ] **Write failing test** — Task 21's end-to-end installer tests cover this. (The dispatch alone is not testable in isolation because it composes Tasks 12, 13, 15, 16.)

- [ ] **Verify test fails** — Task 21's first end-to-end pass fails until all four sub-tasks land.

- [ ] **Implement**

Add the conditional in `cli/index.mjs`:
```javascript
const captureMode = manifest.integrations?.session_capture?.capture ?? 'off';
if (captureMode === 'hook') { /* register hooks, remove post-commit sentinel block */ }
else if (captureMode === 'post-commit') { /* leave post-commit, unregister hooks */ }
else { /* off: unregister hooks, remove post-commit sentinel block, remove gitignore block */ }
```

- [ ] **Verify test passes** — Once Tasks 12, 13, 15, 16 land, Task 21 passes.

- [ ] **Commit**

```bash
git add cli/index.mjs
git commit -m "feat(cli): dispatch installer by integrations.session_capture.capture"
```

### Task 12: Installer gitignore paired-marker management [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Sentinel-marker idempotency invariant (SA-3, SEC-5) is fully specified with exact marker strings; mechanical line-by-line read/replace in a single module.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 11
**Files:**
- Modify: `cli/index.mjs` — Add helpers `appendSessionCaptureGitignoreBlock(projectRoot)` / `removeSessionCaptureGitignoreBlock(projectRoot)` operating strictly between paired markers.

**Tests:** Covered by Task 21. (Standalone testing of the gitignore helper is possible but redundant — Task 21 exercises it via the install flow.)

**Context to load:**
- Spec invariant "Paired-marker idempotency (SA-3, SEC-5)", behaviors 13 and 14
- Existing `.gitignore` append patterns in `cli/index.mjs`

- [ ] **Write failing test** — Task 21 covers (idempotency assertions, user-content preservation outside markers).

- [ ] **Verify test fails** — Task 21 fails.

- [ ] **Implement**

Read `.gitignore` line-by-line, locate `# >>> adev:session-capture-gitignore >>>` … `# <<< adev:session-capture-gitignore <<<` markers, replace only the content between them. If markers absent and `gitignored: true`, append a fresh block at the end.

- [ ] **Verify test passes** — Task 21 passes.

- [ ] **Commit**

```bash
git add cli/index.mjs
git commit -m "feat(cli): paired-marker gitignore management for sessions/"
```

### Task 13: Installer post-commit cleanup + SEC-11 sentinel-mismatch branch [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** All three branches (both-present, neither-present, mismatched) have explicit spec behaviors with exact stderr text; mirrors Task 12 sentinel mechanics.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 11
**Files:**
- Modify: `cli/index.mjs` — Add `removeSessionCapturePostCommitBlock(projectRoot)` operating strictly between paired markers; on unmatched sentinels (opening present, closing missing — or vice versa), exit 0 with `[adev:session-capture] validation-error sentinel-mismatch <project-relative-path>` to stderr and skip modification (SEC-11).

**Tests:** Covered by Task 21 (sentinel-mismatch case is a dedicated subtest).

**Context to load:**
- Spec Error Cases row: legacy block without sentinels; SEC-11 deferred suggestion (unmatched-sentinel branch)
- Spec invariant "Paired-marker idempotency (SA-3)"

- [ ] **Write failing test** — Task 21 covers (including the SEC-11 unmatched-sentinel assertion).

- [ ] **Verify test fails** — Task 21 fails.

- [ ] **Implement**

Scan `.githooks/post-commit` for the opening/closing markers:
- Both present → remove content between them, exit 0.
- Neither present + legacy signature detected → print manual-migration instruction, exit 0, no modification.
- Exactly one present (mismatched) → emit `[adev:session-capture] validation-error sentinel-mismatch .githooks/post-commit` to stderr, exit 0, no modification (SEC-11).

- [ ] **Verify test passes** — Task 21 passes.

- [ ] **Commit**

```bash
git add cli/index.mjs
git commit -m "feat(cli): post-commit sentinel cleanup + sentinel-mismatch branch"
```

### Task 14: Stderr diagnostic helper with CON-10 subject-token contract [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=4
**Rationale:** Tiny pure formatting helper with the implementation skeleton already in the plan; SEC-7 invariant prescribes the exact output shape.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5
**Files:**
- Modify: `lib/session-capture.mjs` — Centralise stderr emission via `emitDiagnostic(reasonCode, { subject, path })` writing `[adev:session-capture] <reason-code>[ <subject>][ <project-relative-path>]` to stderr (CON-10 documents the optional second token as a subject identifier).

**Tests:** Covered by Task 7 / Task 8 hook tests (each validation-error case asserts the full stderr line including subject when present).

**Context to load:**
- Spec invariant "Stderr diagnostic format (SEC-7)"; CON-10 deferred suggestion

- [ ] **Write failing test** — Task 7/Task 8 test assertions cover the subject-token shape (e.g., `validation-error session-id`).

- [ ] **Verify test fails** — Task 7 / Task 8 fail until this helper exists.

- [ ] **Implement**

Add a small pure helper:
```javascript
export function formatDiagnostic(reasonCode, { subject, path } = {}) {
  const parts = ['[adev:session-capture]', reasonCode];
  if (subject) parts.push(subject);
  if (path) parts.push(path);
  return parts.join(' ');
}
```

All call sites in the hook helper compose through this function.

- [ ] **Verify test passes** — Task 7/Task 8 pass.

- [ ] **Commit**

```bash
git add lib/session-capture.mjs
git commit -m "feat(session-awareness): centralize stderr diagnostic format"
```

### Task 15: One-time post-commit sentinel-wrap migration [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=4
**Rationale:** SA-3 invariant specifies the marker contract; legacy-block detection by signature is a single-file scan with idempotent re-run semantics.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 13
**Files:**
- Modify: `cli/index.mjs` — Add a migration step that runs once on `adev install` / `adev upgrade`: if `.githooks/post-commit` contains the legacy capture signature AND no sentinels, wrap the block in `# >>> adev:session-capture >>>` / `# <<< adev:session-capture <<<` markers.

**Tests:** Covered by Task 21 (subtest: install on a legacy project, verify markers added).

**Context to load:**
- Spec invariant "Paired-marker idempotency (SA-3)"

- [ ] **Write failing test** — Task 21 covers.

- [ ] **Verify test fails** — Task 21 fails.

- [ ] **Implement**

Detect legacy capture block by signature (function name or distinctive comment from the existing `.githooks/post-commit`). If found AND no sentinels exist, locate the block bounds and inject opening/closing sentinel lines around it. Idempotent: re-runs no-op once sentinels are in place.

- [ ] **Verify test passes** — Task 21 passes.

- [ ] **Commit**

```bash
git add cli/index.mjs
git commit -m "feat(cli): one-time sentinel-wrap migration for legacy post-commit block"
```

### Task 16: Remove manual-batching warning + update `hooks/hooks.json` registration [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Trivial deletion plus idempotent JSON merge into `hooks/hooks.json`; mechanical edit with no design decisions.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 11
**Files:**
- Modify: `cli/index.mjs` — Delete the manual-batching warning lines from install output.
- Modify: `hooks/hooks.json` — Installer-managed entries for `SessionEnd` (→ `hooks/session-end.sh`) and `PreCompact` (→ `hooks/pre-compact.sh`). Add/remove idempotently based on `capture` mode.

**Tests:** Covered by Task 21 (asserts presence/absence of hook entries by mode).

**Context to load:**
- Spec Module Impact Map for `cli/index.mjs` and `hooks/hooks.json`

- [ ] **Write failing test** — Task 21 covers.

- [ ] **Verify test fails** — Task 21 fails.

- [ ] **Implement**

Delete the warning text. Add/remove hook entries in `hooks/hooks.json` from the installer; idempotent. Use the existing JSON merge helper if present, otherwise direct read/parse/merge/write.

- [ ] **Verify test passes** — Task 21 passes.

- [ ] **Commit**

```bash
git add cli/index.mjs hooks/hooks.json
git commit -m "feat(cli): register SessionEnd/PreCompact hooks; drop batching warning"
```

### Task 17: Add prompt step to `skills/init/SKILL.md` (markdown only) [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Pure markdown insert naming the CLI verb; pre-commit `no-inline-node` hook enforces the constraint and existing prompt steps provide the template.

**Charter capability:** Init-Time Capture Configuration
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 10
**Files:**
- Modify: `skills/init/SKILL.md` — Add a step naming `adev init prompt session-capture` as the CLI verb to invoke. Markdown only; no inline-Node, no `node -e`, no `node --input-type=module -e` heredocs.

**Tests:** The pre-commit `no-inline-node` hook enforces the constraint. Existing tests in `tests/skills/` (if any cover init) suffice; otherwise the pre-commit hook is the gate.

**Context to load:**
- Spec Module Impact Map; constitution Principle 2 + `pre-commit-no-inline-node.sh`
- Existing `skills/init/SKILL.md` for the prompt-step pattern

- [ ] **Write failing test** — Pre-commit hook (`.githooks/pre-commit-no-inline-node`) gates this. If a new test is desired, a small `tests/skills/init-skill-shape.test.mjs` can assert the file contains the verb name and lacks `node -e`.

- [ ] **Verify test fails** — Hook fails if any inline-Node pattern appears.

- [ ] **Implement**

Add the step in `skills/init/SKILL.md`:
```markdown
### Step N: Session capture preferences

Invoke `adev init prompt session-capture` to set `integrations.session_capture.{capture, gitignored}`.
```

- [ ] **Verify test passes** — `npm test` and pre-commit hook pass.

- [ ] **Commit**

```bash
git add skills/init/SKILL.md
git commit -m "docs(init): add session-capture prompt step (markdown only)"
```

### Task 18: Supersede `post-commit-self-skip.spec.md` + gate legacy regression test [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Frontmatter-only spec update plus a single test-fixture gate line; SA-8 bookkeeping is fully prescribed.

**Charter capability:** Hook-Driven Session Capture (charter-bookkeeping)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/specs/features/session-awareness/post-commit-self-skip.spec.md` — Frontmatter only: `status: superseded`, `superseded-by: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md`. Body unchanged.
- Modify: `tests/hooks/post-commit-self-skip.test.mjs` — Gate the test on a `capture: post-commit` fixture manifest, OR add a `describe.skip` guard when `capture` is not `post-commit`.

**Tests:** Existing `tests/hooks/post-commit-self-skip.test.mjs` continues to pass against the back-compat path.

**Context to load:**
- Spec SA-8 (supersession bookkeeping)
- Charter row for "Session-Capture Self-Skip Guard" (already marked `superseded` in rev 4)

- [ ] **Write failing test** — N/A; this is bookkeeping. The existing back-compat test must continue to pass.

- [ ] **Verify test fails** — N/A.

- [ ] **Implement**

Update the spec frontmatter. Gate the regression test by adding a `capture: post-commit` line to its fixture manifest (if not already present).

- [ ] **Verify test passes**

Run: `node --test tests/hooks/post-commit-self-skip.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add .context-index/specs/features/session-awareness/post-commit-self-skip.spec.md tests/hooks/post-commit-self-skip.test.mjs
git commit -m "chore(session-awareness): supersede post-commit-self-skip spec"
```

### Task 19: Versioned Claude Code payload fixtures (SA-9) [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=4 pattern=4 blast=5 novelty=4
**Rationale:** Two static JSON fixture files with documented key set and a shape-assertion test; the only design choice is realistic example values.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/fixtures/claude-code-payloads/session-end-v1.json` — Reference SessionEnd payload: `{ session_id, transcript_path, cwd, reason }`.
- Create: `tests/fixtures/claude-code-payloads/pre-compact-v1.json` — Reference PreCompact payload.

**Tests:** Used by Tasks 7 and 8. Add a small `tests/fixtures/claude-code-payloads/payload-shape.test.mjs` asserting the fixtures parse and contain the four required keys (catches upstream rename).

**Context to load:**
- Real SessionEnd / PreCompact payload examples (e.g., grep recent Claude Code session JSONL files)
- SA-9 deferred suggestion text

- [ ] **Write failing test**

```javascript
test('SessionEnd v1 fixture has the four documented keys', async () => {
  const payload = JSON.parse(await readFile('tests/fixtures/claude-code-payloads/session-end-v1.json'));
  for (const k of ['session_id', 'transcript_path', 'cwd', 'reason']) {
    assert.ok(k in payload, `missing key ${k}`);
  }
});
```

- [ ] **Verify test fails**

Expected: FAIL — fixture files don't exist yet.

- [ ] **Implement**

Create the two JSON files with realistic example values. Add the shape-assertion test.

- [ ] **Verify test passes**

Run: `node --test tests/fixtures/claude-code-payloads/payload-shape.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/fixtures/claude-code-payloads/
git commit -m "test(session-awareness): pin versioned Claude Code payload fixtures (SA-9)"
```

### Task 20: Consumer regression coverage (CON-4) [specialist: none]

**Routing:** assisted-agent (score: 14/20)
**Scores:** spec=4 pattern=3 blast=3 novelty=4
**Rationale:** Behavior 15 sets clear "no warnings/errors" assertion but four consumer skills (`work`, `status`, `hygiene`, `retro`) span multiple modules — checkpoint helps verify test scope before broad coverage.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 11
**Files:**
- Create or extend: tests covering `/adev:work`, `/adev:status`, `/adev:hygiene`, `/adev:retro` baseline behaviour when `.context-index/sessions/` is empty or missing.

**Tests:** Add assertions inside existing consumer test files (or create new ones under `tests/skills/`) that exercise the empty-directory and missing-directory branches; verify no warnings/errors are surfaced to the user.

**Context to load:**
- Spec behavior 15; charter Quality Attribute "Graceful absence"
- Existing test files for each consumer

- [ ] **Write failing test**

```javascript
test('/adev:work degrades silently when sessions/ is missing', async () => {
  // ... fixture project with no sessions/
  const result = await runSkill('adev:work', { cwd });
  assert.doesNotMatch(result.stderr, /warning|error/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/<consumer>.test.mjs`
Expected: PASS already (per charter QA guarantee) OR FAIL if a consumer is incorrectly noisy — in which case the consumer needs adjustment.

- [ ] **Implement**

Add the regression tests. If any consumer is found to emit warnings, fix that consumer to degrade silently (small adjustment scoped to this task).

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/skills/
git commit -m "test(session-awareness): regression coverage for sessions/ absence (CON-4)"
```

### Task 21: End-to-end installer test (3 modes, sentinel round-trip, SEC-11) [specialist: none]

**Routing:** assisted-agent (score: 14/20)
**Scores:** spec=5 pattern=3 blast=3 novelty=3
**Rationale:** Postconditions table fully prescribes subtests but the end-to-end installer test composes Tasks 11-16 across multiple files; checkpoint after subtest scaffolding catches missed edge cases early.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 13, Task 15
**Files:**
- Create: `tests/cli/install-session-capture.test.mjs`

**Tests:** Full end-to-end installer tests. Subtests:
1. `capture: hook, gitignored: true` on a new project → hooks registered, gitignore block written, no post-commit changes (clean).
2. `capture: hook` on a legacy project → post-commit sentinel block removed, gitignore block written, hooks registered.
3. `capture: post-commit, gitignored: false` → post-commit unchanged, gitignore unchanged (or block removed if previously present), no hook entries.
4. `capture: off` → no hook entries, post-commit sentinel block removed, gitignore block removed, sessions/ files preserved (no deletion), exit message lists existing files.
5. Idempotency: re-run any mode twice → no duplicate entries, no duplicate blocks, no extra blank lines.
6. User-content outside markers preserved in both `.githooks/post-commit` and `.gitignore`.
7. **SEC-11 sentinel-mismatch:** post-commit has opening marker but no closing → installer exits 0 with `[adev:session-capture] validation-error sentinel-mismatch .githooks/post-commit` to stderr, no modification.

**Context to load:**
- All previous tasks (this test wires them together)
- `tests/helpers.mjs` for tempdir + manifest fixture helpers

- [ ] **Write failing test** — See subtests above.

- [ ] **Verify test fails**

Run: `node --test tests/cli/install-session-capture.test.mjs`
Expected: FAIL — Tasks 11-16 haven't landed yet.

- [ ] **Implement** — N/A (this task is the test; production code already in place from Tasks 11-16).

- [ ] **Verify test passes**

Run: `node --test tests/cli/install-session-capture.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/cli/install-session-capture.test.mjs
git commit -m "test(cli): end-to-end installer coverage for session-capture modes"
```

### Task 22: Smoke test (manual) [specialist: none]

**Routing:** human-only (score: 9/20)
**Scores:** spec=4 pattern=3 blast=1 novelty=1
**Rationale:** Plan explicitly marks this as a manual procedure on a fresh tempdir; agent cannot exercise an interactive `adev init` flow end-to-end without human verification of side effects across the filesystem.

**Charter capability:** Hook-Driven Session Capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 11, Task 15
**Files:** None (manual procedure).

**Tests:** Manual.

**Procedure:**
1. `mktemp -d` and `cd` into a fresh tempdir.
2. Run `adev init` — accept defaults; verify `manifest.yaml:integrations.session_capture` is created with `capture: hook, gitignored: true`.
3. Trigger a fake SessionEnd via `runHook` or by exporting `CLAUDE_PROJECT_DIR` and piping a payload into `hooks/session-end.sh`.
4. Verify `.context-index/sessions/<date>-<session_id>.md` is written; verify `.gitignore` contains the sentinel-bounded block; verify `hooks/hooks.json` lists the new matchers.
5. Re-run installer — verify idempotency (no duplicates).
6. Flip `capture: off`, re-run installer — verify hooks unregistered, gitignore block removed, sessions/ files preserved.

- [ ] **Run smoke test manually.**
- [ ] **Commit** — N/A.

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- Lint passes: N/A (this codebase has no lint command in package.json)
- Type check passes: N/A (pure ESM, no TypeScript)
- All acceptance criteria from spec satisfied
- Pre-commit `no-inline-node` hook passes (Principle 2 enforcement)
- No new external dependencies (Principle 1)
- All new `.mjs` files use ESM (Principle 3)
- All new hooks exit 0 in every documented path (Principle 4)
- `package.json` and `.claude-plugin/plugin.json` versions remain in sync (Principle 5; bump together at the end of the feature work in a final chore commit if any version bump is warranted)
