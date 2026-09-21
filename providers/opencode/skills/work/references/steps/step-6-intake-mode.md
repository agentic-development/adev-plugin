## Step 6: Intake Mode

If `--intake` is present, branch here after the prerequisite check (Step 1 is skipped — intake mode does not perform the project state scan).

### 6.1: Prerequisites

1. Check that `.context-index/` exists. If not, print "Run `/adev:init` first" and stop.
2. Check that `tasks.backend` is configured in `.context-index/manifest.yaml`. If not, print "Issue board not configured. Add `tasks.backend` to manifest.yaml." and stop. (This is mandatory — intake mode creates issues.)

### 6.2: Intake Classification Table

Classify each request by scanning for signal keywords:

| Type | Signal Keywords | Default Priority |
|------|----------------|-----------------|
| `bug` | "bug", "broken", "crash", "error", "regression" | 1 |
| `feature` | "feature", "add", "new", "enhance", "support" | 2 |
| `task` | "task", "chore", "update", "migrate", "refactor" | 3 |

Adjust priority based on urgency signals: "urgent", "critical", "blocker" shift priority toward 0.

### 6.3: Epic Matching Algorithm

Match each request to an existing epic using the following strategy (first match wins):

1. **Exact match:** Check if the request description contains a substring matching an existing epic title
2. **Charter scope match:** Compare the request against charter scope sections for keyword overlap
3. **Milestone feature list match:** Compare the request against milestone feature lists for keyword overlap

If no match is found, propose creating a new epic or filing under "Unassigned." If no charters or epics exist, file all requests as "Unassigned" and suggest running `/adev:brainstorm` first to charter the work (which will bootstrap `product.md` on its first invocation).

### 6.4: Single Request Processing

When `--intake "<description>"` is provided (or the user provides a description interactively):

1. Classify the work type using the classification table
2. Estimate priority based on keywords and context
3. Match to an existing epic using the epic matching algorithm
4. Present the proposed issue with all fields:

   > **Proposed issue:**
   > - Title: <derived title>
   > - Type: <bug|feature|task>
   > - Priority: <0-4>
   > - Epic: <epic-id or Unassigned>
   >
   > Create this issue? (yes / edit / cancel)

5. On confirmation, create the issue via the issue manager: `getIssueManager(manifest).create({ title, type, priority, epicId })`.
6. Report: "Created `<id>`: <title> (type: <type>, priority: <N>, epic: <epic-id or Unassigned>)"

When `--intake` is provided without a description, prompt the user interactively:

> Describe the incoming work request:

Then process as above.

### 6.5: Batch File Processing

When `--intake --file <path>` is provided:

1. Verify the file exists. If not, print "File not found: <path>" and stop.
2. Verify the file is UTF-8 text and does not exceed 100KB. If it exceeds the limit, print "File exceeds 100KB limit" and stop.
3. Read the file contents. Parse one request per paragraph — paragraphs are separated by blank lines. Empty lines are treated as separators.
4. Process each request through the classification and epic matching pipeline (Steps 6.2-6.3).
5. Present a summary table of all proposed issues:

   ```
   | # | Title | Type | Priority | Epic | Milestone |
   |---|-------|------|----------|------|-----------|
   | 1 | Fix login crash | bug | 1 | epic-3 | v1 |
   | 2 | Add dark mode | feature | 2 | Unassigned | — |
   ```

6. Ask for user confirmation:

   > Create all N issues? (yes / edit / cancel)

7. On "yes": create all issues and report "Created N issues on issue board."
8. On "edit": allow the user to modify individual entries before creation.
9. On "cancel": abort without creating any issues.
