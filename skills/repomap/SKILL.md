---
name: adev:repomap
description: "Generate an AST-based symbol index of the repository. Extracts exported functions, classes, types, and interfaces, ranks by reference count, and outputs a repo map for drift detection by /adev:hygiene. Use when the user wants to map the codebase, generate a symbol index, understand the project structure, or prepare for drift detection."
---

# Generate Repository Map

Produce a symbol-level index of the codebase for drift detection and maintenance. The repo map is consumed by `/adev:hygiene` for spec-to-code drift analysis. It is NOT direct agent context (agents use agentic search via Glob/Grep/Read, not pre-computed indexes).

## Execution Protocol

**Silent execution (subagent mode):** When this skill is invoked as a subagent (via the Agent tool from a parent orchestrator), execute all steps silently:
- Chain steps continuously without intermediate commentary or narration.
- Do NOT emit confirmations like "Loaded the context" or "Proceeding to step N."
- Do NOT summarize intermediate findings between steps.
- Use parallel tool calls (multiple Read/Grep/Glob in one turn) for context-loading phases.
- Report ONLY the final result in the structured format expected by the parent.

This directive does NOT apply when the skill is invoked interactively by a user.

## Arguments

- No arguments: map the entire repository
- `--path <dir>`: map a specific directory
- `--depth <n>`: limit tree depth (default: unlimited)

## Process

### Step 1: Detect Language and Project Type

Read project root files to determine the primary language(s):

| File | Language |
|------|----------|
| `package.json` or `tsconfig.json` | TypeScript / JavaScript |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `pyproject.toml` or `setup.py` or `requirements.txt` | Python |
| `pom.xml` or `build.gradle` | Java |
| `Gemfile` | Ruby |

If multiple language markers exist (e.g., a monorepo with `package.json` and `go.mod`), extract symbols from all detected languages.

Read `.context-index/manifest.yaml` for any `exclude` patterns. Fall back to `.gitignore` for exclusions. Always exclude: `node_modules/`, `vendor/`, `dist/`, `build/`, `.git/`, `.context-index/hygiene/`.

### Step 2: Discover Source Files

Use Glob to find source files for each detected language:

| Language | Glob Pattern |
|----------|-------------|
| TypeScript | `**/*.ts`, `**/*.tsx` (exclude `**/*.d.ts`, `**/*.test.ts`, `**/*.spec.ts`) |
| JavaScript | `**/*.js`, `**/*.jsx` (exclude `**/*.test.js`, `**/*.spec.js`) |
| Python | `**/*.py` (exclude `**/*_test.py`, `**/test_*.py`) |
| Go | `**/*.go` (exclude `**/*_test.go`) |
| Rust | `**/*.rs` |
| Java | `**/*.java` |
| Ruby | `**/*.rb` |

Exclude test files from the map. Tests are consumers of symbols, not definitions. They will be counted during reference analysis.

### Step 3: Extract Symbols

For each source file, use Grep with regex patterns to extract exported symbols. This is a v1 approach using pattern matching (no binary tree-sitter dependency).

**TypeScript / JavaScript:**
```
# Exported functions
export (async )?function (\w+)
export const (\w+) = (\(|async \()

# Exported classes
export (abstract )?class (\w+)

# Exported types and interfaces
export (type|interface) (\w+)

# Exported enums
export enum (\w+)

# Default exports (capture the name if available)
export default (class|function) (\w+)

# Re-exports
export \{ .+ \} from

# Named exports at end of file
export \{ (.+) \}
```

**Python:**
```
# Module-level functions (not underscore-prefixed)
^def ([a-zA-Z]\w+)\(

# Classes
^class ([A-Z]\w+)

# Module-level constants (UPPER_CASE)
^([A-Z_][A-Z0-9_]+)\s*=

# __all__ exports
^__all__\s*=\s*\[
```

**Go:**
```
# Exported functions (capitalized)
^func ([A-Z]\w+)\(
^func \(\w+ \*?\w+\) ([A-Z]\w+)\(

# Exported types
^type ([A-Z]\w+) (struct|interface)

# Exported constants
^const ([A-Z]\w+)
```

**Rust:**
```
# Public functions
^pub (async )?fn (\w+)

# Public structs and enums
^pub (struct|enum) (\w+)

# Public traits
^pub trait (\w+)

# Public type aliases
^pub type (\w+)
```

For each symbol, record:
- **Name:** the symbol identifier
- **Kind:** function, class, type, interface, enum, constant, trait, re-export
- **File:** relative path from project root
- **Line:** line number of the definition

### Step 4: Count References (Simplified PageRank)

For each extracted symbol, count how many files reference it:

1. For each symbol name, run a Grep across the project source files (including test files this time) counting files that contain the symbol name.
2. Subtract 1 (the definition file itself).
3. This gives a rough "importance" score: symbols referenced by many files are more central to the codebase.

To keep this tractable for large codebases:
- Only count references for symbols found in Step 3 (exported symbols).
- Use `output_mode: "count"` in Grep for efficiency.
- If the project has more than 500 exported symbols, batch the reference counting and only fully count the top 100 by initial file-level grep hits.

### Step 5: Rank and Organize

1. Sort all symbols by reference count (descending).
2. Group by directory for the tree view.
3. Mark the top 20% of symbols as "high importance" (these are what `/adev:hygiene` checks against orientation).

### Step 6: Generate Output

Generate three artifacts in `.context-index/hygiene/`. All three share the same **Generated** timestamp and **Commit** hash.

#### 6a: Symbol Ranks JSON

Write `.context-index/hygiene/symbol-ranks.json` — the structured symbol index consumed by `/adev:codehealth` Pass 1 for dead export detection and line number enrichment.

```json
{
  "generated": "2026-03-19T14:30:00.000Z",
  "commit": "abc1234",
  "symbols": [
    { "name": "db", "kind": "constant", "file": "src/lib/db.ts", "line": 5, "references": 48, "module": "lib-db" },
    { "name": "auth", "kind": "function", "file": "src/lib/auth/index.ts", "line": 12, "references": 35, "module": "lib-auth" }
  ]
}
```

Fields per symbol:
- **name:** symbol identifier
- **kind:** function, class, type, interface, enum, constant, trait, re-export
- **file:** relative path from project root
- **line:** line number of the definition
- **references:** reference count from Step 4
- **module:** module slug (directory grouping from manifest or inferred from path)

Sort symbols by `references` descending (same order as the markdown table).

#### 6b: Dependency Graph JSON

Write `.context-index/hygiene/dependency-graph.json` — the module-level dependency graph consumed by `/adev:codehealth` Passes 1–2 for dead export and orphan file detection.

```json
{
  "generated": "2026-03-19T14:30:00.000Z",
  "commit": "abc1234",
  "modules": {
    "lib-db": {
      "files": ["src/lib/db/index.ts", "src/lib/db/client.ts"],
      "exports": 5,
      "inbound": ["services", "app-api"],
      "outbound": [],
      "inbound_count": 2,
      "outbound_count": 0
    },
    "services": {
      "files": ["src/services/user.ts", "src/services/auth.ts"],
      "exports": 12,
      "inbound": ["app-api"],
      "outbound": ["lib-db", "lib-auth"],
      "inbound_count": 1,
      "outbound_count": 2
    }
  }
}
```

Fields per module:
- **files:** list of source file paths belonging to this module
- **exports:** total count of exported symbols across the module's files
- **inbound:** list of module slugs that import from this module
- **outbound:** list of module slugs this module imports from
- **inbound_count / outbound_count:** convenience counts matching the array lengths

Module slugs are derived from `manifest.yaml` `modules[].slug` when available, otherwise inferred from the directory path (e.g., `lib/auth/` → `lib-auth`).

#### 6c: Markdown Repo Map

Write the repo map to `.context-index/hygiene/repo-map.md` with this format:

```markdown
# Repository Map

**Generated:** 2026-03-19T14:30:00Z
**Commit:** abc1234
**Languages:** TypeScript, Python
**Source files:** 142
**Exported symbols:** 387

## Top Symbols by Reference Count

| Rank | Symbol | Kind | File | References |
|------|--------|------|------|------------|
| 1 | db | constant | src/lib/db.ts:5 | 48 |
| 2 | auth | function | src/lib/auth/index.ts:12 | 35 |
| 3 | ApiResponse | type | src/types/api.ts:8 | 31 |
| 4 | UserService | class | src/services/user.ts:15 | 28 |
| 5 | validate | function | src/lib/validation.ts:3 | 24 |
| ... | | | | |

## Module Dependency Summary

Inbound = other modules import from this one.
Outbound = this module imports from other modules.

| Module | Exported Symbols | Inbound Refs | Outbound Refs | Role |
|--------|-----------------|--------------|---------------|------|
| src/lib/db/ | 5 | 48 | 2 | core dependency |
| src/lib/auth/ | 12 | 35 | 8 | core dependency |
| src/services/ | 23 | 42 | 31 | business logic |
| src/app/api/ | 18 | 3 | 45 | consumer (API layer) |
| src/components/ | 45 | 12 | 28 | consumer (UI layer) |

Modules with high inbound and low outbound are core dependencies.
Modules with low inbound and high outbound are leaf consumers.

## Symbol Tree

src/
  lib/
    db/
      index.ts
        db (constant) — 48 refs
        prisma (constant) — 12 refs
    auth/
      index.ts
        auth() (function) — 35 refs
        getSession() (function) — 22 refs
      middleware.ts
        authenticateRequest() (function) — 18 refs
        AuthConfig (type) — 5 refs
    validation.ts
      validate() (function) — 24 refs
      ValidationError (class) — 11 refs
  services/
    user.ts
      UserService (class) — 28 refs
      createUser() (function) — 8 refs
  types/
    api.ts
      ApiResponse (type) — 31 refs
      ApiError (type) — 19 refs
```

### Step 7: Record Staleness Marker

At the top of the output file, the **Generated** timestamp and **Commit** hash serve as staleness markers. `/adev:hygiene` compares the commit hash against current HEAD to determine if the map is outdated.

## Performance Considerations

For large codebases (1000+ source files):

1. **Parallelize Glob calls** for different languages.
2. **Batch Grep calls** for reference counting. Group symbols by likely filename patterns rather than grepping one at a time.
3. **Cap the symbol table.** If more than 500 exported symbols are found, focus reference counting on the top 100 most-likely-important symbols (those in files with the most inbound imports).
4. **Skip generated code.** Exclude directories that commonly contain generated output: `generated/`, `__generated__/`, `.next/`, `dist/`, `build/`.

Typical execution time targets:
- Small project (under 100 files): under 2 minutes
- Medium project (100-500 files): under 5 minutes
- Large project (500+ files): under 10 minutes (with batching)

## After Generation

```
Repository map generated at .context-index/hygiene/repo-map.md

  Source files scanned: 142
  Exported symbols found: 387
  Top symbol: db (48 references)

The repo map is used by /adev:hygiene for drift detection.
Run /adev:hygiene --check drift to compare against your orientation doc.
```
