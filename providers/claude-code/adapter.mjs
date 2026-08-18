import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, chmodSync, readdirSync, rmSync, realpathSync, lstatSync, readlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { readJson } from "../../lib/provider/json-io.mjs";
import { installCopyFilter } from "../../lib/provider/ship-filter.mjs";

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

/**
 * Write JSON, refusing to follow a symlink.
 *
 * `.claude/settings.json` is routinely tracked in git, and git tracks symlinks.
 * The canonical flow is "clone a repo, then run `npx @adev-org/adev-cli
 * install`" — the clone is attacker-controlled and the write happens before the
 * operator has made any trust decision. A plain `writeFileSync` follows the
 * link and overwrites whatever it points at, anywhere the user can write.
 *
 * `lstatSync` does not follow the final component, so this sees the link
 * itself. Refusing is correct rather than replacing it: a symlinked settings
 * file may well be a deliberate dotfile-manager setup, and silently clobbering
 * that would be its own defect. Name it and let the operator decide.
 */
function writeJson(path, data) {
  let st = null;
  try {
    st = lstatSync(path);
  } catch {
    // Does not exist yet — nothing to follow.
  }
  if (st?.isSymbolicLink()) {
    const err = new Error(
      `Refusing to write through a symlink: ${path} → ${readlinkSync(path)}\n` +
        "  adev will not follow a link when writing settings. Replace it with a " +
        "regular file, or point it somewhere you intend adev to write.",
    );
    err.code = "SETTINGS_PATH_IS_SYMLINK";
    throw err;
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function getClaudeHome() {
  return join(process.env.HOME || process.env.USERPROFILE, ".claude");
}

/**
 * Do two paths denote the same file?
 *
 * String comparison is not enough: on macOS `$TMPDIR` is `/var/...` while
 * `process.cwd()` reports the resolved `/private/var/...`, so the user- and
 * project-scope settings paths can be the same file yet compare unequal.
 * Getting this wrong deletes the entry we just wrote.
 *
 * Falls back to string comparison when either path does not exist yet —
 * realpathSync throws on a missing file, and "not created yet" means "not the
 * same file we just wrote" for every caller here.
 */
function sameFile(a, b) {
  if (a === b) return true;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
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
    const pluginCacheParent = join(claudeHome, "plugins", "cache", "agentic-development", "adev");
    const cacheDir = join(pluginCacheParent, PLUGIN_VERSION);

    if (existsSync(cacheDir)) {
      this.updateRegistry(claudeHome, cacheDir, scope);
      this.enable(scope);
      return { installed: false, path: cacheDir };
    }

    ensureDir(dirname(cacheDir));
    cpSync(PLUGIN_ROOT, cacheDir, {
      recursive: true,
      filter: installCopyFilter(PLUGIN_ROOT),
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

    this.cleanOldVersions(pluginCacheParent);
    this.updateRegistry(claudeHome, cacheDir, scope);
    this.enable(scope);

    return { installed: true, path: cacheDir };
  },

  cleanOldVersions(pluginCacheParent) {
    if (!existsSync(pluginCacheParent)) return;
    for (const entry of readdirSync(pluginCacheParent)) {
      if (entry !== PLUGIN_VERSION) {
        rmSync(join(pluginCacheParent, entry), { recursive: true, force: true });
      }
    }
  },

  /**
   * @param {string} claudeHome
   * @param {string} cacheDir
   * @param {"user"|"project"} [scope] - the scope the user actually chose.
   *   Omitted means "user" for backward compatibility. Previously this was
   *   hardcoded, so a fresh install recorded "user" no matter what was
   *   answered at the prompt.
   */
  updateRegistry(claudeHome, cacheDir, scope) {
    const registryPath = join(claudeHome, "plugins", "installed_plugins.json");
    const registry = readJson(registryPath) || { version: 2, plugins: {} };
    const key = "adev@agentic-development";
    const now = new Date().toISOString();
    const existing = registry.plugins[key]?.[0];

    registry.plugins[key] = [
      {
        // An explicit answer wins over whatever a previous install recorded —
        // re-running and choosing a different scope is exactly how a user
        // corrects it.
        scope: scope || existing?.scope || "user",
        installPath: cacheDir,
        version: PLUGIN_VERSION,
        installedAt: existing?.installedAt || now,
        lastUpdated: now,
      },
    ];

    writeJson(registryPath, registry);
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

    // Register the custom marketplace in user-level settings so Claude Code
    // can resolve adev@agentic-development on any machine.
    const userSettingsPath = join(claudeHome, "settings.json");
    const userSettings = settingsPath === userSettingsPath
      ? settings
      : (readJson(userSettingsPath) || {});

    if (!userSettings.extraKnownMarketplaces) {
      userSettings.extraKnownMarketplaces = {};
    }

    if (!userSettings.extraKnownMarketplaces["agentic-development"]) {
      userSettings.extraKnownMarketplaces["agentic-development"] = {
        source: {
          source: "settings",
          name: "agentic-development",
          plugins: [
            {
              name: "adev",
              source: {
                source: "github",
                repo: "agentic-development/adev-plugin",
              },
            },
          ],
        },
      };

      if (settingsPath !== userSettingsPath) {
        ensureDir(dirname(userSettingsPath));
        writeJson(userSettingsPath, userSettings);
      } else {
        writeJson(settingsPath, settings);
      }
    }

    // A project-scoped enable must REVOKE any machine-wide enablement rather
    // than sit alongside it: leaving the user entry made the install prompt a
    // lie, since answering "project" still left adev enabled for every project
    // on the machine with nothing said about it.
    //
    // This runs LAST and re-reads from disk deliberately. The marketplace
    // registration above writes the user settings file from an object captured
    // earlier, so revoking before it would be silently undone. It is also a
    // no-op when the two paths are the same file (HOME == cwd), which would
    // otherwise delete the entry this call just wrote.
    if (scope !== "user" && !sameFile(settingsPath, userSettingsPath)) {
      const onDisk = readJson(userSettingsPath);
      if (onDisk?.enabledPlugins?.["adev@agentic-development"] !== undefined) {
        delete onDisk.enabledPlugins["adev@agentic-development"];
        writeJson(userSettingsPath, onDisk);
      }
    }

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
