---
name: adev:work
description: "Pre-lifecycle triage that classifies incoming work and routes to the correct /adev:* skill. Scans for in-progress plans, unreviewed specs, and recent sessions before classifying. Use when the user says 'I need to work on something', 'what should I work on', 'what should I do', 'I have a bug', 'implement the feature', or any time the user is unsure which adev skill to invoke."
---

# Work Triage and Routing

Classify incoming work, detect in-progress project state, and route to the correct `/adev:*` skill. This is the universal entry point — use it when you are unsure which skill to invoke.

**Announce at start:** "I'm using the adev:work skill to triage your work and route to the right skill."

## Arguments

- No arguments: interactive triage (scans state, asks what you are working on)
- Free-text description: classify the description and propose a route (e.g., `/adev:work fix the broken test in hooks`)
- `--intake [<description>]`: intake mode — classify and triage an incoming work request into an issue on the issue board
- `--intake --file <path>`: batch intake mode — read a file containing multiple requests and process them all. File must be UTF-8 text, limited to 100KB

## Prerequisites

Check that `.context-index/` exists. If it does not:

> This project has not been initialized with the Agentic Development Framework. Run `/adev:init` first to set up the context index, then come back.

Stop processing. No other steps run.

## Step 1: Project State Scan

Scan for in-progress work using **parallel** tool calls in a single round:

1. **Incomplete plans:** Glob for `.context-index/specs/features/*/*.plan.md`. For each plan found, grep for `- [ ]` (unchecked tasks) and `- [x]` (checked tasks) to compute progress (e.g., "3/7 tasks complete").

2. **Unreviewed specs:** Glob for `.context-index/specs/features/**/*.md`. Exclude files matching `charter.md`, `*.review.md`, and `*.plan.md`. For each remaining spec, check if a sibling `.review.md` exists (same base name with `.review.md` suffix). Specs without a review file are "unreviewed."

3. **Recent sessions:** Glob for `.context-index/sessions/*.md`. Read the 3 most recent files (sorted by filename date prefix, descending). Extract the session summary line.

### If in-progress work is found

Surface it before classification:

> I found in-progress work:
> - **hooks** plan: 3/7 tasks incomplete
> - **design** spec `drag-drop.md`: unreviewed
> - Recent session (2026-03-28): "Implemented auth login flow"
>
> Want to resume one of these, or start something new?

Wait for the user's response before proceeding.

### If no in-progress work is found

Proceed directly to Step 2.

### Error handling

- If a file is missing during the scan, skip it silently (normal — not all projects have sessions or plans).
- If a file is present but malformed or unreadable, skip it and emit a visible warning: "Skipped one file that could not be read: `<path>`."

## Step 2: Classify Work

If the user provided a description (as an argument, or in response to the state scan prompt, or as their initial message), classify it into exactly one work type.

### Work Type Classification Table

| Slug | Signal Keywords / Patterns | Target Skill |
|------|---------------------------|-------------|
| `new-feature` | "new feature", "add capability", "build", "I want to create" | `/adev:brainstorm` |
| `new-spec` | "write a spec", "specify", "define behavior for" + existing charter | `/adev:specify` |
| `update-spec` | "update the spec", "change the spec", "revise" + existing spec reference | `/adev:specify --module <module>` |
| `review` | "review specs", "architecture review", "are the specs ready" | `/adev:review-specs` |
| `plan` | "plan the work", "break into tasks", "create tasks" + reviewed spec reference | `/adev:plan` |
| `implement` | "implement", "start coding", "build the plan" + existing plan reference | `/adev:implement` |
| `bug-fix` | "bug", "broken", "failing test", "error", "not working" | `/adev:debug` |
| `refactor` | "refactor", "clean up", "tech debt", "restructure" | `/adev:specify --refactor` |
| `maintenance` | "audit", "staleness", "drift", "hygiene", "context health" | `/adev:hygiene` |

### Classification rules

- Use both keyword matching and semantic understanding of the user's intent.
- Match against the table above. If multiple types match, prefer the most specific one (e.g., "fix the failing spec review test" matches both `bug-fix` and `review` — choose `bug-fix` because the user describes a broken test, not a review request).
- Context from the state scan can refine classification (see Step 3).

### If no description is provided

Ask a single classifying question:

> What are you working on? For example:
> - A new feature or idea
> - A bug or failing test
> - Implementing an existing plan
> - Reviewing or planning specs
> - Something else

Wait for the user's response, then classify.

## Step 3: State-Aware Routing Refinement

Before proposing a route, check whether the state scan (Step 1) should override or refine the classification:

1. **Resume override:** If the user says "work on X" and the state scan found an incomplete plan for module X, route to `/adev:implement` (not `/adev:brainstorm`):

   > Module **X** has an active plan with incomplete tasks. Routing to `/adev:implement` to continue the plan.

2. **Gate warning:** If the user says "plan X" but specs for module X have not passed review (no `.review.md` or review verdict is BLOCK), warn:

   > Specs for **X** haven't been reviewed yet. Want to run `/adev:review-specs` first, or proceed to planning anyway?

   Wait for the user's response.

## Step 4: Route Proposal

### High confidence (clear keywords or unambiguous context)

Propose the route directly with one-line reasoning:

> **Route:** `/adev:debug`
> **Reason:** You described a failing test in the hooks module.
> **Context:** Will pre-load the hooks charter and recent session.
>
> Proceed? (yes / change route)

### Low confidence (ambiguous description, multiple matches)

Ask one clarifying question with numbered options:

> This could be a few things. Which fits best?
> 1. New feature (needs a charter first) --> `/adev:brainstorm`
> 2. New spec within the **auth** charter --> `/adev:specify`
> 3. Update the existing `login-flow.md` spec --> `/adev:specify --module auth`

Wait for the user to choose.

## Step 5: Invoke Skill

Once the user confirms (explicitly with "yes", "sounds right", "go", "proceed", or implicitly by not objecting):

1. Invoke the target `/adev:*` skill.
2. Pass relevant context arguments where the target skill supports them:
   - `/adev:specify --module <module>` or `--refactor` for spec work
   - `/adev:debug --error <description>` for bug fixes
   - `/adev:implement --plan <path>` for implementation
   - `/adev:plan --spec <path>` for planning
   - `/adev:review-specs --module <module>` for reviews

If the user rejects the proposal or requests a different route, ask what they would prefer and re-propose.

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

If no match is found, propose creating a new epic or filing under "Unassigned." If no charters or epics exist, file all requests as "Unassigned" and suggest running `/adev:vision` first.

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

5. On confirmation, create the issue via the configured adapter
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

## Key Principles

- **One question at a time.** Never dump multiple questions in a single message.
- **Propose, don't assume.** Always present a route proposal and wait for confirmation before invoking a skill.
- **State-aware.** Let project state refine or override keyword classification.
- **Fast path for clear cases.** If the intent is obvious, propose immediately — no unnecessary questions.
- **Graceful degradation.** If state scan files are missing or malformed, skip them and continue. The skill works even with an empty `.context-index/`.
