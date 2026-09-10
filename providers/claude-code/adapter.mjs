import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, chmodSync, readdirSync, rmSync, realpathSync, lstatSync, readlinkSync } from "fs";
import { join, dirname, isAbsolute } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { readJson as readJsonRaw } from "../../lib/provider/json-io.mjs";
import { installCopyFilter } from "../../lib/provider/ship-filter.mjs";
import { lenientRealpath, isContained } from "../../lib/path-safety.mjs";

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
 * Confirm `path`'s directory resolves inside `root` before it is read or
 * written.
 *
 * The leaf-only `lstatSync` check in `writeJson` below only ever saw a
 * directly symlinked settings file. A symlinked ANCESTOR — a tracked
 * `.claude -> ~/.claude` or `.claude -> ~/.ssh` — is still followed by plain
 * `readFileSync`/`writeFileSync`, since neither one inspects any path
 * component but the last. That silently redirects a project-scope
 * enable/read into the user's file (or into an arbitrary attacker-chosen
 * directory), which is exactly the class of bug `sameFile()` above exists to
 * avoid for the two-scopes-one-file case — here the same realpathSync-based
 * comparison is applied to containment instead of equality. `root` is the
 * boundary the operator actually consented to for the given scope:
 * `process.cwd()` for project, `getClaudeHome()` for user.
 *
 * `lenientRealpath` (unlike a bare `realpathSync`) resolves symlinks at any
 * existing path component and tolerates a tail that doesn't exist yet — the
 * common case on a first-ever install, where `.claude/` has not been created
 * when this runs.
 */
function assertSettingsPathContained(path, root) {
  const resolvedDir = lenientRealpath(dirname(path));
  const resolvedRoot = lenientRealpath(root);
  if (!isContained(resolvedDir, resolvedRoot)) {
    const err = new Error(
      `Refusing to use a settings path outside its scope: ${path}\n` +
        `  resolves to ${resolvedDir}, which escapes ${resolvedRoot}.\n` +
        "  adev will not read or write through a symlinked ancestor directory. " +
        "Replace it with a regular directory, or point it inside the intended scope.",
    );
    err.code = "SETTINGS_PATH_ESCAPES_ROOT";
    throw err;
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
 *
 * The leaf check stays unconditional (refused even when the link happens to
 * resolve back inside `root`) — `assertSettingsPathContained` above is an
 * additive check on the ANCESTOR chain, not a replacement for it.
 */
function writeJson(path, data, root) {
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
  assertSettingsPathContained(path, root);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Read JSON, gated by the same ancestor-containment check as `writeJson` —
 * a read through an unintended symlinked directory is the other half of the
 * bug (issue adev-plugin-settings-symlink-parent-jukh): `enable()` reads
 * `settingsPath` before it writes it, so an unguarded read would still leak
 * the escape even if only the write were checked.
 */
function readJson(path, root) {
  assertSettingsPathContained(path, root);
  return readJsonRaw(path);
}

/**
 * Resolve the Claude Code config directory — the user-scope consent boundary.
 *
 * `CLAUDE_CONFIG_DIR` wins when set, matching Claude Code's own contract: it
 * is the supported way to run more than one config dir on a machine, and an
 * operator who sets it has already told Claude Code which directory is live.
 * Resolving `$HOME/.claude` regardless would install the plugin, the registry,
 * and the "user" settings into a directory the running Claude Code never
 * reads. It is used verbatim — it names the config dir itself, not its parent,
 * so no `.claude` segment is appended.
 *
 * This value is not just a path to write to: it is passed as the `root`
 * argument to `readJson`/`writeJson`, so a bad value widens the boundary
 * `assertSettingsPathContained` is meant to enforce. Two inputs are silently
 * wrong rather than loudly broken, so both are rejected for either source:
 *
 *   - Unset HOME/USERPROFILE would reach `join()` as `undefined`, whose
 *     `ERR_INVALID_ARG_TYPE` from inside `path` names neither the variable at
 *     fault nor the install step that needs it.
 *   - A relative or whitespace-only value resolves against `process.cwd()`,
 *     which would write the registry and "user" settings into whatever repo
 *     is current and then check containment against that directory instead of
 *     the operator's real config dir.
 */
function getClaudeHome() {
  const explicit = process.env.CLAUDE_CONFIG_DIR;
  if (typeof explicit === "string" && explicit.trim()) {
    const dir = explicit.trim();
    if (!isAbsolute(dir)) {
      const err = new Error(
        `CLAUDE_CONFIG_DIR is ${JSON.stringify(explicit)}, which is not an absolute path.\n` +
          "  Set it to an absolute config directory, or unset it to fall back to $HOME/.claude.",
      );
      err.code = "CLAUDE_HOME_UNRESOLVED";
      throw err;
    }
    return dir;
  }

  const raw = process.env.HOME || process.env.USERPROFILE;
  const home = typeof raw === "string" ? raw.trim() : "";
  if (!home || !isAbsolute(home)) {
    const err = new Error(
      "Cannot resolve the Claude Code config directory: " +
        (raw === undefined
          ? "neither HOME nor USERPROFILE is set."
          : `HOME/USERPROFILE is ${JSON.stringify(raw)}, which is not an absolute path.`) +
        "\n  Set HOME (or USERPROFILE on Windows) to an absolute path, or set " +
        "CLAUDE_CONFIG_DIR to the config directory you want adev installed into.",
    );
    err.code = "CLAUDE_HOME_UNRESOLVED";
    throw err;
  }
  return join(home, ".claude");
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
    const registry = readJson(registryPath, claudeHome) || { version: 2, plugins: {} };
    const key = "adev@agentic-development";
    const now = new Date().toISOString();
    const rows = Array.isArray(registry.plugins[key]) ? registry.plugins[key] : [];

    // An explicit answer wins over whatever a previous install recorded —
    // re-running and choosing a different scope is exactly how a user
    // corrects it. With no explicit answer, fall back to the first prior row.
    const resolvedScope = scope || rows[0]?.scope || "user";
    // Every project/local-scope row Claude Code itself writes carries a
    // projectPath binding it to one repo. A "project"-scope row without one
    // has no project to bind to, so nothing resolves the plugin anywhere.
    const projectPath = resolvedScope === "user" ? undefined : process.cwd();

    // Upsert the (scope, projectPath) row rather than replacing the whole
    // array — the array exists precisely so one plugin can hold several
    // scope/project rows. Overwriting it made a project-scope install in one
    // repo silently drop the row recorded for another repo.
    const matchIndex = rows.findIndex(
      (r) => r.scope === resolvedScope && r.projectPath === projectPath,
    );
    const existing = matchIndex >= 0 ? rows[matchIndex] : undefined;

    const row = {
      scope: resolvedScope,
      ...(projectPath !== undefined ? { projectPath } : {}),
      installPath: cacheDir,
      version: PLUGIN_VERSION,
      installedAt: existing?.installedAt || now,
      lastUpdated: now,
    };

    if (matchIndex >= 0) {
      rows[matchIndex] = row;
    } else {
      rows.push(row);
    }
    registry.plugins[key] = rows;

    writeJson(registryPath, registry, claudeHome);
  },

  enable(scope = "user") {
    const claudeHome = getClaudeHome();
    let settingsPath;

    if (scope === "user") {
      settingsPath = join(claudeHome, "settings.json");
    } else {
      settingsPath = join(process.cwd(), ".claude", "settings.json");
    }

    // The boundary the operator actually consented to for this scope — a
    // "project" enable must resolve under cwd, a "user" enable under
    // claudeHome. Threaded through every readJson/writeJson call below so a
    // symlinked ancestor can never redirect one scope's write into the
    // other's file (adev-plugin-settings-symlink-parent-jukh).
    const scopeRoot = scope === "user" ? claudeHome : process.cwd();

    const settings = readJson(settingsPath, scopeRoot) || {};
    if (!settings.enabledPlugins) {
      settings.enabledPlugins = {};
    }

    settings.enabledPlugins["adev@agentic-development"] = true;
    ensureDir(dirname(settingsPath));
    writeJson(settingsPath, settings, scopeRoot);

    // Register the custom marketplace in user-level settings so Claude Code
    // can resolve adev@agentic-development on any machine.
    const userSettingsPath = join(claudeHome, "settings.json");
    const userSettings = settingsPath === userSettingsPath
      ? settings
      : (readJson(userSettingsPath, claudeHome) || {});

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
        writeJson(userSettingsPath, userSettings, claudeHome);
      } else {
        writeJson(settingsPath, settings, claudeHome);
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
      const onDisk = readJson(userSettingsPath, claudeHome);
      if (onDisk?.enabledPlugins?.["adev@agentic-development"] !== undefined) {
        delete onDisk.enabledPlugins["adev@agentic-development"];
        writeJson(userSettingsPath, onDisk, claudeHome);
      }
    }

    return settingsPath;
  },

  async uninstall(opts = {}) {
    const scope = opts.scope || "user";
    const claudeHome = getClaudeHome();

    if (scope === "user" || scope === "all") {
      const userSettingsPath = join(claudeHome, "settings.json");
      const userSettings = readJson(userSettingsPath, claudeHome);
      if (userSettings?.enabledPlugins?.["adev@agentic-development"] !== undefined) {
        delete userSettings.enabledPlugins["adev@agentic-development"];
        writeJson(userSettingsPath, userSettings, claudeHome);
      }
    }

    if (scope === "project" || scope === "all") {
      const projectRoot = process.cwd();
      const projectSettingsPath = join(projectRoot, ".claude", "settings.json");
      const projectSettings = readJson(projectSettingsPath, projectRoot);
      if (projectSettings?.enabledPlugins?.["adev@agentic-development"] !== undefined) {
        delete projectSettings.enabledPlugins["adev@agentic-development"];
        if (projectSettings.enabledPlugins["superpowers@claude-plugins-official"] === false) {
          delete projectSettings.enabledPlugins["superpowers@claude-plugins-official"];
        }
        writeJson(projectSettingsPath, projectSettings, projectRoot);
      }
    }

    const cacheDir = join(claudeHome, "plugins", "cache", "agentic-development");
    if (existsSync(cacheDir)) {
      execSync(`rm -rf "${cacheDir}"`);
    }
  },

  detectConflicts() {
    const claudeHome = getClaudeHome();
    const projectRoot = process.cwd();
    const userSettings = readJson(join(claudeHome, "settings.json"), claudeHome) || {};
    const projectSettingsPath = join(projectRoot, ".claude", "settings.json");
    const projectSettings = readJson(projectSettingsPath, projectRoot) || {};

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
    const projectRoot = process.cwd();
    const settingsPath = join(projectRoot, ".claude", "settings.json");
    const settings = readJson(settingsPath, projectRoot) || {};
    if (!settings.enabledPlugins) {
      settings.enabledPlugins = {};
    }
    settings.enabledPlugins[pluginKey] = false;
    ensureDir(dirname(settingsPath));
    writeJson(settingsPath, settings, projectRoot);
  },
};

export default ClaudeCodeAdapter;
