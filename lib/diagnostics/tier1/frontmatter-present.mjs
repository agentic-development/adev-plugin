/**
 * Tier-1 producer: `adev/frontmatter-present`.
 *
 * Asserts that a markdown artifact begins with a `---`-delimited YAML
 * frontmatter block and the block parses without error.
 *
 * Works on `.spec.md`, `.charter.md`, `.review.md`, `.validate.md` (per
 * `diagnostic-registry.spec.md` rev 2 Behavior 9 + the AC that calls out
 * all four artifact kinds).
 *
 * Uses the in-tree `parseYaml` helper from `lib/profiles/yaml.mjs` (zero
 * external deps per Constitution Principle 1).
 *
 * @module lib/diagnostics/tier1/frontmatter-present
 */

import { readFileSync, existsSync } from 'node:fs';
import { parseYaml } from '../../profiles/yaml.mjs';

const DIAGNOSTIC_ID = 'adev/frontmatter-present';
const SEVERITY = 'error';

/**
 * Run the frontmatter-present producer.
 *
 * @param {object} ctx
 * @param {string} ctx.spec - Resolved absolute path to a markdown artifact.
 *   Despite the parameter name, this producer accepts any of the four
 *   artifact kinds (`.spec.md`, `.charter.md`, `.review.md`, `.validate.md`).
 * @returns {{ fired: boolean, id?: string, severity?: string, message?: string, citation?: string }}
 */
export function run(ctx) {
  const path = ctx?.spec;
  if (typeof path !== 'string' || !existsSync(path)) {
    // No artifact to inspect — silent no-op. The engine's spec-not-found
    // self-diagnostic handles the upstream case.
    return { fired: false };
  }

  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch (err) {
    return {
      fired: true,
      id: DIAGNOSTIC_ID,
      severity: SEVERITY,
      message: `could not read artifact: ${err.message}`,
      citation: path,
    };
  }

  // Per Behavior 9: assert the file begins with `---`-delimited frontmatter.
  // The first non-empty, non-whitespace line MUST be exactly `---` (allowing
  // CRLF line endings). Anything else fires the diagnostic.
  //
  // We allow leading blank lines because some editors auto-insert them, but
  // a markdown body (e.g. a leading `#` heading) before `---` is rejected.
  const lines = content.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length || lines[i].trim() !== '---') {
    return {
      fired: true,
      id: DIAGNOSTIC_ID,
      severity: SEVERITY,
      message: `artifact does not begin with --- frontmatter delimiter`,
      citation: path,
    };
  }

  // Find the closing `---`. The block between is the YAML body.
  let closeIdx = -1;
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() === '---') {
      closeIdx = j;
      break;
    }
  }
  if (closeIdx === -1) {
    return {
      fired: true,
      id: DIAGNOSTIC_ID,
      severity: SEVERITY,
      message: `frontmatter block missing closing --- delimiter`,
      citation: path,
    };
  }

  const body = lines.slice(i + 1, closeIdx).join('\n');
  try {
    const parsed = parseYaml(body);
    // Per Behavior 9: presence + parses-without-error. An empty frontmatter
    // block parses to `{}` — that's "present" by definition. We do NOT
    // assert any fields here; `adev/status-enum-legal` covers `status:`.
    if (parsed == null) {
      return {
        fired: true,
        id: DIAGNOSTIC_ID,
        severity: SEVERITY,
        message: `frontmatter parsed to null/undefined`,
        citation: path,
      };
    }
  } catch (err) {
    return {
      fired: true,
      id: DIAGNOSTIC_ID,
      severity: SEVERITY,
      message: `frontmatter YAML parse error: ${err.message}`,
      citation: path,
    };
  }

  return { fired: false };
}
