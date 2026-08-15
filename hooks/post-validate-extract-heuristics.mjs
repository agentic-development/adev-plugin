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

import { resolve, relative, isAbsolute, sep } from 'node:path';
import { realpathSync, statSync } from 'node:fs';

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

  // Resolve the project root BEFORE anything else that could write. `id`
  // derivation needs a repo-relative spec path, so an unresolvable root means
  // there is no key to derive — and this hook must never guess one, because a
  // guessed key writes a duplicate entry that `writeHeuristic` can no longer
  // reconcile. Capture is non-blocking, so skipping is safe; guessing is not.
  //
  // Convention matches lib/execution-state.mjs and /adev:recover Step 7:
  // prefer the env var, fall back to cwd (always absolute).
  const projectRoot = resolveProjectRoot();
  if (!projectRoot) return; // resolveProjectRoot already warned

  // Containment: the spec must live inside the project root, or the relative
  // path would escape with `..` and the derived id would be meaningless.
  const repoRelSpecPath = toRepoRelative(projectRoot, specPath);
  if (!repoRelSpecPath) return; // toRepoRelative already warned

  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) {
    console.warn('[post-validate-hook] CLAUDE_PLUGIN_ROOT unset — skipping extraction');
    return;
  }

  // Best-effort import of the heuristics store. If the lib is unavailable
  // (e.g., the plugin tree is missing), skip silently — the spec's
  // "helper unavailable" SKIP semantics.
  let writeHeuristic;
  let deriveHeuristicId;
  let canonicalSpecSlug;
  try {
    ({ writeHeuristic, deriveHeuristicId, canonicalSpecSlug } = await import(
      resolve(pluginRoot, 'lib/heuristics.mjs')
    ));
  } catch (err) {
    console.warn(`[post-validate-hook] lib/heuristics.mjs import failed (non-blocking): ${err.message}`);
    return;
  }

  // Build the heuristic entry from the verdict-metadata-only fields.
  const scope = typeof verdict.charter === 'string' && verdict.charter
    ? verdict.charter
    : '_global';
  // Shared with the store migration, so the hook and the rekey cannot drift
  // onto two different canonical forms.
  const specSlug = canonicalSpecSlug(specPath);
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

  const entry = {
    id: deriveHeuristicId(specSlug, repoRelSpecPath, pattern),
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


function cap(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n - 3) + '...';
}

/**
 * Resolve the project root, failing closed rather than guessing.
 *
 * Returns the absolute root, or `null` after warning to stderr when
 * `CLAUDE_PROJECT_ROOT` is set to something that is not an absolute path to an
 * existing directory. An unset env var falls back to `process.cwd()`, which is
 * always absolute and always exists.
 *
 * @returns {string|null}
 */
function resolveProjectRoot() {
  const fromEnv = process.env.CLAUDE_PROJECT_ROOT;
  if (!fromEnv) return process.cwd();

  if (!isAbsolute(fromEnv)) {
    console.warn(
      `[post-validate-hook] project root '${fromEnv}' is not an absolute path — skipping extraction`,
    );
    return null;
  }

  try {
    if (!statSync(fromEnv).isDirectory()) {
      console.warn(
        `[post-validate-hook] project root '${fromEnv}' is not a directory — skipping extraction`,
      );
      return null;
    }
  } catch {
    console.warn(
      `[post-validate-hook] project root '${fromEnv}' does not exist — skipping extraction`,
    );
    return null;
  }

  // Normalize before returning: the containment check downstream compares
  // string prefixes, so a trailing slash, a `..` segment, or a symlinked
  // parent would otherwise fail containment and be reported as an escaping
  // spec path — fail-closed, but with a warning that misdescribes the cause.
  // `process.cwd()` is already realpath'd by Node, so realpath'ing the env
  // var keeps the two branches symmetric.
  try {
    return realpathSync(fromEnv);
  } catch {
    return resolve(fromEnv);
  }
}

/**
 * Convert a spec path (relative or absolute) to a repo-relative path, or
 * `null` after warning when it escapes the project root.
 *
 * The repo-relative form is what makes the derived `id` identical across
 * worktrees; an escaping path has no such form, so extraction is skipped
 * rather than keyed on a path that means nothing outside this checkout.
 *
 * @param {string} projectRoot - Absolute project root.
 * @param {string} specPath - Spec path as supplied in the verdict metadata.
 * @returns {string|null}
 */
function toRepoRelative(projectRoot, specPath) {
  let abs = isAbsolute(specPath) ? specPath : resolve(projectRoot, specPath);
  // Match resolveProjectRoot's realpath treatment so a symlinked checkout
  // does not read as an escape. A spec that does not exist yet keeps its
  // resolved (non-realpath'd) form.
  try {
    abs = realpathSync(abs);
  } catch {
    abs = resolve(abs);
  }
  if (abs !== projectRoot && !abs.startsWith(projectRoot + sep)) {
    console.warn(
      `[post-validate-hook] spec path '${specPath}' escapes the project root — skipping extraction`,
    );
    return null;
  }
  // Normalize separators at the boundary so the value handed to
  // deriveHeuristicId is already POSIX-shaped. `normalizeIdInput` folds `\`
  // too, so this is defence in depth rather than the sole guarantee.
  return relative(projectRoot, abs).split(sep).join('/');
}
