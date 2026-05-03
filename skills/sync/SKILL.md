---
name: adev:sync
description: "Sync constitution to CLAUDE.md, AGENTS.md, and other agent files declared in manifest.yaml. Run after editing the constitution or when agent files are out of date. Use when the user says 'sync agent files', 'update agent files', 'constitution changed', 'regenerate agent configs', or after any edit to constitution.md."
---

# Sync Constitution to Agent Files

Reads `.context-index/constitution.md` and generates tool-specific agent files based on `manifest.yaml` sync targets.

## Execution Protocol

**Silent execution (subagent mode):** When this skill is invoked as a subagent (via the Agent tool from a parent orchestrator), execute all steps silently:
- Chain steps continuously without intermediate commentary or narration.
- Do NOT emit confirmations like "Loaded the context" or "Proceeding to step N."
- Do NOT summarize intermediate findings between steps.
- Use parallel tool calls (multiple Read/Grep/Glob in one turn) for context-loading phases.
- Report ONLY the final result in the structured format expected by the parent.

This directive does NOT apply when:
- The skill is invoked interactively by a user.
- The subagent prompt contains `VERBOSE: true` (debug mode — narrate all steps).

## Provider Detection

When syncing, detect which AI coding assistant is running:
- Claude Code: `CLAUDE.md` (primary)
- OpenCode: `AGENTS.md` (primary)
- Cursor: `.cursorrules`
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

   ### Cursor format (`.cursorrules`)
   Full constitution content. Convert Context Routing pointers to Cursor-compatible references where applicable.

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
   - **Placement in CLAUDE.md and AGENTS.md:** Place the `## Learned Lessons` section heading immediately before the `# User Additions` marker.
   - **Placement in .cursorrules and copilot-instructions.md (`.github/copilot-instructions.md`):** Append the section at the end of the file.
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
