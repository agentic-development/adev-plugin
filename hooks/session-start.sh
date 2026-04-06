#!/usr/bin/env bash
# adev SessionStart hook
# Injects adev awareness into every Claude Code session.
# When execution state is active/blocked, appends a resume block.
# Fires on: startup, resume, clear, compact

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
SKILL_FILE="${PLUGIN_ROOT}/skills/using-adev/SKILL.md"

# Clear context-preflight flag so each session starts fresh
rm -f .context-index/.context-preflight-ok

if [ ! -f "$SKILL_FILE" ]; then
  exit 0
fi

# Read the skill content
SKILL_CONTENT=$(cat "$SKILL_FILE")

# Build resume block from execution state (if available)
RESUME_BLOCK=""
RESUME_BLOCK=$(node -e '
  const fs = require("fs");
  const path = require("path");

  try {
    const stateFile = path.join(process.cwd(), ".context-index", ".execution-state.md");
    const raw = fs.readFileSync(stateFile, "utf-8");

    // Parse frontmatter
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) {
      // Malformed
      console.log("---\nname: session-resume\ndescription: \"Warning: execution state file could not be read.\"\n---\n\nExecution state file is missing or corrupt. Run /adev:issues to check issue board status.");
      process.exit(0);
    }

    const meta = {};
    for (const line of match[1].split("\n")) {
      const i = line.indexOf(":");
      if (i === -1) continue;
      meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }

    const status = meta.status || "";

    if (status === "idle" || status === "") {
      // No resume needed
      process.exit(0);
    }

    if (status === "active") {
      let block = "---\nname: session-resume\ndescription: \"Resumption context from previous session. You were actively working on a plan.\"\n---\n\n# Session Resume\n\n";
      block += "**Status:** active\n";
      block += "**Plan:** " + (meta.planRef || "") + "\n";
      block += "**Current Task:** " + (meta.currentTask || "") + "\n";
      block += "**Issue:** " + (meta.issueBinding || "") + "\n";
      block += "**Next Action:** " + (meta.nextAction || "") + "\n";

      // Parse progress from body
      const body = match[2] || "";
      const progressLines = body.split("\n").filter(l => l.match(/^- \[(x| )\] /));
      if (progressLines.length > 0) {
        block += "\n## Progress\n\n";
        for (const pl of progressLines) {
          block += pl + "\n";
        }
      }

      block += "\nResume from Task " + (meta.currentTask || "") + ". Read the plan file for full context.";
      console.log(block);
    } else if (status === "blocked") {
      let block = "---\nname: session-resume\ndescription: \"Resumption context from previous session. Work was blocked.\"\n---\n\n# Session Resume\n\n";
      block += "**Status:** blocked\n";
      block += "**Blocker:** " + (meta.blockers || "") + "\n";
      block += "**Next Action:** " + (meta.nextAction || "") + "\n";
      block += "\nAddress the blocker before continuing implementation.";
      console.log(block);
    } else {
      // Unknown status — treat as malformed
      console.log("---\nname: session-resume\ndescription: \"Warning: execution state file could not be read.\"\n---\n\nExecution state file is missing or corrupt. Run /adev:issues to check issue board status.");
    }
  } catch (e) {
    // File missing or any error — no resume block
    process.exit(0);
  }
' 2>/dev/null || true)

# Combine skill content with resume block
if [ -n "$RESUME_BLOCK" ]; then
  COMBINED="${SKILL_CONTENT}
${RESUME_BLOCK}"
else
  COMBINED="${SKILL_CONTENT}"
fi

# Escape for JSON using python3
COMBINED=$(printf '%s' "$COMBINED" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')
# Remove surrounding quotes from json.dumps output
COMBINED="${COMBINED:1:${#COMBINED}-2}"

cat <<JSONEOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${COMBINED}"
  }
}
JSONEOF
