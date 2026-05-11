/**
 * Provider detection, skill registration, and hook registration for extensions.
 *
 * - `detectProviders(projectRoot)` scans for known provider directories
 * - `registerSkill(projectRoot, pluginRoot, extSourceDir, opts)` copies SKILL.md and registers in hooks.json
 * - `registerHook(projectRoot, pluginRoot, extSourceDir, opts)` copies hook script and registers in hooks.json
 *
 * @module lib/extensions/register
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve, relative, normalize } from 'node:path';

/**
 * Known provider directory mappings.
 * Each entry maps a directory name to a provider name and the relative hooks.json path.
 */
const PROVIDER_DIRS = [
  { dir: '.claude', name: 'claude-code', hooksJsonRel: '.claude/hooks.json' },
  { dir: '.codex', name: 'codex', hooksJsonRel: '.codex/hooks.json' },
  { dir: '.opencode', name: 'opencode', hooksJsonRel: '.opencode/hooks.json' },
];

/**
 * Detect active providers by checking for known provider directories.
 *
 * @param {string} projectRoot - Project root directory.
 * @returns {Array<{ name: string, hooksJsonPath: string }>}
 */
export function detectProviders(projectRoot) {
  const found = [];
  for (const { dir, name, hooksJsonRel } of PROVIDER_DIRS) {
    const dirPath = join(projectRoot, dir);
    if (existsSync(dirPath)) {
      found.push({
        name,
        hooksJsonPath: join(projectRoot, hooksJsonRel),
      });
    }
  }
  return found;
}

/**
 * Base structure for a new hooks.json file.
 */
const EMPTY_HOOKS_JSON = { hooks: {}, skills: [] };

/**
 * Read a hooks.json file, auto-creating it with the base structure if missing.
 *
 * @param {string} hooksJsonPath
 * @returns {object}
 */
function readHooksJson(hooksJsonPath) {
  if (!existsSync(hooksJsonPath)) {
    writeFileSync(hooksJsonPath, JSON.stringify(EMPTY_HOOKS_JSON, null, 2));
    return structuredClone(EMPTY_HOOKS_JSON);
  }
  return JSON.parse(readFileSync(hooksJsonPath, 'utf8'));
}

/**
 * Write hooks.json back to disk.
 *
 * @param {string} hooksJsonPath
 * @param {object} data
 */
function writeHooksJson(hooksJsonPath, data) {
  writeFileSync(hooksJsonPath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Verify a resolved path falls within the expected container directory.
 * Throws PATH_TRAVERSAL if the path escapes the container.
 *
 * @param {string} resolvedPath - Absolute, normalized path to check.
 * @param {string} containerDir - Absolute, normalized container directory.
 * @param {string} label - Human-readable label for the error message.
 */
function assertContained(resolvedPath, containerDir, label) {
  const rel = relative(containerDir, resolvedPath);
  if (rel.startsWith('..') || resolve(containerDir, rel) !== resolvedPath) {
    const err = new Error(`${label} path escapes container: ${resolvedPath} is not within ${containerDir}`);
    err.code = 'PATH_TRAVERSAL';
    throw err;
  }
}

/**
 * Validate that a name segment (extension name, skill name, event name)
 * does not contain path traversal characters.
 *
 * @param {string} value - The name to validate.
 * @param {string} label - Human-readable label for the error message.
 */
function assertSafeName(value, label) {
  if (value.includes('/') || value.includes('\\') || value.includes('..')) {
    const err = new Error(`${label} contains path traversal characters: "${value}"`);
    err.code = 'PATH_TRAVERSAL';
    throw err;
  }
}

/**
 * Register an extension skill: copy SKILL.md to the plugin's skills directory
 * and add a skill entry to each detected provider's hooks.json.
 *
 * @param {string} projectRoot - Project root directory.
 * @param {string} pluginRoot - Plugin root directory.
 * @param {string} extSourceDir - Extension source directory containing SKILL.md.
 * @param {{ extensionName: string, skillName: string, description: string }} opts
 * @returns {{ warnings: Array<{ code: string, message: string }> }}
 */
export function registerSkill(projectRoot, pluginRoot, extSourceDir, opts) {
  const { extensionName, skillName, description } = opts;
  const warnings = [];

  assertSafeName(extensionName, 'Extension name');
  assertSafeName(skillName, 'Skill name');

  // Copy SKILL.md to skills/<extensionName>-<skillName>/SKILL.md
  const skillDir = join(pluginRoot, 'skills', `${extensionName}-${skillName}`);
  const destPath = resolve(skillDir, 'SKILL.md');
  const skillsContainer = resolve(join(pluginRoot, 'skills'));
  assertContained(destPath, skillsContainer, 'Skill destination');

  mkdirSync(skillDir, { recursive: true });
  const srcPath = join(extSourceDir, 'SKILL.md');
  copyFileSync(srcPath, destPath);

  // Detect providers and register in each hooks.json
  const providers = detectProviders(projectRoot);
  if (providers.length === 0) {
    warnings.push({
      code: 'WARN_NO_PROVIDER',
      message: 'No provider directories found. Skill will not be registered in any hooks.json.',
    });
    return { warnings };
  }

  for (const provider of providers) {
    const hooksJson = readHooksJson(provider.hooksJsonPath);
    if (!Array.isArray(hooksJson.skills)) {
      hooksJson.skills = [];
    }

    // Upsert: replace existing entry with same name, or append
    const idx = hooksJson.skills.findIndex(s => s.name === skillName);
    const entry = { name: skillName, description, path: destPath };
    if (idx >= 0) {
      hooksJson.skills[idx] = entry;
    } else {
      hooksJson.skills.push(entry);
    }

    writeHooksJson(provider.hooksJsonPath, hooksJson);
  }

  return { warnings };
}

/**
 * Register an extension hook: copy the hook script to the plugin's hooks directory
 * and add a hook entry to each detected provider's hooks.json.
 *
 * @param {string} projectRoot - Project root directory.
 * @param {string} pluginRoot - Plugin root directory.
 * @param {string} extSourceDir - Extension source directory containing the hook script.
 * @param {{ extensionName: string, event: string, command: string }} opts
 * @returns {{ warnings: Array<{ code: string, message: string }> }}
 */
export function registerHook(projectRoot, pluginRoot, extSourceDir, opts) {
  const { extensionName, event, command } = opts;
  const warnings = [];

  assertSafeName(extensionName, 'Extension name');
  assertSafeName(event, 'Hook event name');

  // Validate: source must be within extSourceDir
  const srcPath = resolve(extSourceDir, command);
  assertContained(srcPath, resolve(extSourceDir), 'Hook source');

  // Validate: dest must be within pluginRoot/hooks/
  const destFileName = `${extensionName}-${event}.sh`;
  const hooksContainer = resolve(join(pluginRoot, 'hooks'));
  const destPath = resolve(hooksContainer, destFileName);
  assertContained(destPath, hooksContainer, 'Hook destination');

  mkdirSync(hooksContainer, { recursive: true });
  copyFileSync(srcPath, destPath);

  // Detect providers and register in each hooks.json
  const providers = detectProviders(projectRoot);
  if (providers.length === 0) {
    warnings.push({
      code: 'WARN_NO_PROVIDER',
      message: 'No provider directories found. Hook will not be registered in any hooks.json.',
    });
    return { warnings };
  }

  for (const provider of providers) {
    const hooksJson = readHooksJson(provider.hooksJsonPath);
    if (typeof hooksJson.hooks !== 'object' || hooksJson.hooks === null) {
      hooksJson.hooks = {};
    }

    // Register hook under the event key
    if (!Array.isArray(hooksJson.hooks[event])) {
      hooksJson.hooks[event] = [];
    }

    // Upsert: find existing matcher for this extension, or append
    const matcherName = `${extensionName}-*`;
    const existing = hooksJson.hooks[event].find(
      entry => entry.matcher === matcherName
    );

    const hookEntry = {
      type: 'command',
      command: `bash "${destPath}"`,
    };

    if (existing) {
      // Update the existing hook entry
      existing.hooks = [hookEntry];
    } else {
      hooksJson.hooks[event].push({
        matcher: matcherName,
        hooks: [hookEntry],
      });
    }

    writeHooksJson(provider.hooksJsonPath, hooksJson);
  }

  return { warnings };
}
