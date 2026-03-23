# Live Spec: Core Parser Pipeline

---
charter: tree-sitter-repomap
status: draft
risk_level: medium
milestone: v0.5.0
created: 2026-03-23
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists in the target project
- `manifest.yaml` exists (or defaults are used if missing)
- Source files exist in the project matching glob patterns
- All resolved file paths must reside within the project root (path containment check; symlinks that escape the root are rejected)
- For tree-sitter mode: `web-tree-sitter` is importable via `import('web-tree-sitter')` and required grammar WASM files are available locally (grammar acquisition and caching are owned by the prompt-based installation spec, not this spec)

### Behaviors

1. **When** `check-deps.mjs` is executed and `web-tree-sitter` is importable **then** it exits with code 0.
2. **When** `check-deps.mjs` is executed and `web-tree-sitter` is not importable **then** it exits with code 1.
3. **When** `index.mjs` runs in tree-sitter mode **then** it discovers source files via glob (respecting `repomap.exclude`), parses each file with the appropriate language grammar, and extracts all exported symbols with name, kind, file, and line number.
4. **When** `index.mjs` runs in tree-sitter mode **then** it constructs a file-level dependency graph by extracting import/require statements from the AST, resolving relative paths to file nodes. Unresolvable imports (external packages, missing files) are excluded from the graph — only imports that resolve to a source file within the project root are represented as edges.
5. **When** `index.mjs` runs in tree-sitter mode **then** it computes PageRank scores across all file nodes (damping factor 0.85, max 20 iterations or convergence < 0.001), distributes file scores to symbols weighted by reference count, and outputs `symbol-ranks.json`.
6. **When** `index.mjs` runs in tree-sitter mode **then** it outputs `repo-map.md` (with parser mode annotation), `dependency-graph.json`, and `symbol-ranks.json` to `.context-index/hygiene/`.
7. **When** `index.mjs` runs in regex mode **then** it outputs only `repo-map.md` (current behavior, annotated as `Parser: regex`) and does not produce `dependency-graph.json` or `symbol-ranks.json`.
8. **When** a source file's language has no grammar WASM available **then** the file is skipped with a warning and the pipeline continues with remaining files.
9. **When** a glob-resolved file path escapes the project root (e.g., via symlink) **then** the file is rejected with a warning and the pipeline continues.

### Postconditions

- In tree-sitter mode: `.context-index/hygiene/repo-map.md`, `dependency-graph.json`, and `symbol-ranks.json` exist and are valid
- In regex mode: `.context-index/hygiene/repo-map.md` exists; no JSON artifacts are produced
- `repo-map.md` contains a `Parser:` annotation indicating which mode was used
- `dependency-graph.json` schema: `{ generated: <ISO 8601 timestamp>, commit: <git hash string>, nodes: [{ path, exports, module }], edges: [{ from, to, type, symbols }] }`
- Valid edge `type` values: `import`, `require`, `re-export`, `dynamic-import`, `type-import`
- `symbol-ranks.json` schema: `{ generated: <ISO 8601 timestamp>, commit: <git hash string>, symbols: [{ name, kind, file, line, score, references, module }] }`
- `references` is the number of distinct files that import the symbol (counted from dependency graph edges, not grep)
- Output directory for all artifacts: `.context-index/hygiene/` (gitignored by `/adev-init`)
- PageRank scores across all file nodes sum to 1.0 (±0.001)
- Symbols in `symbol-ranks.json` are sorted by score descending

### Error Cases

| Condition | Expected Behavior | Exit Code |
|---|---|---|
| No source files match glob patterns | Output empty `repo-map.md` with warning "No source files found" | 0 |
| Grammar WASM file fails to load | Skip language, warn "Failed to load grammar for [language]", continue with other languages | 0 |
| `manifest.yaml` is missing or unparseable | Use default exclude patterns, warn "No manifest found, using defaults" | 0 |
| Source file cannot be read (permissions, encoding) | Skip file, warn "Skipping [path]: [error]", continue | 0 |
| Tree-sitter parse fails on a valid file (grammar bug) | Skip file, warn "Parse failed for [path]", continue | 0 |
| Circular imports in dependency graph | Include edges as-is; PageRank handles cycles naturally (iterative algorithm) | 0 |
| Resolved path escapes project root (symlink) | Reject file, warn "Skipping [path]: outside project root", continue | 0 |
| Import resolves to external package (not a project file) | Exclude from dependency graph, do not create a node | 0 |

## System Constitution Reference

- **Principle #1:** "Minimize external dependencies — justify in ADR" — Applies because tree-sitter mode requires `web-tree-sitter`. An ADR must exist before implementation begins.
- **Principle #2:** "Skills are primarily markdown — companion code allowed but must not be required" — Applies because `lib/repomap/` is companion code. The `/adev-repomap` skill must function in regex mode without it.
- **Principle #3:** "Pure ESM" — Applies because all new files in `lib/repomap/` must use `.mjs` extension and ESM imports.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Dependency checker | `lib/repomap/check-deps.mjs` — attempt `import('web-tree-sitter')`, exit 0 or 1 | small |
| Language query modules | `lib/repomap/languages/typescript.mjs`, `python.mjs`, etc. — S-expression queries for exports and imports per language | medium |
| AST parser | `lib/repomap/parse.mjs` — load grammar WASM, parse a file, extract symbols using language queries | medium |
| Dependency graph builder | `lib/repomap/graph.mjs` — extract imports from AST, resolve relative paths (within project root only), construct nodes + edges | medium |
| PageRank ranker | `lib/repomap/rank.mjs` — iterative PageRank on file graph, distribute scores to symbols | small |
| Orchestrator | `lib/repomap/index.mjs` — glob files, detect mode, route to regex or tree-sitter pipeline, write outputs | medium |
| Fixture project | `tests/fixtures/sample-project/` — 8-10 TypeScript files with known dependency structure, re-exports, arrow functions | small |
| Unit tests | Tests for parse, graph, rank, check-deps modules | medium |
| Integration test | End-to-end: fixture project → all three output artifacts with expected content | medium |

## Acceptance Criteria

- [ ] `check-deps.mjs` exits 0 when `web-tree-sitter` is installed, exits 1 when not
- [ ] Tree-sitter mode extracts 95%+ of exported symbols from fixture project (including re-exports, arrow function exports, destructured exports)
- [ ] `dependency-graph.json` contains correct nodes and edges matching fixture project's known dependency structure
- [ ] PageRank scores sum to 1.0 (±0.001 tolerance)
- [ ] `symbol-ranks.json` symbols are sorted by score descending
- [ ] `repo-map.md` includes parser mode annotation (`Parser: regex` or `Parser: tree-sitter`)
- [ ] Regex mode produces only `repo-map.md`, no JSON artifacts
- [ ] Files with unsupported languages are skipped with warning, pipeline continues
- [ ] Files that fail to parse are skipped with warning, pipeline continues
- [ ] Circular imports do not cause infinite loops or crashes
- [ ] All `.mjs` files use ESM imports (no CommonJS)
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
