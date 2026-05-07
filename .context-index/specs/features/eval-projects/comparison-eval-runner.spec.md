# Live Spec: Comparison Eval Runner

<!-- Live Spec within the eval-projects charter.
     This defines the behavioral contract for a comparison runner and rubric system
     that scores plain-claude vs adev-built implementations across the four eval projects.
     Parent Charter: .context-index/specs/features/eval-projects/charter.md -->

---
charter: eval-projects
status: review-pending
risk_level: medium
milestone: v2
revision: 1
charter-revision: 1
created: 2026-05-06
updated: 2026-05-06
---

## Behavioral Contract

This spec defines a comparison evaluation system that scores two branch-based implementations of the same TODO features (default: `plain-claude` vs `adev-built`) across all four eval project repositories. The system consists of: (1) a comparison rubric YAML format extending the existing `data-engineering` rubric pattern, (2) per-project rubric files covering eight comparison dimensions, (3) a deterministic comparison runner (`run-comparison.mjs`), and (4) a cross-project aggregation report.

### Preconditions

- All four eval project submodules exist at `tests/evals/<project-name>/` and are initialized (`git submodule status` shows them at a valid commit).
- Each eval project has at least two of the comparison target branches (default: `plain-claude` and `adev-built`) with TODO features implemented.
- The `main` branch of each project is the common ancestor (base) for both implementation branches.
- The comparison rubric YAML files exist at `tests/evals/comparison/rubrics/<project-slug>.yaml`.
- Node.js is available (no external dependencies required).

### Behaviors

#### Rubric Format

1. **When** a comparison rubric YAML file is parsed **then** it contains four top-level sections: `project` (metadata), `deterministic_checks` (automated, pattern-matchable checks), `comparison_dimensions` (judgment-based scoring across eight dimensions), and `scoring` (weight configuration). This extends the existing `data-engineering` rubric pattern by adding `comparison_dimensions` alongside the existing `required_elements` / `quality_dimensions` split.

2. **When** the `deterministic_checks` section is parsed **then** each check has an `id`, `description`, `metric` (one of: `file_count`, `test_count`, `loc_delta`, `commit_count`, `doc_updated`, `context_artifacts`, `bug_fixed`, `bug_regression_test`), and a `score_rule` that maps the metric value to a 0-10 score for each branch independently.

3. **When** the `comparison_dimensions` section is parsed **then** each dimension has an `id`, `description`, `weight` (numeric, used in weighted average), `anchors` (mapping of score values to descriptions: `0: absent`, `3: minimal`, `5: adequate`, `7: good`, `10: excellent`), and `applies_to` (one of: `both`, `adev-only`). Dimensions with `applies_to: adev-only` are scored only for the adev-built branch and excluded from the plain-claude scorecard.

4. **When** the `scoring` section is parsed **then** it contains `deterministic_weight` (default: 40) and `judgment_weight` (default: 60) that sum to 100, controlling how the two layers contribute to the final score.

#### Comparison Dimensions

5. **When** a comparison evaluation is run **then** exactly eight comparison dimensions are scored, in this order:
   - `code_quality` (weight: 2.0) — readability, idiomatic patterns, error handling, edge case coverage
   - `test_coverage` (weight: 2.0) — tests added, breadth of test scenarios, assertion quality
   - `spec_compliance` (weight: 1.5) — alignment between what was requested in the TODO features and what was delivered
   - `bug_handling` (weight: 2.5) — detection and resolution of the planted bug (see Behavior 8-11)
   - `architectural_coherence` (weight: 2.0) — consistency with existing codebase patterns, naming conventions, module boundaries
   - `commit_hygiene` (weight: 1.0) — meaningful commit messages, atomic changes, logical commit sequence vs monolithic dump
   - `documentation` (weight: 1.0) — README updates, inline comments, usage examples
   - `context_artifacts` (weight: 1.5, `applies_to: adev-only`) — presence and quality of specs, plans, retro artifacts in `.context-index/`

6. **When** a dimension is scored **then** the scorer assigns a value on the 0-10 integer scale using the anchors: 0 = absent (no evidence of this dimension), 3 = minimal (present but severely lacking), 5 = adequate (meets basic expectations), 7 = good (solid implementation with minor gaps), 10 = excellent (exemplary, no improvements obvious).

#### Deterministic Checks

7. **When** the deterministic layer runs for a branch **then** it computes the following metrics by diffing the branch against `main`:
   - `file_count`: number of files added or modified (from `git diff --name-only main..<branch>`)
   - `test_count`: number of test files added or modified (files matching `*test*`, `*spec*`, or in a `tests/` directory)
   - `loc_delta`: net lines added minus lines removed (from `git diff --stat main..<branch>`)
   - `commit_count`: number of commits on the branch since diverging from `main` (from `git rev-list --count main..<branch>`)
   - `doc_updated`: boolean, whether README.md or any `.md` documentation file was modified
   - `context_artifacts`: count of files under `.context-index/` (0 for `plain-claude` by convention)
   - `bug_fixed`: boolean, whether the planted bug's affected file was modified AND the specific bug pattern is no longer present
   - `bug_regression_test`: boolean, whether a test file exists that references the bug's affected behavior

#### Planted Bug Handling

8. **When** the planted bug is evaluated for the `plain-claude` branch **then** the scoring rule is: bug not addressed = score 5 (neutral -- the task was to implement features, not debug), bug correctly fixed = score 8 (bonus -- proactive quality), bug incorrectly "fixed" (changed the file but introduced a different defect or removed working code) = score 2 (penalty).

9. **When** the planted bug is evaluated for the `adev-built` branch **then** the scoring rule is: bug not found = score 2 (penalty -- adev lifecycle includes `/adev:debug`), bug found but wrong fix = score 4, bug found and correctly fixed = score 7, bug found with correct fix AND regression test added = score 10.

10. **When** the `bug_fixed` deterministic check runs **then** it reads the project's `tests/evals/comparison/rubrics/<project-slug>.yaml` for a `planted_bug` section containing `file` (path to the affected source file), `pattern` (regex matching the buggy code), and `fix_pattern` (regex matching a correct fix). The check reports `fixed: true` only if `pattern` no longer matches and `fix_pattern` does match.

11. **When** the `bug_regression_test` deterministic check runs **then** it searches test files on the branch for any file containing a reference to the bug's symptom (defined as `symptom_pattern` in the `planted_bug` rubric section). If found, the check reports `regression_test: true`.

#### Comparison Runner

12. **When** `run-comparison.mjs` is executed with no arguments **then** it defaults to comparing `plain-claude` vs `adev-built` across all four eval projects, reading rubrics from `tests/evals/comparison/rubrics/`, and printing the deterministic scorecard to stdout.

13. **When** `run-comparison.mjs` is executed with `--branch-a <name> --branch-b <name>` **then** it compares the two named branches instead of the defaults.

14. **When** `run-comparison.mjs` is executed with `--project <name>` **then** it runs the comparison only for the named eval project (matching the submodule directory name under `tests/evals/`).

15. **When** `run-comparison.mjs` is executed with `--report` **then** it writes the full comparison report (markdown) to `tests/evals/comparison/outputs/comparison-report.md` in addition to stdout output.

16. **When** `run-comparison.mjs` runs the deterministic layer for a project **then** it performs `git diff` operations within the project's submodule directory (never checking out branches in-place -- it uses `git diff main..<branch>` and `git show <branch>:<path>` to read branch content without modifying the working tree).

17. **When** `run-comparison.mjs` completes all projects **then** it outputs: (a) a per-project deterministic scorecard table, (b) placeholders for judgment dimensions marked `[NEEDS_JUDGE]`, and (c) a cross-project summary table.

#### Cross-Project Aggregation

18. **When** all four projects have been scored (deterministic + judgment) **then** the report contains three sections: (a) per-project scorecards with all eight dimensions and a weighted total, (b) a cross-project summary table with four rows (one per project) showing branch-A total, branch-B total, and delta, (c) a dimension-level comparison showing which branch wins on each dimension across all projects.

19. **When** the cross-project summary is computed **then** the overall winner is determined by the branch with the higher mean weighted score across all four projects. A confidence qualifier is appended: `high` if the winner leads in 3+ of the 7 shared dimensions, `medium` if 2, `low` if 0-1.

20. **When** the dimension-level comparison is computed **then** for each of the 7 shared dimensions (excluding `context_artifacts` which only applies to adev-built), the report shows which branch has the higher mean score across all four projects, plus the absolute difference.

### Postconditions

- The comparison runner produces a deterministic scorecard without any external dependencies or LLM calls.
- Judgment dimensions are clearly separated and marked for manual or LLM-judge scoring.
- No eval project's working tree is modified during the comparison run.
- The rubric YAML format is backward-compatible with the existing `data-engineering` rubric parser (a superset -- old fields still work).
- Each project has exactly one rubric file containing its project-specific `planted_bug` section.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Eval project submodule not initialized | Runner skips project with warning: "Submodule <name> not initialized. Run `git submodule update --init`." | SUBMODULE_MISSING |
| Target branch does not exist in a project | Runner skips that branch/project pair with warning: "Branch <name> not found in <project>." | BRANCH_MISSING |
| Rubric YAML file missing for a project | Runner skips project with warning: "No rubric found at rubrics/<slug>.yaml" | RUBRIC_MISSING |
| `planted_bug` section missing from rubric | Bug handling dimensions score as 0 with warning: "No planted_bug config for <project>" | BUG_CONFIG_MISSING |
| Both branches missing for a project | Runner skips project entirely (not an error -- the project may not have been built yet) | SKIPPED |
| `--project` flag names a non-existent project | Runner exits with error: "Unknown project: <name>. Available: <list>" | UNKNOWN_PROJECT |
| Git operations fail (e.g., corrupt submodule) | Runner reports the git error and skips the project | GIT_ERROR |

## System Constitution Reference

- **"Minimize external dependencies"** -- The comparison runner uses only Node.js built-ins (`fs`, `path`, `child_process`) and `git` CLI commands. No YAML parser dependency -- uses the same minimal inline parser as `run-eval.mjs`.
- **"Pure ESM"** -- `run-comparison.mjs` is a pure ESM module with `.mjs` extension, matching the existing `run-eval.mjs` pattern.
- **"Skills are primarily markdown"** -- Rubric files are YAML (declarative data), not executable code. The runner is companion code that scores against rubrics.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define comparison rubric YAML schema | Document the rubric format (deterministic_checks, comparison_dimensions, scoring, planted_bug) with a reference example | small |
| Create per-project rubric files | Write `tests/evals/comparison/rubrics/{pipeline,api,migration,automation}.yaml` with project-specific planted_bug sections and dimension anchors | medium |
| Implement `run-comparison.mjs` deterministic layer | Script that reads rubrics, runs git diff/log/show against two branches per project, computes deterministic metrics, outputs markdown table | large |
| Implement planted bug detection | Read `planted_bug` config from rubric, run pattern matching against branch content via `git show`, determine fix status and regression test presence | medium |
| Implement cross-project aggregation | Aggregate per-project deterministic scores into summary table, dimension-level comparison, and winner determination with confidence | medium |
| Implement `--report` output writer | Write comparison report markdown to `tests/evals/comparison/outputs/comparison-report.md` | small |
| Scaffold `tests/evals/comparison/` directory | Create directory structure: `rubrics/`, `outputs/`, `run-comparison.mjs` | small |
| Add judgment dimension placeholders | Output `[NEEDS_JUDGE]` markers for non-deterministic dimensions, with instructions for manual or LLM-judge scoring | small |

## Acceptance Criteria

- [ ] Comparison rubric YAML schema is documented and all four per-project rubric files exist at `tests/evals/comparison/rubrics/`
- [ ] Each rubric file contains `deterministic_checks`, `comparison_dimensions` (8 dimensions), `scoring`, and `planted_bug` sections
- [ ] `run-comparison.mjs` runs with no arguments and produces a deterministic scorecard for all four projects
- [ ] `run-comparison.mjs --branch-a <X> --branch-b <Y>` compares arbitrary branches
- [ ] `run-comparison.mjs --project <name>` restricts to a single project
- [ ] `run-comparison.mjs --report` writes output to `tests/evals/comparison/outputs/comparison-report.md`
- [ ] Deterministic layer computes: file_count, test_count, loc_delta, commit_count, doc_updated, context_artifacts, bug_fixed, bug_regression_test
- [ ] Planted bug detection correctly reads `planted_bug` config and uses `git show` to check branch content
- [ ] Bug scoring follows the asymmetric rules: neutral for plain-claude not finding, penalty for adev-built not finding
- [ ] Cross-project summary includes per-project totals, dimension-level comparison, and winner with confidence
- [ ] No eval project working tree is modified during comparison (uses `git diff`/`git show`, not `git checkout`)
- [ ] Runner uses only Node.js built-ins (`fs`, `path`, `child_process`) -- zero external dependencies
- [ ] Runner is pure ESM (`.mjs` extension, no `require`)
- [ ] Judgment dimensions are clearly separated from deterministic checks with `[NEEDS_JUDGE]` markers
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
