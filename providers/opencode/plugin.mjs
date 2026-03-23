/**
 * OpenCode plugin for adev.
 * 
 * This plugin provides:
 * - Session context injection via session.created event
 * - Constitution linter via tool.execute.before hook
 * - Sync trigger via tool.execute.after hook
 * 
 * @see https://opencode.ai/docs/plugins/
 */

import { existsSync, readFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, "..", "..");

function loadSkill(name) {
  const skillPath = join(PLUGIN_ROOT, "skills", name, "SKILL.md");
  return existsSync(skillPath) ? readFileSync(skillPath, "utf8") : null;
}

function loadManifest() {
  const manifestPath = join(process.cwd(), ".context-index", "manifest.yaml");
  return existsSync(manifestPath) ? manifestPath : null;
}

/**
 * @param {object} ctx - OpenCode plugin context
 * @param {object} ctx.client - OpenCode SDK client
 * @param {string} ctx.directory - Current working directory
 * @param {string} ctx.worktree - Git worktree path
 * @param {function} ctx.$ - Bun shell API
 */
export default async function AdevPlugin(ctx) {
  const { client, directory } = ctx;

  return {
    /**
     * Inject adev context on session start.
     * Uses session.created event + SDK prompt injection.
     * TODO: Replace with session.start hook once stable (see opencode #18007)
     */
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const skill = loadSkill("using-adev");
        if (skill && client?.session?.prompt) {
          try {
            await client.session.prompt({
              path: { id: event.sessionID },
              body: {
                noReply: true,
                parts: [{ type: "text", text: skill }]
              }
            });
          } catch (e) {
            // Session prompt injection may fail silently - context is also in AGENTS.md
          }
        }
      }
    },

    /**
     * Constitution linter - runs before Edit tool on constitution.md
     * Wraps the bash hook for consistent behavior across providers.
     */
    "tool.execute.before": async (input, output) => {
      const tool = input?.tool;
      const args = input?.args || {};
      const filePath = args.file_path || "";

      if (tool === "Edit" && filePath.includes("constitution.md")) {
        const constitutionPath = join(directory || process.cwd(), filePath);
        if (!existsSync(constitutionPath)) {
          return;
        }

        try {
          const result = await ctx.$`bash "${PLUGIN_ROOT}/hooks/constitution-linter.sh"`.nothrow();
          if (result.exitCode === 2) {
            throw new Error(result.stderr || "Constitution validation failed");
          }
        } catch (e) {
          if (e.message?.includes("Constitution validation failed")) {
            throw e;
          }
        }
      }

      if (tool === "Bash" && args.command) {
        const command = args.command;
        if (/git\s+(merge|push)/.test(command) || /gh\s+pr\s+merge/.test(command)) {
          try {
            const result = await ctx.$`bash "${PLUGIN_ROOT}/hooks/merge-guard.sh"`.nothrow();
            if (result.exitCode === 2) {
              throw new Error(result.stderr || "Merge blocked by merge policy");
            }
          } catch (e) {
            if (e.message?.includes("blocked")) {
              throw e;
            }
          }
        }
      }
    },

    /**
     * Sync trigger - runs after Edit tool on constitution.md
     * Notifies user to run /adev-sync
     */
    "tool.execute.after": async (input, output) => {
      const tool = input?.tool;
      const args = input?.args || {};
      const filePath = args.file_path || "";

      if (tool === "Edit" && filePath.includes("constitution.md")) {
        if (loadManifest()) {
          if (client?.session?.prompt && output?.sessionID) {
            try {
              await client.session.prompt({
                path: { id: output.sessionID },
                body: {
                  parts: [{
                    type: "text",
                    text: "[adev] Constitution was updated. Run /adev-sync to propagate changes to AGENTS.md and other agent files."
                  }]
                }
              });
            } catch {}
          }
        }
      }
    },

    /**
     * Preserve adev context during session compaction.
     */
    "experimental.session.compacting": async (input, output) => {
      const manifestPath = loadManifest();
      if (manifestPath) {
        output.context = output.context || [];
        output.context.push(
          "[adev] This session uses the Agentic Development Framework. " +
          "Context lives in .context-index/. Run /adev-hygiene to audit context health."
        );
      }
    },
  };
}
