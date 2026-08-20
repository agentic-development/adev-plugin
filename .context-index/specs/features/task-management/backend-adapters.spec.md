---
charter: task-management
status: validated
milestone:
revision: 3
charter-revision: 3
created: 2026-03-31
updated: 2026-08-13
source-manifest:
  sha: "059da9e"
  files:
    - lib/issues/beads-adapter.mjs
    - lib/issues/file-adapter.mjs
    - lib/issues/registry.mjs
    - tests/lib/issues-beads-adapter.test.mjs
    - tests/lib/issues-file-adapter.test.mjs
    - tests/lib/issues-registry.test.mjs
  computed-at: "2026-04-01T13:43:22.545Z"
drift_detected: true
---

# Live Spec: Backend Adapters and Registry

## Behavioral Contract

### Flat ID allocation — all backends (issue-613)

> Added 2026-08-13. `max(existing) + 1` is safe against concurrent writers of one file (the CAS lock) and across worktrees (`resolveStorageRoot`), but NOT across git branches: two sessions off the same baseline mint the same number, both are locally valid, and the collision only surfaces at merge. It did — two different `issue-589`s, and an `epic-108` referenced on main that existed on no board.

- Flat ids are minted as `<prefix>-<6 base36 chars>` from `crypto.randomBytes` (`mintFlatId` in `lib/issues/id-utils.mjs`), re-rolled against the current board and bounded at 8 attempts (`ID_MINT_EXHAUSTED`).
- Randomness — not a wider counter — is what removes the need for coordination: no shared state has to be consulted to know an id is unique, which is precisely what a branch cannot consult.
- **Existing sequential ids are never rewritten.** They appear in merged commits, specs, and prose. `parseId` recognizes both shapes as `legacy: true`, so every caller — all of which branch on `.legacy`, never on the suffix — treats them identically.
- On the beads backend the same scheme composes with br's uniqueness constraint on `external_ref`: a residual collision becomes a rejected write rather than a silent duplicate.
- **Not covered:** tiered dotted ids (`e1.f2.t3`) still allocate via `nextChildId`'s max+1 and remain branch-unsafe. No board in this repo uses them (0 of 295 entries), so the fix was scoped to flat ids rather than speculatively redesigning the tiered model.
- **Cost accepted:** board order is no longer implied by id. `render-markdown` groups by lexicographic id, which for random ids is arbitrary; chronological order comes from the `created` field.

### Preconditions

- `.context-index/` exists with `manifest.yaml`
- For file backend: `.context-index/tasks/` directory is writable
- For beads backend: `br` CLI is on PATH at **>= 0.2.19** and `.beads/` is initialized

### Behaviors

**File Backend:**

1. **When** the file adapter initializes **then** it creates `.context-index/tasks/tasks.md` if it does not exist, with an empty markdown table structure containing headers for epics and issues.
2. **When** an issue is created via the file adapter **then** a new row is appended to the issues table in `tasks.md` with auto-incremented `issue-N` ID.
3. **When** an epic is created via the file adapter **then** a new row is appended to the epics table in `tasks.md` with auto-incremented `epic-N` ID.
4. **When** an issue is updated or closed via the file adapter **then** the corresponding row in `tasks.md` is modified in place and the file is written via temp-file-then-rename to prevent corruption.
5. **When** `list(filters)` is called on the file adapter **then** the adapter parses the markdown table and returns matching issue objects.
6. **When** the `tasks.md` file is read by an agent or user **then** it renders as a readable markdown table in any viewer.

**Beads Backend:**

7. **When** the beads adapter initializes **then** it runs `br --version` and throws `BEADS_NOT_AVAILABLE` if not found, or `BEADS_VERSION_UNSUPPORTED` when the version is below `MIN_BR_VERSION` (0.2.19).

   The floor answers to two boundaries, and only the first is about compatibility:
   0.2.0 moved `--db` from the workspace directory to the database file and added
   atomic `update --claim` (so 0.1.x cannot work at all), while **0.2.19 shipped the
   engine fix for deterministic database corruption caused by merge operations**.
   0.2.0–0.2.18 are API-compatible and therefore pass every functional check while
   silently exposed, which is why the floor is a safety boundary rather than a
   compatibility one and must not be lowered back to 0.2.0.

**Beads Backend — br 0.2.x contract (rev 2):**

> Added 2026-08-13. Everything below was found by driving a real `br` binary rather than a mock; the adapter had been written against br 0.1.x and was **completely non-functional** against 0.2.x.

13. **When** the adapter builds a `br` invocation **then** `--db` receives the database FILE resolved from inside `.beads/` (preferring `beads.db`), never the workspace DIRECTORY. Passing the directory yields `Database error: I/O error: Is a directory (os error 21)` on every call.
14. **When** the resolved database path contains a symlinked parent component **then** it is canonicalized with `realpathSync.native` first, because br refuses such a route outright (`Refusing configured database route with a symlinked parent`). On macOS `/var` → `/private/var` alone triggers this.
15. **When** `.beads/` holds no database **then** `--db` is omitted so br applies its own auto-discovery and reports its own error.
16. **When** a `br` invocation fails **then** the raised `BEADS_COMMAND_FAILED` message carries whichever stream spoke — br writes structured JSON errors to **stdout** and leaves stderr empty, so a stderr-only message degrades to a bare `Command failed: <argv>`.
17. **When** `claim(id, owner)` is called **then** exclusivity is delegated to `br update --claim`, which sets assignee=actor + status=in_progress and refuses an already-held issue inside br's own transaction. adev's `owner` maps onto br's `assignee`, which is its ONLY home — assignee is the field `--claim` guards. The claim and its `claimed_at` lease stamp are written in ONE `br update --claim --agent-context …` call; br rolls the context write back when it refuses the claim, so the holder and the stamp cannot disagree.
18. **When** `claim`/`release` evaluate preconditions **then** they call the SAME `requireClaimable` / `requireReleasable` helpers as the json backend, so refusal codes (`ISSUE_ALREADY_CLAIMED`, `ISSUE_CLOSED`, `CLAIM_OWNER_MISMATCH`) and CLI exit codes are identical across backends and callers never branch on backend.
19. **When** epics are created, listed, or updated **then** they are native beads issues created with `br create -t epic --external-ref epic-N`. `br epic` exposes only `status` and `close-eligible`, but that is a reporting surface — an epic is an ordinary br issue with `issue_type: epic`, so no local store is needed. Legacy `epic-N` items are the `listEpics()` collection and are excluded from `list()`, mirroring the json backend's separate `epics` array.

**Beads Backend — single source of truth (rev 3):**

> Added 2026-08-13. Rev 2 kept a `.context-index/tasks/.beads-map.json` sidecar plus a local epic store. That dual state caused a real fail-open: `requireClaimable` read the sidecar while exclusivity lived in br's `assignee`, so a human running `br update --claim` directly left the gate seeing "unclaimed". Both stores are gone.

20. **When** the adapter needs any adev state **then** it reads it from beads. The complete mapping is: adev id (`issue-N` / `epic-N`) → br `external_ref`; claim holder (`owner`) → br `assignee`; `status` / `title` / `priority` / `type` / `notes` → br's own columns; epics → br issues of type `epic`; parent/child → `br create --parent`; and `epicId`, `parent_id`, `planRef`, `planTask`, `spec_ref`, `next_action`, `branch`, `pr`, `claimed_at`, `milestone` → br `agent_context`, namespaced under a top-level `adev` key.
21. **When** an adev id is resolved to a br id **then** it scans `br list -s all --json` for a matching `external_ref`. br cannot address an issue by external_ref (`br update issue-42` → ISSUE_NOT_FOUND) and `br list` has no external-ref filter, so the scan is the only route. The resulting index is DERIVED: rebuilt per call, shared only within a single method, and never written to disk. A cache that outlives a call is the sidecar again.
22. **When** any internal scan runs **then** it passes `-s all`. `br list` hides closed issues by default, and a closed-blind scan would both re-mint an `issue-N` a closed issue already owns and make `get()` return null for closed items that the json backend returns.
23. **When** `agent_context` is written **then** it is read-modify-write over the whole object. br REPLACES the field wholesale, so a partial write silently erases every other field — including a live lease stamp. Top-level keys adev did not write are preserved: `agent_context` is br's own "governing-instructions" field, which a human or another tool may legitimately share.
24. **When** `agent_context` is read **then** malformed, non-object, or absent content degrades to `{}` and never throws. The field is user-writable; one hand-edited value must not make a board unreadable.
25. **When** a new adev id is minted **then** the next number is derived from the highest existing `external_ref` in a `-s all` scan. This is NOT atomic across concurrent creators — br exposes no sequence primitive — but it fails LOUDLY rather than silently: br enforces uniqueness on `external_ref` and rejects the loser with `CONFIG_ERROR` at exit 7, surfaced as `BEADS_COMMAND_FAILED`. The outcome is a failed create, never two issues sharing an id.
26. **When** a legacy `.beads-map.json` or a legacy `tasks.json` epic store is present **then** it is folded into beads on first adapter use: sidecar entries are replayed onto the br issues they name as `external_ref` + `agent_context` (and `assignee`, when the sidecar recorded an owner br does not have), and legacy epics are re-created as native br epics. Every step is keyed on `external_ref`, so a re-run is a no-op and a half-finished run resumes. Migrated files are RENAMED (`.migrated-<timestamp>`), never deleted; `tasks.json` is retired only when it held no issues of its own.
27. **When** a legacy sidecar cannot be honoured — unreadable, or naming br issues that do not exist — **then** the adapter throws `BEADS_LEGACY_MIGRATION_FAILED` naming the entries and leaves the file in place. Ignoring it is indistinguishable from an empty board, which is the outcome this exists to prevent.
28. **When** a read-only consumer constructs the adapter with `{ autoMigrate: false }` **then** no migration write occurs. This is what the `PostToolUse` hook path in `lib/session-capture.mjs` uses, so a hook can never write to the board.
29. **When** `release(id, owner)` is called on the beads adapter and the issue's CURRENT status is `in_progress` **then** the release also reverts status to `open` (`--status open` in the same `br update` call that clears `--assignee`), undoing the transition `claim()` always performs. Without this, a released issue has no owner and no `claimed_at` — no lease left to expire — so it reads as active work by nobody to any `in_progress` coordination scan indefinitely (test-idqa). The revert is conditional: `close()` does not clear the assignee, so a claim can outlive its issue being closed, and releasing that lingering claim must leave a `closed` status untouched rather than reopening it.

### Known non-parity (beads)

| Capability | Behavior |
|---|---|
| **Stale-lease takeover** | **Not atomic**, and not fixable with br's current surface: `--claim` refuses ANY held issue, and `--assignee` has no compare-and-set precondition. Expiring a lease therefore takes two calls (clear assignee, then `--claim`), and the interleaving `A.clear → A.claim → B.clear → B.claim` silently displaces A. The two-call form is kept over a blind single `--assignee` write because `--claim` still refuses the commoner `A.clear → B.clear → A.claim` ordering. Bounded by TTL expiry rather than contention — far narrower than no gate at all — but `tasks.backend: json` is the backend with an atomic takeover. |
| **ID minting** | **Not atomic** (behavior 25). br has no sequence primitive. Fails loudly via br's `external_ref` uniqueness rather than duplicating an id. |
| Dependency edges on `list()` | Always `[]`. `br list --json` projects `dependency_count`, not the edges; reading them needs a per-issue `br dep list`. Pre-existing; `addDependency` itself works. |
| Tiered child ids | `create()` mints flat `issue-N` even when `parent_id` is given (the native `--parent` link is still made). adev's tiered `e1.f2.t3` namespace is not minted on this backend; `walkTree` prefix-matches adev ids, matching json's semantics for ids that do exist. |
| `agent_context` is shared | It is br's field, not adev's — inherited by descendants when `inherited_context.enabled` is set. adev confines itself to the `adev` key and preserves foreign keys, but a human editing that field is editing adev's metadata store. |
| `createEpic({ status })` | `br create` has no status flag, so a non-open status on creation is not persisted (migration handles it separately via `br close`). |
8. **When** an issue is created via the beads adapter **then** it runs `br create` with title, type, and priority as discrete arguments via `execFileSync('br', ['create', title, '--type', type, '--priority', String(priority), '--external-ref', adevId, '--agent-context', json, '--json'])`. All `br` CLI invocations MUST use `execFileSync` with arguments as an array — never string interpolation or `execSync` with a command string — to prevent shell injection.
9. **When** an issue is updated via the beads adapter **then** it runs a SINGLE `execFileSync('br', ['update', beadsId, …flags, '--json'])` carrying both the column changes (`--status`, `--title`, `--priority`, `--type`, `--description`, `--assignee`) and the merged `--agent-context`, so column state and metadata cannot end up disagreeing.
10. **When** an issue is closed via the beads adapter **then** it runs `execFileSync('br', ['close', beadsId, '--reason', reason])`.
11. **When** `list()` is called on the beads adapter **then** it runs `br list -s all --json`, reads each item's adev id from `external_ref` and its metadata from `agent_context`, excludes the legacy `epic-N` collection, and applies filters (status, type, epicId, planRef) in-process. Closed issues are included, matching the json backend.
12. **When** `addDependency()` is called on the beads adapter **then** it runs `execFileSync('br', ['dep', 'add', beadsId1, beadsId2])`.
13b. **When** `createEpic()` or `updateEpic()` is called on the beads adapter **then** it creates or updates a native `br` issue of type `epic` carrying `external_ref: epic-N`. No local store is involved (superseded rev-1 text: epics were once delegated to a file/json adapter).

**Registry:**

14. **When** `getIssueManager(manifest)` is called with `tasks.backend: "file"` **then** it returns a FileAdapter instance.
15. **When** `getIssueManager(manifest)` is called with `tasks.backend: "beads"` and `br` is on PATH **then** it returns a BeadsAdapter instance.
16. **When** `getIssueManager(manifest)` is called with `tasks.backend: "beads"` but `br` is not on PATH **then** it logs a warning and returns a FileAdapter instance (auto-fallback).
17. **When** `getIssueManager(manifest)` is called with no `tasks.backend` configured **then** it returns a FileAdapter instance (default).
18. **When** `getIssueManager(manifest)` is called with an unknown `tasks.backend` value **then** it throws `UNKNOWN_BACKEND` with the invalid value. The registry validates against a fixed allowlist (`file`, `beads`).

### Postconditions

- File backend: `tasks.md` is always a valid, parseable markdown file after any operation
- Beads backend: beads is the only store. No adapter operation creates a file under `.context-index/tasks/`; there is nothing that can fall out of sync with beads state.
- Registry: always returns a working adapter — never throws on backend selection

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| File backend: `tasks.md` is corrupted/unparseable | Log warning, attempt recovery by re-reading; if unrecoverable, throw `PARSE_ERROR` | PARSE_ERROR |
| Beads backend: `br` command fails | Throw `BEADS_COMMAND_FAILED` with stderr output | COMMAND_FAILED |
| Beads backend: `br` not on PATH | Registry falls back to file adapter with warning | N/A (handled) |
| Beads backend: adev id not found on the board | Throw `NOT_FOUND` naming the id | NOT_FOUND |
| Beads backend: legacy `.beads-map.json` present | Migrate its entries into beads, then rename the file aside | N/A (auto-migration) |
| Beads backend: legacy sidecar unmigratable | Throw, naming the entries, and leave the file in place | BEADS_LEGACY_MIGRATION_FAILED |
| Beads backend: malformed `agent_context` | Degrade that item's metadata to empty; never throw | N/A (tolerated) |
| File backend: concurrent writes | Last write wins (acceptable for single-agent use) | N/A |

## System Constitution Reference

- **"Minimize external dependencies"** — File adapter uses only `fs` and `path`. Beads adapter uses `child_process.execSync`. No npm packages.
- **"Pure ESM"** — All adapter files are `.mjs` with ES module imports.
- **"Hook protocol compliance"** — Not directly applicable, but the adapters follow the same exit-code discipline (operations succeed or throw, no silent failures).

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| File adapter | Implement `lib/issues/file-adapter.mjs` with markdown table parse/serialize | large |
| Beads adapter | Implement `lib/issues/beads-adapter.mjs` wrapping `br` CLI | medium |
| ID mapping | Resolve adev ids from br `external_ref` via a `-s all` scan; never persist the index | small |
| Registry | Implement `lib/issues/registry.mjs` with config routing and fallback | small |
| Manifest config | Add `tasks:` section to `templates/manifest-template.yaml` | small |
| File adapter tests | CRUD round-trips, parse/serialize, edge cases | medium |
| Beads adapter tests | Command construction, ID mapping, fallback (mocked execSync) | medium |
| Registry tests | Config routing, detection, fallback behavior | small |

## Acceptance Criteria

- [ ] `lib/issues/file-adapter.mjs` implements the full `IssueManagerInterface`
- [ ] `lib/issues/beads-adapter.mjs` implements the full `IssueManagerInterface`
- [ ] `lib/issues/registry.mjs` exports `getIssueManager(manifest)` with fallback logic
- [ ] File adapter produces valid, human-readable markdown in `tasks.md`
- [ ] File adapter parse/serialize round-trips are lossless (create → read → verify identical)
- [ ] Beads adapter constructs correct `br` CLI commands for each operation
- [x] Beads adapter stores adev ids in br `external_ref` and keeps NO sidecar file
- [ ] Registry falls back to file backend when `br` is not available, with a logged warning
- [ ] Registry defaults to file backend when `tasks.backend` is not configured
- [ ] `templates/manifest-template.yaml` includes a `tasks:` section with backend config
- [x] A legacy `.beads-map.json` is migrated into beads and retired, never silently ignored
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
