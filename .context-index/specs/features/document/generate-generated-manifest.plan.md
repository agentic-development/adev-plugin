# Implementation Plan: Generate GENERATED.md manifest

> **Methodology:** adev
> **Charter:** .context-index/specs/features/adev:document/charter.md
> **Spec:** .context-index/specs/features/adev:document/generate-generated-manifest.spec.md
> **Review:** PASS (2026-03-23)
> **Platform:** Node.js, JavaScript ESM (.mjs), no framework

**Goal:** Extend `skills/document/SKILL.md` with manifest generation: produce `docs/GENERATED.md` tracking all generated files with short commit SHA, last run date, and generated sections. Includes `--check` support, `--force` row refresh, and malformed-manifest recovery.

**Architecture:** Third and final section of the SKILL.md. Runs after Steps 1 and 2 as part of every `/adev:document` invocation. Reads the current state of `docs/` to enumerate generated files, reads git HEAD via `git rev-parse --short HEAD`, builds or updates the tracking table, and writes `docs/GENERATED.md`. All commit SHA values are validated as 7-character hex before being written.

**Depends on:** `generate-module-docs.plan.md` (SKILL.md must contain Steps 1 and 2 before this plan adds Step 3)

---

## File Structure

**Modify:**
- `skills/document/SKILL.md` — Add Step 3: Generate docs/GENERATED.md section
- `tests/skills/document.test.mjs` — Add tests for manifest section

**Reference (read, do not modify):**
- `.context-index/specs/features/adev:document/generate-generated-manifest.spec.md` — Source of truth for behaviors

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/adev:document/generate-generated-manifest.spec.md` (all behaviors and error cases)
- Charter: `.context-index/specs/features/adev:document/charter.md` (capability: GENERATED.md manifest)
- Constitution: `.context-index/constitution.md` (principle: minimize external dependencies — git SHA via child_process, no external libs)

### Task 2 Context
- Spec: `.context-index/specs/features/adev:document/generate-generated-manifest.spec.md` (acceptance criteria)
- Reference: `tests/skills/document.test.mjs` (extend this file)

### Task 3 Context
- Constitution: `.context-index/constitution.md` (quality gates command: `npm test`)
- All three specs' acceptance criteria

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3

---

### Task 1: Extend SKILL.md — manifest generation [specialist: none]

**Charter capability:** GENERATED.md manifest (must-have, v1) + Argument: --force (should-have, v1)
**Files:**
- Modify: `skills/document/SKILL.md` (append Step 3 section)

**Context to load:**
- `.context-index/specs/features/adev:document/generate-generated-manifest.spec.md` — behaviors 1-6 become instructions

- [ ] **Write failing test**

```javascript
// Add to tests/skills/document.test.mjs

it("SKILL.md contains manifest generation section", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  assert.ok(content.includes("GENERATED.md"), "Must reference GENERATED.md output file");
  assert.ok(content.includes("Last Commit"), "Must define Last Commit column");
  assert.ok(content.includes("Last Run"), "Must define Last Run column");
  assert.ok(content.includes("Generated Sections"), "Must define Generated Sections column");
});

it("SKILL.md validates commit SHA format before writing", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  assert.ok(
    content.includes("rev-parse --short") || content.includes("short SHA") || content.includes("7-character"),
    "Must specify short SHA (7 chars) from git rev-parse --short HEAD"
  );
});

it("SKILL.md defines --check flag for manifest", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  // --check appears in the manifest section (it also appears earlier, that's fine)
  assert.ok(content.includes("--check"), "Must define --check flag in manifest section");
});

it("SKILL.md handles malformed GENERATED.md with recovery", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  assert.ok(
    content.includes("malformed") || content.includes("cannot be parsed"),
    "Must handle malformed existing GENERATED.md"
  );
});
```

- [ ] **Verify test fails**

```bash
node --test tests/skills/document.test.mjs
```
Expected: FAIL — GENERATED.md section not yet in SKILL.md

- [ ] **Implement**

Append the following section to `skills/document/SKILL.md` after Step 2:

```markdown
## Step 3: Generate docs/GENERATED.md

This step runs after Steps 1 and 2 as part of every `/adev:document` invocation.

### Precondition check

If `docs/` does not exist at this point, output error:
> "docs/ not found. Run /adev:document to generate docs first."
Exit 1.

If `docs/` exists but contains no generated files (architecture.md or modules/), emit:
> "No generated docs found. Skipping GENERATED.md."
Exit 0.

### Read current commit

Run `git rev-parse --short HEAD` to get the current short SHA (7 hex characters).
Validate the output matches `^[0-9a-f]{7}$`. If it does not (e.g., not a git repo), use `"unknown"` as the value.

### Read or initialize the manifest

If `docs/GENERATED.md` exists:
- Attempt to parse the markdown table. A valid table has a header row, a separator row (`|---|`), and data rows.
- If parsing fails (malformed table structure): treat as missing, emit warning:
  > "GENERATED.md was malformed and has been regenerated."
  Proceed as if the file does not exist.
- If parsing succeeds: load existing rows as a map keyed by file path.

If `docs/GENERATED.md` does not exist: start with an empty map.

### Build the updated manifest table

Enumerate all generated files in `docs/`. A file is "generated" if it was produced in the current run (architecture.md, and any modules/<slug>.md written in Steps 1-2). Files not regenerated in the current run are "unchanged."

For each generated file, build a row:
- **File**: relative path from project root (e.g., `docs/architecture.md`)
- **Generated Sections**: pipe-delimited list of top-level section headings in the file (e.g., `Module Map | Dependency Flow | Entry Points | ADRs`)
- **Last Commit**: 7-character short SHA from git
- **Last Run**: today's date in YYYY-MM-DD format

For unchanged files (in the existing manifest but not regenerated in this run): keep their existing row as-is.

Sanitize all values before inserting into the table:
- File paths: strip `|`, `\n`, `\r` characters
- SHA: already validated as hex
- Section names: strip `|`, `\n`, `\r` characters

### Write docs/GENERATED.md

```markdown
# Generated Documentation Manifest

> Managed by /adev:document. Do not edit rows manually — run /adev:document to regenerate.

| File | Generated Sections | Last Commit | Last Run |
|------|--------------------|-------------|----------|
| docs/architecture.md | Module Map \| Dependency Flow \| Entry Points \| ADRs | abc1234 | 2026-03-23 |
| docs/modules/cli.md | Purpose \| Key Exports \| Dependencies \| Related Specs | abc1234 | 2026-03-23 |
```

### --force behaviour

When `--force` is set: update all rows (even unchanged files) with the current commit SHA and today's date.

### --check behaviour

When `--check` is set: output the diff of what rows would change without writing `docs/GENERATED.md`.
```

- [ ] **Verify test passes**

```bash
node --test tests/skills/document.test.mjs
```
Expected: PASS

- [ ] **Commit**

```bash
git add skills/document/SKILL.md tests/skills/document.test.mjs
git commit -m "feat(adev:document): add GENERATED.md manifest generation"
```

---

### Task 2: Final test coverage sweep — all three specs [specialist: none]

**Charter capability:** All v1 capabilities
**Files:**
- Modify: `tests/skills/document.test.mjs`

- [ ] **Write failing test**

```javascript
// Add to tests/skills/document.test.mjs

it("SKILL.md covers all three generation steps in order", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  const step1 = content.indexOf("Step 1");
  const step2 = content.indexOf("Step 2");
  const step3 = content.indexOf("Step 3");
  assert.ok(step1 !== -1, "Step 1 must be present");
  assert.ok(step2 !== -1, "Step 2 must be present");
  assert.ok(step3 !== -1, "Step 3 must be present");
  assert.ok(step1 < step2, "Step 1 must precede Step 2");
  assert.ok(step2 < step3, "Step 2 must precede Step 3");
});

it("SKILL.md defines Precondition Checks section", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  assert.ok(content.includes("Precondition"), "Must have precondition section");
});

it("SKILL.md defines all four argument flags", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  assert.ok(content.includes("--module"), "Must define --module flag");
  assert.ok(content.includes("--check"), "Must define --check flag");
  assert.ok(content.includes("--force"), "Must define --force flag");
});
```

- [ ] **Verify test fails**

```bash
node --test tests/skills/document.test.mjs
```
Expected: FAIL or PASS (if all content already present from Tasks 1-3 of prior plans)

- [ ] **Implement**

Verify SKILL.md satisfies all new assertions. Add any missing content. Ensure the Arguments section at the top of the skill lists `--module`, `--check`, and `--force`.

- [ ] **Verify test passes**

```bash
node --test tests/skills/document.test.mjs
```
Expected: PASS (all tests green)

- [ ] **Commit**

```bash
git add skills/document/SKILL.md tests/skills/document.test.mjs
git commit -m "test(adev:document): final coverage sweep for all three specs"
```

---

### Task 3: Full quality gate run [specialist: none]

**Charter capability:** All (quality gate verification)
**Files:** None (read-only verification)

- [ ] **Write failing test** (N/A — this task runs the full suite, not a new test)

- [ ] **Verify test fails** (N/A)

- [ ] **Implement** (N/A — just run the gates)

- [ ] **Verify test passes**

```bash
npm test
```
Expected: PASS — all existing tests plus new `tests/skills/document.test.mjs` green

- [ ] **Commit**

No files to commit if the full suite passes cleanly. If any fixes were needed, commit them:

```bash
git add -p
git commit -m "fix(adev:document): address issues found in full quality gate run"
```

---

## Quality Gates

After all tasks are complete:

- Tests pass: `npm test`
- `skills/document/SKILL.md` exists and has correct frontmatter
- All acceptance criteria from all three specs satisfied:
  - `generate-architecture.md` — 12 criteria
  - `generate-module-docs.md` — 14 criteria
  - `generate-generated-manifest.md` — 10 criteria
