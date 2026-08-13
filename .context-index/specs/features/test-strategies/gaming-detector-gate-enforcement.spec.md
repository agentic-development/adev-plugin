---
charter: test-strategies
status: review-passed
kind: behavioral
risk_level: high
milestone:
revision: 2
charter-revision: 4
created: 2026-08-12
updated: 2026-08-13
source-manifest:
  sha: "00bfa90"
  files:
    - .context-index/specs/features/test-strategies/charter.md
    - hooks/hooks.json
    - lib/test-strategies/gaming.mjs
    - skills/write-test/SKILL.md
  computed-at: "2026-08-13T02:44:53.163Z"
---

# Live Spec: Gaming Detector Gate Enforcement

<!-- Live Spec within the test-strategies charter.
     Parent Charter: .context-index/specs/features/test-strategies/charter.md

     Tracks issue-553 (main-repo task board): lib/test-strategies/gaming.mjs ships 8
     detectors (4 shared cross-strategy + 4 integration-specific) but is imported ONLY by
     tests/. No CLI verb, hook, gate, or validate check invokes it. skills/write-test/SKILL.md
     documents only the 4 shared patterns near the gaming-detection instructions and never
     mentions the 4 integration-specific patterns at all — a real prose/code gap, though not
     the "4 vs 8" miscount the issue described (SHARED_PATTERNS genuinely has 4 members).
     Enforcement today is entirely agent prose ("always check the 4 shared cross-strategy
     gaming patterns") — the lesson recorded on the issue is that policies enforced only by
     prose do not bind (11 alteryx docstrings recite a no-silent-skip rule that ~10 sibling
     files violate anyway). This spec wires the 8 detectors into a deterministic PreToolUse
     hook instead.

     Revision history:
     - Rev 1 BLOCKED at /adev:review-specs (structural-architect + security-reviewer, 3
       blockers: SA-1, SA-2, SEC-1 — see .blockers.md). Root cause: rev 1 specced a
       `PostToolUse` hook exiting 2 as a "hard block." This repo's PostToolUse hooks are
       advisory-only (docs/hooks.md:173, hooks/lifecycle-gate-advisory.sh) — the edit has
       already landed on disk by the time PostToolUse fires, so `exit 2` cannot prevent
       anything. Rev 1 also used `detectTaskStrategy([filePath])` to decide when to run the
       integration-specific detectors; empirically that heuristic never resolves `integration`
       for any real test-file path in this repo (it is keyed to production-source path
       conventions), so the integration detectors would never have fired. Rev 1 also left
       `runGamingDetectors`'s relationship to `detectSharedGamingPatterns`'s 500KB size cap
       unstated, which — if the cap were inherited — is a silent, deterministic bypass
       (pad a file past 500KB, the gate goes blind).
     - Rev 2 (this revision) fixes the mechanism: a **PreToolUse** hook that reconstructs the
       post-edit file content *before* the write lands (from `content` on `Write`, or by
       applying `old_string` → `new_string` to the pre-edit on-disk content on `Edit`) and
       diffs it against the pre-edit on-disk content read directly from disk — no `git show`,
       no git dependency at all, which also resolves the "not a git repo" degraded-mode
       limitation rev 1 needed and the git-invocation-shape guardrail rev 1's security review
       asked for (SEC-3), because there is no longer a shell-out to `git` in the hot path.
       Rev 2 replaces `detectTaskStrategy` with a dedicated, test-path-specific
       `isIntegrationTestFile()` heuristic (SA-2) and calls each detector's `.detect()`
       directly rather than through the size-capped wrapper (SEC-1). `risk_level` raised
       `medium` → `high` per CON-4 (a fail-closed hook running on every test-file edit
       repo-wide is a high-leverage change class, consistent with `test-depth-policy.spec.md`
       precedent). CON-1/CON-2/CON-3 addressed inline (see Behaviors and source-manifest). -->

## Capability

A deterministic, fail-closed enforcement point for the 8 gaming detectors already implemented
in `lib/test-strategies/gaming.mjs`. Today those detectors run only inside `tests/lib/test-
strategies/*.test.mjs` — they prove the detection logic works, but nothing invokes it against
a real test file an agent is authoring. This spec adds a `PreToolUse` hook, `gaming-gate.sh`,
that runs *before* every `Write`/`Edit` of a test file lands on disk and rejects the tool call
(`exit 2`, the edit never happens) when it would introduce a **new** gaming violation that was
not already present in the file.

## Scope Decision: Regression-Only, Not Whole-File

**This is the central design decision in this spec and the reason a naive "run all 8
detectors, block on any violation" design was rejected.**

Before writing this spec, the 4 shared and 4 integration-specific detectors were run,
unmodified, against every test file already committed under `tests/**` in this repo
(462 files). Result: **103 files (22%) contain at least one existing match**
(196 shared-pattern hits, 36 integration-pattern hits). Two causes, both structural to the
detectors as shipped, not incidental:

- `CONDITIONAL_ASSERTIONS` scans raw `if (...) { ...assert... }` text across the **whole
  file**, not just inside `test`/`it` bodies. It fires on ordinary helper functions that
  happen to contain both a conditional and an assertion call nearby (e.g. a `walk()` helper
  with an unrelated `if (...) continue;` a few lines above an assertion in a different
  block) as often as it fires on genuine vacuous test conditionals.
  `SWALLOWED_ASSERTIONS` and `EMPTY_ASSERTIONS` have the same whole-file-content scope.
- `tests/lib/test-strategies/gaming.test.mjs`, `tests/lib/test-strategies/
  integration-gaming.test.mjs`, and `tests/test-strategies/gaming-agent-skip.test.mjs` test
  the detectors themselves and necessarily embed fixture strings such as `it.skip(` and
  `process.env.CI` as string literals — the detectors cannot distinguish a fixture string
  from a live pattern without an AST, which is out of scope (Non-Negotiable Principle 1 —
  minimize dependencies, no parser).

A hook that hard-blocks on the **whole file's** violation count would make roughly a fifth of
the existing suite permanently un-editable the moment it shipped, including the very files
that test the detectors. The realistic outcome of that design is not "the suite gets
cleaned up" — it is the hook being disabled or reverted, which is a worse outcome than not
having a gate at all, per the same lesson the issue cites (prose the team routes around does
not bind; neither does a gate the team is forced to bypass constantly).

**Resolution:** the gate is regression-scoped, not whole-file. It compares the violation set
immediately before and immediately after the pending edit (Behaviors 5-7) and blocks only on
violations that are new. This keeps the "no-silent-skip" guarantee for the thing that actually
matters — an agent must not be able to introduce a fresh gaming pattern into a test file — 
without holding 103 pre-existing files hostage to a rescan of code the edit did not touch.
This is a genuine hard block: because enforcement runs `PreToolUse`, a rejected edit **never
reaches disk** (Behavior 3-4). No advisory-only mode, no config flag to soften it.

## Behavioral Contract

### Preconditions

- The edited/written file is a test file, per `isTestFile()` (Behavior 1): path contains a
  `tests/` (or provider-mirror `providers/*/tests/`) path segment, or the filename matches
  `*.test.mjs` / `*.spec.mjs`.
- The file is not one of the detector's own fixture files (Behavior 2).
- The tool call is `Write` or `Edit`. Other tools that can create/modify file content
  (`NotebookEdit`, `Bash` redirection, etc.) are out of scope — see Known Limitations.

### Behaviors

1. **When** a `Write` or `Edit` tool call is about to run (`PreToolUse`) on a path that is not
   a test file **then** the hook exits 0 immediately without reading file content or running
   any detector. Test-file classification is a pure path check: `tests/**` or provider-mirror
   `providers/*/tests/**`, or a filename ending in `.test.mjs` / `.spec.mjs`, case-sensitive,
   evaluated on the path only.

2. **When** the edited path matches the detector's own fixture files —
   `tests/lib/test-strategies/gaming*.mjs`, `tests/lib/test-strategies/integration-gaming*.mjs`,
   or `tests/test-strategies/gaming-agent-skip.test.mjs` — **then** the hook exits 0 without
   running detectors. These files intentionally embed gaming-pattern fixture strings to test
   the detector logic itself; scanning them for the patterns they exist to demonstrate is a
   category error, and would be a permanent, unfixable false positive independent of the
   regression-only design (adding a new fixture string is itself, correctly, a "new
   violation" from the diff's point of view).

3. **When** the hook runs on an in-scope test file **then** it computes two full-file content
   strings without ever writing anything:
   - **before**: the current on-disk content of the file, read directly from disk (empty
     string if the file does not yet exist — a brand-new file via `Write`).
   - **after**: the content the tool call *would* produce if allowed to proceed.
     - For `Write`: `after` is `CLAUDE_TOOL_INPUT_content` directly — it already is the full
       new file content.
     - For `Edit`: `after` is computed by applying the same substitution the `Edit` tool
       itself performs — replacing `CLAUDE_TOOL_INPUT_old_string` with
       `CLAUDE_TOOL_INPUT_new_string` in `before` (first occurrence only, matching the `Edit`
       tool's default `replace_all: false` semantics). **When** `old_string` does not appear
       verbatim in `before` (should not normally happen — the underlying `Edit` tool call
       would itself fail — but is treated defensively) **then** the hook cannot reconstruct
       `after` and exits 0 (fail-open; Behavior 8 covers this explicitly, it is not a crash).

4. **When** `before` and `after` are computed **then** the hook runs the detector set resolved
   by Behavior 5 (below) over each, in-memory, and never anywhere writes `after` to disk
   itself — the hook is read-only; if it allows the call through, the underlying `Write`/
   `Edit` tool performs the actual disk write, not the hook.

5. **When** the detector set is resolved for the file **then** it always includes the 4 shared
   detectors (`DISABLED_TESTS`, `EMPTY_ASSERTIONS`, `SWALLOWED_ASSERTIONS`,
   `CONDITIONAL_ASSERTIONS` from `SHARED_PATTERNS`), calling each pattern's `.detect(content)`
   method **directly** — never through `detectSharedGamingPatterns()`'s size-capped wrapper
   (`lib/test-strategies/gaming.mjs:474-494`, `MAX_FILE_SIZE = 500KB`). That wrapper exists for
   a different consumer (write-test's advisory scan) with different constraints; inheriting its
   silent `skipped: true` / zero-violations behavior here would let an agent trivially and
   deterministically defeat the entire gate by padding a test file past 500KB. This gate has no
   file-size exemption of any kind.

6. **When**, additionally, the file path satisfies `isIntegrationTestFile(filePath)` — path
   contains an `integration` path segment (e.g. `tests/integration/**`), or the filename
   (excluding the `.test.mjs`/`.spec.mjs` suffix) contains `integration` as a token (matches
   `*integration*.test.mjs`, covering this repo's actual naming:
   `tests/lib/test-strategies/integration-gaming.test.mjs`,
   `tests/hooks/lifecycle-gate-integration.test.mjs`) — **then** the 4 integration-specific
   detectors (`BOUNDARY_MOCKING`, `CI_BYPASS`, `CREDENTIAL_ABSENT_PASS`, `AGENT_SKIP`) also run.
   `isIntegrationTestFile()` is a dedicated, purpose-built heuristic over the test file's own
   path — **not** `detectTaskStrategy()` from `lib/test-strategies/detection.mjs`, which is
   designed to classify *production source* paths (`adapters/`, `connectors/`, `clients/`) and
   was verified, empirically, to resolve every sampled real test-file path in this repo
   (including `tests/integration/*.test.mjs`-shaped paths) to `unit`, never `integration` — so
   using it here would silently and permanently disable the 4 integration-specific detectors.
   When `isIntegrationTestFile()` is false, only the 4 shared detectors run: the
   integration-specific detectors assume mocking an infrastructure SDK is always wrong, which
   is false for an ordinary unit test (mocking `pg`/`@aws-sdk`/etc. in a unit test is normal
   and expected), so running them unconditionally would itself be a large new source of false
   positives across most of the existing unit-test suite.

7. **When** `before`-content violations and `after`-content violations (from the detector set
   resolved by Behaviors 5-6) are compared **then** a violation present in `after` is "new" if
   no `before` violation shares the same `(patternId, normalizedMatch)` pair, where
   `normalizedMatch` is the violation's `match` text with leading/trailing whitespace trimmed.
   Line numbers are intentionally excluded from the identity key — an edit earlier in the file
   shifts every line number below it, and a line-number-keyed diff would misreport every
   pre-existing violation after the edit point as "new."

8. **When** one or more new violations are found (Behavior 7) **then** the hook blocks the
   tool call: it writes a message to stderr naming each new violation's pattern id, line
   number (from the `after`-content scan), and message, and exits 2 — the underlying `Write`/
   `Edit` call is refused and the file on disk is left exactly as it was. **When** no new
   violations are found **then** the hook exits 0 and the tool call proceeds normally,
   regardless of how many baseline (pre-existing) violations remain in the file.

9. **When** the hook's own logic throws for any reason (a bug, an unreadable file that
   nonetheless exists, a malformed tool-input field, the `old_string`-not-found case in
   Behavior 3) **then** the hook exits 0 (fail-open) rather than 2. Per CLAUDE.md's hook
   protocol and the existing `_lifecycle-gate-check-edit.mjs` convention (`|| echo "pass"`), a
   crash in the enforcement mechanism must never brick an editing session; only an actually
   detected new violation may exit 2. Because the entire computation is in-memory string
   processing with no network or subprocess call, the realistic failure modes are: file
   genuinely unreadable (permissions), or an internal bug in `diffNewViolations`/detector code
   — never a flaky external dependency.

### Postconditions

- No test file's on-disk content is ever written by the hook itself; the hook only ever reads
  the pre-edit file (if it exists) and computes strings in memory. When it blocks, the
  underlying `Write`/`Edit` tool call never executes, so the file's on-disk content after a
  block is byte-identical to before the attempted edit.
- Every blocked edit's rejection reason is fully reconstructable from the hook's stderr output
  alone (pattern id + line + message per new violation) without re-running the detectors.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|--------------------|------------|
| File path missing from tool input | Hook exits 0 (nothing to check) | n/a |
| Non-test file edited | Hook exits 0 without reading content | n/a |
| Detector fixture file edited | Hook exits 0 without running detectors | n/a |
| `Edit`'s `old_string` not found in current on-disk content | Hook exits 0 (fail-open; cannot reconstruct `after`) | n/a |
| File unreadable (permissions, race) | Hook exits 0 (fail-open) | n/a |
| New violation(s) found in reconstructed `after` content | Hook exits 2 before the write/edit executes; message on stderr | `GAMING_VIOLATION` |
| Internal error in detector/diff logic | Hook exits 0 (fail-open); error is not surfaced as a block | n/a |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — the diff/gate logic uses only
  `node:fs` and the existing regex-based detectors in `lib/test-strategies/gaming.mjs`. No
  AST parser, no new npm dependency, and (as of rev 2) no subprocess/`git` dependency either —
  `before` is read straight off disk and `after` is reconstructed from tool input alone.
- **Principle:** "Hook protocol compliance" — the new hook reads JSON from stdin plus
  `CLAUDE_TOOL_INPUT_*` env vars (via the existing `_parse-stdin.sh` helper), exits 0 to
  allow / 2 to block, matching the `PreToolUse` `Write|Edit` precedent already in this repo
  (`hooks/plan-body-write-guard.sh`, which reads `CLAUDE_TOOL_INPUT_content` /
  `CLAUDE_TOOL_INPUT_new_string` the same way).
- **Principle:** "Pure ESM" — the new `lib/test-strategies/gaming-gate.mjs` module and the
  hook's node helper are both `.mjs`, no CommonJS.
- **Principle divergence, documented, not silently overridden:** `cross-strategy-gaming-
  patterns.spec.md`'s Constitution Reference states "detection is instruction-based, not
  executable code in SKILL.md." That statement constrains what may live **inside a
  SKILL.md file** — it does not, and was never framed to, forbid executable detection logic
  living in `hooks/` or `lib/`, which is exactly where every other deterministic control in
  this repo lives (`hooks/lifecycle-gate-edit.sh`, `hooks/constitution-linter.sh`,
  `hooks/plan-body-write-guard.sh`). This spec does not edit the validated
  `cross-strategy-gaming-patterns.spec.md` in place; it adds a new spec that supersedes
  *only* the enforcement mechanism, leaving that spec's behavioral claims about the 4 shared
  patterns' detection rules untouched.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| `lib/test-strategies/gaming-gate.mjs` | New module: `isTestFile(path)`, `isDetectorFixtureFile(path)`, `isIntegrationTestFile(path)`, `runGamingDetectors(content, filePath)` (calls `.detect()` directly on each applicable pattern, shared + conditional integration set, no size cap), `reconstructAfterContent({ tool, before, content, oldString, newString })` (Write passthrough / Edit substitution, `null` on not-found), `diffNewViolations(beforeContent, afterContent, filePath)` (fingerprint-based set diff) | medium |
| `hooks/_gaming-gate-check.mjs` | Node helper: reads env vars for tool name, file path, `content`/`old_string`/`new_string`; reads pre-edit content from disk (empty string if file doesn't exist); calls `reconstructAfterContent` then `diffNewViolations`; prints JSON result (`{ blocked, violations }`) to stdout | medium |
| `hooks/gaming-gate.sh` | Bash `PreToolUse` wrapper (matcher `Write\|Edit`): parses stdin/env via `_parse-stdin.sh`, calls the node helper, formats a stderr message, exits 0/2 per the helper's result; fail-open on any internal error | small |
| `hooks/hooks.json` | Register `gaming-gate.sh` under `PreToolUse`, matcher `Write\|Edit` | small |
| `skills/write-test/SKILL.md` | Correct the gaming-pattern prose: list the 4 integration-specific detectors alongside the existing 4 shared ones, and add a note that the deterministic hook is now the enforcement floor (the prose reminder is now a courtesy, not the only enforcement) | small |
| Unit tests | `tests/lib/test-strategies/gaming-gate.test.mjs` — `isTestFile`, `isDetectorFixtureFile`, `isIntegrationTestFile`, `runGamingDetectors` (shared-only vs. integration path), `reconstructAfterContent` (Write / Edit / not-found cases), `diffNewViolations` (new/pre-existing/removed violation cases, fingerprint stability across line shifts, oversized-content is still scanned) | medium |
| Hook tests | `tests/hooks/gaming-gate.test.mjs` — exit 0 on non-test file, exit 0 on fixture file, exit 2 (and file left untouched) on a genuinely new violation via both `Write` and `Edit`, exit 0 when a pre-existing violation is left untouched, exit 0 fail-open when `old_string` doesn't match, exit 2 even on a file just over 500KB | medium |
| Version bump | `package.json` + `.claude-plugin/plugin.json` — minor bump, kept in parity per Non-Negotiable Principle 5 | small |

## Known Limitations (documented, not resolved by this spec)

- **No CI coverage.** This hook fires only inside a live Claude Code agent session
  (`PreToolUse`). It gives no protection against a human — or an agent working outside a
  Claude Code session — committing a gaming pattern directly (e.g. editing with a plain text
  editor, or via a shell redirect). Closing that gap would mean a `.githooks/pre-commit` leg
  re-running the same regression diff against staged content, mirroring
  `hooks/pre-commit-no-inline-node.sh`'s `git diff --cached` pattern. Left as a natural
  follow-up, not bundled into this spec, to keep this change to one enforcement layer at a
  time.
- **`NotebookEdit` and shell-based file writes are out of scope.** The hook matches only
  `Write`/`Edit` tool calls. An agent that writes test file content via `Bash` (e.g.
  `cat > file.test.mjs <<EOF`) bypasses this gate entirely, the same way it bypasses every
  other content-inspecting `PreToolUse` hook in this repo (`plan-body-write-guard.sh` has the
  identical limitation).
- **Whole-file scope inside the `after` scan.** Behavior 7's fingerprint diff excludes line
  number but still runs each detector over the whole reconstructed `after` content, not just
  the changed region — a new, unrelated pre-existing-shaped violation added anywhere in the
  file (not just near the edit) is still caught. This is intentional (it is the point of the
  gate) but means an editor touching one line of a large, already-messy test file may
  occasionally be asked to address a violation that is text-identical to nothing in `before`
  even though it looks similar to something already there. This is accepted as correct, not a
  bug: the file's content changed, and the new content is new.
- **`gaming-gate.sh` and `skills/write-test/detect-gaming.sh` remain two separate,
  unreconciled scanners.** `detect-gaming.sh` is an older, framework-specific (Jest/Vitest
  matcher-shaped) 9-pattern scanner invoked by agent prose in `skills/write-test/SKILL.md`
  Step 4; it is out of scope for this spec, is not modified, and is not superseded. This spec
  makes `lib/test-strategies/gaming.mjs`'s 8 detectors, via `gaming-gate.sh`, the
  deterministic floor; `detect-gaming.sh` continues to run as an additional, agent-driven
  check with a different, overlapping-but-not-identical pattern set. A future spec may
  reconcile or retire one of the two scanners; this spec does not.

## Acceptance Criteria

- [ ] `lib/test-strategies/gaming-gate.mjs` exports `isTestFile`, `isDetectorFixtureFile`,
      `isIntegrationTestFile`, `runGamingDetectors`, `reconstructAfterContent`,
      `diffNewViolations`, each covered by unit tests
- [ ] `hooks/gaming-gate.sh` + `hooks/_gaming-gate-check.mjs` registered in `hooks/hooks.json`
      under `PreToolUse`, matcher `Write|Edit`
- [ ] Hook exits 0 for non-test files without reading file content
- [ ] Hook exits 0 for the named detector-fixture test files regardless of content
- [ ] Hook exits 2 **before the write/edit executes** when the reconstructed post-edit content
      introduces a gaming pattern not present in the pre-edit on-disk content of the same file
      — verified by asserting the file on disk is unchanged after a blocked attempt
- [ ] Hook exits 0 when an edit leaves a pre-existing violation untouched and introduces no new
      one
- [ ] Hook exits 0 (fail-open) when `old_string` cannot be found in the pre-edit content, the
      file is unreadable, or an internal error occurs — never a silent hang or a non-0/2 exit
      code
- [ ] Gate has no file-size exemption: a violation in a file larger than 500KB still blocks
- [ ] Integration-specific detectors run only when `isIntegrationTestFile(filePath)` is true
- [ ] `skills/write-test/SKILL.md` lists all 8 detectors (4 shared + 4 integration-specific,
      named separately) and references the hook as the deterministic enforcement floor
- [ ] `package.json` and `.claude-plugin/plugin.json` versions bumped together
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
