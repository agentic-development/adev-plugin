# Live Spec: Shared Conventions for Eval Projects

<!-- Live Spec within the eval-projects charter.
     This defines the structural contract all four eval project repos must follow.
     Parent Charter: .context-index/specs/features/eval-projects/charter.md -->

---
charter: eval-projects
status: review-pending
risk_level: low
milestone: v1
revision: 1
charter-revision: 1
created: 2026-05-06
updated: 2026-05-06
---

## Behavioral Contract

This spec defines the shared structural conventions that every eval project repository must implement. The four project-specific specs (pipeline, API, migration, automation) inherit and comply with these conventions. This spec does not define any project-specific content — only the invariant structure.

### Preconditions

- The adev-plugin repo exists with `tests/evals/` directory available for submodule registration
- Git is available for branch operations and submodule management
- Each eval project is an independent Git repository with its own remote

### Behaviors

1. **When** an eval project repo is initialized **then** it has exactly three branches: `main` (bare project, zero `.context-index/` files), `with-context` (branched off `main`, pre-populated `.context-index/`), and `plain-claude` (branched off `main`, all TODO features implemented by plain Claude Code without any `/adev:*` skills or `.context-index/`).

2. **When** the `main` branch is checked out **then** the project's own test suite passes, all scripts in the README Quick Start section run successfully, and no `.context-index/` directory exists anywhere in the tree.

3. **When** the `with-context` branch is checked out **then** it contains a valid `.context-index/` directory with: `constitution.md`, `manifest.yaml`, `platform-context.yaml`, and at least one extracted spec under `specs/features/`. The project's test suite still passes on this branch.

4. **When** the `with-context` branch is diffed against `main` **then** the only differences are additions inside `.context-index/`. No source code, test files, or configuration files differ between branches.

5. **When** a user runs the project on `main` **then** exactly one planted bug produces incorrect output. The bug does not cause crashes, exceptions, or startup failures. The project's own test suite passes despite the bug (the bug is at the integration/output layer, not caught by unit tests).

6. **When** an eval harness or human attempts to locate the planted bug **then** no file in the repository on the `main` branch describes, hints at, or documents the bug. The bug is discoverable only through behavioral investigation (e.g., `/adev:debug`).

7. **When** the README.md is parsed **then** it contains exactly the following sections in this order: Project Title, Overview, Quick Start, Architecture, TODO Features, License. No sections may be omitted or reordered.

8. **When** the TODO Features section of the README is parsed **then** it contains 4-6 feature entries, each with: a short title, a 1-2 sentence description, a complexity tag (`simple`, `medium`, or `complex`), and a lifecycle coverage tag listing which `/adev:*` skills the feature exercises.

9. **When** the eval project is registered as a submodule in adev-plugin **then** it appears at `tests/evals/<project-name>/` and `git submodule status` reports it as initialized and at the expected commit.

10. **When** the eval harness directory for a project domain is inspected **then** it exists at `tests/evals/<domain>/` and contains empty `scenarios/` and `rubrics/` subdirectories with `.gitkeep` files, ready for v2 eval harness implementation.

11. **When** the `plain-claude` branch is checked out **then** all TODO features listed in the README are implemented, the project's test suite passes (including tests for the new features), and no `.context-index/` directory exists. The implementation was produced by plain Claude Code with no `/adev:*` skill invocations — serving as a baseline for comparison against the adev-built implementation.

12. **When** the `plain-claude` branch is diffed against `main` **then** the differences are source code additions/modifications for the TODO features, new or updated tests, and README updates marking features as done. No `.context-index/` directory exists on this branch.

13. **When** an adev eval run completes against a project **then** the resulting branch or commit is tagged with the adev plugin version used (format: `adev-v<version>`, e.g., `adev-v0.24.0`). The version is read from the adev-plugin's `package.json` at eval time.

14. **When** the `plain-claude` branch is built **then** it is tagged with the Claude model used (format: `plain-claude-<model>`, e.g., `plain-claude-opus-4-6`). This enables comparing baseline quality across model versions.

### Postconditions

- All four eval project repos are structurally identical in layout (same branch names, same README sections, same `.context-index/` structure on `with-context`)
- All four repos are registered as git submodules under `tests/evals/`
- Each domain has an eval harness scaffold directory ready for v2
- Each repo has a `plain-claude` branch with all TODO features implemented (baseline)
- Adev eval runs and plain-claude builds are tagged with version/model metadata

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `main` branch contains `.context-index/` files | Eval harness rejects the project as invalid | CONTEXT_ON_MAIN |
| `with-context` branch has source code differences from `main` | Eval harness rejects — branches must differ only in `.context-index/` | SOURCE_DRIFT |
| README missing a required section | Eval harness reports structural validation failure | README_INCOMPLETE |
| README sections in wrong order | Eval harness reports structural validation failure | README_ORDER |
| TODO Features section has fewer than 4 or more than 6 entries | Eval harness reports count violation | TODO_COUNT |
| Planted bug causes a crash or test failure | Project is invalid — bug must produce wrong output silently | BUG_TOO_VISIBLE |
| Planted bug is documented in any file on `main` | Project is invalid — bug must be discoverable only through investigation | BUG_LEAKED |
| Submodule path does not match `tests/evals/<name>/` | Registration rejected | SUBMODULE_PATH |
| `with-context` branch missing `constitution.md` or `manifest.yaml` | Context branch is incomplete | CONTEXT_INCOMPLETE |
| `plain-claude` branch contains `.context-index/` files | Baseline branch is contaminated — must have no adev context | BASELINE_CONTAMINATED |
| `plain-claude` branch has TODO features not implemented | Baseline is incomplete — all TODO features must be built | BASELINE_INCOMPLETE |
| `plain-claude` branch tests fail | Baseline implementation is broken | BASELINE_TESTS_FAIL |
| Adev eval run produces no version tag | Eval results are untracked — version tag is mandatory | MISSING_VERSION_TAG |

## System Constitution Reference

- **"Minimize external dependencies"** — Eval projects use only their stack's standard tooling (Python stdlib + DuckDB, Node.js + pg). No exotic dependencies that complicate setup.
- **"Skills are primarily markdown"** — The `with-context` branch demonstrates that `.context-index/` is pure markdown/YAML — no executable code in the context layer.
- **"Pure ESM"** — The Node.js eval project (API) must follow ESM conventions. Python projects are not subject to this principle.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define README template | Create `templates/eval-project-readme-template.md` with fixed section order and placeholder content | small |
| Define `.context-index/` template for `with-context` | Create template constitution, manifest, platform-context, and one extracted spec per project archetype | medium |
| Define planted bug contract | Document the invariants a planted bug must satisfy (wrong output, not caught by tests, not documented) as a checklist in the eval harness | small |
| Define TODO feature entry format | Standardize the markdown format for TODO entries: title, description, complexity tag, lifecycle coverage tag | small |
| Register submodule paths | Add all four repos to `.gitmodules` at `tests/evals/<name>/` | small |
| Scaffold eval harness directories | Create `tests/evals/<domain>/scenarios/` and `tests/evals/<domain>/rubrics/` with `.gitkeep` files for all four domains | small |
| Create branch validation script | Script that verifies `main` has no `.context-index/`, `with-context` differs only in `.context-index/`, `plain-claude` has no `.context-index/` and all TODO features implemented, and all branches pass tests | medium |
| Build plain-claude baseline branches | For each project: fork `main` → `plain-claude`, implement all TODO features using plain Claude Code (no `/adev:*` skills), tag with model version | large |
| Define version tagging convention | Document tag format for adev eval runs (`adev-v<version>`) and baseline builds (`plain-claude-<model>`) in eval harness docs | small |

## Acceptance Criteria

- [ ] All four eval project repos follow identical branch layout (`main` + `with-context` off main)
- [ ] `main` branch has zero `.context-index/` files in every project
- [ ] `with-context` branch adds only `.context-index/` — no source code differences from `main`
- [ ] `with-context` contains `constitution.md`, `manifest.yaml`, `platform-context.yaml`, and at least one extracted spec
- [ ] Each project has exactly one planted bug producing wrong output (not crashes)
- [ ] Planted bugs are not documented or hinted at in any file on `main`
- [ ] Each project's own test suite passes on both `main` and `with-context` branches
- [ ] README follows strict template: Title, Overview, Quick Start, Architecture, TODO Features, License (in order)
- [ ] TODO Features section has 4-6 entries each with title, description, complexity tag, lifecycle coverage tag
- [ ] TODO features collectively exercise brainstorm, specify, plan, implement, validate, and debug across the four projects
- [ ] All four repos registered as submodules at `tests/evals/<name>/`
- [ ] Eval harness directories exist at `tests/evals/<domain>/scenarios/` and `tests/evals/<domain>/rubrics/`
- [ ] Each project has a `plain-claude` branch with all TODO features implemented
- [ ] `plain-claude` branches have no `.context-index/` directory
- [ ] `plain-claude` branches pass the project's full test suite (including new feature tests)
- [ ] `plain-claude` branches are tagged with the Claude model used (`plain-claude-<model>`)
- [ ] Adev eval runs are tagged with the adev version used (`adev-v<version>`)
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
