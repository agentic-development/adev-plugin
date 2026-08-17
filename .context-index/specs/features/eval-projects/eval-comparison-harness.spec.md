---
charter: eval-projects
status: review-pending
risk_level: low
milestone:
revision: 1
charter-revision: 1
created: 2026-05-06
updated: 2026-05-06
---

# Live Spec: Eval Comparison Harness

<!-- Live Spec within the eval-projects charter.
     Defines the scoring rubrics, comparison runner, and report format for
     evaluating plain-claude vs adev-built implementations across all four eval projects.
     Parent Charter: .context-index/specs/features/eval-projects/charter.md -->

## Behavioral Contract

A comparison harness that evaluates two implementation approaches (plain Claude Code vs adev lifecycle) across the four eval project repos. The harness diffs the `plain-claude` and `adev-built` branches of each project, scores both implementations against a shared rubric, and produces a structured comparison report. Extends the existing eval harness pattern from `tests/evals/data-engineering/`.

### Preconditions

- Each eval project repo has `main`, `plain-claude`, and `adev-built` branches
- `plain-claude` branches are tagged with `plain-claude-<model>` (e.g., `plain-claude-claude-opus-4-6`)
- `adev-built` branches are tagged with `adev-v<version>` (e.g., `adev-v0.24.0`)
- All branches have passing test suites
- The harness runner (`tests/evals/comparison/run-comparison.mjs`) is invocable via `node`

### Behaviors

1. **When** the comparison runner is invoked with `--project <repo-name>` **then** it checks out both `plain-claude` and `adev-built` branches, runs each project's test suite, collects metrics, scores against the rubric, and writes a per-project comparison report to `tests/evals/comparison/reports/<repo-name>.json`.

2. **When** the comparison runner is invoked with `--all` **then** it runs the comparison for all four eval projects sequentially and produces both per-project reports and an aggregate summary at `tests/evals/comparison/reports/summary.json`.

3. **When** scoring the **code quality** dimension **then** the harness measures: number of source files changed, total lines added/removed, function count, average function length, and presence of dead code or unused imports. These are deterministic metrics collected by diffing against `main`.

4. **When** scoring the **test coverage** dimension **then** the harness counts: number of test files, number of test cases, ratio of test lines to implementation lines, and whether each TODO feature has at least one dedicated test. The harness runs the project's test suite on each branch and captures pass/fail counts.

5. **When** scoring the **bug handling** dimension **then** the harness checks whether the planted bug (present on `main`) was: (a) left untouched, (b) fixed intentionally with a commit message referencing the bug, (c) fixed incidentally during feature work, or (d) introduced new bugs. Classification is based on diffing the known bug location file against `main` and inspecting commit messages.

6. **When** scoring the **architectural coherence** dimension **then** the harness checks: whether new files follow the project's existing directory structure, whether new modules are imported from appropriate locations, and whether the implementation introduces circular dependencies. This uses static analysis (import graph from source files).

7. **When** scoring the **cost** dimension **then** the harness reads token usage and tool call counts from the build metadata. For `plain-claude`, this comes from the agent's usage stats (token count, tool calls, duration). For `adev-built`, this comes from the build state files plus subagent usage. Cost data is optional — if unavailable, this dimension is scored as N/A.

8. **When** scoring the **spec compliance** dimension (adev-only) **then** the harness checks whether the `adev-built` branch has specs, plans, and review artifacts in `.context-index/` for each TODO feature, and whether acceptance criteria in those specs are satisfied by the implementation. This dimension is N/A for `plain-claude` (which has no specs by design).

9. **When** scoring the **commit hygiene** dimension **then** the harness evaluates: number of commits, whether commits are atomic (one feature per commit), presence of descriptive commit messages, and whether commit trailers (Spec:, Plan-task:) are present (adev-only).

10. **When** the report is generated **then** it includes: per-dimension scores (0-100), a composite score with configurable dimension weights, a side-by-side diff summary, and a natural-language narrative comparing the two approaches.

### Postconditions

- Per-project reports exist at `tests/evals/comparison/reports/<repo-name>.json`
- Aggregate summary exists at `tests/evals/comparison/reports/summary.json`
- Reports are valid JSON matching the report schema
- No files outside `tests/evals/comparison/` are modified by the harness

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `plain-claude` branch missing for a project | Skip that project, report as BRANCH_MISSING | BRANCH_MISSING |
| `adev-built` branch missing for a project | Skip that project, report as BRANCH_MISSING | BRANCH_MISSING |
| Test suite fails on a branch | Score test coverage as 0 for that branch, continue scoring other dimensions | TEST_FAILURE |
| No cost metadata available | Score cost dimension as N/A, do not penalize composite score | COST_UNAVAILABLE |
| Project repo not found at expected path | Skip with clear error message | REPO_NOT_FOUND |
| Rubric file missing for a project domain | Use default rubric weights, warn in report | RUBRIC_MISSING |

## Scoring Dimensions

### Rubric Format

Each project domain has a rubric YAML file at `tests/evals/comparison/rubrics/<domain>.yaml` extending the existing data-engineering rubric pattern:

```yaml
domain: data-pipeline
project: adev-pipeline-eval

dimensions:
  - id: code_quality
    weight: 20
    metrics:
      - id: lines_per_function
        description: "Average function length under 30 lines"
        threshold: 30
        scoring: "linear_penalty"  # score = max(0, 100 - (avg - threshold) * 5)
      - id: dead_code
        description: "No unused imports or unreachable code"
        scoring: "binary"  # 100 if clean, 0 if not
      - id: naming_consistency
        description: "New symbols follow project's existing naming conventions"
        scoring: "llm_judge"  # requires LLM scoring pass

  - id: test_coverage
    weight: 20
    metrics:
      - id: test_count
        description: "Number of test cases added"
        scoring: "ratio"  # score relative to other branch
      - id: feature_coverage
        description: "Each TODO feature has at least one test"
        scoring: "checklist"  # 100 * (features_with_tests / total_features)
      - id: test_pass_rate
        description: "All tests pass"
        scoring: "binary"

  - id: bug_handling
    weight: 15
    metrics:
      - id: planted_bug_status
        description: "Was the planted bug found and handled appropriately?"
        scoring: "categorical"
        # Categories: untouched (50), fixed_intentionally (100),
        # fixed_incidentally (75), new_bugs_introduced (0)
      - id: bug_file_diff
        description: "Changes to the file containing the planted bug"
        match_file: "<bug-location-from-spec>"

  - id: architectural_coherence
    weight: 15
    metrics:
      - id: directory_structure
        description: "New files follow existing project layout"
        scoring: "llm_judge"
      - id: import_hygiene
        description: "No circular dependencies, imports from correct layers"
        scoring: "binary"

  - id: cost
    weight: 10
    metrics:
      - id: token_usage
        description: "Total tokens consumed"
        scoring: "ratio_inverse"  # lower is better, scored relative to other branch
      - id: tool_calls
        description: "Total tool invocations"
        scoring: "ratio_inverse"
      - id: wall_time
        description: "Total execution time in seconds"
        scoring: "ratio_inverse"

  - id: commit_hygiene
    weight: 10
    metrics:
      - id: atomic_commits
        description: "One commit per feature"
        scoring: "checklist"
      - id: message_quality
        description: "Descriptive commit messages (not generic)"
        scoring: "llm_judge"

  - id: spec_compliance
    weight: 10
    adev_only: true  # N/A for plain-claude, weight redistributed
    metrics:
      - id: lifecycle_artifacts
        description: "Specs, plans, reviews exist for each feature"
        scoring: "checklist"
      - id: acceptance_criteria_met
        description: "Spec acceptance criteria satisfied by implementation"
        scoring: "checklist"
```

### Scoring Modes

- **Deterministic layer** (`binary`, `linear_penalty`, `ratio`, `checklist`, `categorical`): Pattern matching and static analysis. Run by `run-comparison.mjs` directly.
- **LLM judge layer** (`llm_judge`): Requires a separate pass with an LLM evaluator. Run via `--llm-judge` flag. Without this flag, LLM dimensions are scored as N/A and their weight is redistributed.

### Composite Score

```
composite = sum(dimension_score * dimension_weight) / sum(active_weights)
```

Where `active_weights` excludes dimensions scored as N/A. The `spec_compliance` dimension weight is redistributed to other dimensions when scoring `plain-claude` (since it has no specs by design).

## Report Format

### Per-Project Report (`<repo-name>.json`)

```json
{
  "project": "adev-pipeline-eval",
  "domain": "data-pipeline",
  "branches": {
    "plain_claude": { "tag": "plain-claude-claude-opus-4-6", "commit": "abc123" },
    "adev_built": { "tag": "adev-v0.24.0", "commit": "def456" }
  },
  "dimensions": {
    "code_quality": {
      "plain_claude": { "score": 78, "metrics": { ... } },
      "adev_built": { "score": 85, "metrics": { ... } }
    },
    ...
  },
  "composite": {
    "plain_claude": 72,
    "adev_built": 81
  },
  "diff_summary": {
    "plain_claude": { "files_changed": 8, "lines_added": 342, "lines_removed": 12 },
    "adev_built": { "files_changed": 11, "lines_added": 485, "lines_removed": 18 }
  },
  "bug_handling": {
    "plain_claude": "fixed_incidentally",
    "adev_built": "untouched"
  },
  "generated_at": "2026-05-06T18:00:00Z"
}
```

### Aggregate Summary (`summary.json`)

```json
{
  "projects": ["adev-pipeline-eval", "adev-api-eval", "adev-migrations-eval", "adev-automation-eval"],
  "aggregate_scores": {
    "plain_claude": { "mean": 74, "min": 68, "max": 82 },
    "adev_built": { "mean": 83, "min": 78, "max": 89 }
  },
  "dimension_breakdown": {
    "code_quality": { "plain_claude_avg": 76, "adev_built_avg": 82 },
    ...
  },
  "notable_findings": [
    "plain-claude fixed planted bugs in 2/4 projects (pipeline, api) without being asked",
    "adev-built produced 40% more test cases on average",
    ...
  ],
  "generated_at": "2026-05-06T18:00:00Z"
}
```

## System Constitution Reference

- **"Minimize external dependencies"** — The comparison harness uses only Node.js built-ins (fs, path, child_process). YAML parsing reuses the minimal parser from `run-eval.mjs`. No external dependencies.
- **"Pure ESM"** — The runner is `.mjs` with ESM imports.
- **"Skills are primarily markdown"** — The rubrics are YAML data files, not executable code. The runner is a companion utility, not a skill.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define rubric YAML schema | Formalize the rubric format with all scoring types and dimension definitions | small |
| Create per-domain rubrics | Write rubric YAML files for data-pipeline, web-api, data-migration, process-automation | medium |
| Build deterministic scorer | Implement `run-comparison.mjs` with branch checkout, test execution, metric collection, and deterministic scoring | large |
| Build diff analyzer | Module that diffs `plain-claude` and `adev-built` against `main`, extracts file/line metrics | medium |
| Build bug classifier | Module that checks known bug locations against both branches and classifies handling | small |
| Build import graph analyzer | Static analysis of imports to detect circular dependencies and layer violations | medium |
| Build report generator | Module that assembles per-project and aggregate reports from scores | medium |
| Add LLM judge pass | Optional `--llm-judge` flag that scores `llm_judge` metrics via Claude API | medium |
| Add cost metadata collector | Read agent usage stats and build state files to populate cost dimension | small |
| Write harness tests | Unit tests for the scorer, diff analyzer, bug classifier, and report generator | medium |

## Acceptance Criteria

- [ ] Rubric YAML files exist for all four project domains at `tests/evals/comparison/rubrics/`
- [ ] `run-comparison.mjs` runs deterministic scoring for a single project (`--project`)
- [ ] `run-comparison.mjs` runs all four projects (`--all`) and produces aggregate summary
- [ ] Per-project reports are valid JSON with scores for all deterministic dimensions
- [ ] Aggregate summary includes mean/min/max composite scores and dimension breakdown
- [ ] Bug handling is correctly classified for each project and branch
- [ ] `--llm-judge` flag enables LLM-based scoring dimensions (graceful degradation when omitted)
- [ ] Cost dimension handles missing metadata gracefully (N/A, no penalty)
- [ ] Spec compliance dimension is N/A for plain-claude with weight redistributed
- [ ] Harness has unit tests for scorer, diff analyzer, and report generator
- [ ] No external dependencies — Node.js built-ins only
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
