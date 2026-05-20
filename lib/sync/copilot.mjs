// Copilot sync renderers + dispatcher.
//
// This module owns the projection of `.context-index/constitution.md` and per-
// module charters into Copilot-native instruction files. The renderers are
// pure string functions; the dispatcher does all IO via `<path>.tmp` +
// `fs.fsyncSync` + `fs.renameSync` for crash-consistency.
//
// Spec: .context-index/specs/features/copilot-provider/copilot-sync-output.spec.md

import { createHash } from 'node:crypto';

const MAX_BYTES = 4000;
// The spec declares the regex as
//   /\b(rm\s+-rf|--no-verify|--force\s+push|chmod\s+777|disable\s+confirmation)\b/i
// but the leading `\b` only anchors against word characters and would silently
// fail to match `--no-verify` (because `-` is not a word character, the
// boundary cannot occur between a leading space and a leading `-`). The split
// below preserves the spec's intent: each pattern matches as a whole token
// with non-word boundaries on either side, regardless of whether the token
// starts with `-` or a word character. Spec review note N-2 anticipated this.
const DANGEROUS_PATTERN = /(?:\brm\s+-rf\b|(?:^|[^\w-])--no-verify\b|(?:^|[^\w-])--force\s+push\b|\bchmod\s+777\b|\bdisable\s+confirmation\b)/i;
const ALLOW_MARKER = '<!-- allow-projection: true -->';
const SLUG_RE = /^[a-z0-9-]{1,64}$/;
const PATH_RE = /^[A-Za-z0-9_\-./*?\[\]{}!,]+$/;

/**
 * Extract the contents of a single H2 markdown section.
 * Returns the section heading line + body up to (but not including) the next
 * H2 or EOF, with no trailing newline trimming applied. Returns null if the
 * section is not found.
 *
 * @param {string} text - Full markdown text.
 * @param {string} heading - The H2 heading title (without `## `).
 * @returns {string | null}
 */
function extractSection(text, heading) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex(
    (l) => l.trim() === `## ${heading}`,
  );
  if (startIdx === -1) return null;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('## ')) {
      endIdx = i;
      break;
    }
  }
  // Trim trailing empty lines from the section
  let last = endIdx - 1;
  while (last > startIdx && lines[last].trim() === '') last -= 1;
  return lines.slice(startIdx, last + 1).join('\n');
}

/**
 * Parse the body of the `## Non-Negotiable Principles` section into a list of
 * principle objects. Each principle is a top-level numbered list item that
 * starts with a digit followed by `. `. Continuation lines (indented or empty
 * lines between items) are folded into the current principle's text.
 *
 * @param {string} principlesSection - Section text including the `## ` heading.
 * @returns {Array<{ number: number, title: string, text: string, raw: string, line: number }>}
 */
function parsePrinciples(principlesSection) {
  if (!principlesSection) return [];
  const lines = principlesSection.split('\n');
  /** @type {Array<{ number: number, title: string, text: string, raw: string, line: number }>} */
  const principles = [];
  let current = null;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const m = /^(\d+)\.\s+(.*)$/.exec(line);
    if (m) {
      if (current) principles.push(current);
      const number = Number(m[1]);
      // Title is the bolded leading **...** if present, else the first 40 chars.
      const titleMatch = /\*\*([^*]+)\*\*/.exec(m[2]);
      const title = titleMatch ? titleMatch[1] : m[2].slice(0, 40);
      current = {
        number,
        title,
        text: m[2],
        raw: line,
        line: i,
      };
    } else if (current && (line.trim() === '' || /^\s/.test(line))) {
      // Continuation: indented line or blank line within a principle
      current.raw += `\n${line}`;
    }
    // Otherwise ignore (e.g., the blank line before the first item)
  }
  if (current) principles.push(current);
  // Trim trailing blank-only continuations
  for (const p of principles) {
    p.raw = p.raw.replace(/\n+$/, '');
  }
  return principles;
}

/**
 * Compute a 16-hex-character SHA-256 prefix of the source constitution.
 *
 * @param {string} constitutionText
 * @returns {string} 16-character hex string.
 */
function sha256Prefix(constitutionText) {
  return createHash('sha256').update(constitutionText, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Scan the constitution text for dangerous patterns (rm -rf, --no-verify, etc.)
 * Throws `CONSTITUTION_DANGEROUS_PATTERN` if any match is found without an
 * `<!-- allow-projection: true -->` opt-out on the matched line or the
 * preceding line.
 *
 * @param {string} text
 * @throws {Error} CONSTITUTION_DANGEROUS_PATTERN
 */
function scanDangerousPatterns(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const m = DANGEROUS_PATTERN.exec(lines[i]);
    if (!m) continue;
    const sameLineOptOut = lines[i].includes(ALLOW_MARKER);
    const prevLineOptOut = i > 0 && lines[i - 1].includes(ALLOW_MARKER);
    if (sameLineOptOut || prevLineOptOut) continue;
    const snippet = m[0];
    const err = new Error(
      `CONSTITUTION_DANGEROUS_PATTERN: ${i + 1}: ${snippet}`,
    );
    err.code = 'CONSTITUTION_DANGEROUS_PATTERN';
    err.lineNumber = i + 1;
    err.snippet = snippet;
    throw err;
  }
}

/**
 * Assemble the Copilot projection body from Identity + Principles + SHA-256
 * pointer comment, optionally with an in-file SYNC_OVERFLOW marker after the
 * Identity section.
 *
 * @param {string} identitySection
 * @param {string} principlesHeader - The `## Non-Negotiable Principles` heading line.
 * @param {Array<{ raw: string }>} keptPrinciples
 * @param {Array<number>} droppedPrincipleNumbers - empty when no overflow.
 * @param {string} shaPrefix
 * @returns {string}
 */
function assembleBody(identitySection, principlesHeader, keptPrinciples, droppedPrincipleNumbers, shaPrefix) {
  const parts = [identitySection];
  if (droppedPrincipleNumbers.length > 0) {
    const names = droppedPrincipleNumbers.join(',');
    parts.push(
      `<!-- SYNC_OVERFLOW: principles ${names} dropped to fit 4,000-byte cap. Source: .context-index/constitution.md -->`,
    );
  }
  const principlesBody = [principlesHeader, '', ...keptPrinciples.map((p) => p.raw)].join('\n');
  parts.push(principlesBody);
  parts.push(
    `<!-- Source: .context-index/constitution.md @ sha256:${shaPrefix}. Run /adev:sync to refresh. -->`,
  );
  return parts.join('\n\n');
}

/**
 * Project the constitution into a Copilot-compatible `.github/copilot-
 * instructions.md` body.
 *
 * @param {string} constitutionText - Full markdown content of `.context-index/constitution.md`.
 * @returns {{ body: string, droppedPrinciples: number[], warnings: string[] }}
 * @throws {Error} CONSTITUTION_STRUCTURE_INVALID, CONSTITUTION_TOO_LARGE, CONSTITUTION_DANGEROUS_PATTERN
 */
export function renderCopilotInstructions(constitutionText) {
  if (typeof constitutionText !== 'string') {
    throw new Error('renderCopilotInstructions: constitutionText must be a string');
  }

  scanDangerousPatterns(constitutionText);

  const identitySection = extractSection(constitutionText, 'Identity');
  if (!identitySection) {
    const err = new Error('CONSTITUTION_STRUCTURE_INVALID: missing Identity');
    err.code = 'CONSTITUTION_STRUCTURE_INVALID';
    throw err;
  }
  const principlesSection = extractSection(constitutionText, 'Non-Negotiable Principles');
  if (!principlesSection) {
    const err = new Error('CONSTITUTION_STRUCTURE_INVALID: missing Non-Negotiable Principles');
    err.code = 'CONSTITUTION_STRUCTURE_INVALID';
    throw err;
  }

  const principlesHeader = principlesSection.split('\n')[0];
  const allPrinciples = parsePrinciples(principlesSection);

  const shaPrefix = sha256Prefix(constitutionText);

  // Drop-tail-first overflow loop.
  let kept = [...allPrinciples];
  /** @type {number[]} */
  const dropped = [];
  let body = assembleBody(identitySection, principlesHeader, kept, dropped, shaPrefix);
  while (Buffer.byteLength(body, 'utf8') > MAX_BYTES) {
    if (kept.length === 0) {
      // Identity + scaffolding alone exceeds the cap.
      const err = new Error(
        `CONSTITUTION_TOO_LARGE: ${Buffer.byteLength(body, 'utf8')}`,
      );
      err.code = 'CONSTITUTION_TOO_LARGE';
      throw err;
    }
    const drop = kept.pop();
    dropped.push(drop.number);
    body = assembleBody(identitySection, principlesHeader, kept, dropped, shaPrefix);
  }

  const warnings = [];
  if (dropped.length > 0) {
    warnings.push(`SYNC_OVERFLOW: principles ${dropped.join(',')}`);
  }

  return { body, droppedPrinciples: dropped, warnings };
}

/**
 * Extract the body of an H3 markdown sub-section.
 * Returns the lines following the H3 heading up to the next H2/H3 or EOF,
 * with trailing blank lines trimmed. Returns null if not found.
 *
 * @param {string} text - Markdown text.
 * @param {string} heading - The H3 heading title (without `### `).
 * @returns {string | null}
 */
function extractSubSection(text, heading) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => l.trim() === `### ${heading}`);
  if (startIdx === -1) return null;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('## ') || lines[i].startsWith('### ')) {
      endIdx = i;
      break;
    }
  }
  // Body is everything after the heading line, with trailing blanks trimmed.
  const body = lines.slice(startIdx + 1, endIdx).join('\n').replace(/\s+$/, '');
  return body;
}

/**
 * Extract the text body of an H2 section (without the heading line itself).
 * Returns null if the section is not found.
 *
 * @param {string} text
 * @param {string} heading
 * @returns {string | null}
 */
function extractSectionBody(text, heading) {
  const section = extractSection(text, heading);
  if (!section) return null;
  // Drop the first line (the `## Heading` line) and trim leading blanks.
  const lines = section.split('\n').slice(1);
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  return lines.join('\n').replace(/\s+$/, '');
}

/**
 * Project one module's charter into a Copilot per-module instructions file
 * body. The emitted body carries YAML frontmatter with `applyTo` as a
 * double-quoted scalar and a one-line `description`, followed by the charter's
 * Business Intent paragraph and In Scope bullet list.
 *
 * @param {{ slug: string, name?: string, paths: string[] }} module
 * @param {string} charterText
 * @returns {{ body: string | null, warnings: string[] }}
 * @throws {Error} INVALID_MODULE_SLUG, INVALID_MODULE_PATH
 */
export function renderModuleInstruction(module, charterText) {
  if (!module || typeof module !== 'object') {
    throw new Error('renderModuleInstruction: module must be an object');
  }
  if (typeof charterText !== 'string') {
    throw new Error('renderModuleInstruction: charterText must be a string');
  }

  const slug = typeof module.slug === 'string' ? module.slug.normalize('NFC') : '';
  if (!SLUG_RE.test(slug)) {
    const err = new Error(`INVALID_MODULE_SLUG: ${module.slug}`);
    err.code = 'INVALID_MODULE_SLUG';
    err.slug = module.slug;
    throw err;
  }

  const rawPaths = Array.isArray(module.paths) ? module.paths : [];
  for (const p of rawPaths) {
    if (typeof p !== 'string' || p.includes('\n') || p.includes('---') || !PATH_RE.test(p)) {
      const err = new Error(`INVALID_MODULE_PATH: ${slug}: ${JSON.stringify(p)}`);
      err.code = 'INVALID_MODULE_PATH';
      err.module = slug;
      err.path = p;
      throw err;
    }
  }

  const warnings = [];
  /** @type {string} */
  let applyToValue;
  if (rawPaths.length === 0) {
    applyToValue = '**';
    warnings.push(`SYNC_PATHS_EMPTY: ${slug}`);
  } else {
    applyToValue = rawPaths.join(',');
  }

  const businessIntent = extractSectionBody(charterText, 'Business Intent');
  const inScope = extractSubSection(charterText, 'In Scope');
  if (!businessIntent || !inScope) {
    warnings.push(`CHARTER_INCOMPLETE: ${slug}`);
    return { body: null, warnings };
  }

  // Compose YAML frontmatter. `applyTo` is emitted as a double-quoted scalar.
  // Inputs are already constrained by SLUG_RE/PATH_RE — no escaping required
  // for the path payload — but we still defensively escape `"` and `\` if the
  // allow-list ever loosens.
  const safeApplyTo = applyToValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const displayName = typeof module.name === 'string' && module.name.length > 0 ? module.name : slug;
  const safeDescription = `${displayName} module instructions (auto-generated by /adev:sync).`
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const frontmatter = [
    '---',
    `applyTo: "${safeApplyTo}"`,
    `description: "${safeDescription}"`,
    '---',
  ].join('\n');

  const bodyMd = [
    `# ${displayName}`,
    '',
    '## Business Intent',
    '',
    businessIntent,
    '',
    '## In Scope',
    '',
    inScope,
    '',
  ].join('\n');

  const body = `${frontmatter}\n\n${bodyMd}`;
  return { body, warnings };
}

// syncCopilot will be added in subsequent tasks.
