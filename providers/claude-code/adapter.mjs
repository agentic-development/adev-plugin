import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, chmodSync, readdirSync, rmSync, realpathSync, lstatSync, readlinkSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
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
 * Claude Code itself resolves its config directory from `CLAUDE_CONFIG_DIR`
 * when set, falling back to `~/.claude`. This adapter previously ignored the
 * variable and always wrote to `~/.claude`, so an install run from a shell
 * pointed at a different config dir (e.g. a "personal" profile) silently
 * landed in a directory that session's Claude Code never reads.
 */
function getClaudeHome() {
  if (process.env.CLAUDE_CONFIG_DIR) {
    return resolve(process.env.CLAUDE_CONFIG_DIR);
  }
  return join(process.env.HOME || process.env.USERPROFILE, ".claude");
}

const SHELL_RC_FILES = [
  ".zshrc",
  ".zprofile",
  ".zshenv",
  ".bashrc",
  ".bash_profile",
  ".profile",
  join(".config", "fish", "config.fish"),
];

const CLAUDE_CONFIG_DIR_ASSIGNMENT = /(?:^|[\s;])(?:export\s+)?CLAUDE_CONFIG_DIR\s*=\s*["']?([^"'\s;]+)["']?/gm;

function expandHomePath(rawPath, home) {
  if (rawPath === "~") return home;
  if (rawPath.startsWith("~/")) return join(home, rawPath.slice(2));
  if (rawPath.startsWith("$HOME/")) return join(home, rawPath.slice(6));
  if (rawPath.startsWith("${HOME}/")) return join(home, rawPath.slice(8));
  return rawPath;
}

function findConfigDirAssignments(filePath) {
  let contents;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const found = [];
  let match;
  CLAUDE_CONFIG_DIR_ASSIGNMENT.lastIndex = 0;
  while ((match = CLAUDE_CONFIG_DIR_ASSIGNMENT.exec(contents))) {
    found.push(match[1]);
  }
  return found;
}

/**
 * Find every Claude config directory this machine appears to have, not just
 * the one this process would resolve to — so `install` can offer a choice
 * instead of silently writing to whichever `CLAUDE_CONFIG_DIR` the invoking
 * shell happens to have set. Candidates come from: the default `~/.claude`,
 * this process's own `CLAUDE_CONFIG_DIR`, any `CLAUDE_CONFIG_DIR=` assignment
 * found in a shell startup file (catches OTHER shells/profiles this process
 * isn't running under), and sibling `~/.claude*` directories (catches config
 * dirs that exist but were never wired through an env var this scan can see).
 * This is a heuristic over the filesystem, not an exhaustive enumeration —
 * it cannot see config dirs set only via a wrapper script or a per-invocation
 * env var.
 */
function discoverConfigDirs() {
  const home = process.env.HOME || process.env.USERPROFILE;
  const active = getClaudeHome();
  const entries = new Map();

  const add = (rawPath, source) => {
    if (!rawPath) return;
    const resolved = resolve(expandHomePath(rawPath, home));
    const existing = entries.get(resolved);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
    } else {
      entries.set(resolved, { path: resolved, sources: [source], exists: existsSync(resolved) });
    }
  };

  add(join(home, ".claude"), "default");
  if (process.env.CLAUDE_CONFIG_DIR) {
    add(process.env.CLAUDE_CONFIG_DIR, "CLAUDE_CONFIG_DIR in this session");
  }

  for (const rcName of SHELL_RC_FILES) {
    for (const dir of findConfigDirAssignments(join(home, rcName))) {
      add(dir, `CLAUDE_CONFIG_DIR in ~/${rcName}`);
    }
  }

  if (existsSync(home)) {
    for (const name of readdirSync(home)) {
      if (name !== ".claude" && !/^\.claude-/.test(name)) continue;
      const full = join(home, name);
      try {
        if (lstatSync(full).isDirectory()) add(full, "sibling ~/.claude* directory");
      } catch {
        // Broken symlink — not a usable candidate.
      }
    }
  }

  // Active config dir first, then alphabetical, so a default/no-prompt caller
  // that just takes entries[0] gets the one this process would actually use.
  return [...entries.values()]
    .map((entry) => ({ ...entry, active: entry.path === active }))
    .sort((a, b) => (a.active === b.active ? a.path.localeCompare(b.path) : a.active ? -1 : 1));
}

const REGISTRY_KEY = "adev@agentic-development";

function readRegistryRows(claudeHome) {
  const registryPath = join(claudeHome, "plugins", "installed_plugins.json");
  const registry = readJson(registryPath, claudeHome);
  return Array.isArray(registry?.plugins?.[REGISTRY_KEY]) ? registry.plugins[REGISTRY_KEY] : [];
}

/**
 * Delete every cache entry under `pluginCacheParent` whose name isn't in
 * `keep`. Shared by `cleanOldVersions` (keeps every version some registry row
 * still names, plus the version just installed) and `uninstall` (keeps only
 * what survives after removing the uninstalled scope's own row) — the two
 * differ in what they pass as `keep`, not in how pruning happens.
 */
function pruneUnreferencedVersions(pluginCacheParent, keep) {
  if (!existsSync(pluginCacheParent)) return;
  for (const entry of readdirSync(pluginCacheParent)) {
    if (!keep.has(entry)) {
      rmSync(join(pluginCacheParent, entry), { recursive: true, force: true });
    }
  }
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

  getClaudeHome,
  discoverConfigDirs,

  getAgentFile() {
    return "CLAUDE.md";
  },

  async install(opts = {}) {
    const scope = opts.scope || "user";
    const claudeHome = opts.claudeHome || getClaudeHome();
    const pluginCacheParent = join(claudeHome, "plugins", "cache", "agentic-development", "adev");
    const cacheDir = join(pluginCacheParent, PLUGIN_VERSION);

    if (existsSync(cacheDir)) {
      this.updateRegistry(claudeHome, cacheDir, scope);
      this.enable(scope, { claudeHome });
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

    // updateRegistry BEFORE cleanOldVersions: pruning must see this install's
    // own row already pointing at the new version, or it would find the old
    // row still "in use" and never clean this scope's superseded version.
    this.updateRegistry(claudeHome, cacheDir, scope);
    this.cleanOldVersions(pluginCacheParent, claudeHome);
    this.enable(scope, { claudeHome });

    return { installed: true, path: cacheDir };
  },

  /**
   * Delete cached versions this claudeHome's registry no longer references.
   *
   * Deleting every OTHER directory unconditionally (as this used to) is wrong
   * whenever one claudeHome's cache is shared by more than one scope/project —
   * the default `~/.claude` used by every project on a machine, most commonly.
   * Installing `@next` for project A used to delete the version project B's
   * project-scope row (still `latest`) pointed at, breaking B's session with
   * no warning (adev-plugin-cli-tag-scope-collision). A version stays only if
   * some row in installed_plugins.json — for THIS claudeHome — still names it.
   */
  cleanOldVersions(pluginCacheParent, claudeHome) {
    const rows = readRegistryRows(claudeHome);
    const keep = new Set([PLUGIN_VERSION, ...rows.map((r) => r.version).filter(Boolean)]);
    pruneUnreferencedVersions(pluginCacheParent, keep);
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
    const key = REGISTRY_KEY;
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

  enable(scope = "user", opts = {}) {
    const claudeHome = opts.claudeHome || getClaudeHome();
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
    const claudeHome = opts.claudeHome || getClaudeHome();

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

    // Drop this scope's row(s) BEFORE pruning the cache, so pruning sees the
    // post-uninstall truth — otherwise a stale row for the scope just
    // uninstalled would count as "still in use" and nothing would ever prune.
    this.removeRegistryRows(claudeHome, scope);

    // Unconditionally `rm -rf`-ing the whole marketplace cache here used to
    // delete every OTHER scope/project's version too, the same shared-cache
    // blast radius as the old `cleanOldVersions` bug: a project-scope
    // uninstall in one repo deleted the cache a "latest"-pinned project in
    // another repo (same claudeHome) was actively running. Only a version no
    // remaining row references may go; only remove the (now possibly empty)
    // `adev` cache folder itself, never its `agentic-development` parent,
    // which this plugin does not own.
    const pluginCacheParent = join(claudeHome, "plugins", "cache", "agentic-development", "adev");
    const remainingVersions = new Set(readRegistryRows(claudeHome).map((r) => r.version).filter(Boolean));
    pruneUnreferencedVersions(pluginCacheParent, remainingVersions);
    if (existsSync(pluginCacheParent) && readdirSync(pluginCacheParent).length === 0) {
      rmSync(pluginCacheParent, { recursive: true, force: true });
    }
  },

  /**
   * Remove the row(s) belonging to `scope` from installed_plugins.json.
   * "project" only ever removes the CURRENT working directory's row — an
   * uninstall run from repo A must never touch repo B's row, even though
   * both live in the same claudeHome's registry file.
   */
  removeRegistryRows(claudeHome, scope) {
    const registryPath = join(claudeHome, "plugins", "installed_plugins.json");
    const registry = readJson(registryPath, claudeHome);
    const rows = Array.isArray(registry?.plugins?.[REGISTRY_KEY]) ? registry.plugins[REGISTRY_KEY] : null;
    if (!rows) return;

    const projectPath = process.cwd();
    const remaining = rows.filter((r) => {
      if ((scope === "user" || scope === "all") && r.scope === "user") return false;
      if ((scope === "project" || scope === "all") && r.scope === "project" && r.projectPath === projectPath) return false;
      return true;
    });

    if (remaining.length === rows.length) return;
    registry.plugins[REGISTRY_KEY] = remaining;
    writeJson(registryPath, registry, claudeHome);
  },

  detectConflicts(opts = {}) {
    const claudeHome = opts.claudeHome || getClaudeHome();
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
