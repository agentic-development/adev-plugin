---
name: adev:assess
description: "Assess codebase readiness for agentic development. Scans the codebase using static file inspection and outputs maturity scores across 8 structural dimensions (raw mode) or 11 dimensions (adev mode). Use when you want to evaluate how well-suited a codebase is for AI-assisted development, identify improvement areas, or track progress over time. In Codex, invoke with $adev:assess"
---

# Codebase Readiness Assessment

Assess how well a codebase is prepared for agentic development. Runs static file analysis across multiple dimensions to produce a maturity score and actionable feedback.

## Arguments

- No arguments: auto-detect mode based on presence of `.context-index/`
- `--mode raw`: assess only 8 structural dimensions (ignore adev-specific dimensions)
- `--mode adev`: assess all 11 dimensions (8 structural + 3 adev-specific)
- `--output markdown` (default): output as human-readable markdown scorecard
- `--output json`: output as machine-parseable JSON
- `--target <path>`: directory to assess (default: cwd)

## Prerequisites

None — this skill operates entirely through static file inspection.

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill assess
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

## Assessment Dimensions

### Structural Dimensions (8) — Used in both raw and adev modes

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| Test Infrastructure | 12.5% | Presence of test files, test framework, test patterns |
| Type Safety | 12.5% | TypeScript/type annotations, strict mode, type coverage |
| Modularity | 12.5% | File organization, clear boundaries, single responsibility |
| Naming | 12.5% | Consistent naming conventions, descriptive names |
| Documentation | 12.5% | README, comments, docstrings, API docs |
| Dependency Hygiene | 12.5% | Package.json quality, lock files, dependency clarity |
| Build Configuration | 12.5% | Build scripts, lint config, typecheck config |
| Spec Sources | 12.5% | Architecture docs, specs, ADRs |

### Adev-Specific Dimensions (3) — Only used in adev mode

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| Adev Context Index | 33% | Presence and quality of .context-index/ |
| Adev Skills | 33% | Skill coverage and quality |
| Adev Hooks | 33% | Hook configuration and coverage |

## Scoring Criteria

### Test Infrastructure (0-100)

| Score | Criteria |
|-------|----------|
| 80-100 | Test files present, test framework configured, >50% code coverage |
| 50-79 | Test files present, framework configured, some coverage |
| 20-49 | Some test files exist |
| 0-19 | No tests or minimal test files |

**Evidence:** Glob for `**/*.test.*`, `**/*.spec.*`, `**/tests/**`, check package.json for test scripts

### Type Safety (0-100)

| Score | Criteria |
|-------|----------|
| 80-100 | TypeScript with strict mode, all files typed |
| 50-79 | TypeScript with strict mode, some files untyped |
| 20-49 | TypeScript or JSDoc types in some files |
| 0-19 | No type annotations |

**Evidence:** Check for `tsconfig.json`, `*.ts` files, `checkJs` in jsconfig

### Modularity (0-100)

| Score | Criteria |
|-------|----------|
| 80-100 | Clear directory structure, single responsibility, small files (<300 lines) |
| 50-79 | Reasonably organized, some large files |
| 20-49 | Some organization, mixed patterns |
| 0-19 | Monolithic or disorganized |

**Evidence:** Glob for directory structure, check file sizes

### Naming (0-100)

| Score | Criteria |
|-------|----------|
| 80-100 | Consistent naming across codebase |
| 50-79 | Mostly consistent with minor exceptions |
| 20-49 | Inconsistent naming patterns |
| 0-19 | Poor or unclear naming |

**Evidence:** Grep for naming patterns, check file names

### Documentation (0-100)

| Score | Criteria |
|-------|----------|
| 80-100 | README, API docs, inline comments, good coverage |
| 50-79 | README present, some documentation |
| 20-49 | Minimal documentation |
| 0-19 | No documentation |

**Evidence:** Check for README.md, docs/, src/**/*.md

### Dependency Hygiene (0-100)

| Score | Criteria |
|-------|----------|
| 80-100 | package.json clean, lock file present, reasonable dep count |
| 50-79 | package.json exists, some issues |
| 20-49 | package.json present but messy |
| 0-19 | No package.json or critical issues |

**Evidence:** Read package.json, check for package-lock.json or yarn.lock

### Build Configuration (0-100)

| Score | Criteria |
|-------|----------|
| 80-100 | Build scripts, lint config, typecheck all present |
| 50-79 | Some build config present |
| 20-49 | Minimal build config |
| 0-19 | No build configuration |

**Evidence:** Check for build scripts in package.json, .eslintrc, tsconfig

### Spec Sources (0-100)

| Score | Criteria |
|-------|----------|
| 80-100 | Architecture docs, ADRs, specs present |
| 50-79 | Some documentation exists |
| 20-49 | Minimal documentation |
| 0-19 | No architectural documentation |

**Evidence:** Check for docs/, ADRs, spec files

### Adev Context Index (0-100) — adev mode only

| Score | Criteria |
|-------|----------|
| 80-100 | Complete .context-index/ with constitution, charters, specs, ADRs |
| 50-79 | Partial .context-index/ setup |
| 20-49 | Minimal .context-index/ |
| 0-19 | .context-index/ missing or empty |

**Evidence:** Check .context-index/ directory contents

### Adev Skills (0-100) — adev mode only

| Score | Criteria |
|-------|----------|
| 80-100 | Multiple well-structured skills present |
| 50-79 | Some skills defined |
| 20-49 | Minimal skills |
| 0-19 | No skills |

**Evidence:** Check skills/ directory

### Adev Hooks (0-100) — adev mode only

| Score | Criteria |
|-------|----------|
| 80-100 | Multiple hooks configured and working |
| 50-79 | Some hooks present |
| 20-49 | Minimal hooks |
| 0-19 | No hooks |

**Evidence:** Check hooks/ directory and hooks.json

## Maturity Levels

| Level | Score Range | Description |
|-------|-------------|-------------|
| L1 | 0-20 | Initial — minimal structure |
| L2 | 21-40 | Developing — basic structure in place |
| L3 | 41-60 | Defined — moderate preparedness |
| L4 | 61-80 | Managed — well-prepared |
| L5 | 81-100 | Optimized — excellent agentic readiness |

## Output Format

**Persona adaptation:** The formats below are defaults for the Developer persona. If a different persona is active, adapt the chat summary to its output rules. The scorecard file written to disk always uses the full format.

### Markdown Scorecard

```
# Codebase Readiness Assessment

**Total Score:** 72/100 (L4 - Managed)
**Mode:** adev
**Assessed:** 2026-03-24T10:30:00Z

## Dimensions

| Dimension | Score | Indicator |
|-----------|-------|-----------|
| Test Infrastructure | 85 | 🟢 ████████░ |
| Type Safety | 78 | 🟢 ███████░░ |
| Modularity | 72 | 🟡 ██████░░░ |
| Naming | 65 | 🟡 ██████░░░ |
| Documentation | 55 | 🟡 █████░░░░ |
| Dependency Hygiene | 80 | 🟢 ███████░░ |
| Build Configuration | 75 | 🟢 ███████░░ |
| Spec Sources | 45 | 🟡 █████░░░░ |
| Adev Context Index | 90 | 🟢 █████████ |
| Adev Skills | 70 | 🟡 ███████░░ |
| Adev Hooks | 60 | 🟡 ██████░░░ |
```

### JSON Output

```json
{
  "version": "1.0.0",
  "timestamp": "2026-03-24T10:30:00Z",
  "mode": "adev",
  "totalScore": 72,
  "level": "L4",
  "dimensions": [
    {
      "name": "Test Infrastructure",
      "score": 85,
      "weight": 0.125,
      "evidence": ["Found test files", "Jest configured"]
    }
  ]
}
```

## Process

1. **Detect mode:** Check for `.context-index/` directory (or use explicit `--mode`)
2. **Select dimensions:** Load appropriate dimension set based on mode
3. **Scan codebase:** Use Glob/Grep to find evidence for each dimension
4. **Score each dimension:** Apply scoring criteria to produce 0-100 score
5. **Calculate total:** Weighted average of dimension scores
6. **Determine level:** Map total to L1-L5
7. **Format output:** Generate markdown or JSON per `--output` flag

## Notes

- Uses only Node.js built-ins (fs, path) for file inspection
- No external commands are executed (no npm test, tsc, etc.)
- Evidence is collected for each dimension to explain scores
- Scores are deterministic and reproducible
