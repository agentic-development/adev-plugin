#!/usr/bin/env bash
# adev PostToolUse hook: Session Capture
# Appends a JSONL tracking line to .context-index/.session-tracking.jsonl
# when the manifest provider is "native".
# Fires on: any tool use (broad matcher)

set -uo pipefail

# Read stdin JSON (hook protocol — contains tool_name, tool_input, session_id)
STDIN_JSON=$(cat)

# Single node call: parse stdin, resolve provider, build JSONL line, append to file.
# Exits with code 0 always (non-blocking). Outputs '{}' to stdout (hook protocol).
printf '%s' "$STDIN_JSON" | node -e '
  const fs = require("fs");
  const path = require("path");

  let d = "";
  process.stdin.on("data", c => d += c);
  process.stdin.on("end", async () => {
    let input = {};
    try { input = JSON.parse(d); } catch {}

    // Resolve provider: prefer stdin, fall back to manifest.yaml
    let provider = input.provider || "";
    if (!provider) {
      try {
        const manifest = fs.readFileSync(".context-index/manifest.yaml", "utf8");
        const m = manifest.match(/provider:\s*(\S+)/);
        if (m) provider = m[1];
      } catch {}
    }

    if (provider !== "native") {
      process.stdout.write("{}\n");
      return;
    }

    // Extract fields from stdin JSON (PostToolUse protocol)
    const toolName = input.tool_name || "";
    if (!toolName) {
      process.stdout.write("{}\n");
      return;
    }
    const filePath = (input.tool_input && input.tool_input.file_path) || "";
    const sessionId = input.session_id || "";

    const entry = {
      tool: toolName,
      files: filePath ? [filePath] : [],
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
    };
    if (sessionId) entry.session_id = sessionId;

    // Build operator identity: $USER/local or $USER/remote
    const osUser = process.env.USER || process.env.USERNAME || "unknown";
    const isRemote = process.env.CLAUDE_CODE_REMOTE === "true";
    entry.operator = osUser + "/" + (isRemote ? "remote" : "local");

    // Enrich with issue/epic from execution state (if active)
    try {
      const statePath = path.join(".context-index", ".execution-state.md");
      const stateRaw = fs.readFileSync(statePath, "utf8");
      const fmMatch = stateRaw.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const fm = fmMatch[1];
        const statusM = fm.match(/status:\s*(\S+)/);
        if (statusM && statusM[1] === "active") {
          const issueM = fm.match(/issueBinding:\s*(\S+)/);
          if (issueM && issueM[1]) entry.issue = issueM[1];
          // Extract epic from issue board if issue is bound
          // Supports both file and beads backends
          if (entry.issue) {
            try {
              let backend = "file";
              try {
                const manifest = fs.readFileSync(".context-index/manifest.yaml", "utf8");
                const bm = manifest.match(/backend:\s*(\S+)/);
                if (bm) backend = bm[1];
              } catch {}

              if (backend === "beads") {
                // beads backend: epics stored in file adapter (hybrid)
                // but issue→epic mapping is in .beads-map.json
                try {
                  const mapPath = path.join(".context-index", "tasks", ".beads-map.json");
                  const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
                  const issueEntry = map[entry.issue];
                  if (issueEntry && issueEntry.epicId) entry.epic = issueEntry.epicId;
                } catch {}
                // Fallback: check file adapter board if map lacks entry
                if (!entry.epic) {
                  try {
                    const boardPath = path.join(".context-index", "tasks", "tasks.md");
                    const board = fs.readFileSync(boardPath, "utf8");
                    const issueBlock = board.match(new RegExp("###\\s+" + entry.issue + "[\\s\\S]*?(?=###|$)"));
                    if (issueBlock) {
                      const epicM = issueBlock[0].match(/epicId:\s*(\S+)/);
                      if (epicM && epicM[1]) entry.epic = epicM[1];
                    }
                  } catch {}
                }
              } else {
                // file backend: read tasks.md directly
                const boardPath = path.join(".context-index", "tasks", "tasks.md");
                const board = fs.readFileSync(boardPath, "utf8");
                const issueBlock = board.match(new RegExp("###\\s+" + entry.issue + "[\\s\\S]*?(?=###|$)"));
                if (issueBlock) {
                  const epicM = issueBlock[0].match(/epicId:\s*(\S+)/);
                  if (epicM && epicM[1]) entry.epic = epicM[1];
                }
              }
            } catch {}
          }
        }
      }
    } catch {}

    // ── Token usage enrichment (graceful degradation) ──
    try {
      const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || "";
      if (pluginRoot && sessionId) {
        const [{ resolveSessionUsage }, { readCursor, writeCursor, resetCursor }, { computeCost }] = await Promise.all([
          import(pluginRoot + "/lib/session-file-reader.mjs"),
          import(pluginRoot + "/lib/token-cursor.mjs"),
          import(pluginRoot + "/lib/token-pricing.mjs"),
        ]);

        const cwd = process.cwd();
        const os = require("os");
        const encoded = cwd.replace(/\//g, "-");
        const sessionFile = path.join(os.homedir(), ".claude", "projects", encoded, sessionId + ".jsonl");

        let fileSize = 0;
        try { fileSize = fs.statSync(sessionFile).size; } catch {}

        const cursor = readCursor(cwd);
        const needsReset = !cursor
          || cursor.session_id !== sessionId
          || cursor.last_offset > fileSize;

        if (needsReset) {
          resetCursor(cwd, sessionId, fileSize);
          // No usage for this entry — no prior baseline to compute delta from
        } else {
          const usage = resolveSessionUsage({
            sessionId,
            projectDir: cwd,
            fromOffset: cursor.last_offset,
          });

          if (usage) {
            const costUsd = computeCost(usage.model, {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              cacheReadTokens: usage.cacheReadTokens,
              cacheCreationTokens: usage.cacheCreationTokens,
            });

            entry.usage = {
              input_tokens: usage.inputTokens,
              output_tokens: usage.outputTokens,
              cache_read_tokens: usage.cacheReadTokens,
              cache_creation_tokens: usage.cacheCreationTokens,
              cost_usd: costUsd,
            };

            const newCum = {
              input_tokens: (cursor.cumulative?.input_tokens || 0) + usage.inputTokens,
              output_tokens: (cursor.cumulative?.output_tokens || 0) + usage.outputTokens,
              cache_read_tokens: (cursor.cumulative?.cache_read_tokens || 0) + usage.cacheReadTokens,
              cache_creation_tokens: (cursor.cumulative?.cache_creation_tokens || 0) + usage.cacheCreationTokens,
            };

            writeCursor(cwd, {
              session_id: sessionId,
              last_offset: fileSize,
              cumulative: newCum,
              format_warning_emitted: cursor.format_warning_emitted || false,
            });
          }
        }
      }
    } catch (e) {
      // Graceful degradation — entry is written without usage
    }

    // Ensure directory and append
    const dir = ".context-index";
    const file = path.join(dir, ".session-tracking.jsonl");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(file, JSON.stringify(entry) + "\n");

    process.stdout.write("{}\n");
  });
' 2>/dev/null || echo '{}'
