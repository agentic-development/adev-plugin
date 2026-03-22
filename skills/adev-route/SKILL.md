---
name: adev-route
description: "Score tasks on a four-dimensional routing matrix (spec completeness, pattern coverage, blast radius, novelty) and recommend auto-agent, assisted-agent, or human-only execution for each task in a plan. Use when the user asks 'which tasks need human review', 'score the tasks', 'route the plan', or wants to decide which tasks agents can handle autonomously versus which need human oversight."
---

# Task Routing Advisor

Score each task in an implementation plan on four dimensions and recommend a routing mode: auto-agent (fully autonomous), assisted-agent (checkpoint at mid-point), or human-only (agent scaffolds, human implements). The routing annotations integrate directly with `/adev-implement` to adjust execution behavior per task.

**Announce at start:** "I'm using the adev-route skill to score tasks and recommend routing."

## Arguments

- `--plan <path>`: route all tasks in a plan file (required unless `--task` is used)
- `--task <N>`: route a specific task number from the plan (requires `--plan`)
- `--dry-run`: show scores and recommendations without writing annotations to the plan file

## Prerequisites

The plan file must exist and follow the format produced by `/adev-plan`. If the plan does not exist, suggest running `/adev-plan --spec <path>` first.

## Step 1: Load Context

Read the following files. Each informs the scoring decisions that follow.

1. **The plan file:** Read the plan at the path provided by `--plan`. Extract the list of tasks, their file targets, specialist tags, charter capability references, and dependency chains.

2. **The spec:** Read the Live Spec referenced in the plan header. Extract acceptance criteria, behavioral contracts, and error cases. The completeness of these elements feeds Dimension 1.

3. **Constitution:** Read `.context-index/constitution.md`. Extract architecture boundaries and non-negotiable principles. These inform blast radius assessment.

4. **Manifest (specialists registry):** Read `.context-index/manifest.yaml`. Note the `specialists` section and their trigger patterns. Specialist availability can improve pattern coverage scores.

5. **Golden samples:** Read `.context-index/samples/` directory listing. For each sample, note its filename and the pattern it represents. Sample availability directly feeds Dimension 2.

6. **Boundary rules:** If `.context-index/governance/boundaries.yaml` exists, read it. Boundary crossings increase blast radius scores.

7. **Risk policies:** If `.context-index/governance/risk-policies.yaml` exists, read it. Risk levels inform whether override rules apply.

## Step 2: Score Each Task

For each task in the plan (or the single task specified by `--task`), compute four dimension scores. Each dimension is scored 1 through 5.

### Dimension 1: Spec Completeness (1-5)

How well-specified is the task's expected behavior?

- **5:** Task has explicit acceptance criteria, behavioral contract, error cases, and test expectations in the spec. The implementer knows exactly what to build and how to verify it.
- **4:** Task has acceptance criteria and behavioral contract but missing error cases or edge conditions. The happy path is clear; the sad path needs inference.
- **3:** Task has acceptance criteria but vague behavioral descriptions. The "what" is defined but the "how" requires interpretation.
- **2:** Task description only, no formal acceptance criteria. The implementer must derive acceptance criteria from context.
- **1:** Task is a title with minimal description. Substantial design work required before implementation.

**Scoring method:** Read the spec sections relevant to this task. Count the acceptance criteria that map to this task. Check for behavioral contract language ("must," "shall," "returns," "throws"). Check for error case descriptions. Check for test expectations or examples.

### Dimension 2: Pattern Coverage (1-5)

How much precedent exists for this task's implementation pattern?

- **5:** Golden sample exists in `.context-index/samples/` that directly matches this task's pattern. The agent can follow the sample with minimal adaptation.
- **4:** Similar golden sample exists (same pattern family, different domain). For example, a CRUD service sample exists and the task is a new CRUD service for a different entity.
- **3:** Codebase contains similar implementations but no curated golden sample. The agent must discover and follow existing patterns without explicit guidance.
- **2:** Related patterns exist but significant adaptation is needed. The task combines or extends existing patterns in non-trivial ways.
- **1:** No precedent found. Novel implementation with no existing reference point in the codebase or samples.

**Scoring method:** For each task, identify the primary pattern (CRUD, component, service, middleware, migration, etc.). Search `.context-index/samples/` for matching samples. If no sample matches, search the codebase for similar file patterns using the file paths in the task definition.

### Dimension 3: Blast Radius (1-5, inverted)

How many files and modules does the task touch? Lower blast radius scores higher.

- **5:** Task touches 1-2 files in a single module, no boundary crossings per `boundaries.yaml`.
- **4:** Task touches 3-5 files within one module. No boundary crossings.
- **3:** Task touches files across 2 modules or crosses one boundary rule from `boundaries.yaml`.
- **2:** Task touches files across 3+ modules or crosses multiple boundary rules.
- **1:** Task modifies shared infrastructure, auth flows, database schema, or other foundational systems listed in the constitution's Architecture Boundaries.

**Scoring method:** Count the files listed in the task's "Files" section. Map each file to its module (top-level directory under `src/` or equivalent). Check each file path against boundary rules. Check against constitution Architecture Boundaries for infrastructure-level changes.

### Dimension 4: Novelty (1-5, inverted)

How much creative problem-solving does the task require? Lower novelty scores higher.

- **5:** Pure pattern application. CRUD endpoint, standard component, documented recipe. The task is mechanical.
- **4:** Minor variation on an established pattern. Small adaptation required but the approach is clear.
- **3:** Combines 2-3 known patterns in a new way. The individual parts are understood but the composition is new.
- **2:** Requires design decisions not covered by the spec or samples. The agent must make architectural choices.
- **1:** Research-grade problem. No clear solution path. May require experimentation, external documentation review, or human expertise.

**Scoring method:** Assess the task description and acceptance criteria. If the task maps cleanly to a single known pattern, score high. If the task requires combining patterns, integrating unfamiliar APIs, or making decisions the spec does not prescribe, score lower.

## Step 3: Compute Routing Recommendation

For each task, sum the four dimension scores to get a total (range: 4-20).

**Routing thresholds:**

| Total Score | Route | Meaning |
|-------------|-------|---------|
| 16-20 | `auto-agent` | Run without checkpoints. Agent can handle this independently. |
| 10-15 | `assisted-agent` | Pause for human review at mid-point (after tests written, before full implementation). May need context enrichment. |
| 4-9 | `human-only` | Agent generates scaffolding (types, test stubs, file structure) but human implements the core logic. |

**Override rule:** If any single dimension scores 1, force `assisted-agent` as the minimum routing regardless of total score. A score of 1 in any dimension indicates a significant risk factor that warrants human oversight.

**Secondary override:** If the task touches files flagged as `high` risk in `risk-policies.yaml`, force `assisted-agent` as the minimum routing.

## Step 4: Write Routing Annotations

If `--dry-run` was NOT passed, append routing metadata to each task in the plan file.

For each task, add the following block immediately after the task header line:

```markdown
**Routing:** auto-agent | assisted-agent | human-only (score: N/20)
**Scores:** spec=N pattern=N blast=N novelty=N
**Rationale:** <one sentence explaining the recommendation>
```

Example:

```markdown
### Task 3: Wire Dashboard Route [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=5 blast=4 novelty=4
**Rationale:** Well-specified CRUD route with a direct golden sample match and minimal blast radius.

**Charter capability:** dashboard-navigation
...
```

If the task already has routing annotations (from a previous run), replace them with the new scores.

## Step 5: Report to User

Present a summary table of all routed tasks:

```
Task Routing Summary for <plan file>

| # | Task | Route | Score | Spec | Pattern | Blast | Novelty |
|---|------|-------|-------|------|---------|-------|---------|
| 1 | Create User model | auto-agent | 19/20 | 5 | 5 | 5 | 4 |
| 2 | Auth middleware | assisted-agent | 12/20 | 3 | 3 | 3 | 3 |
| 3 | Payment flow | human-only | 7/20 | 2 | 1 | 2 | 2 |

Route distribution: 5 auto-agent, 3 assisted-agent, 1 human-only

Annotations written to <plan file path>.
```

If any tasks are marked `human-only`, highlight them with specific guidance:

```
Human-only tasks requiring attention before /adev-implement:

Task 3: Payment flow (score: 7/20)
  - Spec completeness: 2 — Missing acceptance criteria for refund edge cases
  - Pattern coverage: 1 — No payment integration sample exists
  Suggestion: Enrich the spec with /adev-specify, create a golden sample with /adev-sample

Task 7: Custom analytics engine (score: 6/20)
  - Novelty: 1 — Research-grade problem, no clear solution path
  Suggestion: Break into smaller subtasks or implement manually
```

## Integration with /adev-implement

When `/adev-implement` reads a task that has routing annotations, it adjusts its execution behavior:

- **auto-agent:** Standard dispatch. No additional checkpoints. The subagent implements the full TDD cycle (RED, GREEN, REFACTOR, COMMIT) without pausing.
- **assisted-agent:** After the subagent writes tests and verifies they fail (RED phase), pause execution and present the test code to the user for review. Wait for approval before proceeding to the GREEN phase. This catches misunderstandings early, before implementation effort is spent.
- **human-only:** Generate scaffolding only: file stubs with correct paths, type definitions from the spec, test structure with `describe`/`it` blocks and placeholder assertions, and import statements. Present this as a manual task checklist for the human to implement. Do not attempt the GREEN phase.

## Dry-Run Mode

If `--dry-run` is passed, perform Steps 1 through 3 (load context, score tasks, compute recommendations) and display the summary table from Step 5. Do not modify the plan file. This allows the user to preview routing decisions before committing them.

```
Dry run: routing scores computed but not written.

[summary table]

To write annotations: /adev-route --plan <path>
```

## Red Flags

**Never:**
- Score a task without reading the actual spec sections relevant to it
- Assign `auto-agent` to a task with any dimension scoring 1
- Modify the plan file beyond adding or updating routing annotation blocks
- Skip loading boundary rules or risk policies when the files exist
- Route tasks based on task title alone without analyzing file targets and spec coverage
