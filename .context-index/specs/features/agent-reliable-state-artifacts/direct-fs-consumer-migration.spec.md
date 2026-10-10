# Live Spec: Direct-Filesystem Consumer Migration

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->

---
charter: agent-reliable-state-artifacts
status: review-passed
risk_level: medium
milestone: 0.26.0
revision: 2
charter-revision: 4
created: 2026-05-12
updated: 2026-05-12
---

## Behavioral Contract

This spec migrates the two remaining direct-filesystem consumers of legacy state-artifact formats off of inline parsing and onto the adapter / `lib/lifecycle-state.mjs` APIs. The two consumers in scope:

- **`viz/build.mjs`** — the dependency-graph visualization builder. Today it reads `.context-index/tasks/tasks.md` directly and parses markdown tables via a custom `parseMarkdownTable` helper (see `viz/build.mjs::extractTasks` around line 358). Replaced with `getIssueManager(manifest).list(...)` and `listEpics(...)` calls returning structured data; no markdown parsing remains.
- **`hooks/session-capture.sh`** — the session-capture hook that, when the issue board is on the `file` (markdown) backend, scrapes `tasks.md` via a regex match against `### <issue-id>` blocks to attach epic-binding metadata to captured sessions. Replaced with a one-line Node helper invocation (`node -e '...'` or a dedicated `lib/issues/cli-get.mjs` script) that calls `getIssueManager(manifest).get(<issue-id>)` and returns the epic ID via stdout. The shell script remains the registered hook entry point and retains exit-code ownership per the charter's hook contract.

After this spec lands, the only callers of `tasks.md` parsing are (a) the markdown-rendering layer (one-way write), (b) the migration tool's legacy-read step, and (c) the read-only-deprecated `FileAdapter`. No production-path read or write goes through ad-hoc markdown parsing.

## viz/build.mjs Behavior

`extractTasks()` is rewritten to:

1. Resolve the project manifest via the public `loadManifest(projectRoot)` helper from `lib/manifest.mjs`. (This helper is promoted from the current private `loadManifestForStorage` in a task owned by `lifecycle-skill-instruction-updates.spec.md`; this spec depends on that helper landing first.)
2. Call `getIssueManager(manifest)` (registry-resolved adapter — `json` by default post-migration, `file` for legacy-read, `beads` for beads-backed projects).
3. Invoke `await manager.listEpics()` and `await manager.list()` for epics and issues respectively.
4. Walk the returned structured arrays and feed them into the existing `addNode` / `addEdge` calls.

The `parseMarkdownTable` helper in `viz/build.mjs` is **deleted** as part of this work — no other call site exists. The graph node shape is unchanged (the visualization output and downstream JSON remain stable so consumers like the static viz site continue to render correctly).

If `getIssueManager(manifest)` throws (e.g., no manifest, no backend configured), `extractTasks()` logs `VIZ_BOARD_UNAVAILABLE` to stderr and skips the tasks subgraph — same graceful-degradation pattern the function already uses for missing `tasks.md`. The visualization continues to build with only the spec / module subgraphs.

**Build-state directory rename (smoke-test only).** Today's `viz/build.mjs` does not read `.context-index/build-state/*.json` files for "spec-implemented-by" edges — those edges come from a `source-manifest` frontmatter block on each spec file (lines ~337–348 of `viz/build.mjs`). This spec therefore has no migration work to do for that edge construction. The only obligation is a smoke test confirming viz still produces equivalent output after the `build-state → lifecycle-state` directory rename done by `one-shot-migration-tool.spec.md`. That smoke test is captured in the Task Map below.

## hooks/session-capture.sh Behavior

The current shell script contains two inline-parsing branches:

- Beads-backend fallback (lines ~84–100): reads `.beads-map.json` and falls back to `tasks.md` regex if the map lacks an entry.
- File-backend branch (lines ~102–110): reads `tasks.md` and runs a regex against an `### <issue-id>` block to extract `epicId`.

Both branches are replaced by a single invocation of a new Node helper:

- **`lib/issues/cli-get-epic.mjs`** — a small ESM helper invoked as `node "$CLAUDE_PLUGIN_ROOT/lib/issues/cli-get-epic.mjs" <issue-id>`. Resolves manifest, calls `getIssueManager(manifest).get(<issue-id>)`, prints the resolved Issue's `epicId` (or `epic_id` for snake_case epics) to stdout. Prints nothing on miss. Exits 0 in both cases.

The shell script invokes the helper, captures stdout, and assigns to `entry.epic`. Backend-aware logic (beads-map fallback, file-backend regex) moves entirely into the Node helper, which delegates to `getIssueManager(manifest)` so the adapter (JSON, file, or beads) handles backend dispatch.

The shell script preserves its hook-protocol contract verbatim — exit code, stdout JSON shape, env-var reads — per the charter's Non-Negotiable Principle 4. The helper runs as a subprocess and writes to stdout only; the shell wraps the helper's output into the hook's JSON payload.

## CLI Helper Contract

`lib/issues/cli-get-epic.mjs`:

```
Usage: node lib/issues/cli-get-epic.mjs -- <issue-id>

Behavior:
  - projectRoot is process.cwd(). No --cwd flag (hook contract guarantees cwd is the project root).
  - issueId is validated against /^[a-zA-Z0-9_-]+$/ before any use. On mismatch, exits 0 silent (no stdout).
  - Loads manifest via loadManifest(projectRoot). If absent, exits 0 silent.
  - Calls getIssueManager(manifest).get(issueId). If the issue is not found OR the adapter returns absent, exits 0 silent.
  - On success, prints resolved Issue's epicId (or empty if Issue has no epic) followed by a newline.

Exit codes (all exit 0; the distinction is via stdout/stderr):
  expected-miss   — no manifest, no backend, issue not found, invalid issueId.
                    Silent stdout, nothing on stderr.
  unexpected error — programmer error (import/require failure, JSON parse error on tasks.json).
                    Silent stdout, ONE LINE on stderr naming the error class (e.g.,
                    "ERR_CLI_GET_EPIC: <ErrorClass>: <message>"). Exit code still 0 so
                    the session-start hook chain is not blocked, but the operator's
                    debug log captures the failure.
```

The two-channel exit model (`stdout` for happy path, `stderr` one-liner for programmer errors) keeps the hook chain unblocked (Constitution Principle 4) while preserving observability when the helper breaks. The shell script captures only stdout into `entry.epic`; stderr passes through to whatever the hook harness collects.

The shell script in `hooks/session-capture.sh` MUST invoke the helper with `--` before the issue ID and double-quote the variable:

```sh
entry_epic="$(node "$CLAUDE_PLUGIN_ROOT/lib/issues/cli-get-epic.mjs" -- "$entry_issue")"
```

This defeats subprocess-argument injection from a tampered execution-state file (the `--` terminates option parsing, the quotes prevent shell metacharacter interpretation).

## Path Safety (SEC-1)

Both consumers operate through `getIssueManager(manifest)`, which inherits the path-containment contract from `json-issue-board-adapter.spec.md` (Path Safety section). No new path-safety primitive is introduced. The `cli-get-epic.mjs` helper validates `projectRoot` via `loadManifest(projectRoot)` (path-containment + `.context-index/manifest.yaml` existence). The `issueId` argument is constrained to `/^[a-zA-Z0-9_-]+$/` before being passed to `manager.get()` — invalid IDs short-circuit with exit-0 silent.

The single source-capture site (`hooks/session-capture.sh`) is the only file that should match the pattern `\btasks\.md\b` in `hooks/*.sh` today. Future hooks adding direct-fs parsing are caught by the architectural test added below; no other guard is needed.

## Naming Conventions (CON-1)

- Helper file name: `cli-get-epic.mjs` (kebab-case, matching the file convention).
- Exported function (if any internal export emerges): `getEpicForIssue(projectRoot, issueId) → Promise<string | null>`. camelCase, no underscore mid-word.
- Shell-script variable names preserved verbatim (`entry.epic`, `backend`, `boardPath` — though `boardPath` is removed).

## System Constitution Reference

- **Principle:** "Hook protocol compliance" — Critical. The shell hook continues to own exit codes and the registered hook entry point. The Node helper is a subprocess only.
- **Principle:** "Minimize external dependencies" — Applies. The helper uses only Node built-ins and the existing `lib/issues/registry.mjs`.
- **Principle:** "Pure ESM" — Applies. New helper is `.mjs`.
- **Architecture Boundary (Autonomous):** "Refactoring within a module's boundaries" — Applies. `viz/build.mjs` lives under `viz/` (its own module per the constitution's Context Routing); `hooks/session-capture.sh` and the new `cli-get-epic.mjs` helper live under `hooks/` / `lib/issues/` respectively.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| `viz/build.mjs::extractTasks` rewrite | Replace `readFileSafe(tasksPath)` + `parseMarkdownTable` with `getIssueManager(manifest).listEpics()` and `.list()`. Walk structured arrays into `addNode`/`addEdge`. Delete `parseMarkdownTable` from the file. | medium |
| `lib/issues/cli-get-epic.mjs` helper | New ESM helper that validates `issueId` against `/^[a-zA-Z0-9_-]+$/`, resolves manifest via `loadManifest`, calls `getIssueManager(manifest).get(<id>)`, prints `epicId` to stdout on success, exits 0 silent on expected-miss, exits 0 with a single stderr line on unexpected error. | small |
| `hooks/session-capture.sh` rewrite | Replace beads-fallback and file-backend regex branches with a single invocation of `cli-get-epic.mjs` using `node "$CLAUDE_PLUGIN_ROOT/lib/issues/cli-get-epic.mjs" -- "$entry_issue"`. Preserve hook-protocol contract (exit code, stdout JSON envelope, env-var reads). | medium |
| Architectural test: no markdown-table parsing in viz | Static check that `viz/build.mjs` contains no `parseMarkdownTable` reference and no `tasks.md` literal. | small |
| Architectural test: no inline tasks.md grep in hooks | Static check over `hooks/*.sh` for the patterns `\btasks\.md\b` and `epicId:` (regex-extraction signature). | small |
| Unit test: `cli-get-epic.mjs` behavior | Drive against a fixture project with JSON, file, and beads backends. Assert: correct epic ID on hit (stdout); empty stdout on miss; empty stdout + invalid-id rejection; stderr one-liner on simulated unexpected error; exit 0 on all paths. | medium |
| Subprocess-injection test | Fixture with `entry_issue` containing shell metacharacters (`;`, `$(...)`, backticks, `--help`). Assert `cli-get-epic.mjs` rejects via `issueId` regex without interpreting the metacharacters. | small |
| Integration test: session-capture hook | Existing session-capture test extended with a fixture board containing an issue→epic mapping. Assert the captured session entry has the expected `entry.epic` value across all three backends. | medium |
| viz visualization smoke test | Confirm the generated viz JSON has the same node/edge shape pre- and post-migration on a fixture project. Includes the post-directory-rename case (`build-state` → `lifecycle-state`) to confirm no incidental viz breakage. | small |

## Acceptance Criteria

- [ ] `viz/build.mjs::extractTasks` calls `getIssueManager(manifest)` and contains no markdown parsing. `parseMarkdownTable` is deleted from `viz/build.mjs`.
- [ ] `viz/build.mjs` survives the `build-state → lifecycle-state` directory rename per the smoke test. No code path in viz directly reads `build-state/*.json` today; this AC is a no-op confirmation, not a migration.
- [ ] `lib/issues/cli-get-epic.mjs` exists. On all expected paths (happy hit, expected miss, invalid `issueId`, missing manifest), the helper exits 0 with the appropriate stdout. On unexpected error (import failure, JSON parse error), the helper still exits 0 but writes a single `ERR_CLI_GET_EPIC: <ErrorClass>: <message>` line to stderr.
- [ ] The helper validates `issueId` against `/^[a-zA-Z0-9_-]+$/` before invoking the manager. The subprocess-injection test fixture confirms rejection of shell metacharacter payloads.
- [ ] `hooks/session-capture.sh` invokes `cli-get-epic.mjs` with `node "$CLAUDE_PLUGIN_ROOT/lib/issues/cli-get-epic.mjs" -- "$entry_issue"` (with `--` and double-quotes). The shell script remains the registered hook entry point and owns the exit code.
- [ ] The architectural tests asserting "no markdown-table parsing in viz" and "no inline tasks.md grep in hooks" pass.
- [ ] Visualization JSON output is shape-equivalent (per the smoke test) pre- and post-migration on a fixture project.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.
