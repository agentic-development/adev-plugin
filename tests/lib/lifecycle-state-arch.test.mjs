/**
 * Architectural test for lib/lifecycle-state.mjs.
 *
 * Enforces the format invariant declared in the charter Quality Attributes
 * (line 342) and the spec AC line 81: the only write primitive the module
 * may use is `appendFile`/`appendFileSync`. Any occurrence of `writeFile`,
 * `writeFileSync`, `createWriteStream`, or `truncate` outside the import
 * line (and outside comment context) fails the build with
 * `ARCH_VIOLATION_APPEND_ONLY`.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_PATH = join(__dirname, '..', '..', 'lib', 'lifecycle-state.mjs');

// Strip line and block comments so banned tokens inside docstrings don't
// trigger a false positive.
function stripComments(source) {
  // Remove /* … */ blocks first (non-greedy, multiline).
  let s = source.replace(/\/\*[\s\S]*?\*\//g, '');
  // Then strip line comments.
  s = s.replace(/\/\/[^\n]*\n/g, '\n');
  return s;
}

const FORBIDDEN = [
  // Match each banned write primitive as a whole identifier — guard against
  // matching substrings inside `appendFile` (e.g. `appendFileSync` would
  // contain `File` but never `writeFile`).
  /\bwriteFile\b/,
  /\bwriteFileSync\b/,
  /\bcreateWriteStream\b/,
  /\btruncate\b/,
  /\btruncateSync\b/,
];

test('lib/lifecycle-state.mjs contains no non-append write primitives', () => {
  const src = readFileSync(LIB_PATH, 'utf8');
  const code = stripComments(src);

  for (const re of FORBIDDEN) {
    if (re.test(code)) {
      const err = new Error(
        `ARCH_VIOLATION_APPEND_ONLY: forbidden write primitive ${re} found in lib/lifecycle-state.mjs`,
      );
      err.code = 'ARCH_VIOLATION_APPEND_ONLY';
      throw err;
    }
  }

  // Positive assertion: the file actually does use the allowed primitive.
  assert.ok(
    /\bappendFile(Sync)?\b/.test(code),
    'lib/lifecycle-state.mjs must use appendFile/appendFileSync',
  );
});
