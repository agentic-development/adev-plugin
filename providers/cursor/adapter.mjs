import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, cpSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = join(__dirname, "../..");
const PLUGIN_VERSION = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, "package.json"), "utf8")
).version;

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
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

async function publishSkillsFromCache(_cacheDir) {
  // Real implementation lands in Task 3.
  return { published: [], failed: [] };
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
    throw new Error("not implemented yet"); // Task 2
  },

  async uninstall(_opts = {}) {
    throw new Error("not implemented yet"); // Task 4
  },

  detectConflicts() {
    return []; // Task 5
  },

  disableConflictingPlugin(_name) {
    return false; // Task 5
  },
};

export default CursorAdapter;
