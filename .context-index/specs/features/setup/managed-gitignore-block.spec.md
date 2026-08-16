---
charter: setup
status: validated
kind: behavioral
risk_level: low
milestone:
revision: 1
charter-revision: 2
created: 2026-05-22
updated: 2026-05-22
charter-extension: true
source-manifest:
  sha: "4bef164"
  files:
    - .context-index/specs/cross-cutting/incremental-artifact-writes.spec.md
    - .gitignore
    - cli/index.mjs
    - docs/configuration.md
    - docs/hooks.md
    - lib/cli/init-ensure-gitignore.mjs
    - lib/gitignore-installer.mjs
    - lib/gitignore-paths.mjs
    - lib/prototype-server.mjs
    - templates/manifest-template.yaml
    - tests/cli-init-ensure-gitignore.test.mjs
    - tests/cli-init-managed-gitignore.test.mjs
    - tests/cli/prototype.test.mjs
    - tests/lib/gitignore-installer.test.mjs
    - tests/lib/gitignore-paths-dogfood.test.mjs
    - tests/lib/gitignore-paths.test.mjs
    - tests/lib/prototype-server.test.mjs
  computed-at: "2026-05-22T13:12:27.680Z"
drift_detected: true
---

<!-- partial_schema: spec@1 -->

<!-- Live Spec within the setup charter.
     Adds a new capability not currently enumerated in setup/charter.md.
     The charter's next revision should add a Capability Map row for "Managed gitignore block". -->

# Live Spec: Managed Gitignore Block

## Behavioral Contract

The setup module gains an idempotent paired-marker `.gitignore` block that adev-managed installers maintain on behalf of consumer projects. The block lists ephemeral adev artifacts that must not be committed (lifecycle state, lock files, partial writes, session telemetry, prototype workspace, etc.) so that no consumer leaks them into git history. A single canonical path list is the source of truth: it is consumed by the installer and by a dogfood test that pins this repo's own `.gitignore` block to the same list.

The block is owned exclusively by the new `adev:gitignore` marker pair. The pre-existing `adev:session-capture-gitignore` block (which covers `.context-index/sessions/`) remains separately owned by `lib/session-capture-installer.mjs` and is **not** absorbed.

### Preconditions

- A `.context-index/` directory exists (i.e., the project has been initialized with adev).
- The project root is writable.

### Behaviors

1. **When** `adev init` completes a fresh scaffold **then** a `# >>> adev:gitignore >>>` ... `# <<< adev:gitignore <<<` block is written into the project's `.gitignore`, containing every path in `MANAGED_GITIGNORE_PATHS` in the order declared, one path per line.
2. **When** `adev init` re-runs in a project that already carries the block **and** `MANAGED_GITIGNORE_PATHS` is unchanged **then** the file content is byte-identical after the call (`noop`).
3. **When** `adev init` re-runs and `MANAGED_GITIGNORE_PATHS` has changed (added, removed, or reordered paths) **then** the content between the markers is regenerated to match the canonical list verbatim; bytes outside the markers are preserved exactly.
4. **When** the CLI verb `adev init ensure-gitignore` is invoked **then** the same write-or-update behavior runs without performing the rest of `adev init`.
5. **When** the CLI verb `adev init ensure-gitignore --remove` is invoked **then** the paired-marker block (markers and body) is excised from `.gitignore`; surrounding user content is preserved with at most one blank line collapsed at the splice point.
6. **When** the project has no `.gitignore` file **and** `ensureManagedBlock` is called **then** `.gitignore` is created containing only the block with a trailing newline.
7. **When** `lib/prototype-server.mjs::ensureGitignore` is called **then** it delegates to `ensureManagedBlock(projectRoot)` instead of lazy-appending a bare `.adev/` line. The `.adev/` entry is covered by `MANAGED_GITIGNORE_PATHS`; the old lazy-append code path is removed.
8. **When** the manifest sets `setup.managed_gitignore: false` **then** `adev init` skips the block write and emits a single advisory line ("managed gitignore: disabled by manifest"). Existing block content is **not** removed automatically; the operator runs `--remove` explicitly.

### Postconditions

- `.gitignore` contains exactly one `# >>> adev:gitignore >>>` block (or zero, after `--remove`).
- The block body lines, in order, match `MANAGED_GITIGNORE_PATHS` byte-for-byte (preceded by an optional `# <comment>` if the entry declares one).
- User content outside the markers is byte-identical to its pre-call state.
- The file ends with a single trailing newline.

### Error Cases

| Condition | Expected Behavior | Exit / Result |
|-----------|-------------------|---------------|
| `.gitignore` is read-only (EACCES) | Print warning to stderr; do not abort `adev init` | `adev init` exits 0; verb exits 1 |
| Block has unmatched open marker (close marker absent) | Replace from open marker through EOF with the canonical block; warn | exit 0, result `"repaired"` |
| Two `# >>> adev:gitignore >>>` opens present | Collapse to one block at the position of the first open; emit a stderr warning naming the duplicate | exit 0, result `"deduped"` |
| `--remove` invoked but no block present | Noop, exit 0 | result `"noop"` |
| Path containment violation (`projectRoot` escape via symlink) | Refuse to write; exit non-zero with `UNSAFE_GITIGNORE_PATH` | exit 2 |

## System Constitution Reference

- **Principle 1 — Minimize external dependencies:** The installer uses only `node:fs` and `node:path`. No new dependencies. Same surface area as the existing `lib/session-capture-installer.mjs`.
- **Principle 2 — Skills are primarily markdown:** No SKILL.md changes are required. The installer is companion code wired into the existing `adev init` CLI verb.
- **CLI driver surface (charter):** The behavior is exposed as a CLI subverb (`adev init ensure-gitignore [--remove]`) wrapping a library function; no inline-Node patterns are introduced into any SKILL.md.

## Module Impact

| File | Change |
|------|--------|
| `lib/gitignore-paths.mjs` | **New.** Exports `MANAGED_GITIGNORE_PATHS` — ordered list of `{ path, comment? }` tuples. Single source of truth. |
| `lib/gitignore-installer.mjs` | **New.** Exports `ensureManagedBlock(projectRoot)` and `removeManagedBlock(projectRoot)`. Mirrors paired-marker logic from `lib/session-capture-installer.mjs`. |
| `lib/cli/init.mjs` (or wherever `adev init` is wired) | **Modified.** Invoke `ensureManagedBlock` after manifest write, gated by the `setup.managed_gitignore` knob. |
| `lib/cli/init-ensure-gitignore.mjs` | **New.** Wraps the installer behind `adev init ensure-gitignore [--remove]`. |
| `lib/prototype-server.mjs::ensureGitignore` | **Modified.** Delegate to `ensureManagedBlock`; remove the lazy `.adev/` append. |
| `.gitignore` (this repo) | **Modified.** Re-baseline to the canonical block; preserve all non-managed lines. |
| `docs/hooks.md` (~line 354) | **Modified.** Replace the stale "5 ephemeral paths" claim with an accurate description of the new bundled block. |
| `docs/configuration.md` | **Modified.** Document the new block and the `setup.managed_gitignore` opt-out knob. |
| `templates/manifest-template.yaml` | **Modified.** Add a commented `setup: { managed_gitignore: true }` example. |
| `tests/lib/gitignore-installer.test.mjs` | **New.** Idempotency, drift, preservation, no-file, malformed-block, dedupe, remove. |
| `tests/lib/gitignore-paths-dogfood.test.mjs` | **New.** Parity check: this repo's `.gitignore` managed block matches `MANAGED_GITIGNORE_PATHS`. |

### Canonical Path List (initial, subject to /adev:plan refinement)

The list lives in `lib/gitignore-paths.mjs`. The block writer emits an optional `# <comment>` line above each entry that declares one. Project-relative paths are used verbatim — no `**/` prefix.

```
.context-index/hygiene/                       # hygiene reports (regenerated)
.context-index/packets/                       # review packets (regenerated)
.context-index/.token-cursor.json             # session-tracking cursor
.context-index/.reminder-counter              # issue-reminder counter
.context-index/.session-tracking.jsonl        # session telemetry
.context-index/user-config                    # local user config override
.context-index/.context-preflight-ok          # preflight session flag
.context-index/.execution-state.json          # execution state (transient)
.context-index/.advisory-counter              # lifecycle-gate advisory counter
.context-index/lifecycle-state/*.json         # build-state JSON (jsonl events ARE committed)
.context-index/build-state/*.json             # legacy build-state (pre-rename)
.context-index/tasks/tasks.json.lock          # issue-board CAS lock
.context-index/tasks/tasks.json.*.tmp         # issue-board atomic-write temp
.context-index/tasks/.migrate-state.json      # backend-migration resume state
*.partial                                     # incremental artifact write (per cross-cutting/incremental-artifact-writes)
*.partial.lock                                # incremental artifact lock
.adev/                                        # prototype workspace
.githooks/*.adev                              # chained-hook bodies (regenerated by adev install)
```

`.githooks/*.adev` is generated state, not source. When `adev install` finds a
foreign `core.hooksPath` and the user chooses chaining, each real hook body is
copied to `<name>.adev` and the tracked `.githooks/<name>` is replaced by a
wrapper that calls it. The wrapper IS committed — it is the tracked hook. The
`.adev` bodies are regenerated from the plugin's own `hooks/` on every
install/upgrade, so committing them would ship a copy that silently diverges
from the installed plugin version.

Explicitly **not** included (separately owned):
- `.context-index/sessions/` — owned by `adev:session-capture-gitignore` block.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|----------------------|
| 1 | Author `lib/gitignore-paths.mjs` exporting `MANAGED_GITIGNORE_PATHS` (ordered list with optional comments) | small |
| 2 | Implement `ensureManagedBlock` and `removeManagedBlock` in `lib/gitignore-installer.mjs`; mirror the paired-marker pattern from `lib/session-capture-installer.mjs` (lines 121-167); apply path-containment check | medium |
| 3 | Tests for installer: idempotency, drift regeneration, user-content preservation, no-`.gitignore` creation, malformed-open repair, dedupe, `--remove` semantics | medium |
| 4 | Dogfood-parity test pinning this repo's `.gitignore` managed block to `MANAGED_GITIGNORE_PATHS` | small |
| 5 | Wire `ensureManagedBlock` into the `adev init` flow (gated by `setup.managed_gitignore` manifest knob, default `true`) | small |
| 6 | Add `adev init ensure-gitignore [--remove]` CLI subverb in `lib/cli/init-ensure-gitignore.mjs` | small |
| 7 | Refactor `lib/prototype-server.mjs::ensureGitignore` to delegate to `ensureManagedBlock`; remove lazy `.adev/` append; update its tests | small |
| 8 | Re-baseline this repo's `.gitignore` to the canonical-block format (preserve non-managed user lines) | small |
| 9 | Fix the doc drift at `docs/hooks.md` ~line 354 (replace stale "5 ephemeral paths" sentence with accurate block description) | small |
| 10 | Document the new block and `setup.managed_gitignore` opt-out in `docs/configuration.md`; add a commented example to `templates/manifest-template.yaml` | small |

## Acceptance Criteria

- [ ] `MANAGED_GITIGNORE_PATHS` is the only path list source consumed by the installer and the dogfood test (verified by grep — no other file enumerates the same paths).
- [ ] Calling `ensureManagedBlock(root)` twice produces byte-identical results on the second call (`noop`).
- [ ] User-authored lines above and below the markers survive a write byte-for-byte.
- [ ] Creating the file from scratch yields `<block>\n` only (no leading or trailing extra newlines beyond the trailing one).
- [ ] Drift case: removing an entry from `MANAGED_GITIGNORE_PATHS` and re-running regenerates the block without the removed entry; nothing outside the markers changes.
- [ ] Malformed-block case: an existing block with an open marker but no close marker is repaired (block rewritten through the canonical form).
- [ ] `adev init ensure-gitignore` writes/updates the block; `--remove` excises it and `noop`s on a second invocation.
- [ ] `lib/prototype-server.mjs::ensureGitignore` no longer contains an inline `.adev/` append; calls flow through `ensureManagedBlock`.
- [ ] `manifest.yaml :: setup.managed_gitignore: false` causes `adev init` to skip the write and print an advisory line; an explicit `--remove` is still required to delete an existing block.
- [ ] This repo's `.gitignore` carries the canonical managed block; the dogfood parity test passes.
- [ ] `docs/hooks.md` no longer claims a 5-path installer block; it accurately describes the `adev:gitignore` block + path list.
- [ ] `docs/configuration.md` documents the block and the opt-out knob.
- [ ] `npm test` passes.
- [ ] No new external dependencies; only `node:fs` / `node:path` used in new lib code.
