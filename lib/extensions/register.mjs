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
