# Live Spec: One-Shot Migration Tool

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->

---
charter: agent-reliable-state-artifacts
status: validated
risk_level: high
milestone: 0.26.0
revision: 3
charter-revision: 3
created: 2026-05-11
updated: 2026-05-12
source-manifest:
  sha: "ff7d26d"
  files:
    - cli/index.mjs
    - lib/migrate-state-artifacts.mjs
    - tests/cli/migrate.test.mjs
    - tests/lib/migrate-state-artifacts.collision.test.mjs
    - tests/lib/migrate-state-artifacts.constitution.test.mjs
    - tests/lib/migrate-state-artifacts.containment.test.mjs
    - tests/lib/migrate-state-artifacts.idempotency.test.mjs
    - tests/lib/migrate-state-artifacts.redaction.test.mjs
    - tests/lib/migrate-state-artifacts.test.mjs
  computed-at: "2026-05-12T03:09:20.310Z"
drift_detected: true
drift_source: tests/lib/migrate-state-artifacts.test.mjs
drift_at: 2026-05-13T19:00:40.403Z
---

## Behavioral Contract

This spec defines a one-shot, semantically-idempotent migration that converts a project's pre-charter state artifacts to their charter-era shapes in a single CLI invocation. The implementation is a new library module `lib/migrate-state-artifacts.mjs` plus a new top-level CLI subcommand `adev migrate` wired into `cli/index.mjs`. The migration converts four artifacts: `.context-index/tasks/tasks.md` → `.context-index/tasks/tasks.json` (consumed by `lib/issues/json-adapter.mjs` per the sibling `json-issue-board-adapter` spec), `.context-index/build-state/*.json` → `.context-index/lifecycle-state/*.jsonl` (consumed by `lib/lifecycle-state.mjs` per the sibling `lifecycle-event-log` spec), `.context-index/.execution-state.md` → `.context-index/.execution-state.json` (consumed by the rewritten `lib/execution-state.mjs` per the sibling `execution-state-migration` spec), and `.context-index/milestones.yaml` → `.context-index/milestones.json` (consumed by the rewritten `lib/milestones.mjs` per the sibling `milestones-migration` spec). The build-state directory is renamed from `.context-index/build-state/` to `.context-index/lifecycle-state/` as part of the same operation. The constitution's Context Routing table is updated from the row `Build state | .context-index/build-state/` to `Lifecycle state | .context-index/lifecycle-state/` and `/adev:sync` is triggered to propagate the change to `CLAUDE.md`. The migration is the only **write-side** consumer of legacy formats; read-side legacy fallbacks in `lib/issues/json-adapter.mjs` (governed by `tasks.legacy_read`, default enabled) remain available but optional — operators may disable the knob after running `adev migrate`. Two flags govern execution: `--dry-run` (preview without writing) and `--artifact=<name>` (scope to a single artifact among `tasks`, `lifecycle-state`, `execution-state`, `milestones`, `constitution`). ID counters, dependency edges, and the beads-map (if present in the source) are preserved across the migration with field-by-field fidelity. The migration tool is the **single owner of legacy-file lifecycle**: after a successful conversion of a given artifact, the legacy source file is left untouched on disk so the operator can verify before deleting it manually (a future deletion sweep is out of scope).

### Idempotency Model (semantic, not byte-identical)

The migration is **semantically idempotent**: re-running `adev migrate` on a fully-migrated project produces the same observable state — `JsonAdapter.list()`, `currentState(spec)`, `readExecutionState`, and `loadMilestones` return field-by-field-identical results to the first-run output. The migration is **not** byte-identical across re-runs: synthesized lifecycle events stamp `ts` from the legacy source's `mtime` at first-run, which is not stable across subsequent runs (a re-run after step 4 has renamed the source directory has no `mtime` to read from). The per-artifact idempotency checks in CON-4 ensure that, once an artifact has been migrated, subsequent invocations short-circuit with `action: "skipped"` and do NOT regenerate output — the existing migrated file is treated as authoritative. The "byte-identical re-run" property is therefore guaranteed by **the skip path**, not by deterministic generation. A test asserts: first run produces output X; second run skips (no I/O); third run with the legacy files removed still skips (no new output generated). This addresses review-rev-1 SA-2 directly: rather than chasing deterministic timestamps, the migration commits to skip-on-completion as the idempotency mechanism.

## Naming Conventions (CON-1)

This spec inherits naming conventions from the four target specs and the existing source artifacts:

- **Issue/Epic fields:** unchanged from `json-issue-board-adapter.spec.md` (Issue: mixed camelCase + snake_case; Epic: snake_case `plan_ref`). The migration preserves whatever convention the legacy `tasks.md` parser already produces.
- **Lifecycle event fields:** unchanged from `lifecycle-event-log.spec.md` (snake_case discriminators, snake_case event-only fields).
- **ExecutionState fields:** unchanged from `execution-state-migration.spec.md` (camelCase throughout).
- **Milestone fields:** unchanged from `milestones-migration.spec.md` (mixed snake_case + lowercase, preserved verbatim).
- **CLI subcommand:** `migrate` (lowercase). Flags follow the existing CLI style: `--dry-run` (boolean), `--artifact=<value>` (key=value form). This matches the conventions already established by the CLI's other subcommands (`install`, `upgrade`, `init`, `extension`).

This spec does **not** rename any field on any artifact. Renames are categorically out of scope; the migration is a format-only transformation.

## Path Safety (SEC-1, SEC-4)

The module enforces path-containment defenses on every public function:

1. **`projectRoot` normalization.** The top-level `migrateAll(projectRoot, options)` entry point and every per-artifact migrator (`migrateTasks`, `migrateLifecycleState`, `migrateExecutionState`, `migrateMilestones`, `migrateConstitution`) resolve `projectRoot` via `path.resolve()` at entry. The resolved path must contain `.context-index/manifest.yaml` (validated by `fs.existsSync`). If validation fails, the function throws `INVALID_PROJECT_ROOT` with the resolved path. Same contract as the three sibling-spec libs.
2. **Storage-root resolution for shared artifacts.** For `tasks.md` → `tasks.json` and `milestones.yaml` → `milestones.json`, the migrator resolves the storage root via `resolveStorageRoot(manifest, projectRoot)` — the same helper used by the JSON adapter and the rewritten milestones lib. The resolved storage root MUST be a real, existing directory (positive containment per `milestones-migration.spec.md` rev 2). Both writes target `<storageRoot>/.context-index/`.
3. **Per-worktree resolution for build-state.** `.context-index/build-state/*.json` lives in the worktree (today's behavior); the corresponding `.context-index/lifecycle-state/*.jsonl` is written to the same worktree. `lifecycle-state` is per-worktree because lifecycle events are per-spec and specs live in the worktree.
4. **Per-worktree resolution for execution-state.** `.execution-state.md` and `.execution-state.json` are per-worktree (the rewritten `lib/execution-state.mjs` resolves against `projectRoot` directly, not `resolveStorageRoot`). The migrator follows the consumer's resolution rule.
5. **Read AND write path containment.** Every resolved read path AND every resolved write path is asserted via `fs.realpathSync.native()` to live inside `<resolvedStorageRoot>/.context-index/` or `<projectRoot>/.context-index/` per the applicable rule above. Any escape (crafted `tasks.db_path`, symlink under `.context-index/`, etc.) throws `INVALID_STORAGE_PATH` **before the file is opened** for read or write. Addresses review-rev-1 SEC-6: parsers must not run on attacker-chosen input even if a later write-side check would block the write.
6. **Slug character allowlist for legacy build-state files.** Each `.context-index/build-state/*.json` filename's stem (the filename without the `.json` extension) MUST match `[a-z0-9._-]+`. Slugs failing this check are surfaced in the `PreflightReport` as `INVALID_LEGACY_SLUG` and abort the run. The derived target path `lifecycle-state/<slug>.jsonl` must additionally satisfy the realpath-prefix containment check from rule 5. Addresses review-rev-1 SEC-2 (slug escape via crafted legacy filenames). Mirrors the live-write allowlist enforced by `lib/lifecycle-state.mjs`.
7. **Per-artifact size caps on legacy reads.** The pre-flight validator rejects oversized legacy files before parsing. Caps: `tasks.md` ≤ 10 MB; each `build-state/<slug>.json` ≤ 1 MB; `.execution-state.md` ≤ 1 MB; `milestones.yaml` ≤ 1 MB; `constitution.md` ≤ 5 MB. Any file exceeding its cap is surfaced as `LEGACY_FILE_TOO_LARGE` in the `PreflightReport` and aborts the run before any parser executes. Addresses review-rev-1 SEC-1 (parser DoS via pathological legacy file).
8. **Atomic-write parity.** Every JSON/JSONL write performed by the migrator uses the same atomic temp-then-rename pattern as the consumer module that will read the file (mirrors `lib/build-state.mjs::atomicWriteJson`, with `<finalPath>.<crypto.randomBytes(4).toString('hex')>.tmp` naming). For the directory rename, the migrator uses `fs.renameSync` atomically; the collision check (target absent OR rename aborts with `RENAME_COLLISION`) is enforced per CON-2 step 4 — no silent merge.
9. **Parse-error advisory redaction.** Parse-error advisories surface only `{ artifact, file, parser_error_code, line, column }` plus a 200-character non-printable-stripped context window from the offending region. Raw legacy file content is **never** embedded in stderr, in `PreflightReport`, or in any `MigrationResult`. Mirrors `MALFORMED_BOARD` content-stripping from the json-issue-board-adapter sibling. Addresses review-rev-1 SEC-4 (data exposure via stderr-captured CI logs).

## Migration Order and Dependency Contract (CON-2)

The migration runs in a fixed order to satisfy cross-spec dependencies:

1. **Pre-flight check (read-only):** Resolve `projectRoot`, load manifest, snapshot legacy artifacts, validate parseability. Abort with a structured report if any legacy file is malformed beyond auto-recoverable shape.
2. **`tasks.md` → `tasks.json`:** Reuse the shared markdown parser `lib/issues/markdown-parser.mjs` (extracted per `json-issue-board-adapter.spec.md` SA-3) to parse the legacy file. Write the JSON document via `JsonAdapter._write()`-equivalent atomic write. Preserves: tier-prefix counters (`issue-N`, `epic-N`, child-N counters), `dependencies[]` arrays, `epicId` linkage, `spec_ref` / `next_action` fields, beads-map fields if the legacy file carries them (`beads_id`, `external_id`, etc.). Legacy issues with both `planRef` AND `planTask` are **tolerated on read** by the JSON adapter (per the spec's CON-3) but the migration tool emits a **collapse advisory** for each such issue: it preserves the legacy fields but reports the issue ID to stderr with the recommendation to manually move per-task state to the lifecycle log. The migration does NOT silently drop `planTask` data.
3. **`build-state/*.json` → `lifecycle-state/*.jsonl`:** For each `<slug>.json` in `.context-index/build-state/`, derive the spec path (via `slugFromSpec` reverse lookup against `.context-index/specs/**/<slug>.spec.md`), then translate the step-by-step JSON into a sequence of canonical lifecycle events (`lifecycle_step`/`step_completed`/`step_failed`/`reviewer_report`/`validator_report`). The resulting JSONL is written via `fs.appendFile` per the lifecycle-event-log spec. Events synthesized from legacy state carry `ts` = the legacy file's last-modified timestamp (or `created`/`updated` fields if present in the source), `actor` = `"migration/adev-cli"`, and `severity` (for actor events) resolved at write time from `reviewers.yaml`/`gates.yaml` per the lifecycle-event-log spec — same rule as live writes.
4. **Directory rename:** After all `build-state/*.json` files have been converted, the migrator performs `fs.renameSync('.context-index/build-state', '.context-index/lifecycle-state')`. **Collision is fatal.** If `.context-index/lifecycle-state/` already exists (whether empty or populated), the migrator aborts with `RENAME_COLLISION` exit 1 and surfaces a structured advisory naming the existing directory and the SHA-256 of any pre-existing `<slug>.jsonl` files within it. The advisory instructs the operator to inspect the existing directory and either: (a) remove it manually if the contents are stale, then re-run `adev migrate`; or (b) preserve it manually if the contents are authoritative, then run `adev migrate --artifact=lifecycle-state-skip-rename` (this artifact value performs only step 3 per-file translation with the same "target file already exists ⇒ abort" rule). **Per-file collision is also fatal.** During step 3, if any `.context-index/lifecycle-state/<slug>.jsonl` file already exists when the translation tries to write it, the migrator aborts with `LIFECYCLE_STATE_FILE_EXISTS` exit 1 — never appends to or merges into a pre-existing lifecycle log. This forecloses the state-injection vector from review-rev-1 SEC-5 (a hostile or stale pre-existing log would otherwise prepend events that influence the `currentState()` fold). The legacy `build-state/` directory after a successful rename does not exist; consumers reading from the legacy path receive `ENOENT`.
5. **`.execution-state.md` → `.execution-state.json`:** Parse the legacy YAML/markdown via the existing hand-rolled parser (today's `parse()` function in `lib/execution-state.mjs`, kept as a one-shot helper in the migration module; the rewritten `lib/execution-state.mjs` no longer has this function). Write the JSON document via the rewritten module's `writeExecutionState`. Preserves: every field name (`status`, `planRef`, `currentTask`, `issueBinding`, `blockers`, `nextAction`, `updated`, `progress[]`).
6. **`milestones.yaml` → `milestones.json`:** Parse the legacy YAML via `parseYaml` from `lib/profiles/yaml.mjs` (kept as a one-shot helper in the migration module; the rewritten `lib/milestones.mjs` no longer imports it). Write via the rewritten module's `saveMilestones`. Preserves: every field name (`name`, `status`, `epic_id`, `target_date`, `release`, `ship_criteria`, `defer_reason`). Handles the worktree-vs-main-repo split: if a `milestones.yaml` exists only in the current worktree's `.context-index/` and the resolved storage root differs, the migration writes the JSON to the resolved storage root (main repo) so the file lands where `lib/milestones.mjs` will read it post-migration.
7. **Constitution Context Routing update:** Replace the line `| Build state | \`.context-index/build-state/\` |` in `.context-index/constitution.md` with `| Lifecycle state | \`.context-index/lifecycle-state/\` |`, **scoped to the active Context Routing table only**. The migrator parses the markdown structure to locate the `## Context Routing` heading; finds the table immediately following it (bounded by the next `## ` heading or end-of-file); performs a single literal-string match on the target row within that bounded section; refuses to mutate if the target literal appears more than once across the file (whether inside or outside the active table) and emits `CONSTITUTION_AMBIGUOUS_MATCH` exit 1 with the line numbers of all occurrences. If the line is missing (e.g., already migrated, or the constitution has been hand-edited), the step is skipped with a `SKIPPED: row not found` action plus an advisory recommending manual inspection. This addresses review-rev-1 SEC-3: a constitution containing the target row inside a fenced code block, a quoted ADR, or an example table is safely refused rather than silently corrupted.
8. **`/adev:sync` trigger:** After the constitution edit, the migrator emits a structured advisory to stdout asking the operator to run `/adev:sync` to propagate the constitution change to `CLAUDE.md` and any other agent files declared by the project's existing `/adev:sync` configuration. The migrator does NOT directly invoke the skill (skills are user-initiated); it surfaces the next-step instruction in the final report. Advisory emission is conditional per the rule in CLI Surface (only on `action: "migrated"`).

## CLI Surface (CON-3)

The `adev migrate` subcommand is added to `cli/index.mjs` alongside the existing `install`, `upgrade`, `init`, `uninstall`, `extension`, `help` subcommands. The migration's flags:

```bash
adev migrate                                          # Run the full migration. Semantically idempotent.
adev migrate --dry-run                                # Print the diff plan without writing anything.
adev migrate --artifact=tasks                         # Migrate only the issue board.
adev migrate --artifact=lifecycle-state               # Step 3 (per-file translation) + step 4 (directory rename) as one unit.
adev migrate --artifact=lifecycle-state-skip-rename   # Step 3 only — used after RENAME_COLLISION when operator preserves existing dir.
adev migrate --artifact=execution-state               # Migrate only the execution-state file.
adev migrate --artifact=milestones                    # Migrate only the milestones registry.
adev migrate --artifact=constitution                  # Update only the constitution Context Routing row.
adev migrate --help                                   # Print the flag reference.
```

**`--artifact=lifecycle-state` indivisibility:** This value performs step 3 (per-file translation) followed by step 4 (directory rename), atomically as one unit. The rename happens only after every per-file translation succeeds. If any per-file translation fails or aborts (e.g., `LIFECYCLE_STATE_FILE_EXISTS`), the rename does NOT occur and any partially-written `lifecycle-state/<slug>.jsonl` files remain on disk for operator inspection — the migrator does not roll back. Addresses review-rev-1 SA-5.

**`--artifact=lifecycle-state-skip-rename`:** Operator-facing escape hatch for the `RENAME_COLLISION` case. Performs only step 3 (per-file translation) and skips step 4. The directory rename can be performed manually after the operator inspects and resolves the existing `lifecycle-state/` directory. Per-file collision rules from CON-2 step 4 still apply (existing target files cause `LIFECYCLE_STATE_FILE_EXISTS` abort).

Behavior under `--dry-run`:

- No file is written, renamed, or deleted.
- The migrator produces a structured plan to stdout listing each artifact, the source file, the target file, the byte-count change (or "rename only" for directories), and any advisory notes (e.g., legacy granularity issues).
- Exit code 0 if the plan would succeed; non-zero if any pre-flight check (parseability, path containment) fails. This makes `--dry-run` safe to run in CI as a "would the migration succeed?" gate.

Behavior under `--artifact=<name>`:

- Only the named artifact is migrated. Dependencies between artifacts (e.g., `tasks.md` must be parsed before the issue-board verifier runs) are respected — the migrator may still read additional artifacts, but writes are constrained.
- Valid names: `tasks`, `lifecycle-state`, `lifecycle-state-skip-rename`, `execution-state`, `milestones`, `constitution`, plus a special name `all` (default). Unknown names produce `UNKNOWN_ARTIFACT` exit.
- `--artifact=constitution` runs only step 7 above (no `/adev:sync` invocation; that's the operator's call regardless of flag).
- **`/adev:sync` advisory emission scope:** the final-report advisory recommending the operator run `/adev:sync` is emitted **only when `migrateConstitution` produced `action: "migrated"` in this invocation**. It is NOT emitted on `action: "skipped"` (constitution already updated), NOT on `--dry-run`, NOT on `--artifact=<value>` runs where constitution was outside the selected scope, and NOT on a `CONSTITUTION_AMBIGUOUS_MATCH` abort. Addresses review-rev-1 SA-6.

Exit codes (per the constitution's "Error handling: CLI uses `process.exit(1)` for fatal errors" rule):

| Condition | Exit code |
|---|---|
| Successful full migration | 0 |
| Successful `--dry-run` with valid plan | 0 |
| No work to do (already migrated; idempotent re-run) | 0 |
| `--dry-run` detects a fatal pre-flight failure | 1 |
| Live run encounters a parse/write error | 1 |
| Unknown `--artifact` value | 1 |
| Path-containment violation | 1 |
| `projectRoot` does not contain `.context-index/manifest.yaml` | 1 |

## Idempotency Contract (CON-4)

Re-running `adev migrate` on a project that has already been migrated produces **zero on-disk diff** to migration targets and exits 0 with a "no work to do" report. The contract is **semantic idempotency** (the result of every consumer read is field-by-field-stable across re-runs) and the mechanism is **skip-on-completion** (the per-artifact checks below short-circuit without invoking the migrator, so deterministic generation is not required).

The idempotency check is per-artifact. For each artifact, the migrator examines target presence and source presence:

- **`tasks.json` present:** skip tasks step regardless of whether `tasks.md` still exists. The presence of the migrated target is treated as authoritative.
- **`lifecycle-state/` present AND not empty:** skip the directory-rename step regardless of whether `build-state/` still exists.
- **For each `<slug>.json` in `build-state/`:** if a matching `<slug>.jsonl` exists in `lifecycle-state/`, skip that file's conversion. If a `<slug>.json` has NO matching `<slug>.jsonl` in `lifecycle-state/`, it indicates either a never-completed translation or a build-state file authored after a prior partial migration — abort with `BUILD_STATE_ORPHAN` exit 1 and surface the slug in the advisory so the operator can resolve manually. The migrator never resumes a partial per-file translation autonomously.
- **`.execution-state.json` present:** skip execution-state step regardless of whether `.execution-state.md` still exists.
- **`milestones.json` present at the resolved storage root:** skip milestones step regardless of whether `milestones.yaml` still exists at any path.
- **Constitution already updated** (literal `Lifecycle state | .context-index/lifecycle-state/` line present within the active Context Routing table per CON-2 step 7): skip constitution step.

If a legacy file is present alongside its already-migrated counterpart (e.g., both `tasks.md` and `tasks.json` exist), the migrator emits a `LEGACY_FILE_LINGERING` advisory naming the file and recommending manual deletion, but does NOT re-run the migration. The migrated file is treated as authoritative.

**On "untouched" / worktree-local stale YAML:** the milestones step skip-condition is grounded entirely on `milestones.json` presence at the **resolved storage root** (per `resolveStorageRoot(manifest, projectRoot)`). A stale `milestones.yaml` in the current worktree's `.context-index/` directory (when that path differs from the resolved storage root) is reported via `LEGACY_FILE_LINGERING` but does NOT cause re-migration. This addresses review-rev-1 SA-4: "untouched" is no longer defined by mtime comparison; it's defined by target presence alone, regardless of where any stale source file lives.

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies because the migration tool uses only `node:fs`, `node:path`, `node:crypto`, `node:child_process` (already-imported by `cli/index.mjs`), and `JSON.parse`/`JSON.stringify`. The YAML parser used for the milestones step and the markdown parser used for the tasks step are existing internal modules (`lib/profiles/yaml.mjs` and `lib/issues/markdown-parser.mjs`); no new external dependency is introduced.
- **Principle:** "Pure ESM — all `.mjs` files" — Applies because `lib/migrate-state-artifacts.mjs` is authored as ESM. The CLI wiring in `cli/index.mjs` is already ESM.
- **Principle:** "Skills are primarily markdown" — Applies because the migration tool is a CLI subcommand, not a skill. The constitution update is a literal file edit; `/adev:sync` propagation is initiated by the operator after the migrator exits.
- **Principle:** "Hook protocol compliance" — Not directly applicable (the migrator is not a hook), but adjacent: the migrator never invokes hooks and produces no hook output. It is a one-shot interactive CLI run.
- **Architecture Boundary (Requires Human Approval):** "Modifying the CLI installation path structure" — Not affected (the migrator does not modify the installation path). Adding a new subcommand to the existing CLI is within the scope of the `agent-reliable-state-artifacts` charter and does not change the install structure.
- **Architecture Boundary (Autonomous):** "Updating specs/ADRs when code changes affect their assumptions" — Applies because the constitution edit is a code-affecting documentation change. The migrator performs the edit autonomously; the `/adev:sync` propagation is a follow-up the operator runs.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| `lib/migrate-state-artifacts.mjs` skeleton | New module with public entry points: `migrateAll(projectRoot, options)`, plus per-artifact functions `migrateTasks`, `migrateLifecycleState`, `migrateExecutionState`, `migrateMilestones`, `migrateConstitution`. Each returns a `MigrationResult` `{ artifact, action, source, target, advisories[], dryRun }`. | small |
| Pre-flight validator | Scans all legacy artifacts, asserts parseability, returns a structured `PreflightReport` `{ artifacts[], failures[], advisories[] }`. Refuses to mutate if any failure. | medium |
| `migrateTasks` | Calls `parseTasksMd(content)` from the new shared parser (per `json-issue-board-adapter.spec.md` SA-3). Writes `tasks.json` via the JSON adapter's `_write()` primitive (or an equivalent inline `atomicWriteJson` if invoked outside the adapter). Preserves tier counters, `dependencies[]`, `epicId`, `spec_ref`, `next_action`, beads-map fields. Emits per-issue advisories for legacy `planRef`+`planTask` issues. | medium |
| `migrateLifecycleState` | For each `build-state/<slug>.json`, derive spec path, translate step-state to canonical events, append-write each event to `lifecycle-state/<slug>.jsonl`. **Per-file collision is fatal**: if `lifecycle-state/<slug>.jsonl` already exists, abort with `LIFECYCLE_STATE_FILE_EXISTS` exit 1 — never append or merge into a pre-existing log. Synthesized events carry `actor: "migration/adev-cli"` and `ts` from the source's last-modified or in-file timestamp fields. Only canonical variants `lifecycle_step`, `step_completed`, `step_failed`, `reviewer_report`, `validator_report` are synthesized — the legacy `build-state` shape carries no source for `plan_task`, `debug_intervention`, `recovery_record`, or `manual_override` variants (CON-4 from review rev 1). | large |
| Build-state → lifecycle-state translation table | Pure function mapping `{steps: {review: {status, verdict, reviewers[], ...}, ...}}` to a sequence of `lifecycle_step`/`step_completed`/`reviewer_report` events. Round-trip property test: lifecycle-log fold reproduces the legacy step state. | medium |
| Directory rename step | Pre-checks: target directory absent; source exists. Performs `fs.renameSync`. **Collision is fatal**: if `.context-index/lifecycle-state/` already exists (whether empty or populated), abort with `RENAME_COLLISION` exit 1 and surface the existing directory plus SHA-256 of any pre-existing `*.jsonl` files. Operator-facing recovery: clear the existing directory manually then re-run, or preserve it manually then run `adev migrate --artifact=lifecycle-state-skip-rename`. Reports the rename in the `MigrationResult`. (SA-7 from review rev 2: row corrected from rev-1 "logs a warning and skips the rename" to the fatal contract that binds the rest of the spec.) | small |
| `migrateExecutionState` | Reuses the legacy `parse()` function (today's `lib/execution-state.mjs::parse`), now extracted into the migration module as a one-shot helper. Writes JSON via the rewritten `writeExecutionState`. Preserves every field including `progress[]`. | small |
| `migrateMilestones` | Reuses `parseYaml` from `lib/profiles/yaml.mjs` (one-shot helper invocation; the rewritten `lib/milestones.mjs` no longer imports it). Writes via the rewritten `saveMilestones`. Handles the worktree-vs-main-repo source resolution explicitly. | medium |
| `migrateConstitution` | Reads `.context-index/constitution.md`, performs literal-string replacement of the row `| Build state | \`.context-index/build-state/\` |` with `| Lifecycle state | \`.context-index/lifecycle-state/\` |`. If row absent (already migrated), skip. Writes via atomic temp-then-rename. | small |
| CLI wiring in `cli/index.mjs` | Add `case "migrate":` to the top-level subcommand switch. Parse `--dry-run` and `--artifact=<value>` flags. Print structured report. Set exit code per the table above. | small |
| `--dry-run` plan formatter | Walks each artifact's per-artifact migrator with a `dryRun: true` option. Each migrator returns its `MigrationResult` without writing. The CLI formats these into a human-readable plan. | small |
| `--artifact=<name>` dispatcher | Validate the name against the allowlist (`tasks`, `lifecycle-state`, `lifecycle-state-skip-rename`, `execution-state`, `milestones`, `constitution`, `all`). Invoke only the named migrator. `--artifact=all` (default) invokes the full migration in the order defined in CON-2. `lifecycle-state-skip-rename` performs step 3 (per-file translation) only; the directory rename is operator-deferred. | small |
| Idempotency check | Per-artifact pre-checks: target file present, source file absent or unchanged. Each migrator returns `action: "skipped"` in its `MigrationResult` when idempotent. | small |
| Advisory: lingering legacy files | When a legacy file is present alongside its already-migrated counterpart, emit `LEGACY_FILE_LINGERING` with the file path and a manual-deletion recommendation. | small |
| Advisory: granularity collapse | For each issue migrated with both `planRef` and `planTask`, log to stderr the issue ID and a recommendation to move per-task state to the lifecycle log. Issue is preserved as-is on the board. | small |
| Path containment defenses | Add `path.resolve` + `.context-index/manifest.yaml` existence check via shared internal `validateProjectRoot`. Per-write containment assertions on each migrator's target path. | small |
| Tests: idempotency property | Run migration twice on a fixture project; assert no on-disk diff to migration targets after the second run (skip-path byte-stability per the semantic-idempotency model). Field-by-field equality verified by loading via each consumer lib. | medium |
| Tests: per-artifact parity | Each migrator's output is exercised by re-loading via the consumer lib (`JsonAdapter`, `lib/lifecycle-state.mjs`, rewritten `lib/execution-state.mjs`, rewritten `lib/milestones.mjs`) and asserting the loaded state matches the legacy state field-by-field. | large |
| Tests: `--dry-run` produces no on-disk diff | Run with `--dry-run` against a fixture; assert no file content or mtime changed. | small |
| Tests: `--artifact=<name>` isolation | Run with each named artifact; assert only that artifact migrated, others untouched. | medium |
| Tests: directory-rename collision | Run when `.context-index/lifecycle-state/` already exists; assert the migration aborts with `RENAME_COLLISION` exit 1, the original `build-state/` is left intact, no `lifecycle-state/*.jsonl` is appended or merged. Run a separate test with per-file collision (target `<slug>.jsonl` already present): assert `LIFECYCLE_STATE_FILE_EXISTS` exit 1 and no append. (SA-7 from review rev 2: row corrected from rev-1 "merged or refused per the defined rule" to match the fatal-collision contract.) | medium |
| Tests: legacy `planRef`+`planTask` advisory | Fixture board with one such issue; assert the advisory is emitted, the issue is preserved on the migrated board, and the test exits without throwing `BOARD_GRANULARITY_VIOLATION`. | small |
| Tests: constitution literal-replace safety | Fixture constitution with unrelated `build-state` mentions (in prose, ADR references, etc.); assert only the Context Routing row is modified. | small |
| Tests: path-containment defenses | Traversal payloads via `tasks.db_path`, missing `manifest.yaml`, symlink escape. Assert `INVALID_PROJECT_ROOT` / `INVALID_STORAGE_PATH` for each. | small |
| Tests: full end-to-end | Fixture project containing all four legacy artifacts; run `adev migrate`; assert every consumer lib reads the migrated state correctly and the constitution is updated. | large |
| Coverage target | ≥ 90% line coverage on `lib/migrate-state-artifacts.mjs`. ≥ 90% on the new CLI dispatch code in `cli/index.mjs`. | small |
| Manifest documentation | Update `templates/manifest.yaml` comments to mention `adev migrate` as the one-shot upgrade path. No new manifest keys are added. | small |

## Visual Expectations

Not applicable as a UI surface. CLI output is structured plain text (matching the existing `cli/index.mjs` style: `log`, `success`, `warn`, `error`, `heading` helpers). The dry-run plan format is a structured listing per artifact; the live-run output is a per-artifact action summary plus a final advisory list.

## Acceptance Criteria

- [ ] `lib/migrate-state-artifacts.mjs` exists as ESM and exports: `migrateAll(projectRoot, options)`, `migrateTasks(projectRoot, options)`, `migrateLifecycleState(projectRoot, options)`, `migrateExecutionState(projectRoot, options)`, `migrateMilestones(projectRoot, options)`, `migrateConstitution(projectRoot, options)`. Each returns a `MigrationResult` `{ artifact, action: "migrated" | "skipped" | "dry-run", source, target, advisories: [], dryRun: boolean }`.
- [ ] `cli/index.mjs` dispatches `adev migrate` to `migrateAll`. Flags `--dry-run` and `--artifact=<value>` are parsed and forwarded. Unknown `--artifact` values exit 1 with `UNKNOWN_ARTIFACT`. `adev migrate --help` prints the flag reference.
- [ ] **Semantic idempotency:** running `adev migrate` twice on the same project produces no second-run on-disk diff to migration targets. The second run's per-artifact idempotency checks short-circuit each step to `action: "skipped"`. A third run with all legacy source files removed still produces zero output (the existing migrated files are authoritative). Field-by-field equality is verified by loading the migrated state via each consumer lib (`JsonAdapter`, `lib/lifecycle-state.mjs::currentState`, `readExecutionState`, `loadMilestones`) and comparing.
- [ ] **No deterministic-generation requirement:** the spec does NOT require synthesized events or written documents to be byte-identical across hypothetical fresh runs. Idempotency is achieved via the skip-on-completion mechanism, not via stable generation. Test asserts that — on a project where every per-artifact target file is removed simultaneously and re-running the migration with the legacy source files still present — the regenerated targets produce field-by-field-identical consumer-read results, but may legitimately differ in byte content (e.g., synthesized event `ts` values).
- [ ] `migrateTasks` produces a `tasks.json` document that, when loaded via `JsonAdapter`, returns issues and epics field-by-field identical to the result of `FileAdapter` loading the legacy `tasks.md`. Property test covers a fixture with: tier-prefix counters, `dependencies[]`, `epicId` linkage, `spec_ref`, `next_action`, and the beads-map shape. Legacy issues with `planRef`+`planTask` are tolerated and surfaced via the advisory mechanism (next bullet).
- [ ] For each legacy issue carrying both `planRef` and `planTask`, `migrateTasks` emits one `GRANULARITY_LEGACY_ISSUE` advisory to stderr naming the issue ID and recommending manual cleanup. The issue is **preserved as-is** on the migrated board; no field is dropped or rewritten. The JSON adapter's CON-3 read-tolerance covers downstream behavior.
- [ ] `migrateLifecycleState` translates each `.context-index/build-state/<slug>.json` to `.context-index/lifecycle-state/<slug>.jsonl` such that, when loaded via `lib/lifecycle-state.mjs::currentState`, the projected state matches the legacy build-state's step status, verdict, and per-reviewer notes field-by-field. Property test covers each canonical step (`specify`, `review`, `plan`, `route`, `implement`, `validate`) and each verdict (`PASS`, `PASS_WITH_NOTES`, `FAIL`).
- [ ] Synthesized lifecycle events from migration carry `actor: "migration/adev-cli"` and a `ts` value sourced from the legacy data (or the source file's `mtime` as a fallback). Test asserts both fields on every synthesized event.
- [ ] Directory rename: `.context-index/build-state/` is renamed to `.context-index/lifecycle-state/` via `fs.renameSync`. If the target exists, the rename aborts with `RENAME_COLLISION` exit 1 — never merges. If any individual `lifecycle-state/<slug>.jsonl` file exists during step 3, abort with `LIFECYCLE_STATE_FILE_EXISTS` exit 1. Test exercises clean-rename, directory-collision, and per-file-collision paths; asserts no append occurs in any collision case.
- [ ] `migrateExecutionState` produces a `.execution-state.json` document that, when read via the rewritten `lib/execution-state.mjs::readExecutionState`, returns the same object the legacy `parse()` function returns for the legacy `.execution-state.md`. Field-by-field round-trip test.
- [ ] `migrateMilestones` produces `milestones.json` at the resolved `<storageRoot>/.context-index/` (main repo in a worktree). When loaded via the rewritten `lib/milestones.mjs::loadMilestones`, the array matches the legacy YAML-parsed array field-by-field. The legacy `milestones.yaml` in the source location (which may be a worktree directory) is **left untouched**.
- [ ] `migrateConstitution` performs the scoped literal-string replacement of the Context Routing row (bounded by the `## Context Routing` heading and the next `## ` heading). Test asserts: matching row in active table → replaced; missing row (already migrated) → skipped; same literal appearing both in active table AND inside a fenced code block → aborts with `CONSTITUTION_AMBIGUOUS_MATCH`; same literal appearing only inside a code block → no mutation, `SKIPPED: row not found` action emitted.
- [ ] After `migrateConstitution` runs, the migrator's final report instructs the operator to run `/adev:sync`. The migrator does not invoke the skill itself. Test asserts the advisory string appears in stdout.
- [ ] `--dry-run` mode produces no on-disk diff. Test asserts file mtimes and content are unchanged after a dry run.
- [ ] `--artifact=<name>` mode isolates execution to the named artifact. Test asserts only that artifact's target file is created/modified per run.
- [ ] Path-containment defenses are enforced on both reads and writes: any `projectRoot` lacking `.context-index/manifest.yaml` throws `INVALID_PROJECT_ROOT`; any resolved read OR write path outside `<storageRoot>/.context-index/` (or `<projectRoot>/.context-index/` for per-worktree artifacts) throws `INVALID_STORAGE_PATH` before any file is opened; any `tasks.db_path` that does not resolve to a real existing directory throws `INVALID_STORAGE_PATH`. Tests exercise traversal payloads via `tasks.db_path` (including `/etc/passwd` regular-file) and symlink-escape under `.context-index/`.
- [ ] Legacy slug allowlist: every `.context-index/build-state/*.json` filename's stem matches `[a-z0-9._-]+`. Test fixture includes a crafted `../escape.json` filename and asserts `INVALID_LEGACY_SLUG` aborts pre-flight.
- [ ] Per-artifact size caps enforced in pre-flight: a fixture project with one oversized legacy file per cap (one fixture each: 11 MB `tasks.md`, 2 MB `build-state/<slug>.json`, 2 MB `.execution-state.md`, 2 MB `milestones.yaml`, 6 MB `constitution.md`) asserts `LEGACY_FILE_TOO_LARGE` for each.
- [ ] Parse-error advisory redaction: `PreflightReport` parse-error entries contain `{ artifact, file, parser_error_code, line, column, context }` where `context` is a 200-character non-printable-stripped slice. Test asserts that a fixture YAML with a secret-bearing line (`api_key: hunter2`) does not embed `hunter2` in stderr, advisories, or the report.
- [ ] Migration tool is the **only consumer** that reads legacy formats post-rollout. Architectural test: after this spec lands, the JSON adapter's `tasks.legacy_read` knob defaults remain configurable, but the migration tool never depends on the knob — it parses `tasks.md` directly via `lib/issues/markdown-parser.mjs`. Documentation note in the manifest schema explains that operators may disable `tasks.legacy_read` after running `adev migrate`.
- [ ] CLI exit codes: 0 for success or successful dry-run; 1 for any fatal failure. Test exercises each exit-code row in the CLI Surface table.
- [ ] All constitution quality gates pass: `npm test` green, no new dependencies in `package.json`, all files are `.mjs` ESM.
- [ ] No constitutional violations.
- [ ] Test coverage on `lib/migrate-state-artifacts.mjs` ≥ 90% lines. Coverage on the new CLI dispatch in `cli/index.mjs` ≥ 90% lines.

## Preconditions

- The project has a `.context-index/` directory (created by `/adev:init`).
- The project has a `.context-index/manifest.yaml`. The path-containment defense enforces this on every public call.
- The sibling specs `lifecycle-event-log` (lib at `lib/lifecycle-state.mjs`), `json-issue-board-adapter` (lib at `lib/issues/json-adapter.mjs` + shared markdown parser at `lib/issues/markdown-parser.mjs`), `execution-state-migration` (rewritten `lib/execution-state.mjs`), and `milestones-migration` (rewritten `lib/milestones.mjs`) are implemented. The migration tool is the **last** of the five rollout artifacts.
- `lib/issues/resolve-root.mjs` exists with the `resolveStorageRoot()` export.
- `lib/profiles/yaml.mjs` exists with the `parseYaml` export (kept indefinitely for legacy reads, though the rewritten `lib/milestones.mjs` no longer imports it).
- `cli/index.mjs` exists with the current subcommand switch and helper functions (`log`, `success`, `warn`, `error`, `heading`).
- Node.js runtime with `node:fs`, `node:path`, `node:crypto`, `JSON.parse`, `JSON.stringify` available.
- No assumption is made about whether the project's legacy artifacts exist — the migration tolerates any subset (missing artifacts are skipped silently).

## Behaviors

- **When** an operator runs `adev migrate` (no flags) in a project root containing legacy artifacts **then** the migration runs in the order defined in CON-2 (pre-flight, tasks, lifecycle-state, directory rename, execution-state, milestones, constitution), produces a per-artifact action summary on stdout, exits 0 on success, and instructs the operator to run `/adev:sync` if the constitution was updated.
- **When** an operator runs `adev migrate --dry-run` **then** every per-artifact migrator runs with `dryRun: true`, no files are written or renamed, and the CLI prints a structured plan listing each artifact's source → target mapping and any advisories.
- **When** an operator runs `adev migrate --artifact=tasks` **then** only `migrateTasks` is invoked. The other artifacts are not touched. Test fixture asserts no mtime change on the other targets.
- **When** an operator runs `adev migrate` on a project where every artifact is already in its migrated shape **then** the migrator emits a "no work to do" report, no files are modified, and the CLI exits 0.
- **When** `migrateTasks` parses a legacy `tasks.md` containing an issue with both `planRef` and `planTask` non-null **then** the issue is preserved verbatim on the migrated `tasks.json` AND a `GRANULARITY_LEGACY_ISSUE` advisory is emitted to stderr with the issue ID and a manual-cleanup recommendation. The JSON adapter's read-tolerance covers downstream behavior.
- **When** `migrateLifecycleState` translates a legacy `build-state/<slug>.json` to a JSONL log **then** each synthesized event carries `actor: "migration/adev-cli"` and a `ts` value sourced from legacy in-file timestamps (preferred) or the source file's `fs.statSync.mtime` (fallback). The synthesized event stream is folded by `lib/lifecycle-state.mjs::currentState` and the projected state matches the legacy step-state.
- **When** the directory rename step runs and `.context-index/lifecycle-state/` already exists **then** the migration aborts with `RENAME_COLLISION` exit 1. The advisory names the existing directory and includes SHA-256 hashes of any `*.jsonl` files within it. No per-file fallback is attempted; the operator is instructed to inspect the existing directory and either (a) remove it manually then re-run, or (b) preserve it and run `adev migrate --artifact=lifecycle-state-skip-rename`. This rule forecloses the state-injection vector from review-rev-1 SEC-5.
- **When** the per-file lifecycle-state translation runs and `.context-index/lifecycle-state/<slug>.jsonl` already exists **then** the migration aborts with `LIFECYCLE_STATE_FILE_EXISTS` exit 1. The migrator never appends to or merges into a pre-existing lifecycle log.
- **When** `migrateExecutionState` runs and `.execution-state.md` is missing **then** the step is skipped with a `SKIPPED: source absent` action. No `.execution-state.json` is created.
- **When** `migrateMilestones` runs and the legacy `milestones.yaml` lives in a worktree directory that differs from the resolved storage root **then** the JSON output is written to `<storageRoot>/.context-index/milestones.json` (main repo). The legacy YAML in the worktree directory is left untouched.
- **When** `migrateConstitution` runs and the row `| Build state | \`.context-index/build-state/\` |` is present in `.context-index/constitution.md` **then** the row is replaced via literal-string match with `| Lifecycle state | \`.context-index/lifecycle-state/\` |` and the file is atomically rewritten. Any other content in the file is untouched.
- **When** `migrateConstitution` runs and the target row is absent (already replaced) **then** the step is skipped with a `SKIPPED: already migrated` action.
- **When** any per-artifact migrator encounters a parse error on a legacy file **then** the error is surfaced in the `PreflightReport`, the migration aborts before mutating any file, and the CLI exits 1 with a description of the failure.
- **When** any public function is called with a `projectRoot` that does not resolve to a directory containing `.context-index/manifest.yaml` **then** `INVALID_PROJECT_ROOT` is thrown before any I/O occurs.
- **When** any resolved read OR write path falls outside `<storageRoot>/.context-index/` or `<projectRoot>/.context-index/` (per the applicable rule) **then** `INVALID_STORAGE_PATH` is thrown before any file is opened. The realpath-prefix containment check runs on every read and every write, defeating both crafted `tasks.db_path` and symlink escapes (CWE-22, CWE-59).
- **When** the resolved `tasks.db_path` does not point at a real, existing directory **then** `INVALID_STORAGE_PATH` is thrown before any I/O. Addresses the positive-containment gap from `milestones-migration.spec.md` review-rev-1 SEC-1.
- **When** any `.context-index/build-state/*.json` filename's stem fails the `[a-z0-9._-]+` allowlist **then** `INVALID_LEGACY_SLUG` is surfaced in the `PreflightReport` and the migration aborts before any per-file translation runs.
- **When** any legacy file exceeds its per-artifact size cap (`tasks.md` > 10 MB, `build-state/<slug>.json` > 1 MB, `.execution-state.md` > 1 MB, `milestones.yaml` > 1 MB, `constitution.md` > 5 MB) **then** `LEGACY_FILE_TOO_LARGE` is surfaced in the `PreflightReport` and the migration aborts before any parser executes.
- **When** `migrateConstitution` finds the target row literal appearing more than once across `constitution.md` (e.g., once in the active Context Routing table and once inside a fenced code block or quoted ADR) **then** the migration aborts with `CONSTITUTION_AMBIGUOUS_MATCH` exit 1, listing all occurrences by line number, and does not mutate the file.
- **When** a legacy file is present on disk alongside its already-migrated counterpart **then** a `LEGACY_FILE_LINGERING` advisory is emitted with the file path and a manual-deletion recommendation; no automatic deletion is performed.

## Postconditions

- After a successful `adev migrate` run, all four target artifacts exist in their new shapes (`tasks.json`, `lifecycle-state/*.jsonl`, `.execution-state.json`, `milestones.json`) at their resolved storage paths, and the constitution's Context Routing row is updated (when present).
- After a successful run, legacy source files (read-side) are **left untouched** on disk. They remain readable but no consumer lib relies on them — read-side legacy fallbacks in `lib/issues/json-adapter.mjs` (`tasks.legacy_read`) remain available but optional; operators may disable the knob.
- After a `--dry-run`, the project's on-disk state is byte-for-byte identical to its pre-run state. The CLI's stdout contains the structured plan; no other side effect occurred.
- After a failed run (pre-flight failure, parse error, `RENAME_COLLISION`, `LIFECYCLE_STATE_FILE_EXISTS`, `CONSTITUTION_AMBIGUOUS_MATCH`, etc.), no migration target has been **created** that did not exist before the run. Steps that completed prior to the failure are not rolled back — any successfully-written artifact from an earlier step remains on disk. The CLI's exit code is 1 and the operator may resume by re-running after addressing the failure (per-artifact idempotency checks ensure completed steps short-circuit). There is no automatic rollback.
- After a partial run with `--artifact=<name>`, only the named artifact's target file is created or modified. All other state is unchanged.
- After `migrateConstitution` runs successfully with `action: "migrated"`, the operator is instructed (via the CLI's final report) to run `/adev:sync` to propagate the constitution change to `CLAUDE.md`. The migrator does NOT invoke the skill itself, and the advisory is suppressed for `action: "skipped"`, `--dry-run`, out-of-scope `--artifact` runs, and `CONSTITUTION_AMBIGUOUS_MATCH` aborts.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `projectRoot` does not resolve to a directory containing `.context-index/manifest.yaml` | Throws `INVALID_PROJECT_ROOT`; CLI exits 1 | INVALID_PROJECT_ROOT |
| Resolved write path falls outside the applicable `.context-index/` directory | Throws `INVALID_STORAGE_PATH` before any I/O; CLI exits 1 | INVALID_STORAGE_PATH |
| `--artifact=<value>` with `value` not in `{tasks, lifecycle-state, lifecycle-state-skip-rename, execution-state, milestones, constitution, all}` | CLI exits 1 with `UNKNOWN_ARTIFACT` | UNKNOWN_ARTIFACT |
| Legacy `tasks.md` is malformed (parser throws) | Pre-flight surfaces the parse error in the report; no mutation occurs; CLI exits 1 | TASKS_PARSE_ERROR |
| Legacy `build-state/<slug>.json` is malformed JSON | Pre-flight surfaces the parse error; the migration aborts; CLI exits 1 | BUILD_STATE_PARSE_ERROR |
| Legacy `.execution-state.md` is malformed (no frontmatter, broken YAML) | Pre-flight surfaces the parse error; CLI exits 1 | EXECUTION_STATE_PARSE_ERROR |
| Legacy `milestones.yaml` is malformed | Pre-flight surfaces the parse error; CLI exits 1 | MILESTONES_PARSE_ERROR |
| Constitution Context Routing row is missing AND `Lifecycle state` row is also absent | `migrateConstitution` exits successfully with a `SKIPPED: row not found` action and emits an advisory recommending manual inspection of the constitution | CONSTITUTION_ROW_MISSING (advisory) |
| Directory rename target `.context-index/lifecycle-state/` already exists | **Fatal.** Advisory names the existing directory and SHA-256 of any `*.jsonl` within it; recommends manual inspection. CLI exits 1. No per-file fallback — operator must clear the directory or use `--artifact=lifecycle-state-skip-rename`. | RENAME_COLLISION |
| Per-file lifecycle-state target `.context-index/lifecycle-state/<slug>.jsonl` already exists during step 3 | **Fatal.** CLI exits 1 with the slug listed. Migrator never appends/merges. | LIFECYCLE_STATE_FILE_EXISTS |
| Legacy file exceeds its per-artifact size cap | Pre-flight rejection; CLI exits 1; no parser runs | LEGACY_FILE_TOO_LARGE |
| Legacy `build-state/*.json` filename stem contains characters outside `[a-z0-9._-]+` | Pre-flight rejection; CLI exits 1 | INVALID_LEGACY_SLUG |
| `migrateConstitution` finds the target row appearing more than once in `constitution.md` | Pre-flight rejection; CLI exits 1 with all occurrence line numbers | CONSTITUTION_AMBIGUOUS_MATCH |
| `tasks.db_path` is set but does not resolve to a real existing directory | Pre-flight rejection; CLI exits 1 | INVALID_STORAGE_PATH |
| `build-state/<slug>.json` has no matching migrated `lifecycle-state/<slug>.jsonl` on a re-run after the directory rename succeeded | CLI exits 1 with `BUILD_STATE_ORPHAN`; surfaces the slug for operator resolution | BUILD_STATE_ORPHAN |
| Legacy file present alongside already-migrated counterpart | `LEGACY_FILE_LINGERING` advisory naming the file; no mutation performed; not a fatal error | LEGACY_FILE_LINGERING (advisory) |
| Legacy issue with both `planRef` and `planTask` populated | `GRANULARITY_LEGACY_ISSUE` advisory naming the issue ID; issue preserved verbatim on the migrated board; not a fatal error | GRANULARITY_LEGACY_ISSUE (advisory) |
| `fs.renameSync` of the build-state directory fails (permission, cross-device, etc.) | Surfaces the underlying `fs` error code; CLI exits 1; no other artifact is mutated | FS_ERROR |
| Atomic write rename step fails for any JSON/JSONL output | Best-effort `fs.unlinkSync` on temp file; rethrow underlying `fs` error; CLI exits 1; legacy source files remain unchanged | FS_ERROR |
| Crash mid-migration (process killed between artifact steps) | Per-artifact atomicity guarantees no partial-write state on disk; re-running `adev migrate` is safe and resumes via per-artifact idempotency checks | — (safe to resume) |
| Operator runs `adev migrate` in a directory that is not a project root (no `.context-index/`) | CLI exits 1 with `INVALID_PROJECT_ROOT` and a hint to run `/adev:init` or change directory | INVALID_PROJECT_ROOT |
