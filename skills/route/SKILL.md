---
name: adev:route
description: "Score tasks on a four-dimensional routing matrix (spec completeness, pattern coverage, blast radius, novelty) and recommend auto-agent, assisted-agent, or human-only execution for each task in a plan. Use when the user asks 'which tasks need human review', 'score the tasks', 'route the plan', or wants to decide which tasks agents can handle autonomously versus which need human oversight."
---

# Task Routing Advisor

Score each task in an implementation plan on four dimensions and recommend a routing mode: auto-agent (fully autonomous), assisted-agent (checkpoint at mid-point), or human-only (agent scaffolds, human implements). Decisions are persisted to the sibling `<plan-stem>.routing.json` sidecar — never into the plan body — and `/adev:implement` reads them from there to adjust execution behavior per task.

**Announce at start:** "I'm using the adev:route skill to score tasks and recommend routing."

## Arguments

- `--plan <path>`: route all tasks in a plan file (required unless `--task` is used)
- `--task <N>`: route a specific task number from the plan (requires `--plan`)
- `--dry-run`: show scores and recommendations without writing the `<plan-stem>.routing.json` sidecar

## Prerequisites

The plan file must exist and follow the format produced by `/adev:plan`. If the plan does not exist, suggest running `/adev:plan --spec <path>` first.

## Step 1: Load Context

Read the following files. Each informs the scoring decisions that follow.

1. **The plan file:** Read the plan at the path provided by `--plan`. Extract the list of tasks, their file targets, specialist tags, charter capability references, and dependency chains.

2. **The spec:** Read the Live Spec referenced in the plan header. Extract acceptance criteria, behavioral contracts, and error cases. The completeness of these elements feeds Dimension 1.

3. **Constitution:** Read `.context-index/constitution.md`. Extract architecture boundaries and non-negotiable principles. These inform blast radius assessment.

4. **Manifest (specialists registry):** Read `.context-index/manifest.yaml`. Note the `specialists` section and their trigger patterns. Specialist availability can improve pattern coverage scores.

5. **Golden samples:** Read `.context-index/samples/` directory listing. For each sample, note its filename and the pattern it represents. Sample availability directly feeds Dimension 2.

6. **Boundary rules:** If `.context-index/governance/boundaries.yaml` exists, read it. Boundary crossings increase blast radius scores.

7. **Risk policies:** If `.context-index/governance/risk-policies.yaml` exists, read it. Risk levels inform whether override rules apply.

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill route
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

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

### Rigor Tier Signal (graduated-rigor-tiers)

Alongside the routing mode, emit a **rigor tier** recommendation that the gate skills consume (`graduated-rigor-tiers.spec.md`). A task is "easy" — eligible for `tier: quick` — when it routes `auto-agent` (total ≥ 16) AND no dimension scores below 3 (low blast radius, high pattern coverage). Otherwise recommend `tier: full`. `quick` narrows review/validation breadth but never skips a gate; when in doubt, recommend `full`. The consuming skills (`/adev:review-specs`, `/adev:validate`, `/adev:build`) receive this as `--tier quick`; the spec's declarative `risk_level` remains the fallback when routing has not run.

## Step 4: Write Routing Sidecar

If `--dry-run` was NOT passed, persist the routing decisions to the sibling
sidecar file `<plan-stem>.routing.json` via the `adev route emit-sidecar` CLI
verb. **The plan markdown body MUST NOT be modified by this skill.** Routing
state is owned by the sidecar; plan files are read-only after `/adev:plan`
authored them (CON-8 in `plan-task-events.spec.md`; ADR-0012).

**Normalize the dimension scores first.** Steps 2 and 3 work in integers
`1..5` (and a `4..20` total) because those are the units humans reason about.
The sidecar schema requires each dimension as a fraction in `0..1` (spec
Behavior 2), and `adev route emit-sidecar` rejects anything outside that range
with `INVALID_ROUTING_ENTRY`. Divide each dimension score by 5 before
emitting:

| Step 2 score | Sidecar value |
|--------------|---------------|
| 5            | `1.0`         |
| 4            | `0.8`         |
| 3            | `0.6`         |
| 2            | `0.4`         |
| 1            | `0.2`         |

The `1..5` totals stay in the Step 5 chat summary; only the sidecar uses the
normalized `0..1` form.

Invoke the verb once per `/adev:route` run, passing the full entry list as a
JSON array on stdin. The verb performs an atomic temp-then-rename write and
surfaces `SIDECAR_WRITE_FAILED` on rename failure.

```bash
adev route emit-sidecar --plan <plan-path> <<'ENTRIES'
[
  {
    "task_id": "t1",
    "selected_agent": "auto-agent",
    "scores": {
      "spec_completeness": 1.0,
      "pattern_coverage": 1.0,
      "blast_radius": 1.0,
      "novelty": 0.8
    },
    "rationale": "Well-specified CRUD route with a direct golden sample match and minimal blast radius."
  }
]
ENTRIES
```

(The example above is task `t1` from the Step 5 summary table: spec 5, pattern
5, blast 5, novelty 4 — 19/20, routed `auto-agent`.)

Field contract (per spec Behavior 2):

| Field            | Type       | Notes                                                                          |
|------------------|------------|--------------------------------------------------------------------------------|
| `task_id`        | string     | Matches the plan's anchor (`t1`, `t2`, …)                                      |
| `selected_agent` | string     | `auto-agent` / `assisted-agent` / `human-only` or a specialist slug            |
| `scores`         | object     | Four required dimensions, each `0..1` (Step 2 score ÷ 5): `spec_completeness`, `pattern_coverage`, `blast_radius`, `novelty` |
| `rationale`      | string     | ≤ 400 chars; one short sentence explaining the recommendation                  |

The verb is writer-owned: a re-run fully replaces the prior sidecar. No
history is preserved inside the sidecar; consult git history for prior runs.

**`--task <N>` mode must merge before emitting.** `adev route emit-sidecar`
replaces the whole sidecar with the array it receives on stdin — it does not
merge. When only one task was scored, emitting a one-entry array would discard
every other task's routing decision. So in `--task <N>` mode: read the
existing `<plan-stem>.routing.json` first (if it exists), take its `entries`
array, replace the entry whose `task_id` matches the routed task (or append
one if absent), and pass the **complete merged array** to `emit-sidecar`.
Leave the other entries byte-identical. When routing a whole plan without
`--task`, the scored set already covers every task, so pass it as-is.

**Human-readable view.** The sidecar is JSON (machine-primary). To inspect
routing decisions as a markdown table without `jq`, run
`adev route render-sidecar --plan <plan-path>` — it pretty-prints the
sidecar to stdout. The persisted file remains JSON; markdown is on-demand.

Exit codes:

- `0` — success; sidecar written
- `1` — argument / JSON / schema error (`INVALID_PLAN_PATH`, `INVALID_ROUTING_ENTRY`)
- `2` — `SIDECAR_WRITE_FAILED` (atomic rename failure; tmp path surfaced on stderr)

**Do not write `**Routing:**` / `**Scores:**` / `**Rationale:**` blocks into
the plan body.** `/adev:implement` reads routing exclusively via
`adev implement read-routing`; inline blocks in the plan body will be
flagged by `lib/plan-immutability.mjs` as `PLAN_MUTATED_WITHOUT_SIDECAR`.

## Step 5: Report to User

Present a summary table of all routed tasks. **Persona adaptation:** The format below is the default for the Developer persona; adapt the chat summary to the active persona's output rules. Verbosity is resolved separately across `templates/verbosity/terse.md`, `templates/verbosity/normal.md`, and `templates/verbosity/deep.md`: when the resolved verbosity is terse and this section carries a `**Terse form:**` block, that block is the section's declared rendering at terse verbosity. See `skills/status/SKILL.md:12` for the full terse-form marker grammar and table-substitution recipe.

```
Task Routing Summary for <plan file>

| # | Task | Route | Score | Spec | Pattern | Blast | Novelty |
|---|------|-------|-------|------|---------|-------|---------|
| 1 | Create User model | auto-agent | 19/20 | 5 | 5 | 5 | 4 |
| 2 | Auth middleware | assisted-agent | 12/20 | 3 | 3 | 3 | 3 |
| 3 | Payment flow | human-only | 7/20 | 2 | 1 | 2 | 2 |

Route distribution: 5 auto-agent, 3 assisted-agent, 1 human-only

Routing sidecar written to <plan-stem>.routing.json (plan file unchanged).
```

If any tasks are marked `human-only`, highlight them with specific guidance:

```
Human-only tasks requiring attention before /adev:implement:

Task 3: Payment flow (score: 7/20)
  - Spec completeness: 2 — Missing acceptance criteria for refund edge cases
  - Pattern coverage: 1 — No payment integration sample exists
  Suggestion: Enrich the spec with /adev:specify, create a golden sample with /adev:sample

Task 7: Custom analytics engine (score: 6/20)
  - Novelty: 1 — Research-grade problem, no clear solution path
  Suggestion: Break into smaller subtasks or implement manually
```

## Integration with /adev:implement

`/adev:implement` reads routing decisions from `<plan-stem>.routing.json` via
the `adev implement read-routing --plan <path> --task-id <id>` CLI verb. It
does NOT parse `**Routing:**` blocks from the plan body — those will be
ignored even if present (and flagged separately by the plan-immutability
detector).

When a task's `selected_agent` is resolved from the sidecar, `/adev:implement`
adjusts its execution behavior:

- **auto-agent:** Standard dispatch. No additional checkpoints. The subagent implements the full TDD cycle (RED, GREEN, REFACTOR, COMMIT) without pausing.
- **assisted-agent:** After the subagent writes tests and verifies they fail (RED phase), pause execution and present the test code to the user for review. Wait for approval before proceeding to the GREEN phase. This catches misunderstandings early, before implementation effort is spent.
- **human-only:** Generate scaffolding only: file stubs with correct paths, type definitions from the spec, test structure with `describe`/`it` blocks and placeholder assertions, and import statements. Present this as a manual task checklist for the human to implement. Do not attempt the GREEN phase.

If the sidecar is missing when `/adev:implement` runs, the read verb exits
with `ROUTING_SIDECAR_MISSING` and instructs the operator to re-run
`/adev:route` against the plan. There is no silent fallback to inline
parsing.

## Dry-Run Mode

If `--dry-run` is passed, perform Steps 1 through 3 (load context, score tasks, compute recommendations) and display the summary table from Step 5. Skip Step 4 entirely: do not invoke `adev route emit-sidecar`, and leave any existing sidecar in place. The plan file is never modified in either mode. This allows the user to preview routing decisions before committing them.

```
Dry run: routing scores computed but no sidecar written.

[summary table]

To write the routing sidecar: /adev:route --plan <path>
```

## Red Flags

**Never:**
- Score a task without reading the actual spec sections relevant to it
- Assign `auto-agent` to a task with any dimension scoring 1
- **Mutate the plan markdown body.** The plan file is read-only after
  `/adev:plan` authored it. Inline `**Routing:**`, `**Scores:**`, or
  `**Rationale:**` blocks in the plan body are forbidden — they violate
  CON-8 in `plan-task-events.spec.md` and the `lib/plan-immutability.mjs`
  detector will surface them as `PLAN_MUTATED_WITHOUT_SIDECAR`. All routing
  state lives in the sibling `<plan-stem>.routing.json` sidecar written via
  `adev route emit-sidecar`.
- Hand-edit `<plan-stem>.routing.json`. The sidecar is writer-owned; modify
  inputs to `/adev:route` and re-run instead.
- Skip loading boundary rules or risk policies when the files exist
- Route tasks based on task title alone without analyzing file targets and spec coverage

## Next Step in the Lifecycle

Tasks scored. The next step is **`/adev:implement`**.

If invoked via `/adev:work`, offer to continue: *"Routing done. Continue to `/adev:implement`?"* The user can stop here.
