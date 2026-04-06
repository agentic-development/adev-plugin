---
name: adev:route
description: "Score tasks on a four-dimensional routing matrix (spec completeness, pattern coverage, blast radius, novelty) and recommend auto-agent, assisted-agent, or human-only execution. In OpenCode, invoke with skill({ name: 'adev:route' })"
---

# Task Routing Advisor

Score each task in an implementation plan on four dimensions and recommend a routing mode: auto-agent (fully autonomous), assisted-agent (checkpoint at mid-point), or human-only (agent scaffolds, human implements).

**Announce at start:** "I'm using the adev:route skill to score tasks and recommend routing."

## Arguments

- `--plan <path>`: route all tasks in a plan file (required)
- `--task <N>`: route a specific task number from the plan (requires `--plan`)
- `--dry-run`: show scores and recommendations without writing annotations to the plan file

## Prerequisites

The plan file must exist and follow the format produced by `adev:plan`. If the plan does not exist, suggest running `adev:plan` first.

## Step 1: Load Context

Read the following files:

1. **The plan file:** Extract tasks, file targets, specialist tags, charter capability references, and dependencies.
2. **The spec:** The Live Spec referenced in the plan header.
3. **Constitution:** `.context-index/constitution.md`
4. **Manifest (specialists registry):** `.context-index/manifest.yaml`
5. **Golden samples:** `.context-index/samples/` directory listing
6. **Boundary rules:** `.context-index/governance/boundaries.yaml` if it exists
7. **Risk policies:** `.context-index/governance/risk-policies.yaml` if it exists

## Step 2: Score Each Task

For each task in the plan, compute four dimension scores. Each dimension is scored 1 through 5.

### Dimension 1: Spec Completeness (1-5)

How well-specified is the task's expected behavior?

- **5:** Task has explicit acceptance criteria, behavioral contract, error cases, and test expectations
- **4:** Task has acceptance criteria and behavioral contract but missing error cases
- **3:** Task has acceptance criteria but vague behavioral descriptions
- **2:** Task description only, no formal acceptance criteria
- **1:** Task is a title with minimal description

### Dimension 2: Pattern Coverage (1-5)

How much precedent exists for this task's implementation pattern?

- **5:** Golden sample exists in `.context-index/samples/` that directly matches
- **4:** Similar golden sample exists (same pattern family, different domain)
- **3:** Codebase contains similar implementations but no curated golden sample
- **2:** Related patterns exist but significant adaptation needed
- **1:** No precedent found. Novel implementation

### Dimension 3: Blast Radius (1-5, inverted)

How many files and modules does the task touch?

- **5:** Task touches 1-2 files in a single module, no boundary crossings
- **4:** Task touches 3-5 files within one module
- **3:** Task touches files across 2 modules or crosses one boundary rule
- **2:** Task touches files across 3+ modules or crosses multiple boundaries
- **1:** Task modifies shared infrastructure, auth flows, database schema, or foundational systems

### Dimension 4: Novelty (1-5, inverted)

How much creative problem-solving does the task require?

- **5:** Pure pattern application. CRUD endpoint, standard component
- **4:** Minor variation on an established pattern
- **3:** Combines 2-3 known patterns in a new way
- **2:** Requires design decisions not covered by the spec or samples
- **1:** Research-grade problem. No clear solution path

## Step 3: Compute Routing Recommendation

For each task, sum the four dimension scores (range: 4-20).

**Routing thresholds:**

| Total Score | Route | Meaning |
|-------------|-------|---------|
| 16-20 | `auto-agent` | Run without checkpoints |
| 10-15 | `assisted-agent` | Pause for human review at mid-point |
| 4-9 | `human-only` | Agent scaffolds, human implements |

**Override rules:**

- If any single dimension scores 1, force `assisted-agent` minimum
- If task touches files flagged as `high` risk, force `assisted-agent` minimum

## Step 4: Write Routing Annotations

If `--dry-run` was NOT passed, append routing metadata to each task:

```markdown
**Routing:** auto-agent | assisted-agent | human-only (score: N/20)
**Scores:** spec=N pattern=N blast=N novelty=N
**Rationale:** <one sentence explaining the recommendation>
```

## Step 5: Report to User

Present a summary table:

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

## Integration with `adev:implement`

When `adev:implement` reads a task that has routing annotations:

- **auto-agent:** Standard dispatch. No additional checkpoints.
- **assisted-agent:** After RED phase (tests written), pause for user review before GREEN phase.
- **human-only:** Generate scaffolding only: file stubs, type definitions, test structure. Present as manual task checklist.

## Dry-Run Mode

If `--dry-run` is passed, perform Steps 1-3 and display the summary table without modifying the plan file.
