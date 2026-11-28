// lib/sync/provider-skills.mjs
//
// The canonical-to-mirror transform behind scripts/sync-provider-skills.mjs.
// `skills/<name>/<rel>` is mirrored to `providers/<provider>/skills/<name>/<rel>`
// verbatim, except that a skill's root SKILL.md gets a provider-specific
// suffix on its frontmatter `description:` line. The script writes the
// mirrors; the lite tripwire (lib/implement/review-depth.mjs) recomputes one
// mirror file here to check that a touched mirror is an exact regeneration.
// Both must use these functions, or a mirror the script writes could be one
// the tripwire rejects, or the reverse.

import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PROVIDER_DESCRIPTION_SUFFIX = {
  opencode: " In OpenCode, invoke with skill({ name: '<SKILL_NAME>' })",
  codex: ' In Codex, invoke with $<SKILL_NAME>',
};

// Skills that are intentionally excluded from certain providers (e.g., they
// depend on Claude Code-specific features like hooks or plugin infra).
export const PROVIDER_EXCLUDES = {
  opencode: [],
  codex: [],
};

/**
 * Whether a skill directory name is one the sync mirrors at all. The
 * directory must also hold a SKILL.md, which the caller checks.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isSyncedSkillName(name) {
  return !name.startsWith('adev-');
}

/**
 * Whether a file at `rel` (relative to a skill directory, `/`-separated) is
 * one the sync writes into a mirror. A nested SKILL.md and anything under a
 * directory named `agents` at any depth are not: `agents/` is provider-owned
 * (codex generates `agents/openai.yaml` itself, once, and never overwrites it).
 *
 * @param {string} rel
 * @returns {boolean}
 */
export function isMirroredSkillFile(rel) {
  const segments = rel.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return false;
  if (segments.slice(0, -1).includes('agents')) return false;
  return segments[segments.length - 1] !== 'SKILL.md' || rel === 'SKILL.md';
}

function transformDescription(content, provider, skillName) {
  const suffix = PROVIDER_DESCRIPTION_SUFFIX[provider];
  if (!suffix) return content;

  const qualifiedName = `adev:${skillName}`;
  const suffixText = suffix.replace('<SKILL_NAME>', qualifiedName);

  // Replace the description line in YAML frontmatter
  return content.replace(
    /^(description:\s*")(.*?)(")\s*$/m,
    (match, prefix, desc, quote) => {
      // Remove any existing provider suffix before appending new one
      const cleaned = desc
        .replace(/\s*In OpenCode, invoke with.*$/, '')
        .replace(/\s*In Codex, invoke with.*$/, '');
      return `${prefix}${cleaned}${suffixText}${quote}`;
    }
  );
}

/**
 * The mirror text for one canonical skill file's text: the description
 * transform for the skill's root SKILL.md, the text unchanged otherwise.
 *
 * @param {string} content - canonical file, decoded as UTF-8
 * @param {string} provider
 * @param {string} skillName
 * @param {string} rel - path relative to the skill directory
 * @returns {string}
 */
export function mirrorFileContent(content, provider, skillName, rel) {
  return rel === 'SKILL.md' ? transformDescription(content, provider, skillName) : content;
}

/**
 * Maps a repo-relative mirror path to the canonical file the sync generates it
 * from, or null when the sync never writes that path: an unknown provider, a
 * skill excluded for the provider, an `adev-*` skill, or a file
 * isMirroredSkillFile() rejects. Whether the canonical skill holds a SKILL.md
 * is a filesystem fact and is checked by readCanonicalForMirror().
 *
 * @param {string} mirrorPath - `providers/<provider>/skills/<name>/<rel>`
 * @returns {{ provider: string, skillName: string, rel: string, canonicalPath: string } | null}
 */
export function canonicalForMirror(mirrorPath) {
  const segments = mirrorPath.split('/');
  if (segments.length < 5 || segments[0] !== 'providers' || segments[2] !== 'skills') return null;
  const provider = segments[1];
  const skillName = segments[3];
  const rel = segments.slice(4).join('/');
  if (!Object.hasOwn(PROVIDER_DESCRIPTION_SUFFIX, provider)) return null;
  if ((PROVIDER_EXCLUDES[provider] ?? []).includes(skillName)) return null;
  if (skillName === '' || skillName === '.' || skillName === '..' || !isSyncedSkillName(skillName)) return null;
  if (!isMirroredSkillFile(rel)) return null;
  return { provider, skillName, rel, canonicalPath: `skills/${skillName}/${rel}` };
}

/**
 * The canonical file the sync would read to write `mirrorPath`, as raw bytes
 * from `projectRoot`'s working tree.
 *
 * Throws when the sync would not write `mirrorPath`, when the skill has no
 * regular-file SKILL.md, or when the canonical file is missing, unreadable or
 * not a regular file (a symlinked canonical would let the mirror carry content
 * from outside `skills/`).
 *
 * @param {string} projectRoot
 * @param {string} mirrorPath - repo-relative
 * @returns {{ source: { provider: string, skillName: string, rel: string, canonicalPath: string }, bytes: Buffer }}
 */
export function readCanonicalForMirror(projectRoot, mirrorPath) {
  const source = canonicalForMirror(mirrorPath);
  if (!source) throw new Error(`not a generated provider mirror path: ${mirrorPath}`);
  for (const p of [`skills/${source.skillName}/SKILL.md`, source.canonicalPath]) {
    if (!lstatSync(join(projectRoot, p)).isFile()) throw new Error(`not a regular file: ${p}`);
  }
  return { source, bytes: readFileSync(join(projectRoot, source.canonicalPath)) };
}

/**
 * The exact bytes the sync writes to `mirrorPath` given its canonical file's
 * bytes. The script reads the canonical file as UTF-8 and writes the
 * transformed string as UTF-8, so the result is that string's UTF-8 encoding,
 * not necessarily the canonical file's raw bytes.
 *
 * @param {string} mirrorPath - repo-relative
 * @param {Buffer} canonicalBytes
 * @returns {Buffer}
 */
export function generateMirrorBytes(mirrorPath, canonicalBytes) {
  const source = canonicalForMirror(mirrorPath);
  if (!source) throw new Error(`not a generated provider mirror path: ${mirrorPath}`);
  const { provider, skillName, rel } = source;
  return Buffer.from(mirrorFileContent(canonicalBytes.toString('utf8'), provider, skillName, rel), 'utf8');
}

/**
 * readCanonicalForMirror() then generateMirrorBytes(): the bytes the sync
 * would write to `mirrorPath` from the working tree.
 *
 * @param {string} projectRoot
 * @param {string} mirrorPath - repo-relative
 * @returns {Buffer}
 */
export function generateMirrorFile(projectRoot, mirrorPath) {
  return generateMirrorBytes(mirrorPath, readCanonicalForMirror(projectRoot, mirrorPath).bytes);
}
