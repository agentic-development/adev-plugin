---
name: adev:sync
description: "Sync constitution to AGENTS.md, CLAUDE.md, and other agent files declared in manifest.yaml. Run after editing the constitution or when agent files are out of date. In Codex, invoke with $adev:sync"
---

# Sync Constitution to Agent Files

Reads `.context-index/constitution.md` and generates tool-specific agent files based on `manifest.yaml` sync targets.

## Provider Detection

When syncing, detect which AI coding assistant is running:

- OpenAI Codex: `AGENTS.md` (primary)
- Claude Code: `CLAUDE.md` (primary)
- Cursor: `.cursorrules`
- GitHub Copilot: `.github/copilot-instructions.md`

## Process

1. **Read source files:**
   - `.context-index/constitution.md` (required)
   - `.context-index/manifest.yaml` (required)
   - `.context-index/platform-context.yaml` (optional)

2. **For each sync target in manifest:**

   ### Codex / Generic agents format (`AGENTS.md`)
   ```markdown
   <!-- Synced from .context-index/constitution.md by adev. Do not edit above the User Additions line. -->

   [Full constitution content]

   ## Project Context
   This project uses the Agentic Development Framework (adev).
   - Constitution: `.context-index/constitution.md`
   - Manifest: `.context-index/manifest.yaml`
   - Platform: [summary]
   - Available skills: $adev:brainstorm, $adev:specify, $adev:review-specs, $adev:plan, $adev:implement, $adev:validate

   ## User Additions
   <!-- Content below is preserved across syncs -->

   [preserved content]
   ```

   ### Claude format (`CLAUDE.md`)
   Same content with slash command syntax: `/adev:brainstorm`, etc.

3. **Preserve User Additions:**
   - Look for `## User Additions` marker
   - Preserve everything below the marker
   - If missing, append the marker

## Dry-Run Mode

```text
$adev:sync --dry-run
// Shows what would be generated without writing files
```

## When to Run

- After `$adev:init` (automatic)
- After editing `.context-index/constitution.md`
- After editing `.context-index/manifest.yaml`
- When agent files seem stale (`$adev:hygiene` detects this)

## Codex Integration

For Codex, the sync process also:
1. Updates `.agents/` directory if it exists
2. Ensures skill symlinks are valid
3. Updates Codex config if needed
