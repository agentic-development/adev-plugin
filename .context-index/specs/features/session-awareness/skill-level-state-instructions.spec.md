---
charter: session-awareness
status: validated
risk_level: low
milestone: 1
revision: 1
charter-revision: 2
created: 2026-04-06
updated: 2026-04-06
source-manifest:
  sha: "2e11ef8"
  files:
    - skills/implement/SKILL.md
    - lib/execution-state.mjs
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
drift_source: skills/implement/SKILL.md
drift_at: 2026-05-16T00:18:15.336Z
---

# Live Spec: Skill-Level State Instructions

## Behavioral Contract

### Preconditions

- `skills/implement/SKILL.md` is the target file for instruction changes
- `lib/execution-state.mjs` exports `readExecutionState`, `writeExecutionState`, `clearExecutionState`
- The execution state file spec (`execution-state-file.md`) is implemented and validated

### Behaviors

1. **When** `/adev:implement` begins executing a task (Step 2, before dispatching the implementer subagent) **then** the skill instructions direct it to call `writeExecutionState` with `status: "active"`, `planRef` set to the plan file path, `currentTask` set to the task number, `issueBinding` set to the issue ID (if task management is configured), `nextAction` set to the task description, and `progress` set to the full task checklist with completed tasks checked.

2. **When** `/adev:implement` completes a task successfully (after 2-stage review passes) **then** the skill instructions direct it to update the execution state: mark the completed task as done in the progress checklist, advance `currentTask` to the next task number, and update `nextAction` to the next task's description.

3. **When** `/adev:implement` encounters a blocker on a task **then** the skill instructions direct it to call `writeExecutionState` with `status: "blocked"`, `blockers` set to the blocker description, and `nextAction` set to the recommended resolution.

4. **When** `/adev:implement` completes all tasks in the plan (Step 4) **then** the skill instructions direct it to call `clearExecutionState` to reset to idle.

5. **When** `/adev:implement` is dispatching a subagent for a task **then** the execution state write happens in the orchestrator (main agent), NOT in the subagent. Subagents do not import or call `lib/execution-state.mjs`.

6. **When** `/adev:implement` reads context in Step 1 and finds an existing execution state with `status: "active"` **then** the skill instructions direct it to resume from the `currentTask` indicated in the state file rather than starting from task 1. This enables session resume after compaction or restart.

7. **When** `/adev:implement` reads context in Step 1 and finds an existing execution state with `status: "blocked"` **then** the skill instructions direct it to surface the blocker to the user and suggest running `/adev:recover` before continuing.

### Postconditions

- Execution state accurately reflects the current point of progress throughout implementation
- After all tasks complete, execution state is cleared to idle
- Subagents never write execution state directly

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `writeExecutionState` fails during implementation | Log warning, continue implementation without state tracking | (no error) |
| `clearExecutionState` fails at completion | Log warning, implementation is still considered complete | (no error) |
| Execution state file is stale from previous session | Resume from indicated task (user can override) | (no error) |

## Instruction Placement

The instructions are markdown additions to `skills/implement/SKILL.md`. They are NOT executable code — they are structured instructions that Claude follows when executing the implement skill.

### Step 1 Addition (Load Context)

Add after the existing context loading instructions:

```markdown
**Execution State Check:**
Read `.context-index/.execution-state.md` using `readExecutionState(projectRoot)`. If the file exists with `status: "active"`, resume from the `currentTask` in the state file instead of task 1. If `status: "blocked"`, surface the blocker to the user and suggest `/adev:recover`.
```

### Step 2 Addition (Per-Task Dispatch)

Add before each subagent dispatch:

```markdown
**Update Execution State:**
Before dispatching the implementer subagent, write execution state:
- `status: "active"`
- `planRef: "<path to plan file>"`
- `currentTask: <task number>`
- `issueBinding: "<issue ID if tasks.backend is configured>"`
- `nextAction: "<task description>"`
- `progress: <full task checklist with completed tasks marked done>`

Use inline Node.js: `node -e "import { writeExecutionState } from './lib/execution-state.mjs'; ..."`
```

### Step 2c Addition (Blocker Protocol)

Add to the existing blocker protocol:

```markdown
**Update Execution State on Blocker:**
When a task is blocked, also update execution state:
- `status: "blocked"`
- `blockers: "<blocker description>"`
- `nextAction: "<recommended resolution>"`
```

### Step 4 Addition (Completion)

Add at plan completion:

```markdown
**Clear Execution State:**
After all tasks are complete, clear the execution state: `clearExecutionState(projectRoot)`.
```

## System Constitution Reference

- **Principle 2: "Skills are primarily markdown"** — These are markdown instructions added to the implement skill. No executable logic in the SKILL.md file.
- **Principle 1: "Minimize external dependencies"** — Uses only the existing `lib/execution-state.mjs` module.
- **Coding Standard: "Anti-Patterns to Avoid"** — "No executable logic inside SKILL.md files" — the skill instructs the agent to run Node.js inline, which is the established pattern (same as session-capture.sh invocation pattern). The SKILL.md itself remains a markdown document.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add Step 1 instructions | Execution state check and resume logic in Load Context section | small |
| Add Step 2 instructions | Write execution state before each task dispatch | small |
| Add Step 2c instructions | Update execution state on blocker | small |
| Add Step 4 instructions | Clear execution state on plan completion | small |
| Add resume tests | Test that implement skill resumes from active execution state | medium |
| Add blocker state tests | Test that blocked execution state surfaces to user | small |

## Acceptance Criteria

- [ ] `skills/implement/SKILL.md` contains instructions to write execution state before each task
- [ ] Instructions specify resume from `currentTask` when active execution state exists
- [ ] Instructions specify blocker surfacing when blocked execution state exists
- [ ] Instructions specify clearing execution state on plan completion
- [ ] Execution state writes happen in orchestrator, not subagents
- [ ] Failure to write execution state does not block implementation
- [ ] All quality gates pass (`npm test`)
- [ ] No new dependencies added
- [ ] No constitutional violations introduced
