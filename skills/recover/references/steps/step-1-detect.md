### Step 1: Detect

Identify the stall point. The goal is to understand exactly where and why progress stopped.

#### With `--task <N>`

1. Find the active plan. Look for the most recent plan file in `.context-index/specs/features/` or ask the user for the path.
2. Load task N from the plan. Extract the task title, description, file list, dependencies, and specialist routing.
3. Check if a blocker file exists at `.context-index/hygiene/blockers/` for this task.
4. Check if a subagent report exists (from the last `/adev:implement` run). Look for status BLOCKED or NEEDS_CONTEXT in the report.

#### With `--blocker <path>`

1. Read the blocker file at the specified path.
2. Extract the task reference, error description, and any file references from the blocker.
3. Locate the corresponding plan and task entry.

#### Interactive (no arguments)

1. Scan `.context-index/hygiene/blockers/` for blocker files created in the last 7 days. Sort by date descending.
2. If blockers exist, present them:
   ```
   Recent blockers found:

   1. 2026-03-18-user-profile-api.md — BLOCKED: missing auth context
   2. 2026-03-17-payment-webhook.md — NEEDS_CONTEXT: Stripe event schema

   Select a blocker to investigate, or describe which task is stuck.
   ```
3. If no blockers exist, ask the user: "Which task is stuck? Provide a task number from the plan or describe the problem."
