[adev docs](README.md) > Reference

# Skill Reference

adev provides skills as slash commands that guide you through each phase of the development lifecycle. Each skill is a structured set of instructions that Claude follows when invoked. For background on how skills fit into the framework, see [Core Concepts](concepts.md).

This page documents every skill in the plugin. Skills are organized by lifecycle phase, matching the order you typically use them. For workflow-oriented guides, see the [Design Phase](design-phase.md), [Build Phase](build-phase.md), [Validate & Debug](validate-debug.md), and [Maintain](maintain.md) guides.

## Summary Table

| Skill | Phase | Purpose | Prerequisites |
|-------|-------|---------|---------------|
| `/adev:init` | Setup | Initialize the `.context-index/` directory | None |
| `/adev:sync` | Setup | Sync constitution to agent files (CLAUDE.md, AGENTS.md) | Constitution exists |
| `/adev:using-adev` | Setup | Gateway overview of the framework and available skills | Context index exists |
| `/adev:work` | Triage | Classify incoming work and route to the correct skill | Context index exists |
| `/adev:brainstorm` | Design | Explore a feature idea and produce a Feature Charter | Context index exists |
| `/adev:specify` | Design | Author a Live Spec within a charter's scope | Feature Charter exists |
| `/adev:review-specs` | Design | Run parallel specialist reviews on Live Specs | Live Spec exists |
| `/adev:prototype` | Design | Rapidly sketch UI screens and flows from charters | Feature Charter exists |
| `/adev:plan` | Build | Decompose reviewed specs into ordered implementation tasks | Reviewed spec exists |
| `/adev:route` | Build | Score tasks for auto/assisted/human execution routing | Plan exists |
| `/adev:implement` | Build | Execute plans with TDD, specialist routing, and 2-stage review | Reviewed plan exists |
| `/adev:write-test` | Build | TDD test authoring (RED phase) with gaming detection | Spec or source file exists |
| `/adev:build` | Build | End-to-end pipeline chaining review through validate | Spec exists |
| `/adev:validate` | Validation | Post-implementation validation with 13 ordered checks | Implementation complete |
| `/adev:debug` | Validation | Context-aware systematic debugging | Bug or test failure |
| `/adev:eval` | Validation | Graduated evaluation harness scoring 0-100 | Implementation complete |
| `/adev:recover` | Validation | Structured diagnosis when agents get stuck | Active implementation |
| `/adev:issues` | Maintenance | Manage project issues and epics | Task backend configured |
| `/adev:status` | Maintenance | Query project status dashboard (read-only) | Context index exists |
| `/adev:hygiene` | Maintenance | Audit context for staleness, drift, and coverage gaps | Context index exists |
| `/adev:retro` | Maintenance | Sprint retrospective for agentic development | Git history exists |
| `/adev:codehealth` | Maintenance | Scan for dead exports, orphan files, unused dependencies | Repomap artifacts exist |
| `/adev:repomap` | Maintenance | Generate AST-based symbol index | Source code exists |
| `/adev:reconcile` | Maintenance | Interactive repair for lifecycle mismatches | Hygiene or status report |
| `/adev:sample` | Maintenance | Curate golden sample implementations | Context index exists |
| `/adev:document` | Maintenance | Generate developer documentation from repomap | Repomap artifacts exist |
| `/adev:research` | Meta | Structured research across codebase, web, and GitHub | None |
| `/adev:learn` | Meta | Capture a lesson learned as a heuristic | Context index exists |
| `/adev:assess` | Meta | Assess codebase readiness for agentic development | None |

---

## Setup

### `/adev:init`

**Purpose:** Initialize or diagnose the `.context-index/` directory. An interactive wizard walks through each context layer, explains what it does, and lets you opt in or skip. Supports both greenfield projects and existing codebases.

**Prerequisites:** None. This is the first skill you run on a new project.

**Arguments:**
- No arguments: interactive wizard (auto-detects greenfield vs. existing setup)
- `--brownfield`: adds reverse-chartering, ADR archaeology, and coverage analysis for existing codebases
- `--dry-run`: shows what would be created without writing any files
- `--workspace`: initialize a workspace root that aggregates multiple child repos under one `adev-workspace.yaml`

**Example:**
```
/adev:init
/adev:init --brownfield
/adev:init --dry-run
```

**Expected Output:** A `.context-index/` directory containing `constitution.md`, `manifest.yaml`, `platform-context.yaml`, and the directory structure for specs, ADRs, and other artifacts.

**Related Guides:** [Installation & Setup](installation.md), [Getting Started Tutorial](getting-started.md)

---

### `/adev:sync`

**Purpose:** Sync the constitution to agent configuration files (CLAUDE.md, AGENTS.md, and others declared in `manifest.yaml`). Run this after editing the constitution or when agent files are out of date.

**Prerequisites:** `.context-index/constitution.md` must exist.

**Arguments:**
- No arguments: sync all targets declared in `manifest.yaml`

**Example:**
```
/adev:sync
```

**Expected Output:** Updated agent configuration files matching the current constitution. Detects which AI coding assistant is running (Claude Code, OpenCode, Cursor, GitHub Copilot) and syncs the appropriate files.

**Related Guides:** [Installation & Setup](installation.md), [Configuration Reference](configuration.md)

---

### `/adev:using-adev`

> **Internal skill.** Injected automatically at session start by a hook. You rarely need to invoke this manually.

**Purpose:** Gateway skill for the Agentic Development Framework. Establishes the methodology, lists available skills, and explains context routing. Injected automatically at session start.

**Prerequisites:** `.context-index/` must be initialized.

**Arguments:** None.

**Example:**
```
/adev:using-adev
```

**Expected Output:** An overview of the framework, the context index structure, available skills organized by phase, and guidance on which skill to use for your current task.

**Related Guides:** [Core Concepts](concepts.md), [Getting Started Tutorial](getting-started.md)

---

## Triage

### `/adev:work`

**Purpose:** Pre-lifecycle triage that classifies incoming work and routes to the correct `/adev:*` skill. Scans for in-progress plans, unreviewed specs, and recent sessions before making a recommendation.

**Prerequisites:** `.context-index/` must be initialized.

**Arguments:**
- No arguments: interactive triage (scans state, asks what you are working on)
- Free-text description: classify and propose a route (e.g., `/adev:work fix the broken test in hooks`)
- `--intake [<description>]`: intake mode -- classify and triage an incoming work request into an issue
- `--intake --file <path>`: batch intake mode -- read a file containing multiple requests

**Example:**
```
/adev:work
/adev:work fix the broken test in hooks
/adev:work --intake "Add dark mode support"
```

**Expected Output:** A classification of the work type (feature, bug, refactor, etc.) and a recommendation to invoke a specific skill (e.g., "This looks like a bug. Run `/adev:debug`").

**Related Guides:** [Getting Started Tutorial](getting-started.md)

---

## Design

### `/adev:brainstorm`

**Purpose:** Explore a feature idea interactively and produce a Feature Charter. The charter defines what a module does and its boundaries, validated against the constitution and existing charters. It does not define how the module is built.

**Prerequisites:** `.context-index/` must be initialized.

**Arguments:**
- No arguments: freeform brainstorm (describe the idea conversationally)
- `--module <name>`: scope brainstorm to an existing module (extends or revises its charter)
- `--from-blueprint <path>`: seed from a blueprint file (skips early clarification)
- `--no-bootstrap`: suppress product.md bootstrap on first-charter scenarios

**Example:**
```
/adev:brainstorm
/adev:brainstorm --module auth
/adev:brainstorm --from-blueprint docs/prd-auth.md
```

**Expected Output:** A Feature Charter at `.context-index/specs/features/<module>/charter.md` defining scope, capabilities, entities, and boundaries.

**Related Guides:** [Design Phase](design-phase.md), [Core Concepts](concepts.md)

---

### `/adev:specify`

**Purpose:** Author a Live Spec that defines a behavioral contract for implementation, scoped to an existing Feature Charter. The spec becomes the source of truth for what `/adev:plan` decomposes and `/adev:implement` builds.

**Prerequisites:** A Feature Charter must exist for the target module.

**Arguments:**
| Argument | Description |
|----------|-------------|
| *(positional)* | Feature module name or capability hint |
| `--charter <module>` | Explicit parent charter (required when ambiguous) |
| `--title <title>` | Spec title (prompted if omitted) |
| `--extract` | Extract mode: reverse-engineer a spec from existing code |
| `--refactor` | Refactor mode: current state + target state + migration path |
| `--from-diff` | From-diff mode: generate a retroactive spec from a git diff or PR |
| `--cross-cutting` | Cross-cutting mode: spec spans multiple charters |

**Example:**
```
/adev:specify --charter auth --title "Login Flow"
/adev:specify --extract --charter hooks
/adev:specify --from-diff
```

**Expected Output:** A Live Spec at `.context-index/specs/features/<module>/<slug>.spec.md` with behavioral contract, acceptance criteria, and task map.

**Related Guides:** [Design Phase](design-phase.md)

---

### `/adev:review-specs`

**Purpose:** Run an architecture review on one or more Live Specs using parallel specialist subagents (structural, security, consistency). This is the gate between specification and planning -- no code gets planned until specs pass review.

**Prerequisites:** At least one Live Spec must exist.

**Arguments:**
- No arguments: review all unreviewed specs
- `--spec <path>`: review a specific spec file
- `--charter <module>`: review all specs under a feature charter

**Example:**
```
/adev:review-specs
/adev:review-specs --spec .context-index/specs/features/auth/login.spec.md
/adev:review-specs --charter auth
```

**Expected Output:** A review file at `<spec-path>.review.md` with PASS, PASS_WITH_NOTES, or BLOCK verdict from each specialist reviewer.

**Related Guides:** [Design Phase](design-phase.md), [Governance](governance.md)

---

### `/adev:prototype`

> **Utility skill.** Can be invoked by `/adev:brainstorm` when a visual prototype would help clarify scope. Also available standalone for rapid UI sketching.

**Purpose:** Rapidly sketch UI screens, user flows, and API surface from Feature Charters. Bridges the gap between chartering and implementation with tiered prototypes (wireframe, mockup, functional). Optionally uses a live browser preview for interactive design.

**Prerequisites:** A Feature Charter must exist for the target module.

**Arguments:**
- `--module <name>`: module name (required when invoked standalone)
- `--tier <wireframe|mockup|functional>`: pre-select tier (skips interactive prompt)
- `--framework <react|vue|svelte|vanilla>`: pre-select framework for functional tier

**Example:**
```
/adev:prototype --module dashboard
/adev:prototype --module auth --tier wireframe
```

**Expected Output:** Prototype files served via localhost for browser preview, with options to iterate or persist the result.

**Related Guides:** [Design Phase](design-phase.md)

---

## Build

### `/adev:plan`

**Purpose:** Decompose a reviewed Live Spec into an ordered task list ready for `/adev:implement`. Every task follows TDD (write failing test, verify fail, implement, verify pass, commit) and traces back to a charter capability.

**Prerequisites:** A reviewed spec (with passing `.review.md`) must exist.

**Arguments:**
- `--spec <path>`: plan a specific spec
- `--feature <module>`: plan a feature charter
- `--release <name>`: plan a named release
- `--milestone <name>`: create or update a milestone
- `--epic <id>`: decompose an Epic into Features
- `--phase <name>`: plan all specs matching a phase/milestone
- `--dry-run`: show plan structure without writing

**Example:**
```
/adev:plan --spec .context-index/specs/features/auth/login.spec.md
/adev:plan --feature auth
/adev:plan --phase v1
```

**Expected Output:** A plan file at `<spec-path>.plan.md` with ordered tasks, file lists, dependencies, TDD expectations, and context routing.

**Related Guides:** [Build Phase](build-phase.md)

---

### `/adev:route`

> **Utility skill.** Primarily invoked by `/adev:build` as part of the end-to-end pipeline. You can also use it standalone to preview routing decisions before implementation.

**Purpose:** Score each task in an implementation plan on four dimensions (spec completeness, pattern coverage, blast radius, novelty) and recommend a routing mode: auto-agent, assisted-agent, or human-only. Routing annotations integrate with `/adev:implement` to adjust execution per task.

**Prerequisites:** A plan file must exist (produced by `/adev:plan`).

**Arguments:**
- `--plan <path>`: route all tasks in a plan file (required unless `--task` is used)
- `--task <N>`: route a specific task number
- `--dry-run`: show scores without writing annotations

**Example:**
```
/adev:route --plan .context-index/specs/features/auth/login.plan.md
/adev:route --plan .context-index/specs/features/auth/login.plan.md --task 3
```

**Expected Output:** A routing table showing each task's scores and recommended execution mode, with annotations written to the plan file.

**Related Guides:** [Build Phase](build-phase.md)

---

### `/adev:implement`

**Purpose:** Execute implementation plans by dispatching a fresh subagent per task, routing to domain specialists when applicable, enforcing TDD, and running 2-stage review (spec compliance then code quality) after each task. This is the core build skill.

**Prerequisites:** A reviewed plan must exist. The current branch must not be main or master.

**Arguments:**
- `<plan-path>`: path to the plan file (required)
- `--task <N>`: execute only task N
- `--dry-run`: show routing decisions without executing
- `--no-infra`: skip infrastructure preflight checks (user-only)
- `--verbose`: enable step-by-step narration for debugging

**Example:**
```
/adev:implement .context-index/specs/features/auth/login.plan.md
/adev:implement .context-index/specs/features/auth/login.plan.md --task 3
/adev:implement --dry-run .context-index/specs/features/auth/login.plan.md
```

**Expected Output:** Implemented code for each task, with tests written first (TDD), spec compliance verified, and code quality reviewed. Commits created per task with Spec and Plan-task trailers.

**Related Guides:** [Build Phase](build-phase.md), [Test Strategies](test-strategies.md)

---

### `/adev:write-test`

> **Utility skill.** Primarily invoked by `/adev:implement` during the RED phase of TDD. You can also use it standalone when you want to write tests independently of a full implementation cycle.

**Purpose:** TDD test authoring specialist. Writes failing tests (RED phase), produces immutable handoff blocks, and detects specification gaming. Use before implementation to establish the test contract.

**Prerequisites:** A spec or source file must exist to derive tests from.

**Arguments:**
- `--red --spec <path>`: author tests from a Live Spec
- `--red --file <path>`: author tests from a source file's interface
- `--red "<description>"`: author tests from free-form behavioral description
- `--verify --packet <path>`: post-GREEN tamper check against Handoff Block
- `--no-infra`: skip infrastructure preflight checks (user-only)

**Example:**
```
/adev:write-test --red --spec .context-index/specs/features/auth/login.spec.md
/adev:write-test --red --file src/lib/auth.mjs
/adev:write-test --verify --packet .context-index/packets/auth-login.md
```

**Expected Output:** Test files that fail (RED phase), a Handoff Block for tamper detection, and gaming detection analysis.

**Related Guides:** [Build Phase](build-phase.md), [Test Strategies](test-strategies.md)

---

### `/adev:build`

**Purpose:** End-to-end build orchestrator that chains review, plan, route, implement, and validate into a single pipeline. Supports resuming from failure, batch processing by milestone, and dry-run preview.

**Prerequisites:** At least one spec must exist.

**Arguments:**
- `--spec <path>`: build a single spec end-to-end
- `--phase <name>`: discover and build all specs with matching milestone
- `--resume`: resume an interrupted build from the last successful step
- `--dry-run`: show pipeline plan without executing
- `--no-route`: skip the route step
- `--full`: run the Full Pipeline (specify through validate)

**Example:**
```
/adev:build --spec .context-index/specs/features/auth/login.spec.md
/adev:build --phase v1
/adev:build --resume
```

**Expected Output:** Complete lifecycle execution from review through validation, with each step producing its standard artifacts.

**Related Guides:** [Build Phase](build-phase.md)

---

## Validation

### `/adev:validate`

**Purpose:** Post-implementation validation running 13 ordered checks including lifecycle reconciliation and browser-based visual verification for UI. Fail-fast on quality gates. Produces a structured PASS/FAIL report with file references.

**Prerequisites:** Implementation must be complete (spec status `implemented`).

**Arguments:**
- `--spec <path>`: validate against a specific Live Spec (required)
- `--plan <path>`: cross-reference the implementation plan (optional)
- `--fix`: attempt to auto-fix minor issues before reporting
- `--no-infra`: skip infrastructure preflight checks (user-only)

**Example:**
```
/adev:validate --spec .context-index/specs/features/auth/login.spec.md
/adev:validate --spec .context-index/specs/features/auth/login.spec.md --fix
```

**Expected Output:** A structured validation report with PASS/FAIL per check, specific file references for failures, and overall verdict.

**Related Guides:** [Validate & Debug](validate-debug.md), [Governance](governance.md)

---

### `/adev:debug`

**Purpose:** Context-aware systematic debugging. Before investigating, checks ADRs for known issues, specs for expected behavior, and orientation docs for architecture context. Follows a structured diagnosis process.

**Prerequisites:** A bug, test failure, or unexpected behavior to investigate.

**Arguments:**
- No arguments: interactive (asks for symptoms)
- `--error <message>`: the error message or symptom description
- `--spec <path>`: scope debugging to a specific spec's domain
- `--apply`: apply the fix after diagnosis (prompts for confirmation)
- `--no-infra`: skip infrastructure preflight checks (user-only)

**Example:**
```
/adev:debug
/adev:debug --error "TypeError: Cannot read property 'id' of undefined"
/adev:debug --spec .context-index/specs/features/auth/login.spec.md --apply
```

**Expected Output:** A structured diagnosis with root cause analysis, fix recommendation, and optionally the applied fix with updated tests.

**Related Guides:** [Validate & Debug](validate-debug.md)

---

### `/adev:eval`

> **Utility skill.** Used for deeper quality assessment beyond `/adev:validate`. Useful when you want a quantitative score or need to compare implementations.

**Purpose:** Run a graduated evaluation harness scoring implementation quality across four layers: deterministic (automated checks), architectural (pattern compliance), LLM-as-Judge (behavioral reasoning), and human-in-the-loop (manual review). Produces a quality score from 0 to 100.

**Prerequisites:** Implementation must be complete.

**Arguments:**
- `--spec <path>`: evaluate a specific spec's implementation (required)
- `--layer <N>`: run only a specific layer (1-4)
- `--configure`: interactive setup of eval configuration
- `--rubric <path>`: use a custom rubric for Layer 3
- `--no-infra`: skip infrastructure preflight checks (user-only)

**Example:**
```
/adev:eval --spec .context-index/specs/features/auth/login.spec.md
/adev:eval --spec .context-index/specs/features/auth/login.spec.md --layer 1
```

**Expected Output:** A graduated quality score (0-100) with per-layer breakdown, detailed findings, and improvement recommendations.

**Related Guides:** [Validate & Debug](validate-debug.md)

---

### `/adev:recover`

> **Utility skill.** Primarily invoked by `/adev:implement` when a subagent reports BLOCKED. You can also use it standalone to diagnose and resume stuck tasks.

**Purpose:** Structured diagnosis-correction-resume cycle when agents get stuck during implementation. Classifies root causes into six categories, injects corrective context, and re-dispatches with enriched prompts. Writes recovery records for retrospective analysis.

**Prerequisites:** An active implementation plan must exist. Typically used when a subagent reports BLOCKED or stops making progress.

**Arguments:**
- `--task <N>`: recover a specific stuck task
- `--blocker <path>`: recover from a specific blocker file
- No arguments: interactive mode (checks for recent blockers)
- `--no-infra`: skip infrastructure preflight checks (user-only)

**Example:**
```
/adev:recover --task 3
/adev:recover --blocker .context-index/hygiene/blockers/auth-session.md
/adev:recover
```

**Expected Output:** A recovery diagnosis with root cause classification, corrective context injection, and re-dispatch of the stuck subagent with enriched prompts. A recovery record is written for retrospective analysis.

**Related Guides:** [Validate & Debug](validate-debug.md), [Build Phase](build-phase.md)

---

## Maintenance

### `/adev:issues`

**Purpose:** Manage project issues and epics using the configured task backend. Supports creating, updating, closing, and viewing issues with filtering by status, epic, and milestone.

**Prerequisites:** `tasks.backend` must be configured in `manifest.yaml`.

**Arguments:**
- No arguments: display the full issue board
- `create "<title>" [--type bug|feature|task] [--epic <id>] [--priority 0-4]`: create an issue
- `epic "<title>" [--milestone <name>]`: create a new epic
- `update <id> --status <status> [--milestone <name>]`: update issue status
- `close <id> --reason "<text>"`: close an issue
- `list [--status <status>] [--epic <id>] [--milestone <name>]`: filtered list
- `dep <issue-id> <depends-on-id>`: add a dependency
- `ready`: show actionable issues (open and unblocked)

**Example:**
```
/adev:issues
/adev:issues create "Add dark mode" --type feature --priority 2
/adev:issues close issue-3 --reason "Fixed in PR #42"
/adev:issues ready
```

**Expected Output:** Issue board display, or confirmation of the create/update/close operation.

**Related Guides:** [Maintain](maintain.md)

---

### `/adev:status`

**Purpose:** Query and display the current status of adev lifecycle artifacts. This is a read-only dashboard covering charters, specs, capabilities, sessions, and source manifests.

**Prerequisites:** `.context-index/` must be initialized.

**Arguments:**
- `--spec <path>`: detailed status for a single spec
- `--charter <name>`: status for a charter and its specs/capabilities
- `--milestone <name>`: detailed status for a milestone
- `--issue <id>`: trace full lifecycle chain for an issue
- `--epic <id>`: epic status with child issues and coverage

**Example:**
```
/adev:status
/adev:status --charter auth
/adev:status --milestone v1
```

**Expected Output:** A dashboard view showing progress across charters, specs, capabilities, and milestones.

**Related Guides:** [Maintain](maintain.md)

---

### `/adev:hygiene`

**Purpose:** Audit all context for staleness, drift, and coverage gaps. Runs sixteen audit passes across `.context-index/` and source code, generating actionable reports with checklists.

**Prerequisites:** `.context-index/` must be initialized.

**Arguments:**
- No arguments: full audit (all passes)
- `--check <type>`: run a single pass (e.g., `constitution`, `drift`, `lifecycle`, `code-health`, `heuristics`, `code-drift`)
- `--fix`: auto-fix issues where possible
- `--status <spec-path> <new-status>`: manually update a spec's status

**Example:**
```
/adev:hygiene
/adev:hygiene --check drift
/adev:hygiene --fix
```

**Expected Output:** An audit report with findings organized by pass, severity ratings, and actionable fix checklists.

**Related Guides:** [Maintain](maintain.md)

---

### `/adev:retro`

**Purpose:** Analyze completed work over a time period to extract lessons, compute delivery metrics, and generate improvement recommendations. Examines git history, validation reports, recovery records, blocker files, hygiene reports, and plan files.

**Prerequisites:** Git history and `.context-index/` must exist.

**Arguments:**
- `--since <date>`: start date (default: 2 weeks ago). Accepts ISO format or relative expressions
- `--charter <module>`: scope to a specific feature charter
- `--auto-apply`: apply low-risk improvements automatically

**Example:**
```
/adev:retro
/adev:retro --since "1 month ago"
/adev:retro --charter auth --auto-apply
```

**Expected Output:** A retrospective report with patterns, delivery metrics, and actionable improvement recommendations.

**Related Guides:** [Maintain](maintain.md)

---

### `/adev:codehealth`

**Purpose:** Scan source code for dead exports, orphan files, unused dependencies, stale code, and duplicate logic. Produces severity-tiered reports from repomap artifacts.

**Prerequisites:** Repomap artifacts must exist (run `/adev:repomap` first).

**Arguments:**
- No arguments: full scan against all `hygiene.source_roots`
- `--module <slug>`: restrict to a single module's paths
- `--check <name>`: comma-separated check filter (e.g., `dead-exports,orphan-files,unused-deps,stale-code,duplicate-logic`)

**Example:**
```
/adev:codehealth
/adev:codehealth --module hooks
/adev:codehealth --check dead-exports,unused-deps
```

**Expected Output:** A severity-tiered markdown report listing code health issues with file paths and recommended actions.

**Related Guides:** [Maintain](maintain.md)

---

### `/adev:repomap`

**Purpose:** Generate an AST-based symbol index of the repository. Extracts exported functions, classes, types, and interfaces, ranks by reference count, and outputs artifacts consumed by `/adev:hygiene` for drift detection.

**Prerequisites:** Source code must exist.

**Arguments:**
- No arguments: map the entire repository
- `--path <dir>`: map a specific directory
- `--depth <n>`: limit tree depth (default: unlimited)

**Example:**
```
/adev:repomap
/adev:repomap --path lib/
```

**Expected Output:** Symbol index files at `.context-index/repomap/` including `dependency-graph.json` and `symbol-ranks.json`.

**Related Guides:** [Maintain](maintain.md)

---

### `/adev:reconcile`

**Purpose:** Interactive repair for lifecycle mismatches. Detects orphaned artifacts, stale epics, untraced code, and missing issues, then offers targeted fixes for each finding.

**Prerequisites:** Run `/adev:hygiene` or `/adev:status` first to detect mismatches.

**Arguments:**
- No arguments: full reconciliation scan
- `--check <type>`: run a single check (e.g., `epics`, `plans`, `issues`, `manifests`, `untraced`)
- `--batch`: apply fixes without confirmation prompts
- `--dry-run`: show what would be fixed without changes

**Example:**
```
/adev:reconcile
/adev:reconcile --check epics
/adev:reconcile --dry-run
```

**Expected Output:** A list of detected mismatches with offered fixes, applied interactively or in batch mode.

**Related Guides:** [Maintain](maintain.md)

---

### `/adev:sample`

**Purpose:** Scan the codebase for high-quality implementations, score them against the constitution and patterns, and curate annotated golden samples in `.context-index/samples/`. Golden samples guide subagents during `/adev:implement` as reference implementations.

**Prerequisites:** `.context-index/` must be initialized with `constitution.md` and `manifest.yaml`.

**Arguments:**
- `--pattern <name>`: extract a golden sample for a specific pattern
- `--from <file>`: promote a specific file directly
- `--score`: re-score all existing samples
- `--refresh`: re-score, flag stale samples, and update or remove invalid ones

**Example:**
```
/adev:sample
/adev:sample --pattern api-route
/adev:sample --from src/lib/auth.mjs
/adev:sample --refresh
```

**Expected Output:** Annotated golden samples at `.context-index/samples/` with quality scores and pattern annotations.

**Related Guides:** [Maintain](maintain.md)

---

### `/adev:document`

**Purpose:** Generate human-readable developer documentation in `docs/` from `.context-index/` artifacts. Reads repomap output, charters, and manifest to produce architecture docs and per-module documentation.

**Prerequisites:** Repomap artifacts must exist (run `/adev:repomap` first).

**Arguments:**
- No arguments: generate all documentation
- `--module <slug>`: regenerate only a specific module's docs
- `--check`: compute what would change without writing
- `--force`: regenerate all sections unconditionally

**Example:**
```
/adev:document
/adev:document --module hooks
/adev:document --check
```

**Expected Output:** Documentation files at `docs/architecture.md` and `docs/modules/<slug>.md` generated from repomap and context artifacts.

**Related Guides:** [Maintain](maintain.md)

---

## Meta

### `/adev:research`

**Purpose:** Conduct structured research across multiple sources (local codebase, web search, GitHub repositories) and produce an organized research artifact. Findings are synthesized with attribution, code examples, and actionable recommendations.

**Prerequisites:** None.

**Arguments:**
- `<topic>` (required): free-text research topic
- `--web`: include web search as a source
- `--github <owner/repo>`: include GitHub code search
- `--internal`: include local codebase search
- `--compare`: organize findings as a comparison matrix

**Example:**
```
/adev:research "dependency injection patterns in Node.js ESM"
/adev:research --compare "state management libraries for React"
/adev:research --web --github vercel/next.js "app router migration"
```

**Expected Output:** A research artifact at `.context-index/research/<slug>.md` with findings, code examples, and recommendations.

**Related Guides:** [Core Concepts](concepts.md)

---

### `/adev:learn`

**Purpose:** Capture a lesson learned as a heuristic in the project's memory store. Distills free-text lessons into structured heuristic entries that persist across sessions and are injected into future implementation context.

**Prerequisites:** `.context-index/` must be initialized.

**Arguments:**
- *(positional)*: free-text lesson or rule
- `--module <module>`: target module scope
- `--anti-pattern <text>`: explicit counter-rule
- `--list`: list all heuristics (optionally filtered by `--module`)
- `--promote <id>`: promote a heuristic's confidence one level up

**Example:**
```
/adev:learn "always run tests before committing hook changes"
/adev:learn --module hooks "the repomap parser chokes on re-exports"
/adev:learn --list --module cli
```

**Expected Output:** A heuristic entry at `.context-index/memory/heuristics/<slug>.md` with the lesson, anti-pattern, module scope, and confidence level.

**Related Guides:** [Maintain](maintain.md)

---

### `/adev:assess`

**Purpose:** Assess how well a codebase is prepared for agentic development. Runs static file analysis across multiple dimensions to produce a maturity score and actionable feedback. Supports both raw structural assessment (8 dimensions) and full adev assessment (11 dimensions).

**Prerequisites:** None.

**Arguments:**
- No arguments: auto-detect mode based on `.context-index/` presence
- `--mode raw`: assess only 8 structural dimensions
- `--mode adev`: assess all 11 dimensions (structural + adev-specific)
- `--output markdown` (default): human-readable scorecard
- `--output json`: machine-parseable JSON
- `--target <path>`: directory to assess (default: cwd)

**Example:**
```
/adev:assess
/adev:assess --mode raw --output json
/adev:assess --target /path/to/project
```

**Expected Output:** A maturity scorecard with per-dimension scores, overall readiness rating, and prioritized improvement recommendations.

**Related Guides:** [Getting Started Tutorial](getting-started.md), [Core Concepts](concepts.md)
