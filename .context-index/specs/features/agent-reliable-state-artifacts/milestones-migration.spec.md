---
charter: agent-reliable-state-artifacts
status: validated
risk_level: medium
milestone: 0.26.0
revision: 2
charter-revision: 3
created: 2026-05-11
updated: 2026-05-12
source-manifest:
  sha: "bc04faf"
  files:
    - lib/milestones.mjs
    - templates/manifest-template.yaml
    - tests/architectural-milestones.test.mjs
    - tests/milestones-integration.test.mjs
    - tests/milestones.test.mjs
  computed-at: "2026-05-12T02:15:39.244Z"
drift_detected: true
---

# Live Spec: Milestones Migration

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->

## Behavioral Contract

This spec migrates the milestone registry from `.context-index/milestones.yaml` to `.context-index/milestones.json`, preserving every existing field name and semantic. `lib/milestones.mjs` is refactored to read/write JSON via an atomic temp-then-rename, mirroring `lib/build-state.mjs::atomicWriteJson`. The module's exported API (`loadMilestones`, `saveMilestones`, `findMilestone`, `milestoneCreate`, `milestoneShip`, `milestoneDefer`, `milestoneList`, `getMilestoneStatusData`, `warnIfMilestoneUndefined`, plus the two validators) keeps its current signatures, return shapes, and error codes; only the on-disk format and the path-resolution rule change. Storage is moved from per-worktree (today's `join(projectRoot, ...)`) to shared-across-worktrees via `resolveStorageRoot()` — same rule as the issue board (`tasks.json`), so milestones and the issue board live side-by-side in the main repo's `.context-index/` and remain consistent across `git worktree`-bound parallel work. The `parseYaml` import from `lib/profiles/yaml.mjs` is dropped — `JSON.parse`/`JSON.stringify` are built-ins. The one-shot migration of any existing `.context-index/milestones.yaml` is owned by the separate `one-shot-migration-tool` spec; `lib/milestones.mjs` does not perform any in-place conversion on first read.

## Naming Conventions (CON-1)

This spec preserves every field name already in use by `lib/milestones.mjs` and consumed by `/adev:issues`, `/adev:status`, `/adev:deploy`:

- **Milestone fields (mixed snake_case + lowercase):** `name`, `status`, `epic_id`, `target_date`, `release`, `ship_criteria`, `defer_reason`. The snake_case fields (`epic_id`, `target_date`, `ship_criteria`, `defer_reason`) are preserved verbatim — they are the established convention from the prior YAML schema and are consumed by every milestone-aware skill. Renaming to camelCase would force a synchronized cross-skill update with no compensating benefit and is therefore out of scope.
- **Ship criteria entries (snake_case discriminators):** Each `ship_criteria[]` entry is `{ check: <type> }` or `{ confirm: <text> }`. Both keys remain snake_case for parity with the existing YAML shape.
- **Release config (nested object):** `release` (lowercase single-word field at the milestone level) with a nested `strategy` (lowercase single-word). Preserved verbatim — neither name contains underscores, so the snake_case convention does not apply at either level.
- **Status enum (lowercase strings):** `planned`, `shipped`, `deferred` — unchanged from today.

Implementers must NOT rename any field during this migration. The fields are part of the public contract that `/adev:issues milestone *`, `/adev:status`, and `/adev:deploy` read and emit; the convention-mix is legacy from the `milestone-lifecycle` charter and is preserved as-is, identical to how the `json-issue-board-adapter` spec preserves the WorkItem field convention mix.

## Path Safety (SEC-1, SEC-4)

The module enforces path-containment defenses on every public function that takes a `projectRoot`:

1. **`projectRoot` normalization.** Every public function resolves `projectRoot` via `path.resolve()` at entry. The resolved path must contain `.context-index/manifest.yaml` (validated by `fs.existsSync`). If validation fails, the function throws `INVALID_PROJECT_ROOT` with the resolved path. This is a strengthening of today's behavior (no projectRoot validation currently) and matches the sibling foundation specs.
2. **Storage-root resolution.** The resolved storage root is computed via `resolveStorageRoot(manifest, projectRoot)` from `lib/issues/resolve-root.mjs` — the **same helper** used by `lib/issues/json-adapter.mjs`. This is the deliberate alignment described in the next section. The resolved storage root MUST itself be a real, existing directory: `fs.statSync(resolvedStorageRoot).isDirectory() === true`. If not (e.g., the path does not exist, or `tasks.db_path` points at a regular file), throw `INVALID_STORAGE_PATH` before any read or write attempt. This positive-containment invariant on `storageRoot` itself defeats the tautological-equality gap flagged by SEC-1 (review rev 1), where a malicious `tasks.db_path: /etc/passwd` would otherwise produce the same garbage path on both sides of the containment equality check.
3. **Storage-path containment.** The resolved target path `<storageRoot>/.context-index/milestones.json` is asserted via realpath-resolved containment: `fs.realpathSync.native(resolvedStorageRoot) + path.sep + '.context-index' + path.sep` must be a prefix of `fs.realpathSync.native(resolvedTargetPath)` (with the file's parent dir realpath'd if the target file does not yet exist). The temp file path used by the atomic write is `<finalPath>.<crypto.randomBytes(4).toString('hex')>.tmp` (mirrors `lib/build-state.mjs::atomicWriteJson`); it must satisfy the same realpath-prefix check. If either check fails, throw `INVALID_STORAGE_PATH`. Defeats traversal via crafted `tasks.db_path` overrides AND symlink escape under `.context-index/` (CWE-22, CWE-59).
4. **Sibling-spec parity.** This module applies the same `projectRoot` and storage-path containment contract as `lib/lifecycle-state.mjs` and `lib/issues/json-adapter.mjs`. The three modules now share both the resolver helper and the validation contract.

## Worktree Behavior Decision (CON-2)

Today's `lib/milestones.mjs` resolves the storage path via `join(projectRoot, '.context-index/milestones.yaml')`. This is **per-worktree**: a `git worktree` of the same repo gets its own `milestones.yaml`. The issue board (`tasks.md`/`tasks.json`) resolves via `resolveStorageRoot()` and is **shared across worktrees** — see `lib/issues/resolve-root.mjs` and the existing `task-management` charter's worktree note.

This spec **aligns milestones with the issue board**: `lib/milestones.mjs` switches to `resolveStorageRoot(manifest, projectRoot)` for path resolution, so `.context-index/milestones.json` lives in the main repo and is shared across worktrees.

Rationale:

- **Operational consistency.** Issues link to milestones via `epic_id`; the two artifacts referencing each other across a worktree split is a confusing failure mode (today's behavior). Co-locating them eliminates the split.
- **Release flow integrity.** `/adev:deploy` reads `milestones.json` and the issue board together — if they're in different worktrees, the deploy pipeline observes inconsistent state.
- **No regression for single-worktree users.** Projects without worktrees see no behavior change: `resolveStorageRoot` falls back to the git common dir, which equals `projectRoot` in the single-worktree case.
- **Migration impact.** The one-shot migration tool (`one-shot-migration-tool.spec.md`) resolves the source `milestones.yaml` from the current `projectRoot` and writes the target `milestones.json` to `resolveStorageRoot(manifest, projectRoot)`. If a project has milestone data in a worktree directory that does NOT equal the main repo, the migration tool detects this (existing YAML in worktree, none in main) and copies the data to the main repo's `.context-index/` before deleting the per-worktree file. The migration tool spec owns this branch; this spec only declares the target rule.

Manifest knob: `tasks.db_path` (the existing override consumed by `resolveStorageRoot`) governs both the issue board and milestones, since they share the resolver. `tasks.db_path` is treated as **the parent directory of `.context-index/`**, matching `resolveStorageRoot`'s current contract — the resolver returns `tasks.db_path` directly as the storage root, and `.context-index/<artifact>` is appended by each consumer. A worked example:

```yaml
# manifest.yaml
tasks:
  db_path: /Users/alice/work/sharedstate
```

With the above setting, both files resolve to:

```
/Users/alice/work/sharedstate/.context-index/tasks/tasks.json
/Users/alice/work/sharedstate/.context-index/milestones.json
```

If `tasks.db_path` is unset (the common case), `resolveStorageRoot` falls back to the git common-dir parent (or `cwd`), so single-worktree projects see no behavior change. There is no separate `milestones.db_path` knob — the unified knob is the deliberate consequence of the alignment decision.

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies because the rewritten `lib/milestones.mjs` uses only `node:fs`, `node:path`, `node:crypto` (temp-file suffix), and `node:child_process` (already present via `execFileSync` for git resolution inside `resolveStorageRoot`). The `parseYaml` import from `lib/profiles/yaml.mjs` is dropped — JSON parsing is a built-in. No new external dependency is introduced.
- **Principle:** "Skills are primarily markdown" — Applies because skill instructions in `/adev:issues milestone *` change only at the storage-format reference level (the SKILL.md prose mentions `milestones.yaml`); the API surface skills consume is unchanged. The skill-instruction updates are covered by the separate skill-cleanup cross-cutting spec; this spec only changes the lib.
- **Principle:** "Pure ESM — all `.mjs` files" — Applies because `lib/milestones.mjs` is already ESM; the rewrite stays ESM.
- **Architecture Boundary (Autonomous):** "Refactoring within a module's boundaries" — Applies because the rewrite lives inside the `agent-reliable-state-artifacts` module scope laid out in the charter. The storage-root rule change is a behavior change within the module's scope and is explicitly enumerated in the charter (Scope and Boundaries / "Milestones migration"). No human approval gate beyond the spec review is required.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| `milestones.json` document schema | Define the JSON shape: `{ version, milestones: [{name, status, epic_id, target_date, release, ship_criteria, defer_reason}] }`. Document required vs. optional fields. Mirror the YAML shape exactly — JSON is the new transport, not a redesign. | small |
| Rewrite `loadMilestones` | Replace `parseYaml(content)` with `JSON.parse(content)`. Preserve every field-default and array-coercion behavior currently in the function (`name ?? ""`, `status ?? "planned"`, etc.). Returns `[]` on missing file or empty `milestones` field. Throws `PARSE_ERROR` on malformed JSON. | small |
| Rewrite `saveMilestones` | Replace the line-by-line YAML serialization with `JSON.stringify({ version: 1, milestones }, null, 2) + "\n"` followed by temp-then-rename. The temp-then-rename helper mirrors `lib/build-state.mjs::atomicWriteJson`. Creates `.context-index/` directory if missing. | small |
| Drop `parseYaml` import | Remove `import { parseYaml } from "./profiles/yaml.mjs"`. Confirm no remaining YAML logic in the module (handcrafted serialization lines too). | small |
| Switch path resolution to `resolveStorageRoot` | Replace every `join(projectRoot, MILESTONES_PATH)` call with `join(resolveStorageRoot(manifest, projectRoot), MILESTONES_PATH)` (where `MILESTONES_PATH` becomes `.context-index/milestones.json`). Internal helper `resolveMilestonesPath(projectRoot, manifest?)` centralizes this. | medium |
| Manifest-loading helper | New internal helper `loadManifest(projectRoot)`: reads `.context-index/manifest.yaml` and returns the parsed object (or `null` on missing/malformed manifest; missing is OK since `resolveStorageRoot` tolerates a null manifest). Used to pass through `manifest.tasks.db_path` to `resolveStorageRoot` so the override knob still works. | small |
| Path containment defenses | Add `path.resolve` + `.context-index/manifest.yaml` existence check to a new internal `validateProjectRoot(projectRoot)`. Add the storage-path containment assertion. | small |
| `milestoneCreate`, `milestoneShip`, `milestoneDefer`, `milestoneList` | API signatures unchanged. Internally, every call to `loadMilestones` / `saveMilestones` continues to work through the new JSON path. Auto-link-to-epic behavior in `milestoneCreate` is unchanged. | small |
| `getMilestoneStatusData`, `warnIfMilestoneUndefined` | Read-only consumers. Unchanged externally; internally pick up the JSON path. | small |
| `validateMilestoneName`, `validateTargetDate` | Pure validation functions. No I/O. Unchanged. | small |
| `findMilestone` | Read-only. Unchanged externally; picks up JSON path internally. | small |
| Tests: parity | Re-run every existing test in `tests/lib/milestones.test.mjs` (or equivalent) against the rewritten module. Fixtures rewritten to JSON shape (`milestones.json`). | medium |
| Tests: path-containment defenses | New tests for `INVALID_PROJECT_ROOT` and `INVALID_STORAGE_PATH` per the sibling-spec pattern (missing manifest, traversal payloads via `tasks.db_path` override). | small |
| Tests: worktree-shared storage | New tests asserting that, in a git worktree, `loadMilestones` and `saveMilestones` resolve to the main repo's `.context-index/milestones.json` — not a per-worktree path. Mirror the existing worktree test for the issue board. | medium |
| Tests: atomic-write fault injection | Kill the process between temp-file write and rename; assert the reader sees prior state, temp file is best-effort cleaned up on the failure path, and a follow-up write succeeds. Mirror the lifecycle-event-log / json-adapter pattern. | medium |
| Tests: `tasks.db_path` override governs milestones too | Set `manifest.tasks.db_path` to a non-default path; assert `milestones.json` writes to `<db_path>/.context-index/milestones.json`. Documents the unified-knob behavior. | small |
| Architectural test: no YAML writes | Grep test asserts `lib/milestones.mjs` source contains no `yaml`/`YAML` string and no `parseYaml` import after rewrite. CI gate. | small |
| Architectural test: no direct write to `milestones.yaml` | Grep test asserts no code path writes to `.context-index/milestones.yaml`. CI gate. | small |
| Coverage target | ≥ 90% line coverage on the rewritten `lib/milestones.mjs`. | small |
| Manifest schema doc | Update `templates/manifest.yaml` (the scaffold template) docs comments to clarify `tasks.db_path` governs milestones too. No new knob is added. | small |

## Visual Expectations

Not applicable — `lib/milestones.mjs` is a passive library module. Milestone display rendering (`/adev:status`, `/adev:issues milestone list`) is owned by the consuming skills and is unchanged by this spec.

## Acceptance Criteria

- [ ] `lib/milestones.mjs` exports unchanged signatures: `loadMilestones(projectRoot)`, `saveMilestones(projectRoot, milestones)`, `findMilestone(projectRoot, name)`, `milestoneCreate(projectRoot, name, options)`, `milestoneShip(projectRoot, name, options)`, `milestoneDefer(projectRoot, name, options)`, `milestoneList(projectRoot)`, `getMilestoneStatusData(projectRoot, name)`, `warnIfMilestoneUndefined(projectRoot, name)`, `validateMilestoneName(name)`, `validateTargetDate(dateStr)`. Argument lists and return shapes match today's contract.
- [ ] All writes go through `JSON.stringify(data, null, 2) + "\n"` followed by temp-then-rename. A grep test asserts no `yaml` / `YAML` / `parseYaml` string appears in the source after the rewrite. CI gate.
- [ ] `loadMilestones(projectRoot)` returns the parsed array of milestone objects on success. Returns `[]` on missing file, empty `milestones` array, or empty object. Throws `PARSE_ERROR` on malformed JSON (same error code as today's malformed-YAML path).
- [ ] Path resolution uses `resolveStorageRoot(manifest, projectRoot)` from `lib/issues/resolve-root.mjs`. In a git worktree, `loadMilestones` reads from the main repo's `.context-index/milestones.json`, NOT the worktree-local path. Test fixture exercises a worktree.
- [ ] `manifest.tasks.db_path` (existing override knob consumed by `resolveStorageRoot`) governs `milestones.json` location identically to `tasks.json`. No new `milestones.db_path` knob is introduced.
- [ ] Path-containment defenses are enforced (SEC-1, SEC-4): any `projectRoot` lacking `.context-index/manifest.yaml` throws `INVALID_PROJECT_ROOT`; any `tasks.db_path` that does not resolve to a real existing directory throws `INVALID_STORAGE_PATH` (positive containment on `storageRoot` itself, addressing review-rev-1 SEC-1); any resolved storage path that fails the realpath-prefix containment check against `<storageRoot>/.context-index/` throws `INVALID_STORAGE_PATH`. Tests exercise traversal payloads via `tasks.db_path`, including `/etc/passwd` (regular file, not a directory — must be rejected) and a symlink-escape fixture under `.context-index/`.
- [ ] `tasks.db_path` worked-example consistency: a test fixture with `manifest.yaml::tasks.db_path: /tmp/adev-shared-XYZ` asserts that `loadMilestones`/`saveMilestones` resolve to `/tmp/adev-shared-XYZ/.context-index/milestones.json` and that `JsonAdapter` resolves to `/tmp/adev-shared-XYZ/.context-index/tasks/tasks.json` under the same setting. Documents the unified-knob behavior end-to-end.
- [ ] `loadMilestones(projectRoot)` remains **synchronous** — returns the array directly, not a `Promise<Array>`. `lib/deploy.mjs` line 737's `await loadMilestones(projectRoot)` continues to work (awaiting a non-promise resolves to the value) but the function does not become async as part of this migration. CON-5 from review rev 1.
- [ ] The on-disk format is JSON only. No code path writes to `.context-index/milestones.yaml`. Architectural grep test asserts this. CI gate.
- [ ] `JSON.stringify` output uses 2-space indentation and ends with a single trailing newline. Test asserts the exact byte format for a fixed fixture.
- [ ] Atomic-write fault-injection test passes: killing the process between temp-file write and rename leaves either the prior state or no change. Reader never observes partial JSON.
- [ ] Temp-file cleanup mirrors `lib/build-state.mjs::atomicWriteJson`: failure paths invoke best-effort `fs.unlinkSync` on the temp file (swallowing cleanup errors) before re-throwing the original error.
- [ ] Field semantics preserved: every field accepted by today's YAML reader (`name`, `status`, `epic_id`, `target_date`, `release`, `ship_criteria`, `defer_reason`) round-trips through JSON parse → save → parse with byte-identical (modulo whitespace) content. Property test covers the round-trip.
- [ ] `milestoneCreate` auto-link-to-epic behavior is unchanged: when `options.issueManager` is provided, the created milestone has `epic_id` populated via `issueManager.createEpic(...)`. Test parity preserved.
- [ ] `milestoneShip` and `milestoneDefer` status transitions, `defer_reason` persistence, and release-strategy reads are unchanged. Test parity preserved.
- [ ] `lib/deploy.mjs::loadMilestones` consumer (dynamic import path) continues to work without modification. Integration test exercises the import path.
- [ ] All consumers of `loadMilestones` / `saveMilestones` / `findMilestone` / etc. (i.e., `skills/issues/SKILL.md`, `skills/status/SKILL.md`, `skills/deploy/SKILL.md`, `lib/deploy.mjs`) continue to operate without code changes. Skill-instruction prose updates (replacing "milestones.yaml" with "milestones.json" in SKILL.md text) are covered by the separate skill-cleanup cross-cutting spec, not this spec.
- [ ] Test coverage on `lib/milestones.mjs` ≥ 90% lines.
- [ ] All constitution quality gates pass: `npm test` green, no new dependencies in `package.json`, all files are `.mjs` ESM.
- [ ] No constitutional violations.
- [ ] No in-place migration of legacy `milestones.yaml` is performed by `lib/milestones.mjs`. The one-shot migration tool spec owns conversion. If both `.context-index/milestones.json` and a stale `.context-index/milestones.yaml` exist on disk, `loadMilestones` reads the JSON file and ignores the YAML file (leaves it untouched).

## Preconditions

- The project has a `.context-index/` directory (created by `/adev:init`).
- The project has a `.context-index/manifest.yaml`. The path-containment defense enforces this on every public call.
- `lib/issues/resolve-root.mjs` exists with the `resolveStorageRoot()` export (existing helper from the `task-management` charter).
- `lib/build-state.mjs` exists with the `atomicWriteJson` pattern (mirrored by this module's `_write()`).
- Node.js runtime with `node:fs`, `node:path`, `node:crypto`, `JSON.parse`, `JSON.stringify` available (existing constitution baseline).
- No pre-existing `milestones.json` is required — `saveMilestones` creates the file (and parent directory) on first write.
- The one-shot migration tool spec is the only code path that reads `.context-index/milestones.yaml` after this spec lands. `lib/milestones.mjs` does not have a legacy-read fallback path.

## Behaviors

- **When** `loadMilestones(projectRoot)` is called and `.context-index/milestones.json` exists at the resolved storage path **then** the file is parsed via `JSON.parse` and the milestones array is returned, with each entry normalized through the existing field-default coercion (`name ?? ""`, `status ?? "planned"`, etc.).
- **When** `loadMilestones` is called and the file does not exist **then** an empty array `[]` is returned (no error thrown).
- **When** `loadMilestones` is called and the file contains malformed JSON **then** `PARSE_ERROR` is thrown with the message `"milestones.json is malformed — cannot parse"`. This matches today's malformed-YAML error code (preserving the consumer contract).
- **When** `loadMilestones` is called and the parsed JSON has no `milestones` key or a non-array value at that key **then** an empty array is returned.
- **When** `loadMilestones` is called in a git worktree directory **then** the resolved storage path is the main repo's `.context-index/milestones.json` (via `resolveStorageRoot`). The worktree-local `.context-index/` is not consulted.
- **When** `saveMilestones(projectRoot, milestones)` is called **then** the array is serialized as `JSON.stringify({ version: 1, milestones }, null, 2) + "\n"` and written via atomic temp-then-rename to the resolved storage path. The `.context-index/` directory at the resolved storage root is created if missing.
- **When** `saveMilestones` is called in a git worktree **then** the write target is the main repo's `.context-index/milestones.json`. The worktree-local `.context-index/` is not written to.
- **When** the rename step of `saveMilestones` fails (permission, disk full, etc.) **then** the temp file is best-effort unlinked, the underlying `fs` error is rethrown, and the existing `milestones.json` is unchanged.
- **When** `findMilestone(projectRoot, name)` is called **then** the function delegates to `loadMilestones(projectRoot)` and returns the first entry where `entry.name === name`, or `null` if no match. Behavior identical to today.
- **When** `milestoneCreate(projectRoot, name, options)` is called with valid arguments **then** the milestone entry is created or updated in the JSON document; if `options.issueManager` is supplied, an epic is auto-created and linked into `epic_id`; the function returns the created/updated entry. Behavior identical to today.
- **When** `milestoneShip`, `milestoneDefer`, or `milestoneList` is called **then** their I/O round-trips through `loadMilestones` and `saveMilestones`. The functions' return shapes and error codes are unchanged from today.
- **When** `getMilestoneStatusData(projectRoot, name)` is called **then** it loads the milestone via `findMilestone` and returns `{ found, milestone }` — unchanged from today.
- **When** `warnIfMilestoneUndefined(projectRoot, name)` is called and the milestone is not present in the registry **then** the warning string is returned; if present, `null` is returned. Behavior identical to today (the message text updates from `"milestones.yaml"` to `"milestones.json"` to keep the user-facing error truthful, but the function contract is unchanged).
- **When** `validateMilestoneName` or `validateTargetDate` is called with an invalid input **then** the function throws the corresponding error code (`MISSING_NAME`, `INVALID_NAME`, `INVALID_DATE`). Pure validation; no I/O.
- **When** any public function is called with a `projectRoot` that does not resolve to a directory containing `.context-index/manifest.yaml` **then** `INVALID_PROJECT_ROOT` is thrown before any I/O occurs.
- **When** the resolved storage path escapes `<storageRoot>/.context-index/` (e.g., via a crafted `tasks.db_path` override) **then** `INVALID_STORAGE_PATH` is thrown before any write occurs.
- **When** `manifest.tasks.db_path` is set to an absolute directory **then** `loadMilestones` and `saveMilestones` resolve to `<db_path>/.context-index/milestones.json` (treating `db_path` as the parent of `.context-index/`, matching `resolveStorageRoot`'s contract), identical to how `tasks.json` resolves under the same override. Both files co-locate. For example, `tasks.db_path: /Users/alice/work/sharedstate` produces `/Users/alice/work/sharedstate/.context-index/milestones.json` and `/Users/alice/work/sharedstate/.context-index/tasks/tasks.json`.
- **When** any caller writes to `.context-index/milestones.yaml` (the legacy path) via any code path **then** a CI architectural test catches it and fails the build.

## Postconditions

- After a successful `saveMilestones`, the resolved storage path contains a syntactically valid JSON document of shape `{ version: 1, milestones: [...] }`, with all fields preserved from the input array and a 2-space-indented serialization terminated by a single trailing newline.
- After a rejected `milestoneCreate` / `milestoneShip` / `milestoneDefer` (validation failure, missing entry, etc.), the JSON file is byte-for-byte identical to its pre-call state. No partial mutation persists.
- After a `_write()` failure path (rename error, disk full), no temp file from that operation remains on disk (best-effort `fs.unlinkSync` cleanup, swallowing cleanup errors).
- After `loadMilestones`, the returned array is independent of any future writes — subsequent saves do not mutate prior return values.
- After any read or write, the function does not delete, overwrite, or rename the legacy `.context-index/milestones.yaml` file (if present). The migration tool is the sole owner of legacy-file lifecycle.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `loadMilestones` reads a file with malformed JSON | Throws with message `"milestones.json is malformed — cannot parse"` | PARSE_ERROR |
| `loadMilestones` reads a file with valid JSON but unexpected top-level shape (not an object, no `milestones` key, non-array `milestones`) | Returns `[]` (no error thrown). Matches today's permissive read. | — (no error) |
| `loadMilestones` reads a missing file | Returns `[]` (no error thrown) | — (no error) |
| Any public function called with a `projectRoot` that does not resolve to a directory containing `.context-index/manifest.yaml` | Throws `INVALID_PROJECT_ROOT` with the resolved path | INVALID_PROJECT_ROOT |
| `manifest.tasks.db_path` is set but does not resolve to a real existing directory (e.g., `/etc/passwd`, missing path) | Throws `INVALID_STORAGE_PATH` ("`tasks.db_path` must point at an existing directory") before any I/O. Addresses review-rev-1 SEC-1. | INVALID_STORAGE_PATH |
| Any public function whose resolved storage path falls outside `<storageRoot>/.context-index/milestones.json` (e.g., via a crafted `tasks.db_path` or a symlink-escape under `.context-index/`) | Throws `INVALID_STORAGE_PATH` with the offending resolved path before any I/O. Realpath-prefix containment check defeats both crafted overrides and symlink escapes (CWE-22, CWE-59). | INVALID_STORAGE_PATH |
| `saveMilestones` rename step fails (`EACCES`, `ENOSPC`, etc.) | Best-effort `fs.unlinkSync` on the temp file, then rethrows the underlying `fs` error code unchanged. `milestones.json` is unchanged. | FS_ERROR |
| `saveMilestones` temp-file write step fails | Propagates `fs` error. No rename attempted. `milestones.json` unchanged. | FS_ERROR |
| `validateMilestoneName(name)` called with empty/falsy `name` | Throws `MISSING_NAME` | MISSING_NAME |
| `validateMilestoneName(name)` called with `name` not matching `[a-zA-Z0-9._-]+` | Throws `INVALID_NAME` | INVALID_NAME |
| `validateTargetDate(dateStr)` called with input not matching `YYYY-MM-DD` | Throws `INVALID_DATE` | INVALID_DATE |
| `milestoneCreate` / `milestoneShip` / `milestoneDefer` called with arguments that fail their existing validation chain (missing target_date when required by lifecycle phase, illegal status transition, etc.) | Same error codes as today's implementation (parity invariant) | (same as today) |
| Any caller writes to `.context-index/milestones.yaml` after this spec lands | CI architectural test fails the build | ARCH_VIOLATION_LEGACY_FORMAT |
| Any caller writes to `milestones.json` via a non-`saveMilestones` path | CI architectural test fails the build | ARCH_VIOLATION_DIRECT_WRITE |
