# Benchmark Guide

How to run, score, and compare domain-profile eval benchmarks across the adev eval projects.

## Eval Projects

Five self-contained repositories serve as benchmark targets. Each lives under `tests/evals/` as a git submodule and represents a distinct domain profile.

| Project | Domain Profile | Stack | Infrastructure | Submodule Path |
|---------|---------------|-------|----------------|----------------|
| adev-data-eval | `data-engineering` | dbt + DuckDB + Airflow + Great Expectations | None (embedded DuckDB) | `tests/evals/adev-data-eval` |
| adev-pipeline-eval | `data-engineering` | Python + DuckDB | None (embedded DuckDB) | `tests/evals/adev-pipeline-eval` |
| adev-api-eval | `software` | Node.js + Express + PostgreSQL | Docker Compose (Postgres 16) | `tests/evals/adev-api-eval` |
| adev-migrations-eval | `data-engineering` | Python + dbt + DuckDB + YAML | None (embedded DuckDB) | `tests/evals/adev-migrations-eval` |
| adev-automation-eval | `process-automation` | Python stdlib (zero deps) | None | `tests/evals/adev-automation-eval` |

Each project has a planted bug that produces wrong output (not crashes) and is not detectable by the project's own unit tests.

## Branch Layout

Each eval project follows a three-branch convention:

| Branch | Purpose | Has `.context-index/`? | Source Code |
|--------|---------|----------------------|-------------|
| `main` | Bare project with planted bug and TODO features | No | Original |
| `with-context` | Pre-populated context index with domain profile | Yes (constitution, manifest with domain, platform-context, extracted spec) | Same as `main` |
| `plain-claude` | All TODO features implemented by plain Claude Code (no adev skills) | No | Modified |
| `adev-built` | All TODO features implemented using adev lifecycle skills | Yes | Modified |

**Which branch to use for benchmarks:**

- **Skill quality benchmarks** (brainstorm, specify, assess, debug, etc.): Use `with-context`. This branch has the domain profile configured in the manifest, enabling domain-aware skill behavior (data-specific templates, reviewers, gates).
- **Raw capability benchmarks** (no adev context): Use `main`. This tests how skills behave without domain configuration.
- **End-to-end comparison** (adev vs plain Claude): Compare `adev-built` against `plain-claude` using the comparison harness.

## Setup

### 1. Initialize Submodules

```bash
git submodule update --init --recursive
```

### 2. Fetch Branch Variants

For each eval project, fetch the `with-context` branch locally:

```bash
cd tests/evals/adev-data-eval
git fetch origin with-context
git checkout with-context
cd ../../..

# Repeat for other projects
cd tests/evals/adev-pipeline-eval && git fetch origin with-context && git checkout with-context && cd ../../..
cd tests/evals/adev-api-eval && git fetch origin with-context && git checkout with-context && cd ../../..
cd tests/evals/adev-migrations-eval && git fetch origin with-context && git checkout with-context && cd ../../..
cd tests/evals/adev-automation-eval && git fetch origin with-context && git checkout with-context && cd ../../..
```

### 3. Verify Domain Profiles

After checking out `with-context`, verify each project's domain is declared:

```bash
grep 'domain:' tests/evals/adev-data-eval/.context-index/manifest.yaml
# Expected: domain: data-engineering

grep 'domain:' tests/evals/adev-api-eval/.context-index/manifest.yaml
# Expected: domain: software

grep 'domain:' tests/evals/adev-automation-eval/.context-index/manifest.yaml
# Expected: domain: process-automation
```

## Running Skill Quality Benchmarks

### Scenario-Based Benchmarks

The `data-engineering` eval suite has a full scenario + rubric harness. Other domains use the same pattern but may not have scenarios populated yet.

#### Available Scenarios

Scenarios live in `tests/evals/<domain>/scenarios/*.md`. Each scenario specifies: the skill to invoke, the target project, a prompt, expected behavior, and success criteria.

| Domain | Scenarios | Location |
|--------|-----------|----------|
| data-engineering | data-assess, data-brainstorm, data-specify, data-debug, data-document, data-write-test | `tests/evals/data-engineering/scenarios/` |
| data-pipeline | (scaffold only) | `tests/evals/data-pipeline/scenarios/` |
| data-migration | (scaffold only) | `tests/evals/data-migration/scenarios/` |
| process-automation | (scaffold only) | `tests/evals/process-automation/scenarios/` |
| web-api | (scaffold only) | `tests/evals/web-api/scenarios/` |

#### Running the Benchmark Script

The benchmark script spawns a coding assistant for each scenario, captures stdout and generated files, then resets the project to a clean state.

```bash
# Syntax: run-benchmark.sh <tool> [model]
# Tools: claude, opencode, codex

# Run with Claude Code (default model)
bash tests/evals/data-engineering/run-benchmark.sh claude

# Run with a specific model
bash tests/evals/data-engineering/run-benchmark.sh claude claude-haiku-4-5-20251001

# Run with OpenCode
bash tests/evals/data-engineering/run-benchmark.sh opencode anthropic/claude-sonnet-4-6-20250514

# Run with Codex
bash tests/evals/data-engineering/run-benchmark.sh codex
```

**Important:** Before running, ensure the target project is on the correct branch:
- `with-context` for domain-profile-aware benchmarks
- `main` for raw capability benchmarks

Outputs are saved to `tests/evals/data-engineering/outputs/<variant>/<skill>/output.md`.

#### What the Script Does

For each scenario:

1. Reads the scenario prompt from the `.md` file
2. Snapshots the project's file listing
3. Runs the tool (claude/opencode/codex) with the prompt against the project directory
4. Captures stdout to `output.md`
5. Detects any new/modified files via git diff and appends them as "Generated Files"
6. Resets the project to clean state (`git checkout -- . && git clean -fd`)

### Scoring

Score outputs against rubrics using the deterministic eval runner:

```bash
# Score all variants
node tests/evals/data-engineering/run-eval.mjs

# Score a specific variant
node tests/evals/data-engineering/run-eval.mjs --variant claude

# Score a specific skill across all variants
node tests/evals/data-engineering/run-eval.mjs --skill data-brainstorm
```

The scorer reads YAML rubrics from `tests/evals/data-engineering/rubrics/<skill>.yaml`. Each rubric defines:

- **Required elements** (deterministic, regex-based): Structural patterns the output must contain. Binary pass/fail per element. Scored as `(passed / total) * weight` (default weight: 50 points).
- **Quality dimensions** (manual/LLM scoring): Qualitative aspects requiring human judgment or LLM evaluation. Not scored by the deterministic runner.

Reports are written to `tests/evals/data-engineering/outputs/eval-report.md`.

## Running End-to-End Comparisons

The comparison harness evaluates `plain-claude` vs `adev-built` branches across all eval projects.

```bash
# Deterministic comparison only
node tests/evals/comparison/run-comparison.mjs

# With LLM judge layer (requires ANTHROPIC_API_KEY)
node tests/evals/comparison/run-comparison.mjs --llm-judge
```

### Comparison Dimensions

| Dimension | What It Measures | Scoring Basis |
|-----------|-----------------|---------------|
| Code Quality | Files changed, lines added/removed, lines-per-file | Penalizes >150 lines/file, bonuses balanced ratios |
| Test Coverage | Test file count, test case count, tests added | Parsed from `it`/`test`/`describe` blocks |
| Bug Handling | Whether the planted bug was fixed | 100 pts (fix + regression test), 75 (fix only), 50 (untouched) |
| Architectural Coherence | Directory structure conformance, import hygiene | 60% threshold for structure conformance |
| Commit Hygiene | Commit atomicity, trailer presence (Spec, Plan-task, Author-type) | Blends atomic commits and trailer ratios |
| Spec Compliance | `.context-index/` presence, specs, plans, build-state | N/A for plain-claude; max 100 for adev-built |
| Cost | Token usage, API calls | Placeholder (no metadata yet) |

### LLM Judge Layer

When `--llm-judge` is passed, an additional qualitative layer scores:
- Naming consistency
- Directory structure sensibility
- Commit message quality
- Overall code quality

Uses Claude Haiku for cost efficiency. Scores are blended at 40% LLM / 60% deterministic. Bias is mitigated by randomizing which branch is presented as "A" vs "B".

### Output

Per-project JSON reports in `tests/evals/comparison/reports/<project>.json` and an aggregate summary in `tests/evals/comparison/reports/summary.json`.

## Domain Profile Verification

To verify domain profiles are shaping skill output, compare the same scenario run on `main` (no domain) vs `with-context` (domain configured). Look for:

| Domain | Expected Signals in Output |
|--------|---------------------------|
| `data-engineering` | Data-specific vocabulary (Data Contract, Pipeline Stages, Data Lineage), dbt terminology, data-contract-reviewer findings, data-quality gate references |
| `software` | Generic software charter sections, structural-architect + security-reviewer + consistency-analyzer findings, visual verification references |
| `process-automation` | Workflow vocabulary (Integration Points, Workflow Steps, Recovery & Compensation), integration-reviewer findings, flow-coverage gate references |

### Checklist for Domain Profile Testing

1. Eval project is on `with-context` branch
2. `manifest.yaml` declares `project.domain: <domain>`
3. Run the benchmark
4. Verify output uses domain-specific templates (charter sections, spec vocabulary)
5. Verify domain-specific reviewers are referenced (not just the default three)
6. Verify domain-specific gates are mentioned
7. Compare scores against the same scenario run on `main` branch

## Variant Naming Convention

Variant names are derived from the tool and model used:

| Tool | Model | Variant Name |
|------|-------|-------------|
| claude | (default) | `claude` |
| claude | claude-haiku-4-5-20251001 | `claude-claude-haiku-4-5-20251001` |
| opencode | (default) | `opencode` |
| opencode | anthropic/claude-sonnet-4-6 | `opencode-anthropic-claude-sonnet-4-6` |
| codex | (default) | `codex` |

Baseline outputs (the original reference run) use the variant name `baseline`.

## Version Tagging

- Adev eval runs: tag with `adev-v<version>` (read from `package.json`)
- Plain-claude builds: tag with `plain-claude-<model>` (e.g., `plain-claude-opus-4-6`)

## Adding New Scenarios

To add scenarios for a new domain:

1. Create the scenario file in `tests/evals/<domain>/scenarios/<skill>.md` following the format:
   ```markdown
   # Scenario: <title>
   ## Skill
   `<skill invocation>`
   ## Target Project
   `tests/evals/<project>` -- <description>
   ## Prompt
   <the prompt text>
   ## Expected Behavior
   <what the skill should do>
   ## Success Criteria
   <testable outcomes>
   ```

2. Create a matching rubric in `tests/evals/<domain>/rubrics/<skill>.yaml`:
   ```yaml
   skill: <skill-name>
   scenario: <scenario-slug>
   required_elements:
     - id: <element_id>
       description: "<what it checks>"
       match_pattern: "<regex pattern>"
   quality_dimensions:
     - id: <dimension_id>
       description: "<what it evaluates>"
       weight: <1-2.5>
   scoring:
     required_element_weight: 50
     quality_dimension_weight: 50
   ```

3. Copy and adapt `run-benchmark.sh` for the new domain, updating `PROJECT_DIR` and `SKILLS` array.

4. Copy and adapt `run-eval.mjs` for the new domain, updating paths.

## Known Limitations

- **Non-interactive mode:** `claude --print` runs in non-interactive mode. Skills that ask clarifying questions (brainstorm) or enforce prerequisites (specify requiring `.context-index/`) will produce incomplete output. The `with-context` branch mitigates the prerequisite issue but not the clarification issue.
- **Generated file capture:** The benchmark script uses `git diff` to detect generated files. Files written outside the project directory are not captured.
- **Quality dimensions:** The deterministic scorer only evaluates required elements. Quality dimensions require a separate LLM judge pass or manual review.
- **Cost tracking:** The comparison harness has a placeholder for cost metrics but does not yet capture token usage or API call counts.
