/**
 * Tier-1 producer: `adev/status-enum-legal`.
 *
 * Asserts that a spec file's frontmatter `status:` value is one of the
 * seven legal values in `SPEC_STATUSES` (per `diagnostic-registry.spec.md`
 * rev 2 Behavior 8).
 *
 * The enum is imported from `lib/spec-status.mjs` — the canonical
 * single-source-of-truth. This module MUST NOT inline the seven literal
 * values; doing so would defeat the whole point of the rev 2 amendment 3
 * extraction.
 *
 * @module lib/diagnostics/tier1/status-enum-legal
 */

import { readFileSync, existsSync } from 'node:fs';
import { SPEC_STATUSES } from '../../spec-status.mjs';

const DIAGNOSTIC_ID = 'adev/status-enum-legal';
const SEVERITY = 'error';

/**
 * Run the status-enum-legal producer.
 *
 * Reads the spec file at `ctx.spec`, parses its YAML frontmatter (only the
 * `status:` field — full YAML parsing is out of scope here), and fires
 * `error` if the value is not in `SPEC_STATUSES`.
 *
 * If frontmatter is absent or no `status` key is present, returns
 * `{ fired: false }` — the `adev/frontmatter-present` producer is
 * responsible for the missing-frontmatter case (Behavior 8 + 9 division
 * of responsibility per spec).
 *
 * @param {object} ctx
 * @param {string} ctx.spec - Resolved absolute path to a spec file.
 * @returns {{ fired: boolean, id?: string, severity?: string, message?: string, citation?: string }}
 */
export function run(ctx) {
  const specPath = ctx?.spec;
  if (typeof specPath !== 'string' || !existsSync(specPath)) {
    // No spec to check — silent no-op. The engine's spec-not-found
    // self-diagnostic handles the upstream case.
    return { fired: false };
  }

  let content;
  try {
    content = readFileSync(specPath, 'utf8');
  } catch {
    return { fired: false };
  }

  // Minimal frontmatter extraction: match `---` ... `---` at the top of
  // the file. This is a presence-check parser, not a general YAML parser.
  // The `adev/frontmatter-present` producer guarantees the block parses;
  // here we just extract the `status:` line if it exists.
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { fired: false }; // frontmatter-present's domain

  const block = match[1];
  // Find the first top-level `status:` line. We avoid pulling in a real
  // YAML parser because (a) Constitution Principle 1 and (b) all we need
  // is a single scalar.
  const statusLine = block.split(/\r?\n/).find((line) => /^status\s*:/i.test(line));
  if (!statusLine) return { fired: false };

  let value = statusLine.replace(/^status\s*:\s*/i, '').trim();
  // Strip surrounding quotes (single or double) and inline comments.
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
  // Strip trailing comments (e.g. `status: draft  # placeholder`).
  const hashIdx = value.indexOf('#');
  if (hashIdx > -1) value = value.slice(0, hashIdx).trim();

  if (SPEC_STATUSES.includes(value)) {
    return { fired: false };
  }

  return {
    fired: true,
    id: DIAGNOSTIC_ID,
    severity: SEVERITY,
    message: `spec status ${JSON.stringify(value)} is not in SPEC_STATUSES (legal: ${SPEC_STATUSES.join(', ')})`,
    citation: specPath,
  };
}
