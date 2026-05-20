/**
 * Skill-name validator for the Copilot adapter.
 *
 * Copilot's Agent Skills directory layout requires lowercase-hyphen names
 * matching `^[a-z0-9-]{1,64}$`. adev's project convention prefixes skill
 * frontmatter names with `adev:` (e.g., `name: adev:init`) while the parent
 * directory drops the prefix (`skills/init/`). Some skills (e.g., `using-adev`)
 * do not carry the prefix at all. A few entries under `skills/` carry no
 * `name:` field — those are not adev-managed skills and are skipped silently.
 *
 * Behavior §6 in `copilot-adapter.spec.md` is the source of truth.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const NAME_REGEX_FRONTMATTER = /^(adev:)?[a-z0-9-]{1,64}$/;
const NAME_REGEX_DIR = /^[a-z0-9-]{1,64}$/;
const FRONTMATTER_BYTE_LIMIT = 64 * 1024;
const ADEV_PREFIX = 'adev:';

/**
 * Extract the `name:` frontmatter value from a SKILL.md body.
 *
 * Allocation-bounded: refuses to parse if the content exceeds 64 KiB. Returns
 * `null` if no `name:` field is found in the frontmatter block; throws
 * `INVALID_SKILL_FRONTMATTER` on overflow or non-ASCII bytes inside the
 * frontmatter block.
 *
 * @param {Buffer} buf - File contents as a Buffer (so we can byte-check).
 * @param {string} sourcePath - For error messages.
 * @returns {string|null}
 */
function extractFrontmatterName(buf, sourcePath) {
  if (buf.byteLength > FRONTMATTER_BYTE_LIMIT) {
    throw new Error(`INVALID_SKILL_FRONTMATTER: ${sourcePath} (size ${buf.byteLength} > ${FRONTMATTER_BYTE_LIMIT})`);
  }
  const text = buf.toString('utf8');
  // Frontmatter must start with `---\n` (or `---\r\n`). Allow no frontmatter at all.
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return null;
  }
  // Locate the closing `---` line.
  const afterOpen = text.indexOf('\n') + 1;
  const closeIdx = text.indexOf('\n---', afterOpen);
  if (closeIdx === -1) {
    return null;
  }
  const block = text.slice(afterOpen, closeIdx);
  // Non-ASCII rejection on the frontmatter block only.
  for (let i = 0; i < block.length; i++) {
    if (block.charCodeAt(i) > 127) {
      throw new Error(`INVALID_SKILL_FRONTMATTER: ${sourcePath} (non-ASCII byte at offset ${i})`);
    }
  }
  // Find `name:` line. Match `name:` at line start, capture value to end-of-line.
  const lines = block.split(/\r?\n/);
  for (const line of lines) {
    const m = /^name:\s*(.+?)\s*$/.exec(line);
    if (m) {
      // Strip optional surrounding quotes.
      let v = m[1];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  return null;
}

/**
 * NFC-normalize a string.
 *
 * @param {string} s
 * @returns {string}
 */
function nfc(s) {
  return s.normalize('NFC');
}

/**
 * Validate every adev skill under `skillsDir` for Copilot compliance.
 *
 * Pure (no filesystem writes). Returns the list of validated **directory
 * names** (Copilot-conformant, lowercase-hyphen, no `adev:` prefix). Skills
 * whose SKILL.md is missing or has no `name:` field are skipped silently —
 * they are not considered adev-managed skills and are not copied at install
 * time.
 *
 * @param {string} skillsDir - Absolute path to a directory of skill subdirs.
 * @returns {string[]} validated directory names.
 * @throws {Error} INVALID_SKILL_NAME | SKILL_NAME_MISMATCH | INVALID_SKILL_FRONTMATTER
 */
export function validateSkillNames(skillsDir) {
  const entries = readdirSync(skillsDir, { withFileTypes: true });
  const validated = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirName = entry.name;
    const skillMdPath = join(skillsDir, dirName, 'SKILL.md');

    // Read SKILL.md. If missing, skip silently (not an adev skill).
    let buf;
    try {
      buf = readFileSync(skillMdPath);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        // Skipped silently — Behavior §6.
        continue;
      }
      throw err;
    }

    const rawName = extractFrontmatterName(buf, skillMdPath);
    if (rawName === null) {
      // No `name:` field — skipped silently.
      // Observability: debug-level notice on stderr per spec.
      process.stderr.write(`skipped: no name field at ${skillMdPath}\n`);
      continue;
    }

    const normalizedDir = nfc(dirName);
    const normalizedName = nfc(rawName);

    // Dir name MUST match Copilot's regex.
    if (!NAME_REGEX_DIR.test(normalizedDir)) {
      throw new Error(`INVALID_SKILL_NAME: ${dirName} (directory name violates ^[a-z0-9-]{1,64}$)`);
    }
    // Frontmatter name MUST match the prefix-aware regex.
    if (!NAME_REGEX_FRONTMATTER.test(normalizedName)) {
      throw new Error(
        `INVALID_SKILL_NAME: ${dirName} (frontmatter: ${rawName}; constraint: ^(adev:)?[a-z0-9-]{1,64}$)`,
      );
    }

    const stripped = normalizedName.startsWith(ADEV_PREFIX)
      ? normalizedName.slice(ADEV_PREFIX.length)
      : normalizedName;

    if (stripped !== normalizedDir) {
      throw new Error(`SKILL_NAME_MISMATCH: ${dirName} vs ${stripped}`);
    }

    validated.push(dirName);
  }

  return validated;
}
