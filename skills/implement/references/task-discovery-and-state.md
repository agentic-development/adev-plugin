### Task discovery and state

The plan file is the source of truth for *what the tasks are*. The lifecycle log projection is the source of truth for *what state each task is in*.

```javascript
import { currentState, reportPlanTask } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';

const state = currentState(projectRoot, specPath);
// planTasks shape: { [task_id]: { status, notes, plan, updated } }
//
// `/adev:plan` seeds one `pending` event per task at authoring time, so every
// task in the plan should already appear here. If a task is missing from the
// projection, the plan was authored before this surface was migrated — fall
// back to treating it as `pending`.
const nextTask = plan.tasks.find(t =>
  state.planTasks[t.id]?.status === 'pending' ||
  state.planTasks[t.id]?.status === 'in_progress' ||
  state.planTasks[t.id] === undefined
);
```
