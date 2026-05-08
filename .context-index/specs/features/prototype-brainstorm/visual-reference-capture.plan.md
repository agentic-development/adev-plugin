# Implementation Plan: Visual Reference Capture

> **Methodology:** adev
> **Charter:** .context-index/specs/features/prototype-brainstorm/charter.md
> **Spec:** .context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md
> **Review:** PASS (2026-05-08)
> **Platform:** Node.js, JavaScript (ESM), node:test, npm

**Goal:** Implement the visual reference capture library that validates, copies, deduplicates, and summarizes user-provided images during prototype sessions, storing them in `.context-index/references/<module>/visuals/`.

**Architecture:** The visual reference capture capability is implemented as a pure library module `lib/visual-references.mjs` with no external dependencies, following the same pattern as `lib/prototype-server.mjs` and `lib/prototype-args.mjs`. The library handles path validation, format checking, size limits, description slugification, filename deduplication, directory creation, and session summary generation. The SKILL.md orchestrates when to invoke these functions during the prototype feedback loop. All image handling uses Node.js `fs` built-ins — no image processing libraries.

---

## File Structure

**Create:**
- `lib/visual-references.mjs` — Pure library module: path validation, format checking, slugification, file copy with dedup, session summary
- `tests/lib/visual-references.test.mjs` — Unit tests for all library functions

**Modify:**
- `skills/prototype/SKILL.md` — Add visual reference capture instructions to the feedback loop and session summary

**Reference (read, do not modify):**
- `.context-index/samples/general-library-module-graph.md` — Follow this pattern for library module structure (pure ESM, import ordering, naming conventions)
- `.context-index/samples/general-test-helpers.md` — Follow test utility patterns
- `tests/helpers.mjs` — Use shared test utilities (`createTempDir`, `cleanupTempDir`, `writeFixture`)
- `lib/prototype-server.mjs` — Sibling library module for reference on code style and structure
- `lib/prototype-args.mjs` — Sibling library module for reference on validation patterns

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md` (Behaviors 1a, 3, 5, 7; Error Cases: IMAGE_NOT_FOUND, IMAGE_READ_ERROR, IMAGE_SYMLINK, IMAGE_TOO_LARGE, UNSUPPORTED_FORMAT, EMPTY_SLUG)
- Charter: `.context-index/specs/features/prototype-brainstorm/charter.md` (capability: Visual reference capture)
- Constitution: `.context-index/constitution.md` (Non-Negotiable Principles #1 minimize deps, #3 pure ESM; Coding Standards — camelCase, kebab-case files, import ordering)
- Sample: `.context-index/samples/general-library-module-graph.md` (follow pure ESM library pattern)

### Task 2 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md` (Behaviors 1, 4, 5, 6; Error Cases: CONTEXT_WRITE_ERROR)
- Charter: `.context-index/specs/features/prototype-brainstorm/charter.md` (capability: Visual reference capture)
- Task 1 artifacts: `lib/visual-references.mjs` (validation + slugify functions under test)

### Task 3 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md` (Behaviors 8, 9; Postconditions: source attribute tracking)
- Charter: `.context-index/specs/features/prototype-brainstorm/charter.md` (capability: Visual reference capture)
- Task 1-2 artifacts: `lib/visual-references.mjs` (copy + dedup functions)

### Task 4 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md` (all Behaviors)
- Task 1-3 artifacts: `lib/visual-references.mjs`, `tests/lib/visual-references.test.mjs`
- Source files: `tests/helpers.mjs` (shared test utilities)
- Sample: `.context-index/samples/general-test-helpers.md` (test patterns)

### Task 5 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md` (Behaviors 1, 2, 8, 10)
- Charter: `.context-index/specs/features/prototype-brainstorm/charter.md` (capability: Visual reference capture)
- Source files: `skills/prototype/SKILL.md` (current skill instructions — read in full)
- Source files: `lib/visual-references.mjs` (API reference for skill instructions)
- Brainstorm integration: `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (Behavior 4 — visual_references in return contract)

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 (each builds on prior)
- Group B (independent): Task 5 (SKILL.md modifications — no shared files with Group A)

Group B can run after Group A completes (Task 5 references the library API from Tasks 1-3).

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Path validation, format checking, and slugification helpers | medium | unit | — | 1 create |
| 2 | File copy with deduplication and directory creation | medium | unit | Task 1 | 0 create, 1 modify |
| 3 | Session tracker and summary generation | small | unit | Task 2 | 0 create, 1 modify |
| 4 | Unit tests for visual-references library | medium | unit | Task 3 | 1 create |
| 5 | SKILL.md integration — visual reference capture in prototype loop | small | unit | Task 4 | 0 create, 1 modify |

---

### Task 1: Path validation, format checking, and slugification helpers [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Fully specified validation rules, error codes, and slugification logic with a direct golden sample match for pure ESM library modules.

**Charter capability:** Visual reference capture
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/visual-references.mjs`
- Test: `tests/lib/visual-references.test.mjs`

**Tests:** `tests/lib/visual-references.test.mjs`

**Context to load:**
- `.context-index/samples/general-library-module-graph.mjs` (follow pure ESM library pattern)
- `lib/prototype-args.mjs` (sibling validation module — follow style)

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSourcePath, slugifyDescription, isSupportedFormat } from '../lib/visual-references.mjs';

describe('validateSourcePath', () => {
  it('rejects non-existent path', () => {
    const result = validateSourcePath('/no/such/file.png', '/project');
    assert.equal(result.valid, false);
    assert.equal(result.code, 'IMAGE_NOT_FOUND');
  });

  it('rejects symlinks', () => {
    // requires fixture setup — symlink to a real file
    // result.code === 'IMAGE_SYMLINK'
  });

  it('rejects files over 10 MB', () => {
    // requires fixture setup — large file
    // result.code === 'IMAGE_TOO_LARGE'
  });

  it('flags external paths', () => {
    const result = validateSourcePath('/outside/project/img.png', '/project');
    assert.equal(result.external, true);
  });
});

describe('slugifyDescription', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    assert.equal(slugifyDescription('Homepage Hero Layout'), 'homepage-hero-layout');
  });

  it('strips special characters', () => {
    assert.equal(slugifyDescription('my image!!! @#$'), 'my-image');
  });

  it('truncates at 60 chars on word boundary', () => {
    const long = 'this is a very long description that exceeds sixty characters and should be truncated';
    const result = slugifyDescription(long);
    assert.ok(result.length <= 60);
    assert.ok(!result.endsWith('-'));
  });

  it('returns empty string for all-emoji input', () => {
    assert.equal(slugifyDescription('🎉🎊'), '');
  });
});

describe('isSupportedFormat', () => {
  it('accepts png, jpg, jpeg, webp', () => {
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
      assert.equal(isSupportedFormat(ext), true);
    }
  });

  it('rejects tiff, bmp, svg, psd', () => {
    for (const ext of ['.tiff', '.bmp', '.svg', '.psd']) {
      assert.equal(isSupportedFormat(ext), false);
    }
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/visual-references.test.mjs`
Expected: FAIL — `visual-references.mjs` does not exist

- [x] **Implement**

Create `lib/visual-references.mjs` with:
- `SUPPORTED_FORMATS` constant: `new Set(['.png', '.jpg', '.jpeg', '.webp'])`
- `MAX_FILE_SIZE` constant: `10 * 1024 * 1024` (10 MB)
- `MAX_SLUG_LENGTH` constant: `60`
- `isSupportedFormat(ext)` — checks extension (case-insensitive) against SUPPORTED_FORMATS
- `slugifyDescription(description)` — lowercase, replace non-alphanumeric with hyphens, collapse multiple hyphens, trim to 60 chars at word boundary, trim trailing hyphens. Return empty string if result is empty after processing.
- `validateSourcePath(sourcePath, projectRoot)` — resolves path via `path.resolve()`, checks existence (`fs.existsSync`), checks regular file + no symlink (`fs.lstatSync`), checks format via extension, checks size (`fs.statSync`), checks if external to project root. Returns `{ valid, code, external, resolvedPath, size, ext }`.

- [x] **Verify test passes**

Run: `node --test tests/lib/visual-references.test.mjs`
Expected: PASS

- [x] **Commit**

Branch (if not already created): `feat/prototype-brainstorm/visual-reference-capture`

```bash
git add lib/visual-references.mjs tests/lib/visual-references.test.mjs
git commit -m "feat(prototype-brainstorm): add path validation, format checking, and slugification for visual references

Spec: .context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md
Plan-task: 1"
```

---

### Task 2: File copy with deduplication and directory creation [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Exact copy semantics, dedup rules, and directory creation are fully specified with standard Node.js fs patterns.

**Charter capability:** Visual reference capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/visual-references.mjs`
- Test: `tests/lib/visual-references.test.mjs`

**Tests:** `tests/lib/visual-references.test.mjs`

**Context to load:**
- `.context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md` (Behaviors 1, 4, 5, 6)
- Task 1 artifacts: `lib/visual-references.mjs`

- [x] **Write failing test**

```javascript
describe('copyVisualReference', () => {
  it('copies file to references directory with slugified name', () => {
    // Setup: create temp project dir with .context-index/, source image file
    // Call: copyVisualReference({ sourcePath, module, description, projectRoot })
    // Assert: file exists at .context-index/references/<module>/visuals/<slug>.<ext>
  });

  it('creates references directory recursively if missing', () => {
    // Setup: temp dir with NO .context-index/references/
    // Call: copyVisualReference(...)
    // Assert: directory created, file copied
  });

  it('appends numeric suffix on filename collision', () => {
    // Setup: temp dir with existing slug.png
    // Call: copyVisualReference with same slug
    // Assert: new file is slug-2.png
  });

  it('increments suffix when multiple collisions exist', () => {
    // Setup: temp dir with slug.png AND slug-2.png
    // Call: copyVisualReference with same slug
    // Assert: new file is slug-3.png
  });

  it('falls back to reference.<ext> when slug is empty', () => {
    // Setup: description = '🎉'
    // Assert: filename is reference.png
  });

  it('preserves original file content (no resizing/conversion)', () => {
    // Setup: create file with known content
    // Call: copyVisualReference
    // Assert: destination file content matches source byte-for-byte
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/visual-references.test.mjs`
Expected: FAIL — `copyVisualReference is not defined`

- [x] **Implement**

Add to `lib/visual-references.mjs`:
- `resolveTargetPath(projectRoot, module, slug, ext)` — builds `.context-index/references/<module>/visuals/<slug>.<ext>`, handles dedup by checking existence and appending `-2`, `-3`, etc.
- `copyVisualReference({ sourcePath, module, description, projectRoot })` — orchestrates the full copy:
  1. Slugify description (use empty-slug fallback to `reference`)
  2. Resolve target path with dedup
  3. Create target directory recursively (`fs.mkdirSync({ recursive: true })`)
  4. Copy file (`fs.copyFileSync`)
  5. Return `{ destinationPath, slug, source: 'user-upload' }`

- [x] **Verify test passes**

Run: `node --test tests/lib/visual-references.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/visual-references.mjs tests/lib/visual-references.test.mjs
git commit -m "feat(prototype-brainstorm): add file copy with dedup and directory creation for visual references

Spec: .context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md
Plan-task: 2"
```

---

### Task 3: Session tracker and summary generation [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Summary format and tracker API are precisely defined in the spec; simple factory pattern with no creative decisions.

**Charter capability:** Visual reference capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `lib/visual-references.mjs`
- Test: `tests/lib/visual-references.test.mjs`

**Tests:** `tests/lib/visual-references.test.mjs`

**Context to load:**
- `.context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md` (Behaviors 8, 9)
- `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (Behavior 4 — return contract)

- [x] **Write failing test**

```javascript
describe('VisualReferenceTracker', () => {
  it('tracks captured references', () => {
    const tracker = createVisualReferenceTracker();
    tracker.add({ path: '/dest/img.png', description: 'hero layout' });
    assert.equal(tracker.count(), 1);
  });

  it('generates summary with path and description pairs', () => {
    const tracker = createVisualReferenceTracker();
    tracker.add({ path: '/dest/img.png', description: 'hero layout' });
    tracker.add({ path: '/dest/nav.jpg', description: 'navigation bar' });
    const summary = tracker.summary('my-module');
    assert.ok(summary.includes('Captured 2 visual reference(s)'));
    assert.ok(summary.includes('hero layout'));
  });

  it('returns empty array when no references captured', () => {
    const tracker = createVisualReferenceTracker();
    assert.deepEqual(tracker.toArray(), []);
  });

  it('returns empty string summary when no references captured', () => {
    const tracker = createVisualReferenceTracker();
    assert.equal(tracker.summary('mod'), '');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/visual-references.test.mjs`
Expected: FAIL — `createVisualReferenceTracker is not defined`

- [x] **Implement**

Add to `lib/visual-references.mjs`:
- `createVisualReferenceTracker()` — factory returning an object with:
  - `add({ path, description })` — appends to internal array
  - `count()` — returns count
  - `toArray()` — returns `[{ path, description }]` for brainstorm return contract
  - `summary(module)` — returns formatted string (Behavior 8) or empty string (Behavior 9)

- [x] **Verify test passes**

Run: `node --test tests/lib/visual-references.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/visual-references.mjs tests/lib/visual-references.test.mjs
git commit -m "feat(prototype-brainstorm): add session tracker and summary generation for visual references

Spec: .context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md
Plan-task: 3"
```

---

### Task 4: Unit tests for visual-references library [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** All acceptance criteria enumerated, golden test sample available, single test file modification with no production code changes.

**Charter capability:** Visual reference capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `tests/lib/visual-references.test.mjs`
- Test: `tests/lib/visual-references.test.mjs`

**Tests:** `tests/lib/visual-references.test.mjs`

**Context to load:**
- `.context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md` (all Acceptance Criteria)
- `tests/helpers.mjs` (shared test utilities)
- `.context-index/samples/general-test-helpers.md` (test patterns)

- [x] **Write comprehensive tests**

Expand the test file to cover all acceptance criteria and error cases. Key additions:

```javascript
describe('validateSourcePath — edge cases', () => {
  it('rejects directory path', () => {
    // lstatSync isFile() returns false
  });

  it('rejects unreadable file', () => {
    // chmod 000 on fixture file
  });

  it('accepts case-insensitive extensions (.PNG, .Jpg)', () => {
    // validateSourcePath should normalize extension
  });
});

describe('slugifyDescription — edge cases', () => {
  it('handles consecutive special characters', () => {
    assert.equal(slugifyDescription('a---b___c'), 'a-b-c');
  });

  it('handles leading/trailing whitespace', () => {
    assert.equal(slugifyDescription('  hello world  '), 'hello-world');
  });

  it('truncates at word boundary, not mid-word', () => {
    // 60-char boundary falls mid-word — truncate before that word
  });
});

describe('copyVisualReference — error cases', () => {
  it('returns error result for non-existent source', () => {
    // Integration of validate + copy: validate fails, copy not attempted
  });

  it('returns error for unsupported format', () => {
    // .tiff file → UNSUPPORTED_FORMAT
  });
});

describe('integration: full capture flow', () => {
  it('validates, copies, deduplicates, and tracks in one flow', () => {
    // End-to-end: create temp project, source image, call captureVisualReference
    // Verify: file copied, tracker updated, summary correct
  });
});
```

- [x] **Verify all tests pass**

Run: `node --test tests/lib/visual-references.test.mjs`
Expected: PASS — all tests green

- [x] **Run full quality gates**

Run: `npm test`
Expected: PASS — no regressions

- [x] **Commit**

```bash
git add tests/lib/visual-references.test.mjs
git commit -m "test(prototype-brainstorm): comprehensive unit tests for visual reference capture library

Spec: .context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md
Plan-task: 4"
```

---

### Task 5: SKILL.md integration — visual reference capture in prototype loop [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=4
**Rationale:** Integration points in the existing SKILL.md require discovery but the behavioral contract is clear and blast radius is minimal.

**Charter capability:** Visual reference capture
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: `skills/prototype/SKILL.md`
- Test: `tests/lib/visual-references.test.mjs`

**Tests:** `tests/lib/visual-references.test.mjs`

**Context to load:**
- `skills/prototype/SKILL.md` (read in full — current skill instructions)
- `.context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md` (Behaviors 1, 2, 8, 10)
- `lib/visual-references.mjs` (API reference)
- `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (Behavior 4 — visual_references in return contract)

- [x] **Write failing test**

No new code tests needed — this is a SKILL.md (markdown) modification. Verify by running existing quality gates.

- [x] **Implement**

Add to `skills/prototype/SKILL.md`:

1. **Image detection in feedback loop (Step 6):** Add instructions to detect when user provides a file path ending in `.png`, `.jpg`, `.jpeg`, or `.webp` during the feedback loop. When detected:
   - Import and call `validateSourcePath()` from `lib/visual-references.mjs`
   - If path is external to project, prompt: "Image is outside the project directory. Proceed? (yes/no)"
   - If no description provided (Behavior 2), prompt: "What does this image show? (used for the filename, e.g., 'homepage-hero-layout')"
   - Call `copyVisualReference()` to save the image
   - Add to session tracker via `tracker.add()`
   - Confirm: "Saved visual reference to `<destination-path>`"

2. **Capture at any session point (Behavior 10):** Note that visual reference capture is not limited to the feedback loop — it can happen at any point during the active session.

3. **Session summary (Step 9):** Add tracker summary output to the session summary. When visual references were captured, include the summary from `tracker.summary(module)`.

4. **Return contract (Step 8b):** Ensure `visual_references` in the `PROTOTYPE_RESULT` is populated from `tracker.toArray()`.

- [x] **Verify quality gates pass**

Run: `npm test`
Expected: PASS — no regressions

- [x] **Commit**

```bash
git add skills/prototype/SKILL.md
git commit -m "feat(prototype-brainstorm): integrate visual reference capture into prototype SKILL.md

Spec: .context-index/specs/features/prototype-brainstorm/visual-reference-capture.spec.md
Plan-task: 5"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [ ] Source paths validated (regular file, not symlink, supported format, max 10 MB)
  - [ ] External paths trigger confirmation prompt
  - [ ] `source: user-upload` recorded for each capture
  - [ ] Images copied to `.context-index/references/<module>/visuals/` with slugified names
  - [ ] Description prompted when missing
  - [ ] Slugification rules correct (lowercase, hyphens, max 60 chars, empty fallback)
  - [ ] Directory created recursively if missing
  - [ ] Numeric suffix deduplication (no overwrites)
  - [ ] Original resolution preserved (no resizing/conversion)
  - [ ] Unsupported formats rejected with message
  - [ ] Session-end summary with `{ path, description }` pairs
  - [ ] No `git add`/`git commit` performed by the skill
  - [ ] No directory created when no references captured
  - [ ] Capture accepted at any session point
