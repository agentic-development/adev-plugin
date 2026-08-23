import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, cpSync, realpathSync } from "fs";
import { join, dirname, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { readJson } from "../../lib/provider/json-io.mjs";
import { installCopyFilter } from "../../lib/provider/ship-filter.mjs";

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
/**
 * A published skill directory name: one path segment, no separators, no dots.
 *
 * Deliberately stricter than the frontmatter grammar. `name:` is matched with
 * `\S+`, which is fine for a YAML scalar and wrong for something concatenated
 * into a filesystem path.
 */
const SAFE_SKILL_DIRNAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Resolve the directory a sanitized skill name may be published to, or throw.
 *
 * EXPORTED SO IT CAN BE TESTED. The guard used to live inline in
 * `publishSkillsFromCache`, which is module-private and derives its own target
 * from `getCursorHome()` — so the only way to exercise it was a full install
 * against a poisoned plugin root, which a test cannot arrange. The regression
 * test written for it therefore fell back to grepping this file for identifier
 * names, which passes against a guard that is declared but never called, called
 * after the write, or logically inverted. Pulling the decision into a pure
 * function makes the real behaviour reachable.
 *
 * Two layers:
 *
 *  1. The name must be a single path segment. The frontmatter grammar is
 *     `/^name:\s*(\S+)\s*$/`, and `\S+` admits `/` and `..` — fine for a YAML
 *     scalar, wrong for something concatenated into a filesystem path.
 *  2. The resolved destination must sit inside the root, compared through
 *     `realpathSync`. A lexical `resolve()` + `startsWith` check is NOT enough:
 *     if the root is itself a symlink — dotfile managers commonly do this, and
 *     it can be planted before install — `resolve()` never dereferences it, so
 *     the check reports containment while `ensureDir`/`cpSync`/`writeFileSync`,
 *     which all follow symlinks, land at the link's real target. This is the
 *     `/var` -> `/private/var` class of gap that
 *     `lib/extensions/exec-payload.mjs::assertContained` documents in its own
 *     header, and the reason that primitive realpaths both sides.
 *
 * @param {string} skillsRoot directory published skills live under
 * @param {string} name sanitized skill name from SKILL.md frontmatter
 * @returns {string} absolute destination directory
 * @throws {Error} SKILL_NAME_UNSAFE | SKILL_PATH_ESCAPE
 */
export function resolvePublishTarget(skillsRoot, name) {
  if (!SAFE_SKILL_DIRNAME.test(name)) {
    throw new Error(
      `SKILL_NAME_UNSAFE: ${JSON.stringify(name)} must match ${SAFE_SKILL_DIRNAME}`,
    );
  }

  // The root exists by construction (ensureDir runs before publishing), so it can
  // be realpath'd directly. The destination itself may not exist yet, which is why
  // the root is the side that gets dereferenced.
  let base;
  try {
    base = realpathSync(resolve(skillsRoot));
  } catch (err) {
    throw new Error(`SKILL_PATH_ESCAPE: cannot resolve skills root ${skillsRoot}: ${err.message}`);
  }

  const dest = resolve(base, name);
  if (dest !== base && !dest.startsWith(base + sep)) {
    throw new Error(`SKILL_PATH_ESCAPE: ${dest} is outside the skills root ${base}`);
  }

  // If the destination ALREADY exists, it must still be inside the root once
  // dereferenced. Checking only the base is not enough: a pre-existing symlink at
  // <root>/<name> pointing outside passes the lexical prefix test above, and the
  // ensureDir/cpSync/writeFileSync that follow all traverse symlinks — so the write
  // lands at the link's target. Needs prior write access to the user's own skills
  // dir, so it is a narrow vector, but it is the one case the base-only realpath
  // leaves open.
  try {
    const realDest = realpathSync(dest);
    if (realDest !== base && !realDest.startsWith(base + sep)) {
      throw new Error(
        `SKILL_PATH_ESCAPE: existing ${dest} resolves to ${realDest}, outside ${base}`,
      );
    }
  } catch (err) {
    // ENOENT is the normal case — the destination has not been created yet.
    if (err.code !== "ENOENT") throw err;
  }
  return dest;
}

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

      // The name becomes a DIRECTORY NAME under targetSkillsDir, so it must be a
      // single path segment. The frontmatter match is `/^name:\s*(\S+)\s*$/`, and
      // `\S+` admits `/` and `..` — a skill declaring `name: adev:../../x` would
      // otherwise escape ~/.cursor/skills/ before the recursive copy below.
      // Rejected rather than re-sanitized: a name that needs path-stripping is
      // malformed, and silently rewriting it would publish a skill under a name
      // that is not the one it declares.
      // MUST precede every write below. resolvePublishTarget applies both the
      // single-path-segment allowlist and the realpath containment check, and
      // throws rather than returning a sanitized fallback — a name that needs
      // path-stripping is malformed, and rewriting it would publish a skill
      // under a name it does not declare.
      const targetDir = resolvePublishTarget(targetSkillsDir, sanitizedName);
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
      filter: installCopyFilter(PLUGIN_ROOT),
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
