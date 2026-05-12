# Implementation Plan: Markdown Rendering Layer

> **Methodology:** adev
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/markdown-rendering-layer.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-11)
> **Platform:** Node.js (ESM, `.mjs`), node:test

**Goal:** Build a read-only markdown rendering layer atop the JSON / JSONL state artifacts established by the four foundation specs. Produces `tasks.md` from `tasks.json` and per-spec `<slug>.md` from `<slug>.jsonl` via the new `adev status --render` operator command, plus the aggregate `adev status --pipeline` read view.

**Architecture:** Two new render functions and one aggregation helper, fully separated from authoritative-state code paths. `lib/issues/render-markdown.mjs` exports a pure `renderTasksMd(board) → string` and an I/O wrapper `writeTasksMd(projectRoot) → void`. `lib/lifecycle-state.mjs` gets full bodies for the foundation-spec-stub `renderMarkdown(state)` and `listLifecycleStates(projectRoot)`. All free-text fields run through a 6-rule escape pipeline (newline normalize → slot-context collapse → HTML escape → markdown structural escape → length truncation → null placeholder). Every rendered file carries a `DO NOT EDIT — generated` header. Architectural tests assert no skill invokes `--render` autonomously and `renderMarkdown` never imports domain-config (severity is pre-stamped on events).

**Reviewer notes carried into plan:** The PASS_WITH_NOTES review surfaced six warnings (SA-1 `_read` coupling, SA-2 `--render` exit-code semantics, SA-3 composite exit code, SEC-1 HTML-comment `-->` injection in `source`, CON-5 missing `isDirectory()` check, CON-6 cleanup-error swallowing contract). Each maps to a specific task below.

---

## File Structure

**Create:**
- `lib/issues/render-markdown.mjs` — `renderTasksMd(board)` + `writeTasksMd(projectRoot)`
- `tests/lib/issues/render-markdown.test.mjs` — Round-trip + escape + edit-survives tests
- `tests/lib/lifecycle-state.render.test.mjs` — `renderMarkdown` projection coverage + `listLifecycleStates` aggregate
- `tests/lib/issues/render-markdown.atomic.test.mjs` — Atomic-write fault injection
- `tests/lib/issues/render-markdown.escape.test.mjs` — Byte-exact escape rule tests
- `tests/cli/status-render.test.mjs` — CLI `--render` integration
- `tests/cli/status-pipeline.test.mjs` — CLI `--pipeline` integration

**Modify:**
- `lib/lifecycle-state.mjs` — Replace `renderMarkdown` and `listLifecycleStates` stubs with full bodies
- `cli/index.mjs` — Wire `adev status --render` and `adev status --pipeline` flag dispatch
- `tests/architectural.test.mjs` (or equivalent) — Grep tests: no autonomous render; `renderMarkdown` source contains no `domain-config` import; no non-atomic writes to rendered files
- `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` — Capability Map: `Markdown rendering layer` → `planned`

**Reference (read, do not modify):**
- `lib/build-state.mjs::atomicWriteJson` — Atomic-write pattern reference (generalize to `atomicWriteFile` if needed)
- `lib/issues/markdown-parser.mjs::parseTasksMd` (lands in `json-issue-board-adapter` work) — Round-trip partner
- `lib/lifecycle-state.mjs::currentState` (lands in `lifecycle-event-log` work) — Source of `StateProjection` for `renderMarkdown`
- `lib/issues/json-adapter.mjs::list` / `::listEpics` (lands in `json-issue-board-adapter` work) — Source of board data for `writeTasksMd`
- `.context-index/samples/general-library-module-graph.md`

---

## Context Packets

### Task 1 Context — `render-markdown.mjs` skeleton + GENERATED_HEADER constant
- Spec: Behavioral Contract; Visual Expectations
- Source: existing rendered `tasks.md` format

### Task 2 Context — `renderTasksMd` body
- Spec: AC on round-trip property; Visual Expectations for `tasks.md` table layout
- Source: `lib/issues/markdown-parser.mjs::parseTasksMd` (round-trip partner)

### Task 3 Context — `writeTasksMd(projectRoot)` I/O wrapper
- Spec: AC on temp-then-rename + atomic; CON-5 (storage-root existence check); CON-6 (cleanup-error swallow)
- Source: `lib/build-state.mjs::atomicWriteJson`; `lib/issues/resolve-root.mjs`

### Task 4 Context — `escapeField(value, { slot, cap })` helper
- Spec: HTML/Markdown Escaping Contract (rules 1-6); SEC-5 resolution
- Note: HTML escape MUST precede markdown structural escape (rules 3 → 4 order)

### Task 5 Context — `renderMarkdown(state)` body
- Spec: AC on per-spec markdown layout; Visual Expectations for `<slug>.md` layout
- Source: `lib/lifecycle-state.mjs::currentState` (StateProjection contract)

### Task 6 Context — `listLifecycleStates(projectRoot)` body
- Spec: AC on glob + fold + sort lexicographic; `MALFORMED_FILE_SKIPPED` tolerance; empty-directory handling

### Task 7 Context — Path containment defenses
- Spec: Path Safety items 1-7
- Source: sibling-spec pattern in `lib/issues/json-adapter.mjs`

### Task 8 Context — Slug allowlist + oversized log skip
- Spec: Path Safety items 5-6; `SKIPPED_INVALID_SLUG`, `OVERSIZED_LOG_SKIPPED`

### Task 9 Context — SEC-1 HTML-comment `-->` defense
- Spec: SEC-1 finding in review.md — `source` interpolation into HTML comment must strip/escape `-->`
- Defense: replace `-->` with `-- >` in `source` before interpolation (one-line fix per review recommendation)

### Task 10 Context — CLI `adev status --render` dispatch
- Spec: Behaviors + Visual Expectations; SA-2 (exit-code semantics — advisory skips don't affect exit)
- Source: `cli/index.mjs` (existing `adev status` parser)

### Task 11 Context — CLI `adev status --pipeline` dispatch
- Spec: Behaviors; Visual Expectations for stdout table (40-char path truncation)

### Task 12 Context — `--render + --pipeline` composite + SA-3 exit-code rule
- Spec: Behaviors; SA-3 in review (exit-code semantics for composite invocation)

### Task 13 Context — Round-trip property test (50+ fixtures)
- Spec: AC on `parseTasksMd(renderTasksMd(board)) ≡ board`; SA-5 (legacy-issue exclusion contract)

### Task 14 Context — `renderMarkdown` projection coverage (snapshot)
- Spec: AC on per-event-variant rendering

### Task 15 Context — Escape contract byte-exact tests
- Spec: AC on each rule independently; backtick-bomb, `<script>`, pipe-injection, `\n## Fake Heading`, oversized payload, null/undefined/`""`

### Task 16 Context — Atomic-write fault injection (rendered files)
- Spec: AC on atomic-write fault injection across both renderers
- Source: existing fault-injection patterns from sibling specs

### Task 17 Context — Rendered-file-editing-has-no-effect test
- Spec: AC documenting the "rendered files are not source of truth" invariant

### Task 18 Context — Architectural tests
- Spec: AC on no autonomous render; no domain-config import in `renderMarkdown`; no non-atomic writes to rendered files

---

## Heuristics

> Module-scope heuristics returned empty at plan time.

---

## Parallelization

- **Group A (sequential foundation):** Task 1 → Task 2 (skeleton + body of `renderTasksMd`)
- **Group B (independent of A):** Task 4 (`escapeField` helper — pure, no I/O)
- **Group C (after A + B):** Task 3 (`writeTasksMd` consumes A; uses B's escapes via interior)
- **Group D (after B):** Task 5 (`renderMarkdown` body — consumes B)
- **Group E (independent):** Task 6 (`listLifecycleStates` body)
- **Group F (after C + E):** Task 7 → Task 8 (path containment + slug allowlist; both touch render functions)
- **Group G (after C):** Task 9 (SEC-1 HTML-comment defense — small surgical change)
- **Group H (after F):** Task 10 → Task 11 → Task 12 (CLI dispatch sequence)
- **Group I (after Groups B-E):** Tasks 13, 14, 15 (property + snapshot + escape tests; can run in parallel)
- **Group J (after Groups C-F):** Tasks 16, 17 (atomic-write fault, edit-survives)
- **Group K (after all):** Task 18 (architectural assertions)

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | `render-markdown.mjs` skeleton + GENERATED_HEADER | small | unit | — | 1 create, 0 modify |
| 2 | `renderTasksMd(board)` body (epics → open issues → closed issues) | medium | unit | Task 1 | 0 create, 1 modify |
| 3 | `writeTasksMd(projectRoot)` I/O wrapper + atomic write + isDirectory check (CON-5) + cleanup-on-failure (CON-6) | medium | unit | Tasks 2, 4 | 0 create, 1 modify |
| 4 | `escapeField(value, { slot, cap })` helper (6-rule pipeline) | medium | unit | — | 0 create, 1 modify |
| 5 | `renderMarkdown(state)` body (per-spec layout) | medium | unit | Task 4 | 0 create, 1 modify (lifecycle-state.mjs) |
| 6 | `listLifecycleStates(projectRoot)` body (glob + fold + sort) | small | unit | — | 0 create, 1 modify (lifecycle-state.mjs) |
| 7 | Path containment defenses (realpath-prefix; SA-1 use public list/listEpics, not `_read`) | small | unit | Tasks 3, 6 | 0 create, 1 modify each |
| 8 | Slug allowlist + oversized log skip | small | unit | Task 6 | 0 create, 1 modify |
| 9 | SEC-1: strip `-->` from `source` interpolation before HTML-comment header emission | small | unit | Task 3 | 0 create, 1 modify |
| 10 | CLI `adev status --render` dispatch (SA-2: advisory skips don't affect exit code) | medium | unit | Task 7 | 0 create, 1 modify (cli/index.mjs) |
| 11 | CLI `adev status --pipeline` dispatch | small | unit | Task 6 | 0 create, 1 modify (cli/index.mjs) |
| 12 | `--render + --pipeline` composite (SA-3: shared exit code resolved by SA-2 + SA-3 alignment) | small | unit | Tasks 10, 11 | 0 create, 1 modify (cli/index.mjs) |
| 13 | Round-trip property test (50+ fixtures, legacy issues excluded per SA-5) | large | unit | Task 2 | 1 create, 0 modify |
| 14 | `renderMarkdown` projection coverage (per-event-variant snapshots) | medium | unit | Task 5 | 0 create, 1 modify (existing test) |
| 15 | Escape contract byte-exact tests (backtick-bomb, `<script>`, pipe-injection, line-break, null/undefined/`""`, cap) | large | unit | Task 4 | 1 create, 0 modify |
| 16 | Atomic-write fault injection on rendered files | medium | unit | Tasks 3, 5 | 1 create, 0 modify |
| 17 | Rendered-file-editing-has-no-effect test | small | unit | Tasks 3, 10 | 0 create, 1 modify |
| 18 | Architectural tests: no autonomous render; no `domain-config` import in `renderMarkdown`; no non-atomic writes to rendered files | small | unit | All implementation tasks | 0 create, 1 modify (architectural.test.mjs) |

---

## Strategy Summary

All tasks resolve to `unit` strategy. No external infrastructure required.

---

## Task 1: Skeleton + GENERATED_HEADER constant [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit

- [x] **Write failing test** — Import `renderTasksMd` and `writeTasksMd` from `lib/issues/render-markdown.mjs`. Assert both are functions. Assert `GENERATED_HEADER` constant exists with the canonical template.
- [x] **Verify test fails** (module does not exist)
- [x] **Implement** — New file with stubs and the constant: `const GENERATED_HEADER = \`<!-- DO NOT EDIT — generated by \\\`adev status --render\\\` from \${source}. Edits will be lost on next regeneration. -->\`;`
- [x] **Verify test passes**
- [x] **Commit**

## Task 2: `renderTasksMd(board)` body [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** Task 1

- [x] **Write failing tests** — Fixture board with epics + open issues + closed issues; assert output contains the generated-header, epic table, open-issue table grouped by epicId, closed-issue `<details>` block. Round-trip: `parseTasksMd(renderTasksMd(board)) ≡ board` for the fixture.
- [x] **Verify tests fail**
- [x] **Implement** — Iterate epics → render table; open issues grouped by `epicId` → render table; closed issues → collapsed `<details>` block. Preserve the existing `tasks.md` column convention so `parseTasksMd` round-trips.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 3: `writeTasksMd(projectRoot)` I/O wrapper [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** Tasks 2, 4

- [x] **Write failing tests** — `writeTasksMd` loads board via `JsonAdapter.list()` + `listEpics()`, renders, writes atomically. Storage root resolved via `resolveStorageRoot`. CON-5: missing storage-root directory throws `INVALID_STORAGE_PATH` (positive existence + `isDirectory()` check). CON-6: rename failure best-effort unlinks temp, swallowing cleanup errors, rethrows original.
- [x] **Verify tests fail**
- [x] **Implement** — Compose `JsonAdapter.list` + `listEpics` + `renderTasksMd` + atomic temp-then-rename. `fs.statSync(resolvedStorageRoot).isDirectory() === true` precondition. Try/catch around rename with cleanup-on-failure mirroring `lib/build-state.mjs::atomicWriteJson`.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 4: `escapeField(value, { slot, cap })` helper [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** —

- [x] **Write failing tests** — Each of the 6 rules independently. HTML escape (rule 3) precedes markdown escape (rule 4) — `<` becomes `&lt;`, NOT `\<&lt;`. Slot-context collapse: `\n` in inline slot → space; `\n` in block slot → preserved. Length truncation operates on escaped form (post-escape). Null/undefined/`""` → `—`.
- [x] **Verify tests fail**
- [x] **Implement** — Pure function inside `render-markdown.mjs` (or a shared `lib/escape-field.mjs` if used from both renderers). Apply the 6 rules in order.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 5: `renderMarkdown(state)` body [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** Task 4

- [x] **Write failing tests** — Snapshot test against a fixture StateProjection; assert H1 + metadata table + `## Steps` with H3 per canonical step + `## Plan Tasks` + `## Interventions` + `## Unknown Events` (if non-empty) + GENERATED_HEADER + trailing regeneration-timestamp footer.
- [x] **Verify tests fail** (stub returns placeholder)
- [x] **Implement** — Replace the foundation-spec stub. Use `escapeField` for free-text. Severity pre-stamped on events (no domain-config lookup at render time).
- [x] **Verify tests pass**
- [x] **Commit**

## Task 6: `listLifecycleStates(projectRoot)` body [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** —

- [x] **Write failing tests** — Fixture with 10 specs in various states. Returns `[{spec, slug, status, currentStep, updated}]` sorted lexicographically by slug. Missing directory → `[]`. Malformed file → skip with `MALFORMED_FILE_SKIPPED` warning, continue with siblings.
- [x] **Verify tests fail** (stub returns empty/placeholder)
- [x] **Implement** — Replace foundation-spec stub. `fs.readdirSync` (or `fs.glob` if Node 22+) on `lifecycle-state/`, filter `*.jsonl`, sort. Fold each via `currentState`. Skip filenames failing `[a-z0-9._-]+` allowlist.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 7: Path containment defenses [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** Tasks 3, 6

- [x] **Write failing tests** — `projectRoot` missing `.context-index/manifest.yaml` → `INVALID_PROJECT_ROOT`. Crafted `tasks.db_path` traversal → `INVALID_STORAGE_PATH`. Symlink escape → `INVALID_STORAGE_PATH`. SA-1: `writeTasksMd` consumes `JsonAdapter.list/listEpics` only (no `_read` private-member access) — assert via source inspection.
- [x] **Verify tests fail**
- [x] **Implement** — Add `validateProjectRoot` + realpath-prefix check on rendered-target's parent dir. Per SA-1 in review, restate the data-flow doc: source data flows through public `list`/`listEpics` only.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 8: Slug allowlist + oversized log skip [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** Task 6

- [x] **Write failing tests** — Filename `../etc.jsonl` → skipped with `SKIPPED_INVALID_SLUG`. `<slug>.jsonl` > 50 MB → `OVERSIZED_LOG_SKIPPED`, rendering continues for siblings.
- [x] **Verify tests fail**
- [x] **Implement** — Allowlist regex `[a-z0-9._-]+` on filename stem. `fs.statSync(...).size` check before passing to `currentState`.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 9: SEC-1 — strip `-->` from `source` interpolation [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** Task 3

- [x] **Write failing test** — Construct a `source` string containing `-->` (e.g., from a path segment). Assert the rendered GENERATED_HEADER does NOT contain a premature `-->` token that would close the HTML comment early. Substitute `-->` → `-- >`.
- [x] **Verify test fails**
- [x] **Implement** — Pre-process the `source` parameter before interpolation into both `GENERATED_HEADER` and the footer `<!-- regenerated from ... -->` template.
- [x] **Verify test passes**
- [x] **Commit**

## Task 10: CLI `adev status --render` dispatch [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** Task 7

- [x] **Write failing tests** — `adev status --render` invokes `writeTasksMd` then iterates `lifecycle-state/*.jsonl` and writes each `<slug>.md`. Per-file action summary to stdout (`✓ tasks.md`, `✓ <slug>.md`, `⚠ skipped: <slug>`). Exit 0 on success; exit 1 on `INVALID_PROJECT_ROOT` / `INVALID_STORAGE_PATH`. SA-2: advisory-skipped files (`SKIPPED_INVALID_SLUG`, `OVERSIZED_LOG_SKIPPED`, `MALFORMED_FILE_SKIPPED`) do NOT affect exit code.
- [x] **Verify tests fail** (no dispatch wired)
- [x] **Implement** — Add `--render` parser to `cli/index.mjs`'s `adev status` subcommand. Implement SA-2 exit-code rule: exit code = max(0 from skips, 1 from hard validation errors, 1 from `fs` errors).
- [x] **Verify tests pass**
- [x] **Commit**

## Task 11: CLI `adev status --pipeline` dispatch [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** Task 6

- [x] **Write failing tests** — `adev status --pipeline` prints aligned table (Spec, Status, Current Step, Updated). Empty result prints `No specs found in .context-index/lifecycle-state/`. Long paths truncated to 40 chars with `…`. Exit 0 always.
- [x] **Verify tests fail**
- [x] **Implement**
- [x] **Verify tests pass**
- [x] **Commit**

## Task 12: `--render + --pipeline` composite + SA-3 exit-code [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** Tasks 10, 11

- [x] **Write failing tests** — Composite invocation runs `--render` first, prints divider, then `--pipeline`. SA-3: composite exit code = max of the two halves. Advisory-skipped `--render` does NOT poison `--pipeline` (exit 0 unless one half had a hard error).
- [x] **Verify tests fail**
- [x] **Implement**
- [x] **Verify tests pass**
- [x] **Commit**

## Task 13: Round-trip property test [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** Task 2

- [x] **Write tests** — 50+ fixture board shapes covering canonical cases. Assert `parseTasksMd(renderTasksMd(board)) ≡ board` field-by-field. SA-5 contract: legacy issues with both `planRef` AND `planTask` are excluded from the property (renderer emits them; parser rejects them at write time). Document the exclusion explicitly in a test comment.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 14: `renderMarkdown` projection coverage [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** Task 5

- [x] **Write tests** — Snapshot test per canonical event variant (`lifecycle_step`, `step_completed`, `step_failed`, `reviewer_report`, `validator_report`, `plan_task`, `debug_intervention`, `recovery_record`, `manual_override`, unknown). Assert stable rendered output for a fixture log.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 15: Escape contract byte-exact tests [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** Task 4

- [x] **Write tests** — Per-rule byte-exact assertions:
  - HTML escape: `notes: "<script>alert('xss')</script>"` → `&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;`
  - Markdown structural escape: `notes: "a|b\\c\`d"` → `a\|b\\c\\\`d`
  - Inline-context newline collapse vs. block-context preservation
  - Per-field cap enforcement: codepoint-counted (Unicode-safe) truncation with `…[truncated]` marker
  - Null / undefined / `""` → `—` placeholder
- [x] **Verify tests pass**
- [x] **Commit**

## Task 16: Atomic-write fault injection [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** Tasks 3, 5

- [x] **Write tests** — Kill child process mid-write on `tasks.md` and on `<slug>.md`. Assert prior content preserved, temp file cleaned up (best-effort), follow-up render succeeds.
- [x] **Verify tests pass**
- [x] **Commit**

## Task 17: Rendered-file-editing-has-no-effect test [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** Tasks 3, 10

- [x] **Write test** — Render `tasks.md`; hand-edit it; assert `JsonAdapter.list()` unchanged. Re-render; assert hand-edits overwritten. Documents the "rendered files are not source of truth" invariant.
- [x] **Verify test passes**
- [x] **Commit**

## Task 18: Architectural tests [specialist: none]

**Charter capability:** Markdown rendering layer
**Strategy:** unit
**Depends on:** All implementation tasks

- [x] **Write tests** — (a) grep all `skills/*/SKILL.md` for `adev status --render` — assert no occurrence in an autonomous context (skills may invoke `--pipeline` for read but not `--render`). (b) `lib/lifecycle-state.mjs::renderMarkdown` source contains no `import` of `lib/domains/domain-config.mjs` (severity is pre-stamped). (c) No non-atomic writes to rendered files: grep `writeFile(.*\\.md` against `lib/issues/render-markdown.mjs` outside the atomic-write primitive.
- [x] **Verify tests pass**
- [x] **Commit**

---

## Quality Gates

- `npm test` green
- No new dependencies
- All files are `.mjs` ESM
- Coverage on `lib/issues/render-markdown.mjs` ≥ 90% lines
- Coverage on the new bodies in `lib/lifecycle-state.mjs` ≥ 90% lines
- All 22 AC criteria satisfied (incl. review notes carryover)
- Performance: `renderTasksMd(1000-issue board)` < 100 ms p99; `renderMarkdown(1000-event log)` < 50 ms p99; `listLifecycleStates(100 specs)` < 100 ms p99
- No constitutional violations
