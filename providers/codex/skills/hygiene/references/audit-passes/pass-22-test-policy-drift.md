## Audit Pass 22: Test-Policy Drift

**Goal:** Detect plan tasks whose test-depth floor could not be resolved. `adev test-policy resolve` records `floor_inputs: "unavailable"` on a `test_depth_assigned` event when every path source for a task (the `**Files:**` block and `**Tests:**` field) is empty — the specified degrade for pre-convention plans and partial packet-heading matches (test-depth-policy.spec.md Behavior 20). These tasks were floored on no signal at all and need a human look at the plan's packet heading or path declarations.

**Steps:**

1. Scan every `*.spec.md` under `.context-index/specs/features/` that has a corresponding `.plan.md` (same directory, `<slug>.plan.md`).
2. For each such spec, run `adev state current --spec <path>` and read the returned `testDepthAssignments` projection — a map of `${plan}::${task_id}` to the most recent `test_depth_assigned` event payload (append-order "last wins" per test-depth-policy.spec.md Behavior 13; the same mechanism `/adev:status` step 8 uses to count recorded assignments).
3. For each entry in `testDepthAssignments`, inspect `floor_inputs`. Flag every entry where `floor_inputs === "unavailable"`, naming the `plan` path and `task_id` from the event payload.
4. Tasks with `floor_inputs: "available"`, and specs with no plan or no recorded assignments yet, are not findings.

**Output format:**
```
## Test-Policy Drift

- PASS: All recorded test-depth assignments resolved floor inputs (or)
- FINDINGS: N tasks with unresolved floor inputs

| Plan | Task ID | Assigned Depth | Reason |
|------|---------|-----------------|--------|
| .context-index/specs/features/billing/refunds.plan.md | t3 | standard | floor_inputs: "unavailable" — no Files:/Tests: paths resolved for this task |
```

**Actions:**
- [ ] Review the plan's `### Task <N> Context` packet heading and `**Files:**`/`**Tests:**` fields for each flagged task
- [ ] Re-run `/adev:plan` or manually correct the packet heading if it does not follow the `### Task N Context` convention

**Integration with summary table:**
```
| Test-Policy Drift | WARN | 1 task with unavailable floor_inputs |
```
