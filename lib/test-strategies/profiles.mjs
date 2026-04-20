import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getStrategy } from './registry.mjs';

/**
 * The hardcoded unit strategy profile — the fallback of last resort that never
 * requires file I/O.
 */
export const UNIT_PROFILE = Object.freeze({
  strategy_id: 'unit',
  red_exit_condition:
    'Test runner exits non-zero because the expected behavior is not yet implemented',
  green_exit_condition: 'Test runner exits zero — all tests pass',
  gaming_blockers: Object.freeze([
    'toBeTruthy/toBeDefined/toBeFalsy/toBeUndefined/toBeNull as sole assertion',
    'toBeGreaterThanOrEqual(0) or toBeGreaterThan(-1) as useless bounds',
    '.skip(/.todo(/xit(/xdescribe( — disabled tests',
    'try { expect } catch {} without rethrow — swallowed assertions',
    'if (condition) { expect } without else — conditional assertions',
    '.not.toThrow() as sole assertion',
    'Hardcoded expected values mirroring implementation return values',
    'Assertions on unseeded/non-deterministic data',
    'Empty test body or setup-only without assertions',
  ]),
  assertion_rules:
    'Mock only at external boundaries (HTTP, DB, filesystem, external-API). Internal module mocking is forbidden.',
  seed_data_rule:
    'Every assertion must operate on deterministic, explicitly seeded data. No assertions against unseeded runtime data.',
  handoff_format:
    'SHA-256 hash of test files + verbatim test file contents + mocking boundaries table',
  permitted_tools: Object.freeze([
    'node:test',
    'jest',
    'vitest',
    'mocha',
    'pytest',
    'go test',
    'cargo test',
  ]),
});

const REQUIRED_FIELDS = [
  'strategy_id',
  'red_exit_condition',
  'green_exit_condition',
  'gaming_blockers',
  'assertion_rules',
  'seed_data_rule',
  'handoff_format',
  'permitted_tools',
];

const ARRAY_FIELDS = new Set(['gaming_blockers', 'permitted_tools']);

/**
 * Parse YAML frontmatter from a markdown string.
 * Supports string values (bare or quoted) and arrays (dash-prefixed lines).
 * Returns null if no valid frontmatter block is found.
 *
 * @param {string} content
 * @returns {object|null}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const yamlBlock = match[1];
  const result = {};
  const lines = yamlBlock.split(/\r?\n/);

  let currentKey = null;
  let currentArray = null;

  for (const line of lines) {
    // Array item line
    if (currentArray !== null && /^\s+-\s+/.test(line)) {
      const value = line.replace(/^\s+-\s+/, '').replace(/^["']|["']$/g, '');
      currentArray.push(value);
      continue;
    }

    // Key: value line
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)?$/);
    if (kvMatch) {
      // Flush any pending array
      if (currentKey !== null && currentArray !== null) {
        result[currentKey] = currentArray;
        currentArray = null;
      }

      const key = kvMatch[1];
      const rawValue = (kvMatch[2] ?? '').trim();

      if (rawValue === '' || rawValue === null) {
        // Could be the start of a block sequence
        currentKey = key;
        currentArray = [];
      } else {
        currentKey = key;
        currentArray = null;
        // Strip surrounding quotes
        result[key] = rawValue.replace(/^["']|["']$/g, '');
      }
      continue;
    }

    // Blank line or non-matching line while in an array — end array collection
    if (currentKey !== null && currentArray !== null && line.trim() === '') {
      result[currentKey] = currentArray;
      currentKey = null;
      currentArray = null;
    }
  }

  // Flush final pending array
  if (currentKey !== null && currentArray !== null) {
    result[currentKey] = currentArray;
  }

  return result;
}

/**
 * Load and validate a strategy profile from a markdown file.
 *
 * @param {string} strategyId - The strategy slug (e.g. 'unit', 'contract')
 * @param {string} profilesDir - Absolute path to the directory containing profile .md files
 * @returns {{ profile: object, warnings: string[], fallback: boolean }}
 */
export function getStrategyProfile(strategyId, profilesDir) {
  // 1. Validate strategyId against the registry
  if (
    typeof strategyId !== 'string' ||
    strategyId === '' ||
    !/^[a-z]+$/.test(strategyId) ||
    !getStrategy(strategyId)
  ) {
    const warning =
      typeof strategyId === 'string' && strategyId !== ''
        ? `Unknown strategy id '${strategyId}' — falling back to unit profile`
        : `Invalid strategy id — falling back to unit profile`;
    return { profile: UNIT_PROFILE, warnings: [warning], fallback: true };
  }

  // 2. Construct profile path
  const profilePath = join(profilesDir, strategyId + '.md');

  // 3. Read the file
  let content;
  try {
    content = readFileSync(profilePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        profile: UNIT_PROFILE,
        warnings: [
          `Strategy profile '${strategyId}' not found — falling back to unit profile`,
        ],
        fallback: true,
      };
    }
    return {
      profile: UNIT_PROFILE,
      warnings: [
        `Could not read strategy profile '${strategyId}': ${err.message} — falling back to unit profile`,
      ],
      fallback: true,
    };
  }

  // 4. Parse frontmatter
  let parsed;
  try {
    parsed = parseFrontmatter(content);
  } catch (err) {
    return {
      profile: UNIT_PROFILE,
      warnings: [
        `Failed to parse strategy profile '${strategyId}': ${err.message} — falling back to unit profile`,
      ],
      fallback: true,
    };
  }

  if (!parsed) {
    return {
      profile: UNIT_PROFILE,
      warnings: [
        `Strategy profile '${strategyId}' has no valid frontmatter — falling back to unit profile`,
      ],
      fallback: true,
    };
  }

  // 5. Check required fields
  const missing = REQUIRED_FIELDS.filter((field) => {
    const value = parsed[field];
    if (value === undefined || value === null) return true;
    if (ARRAY_FIELDS.has(field) && !Array.isArray(value)) return true;
    if (ARRAY_FIELDS.has(field) && Array.isArray(value) && value.length === 0)
      return true;
    if (!ARRAY_FIELDS.has(field) && value === '') return true;
    return false;
  });

  if (missing.length > 0) {
    return {
      profile: UNIT_PROFILE,
      warnings: [
        `Strategy profile '${strategyId}' is missing required fields: ${missing.join(', ')} — falling back to unit profile`,
      ],
      fallback: true,
    };
  }

  // Freeze array fields before returning
  for (const field of ARRAY_FIELDS) {
    if (Array.isArray(parsed[field])) {
      parsed[field] = Object.freeze(parsed[field]);
    }
  }

  return {
    profile: Object.freeze(parsed),
    warnings: [],
    fallback: false,
  };
}
