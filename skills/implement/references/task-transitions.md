### Task transitions

All state transitions go through `reportPlanTask`. The plan file is read-only after authoring — no checkbox flips, no inline state stamps, no per-task Issue updates.

```javascript
// At task start (before dispatching the implementer subagent):
reportPlanTask(projectRoot, specPath, {
  plan: planFilePath, task_id, status: 'in_progress', notes: null,
});

// At task done (after GREEN + REFACTOR + both reviews pass):
reportPlanTask(projectRoot, specPath, {
  plan: planFilePath, task_id, status: 'done',
  notes: '<optional ≤200-char summary or null>',
});

// On a blocker the skill cannot resolve:
reportPlanTask(projectRoot, specPath, {
  plan: planFilePath, task_id, status: 'blocked',
  notes: '<≤200-char operator-facing summary — no stack traces, no env values, no full command output>',
});

// On a user-declined optional task (e.g., user skips a REFACTOR-only task):
reportPlanTask(projectRoot, specPath, {
  plan: planFilePath, task_id, status: 'skipped', notes: null,
});
```

**Blocker notes guidance:** Blocker `notes` must be a short operator-facing summary. Do not paste stack traces, env values, secrets, or full command output. The foundation caps `notes` at 4 KB but operators need a one-line description, not a dump.

12. **Workspace detection:** Call `detectWorkspace(cwd)` and store the returned workspace state for use in Steps 2a and 2c. Workspace detection is re-run fresh per task as defensive hygiene (ensures state is current if workspace config changed during a long implementation session), not as concurrency support. If `detectWorkspace` returns `null`, proceed with the existing single-repo flow unchanged.
