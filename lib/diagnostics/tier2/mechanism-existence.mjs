/**
 * Tier-2 producer: `adev/mechanism-existence`.
 *
 * Gates every authored revision (BEH-6) before a reviewer is re-dispatched:
 * extracts `file:line` and `file::symbol` referents an authoring subagent
 * cited in a spec's body, and verifies each one actually resolves inside
 * `projectRoot`. Also extracts `--flag` and `UPPER_SNAKE_ERROR_CODE` tokens
 * for visibility, but does NOT filesystem-verify them — neither has a
 * checkable filesystem invariant in this task's scope (BEH-7's first
 * sentence covers only the file:line / file::symbol candidates).
 *
 * Routing authority: `.context-index/adrs/0010-governance-check-layering.md`
 * decision-flow step 5 — "does it inspect an artifact ... for verifiable
 * invariants? → diagnostics.yaml, classify by tier". A spec's authored body
 * text is the artifact; the invariant is "every citation resolves."
 *
 * Extraction is deterministic regex pattern matching over the given text —
 * no import scanning, no AST parse (mirrors the sibling producer
 * `lib/diagnostics/tier2/validated-without-report.mjs`'s "single stat" cost
 * discipline, extended here to "no filesystem walk beyond the candidates
 * actually cited").
 *
 * Path-containment refusal mirrors `lib/extensions/exec-payload.mjs::assertContained`
 * (BD-2 corrected citation: the refusal block is lines 174-183, not 171-179):
 * a lexical `../` traversal is refused BEFORE any filesystem access, and a
 * realpath'd candidate outside a realpath'd `projectRoot` is refused even
 * when the traversal only appears after resolving a symlink. Every failure
 * mode — lexical escape, post-realpath escape, ENOENT, broken symlink — is
 * refused as MECHANISM_PATH_ESCAPE or MECHANISM_NOT_FOUND. Never silently
 * "not found": absence of a finding here means every candidate resolved,
 * not that checking was skipped.
 *
 * @module lib/diagnostics/tier2/mechanism-existence
 */

import { readFileSync, realpathSync } from 'node:fs';
import { resolve, isAbsolute, sep } from 'node:path';

const DIAGNOSTIC_ID = 'adev/mechanism-existence';
const SEVERITY = 'error';

// Backtick-fenced `path:line` or `path:line-line2`. The path segment must
// contain at least one `/` (multiple path components) so a bare prose colon
// like `revision:5` is never mistaken for a citation — this also correctly
// extracts an extension-less traversal candidate like `../../etc/passwd:1`,
// which a stricter "must end in a file extension" rule would silently miss
// (and MECHANISM_PATH_ESCAPE exists precisely to refuse candidates like that).
const FILE_LINE_RE = /`([\w.-]+(?:\/[\w.-]+)+):(\d+)(?:-\d+)?`/g;

// Backtick-fenced `path::symbol` — the codebase's own convention for citing
// an exported symbol alongside the file that defines it (seen throughout
// this plan's own Files/Context sections, e.g. `lib/specify-revise.mjs::groupBlockersByAnchor`).
const FILE_SYMBOL_RE = /`([\w.-]+(?:\/[\w.-]+)+)::([A-Za-z_$][\w$]*)`/g;

/**
 * Lexically pre-check a relative candidate for a `../` traversal segment
 * BEFORE any filesystem access, then realpath-resolve and re-check
 * containment against a realpath'd base. Mirrors
 * `lib/extensions/exec-payload.mjs::assertContained` lines 174-183 (BD-2).
 *
 * @param {string} projectRoot
 * @param {string} candidatePath - as cited (relative or absolute)
 * @returns {{ok: true, real: string}|{ok: false, code: 'MECHANISM_PATH_ESCAPE'|'MECHANISM_NOT_FOUND', reason: string}}
 */
function resolveContainedCandidate(projectRoot, candidatePath) {
  let realBase;
  try {
    realBase = realpathSync(resolve(projectRoot));
  } catch (e) {
    return { ok: false, code: 'MECHANISM_NOT_FOUND', reason: `cannot resolve projectRoot: ${e.message}` };
  }

  const lexicalBase = resolve(projectRoot);
  if (!isAbsolute(candidatePath)) {
    const lexical = resolve(lexicalBase, candidatePath);
    if (lexical !== lexicalBase && !lexical.startsWith(lexicalBase + sep)) {
      return {
        ok: false,
        code: 'MECHANISM_PATH_ESCAPE',
        reason: `'${candidatePath}' resolves to '${lexical}', which escapes '${lexicalBase}'`,
      };
    }
  }

  let real;
  try {
    real = realpathSync(resolve(projectRoot, candidatePath));
  } catch (e) {
    return { ok: false, code: 'MECHANISM_NOT_FOUND', reason: `'${candidatePath}' cannot be resolved: ${e.message}` };
  }

  if (real !== realBase && !real.startsWith(realBase + sep)) {
    return {
      ok: false,
      code: 'MECHANISM_PATH_ESCAPE',
      reason: `'${candidatePath}' resolves to '${real}', which escapes '${realBase}'`,
    };
  }
  return { ok: true, real };
}

/**
 * Run the mechanism-existence producer.
 *
 * @param {object} ctx
 * @param {string} ctx.projectRoot - Absolute project root candidates are resolved against.
 * @param {string} [ctx.authoredText] - Text to extract referents from.
 * @param {string} [ctx.spec] - Optional spec path, used as `citation`.
 * @returns {{
 *   fired: boolean, id?: string, severity?: string, message?: string, citation?: string,
 *   unresolved?: Array<{candidate: string, kind: 'file:line'|'file::symbol', code: string, reason: string}>,
 *   resolvedCount?: number,
 * }}
 */
export function run(ctx) {
  const projectRoot = ctx?.projectRoot;
  const authoredText = typeof ctx?.authoredText === 'string' ? ctx.authoredText : '';
  if (typeof projectRoot !== 'string' || projectRoot.length === 0 || authoredText.length === 0) {
    return { fired: false };
  }

  const candidates = [];
  for (const m of authoredText.matchAll(FILE_LINE_RE)) {
    candidates.push({ kind: 'file:line', path: m[1], line: Number(m[2]), candidate: m[0] });
  }
  for (const m of authoredText.matchAll(FILE_SYMBOL_RE)) {
    candidates.push({ kind: 'file::symbol', path: m[1], symbol: m[2], candidate: m[0] });
  }

  if (candidates.length === 0) return { fired: false };

  const unresolved = [];
  let resolvedCount = 0;

  for (const c of candidates) {
    const containment = resolveContainedCandidate(projectRoot, c.path);
    if (!containment.ok) {
      unresolved.push({ candidate: c.candidate, kind: c.kind, code: containment.code, reason: containment.reason });
      continue;
    }

    if (c.kind === 'file:line') {
      let lineCount;
      try {
        const content = readFileSync(containment.real, 'utf8');
        lineCount = content.split('\n').length;
      } catch (e) {
        unresolved.push({
          candidate: c.candidate, kind: c.kind, code: 'MECHANISM_NOT_FOUND',
          reason: `'${c.path}' could not be read: ${e.message}`,
        });
        continue;
      }
      if (c.line > lineCount) {
        unresolved.push({
          candidate: c.candidate, kind: c.kind, code: 'MECHANISM_NOT_FOUND',
          reason: `'${c.path}' has ${lineCount} lines; cited line ${c.line} does not exist`,
        });
        continue;
      }
      resolvedCount++;
    } else {
      // file::symbol — cheap substring check against the already-resolved file's
      // content. Deliberately not an AST/export scan (no import scanning, per
      // this producer's docstring); a substring match is the "no false negative,
      // occasional false positive on a comment" tradeoff this task's scope accepts.
      let content;
      try {
        content = readFileSync(containment.real, 'utf8');
      } catch (e) {
        unresolved.push({
          candidate: c.candidate, kind: c.kind, code: 'MECHANISM_NOT_FOUND',
          reason: `'${c.path}' could not be read: ${e.message}`,
        });
        continue;
      }
      if (!content.includes(c.symbol)) {
        unresolved.push({
          candidate: c.candidate, kind: c.kind, code: 'MECHANISM_NOT_FOUND',
          reason: `symbol '${c.symbol}' not found in '${c.path}'`,
        });
        continue;
      }
      resolvedCount++;
    }
  }

  if (unresolved.length === 0) return { fired: false };

  const codes = [...new Set(unresolved.map(u => u.code))].join(', ');
  return {
    fired: true,
    id: DIAGNOSTIC_ID,
    severity: SEVERITY,
    message:
      `${unresolved.length} cited mechanism referent(s) did not resolve (${codes}): ` +
      unresolved.map(u => `${u.candidate} — ${u.reason}`).join('; '),
    citation: typeof ctx?.spec === 'string' ? ctx.spec : undefined,
    unresolved,
    resolvedCount,
  };
}
