# Feature Charter: Tree-Sitter Repomap

## Business Intent

The tree-sitter repomap module replaces heuristic-based code analysis with accurate AST parsing, dependency graph construction, and PageRank-based symbol ranking. It is offered as a progressive enhancement: regex-based analysis remains the zero-dependency default, while users who opt in to web-tree-sitter get structural code understanding that feeds into blast radius scoring, drift detection, context packet assembly, and agent recovery diagnostics.

## Scope and Boundaries

### In Scope

- Tree-sitter AST parsing via `web-tree-sitter` (WASM, optional install)
- File-level dependency graph from import/require statements
- PageRank-style symbol ranking on the dependency graph
- Language support: TypeScript/JavaScript, Python, Go, Rust, Java, Ruby
- Prompt-based installation during `/adev-repomap` and `/adev-init`
- Graceful degradation: regex default, tree-sitter when available
- Three output artifacts: `repo-map.md` (enhanced), `dependency-graph.json`, `symbol-ranks.json`
- Output artifacts consumed by downstream skills (route, hygiene, implement, validate, recover). This charter defines the artifact format; downstream charters own their consumption logic.
- Coordination with `/adev-init` (setup charter) to offer tree-sitter installation during project setup

### Out of Scope

- Semantic embeddings or vector search (future version)
- Auto-generated documentation / DeepWiki equivalent
- MCP server for external tool access to the index
- Real-time incremental parsing on file save (batch mode only)
- Native tree-sitter (C bindings) — WASM only

### Dependencies

| Dependency | Type | Description |
|---|---|---|
| `web-tree-sitter` | external library (optional) | WASM-based tree-sitter bindings for AST parsing. Requires an ADR before implementation (constitution principle #1). |
| Language grammar WASM files | external assets (optional) | Per-language parsers downloaded on first use |
| `manifest.yaml` modules[].paths | internal (setup module) | Maps files to modules for the `module` field on nodes and symbols |
| `manifest.yaml` repomap.exclude | internal (setup module) | Glob patterns to exclude from scanning |
| Maintenance module | internal | Repomap and hygiene skills consume and produce artifacts in this module |
| Assessment module | internal | Route skill consumes dependency graph for blast radius |
| Implementation module | internal | Implement and recover skills consume symbol ranks and graph |
| Validation module | internal | Validate skill consumes dependency graph for integrity checks |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|---|---|---|
| Symbol | An exported function, class, type, interface, enum, or constant | name, kind, file, line, score, references, module |
| FileNode | A source file in the dependency graph | path, exports (symbol names), module (from manifest) |
| Edge | An import relationship between two files | from (file), to (file), type, symbols (imported names) |
| DependencyGraph | The complete file-level import graph | nodes (FileNode[]), edges (Edge[]), generated timestamp, commit hash |
| SymbolIndex | Ranked list of all exported symbols | symbols (Symbol[]), generated timestamp, commit hash |
| RepoMap | Human-readable summary of the codebase structure | parser mode (regex/tree-sitter), symbol table, dependency summary |

### Relationships

- A FileNode has many Symbols (exports)
- An Edge connects two FileNodes (from imports to)
- A Symbol's score is derived from its FileNode's PageRank score weighted by reference count
- A FileNode's module is resolved from `manifest.yaml` modules[].paths

### Invariants

- PageRank scores across all FileNodes sum to 1.0
- Every Edge references two FileNodes that exist in the graph
- Every Symbol references a FileNode that exists in the graph
- If parser mode is "regex", `dependency-graph.json` and `symbol-ranks.json` are not produced

## Capability Map

| Capability | Description | Priority | Phase |
|---|---|---|---|
| Regex repomap (preserve) | Keep existing regex-based symbol extraction as the default zero-dependency mode | must-have | v0.5.0 |
| Tree-sitter parsing | Parse source files via web-tree-sitter WASM for accurate symbol extraction | must-have | v0.5.0 |
| Dependency graph construction | Build file-level import graph from AST-extracted import statements | must-have | v0.5.0 |
| PageRank ranking | Compute symbol importance scores from the dependency graph | must-have | v0.5.0 |
| Prompt-based installation | Offer tree-sitter install via "yes/no" prompt in `/adev-repomap` and `/adev-init` | must-have | v0.5.0 |
| Parser mode detection | Auto-detect whether tree-sitter is available, annotate outputs with parser mode | must-have | v0.5.0 |
| Grammar auto-download | Download language grammar WASM files on first use based on detected languages | must-have | v0.5.0 |
| Blast radius scoring (route) | Define artifact contract for `/adev-route` to consume dependency graph for transitive dependent analysis. Consumption logic owned by assessment charter. | should-have | v0.5.1 |
| Context packet enrichment (implement) | Define artifact contract for `/adev-implement` to add relevant symbols and dependency context to packets. Consumption logic owned by implementation charter. | should-have | v0.5.1 |
| Drift detection (hygiene) | Define artifact contract for `/adev-hygiene` to compare spec-declared interfaces against symbol index. Consumption logic owned by maintenance charter. | should-have | v0.5.1 |
| Dependency integrity check (validate) | Define artifact contract for `/adev-validate` to detect new cross-module edges. Consumption logic owned by validation charter. | should-have | v0.5.1 |
| Recovery diagnosis (recover) | Define artifact contract for `/adev-recover` to check packets against dependency graph. Consumption logic owned by implementation charter. | nice-to-have | v0.5.1 |
| Multi-language support | TypeScript/JS, Python, Go, Rust, Java, Ruby grammar support | should-have | v0.5.0 |
| Manifest output config | Add `repomap.output` section to manifest for enabling/disabling output formats | nice-to-have | v0.5.2 |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|---|---|---|
| `repo-map.md` | File artifact | Human-readable symbol table with parser mode annotation. Consumed by humans and `/adev-hygiene` |
| `dependency-graph.json` | File artifact | File nodes + import edges with types. Only produced when tree-sitter is installed. Consumed by `/adev-route`, `/adev-validate`, `/adev-recover` |
| `symbol-ranks.json` | File artifact | PageRank-scored symbols with kind, file, line, module. Only produced when tree-sitter is installed. Consumed by `/adev-implement`, `/adev-hygiene` |
| `node lib/repomap/index.mjs` | CLI command (tree-sitter mode only) | Orchestrator: glob files → parse → graph → rank → output. Only called when tree-sitter is installed. In regex mode, the `/adev-repomap` skill works without any companion code. |
| `node lib/repomap/check-deps.mjs` | CLI command | Returns exit 0 if web-tree-sitter is available, exit 1 if not. Called by skills to decide parser mode |

### Consumed APIs

| Interface | Source Module | Description |
|---|---|---|
| `manifest.yaml` modules[].paths | Setup | Maps files to modules for the `module` field on FileNodes and Symbols |
| `manifest.yaml` repomap.exclude | Setup | Glob patterns to exclude from scanning |
| Source files | User's project | The actual code files to parse |

### Downstream Consumption Contract

Each downstream skill follows the same pattern:
1. Check if `dependency-graph.json` / `symbol-ranks.json` exists
2. If yes → use the data
3. If no → fall back to heuristic, annotate output as "estimated, no dependency graph"
4. Never error on missing JSON files

## Quality Attributes

| Attribute | Requirement |
|---|---|
| Performance | Full repomap on 500-file project completes in under 60 seconds (tree-sitter mode). Regex mode stays at current performance. |
| Correctness | Tree-sitter captures 95%+ of exported symbols in fixture project (vs. ~70% for regex on complex patterns like re-exports, arrow functions, destructured exports). PageRank scores sum to 1.0. |
| Install friction | Zero for regex mode. Single "yes" prompt for tree-sitter mode — no manual commands, no C compiler, no platform-specific instructions. |
| Graceful degradation | Every downstream skill works without tree-sitter. Missing JSON files never cause errors, only annotated estimates. |
| Testability | Fixture project with known dependency structure. Unit tests for each parser module. Integration tests for downstream skill consumption. |
