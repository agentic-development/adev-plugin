<!-- partial_schema: plan@1 -->

# Implementation Plan: `adev skill-ext load` — Skill Extension Verb

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cli/charter.md
> **Spec:** .context-index/specs/features/cli/skill-ext-load.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-25)
> **Platform:** Node.js (ESM), zero external dependencies, node:test

**Goal:** Add a `skill-ext` verb to the adev CLI that reads project- and extension-layer markdown files from `.context-index/skill-extensions/` and outputs concatenated content (or `__NONE__`) to stdout, enabling skills to load project-specific and domain-extension instructions without modifying the plugin.

**Architecture:** The verb follows the established `lib/cli/<verb>.mjs` pattern — a new `lib/cli/skill-ext.mjs` module exports `run({ projectRoot, argv, manifest })` and `help()` without exporting `LIFECYCLE_STEP` (it is a query primitive, not a lifecycle-bound step). Extension layers `_<ext-name>/` are read in lexicographic order before the project-level file, concatenated with a blank-line separator when both are present. Path-containment is enforced via a `[a-zA-Z0-9_-]+` regex on the `--skill` argument (no slashes, dots, or traversal sequences), plus an `fs.realpath`-based check on each resolved file path to guard against symlink escapes (SEC-1 from review). A template gitkeep scaffold ensures `/adev:init` creates `.context-index/skill-extensions/` in new projects.

---

## Review Notes (PASS_WITH_NOTES)

The following reviewer notes from the architecture review are acknowledged and addressed in this plan:

- **SA-1** (suggestion): Blank-line separator byte sequence underspecified. This plan specifies the separator as a single `\n` after the last byte of the preceding content chunk followed by another `\n` before the first byte of the next chunk — equivalent to a blank line in the concatenated output. Addressed in Task 1 implementation guidance.
- **SEC-1** (warning): Symlink escape via extension directory not addressed in spec. This plan adds explicit `fs.realpath`-based containment in Task 1, verifying that each resolved file path stays under the `.context-index/skill-extensions/` directory. Addressed in Task 1 and covered by a dedicated test case in Task 3.
- **CON-1** (suggestion): `lib/cli/skill-ext.mjs` must NOT export `LIFECYCLE_STEP`. This plan explicitly includes a test asserting `LIFECYCLE_STEP === undefined`. Addressed in Task 3.

---

## File Structure

**Create:**
- `lib/cli/skill-ext.mjs` — `run()` + `help()` for the `skill-ext` verb; reads extension and project layers, applies containment checks, outputs concatenated content or `__NONE__`
- `tests/cli/skill-ext.test.mjs` — Unit tests covering all spec behaviors, error cases, and acceptance criteria
- `templates/skill-extensions/.gitkeep` — Scaffold for `/adev:init` to create `.context-index/skill-extensions/` in new projects

**Modify:**
- `cli/index.mjs:1600-1604` — Add `['skill-ext', () => import('../lib/cli/skill-ext.mjs')]` to `VERB_REGISTRY`
- `skills/implement/SKILL.md:43-55` — Add a "Load Skill Extensions" sub-step in Step 1 (Load Context) that calls `adev skill-ext load --skill implement`
- `.gitignore` — Add `.context-index/skill-extensions/_*/` (extension-managed, not committed)

**Reference (read, do not modify):**
- `lib/cli/gate.mjs` — Follow this module's structure (exports `run`, `help`, no `LIFECYCLE_STEP`)
- `tests/cli/gate.test.mjs` — Follow this test file's pattern for CLI subprocess tests
- `skills/plan/SKILL.md` — Reference for how existing skills call `adev context load` and incorporate output

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/cli/skill-ext-load.spec.md` (Behaviors 1-10, Error Cases, Acceptance Criteria)
- Charter: `.context-index/specs/features/cli/charter.md` (capability: `skill-ext load --skill <name>`)
- Source files: `lib/cli/gate.mjs` (full read — primary pattern reference for query primitive verb)
- Source files: `lib/cli/heuristics.mjs` (signatures — shows how `--skill` arg is validated in similar verbs)
- Constitution: Non-Negotiable Principles 1 (no new deps), 3 (ESM), 4 (exit codes)
- Review notes: SEC-1 (symlink escape), SA-1 (separator), CON-1 (no LIFECYCLE_STEP)

### Task 2 Context
- Spec: `.context-index/specs/features/cli/skill-ext-load.spec.md` (Acceptance Criterion: verb registered, `adev skill-ext --help`)
- Charter: `.context-index/specs/features/cli/charter.md` (Verb Registry section)
- Source files: `cli/index.mjs:1552-1605` (VERB_REGISTRY — existing registration patterns)

### Task 3 Context
- Spec: `.context-index/specs/features/cli/skill-ext-load.spec.md` (all Acceptance Criteria, all Behaviors, all Error Cases)
- Charter: `.context-index/specs/features/cli/charter.md` (contract: `run` + `help` + optional `LIFECYCLE_STEP`)
- Source files: `tests/cli/gate.test.mjs` (full read — primary test pattern reference)
- Source files: `lib/cli/skill-ext.mjs` (from Task 1 — implementation under test)
- Review notes: SEC-1 (symlink escape test), CON-1 (LIFECYCLE_STEP === undefined test)

### Task 4 Context
- Spec: `.context-index/specs/features/cli/skill-ext-load.spec.md` (Acceptance Criterion: `.gitignore` includes `_*/`, template scaffold)
- Source files: `templates/` directory listing — understand existing scaffold structure
- Source files: `cli/index.mjs` — find where `scaffoldContextKit()` creates directories from templates

### Task 5 Context
- Spec: `.context-index/specs/features/cli/skill-ext-load.spec.md` (Acceptance Criterion: `/adev:implement` SKILL.md contains `adev skill-ext load --skill implement`)
- Source files: `skills/implement/SKILL.md:40-80` — Step 1 Load Context section to be updated
- Constitution: Anti-pattern rule — no inline-Node; only `adev <verb>` calls in skill prose

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

- Group A (sequential): Task 1 → Task 3 (Task 3 tests the implementation from Task 1)
- Group B (independent): Task 2 (adds one line to `cli/index.mjs`, no shared files with Task 3)
- Group C (independent): Task 4 (template + .gitignore changes, no shared files)
- Group D (independent): Task 5 (skill markdown only, no shared files with any other task)

Groups B, C, and D can run in parallel with Group A (Task 1 only). Task 3 must follow Task 1. Groups B, C, D are mutually independent and can run concurrently with each other.

Recommended execution order: Task 1 → Task 2 (can start concurrently after Task 1 begins but must complete after Task 1) → Task 3 → Task 4 → Task 5.

Simplest sequential order for serial execution: 1, 2, 3, 4, 5.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Implement `lib/cli/skill-ext.mjs` | small | unit | — | 1 create, 0 modify |
| 2 | Register `skill-ext` verb in CLI | small | unit | Task 1 | 0 create, 1 modify |
| 3 | Add `tests/cli/skill-ext.test.mjs` | small | unit | Task 1 | 1 create, 0 modify |
| 4 | Scaffold template + `.gitignore` update | small | unit | — | 1 create, 1 modify |
| 5 | Update `/adev:implement` SKILL.md | small | unit | Task 1 | 0 create, 1 modify |

---

## Task Structure

### Task 1: Implement `lib/cli/skill-ext.mjs` [specialist: none]

**Charter capability:** `skill-ext load --skill <name>` — project-level skill extension injection (CLI charter rev 4)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/cli/skill-ext.mjs`
- Test: `tests/cli/skill-ext.test.mjs` (created in Task 3)

**Tests:** `tests/cli/skill-ext.test.mjs` — covers all spec behaviors, error cases, and reviewer notes

**Context to load:**
- `.context-index/specs/features/cli/skill-ext-load.spec.md` (full spec — behavioral contract, behaviors, error cases, acceptance criteria)
- `lib/cli/gate.mjs` (follow this structure: `parseArgs`, `run({ projectRoot, argv })`, `help()`, no `LIFECYCLE_STEP`)
- `.context-index/specs/features/cli/charter.md` (lib/cli module contract)

**Implementation guidance:**

The module must:
1. Validate `--skill <name>` is present; if missing, write usage to stderr and exit 1.
2. Validate the skill name matches `/^[a-zA-Z0-9_-]+$/`; if not, write `INVALID_SKILL_NAME` to stderr and exit 1 without accessing the filesystem.
3. Resolve `projectRoot` (passed in) to locate `.context-index/skill-extensions/`. If the directory does not exist, write `NO_CONTEXT_INDEX` to stderr and exit 1.
4. **SEC-1 containment:** Compute `allowedBase = fs.realpathSync('.context-index/skill-extensions/', { relativeTo: projectRoot })`. For each candidate file path, call `fs.realpathSync(candidatePath)` and verify it starts with `allowedBase + path.sep`. If a resolved path escapes the allowed base, treat it as a `READ_ERROR` (do not follow symlinks outside the extension directory).
5. Read extension layers: list entries in `.context-index/skill-extensions/` matching the `_*` glob. Filter to directories. Sort lexicographically by name. For each, attempt to read `<ext-dir>/<skillName>.md`. Collect non-empty content.
6. Read project layer: attempt to read `.context-index/skill-extensions/<skillName>.md`. Collect if non-empty.
7. **SA-1 separator:** When both extension-layer content and project-layer content are present, join them with `\n\n` (one blank line). When multiple extension layers are present, join their content with `\n\n`. The final output must not have a trailing newline added beyond what the source files contain — output the joined string as-is.
8. If no non-empty content was collected, write `__NONE__` to stdout and exit 0.
9. Otherwise write the concatenated content to stdout and exit 0.
10. Any file that is present but throws on `readFileSync` (permissions etc.) → write `READ_ERROR` to stderr and exit 1.
11. Do NOT export `LIFECYCLE_STEP` (this is a query primitive per CON-1 and charter contract).

- [ ] **Write failing test**

In `tests/cli/skill-ext.test.mjs`, write a stub test that imports the module and asserts `run` is a function:

```javascript
// tests/cli/skill-ext.test.mjs (stub to establish RED phase)
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CLI = resolve(PROJECT_ROOT, 'cli', 'index.mjs');

test('lib/cli/skill-ext.mjs exports run and help', async () => {
  const mod = await import('../../lib/cli/skill-ext.mjs');
  assert.strictEqual(typeof mod.run, 'function');
  assert.strictEqual(typeof mod.help, 'function');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/skill-ext.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/cli/skill-ext.mjs'`

- [ ] **Implement**

Create `lib/cli/skill-ext.mjs` following the gate.mjs pattern. Use only `node:fs`, `node:path`, `node:util` built-ins. Key implementation points:
- `parseArgs` from `node:util` for `--skill` and `--help` flags
- `readdirSync` + filter for `_*` directories in the extension base path
- `readFileSync` with `'utf8'` encoding for each layer file
- `realpathSync` for each candidate path before reading (SEC-1)
- Output to `process.stdout.write(...)` (not `console.log` to avoid appending `\n` to `__NONE__`)
- Use `process.stderr.write(...)` for error messages
- `process.exit(0)` / `process.exit(1)` explicitly

- [ ] **Verify test passes**

Run: `node --test tests/cli/skill-ext.test.mjs`
Expected: PASS — `exports run and help` passes

- [ ] **Commit**

Branch (if not already created): `feat/cli/skill-ext-load`

```bash
git add lib/cli/skill-ext.mjs
git commit -m "feat(cli): implement skill-ext load verb

Spec: .context-index/specs/features/cli/skill-ext-load.spec.md
Plan-task: 1"
```

---

### Task 2: Register `skill-ext` verb in CLI [specialist: none]

**Charter capability:** `skill-ext load --skill <name>` — verb registration in VERB_REGISTRY
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `cli/index.mjs` — add one entry to `VERB_REGISTRY`
- Test: `tests/cli/skill-ext.test.mjs` — `adev skill-ext --help` test in Task 3

**Tests:** `tests/cli/skill-ext.test.mjs` — the `adev skill-ext --help` acceptance criterion test

**Context to load:**
- `cli/index.mjs:1552-1605` (VERB_REGISTRY — existing pattern)
- `.context-index/specs/features/cli/skill-ext-load.spec.md` (Acceptance Criterion: `adev skill-ext load --help`)

- [ ] **Write failing test**

Add to `tests/cli/skill-ext.test.mjs`:

```javascript
test('adev skill-ext --help prints help text and exits 0', () => {
  const r = spawnSync('node', [CLI, 'skill-ext', '--help'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /skill-ext|--skill/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/skill-ext.test.mjs --test-name-pattern "adev skill-ext --help"`
Expected: FAIL — unknown verb `skill-ext` / exit 1

- [ ] **Implement**

In `cli/index.mjs`, add after the `cost` line in VERB_REGISTRY:

```javascript
["skill-ext",    () => import("../lib/cli/skill-ext.mjs")],
```

- [ ] **Verify test passes**

Run: `node --test tests/cli/skill-ext.test.mjs --test-name-pattern "adev skill-ext --help"`
Expected: PASS

- [ ] **Commit**

```bash
git add cli/index.mjs
git commit -m "feat(cli): register skill-ext verb in VERB_REGISTRY

Spec: .context-index/specs/features/cli/skill-ext-load.spec.md
Plan-task: 2"
```

---

### Task 3: Add `tests/cli/skill-ext.test.mjs` — full test suite [specialist: none]

**Charter capability:** `skill-ext load --skill <name>` — behavioral contract coverage
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/cli/skill-ext.test.mjs` (replaces stub from Task 1)
- Test: self

**Tests:** `tests/cli/skill-ext.test.mjs`

**Context to load:**
- `.context-index/specs/features/cli/skill-ext-load.spec.md` (all Behaviors, Error Cases, Acceptance Criteria)
- `tests/cli/gate.test.mjs` (full test pattern: `makeTempProject`, `spawnSync`, `cleanup`)
- Review note SEC-1 (symlink escape test), CON-1 (`LIFECYCLE_STEP === undefined`)

**Tests to cover (map to spec acceptance criteria):**

1. Project-layer file only → content on stdout, exit 0
2. Extension-layer only (`_web-dev/implement.md`) → content on stdout, exit 0
3. Both extension layer and project layer → extension first, `\n\n`, project content, exit 0
4. Multiple extension layers (`_aaa/`, `_zzz/`) → lexicographic order (aaa first), exit 0
5. No files in any layer → exactly `__NONE__` on stdout, exit 0
6. All present files are empty → exactly `__NONE__` on stdout, exit 0
7. Path traversal in `--skill` (`../etc/passwd`) → stderr contains `INVALID_SKILL_NAME`, exit 1
8. Missing `--skill` argument → stderr contains usage/`MISSING_SKILL_ARG`, exit 1
9. `.context-index/` does not exist → stderr contains `NO_CONTEXT_INDEX`, exit 1
10. `adev skill-ext load --help` → prints help text, exit 0
11. `lib/cli/skill-ext.mjs` exports `run` and `help` (module contract)
12. `lib/cli/skill-ext.mjs` does NOT export `LIFECYCLE_STEP` (CON-1, query primitive)
13. Symlink that escapes the extension directory → stderr contains `READ_ERROR` or `INVALID_SKILL_NAME`, exit 1 (SEC-1)

- [ ] **Write failing tests**

Write the complete test suite (all 13 test cases). The stub from Task 1 covers #11; expand with all remaining cases. Tests #1-10 use `spawnSync` subprocess pattern; #11-12 use direct `import()`.

- [ ] **Verify tests fail** (for cases not yet covered)

Run: `node --test tests/cli/skill-ext.test.mjs`
Expected: Some tests FAIL (those covering behaviors not yet fully implemented)

- [ ] **Implement** (this task adds no implementation — fixes any gaps found during test writing)

If any spec behavior is unimplemented after reviewing test failures, update `lib/cli/skill-ext.mjs` accordingly.

- [ ] **Verify all tests pass**

Run: `node --test tests/cli/skill-ext.test.mjs`
Expected: All 13 (or more) tests PASS

- [ ] **Run full suite**

Run: `npm test`
Expected: All tests pass (no regressions)

- [ ] **Commit**

```bash
git add tests/cli/skill-ext.test.mjs lib/cli/skill-ext.mjs
git commit -m "test(cli): add skill-ext test suite (all behaviors + SEC-1 symlink guard)

Spec: .context-index/specs/features/cli/skill-ext-load.spec.md
Plan-task: 3"
```

---

### Task 4: Scaffold template + `.gitignore` update [specialist: none]

**Charter capability:** `skill-ext load --skill <name>` — project scaffolding for new installs
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `templates/skill-extensions/.gitkeep` — scaffold directory for `/adev:init`
- Modify: `.gitignore` — add `.context-index/skill-extensions/_*/`

**Tests:** `tests/cli/skill-ext.test.mjs` — Acceptance Criterion "No new `package.json` dependencies" and full suite still passes; the `.gitignore` change is verified by manual inspection (no automated test required for gitignore entries).

**Context to load:**
- `.context-index/specs/features/cli/skill-ext-load.spec.md` (Acceptance Criteria: `.gitignore` includes `_*/`)
- `templates/` directory listing — understand template structure for `cpSync()`
- `cli/index.mjs:217-281` (`scaffoldContextKit` — how templates are copied)

- [ ] **Write failing test**

Verify the `.gitignore` entry is missing (before the change):

```bash
grep 'skill-extensions/_\*' .gitignore
# Expected: no output (grep exits 1)
```

- [ ] **Verify test fails**

Run: `grep 'skill-extensions/_\*' .gitignore`
Expected: exits 1 (not found)

- [ ] **Implement**

1. Create `templates/skill-extensions/.gitkeep` (empty file).
2. Add to `.gitignore` in the `# adev context index` section:

```
# Skill extension layers managed by `adev extension install` — not committed.
.context-index/skill-extensions/_*/
```

- [ ] **Verify test passes**

Run: `grep 'skill-extensions/_\*' .gitignore`
Expected: exits 0, prints the matching line

- [ ] **Commit**

```bash
git add templates/skill-extensions/.gitkeep .gitignore
git commit -m "feat(cli): scaffold skill-extensions template and add gitignore rule

Spec: .context-index/specs/features/cli/skill-ext-load.spec.md
Plan-task: 4"
```

---

### Task 5: Update `/adev:implement` SKILL.md — Load Skill Extensions sub-step [specialist: none]

**Charter capability:** `skill-ext load --skill <name>` — skill integration (Acceptance Criterion: implement SKILL.md uses the verb)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `skills/implement/SKILL.md` — add sub-step in Step 1 (Load Context)
- Test: `tests/cli/skill-ext.test.mjs` — Acceptance Criterion verified by inspection

**Tests:** `tests/cli/skill-ext.test.mjs` — the suite verifies the verb works; SKILL.md content is verified by reading the file.

**Context to load:**
- `skills/implement/SKILL.md:40-80` (Step 1: Load Context — location of the new sub-step)
- `.context-index/specs/features/cli/skill-ext-load.spec.md` (Acceptance Criterion: SKILL.md contains `adev skill-ext load --skill implement` with prose)
- Constitution anti-patterns: no inline-Node, only `adev <verb>` calls in skill prose

**Prose to add** (after the `adev context load` command block in Step 1, before the numbered sub-steps):

```markdown
**Load Skill Extensions:** After loading the spec context bundle, load any skill extension instructions:

```bash
adev skill-ext load --skill implement
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.
```

- [ ] **Write failing test**

```bash
grep 'skill-ext load --skill implement' skills/implement/SKILL.md
# Expected: exits 1 (not found)
```

- [ ] **Verify test fails**

Run: `grep 'skill-ext load --skill implement' skills/implement/SKILL.md`
Expected: exits 1

- [ ] **Implement**

Edit `skills/implement/SKILL.md` to add the Load Skill Extensions sub-step in Step 1 (Load Context). Insert after the `adev context load` command block and before the numbered item list starting with "1. The plan file."

- [ ] **Verify test passes**

Run: `grep 'skill-ext load --skill implement' skills/implement/SKILL.md`
Expected: exits 0, prints the matching line

Also run: `npm test` to confirm the pre-commit hook (no-inline-node) does not reject the change.

- [ ] **Commit**

```bash
git add skills/implement/SKILL.md
git commit -m "feat(cli): add skill-ext load sub-step to /adev:implement Load Context

Spec: .context-index/specs/features/cli/skill-ext-load.spec.md
Plan-task: 5"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
- No new `package.json` dependencies introduced
- `lib/cli/skill-ext.mjs` conforms to `lib/cli/<verb>.mjs` contract (verified by `tests/cli-driver-pattern.test.mjs`)
- Pre-commit hook (`pre-commit-no-inline-node`) passes on `skills/implement/SKILL.md` modification
