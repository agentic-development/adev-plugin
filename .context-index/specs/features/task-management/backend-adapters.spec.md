# Live Spec: Backend Adapters and Registry

---
charter: task-management
status: validated
milestone:
revision: 1
charter-revision: 3
created: 2026-03-31
updated: 2026-04-01
source-manifest:
  sha: "332101d"
  files:
    - lib/issues/beads-adapter.mjs
    - lib/issues/file-adapter.mjs
    - lib/issues/registry.mjs
    - tests/lib/issues-beads-adapter.test.mjs
    - tests/lib/issues-file-adapter.test.mjs
    - tests/lib/issues-registry.test.mjs
  computed-at: "2026-07-03T22:27:11.308Z"
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `manifest.yaml`
- For file backend: `.context-index/tasks/` directory is writable
- For beads backend: `br` CLI is on PATH and `.beads/` is initialized

### Behaviors

**File Backend:**

1. **When** the file adapter initializes **then** it creates `.context-index/tasks/tasks.md` if it does not exist, with an empty markdown table structure containing headers for epics and issues.
2. **When** an issue is created via the file adapter **then** a new row is appended to the issues table in `tasks.md` with auto-incremented `issue-N` ID.
3. **When** an epic is created via the file adapter **then** a new row is appended to the epics table in `tasks.md` with auto-incremented `epic-N` ID.
4. **When** an issue is updated or closed via the file adapter **then** the corresponding row in `tasks.md` is modified in place and the file is written via temp-file-then-rename to prevent corruption.
5. **When** `list(filters)` is called on the file adapter **then** the adapter parses the markdown table and returns matching issue objects.
6. **When** the `tasks.md` file is read by an agent or user **then** it renders as a readable markdown table in any viewer.

**Beads Backend:**

7. **When** the beads adapter initializes **then** it checks `which br` and throws `BEADS_NOT_AVAILABLE` if not found.
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
