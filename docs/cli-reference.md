[adev docs](README.md) > Reference

# CLI Reference

> Last updated: 2026-08-19

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
| `migrate` | **Deprecated.** One-shot conversion of legacy state artifacts |
| `help` | Print top-level usage |

### Lifecycle / internal

| Verb | Purpose | Implementation |
|------|---------|----------------|
| `gate` | Evaluate a lifecycle gate; diagnose whether quality gates can run; compare a transition against recorded gate outcomes | `lib/cli/gate.mjs` |
| `boundaries` | Evaluate the boundary registry against a set of changed files | `lib/cli/boundaries.mjs` |
| `governance` | Materialize a registry's effective set; audit registry drift | `lib/cli/governance.mjs` |
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
| `issues` | Issue-board subcommands (board, create, epic, update, close, dep, list, ready, milestone, migrate, claim, release, stale, set-modules, next, record-attempt, show) | `lib/cli/issues.mjs` |
| `coordination` | Scan open PRs, remote branches, and issues owned elsewhere | `lib/cli/coordination.mjs` |
| `retro` | Gather session activity for a retrospective window | `lib/cli/retro.mjs` |
| `heuristics` | Retrieve/sign/write/rekey project heuristics | `lib/cli/heuristics.mjs` |
| `domain` | Resolve a module's domain and load domain config | `lib/cli/domain.mjs` |
| `cost` | Aggregate per-spec/per-step token + USD totals | `lib/cli/cost.mjs` |
| `worktree` | Manage adev-managed git worktrees for parallel execution | `lib/cli/worktree.mjs` |
| `parallel` | Decision helpers for `/adev:implement --parallel` orchestration | `lib/cli/parallel.mjs` |
| `test-policy` | Resolve/inspect/set the test depth policy for a plan task | `lib/cli/test-policy.mjs` |
| `test-helpers` | Emit the shared test-helper/fixture/test-sample inventory; check a test file for helper duplication | `lib/cli/test-helpers.mjs` |
| `test-debt` | Scan the test suite for accreted debt (hygiene Audit Pass 23) | `lib/cli/test-debt.mjs` |
| `eval` | Score a verdict set against a rubric (`eval score`) | `lib/cli/eval.mjs` |

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

**Signature:** `extension install <source> [--allow-exec]` · `extension list`

**Example:**
```
npx @adev-org/adev-cli extension install github:org/adev-data-engineering
npx @adev-org/adev-cli extension install ./my-extension --allow-exec
npx @adev-org/adev-cli extension list
```

**`--allow-exec`** grants consent for the extension's executable contributions — any `command` on a gate or `kind: quality-gate` check, and any reviewer `package.skill` / `package.adapter`. Three properties:

- **Per-install, never remembered.** Nothing is persisted to `manifest.yaml` or anywhere else, and there is no "remember this choice" cache. Consent is re-asked on every install, because the payload can change between versions.
- **Interactive installs prompt.** On a TTY, install pauses and lists every executable contribution verbatim — the exact argv it would run — before asking. Only `y` / `yes` grants; empty input, EOF, and an interrupted prompt are all refusals.
- **Non-interactive installs fail closed.** Without a TTY and without `--allow-exec`, the install exits non-zero with `GOVERNANCE_EXEC_NOT_CONSENTED` and **writes nothing** — no files copied, no governance entries spliced. An extension with no executable contributions installs unattended without the flag.

Consented payloads are copied into `.context-index/extensions/<name>/` and the contributed paths are rewritten to point there; see [Extensions](extensions.md#the-governance-contribution-contract).

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

### `migrate` (deprecated)

**Purpose:** One-shot conversion of legacy state artifacts (e.g. pre-0.27 build/lifecycle state) to the current format.

**Deprecated (issue-580):** this verb carried individual repos through the 2026-05 state-artifact migration. That migration is complete on the adev-plugin repo itself, but the verb and `lib/migrate-state-artifacts.mjs` remain shipped because other installations may still be on pre-migration artifact shapes and need an upgrade path. It is slated for removal once those installs age out — do not build new functionality on top of it, and prefer not to invoke it on a repo that has already migrated (running it is a no-op there, but it is no longer an actively maintained surface).

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

#### `gate doctor`

**Purpose:** Verify that the quality gates declared in `governance/gates.yaml` can actually execute, and that the tests the project has written actually get collected by a runner. Read-only — it never modifies a file. Exit 2 means at least one error-severity finding.

adev has always verified test *authorship* rigorously (RED-state verification, immutable handoff hashes, gaming detection) and never verified test *collection*. A 2026-08-10 audit of three adev-built repos found all three had written tests that never ran.

**Signature:** `gate doctor [--json] [--execute] [--timeout <seconds>] [--gates <path>]`

Five diagnostic families:

| Family | Catches |
|---|---|
| Test collection | `**` globs that `sh` under-expands (it has no globstar, so `**` matches exactly one path segment); runner collection gaps; unidentifiable runners |
| Gate executability | Gate binaries that are neither shell builtins nor on `PATH` nor in `node_modules/.bin`; empty commands |
| CI wiring | No CI config anywhere; declared gates that appear in no CI file |
| Placeholders | Gate commands still carrying `{{ }}` template placeholders |
| Path reachability | Gate commands referencing nonexistent or **gitignored** paths (which can only run for whoever created them locally) |

Gate commands are followed one hop through `package.json` scripts, because a gate command of `npm test` usually hides the interesting part in `scripts.test`.

**`--execute` is off by default and should stay off inside skills.** The doctor is reachable from `/adev:validate` and `/adev:hygiene`, both of which are reachable from a `npm test` gate, so executing gates by default would be reentrant. When `--execute` is passed, every spawned command receives `ADEV_GATE_DOCTOR=1`, and a doctor that sees that variable already set refuses to spawn.

**Example:**
```
adev gate doctor --json
```

**Implementation:** `lib/cli/gate.mjs` → `lib/gates/doctor.mjs`. **Called by:** `/adev:validate` (check-14), `/adev:hygiene` (Audit Pass 8).

#### `gate transitions`

**Purpose:** Check a lifecycle transition's `required_gates` against the `gate_outcomes` recorded on a spec's lifecycle log. **Reads history only** — it never runs a gate and never checks a workflow precondition (that is `gate require`). Exit 2 means a required gate has no fresh, attested, passing outcome.

**Signature:** `gate transitions --transition <name> --spec <path> [--json] [--gates <path>] [--module <slug>] [--charter <path>]`

A gate counts only when its recorded outcome is **fresh** (the event's `ts` is at or after the spec's source-manifest `computed-at`, and any recorded `manifest_sha` matches) and **attested** (the gate is declared in the resolved gate set, and any recorded `command_sha` matches the hash of its resolved argv). The attestation is partial: `command_sha` catches drift and catches copying between gates whose resolved argv differ, but two gates resolving to the same command share a digest, and it catches no deliberate forgery.

`--module` / `--charter` must name the same scope the gates ran under — a different scope resolves a different gate set and degrades every outcome to `unattested-gate-record`. With neither flag the domain resolves at the project level.

Under `--json` the envelope is `{transition, verdict, reason, gates}`, where each `gates[id]` carries `id`, `verdict`, `reason` and `command_attested`. Per-gate reasons: `recorded-<verdict>`, `no-recorded-outcome`, `unknown-gate`, `stale-gate-record`, `no-manifest-stamp`, `unattested-gate-record`, `disabled-gate`. A spec with no source-manifest stamp reports `no-manifest-stamp` (never `stale-gate-record`) and SKIPs — an unstamped spec has never completed implementation, so it owes no outcomes.

Exit 1 (`GATES_PARSE_ERROR`, `GATES_PATH_ESCAPE`, `GOVERNANCE_READ_ERROR`, `MANIFEST_PARSE_ERROR`, `INVALID_DOMAIN_NAME`) emits `{transition, error, code}` on stdout as well as stderr.

**Example:**
```
adev gate transitions --transition implement-to-validate --spec .context-index/specs/features/auth/login.spec.md --json
```

**Implementation:** `lib/cli/gate.mjs` → `lib/governance/transitions.mjs`. **Called by:** `/adev:validate` (check-9).

### `boundaries`

**Purpose:** Evaluate `.context-index/governance/boundaries.yaml` against a set of files. Each rule is a regex matched against file **contents**, honouring its `exclude` globs. `severity: error` → FAIL; `severity: warning` → WARN.

**Signature:** `boundaries check [--json] [--changed <path,...>] [--all]`

With neither flag the changed set is `git diff --name-only --diff-filter=ACMR HEAD` plus untracked, not-ignored files. `--changed` is repeatable and wins over the git-derived set; `--all` evaluates every tracked file. Without git, pass `--changed`.

**SKIP is not PASS.** A project declaring no rules records SKIP — nothing was read, so nothing held — and no file is opened. An empty changed set SKIPs for the same reason. The two SKIP reasons are worded differently from "all N declared rules are disabled", because a switched-off registry is a different fact from an empty one.

The evaluator **fails closed**: an unevaluatable rule (blown time budget, oversize input) becomes a finding, never silence. Binary files are skipped with an info note.

Under `--json` the envelope is `{verdict, reason, findings, disabled, warnings, summary}`. `disabled` names every rule declared with `enabled: false` and its `disabled_reason`. The top-level `warnings` array holds **registry schema** warnings such as `DISABLED_WITHOUT_REASON` — a different thing from `summary.warnings`, which counts warning-severity findings.

Exit codes: 0 for SKIP/PASS/WARN, 2 for FAIL, 1 for an argument error or a registry the evaluator refuses (`INVALID_BOUNDARY_PATTERN`, `BOUNDARIES_PARSE_ERROR`).

**Example:**
```
adev boundaries check --json
```

**Implementation:** `lib/cli/boundaries.mjs` → `lib/governance/boundaries.mjs`. **Called by:** `/adev:validate` (check-8).

### `governance`

**Purpose:** Write a governance registry's **effective** set into the project's own file and stamp the write-once `materialized_at` marker, so that reading the file tells you what actually runs. A second subcommand audits registry drift.

**Signature:**
```
governance materialize --registry <review|diagnostics|gates> [--dry-run] [--json]
governance drift [--registry <validate|review|diagnostics|gates>] [--json]
```

`validate.yaml` and `boundaries.yaml` are **exempt** (DDR-1): both are already explicit single-source registries, so naming either is refused. See [Governance](governance.md#materialized-registries-and-the-materialized_at-marker).

Materialization is **write-once**: a second run preserves the original stamp verbatim, so an unchanged effective set produces byte-identical output. Entries already on disk keep their positions and their bytes; contributed entries are appended; comments and sibling keys survive. Exit 1 covers an argument error, an unknown or exempt registry, a containment refusal, and the two write refusals `MATERIALIZE_LOAD_INCOMPLETE` (a row failed to load) and `MATERIALIZE_WOULD_DROP` (a row would be lost).

`governance drift` is Hygiene Audit Pass 19 — read-only, advisory, always exit 0 on a scan. It reports `hygiene/unadopted-upgrade` (info), `hygiene/project-addition` (info), `hygiene/disabled-bundled-entry` (WARN) and `hygiene/non-project-execution-field` (info). Field **names** are printed, never field values, and an unmaterialized marked registry is reported rather than read.

**Example:**
```
adev governance materialize --registry gates --dry-run
```

**Implementation:** `lib/cli/governance.mjs`. **Called by:** `/adev:init`, `/adev:hygiene` (Audit Pass 19).

### `report`

**Purpose:** Append a lifecycle event to `.context-index/lifecycle-state/<slug>.jsonl`. Replaces the inline `reportValidator` / `reportStep` / `reportReviewer` / `reportPlanTask` / `reportIntervention` calls.

**Signature:** `report --type <validator|step|reviewer|plan-task|intervention|recovery|cost-checkpoint|review-round> --spec <path> [type-specific flags]`

**Example:**
```
adev report --type validator --spec <p> --step validate --validator check-2-spec-compliance --verdict PASS

adev report --type step --spec <p> --step review --status completed --verdict PASS --revision 3

adev report --type review-round --spec <p> --plan <p>.plan.md --task-id t1 \
  --stage code-quality --cycles 2 --findings 1
```

`--type step`'s `--revision <n>` (integer >= 1) tags the event with the spec revision it belongs to — omit it and `currentState().steps.review.byRevision` folds the event into bucket 1 regardless of which revision actually produced it (adev-plugin-656e). `--findings` is omitted for `--stage spec-compliance` — that review stage has no stable finding-id convention to count against. As with the other `report` types, omitting an event entirely means "not recorded", never "zero". `cost-checkpoint` remains documented above but is not yet an implemented `--type`; this is a pre-existing gap, tracked separately, and left untouched here.

**Implementation:** `lib/cli/report.mjs`. **Called by:** `/adev:plan`, `/adev:specify`, `/adev:review-specs`, `/adev:implement`, `/adev:validate`.

### `manifest`

**Purpose:** Lint `.context-index/manifest.yaml`'s raw text for structural defects silent YAML last-wins parsing hides — currently, duplicate top-level keys (e.g. two `build:` blocks, where the later one silently wins and the earlier is dead config with no signal).

**Signature:** `manifest lint [--json]`

**Example:**
```
adev manifest lint --json
```

**Implementation:** `lib/cli/manifest.mjs`. **Called by:** `/adev:hygiene` (Audit Pass 8, Governance Policy Health).

### `blockers`

**Purpose:** Write `<spec-stem>.blockers.md` — the canonical, machine-consumable sidecar for a BLOCK verdict — from a reviewer findings array. Refuses the write (exit 2, `BLOCKER_BODY_EMPTY`) rather than silently completing it when a finding's prose renders empty, e.g. because the finding text landed under the wrong key when the array was assembled.

**Signature:** `blockers write --spec <path> --findings <json|@path> [--revision <n>] [--json]`

**Example:**
```
adev blockers write --spec <p> --findings @findings.json --revision 3 --json
```

**Implementation:** `lib/cli/blockers.mjs` (wraps `lib/blockers-writer.mjs::writeBlockers`). **Called by:** `/adev:review-specs` Step 6b-bis.

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

**Implementation:** `lib/cli/execution-state.mjs`. **Called by:** `/adev:implement`; also invoked directly (`adev execution-state write --status standalone`) as the lifecycle gate's documented escape route for exploratory work.

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

Exit codes: `0` success (entry JSON on stdout), `1` argument error / `INVALID_PLAN_PATH` / `INVALID_SIDECAR_JSON`, `2` `ROUTING_SIDECAR_MISSING`, `3` `ROUTING_ENTRY_MISSING`, `4` `ROUTING_AGENT_INVALID`.

**Implementation:** `lib/cli/implement.mjs`. **Called by:** `/adev:implement`, `/adev:route`.

#### `implement batches`

**Purpose:** Resolve which of a plan's tasks are eligible to dispatch together as a batch (from `## Parallelization` sequential groups) versus solo, honoring per-run overrides.

**Signature:** `implement batches --plan <p> [--max-batch <n>] [--no-batch]`

Prints `{ batches, solo, advisories }` as JSON to stdout. `--no-batch` forces every task solo and is rejected with `CONFLICTING_BATCH_FLAGS` when combined with `--parallel`. `--max-batch <n>` overrides `implement.max_batch_size` for this run; an invalid value is rejected with `INVALID_MAX_BATCH_SIZE`.

**Example:**
```
adev implement batches --plan <p> --max-batch 4
```

Exit codes: `0` success, `1` argument error / `CONFLICTING_BATCH_FLAGS` / `INVALID_MAX_BATCH_SIZE` / `INVALID_PLAN_PATH`, `2` `ROUTING_SIDECAR_MISSING`.

**Implementation:** `lib/cli/implement.mjs`. **Called by:** `/adev:implement` only — `/adev:route` does not call `batches`.

#### `implement resolve-depth`

**Purpose:** Resolve the effective review depth (`full`|`quick`) for a single plan task, wrapping `lib/implement/review-depth.mjs::resolveImplementReviewDepth()` so `/adev:implement` doesn't inline the precedence chain and floor pass into skill prose.

**Signature:**
```
implement resolve-depth --spec <path> --plan <path> --task-id <id> [--tier full|quick] [--review-cycles <n>] [--base-sha <sha>] [--pass provisional|final] [--in-batch] [--had-critical-finding]
```

**Example:**
```
adev implement resolve-depth --spec <s> --plan <p> --task-id t3 --tier quick --review-cycles 2
```

Exit codes: `0` success — `resolveImplementReviewDepth()` result plus `review_cycles` printed as JSON on stdout; `1` argument error / `INVALID_REVIEW_CYCLES` / `INVALID_SPEC_PATH` / `INVALID_PLAN_PATH` / `INVALID_TIER`; `2` `MISSING_DIFF_RANGE` (final pass without `--base-sha`); `3` `ROUTING_SIDECAR_MISSING` / `ROUTING_ENTRY_MISSING`.

**Implementation:** `lib/cli/implement.mjs`. **Called by:** `/adev:implement` only.

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

### `coordination`

**Purpose:** Answer "is someone already doing this?" before work starts. Scans open PRs, remote branches, and `in_progress` issues held by another owner — the shared signals that local state cannot see.

**Signature:** `coordination scan [--json] [--owner <name>] [--limit <n>] [--branch-age-days <n>]`

Exits `0` whenever the scan completes, **including a fully degraded scan**; `1` only on a usage error. A finding is not a failure, and this runs at the top of every `/adev:work`. When `gh` is missing, unauthenticated, or the repo has no GitHub remote, that bucket reports `available: false` with a reason and renders as `? open PRs` — never `0`, because "could not look" and "nothing there" are different answers.

**Example:**
```
adev coordination scan
adev coordination scan --json --owner "$USER/local"
```

**Implementation:** `lib/cli/coordination.mjs`. **Called by:** `/adev:work` Step 1.

### `issues`

**Purpose:** The whole issue-board surface. `/adev:issues` is prose over these verbs — every board read and every board write the skill performs is one of the subcommands below, so anything the skill can do is scriptable, and nothing needs the backend binary.

**Signature:** `issues <subcommand> [args]` · `issues <subcommand> --help` for per-flag detail.

| Subcommand | Purpose |
|---|---|
| `board [--milestone <name>] [--json]` | Print the whole board as canonical markdown on **stdout**. Read-only — never writes a file. `--milestone` restricts the epics section; `--json` emits `{ version, epics, issues }` unrendered |
| `create <title> [--type <t>] [--priority 0-4] [--epic <id>] [--plan-ref <p>] [--spec-ref <p>] [--parent <id>] [--notes <text>] [--next-action <text>] [--id <id>] [--json]` | Create one board-granularity item in the **issue store**. Prints `Created <type> <id>: <title>`. `--type` defaults to `task`, `--priority` to `2`. **`--milestone` is refused here (exit 1)** — see `epic` |
| `epic <title> [--plan-ref <path>] [--milestone <name>] [--json]` | Create one epic in the **epic store**. Pass `--plan-ref` when the epic backs a plan — `/adev:implement` and `/adev:reconcile` look the epic up by `planRef`, and an epic minted without it is re-created on every run. Prints `Created epic <id>: <title>`. Not the same as `create --type epic` — see below |
| `update <id> [--status <s>] [--milestone <name>] [--title <text>] [--priority 0-4] [--notes <text>] [--next-action <text>]` | Edit one item, issue or epic, **resolved from the id alone** by lookup — callers never read an id prefix. `--milestone` is epics-only, `--priority` issues-only. `--next-action` sets the next-step hint; an empty string clears it, same as `--notes`. `--status closed` is refused (exit 1): close goes through `close` |
| `close <id> --reason <text>` | Close one item through the dependency/cascade guards. `--reason` is required and recorded on the item's notes |
| `dep <id> <depends-on-id>` | Record that `<id>` is blocked by `<depends-on-id>`. Both ids must exist; re-adding an existing edge is a no-op success |
| `list [--status <s>] [--epic <id>] [--milestone <name>] [--json]` | List issues as a table, priority ascending (0 first). `--milestone` selects the epics carrying that milestone and their child issues. Read-only |
| `ready [--json]` | List exactly the issues that are open **and** have every dependency closed, priority ascending. The unblocked filter lives in the verb, not in prose. A dependency id that resolves to nothing is treated as non-blocking and reported on stderr. Read-only, never refused |
| `milestone <create\|list\|ship\|defer> [args]` | Milestone CRUD over `.context-index/milestones.json` — see the sub-table below |
| `migrate` | Convert the board to a different backend |
| `claim <id> --owner <name> [--branch <b>] [--pr <ref>] [--json]` | Take ownership via an atomic check-and-set. Exit `2` = refused (held by a live owner, or closed); exit `1` = usage error or `CLAIM_UNSUPPORTED_BACKEND` |
| `release <id> --owner <name> [--force] [--json]` | Give up ownership. `branch`/`pr` are kept as the record of where the work went; `--force` releases another owner's claim |
| `stale [--json]` | Report claims past their TTL, plus `unexpirable` rows (an owner with no `claimed_at`, which can never expire on their own). Read-only |
| `board migrate [--dry-run]` | One-shot, resumable migration of `.beads/issues.jsonl` off `main`'s git history onto a dedicated `beads-board` orphan branch, checked out as a linked worktree at `.beads/` |

#### `issues milestone`

| Subcommand | Purpose |
|---|---|
| `milestone create <name> [--target <YYYY-MM-DD>] [--strategy <manual\|tag-only\|release-please>] [--check <type>]... [--confirm "<text>"]...` | Create a milestone and link a new epic to it. **Idempotent by name** — re-running updates in place and creates no second epic. `--strategy` defaults to `manual`; `--check` is repeatable (`all_issues_closed`, `gates_pass`); `--confirm` is a repeatable manual criterion |
| `milestone list` | Print every milestone as a Name / Status / Target Date / Epic / Progress table. Progress counts open vs. total issues on the linked epic; an epic id that no longer exists shows as `<id> (broken)` |
| `milestone ship <name> [--yes] [--gate-timeout <ms>]` | Evaluate the ship criteria and, if all pass, mark the milestone shipped, close its epic, and perform the release action its strategy names. `--gate-timeout` is a per-gate wall-clock budget (default `300000`) |
| `milestone defer <name> --reason "<text>"` | Mark a milestone deferred, record why, and defer its linked epic. A shipped milestone cannot be deferred (`ALREADY_SHIPPED`, exit 1) |

#### Exit codes

Uniform across every `issues` subcommand, so callers branch on the code and never on the message:

| Code | Meaning |
|---|---|
| `0` | Success. Read-only verbs (`board`, `list`, `ready`, `stale`, `milestone list`) exit 0 even when the result is empty — "nothing matched" is an answer, not a failure |
| `1` | Usage error or adapter failure. Includes an unknown id, `create --milestone`, `update --status closed`, `MILESTONE_NOT_FOUND`, `BROKEN_EPIC`, `UNKNOWN_STRATEGY`, `CLAIM_UNSUPPORTED_BACKEND` |
| `2` | **Refused by a guard, and nothing was written.** `close` with an open dependency or an unclosed child; `dep` that would close a direct or transitive cycle; `claim` on an issue held by a live owner or already closed; `milestone ship` when an auto-check failed, a quality gate failed or timed out, or a manual confirmation is unanswered |

Exit 2 always names what refused, on stderr: the blocking issue ids, the cycle, the live claim holder, or the pending ship criteria. Without `--yes`, every manual confirmation on `milestone ship` counts as unanswered, so the pending items are listed for you to put to the user; re-run with `--yes` once they have confirmed.

`--json` is available on `board`, `create`, `epic`, `list`, `ready`, `claim`, `release` and `stale`. It changes the stdout payload only — never the exit code, and never where a refusal is reported.

#### `issues board` prints; `status --render` writes (INV-6)

The two produce the same canonical markdown and are **not interchangeable**:

- `adev issues board` writes the board to **stdout** and touches no file. It is safe to run anywhere, at any time, including inside a read-only review.
- `adev status --render` is the only thing that persists that render to **`.context-index/tasks/tasks.md`**.

INV-6 is what keeps the file from drifting: `tasks.md` is a rendered consumer view with exactly one writer, so nothing infers board state from it and no verb writes it as a side effect of being read. Reaching for `issues board` when you meant to refresh the file leaves `tasks.md` stale; reaching for `status --render` when you only wanted to look writes a file the caller did not ask for.

#### `create --type epic` is not `epic`

They write to different stores. `adev issues epic` writes the **epic store**, and that store is the only thing `listEpics()` reads — so only an epic created there is visible to `adev issues board`, to `adev issues list --milestone`, and to `adev issues update --milestone`. `adev issues create --type epic` writes an ordinary issue that happens to carry `type: epic`; it will not appear in the epics section of the board and cannot carry a milestone. Milestones live on epics, which is why `create --milestone` is refused with exit 1 pointing at `issues epic`.

**Always create through this verb, never through the backend binary.** `br create` resolves `.beads/` from the current directory, and `git worktree add` materialises the git-tracked `issues.jsonl` into every linked worktree while the gitignored `beads.db` stays behind — so a raw `br` call from a worktree opens a JSONL with no database beside it and fails with `SYNC_CONFLICT`. `adev issues create` resolves the storage root through `resolveStorageRoot()` (the git common dir) and reaches the one real board from anywhere in the repo. Plan tasks are not issues — they live in the lifecycle log via `reportPlanTask` — so there is no `--plan-task` flag.

`adev issues epic list [--milestone <name>] [--json]` enumerates the epic store instead of creating a record — read-only, matching the naming of `board`/`list`/`ready`/`stale`. `list` is therefore reserved: `adev issues epic "<title>" --plan-ref <path>` and every other title keep working exactly as documented above, but a bare `adev issues epic list` no longer mints an epic literally titled "list".

Claims are **leases**, not locks: they expire after `tasks.claim_ttl_minutes` (default `240`, `0` disables expiry), and claiming an issue whose lease has expired takes it over and reports the displaced owner. Without expiry a crashed session would hold an issue forever, and an unreleasable gate is one people learn to bypass.

#### Issue IDs are merge-safe

New issues and epics get ids like `issue-7k3f9a` — a prefix plus six random base36 characters — on every backend.

They used to be sequential (`issue-589`). That is safe within one file and across worktrees, but not across git **branches**: two sessions branching from the same board both compute the same next number, both look correct locally, and the duplicate only appears at merge. That happened, producing two different `issue-589`s. Randomness removes the need to consult a shared counter, which is the one thing a branch cannot do.

Existing sequential ids are **never rewritten** — they are quoted in merged commits and specs. Both forms are valid and parse identically, forever.

One trade-off worth knowing: ids no longer imply creation order. Sort by the `created` field, not by id.

#### Backend capability matrix

Set with `tasks.backend` in `manifest.yaml`. Verified against `br` 0.2.22.

| Capability | `json` (default) | `beads` | `file` |
|---|---|---|---|
| create / list / get / update / close | ✅ | ✅ | 🔍 read-only |
| epics (create, list, update, walk) | ✅ | ✅ native `br` issues of type `epic` | 🔍 read-only |
| dependencies | ✅ | ✅ | 🔍 read-only |
| `claim` / `release` | ✅ atomic (CAS) | ✅ atomic, via `br update --claim` | ❌ `CLAIM_UNSUPPORTED_BACKEND` |
| refusal codes + CLI exit codes | ✅ | ✅ identical — callers never branch on backend | ❌ |
| lease TTL + `issues stale` | ✅ | ✅ | ❌ |
| **stale-lease takeover** | ✅ atomic | ⚠️ **not atomic** — two calls | ❌ |
| `branch` / `pr` / `claimed_at` / `spec_ref` | ✅ native columns | ✅ br `agent_context` (JSON, under the `adev` key) | 🔍 |
| `affected_modules` (`issues set-modules`) | ✅ native column | ✅ br `agent_context`, same as above | 🔍 |
| adev ids (`issue-N` / `epic-N`) | ✅ native | ✅ br `external_ref` — br enforces uniqueness | 🔍 |
| claim holder | ✅ native | ✅ br `assignee`, and nowhere else | ❌ |
| dependency edges on `list()` | ✅ | ⚠️ always `[]` — `br list` returns counts, not edges | 🔍 |
| id minting under concurrency | ✅ atomic (CAS) | ⚠️ not atomic, but **fails loudly** — see below | 🔍 |
| shared across git worktrees | ✅ | ✅ | ✅ |

**On beads, beads is the whole board.** There is no `.beads-map.json` sidecar and no local epic store: the adev id is br's `external_ref`, the claim holder is br's `assignee`, epics are `br` issues of type `epic`, and everything else adev tracks lives in br's `agent_context` under an `adev` key. `br list` shows you the real board, and a human running `br update --claim` is seen by adev immediately. A project still carrying the old sidecar is migrated into beads automatically on first use, and the retired files are renamed rather than deleted.

`agent_context` is br's own field, so adev preserves any keys it did not write — but if you hand-edit it, you are editing adev's metadata store.

**The one gap that can bite you:** on beads, taking over an *expired* lease is not atomic. `br update --claim` refuses ANY held issue and `--assignee` has no compare-and-set precondition, so the adapter must clear the assignee and then claim — two calls. Two agents that observe the same expired lease can both proceed. Contended *live* claims are still refused atomically by br, so this only affects abandoned work, and the window is bounded by TTL expiry rather than by contention. If you need an atomic takeover, use `tasks.backend: json`.

The claim itself and its lease stamp *are* now atomic: `--claim` and `--agent-context` travel in one call, and br rolls the context write back when it refuses the claim.

**Minting `issue-N` is also not atomic** — br has no sequence primitive, so the next number comes from scanning existing `external_ref` values. Two simultaneous creators compute the same number, but br enforces uniqueness on `external_ref` and rejects the loser with a hard error. You get a failed create, never two issues sharing an id.

**Requirements:** beads needs `br >= 0.2.19` on PATH. The floor is a *safety* boundary, not just a compatibility one: 0.2.19 shipped the engine fix for deterministic database corruption caused by merge operations, and 0.2.0–0.2.18 are API-compatible enough to pass every functional check while silently exposed to it. Releases before 0.2.0 additionally take a workspace *directory* for `--db` and have no atomic `update --claim`. The adapter refuses anything below the floor with `BEADS_VERSION_UNSUPPORTED` rather than failing obscurely at the first call — note that a *missing* `br` degrades to the `json` backend, but a *too-old* `br` is a hard throw with no fallback. The `file` backend has been read-only since its deprecation — run `adev migrate` to move to `json`.

Live coverage for the beads path is `tests/evals/beads-live/`, an opt-in bucket (`npm run test:evals`) because it drives a real `br` binary. It fails loudly when `br` is missing rather than skipping, so a green default run never implies a verified beads backend.

**Example:**
```
# Look at the board (stdout only — tasks.md is untouched)
adev issues board
adev issues board --milestone v1.0 --json

# Open work: an epic on a milestone, then issues under it
adev issues epic "Graduated review depth" --milestone v1.0
adev issues create "Score reviewer depth" --type feature --priority 1 --epic epic-7k3f9a \
  --spec-ref .context-index/specs/features/implementation/x.spec.md
adev issues dep issue-9m2q1c issue-7k3f9a          # exit 2 if this closes a cycle

# Work it
adev issues ready --json
adev issues claim issue-42 --owner "$USER/local" --branch "$(git branch --show-current)"
adev issues update issue-42 --status in_progress
adev issues close issue-42 --reason "Landed in #293"   # exit 2 if a guard refuses

# Ship
adev issues milestone create v1.0 --target 2026-09-01 --strategy release-please \
  --check all_issues_closed --check gates_pass --confirm "Changelog reviewed"
adev issues milestone list
adev issues milestone ship v1.0 --yes                  # exit 2 if criteria fail
adev issues list --milestone v1.0 --status open
adev issues stale --json
adev issues set-modules issue-42 cli,hooks
```

**`set-modules <id> <slug>[,<slug>...] [--json]`:** sets `WorkItem.affected_modules` — the module-safety tag `adev issues next` (bug-selection-and-eligibility.spec.md) consults for its blast-radius and reserved-tag safety checks. This is v1's only producer for the field: a direct, scriptable verb, deliberately unpolished (no validation against `manifest.modules[]`, no GitHub-label sync — both remain charter Deferred Capabilities). Works identically on the `json` and `beads` backends. An issue with no `affected_modules` set fails closed and is never autonomously selected.

**`next [--type bug] [--max-priority P0-P4] [--json]`:** read-only bug-selection verb for the autonomous bugfix loop. Returns the single highest-priority eligible `type: "bug"` WorkItem within the resolved priority bound, or `{"bug": null}` if none qualify — never a partial or ambiguous result, and never a write (no claim, no close, no AttemptRecord mutation). `--type` currently only accepts `"bug"` (the default); any other value exits non-zero with `UNSUPPORTED_TYPE`. `--max-priority` defaults to `P3` (covering `P2`/`P3`) and accepts the full `P0`-`P4` range — a malformed value (not `P0`-`P4`) still exits non-zero with `INVALID_PRIORITY_BOUND`. The module-exclusion floor below (reserved safety tags and any manifest-configured `tasks.bugfix_loop.excluded_modules`) is the actual safety boundary, not the priority band — it is unconditional and applies regardless of `--max-priority`. When `--max-priority P0` or `P1` is used, `adev issues next` additionally prints the effective excluded-module set to stderr before returning, so the operator can see what remains protected at the widened bound. Eligibility also requires: `status` other than `closed`/`deferred`; a single `affected_modules` entry that is a real `manifest.modules[].slug` and not a reserved safety tag (`review-gate`, `convergence-detector`, `retry-loop`, `bugfix-loop`) or a manifest-configured `tasks.bugfix_loop.excluded_modules` entry; no live (non-expired) claim; no open blocking dependencies; and no `AttemptRecord.last_verdict` of `NO_PROGRESS`, `REGRESSED`, or `BUDGET_EXHAUSTED`. Ties within a priority band resolve FIFO by oldest `created`. Exits non-zero with `ISSUE_BOARD_NOT_CONFIGURED` if `tasks.backend` is unset.

Unlike `claim`/`release`, `next` is not yet called from any skill's preflight — no skill invokes `adev issues next` today; it is a standalone verb for the (separately specified) autonomous bugfix loop to call once that loop exists.

#### `board migrate` — beads board git topology

**Purpose:** on the `beads` backend, moves `.beads/issues.jsonl` off `main`'s own git history onto a dedicated orphan branch (`beads-board`), checked out as a **linked git worktree** at `.beads/`. This lets multiple worktrees and clones share one board without a PR cycle — `.beads/` becomes a live checkout of `beads-board`, not a copy tracked in `main`'s tree.

**Configuration:** none beyond the existing `tasks.backend: beads` in `manifest.yaml` — no new manifest keys were introduced. Everything below is either automatic or a single explicit command.

**Automatic provisioning.** `adev install` and `adev upgrade` both call `maybeProvisionBoardWorktree()` after the managed-`.gitignore` step, gated on `manifest.tasks.backend === "beads"`:
- `.beads/` doesn't exist yet → provisioned as a linked worktree: checks out the existing `beads-board` branch if one already exists (local or `origin`), otherwise creates it fresh as an orphan branch.
- `.beads/` is already a registered worktree → silent no-op (idempotent on every upgrade).
- `.beads/` exists as a non-empty plain directory (e.g. a repo that predates this feature and still tracks `.beads/` on `main`) → provisioning is skipped silently, deferring to `adev issues board migrate` below. Install/upgrade never fails or blocks on this.

**One-time migration for an existing repo:**
```
adev issues board migrate --dry-run    # preview
adev issues board migrate              # do it
```
Sequence: snapshot `.beads/issues.jsonl` → create `beads-board` as an orphan branch inside a disposable temp worktree → commit and push it to `origin` → only then remove `.beads/` from `main`'s tracked tree (`git rm -r --cached .beads`) → add the managed `.gitignore` entries → commit on `main` → re-provision `.beads/` as the real linked worktree. `main`'s tree is left untouched until after the `beads-board` push has succeeded.

**Resumable.** A checkpoint at `.context-index/tasks/.board-migrate-state.json` is written the instant the push lands, before any of `main`'s tree is touched. If the process is interrupted after that point, re-running the exact same command resumes from the checkpoint (recover-and-re-provision only) instead of re-doing the snapshot/push/cleanup.

**`.gitignore`:** two entries are added automatically via the existing managed-block mechanism (`ensureManagedBlock()` / `MANAGED_GITIGNORE_PATHS`) — no manual edit needed:
```
.beads/
.context-index/tasks/.board-migrate-state.json
```

**Error/status codes:**

| Code | Meaning |
|---|---|
| `BOARD_ALREADY_EXISTS` | `.beads/` is a non-empty plain directory, not a registered worktree — run `board migrate` instead of a raw `git worktree add` |
| `BOARD_ALREADY_MIGRATED` | `.beads/` is already a linked worktree against `beads-board` — exit 0, nothing to do |
| `BOARD_NOTHING_TO_MIGRATE` | `.beads/issues.jsonl` isn't tracked on `main` — nothing to migrate |
| `BOARD_MIGRATE_PUSH_FAILED` | the `beads-board` push failed before `main`'s tree was touched — safe to retry from scratch |
| `BOARD_MIGRATE_PARTIAL_FAILURE` | recovery/re-provisioning failed after `main`'s tree was already cleaned up — resumable via the checkpoint, re-run the same command |
| `BOARD_ADD_FAILED` | the underlying `git worktree add` call failed |

**Corrupt-leftover recovery:** both the resumed-migration path and every fresh provisioning attempt run a recovery pass first — a plain filesystem delete of any existing `.beads/` (not `git worktree remove`, since an interrupted prior `git worktree add` may not have registered cleanly enough for git to recognize it) followed by `git worktree prune`.

**Implementation:** `lib/cli/issues-board.mjs` (shared with the read-only `board` print verb above — dispatches on `argv[0] === "migrate"`), `lib/issues/board-worktree.mjs`, `lib/issues/board-migrate-state.mjs`; auto-provisioning hook in `cli/index.mjs` (`maybeProvisionBoardWorktree`). **Spec:** `.context-index/specs/features/task-management/beads-board-git-topology.spec.md`.

**Implementation:** `lib/cli/issues.mjs` dispatches to `issues-board.mjs` (`board`, `board migrate`), `issues-create.mjs` (`create`), `issues-epic.mjs` (`epic`), `issues-mutate.mjs` (`update`, `close`, `dep`), `issues-list.mjs` (`list`, `ready`), `issues-milestone.mjs` (`milestone …`), `issues-migrate.mjs`, `issues-claim.mjs` (`claim`, `release`), `issues-stale.mjs`, `issues-set-modules.mjs`, and `issues-next.mjs`. **Called by:** `/adev:issues` (every step), `/adev:plan` and `/adev:reconcile` (epic creation), and in preflight by `/adev:implement` and `/adev:debug`; `claim`/`release` also run in preflight by `/adev:implement` and `/adev:debug`; `board migrate` is run manually by the operator.

### `bugfix-loop`

**Purpose:** Persist and drive one `BugfixLoopRun`'s state across `/adev:bugfix-loop`'s self-re-invoking turns — resolving the run, checking branch freshness, guarding status/budget before each bug selection, isolating per-bug worktrees, recording attempts, automating commit/PR on `FIXED` verdicts, and finishing with the terminal token (plus a running summary table) the skill prints.

**Signature:** `bugfix-loop <create|guard|record-attempt|complete-turn|finish|latest|check-freshness|commit-pr> [flags]`

**Example:**
```
adev bugfix-loop create --max-bugs 20 --max-turns 20 --starting-branch main --json
adev bugfix-loop check-freshness --json
adev bugfix-loop guard --run-id <id> --json
adev bugfix-loop record-attempt --run-id <id> --issue <id> --verdict FIXED --files-touched 3 --tests-added 1 --priority-bound P3
adev bugfix-loop commit-pr --run-id <id> --issue <id> --title "Fix the bug" --pr-base main --json
adev bugfix-loop finish --run-id <id> --status complete --json
```

**`create`** accepts `--starting-branch <ref>`, persisted as the run's worktree base-ref fallback for the first bug of a `--worktree-per-bug` run. **`guard`**'s JSON result always includes `worktree_base_ref` (the previous bug's completed branch this run, or `starting_branch`) alongside `proceed`/`reason`/`status`/`budget_reason`.

**`check-freshness [--json]`:** reports how far HEAD is behind/ahead of the remote default branch. Stdout: `{status: "ok"|"warn"|"blocked"|"degraded", ahead?, behind?, reason?}`. Reads `tasks.bugfix_loop.freshness.{soft_threshold,hard_threshold}` from the manifest (defaults: soft=50, hard=unset/warn-only). Always exits 0 — a hard-threshold breach is reported via `status: "blocked"` in the JSON, not a non-zero exit; the calling skill halts on that value itself.

**`record-attempt`** accepts `--verdict <FIXED|PARKED|UNREPRODUCIBLE>` (optional — presence gates whether a summary row is appended), `--files-touched <n>`, `--tests-added <n>`, and `--priority-bound <P0-P4>`. When `--verdict` is given, it appends a row to the run's running summary table (issue id, verdict, files touched, tests added, priority bound, turn) and prints the table; when omitted, no summary row is appended. **`finish`**'s JSON result includes a `summary_table` field (the full markdown table) so the calling skill can reprint it before the terminal token without a second read.

**`commit-pr --run-id <id> --issue <id> [--title <t>] [--notes <n>] [--spec-path <p>] [--pr-base <ref>] [--json]`:** commits the isolated diff, pushes `adev/bugfix-<issue-id>`, and opens a PR against `--pr-base`. On success, updates the run's `last_worktree_branch` so the next bug's worktree stacks on this one. `--title`/`--notes` are untrusted WorkItem content — unsafe content (shell metacharacters, over-length, etc.) is refused, never sanitized, and falls back to a generic templated message keyed only by the issue id. Degrades to `{skipped: true, reason}` on any commit/push/`gh` failure — always exits 0, never blocks the loop.

**Implementation:** `lib/cli/bugfix-loop.mjs` (+ `lib/bugfix-loop-run.mjs`, `lib/bugfix-loop-freshness.mjs`, `lib/bugfix-loop-commit.mjs`). **Called by:** `/adev:bugfix-loop`, every turn.

### `tracker-sync`

**Purpose:** The two-way bridge between the local issue board and an external GitHub tracker, used only when `/adev:bugfix-loop --github-sync` is passed. `inbound` pulls candidates once per turn before selection; `outbound` posts the outcome comment for a completed attempt.

**Signature:** `tracker-sync <inbound|outbound> [flags]`

**Example:**
```
adev tracker-sync inbound --run-id <id> --json
adev tracker-sync outbound --local-issue-id <id> --verdict FIXED --completed-at <iso-ts> --json
```

**Implementation:** `lib/cli/tracker-sync.mjs`. **Called by:** `/adev:bugfix-loop --github-sync`.

### `retro`

**Purpose:** Gather session activity for a retrospective analysis window (feeds `/adev:retro`).

**Signature:** `retro session-activity --since <YYYY-MM-DD> --until <YYYY-MM-DD> [--project-root <dir>] [--format json|text]`

**Example:**
```
adev retro session-activity --since 2026-05-01 --until 2026-05-31
```

**Implementation:** `lib/cli/retro.mjs`. **Called by:** `/adev:retro`.

### `heuristics`

**Purpose:** Read and write project heuristics in the memory store. `retrieve` pulls module-scoped heuristics for context-packet injection — passing `--signature` turns it into an exact-match recurrence lookup, where a heuristic carrying that failure signature outranks every confidence-ordered candidate and is exempt from the `low`-confidence floor that otherwise filters it out; `signature` derives the cross-scope failure-recurrence key; `write` records a heuristic directly; `migrate-keys` performs the one-time, idempotent rekey of the store.

**Signature:** `heuristics retrieve --module <slug> [--signature <sig>] [--injection-limit <n>] […]` · `heuristics signature --origin <o> (--text <t> | --blocker-id <id>) [--digest-only]` · `heuristics signature --origin validate --check-id <id> [--check-id <id> …]` · `heuristics write --id <id> --scope <s> --title <t> --pattern <p> [--signature <sig>] […]` · `heuristics migrate-keys [--dry-run]`

**Example:**
```
adev heuristics retrieve --module auth --tier summary --format text
adev heuristics retrieve --module auth --signature validate-<digest> --tier summary --format text
```

A `--signature` retrieval is by definition error-time, so it caps injection with `heuristics.error_injection_limit` (default **3**) rather than the entry-time default of 8. An explicit `--injection-limit` always wins over both.

**Implementation:** `lib/cli/heuristics.mjs`. **Called by:** `/adev:validate`, `/adev:implement`, `/adev:plan`, `/adev:brainstorm`, `/adev:specify`, `/adev:review-specs`, `/adev:debug`, `/adev:recover`, `/adev:prototype`. Both error-time (`--signature`) calls are made from skill prose: `/adev:validate` on FAIL and `/adev:review-specs` on BLOCK.

### `skill-ext`

**Purpose:** Read skill extension content from `.context-index/skill-extensions/` (extension-pack layers plus a project-level layer) and write the concatenated result to stdout, or the literal sentinel `__NONE__` when there is none. The single most universally-invoked verb in the system — every SKILL.md is constitutionally required (CLAUDE.md) to open with a Load Skill Extensions block calling it, enforced by `tests/skills-extension-coverage.test.mjs`.

**Signature:** `skill-ext load --skill <name>`

**Example:**
```
adev skill-ext load --skill review-specs
```

**Implementation:** `lib/cli/skill-ext.mjs`. **Called by:** every skill in `skills/` (30 of 30).

### `domain`

**Purpose:** Resolve the active domain for a module and load domain-aware config (gates, reviewers, test-config, verification), merging project governance on top.

**Signature:** `domain <resolve|load-gates|load-reviewers|load-test-config|load-verification> --module <slug> [--charter <path>] [--governance <path>]`

Resolution precedence: `charter.domain > module.domain > project.domain > software`.

**Example:**
```
adev domain load-gates --module auth
```

**Implementation:** `lib/cli/domain.mjs`. **Called by:** `/adev:validate`, `/adev:review-specs`, `/adev:implement`, `/adev:specify`, `/adev:brainstorm`, `/adev:write-test`.

### `domain-picker`

**Purpose:** Run the init-time domain-extension picker against a project root, standalone. Prompts interactively and emits the picker result JSON to stdout. Primarily for debugging — the picker is normally invoked during `adev install` / `adev upgrade`, not called directly.

**Signature:** `domain-picker run [--project-root <p>] [--plugin-root <p>]`

**Example:**
```
adev domain-picker run --project-root .
```

**Implementation:** `lib/cli/domain-extension-picker.mjs`. **Called by:** `adev install`, `adev upgrade`.

### `cost`

**Purpose:** Aggregate per-spec / per-step token and USD totals from `.context-index/.session-tracking.jsonl`.

**Signature:** `cost summary [--spec <path> | --epic <id>] [--format text|json] [--include-checkpoints] [--since <iso8601>] [--quiet]`

`--spec` and `--epic` are mutually exclusive. `ADEV_BUILD_TICKER=1` routes output to stderr; `build.cost_warn_usd` in the manifest emits a non-blocking warning past a threshold.

**Example:**
```
adev cost summary --spec .context-index/specs/features/auth/login.spec.md --format json
```

**Implementation:** `lib/cli/cost.mjs`. **Called by:** `/adev:build`.

### `worktree`

**Purpose:** Manage adev-managed git worktrees used for parallel isolated execution. Worktrees are anchored to the main repo root (via `git rev-parse --git-common-dir`) so they never nest, and live under `.adev/worktrees/` (git-ignored).

**Signature:** `worktree <add|list|merge|remove|guard> [flags]` — e.g. `worktree add --slug <slug> [--base <ref>]`, `worktree merge --slug <slug>`, `worktree remove --slug <slug> [--delete-branch] [--force]`, `worktree guard` (reports whether the current cwd is nested inside a worktree).

**Example:**
```
adev worktree add --slug login-group-a
adev worktree remove --slug login-group-a --force
```

**Implementation:** `lib/cli/worktree.mjs`. **Called by:** `/adev:implement --parallel`.

### `parallel`

**Purpose:** Decision helpers for the `/adev:implement --parallel` orchestration — group parsing and deterministic merge order, orchestrator-pollution assertion, per-group completeness verification, the concurrency cap, and re-run collision detection. The skill orchestrates; these verbs compute the checks.

**Signature:** `parallel <groups|baseline|assert-clean|verify|max-parallel|collision> [flags]` — e.g. `parallel groups --plan <path>`, `parallel baseline`, `parallel assert-clean --base-head <sha>`, `parallel verify --branch <b> --base <sha> --tasks <ids> --done <ids>`, `parallel collision --slug <slug>`.

**Example:**
```
adev parallel groups --plan .context-index/specs/features/auth/login.plan.md
```

**Implementation:** `lib/cli/parallel.mjs`. **Called by:** `/adev:implement --parallel`.

### `test-policy`

**Purpose:** The Test Depth Policy CLI surface — resolves the effective test depth for a plan
task (chain → escalation → floor), records the assignment as a `test_depth_assigned`
lifecycle event, and lets operators inspect or edit the manifest-level `test_policy` and
`risk-policies.yaml` `test_depth` configuration. See
[Test Strategies — Test depth policy](test-strategies.md#test-depth-policy--a-second-independent-axis)
and [Configuration Reference](configuration.md#test_policy-test-depth--granularity).

**Signature:**
- `test-policy resolve --plan <path> --task-id <id>` — sole depth-resolution entry point and
  the **sole writer** of `test_depth_assigned`. Prints the assignment as JSON.
- `test-policy assert-assigned --plan <path> --task-id <id>` — presence check only: fails with
  `MISSING_DEPTH_ASSIGNMENT` if no assignment event exists for the task. Does **not** verify
  the authored suite against the assigned depth.
- `test-policy show [--module <slug>]` — prints the effective policy with the layer that
  supplied each field, and the effective sensitive-path set with built-in vs. configured
  entries distinguished.
- `test-policy set --module <slug> --test_depth <depth>` / `test-policy set --granularity
  <granularity>` — validated, workspace-guarded, atomic write (temp-file + `rename()`,
  re-parsed to confirm round-trip before commit).
- `test-policy explain --plan <path> --task-id <id>` — reports, from the most recent
  assignment event: the winning chain layer, whether escalation fired (or why it was
  skipped), the contributing routing scores, and the floor as **two orthogonal facets
  rendered together**: `floor_applied` (plus the holding `floor_legs`) — whether any evaluated
  floor leg held — and `floor_inputs` (`"available"` / `"unavailable"`) — whether the
  sensitive-path leg had a target-path input to evaluate at all. The two facets are not
  exclusive: a `risk_level: high` task with no parseable `**Files:**` block is both *floored*
  and *path-leg-not-evaluated*. Read the floor as advisory (see
  [Test Strategies](test-strategies.md#test-depth-policy--a-second-independent-axis)) — the
  shipped JSON itself (`{ depth, source, escalated, escalation_skipped, floor_applied,
  floor_legs, floor_inputs }`) carries no separate "advisory" field or label string, only
  those facets. `explain` never echoes `targetPaths` or any task file path — its output has no
  such field.

**Example:**
```
adev test-policy resolve --plan .context-index/specs/features/auth/login.plan.md --task-id t3
adev test-policy explain --plan .context-index/specs/features/auth/login.plan.md --task-id t3
```

**Implementation:** `lib/cli/test-policy.mjs`. **Called by:** `/adev:implement` (`resolve`,
`assert-assigned`), operators directly (`show`, `set`, `explain`).

### `test-helpers`

**Purpose:** Emits the project's shared test infrastructure — helper modules with their
exported symbols, fixture and setup files, fixture-data directories, and curated golden TEST
samples — as a deterministic block that `/adev:write-test` and `/adev:implement` inject into
every subagent prompt. Fresh subagents start contextless, so without this the same setup gets
re-derived per task. Detection is language-agnostic: `conftest.py` and pytest fixtures in
Python, `spec_helper.rb` in Ruby, `tests/helpers.mjs` in Node, and so on. Projects whose
helpers live somewhere the built-in registry does not name declare a top-level `test_helpers`
block in `manifest.yaml` (`paths` / `exclude` / `detect`).

**Signature:**
- `test-helpers inventory [--format json|text] [--budget <n>]` — prints the inventory. `json`
  (default) is the full structured result; `text` is the injectable block, capped at
  `--budget` lines (default 60) with a `+N more` footer when truncated. Output is byte-stable
  across runs on an unchanged tree — the walk is bounded by counts, never elapsed time, so an
  injected block does not churn between runs.
- `test-helpers check --file <path> [--file <path> …] [--format json|text]` — reports symbols
  defined in each file whose (normalized) names already exist in a shared helper. `--file` is
  repeatable and the inventory is built once per invocation.

**Findings are advisory: `check` exits 0 whether or not it finds anything.** This verb
introduces no gate. Exact-name matching is a false-positive magnet (`cleanup`, `setup`,
`run`), and a duplicated helper is a maintenance cost rather than a correctness defect, so it
is surfaced to the author rather than enforced against them. Exit 1 is reserved for argument
errors, a `--file` outside the project root, and a missing file.

**Example:**
```
adev test-helpers inventory --format text
adev test-helpers check --file tests/auth/login.test.mjs --file tests/auth/session.test.mjs
```

**Implementation:** `lib/cli/test-helpers.mjs` (logic in
`lib/test-strategies/helper-inventory.mjs`). **Called by:** `/adev:write-test` (RED-phase
Step 3a inventory, post-RED duplication check), `/adev:implement` (context-packet assembly).

### `test-debt`

**Purpose:** Audit Pass 23 of `/adev:hygiene`. Scans the test suite for five categories of
accreted debt: `APPEND_CHAIN`, `REV_NUMBERED`, `PLAN_TASK_STRUCTURED`,
`DEAD_TEST_REFERENCE`, `PROSE_ASSERTION`. Detection and reporting only — it never edits,
deletes, or rewrites a test file, and exits 0 for any successful scan regardless of
finding count.

**Signature:** `test-debt scan [--root <dir>] [--detector <CODE>] [--json]`

- `--root <dir>` narrows the scan subtree; it does **not** establish the project root
  (paths outside it are refused with `PATH_OUTSIDE_ROOT`).
- `--detector <CODE>` restricts to one detector; an unknown code exits 1 with
  `UNKNOWN_DETECTOR`.
- `--json` prints the result object (`verdict`, `findings`, `summary`, `headerNotes`,
  `scannedFileCount`) as a single document.

**Findings are heuristic candidates for human review, not defects.** Precision varies by
detector; see the precision table in
`.context-index/specs/features/maintenance/hygiene-test-debt.spec.md` before acting on
results in bulk.

**Configuration:** `manifest.yaml` `hygiene.test_debt.*` (all keys optional — see
[Configuration](configuration.md#hygiene)). `hygiene.coverage_exclude` is deliberately not
applied.

**Example:**
```bash
adev test-debt scan --json
adev test-debt scan --detector APPEND_CHAIN
```

**Implementation:** `lib/cli/test-debt.mjs` (engine: `lib/hygiene/test-debt.mjs`).
**Called by:** `/adev:hygiene` Audit Pass 23.

### `eval`

**Purpose:** Score a verdict set against a rubric — the CLI surface over the Layer 3 scoring
engine (`lib/evals/rubric.mjs`'s `loadRubric`, `lib/evals/score.mjs`'s `scoreRubric`). `run()`
dispatches on the first argument; `score` is the only subcommand today, and the verb is named
`eval` rather than `eval-score` so a future Run-cost record capability can add `eval cost`
beside it without a second registry entry.

**Signature:** `eval score --rubric <path|default> --input <path> [--json]`

- `--rubric <path|default>` — either a rubric YAML file, containment-checked against the
  project root, **or** the literal keyword `default`, which resolves the plugin's shipped
  `skills/eval/default-rubric.yaml`. Only the exact literal `default` is the keyword;
  `Default`, `./default`, and `default.yaml` are ordinary paths and take the containment branch.
- `--input <path>` — a JSON verdict-set file (an array of `{id, value, evidence}`),
  containment-checked against the project root.
- `--json` — print one JSON object carrying the verdict table, both halves, and the total,
  instead of the default table.

Every `--rubric` *path* value and `--input` are contained against the project root — resolved,
then real-pathed to catch a symlink escape, then re-checked — **before either file is opened**, so a
traversal or symlink escape on either flag is refused by one uniform code
(`UNSAFE_SCORE_PATH`, naming the offending path exactly as supplied) without reading any
content. This matches the `UNSAFE_RUBRIC_PATH` precedent `loadRubric` already sets; `loadRubric`
re-contains `--rubric` again on its own, and that duplicate check is deliberate. A contained but
missing or unreadable `--input` exits non-zero with `SCORE_INPUT_NOT_FOUND`, naming the resolved
path. An unparsable JSON `--input` exits non-zero with `SCORE_INPUT_PARSE_ERROR`. A verdict set
the engine rejects (an unknown id, a missing id, an illegal verdict, empty evidence, a
duplicate, or a malformed rubric/threshold) surfaces that engine error code and exits non-zero.
Nothing is ever printed — table, aggregate, or JSON — unless every step above succeeded.

**The `default` keyword is not a path, and so is not contained against the project root.** It
names a fixed location inside the plugin, and is bounded by the **plugin root** instead — derived
from the plugin's own module location on disk (`getPluginRoot()` in `lib/profiles/index.mjs`),
never from an environment variable such as `CLAUDE_PLUGIN_ROOT` and never threaded in from the
caller, because the whole safety argument for skipping project-root containment is that the
location it resolves is unforgeable. The same resolve/real-path/re-check sequence is then applied
against the plugin root, so the keyword is bounded exactly as a path value is, only against a
different root. `--input` is a path in every case and is contained against the project root
unconditionally, keyword or not. When the shipped rubric is absent or unreadable, the verb exits
non-zero with `SCORE_DEFAULT_RUBRIC_MISSING`, naming the resolved plugin path; a shipped rubric
that is readable but malformed keeps its own parse/schema error code rather than being reported
as missing.

**The default table omits evidence.** Evidence strings are free text and would make every run's
paste-into-a-conversation width unbounded, which defeats the point of a compact default; the
table reports `id`, `kind`, and `verdict` only, with column widths computed from the data, plus
one aggregate line (`deterministic: <points>/<max>` or `deterministic: <STATUS>`, likewise
`judged`, then `total: <points>/<max>` or `total: n/a`). The verdict table and the aggregate
always appear together, never the aggregate alone; a half carrying a status renders by that
status's name, never as `0`. Evidence is available only via `--json`.

**Example:**
```
adev eval score --rubric default --input .adev/eval/latest-verdicts.json
adev eval score --rubric default --input .adev/eval/latest-verdicts.json --json
```

**Implementation:** `lib/cli/eval.mjs` (engine: `lib/evals/rubric.mjs`, `lib/evals/score.mjs`).
**Called by:** `/adev:eval` Layer 3, Step 3 — aggregates the deterministic and judged halves into
the half-level trend score once Steps 1 and 2 produce every verdict it needs.

### `worktree`

**Purpose:** Manage adev-managed git worktrees used for parallel isolated execution. Worktrees are anchored to the main repo root (via `git rev-parse --git-common-dir`) so they never nest, and live under `.adev/worktrees/` (git-ignored).

**Signature:** `worktree <add|list|merge|remove|guard> [flags]` — e.g. `worktree add --slug <slug> [--base <ref>]`, `worktree merge --slug <slug>`, `worktree remove --slug <slug> [--delete-branch] [--force]`, `worktree guard` (reports whether the current cwd is nested inside a worktree).

**Example:**
```
adev worktree add --slug login-group-a
adev worktree remove --slug login-group-a --force
```

**Implementation:** `lib/cli/worktree.mjs`. **Called by:** `/adev:implement --parallel`.

### `parallel`

**Purpose:** Decision helpers for the `/adev:implement --parallel` orchestration — group parsing and deterministic merge order, orchestrator-pollution assertion, per-group completeness verification, the concurrency cap, and re-run collision detection. The skill orchestrates; these verbs compute the checks.

**Signature:** `parallel <groups|baseline|assert-clean|verify|max-parallel|collision> [flags]` — e.g. `parallel groups --plan <path>`, `parallel baseline`, `parallel assert-clean --base-head <sha>`, `parallel verify --branch <b> --base <sha> --tasks <ids> --done <ids>`, `parallel collision --slug <slug>`.

**Example:**
```
adev parallel groups --plan .context-index/specs/features/auth/login.plan.md
```

**Implementation:** `lib/cli/parallel.mjs`. **Called by:** `/adev:implement --parallel`.

---

## Keeping this in sync

Verbs are registered in the dispatch table in `cli/index.mjs`. When you add a verb (`lib/cli/<verb>.mjs`), add a row here and to the summary table. The authoritative per-flag detail always lives in `adev <verb> --help`; this page is the discovery surface.
