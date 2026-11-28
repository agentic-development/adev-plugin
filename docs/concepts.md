[adev docs](README.md) > Getting Started

# Core Concepts

adev is built on four pillars that shape how humans and AI agents collaborate to build software. Understanding these pillars helps you make the most of the framework.

## The Four Pillars

### 1. Context-First Architecture

Every decision an AI agent makes depends on the context it has. adev stores all project knowledge — principles, specifications, architectural decisions, and configuration — in a structured directory called the **Context Index** (`.context-index/`). This ensures that every agent session starts with the same shared understanding of the project, regardless of which agent or model is used.

Without structured context, agents improvise. With it, they follow your project's established patterns and constraints.

### 2. Ephemeral Infrastructure

Agents are disposable; context is not. An agent session may last minutes or hours, but the artifacts it produces — specifications, plans, code, and test results — persist in the repository. If a session fails or an agent gets stuck, you can start a fresh session and it picks up exactly where the last one left off by reading the same context.

This means you never depend on a single long-running agent. Work is saved incrementally, and recovery is always possible.

### 3. Gate-Based Governance

Quality is enforced through gates at every stage of the lifecycle. A specification must pass architectural review before it can be planned. An implementation must pass both spec-compliance and code-quality reviews before it is considered complete. Validation runs a comprehensive check suite before a feature is promoted.

Gates prevent shortcuts. They ensure that agents cannot skip steps, merge untested code, or produce work that drifts from the specification.

### 4. Hybrid Engineering

Some tasks are best handled by agents; others require human judgment. adev supports this through routing — tasks can be classified as fully autonomous, agent-assisted (agent does the work, human reviews at checkpoints), or human-only (agent scaffolds the structure, human writes the code).

The framework does not try to automate everything. It provides structure so that humans and agents each contribute where they are most effective.

## The Context Index

The Context Index is the `.context-index/` directory at the root of your project. It contains:

- **Constitution** (`constitution.md`) — Your project's non-negotiable principles, coding standards, and architectural boundaries. This is the document that every agent reads first.
- **Manifest** (`manifest.yaml`) — Module registry, quality gate commands, completion policies, and framework configuration.
- **Platform Context** (`platform-context.yaml`) — Tech stack details (language, runtime, framework, test runner) that inform agent decisions.
- **Feature Charters** (`specs/features/<name>/charter.md`) — Scoping documents that define what a feature includes and excludes, its capabilities, and quality attributes.
- **Live Specs** (`specs/features/<name>/*.spec.md`) — Behavioral contracts that define preconditions, expected behaviors, postconditions, and error cases for each capability.
- **ADRs** (`adrs/`) — Architectural Decision Records documenting significant technical choices and their rationale.
- **Tasks** — Issue tracking for bugs, tasks, and epics tied to specifications and plans.

You do not need to create these files manually. The `/adev:init` command scaffolds the Context Index interactively, and subsequent skills maintain it as your project evolves.

## Lifecycle Overview

adev follows a structured lifecycle for building features. Each phase produces artifacts that feed into the next:

```
brainstorm --> specify --> review --> plan --> implement --> validate
    |              |          |         |          |            |
    v              v          v         v          v            v
 Charter      Live Spec    Review    Plan      Code +       Validated
              (behavioral  Report   (ordered   Tests        Feature
               contract)            tasks)
```

1. **Brainstorm** — Explore an idea interactively and produce a Feature Charter that defines scope, capabilities, and boundaries.
2. **Specify** — Within a charter's scope, write a Live Spec — a behavioral contract defining exactly what the feature does.
3. **Review** — Specialist reviewers (architecture, security, consistency) evaluate the spec for issues before any code is written.
4. **Plan** — The reviewed spec is decomposed into ordered implementation tasks with file lists, test expectations, and dependencies.
5. **Implement** — Each task is executed under the project's test discipline (test-driven development by default; see `implementation_mode`), with each task reviewed at the depth the rigor ladder resolves for it (see [Graduated Rigor Tiers](#graduated-rigor-tiers)).
6. **Validate** — A comprehensive check suite verifies the implementation against the spec, constitution, and quality gates.

The diagram above shows the core path; two optional steps sit alongside it — **route** (after plan: scores each task as auto / assisted / human-only) and **eval** (after validate: graduated 0–100 quality scoring). This lifecycle is not rigid — you can enter at any point, skip phases for simple changes, or iterate within a phase. But for new features, following the full lifecycle produces the most reliable results.

### The Front Door: `/adev:work`

You do not have to memorize which skill to run at each step. `/adev:work` is the **single front door and conductor** — run it when you are unsure where to start or what comes next. It scans lifecycle state and either classifies new work and routes it to the right skill, or, when work is already underway, projects the next lifecycle step and can advance the pipeline for you (`/adev:work continue`). It is the manual counterpart to the fully-automated `/adev:build` orchestrator: `/adev:work` keeps you in the loop between steps, while `/adev:build` runs the whole pipeline hands-off.

## Graduated Rigor Tiers

Not every change deserves the same depth of review. adev's gates support graduated **rigor tiers** so low-risk work moves fast without ever *skipping* a gate.

### Review and validation: `full` and `quick`

- **`full`** (default) — the complete treatment. `/adev:review-specs` dispatches the project's registry reviewer set (structural, security, consistency by default); `/adev:validate` runs the full check suite.
- **`quick`** — a narrowed pass for low-blast-radius, high-pattern-coverage work. `/adev:review-specs` dispatches a single synthesized reviewer; `/adev:validate` runs a trimmed check set. Crucially, `quick` **still produces the gate's artifact and emits its lifecycle event** — it narrows breadth, it does not bypass governance. The gate chain downstream is satisfied exactly as it is under `full`.

The tier is resolved by precedence: an explicit `--tier full|quick` flag wins, then a routing signal (`/adev:route`, `/adev:work`, or `/adev:build` may propagate `--tier quick` for work it scored as "easy": routed `auto-agent` with no dimension below 3 of 5, `quickTierSignal` in `lib/implement/review-depth.mjs`), then a per-risk-level policy (`review_mode`, `validate_mode`) in `governance/risk-policies.yaml`, defaulting to `full`. This keeps Gate-Based Governance intact — every stage still runs — while letting the framework spend reviewer effort where the risk actually is.

Both skills also accept `--tier lite` and run it as `quick`, printing one line saying so.

### Implementation: the `full` / `quick` / `lite` ladder

`/adev:implement` resolves a review depth **per task**, so one plan can mix levels. `adev implement resolve-depth` makes the decision; skill prose never does.

| Level | How the task runs | Per-task review | Reached when |
|---|---|---|---|
| `full` | Fresh implementer subagent | Stage 1 spec compliance, then Stage 2 code quality | `--tier full` (absolute), or a floor leg holds (under the lite cap, a sensitive path or boundary gives `quick` instead) |
| `quick` (default) | Fresh implementer subagent | One synthesized reviewer | No floor leg holds and the task is not granted `lite` |
| `lite` | Inline in the orchestrator, no subagent | None; a post-task tripwire can escalate it | Operator authorization plus every grant condition below |

**Baseline.** `--tier quick` or `--tier full` sets it for the run; otherwise the spec's risk level's `implement_mode` in `risk-policies.yaml` does; otherwise it is `quick`.

**Floor legs.** Each one forces `full`, whatever the baseline:

- `risk-level`: the spec is `risk_level: high` and the task is not routed `auto-agent` (a high-risk `auto-agent` task resolves `quick` and is never granted `lite`).
- `boundary` and `sensitive-path`: a declared file (and, after the task, any touched file) crosses a governance boundary or matches a sensitive path.
- `routing`: the task is routed `human-only`. An `assisted-agent` task keeps its human checkpoint but no longer forces `full`.
- `critical-finding`: a reviewer raised a Critical finding.

**The lite cap.** When `lite` is authorized for the run and the spec is not `risk_level: high`, a holding `boundary` or `sensitive-path` leg gives `quick` instead of `full`, on both passes and in the tripwire. Any other holding leg still gives `full`, and `--tier full` stays absolute. `resolve-depth` then reports `floor_cap: quick`.

Batch membership does not change a task's depth: a batched task is reviewed at its own resolved depth.

**The `lite` grant.** A task resolves `lite` only when all of these hold:

1. **The operator authorized it**, by typing `--lite` or `--tier lite`, or through `implement_mode: lite` for the spec's risk level when no `--tier` was passed. An agent never adds the flag on its own judgment, and `--tier quick` or `--tier full` is the per-run opt-out from a policy authorization. A policy-sourced run prints `lite authorized via policy` at the start and in the run summary.
2. **Route made it eligible.** `liteEligible(entry)` in `lib/implement/review-depth.mjs` holds: the task has a routing entry routed `auto-agent` or `assisted-agent`. Scores are not consulted. A missing entry is denied `no-routing-entry` and a `human-only` entry `floor:routing`. An `assisted-agent` task granted `lite` keeps its human checkpoint before the commit. `/adev:route` prints how many tasks pass as `lite-eligible: <count> of <total>`. That count is a signal, never an authorization.
3. **The spec is not high-risk** and no floor leg holds.
4. **The run is not `--parallel`.**

Governance inputs come from one commit. `adev implement check-flags`, the skill's first action, captures `run_base` (`HEAD` at the start of the run). Every depth call reads `risk-policies.yaml`, `boundaries.yaml`, the sensitive paths and the routing sidecar from that commit, so an inline task cannot change the inputs to its own resolution. **The routing sidecar must therefore be committed at `run_base`.** If it is not, no task is granted `lite` and the run reports `ROUTING_SIDECAR_MISSING`.

**The tripwire.** When a `lite` task finishes, before its commit, the final pass compares every file it touched with its declared files:

- A sensitive or boundary path, including a gitignored file the task wrote, escalates the task to `quick` under the lite cap.
- Otherwise an undeclared path that is not exempt escalates it to `quick` (`scope-mismatch`).

Exempt paths are those under `tests/` or `docs/`, `*.test.<ext>` and `*.spec.<ext>` source files, `README.md` files, and exact provider mirror regenerations: a file under `providers/*/skills/` whose bytes are exactly what `scripts/sync-provider-skills.mjs` writes from a canonical skill file the task declared or touched. A `*.spec.md`, anything under `.context-index/` (both matched case-insensitively) and a symlink are never exempt. An escalation reports `LITE_TRIPWIRE_ESCALATED` and runs the escalated level's review loop. Escalation only goes up, and a tripwire escalation is to `quick`; only a `routing` or `critical-finding` leg would give `full`.

**After the run.** A run with any `lite` task runs the constitution's quality gates once over the whole run, fail-fast, and a failure stops it with `QUALITY_GATES_FAILED`. The final whole-run review is skipped only when every task resolved `lite`. `/adev:validate` then calls `adev implement lite-report` and lists those tasks as "implemented without per-task review", and its spec-compliance check covers their commits.

**What `lite` never relaxes.** The strict lifecycle gate chain, `adev gate require`, the non-main-branch stop, skill extensions, test integrity, quality-gate fail-fast, destructive-action gates and constitution checks all apply exactly as under `full`. Per-task review is review breadth, not a hard gate. Every review loop, including one reached through the tripwire, is capped at `implement.max_review_cycles`; a loop that does not converge blocks the task and stops the run without waiting for input.

See [Configuration → implement_mode](configuration.md#governancerisk-policiesyaml-implement_mode) for the policy field and [CLI Reference → implement](cli-reference.md#implement) for the verbs.

## Output Personas

adev adapts its communication style on **two orthogonal axes**: a **persona** that controls the audience pitch (who is reading), and a **verbosity** dial that controls how much detail lands in chat (how much they need to see). Neither axis changes what the framework does — they change how it talks to you. Artifacts written to disk (validation reports, review files, plans) always use the full technical format regardless of either axis.

### Axis 1 — Persona (audience pitch)

Three personas are available:

- **Product** — For product managers, designers, and non-technical stakeholders. Skills summarize outcomes in plain language, omit file paths and code snippets, and suggest next actions in terms of decisions rather than commands.
- **Developer** (default) — For engineers actively building. Skills show file paths, code references, test results, and technical details. This is the full-detail view.
- **Architect** — For technical leads reviewing design decisions. Skills emphasize architectural trade-offs, boundary compliance, and cross-cutting concerns.

### Axis 2 — Verbosity (output depth)

Three verbosity levels are available:

- **terse** — Cap responses to ~3 sentences unless asked. Skip Architectural-Read, multi-table verdicts, and trade-off recapping unless the user explicitly invokes them. Summarize disk artifacts in one sentence with a link.
- **normal** — One to two paragraphs by default. Trade-off rationale appears at real decision branches.
- **deep** — Full mandated sections from the persona directive: rationale, trade-offs, multi-table review verdicts, and complete citation lists.

Per-persona defaults: `architect → normal`, `developer → normal`, `product → terse`. You can override on a per-session basis with `--verbosity <level>`.

### Universal invariants (across all 9 combinations)

Three rules hold regardless of which persona × verbosity combination is active:

- **Next-Actions invariant.** Every assistant turn ends with a clear next-action suggestion. The Next Actions dimension is never trimmed, even under `verbosity: terse`. (Terse mode biases toward a single most-likely suggestion rather than enumerating a menu of alternatives, but the line is always present.)
- **Anti-redundancy rule.** If a disk artifact (`.review.md`, `.plan.md`, `.validate.md`, `.spec.md`, or any file under `.context-index/`) captures the detail, chat summarizes in 1–3 sentences and links to the path rather than recapitulating contents. The Next Actions dimension is exempt — forward-looking suggestions are not duplicates of disk content.
- **No hard word caps.** Templates bias tone, never enforce a hard "N words max." (The Anthropic April-2026 Claude Code postmortem found that hard word caps cost 3% quality.)
- **Completion tokens are exempt.** The `/goal`-friendly terminal markers (`ADEV-BUILD: <STATE>`, `ADEV-VALIDATE: <STATE>`) are always emitted verbatim as the final line, regardless of persona or verbosity — they are machine-readable, like disk artifacts. See *Unattended runs with `/goal`* below.

### Configuration

Both axes are configured the same way — via the `user-config` file (flat `key=value` lines, bash-parseable). The resolution hierarchy is identical:

1. Per-invocation flag (`--persona <name>` or `--verbosity <level>`)
2. Local config (`.context-index/user-config`, gitignored)
3. Global config (`<plugin-root>/user-config`, set during `npx @adev-org/adev-cli install`)
4. Per-persona default for verbosity (no fallback for persona — `developer` is the universal default)

```bash
# .context-index/user-config (local override; gitignored)
persona=architect
verbosity=terse
```

Unknown values produce a non-fatal warning and fall back. Values containing `/`, `\`, or `..` are rejected (defense-in-depth path-traversal guard). If a verbosity overlay template is missing, the session-start hook degrades to persona-only directive injection — it never blocks the session.

See [Configuration Reference → Personas & Verbosity](configuration.md#personas-verbosity) for the full schema and adoption guide.

## Unattended runs with `/goal`

Claude Code's built-in `/goal` command keeps a session running across turns until a small evaluator model confirms a completion condition — but the evaluator only sees the **transcript** (it cannot run tools or read files). To make adev pipelines reliably drivable by `/goal`, the two terminal skills emit a fixed, machine-checkable completion token as the **final line** of their output:

| Skill | Token | States |
|-------|-------|--------|
| `/adev:validate` | `ADEV-VALIDATE: <STATE>` | `PASS` · `FAIL` |
| `/adev:build` | `ADEV-BUILD: <STATE>` | `COMPLETE` · `FAILED` · `BLOCKED` |

The token is plain text (never fenced), emitted exactly once, and **persona/verbosity-independent** — it is never trimmed or reworded. A `/goal` condition can therefore match it verbatim:

```
/goal /adev:build --auto --spec .context-index/specs/features/auth/login.spec.md
      has run and the transcript contains "ADEV-BUILD: COMPLETE" and "ADEV-VALIDATE: PASS"
```

`/goal` supplies the per-turn continuation; adev's deterministic gates supply the real done-check — the evaluator only confirms what `/adev:validate` already proved. `ADEV-BUILD: BLOCKED` means the pipeline halted on an unresolved review (including the `--require-human-final-pass` sign-off halt), so a goal wrapping a build won't spin forever on a blocked spec.

> **A note on exemptions.** Completion tokens are deliberately the *second* persona-exempt output class (after disk artifacts). Keep such exemptions rare — they exist only because a machine reads the output, not a human.

This convention is governed by the `completion-tokens` cross-cutting charter (`.context-index/specs/cross-cutting/completion-tokens/`).

## Issue board backends

The issue board is stored by one backend, chosen with `tasks.backend` (see [configuration](configuration.md#tasks)). Every backend sits behind the same `IssueManager` interface and the same `adev issues` verbs, with the same refusal codes and exit codes, so skills never branch on the backend.

| Backend | Where the board lives | Choose it when |
|---|---|---|
| `json` (default) | `.context-index/tasks/tasks.json` in the repo | You want zero setup; claims are an atomic check-and-set |
| `beads` | the `br` CLI, on a `beads-board` branch checked out at `.beads/` | Concurrent branches and worktrees share one board |
| `github` | a GitHub Projects v2 board, reached through `gh` | The board should live where the team already plans, visible to every clone, worktree and CI job without a git operation |
| `file` | `.context-index/tasks/tasks.md` | Never for new work: read-only-deprecated, kept only to read an old board before migrating |

The full per-capability comparison is the [backend capability matrix](cli-reference.md#backend-capability-matrix).

### How `github` differs

- **System of record.** [ADR 0016](../.context-index/adrs/0016-portable-state-ownership.md) makes `.context-index/` the system of record for adev state. Its scoped exception covers `tasks.backend: github`: the configured GitHub board becomes the system of record for the issue board only. Lifecycle logs, execution state, sessions, milestones, heuristics and plan-task state stay in `.context-index/`.
- **IDs.** Issues in the home repo are `gh-<n>`; issues from other repositories on the project are `gh-<owner>.<repo>.<n>`. `#<n>`, `<owner>/<repo>#<n>` and issue URLs are accepted as input. An item migrated from another board keeps its old ID in the `Legacy ID` field, and the old ID still resolves.
- **No fallback.** Every failure is a named `GITHUB_*` (or shared) error. Nothing is written to a local board or queued, and a rate limit is never retried automatically.
- **Writes are several requests, not one transaction.** A `create` makes the issue, adds it to the project, then writes its fields. When a write fails after the issue exists, the issue is kept and `GITHUB_PARTIAL_CREATE` names it and the fields left unwritten, so you finish it instead of creating a duplicate.
- **Claims are a lease confirmed by re-reading,** not an atomic check-and-set. See the claim window below.
- **`list` can lag a write made by another command.** GitHub's project items listing is eventually consistent: an item added or changed seconds ago can be missing from it, or show its old values. So adev never resolves an ID through the listing. A `gh-<n>` ID is read directly (the issue and its item on the configured project), so `get`, `update`, `close`, `claim`, `release` and `dep` see an item the moment it exists, including one another command created a second ago. Within one adev process, every item that process wrote overrides the listing's row for it, so `list` there shows its own creates and updates at once. A `list` (or `board`, `next`, `walkTree`) in a separate process can still lag a write by a few seconds; re-run it if a just-written item is missing or stale. Old (pre-migration) IDs and other-repository `gh-<owner>.<repo>.<n>` IDs still resolve through the listing.
- **Turn off the board's Status workflows.** GitHub Projects' built-in workflows can overwrite the Status field seconds after adev writes it. Two are on by default: "Item added to project" and "Auto-add sub-issues to project" set a new item's Status, so adev's `In Progress` can be reset to `Backlog` by `github-project-automation` within a second. Disable every workflow that sets Status on a board adev manages (the project's **Workflows** page); adev's status writes are then the only ones besides people's.

### The claim window

On `github`, `claim()` reads the item fresh and checks the lease, writes `claimed_at` then `owner` in one request, and re-reads the item. If `owner` is someone else, it refuses with `ISSUE_ALREADY_CLAIMED`. Otherwise it waits `claim_settle_ms` (default 1500) and re-reads once more. Only after both re-reads show the claimant does it write `branch` / `pr`, whereas the json backend writes them in the same atomic write as `owner`.

A claimant that loses writes nothing further: rollback by abstention. It never tries to restore the winner's state, so a loser's `claimed_at` may have overwritten the winner's. That is accepted, because both stamps fall inside the same race window.

The residual window: two claimants can both be confirmed only if one claimant's precondition read lands before the other's write, and its own write lands after the other's settle re-read. A longer `claim_settle_ms` narrows the window but cannot close it. If you need a strict lock, use one: the `json` and `beads` backends claim with an atomic check-and-set.

### Who can change what on a GitHub board

adev reads each value only from storage with a known write permission, and checks every value it decodes. It refuses a bad value with `GITHUB_INVALID_FIELD_VALUE` rather than repairing it.

- **Project fields** (`Status`, Priority, `Owner`, `Claimed At`, `Next Action`, `Spec`, `Plan`, `Branch`, `PR`, `Legacy ID`) need project write.
- **Labels and issue types** (type, `priority:` and `module:` labels, Epic membership) need triage on the repository. Triage is a lower bar than project write, so anyone with triage can change an item's type, priority fallback or module tags. Unknown `module:` slugs are ignored, which keeps bugfix-loop eligibility fail-closed.
- **Issue authors** control only the title and body. adev treats both as untrusted text: human output neutralizes them, and `--json` marks them in `untrusted_text`.

### Migrating to `github`

`adev issues migrate --to github` copies a json, beads or file board onto the project. Each item's `Legacy ID` is written first: in the first field-write request after the issue is added to the project, as that request's first mutation, before every other field. So a failure after that write leaves an item the next run finds by `Legacy ID` and finishes, with no duplicate. The residual window is a failure after the issue is created but before its `Legacy ID` lands. That issue is then recorded in `.context-index/tasks/.migrate-unanchored.json` so the next run completes it (see [Troubleshooting](troubleshooting.md#the-unanchored-item-record)). On success the source board is retired with a read-only sentinel, and you switch `tasks.backend` yourself.

## Key Terms

| Term | Definition |
|------|------------|
| **Charter** | A scoping document that defines a feature's capabilities, boundaries, and quality attributes |
| **Live Spec** | A behavioral contract specifying preconditions, behaviors, postconditions, and error cases |
| **Constitution** | The project's non-negotiable principles and coding standards |
| **Context Index** | The `.context-index/` directory containing all structured project knowledge |
| **Gate** | A quality checkpoint that must pass before work can proceed to the next phase |
| **Skill** | A structured capability invoked via `/adev:<name>` that guides agents through a specific task |
| **TDD** | Test-Driven Development — write a failing test first, then implement to make it pass |

---

Next: [Installation & Setup](installation.md)
