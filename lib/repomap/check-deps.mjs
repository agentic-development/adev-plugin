/**
 * Dependency checker for web-tree-sitter.
 *
 * Works as both:
 *   - CLI:    `node lib/repomap/check-deps.mjs`  → exits 0 (available) or 1 (missing)
 *   - Module: `import { isTreeSitterAvailable } from './check-deps.mjs'`
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Returns true if the `web-tree-sitter` package can be resolved.
 * @returns {boolean}
 */
export function isTreeSitterAvailable() {
  try {
    require.resolve('web-tree-sitter');
    return true;
  } catch {
    return false;
  }
}

// When run directly as a CLI script, exit with appropriate code.
const isMain = process.argv[1] &&
  new URL(process.argv[1], 'file://').pathname ===
  new URL(import.meta.url).pathname;

if (isMain) {
  process.exit(isTreeSitterAvailable() ? 0 : 1);
}
