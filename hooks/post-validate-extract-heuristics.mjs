/**
 * Post-validate heuristic extraction helper.
 *
 * Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
 *       (ADDED section — migrated from validate.check-12-heuristic-extraction)
 *
 * Input: structured validate verdict metadata from stdin JSON, shaped as
 *   {
 *     tool_name: "...",
 *     tool_result: {
 *       verdict_metadata: {
 *         overall: "PASS" | "FAIL" | ...,
 *         spec_path: ".context-index/specs/.../foo.spec.md",
 *         charter: "validation",     // optional charter slug for scope
 *         checks: [ { id, outcome, ... }, ... ],
 *         elapsed_ms: <number>,
 *         report_path: ".context-index/specs/.../foo.validate.md"
 *       }
 *     }
 *   }
 *
 * Input scoping (SEC-1): this helper consumes ONLY the structured verdict
 * metadata fields above (check IDs, outcomes, timing, counts). It does NOT
 * read or re-emit quality-gate subprocess stdout/stderr — those flow through
 * the redaction pipeline established by `configurable-checks.spec.md`
 * Behavior 25a and must stay out of the heuristic store.
 *
 * Failure mode (SEC-2): any error logs to console.warn (stderr channel),
 * never to stdout (the hook's protocol channel). The process always exits 0
 * so validate's verdict is unaffected.
 */

import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', async () => {
  try {
    await run(input);
  } catch (err) {
    // SEC-2: failure audit on stderr; verdict unaffected.
    const msg = err && err.message ? err.message : String(err);
    console.warn(`[post-validate-hook] Error (non-blocking): ${msg}`);
  }
  process.exit(0);
});

async function run(rawInput) {
  if (!rawInput) return;
  let data;
  try {
    data = JSON.parse(rawInput);
  } catch {
    // Unparseable input: bail silently (the Stop event may fire for non-
    // validate tool uses; only validate produces verdict_metadata).
    return;
  }

  // Only act on validate completions. Other tools (Read, Edit, Bash, ...)
  // are no-ops for this hook.
  const toolName = (data && data.tool_name) || '';
  if (!/validate/i.test(toolName)) return;

  // SEC-1 input scoping: read ONLY the structured verdict metadata. We
  // never touch tool_result subprocess output channels even if they were
  // present in the payload.
  const verdict = data && data.tool_result && data.tool_result.verdict_metadata;
  if (!verdict || typeof verdict !== 'object') return;

  // Only first-run PASS extraction (matching former Check 12 semantics).
  if (verdict.overall !== 'PASS') return;

  const specPath = typeof verdict.spec_path === 'string' ? verdict.spec_path : '';
  if (!specPath) return;

  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) {
    console.warn('[post-validate-hook] CLAUDE_PLUGIN_ROOT unset — skipping extraction');
    return;
  }

  // Best-effort import of the heuristics store. If the lib is unavailable
  // (e.g., the plugin tree is missing), skip silently — the spec's
  // "helper unavailable" SKIP semantics.
  let writeHeuristic;
  try {
    ({ writeHeuristic } = await import(resolve(pluginRoot, 'lib/heuristics.mjs')));
  } catch (err) {
    console.warn(`[post-validate-hook] lib/heuristics.mjs import failed (non-blocking): ${err.message}`);
    return;
  }

  // Resolve project root — same convention as lib/execution-state.mjs and
  // /adev:recover Step 7: prefer the env var, fall back to cwd.
  const projectRoot = process.env.CLAUDE_PROJECT_ROOT || process.cwd();

  // Build the heuristic entry from the verdict-metadata-only fields.
  const scope = typeof verdict.charter === 'string' && verdict.charter
    ? verdict.charter
    : '_global';
  const specSlug = slugify(basename(specPath, '.md').replace(/\.spec$/i, ''));
  if (!specSlug) return; // pathological filename — SKIP

  const specTitle = typeof verdict.spec_title === 'string' && verdict.spec_title
    ? verdict.spec_title
    : specSlug;
  const title = cap(`First-run PASS: ${specTitle}`, 120);

  // Default pattern derivation — uses the Success Factor #4 fallback from
  // the former Check 12 prompt. The richer derivations (golden sample,
  // ADR, cross-cutting) required context-packet inspection that the hook
  // does not have access to, so they degrade to the default lesson here.
  const pattern =
    `First-run PASS for ${specTitle}: implementation matched all acceptance criteria without revision.`;

  const reportPath = typeof verdict.report_path === 'string' && verdict.report_path
    ? verdict.report_path
    : `${specPath.replace(/\.spec\.md$/, '')}.validate.md`;

  const today = new Date().toISOString().slice(0, 10);
  const hashInput = `${normalizePath(specPath)}|${pattern}`;
  const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 8);

  const entry = {
    id: `${specSlug}-${hash}`,
    scope,
    title,
    pattern,
    confidence: 'medium',
    evidence: [{ source: 'validation', path: reportPath, date: today }],
  };

  try {
    const stored = await writeHeuristic(projectRoot, entry);
    // Stored entry's confidence may have auto-promoted; print to stderr
    // for operator visibility without affecting verdict.
    console.warn(
      `[post-validate-hook] Heuristic extracted — ${stored.id} (scope: ${stored.scope}, confidence: ${stored.confidence})`,
    );
  } catch (err) {
    console.warn(`[post-validate-hook] Heuristic extraction failed (non-blocking): ${err.message}`);
  }
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function cap(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n - 3) + '...';
}

function normalizePath(p) {
  return String(p || '').replace(/\\/g, '/').toLowerCase();
}
