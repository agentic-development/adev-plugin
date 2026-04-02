# Live Spec: Detection Passes

---
charter: adev-codehealth
status: validated
risk_level: medium
milestone: v1
revision: 1
charter-revision: 1
created: 2026-04-02
updated: 2026-04-02
---

## Behavioral Contract

### Preconditions

- Precondition validation has passed (repomap artifacts exist, manifest is valid, file scope is resolved)
- `symbol-ranks.json` contains a `symbols[]` array with entries having `name`, `kind`, `file`, `line`, `score`, `references`, `module`
- `dependency-graph.json` contains `nodes[]` (with `path`, `exports[]`, `module`) and `edges[]` (with `from`, `to`, `type`, `symbols[]`)

### Behaviors

#### Dead Export Detection (`dead-exports`)

1. **When** a symbol appears in a node's `exports[]` in `dependency-graph.json` but has zero incoming edges referencing that symbol **then** a finding is emitted with `pass: "dead-exports"` and the symbol's file path, line number (from `symbol-ranks.json`), and symbol name.

2. **When** a dead export is the only export in its file **then** severity is `high` (the entire file may be dead code).

3. **When** a dead export coexists with other referenced exports in the same file **then** severity is `medium`.

4. **When** a symbol has `references: 0` in `symbol-ranks.json` but appears in edges with `type: "re-export"` **then** severity is `low` (barrel file re-export — may be consumed externally).

#### Orphan File Detection (`orphan-files`)

5. **When** a source file in `source_roots` has no incoming edges in `dependency-graph.json` (no other file imports it) and is not an entry point **then** a finding is emitted with `pass: "orphan-files"`.

6. **When** determining entry points, the following are excluded from orphan detection: files matching `**/index.*`, `**/cli.*`, `**/main.*`, files listed as hook scripts in `hooks/hooks.json`, and test files matching `coverage_exclude` patterns.

7. **When** an orphan file has no outgoing edges either (imports nothing and is imported by nothing) **then** severity is `high` (fully isolated).

8. **When** an orphan file has outgoing edges (it imports others but nobody imports it) **then** severity is `medium` (possible unused entry point).

#### Unused Dependency Detection (`unused-deps`)

9. **When** a package listed in `package.json` `dependencies` is not referenced by any `import` statement in source files within `source_roots` **then** a finding is emitted with `pass: "unused-deps"`, severity `high`, the package name, and `file_path` pointing to `package.json`.

10. **When** a package listed in `devDependencies` is not referenced by any import in source or test files **then** a finding is emitted with severity `medium` (dev deps may be used by scripts or tooling not captured by import analysis).

11. **When** checking imports, the skill scans for `import ... from '<package>'`, `import('<package>')`, and `require('<package>')` patterns across all source files (not just those in the dependency graph, since some files may use packages without exporting anything).

#### Stale Code Detection (`stale-code`)

12. **When** a source file's last git commit is older than `hygiene.staleness_threshold_days` (from `manifest.yaml`, default 30) and the file's module has other files modified more recently **then** a finding is emitted with `pass: "stale-code"`, the file path, and the last commit date.

13. **When** a stale file also has zero references (appears as a dead export or orphan) **then** severity is `high` (stale and unused).

14. **When** a stale file is still actively referenced **then** severity is `low` (stable code, not necessarily problematic).

15. **When** all files in a module are equally old **then** no staleness findings are emitted for that module (the entire module is uniformly aged, not selectively stale).

#### Duplicate Logic Detection (`duplicate-logic`)

16. **When** tree-sitter is available at runtime **then** the pass reads source files within scope, parses them with tree-sitter to extract function ASTs, compares function bodies across files for structural similarity, and emits findings for near-duplicates with `pass: "duplicate-logic"`. Note: this pass reads source files directly rather than relying on pre-computed artifacts, since repomap does not currently produce AST hashes. Tree-sitter availability is detected via the same mechanism used by `/adev-repomap`.

17. **When** tree-sitter AST data is not available **then** this pass is skipped entirely with a note: "Duplicate logic detection skipped — tree-sitter data not available. Run `/adev-repomap` with tree-sitter enabled." (per ADR-0001).

18. **When** two or more functions have structurally similar bodies (same AST shape, different variable names) **then** a finding is emitted with severity `medium`, listing all duplicate locations.

19. **When** exact duplicates are found (identical function bodies) **then** severity is `high`.

#### Severity Classification (cross-cutting)

20. **When** any finding is emitted by any pass **then** it must include exactly one severity value: `high`, `medium`, or `low`, determined by the pass-specific rules above.

### Postconditions

- Each pass produces zero or more Finding objects with `pass`, `severity`, `file_path`, `line_number` (where available), `symbol` (where applicable), and `description`
- Findings only reference files within the resolved file scope (respecting `--module` and `coverage_exclude`)
- Pass order is deterministic: `dead-exports` → `orphan-files` → `unused-deps` → `stale-code` → `duplicate-logic`
- Passes operate on two file scopes: dependency-graph-scoped passes (`dead-exports`, `orphan-files`, `duplicate-logic`) analyze only files present in `dependency-graph.json` nodes; file-system-scoped passes (`unused-deps`, `stale-code`) scan all files within resolved `source_roots`. Both scopes respect `--module` and `coverage_exclude` filters.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `symbol-ranks.json` has unexpected format | Skip affected pass, note in report: "symbol-ranks.json format error — pass skipped" | FORMAT_ERROR |
| `dependency-graph.json` has unexpected format | Skip affected pass, note in report | FORMAT_ERROR |
| `package.json` missing (unused-deps pass) | Skip unused-deps pass, note in report | MISSING_PACKAGE_JSON |
| `git log` fails or git not available (stale-code pass) | Skip stale-code pass, note in report | GIT_UNAVAILABLE |
| Tree-sitter data absent (duplicate-logic pass) | Skip pass with informational note per ADR-0001 | TREESITTER_UNAVAILABLE |

## System Constitution Reference

- **Principle 1:** "Minimize external dependencies" — All detection passes operate on JSON files and git commands available via Node.js built-ins. No new dependencies required.
- **Principle 2:** "Skills are primarily markdown" — Detection logic is expressed as structured instructions in SKILL.md. The agent executes the analysis using Read, Grep, and Bash tools.
- **ADR-0001:** "web-tree-sitter is optional" — Duplicate logic detection degrades gracefully when tree-sitter data is absent.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Dead export pass instructions | SKILL.md instructions for cross-referencing exports against edges | medium |
| Orphan file pass instructions | SKILL.md instructions for finding unreferenced files with entry point exclusions | medium |
| Unused dependency pass instructions | SKILL.md instructions for comparing package.json against import statements | medium |
| Stale code pass instructions | SKILL.md instructions for git log analysis with threshold and relative comparison | medium |
| Duplicate logic pass instructions | SKILL.md instructions for AST-based similarity detection with tree-sitter gate | medium |
| Severity classification rules | Consolidate per-pass severity rules into a reference table | small |

## Acceptance Criteria

- [ ] Dead exports with zero references are detected with correct severity tiering
- [ ] Re-exports are flagged as low severity, not high
- [ ] Orphan files exclude entry points (index, cli, main, hooks, tests)
- [ ] Unused `dependencies` are flagged as high, unused `devDependencies` as medium
- [ ] Stale code detection uses `staleness_threshold_days` from manifest (default 30)
- [ ] Uniformly old modules produce no staleness findings
- [ ] Duplicate logic pass skips gracefully when tree-sitter data is absent
- [ ] Each finding has exactly one severity: high, medium, or low
- [ ] Findings only contain files within resolved scope (module filter + coverage_exclude)
- [ ] Passes with missing prerequisites (package.json, git, tree-sitter) skip with informational notes
- [ ] Pass execution order is deterministic
- [ ] All quality gates pass (tests)
- [ ] No constitutional violations introduced
