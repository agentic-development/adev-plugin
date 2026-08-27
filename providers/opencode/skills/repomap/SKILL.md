---
name: adev:repomap
description: "Generate an AST-based symbol index of the repository. Extracts exported functions, classes, types, and interfaces, ranks by reference count, and outputs a repo map for drift detection by /adev:hygiene. Use when the user wants to map the codebase, generate a symbol index, understand the project structure, or prepare for drift detection. In OpenCode, invoke with skill({ name: 'adev:repomap' })"
---

# Generate Repository Map

Produce a symbol-level index of the codebase for drift detection and maintenance. The repo map is consumed by `/adev:hygiene`, `/adev:codehealth`, `/adev:route`, `/adev:validate`, `/adev:implement`, and `/adev:recover`. It is NOT direct agent context (agents use agentic search via Glob/Grep/Read, not pre-computed indexes).

This skill is a thin driver over the existing `lib/repomap/` pipeline (tree-sitter AST parsing + PageRank ranking, described in `.context-index/specs/features/tree-sitter-repomap/charter.md`). It never parses source itself.

## Arguments

- No arguments: map the entire repository, auto-detecting parser mode
- `--mode <tree-sitter|regex>`: force a specific parser mode instead of auto-detecting

### Step 1: Load Skill Extensions

Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill repomap
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

### Step 2: Check Parser Availability

```bash
adev repomap check-deps
```

Exit `0` means `web-tree-sitter` is installed and tree-sitter-mode parsing (AST-accurate symbols, `dependency-graph.json`, `symbol-ranks.json`) is available. Exit `1` means it is not installed — generation will fall back to regex mode automatically, which produces `repo-map.md` only (no JSON artifacts; this is the charter's documented regex-mode invariant, not a failure).

Do not attempt to install `web-tree-sitter` yourself. Report the mode this run will use and continue.

### Step 3: Generate Artifacts

```bash
adev repomap generate --format json
```

To force a mode instead of auto-detecting (e.g. to compare both, or when Step 2 reported tree-sitter available but a fresh regex baseline is wanted):

```bash
adev repomap generate --mode tree-sitter --format json
adev repomap generate --mode regex --format json
```

This wraps `lib/repomap/index.mjs`'s `run(root, mode)` — the same orchestrator exercised by `tests/repomap/` (parse → build dependency graph → PageRank → write outputs). It writes, relative to the project root:

- `.context-index/hygiene/repo-map.md` — human-readable summary (always written)
- `.context-index/hygiene/dependency-graph.json` — file nodes + import edges (tree-sitter mode only)
- `.context-index/hygiene/symbol-ranks.json` — PageRank-scored symbols (tree-sitter mode only)

All three share the same **Generated** timestamp and **Commit** hash, which downstream skills use as staleness markers.

Stdout is a single JSON object:

```json
{
  "mode": "tree-sitter",
  "artifacts": ["repo-map.md", "dependency-graph.json", "symbol-ranks.json"],
  "files": 142,
  "edges": 231,
  "symbols": 387,
  "topSymbol": { "name": "db", "score": 0.0421 }
}
```

`files`/`edges`/`symbols`/`topSymbol` are `null` in regex mode (no JSON artifacts to derive them from — read `repo-map.md` directly for the regex-mode symbol listing).

If the command exits non-zero, report the stderr message and stop — do not hand-write the artifacts as a fallback. `--mode tree-sitter` explicitly requested but unavailable is the one argument-error case (exit 1); re-run without `--mode` to get regex mode instead.

### Step 4: Report

Summarize the JSON from Step 3 to the user, for example:

```
Repository map generated (tree-sitter mode).

  Files: 142
  Symbols: 387
  Top symbol: db (score 0.0421)

Artifacts written to .context-index/hygiene/:
  - repo-map.md
  - dependency-graph.json
  - symbol-ranks.json

The repo map is used by /adev:hygiene for drift detection and by
/adev:codehealth for dead-export and orphan-file analysis (tree-sitter
mode only — regex mode produces repo-map.md alone).
Run /adev:hygiene --check drift to compare against your orientation doc.
```
