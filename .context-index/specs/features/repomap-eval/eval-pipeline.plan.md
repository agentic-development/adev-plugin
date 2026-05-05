# Implementation Plan: Eval Pipeline

> **Methodology:** adev
> **Charter:** .context-index/specs/features/repomap-eval/charter.md
> **Spec:** .context-index/specs/features/repomap-eval/eval-pipeline.spec.md
> **Review:** PASS_WITH_NOTES (2026-03-23)
> **Platform:** Node.js, JavaScript (ESM), npm, node:test, typescript (devDep)

**Goal:** Build an eval harness that measures repomap parser accuracy by comparing tree-sitter and regex output against TypeScript compiler ground truth on real OSS repos.

**Architecture:** The eval lives entirely in `tests/evals/repomap/`. A runner orchestrates the pipeline: clone repos → generate ground truth via TypeScript compiler API → run both parser modes via `--mode` flag → compare against ground truth → produce markdown reports. The repomap orchestrator gets a new `--mode` flag to support forced parser selection.

---

## File Structure

**Create:**
- `.context-index/adrs/0002-typescript-dev-dependency.md` — ADR for typescript
- `tests/evals/repomap/repos.json` — Target repo config (Zod)
- `tests/evals/repomap/clone.mjs` — Repo cloner with security hardening
- `tests/evals/repomap/generate-ground-truth.mjs` — TypeScript compiler ground truth
- `tests/evals/repomap/parse-repomap.mjs` — Regex mode markdown parser
- `tests/evals/repomap/compare.mjs` — Precision/recall calculator
- `tests/evals/repomap/report.mjs` — Markdown report generator
- `tests/evals/repomap/run-eval.mjs` — Pipeline orchestrator
- `tests/evals/repomap/compare.test.mjs` — Unit tests for metrics
- `tests/evals/repomap/generate-ground-truth.test.mjs` — Unit tests for ground truth

**Modify:**
- `lib/repomap/index.mjs` — Add `--mode tree-sitter|regex` flag
- `package.json` — Add `typescript` devDependency, `eval` and `eval:generate` scripts
- `.gitignore` — Add `tests/evals/repomap/.cache/`

**Reference (read, do not modify):**
- `.context-index/adrs/0001-web-tree-sitter-dependency.md`
- `lib/repomap/` — Parser pipeline being evaluated
- `tests/fixtures/sample-project/` — Small fixture for ground truth generator tests

## Context Packets

### Task 1 Context (ADR)
- Constitution: `.context-index/constitution.md` (principle #1)
- Charter: `repomap-eval/charter.md` (dependencies table)

### Task 2 Context (--mode flag)
- Spec: `eval-pipeline.md` (precondition: --mode flag)
- Code: `lib/repomap/index.mjs` (current mode detection logic)

### Task 3 Context (Config + Gitignore + Scripts)
- Spec: `eval-pipeline.md` (preconditions, postconditions)
- Charter: `repomap-eval/charter.md` (repo config capability)

### Task 4 Context (Cloner)
- Spec: `eval-pipeline.md` (behaviors 1-4, error cases, security criteria)

### Task 5 Context (Ground Truth)
- Spec: `eval-pipeline.md` (behaviors 5-6, acceptance criteria 3-6)
- Fixture: `tests/fixtures/sample-project/` (for unit tests)

### Task 6 Context (Markdown Parser)
- Spec: `eval-pipeline.md` (behavior 8)
- Code: `lib/repomap/index.mjs` (regex mode output format)

### Task 7 Context (Compare)
- Spec: `eval-pipeline.md` (behaviors 7-8, acceptance criteria 7-8, 14)
- Charter: `repomap-eval/charter.md` (domain model: EvalResult)

### Task 8 Context (Report)
- Spec: `eval-pipeline.md` (behavior 9, acceptance criteria 9-10)
- Charter: `repomap-eval/charter.md` (domain model: EvalReport)

### Task 9 Context (Runner)
- Spec: `eval-pipeline.md` (all behaviors, all error cases)
- All prior modules (clone, generate, compare, report)

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (setup, modifies shared files)
- Group B (sequential): Task 4 (independent after Task 3)
- Group C (sequential): Task 5 (independent after Task 3)
- Group D (sequential): Task 6 (independent after Task 2)
- Group E (sequential): Task 7 → Task 8 → Task 9 (depends on Tasks 4-6)

After Task 3 completes, Groups B, C, and D can run in parallel.
Task 7 depends on Tasks 4-6. Task 9 depends on Tasks 7-8.

---

### Task 1: ADR for TypeScript DevDependency [specialist: none] [REQUIRES HUMAN APPROVAL]

**Charter capability:** Ground truth generation (must-have)
**Files:**
- Create: `.context-index/adrs/0002-typescript-dev-dependency.md`

- [ ] **Write ADR**

```markdown
# ADR 0002: Add TypeScript as Dev Dependency

## Status
Accepted

## Date
2026-03-23

## Context
The repomap eval harness needs an unbiased ground truth for measuring parser
accuracy. The TypeScript compiler API can extract all exported symbols and
import relationships from a TypeScript project with 100% accuracy — it is
the language's own parser.

## Decision
Add `typescript` as a devDependency. It is used only by the eval harness
in `tests/evals/repomap/generate-ground-truth.mjs`. It is never imported
by runtime code, skills, hooks, or the CLI.

## Consequences
- Second dependency in the project (first: web-tree-sitter, optional runtime)
- Only affects developers running evals, not end users
- ~50MB package, but only in node_modules during development
- Enables quantitative precision/recall benchmarking
```

- [ ] **Commit**

```bash
git add .context-index/adrs/0002-typescript-dev-dependency.md
git commit -m "docs: add ADR 0002 for typescript dev dependency"
```

---

### Task 2: Add --mode Flag to Repomap Orchestrator [specialist: none]

**Charter capability:** Tree-sitter eval + Regex eval (must-have)
**Files:**
- Modify: `lib/repomap/index.mjs`
- Test: `tests/repomap/index.test.mjs`

- [ ] **Write failing test**

Add tests to the existing file:
1. `--mode tree-sitter` forces tree-sitter mode (even if web-tree-sitter were unavailable — though in practice it is installed)
2. `--mode regex` forces regex mode (skips tree-sitter even though it is available)
3. `--mode regex` produces only `repo-map.md`, no JSON artifacts
4. Invalid `--mode` value prints error and exits 1

- [ ] **Verify test fails**

Run: `node --test tests/repomap/index.test.mjs`

- [ ] **Implement**

Parse `--mode` from `process.argv`. If provided, override the `isTreeSitterAvailable()` check:
- `--mode tree-sitter`: force tree-sitter pipeline (error if web-tree-sitter not installed)
- `--mode regex`: force regex pipeline regardless of tree-sitter availability
- No `--mode`: current auto-detect behavior (unchanged)

- [ ] **Verify test passes**

Run: `node --test tests/repomap/index.test.mjs`

- [ ] **Commit**

```bash
git add lib/repomap/index.mjs tests/repomap/index.test.mjs
git commit -m "feat(repomap): add --mode flag to force parser selection"
```

---

### Task 3: Setup — Config, Gitignore, npm Scripts, Install TypeScript [specialist: none]

**Charter capability:** Repo config + Eval test runner (must-have)
**Files:**
- Create: `tests/evals/repomap/repos.json`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Create repos.json**

```json
{
  "repos": [
    {
      "name": "zod",
      "url": "https://github.com/colinhacks/zod.git",
      "gitRef": "<full 40-char SHA of a recent stable Zod release tag>",
      "language": "typescript"
    }
  ]
}
```

Look up the current Zod v3.x latest release tag SHA.

- [ ] **Install typescript**

```bash
npm install --save-dev typescript
```

- [ ] **Add npm scripts to package.json**

```json
"eval": "node tests/evals/repomap/run-eval.mjs",
"eval:generate": "node tests/evals/repomap/run-eval.mjs --generate-only"
```

- [ ] **Add to .gitignore**

```
tests/evals/repomap/.cache/
```

- [ ] **Verify npm test still passes** (eval scripts don't interfere)

Run: `npm test`

- [ ] **Commit**

```bash
git add tests/evals/repomap/repos.json package.json package-lock.json .gitignore
git commit -m "feat(eval): add repo config, typescript devDep, npm scripts, gitignore"
```

---

### Task 4: Repo Cloner [specialist: none]

**Charter capability:** Repo cloning (must-have)
**Depends on:** Task 3
**Files:**
- Create: `tests/evals/repomap/clone.mjs`

Exports:
- `cloneRepo(repo, cacheDir)` → `{ path: string, cached: boolean }` or throws

Behavior:
1. Validate `repo.url` starts with `https://` — reject other schemes
2. Validate `repo.name` contains only `[a-z0-9-]` — reject path traversal chars
3. Validate `repo.gitRef` is a 40-char hex string
4. Resolve cache path: `<cacheDir>/<repo.name>/`
5. Verify resolved path is within `cacheDir` (path containment)
6. If cache exists, check current HEAD matches `repo.gitRef`. If match, return `{ path, cached: true }`
7. If cache exists but HEAD differs, `rmSync(path, { recursive: true })` after verifying path is within cacheDir
8. Clone: `execFileSync('git', ['clone', '--no-checkout', repo.url, path])` then `execFileSync('git', ['fetch', 'origin', repo.gitRef], { cwd: path })` then `execFileSync('git', ['checkout', repo.gitRef], { cwd: path })` (no `--depth 1` since the target SHA may not be HEAD)
9. MUST use `execFileSync` (array args), never `execSync` with string interpolation

Security constraints are acceptance criteria — test them explicitly.

- [ ] **Write failing tests** — validate URL scheme rejection, name sanitization, path containment, cache reuse, stale re-clone
- [ ] **Verify tests fail**
- [ ] **Implement**
- [ ] **Verify tests pass**
- [ ] **Commit**

```bash
git add tests/evals/repomap/clone.mjs tests/evals/repomap/clone.test.mjs
git commit -m "feat(eval): add repo cloner with security hardening"
```

---

### Task 5: Ground Truth Generator [specialist: none]

**Charter capability:** Ground truth generation (must-have)
**Depends on:** Task 3
**Files:**
- Create: `tests/evals/repomap/generate-ground-truth.mjs`
- Create: `tests/evals/repomap/generate-ground-truth.test.mjs`

Exports:
- `generateGroundTruth(repoPath, outputDir)` → `{ symbolCount, edgeCount }`

Behavior:
1. Use the TypeScript compiler API (`ts.createProgram`) to load the project
2. For each source file, iterate `ts.forEachChild` to find exported declarations
3. Extract: name, kind (function/class/interface/type/enum/constant), file (relative to repoPath), line
4. For each source file, find import declarations and extract: from, to (resolved), symbols
5. Write `ground-truth-symbols.json` and `ground-truth-edges.json` to `outputDir`
6. Handle repos without `tsconfig.json` — create a minimal one in-memory

Schema:
```json
// ground-truth-symbols.json
{ "generated": "ISO timestamp", "symbols": [{ "name": "string", "kind": "string", "file": "string", "line": 1 }] }

// ground-truth-edges.json
{ "generated": "ISO timestamp", "edges": [{ "from": "string", "to": "string", "symbols": ["string"] }] }
```

- [ ] **Write failing test** — run generator against `tests/fixtures/sample-project/`, assert known symbols and edges match (we know the fixture's expected output from its README)
- [ ] **Verify test fails**
- [ ] **Implement**
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add tests/evals/repomap/generate-ground-truth.mjs tests/evals/repomap/generate-ground-truth.test.mjs
git commit -m "feat(eval): add TypeScript compiler ground truth generator"
```

---

### Task 6: Repo-map.md Markdown Parser [specialist: none]

**Charter capability:** Regex eval (must-have)
**Depends on:** Task 2
**Files:**
- Create: `tests/evals/repomap/parse-repomap.mjs`

Exports:
- `parseRepoMap(markdownContent)` → `{ symbols: [{ name, kind, file, line }] }`

Parses the regex mode `repo-map.md` format:
```
### src/types.ts
- interface User (line 1)
- type TaskFilter (line 15)
```

Extract: file from `### heading`, then kind/name/line from `- kind name (line N)` pattern.

- [ ] **Write failing test** — parse a sample repo-map.md string, assert correct symbols extracted
- [ ] **Verify test fails**
- [ ] **Implement** — regex-based line parser
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add tests/evals/repomap/parse-repomap.mjs tests/evals/repomap/parse-repomap.test.mjs
git commit -m "feat(eval): add repo-map.md markdown parser"
```

---

### Task 7: Metrics Calculator [specialist: none]

**Charter capability:** Tree-sitter eval + Regex eval (must-have)
**Depends on:** Tasks 4, 5, 6
**Files:**
- Create: `tests/evals/repomap/compare.mjs`
- Create: `tests/evals/repomap/compare.test.mjs`

Exports:
- `compareSymbols(parserSymbols, groundTruthSymbols)` → `{ precision, recall, missing, extra }`
- `compareEdges(parserEdges, groundTruthEdges)` → `{ precision, recall, missing, extra }` (or `null` if parserEdges is null)

Matching logic:
- Symbols matched by `(name, file)` pair — both normalized to repo-root-relative paths
- Edges matched by `(from, to)` pair — both normalized
- Precision = `|matched| / |parser output|` (what % of parser's symbols are real)
- Recall = `|matched| / |ground truth|` (what % of real symbols did the parser find)
- `missing` = ground truth symbols not found in parser output
- `extra` = parser symbols not found in ground truth

- [ ] **Write failing test** — test with known inputs: perfect match (P=1, R=1), partial match, empty parser output (P=0, R=0), empty ground truth
- [ ] **Verify test fails**
- [ ] **Implement**
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add tests/evals/repomap/compare.mjs tests/evals/repomap/compare.test.mjs
git commit -m "feat(eval): add precision/recall metrics calculator"
```

---

### Task 8: Report Generator [specialist: none]

**Charter capability:** Comparison report (must-have)
**Depends on:** Task 7
**Files:**
- Create: `tests/evals/repomap/report.mjs`

Exports:
- `generateReport(repoName, treeSitterResult, regexResult)` → markdown string

Output format:
```markdown
# Eval Report: zod

> Generated: 2026-03-23T14:30:00Z
> Repo: https://github.com/colinhacks/zod.git @ abc1234...
> Ground truth: 142 symbols, 87 edges

## Symbol Accuracy

| Parser | Precision | Recall | Found | Missing | Extra |
|--------|-----------|--------|-------|---------|-------|
| tree-sitter | 0.95 | 0.92 | 131 | 11 | 7 |
| regex | 0.88 | 0.71 | 101 | 41 | 14 |

## Edge Accuracy (tree-sitter only)

| Precision | Recall | Found | Missing | Extra |
|-----------|--------|-------|---------|-------|
| 0.91 | 0.89 | 78 | 9 | 8 |

## Missing Symbols (tree-sitter)
- function parseSchema (src/helpers.ts:42)
...

## Extra Symbols (tree-sitter)
...

## Missing Symbols (regex)
...
```

- [ ] **Write failing test** — generate report from mock EvalResults, assert structure
- [ ] **Verify test fails**
- [ ] **Implement**
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add tests/evals/repomap/report.mjs tests/evals/repomap/report.test.mjs
git commit -m "feat(eval): add markdown comparison report generator"
```

---

### Task 9: Eval Runner (Orchestrator) [specialist: none]

**Charter capability:** Eval test runner (must-have)
**Depends on:** Tasks 4, 5, 6, 7, 8
**Files:**
- Create: `tests/evals/repomap/run-eval.mjs`

The CLI entry point. Behavior:
1. Read `repos.json` from same directory
2. Parse `--generate-only` flag from argv
3. For each repo:
   a. Clone via `cloneRepo()`
   b. Generate ground truth via `generateGroundTruth()`
   c. If `--generate-only`, skip to next repo
   d. Run repomap with `--mode tree-sitter` against cloned repo, read `symbol-ranks.json` and `dependency-graph.json`
   e. Run repomap with `--mode regex` against cloned repo, read and parse `repo-map.md`
   f. Compare both against ground truth via `compareSymbols()` and `compareEdges()`
   g. Generate report via `generateReport()`
   h. Write report to `tests/evals/repomap/<repo.name>/eval-report.md`
4. Print summary to stdout
5. All errors per-repo are warnings, not failures (exit 0 unless repos.json is invalid)

- [ ] **Implement** (integration orchestrator — tested by running `npm run eval`)
- [ ] **Test manually:** `npm run eval` produces eval-report.md for Zod
- [ ] **Commit**

```bash
git add tests/evals/repomap/run-eval.mjs
git commit -m "feat(eval): add eval pipeline runner orchestrator"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test` (existing tests unaffected)
- [ ] Eval runs: `npm run eval` produces eval-report.md for Zod
- [ ] Ground truth generate: `npm run eval:generate` produces JSON files without running parsers
- [ ] All 25 acceptance criteria from spec satisfied
- [ ] All `.mjs` files use ESM imports
- [ ] No constitutional violations introduced
