---
charter: task-management
kind: action
status: validated
risk_level: medium
milestone:
revision: 2
charter-revision: 6
created: 2026-05-19
updated: 2026-08-13
tracker-ref: issue-528
source-manifest:
  sha: "fc0c9a5"
  files:
    - .context-index/adrs/0014-backend-migration-stderr-policy.md
    - .gitignore
    - cli/index.mjs
    - lib/cli/issues-migrate.mjs
    - lib/cli/issues.mjs
    - tests/lib/cli-issues-migrate.test.mjs
  computed-at: "2026-05-20T01:57:16.716Z"
drift_detected: true
---

# Live Spec: Backend Migration

<!-- Action Spec within the task-management charter.
     One-shot CLI verb (`adev issues migrate`) that converts the configured
     issue board from one backend to another. Idempotent via .beads-map.json
     and title/spec_ref matching; supports --dry-run and --include-closed.
     Parent Charter: .context-index/specs/features/task-management/charter.md
     Exemplar: .context-index/specs/features/lifecycle-artifacts/smoke-validation.spec.md -->

## Postconditions

<!-- State-of-world after `adev issues migrate --to <backend>` runs successfully.
     Each postcondition is a verifiable assertion. Together they define DONE
     for a backend migration run. -->

1. **Target board fully populated:** Every in-scope work item (default: status ∈ {open, in_progress, deferred}; with `--include-closed`: all statuses) from the source backend exists on the target backend with title, type, priority, notes, epicId, parent_id, planRef, spec_ref, next_action, and dependencies preserved.
2. **Idempotency map written (json → beads):** For json → beads migrations, every successfully migrated non-epic item has an entry in `.context-index/tasks/.beads-map.json` linking the source JSON id to the assigned beads id. Subsequent re-runs detect these entries and skip re-creation.
3. **Idempotency match (beads → json):** For beads → json migrations, items already present on the target (matched by title AND spec_ref, or by original id stored in notes metadata) are not duplicated.
4. **Dependency graph replayed:** For every in-scope edge `(itemId → depId)` on the source, the target backend has an equivalent edge after migration. Edges referencing items outside scope are surfaced as warnings and skipped — not silently dropped.
5. **Manifest preserved (no auto-write):** `tasks.backend` in `.context-index/manifest.yaml` is unchanged. The verb prints a prompt suggesting the user update the field but never writes it — even under `--auto`.
6. **Resumable on failure:** If the verb aborts mid-migration (e.g., `br create` fails on item 12 of 50), `.context-index/tasks/.migrate-state.json` records the last successful index and the verb exits non-zero. A subsequent re-run resumes from the next item without re-creating prior items.
7. **Dry-run leaves no state:** With `--dry-run`, no entries are written to the target backend and no `.beads-map.json` entries are created. The verb emits a JSON report on stdout describing what would happen and exits zero.
8. **`.migrate-state.json` is gitignored:** The resume-state file lives under `.context-index/tasks/` and is covered by an existing or newly added `.gitignore` entry so it is never committed.

## Behavioral Contract

<!-- Behaviors observable from the CLI surface. These complement the
     Postconditions above and translate them into testable When/then
     statements that map to mocked test cases. -->

### Behaviors

1. **When** the user runs `adev issues migrate --to <backend>` without `--from` **then** the verb reads the current `tasks.backend` from `manifest.yaml` and uses it as the source backend.
2. **When** the user passes `--from <backend>` **then** the verb overrides the manifest source and uses the provided value as the source backend.
3. **When** source backend equals target backend **then** the verb emits `MIGRATE_NOOP` and exits non-zero without reading or writing any state.
4. **When** `--to` is omitted **then** the verb emits `MIGRATE_MISSING_TARGET` (usage error) and exits non-zero.
5. **When** `--to` is supplied with an unknown backend name **then** the verb emits `MIGRATE_UNKNOWN_BACKEND` listing the supported values and exits non-zero.
6. **When** `--to file` is supplied **then** the verb emits `MIGRATE_TARGET_READONLY` (file backend is read-only-deprecated) and exits non-zero.
7. **When** `--to beads` is supplied and `br` is not on PATH **then** the verb emits `BEADS_NOT_AVAILABLE` with an install hint and exits non-zero before reading any source state.
8. **When** the source store is malformed (unparseable tasks.md, corrupt tasks.json, or unreadable .beads-map.json) **then** the verb emits `MIGRATE_SOURCE_INVALID` with path and line/key context and aborts before any target writes occur.
9. **When** migrating json → beads **then** for each non-epic in-scope item the verb calls `BeadsAdapter.create()` (which runs `br create` and writes a `.beads-map.json` entry) and for each in-scope epic calls `BeadsAdapter.createEpic()` (which delegates to FileAdapter and writes the epic into `tasks.md`). Fields title, type, priority, notes, epicId, parent_id, planRef, spec_ref, next_action are passed through verbatim.
10. **When** migrating beads → json **then** for each in-scope item the verb calls `JsonAdapter.create()` (epics via `JsonAdapter.createEpic()`) with the same field set as above.
11. **When** an item being migrated already exists on the target (json → beads: `.beads-map.json` entry present; beads → json: title AND spec_ref match, or original id present in target notes metadata) **then** the verb increments the `skipped` counter and does not re-create the item.
12. **When** the default scope is in effect (no `--include-closed`) **then** items with status `closed` are excluded from both creation and dependency replay. With `--include-closed`, closed items are migrated alongside the others.
13. **When** all in-scope items have been created **then** the verb replays `addDependency(itemId, depId)` calls on the target backend for every in-scope source dependency edge.
14. **When** a dependency edge references an item outside the migration scope (e.g., closed item excluded by default) **then** the verb emits a warning naming both ids and skips that edge — it does not abort.
15. **When** `--dry-run` is supplied **then** the verb performs read-only operations, prints a JSON report on stdout, exits zero, and writes neither target state nor `.beads-map.json` entries.
16. **When** a non-dry-run migration completes without unrecoverable error **then** the verb prints a JSON report on stdout, prints a manifest-update suggestion to stderr (or a labelled stdout section), and exits zero.
17. **When** a non-dry-run migration aborts mid-flight (e.g., `br create` fails) **then** the verb writes `.context-index/tasks/.migrate-state.json` capturing the last-successful index and source/target backend names, emits `MIGRATE_PARTIAL_FAILURE`, and exits non-zero.
18. **When** the verb is re-invoked after a partial-failure abort **then** it reads `.migrate-state.json`, resumes from the next index, and removes the state file on successful completion.
19. **When** the verb is run under `--auto` **then** the `tasks.backend` value in `manifest.yaml` MUST NOT be modified — even on successful completion. The manifest-update prompt is still printed but no write occurs.

### Preconditions

- `.context-index/` exists with a valid `manifest.yaml` containing a `tasks.backend` entry.
- Source backend storage is readable (e.g., `tasks.md` or `tasks.json` parseable; for beads, `br list --json` returns successfully).
- Target backend prerequisites satisfied (e.g., `br` on PATH when target is beads).
- The user has resolved any prior `.migrate-state.json` from a different source/target pair before invoking with new arguments — the verb refuses to resume across mismatched argument sets.

### Postconditions (Behavioral, summary)

- See **Postconditions** section above.
- On non-zero exit, no target-backend state was written unless the partial-failure path produced a `.migrate-state.json` and at least one prior item was already created.

### Error Cases

| Condition | Expected Behavior | Exit |
|-----------|------------------|------|
| `--to` missing | `MIGRATE_MISSING_TARGET` usage error | non-zero |
| `--to` value not in `{json, beads, file}` | `MIGRATE_UNKNOWN_BACKEND` listing valid values | non-zero |
| `--to file` | `MIGRATE_TARGET_READONLY` (file backend is read-only-deprecated) | non-zero |
| source == target | `MIGRATE_NOOP` | non-zero |
| target = beads, `br` not on PATH | `BEADS_NOT_AVAILABLE` + install hint | non-zero |
| Malformed source store | `MIGRATE_SOURCE_INVALID` with path/line/key | non-zero |
| Partial mid-write failure | `MIGRATE_PARTIAL_FAILURE`; `.migrate-state.json` written | non-zero |
| Successful migration | JSON report + manifest-update prompt | 0 |
| Successful dry-run | JSON report (`would_create` shape) | 0 |
| Resumed migration completes | JSON report + state file removed | 0 |

## Claim Lease Expiry (issue-610)

<!-- Scope note: this spec's `source-manifest.files` claims `lib/cli/issues.mjs`
     — the `adev issues <subcommand>` dispatcher — so the claim/release/stale
     sub-verbs are recorded here, as the `claim` work already was (commit
     da45a279). The spec's PROSE is otherwise about `adev issues migrate`; that
     title/scope mismatch is a real hygiene finding, not something to fix by
     silently moving ownership. Flag it for /adev:hygiene. -->

A claim (`adev issues claim <id> --owner <name>`) is a **lease**, not a lock. Without expiry, the first crashed or abandoned session holds an issue forever and the claim gate becomes something people route around — worse than no gate, because it trains bypassing.

**Configuration.** `manifest.tasks.claim_ttl_minutes` — default `240` (4 hours: longer than a long agent session, shorter than a working day). `0` disables expiry (claims live until released). Any other value must be an integer ≥ 1; anything else (float, word, boolean, negative) is rejected at adapter construction with `BOARD_INVALID_CLAIM_TTL_MINUTES` rather than silently defaulted, mirroring the `cas_lock_stale_seconds` rejection contract. Resolution order: explicit adapter option → manifest file → default; one resolution path, so the report and the gate cannot disagree.

**Definition.** A claim is STALE when `owner` is set, expiry is enabled, `claimed_at` parses, and `now - claimed_at >= ttl`. Staleness is proven, never assumed: an owner with a missing or unparseable `claimed_at` is treated as LIVE (fail closed), so a malformed row never hands work to a second agent.

### Behaviors

20. **When** an issue is claimed by a different owner and the lease has NOT elapsed **then** `claim` refuses with `ISSUE_ALREADY_CLAIMED` (exit 2) — unchanged behavior.
21. **When** an issue is claimed by a different owner and the lease HAS elapsed **then** `claim` succeeds: `owner` becomes the new claimant and `claimed_at` is stamped fresh. The staleness test runs inside `_withCas`, against the same snapshot the write is validated against, so concurrent takeovers still resolve to exactly one winner.
22. **When** a takeover occurs **then** the displaced owner is reported back on the claim result as an ephemeral `takeover: { previous_owner, previous_claimed_at, ttl_minutes }` — printed on stderr by the CLI and emitted under `--json`. It is NOT persisted: adding a `previous_owner` column would thread a fifth field through the fixed whitelist documented above `REF_FIELD_CODES` (six sites; a field missing from the return literal is silently dropped) to store history rather than 1:1 board state.
23. **When** the SAME owner re-claims a stale lease **then** `claimed_at` advances — an expired lease is a new claim even for its original holder, because nobody can prove the old holder is still alive. Re-claiming a LIVE lease remains idempotent and preserves the original `claimed_at`.
24. **When** the issue is closed **then** `claim` refuses with `ISSUE_CLOSED` regardless of lease age: expiry frees a claim, it does not reopen work.
25. **When** `claim_ttl_minutes` is `0` **then** no claim ever goes stale and `claim` behaves exactly as it did before this change.
26. **When** `release` is called **then** lease age changes nothing: the holder may always release their own claim, stale or not, and a non-holder still needs `--force`. Recovering a dead session's issue is `claim`'s job; a second bypass shape on this gate would train the behavior the gate exists to prevent.
27. **When** the user runs `adev issues stale [--json]` **then** the verb lists claims whose lease has expired plus, separately, claims that can never expire (`owner` with no parseable `claimed_at`), reports the live-claim count and the configured `ttl_minutes`, mutates nothing, and exits 0. Closed issues are excluded even when they still carry a claim (`close()` never clears `owner`), because such rows are not actionable — claiming them returns `ISSUE_CLOSED` — and a report that is mostly noise is one people stop reading. `--json` emits `{ ttl_minutes, expiry_enabled, generated_at, stale[], unexpirable[], live_count }` for `/adev:status`.

### Error Cases (claim lease)

| Condition | Expected Behavior | Exit |
|-----------|------------------|------|
| Live claim by another owner | `ISSUE_ALREADY_CLAIMED` | 2 |
| Stale claim by another owner | Takeover succeeds; displaced owner reported on stderr | 0 |
| Claimed issue with no parseable `claimed_at` | Treated as live → `ISSUE_ALREADY_CLAIMED`; listed under `unexpirable` by `adev issues stale` | 2 |
| Invalid `tasks.claim_ttl_minutes` | `BOARD_INVALID_CLAIM_TTL_MINUTES` at adapter construction | non-zero |
| `release` of a stale claim by its holder | Succeeds; `branch`/`pr` retained | 0 |
| `release` of a stale claim by a non-holder without `--force` | `CLAIM_OWNER_MISMATCH` | 2 |
| Backend with no atomic claim primitive | `CLAIM_UNSUPPORTED_BACKEND` (`adev issues stale` still works — it is read-only) | 1 |

## Procedure

<!-- Steps the operator (or the CLI verb itself) follows. Steps are described
     at the level of CLI invocations; the underlying implementation lives in
     lib/cli/issues-migrate.mjs (to be created in /adev:plan). -->

### Step 1: Validate arguments and environment

- Parse `--to`, `--from`, `--include-closed`, `--dry-run`.
- Validate `--to` ∈ `{json, beads, file}`; reject `file` with `MIGRATE_TARGET_READONLY`.
- Resolve source backend: `--from` if supplied, otherwise `manifest.yaml::tasks.backend`.
- Compare source vs target; emit `MIGRATE_NOOP` if equal.
- If target = `beads`, verify `br` is on PATH; otherwise emit `BEADS_NOT_AVAILABLE`.

### Step 2: Detect resume state

- Read `.context-index/tasks/.migrate-state.json` if present.
- If the state file's `source` and `target` match the current invocation, set `start_index` to `last_successful_index + 1`. Otherwise refuse: print an error explaining the mismatch and instruct the user to either re-run with matching arguments or delete the state file.

### Step 3: Read source state

- Instantiate the source adapter via `getIssueManager()` (override backend with `--from` when applicable).
- Call `list()` and `listEpics()` to gather all items. Apply the in-scope filter (default excludes `closed`; `--include-closed` keeps all statuses).
- Collect dependency edges from each item's `dependencies` field.
- On parse failure, emit `MIGRATE_SOURCE_INVALID` with the offending path and key context and abort.

### Step 4: Dry-run path (early exit if `--dry-run`)

- Compute `in_scope.issues`, `in_scope.epics`.
- For json → beads: read `.beads-map.json` (if present) and count entries whose source ids match in-scope items as `already_migrated`. For beads → json: count target items whose (title, spec_ref) tuple matches an in-scope source item as `already_migrated`.
- Compute `dependencies_to_replay` = count of in-scope edges where both endpoints are in scope.
- Print the dry-run JSON object on stdout: `{ source, target, in_scope: { issues, epics }, already_migrated, would_create: { issues, epics }, dependencies_to_replay }`.
- Exit 0. Do not write any target state.

### Step 5: Live migration loop

- For each in-scope item starting at `start_index`:
  - Check idempotency: skip if already migrated (per Step 4's matching rule); increment `skipped`.
  - Otherwise call the target adapter's `create()` (or `createEpic()` for epics) with the field set listed in Behavior 9/10.
  - On success: update `.migrate-state.json` with the new `last_successful_index` (atomic write via temp-rename).
  - On failure: write the final state to `.migrate-state.json`, emit `MIGRATE_PARTIAL_FAILURE` with the failing item id and underlying error, exit non-zero.

### Step 6: Replay dependencies

- For each in-scope source edge `(itemId → depId)`:
  - Resolve the corresponding ids on the target (via `.beads-map.json` for json → beads, or via the target's id for beads → json).
  - Call `addDependency(targetItemId, targetDepId)`.
  - If either endpoint is missing on the target (e.g., closed item excluded by default), emit a warning naming both source ids and skip.

### Step 7: Report and cleanup

- Print the run JSON object on stdout: `{ source, target, created: { issues, epics }, skipped, dependencies_replayed, manifest_update_suggested: true, errors: [] }`.
- Print the manifest-update suggestion: `"Migration complete. Update tasks.backend in .context-index/manifest.yaml to '<target>' to use the migrated board."` (Do NOT write the manifest. Under `--auto`, this prompt is still printed; the manifest is still NOT written.)
- Remove `.context-index/tasks/.migrate-state.json` if it exists.
- Exit 0.

## Idempotency

- **json → beads:** Re-running is safe. The verb consults `.beads-map.json` before creating any item; items already mapped are skipped and counted under `skipped`. Newly created items are recorded into `.beads-map.json` immediately after creation so a crash between adapter calls leaves a consistent map (atomic write via temp-rename).
- **beads → json:** Re-running is safe. The verb matches items by `(title, spec_ref)` — or by an `original_id` value stored in the migrated item's `notes` metadata — and skips matches.
- **Dependency replay:** Re-running an already-replayed edge is a no-op at the adapter layer (both `JsonAdapter.addDependency()` and `BeadsAdapter.addDependency()` are idempotent; duplicate edges are coalesced).
- **Partial failure mid-write:** `.context-index/tasks/.migrate-state.json` records `{ source, target, last_successful_index, scope_args }`. A subsequent run with matching `--to`/`--from`/`--include-closed` resumes from the next item. A run with mismatched arguments is refused (the user must reconcile manually before resuming).
- **Read-only steps:** `--dry-run` writes nothing. Running it any number of times is harmless and produces the same JSON shape.

## Rollback

- **For the migration as a whole:** Rollback is to discard the target backend's newly created items. The verb does NOT provide an automated rollback. Operators should either (a) delete the target store (`tasks.json` for json target; `br` items via `br close` + DB reset for beads target) or (b) flip `tasks.backend` back to the original value in `manifest.yaml`.
- **For `.beads-map.json`:** Discarding the beads target should be paired with deleting `.beads-map.json` to avoid stale id mappings on a future re-migration.
- **For `.migrate-state.json`:** Operators may safely delete this file at any time; the next migration starts fresh from index 0.
- **Manifest:** Since the verb never writes `manifest.yaml`, no rollback of `tasks.backend` is required.

## Dry-Run Output Shape

```json
{
  "source": "json",
  "target": "beads",
  "in_scope": { "issues": 42, "epics": 6 },
  "already_migrated": 11,
  "would_create": { "issues": 31, "epics": 5 },
  "dependencies_to_replay": 17
}
```

The numbers above are illustrative. `would_create.epics` may be less than `in_scope.epics` if some epics are already on the target. The verb writes nothing to stdout besides this JSON object (and warnings to stderr where applicable).

## Live-Run Output Shape

```json
{
  "source": "json",
  "target": "beads",
  "created": { "issues": 31, "epics": 5 },
  "skipped": 11,
  "dependencies_replayed": 16,
  "manifest_update_suggested": true,
  "errors": []
}
```

`dependencies_replayed` may be lower than the dry-run's `dependencies_to_replay` when an edge endpoint was excluded mid-run (the matching warning lines appear on stderr). On `MIGRATE_PARTIAL_FAILURE`, `errors[]` carries the failing item id and the underlying adapter error.

## System Constitution Reference

- **Principle 1 — Minimize external dependencies** — Applies because the migration verb composes existing adapters (`JsonAdapter`, `BeadsAdapter`, `FileAdapter`) and the existing `getIssueManager()` registry. No new external dependencies are introduced; `br` is treated as a process boundary, not a library dependency.
- **Principle 3 — Pure ESM** — Applies because the verb implementation lives in `lib/cli/issues-migrate.mjs` as a `.mjs` ES module dispatched from `cli/index.mjs`.
- **Principle 2 — Skills are primarily markdown** — Applies because no skill is introduced by this spec; the surface is a single CLI verb under `adev <verb>` per the `cli-driver-surface` charter. SKILL.md files referencing the verb (if any are added later) must remain markdown-only.
- **Storage Format Authority (charter Domain Model)** — Applies because the verb conforms to the storage contracts owned by the `agent-reliable-state-artifacts` charter (`.beads-map.json` schema, atomic temp-rename writes) without redefining them.
- **Board granularity invariant** — Applies because items created on the target during migration MUST preserve the source's separation of `planRef` and `planTask` (both never set on the same Feature). The verb passes these fields through unchanged.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|------------------|
| task-management (this charter) | High | Adds the `adev issues migrate` CLI verb. No changes to existing adapter contracts. |
| cli | Medium | New verb dispatch in `cli/index.mjs` and helper in `lib/cli/issues-migrate.mjs`. |
| lib/issues | Low | Adapters are consumed read-only; no API changes. New consumer of `.beads-map.json` mapping for idempotency. |
| agent-reliable-state-artifacts | Low | `.migrate-state.json` is a new state artifact under `.context-index/tasks/`. Must be added to the gitignore and (if applicable) the partial-artifact registry. |

## Integration Points

1. **lib/issues/registry.mjs** — The verb calls `getIssueManager()` twice: once with the source backend (potentially overridden by `--from`) and once with the target backend. The registry's existing `SUPPORTED_BACKENDS` constant is the authoritative list for `--to` validation.
2. **lib/issues/beads-adapter.mjs** — The verb consumes `BeadsAdapter.create()` and `BeadsAdapter.createEpic()`, both of which already write `.beads-map.json` entries and delegate epics to FileAdapter. The verb does not poke at `.beads-map.json` directly except to read entries for idempotency checks.
3. **lib/issues/json-adapter.mjs** — The verb consumes `JsonAdapter.create()` and `JsonAdapter.createEpic()`. The adapter's `BOARD_GRANULARITY_VIOLATION` guard is preserved (rejects `planRef`+`planTask` on the same item).
4. **lib/manifest.mjs** — The verb reads `tasks.backend` via `loadManifest()`. It never writes the manifest.
5. **agent-reliable-state-artifacts** — The verb uses temp-rename atomic writes for `.migrate-state.json`. The artifact lives in `.context-index/tasks/` and inherits the existing partial-artifact conventions.
6. **`/adev:issues`** — Out of scope for this spec. The migrate verb is a separate, non-interactive CLI surface; the `/adev:issues` skill remains unchanged.

## Actionable Task Map

<!-- Preliminary breakdown; the full plan lives in /adev:plan output. -->

| Task | Description | Complexity |
|------|-------------|------------|
| Implement `lib/cli/issues-migrate.mjs` | Argument parsing, source/target resolution, scope filtering, dry-run path, live loop, dependency replay. | Medium |
| Wire `migrate` verb into `cli/index.mjs` issues subcommand dispatch | Add the verb name to the dispatch table; route to the new helper. | Low |
| Implement `.migrate-state.json` read/write | Temp-rename atomic write; argument-set guard on resume. | Low |
| Implement idempotency lookups | Read `.beads-map.json` for json → beads; title+spec_ref match for beads → json (with `original_id` fallback in notes metadata). | Medium |
| Implement dependency replay | Resolve target ids per edge endpoint; call `addDependency`; emit warnings for out-of-scope endpoints. | Low |
| Add `.migrate-state.json` to `.gitignore` | New ignore line under `.context-index/tasks/`. | Low |
| Tests: argument validation | Unit tests for missing `--to`, unknown backend, `--to file`, source == target, beads-not-on-path. | Low |
| Tests: dry-run output shape | Unit test asserts the JSON keys and that no state is written. | Low |
| Tests: live json → beads | Mocked `execFileSync` for `br`; verify `.beads-map.json` entries, dependency replay, and idempotent re-run. | Medium |
| Tests: live beads → json | Mocked `execFileSync`; verify `JsonAdapter` writes, skip on title+spec_ref match. | Medium |
| Tests: partial-failure resume | Force a mid-loop failure; assert `.migrate-state.json`; re-run and assert resume completes. | Medium |
| Tests: manifest never written under `--auto` | Snapshot manifest before and after; assert byte-equal. | Low |
| Tests: dependency edge skipped warning | In-scope item depends on closed item; assert warning text and that no edge was created. | Low |

## Acceptance Criteria

- [ ] `adev issues migrate --to <backend>` is registered in `cli/index.mjs`.
- [ ] All postconditions above hold after a successful non-dry-run migration on a populated json store.
- [ ] All error cases from the Error Cases table return the documented exit-non-zero behavior with the documented error code on stderr.
- [ ] `--dry-run` writes no target-backend state and no `.beads-map.json` entries.
- [ ] Idempotent re-run (json → beads) reports `skipped > 0` and `created.issues = 0` when nothing has changed on the source.
- [ ] Idempotent re-run (beads → json) reports `skipped > 0` and `created.issues = 0` when nothing has changed on the source.
- [ ] Partial-failure path writes a valid `.migrate-state.json`; subsequent re-run with matching arguments resumes and removes the state file on completion.
- [ ] `.context-index/tasks/.migrate-state.json` is present in `.gitignore`.
- [ ] `manifest.yaml::tasks.backend` is byte-equal before and after the verb runs (any mode, including `--auto`).
- [ ] Dependency edges to out-of-scope items are surfaced as warnings (not silent drops).
- [ ] `BeadsAdapter` and `JsonAdapter` interfaces are unchanged (no new public methods).
- [ ] All existing task-management tests continue to pass.
- [ ] `manifest.tasks.claim_ttl_minutes` is honored (default 240, `0` disables) and invalid values reject at construction with `BOARD_INVALID_CLAIM_TTL_MINUTES`.
- [ ] A stale claim is taken over by the next claimant with a fresh `claimed_at`; a live claim by another owner is still refused with `ISSUE_ALREADY_CLAIMED`.
- [ ] The staleness check runs inside `_withCas`, and exactly one of N concurrent claimants wins a stale issue.
- [ ] The displaced owner appears on the claim result and in `--json` output, and appears nowhere on the persisted board.
- [ ] `adev issues stale [--json]` lists expired and unexpirable claims, mutates nothing, and is referenced from `skills/status/SKILL.md`.
- [ ] Releasing a stale claim is not an error, and non-holder release still requires `--force`.
- [ ] Constitution gates pass: no new external dependencies, pure ESM, no inline-Node in SKILL.md (none added by this spec), board-granularity invariant preserved.
