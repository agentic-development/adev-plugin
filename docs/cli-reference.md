# CLI Reference

> Last updated: 2026-06-02

Reference for the `adev` command-line verbs. There are two audiences:

- **User-facing verbs** — the public surface invoked via `npx @adev-org/adev-cli <verb>` (or `adev <verb>` once installed): installation, upgrade, extensions, and project setup.
- **Lifecycle / internal verbs** — the `adev <verb>` commands that adev skills call from their `SKILL.md` prose (and that other verbs call) to do real work: gate evaluation, event emission, state projection, reality checks, and artifact handling. Agents orchestrating the lifecycle need these.

Every verb prints full flag detail with `adev <verb> --help`. Verbs are dispatched from the registry in `cli/index.mjs`; each lifecycle verb is implemented in `lib/cli/<verb>.mjs`.

This file is the CLI counterpart to [`skill-reference.md`](skill-reference.md) (which documents the `/adev:*` skills). Skills are what you invoke in your AI assistant; CLI verbs are what those skills run underneath.

## Summary Table

### User-facing

| Verb | Purpose |
|------|---------|
| `install` | First-time plugin setup for one or more providers |
| `upgrade` | Update an existing install to the latest version |
| `uninstall` | Remove the plugin from selected providers |
| `extension` | Install or list domain extension packs |
| `init` | Scaffold/diagnose `.context-index/` (also a skill: `/adev:init`) |
| `status` | Print a project status summary (also a skill: `/adev:status`) |
| `migrate` | One-shot conversion of legacy state artifacts |
| `help` | Print top-level usage |

### Lifecycle / internal

| Verb | Purpose | Implementation |
|------|---------|----------------|
| `gate` | Evaluate a lifecycle gate without doing the skill's work | `lib/cli/gate.mjs` |
| `report` | Append a lifecycle event to the per-spec event log | `lib/cli/report.mjs` |
| `diagnose` | Run registered write-time diagnostics over artifacts | `lib/cli/diagnose.mjs` |
| `source-manifest` | Verify or compute a spec's source-file manifest | `lib/cli/source-manifest.mjs` |
| `verify` | Reality-check whether spec/issue work exists in code | `lib/cli/verify.mjs` |
| `preflight` | Run the infrastructure preflight for a spec/plan | `lib/cli/preflight.mjs` |
| `state` | Query lifecycle/spec state and event logs | `lib/cli/state.mjs` |
| `execution-state` | Read/write/clear the live work-in-progress snapshot | `lib/cli/execution-state.mjs` |
| `build-state` | Read/create/record/next over build-orchestrator state | `lib/cli/build-state.mjs` |
| `context` | Load spec context and/or plan progress in one call | `lib/cli/context.mjs` |
| `partial` | Detect/inspect/discard partial-write artifacts | `lib/cli/partial.mjs` |
| `artifact` | Atomically commit lifecycle artifacts into place | `lib/cli/artifact.mjs` |
| `route` | Emit/render the plan routing sidecar | `lib/cli/route.mjs` |
| `implement` | Read a task's routing entry from the sidecar | `lib/cli/implement.mjs` |
| `specify` | Revise a BLOCKED spec (revision N → N+1) | `lib/cli/specify.mjs` |
| `prototype` | Prototype helpers (charter discovery, preview server) | `lib/cli/prototype.mjs` |
| `issues` | Issue-board subcommands (e.g. backend migrate) | `lib/cli/issues.mjs` |
| `retro` | Gather session activity for a retrospective window | `lib/cli/retro.mjs` |
| `heuristics` | Extract/retrieve/write project heuristics | `lib/cli/heuristics.mjs` |
| `domain` | Resolve a module's domain and load domain config | `lib/cli/domain.mjs` |
| `cost` | Aggregate per-spec/per-step token + USD totals | `lib/cli/cost.mjs` |

---

## User-Facing Verbs

Invoked via `npx @adev-org/adev-cli <verb>` (before install) or `adev <verb>` (after). Implemented inline in `cli/index.mjs`.

### `install`

**Purpose:** First-time plugin setup. Copies the plugin into the provider's plugin cache and makes hooks executable.

**Signature:** `install [--provider claude-code|opencode|codex]...`

Repeat `--provider` to install for multiple providers. Default is `claude-code`.

**Example:**
```
npx @adev-org/adev-cli install
npx @adev-org/adev-cli install --provider opencode --provider codex
```

**Implementation:** `cli/index.mjs::cmdInstall`. After install, run `/adev:init` inside your AI assistant.

### `upgrade`

**Purpose:** Update an existing install to the latest version (preserves project context).

**Signature:** `upgrade [--provider <name>]...`

**Example:**
```
npx @adev-org/adev-cli upgrade
```

**Implementation:** `cli/index.mjs::cmdUpgrade`.

### `uninstall`

**Purpose:** Remove the plugin from the selected providers.

**Signature:** `uninstall [--provider <name>]...`

**Example:**
```
npx @adev-org/adev-cli uninstall
```

**Implementation:** `cli/index.mjs::cmdUninstall`.

### `extension`

**Purpose:** Install or list domain extension packs (see [Extensions](extensions.md)).

**Signature:** `extension install <source>` · `extension list`

**Example:**
```
npx @adev-org/adev-cli extension install github:org/adev-data-engineering
npx @adev-org/adev-cli extension list
```

**Implementation:** `cli/index.mjs::cmdExtension`.

### `init`

**Purpose:** Scaffold or diagnose `.context-index/`. This is the CLI form of the `/adev:init` skill — prefer the skill inside your AI assistant; the verb exists for scripted/headless setup.

**Signature:** `init [--brownfield] [--dry-run] [--workspace]`

**Example:**
```
adev init --brownfield
```

**Implementation:** `cli/index.mjs` (`init` registry entry). See [`/adev:init`](skill-reference.md).

### `status`

**Purpose:** Print a project status summary (charters, specs, capabilities). CLI form of `/adev:status`.

**Signature:** `status`

**Example:**
```
adev status
```

**Implementation:** `cli/index.mjs::cmdStatus`. See also the `state` verb for machine-readable lifecycle projections.

### `migrate`

**Purpose:** One-shot conversion of legacy state artifacts (e.g. pre-0.27 build/lifecycle state) to the current format.

**Signature:** `migrate`

**Example:**
```
adev migrate
```

**Implementation:** `cli/index.mjs` (`migrate` registry entry). For issue-board backend migration, see the `issues migrate` verb instead.

### `help`

**Purpose:** Print top-level usage and the list of available verbs.

**Signature:** `help` (also `adev` with no arguments)

**Implementation:** `cli/index.mjs::cmdHelp`.

---

## Lifecycle / Internal Verbs

These run under the hood when skills execute. Each is invoked as `adev <verb> …` from `SKILL.md` prose (the cli-driver-surface model: prose names the verb, the helper does the work). All path arguments are containment-checked against the project root. JSON-emitting verbs print a single-line JSON object on stdout.

### `gate`

**Purpose:** Evaluate a lifecycle gate (is the prior step complete?) without performing the skill's work. Exit 2 means blocked.

**Signature:** `gate require --skill <name> --spec <path>`

Supported skills: brainstorm, specify, review-specs, plan, implement, validate, retro.

**Example:**
```
adev gate require --skill implement --spec .context-index/specs/features/auth/login.spec.md
```

**Implementation:** `lib/cli/gate.mjs`. **Called by:** `/adev:plan`, `/adev:specify`, `/adev:review-specs`, `/adev:implement`, `/adev:validate`.

### `report`

**Purpose:** Append a lifecycle event to `.context-index/lifecycle-state/<slug>.jsonl`. Replaces the inline `reportValidator` / `reportStep` / `reportReviewer` / `reportPlanTask` / `reportIntervention` calls.

**Signature:** `report --type <validator|step|reviewer|plan-task|intervention|cost-checkpoint> --spec <path> [type-specific flags]`

**Example:**
```
adev report --type validator --spec <p> --step validate --validator check-2-spec-compliance --verdict PASS
```

**Implementation:** `lib/cli/report.mjs`. **Called by:** `/adev:plan`, `/adev:specify`, `/adev:review-specs`, `/adev:implement`, `/adev:validate`.

### `diagnose`

**Purpose:** Run registered diagnostics over lifecycle artifacts (write-time integrity checks). Exit 2 if any error-severity diagnostic fires.

**Signature:** `diagnose [--spec <path>] [--tier 1|2|3[,...]] [--only <id>[,...]] [--json] [--quiet] [--strict-warnings]`

**Example:**
```
adev diagnose --tier 1 --json
```

**Implementation:** `lib/cli/diagnose.mjs`. **Called by:** the write-time diagnostic hook (see [Hooks](hooks.md)); also invokable manually.

### `source-manifest`

**Purpose:** Verify a spec's stamped source-manifest against the current files, or compute a fresh manifest hash.

**Signature:** `source-manifest verify --spec <path> [--quiet]` · `source-manifest compute --files <p1>,<p2>,... [--out <path>]`

**Example:**
```
adev source-manifest verify --spec .context-index/specs/features/auth/login.spec.md
```

**Implementation:** `lib/cli/source-manifest.mjs`. **Called by:** `/adev:implement` (stamp), `/adev:validate` (Check 1.5).

### `verify`

**Purpose:** Reality-check whether a spec's or issue's work actually exists in the codebase, returning a confidence score. Prevents "ghost" validations.

**Signature:** `verify spec --spec <path> [--plan <path>]` · `verify issue --issue-json <json> […]` · `verify format-note --action <text> --confidence <low|medium|high> […]`

**Example:**
```
adev verify spec --spec .context-index/specs/features/auth/login.spec.md
```

**Implementation:** `lib/cli/verify.mjs`. **Called by:** `/adev:validate`, `/adev:hygiene`, `/adev:debug`, `/adev:plan`.

### `preflight`

**Purpose:** Run the infrastructure preflight (probe required external systems) for a spec/plan before implementation. Exit 2 if a system is unreachable.

**Signature:** `preflight run --spec <path> [--plan <path>] [--timeout <sec>] [--no-infra] [--format json|text]`

**Example:**
```
adev preflight run --spec <p> --plan <p> --format text
```

**Implementation:** `lib/cli/preflight.mjs`. **Called by:** `/adev:implement`, `/adev:validate`, `/adev:debug`, `/adev:recover`, `/adev:eval`, `/adev:write-test`.

### `state`

**Purpose:** Query lifecycle and spec state — aggregate records, a per-spec projection, or a filtered event log. Read-only.

**Signature:** `state list [--status <s>] [--module <m>]` · `state current --spec <path>` · `state events --spec <path> [--event <type>]`

**Example:**
```
adev state current --spec .context-index/specs/features/auth/login.spec.md
```

**Implementation:** `lib/cli/state.mjs`. **Called by:** `/adev:status`.

### `execution-state`

**Purpose:** Read/write/clear `.context-index/.execution-state.json` — the live snapshot of current work in progress (drives the lifecycle gate's active/idle/standalone modes).

**Signature:** `execution-state read` · `execution-state write --status <idle|active|blocked|standalone> [flags]` · `execution-state clear`

`active` additionally requires `--plan-ref` and `--current-task`.

**Example:**
```
adev execution-state write --status standalone
```

**Implementation:** `lib/cli/execution-state.mjs`. **Called by:** `/adev:implement`, `/adev:standalone`.

### `build-state`

**Purpose:** Read/create/record/next over `.context-index/lifecycle-state/<slug>.json` — the resumable state for the `/adev:build` orchestrator.

**Signature:** `build-state <read|create|record|next> --spec <path> [flags]`

`create --full` includes the `specify` step; `record` takes `--step` + `--status <completed|failed|skipped|pending>`.

**Example:**
```
adev build-state next --spec .context-index/specs/features/auth/login.spec.md
```

**Implementation:** `lib/cli/build-state.mjs`. **Called by:** `/adev:build`.

### `context`

**Purpose:** Load spec context (charter capability map + constitution principles) and/or plan progress (task counts + completion) in a single call.

**Signature:** `context load (--spec <path> | --plan <path>) [...]`

At least one of `--spec` / `--plan` is required.

**Example:**
```
adev context load --spec <p> --plan <p>
```

**Implementation:** `lib/cli/context.mjs`. **Called by:** `/adev:implement`, `/adev:plan`.

### `partial`

**Purpose:** Detect, inspect, resume, discard, or size-check partial-write artifacts (`*.partial`) — the crash-recovery surface for incremental artifact writes.

**Signature:** `partial <detect|inspect|resume|discard|check-size> [flags]`

**Example:**
```
adev partial detect --root .context-index/specs
```

**Implementation:** `lib/cli/partial.mjs`. **Called by:** `/adev:build`, `/adev:implement`, `/adev:plan`, `/adev:specify`.

### `artifact`

**Purpose:** Atomically commit a lifecycle artifact — rename a `<spec>.<kind>.md.tmp` (or explicit `--from`/`--to`) into place so readers never see a half-written file.

**Signature:** `artifact commit --spec <path> --kind <validate|review>` · `artifact commit --from <src> --to <dst>`

**Example:**
```
adev artifact commit --spec <p> --kind validate
```

**Implementation:** `lib/cli/artifact.mjs`. **Called by:** `/adev:implement`, `/adev:validate`.

### `route`

**Purpose:** Write or render the plan routing sidecar (`<plan-stem>.routing.json`) — the per-task auto/assisted/human routing decisions.

**Signature:** `route emit-sidecar --plan <path>` (reads JSON entries from stdin) · `route render-sidecar --plan <path>`

**Example:**
```
adev route render-sidecar --plan .context-index/specs/features/auth/login.plan.md
```

**Implementation:** `lib/cli/route.mjs`. **Called by:** `/adev:route`.

### `implement`

**Purpose:** Resolve a single task's routing entry from the sidecar and print it as JSON (used to dispatch each task with the right autonomy/agent).

**Signature:** `implement read-routing --plan <path> --task-id <id> [--agents-allowlist <csv>]`

**Example:**
```
adev implement read-routing --plan <p> --task-id task-3
```

**Implementation:** `lib/cli/implement.mjs`. **Called by:** `/adev:implement`, `/adev:route`.

### `specify`

**Purpose:** Revise a BLOCKED spec from revision N to N+1 using its `.review.md` + `.blockers.md` sidecars (the auto-retry revise loop). Emits a `spec_revised` event.

**Signature:** `specify revise --spec <path> [--auto]`

**Example:**
```
adev specify revise --spec <p>
```

**Implementation:** `lib/cli/specify.mjs`. **Called by:** `/adev:specify`, `/adev:build` (BLOCK→revise loop).

### `prototype`

**Purpose:** Helper subcommands for the `/adev:prototype` skill — kebab-case validation, charter discovery, and a local preview server.

**Signature:** `prototype <validate-module-name|discover-charters|start-server|ensure-gitignore> [flags]`

**Example:**
```
adev prototype discover-charters
```

**Implementation:** `lib/cli/prototype.mjs`. **Called by:** `/adev:prototype`.

### `issues`

**Purpose:** Issue-board subcommands. Currently `migrate` (convert the board to a different backend). Most issue operations go through the `/adev:issues` skill.

**Signature:** `issues <subcommand> [args]` (e.g. `issues migrate`)

**Example:**
```
adev issues migrate --help
```

**Implementation:** `lib/cli/issues.mjs` (+ `lib/cli/issues-migrate.mjs`). **Called by:** `/adev:issues`.

### `retro`

**Purpose:** Gather session activity for a retrospective analysis window (feeds `/adev:retro`).

**Signature:** `retro session-activity --since <YYYY-MM-DD> --until <YYYY-MM-DD> [--project-root <dir>] [--format json|text]`

**Example:**
```
adev retro session-activity --since 2026-05-01 --until 2026-05-31
```

**Implementation:** `lib/cli/retro.mjs`. **Called by:** `/adev:retro`.

### `heuristics`

**Purpose:** Extract (Check 13 success-heuristic capture), retrieve (module-scoped injection), or write project heuristics in the memory store.

**Signature:** `heuristics extract --spec <p> --report <p> […]` · `heuristics retrieve --module <slug> […]` · `heuristics write --id <id> --scope <s> --title <t> --pattern <p> […]`

**Example:**
```
adev heuristics retrieve --module auth --tier summary --format text
```

**Implementation:** `lib/cli/heuristics.mjs`. **Called by:** `/adev:validate`, `/adev:implement`, `/adev:plan`, `/adev:brainstorm`, `/adev:specify`, `/adev:review-specs`, `/adev:debug`, `/adev:recover`, `/adev:prototype`.

### `domain`

**Purpose:** Resolve the active domain for a module and load domain-aware config (gates, reviewers, test-config, verification), merging project governance on top.

**Signature:** `domain <resolve|load-gates|load-reviewers|load-test-config|load-verification> --module <slug> [--charter <path>] [--governance <path>]`

Resolution precedence: `charter.domain > module.domain > project.domain > software`.

**Example:**
```
adev domain load-gates --module auth
```

**Implementation:** `lib/cli/domain.mjs`. **Called by:** `/adev:validate`, `/adev:review-specs`, `/adev:implement`, `/adev:specify`, `/adev:brainstorm`, `/adev:write-test`.

### `cost`

**Purpose:** Aggregate per-spec / per-step token and USD totals from `.context-index/.session-tracking.jsonl`.

**Signature:** `cost summary [--spec <path> | --epic <id>] [--format text|json] [--include-checkpoints] [--since <iso8601>] [--quiet]`

`--spec` and `--epic` are mutually exclusive. `ADEV_BUILD_TICKER=1` routes output to stderr; `build.cost_warn_usd` in the manifest emits a non-blocking warning past a threshold.

**Example:**
```
adev cost summary --spec .context-index/specs/features/auth/login.spec.md --format json
```

**Implementation:** `lib/cli/cost.mjs`. **Called by:** `/adev:build`.

---

## Keeping this in sync

Verbs are registered in the dispatch table in `cli/index.mjs`. When you add a verb (`lib/cli/<verb>.mjs`), add a row here and to the summary table. The authoritative per-flag detail always lives in `adev <verb> --help`; this page is the discovery surface.
