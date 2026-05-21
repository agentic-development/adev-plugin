<!-- partial_schema: plan@1 -->

# Implementation Plan: Cursor sync target output

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cursor-provider/charter.md
> **Spec:** .context-index/specs/features/cursor-provider/sync-target-output.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-18)
> **Platform:** Node.js >= 18, JavaScript (ESM, `.mjs`), npm, node:test

**Goal:** Activate the redefined `cursor` sync-target format so `/adev:sync` writes a pointer projection to `.cursor/rules/adev.mdc` (YAML frontmatter `description` + `alwaysApply: true`, body ≤ 200 words, User Additions preserved, atomic write) instead of the legacy full-content `.cursorrules` duplicate.

**Architecture:** Pure format-dispatch activation inside the existing `/adev:sync` skill. The writer is a markdown-described behavior in `skills/sync/SKILL.md` plus the existing helper conventions (`ensureDir`, atomic temp+rename, User Additions preservation, Learned Lessons placement). The CLI scaffold stub at `cli/index.mjs:465-467` flips from commented `.cursorrules` to active `.cursor/rules/adev.mdc`. A new test file `tests/sync/cursor-format.test.mjs` covers the contract end-to-end against fixture constitutions in temp dirs. No new modules, no new dependencies, no hook-protocol changes, and no touch on `~/.cursor/` (that path is owned by `CursorAdapter` per Spec B).

**Review notes addressed.**

- **SA-1 (sibling-file ownership in `.cursor/rules/`).** Folded into Task 3 implementation guidance: writer scopes operations to `adev.mdc` only; pre-existing siblings in `.cursor/rules/` are untouched. Captured as an acceptance check in Task 4 tests (negative-space test: writer must not delete or modify a fixture sibling file placed before sync runs).
- **SEC-1 (User Additions trust boundary).** Captured as a one-line note in Task 1 (SKILL.md rewrite) clarifying that User Additions are trusted as user-authored content reviewed at edit time, matching the established CLAUDE.md/AGENTS.md trust model. No new attack surface; documentation-only.
- **CON-1 (charter word-count framing).** Task 6 (charter Capability Map update) includes a co-located edit to charter Quality Attributes line 132: tighten "under 200 words" to "body under 200 words (frontmatter excluded)" so charter and spec use identical wording.
- **CON-2 (Capability Map terminology).** Task 6 also renames Capability Map row 87 wording to name the pointer-rule design choice (e.g., "writes alwaysApply pointer rule when `cursor` is a sync target").
- **CON-3 (setup-charter edit not in acceptance criteria).** Task 5 is retained as a discrete plan task even though spec acceptance criteria do not explicitly list it; Task 5's commit closes the consistency gap by acting on the spec's Task Map row 5 directive.

---

## File Structure

**Create:**
- `tests/sync/cursor-format.test.mjs` — End-to-end behavior tests for the cursor sync-target writer (happy path, frontmatter shape, body-word count, User Additions preservation, Learned Lessons re-placement, oversize-body fail-loud, dry-run no-write, sibling-file non-interference).

**Modify:**
- `skills/sync/SKILL.md:10-18` — Provider Detection list: replace `Cursor: .cursorrules` with `Cursor: .cursor/rules/adev.mdc`.
- `skills/sync/SKILL.md:84-86` — Cursor format section: replace the legacy `.cursorrules` "Full constitution content" description with the pointer-projection contract (YAML frontmatter `description` + `alwaysApply: true`, body ≤ 200 words, points to `.context-index/constitution.md`, User Additions preserved, atomic temp+rename, sibling-file non-interference, User Additions trust-boundary note).
- `skills/sync/SKILL.md:100-102` — Learned Lessons placement bullet: change cursor's placement rule from "append at the end of the file" (the legacy `.cursorrules` behavior) to "immediately before `# User Additions`" (matching CLAUDE.md/AGENTS.md).
- `cli/index.mjs:465-470` — Manifest scaffold stub: uncomment the three lines for the cursor sync target; change `path: .cursorrules` → `path: .cursor/rules/adev.mdc`; keep `format: cursor`; keep `providers: [cursor]`.
- `.context-index/specs/features/cursor-provider/charter.md:87` — Capability Map row "`.cursor/rules/adev.mdc` sync output": optional terminology tightening to name the pointer-rule design choice (CON-2). Status transition from `review-passed` → `validated` happens automatically when `/adev:validate` passes (not in this plan's scope).
- `.context-index/specs/features/cursor-provider/charter.md:132` — Quality Attributes "Sync output discipline" row: tighten "under 200 words" to "body under 200 words (frontmatter excluded)" (CON-1).
- `.context-index/specs/features/setup/charter.md:23` — Key Behaviors bullet: verify the cursor format is described as fully modeled in the sync-target list, per spec Task Map row 5 (CON-3 follow-through). No change required if the line already lists cursor without a half-modeled annotation; verify and confirm during Task 5.

**Reference (read, do not modify):**
- `skills/sync/SKILL.md:29-79` — Existing claude/agents writer sections; the pointer-projection contract for cursor mirrors their frontmatter+body+User Additions shape (sans full constitution content).
- `skills/sync/SKILL.md:104-108` — User Additions preservation protocol; cursor reuses this verbatim.
- `.context-index/specs/features/cursor-provider/sync-target-output.spec.md` — full spec; Output Contract steps 1–8 define the writer behavior.
- `.context-index/specs/features/cursor-provider/charter.md` — Capability Map row 87 + Quality Attributes line 132 are the load-bearing charter rows.
- `.context-index/constitution.md` — Principle 2 (Skills primarily markdown), Principle 5 (Version parity — disclaimed), `~/.claude/` anti-pattern (disclaimed inversely).
- `cli/index.mjs:454-487` — `configureSyncTargets` function; understand the surrounding manifest-template substitution so the uncomment edit lands in the right place.
- `tests/cursor-hooks-sync.test.mjs` — Sibling sync test; pattern for fixture setup + `createTempDir`/`writeFixture` usage. Do NOT mirror its exact assertions (different format).
- `tests/helpers.mjs` — `createTempDir()`, `cleanupTempDir()`, `writeFixture()` for the new test file.

---

## Context Packets

### Task 1 Context (Rewrite `skills/sync/SKILL.md` cursor-format section)
- Spec: `.context-index/specs/features/cursor-provider/sync-target-output.spec.md` (Output Contract steps 1–8 and Failure Modes rows 1–7; Acceptance Criterion 1)
- Charter: `.context-index/specs/features/cursor-provider/charter.md` (capability: `.cursor/rules/adev.mdc sync output`; Quality Attributes row "Sync output discipline" line 132)
- Source files:
  - `skills/sync/SKILL.md` — full read; lines 10–18 (Provider Detection), lines 29–79 (claude/agents writer shapes — pattern to mirror), lines 84–86 (legacy cursor section — what to replace), lines 87–102 (Learned Lessons placement — cursor's bullet at line 101 needs the placement-rule change), lines 104–108 (User Additions preservation — applies verbatim to cursor).
  - `.context-index/constitution.md` — Identity sentence (line 8) for the pointer body's project-identity sentence; Non-Negotiable Principles section heading (the source of "non-negotiable principles exist in the constitution" pointer language).
- Sample: none — sibling claude/agents writer sections in the same SKILL.md ARE the pattern.
- Boundary rules: none configured.
- SEC-1 note to include: one-line trust-boundary statement on User Additions.

### Task 2 Context (Activate manifest scaffold stub in `cli/index.mjs`)
- Spec: `.context-index/specs/features/cursor-provider/sync-target-output.spec.md` (Output Contract paragraph "The scaffold stub at `cli/index.mjs:465-467` ... MUST be activated"; Acceptance Criterion 2)
- Source files:
  - `cli/index.mjs:454-487` — `configureSyncTargets` function. The substitution at lines 455-475 builds the manifest fragment via `replace`; the cursor block is the commented `# - path: .cursorrules / # format: cursor / # providers: [cursor]` at lines 467-470 (NB: the spec quotes "465-467" but the actual block lives at 467-470 in the current file — same lines, off-by-two due to surrounding edits since the spec was authored).
- Constitution: Principle 1 (no new deps), Principle 3 (ESM).
- One-line scope: three lines uncommented; `.cursorrules` literal replaced with `.cursor/rules/adev.mdc`. No semantics in `cli/index.mjs` beyond the template substitution change.

### Task 3 Context (Implement the cursor writer behavior in the sync skill)
- Spec: `.context-index/specs/features/cursor-provider/sync-target-output.spec.md` (Output Contract steps 1–8 — esp. step 3 file composition, step 4 pointer-body content, step 5 frontmatter constraints, step 7 Learned Lessons placement, step 8 atomic write; Failure Modes rows on permission-denied, body oversize, malformed frontmatter, missing User Additions marker, dry-run, atomic rename failure)
- Source files:
  - `skills/sync/SKILL.md` — full read (Task 1's edits land here; this task's writer behavior is described in the same Cursor format section).
  - `.context-index/constitution.md` — needed at test/runtime to compose the body's pointer text (project identity sentence + the relative path string).
- Constitution: Principle 2 (skills primarily markdown — the writer is described in markdown plus optional companion helpers; if any companion code is needed it goes in `lib/` and stays optional); Principle 1 (Node built-ins only); no hardcoded `~/.cursor/` literals.
- Test pattern: `tests/cursor-hooks-sync.test.mjs` setup style. SA-1 note: include the sibling-file non-interference assertion in the writer's described behavior (Output Contract step 2 already says "this writer owns exactly one file" — make that explicit in the SKILL.md prose).

### Task 4 Context (Tests — `tests/sync/cursor-format.test.mjs`)
- Spec: `.context-index/specs/features/cursor-provider/sync-target-output.spec.md` (Acceptance Criteria 3–7 — full Output Contract + dry-run + oversize-body + User Additions preservation)
- Source files:
  - `tests/cursor-hooks-sync.test.mjs` — sibling sync test; setup style + temp-dir conventions.
  - `tests/helpers.mjs` — `createTempDir()`, `cleanupTempDir()`, `writeFixture()`.
  - `skills/sync/SKILL.md` — after Task 1+3 edits land; the test exercises the contract this defines.
  - `.context-index/specs/features/cursor-provider/sync-target-output.spec.md` Failure Modes table — drives the seven sub-test cases.
- Cross-cutting: none.
- Note: this is the first test under `tests/sync/`; the directory does not yet exist. Test runner picks up nested test files automatically via `node --test`.

### Task 5 Context (Update setup charter sync-target list — verify "fully modeled")
- Spec: `.context-index/specs/features/cursor-provider/sync-target-output.spec.md` (Actionable Task Map row 5; CON-3 calls out that the edit is not in Acceptance Criteria — this plan retains it as a discrete task to close the consistency gap)
- Source files:
  - `.context-index/specs/features/setup/charter.md` — line 23 "Key Behaviors" bullet currently reads `'/adev:sync reads the manifest for sync targets and generates format-specific output (claude, agents, copilot, cursor)'`. Cursor is already listed without a "half-modeled" annotation. The task is a verification + commit-message footer, not a substantive edit, unless the charter contains a half-modeled note elsewhere worth removing.
- Constitution: none specific.

### Task 6 Context (Update cursor-provider charter — CON-1 + CON-2 tightening)
- Spec: `.context-index/specs/features/cursor-provider/sync-target-output.spec.md` (Acceptance Criterion 9: Capability Map row transition — handled by `/adev:validate`; CON-1 and CON-2 from the review notes drive in-plan charter edits)
- Source files:
  - `.context-index/specs/features/cursor-provider/charter.md:87` — Capability Map row for `.cursor/rules/adev.mdc sync output`.
  - `.context-index/specs/features/cursor-provider/charter.md:132` — Quality Attributes "Sync output discipline" row.
- Constitution: none specific.

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observations

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns). Every output token persists as a cache read on all subsequent turns, creating multiplicative amplification.
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost; cache reads at 0.1x pricing dominate due to volume (98% of all tokens processed).
- **Evidence:** 1 observations

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete — the summarization instruction affects echo volume, not reasoning.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts. The model reasons the same way regardless of how much it echoes back. A/B eval showed 12/12 rubric parity with 36% cost savings.
- **Evidence:** 1 observations

---

## Parallelization

- Group A (sequential): Task 1 (SKILL.md cursor section + Learned Lessons placement + SEC-1 note) → Task 3 (writer behavior, layered on top of Task 1's section) → Task 4 (tests, exercise Task 1+3 contract)
- Group B (independent): Task 2 (cli/index.mjs scaffold stub uncomment) — no overlap with SKILL.md or the test file.
- Group C (independent): Task 5 (setup charter verification) — independent docs touch.
- Group D (independent): Task 6 (cursor-provider charter CON-1/CON-2 wording) — independent docs touch.

Groups B, C, and D can run in parallel with Group A. Within Group A, tasks are strictly sequential.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Rewrite `skills/sync/SKILL.md` cursor-format section | medium | unit | — | 0 create, 1 modify |
| 2 | Activate cursor scaffold stub in `cli/index.mjs` | small | unit | — | 0 create, 1 modify |
| 3 | Document cursor writer behavior (pointer-projection contract) | medium | unit | Task 1 | 0 create, 1 modify |
| 4 | Tests — `tests/sync/cursor-format.test.mjs` | large | unit | Task 1, Task 3 | 1 create, 0 modify |
| 5 | Verify setup charter sync-target list (CON-3 follow-through) | small | unit | — | 0 create, 1 modify (verification) |
| 6 | Update cursor-provider charter (CON-1 + CON-2 wording) | small | unit | — | 0 create, 1 modify |

---

## Task Structure

### Task 1: Rewrite `skills/sync/SKILL.md` cursor-format section [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Spec prescribes 8 output-contract steps and Failure Modes table; sibling claude/agents writer sections in the same SKILL.md provide a direct pattern; single-file edit, no boundary crossings.

**Charter capability:** `.cursor/rules/adev.mdc sync output` (cursor-provider charter line 87)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/sync/SKILL.md:10-18` (Provider Detection bullet for Cursor), `skills/sync/SKILL.md:84-86` (Cursor format section), `skills/sync/SKILL.md:100-102` (Learned Lessons placement rule for cursor).
- Test: `tests/sync/cursor-format.test.mjs` (created by Task 4).

**Tests:** `tests/sync/cursor-format.test.mjs` — Task 4 creates this and exercises the SKILL.md contract end-to-end. No new test file is created in this task; the existing `tests/skills-no-inline-node.test.mjs` continues to lint SKILL.md against the inline-Node anti-pattern.

**Context to load:**
- `.context-index/specs/features/cursor-provider/sync-target-output.spec.md` (Output Contract steps 1–8, Failure Modes table)
- `skills/sync/SKILL.md` (full read; pattern from claude/agents sections at lines 29-79)
- `.context-index/constitution.md` (Identity sentence at line 8; Non-Negotiable Principles section heading for pointer-body wording)
- `.context-index/specs/features/cursor-provider/charter.md` (Capability Map row line 87; Quality Attributes line 132)

- [ ] **Write failing test**

The test for this task is created in Task 4. For TDD ordering, Task 4 begins by writing a happy-path test that asserts the writer produces a file at `.cursor/rules/adev.mdc` whose frontmatter contains `description: <string>` and `alwaysApply: true`. Until SKILL.md describes the contract, the test cannot pass (the writer is not yet dispatched on `format: cursor` with the new path semantics). For an isolated Task 1 quick-check, append a one-line assertion to `tests/skills-no-inline-node.test.mjs` ONLY if needed — typically not.

Verification while authoring Task 1: re-read the rewritten section against Output Contract steps 1–8 to confirm the eight behaviors are each explicitly described. The acceptance test is Task 4.

- [ ] **Verify test fails**

Run: `npm test -- --test-name-pattern "cursor sync target"`
Expected: FAIL — Task 4's tests do not yet exist; if Task 4 has not been started, this step is skipped for Task 1.

- [ ] **Implement**

Edit `skills/sync/SKILL.md`:

1. Provider Detection bullet (line 15): replace `Cursor: .cursorrules` with `Cursor: .cursor/rules/adev.mdc`.
2. Cursor format section (lines 84–86): replace the legacy two-line description with a full pointer-projection contract:
   - Output path: `.cursor/rules/adev.mdc` (manifest `path:` override allowed; default per scaffold).
   - File composition:
     - YAML frontmatter: `description: <single-line summary derived from constitution's first H2 or the project identity sentence>` and `alwaysApply: true` (literal boolean).
     - Body: ≤ 200 words (whitespace-delimited tokens between the frontmatter `---` close and the `# User Additions` marker or EOF). Body MUST NOT duplicate the constitution; it points to `.context-index/constitution.md` (project identity sentence; one-line note that non-negotiable principles exist in the constitution; relative path to constitution; short pointer to `CLAUDE.md` and `AGENTS.md` for sibling agent-file projections).
   - Atomic write: `.tmp` sibling + rename, matching the claude/agents writers.
   - Sibling-file non-interference (SA-1): the writer owns exactly one file under `.cursor/rules/`; pre-existing siblings are untouched.
   - User Additions preservation (step 4 of SKILL.md applies verbatim).
   - SEC-1 trust-boundary note: "User Additions are trusted as user-authored content reviewed at edit time, not sync time. This matches the established CLAUDE.md/AGENTS.md trust model and is not a new attack surface introduced by this format."
   - Body-oversize error: writer throws `CURSOR_BODY_OVERSIZE` when the body word count exceeds 200; the `.tmp` file is removed before the throw; no `.cursor/rules/adev.mdc` is written.
   - Dry-run: print proposed content (frontmatter + body) without writing; matches `/adev:sync --dry-run`.
3. Learned Lessons placement (line 101): change cursor's bullet from "append at the end of the file" to "immediately before `# User Additions` marker" (matching CLAUDE.md/AGENTS.md placement).

- [ ] **Verify test passes**

Run: `npm test -- --test-name-pattern "skills-no-inline-node"` (sanity that the edits don't introduce inline Node).
Expected: PASS.

- [ ] **Commit**

Branch (already created): `feat/cursor-provider/cursor-adapter` (current branch).

```bash
git add skills/sync/SKILL.md
git commit -m "feat(setup): describe cursor sync-target pointer projection in /adev:sync

Replace the legacy .cursorrules full-content writer description with the
.cursor/rules/adev.mdc pointer-projection contract: YAML frontmatter
(description, alwaysApply: true), body <= 200 words, User Additions
preserved, atomic temp+rename, sibling-file non-interference. Move the
Learned Lessons placement rule for cursor from EOF to 'immediately before
# User Additions' to match CLAUDE.md/AGENTS.md.

Spec: .context-index/specs/features/cursor-provider/sync-target-output.spec.md
Plan-task: 1"
```

---

### Task 2: Activate cursor scaffold stub in `cli/index.mjs` [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Mechanical three-line uncomment plus literal path replacement; spec quotes the exact lines; pattern matches the adjacent active sync-target entries in the same template; minimal blast radius.

**Charter capability:** `.cursor/rules/adev.mdc sync output` (cursor-provider charter line 87)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `cli/index.mjs:465-470` (configureSyncTargets manifest-template substitution; the commented cursor block).
- Test: existing `tests/cli.test.mjs` coverage of `configureSyncTargets` (if present); otherwise verify by hand that `/adev:init` writes the expected manifest block.

**Tests:** `tests/cli.test.mjs` — locate or add a small assertion that the manifest fragment emitted by `configureSyncTargets` includes an uncommented `- path: .cursor/rules/adev.mdc` / `format: cursor` / `providers: [cursor]` entry. If no existing test covers this dual-setup branch, a one-block addition is acceptable; otherwise rely on Task 4's end-to-end test which exercises a manifest with the cursor target present.

**Context to load:**
- `.context-index/specs/features/cursor-provider/sync-target-output.spec.md` (Output Contract scaffold-stub paragraph; Acceptance Criterion 2)
- `cli/index.mjs:454-487` (configureSyncTargets function)

- [ ] **Write failing test**

Append to `tests/cli.test.mjs` (or create a focused test) — a test that calls `configureSyncTargets` against a temp dir with no existing manifest and asserts the written manifest contains the `format: cursor` block uncommented with `path: .cursor/rules/adev.mdc`.

```js
test("configureSyncTargets emits an active cursor target with .cursor/rules/adev.mdc path", async () => {
  const dir = createTempDir();
  // simulate dual-setup invocation; assert manifest.yaml contains:
  //   - path: .cursor/rules/adev.mdc
  //     format: cursor
  //     providers: [cursor]
  // and that no '# - path: .cursorrules' line remains.
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli.test.mjs`
Expected: FAIL — the current scaffold still emits `# - path: .cursorrules` (commented) and no active cursor block.

- [ ] **Implement**

Edit `cli/index.mjs` (currently lines 467–470 contain the commented `# - path: .cursorrules` block):

- Remove the leading `# ` on three lines.
- Change `path: .cursorrules` to `path: .cursor/rules/adev.mdc`.
- Keep `format: cursor` and `providers: [cursor]` as-is.

Result fragment:

```yaml
    # Cursor
    - path: .cursor/rules/adev.mdc
      format: cursor
      providers: [cursor]
```

- [ ] **Verify test passes**

Run: `node --test tests/cli.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add cli/index.mjs tests/cli.test.mjs
git commit -m "feat(cli): activate cursor sync-target scaffold in configureSyncTargets

Uncomment the cursor block in the manifest template substitution and
change the path from .cursorrules to .cursor/rules/adev.mdc. The
generated manifest now includes the cursor format by default in the
dual-setup branch.

Spec: .context-index/specs/features/cursor-provider/sync-target-output.spec.md
Plan-task: 2"
```

---

### Task 3: Document cursor writer behavior (pointer-projection contract) [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Spec defines composition algorithm, description-derivation order, atomic write, and oversize fail-loud explicitly; mirrors sibling claude/agents writer sections; single-file edit; minor synthesis to phrase the body-composition algorithm in prose.

**Charter capability:** `.cursor/rules/adev.mdc sync output` (cursor-provider charter line 87)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `skills/sync/SKILL.md` (additional clarifications inside the cursor section authored by Task 1; describes the body-composition algorithm in enough detail that the writer is reproducible by an implementer without inventing rules).
- Test: `tests/sync/cursor-format.test.mjs` (created in Task 4).

**Tests:** `tests/sync/cursor-format.test.mjs` — Task 4 exercises this contract.

**Context to load:**
- `.context-index/specs/features/cursor-provider/sync-target-output.spec.md` (Output Contract steps 3, 4, 5, 6, 7, 8 in detail; Failure Modes "Composed body exceeds 200 words" row)
- `skills/sync/SKILL.md` (post-Task-1; cursor format section)
- `.context-index/constitution.md` (Identity sentence; the constitution's first H2 — for the `description` derivation rule)

- [ ] **Write failing test**

Driven by Task 4 (see that task). For local verification while authoring this task, hand-walk the rewritten SKILL.md cursor section against each of Output Contract steps 1–8 and confirm each behavior has a corresponding bullet in the SKILL.md prose.

- [ ] **Verify test fails**

Run: `node --test tests/sync/cursor-format.test.mjs` (after Task 4 creates the file)
Expected: FAIL — only happy-path or oversize-body fixtures fail at this point; the contract is not fully documented until this task.

- [ ] **Implement**

Extend the cursor format section authored in Task 1 with the body-composition algorithm:

1. `description` derivation: trim, single-line, ≤ 200 characters. Source order: (a) first H2 of `.context-index/constitution.md` (heading text without the `##` prefix); (b) fallback to the constitution's "Identity" sentence (line 8 in the canonical template); (c) hard-fall back to the project name from `manifest.yaml :: project.name` if neither is parseable. Embedded newlines MUST be stripped; the final value MUST fit on one YAML line.
2. `alwaysApply` value: the literal boolean `true` (not the string `"true"`).
3. Body composition:
   - Line 1: project identity sentence (one line).
   - Line 2 (blank).
   - Line 3: pointer paragraph — "Non-negotiable principles, coding standards, and architecture boundaries live in `.context-index/constitution.md` — see that file for the source of truth."
   - Line 4 (blank).
   - Line 5: sibling pointer — "Companion projections: `CLAUDE.md` (Claude Code), `AGENTS.md` (OpenCode/Codex)."
   - Word count: sum of whitespace-delimited tokens between the frontmatter `---` close and the `# User Additions` marker (or EOF when the marker is absent on first write). Comments, blank lines, and the `# User Additions` heading itself are excluded.
4. Atomic write: write the composed content to `.cursor/rules/adev.mdc.tmp`, then rename to `.cursor/rules/adev.mdc`. On any thrown error before the rename, unlink the `.tmp` file before re-raising.
5. Body oversize: count words pre-rename. If > 200, unlink the `.tmp` and throw `CURSOR_BODY_OVERSIZE` carrying the actual count.
6. Sibling-file non-interference (SA-1): the writer reads only `.cursor/rules/adev.mdc` (and its `.tmp` sibling) and writes only those two paths. Any other file under `.cursor/rules/` is untouched.

- [ ] **Verify test passes**

Run: `node --test tests/sync/cursor-format.test.mjs` (after Task 4)
Expected: PASS.

- [ ] **Commit**

```bash
git add skills/sync/SKILL.md
git commit -m "feat(setup): document cursor writer body composition + oversize fail-loud

Add the body-composition algorithm, description derivation order, atomic
write protocol, and CURSOR_BODY_OVERSIZE behavior to the cursor format
section. Together with Task 1, this defines the writer reproducibly.

Spec: .context-index/specs/features/cursor-provider/sync-target-output.spec.md
Plan-task: 3"
```

---

### Task 4: Tests — `tests/sync/cursor-format.test.mjs` [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=3
**Rationale:** Spec enumerates all 7 sub-cases; tests/cursor-hooks-sync.test.mjs provides the fixture-setup pattern but no curated golden sample for sync-format tests; first test under tests/sync/ requires CLI-driver vs helper-import choice; single new file in a new subdirectory.

**Charter capability:** `.cursor/rules/adev.mdc sync output` (cursor-provider charter line 87)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 3
**Files:**
- Create: `tests/sync/cursor-format.test.mjs`.
- Test: this is the test file.

**Tests:** `tests/sync/cursor-format.test.mjs` — created by this task.

**Context to load:**
- `.context-index/specs/features/cursor-provider/sync-target-output.spec.md` (Acceptance Criteria 3–7; Failure Modes table for the seven sub-cases)
- `tests/cursor-hooks-sync.test.mjs` (sibling sync test; temp-dir fixture style)
- `tests/helpers.mjs` (createTempDir, cleanupTempDir, writeFixture)
- `skills/sync/SKILL.md` (post-Task-1 + post-Task-3; contract under test)

- [ ] **Write failing test**

Create `tests/sync/cursor-format.test.mjs` with seven describe blocks (one per Failure Modes row / Acceptance Criterion):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

// Each test sets up a temp project root with a fixture constitution
// and a manifest containing `- path: .cursor/rules/adev.mdc / format: cursor`.
// The runSync helper invokes /adev:sync against the temp dir (CLI-driver
// pattern — call through `adev sync` or the underlying lib helper if one
// exists). After Task 1+3 land, the writer behavior is fully specified
// in SKILL.md; until then these tests should FAIL.

test("happy path — writes valid .cursor/rules/adev.mdc from fixture constitution", async (t) => {
  // (a) Generates the file at the expected path
  // (b) Frontmatter parses; has exactly `description` (string) and `alwaysApply: true` (boolean)
  // (c) Body word count <= 200
  // (d) File begins with `---\n` and contains the `# User Additions` marker
});

test("re-sync preserves User Additions byte-for-byte", async (t) => {
  // Seed an existing .cursor/rules/adev.mdc with a `# User Additions` block
  // containing fixture content (incl. unicode + trailing whitespace).
  // Re-run sync. Assert byte-for-byte preservation below the marker.
});

test("re-sync replaces existing Learned Lessons block in the correct position", async (t) => {
  // Seed file with a stale `## Learned Lessons` block at EOF (legacy placement).
  // Re-run sync with high-confidence heuristics present.
  // Assert the new `## Learned Lessons` block sits immediately before `# User Additions`,
  // and the EOF stale block is gone.
});

test("oversized body throws CURSOR_BODY_OVERSIZE and writes no file", async (t) => {
  // Use a fixture constitution whose first H2 + project identity sentence
  // forces body > 200 words. Assert the writer throws `CURSOR_BODY_OVERSIZE`,
  // the .tmp file is removed, and .cursor/rules/adev.mdc is NOT created.
});

test("--dry-run does not write .cursor/rules/adev.mdc", async (t) => {
  // Run sync --dry-run. Assert no file is written; stdout contains the proposed content.
});

test("frontmatter shape — alwaysApply is the literal boolean true (not string)", async (t) => {
  // Parse the YAML frontmatter and assert typeof alwaysApply === 'boolean' && alwaysApply === true.
  // Assert description.length <= 200 && !description.includes("\n").
});

test("sibling files in .cursor/rules/ are untouched (SA-1)", async (t) => {
  // Seed .cursor/rules/other.mdc with fixture content before sync.
  // Run sync. Assert other.mdc is byte-for-byte unchanged.
});
```

- [ ] **Verify test fails**

Run: `node --test tests/sync/cursor-format.test.mjs`
Expected: FAIL — until Tasks 1 + 2 + 3 land, the writer either runs the legacy `.cursorrules` path or is not dispatched at all.

- [ ] **Implement**

Replace the test stubs above with full assertions against the post-implementation behavior. Wire each test's setup to use `createTempDir()` from `tests/helpers.mjs`, seed a fixture constitution under `<tempDir>/.context-index/constitution.md`, and either:
- (a) Invoke the CLI driver directly: `execFileSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), 'sync', '--cwd', tempDir])` — if `adev sync` is wired through `cli/index.mjs`; OR
- (b) Import and invoke the writer helper directly if one exists post-implementation in `lib/sync/cursor-writer.mjs` (created by /adev:implement if it chooses the helper-extraction path).

Use the same fixture pattern as `tests/cursor-hooks-sync.test.mjs` for consistency. Add a `t.after(() => cleanupTempDir(dir))` to each test.

- [ ] **Verify test passes**

Run: `node --test tests/sync/cursor-format.test.mjs`
Expected: PASS (all 7 tests).

Run: `npm test`
Expected: PASS — full suite green.

- [ ] **Commit**

```bash
git add tests/sync/cursor-format.test.mjs
git commit -m "test(sync): cover cursor sync-target writer end-to-end

Seven tests covering: happy path + frontmatter shape, User Additions
preservation, Learned Lessons re-placement, oversize-body fail-loud,
--dry-run no-write, sibling-file non-interference (SA-1).

Spec: .context-index/specs/features/cursor-provider/sync-target-output.spec.md
Plan-task: 4"
```

---

### Task 5: Verify setup charter sync-target list (CON-3 follow-through) [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=4 pattern=5 blast=5 novelty=5
**Rationale:** Verification task on a single bullet at a known line; explicit no-op-or-tiny-edit instruction with a defined commit fallback; documentation-only, single file, mechanical.

**Charter capability:** `.cursor/rules/adev.mdc sync output` (cursor-provider charter line 87)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/specs/features/setup/charter.md:23` (verification + optional half-modeled annotation removal if present).
- Test: none — documentation-only.

**Tests:** none (documentation task).

**Context to load:**
- `.context-index/specs/features/cursor-provider/sync-target-output.spec.md` (Actionable Task Map row 5)
- `.context-index/specs/features/setup/charter.md` (Key Behaviors section)

- [ ] **Write failing test**

n/a — verification task.

- [ ] **Verify test fails**

n/a.

- [ ] **Implement**

Read `.context-index/specs/features/setup/charter.md` line 23. Confirm the bullet reads `'/adev:sync reads the manifest for sync targets and generates format-specific output (claude, agents, copilot, cursor)'` without any "half-modeled" qualifier. If a half-modeled note is present anywhere in the setup charter referring to the cursor format, remove it. Otherwise, mark this task COMPLETED with a NO-OP note in the commit.

- [ ] **Verify test passes**

n/a.

- [ ] **Commit**

If an edit was made:

```bash
git add .context-index/specs/features/setup/charter.md
git commit -m "docs(setup): drop half-modeled annotation for cursor sync format

The cursor format is fully modeled by spec E; setup charter sync-target
list no longer needs the half-modeled qualifier.

Spec: .context-index/specs/features/cursor-provider/sync-target-output.spec.md
Plan-task: 5"
```

If no edit was needed, record the verification in the commit chain via Task 6 or skip the commit (the lifecycle log captures the plan_task event).

---

### Task 6: Update cursor-provider charter (CON-1 + CON-2 wording) [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Two line-specific wording substitutions prescribed verbatim by the plan, plus a revision bump; doc-only edit; single file; zero design choices required.

**Charter capability:** `.cursor/rules/adev.mdc sync output` (cursor-provider charter line 87) + Quality Attributes "Sync output discipline" (line 132)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/specs/features/cursor-provider/charter.md:87` (Capability Map row terminology — CON-2), `.context-index/specs/features/cursor-provider/charter.md:132` (Quality Attributes wording — CON-1).
- Test: none — documentation-only.

**Tests:** none (documentation task).

**Context to load:**
- `.context-index/specs/features/cursor-provider/sync-target-output.review.md` (CON-1 and CON-2 review notes)
- `.context-index/specs/features/cursor-provider/charter.md` (current Capability Map and Quality Attributes rows)

- [ ] **Write failing test**

n/a — documentation task.

- [ ] **Verify test fails**

n/a.

- [ ] **Implement**

Edit `.context-index/specs/features/cursor-provider/charter.md`:

1. Line 87 (Capability Map row): rename `'/adev:sync writes alwaysApply rule when cursor is a sync target'` to `'/adev:sync writes alwaysApply pointer rule when cursor is a sync target'`. This names the pointer-rule design choice (CON-2).
2. Line 132 (Quality Attributes "Sync output discipline" row): change `'`.cursor/rules/adev.mdc` under 200 words; functions as a pointer to `.context-index/constitution.md`, not a duplicate of it'` to `'`.cursor/rules/adev.mdc` body under 200 words (frontmatter excluded); functions as a pointer to `.context-index/constitution.md`, not a duplicate of it'`. This aligns the charter wording with the spec's precise word-count framing (CON-1).
3. Bump `revision: 2` → `revision: 3` in frontmatter and update `updated:` to the commit date.

- [ ] **Verify test passes**

n/a.

- [ ] **Commit**

```bash
git add .context-index/specs/features/cursor-provider/charter.md
git commit -m "docs(cursor-provider): tighten Capability Map + Quality Attributes wording

Address CON-1 and CON-2 from sync-target-output.review.md: rename the
Capability Map row to name the pointer-rule design choice and tighten
'under 200 words' to 'body under 200 words (frontmatter excluded)' so
the charter and Spec E use identical wording.

Spec: .context-index/specs/features/cursor-provider/sync-target-output.spec.md
Plan-task: 6"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied:
  - skills/sync/SKILL.md cursor-format section describes `.cursor/rules/adev.mdc` with YAML frontmatter (`description`, `alwaysApply: true`), ≤ 200-word pointer body, sibling-file non-interference, User Additions trust-boundary note, Learned Lessons placement matches CLAUDE.md/AGENTS.md.
  - cli/index.mjs:465-470 scaffold stub is uncommented with `path: .cursor/rules/adev.mdc`.
  - `/adev:sync` writes `.cursor/rules/adev.mdc` end-to-end when `manifest.yaml :: sync.targets` includes `format: cursor`.
  - Re-running `/adev:sync` preserves User Additions byte-for-byte.
  - Oversized body raises `CURSOR_BODY_OVERSIZE`; no `.tmp` left behind.
  - `/adev:sync --dry-run` prints proposed content and does NOT write.
  - `tests/sync/cursor-format.test.mjs` covers all of the above.
  - No new external dependencies; pure ESM; no `~/.cursor/` literals.
  - Charter Capability Map row transitions `review-passed` → `validated` after `/adev:validate` passes.

The `governance/gates.yaml` file is not present in this repo per `lib/governance/`. Constitution Quality Gate `npm test` is the binding command.
