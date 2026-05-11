# Live Spec: Eval Pipeline

---
charter: repomap-eval
status: validated
risk_level: medium
milestone:
revision: 1
charter-revision: 1
created: 2026-03-23
updated: 2026-05-04
source-manifest:
  sha: "fab36e5"
  files:
    - .context-index/adrs/0002-typescript-dev-dependency.md
    - .gitignore
    - lib/repomap/index.mjs
    - package.json
    - tests/evals/repomap/clone.mjs
    - tests/evals/repomap/compare.mjs
    - tests/evals/repomap/compare.test.mjs
    - tests/evals/repomap/generate-ground-truth.mjs
    - tests/evals/repomap/generate-ground-truth.test.mjs
    - tests/evals/repomap/parse-repomap.mjs
    - tests/evals/repomap/report.mjs
    - tests/evals/repomap/repos.json
    - tests/evals/repomap/run-eval.mjs
    - tests/repomap/index.test.mjs
  computed-at: "2026-04-12T11:48:02.741Z"
---

## Behavioral Contract

### Preconditions

- `tests/evals/repomap/repos.json` exists and contains at least one repo entry with `https://` URL, full 40-char commit SHA as `gitRef`, and a valid kebab-case `name`
- `typescript` is installed as a devDependency (requires ADR-0002 before implementation)
- `lib/repomap/` modules exist and are functional (tree-sitter availability is the repomap module's responsibility, not this module's)
- Network access available for cloning repos (first run only)
- The repomap orchestrator (`lib/repomap/index.mjs`) accepts a `--mode tree-sitter|regex` flag to force a specific parser mode (this flag must be added as part of implementation)

### Behaviors

1. **When** `npm run eval` is executed **then** it reads `tests/evals/repomap/repos.json`, clones each target repo to a cache directory (or uses the cached clone if it exists at the correct git ref), generates ground truth from the TypeScript compiler, runs both parser modes, computes metrics, and writes a comparison report per repo.
2. **When** `npm run eval:generate` is executed **then** it clones repos and generates ground truth JSON files only, without running the parsers or producing comparison reports.
3. **When** a repo is already cloned at the correct git ref **then** the clone step is skipped and the cached copy is reused.
4. **When** a repo is cloned at a different git ref than configured **then** the clone is deleted and re-cloned at the correct ref.
5. **When** the TypeScript compiler extracts symbols from a repo **then** it writes `ground-truth-symbols.json` containing every exported symbol with name, kind, file, and line number.
6. **When** the TypeScript compiler extracts imports from a repo **then** it writes `ground-truth-edges.json` containing every file-to-file import relationship with imported symbol names.
7. **When** the tree-sitter parser is evaluated **then** the repomap orchestrator is invoked with `--mode tree-sitter` and its `symbol-ranks.json` symbols are compared against ground truth symbols by (name, file) pair (file paths normalized to repo-root-relative), producing precision and recall.
8. **When** the regex parser is evaluated **then** the repomap orchestrator is invoked with `--mode regex` and the symbols extracted from `repo-map.md` (parsed from markdown `- kind name (line N)` format under `### path` headings) are compared against ground truth symbols by (name, file) pair, producing precision and recall.
9. **When** comparison is complete **then** a markdown `eval-report.md` is written with side-by-side metrics, lists of missing/extra symbols, and missing/extra edges (tree-sitter only).

### Postconditions

- Per repo in config: `ground-truth-symbols.json`, `ground-truth-edges.json`, and `eval-report.md` exist in `tests/evals/repomap/<repo>/`
- `eval-report.md` contains precision/recall for both parser modes
- All precision/recall values are between 0.0 and 1.0
- Cloned repos are cached in `tests/evals/repomap/.cache/` (gitignored)
- Eval does not modify any files outside `tests/evals/` (repomap parser output written inside `.cache/<repo>/.context-index/hygiene/` is expected — it is within the eval boundary)
- `<repo>` directory names are derived from the `name` field in `repos.json` (must be valid kebab-case directory name)

### Error Cases

| Condition | Expected Behavior | Exit Code |
|---|---|---|
| `repos.json` is missing or invalid JSON | Error message with path, exit 1 | 1 |
| `repos.json` has zero repos configured | Warning "No repos configured", exit 0 | 0 |
| Git clone fails (network, invalid URL) | Skip repo, warn "Failed to clone [name]: [error]", continue with remaining repos | 0 |
| Git ref doesn't exist in repo | Skip repo, warn "Ref [ref] not found for [name]", continue | 0 |
| TypeScript compiler fails on a repo (no tsconfig, syntax errors) | Skip repo, warn "Ground truth generation failed for [name]: [error]", continue | 0 |
| Repomap parser fails on a repo | Record zero precision/recall for that parser mode, note failure in report | 0 |
| Ground truth JSON exists but is stale (different git ref) | Regenerate ground truth before evaluating | 0 |

## System Constitution Reference

- **Principle #1:** "Minimize external dependencies" — Applies because `typescript` is added as a devDependency. Justified: dev-only, not shipped to users, required for unbiased ground truth.
- **Principle #3:** "Pure ESM" — All new files in `tests/evals/` must use `.mjs` extension and ESM imports.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| ADR for typescript | Create `.context-index/adrs/0002-typescript-dev-dependency.md` justifying typescript as devDependency | small |
| Install typescript | Add `typescript` to devDependencies | small |
| Add --mode flag to repomap | Add `--mode tree-sitter\|regex` CLI flag to `lib/repomap/index.mjs` to force parser mode | small |
| Repo config | Create `tests/evals/repomap/repos.json` with Zod as first entry (name, https URL, full 40-char SHA) | small |
| Repo cloner | `tests/evals/repomap/clone.mjs` — clone repos to cache dir, handle ref pinning, cache reuse, stale detection. MUST use `execFile`/`spawn` (array args), never `exec` with string interpolation. Validate URL scheme (https only), sanitize repo name (no path traversal), verify cache paths are within `.cache/` before delete. | medium |
| Ground truth generator | `tests/evals/repomap/generate-ground-truth.mjs` — use TypeScript compiler API to extract exported symbols and import edges, write JSON files | large |
| Repo-map.md parser | `tests/evals/repomap/parse-repomap.mjs` — extract symbols from regex mode's markdown output (parse `- kind name (line N)` format under `### path` headings) | small |
| Metrics calculator | `tests/evals/repomap/compare.mjs` — compare parser output against ground truth, compute precision/recall for symbols and edges. Normalize file paths to repo-root-relative before comparison. Edge metrics are null for regex mode. | medium |
| Report generator | `tests/evals/repomap/report.mjs` — produce markdown eval-report.md with side-by-side metrics, missing/extra lists | medium |
| Eval runner | `tests/evals/repomap/run-eval.mjs` — orchestrator: read config → clone → generate → run both parsers (via --mode flag) → compare → report | medium |
| npm scripts | Add `eval` and `eval:generate` scripts to `package.json` | small |
| Unit tests | Tests for compare.mjs (precision/recall with known inputs) and generate-ground-truth.mjs (against small hand-verified fixture) | medium |
| Gitignore | Add `tests/evals/repomap/.cache/` to `.gitignore` | small |

## Acceptance Criteria

- [ ] `repos.json` contains Zod with a pinned git ref
- [ ] `npm run eval` clones Zod, generates ground truth, runs both parsers, produces `eval-report.md`
- [ ] `npm run eval:generate` generates ground truth without running parsers
- [ ] Ground truth is generated from TypeScript compiler, not the repomap parser
- [ ] `ground-truth-symbols.json` contains exported symbols with name, kind, file, line
- [ ] `ground-truth-edges.json` contains import edges with from, to, symbols
- [ ] Tree-sitter eval computes precision and recall for symbols and edges
- [ ] Regex eval computes precision and recall for symbols only (no edges)
- [ ] `eval-report.md` shows side-by-side metrics for both parsers
- [ ] `eval-report.md` lists missing and extra symbols for each parser
- [ ] Cached clones are reused when git ref matches
- [ ] Stale clones (wrong ref) are re-cloned
- [ ] Failed repos are skipped with warnings, eval continues
- [ ] Precision and recall values are between 0.0 and 1.0
- [ ] All `.mjs` files use ESM imports
- [ ] Eval does not interfere with `npm test`
- [ ] No constitutional violations introduced
- [ ] ADR-0002 exists justifying `typescript` devDependency
- [ ] Repo cloner uses `execFile`/`spawn` (never `exec` with string interpolation)
- [ ] Repo URLs validated as `https://` only
- [ ] Repo names sanitized (no path traversal characters)
- [ ] Cache directory paths verified as within `.cache/` before any delete operations
- [ ] `tests/evals/repomap/.cache/` added to `.gitignore`
- [ ] Repomap orchestrator accepts `--mode tree-sitter|regex` flag
