/**
 * Lightweight argument/module validation and charter discovery helpers
 * for the /adev:prototype skill's standalone invocation path.
 *
 * @module lib/prototype-args
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MODULE_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_MODULE_LENGTH = 64;

/**
 * Validate a module name against kebab-case rules.
 * Must match ^[a-z0-9][a-z0-9-]*$ and be at most 64 characters.
 *
 * @param {string} name - Module name to validate
 * @returns {boolean} True if valid
 */
export function validateModuleName(name) {
  if (!name || name.length > MAX_MODULE_LENGTH) return false;
  return MODULE_NAME_RE.test(name);
}

/**
 * Discover all Feature Charters under .context-index/specs/features/.
 * Scans for directories containing charter.md and extracts the title
 * from the first heading line.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {{ module: string, title: string, path: string }[]}
 */
export function discoverCharters(projectRoot) {
  const featuresDir = join(projectRoot, '.context-index', 'specs', 'features');
  if (!existsSync(featuresDir)) return [];
  const modules = readdirSync(featuresDir, { withFileTypes: true })
    .filter(d => d.isDirectory());
  const charters = [];
  for (const dir of modules) {
    const charterPath = join(featuresDir, dir.name, 'charter.md');
    if (existsSync(charterPath)) {
      const content = readFileSync(charterPath, 'utf8');
      const titleMatch = content.match(/^#\s+(?:Feature Charter:\s*)?(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : dir.name;
      charters.push({ module: dir.name, title, path: charterPath });
    }
  }
  return charters;
}
