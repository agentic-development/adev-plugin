---
mode: cross-cutting
status: validated
risk_level: low
revision: 1
created: 2026-05-03
updated: 2026-05-04
tracker-ref: issue-228
affects:
  - planning
  - implementation
  - validation
  - maintenance
  - strategic-planning
source-manifest:
  files:
    - lib/meta-tools.mjs
    - tests/lib/meta-tools.test.mjs
drift_detected: true
---

# Cross-Cutting Spec: Meta-Tools

<!-- Cross-cutting spec for deterministic helper functions that replace multi-turn
     Read/Grep/Glob sequences with single Bash calls. Reduces subagent turn count
     by collapsing file-scanning operations into Node.js scripts. -->

## Behavioral Contract

### Preconditions

- A `.context-index/` directory exists with `constitution.md`, `manifest.yaml`, and at least one spec or plan file.
- Node.js is available in the execution environment (guaranteed by platform-context.yaml: `runtime: nodejs`).
- The caller invokes meta-tools via inline `node -e` in a single Bash tool call, passing the project root as an argument or resolving it from `cwd`.

### Behaviors

1. **When** `loadSpecContext(specPath)` is called with a valid spec file path **then** it returns a single concatenated string containing: the spec file content, the parent charter's Capability Map section (or full charter if no capability map heading exists), and the constitution's Non-Negotiable Principles section — separated by `\n---\n` delimiters with section headers.

2. **When** `loadSpecContext(specPath)` is called and the spec has `charter: <module>` in its frontmatter **then** it resolves the charter at `.context-index/specs/features/<module>/charter.md`. For cross-cutting specs (no `charter:` field), it skips the charter section and returns only spec + constitution.

3. **When** `findSpecsByStatus(module, status)` is called **then** it scans all `.md` files in `.context-index/specs/features/<module>/` (excluding `charter.md`), parses YAML frontmatter from each, filters by `status` field matching the provided value, and returns a JSON array of `{ path, title, status, milestone, revision }` objects sorted by filename.

4. **When** `findSpecsByStatus(module, status)` is called with `module` set to `"*"` or `null` **then** it scans all modules (all directories under `.context-index/specs/features/`) and includes cross-cutting specs from `.context-index/specs/cross-cutting/`.

5. **When** `getPlanProgress(planPath)` is called with a valid plan file path **then** it reads the file, counts all markdown checkboxes (`- [ ]` and `- [x]`), and returns a JSON object: `{ total, completed, remaining, percent, tasks: [{ number, title, done }] }`.

6. **When** `getPlanProgress(planPath)` is called and the plan file uses task headings (`### Task N:`) **then** it groups checkboxes by task, reporting per-task progress in the `tasks` array.

7. **When** any meta-tool function encounters a missing file **then** it throws an error with a descriptive message including the attempted path. The caller (Bash) receives a non-zero exit code and stderr output.

8. **When** a SKILL.md instructs the agent to use a meta-tool **then** the skill provides the exact inline Node.js invocation pattern, and the agent executes it in a single Bash turn instead of multiple Read/Grep turns.

### Postconditions

- The meta-tool's output is printed to stdout as either plain text (loadSpecContext) or JSON (findSpecsByStatus, getPlanProgress).
- No files are modified — all meta-tools are read-only.
- The Bash call completes in a single turn, replacing what would have been 3-15 sequential Read/Grep/Glob turns.

### Error Cases

| Condition | Expected Behavior | Exit Code |
|-----------|-------------------|-----------|
| Spec file not found | Throws with message: "Spec not found: <path>" | 1 |
| Charter not found for spec | Returns spec + constitution only, logs warning to stderr | 0 |
| Plan file not found | Throws with message: "Plan not found: <path>" | 1 |
| Module directory not found | Returns empty array `[]` | 0 |
| Malformed YAML frontmatter in spec | Skips that file, logs warning to stderr | 0 |
| No checkboxes found in plan | Returns `{ total: 0, completed: 0, remaining: 0, percent: 0, tasks: [] }` | 0 |

## System Constitution Reference

- **"Minimize external dependencies"** (Principle 1) — Meta-tools use only Node.js built-ins (`fs`, `path`). No external YAML parser — frontmatter is extracted via regex between `---` delimiters.
- **"Skills are primarily markdown"** (Principle 2) — Meta-tools are companion code in `lib/`, not executable logic inside SKILL.md. Skills reference them via inline invocation patterns but function without them (graceful degradation).
- **"Pure ESM"** (Principle 3) — `lib/meta-tools.mjs` is an ESM module with named exports.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| planning (plan) | High | Replace multi-file context loading with `loadSpecContext`; use `getPlanProgress` for resume detection |
| implementation (implement) | High | Use `loadSpecContext` when assembling context packets for per-task subagents |
| validation (validate) | Medium | Use `getPlanProgress` for plan checkbox completion checks |
| maintenance (hygiene, status) | Medium | Use `findSpecsByStatus` for spec audits and status dashboards |
| strategic-planning (build) | Medium | Use `findSpecsByStatus` for milestone discovery (`--milestone` mode) |

## Integration Points

1. **SKILL.md → lib/meta-tools.mjs**: Skills include inline `node -e` patterns that import and call meta-tool functions. Example in plan SKILL.md context-loading step.
2. **lib/meta-tools.mjs → .context-index/**: All reads target the context index. No writes.
3. **Graceful degradation**: If the meta-tool call fails (Node.js error, missing file), the skill falls back to manual Read/Grep. The meta-tool is an optimization, not a hard dependency.

## Invocation Patterns

Skills reference meta-tools via inline Node.js in a single Bash call:

```bash
# Load spec context (spec + charter + constitution)
node -e "import {loadSpecContext} from './lib/meta-tools.mjs'; console.log(await loadSpecContext('.context-index/specs/features/task-boards/drag-drop.md'))"

# Find specs by status
node -e "import {findSpecsByStatus} from './lib/meta-tools.mjs'; console.log(JSON.stringify(await findSpecsByStatus('task-boards', 'review-pending')))"

# Get plan progress
node -e "import {getPlanProgress} from './lib/meta-tools.mjs'; console.log(JSON.stringify(await getPlanProgress('.context-index/specs/features/task-boards/drag-drop.plan.md')))"
```

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1 | Create `lib/meta-tools.mjs` with `loadSpecContext`, `findSpecsByStatus`, `getPlanProgress` exports | medium |
| 2 | Write tests in `tests/lib/meta-tools.test.mjs` covering all behaviors and error cases | medium |
| 3 | Add inline invocation pattern to plan SKILL.md context-loading step (optional usage note) | small |
| 4 | Add inline invocation pattern to implement SKILL.md context packet assembly | small |
| 5 | Add inline invocation pattern to status/hygiene SKILL.md for spec scanning | small |

## Acceptance Criteria

- [x] AC-1: `lib/meta-tools.mjs` exports three named functions: `loadSpecContext`, `findSpecsByStatus`, `getPlanProgress`.
- [x] AC-2: All functions use only Node.js built-ins (fs, path) — no external dependencies.
- [x] AC-3: `loadSpecContext` returns concatenated spec + charter capability map + constitution principles, with `---` delimiters.
- [x] AC-4: `findSpecsByStatus` parses YAML frontmatter via regex (no external YAML library) and filters correctly.
- [x] AC-5: `getPlanProgress` correctly counts `- [ ]` and `- [x]` checkboxes and groups by task headings.
- [x] AC-6: Error cases return appropriate exit codes (0 for graceful degradation, 1 for hard failures).
- [x] AC-7: Tests in `tests/lib/meta-tools.test.mjs` cover all 8 behaviors and 6 error cases (minimum 14 test cases).
- [x] AC-8: At least one SKILL.md file includes the inline invocation pattern as an optional optimization note.
- [x] AC-9: All quality gates pass (`npm test`).
- [x] AC-10: No constitutional violations introduced.
