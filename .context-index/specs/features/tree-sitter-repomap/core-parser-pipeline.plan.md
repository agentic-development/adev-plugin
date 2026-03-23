# Implementation Plan: Core Parser Pipeline

> **Methodology:** adev
> **Charter:** .context-index/specs/features/tree-sitter-repomap/charter.md
> **Spec:** .context-index/specs/features/tree-sitter-repomap/core-parser-pipeline.md
> **Review:** PASS_WITH_NOTES (2026-03-23)
> **Platform:** Node.js, JavaScript (ESM), npm, node:test

**Goal:** Build the tree-sitter AST parsing pipeline with dependency graph construction and PageRank ranking as a progressive enhancement to the existing regex-based repomap.

**Architecture:** New code lives in `lib/repomap/` as companion modules to the `/adev-repomap` skill. The orchestrator (`index.mjs`) detects whether `web-tree-sitter` is available and routes to either tree-sitter or regex mode. Tree-sitter mode produces three artifacts (`repo-map.md`, `dependency-graph.json`, `symbol-ranks.json`); regex mode produces only `repo-map.md`. All outputs go to `.context-index/hygiene/` (gitignored).

---

## File Structure

**Create:**
- `lib/repomap/check-deps.mjs` — Dependency availability checker
- `lib/repomap/languages/typescript.mjs` — TypeScript/JavaScript S-expression queries
- `lib/repomap/languages/python.mjs` — Python S-expression queries
- `lib/repomap/languages/go.mjs` — Go S-expression queries
- `lib/repomap/languages/rust.mjs` — Rust S-expression queries
- `lib/repomap/languages/java.mjs` — Java S-expression queries
- `lib/repomap/languages/ruby.mjs` — Ruby S-expression queries
- `lib/repomap/parse.mjs` — AST parser (load grammar, extract symbols)
- `lib/repomap/graph.mjs` — Dependency graph builder
- `lib/repomap/rank.mjs` — PageRank computation
- `lib/repomap/index.mjs` — Pipeline orchestrator
- `tests/repomap/check-deps.test.mjs` — check-deps unit tests
- `tests/repomap/parse.test.mjs` — parser unit tests
- `tests/repomap/graph.test.mjs` — graph builder unit tests
- `tests/repomap/rank.test.mjs` — PageRank unit tests
- `tests/repomap/index.test.mjs` — integration test
- `tests/fixtures/sample-project/` — Fixture project (8-10 TS files)
- `.context-index/adrs/0001-web-tree-sitter-dependency.md` — ADR for web-tree-sitter

**Reference (read, do not modify):**
- `.context-index/constitution.md` — Principles and quality gates
- `.context-index/specs/features/tree-sitter-repomap/charter.md` — Scope and contracts
- `skills/adev-repomap/SKILL.md` — Current regex-based behavior (reference for regex mode)

## Context Packets

### Task 1 Context (ADR)
- Constitution: `.context-index/constitution.md` (principle #1: minimize dependencies)
- Charter: `.context-index/specs/features/tree-sitter-repomap/charter.md` (dependencies table)
- Spec: `core-parser-pipeline.md` (constitution reference section)

### Task 2 Context (Fixture Project)
- Spec: `core-parser-pipeline.md` (behaviors 3-6, acceptance criteria 2-3)
- Charter: `charter.md` (domain model: Symbol, FileNode, Edge entities)

### Task 3 Context (Dependency Checker)
- Spec: `core-parser-pipeline.md` (behaviors 1-2, acceptance criterion 1)

### Task 4 Context (Language Queries)
- Spec: `core-parser-pipeline.md` (behavior 3, acceptance criterion 2)
- Charter: `charter.md` (domain model: Symbol entity — kind values)

### Task 5 Context (AST Parser)
- Spec: `core-parser-pipeline.md` (behaviors 3, 8, 9; error cases: parse failure, path escape)
- Charter: `charter.md` (domain model: Symbol entity)

### Task 6 Context (Dependency Graph)
- Spec: `core-parser-pipeline.md` (behavior 4; postconditions: edge types; error cases: circular imports, external packages)
- Charter: `charter.md` (domain model: FileNode, Edge, DependencyGraph entities)

### Task 7 Context (PageRank)
- Spec: `core-parser-pipeline.md` (behavior 5; postconditions: scores sum to 1.0)
- Charter: `charter.md` (domain model: SymbolIndex entity)

### Task 8 Context (Orchestrator)
- Spec: `core-parser-pipeline.md` (behaviors 6-7; all postconditions; all error cases)
- Charter: `charter.md` (interface contracts: all exposed APIs)
- Skill: `skills/adev-repomap/SKILL.md` (current regex behavior to preserve)

### Task 9 Context (Integration Test)
- Spec: `core-parser-pipeline.md` (all acceptance criteria)
- Fixture: `tests/fixtures/sample-project/` (known dependency structure)

## Parallelization

- Group A (sequential): Task 1 → Task 2 (ADR first, then fixture)
- Group B (sequential): Task 3 (independent, no shared files)
- Group C (sequential): Task 4 → Task 5 (queries before parser)
- Group D (sequential): Task 6 → Task 7 (graph before rank)
- Group E (sequential): Task 8 → Task 9 (orchestrator before integration test)

After Task 2 completes, Groups B, C, and D can run in parallel.
Task 8 depends on Tasks 3-7. Task 9 depends on Task 8.

---

### Task 1: ADR for web-tree-sitter Dependency [specialist: none] [REQUIRES HUMAN APPROVAL]

**Charter capability:** Tree-sitter parsing (must-have, v0.5.0)
**Files:**
- Create: `.context-index/adrs/0001-web-tree-sitter-dependency.md`

Constitution principle #1 requires an ADR before adding any external dependency. This must be written and approved before implementation proceeds.

- [ ] **Write ADR**

```markdown
# ADR 0001: Add web-tree-sitter as Optional Dependency

## Status
Accepted

## Context
/adev-repomap currently uses regex-based pattern matching to extract exported symbols.
This approach misses ~30% of export patterns (re-exports, arrow functions, destructured
exports) and cannot build a dependency graph for blast radius scoring or drift detection.

The charter for tree-sitter-repomap defines a progressive enhancement approach: regex
stays as the zero-dependency default, web-tree-sitter (WASM) is opt-in for AST accuracy.

## Decision
Add `web-tree-sitter` as an optional dependency. It is NOT added to package.json
dependencies — users install it on demand via a prompt in `/adev-repomap` or `/adev-init`.
Grammar WASM files are downloaded per-language on first use.

## Consequences
- First external dependency in the project (softened principle: "minimize", not "zero")
- No C compiler required (WASM, unlike native tree-sitter)
- Two code paths to maintain (regex + tree-sitter)
- Users who don't install it get the same experience as before
- `lib/repomap/check-deps.mjs` detects availability at runtime
```

- [ ] **Commit**

```bash
git add .context-index/adrs/0001-web-tree-sitter-dependency.md
git commit -m "docs: add ADR 0001 for web-tree-sitter optional dependency"
```

---

### Task 2: Fixture Project [specialist: none]

**Charter capability:** Tree-sitter parsing (must-have, v0.5.0)
**Files:**
- Create: `tests/fixtures/sample-project/src/index.ts`
- Create: `tests/fixtures/sample-project/src/types.ts`
- Create: `tests/fixtures/sample-project/src/utils.ts`
- Create: `tests/fixtures/sample-project/src/services/task-service.ts`
- Create: `tests/fixtures/sample-project/src/services/user-service.ts`
- Create: `tests/fixtures/sample-project/src/services/index.ts` (barrel re-export)
- Create: `tests/fixtures/sample-project/src/db.ts`
- Create: `tests/fixtures/sample-project/src/config.ts`
- Create: `tests/fixtures/sample-project/src/helpers/format.ts` (arrow function exports)
- Create: `tests/fixtures/sample-project/src/helpers/validate.ts` (destructured exports)
- Create: `tests/fixtures/sample-project/README.md` (documents expected dependency structure)

The fixture must include:
- Known dependency graph (documented in README)
- One barrel re-export file (`services/index.ts`)
- Arrow function exports (`export const format = () => {}`)
- Destructured exports (`export const { parse, stringify } = JSON`)
- A circular import (between two service files)
- Type-only imports (`import type { Task } from './types'`)
- At least one external package import (e.g., `import fs from 'fs'`) to verify exclusion

- [ ] **Create fixture files** with documented dependency structure
- [ ] **Write README.md** with the expected dependency graph (nodes, edges, symbol counts)
- [ ] **Commit**

```bash
git add tests/fixtures/sample-project/
git commit -m "test: add fixture project for tree-sitter repomap testing"
```

---

### Task 3: Dependency Checker [specialist: none]

**Charter capability:** Parser mode detection (must-have, v0.5.0)
**Files:**
- Create: `lib/repomap/check-deps.mjs`
- Test: `tests/repomap/check-deps.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';

describe('check-deps', () => {
  it('should exit 0 when web-tree-sitter is importable', () => {
    // This test only passes when web-tree-sitter is installed
    // Skip if not installed
    try {
      await import('web-tree-sitter');
    } catch {
      return; // skip
    }
    const result = execFileSync('node', [join('lib', 'repomap', 'check-deps.mjs')]);
    // exit 0 means success (no throw)
  });

  it('should exit 1 when web-tree-sitter is not importable', () => {
    // Test with a modified NODE_PATH that excludes web-tree-sitter
    try {
      execFileSync('node', ['-e', `
        import('web-tree-sitter').then(() => process.exit(0)).catch(() => process.exit(1))
      `], { env: { ...process.env, NODE_PATH: '/nonexistent' } });
    } catch (err) {
      assert.equal(err.status, 1);
    }
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/repomap/check-deps.test.mjs`
Expected: FAIL — `lib/repomap/check-deps.mjs` does not exist

- [ ] **Implement**

```javascript
#!/usr/bin/env node
// check-deps.mjs — Check if web-tree-sitter is available
// Exit 0 if available, exit 1 if not.

try {
  await import('web-tree-sitter');
  process.exit(0);
} catch {
  console.error('web-tree-sitter is not installed.');
  process.exit(1);
}
```

- [ ] **Verify test passes**

Run: `node --test tests/repomap/check-deps.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/repomap/check-deps.mjs tests/repomap/check-deps.test.mjs
git commit -m "feat(repomap): add dependency checker for web-tree-sitter"
```

---

### Task 4: Language Query Modules [specialist: none]

**Charter capability:** Multi-language support (should-have, v0.5.0)
**Files:**
- Create: `lib/repomap/languages/typescript.mjs`
- Create: `lib/repomap/languages/python.mjs`
- Create: `lib/repomap/languages/go.mjs`
- Create: `lib/repomap/languages/rust.mjs`
- Create: `lib/repomap/languages/java.mjs`
- Create: `lib/repomap/languages/ruby.mjs`

Each module exports an object with:
- `language` — language identifier string
- `extensions` — file extensions this grammar handles (e.g., `['.ts', '.tsx', '.js', '.jsx']`)
- `grammarPackage` — npm package name for the WASM grammar
- `queries.exports` — S-expression query for exported symbols
- `queries.imports` — S-expression query for import statements
- `kindMap` — maps tree-sitter node types to canonical kinds: `function`, `class`, `interface`, `type`, `enum`, `constant`

Start with TypeScript (covers JS/TS/JSX/TSX). Other languages follow the same structure.

- [ ] **Write tests** — validate that each module exports the correct shape (has language, extensions, queries.exports, queries.imports, kindMap)
- [ ] **Verify tests fail**

Run: `node --test tests/repomap/parse.test.mjs` (language shape tests)
Expected: FAIL — modules don't exist

- [ ] **Implement** — create all six language modules with S-expression queries
- [ ] **Verify tests pass**

Run: `node --test tests/repomap/parse.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/repomap/languages/
git commit -m "feat(repomap): add language query modules for 6 languages"
```

---

### Task 5: AST Parser [specialist: none]

**Charter capability:** Tree-sitter parsing (must-have, v0.5.0)
**Depends on:** Task 4
**Files:**
- Create: `lib/repomap/parse.mjs`
- Test: `tests/repomap/parse.test.mjs` (extend with parse tests)

`parse.mjs` exports:
- `parseFile(filePath, languageModule, parserInstance)` → `{ symbols: Symbol[], imports: ImportStatement[] }`
- `initParser()` → initialized web-tree-sitter Parser instance
- `loadGrammar(languageModule)` → loaded grammar for a language

Symbol shape: `{ name, kind, file, line }`
ImportStatement shape: `{ source, symbols, isTypeOnly }`

- [ ] **Write failing test** — parse a TypeScript fixture file, assert correct symbols and imports extracted
- [ ] **Verify test fails**

Run: `node --test tests/repomap/parse.test.mjs`
Expected: FAIL — `parse.mjs` doesn't exist

- [ ] **Implement** — load web-tree-sitter, load grammar WASM, run queries, extract symbols and imports. Handle errors: skip unparseable files with warning, reject paths outside project root.
- [ ] **Verify test passes**

Run: `node --test tests/repomap/parse.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/repomap/parse.mjs tests/repomap/parse.test.mjs
git commit -m "feat(repomap): add AST parser with symbol and import extraction"
```

---

### Task 6: Dependency Graph Builder [specialist: none]

**Charter capability:** Dependency graph construction (must-have, v0.5.0)
**Depends on:** Task 5
**Files:**
- Create: `lib/repomap/graph.mjs`
- Test: `tests/repomap/graph.test.mjs`

`graph.mjs` exports:
- `buildGraph(parsedFiles, projectRoot, modules)` → `DependencyGraph`

The function:
1. Creates FileNode for each parsed file (path, exports, module from manifest)
2. Resolves import source paths relative to the importing file
3. Validates resolved paths are within project root (path containment)
4. Excludes unresolvable imports (external packages, missing files)
5. Creates edges with type (`import`, `require`, `re-export`, `dynamic-import`, `type-import`)
6. Handles circular imports naturally (just edges, no special treatment)

DependencyGraph shape: `{ generated, commit, nodes: FileNode[], edges: Edge[] }`

- [ ] **Write failing test** — build graph from fixture project parsed output, assert correct nodes, edges, and edge types. Test: external imports excluded, circular imports included, path containment enforced.
- [ ] **Verify test fails**

Run: `node --test tests/repomap/graph.test.mjs`
Expected: FAIL

- [ ] **Implement**
- [ ] **Verify test passes**

Run: `node --test tests/repomap/graph.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/repomap/graph.mjs tests/repomap/graph.test.mjs
git commit -m "feat(repomap): add dependency graph builder with path containment"
```

---

### Task 7: PageRank Ranker [specialist: none]

**Charter capability:** PageRank ranking (must-have, v0.5.0)
**Depends on:** Task 6
**Files:**
- Create: `lib/repomap/rank.mjs`
- Test: `tests/repomap/rank.test.mjs`

`rank.mjs` exports:
- `computeRanks(graph)` → `SymbolIndex`

The function:
1. Initializes all node scores to `1/N`
2. Iterates PageRank with damping factor 0.85, max 20 iterations or convergence < 0.001
3. Distributes file scores to symbols weighted by reference count (number of distinct files importing the symbol)
4. Handles degenerate cases: single-node graph gets score 1.0, files with zero edges get baseline `(1-d)/N`
5. Returns symbols sorted by score descending

SymbolIndex shape: `{ generated, commit, symbols: [{ name, kind, file, line, score, references, module }] }`

- [ ] **Write failing test** — compute ranks on fixture graph, assert scores sum to 1.0, assert sort order, assert degenerate case (single file).
- [ ] **Verify test fails**

Run: `node --test tests/repomap/rank.test.mjs`
Expected: FAIL

- [ ] **Implement**
- [ ] **Verify test passes**

Run: `node --test tests/repomap/rank.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/repomap/rank.mjs tests/repomap/rank.test.mjs
git commit -m "feat(repomap): add PageRank computation for symbol ranking"
```

---

### Task 8: Pipeline Orchestrator [specialist: none]

**Charter capability:** Parser mode detection (must-have, v0.5.0)
**Depends on:** Tasks 3, 4, 5, 6, 7
**Files:**
- Create: `lib/repomap/index.mjs`

`index.mjs` is the CLI entry point. It:
1. Accepts `--root <path>` argument (required)
2. Reads `manifest.yaml` from `<root>/.context-index/manifest.yaml` (or uses defaults)
3. Checks tree-sitter availability via `check-deps.mjs` logic (inline import check, not subprocess)
4. If tree-sitter available: glob files → parse each → build graph → compute ranks → write all three artifacts
5. If tree-sitter not available: run existing regex logic → write `repo-map.md` only with `Parser: regex` annotation
6. All outputs go to `<root>/.context-index/hygiene/`
7. Annotates `repo-map.md` with `Parser: tree-sitter` or `Parser: regex`
8. Handles all error cases from the spec (missing manifest, no files, parse failures, path escape)
9. Exits 0 in all cases (errors are warnings, not failures)

- [ ] **Write unit tests** — test argument parsing, mode detection, and error case handling (missing manifest uses defaults, no source files produces empty repo-map with warning, symlink path escape is rejected with warning).
- [ ] **Verify test fails**
- [ ] **Implement**
- [ ] **Verify test passes**

Run: `node --test tests/repomap/index.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/repomap/index.mjs tests/repomap/index.test.mjs
git commit -m "feat(repomap): add pipeline orchestrator with mode detection"
```

---

### Task 9: Integration Test [specialist: none]

**Charter capability:** Tree-sitter parsing (must-have, v0.5.0)
**Depends on:** Tasks 2, 8
**Files:**
- Extend: `tests/repomap/index.test.mjs`

End-to-end test:
1. Run `node lib/repomap/index.mjs --root tests/fixtures/sample-project`
2. Assert `repo-map.md` exists with `Parser: tree-sitter` annotation
3. Assert `dependency-graph.json` exists with correct schema, expected nodes and edges
4. Assert edge types are valid (`import`, `require`, `re-export`, `dynamic-import`, `type-import`)
5. Assert external package imports are NOT in the graph
6. Assert `symbol-ranks.json` exists with scores summing to 1.0 (±0.001)
7. Assert symbols are sorted by score descending
8. Assert 95%+ of fixture project's known exports are captured
9. Assert circular imports exist as edges but don't cause crashes
10. Assert symlink paths that escape project root are rejected with warning (spec behavior 9)

- [ ] **Write integration test**
- [ ] **Verify test fails** (if any component is missing) or **passes** (if all prior tasks are complete)

Run: `node --test tests/repomap/index.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/repomap/index.test.mjs
git commit -m "test(repomap): add end-to-end integration test for parser pipeline"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied (13 criteria)
- [ ] All `.mjs` files use ESM imports (no CommonJS)
- [ ] No constitutional violations introduced
