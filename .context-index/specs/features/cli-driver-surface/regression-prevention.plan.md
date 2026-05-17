<!-- DO NOT EDIT statuses inline — see lifecycle log regression-prevention.jsonl -->
# Implementation Plan: Regression Prevention (Constitution Amendment + Pre-Commit Hook)

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cli-driver-surface/charter.md
> **Spec:** .context-index/specs/features/cli-driver-surface/regression-prevention.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-14)
> **Platform:** Node.js (ESM, .mjs), bash, node:test

**Goal:** Amend the constitution to forbid inline-Node patterns in SKILL.md and ship a git pre-commit hook that mechanically rejects new inline-Node accruals and per-skill atomic-invariant violations.

**Architecture:** Two-part landing. (1) Edit `.context-index/constitution.md` to add two new bullets in `## Anti-Patterns to Avoid` and propagate via `/adev:sync` to `CLAUDE.md`. (2) Ship `hooks/pre-commit-no-inline-node.sh` (bash, zero external deps), register it into the existing `.githooks/pre-commit` chain via the established `buildChainedHook` pattern in `cli/index.mjs::setupGitHooks`, and cover all behaviors + error cases with `tests/hooks/pre-commit-no-inline-node.test.mjs` using the existing `runHook()` test helper.

---

## File Structure

**Create:**
- `hooks/pre-commit-no-inline-node.sh` — bash hook; reads `git diff --cached --name-only`, filters to `skills/**/SKILL.md`, scans each H3 section for inline-Node + `adev <verb>` patterns; exit 0/1/2 per behavior matrix.
- `tests/hooks/pre-commit-no-inline-node.test.mjs` — node:test covering all 10 behaviors and 7 error cases via `runHook()` from `tests/helpers.mjs`.

**Modify:**
- `.context-index/constitution.md` — add two bullets under `## Anti-Patterns to Avoid`.
- `cli/index.mjs::setupGitHooks` (around lines 315-380) — include the new hook in the `.githooks/pre-commit` chain on fresh `adev install` / `adev upgrade`.
- `CLAUDE.md` — propagated automatically by `/adev:sync`; not hand-edited.

**Reference (read, do not modify):**
- `.context-index/constitution.md` `## Anti-Patterns to Avoid` section — existing bullets must remain intact.
- `cli/index.mjs:281-380` — `buildChainedHook` + `setupGitHooks` patterns to follow.
- `hooks/merge-guard.sh`, `hooks/constitution-linter.sh` — existing bash hook style for tone/structure.
- `tests/helpers.mjs::runHook()` — test invocation pattern (env vars + stdin JSON).
- `tests/hooks/merge-guard.test.mjs` — closest existing pattern for git-pre-commit-style hook tests.

---

## Context Packets

### Task 1 Context (Constitution amendment)
- Spec: `regression-prevention.spec.md` Behavior 1 + Postcondition 1
- Constitution: full read (preserve everything; surgical insertion only)
- Charter: capability row "Constitution amendment"

### Task 2 Context (Sync propagation)
- Skill: `skills/sync/SKILL.md` (no-op for the planner; `/adev:sync` is just invoked as a separate step)

### Task 3 Context (`hooks/pre-commit-no-inline-node.sh`)
- Spec: Behaviors 3, 4, 5, 6, 7, 8 + Error Cases table
- Sample: `hooks/merge-guard.sh`, `hooks/constitution-linter.sh` (existing bash hook patterns)
- Reference: `git diff --cached` semantics; `git show :<file>` for staged blob retrieval

### Task 4 Context (Hook tests)
- Spec: Behavior 9 + every Error Case row
- Sample: `tests/hooks/merge-guard.test.mjs` (closest existing pattern)
- Helper: `tests/helpers.mjs::runHook()`, `createTempDir()`, `writeFixture()`

### Task 5 Context (Hook registration in setupGitHooks)
- Source: `cli/index.mjs::setupGitHooks` (lines 315-380), `buildChainedHook` (lines 281-313)
- Spec: Postcondition that hook is registered in `.githooks/pre-commit` chain

### Task 6 Context (Documentation)
- File: existing hook docs (none currently — likely add brief mention in `hooks/` README or CLAUDE.md)

---

## Parallelization

- Group A (sequential): Task 1 (constitution amendment) → Task 2 (`/adev:sync` propagates to CLAUDE.md). Shared file: `CLAUDE.md` is regenerated from constitution.
- Group B (independent): Task 3 (hook script) → Task 4 (hook tests). Shared files: the hook script being tested.
- Group C (sequential, after B): Task 5 (registration in `cli/index.mjs`). Depends on Task 3.
- Group D (independent): Task 6 (documentation). No file overlap.

Group A and Group B can run in parallel. Group C and Group D run after their dependencies.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Amend constitution Anti-Patterns | Small | unit | — | 0 create, 1 modify |
| 2 | Sync constitution to CLAUDE.md | Small | unit | Task 1 | 0 create, 1 modify (regen) |
| 3 | Implement pre-commit-no-inline-node.sh | Medium | unit | — | 1 create, 0 modify |
| 4 | Hook test coverage | Medium | unit | Task 3 | 1 create, 0 modify |
| 5 | Register hook in setupGitHooks | Small | unit | Task 3 | 0 create, 1 modify |
| 6 | Document the hook | Small | unit | Tasks 1+3 | 0 create, 1 modify |

---

## Test Infrastructure Requirements

None. All tasks use `node:test` against the in-tree git repo (test helpers create temp dirs for git-staging fixtures). No external systems.

---

### Task 1: Amend constitution Anti-Patterns [specialist: none]

**Charter capability:** Constitution amendment
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/constitution.md` (insert two bullets in `## Anti-Patterns to Avoid` section)
- Test: `tests/constitution.test.mjs` (extend existing test, or create new if none)

**Tests:** `tests/constitution.test.mjs` — verifies the two new bullets are present verbatim.

**Context to load:**
- `.context-index/constitution.md` (full, to preserve every existing bullet)
- `regression-prevention.spec.md` Behavior 1 (the exact bullet text)

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('constitution forbids inline-Node patterns in SKILL.md', () => {
  const content = readFileSync(resolve(import.meta.dirname, '..', '.context-index', 'constitution.md'), 'utf8');
  assert.match(content, /No `Run inline Node\.js:` step directives, `node --input-type=module -e/);
  assert.match(content, /Skills name a CLI subcommand \(`adev <verb>/);
});

test('constitution forbids both-forms within an H3 section', () => {
  const content = readFileSync(resolve(import.meta.dirname, '..', '.context-index', 'constitution.md'), 'utf8');
  assert.match(content, /No SKILL\.md contains both an inline-Node block AND an `adev <verb>` invocation within the same H3 section/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/constitution.test.mjs`
Expected: FAIL — the bullets don't exist yet.

- [ ] **Implement**

In `.context-index/constitution.md`, locate the `## Anti-Patterns to Avoid` section. Append two new bullets at the end of the existing list, preserving all current bullets verbatim:

```markdown
- No `Run inline Node.js:` step directives, `node --input-type=module -e "..."` heredocs, or `node -e "..."` invocations inside `skills/*/SKILL.md`. Skills name a CLI subcommand (`adev <verb> …`) or a helper script; the helper body lives in `lib/cli/` or `scripts/`.
- No SKILL.md contains both an inline-Node block AND an `adev <verb>` invocation within the same H3 section (the per-step boundary; enforces per-skill atomic migration from the cli-driver-surface charter).
```

- [ ] **Verify test passes**

Run: `node --test tests/constitution.test.mjs`
Expected: PASS.

- [ ] **Commit**

Branch (already on this branch): `feat/cli-driver-surface/plan-remaining-specs`

```bash
git add .context-index/constitution.md tests/constitution.test.mjs
git commit -m "feat(constitution): forbid inline-Node patterns in SKILL.md"
```

---

### Task 2: Sync constitution to CLAUDE.md [specialist: none]

**Charter capability:** Constitution amendment (propagation)
**Strategy:** unit
**Depends on:** Task 1
**Files:**
- Modify: `CLAUDE.md` (regenerated by `/adev:sync` — not hand-edited)

**Tests:** verify CLAUDE.md contains both new bullets after sync runs.

**Context to load:**
- `.context-index/manifest.yaml::sync.targets`
- `skills/sync/SKILL.md` (mechanism)

- [ ] **Run /adev:sync**

Invoke `/adev:sync` to propagate the constitution amendment.

- [ ] **Verify**

```bash
grep -c "No \`Run inline Node\.js:\`" CLAUDE.md
grep -c "both an inline-Node block AND an \`adev <verb>\`" CLAUDE.md
```

Expected: both grep counts ≥ 1.

- [ ] **Commit**

```bash
git add CLAUDE.md
git commit -m "chore(sync): propagate constitution amendment to CLAUDE.md"
```

---

### Task 3: Implement hooks/pre-commit-no-inline-node.sh [specialist: none]

**Charter capability:** `hooks/pre-commit-no-inline-node.sh`
**Strategy:** unit
**Files:**
- Create: `hooks/pre-commit-no-inline-node.sh` (bash, executable)
- Test: `tests/hooks/pre-commit-no-inline-node.test.mjs` (in Task 4)

**Tests:** `tests/hooks/pre-commit-no-inline-node.test.mjs` covers Behaviors 3–8 and all Error Cases (Task 4).

**Context to load:**
- Spec Behaviors 3, 4, 5, 6, 7, 8 + Error Cases table
- `hooks/merge-guard.sh`, `hooks/constitution-linter.sh` (existing bash hook patterns)
- `regression-prevention.spec.md` Error Cases for false-positive concern (line 60 — code-block fences vs heredoc shape)

- [ ] **Write failing test** (in Task 4 — TDD ordering: test file lands together with this implementation in a single PR or in close commits)

Skip the full test code here; see Task 4 for the test definitions. For TDD, Task 4's tests must be authored against the spec's behavior expectations BEFORE Task 3's implementation lands.

- [ ] **Implement**

Sketch (full implementation must handle all Error Cases):

```bash
#!/usr/bin/env bash
# hooks/pre-commit-no-inline-node.sh
#
# Rejects new inline-Node patterns in skills/**/SKILL.md AND rejects per-H3-section
# both-forms violations (inline-Node AND adev <verb> in same H3 section).
# Out of scope: providers/*/skills/*/SKILL.md.
# Exit codes: 0 = allow, 1 = hook crashed (not policy), 2 = policy violation.
#
# Edge case: the constitution amendment text itself contains the forbidden
# pattern as quoted prose. The hook only fires on heredoc-shape multi-line
# blocks or on `Run inline Node.js:` step headings — not on inline backtick
# quotes in prose. See spec Error Cases line 60.

set -uo pipefail

VIOLATION_FOUND=0

# Enumerate staged SKILL.md files (skills/**/SKILL.md only; providers/* excluded)
mapfile -t staged < <(git diff --cached --name-only -- 'skills/**/SKILL.md' 2>/dev/null || true)

# Empty staged set → exit 0 (Error Case row 1)
if [ "${#staged[@]}" -eq 0 ]; then
  exit 0
fi

for file in "${staged[@]}"; do
  # Skip provider mirrors (Error Case row 6)
  case "$file" in
    providers/*/skills/*/SKILL.md) continue ;;
  esac

  # Retrieve staged blob via git show
  blob=$(git show ":$file" 2>/dev/null) || {
    echo "[pre-commit-no-inline-node] could not read staged blob: $file" >&2
    continue
  }

  # Scan whole file for the forbidden patterns (heredoc shape or step heading)
  # Pattern 1: Run inline Node.js: step heading
  if echo "$blob" | grep -qE '^Run inline Node\.js:|^#+\s+Run inline Node\.js:'; then
    echo "[pre-commit-no-inline-node] Inline Node forbidden in SKILL.md per constitution Anti-Patterns. File: $file. Match: Run inline Node.js: directive" >&2
    VIOLATION_FOUND=1
  fi
  # Pattern 2: node --input-type=module -e heredoc shape (multi-line)
  if echo "$blob" | grep -qE 'node\s+--input-type=module\s+-e'; then
    echo "[pre-commit-no-inline-node] Inline Node forbidden in SKILL.md per constitution Anti-Patterns. File: $file. Match: node --input-type=module -e heredoc" >&2
    VIOLATION_FOUND=1
  fi
  # Pattern 3: bare node -e in a fenced code block (NOT in inline backticks)
  if echo "$blob" | awk '/^```(bash|sh|shell)?$/,/^```$/' | grep -qE 'node\s+-e\b'; then
    echo "[pre-commit-no-inline-node] Inline Node forbidden in SKILL.md per constitution Anti-Patterns. File: $file. Match: node -e in fenced code block" >&2
    VIOLATION_FOUND=1
  fi

  # H3 section parser: per-H3 both-forms invariant
  # An H3 section spans from `### ` to the next line beginning with `## ` or `### ` or EOF.
  # Within each section, check for presence of BOTH inline-Node patterns AND `adev <verb>` calls.
  current_section=""
  section_inline=0
  section_adev=0
  while IFS= read -r line; do
    if echo "$line" | grep -qE '^###\s+'; then
      # Check prior section for violation
      if [ -n "$current_section" ] && [ "$section_inline" -eq 1 ] && [ "$section_adev" -eq 1 ]; then
        echo "[pre-commit-no-inline-node] Per-skill atomic invariant violated. File: $file. H3 section: $current_section. Same section has both inline-Node and adev <verb> call." >&2
        VIOLATION_FOUND=1
      fi
      # Start new section
      current_section=$(echo "$line" | sed 's/^###\s*//')
      section_inline=0
      section_adev=0
      continue
    fi
    if echo "$line" | grep -qE '^##\s+|^### '; then
      # Section boundary — finalize current
      if [ "$section_inline" -eq 1 ] && [ "$section_adev" -eq 1 ]; then
        echo "[pre-commit-no-inline-node] Per-skill atomic invariant violated. File: $file. H3 section: $current_section. Same section has both inline-Node and adev <verb> call." >&2
        VIOLATION_FOUND=1
      fi
      current_section=""
      section_inline=0
      section_adev=0
      continue
    fi
    # Inline-Node markers (only inside current section)
    if echo "$line" | grep -qE 'Run inline Node\.js:|node\s+--input-type=module\s+-e|node\s+-e\b'; then
      section_inline=1
    fi
    # adev <verb> calls (inside fenced code blocks or prose)
    if echo "$line" | grep -qE '\badev\s+[a-z]'; then
      section_adev=1
    fi
  done <<< "$blob"
  # Final section after loop
  if [ -n "$current_section" ] && [ "$section_inline" -eq 1 ] && [ "$section_adev" -eq 1 ]; then
    echo "[pre-commit-no-inline-node] Per-skill atomic invariant violated. File: $file. H3 section: $current_section. Same section has both inline-Node and adev <verb> call." >&2
    VIOLATION_FOUND=1
  fi
done

if [ "$VIOLATION_FOUND" -eq 1 ]; then
  exit 2
fi
exit 0
```

Make executable: `chmod +x hooks/pre-commit-no-inline-node.sh`.

- [ ] **Verify test passes**

Tests are in Task 4; after this implementation lands AND Task 4's tests are written, run:
```bash
node --test tests/hooks/pre-commit-no-inline-node.test.mjs
```
Expected: all assertions PASS.

- [ ] **Commit**

```bash
git add hooks/pre-commit-no-inline-node.sh
git commit -m "feat(hooks): pre-commit-no-inline-node — block inline-Node accruals"
```

---

### Task 4: Hook test coverage [specialist: none]

**Charter capability:** `hooks/pre-commit-no-inline-node.sh` (test discipline)
**Strategy:** unit
**Depends on:** Task 3 (test file lands together with implementation; TDD order — author tests first, see them fail, then commit hook script alongside)
**Files:**
- Create: `tests/hooks/pre-commit-no-inline-node.test.mjs`

**Tests:** itself — this task IS the test file.

**Context to load:**
- `tests/helpers.mjs` (`runHook`, `createTempDir`, `cleanupTempDir`, `writeFixture`)
- `tests/hooks/merge-guard.test.mjs` (closest existing pattern)
- Spec Behavior 9 + every Error Case row

**Test scenarios to cover (one `test()` per row):**
1. No staged SKILL.md files → exit 0 silent.
2. Staged SKILL.md with new `Run inline Node.js:` heading → exit 2, message names the file + pattern.
3. Staged SKILL.md with `node --input-type=module -e ...` heredoc → exit 2.
4. Staged SKILL.md with `node -e` inside fenced code block → exit 2.
5. Staged SKILL.md with inline-Node AND `adev <verb>` in same H3 section → exit 2, message names the section.
6. Staged SKILL.md with inline-Node and `adev <verb>` in DIFFERENT H3 sections → exit 0 (allowed).
7. Staged `providers/codex/skills/foo/SKILL.md` with inline-Node → exit 0 (out of scope).
8. Staged non-SKILL.md `.md` file with inline-Node → exit 0 (out of scope).
9. Constitution-amendment-style prose mentioning the pattern inside inline backticks (e.g., `` `node -e ...` ``) → exit 0 (no false-positive on inline backticks).
10. Hook script's own bash syntax error or unhandled exception → exit 1 (distinguishable from exit 2 policy violation). NOTE: this test case may be tricky to simulate cleanly — could either be skipped or asserted by mutating the script's args / env to force a failure mode.

- [ ] **Write the test file**

Skeleton:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HOOK = resolve(__dirname, '..', '..', 'hooks', 'pre-commit-no-inline-node.sh');

function setupGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'adev-precommit-test-'));
  spawnSync('git', ['init', '--quiet'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  spawnSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
  return dir;
}

function stageFile(dir, relPath, content) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  spawnSync('git', ['add', relPath], { cwd: dir });
}

function runHook(dir) {
  return spawnSync('bash', [HOOK], { cwd: dir, encoding: 'utf8' });
}

test('exit 0 silent when no staged SKILL.md files', () => {
  const dir = setupGitRepo();
  try {
    const r = runHook(dir);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout.trim(), '');
    assert.strictEqual(r.stderr.trim(), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exit 2 on Run inline Node.js: heading in skills/**/SKILL.md', () => {
  const dir = setupGitRepo();
  try {
    stageFile(dir, 'skills/foo/SKILL.md', '# Foo\n\nRun inline Node.js:\n\n```js\nconsole.log("x");\n```\n');
    const r = runHook(dir);
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /Inline Node forbidden/);
    assert.match(r.stderr, /skills\/foo\/SKILL\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ... (remaining 8 scenarios follow the same pattern)
```

- [ ] **Verify tests pass**

Run: `node --test tests/hooks/pre-commit-no-inline-node.test.mjs`
Expected: all 10 tests PASS once Task 3's hook implementation is correct.

- [ ] **Commit**

```bash
git add tests/hooks/pre-commit-no-inline-node.test.mjs
git commit -m "test(hooks): pre-commit-no-inline-node coverage"
```

---

### Task 5: Register hook in setupGitHooks [specialist: none]

**Charter capability:** `hooks/pre-commit-no-inline-node.sh` (installation)
**Strategy:** unit
**Depends on:** Task 3
**Files:**
- Modify: `cli/index.mjs::setupGitHooks` (around lines 315-380)
- Test: existing `tests/cli.test.mjs` (extend with a setup-hook assertion if there isn't one already)

**Tests:** test that fresh `adev install` results in `.githooks/pre-commit` chain containing a reference to `hooks/pre-commit-no-inline-node.sh`.

**Context to load:**
- `cli/index.mjs:281-380` — `buildChainedHook` + existing setupGitHooks structure
- `tests/cli.test.mjs` — existing install / scaffold tests

- [ ] **Write failing test**

```javascript
test('setupGitHooks chains pre-commit-no-inline-node.sh', async () => {
  // create temp project, run setupGitHooks, assert .githooks/pre-commit references the hook
  // ...
});
```

- [ ] **Verify fails**

Without the registration, the test should fail.

- [ ] **Implement**

In `cli/index.mjs::setupGitHooks`, add `pre-commit-no-inline-node.sh` to the list of hooks chained into `.githooks/pre-commit`. The exact code shape depends on the current implementation (it likely iterates a list of `(hookSourceName, gitHookName)` pairs and calls `buildChainedHook` for each). Add an entry pairing the new hook with `pre-commit`.

- [ ] **Verify test passes**

Run: `node --test tests/cli.test.mjs`
Expected: new test PASS; no existing test regressions.

- [ ] **Commit**

```bash
git add cli/index.mjs tests/cli.test.mjs
git commit -m "feat(cli): install pre-commit-no-inline-node into git hook chain"
```

---

### Task 6: Document the hook [specialist: none]

**Charter capability:** `hooks/pre-commit-no-inline-node.sh` (discoverability)
**Strategy:** unit (documentation)
**Depends on:** Tasks 1, 3
**Files:**
- Modify: `hooks/hooks.json` (if applicable — note: this hook is a git hook, NOT a Claude Code lifecycle hook; per spec Postcondition, it does NOT register in `hooks/hooks.json`; verify and either add a separate doc file or extend an existing README)
- Alternative: brief addition to `CLAUDE.md` "## Architecture Boundaries" or `.githooks/README.md` (new)

**Tests:** N/A (documentation).

- [ ] **Add brief docs**

Two-paragraph note (location TBD per current docs structure): (a) what the hook does, (b) how to bypass deliberately if a contributor has a justified reason (`--no-verify` with documented justification in commit message).

- [ ] **Commit**

```bash
git add <docs-files>
git commit -m "docs(hooks): document pre-commit-no-inline-node"
```

---

## Quality Gates

After all tasks complete:

- `npm test` — full test suite passes (existing + new tests)
- `bash hooks/pre-commit-no-inline-node.sh` — manually exercise via `git add` + invoke with a known-good and known-bad fixture
- Manually verify: after `adev install` in a fresh project, `.githooks/pre-commit` invokes the new hook
- `/adev:validate --spec .context-index/specs/features/cli-driver-surface/regression-prevention.spec.md`
