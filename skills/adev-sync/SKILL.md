---
name: adev-sync
description: "Sync constitution to CLAUDE.md, AGENTS.md, and other agent files declared in manifest.yaml. Run after editing the constitution or when agent files are out of date. Use when the user says 'sync agent files', 'update agent files', 'constitution changed', 'regenerate agent configs', or after any edit to constitution.md."
---

# Sync Constitution to Agent Files

Reads `.context-index/constitution.md` and generates tool-specific agent files based on `manifest.yaml` sync targets.

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
   - Available skills: /adev-brainstorm, /adev-specify, /adev-review-specs, /adev-plan, /adev-implement, /adev-validate, /adev-debug, /adev-hygiene

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
   - Available skills: /adev-brainstorm, /adev-specify, /adev-review-specs, /adev-plan, /adev-implement, /adev-validate, /adev-debug, /adev-hygiene
   ```

   ### Copilot format (`.github/copilot-instructions.md`)
   Principles and coding standards only. Omit Context Routing (Copilot has limited file navigation).

   ### Cursor format (`.cursorrules`)
   Full constitution content. Convert Context Routing pointers to Cursor-compatible references where applicable.

3. **Preserve User Additions:**
   - Look for `# User Additions` marker in existing target file
   - If found, preserve everything below the marker
   - If marker missing, append the marker with empty section
   - If target file does not exist, create it fresh

4. **Report:**
   List which files were updated and their line counts.

## Dry-Run Mode

`/adev-sync --dry-run` — Show what would be generated without writing files. Print the diff for each target.

## When to Run

- After `/adev-init` (automatic)
- After editing `.context-index/constitution.md` (suggested by sync-trigger hook)
- After editing `.context-index/manifest.yaml` (manual)
- When agent files seem stale (`/adev-hygiene` will detect this)
