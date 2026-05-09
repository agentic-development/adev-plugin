# Implementation Plan: Generate architecture.md

> **Methodology:** adev
> **Charter:** .context-index/specs/features/adev:document/charter.md
> **Spec:** .context-index/specs/features/adev:document/generate-architecture.spec.md
> **Review:** PASS (2026-03-23)
> **Platform:** Node.js, JavaScript ESM (.mjs), no framework

**Goal:** Create the `skills/document/SKILL.md` base structure with precondition checks, context loading, and architecture doc generation (module map, dependency flow, entry points, ADR links, marker-aware preservation).

**Note:** Module docs, GENERATED.md manifest, `--module`, and `--force` capabilities are covered in `generate-module-docs.plan.md` and `generate-generated-manifest.plan.md` respectively. This plan covers only the `generate-architecture.md` spec.

**Architecture:** `adev:document` is a pure-markdown skill — all logic lives in `SKILL.md` as Claude instructions, following the same pattern as `skills/repomap/SKILL.md`. No companion code is needed; Claude reads JSON/YAML/Markdown files using its built-in Read/Glob/Write tools. The marker protocol (`<!-- adev:generated -->` / `<!-- adev:human -->`) defines a two-zone file layout: generated content above the divider, human content below it, preserved across regenerations.

---

## File Structure

**Create:**
- `skills/document/SKILL.md` — Skill instructions for Claude (architecture generation section)
- `tests/skills/document.test.mjs` — Structural tests: skill file exists, frontmatter valid, required sections present

**Reference (read, do not modify):**
- `skills/repomap/SKILL.md` — Reference pattern for skill structure and frontmatter format
- `.context-index/specs/features/adev:document/generate-architecture.spec.md` — Source of truth for behaviors
- `.context-index/specs/features/adev:document/charter.md` — Charter interface contracts and invariants

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/adev:document/generate-architecture.spec.md` (all behaviors and acceptance criteria)
- Charter: `.context-index/specs/features/adev:document/charter.md` (capability: Generate architecture.md)
- Reference: `skills/repomap/SKILL.md` (frontmatter format and step structure pattern)
- Constitution: `.context-index/constitution.md` (principle: skills are primarily markdown)

### Task 2 Context
- Spec: `.context-index/specs/features/adev:document/generate-architecture.spec.md` (acceptance criteria)
- Reference: `tests/cli.test.mjs` (test file patterns: describe/it, node:test, assert/strict)
- Reference: `tests/helpers.mjs` (PLUGIN_ROOT export for path resolution)

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2 tests the file created in Task 1)

---

### Task 1: Write SKILL.md — base structure and architecture generation [specialist: none]

**Charter capability:** Generate architecture.md (must-have, v1)
**Files:**
- Create: `skills/document/SKILL.md`

**Context to load:**
- `skills/repomap/SKILL.md` — follow this frontmatter and step-naming pattern
- `.context-index/specs/features/adev:document/generate-architecture.spec.md` — all behaviors are instructions

- [ ] **Write failing test**

```javascript
// tests/skills/document.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "adev:document", "SKILL.md");

describe("adev:document skill", () => {
  it("SKILL.md exists at the correct path", () => {
    assert.ok(existsSync(SKILL_PATH), "skills/document/SKILL.md must exist");
  });

  it("SKILL.md has required frontmatter fields", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.startsWith("---\n"), "Must start with YAML frontmatter");
    assert.ok(content.includes("name: adev:document"), "Must have name field");
    assert.ok(content.includes("description:"), "Must have description field");
  });

  it("SKILL.md contains architecture generation section", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("architecture.md"), "Must reference architecture.md output");
    assert.ok(content.includes("dependency-graph.json"), "Must reference dependency-graph.json input");
    assert.ok(content.includes("adev:generated"), "Must define the generated content marker");
    assert.ok(content.includes("adev:human"), "Must define the human content marker");
  });
});
```

- [ ] **Verify test fails**

```bash
node --test tests/skills/document.test.mjs
```
Expected: FAIL — `skills/document/SKILL.md must exist` (file does not exist yet)

- [ ] **Implement**

Create `skills/document/SKILL.md` with:

```markdown
---
name: adev:document
description: "Generate human-readable developer documentation in docs/ from repomap output. Produces docs/architecture.md (module map, dependency flow, entry points, ADR links), docs/modules/<slug>.md for each module, and docs/GENERATED.md manifest. Use when the user runs /adev:document, wants to generate project docs, or wants to update architecture documentation."
---

# Generate Developer Documentation

Generate human-readable documentation in `docs/` from repomap output. Shifts orientation from `.context-index/orientation/` (agent-focused) to `docs/` (human-focused), enabling developers to browse architecture docs on GitHub.

## Arguments

- No arguments: generate all docs (architecture.md + all module docs + GENERATED.md)
- `--module <slug>`: generate or update a single module doc only
- `--check`: dry-run — show what would change without writing to disk
- `--force`: regenerate all sections unconditionally (human content still preserved)

## Precondition Checks

Before generating any documentation, verify:

1. **Repomap data:** Check that `.context-index/hygiene/dependency-graph.json` exists. If missing, output error and stop:
   > "Run /adev:repomap first. /adev:document requires the dependency graph."

2. **Symbol index:** Check that `.context-index/hygiene/symbol-ranks.json` exists. If missing, output error and stop:
   > "Run /adev:repomap first. /adev:document requires the symbol index."

3. **Manifest:** Check that `.context-index/manifest.yaml` exists. If missing, output error and stop:
   > "Run /adev:init first. /adev:document requires manifest.yaml."

4. **docs/ directory:** Create `docs/` if it does not exist.

## Marker Protocol

All generated files use a two-zone layout to support safe regeneration:

```
[generated content here — regenerated on every run]

<!-- adev:generated -->

[human content here — NEVER overwritten]

<!-- adev:human -->
```

Rules:
- If a file has both markers: regenerate everything above `<!-- adev:generated -->`, preserve everything after `<!-- adev:human -->`.
- If a file has `<!-- adev:human -->` but NOT `<!-- adev:generated -->`: treat the file as human-owned. Emit a warning and skip — do NOT overwrite. Exit 0.
- If a file has `<!-- adev:generated -->` but no `<!-- adev:human -->`: regenerate. No human section to preserve.
- If a file does not exist or has neither marker: write fresh content.

## Step 1: Generate docs/architecture.md

### Load inputs

Read all of:
- `.context-index/hygiene/dependency-graph.json` — module edges and inbound/outbound counts
- `.context-index/hygiene/symbol-ranks.json` — symbol importance rankings per module
- `.context-index/manifest.yaml` — module list with slugs, names, and paths
- `.context-index/constitution.md` — Identity section for project description
- `.context-index/platform-context.yaml` — tech stack
- `.context-index/specs/features/*/charter.md` — Business Intent per module

### Build module map

Create a markdown table with one row per module from `manifest.yaml`. For each module:
- **Module name**: from `manifest.yaml` `modules[].name`
- **Purpose**: from the module's charter `## Business Intent` section. If no charter exists, infer from the module's path and name.
- **Key exports**: top 3 symbols by importance score from `symbol-ranks.json` filtered to the module's `paths`. If no data, write "—".
- **Inbound deps**: count of edges where this module is the target in `dependency-graph.json`.
- **Outbound deps**: count of edges where this module is the source in `dependency-graph.json`.

### Build dependency flow

Write a prose paragraph (3-5 sentences) describing how modules relate, based on edge data from `dependency-graph.json`:
- Identify **core modules**: high inbound count (many modules depend on them).
- Identify **leaf modules**: high outbound count (they depend on many others), low inbound.
- Name the key dependency chains.

### Identify entry points

From `dependency-graph.json`, find all files with zero inbound edges. List them as a bullet list of file paths. These are the top-level entry points to the project.

### Build ADR links

Glob `.context-index/adrs/*.md` (excluding `.template.md`). For each ADR file, read its `## Status` and first heading, then produce a markdown link: `[ADR NNNN: Title](path/to/adr.md) — Status`.

### Assemble and write

Assemble `docs/architecture.md` with this structure:

```markdown
# Architecture: <project name from manifest>

> Generated by /adev:document on YYYY-MM-DD. Edit content below `<!-- adev:human -->` freely.

## Module Map

| Module | Purpose | Key Exports | Inbound Deps | Outbound Deps |
|--------|---------|-------------|--------------|---------------|
| ...    | ...     | ...         | N            | N             |

## Dependency Flow

[prose paragraph]

## Entry Points

- `path/to/entry.mjs`
- ...

## Architecture Decision Records

- [ADR 0001: Title](path) — Accepted
- ...

<!-- adev:generated -->
<!-- adev:human -->
```

Apply marker protocol before writing (check for existing markers if file exists).

If `--check` is set: print the diff of what would change (old vs new content) without writing.
```

- [ ] **Verify test passes**

```bash
node --test tests/skills/document.test.mjs
```
Expected: PASS (all 3 tests green)

- [ ] **Commit**

Branch: `feat/adev:document/implementation`

```bash
git add skills/document/SKILL.md tests/skills/document.test.mjs
git commit -m "feat(adev:document): add skill base and architecture generation"
```

---

### Task 2: Test coverage for all generate-architecture.md acceptance criteria [specialist: none]

**Charter capability:** Generate architecture.md (acceptance criteria #5–#10)
**Files:**
- Modify: `tests/skills/document.test.mjs`
- Modify: `skills/document/SKILL.md` (if any assertions fail)

**Context to load:**
- `.context-index/specs/features/adev:document/generate-architecture.spec.md` (acceptance criteria #5–#10)

- [ ] **Write failing test**

Add the following tests to `tests/skills/document.test.mjs` inside the existing `describe("adev:document skill", ...)` block:

```javascript
// Acceptance criterion #5: entry points from dependency-graph.json (not symbol-ranks.json)
it("SKILL.md sources entry points from dependency-graph.json", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  const afterEntryPoint = content.slice(content.toLowerCase().indexOf("entry point"));
  assert.ok(
    afterEntryPoint.includes("dependency-graph.json"),
    "Entry points section must reference dependency-graph.json"
  );
  assert.ok(
    afterEntryPoint.includes("zero inbound") ||
    afterEntryPoint.includes("zero-inbound") ||
    afterEntryPoint.includes("no inbound"),
    "Entry points instruction must describe zero-inbound-edge files"
  );
});

// Acceptance criterion #6: ADR links
it("SKILL.md instructs scanning .context-index/adrs/ for ADR links", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  assert.ok(content.includes(".context-index/adrs/"), "Must reference .context-index/adrs/ for ADR links");
  assert.ok(content.includes(".template.md") || content.includes("excluding"), "Must exclude .template.md from ADR scan");
});

// Acceptance criterion #7: marker preservation — both markers defined with canonical order
it("SKILL.md defines canonical two-zone marker layout", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  const generatedIdx = content.indexOf("adev:generated");
  const humanIdx = content.indexOf("adev:human");
  assert.ok(generatedIdx !== -1, "Must define adev:generated marker");
  assert.ok(humanIdx !== -1, "Must define adev:human marker");
  // In the canonical layout definition, adev:generated appears before adev:human
  assert.ok(generatedIdx < humanIdx, "Canonical layout: adev:generated must be defined before adev:human");
});

// Acceptance criterion #8: human-marker-without-generated-marker → skip with warning
it("SKILL.md instructs skip-with-warning when human marker present without generated marker", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  assert.ok(
    content.includes("human-owned") || content.includes("human owned") ||
    (content.includes("adev:human") && content.includes("skip") && content.includes("warning")),
    "Must instruct Claude to skip files that have adev:human but no adev:generated, with a warning"
  );
  assert.ok(
    content.includes("do NOT overwrite") || content.includes("refuse to overwrite") || content.includes("Refusing to overwrite"),
    "Must explicitly say the file will NOT be overwritten"
  );
});

// Acceptance criterion #9: --check shows diff without writing
it("SKILL.md defines --check as diff-without-write", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  assert.ok(content.includes("--check"), "Must define --check flag");
  assert.ok(
    content.includes("without writing") || content.includes("do not write") || content.includes("dry-run"),
    "--check must be described as not writing to disk"
  );
});

// Acceptance criterion #10: errors when repomap data or manifest missing
it("SKILL.md defines error messages for all missing preconditions", () => {
  const content = readFileSync(SKILL_PATH, "utf8");
  assert.ok(
    content.includes("Run /adev:repomap first"),
    "Must include exact error message for missing dependency-graph.json"
  );
  assert.ok(
    content.includes("Run /adev:repomap first") && content.includes("symbol index"),
    "Must include error message for missing symbol-ranks.json"
  );
  assert.ok(
    content.includes("Run /adev:init first"),
    "Must include exact error message for missing manifest.yaml"
  );
});
```

- [ ] **Verify test fails**

```bash
node --test tests/skills/document.test.mjs
```
Expected: FAIL on at least the new tests (assertions not yet satisfied by Task 1's SKILL.md unless they were already included)

- [ ] **Implement**

Verify the SKILL.md written in Task 1 satisfies each new assertion. For any failing assertion, update the relevant section of `SKILL.md`:

- If entry points instruction doesn't explicitly say `dependency-graph.json`: update the "Identify entry points" instruction.
- If `.template.md` exclusion is missing from ADR scan: add `(excluding .template.md)` to the ADR Glob instruction.
- If the skip-with-warning wording is missing: ensure the Marker Protocol section contains the exact phrase "do NOT overwrite" and "Emit a warning and skip".
- If `--check` description doesn't say "without writing": update the `--check` behaviour line.
- If precondition error messages don't match exactly: update the Precondition Checks section.

- [ ] **Verify test passes**

```bash
node --test tests/skills/document.test.mjs
```
Expected: PASS — all tests green (3 from Task 1 + 6 from Task 2 = 9 tests total)

- [ ] **Commit**

```bash
git add skills/document/SKILL.md tests/skills/document.test.mjs
git commit -m "test(adev:document): add full acceptance criteria coverage for architecture generation"
```

---

## Quality Gates

After all tasks are complete:

- Tests pass: `npm test`
- All acceptance criteria from `generate-architecture.md` satisfied
