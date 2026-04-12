---
charter: session-awareness
status: validated
risk_level: low
milestone: 1
revision: 2
charter-revision: 2
created: 2026-04-06
updated: 2026-04-06
source-manifest:
  sha: "3f1ac2d"
  files:
    - lib/execution-state.mjs
    - lib/issues/file-adapter.mjs
    - lib/session-summary.mjs
    - tests/lib/execution-state.test.mjs
  computed-at: "2026-04-12T11:47:08.345Z"
---

# Live Spec: Execution State File

## Behavioral Contract

### Preconditions

- `projectRoot` is an absolute directory path (relative paths are rejected with `INVALID_PROJECT_ROOT`)
- For `writeExecutionState`: state object has a valid `status` field (`idle`, `active`, or `blocked`)
- For `writeExecutionState` with `status: "active"`: `planRef` and `currentTask` must be provided

### Behaviors

1. **When** `writeExecutionState(projectRoot, state)` is called with a valid state object **then** the file `.context-index/.execution-state.md` is written atomically (temp-file-then-rename) with YAML frontmatter containing all state fields and an `updated` timestamp set to now.

2. **When** `readExecutionState(projectRoot)` is called and the file exists **then** it returns a structured object with all frontmatter fields parsed, including `status`, `planRef`, `currentTask`, `issueBinding`, `blockers`, `nextAction`, and `progress` (array of `{task, done}` objects).

3. **When** `readExecutionState(projectRoot)` is called and the file does not exist **then** it returns `null`.

4. **When** `readExecutionState(projectRoot)` is called and the file is malformed **then** it returns `null` (callers handle degradation).

5. **When** `clearExecutionState(projectRoot)` is called **then** the file is written with `status: idle` and all other fields empty/cleared.

6. **When** `writeExecutionState` is called with `status: "active"` but `planRef` or `currentTask` is missing **then** it throws a validation error (invariant: active state requires plan binding).

7. **When** `writeExecutionState` is called with `status: "idle"` **then** `planRef`, `currentTask`, `issueBinding`, `blockers`, and `nextAction` are cleared regardless of input values.

### Postconditions

- After `writeExecutionState`: file exists at `<projectRoot>/.context-index/.execution-state.md` with valid YAML frontmatter, `updated` timestamp reflects write time
- After `clearExecutionState`: file exists with `status: idle`, all binding fields empty
- After any write: no `.tmp` files remain in `.context-index/`
- `readExecutionState` never mutates the file

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `projectRoot` is not an absolute path | Throws validation error | `INVALID_PROJECT_ROOT` |
| `writeExecutionState` with invalid status value | Throws validation error | `INVALID_STATUS` |
| `writeExecutionState` with `status: "active"` missing `planRef` | Throws validation error | `MISSING_PLAN_REF` |
| `writeExecutionState` with `status: "active"` missing `currentTask` | Throws validation error | `MISSING_CURRENT_TASK` |
| `.context-index/` directory does not exist on write | Creates directory recursively, then writes | (no error) |
| File system permission error on write | Throws with original error (callers handle) | `EACCES` |
| Malformed YAML frontmatter on read | Returns `null` | (no error) |
| File missing on read | Returns `null` | (no error) |
| Atomic rename fails (e.g., cross-device) | Throws with original error, temp file cleaned up | `EXDEV` |

## File Format

The execution state file uses YAML frontmatter followed by a markdown body. This format is a public contract — external tools and other harnesses may read and write it directly. The file should be excluded from version control (added to `.gitignore` during scaffold) as it represents transient runtime state.

### YAML Frontmatter Schema

Keys use camelCase to match the domain model and JavaScript naming conventions:

```yaml
---
status: idle | active | blocked
planRef: <relative path from projectRoot to .plan.md file, or empty>
currentTask: <integer task number or empty>
issueBinding: <issue ID or empty>
blockers: <free text, single line, or empty>
nextAction: <free text, single line, or empty>
updated: <ISO 8601 timestamp>
---
```

### Serialization Safety

The serializer must enforce these constraints on free-text field values (`blockers`, `nextAction`, task descriptions):

- Newlines are replaced with spaces (fields are single-line)
- The `---` sequence is stripped if present (prevents frontmatter corruption)

These constraints apply because frontmatter is hand-rolled without a YAML parser. Values that would break the `---`-delimited format must be sanitized before write.

### Progress Body

The markdown body contains a task checklist derived from the plan. `readExecutionState` parses this body and returns `progress` as an array of `{task, done}` objects. The `currentTask` frontmatter field identifies the active task — no in-body marker is used.

```markdown
## Progress

- [x] Task 1: Description
- [x] Task 2: Description
- [ ] Task 3: Description
- [ ] Task 4: Description
```

When `status` is `idle`, the body is empty.

## Consumer Guidance

The module is `lib/execution-state.mjs` with three named exports: `readExecutionState`, `writeExecutionState`, `clearExecutionState`. Consumers import directly:

```js
import { readExecutionState, writeExecutionState } from '../lib/execution-state.mjs';
```

Primary consumers:
- **`session-start.sh` hook** — calls `readExecutionState` to inject resume context at session start
- **`adev-implement` skill logic** — calls `writeExecutionState` at task boundaries to persist progress
- **Issue reminder hook** — calls `readExecutionState` to include current task in reminder context

## System Constitution Reference

- **Principle 1: "Minimize external dependencies"** — Uses only `fs`, `path`, `crypto` built-ins. No YAML parser — hand-rolled frontmatter serialization following the `session-summary.mjs` precedent.
- **Principle 3: "Pure ESM"** — Module is `lib/execution-state.mjs` with named exports.
- **Coding Standard: "Patterns to Follow"** — Follows the atomic write pattern from `file-adapter.mjs` (`randomBytes` + `.tmp` + `renameSync`).

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define file format | Document the YAML frontmatter schema and markdown body structure | small |
| Implement `writeExecutionState` | Validate input, serialize to markdown with frontmatter, atomic write | medium |
| Implement `readExecutionState` | Read file, parse frontmatter, return structured object or null | medium |
| Implement `clearExecutionState` | Delegate to `writeExecutionState` with idle state | small |
| Implement validation | Status enum check, active-state invariant enforcement | small |
| Add tests | Unit tests for all behaviors, error cases, atomic write verification | medium |

## Acceptance Criteria

- [ ] `writeExecutionState` produces a file parseable by `readExecutionState` (round-trip)
- [ ] `readExecutionState` returns `null` for missing or malformed files, never throws
- [ ] `clearExecutionState` resets to idle with empty bindings
- [ ] Active state without `planRef` or `currentTask` throws `MISSING_PLAN_REF` / `MISSING_CURRENT_TASK`
- [ ] Atomic write leaves no `.tmp` files on success
- [ ] Failed atomic write cleans up temp file
- [ ] `.context-index/` directory is created if missing on write
- [ ] All quality gates pass (`npm test`)
- [ ] No new dependencies added
- [ ] No constitutional violations introduced
