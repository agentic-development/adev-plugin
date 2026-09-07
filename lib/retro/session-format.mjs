// lib/retro/session-format.mjs
//
// Pure classifier over parsed session-file frontmatter. Returns one of
// three labels:
//
//   "hook"        — hook-driven-capture session-end / pre-compact / placeholder
//   "post-commit" — legacy post-commit hook output (git-hook agent)
//   "unknown"     — anything else (malformed, future format, random shape)
//
// Per CON-X1: "hook" is the CLASSIFIER LABEL; the stored `kind` field on
// hook-mode files uses `session-end | pre-compact | placeholder`. Do not
// equate the classifier label with the frontmatter value.

const HOOK_KINDS = new Set(['session-end', 'pre-compact', 'placeholder']);

/**
 * Classify a parsed frontmatter object.
 *
 * @param {object|null|undefined} frontmatter
 * @returns {'hook'|'post-commit'|'unknown'}
 */
export function classifyFormat(frontmatter) {
  if (frontmatter === null || frontmatter === undefined) return 'unknown';
  if (typeof frontmatter !== 'object' || Array.isArray(frontmatter)) return 'unknown';

  // Hook-mode: kind ∈ {session-end, pre-compact, placeholder}
  if (typeof frontmatter.kind === 'string' && HOOK_KINDS.has(frontmatter.kind)) {
    return 'hook';
  }

  // Post-commit (legacy): type=commit AND agent=git-hook
  if (frontmatter.type === 'commit' && frontmatter.agent === 'git-hook') {
    return 'post-commit';
  }

  return 'unknown';
}
