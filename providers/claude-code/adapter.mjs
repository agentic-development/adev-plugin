import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, chmodSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = join(__dirname, "../..");
const PLUGIN_VERSION = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8")
).version;

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function getClaudeHome() {
  return join(process.env.HOME || process.env.USERPROFILE, ".claude");
}

/**
 * Claude Code provider adapter.
 * Installs plugin to ~/.claude/plugins/cache/ and enables in settings.json
 */
export const ClaudeCodeAdapter = {
  name: "claude-code",
  pluginRoot: PLUGIN_ROOT,
  version: PLUGIN_VERSION,

  detect() {
    return process.env.CLAUDE === "true" || existsSync(".claude");
  },

  getAgentFile() {
    return "CLAUDE.md";
  },

  async install(opts = {}) {
    const scope = opts.scope || "user";
    const claudeHome = getClaudeHome();
    const cacheDir = join(claudeHome, "plugins", "cache", "agentic-development", "adev", PLUGIN_VERSION);

    if (existsSync(cacheDir)) {
      return { installed: false, path: cacheDir };
    }

    ensureDir(dirname(cacheDir));
    cpSync(PLUGIN_ROOT, cacheDir, {
      recursive: true,
      filter: (src) => {
        const name = src.split("/").pop();
        return name !== ".git" && name !== "node_modules" && name !== ".DS_Store";
      },
    });

    const hooksDir = join(cacheDir, "hooks");
    if (existsSync(hooksDir)) {
      for (const file of ["session-start.sh", "constitution-linter.sh", "sync-trigger.sh", "merge-guard.sh"]) {
        const hookPath = join(hooksDir, file);
        if (existsSync(hookPath)) {
          chmodSync(hookPath, 0o755);
        }
      }
    }

    this.enable(scope);

    return { installed: true, path: cacheDir };
  },

  enable(scope = "user") {
    const claudeHome = getClaudeHome();
    let settingsPath;

    if (scope === "user") {
      settingsPath = join(claudeHome, "settings.json");
    } else {
      settingsPath = join(process.cwd(), ".claude", "settings.json");
    }

    const settings = readJson(settingsPath) || {};
    if (!settings.enabledPlugins) {
      settings.enabledPlugins = {};
    }

    settings.enabledPlugins["adev@agentic-development"] = true;
    ensureDir(dirname(settingsPath));
    writeJson(settingsPath, settings);

    return settingsPath;
  },

  async uninstall(opts = {}) {
    const scope = opts.scope || "user";
    const claudeHome = getClaudeHome();

    if (scope === "user" || scope === "all") {
      const userSettingsPath = join(claudeHome, "settings.json");
      const userSettings = readJson(userSettingsPath);
      if (userSettings?.enabledPlugins?.["adev@agentic-development"] !== undefined) {
        delete userSettings.enabledPlugins["adev@agentic-development"];
        writeJson(userSettingsPath, userSettings);
      }
    }

    if (scope === "project" || scope === "all") {
      const projectSettingsPath = join(process.cwd(), ".claude", "settings.json");
      const projectSettings = readJson(projectSettingsPath);
      if (projectSettings?.enabledPlugins?.["adev@agentic-development"] !== undefined) {
        delete projectSettings.enabledPlugins["adev@agentic-development"];
        if (projectSettings.enabledPlugins["superpowers@claude-plugins-official"] === false) {
          delete projectSettings.enabledPlugins["superpowers@claude-plugins-official"];
        }
        writeJson(projectSettingsPath, projectSettings);
      }
    }

    const cacheDir = join(claudeHome, "plugins", "cache", "agentic-development");
    if (existsSync(cacheDir)) {
      execSync(`rm -rf "${cacheDir}"`);
    }
  },

  detectConflicts() {
    const claudeHome = getClaudeHome();
    const userSettings = readJson(join(claudeHome, "settings.json")) || {};
    const projectSettingsPath = join(process.cwd(), ".claude", "settings.json");
    const projectSettings = readJson(projectSettingsPath) || {};

    const conflicts = [];
    const enabled = {
      ...userSettings.enabledPlugins,
      ...projectSettings.enabledPlugins,
    };

    if (enabled["superpowers@claude-plugins-official"] === true) {
      if (projectSettings.enabledPlugins?.["superpowers@claude-plugins-official"] !== false) {
        conflicts.push({
          name: "superpowers",
          key: "superpowers@claude-plugins-official",
          reason: "Overlapping brainstorming, planning, TDD, and code review workflows",
        });
      }
    }

    return conflicts;
  },

  disableConflictingPlugin(pluginKey) {
    const settingsPath = join(process.cwd(), ".claude", "settings.json");
    const settings = readJson(settingsPath) || {};
    if (!settings.enabledPlugins) {
      settings.enabledPlugins = {};
    }
    settings.enabledPlugins[pluginKey] = false;
    ensureDir(dirname(settingsPath));
    writeJson(settingsPath, settings);
  },
};

export default ClaudeCodeAdapter;
