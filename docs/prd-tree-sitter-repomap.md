# PRD: Tree-Sitter AST Repomap with Dependency Graph

**Date:** 2026-03-22
**Author:** dpavancini
**Status:** Draft
**Version:** v0.5.0 target

## Problem

`/adev-repomap` currently uses regex-based pattern matching (Grep) to extract exported symbols. This approach:

1. **Misses symbols** that regex cannot capture: re-exports (`export { foo } from './bar'`), default exports assigned after declaration, arrow function exports (`export const x = () => {}`), destructured exports, and nested definitions.
2. **Cannot distinguish visibility**: private vs. public class methods look the same to regex. A `private validate()` and `async create()` are both captured as class methods.
3. **Has no dependency graph**: blast radius in `/adev-route` is estimated by file count heuristic, not by tracing actual import chains. Spec-to-code drift in `/adev-hygiene` compares names but cannot detect structural changes (e.g., a function moved between files).
4. **Reference counting is noisy**: grepping for a symbol name like `db` produces false positives from comments, strings, and partial matches.

Research on Blitzy, Devin, Augment Code, Greptile, Sourcegraph/Cody, and Aider confirms the industry is converging on AST-based structural indexing as the foundation for agentic codebase understanding. Aider's tree-sitter + PageRank approach produces an 8.5-13k token repo map that captures the full export surface of a codebase. This is the model we follow.

**Research reference:** `agentic-dev-content/research/agentic-codebase-orchestration.md`

## Goals

1. Replace regex extraction in `/adev-repomap` with tree-sitter AST parsing for accurate symbol discovery.
2. Build a file-level dependency graph from import/require statements.
3. Apply PageRank-style ranking to symbols based on the dependency graph (not just grep hit counts).
4. Feed the dependency graph into `/adev-route` for evidence-based blast radius scoring.
5. Feed the structural index into `/adev-hygiene` for precise spec-to-code drift detection.
6. Feed ranked symbols into `/adev-implement` context packet assembly.

## Non-Goals

- Semantic embeddings or vector search (L3 layer, deferred to a future version).
- Auto-generated module documentation / DeepWiki equivalent (see PRD: `/adev-document`).
- MCP server for external tool access to the index (separate PRD).
- Real-time incremental parsing on file save (batch mode only for v0.5).

## Design Principles

1. **Do not fight Anthropic's architecture.** The tree output is consumed by the orchestration layer (plan, route, review, validate, hygiene, recover). Implementation subagents still use agentic search (Glob/Grep/Read). The tree tells the orchestration *where* to point agents, not replaces agent search.
2. **Tree-sitter is a hard requirement, not optional.** The regex approach is being replaced, not supplemented. If tree-sitter is not installed, `/adev-repomap` must error with a clear installation message. No silent fallback. The user must explicitly acknowledge and install the dependency.
3. **Output format stays markdown + JSON.** The primary output is still `.context-index/hygiene/repo-map.md` (human-readable). Two new JSON files are added for machine consumption by other skills.

## Architecture

### New Files

```
lib/
  repomap/
    parse.mjs          # Tree-sitter parsing: file → symbol list
    graph.mjs           # Dependency graph construction from imports
    rank.mjs            # PageRank computation on the dependency graph
    index.mjs           # Orchestrator: glob files → parse → graph → rank → output
    check-deps.mjs      # Dependency checker: verifies tree-sitter is installed
    languages/
      typescript.mjs    # TS/JS query patterns (S-expressions)
      python.mjs        # Python query patterns
      go.mjs            # Go query patterns
      rust.mjs          # Rust query patterns
      java.mjs          # Java query patterns
      ruby.mjs          # Ruby query patterns
```

### Dependency Management

Tree-sitter is a **hard runtime dependency** for `/adev-repomap` v0.5+. It is declared in `dependencies` (not `optionalDependencies`):

```json
{
  "dependencies": {
    "tree-sitter": "^0.22.0",
    "tree-sitter-typescript": "^0.23.0",
    "tree-sitter-python": "^0.23.0",
    "tree-sitter-go": "^0.23.0",
    "tree-sitter-rust": "^0.23.0",
    "tree-sitter-java": "^0.23.0",
    "tree-sitter-ruby": "^0.23.0"
  }
}
```

**Pre-flight check (`check-deps.mjs`):**

When `/adev-repomap` runs, the first thing the skill does is execute:

```bash
node lib/repomap/check-deps.mjs
```

This script attempts to `import('tree-sitter')`. If it fails:

```
ERROR: tree-sitter is not installed.

/adev-repomap v0.5+ requires tree-sitter for AST-based code parsing.
The previous regex-based approach has been removed.

To install:
  cd <plugin-dir> && npm install

If tree-sitter native compilation fails (missing build tools), install them:
  macOS:  xcode-select --install
  Ubuntu: sudo apt install build-essential

Then retry: npm install
```

The skill MUST NOT proceed without tree-sitter. No fallback to regex. No graceful degradation. This is a deliberate design choice: the dependency graph and accurate symbol extraction are the entire point of this upgrade. A regex fallback would silently produce inferior data that downstream skills (route, hygiene, validate) would trust as accurate.

**Installation flow update (`cli/index.mjs`):**

The CLI `init` command is updated to:
1. After scaffolding `.context-index/`, check if tree-sitter is installed.
2. If not, prompt the user:
   ```
   /adev-repomap requires tree-sitter for AST-based code analysis.
   Install now? (cd <plugin-dir> && npm install) [Y/n]
   ```
3. If the user declines, warn: "You can install later, but /adev-repomap will not work until tree-sitter is installed."
4. If installation fails (native compilation error), show platform-specific build tool instructions and exit with error.

### Output Artifacts

All written to `.context-index/hygiene/` (gitignored):

| File | Format | Consumer | Description |
|------|--------|----------|-------------|
| `repo-map.md` | Markdown | Humans, `/adev-hygiene` | Existing format, enhanced with dependency summary. Same structure as today. |
| `dependency-graph.json` | JSON | `/adev-route`, `/adev-validate`, `/adev-recover` | Nodes (files) + edges (import relationships) with edge types. |
| `symbol-ranks.json` | JSON | `/adev-implement` (context packets), `/adev-hygiene` | Every exported symbol with PageRank score, kind, file, line. |

### dependency-graph.json Schema

```json
{
  "generated": "2026-03-22T14:30:00Z",
  "commit": "abc1234",
  "nodes": [
    {
      "path": "src/services/task-service.ts",
      "exports": ["TaskService", "TaskFilters", "createTaskService"],
      "module": "task-boards"
    }
  ],
  "edges": [
    {
      "from": "src/services/task-service.ts",
      "to": "src/db/index.ts",
      "type": "import",
      "symbols": ["db"]
    },
    {
      "from": "src/services/task-service.ts",
      "to": "src/types/task.ts",
      "type": "type-import",
      "symbols": ["Task", "User"]
    }
  ]
}
```

Edge types: `import`, `type-import`, `re-export`, `dynamic-import`.

The `module` field on nodes is resolved from `manifest.yaml` modules[].paths. Files not covered by any module get `module: null`. This enables per-module dependency analysis.

### symbol-ranks.json Schema

```json
{
  "generated": "2026-03-22T14:30:00Z",
  "commit": "abc1234",
  "symbols": [
    {
      "name": "Task",
      "kind": "type",
      "file": "src/types/task.ts",
      "line": 3,
      "score": 0.089,
      "references": 14,
      "module": "task-boards"
    }
  ]
}
```

Symbols are sorted by `score` descending. The `score` is the normalized PageRank value. `references` is the count of files that import this symbol (from the dependency graph edges, not grep).

### Tree-Sitter Query Patterns

Each language module exports an object with:

```javascript
export default {
  language: 'typescript',
  grammarPackage: 'tree-sitter-typescript',
  grammarKey: 'typescript',  // or 'tsx' for .tsx files

  // S-expression queries
  queries: {
    exports: `
      (export_statement
        (function_declaration
          name: (identifier) @name) @def)
      (export_statement
        (class_declaration
          name: (type_identifier) @name) @def)
      (export_statement
        (interface_declaration
          name: (type_identifier) @name) @def)
      (export_statement
        (type_alias_declaration
          name: (type_identifier) @name) @def)
      (export_statement
        (enum_declaration
          name: (identifier) @name) @def)
      (export_statement
        (lexical_declaration
          (variable_declarator
            name: (identifier) @name)) @def)
      (export_statement
        value: (identifier) @name) @def)
    `,
    imports: `
      (import_statement
        source: (string) @source)
    `,
    classMembers: `
      (class_declaration
        name: (type_identifier) @class_name
        body: (class_body
          (method_definition
            (accessibility_modifier)? @visibility
            name: (property_identifier) @method_name
            parameters: (formal_parameters) @params)))
    `
  },

  // Map tree-sitter node types to our symbol kinds
  kindMap: {
    function_declaration: 'function',
    class_declaration: 'class',
    interface_declaration: 'interface',
    type_alias_declaration: 'type',
    enum_declaration: 'enum',
    lexical_declaration: 'constant'
  }
}
```

### PageRank Algorithm

Simplified iterative PageRank on the file-level dependency graph:

```
Input: dependency-graph.json (nodes + edges)
Output: score per node (file)

1. Initialize all node scores to 1/N (N = number of files)
2. Damping factor d = 0.85
3. Iterate 20 times (or until convergence < 0.001):
   For each node n:
     score(n) = (1-d)/N + d * sum(score(m) / outDegree(m)) for all m that link to n
4. Distribute file scores to symbols:
   symbol_score = file_score * (references_to_symbol / total_references_from_file)
```

This is the same algorithm Aider uses. It ranks files that are imported by many other important files higher. Symbols within those files inherit the file's importance, weighted by how often each symbol is specifically referenced.

## Skill Changes

### `/adev-repomap` (Modified)

Update the SKILL.md to:

1. **Step 0 (new): Pre-flight check.**
   ```
   Run: node lib/repomap/check-deps.mjs
   ```
   If exit code is non-zero, STOP. Show the error message (installation instructions). Do NOT proceed. Do NOT fall back to regex. Tell the user to install tree-sitter and retry.

2. **Step 1 (unchanged):** Detect language and project type.
3. **Step 2 (unchanged):** Discover source files via Glob.
4. **Step 3 (changed):** Run tree-sitter parsing:
   ```
   Run: node lib/repomap/index.mjs --root <project-root> [--path <subdir>]
   ```
   This produces all three output files.
5. **Step 4 (removed):** Reference counting via grep is replaced by dependency graph analysis inside `index.mjs`.
6. **Step 5 (changed):** Ranking uses PageRank instead of raw reference counts.
7. **Step 6 (changed):** Output includes `dependency-graph.json` and `symbol-ranks.json` alongside the existing `repo-map.md`.
8. **Step 7 (unchanged):** Staleness marker with commit hash.

The regex patterns currently in the SKILL.md (Step 3) are removed entirely. They are not preserved as a fallback.

### `/adev-route` (Modified)

Update Blast Radius scoring (Dimension 3) in the SKILL.md:

**Current:** Count files mentioned in the task description. Score 1-5 based on file count.

**New:** Read `dependency-graph.json`. For each file in the task:
1. Find all transitive dependents (files that import this file, and files that import those, up to depth 3).
2. Count unique files in the transitive closure.
3. Check if any edges cross module boundaries (from manifest.yaml modules).

| Transitive Dependents | Cross-Module? | Score |
|---|---|---|
| 0-2 | No | 5 (minimal) |
| 3-5 | No | 4 |
| 6-10 | No | 3 |
| Any | Yes | 2 (cross-boundary) |
| 11+ | Yes | 1 (high blast radius) |

If `dependency-graph.json` does not exist, warn: "Run /adev-repomap first for accurate blast radius scoring." Fall back to current file-count heuristic but annotate the score as "(estimated, no dependency graph)".

### `/adev-implement` (Modified)

Update context packet assembly (Step 2a) in the SKILL.md:

**Current:** Packet includes constitution excerpt, spec, ADRs, golden samples.

**New:** Additionally include a "Relevant Symbols" section in the packet:
1. Read `symbol-ranks.json`.
2. Filter to symbols in files that the task will modify or that import from those files (from `dependency-graph.json`).
3. Take the top 15 symbols by score.
4. Include as a markdown table in the context packet.

Also include a "Dependency Context" section:
1. Read `dependency-graph.json`.
2. List files that import from the task's modified files (first-order dependents).
3. Note: "These files import from your modified files. Verify they still work after your changes."

If neither JSON file exists, warn: "Run /adev-repomap for richer context packets." Skip these sections but continue with the existing packet contents.

### `/adev-hygiene` (Modified)

Update Pass 5 (Spec-to-Code Drift) in the SKILL.md:

**Current:** Compare spec-declared interfaces against grep matches.

**New:** Compare spec-declared interfaces against `symbol-ranks.json` exports:
1. Read the feature charter. Extract declared interfaces, classes, functions from the "Interface Contracts" or "Capability Map" section.
2. Read `symbol-ranks.json`. Filter to symbols in the module's paths (from manifest.yaml).
3. Report:
   - **Declared but not found:** Symbol in spec but not in repo-map (spec ahead of code, or symbol removed).
   - **Found but not declared:** Symbol exported but not in any spec (uncharted functionality).
   - **Signature mismatch:** Symbol exists but kind differs (spec says function, code says class).

Add new Pass 12 (Dependency Integrity):
1. Read `dependency-graph.json`.
2. For each module in manifest.yaml, check that no edges violate `governance/boundaries.yaml` rules (if governance is enabled).
3. Report cross-boundary imports that are not explicitly allowed.

If `symbol-ranks.json` or `dependency-graph.json` do not exist, BLOCK Pass 5 and Pass 12: "Run /adev-repomap before hygiene audit. Drift detection requires the symbol index."

### `/adev-validate` (Modified)

Add Check 12 (Dependency Integrity) to the SKILL.md:
1. Re-run `/adev-repomap` on the modified files only (pass `--path` for each changed directory).
2. Compare the new dependency graph against the pre-implementation snapshot.
3. Report new edges. Flag any that cross module boundaries or violate governance boundaries.
4. This check is informational (WARNING), not blocking (FAIL), unless governance boundaries are configured.

### `/adev-recover` (Modified)

Update MISSING_CONTEXT diagnosis:
1. When a subagent fails, read the context packet from `.context-index/packets/<task-slug>.md`.
2. Read `dependency-graph.json` to check if the failing file imports symbols that were NOT in the packet's "Relevant Symbols" section.
3. If found, diagnosis: "Subagent was missing context for [symbols] imported from [files]. Adding to corrective packet."

## Manifest Changes

Add to `manifest-template.yaml` under the existing `repomap:` section:

```yaml
repomap:
  # ... existing exclude patterns ...

  # Output formats
  output:
    markdown: true           # .context-index/hygiene/repo-map.md
    dependency_graph: true   # .context-index/hygiene/dependency-graph.json
    symbol_ranks: true       # .context-index/hygiene/symbol-ranks.json
```

The `parser: auto | tree-sitter | regex` option is removed. Tree-sitter is the only parser. There is no regex mode.

## Testing

### Unit Tests (`tests/repomap/`)

| Test | Validates |
|------|-----------|
| `parse.test.mjs` | Tree-sitter extracts correct symbols from fixture files for each language |
| `graph.test.mjs` | Dependency graph correctly resolves relative imports, barrel exports, type-only imports |
| `rank.test.mjs` | PageRank converges, scores sum to 1.0, top symbol matches expected |
| `index.test.mjs` | End-to-end: fixture project produces expected repo-map.md, dependency-graph.json, symbol-ranks.json |
| `check-deps.test.mjs` | Verifies error message and exit code when tree-sitter is not available |

### Integration Tests

| Test | Validates |
|------|-----------|
| `route-blast-radius.test.mjs` | `/adev-route` reads dependency-graph.json and produces correct blast radius scores |
| `hygiene-drift.test.mjs` | `/adev-hygiene` compares spec declarations against symbol-ranks.json and reports drift correctly |
| `hygiene-no-repomap.test.mjs` | `/adev-hygiene` blocks Pass 5 and Pass 12 with clear error when JSON files are missing |

### Fixture Project

Create `tests/fixtures/sample-project/` with:
- 8-10 TypeScript files across 3 modules
- Known dependency structure (documented in fixture README)
- One deliberately drifted spec (declared symbol missing from code)
- One cross-boundary import (for governance testing)
- One re-export barrel file (to test barrel resolution)
- One arrow function export (to verify regex would have missed it)

## Rollout

### Phase 1: Core Parser (v0.5.0)

- Implement `lib/repomap/` (parse, graph, rank, index, check-deps)
- Update `/adev-repomap` SKILL.md (remove regex, add pre-flight check)
- Add tree-sitter to `dependencies`
- Update CLI init to prompt for tree-sitter installation
- Unit tests for all parser modules
- Fixture project

### Phase 2: Downstream Integration (v0.5.1)

- Update `/adev-route` blast radius scoring
- Update `/adev-implement` context packet assembly
- Update `/adev-hygiene` drift detection (block without repomap)
- Update `/adev-validate` dependency integrity check
- Update `/adev-recover` diagnosis
- Integration tests

### Phase 3: Manifest and Governance (v0.5.2)

- Add `repomap.output` to manifest schema
- Add dependency integrity to governance boundaries checking
- Update template files
- Documentation

## Success Metrics

1. **Symbol accuracy:** Tree-sitter captures 95%+ of exported symbols in fixture project (vs. ~70% for the old regex on complex patterns like re-exports and arrow functions).
2. **Blast radius precision:** `/adev-route` blast radius score changes in at least 30% of tasks compared to file-count heuristic (meaning the dependency graph provides new information).
3. **Drift detection:** `/adev-hygiene` catches spec-declared symbols that do not exist in code and exports not covered by any spec, with zero false positives on fixture project.
4. **Performance:** Full repomap on 500-file project completes in under 60 seconds.
5. **Fail-fast on missing deps:** If tree-sitter is not installed, `/adev-repomap` errors immediately with installation instructions. No partial results, no silent degradation.

## Open Questions

1. **Monorepo support:** Should the dependency graph span workspace packages or treat each package as isolated? Leaning toward: follow `manifest.yaml` modules definition, but resolve cross-package imports when paths match.
2. **Dynamic imports:** `import()` expressions are harder to extract statically. Include them as `dynamic-import` edge type with a warning flag? Or ignore for v0.5?
3. **Barrel files:** Projects using `index.ts` barrel exports create many indirect edges. Should the graph resolve through barrels to the actual source file, or keep the barrel as an intermediary node?
4. **Git-diff incremental mode:** For v0.5, always reparse all files. Should we add `--incremental` that only reparses files changed since the last commit hash in repo-map.md? This would improve performance on large codebases but adds complexity.
5. **tree-sitter native compilation:** tree-sitter requires a C compiler. Should we investigate `web-tree-sitter` (WASM-based, no native compilation) as the primary binding instead? It is slower but has zero native build requirements. Could be a better fit for the zero-friction install philosophy.
