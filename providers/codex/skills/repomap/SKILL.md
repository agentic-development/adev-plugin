---
name: adev:repomap
description: "Generate an AST-based symbol index of the repository. Extracts exported functions, classes, types, ranks by reference count. In Codex, invoke with $adev:repomap"
---

# Generate Repository Map

Produce symbol-level index for drift detection and maintenance.

## Arguments

- No arguments: map entire repository
- `--path <dir>`: map specific directory
- `--depth <n>`: limit tree depth

## Process

### Step 1: Detect Language

Read project root files:

| File | Language |
|------|----------|
| `package.json` or `tsconfig.json` | TypeScript/JavaScript |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `pyproject.toml` or `requirements.txt` | Python |
| `pom.xml` or `build.gradle` | Java |
| `Gemfile` | Ruby |

Read manifest for exclude patterns. Always exclude: `node_modules/`, `vendor/`, `dist/`, `build/`, `.git/`, `.context-index/hygiene/`.

### Step 2: Discover Source Files

| Language | Pattern |
|----------|---------|
| TypeScript | `**/*.ts`, `**/*.tsx` (exclude `*.d.ts`, `*.test.*`) |
| JavaScript | `**/*.js`, `**/*.jsx` |
| Python | `**/*.py` (exclude `*_test.py`, `test_*.py`) |
| Go | `**/*.go` (exclude `*_test.go`) |
| Rust | `**/*.rs` |
| Java | `**/*.java` |
| Ruby | `**/*.rb` |

### Step 3: Extract Symbols

Use Grep to extract exports:

**TypeScript/JavaScript:**
```
export (async )?function (\w+)
export const (\w+) = (\(|async \()
export (abstract )?class (\w+)
export (type|interface) (\w+)
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
^type ([A-Z]\w+) (struct|interface)
```

For each symbol: name, kind, file, line.

### Step 4: Count References

For each symbol:
1. Grep counting files containing symbol name
2. Subtract 1 (definition file)
3. Result = importance score

### Step 5: Rank and Organize

1. Sort by reference count (descending)
2. Group by directory
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

## Module Dependency Summary

| Module | Symbols | Inbound | Outbound | Role |
|--------|---------|---------|----------|------|
| src/lib/db/ | 5 | 48 | 2 | core |
| src/lib/auth/ | 12 | 35 | 8 | core |

## Symbol Tree

src/
  lib/
    db/
      index.ts
        db (constant) — 48 refs
```

### Step 7: Staleness Marker

Timestamp and commit hash enable `$adev:hygiene` to detect outdated maps.

## After Generation

```
Repository map generated at .context-index/hygiene/repo-map.md

  Source files scanned: 142
  Exported symbols: 387
  Top symbol: db (48 references)

Used by $adev:hygiene for drift detection.
```
