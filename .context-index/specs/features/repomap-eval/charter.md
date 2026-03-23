# Feature Charter: Repomap Eval

## Business Intent

The repomap eval module measures the accuracy and stability of both the tree-sitter and regex repomap parsers by comparing their output against ground truth generated from the TypeScript compiler API. It provides precision/recall metrics for symbol extraction and dependency graph construction, enabling regression detection, accuracy benchmarking, and side-by-side comparison of both parser modes against real OSS codebases.

## Scope and Boundaries

### In Scope

- TypeScript compiler-based ground truth generation (exported symbols + import edges)
- Run both repomap parser modes (tree-sitter and regex) against target repos
- Precision/recall metrics for symbol extraction (both parsers vs ground truth)
- Precision/recall metrics for dependency graph edges (tree-sitter only — regex doesn't produce edges)
- Side-by-side comparison report (tree-sitter vs regex vs ground truth)
- Configurable target repos via `tests/evals/repomap/repos.json`
- Repo cloning to a local cache directory, pinned to specific git refs
- Markdown summary report with metrics
- Eval tests separate from `npm test` (slow, requires cloning)

### Out of Scope

- Evaluating non-TypeScript languages (future — only TS grammar exists today)
- Evaluating downstream skills (route, hygiene, implement) — separate eval module
- Full lifecycle evals (brainstorm → implement) — separate charter
- Performance benchmarking (execution time) — nice-to-have for later
- CI integration (running evals on every PR) — separate concern

### Dependencies

| Dependency | Type | Description |
|---|---|---|
| `typescript` | devDependency | Compiler API for ground truth generation |
| `lib/repomap/` | internal (tree-sitter-repomap) | The parser pipeline being evaluated |
| Target OSS repos | external | Cloned on demand for evaluation |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|---|---|---|
| TargetRepo | An OSS repo to evaluate against | name, url, gitRef, localPath, language |
| GroundTruth | Compiler-derived expected symbols and edges for a repo | repoName, symbols (GroundTruthSymbol[]), edges (GroundTruthEdge[]), generatedAt |
| GroundTruthSymbol | A single exported symbol from the compiler | name, kind, file, line |
| GroundTruthEdge | An import relationship from the compiler | from, to, symbols |
| EvalResult | Parser output compared against ground truth for one parser mode | repoName, parserMode (tree-sitter/regex), symbolPrecision, symbolRecall, edgePrecision, edgeRecall, missingSymbols, extraSymbols, missingEdges, extraEdges |
| EvalReport | Side-by-side comparison of both parser modes | repoName, treeSitterResult (EvalResult), regexResult (EvalResult), generatedAt |

### Relationships

- A TargetRepo has one GroundTruth (generated from the compiler)
- A TargetRepo produces two EvalResults (one per parser mode)
- An EvalReport aggregates both EvalResults for comparison

### Invariants

- Precision and recall values are between 0.0 and 1.0
- Ground truth is generated from the TypeScript compiler, never from the repomap parser
- Both parser modes are evaluated against the same ground truth for fair comparison

## Capability Map

| Capability | Description | Priority | Phase |
|---|---|---|---|
| Repo cloning | Clone target repos to a local cache directory, pin to a specific git ref for reproducibility | must-have | v1 |
| Ground truth generation | Run TypeScript compiler API against a cloned repo, extract all exported symbols and import edges, write to JSON | must-have | v1 |
| Tree-sitter eval | Run the tree-sitter parser against the same repo, compare output against ground truth, compute precision/recall | must-have | v1 |
| Regex eval | Run the regex parser against the same repo, compare symbol output against ground truth, compute precision/recall (no edges — regex doesn't produce them) | must-have | v1 |
| Comparison report | Generate a markdown report showing side-by-side metrics for both parsers, list missing/extra symbols and edges | must-have | v1 |
| Repo config | Configurable target repos via JSON config file (name, URL, git ref) | must-have | v1 |
| Multi-repo aggregation | Run eval across all configured repos, produce a summary table | should-have | v1 |
| Eval test runner | A dedicated test command (`npm run eval`) separate from `npm test` | must-have | v1 |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|---|---|---|
| `npm run eval` | CLI command | Runs the full eval suite: clone repos, generate ground truth, evaluate both parsers, produce reports |
| `npm run eval:generate` | CLI command | Generate/regenerate ground truth only (no parser comparison) |
| `tests/evals/repomap/repos.json` | Config file | List of target repos with name, URL, git ref |
| `tests/evals/repomap/<repo>/ground-truth-symbols.json` | File artifact | Compiler-generated expected symbols for a repo |
| `tests/evals/repomap/<repo>/ground-truth-edges.json` | File artifact | Compiler-generated expected import edges for a repo |
| `tests/evals/repomap/<repo>/eval-report.md` | File artifact | Side-by-side comparison report with precision/recall metrics |

### Consumed APIs

| Interface | Source Module | Description |
|---|---|---|
| `node lib/repomap/index.mjs --root <path>` | tree-sitter-repomap | Pipeline orchestrator (tree-sitter mode) |
| `lib/repomap/index.mjs` regex mode | tree-sitter-repomap | Pipeline orchestrator (regex fallback mode) |
| `dependency-graph.json` | tree-sitter-repomap | Parser output artifact for edge comparison |
| `symbol-ranks.json` | tree-sitter-repomap | Parser output artifact for symbol comparison |
| `repo-map.md` | tree-sitter-repomap | Parser output artifact (both modes) |

## Quality Attributes

| Attribute | Requirement |
|---|---|
| Reproducibility | Pinned git refs ensure the same repo state is evaluated every run. Ground truth is deterministic (compiler output). |
| Isolation | Evals run separately from `npm test` — they clone repos and take longer. Never block the regular test suite. |
| Measurability | Every eval produces quantitative metrics (precision, recall) not just pass/fail. Regressions are detectable as metric drops. |
| Extensibility | Adding a new target repo requires only a config entry in `repos.json` — no code changes. |
