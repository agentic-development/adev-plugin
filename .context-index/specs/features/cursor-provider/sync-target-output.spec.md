---
charter: cursor-provider
kind: skill
status: validated
risk_level: medium
milestone:
revision: 1
charter-revision: 3
created: 2026-05-19
updated: 2026-05-19
source-manifest:
  sha: "fec6dfd"
  files:
    - .context-index/specs/features/cursor-provider/charter.md
    - cli/index.mjs
    - lib/sync/cursor-writer.mjs
    - skills/sync/SKILL.md
    - tests/cli.test.mjs
    - tests/sync/cursor-format.test.mjs
  computed-at: "2026-05-19T13:32:14.199Z"
drift_detected: true
---

# Skill Spec: Cursor sync target output

<!-- Spec E from the cursor-provider charter's 5-spec grouping.
     Completes the half-modeled `cursor` sync-target format: /adev:sync
     writes a pointer projection to `.cursor/rules/adev.mdc` rather than a
     full content duplicate. Covers the capability ".cursor/rules/adev.mdc
     sync output" in the charter Capability Map. Replaces the legacy
     `.cursorrules` story in skills/sync/SKILL.md.
     Parent Charter: .context-index/specs/features/cursor-provider/charter.md
     Sibling specs (already implemented on this branch):
       - hook-config-generator.spec.md (Spec A)
       - cursor-adapter.spec.md         (Spec B)
       - plugin-manifest-and-parity.spec.md (Spec C)
       - cli-install-integration.spec.md   (Spec D — validated) -->

## Invocation Modes

`/adev:sync` (skill at `skills/sync/SKILL.md`) iterates `manifest.yaml :: sync.targets` and dispatches one writer per target by its `format:` value. Today it dispatches `claude`, `agents`, `copilot`, and a legacy `cursor` writer that targets `.cursorrules` with a full-content duplicate.

This spec activates a redefined `cursor` writer:

1. **Manifest-driven** — when `manifest.yaml :: sync.targets` contains an entry with `format: cursor`, `/adev:sync` writes that target. The default path slot for `format: cursor` MUST be `.cursor/rules/adev.mdc` (Cursor 2.5+ Rules format). Users may override `path:` per entry, but the format's writer assumes `.mdc` extension and Cursor Rules semantics regardless of path.
2. **Re-sync** — re-running `/adev:sync` after a constitution edit MUST regenerate `.cursor/rules/adev.mdc` in place, preserving any `# User Additions` block (same protocol as `claude` / `agents` formats).
3. **Dry-run** — `/adev:sync --dry-run` MUST display the proposed `.cursor/rules/adev.mdc` content (with frontmatter and body) for diff inspection without writing.

The scaffold stub at `cli/index.mjs:465-467` (commented `format: cursor` referencing `.cursorrules`) MUST be activated: uncommented, path changed to `.cursor/rules/adev.mdc`, providers list kept as `[cursor]`. The legacy `.cursorrules` writer description in `skills/sync/SKILL.md` is replaced — `.cursorrules` is not a target this format emits.

## Arguments

| Argument | Required | Description |
|---|---|---|
| `--dry-run` | No | Inherited from `/adev:sync`. When set, the cursor writer prints the proposed `.cursor/rules/adev.mdc` content without writing and returns. Existing flag; no contract change beyond extending dispatch to the new writer. |

No new flags are introduced.

## Output Contract

When `/adev:sync` processes a target whose `format` is `cursor`, the writer MUST:

1. **Resolve the output path** from the manifest entry's `path:` field; default to `.cursor/rules/adev.mdc` when no `path:` is provided by the `setup`-charter scaffold.
2. **Ensure the parent directory exists** (`.cursor/rules/`) via the existing `ensureDir` helper. The directory MUST NOT contain `.cursor/rules/` boilerplate written by adev outside of `adev.mdc` — this writer owns exactly one file.
3. **Compose the file content** in this exact order:

   ```mdc
   ---
   description: <single-line summary derived from the constitution's first H2 or the project identity sentence>
   alwaysApply: true
   ---

   <pointer body, under 200 words>

   # User Additions
   <preserved content from the prior file, if any>
   ```

4. **The pointer body MUST NOT duplicate the constitution.** It MUST direct the reader to `.context-index/constitution.md` for the source of truth and MAY include: (a) the project identity sentence, (b) a one-line note about non-negotiable principles existing in the constitution, (c) the relative path to `.context-index/constitution.md`, (d) a short pointer to `CLAUDE.md` and `AGENTS.md` for sibling agent-file projections. The body length (frontmatter excluded) MUST be ≤ 200 words; the writer counts whitespace-delimited tokens between the frontmatter `---` close and the `# User Additions` marker (or EOF).
5. **The `description` frontmatter value** MUST be a single line (no embedded newlines), trimmed, and ≤ 200 characters. The `alwaysApply` value MUST be the literal boolean `true`.
6. **User Additions preservation** — the existing `# User Additions` protocol applies verbatim (per `skills/sync/SKILL.md` step 4): find the marker in the prior file, preserve everything below it; if missing, append a fresh `# User Additions` marker with empty body; if the target file does not exist, create it with an empty `# User Additions` section.
7. **Learned Lessons placement** — per the sync skill's heuristics-injection step, when a `## Learned Lessons` section is rendered, it is placed **immediately before** `# User Additions` (same as `CLAUDE.md` / `AGENTS.md`, NOT appended at EOF like legacy `.cursorrules`). The pre-existing rule's contradictory placement guidance for "cursor" (append at EOF) MUST be updated in lockstep.
8. **Atomic write** — write to a sibling `.tmp` path and rename to the final path, matching the existing `claude` / `agents` writer atomicity.

`/adev:sync --dry-run` displays the would-be content per the existing dry-run protocol; the diff is computed against the existing file (or "new file" when absent).

The `skills/sync/SKILL.md` cursor-format section MUST be rewritten to describe the new pointer-projection contract; the Provider Detection list MUST replace `Cursor: .cursorrules` with `Cursor: .cursor/rules/adev.mdc`.

Charter capability map row `.cursor/rules/adev.mdc sync output` flips from `—` to `validated` after `/adev:validate` passes.

## Failure Modes

| Condition | Skill Behavior | User Recovery |
|---|---|---|
| `manifest.yaml :: sync.targets` has no `format: cursor` entry | Writer is never dispatched; no `.cursor/rules/adev.mdc` is created. | n/a — opt-in via manifest. |
| `.cursor/rules/` parent directory cannot be created (permission denied) | Surface the underlying OS error with the failing path; `/adev:sync` exits non-zero. | Adjust filesystem permissions and re-run. |
| Composed body exceeds 200 words | Writer throws `CURSOR_BODY_OVERSIZE` with the actual word count; no file is written; atomic temp file is removed. | Edit the writer's template; this MUST fail loud because Cursor's always-apply guidance is the reason the limit exists. |
| Existing `.cursor/rules/adev.mdc` has malformed frontmatter | Writer rewrites the frontmatter wholesale (frontmatter is owned by adev). User Additions below the body are still preserved. | n/a — frontmatter is regenerated each sync. |
| `# User Additions` marker missing in the existing file | Append a fresh empty `# User Additions` section below the body (consistent with `claude` / `agents` writers). | n/a — idempotent. |
| Dry-run mode requested | Print proposed content + diff against existing file; no write; exit 0. | n/a — read-only by design. |
| Atomic rename fails (e.g., cross-device link) | Clean up the `.tmp` file; surface the OS error. | Re-run after addressing FS issue. |

## System Constitution Reference

- **Principle 2: Skills are primarily markdown** — applies. The writer logic lives in the existing `/adev:sync` skill markdown plus its companion helpers; this spec does not introduce new executable surfaces. The `.cursor/rules/adev.mdc` output is markdown with YAML frontmatter, consistent with Cursor's Rules documentation.
- **Principle 5: Version parity** — does NOT apply. `.cursor/rules/adev.mdc` is a sync output (project-state artifact), not a plugin manifest. Version parity is governed by Spec A (CursorPluginManifest) and the three-way version-parity invariant in the charter.
- **Anti-pattern "No hardcoded paths to `~/.claude/`"** — applies inversely. The output path is project-local (`.cursor/rules/adev.mdc`), not user-home; no `~/.cursor/` literals are introduced here. The writer MUST NOT touch `~/.cursor/` — that is `CursorAdapter`'s domain (Spec B).
- **Architecture Boundary — "Modifying the CLI installation path structure" (Requires Human Approval)** — does NOT apply. The CLI install path is unchanged; this writer emits project-state files under `.cursor/rules/`, a Cursor-native convention. The path is owned by Cursor's Rules format, not by adev's install structure.
- **Architecture Boundary — "Adding new skills to the lifecycle order" (Requires Human Approval)** — does NOT apply. `/adev:sync` is an existing skill; this spec activates one more format inside the existing format-dispatch switch.

## Actionable Task Map (preliminary)

| # | Task | Notes |
|---|---|---|
| 1 | Rewrite the `cursor` format section in `skills/sync/SKILL.md` | Replace the `.cursorrules` description with the `.cursor/rules/adev.mdc` pointer-projection contract: YAML frontmatter (`description`, `alwaysApply: true`), body ≤ 200 words, User Additions preserved, Learned Lessons placement moved to "immediately before `# User Additions`" (drop the legacy "append at EOF" guidance for cursor). Update the Provider Detection bullet from `Cursor: .cursorrules` to `Cursor: .cursor/rules/adev.mdc`. |
| 2 | Activate the manifest scaffold stub | In `cli/index.mjs:465-467`, uncomment the `cursor` block, change `path: .cursorrules` → `path: .cursor/rules/adev.mdc`, keep `format: cursor`, keep `providers: [cursor]`. |
| 3 | Implement the cursor writer | Add `writeCursorSyncOutput(projectRoot, target, options)` to the sync skill's writer set (companion helper if one exists, otherwise inline per existing pattern). Use `ensureDir`, atomic temp+rename, the existing `# User Additions` preservation helper, and the same `## Learned Lessons` placement rule as CLAUDE.md/AGENTS.md. Enforce the 200-word body cap with a hard throw on overflow. |
| 4 | Tests — `tests/sync/cursor-format.test.mjs` | (a) Generates a valid `.cursor/rules/adev.mdc` from a fixture constitution; (b) frontmatter has exactly `description` (string) and `alwaysApply: true`; (c) body is ≤ 200 words; (d) re-sync preserves a fixture `# User Additions` block; (e) re-sync replaces an existing `## Learned Lessons` block in the correct position; (f) overlong body throws `CURSOR_BODY_OVERSIZE` and writes no file; (g) `--dry-run` does not write. Mirror the shape of any existing per-format sync test. |
| 5 | Documentation note in setup charter | Update the setup charter's sync-target list (line 23) to mark the `cursor` format as fully modeled (not half-modeled) so future hygiene passes don't re-flag it. |
| 6 | Flip Capability Map row | After `/adev:validate` passes, charter row `.cursor/rules/adev.mdc sync output` moves from `—` to `validated`. |

## Acceptance Criteria

- [ ] `skills/sync/SKILL.md` cursor-format section describes `.cursor/rules/adev.mdc` with YAML frontmatter (`description`, `alwaysApply: true`) and a ≤ 200-word pointer body; the Provider Detection bullet for Cursor names `.cursor/rules/adev.mdc`, not `.cursorrules`; the Learned Lessons placement rule for cursor matches the CLAUDE.md/AGENTS.md "before `# User Additions`" placement.
- [ ] The cli scaffold stub at `cli/index.mjs:465-467` is uncommented and emits the manifest block `- path: .cursor/rules/adev.mdc\n      format: cursor\n      providers: [cursor]`.
- [ ] `/adev:sync` writes `.cursor/rules/adev.mdc` end-to-end when `manifest.yaml :: sync.targets` includes a `format: cursor` entry: file exists at the resolved path, frontmatter parses, `alwaysApply` is the boolean `true`, body word count ≤ 200, User Additions block is present (empty on first run, preserved on re-run).
- [ ] Re-running `/adev:sync` preserves a user-edited `# User Additions` block byte-for-byte.
- [ ] An oversized body (> 200 words) raises `CURSOR_BODY_OVERSIZE` and does not leave a `.tmp` file behind.
- [ ] `/adev:sync --dry-run` against a manifest with `format: cursor` prints the proposed content (frontmatter + body) and does NOT write `.cursor/rules/adev.mdc`.
- [ ] `tests/sync/cursor-format.test.mjs` covers all of the above (happy path + User Additions preservation + Learned Lessons re-placement + oversize-body fail-loud + dry-run no-write).
- [ ] `npm test` passes.
- [ ] No new external dependencies; pure ESM; no hardcoded `~/.cursor/` literals; the writer touches only project-local paths.
- [ ] Charter Capability Map row for `.cursor/rules/adev.mdc sync output` flips from `—` to `validated` after `/adev:validate` passes.
