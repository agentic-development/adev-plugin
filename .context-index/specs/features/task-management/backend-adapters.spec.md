# Live Spec: Backend Adapters and Registry

---
charter: task-management
status: validated
milestone:
revision: 2
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

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `manifest.yaml`
- For file backend: `.context-index/tasks/` directory is writable
- For beads backend: `br` CLI is on PATH at **>= 0.2.0** and `.beads/` is initialized

### Behaviors

**File Backend:**

1. **When** the file adapter initializes **then** it creates `.context-index/tasks/tasks.md` if it does not exist, with an empty markdown table structure containing headers for epics and issues.
2. **When** an issue is created via the file adapter **then** a new row is appended to the issues table in `tasks.md` with auto-incremented `issue-N` ID.
3. **When** an epic is created via the file adapter **then** a new row is appended to the epics table in `tasks.md` with auto-incremented `epic-N` ID.
4. **When** an issue is updated or closed via the file adapter **then** the corresponding row in `tasks.md` is modified in place and the file is written via temp-file-then-rename to prevent corruption.
5. **When** `list(filters)` is called on the file adapter **then** the adapter parses the markdown table and returns matching issue objects.
6. **When** the `tasks.md` file is read by an agent or user **then** it renders as a readable markdown table in any viewer.

**Beads Backend:**

7. **When** the beads adapter initializes **then** it runs `br --version` and throws `BEADS_NOT_AVAILABLE` if not found, or `BEADS_VERSION_UNSUPPORTED` when the version is below `MIN_BR_VERSION` (0.2.0).

**Beads Backend — br 0.2.x contract (rev 2):**

> Added 2026-08-13. Everything below was found by driving a real `br` binary rather than a mock; the adapter had been written against br 0.1.x and was **completely non-functional** against 0.2.x.

13. **When** the adapter builds a `br` invocation **then** `--db` receives the database FILE resolved from inside `.beads/` (preferring `beads.db`), never the workspace DIRECTORY. Passing the directory yields `Database error: I/O error: Is a directory (os error 21)` on every call.
14. **When** the resolved database path contains a symlinked parent component **then** it is canonicalized with `realpathSync.native` first, because br refuses such a route outright (`Refusing configured database route with a symlinked parent`). On macOS `/var` → `/private/var` alone triggers this.
15. **When** `.beads/` holds no database **then** `--db` is omitted so br applies its own auto-discovery and reports its own error.
16. **When** a `br` invocation fails **then** the raised `BEADS_COMMAND_FAILED` message carries whichever stream spoke — br writes structured JSON errors to **stdout** and leaves stderr empty, so a stderr-only message degrades to a bare `Command failed: <argv>`.
17. **When** `claim(id, owner)` is called **then** exclusivity is delegated to `br update --claim`, which sets assignee=actor + status=in_progress and refuses an already-held issue inside br's own transaction. adev's `owner` maps onto br's `assignee` because assignee is the field `--claim` guards; `claimed_at` has no br column and lives in the sidecar map, driving lease expiry only.
18. **When** `claim`/`release` evaluate preconditions **then** they call the SAME `requireClaimable` / `requireReleasable` helpers as the json backend, so refusal codes (`ISSUE_ALREADY_CLAIMED`, `ISSUE_CLOSED`, `CLAIM_OWNER_MISMATCH`) and CLI exit codes are identical across backends and callers never branch on backend.
19. **When** epics are created, listed, updated, or walked **then** they are delegated to a lazily-constructed local `JsonAdapter`, because `br epic` exposes only `status` and `close-eligible` — there is no br epic adev can create. The delegate is constructed lazily because `BeadsAdapter` is legitimately built against non-existent paths (the availability probe in `lib/cli/issues-migrate.mjs`), while `JsonAdapter` validates its root eagerly.

### Known non-parity (beads)

| Capability | Behavior |
|---|---|
| **Stale-lease takeover** | **Not atomic.** br refuses to reassign a held issue, so expiring a lease takes two calls (clear assignee, then `--claim`). Two agents observing the same expired lease can both proceed. The window is bounded by TTL expiry rather than contention — far narrower than no gate at all — but `tasks.backend: json` is the backend with an atomic takeover. |
| `claimed_at`, `branch`, `pr`, `epicId`, `planRef`, `planTask`, `spec_ref` | No br column; stored in `.context-index/tasks/.beads-map.json`. The sidecar write is not atomic with the br call, so a crash between them can leave the lease stamp and the assignee disagreeing. Exclusivity is unaffected — that is br's `--claim`, not the sidecar. |
| Epics | Not stored in beads at all (behavior 19). A beads project's epics live in `tasks.json`; `br list` will not show them. |
| Issue IDs | br 0.2.x mints hash-like ids (`tst-i6s`). adev keeps its own sequential `issue-N` namespace in the sidecar and maps between them. |
8. **When** an issue is created via the beads adapter **then** it runs `br create` with title, type, and priority as discrete arguments via `execFileSync('br', ['create', title, '--type', type, '--priority', String(priority), '--json'])` and stores the returned beads ID in `.context-index/tasks/.beads-map.json`. All `br` CLI invocations MUST use `execFileSync` with arguments as an array — never string interpolation or `execSync` with a command string — to prevent shell injection.
9. **When** an issue is updated via the beads adapter **then** it runs `execFileSync('br', ['update', beadsId, '--status', status, '--json'])`.
10. **When** an issue is closed via the beads adapter **then** it runs `execFileSync('br', ['close', beadsId, '--reason', reason])`.
11. **When** `list()` is called on the beads adapter **then** it runs `br list --json`, maps beads IDs back to issue IDs using the beads-map, and applies filters (status, type, epicId, planRef) in-process on the returned results. The `epicId` and `planRef` filters use metadata from `.beads-map.json` since beads does not track these fields natively.
12. **When** `addDependency()` is called on the beads adapter **then** it runs `execFileSync('br', ['dep', 'add', beadsId1, beadsId2])`.
13. **When** `createEpic()` or `updateEpic()` is called on the beads adapter **then** epic operations are delegated to the file adapter (hybrid approach). The beads_rust CLI has no epic concept, so epics are always stored in `.context-index/tasks/tasks.md` regardless of backend. The beads adapter composes with a FileAdapter instance internally for epic operations only.

**Registry:**

14. **When** `getIssueManager(manifest)` is called with `tasks.backend: "file"` **then** it returns a FileAdapter instance.
15. **When** `getIssueManager(manifest)` is called with `tasks.backend: "beads"` and `br` is on PATH **then** it returns a BeadsAdapter instance.
16. **When** `getIssueManager(manifest)` is called with `tasks.backend: "beads"` but `br` is not on PATH **then** it logs a warning and returns a FileAdapter instance (auto-fallback).
17. **When** `getIssueManager(manifest)` is called with no `tasks.backend` configured **then** it returns a FileAdapter instance (default).
18. **When** `getIssueManager(manifest)` is called with an unknown `tasks.backend` value **then** it throws `UNKNOWN_BACKEND` with the invalid value. The registry validates against a fixed allowlist (`file`, `beads`).

### Postconditions

- File backend: `tasks.md` is always a valid, parseable markdown file after any operation
- Beads backend: `.beads-map.json` stays in sync with beads state
- Registry: always returns a working adapter — never throws on backend selection

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| File backend: `tasks.md` is corrupted/unparseable | Log warning, attempt recovery by re-reading; if unrecoverable, throw `PARSE_ERROR` | PARSE_ERROR |
| Beads backend: `br` command fails | Throw `BEADS_COMMAND_FAILED` with stderr output | COMMAND_FAILED |
| Beads backend: `br` not on PATH | Registry falls back to file adapter with warning | N/A (handled) |
| Beads backend: `.beads-map.json` missing | Rebuild by running `br list --json` and matching by title | N/A (auto-recovery) |
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
| ID mapping | Implement `.beads-map.json` read/write/rebuild for beads adapter | small |
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
- [ ] Beads adapter maintains `.beads-map.json` mapping between issue IDs and beads IDs
- [ ] Registry falls back to file backend when `br` is not available, with a logged warning
- [ ] Registry defaults to file backend when `tasks.backend` is not configured
- [ ] `templates/manifest-template.yaml` includes a `tasks:` section with backend config
- [ ] `.beads-map.json` is gitignored
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
