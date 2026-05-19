---
name: adev:sync
description: "Sync constitution to CLAUDE.md, AGENTS.md, and other agent files declared in manifest.yaml. Run after editing the constitution or when agent files are out of date. Use when the user says 'sync agent files', 'update agent files', 'constitution changed', 'regenerate agent configs', or after any edit to constitution.md."
---

# Sync Constitution to Agent Files

Reads `.context-index/constitution.md` and generates tool-specific agent files based on `manifest.yaml` sync targets.

## Provider Detection

When syncing, detect which AI coding assistant is running:
- Claude Code: `CLAUDE.md` (primary)
- OpenCode: `AGENTS.md` (primary)
- Cursor: `.cursor/rules/adev.mdc`
- GitHub Copilot: `.github/copilot-instructions.md`

If multiple providers are used, sync all enabled targets from the manifest.

## Process

1. **Read source files:**
   - `.context-index/constitution.md` (required)
   - `.context-index/manifest.yaml` (required, for sync targets)
   - `.context-index/platform-context.yaml` (optional, for tech stack summary)

2. **For each sync target in manifest:**

   ### Claude format (`CLAUDE.md`)
   ```markdown
   <!-- Synced from .context-index/constitution.md by adev. Do not edit above the User Additions line. -->

   [Full constitution content]

   ## Context Index
   This project uses the Agentic Development Framework (adev).
   - Constitution: `.context-index/constitution.md`
   - Manifest: `.context-index/manifest.yaml`
   - Platform: [summary from platform-context.yaml]
   - Available skills: /adev:brainstorm, /adev:specify, /adev:review-specs, /adev:plan, /adev:implement, /adev:validate, /adev:debug, /adev:issues, /adev:hygiene

   ## Task Management (conditional)
   <!-- BEGIN TASK MANAGEMENT -->
   [Read `tasks.backend` from manifest.yaml. If configured:
    - Include the Task Management section from constitution.md.
    - If tasks.backend is "beads", include br command reference.
    - If tasks.backend is "file", include markdown table reference.
    - If constitution has no Task Management section, generate from
      the default content matching the configured backend.
    If tasks.backend is NOT configured in the manifest, omit this
    entire section (no empty block, no placeholder).]
   <!-- END TASK MANAGEMENT -->

   ## Learned Lessons (conditional — see step 3)

   # User Additions
   <!-- Content below is preserved across syncs. Add Claude-specific instructions here. -->

   [preserved content from previous CLAUDE.md below this marker]
   ```

   ### OpenCode / Generic agents format (`AGENTS.md`)
   ```markdown
   <!-- Synced from .context-index/constitution.md by adev. -->

   [Full constitution content]

   ## Project Context
   This project uses the Agentic Development Framework (adev).
   - Constitution: `.context-index/constitution.md`
   - Manifest: `.context-index/manifest.yaml`
   - Platform: [summary from platform-context.yaml]
   - Available skills: /adev:brainstorm, /adev:specify, /adev:review-specs, /adev:plan, /adev:implement, /adev:validate, /adev:debug, /adev:issues, /adev:hygiene

   ## Task Management (conditional)
   <!-- BEGIN TASK MANAGEMENT -->
   [Same logic as Claude format: include if tasks.backend is configured, omit otherwise.]
   <!-- END TASK MANAGEMENT -->
   ```

   ### Copilot format (`.github/copilot-instructions.md`)
   Principles and coding standards only. Omit Context Routing (Copilot has limited file navigation).

   ### Cursor format (`.cursor/rules/adev.mdc`)

   Pointer projection of `.context-index/constitution.md` — NOT a duplicate of it. Cursor 2.5+ reads always-apply rules from `.cursor/rules/*.mdc`; adev owns exactly one file under that directory (`adev.mdc`). Any pre-existing sibling files in `.cursor/rules/` MUST NOT be read, modified, or deleted by this writer.

   **Output path:** `.cursor/rules/adev.mdc` is the default emitted by the `setup`-charter scaffold (see `cli/index.mjs::handleDualSyncTargets`). Users may override `path:` per manifest entry; the format's writer always assumes `.mdc` extension and Cursor Rules semantics regardless of path.

   **File composition (in this order):**

   ```mdc
   ---
   description: <single-line summary; trimmed; ≤ 200 characters; no embedded newlines>
   alwaysApply: true
   ---

   <pointer body — body word count ≤ 200 (frontmatter excluded)>

   # User Additions
   <preserved content from the prior file, if any>
   ```

   - **Frontmatter:** YAML block with exactly two keys — `description` (string) and `alwaysApply` (literal boolean `true`, not the string `"true"`). The frontmatter is owned by adev and rewritten wholesale on each sync.
   - **Pointer body:** MUST NOT duplicate the constitution. It directs the reader to `.context-index/constitution.md` for the source of truth. The body MAY include: (a) the project identity sentence, (b) a one-line note that non-negotiable principles live in the constitution, (c) the relative path to `.context-index/constitution.md`, (d) a short pointer to `CLAUDE.md` and `AGENTS.md` for sibling agent-file projections.
   - **Body word count cap:** ≤ 200 words. Count is the number of whitespace-delimited tokens between the frontmatter closing `---` and the `# User Additions` marker (or EOF when the marker is absent). The `## Learned Lessons` heading is excluded from the count; blank lines and the `# User Additions` heading itself are excluded.
   - **Body oversize (`CURSOR_BODY_OVERSIZE`):** if the composed body exceeds 200 words, the writer throws `CURSOR_BODY_OVERSIZE` carrying the actual count, removes any sibling `.tmp` file, and writes NO `.cursor/rules/adev.mdc`. Cursor's always-apply guidance is the reason this limit exists — the failure is loud by design.
   - **User Additions preservation:** the existing `# User Additions` protocol applies verbatim (step 4 below). User Additions are trusted as user-authored content reviewed at edit time, not at sync time — this matches the established CLAUDE.md/AGENTS.md trust model and is not a new attack surface introduced by this format.
   - **Sibling-file non-interference:** the writer reads and writes only `.cursor/rules/adev.mdc` and its `.cursor/rules/adev.mdc.tmp` sibling. Any other file under `.cursor/rules/` is untouched (read or write).
   - **Atomic write:** compose the full content in memory, write to `.cursor/rules/adev.mdc.tmp`, then rename to `.cursor/rules/adev.mdc`. On any thrown error before the rename, unlink the `.tmp` file before re-raising.
   - **Dry-run:** `/adev:sync --dry-run` prints the proposed content (frontmatter + body) and the diff against the existing file (or "new file" when absent); no write occurs.

3. **Inject Learned Lessons (conditional):**

   Read high-confidence heuristics via inline Node.js using `retrieveHeuristics` and `renderHeuristic` from `lib/heuristics.mjs`. This step is non-blocking: if `retrieveHeuristics` throws, log a warning to stderr and proceed without the section.

   ```js
   import { retrieveHeuristics } from 'lib/heuristics.mjs';
   const heuristics = await retrieveHeuristics(projectRoot, '_global');
   const highOnly = heuristics.filter(h => h.confidence === 'high');
   ```

   - If no `high`-confidence entries exist, skip the section entirely. If a stale `## Learned Lessons` block is already present in the target file, remove it (replace from the heading to the next `##` heading or EOF, whichever comes first).
   - If entries exist, group by scope alphabetically. The `_global` scope sorts last.
   - Render each entry as: `- <title> (<scope>) — <pattern truncated to 80 chars>`
   - **Placement in CLAUDE.md, AGENTS.md, and `.cursor/rules/adev.mdc`:** Place the `## Learned Lessons` section heading immediately before the `# User Additions` marker.
   - **Placement in `.github/copilot-instructions.md` (Copilot):** Append the section at the end of the file.
   - **On re-sync:** Detect an existing `## Learned Lessons` heading and remove the old block (from the heading to the next `##` or EOF), then write the fresh replacement in the correct position.

4. **Preserve User Additions:**
   - Look for `# User Additions` marker in existing target file
   - If found, preserve everything below the marker
   - If marker missing, append the marker with empty section
   - If target file does not exist, create it fresh

5. **Report:**
   List which files were updated and their line counts.

## Dry-Run Mode

`/adev:sync --dry-run` — Show what would be generated without writing files. Print the diff for each target.

## When to Run

- After `/adev:init` (automatic)
- After editing `.context-index/constitution.md` (suggested by sync-trigger hook)
- After editing `.context-index/manifest.yaml` (manual)
- When agent files seem stale (`/adev:hygiene` will detect this)

## Context Routing referent

The constitution's Context Routing table includes a row `Lifecycle state | .context-index/lifecycle-state/` — this points at the per-spec JSONL event logs managed by `lib/lifecycle-state.mjs`. When syncing the constitution into agent files, propagate this row verbatim; do not rewrite it to refer to the legacy `build-state/` directory (which has been renamed by `one-shot-migration-tool.spec.md`).

## API reference

Heuristic injection (Step 3):

- `retrieveHeuristics(projectRoot, scope)` and `renderHeuristic(entry)` from `<ADEV_ROOT>/lib/heuristics.mjs` — read high-confidence heuristics for the `## Learned Lessons` block.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`. Use when reading sync targets, `tasks.backend`, and `project.adev_version`.
