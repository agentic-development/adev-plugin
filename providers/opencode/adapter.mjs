import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, symlinkSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = join(__dirname, "../..");
const PLUGIN_VERSION = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, "package.json"), "utf8")
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

function getOpenCodeConfigDir() {
  return join(process.env.HOME || process.env.USERPROFILE, ".config", "opencode");
}

function getPluginCacheDir() {
  return join(getOpenCodeConfigDir(), "plugins", "cache", "adev");
}

function getSkillSymlinkPath(skillName) {
  return join(getOpenCodeConfigDir(), "skills", skillName);
}

function ensureSkillsDir() {
  const skillsDir = join(getOpenCodeConfigDir(), "skills");
  ensureDir(skillsDir);
  return skillsDir;
}

/**
 * OpenCode provider adapter.
 * Installs plugin to ~/.config/opencode/plugins/ and links skills.
 */
export const OpenCodeAdapter = {
  name: "opencode",
  pluginRoot: PLUGIN_ROOT,
  version: PLUGIN_VERSION,

  detect() {
    return process.env.OPENCODE === "true" || existsSync(".opencode");
  },

  getAgentFile() {
    return "AGENTS.md";
  },

  async install(opts = {}) {
    const scope = opts.scope || "user";
    const cacheDir = getPluginCacheDir();

    if (existsSync(cacheDir)) {
      return { installed: false, path: cacheDir };
    }

    ensureDir(cacheDir);

    const items = readdirSync(PLUGIN_ROOT, { withFileTypes: true });
    for (const item of items) {
      if (item.name === ".git" || item.name === "node_modules" || item.name === ".DS_Store") {
        continue;
      }
      const src = join(PLUGIN_ROOT, item.name);
      const dest = join(cacheDir, item.name);
      if (item.isDirectory()) {
        execSync(`cp -r "${src}" "${dest}"`);
      } else {
        execSync(`cp "${src}" "${dest}"`);
      }
    }

    if (scope === "user" || scope === "all") {
      this.linkSkills();
    }

    return { installed: true, path: cacheDir };
  },

  linkSkills() {
    const skillsDir = join(PLUGIN_ROOT, "skills");
    if (!existsSync(skillsDir)) {
      return;
    }

    ensureSkillsDir();

    const skillDirs = readdirSync(skillsDir, { withFileTypes: true });
    for (const skill of skillDirs) {
      if (skill.isDirectory()) {
        const skillPath = join(skillsDir, skill.name);
        const skillMdPath = join(skillPath, "SKILL.md");
        if (existsSync(skillMdPath)) {
          const symlinkPath = getSkillSymlinkPath(skill.name);
          if (existsSync(symlinkPath)) {
            try {
              unlinkSync(symlinkPath);
            } catch {}
          }
          try {
            symlinkSync(skillPath, symlinkPath);
          } catch (e) {
            // Symlink may already exist or fail on some systems
          }
        }
      }
    }
  },

  async uninstall(opts = {}) {
    const cacheDir = getPluginCacheDir();

    if (existsSync(cacheDir)) {
      execSync(`rm -rf "${cacheDir}"`);
    }

    const skillsDir = join(PLUGIN_ROOT, "skills");
    if (existsSync(skillsDir)) {
      const skillDirs = readdirSync(skillsDir, { withFileTypes: true });
      for (const skill of skillDirs) {
        if (skill.isDirectory()) {
          const symlinkPath = getSkillSymlinkPath(skill.name);
          if (existsSync(symlinkPath)) {
            try {
              unlinkSync(symlinkPath);
            } catch {}
          }
        }
      }
    }
  },

  detectConflicts() {
    const configPath = join(getOpenCodeConfigDir(), "opencode.json");
    const config = readJson(configPath) || {};
    const plugins = config.plugin || [];

    const conflicts = [];

    if (plugins.includes("superpowers")) {
      conflicts.push({
        name: "superpowers",
        reason: "Overlapping brainstorming, planning, TDD, and code review workflows",
      });
    }

    return conflicts;
  },

  disableConflictingPlugin(pluginKey) {
    const configPath = join(getOpenCodeConfigDir(), "opencode.json");
    const config = readJson(configPath) || {};

    if (!config.plugin) {
      config.plugin = [];
    }

    const idx = config.plugin.indexOf(pluginKey);
    if (idx > -1) {
      config.plugin.splice(idx, 1);
    }

    ensureDir(getOpenCodeConfigDir());
    writeJson(configPath, config);
  },
};

export default OpenCodeAdapter;
