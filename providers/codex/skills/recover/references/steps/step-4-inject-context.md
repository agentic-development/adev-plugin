### Step 4: Inject Corrective Context

Based on the confirmed root cause category, generate the targeted fix.

#### For MISSING_CONTEXT

1. Identify the specific file(s) the subagent needed.
2. If a context packet file exists at `.context-index/packets/<task-slug>.md`, add the missing file references to it.
3. If no context packet exists, create one listing all context the task needs (original context plus the missing files).
4. Print what was added and why.

#### For AMBIGUOUS_SPEC

1. Identify the ambiguous acceptance criteria.
2. Draft a clarification addendum with specific, testable language. For example, replace "handle errors appropriately" with "Return HTTP 422 with `{ error: string, field: string }` body for validation errors."
3. Present the addendum to the user for confirmation.
4. Once confirmed, append the clarification to the spec as a "Clarifications" section (or update the existing one).

#### For CONSTRAINT_CONFLICT

1. Surface both conflicting requirements with their sources (spec section, constitution principle, ADR number).
2. Present the conflict clearly:
   ```
   Conflict detected:
   - Constitution (Architecture Boundaries): "No direct database queries in API routes"
   - Spec (AC-3): "Query user preferences with custom filter not supported by data layer"

   Options:
   A. Update the data layer to support the filter (stays within constitution)
   B. Grant a one-time exception in the spec with an ADR documenting why
   C. Modify the spec requirement to use existing data layer capabilities
   ```
3. Wait for user resolution. Record the decision.

#### For NOVEL_PROBLEM

1. Check if a golden sample should be created for this pattern. If the pattern will recur, recommend running `/adev:sample --from <reference-file>` after implementation to capture the pattern.
2. If no reference exists anywhere, draft a one-time implementation guide:
   - Research the framework or library documentation (if accessible)
   - Define the expected file structure, naming conventions, and integration points based on the constitution
   - Write a mini-spec for the novel pattern: inputs, outputs, error handling, test approach
3. Add the implementation guide to the context packet.

#### For TOOL_FAILURE

1. Diagnose the specific tool error from the error output.
2. Suggest the fix:
   - Missing dependency: `npm install <package>` or `prisma generate`
   - Configuration error: identify the misconfigured file and suggest the fix
   - Environment issue: suggest environment variable, PATH update, or version change
3. If the fix can be applied automatically (e.g., running a command), offer to run it. Wait for user confirmation.
4. Verify the fix by re-running the failing command.

#### For BUDGET_EXHAUSTION

1. Analyze the task size. Count acceptance criteria, files to create/modify, and estimated complexity.
2. Propose a task split. Break the task into 2-4 subtasks, each with:
   - A subset of the acceptance criteria
   - A subset of the files
   - Clear boundaries (each subtask is independently testable)
3. Present the split to the user:
   ```
   Task 3 is too large for a single dispatch. Proposed split:

   Task 3a: "Implement user profile GET endpoint" (AC-1, AC-2)
     Files: src/app/api/users/[id]/route.ts, tests/api/users.test.ts

   Task 3b: "Implement user profile UPDATE endpoint" (AC-3, AC-4)
     Files: src/app/api/users/[id]/route.ts (extend), tests/api/users.test.ts (extend)

   Task 3c: "Implement user avatar upload" (AC-5, AC-6)
     Files: src/app/api/users/[id]/avatar/route.ts, tests/api/users-avatar.test.ts

   Update the plan with this split? (y/n)
   ```
4. If confirmed, update the plan file with the new subtasks.
