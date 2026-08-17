import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, cpSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readJson } from "../../lib/provider/json-io.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = join(__dirname, "../..");
const PLUGIN_VERSION = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, "package.json"), "utf8")
).version;

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function getCursorHome() {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) {
    throw new Error("HOME or USERPROFILE must be set to resolve Cursor plugin path");
  }
  return join(home, ".cursor");
}

function getCursorSkillsDir() {
  return join(getCursorHome(), "skills");
}

function getPluginCacheDir() {
  return join(getCursorHome(), "plugins", "local", "adev");
}

/**
 * Sanitize the `name:` field within a SKILL.md YAML frontmatter block.
 *
 * The frontmatter is the block delimited by leading `---` lines (must begin
 * with `---\n` or `---\r\n`). Within that block, the first `name:` line whose
 * value begins with `adev:` is rewritten to `adev-`. If the value is already
 * in `adev-<x>` form, it is passed through unchanged (idempotent).
 *
 * Per Constitution Principle 2, the SKILL.md body is preserved verbatim —
 * colons appearing in code examples, prose, or any non-frontmatter line are
 * never modified.
 *
 * @param {string} content
 * @returns {{ content: string, sanitizedName: string | null }}
 */
export function sanitizeSkillName(content) {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return { content, sanitizedName: null };
  }

  const lines = content.split(/\r?\n/);
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return { content, sanitizedName: null };

  let sanitizedName = null;
  let mutated = false;

  for (let i = 1; i < endIdx; i++) {
    const m = lines[i].match(/^name:\s*(\S+)\s*$/);
    if (!m) continue;
    const raw = m[1];
    if (raw.startsWith("adev:")) {
      const sanitized = "adev-" + raw.slice("adev:".length);
      lines[i] = `name: ${sanitized}`;
      sanitizedName = sanitized;
      mutated = true;
    } else if (raw.startsWith("adev-")) {
      sanitizedName = raw;
    }
    break; // Only the first `name:` line in frontmatter is the skill name.
  }

  if (!mutated) {
    return { content, sanitizedName };
  }

  // Preserve original line-ending style when possible.
  const usesCRLF = content.startsWith("---\r\n");
  const joined = lines.join(usesCRLF ? "\r\n" : "\n");
  return { content: joined, sanitizedName };
}

async function publishSkillsFromCache(cacheDir) {
  const sourceSkillsDir = join(cacheDir, "skills");
  if (!existsSync(sourceSkillsDir)) return { published: [], failed: [] };

  const targetSkillsDir = getCursorSkillsDir();
  ensureDir(targetSkillsDir);

  const published = [];
  const failed = [];

  const entries = readdirSync(sourceSkillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sourceDir = join(sourceSkillsDir, entry.name);
    const skillMdPath = join(sourceDir, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    try {
      const raw = readFileSync(skillMdPath, "utf8");
      const { content: sanitizedMd, sanitizedName } = sanitizeSkillName(raw);
      if (!sanitizedName) continue; // No name: frontmatter — skip silently.

      const targetDir = join(targetSkillsDir, sanitizedName);
      ensureDir(targetDir);

      // Copy all sibling files verbatim first, then overwrite SKILL.md
      // with the sanitized content. cpSync recursively copies directories
      // (including SKILL.md), which writeFileSync below then overwrites.
      cpSync(sourceDir, targetDir, { recursive: true });
      writeFileSync(join(targetDir, "SKILL.md"), sanitizedMd);

      published.push(sanitizedName);
    } catch (err) {
      failed.push({ skill: entry.name, error: err.message });
    }
  }

  return { published, failed };
}

/**
 * Cursor provider adapter.
 * Installs plugin to ~/.cursor/plugins/local/adev/ and publishes sanitized
 * skill directories to ~/.cursor/skills/adev-<name>/.
 */
export const CursorAdapter = {
  name: "cursor",
  pluginRoot: PLUGIN_ROOT,
  version: PLUGIN_VERSION,

  getAgentFile() {
    return "AGENTS.md";
  },

  detect() {
    return process.env.CURSOR === "true" || existsSync(getCursorHome());
  },

  async install(_opts = {}) {
    const cacheDir = getPluginCacheDir();

    if (existsSync(cacheDir)) {
      return { installed: false, path: cacheDir };
    }

    ensureDir(cacheDir);

    // Constitution Reference Principle 1: use fs.cpSync over shelling to cp -r.
    // The OpenCode adapter still uses execSync for historical reasons; the
    // new CursorAdapter does not need that legacy.
    cpSync(PLUGIN_ROOT, cacheDir, {
      recursive: true,
      filter: (src) => {
        const basename = src.split("/").pop();
        return (
          basename !== ".git" &&
          basename !== "node_modules" &&
          basename !== ".DS_Store"
        );
      },
    });

    // Publish sanitized skill directories (Task 3 fills in publishSkillsFromCache).
    const skillReport = await publishSkillsFromCache(cacheDir);

    return { installed: true, path: cacheDir, skills: skillReport };
  },

  async uninstall(_opts = {}) {
    let cursorHome;
    try {
      cursorHome = getCursorHome();
    } catch {
      return { uninstalled: true };
    }
    if (!existsSync(cursorHome)) return { uninstalled: true };

    const cacheDir = getPluginCacheDir();
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true, force: true });
    }

    const skillsDir = getCursorSkillsDir();
    if (existsSync(skillsDir)) {
      const entries = readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!entry.name.startsWith("adev-")) continue;
        rmSync(join(skillsDir, entry.name), { recursive: true, force: true });
      }
    }

    return { uninstalled: true };
  },

  detectConflicts() {
    let cursorHome;
    try {
      cursorHome = getCursorHome();
    } catch {
      return [];
    }
    const configPath = join(cursorHome, "config.json");
    const config = readJson(configPath);
    if (!config || !config.plugins) return [];

    const conflicts = [];
    // v1 Superpowers guard — matches the OpenCode adapter's guard.
    if (config.plugins.superpowers) {
      conflicts.push({
        name: "superpowers",
        reason:
          "Overlapping brainstorming, planning, TDD, and code review workflows; disable before installing adev.",
      });
    }
    return conflicts;
  },

  disableConflictingPlugin(name) {
    let cursorHome;
    try {
      cursorHome = getCursorHome();
    } catch {
      return false;
    }
    const configPath = join(cursorHome, "config.json");
    const config = readJson(configPath);
    if (!config || !config.plugins || !config.plugins[name]) return false;
    delete config.plugins[name];
    writeJson(configPath, config);
    return true;
  },
};

export default CursorAdapter;
