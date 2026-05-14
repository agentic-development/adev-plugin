<!-- DO NOT EDIT statuses inline — see lifecycle log generate-module-docs.jsonl -->
# Implementation Plan: Generate module docs

> **Methodology:** adev
> **Charter:** .context-index/specs/features/adev:document/charter.md
> **Spec:** .context-index/specs/features/adev:document/generate-module-docs.spec.md
> **Review:** PASS (2026-03-23)
> **Platform:** Node.js, JavaScript ESM (.mjs), no framework

**Goal:** Extend `skills/document/SKILL.md` with per-module documentation generation: `docs/modules/<slug>.md` for every module in `manifest.yaml`, with slug validation (path traversal prevention), Purpose/Key Exports/Dependencies/Related Specs sections, `--module` scoping, and `--force` handling.

**Architecture:** Extends the base SKILL.md created in the generate-architecture plan. Module doc generation iterates `manifest.yaml` modules, reads charter Business Intent, filters `symbol-ranks.json` to module paths, reads edges from `dependency-graph.json`, and scans `.context-index/specs/features/<module>/` for related specs. The `--module <slug>` argument is sanitized before use in any path construction.

**Depends on:** `generate-architecture.plan.md` (Task 1 must complete before this plan begins — `skills/document/SKILL.md` must exist)

---

## File Structure

**Modify:**
- `skills/document/SKILL.md` — Add Step 2: Generate docs/modules/<slug>.md section
- `tests/skills/document.test.mjs` — Add tests for module docs and slug validation

**Reference (read, do not modify):**
- `.context-index/specs/features/adev:document/generate-module-docs.spec.md` — Source of truth for behaviors
- `skills/document/SKILL.md` — Extend this file (already created)

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/adev:document/generate-module-docs.spec.md` (all behaviors, error cases, acceptance criteria)
- Charter: `.context-index/specs/features/adev:document/charter.md` (capability: Generate module docs, Argument: --module)
- ADR: `.context-index/adrs/0001-web-tree-sitter-dependency.md` (symbol-ranks.json is the optional enhanced data source)
- Constitution: `.context-index/constitution.md` (principle: minimize external dependencies — slug validation uses Node.js `path` module only)

### Task 2 Context
- Spec: `.context-index/specs/features/adev:document/generate-module-docs.spec.md` (acceptance criteria for slug validation and --module behavior)
- Reference: `tests/skills/document.test.mjs` (extend this test file)

---

## Parallelization

- Group A (sequential): Task 1 → Task 2

---

### Task 1: Extend SKILL.md — module docs generation with slug validation [specialist: none]

**Charter capability:** Generate module docs (must-have, v1) + Argument: --module (must-have, v1)
**Files:**
- Modify: `skills/document/SKILL.md` (append Step 2 section)

**Context to load:**
- `.context-index/specs/features/adev:document/generate-module-docs.spec.md` — behaviors 1-9 become instructions

- [ ] **Write failing test**

```javascript
// Add to tests/skills/document.test.mjs

it("SKILL.md contains module docs generation section", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  assert.ok(content.includes("docs/modules/"), "Must reference docs/modules/ output path");
  assert.ok(content.includes("slug"), "Must reference module slug");
  assert.ok(content.includes("Key Exports"), "Must define Key Exports section");
  assert.ok(content.includes("Dependencies"), "Must define Dependencies section");
  assert.ok(content.includes("Related Specs"), "Must define Related Specs section");
});

it("SKILL.md enforces slug validation before path construction", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  assert.ok(content.includes("[a-z0-9_-]"), "Must specify allowed slug character set");
  assert.ok(content.includes("path traversal") || content.includes(".."), "Must mention path traversal prevention");
  assert.ok(content.includes("path.resolve") || content.includes("prefix check"), "Must require boundary check after resolve");
});

it("SKILL.md defines --force flag behaviour for module docs", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  assert.ok(content.includes("--force"), "Must define --force flag");
  // --force must not override human content preservation
  const forceIdx = content.indexOf("--force");
  const humanIdx = content.indexOf("adev:human", forceIdx);
  assert.ok(humanIdx !== -1 || content.includes("human content is never overwritten"),
    "Must clarify human content is preserved even with --force");
});
```

- [ ] **Verify test fails**

```bash
node --test tests/skills/document.test.mjs
```
Expected: FAIL — module docs section not yet in SKILL.md

- [ ] **Implement**

Append the following section to `skills/document/SKILL.md` after Step 1:

```markdown
## Step 2: Generate docs/modules/<slug>.md

### Slug validation (for --module <slug> only)

Before performing any file system operations when `--module` is provided:

1. Validate the slug matches `^[a-z0-9_-]+$`. Reject any slug containing `/`, `\`, `..`, null bytes, or characters outside this set.
   - On failure: output error `"Invalid module slug '<slug>'. Slugs must match [a-z0-9_-]."` and exit 1.
2. Construct the resolved path: `path.resolve(projectRoot, 'docs/modules', slug + '.md')`.
3. Assert the resolved path starts with `path.resolve(projectRoot, 'docs/modules')`. This is the path traversal boundary check.
   - On failure: output error and exit 1.

### Determine modules to process

- If `--module <slug>` is provided: process only that module. If the slug is not found in `manifest.yaml`, output error `"Module '<slug>' not found in manifest."` and exit 1.
- Otherwise: process all modules listed in `manifest.yaml`.

### Create docs/modules/ directory

Create `docs/modules/` if it does not exist.

### For each module, generate docs/modules/<slug>.md

Apply marker protocol (same rules as Step 1) to any existing file at `docs/modules/<slug>.md`.

Build the module doc with these sections:

**Purpose**
Read the module's charter at `.context-index/specs/features/<slug>/charter.md`. Extract the `## Business Intent` section. If no charter exists, infer the purpose from the module's `paths` entries in `manifest.yaml`.

**Key Exports**
Filter `symbol-ranks.json` to symbols whose file path begins with any of the module's `paths` from `manifest.yaml`. Take up to 10 symbols ordered by importance score descending. For each, include:
- Symbol name
- Kind (function / class / interface / type / const)
- File location (relative path)
- Importance score
- Description: use the symbol's docstring if available, otherwise infer from name and kind.

If no symbols are found for the module, write the section with a note: "No symbols indexed — run /adev:repomap to populate."

**Dependencies**
From `dependency-graph.json`:
- **Inbound** (modules that import from this module): list module names
- **Outbound** (modules this module imports from): list module names

If the dependency graph has no data for this module, write: "No dependency data — run /adev:repomap to populate."

**Related Specs**
Glob `.context-index/specs/features/<slug>/`. For each `.md` file found (excluding `*.review.md` and `*.plan.md`), produce a relative markdown link. If no directory exists, write: "No specs found."

**Template:**

```markdown
# Module: <name>

> Generated by /adev:document on YYYY-MM-DD.

## Purpose

<charter Business Intent or inferred>

## Key Exports

| Symbol | Kind | Location | Score |
|--------|------|----------|-------|
| ...    | ...  | ...      | N     |

## Dependencies

**Inbound (modules that depend on this):** Module A, Module B

**Outbound (modules this depends on):** Module C

## Related Specs

- [charter.md](.context-index/specs/features/<slug>/charter.md)
- [spec-name.md](.context-index/specs/features/<slug>/spec-name.spec.md)

<!-- adev:generated -->
<!-- adev:human -->
```

### --force behaviour

When `--force` is set, skip diff comparison and regenerate all sections unconditionally. The `<!-- adev:human -->` preservation invariant still applies. If a module doc has `<!-- adev:human -->` but no `<!-- adev:generated -->` marker, `--force` does NOT override the skip — the file is still skipped with a warning.

### --check behaviour

When `--check` is set, output the diff for each module doc that would change. Do not write any files.
```

- [ ] **Verify test passes**

```bash
node --test tests/skills/document.test.mjs
```
Expected: PASS

- [ ] **Commit**

```bash
git add skills/document/SKILL.md tests/skills/document.test.mjs
git commit -m "feat(adev:document): add module docs generation with slug validation"
```

---

### Task 2: Extend test coverage for module docs acceptance criteria [specialist: none]

**Charter capability:** Generate module docs
**Files:**
- Modify: `tests/skills/document.test.mjs`

- [ ] **Write failing test**

```javascript
// Add to tests/skills/document.test.mjs

it("SKILL.md handles --module with slug not in manifest as exit 1", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  assert.ok(
    content.includes("not found in manifest"),
    "Must define error when --module slug is not in manifest"
  );
});

it("SKILL.md defines marker-skip behaviour for module docs", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  // Verify the human-marker-without-generated-marker skip rule is in the module section
  assert.ok(
    content.includes("adev:human") && content.includes("adev:generated"),
    "Must define both markers in the skill"
  );
});
```

- [ ] **Verify test fails**

```bash
node --test tests/skills/document.test.mjs
```
Expected: FAIL or PASS (if content from Task 1 already satisfies — in which case this task is a no-op implementation)

- [ ] **Implement**

Verify SKILL.md from Task 1 satisfies assertions. Add missing content if any assertion fails.

- [ ] **Verify test passes**

```bash
node --test tests/skills/document.test.mjs
```
Expected: PASS

- [ ] **Commit**

```bash
git add skills/document/SKILL.md tests/skills/document.test.mjs
git commit -m "test(adev:document): add test coverage for module docs acceptance criteria"
```

---

## Quality Gates

After all tasks are complete:

- Tests pass: `npm test`
- All acceptance criteria from `generate-module-docs.md` satisfied
