/**
 * Regression test: enforces that no `.mjs` file under `lib/` (excluding
 * `lib/spec-status.mjs` itself) contains a bare string literal for any of
 * the six multi-word spec status values.
 *
 * Covers AC from diagnostic-registry.spec.md rev 2:
 *   "Every `.mjs` file under `lib/` that previously hardcoded any of the
 *    seven spec-status strings now imports from `lib/spec-status.mjs`."
 *
 * The literal `'draft'` is intentionally excluded because it appears in
 * unrelated contexts (e.g. PR drafts, draft mode flags) where it does NOT
 * refer to a spec frontmatter status. Reviewer spot-checks remaining
 * occurrences manually per the spec's AC carve-out.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const LIB_ROOT = join(PROJECT_ROOT, 'lib');

// Six multi-word literals that are *only* used as spec frontmatter statuses.
// 'draft' is excluded — it shows up in unrelated contexts (per spec rev 2 AC).
const FORBIDDEN_LITERALS = [
  'review-pending',
  'review-passed',
  'review-blocked',
  'implemented',
  'validated',
  'superseded',
];

// Files allowed to contain these literals as legitimate prose / data:
//   - spec-status.mjs itself (it defines the enum)
//   - any *.test.mjs file (test fixtures need the literals)
//   - migrate-state-artifacts.mjs IS migrated to the enum if it contains them
//   - capability-map.mjs defines CAPABILITY_STATUSES, a separate canonical
//     enum for the charter Capability Map's `Status` column (a different
//     lifecycle dimension from a spec's frontmatter `status`). Its overlap
//     with a few spec-status words ("review-passed", "implemented",
//     "validated") is coincidental English, not the drift this test guards
//     against — see capability-status-column.spec.md.
const ALLOWED_FILES = new Set(['spec-status.mjs', 'capability-map.mjs']);

function walkMjsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMjsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      out.push(full);
    }
  }
  return out;
}

test('no lib/**/*.mjs file (except spec-status.mjs) contains bare spec-status literals', () => {
  const offenders = [];
  for (const file of walkMjsFiles(LIB_ROOT)) {
    const basename = file.split('/').pop();
    if (ALLOWED_FILES.has(basename)) continue;
    const content = readFileSync(file, 'utf8');
    for (const literal of FORBIDDEN_LITERALS) {
      // Match the literal wrapped in single OR double quotes — i.e. a bare
      // string literal in code. This deliberately ignores prose (e.g. JSDoc
      // free text) that mentions the word without quoting it, but flags
      // both `'review-passed'` and `"review-passed"`.
      const single = `'${literal}'`;
      const dbl = `"${literal}"`;
      if (content.includes(single) || content.includes(dbl)) {
        offenders.push(`${relative(PROJECT_ROOT, file)}: bare literal "${literal}" — import from lib/spec-status.mjs instead`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `found ${offenders.length} bare spec-status literal(s) under lib/:\n  ${offenders.join('\n  ')}`,
  );
});
