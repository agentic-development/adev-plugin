---
name: adev-repomap
description: "Generate an AST-based symbol index of the repository. Extracts exported functions, classes, types, ranks by reference count. In OpenCode, invoke with skill({ name: 'adev-repomap' })"
---

# Generate Repository Map

Produce a symbol-level index of the codebase for drift detection and maintenance.

## Arguments

- No arguments: map entire repository
- `--path <dir>`: map specific directory
- `--depth <n>`: limit tree depth

## Process

### Step 1: Detect Language and Project Type

Read project root files:

| File | Language |
|------|----------|
| `package.json` or `tsconfig.json` | TypeScript / JavaScript |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `pyproject.toml` or `requirements.txt` | Python |
| `pom.xml` or `build.gradle` | Java |
| `Gemfile` | Ruby |

Read `.context-index/manifest.yaml` for exclude patterns. Always exclude: `node_modules/`, `vendor/`, `dist/`, `build/`, `.git/`, `.context-index/hygiene/`.

### Step 2: Discover Source Files

| Language | Glob Pattern |
|----------|-------------|
| TypeScript | `**/*.ts`, `**/*.tsx` (exclude `*.d.ts`, `*.test.ts`, `*.spec.ts`) |
| JavaScript | `**/*.js`, `**/*.jsx` (exclude tests) |
| Python | `**/*.py` (exclude `*_test.py`, `test_*.py`) |
| Go | `**/*.go` (exclude `*_test.go`) |
| Rust | `**/*.rs` |
| Java | `**/*.java` |
| Ruby | `**/*.rb` |

### Step 3: Extract Symbols

For each source file, use Grep to extract exported symbols.

**TypeScript / JavaScript:**
```
export (async )?function (\w+)
export const (\w+) = (\(|async \()
export (abstract )?class (\w+)
export (type|interface) (\w+)
export enum (\w+)
```

**Python:**
```
^def ([a-zA-Z]\w+)\(
^class ([A-Z]\w+)
^([A-Z_][A-Z0-9_]+)\s*=
```

**Go:**
```
^func ([A-Z]\w+)\(
^func \(\w+ \*?\w+\) ([A-Z]\w+)\(
^type ([A-Z]\w+) (struct|interface)
```

**Rust:**
```
^pub (async )?fn (\w+)
^pub (struct|enum) (\w+)
^pub trait (\w+)
```

For each symbol, record: name, kind, file, line.

### Step 4: Count References

For each extracted symbol, count how many files reference it:

1. Run Grep across project source files counting files containing the symbol name
2. Subtract 1 (the definition file itself)
3. This gives "importance" score

### Step 5: Rank and Organize

1. Sort all symbols by reference count (descending)
2. Group by directory for tree view
3. Mark top 20% as "high importance"

### Step 6: Generate Output

Write to `.context-index/hygiene/repo-map.md`:

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

## Module Dependency Summary

| Module | Exported Symbols | Inbound | Outbound | Role |
|--------|-----------------|---------|----------|------|
| src/lib/db/ | 5 | 48 | 2 | core dependency |
| src/lib/auth/ | 12 | 35 | 8 | core dependency |

## Symbol Tree

src/
  lib/
    db/
      index.ts
        db (constant) — 48 refs
    auth/
      index.ts
        auth() (function) — 35 refs
```

### Step 7: Record Staleness Marker

The **Generated** timestamp and **Commit** hash serve as staleness markers. `adev-hygiene` compares against current HEAD.

## After Generation

```
Repository map generated at .context-index/hygiene/repo-map.md

  Source files scanned: 142
  Exported symbols found: 387
  Top symbol: db (48 references)

The repo map is used by skill({ name: "adev-hygiene" }) for drift detection.
Run skill({ name: "adev-hygiene", args: { check: "drift" } }) to compare against orientation.
```
