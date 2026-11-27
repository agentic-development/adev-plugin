// lib/implement/review-depth.mjs
//
// Resolves the effective review depth for a single /adev:implement task. The
// ladder is applied in this order:
//
//   1. tier-full-absolute — `--tier full` always wins; no floor is consulted.
//   2. baseline           — `--tier quick`, else the spec's
//                           risk level in risk-policies.yaml
//                           (policies[<risk_level>].implement_mode), recorded
//                           as `policy-baseline`. A policy `lite` is a `quick`
//                           baseline. With no policy value the baseline is
//                           `quick`, recorded as `default-quick`.
//   3. lite grant         — provisional pass only. `lite` (source
//                           `lite-grant`) when all four liteGrant()
//                           conditions hold: operator authorization (`--lite`,
//                           `--tier lite`, or a policy `lite` with no
//                           `--tier`), a routing entry liteEligible() accepts
//                           (`auto-agent` or `assisted-agent`; scores are not
//                           read), a spec that is not high-risk with no
//                           provisional floor leg, and no `--parallel`. The
//                           final pass never grants it.
//   4. floor              — escalating only; any holding leg forces `full`:
//                           risk-level (a high-risk spec on a task not routed
//                           auto-agent), routing (human-only), boundary and
//                           sensitive-path (declared paths on both passes,
//                           every touched path on the final pass),
//                           critical-finding (final pass). The lite cap: when
//                           lite is authorized and the spec is not high-risk,
//                           a floor whose every holding leg is boundary or
//                           sensitive-path gives `quick` instead.
//   5. tripwire           — final pass, when the task's provisional depth was
//                           `lite`, in place of 2–3: the floor runs over every
//                           touched path under the lite cap, with the boundary
//                           and sensitive-path legs also seeing gitignored
//                           paths written since the task started, so a
//                           boundary or sensitive-path leg gives `quick` and
//                           any other holding leg `full`; otherwise a touched
//                           path that is undeclared, not isTripwireExempt()
//                           and not an exact provider-mirror regeneration of
//                           a declared or touched canonical skill file
//                           (isRegeneratedProviderMirror()) gives `quick`
//                           (scope-mismatch); otherwise `lite`. Escalations
//                           are recorded `lite-tripwire`.
//
// Routing scores and the shape of the task's file set never decide a depth,
// and a task with no floor leg and no lite grant resolves at its baseline.
//
// resolveImplementReviewDepth() returns
//   { depth, source, floor_applied, floor_legs, warnings,
//     lite_denied, lite_source, escalated_from, floor_cap }
// where `lite_denied` is, on the provisional pass, the first failing grant
// condition (`not-authorized`, `no-routing-entry`, `high-risk`,
// `floor:<leg>`, `parallel`) or null when granted, and is always null on the
// final pass; `lite_source` is `flag`, `policy` or null on both passes;
// `escalated_from` is `lite` on a tripwire escalation and null otherwise; and
// `floor_cap` is `quick` when the lite cap lowered the floor's result and
// null otherwise. The last four are verb output only and are not part of the
// review_depth_resolved event.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdtempSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isValidTier, InvalidTierError } from '../governance/rigor-mode.mjs';
import { codedError } from '../errors.mjs';
import { effectiveSensitivePaths } from '../test-strategies/sensitive-paths.mjs';
import { matchGlob } from '../test-strategies/manifest.mjs';
import { slugFromSpec } from '../lifecycle-state.mjs';
import { canonicalForMirror, generateMirrorBytes, readCanonicalForMirror } from '../sync/provider-skills.mjs';

const LITE_ELIGIBLE_AGENTS = new Set(['auto-agent', 'assisted-agent']);

/**
 * Route's `lite`-eligibility signal, and its single code definition: the
 * entry is routed `auto-agent` or `assisted-agent`. Routing scores are not
 * read, so nothing is validated and `warnings` is always empty.
 *
 * @param {object|null|undefined} entry - a `.routing.json` entry
 * @returns {{ eligible: boolean, warnings: object[] }}
 */
export function liteEligible(entry) {
  return { eligible: LITE_ELIGIBLE_AGENTS.has(entry?.selected_agent), warnings: [] };
}

/**
 * The lite grant's four conditions, checked in order; `lite_denied` names the
 * first that fails, or is null when all hold:
 *   (a) `authorized`, else `not-authorized`;
 *   (b) no `liteUnavailable` reason, else that reason, without reading the
 *       entry (the caller knows it cannot be used for a grant, e.g.
 *       `no-routing-entry` when no routing sidecar is committed at
 *       run_base); then a routing entry liteEligible() accepts, else
 *       `no-routing-entry`, except that a `human-only` entry goes on to (c);
 *   (c) a spec that is not high-risk, else `high-risk`, and no provisional
 *       floor leg, else `floor:<first leg>`; a `human-only` entry is
 *       `floor:routing` even when the caller passed no `routing` leg;
 *   (d) not `parallel`, else `parallel`.
 *
 * @param {object} input
 * @param {boolean} input.authorized
 * @param {object} [input.routingEntry]
 * @param {string} [input.riskLevel]
 * @param {string[]} [input.provisionalLegs] - floor legs holding on the declared paths
 * @param {boolean} [input.parallel]
 * @param {string|null} [input.liteUnavailable] - a `lite_denied` reason the caller already knows holds
 * @returns {{ granted: boolean, lite_denied: string|null, warnings: object[] }}
 */
export function liteGrant({ authorized, routingEntry, riskLevel, provisionalLegs, parallel, liteUnavailable = null }) {
  const deny = (lite_denied) => ({ granted: false, lite_denied, warnings: [] });
  if (authorized !== true) return deny('not-authorized');
  if (typeof liteUnavailable === 'string' && liteUnavailable !== '') return deny(liteUnavailable);

  const humanOnly = routingEntry?.selected_agent === 'human-only';
  if (!humanOnly && !liteEligible(routingEntry).eligible) return deny('no-routing-entry');
  if (riskLevel === 'high') return deny('high-risk');
  const legs = provisionalLegs ?? [];
  if (legs.length > 0) return deny(`floor:${legs[0]}`);
  if (humanOnly) return deny('floor:routing');
  if (parallel === true) return deny('parallel');
  return { granted: true, lite_denied: null, warnings: [] };
}

/**
 * Records the worktree as it stands right now as a git tree object: the
 * current index (so staged state counts) plus every file `git add -A` would
 * pick up, i.e. tracked modifications and untracked files not excluded by
 * .gitignore. Built in a throwaway index, so the real index, the working
 * tree and HEAD are never touched; the only side effect is loose objects in
 * the object store, which `git gc` reclaims.
 *
 * Captured once at task dispatch and passed as the final pass's `baseSha`,
 * it lets computeTouchedFiles() see only what the task itself changed.
 * Files that were already untracked or dirty when the task started (session
 * logs, other specs' lifecycle logs, editor droppings) are part of the base
 * and drop out of the diff.
 *
 * @param {string} projectRoot
 * @returns {string} tree object id
 */
export function snapshotWorkingTree(projectRoot) {
  const git = (args, env) =>
    execFileSync('git', args, {
      cwd: projectRoot,
      encoding: 'utf8',
      env: env ? { ...process.env, ...env } : process.env,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

  const realIndex = resolve(projectRoot, git(['rev-parse', '--git-path', 'index']));
  const dir = mkdtempSync(join(tmpdir(), 'adev-task-snapshot-'));
  const index = join(dir, 'index');
  try {
    // Seeding from the real index keeps its stat cache, so `add -A` re-hashes
    // only files that changed instead of every tracked file in the repo. The
    // copy must keep the real index's mtime: git treats an entry whose file
    // mtime is not older than the index file as "racily clean" and re-hashes
    // it, and a fresh copy's newer mtime would turn that check off, so a
    // same-size edit made within the same timestamp tick would look unchanged.
    if (existsSync(realIndex)) {
      copyFileSync(realIndex, index);
      const { atime, mtime } = statSync(realIndex);
      utimesSync(index, atime, mtime);
    } else {
      git(['read-tree', '--empty'], { GIT_INDEX_FILE: index });
    }
    git(['add', '-A'], { GIT_INDEX_FILE: index });
    return git(['write-tree'], { GIT_INDEX_FILE: index });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The files a task touched: `git diff-tree -r --no-renames --raw -z` from
 * `baseSha`'s tree to a fresh snapshotWorkingTree(). Every path the worktree
 * gained, changed or lost since the base is reported with its own status
 * (`A`/`M`/`D`/`T`), untracked files included, and with git's own modes:
 * `mode` is the destination mode (`000000` for a `D` record) and `src_mode`
 * the source mode (`000000` for an `A` record), so a symlink (`120000`) is
 * visible whether it was added, changed or deleted. `dst_sha` is the
 * destination object id (all zeros for a `D` record): the content the diff
 * compares, as snapshotted.
 *
 * `baseSha` may be a commit or a tree from snapshotWorkingTree(). With a
 * commit, the result equals the previous union of `git diff <commit>` and
 * `git ls-files --others --exclude-standard` (every untracked file as `A`),
 * because the snapshot holds tracked edits and untracked files alike. With a
 * dispatch-time snapshot, whatever predated the task is excluded.
 *
 * `--no-renames` is deliberate: a rename must surface as a paired D (old
 * path) + A (new path) rather than collapsing into a single R entry, so the
 * old path is still seen by the touched-path floor legs (moving a file out of
 * a sensitive directory is a change to that directory).
 *
 * Paths are git's NUL-delimited repo-relative output, never joined or
 * resolved. This is the only place the touched-file computation lives; it
 * never accepts a caller-supplied file list.
 *
 * @param {string} projectRoot
 * @param {string} baseSha commit or tree-ish
 * @returns {{ path: string, status: string, mode: string, src_mode: string, dst_sha: string }[]}
 */
export function computeTouchedFiles(projectRoot, baseSha) {
  if (!baseSha) {
    throw codedError('MISSING_DIFF_RANGE', 'computeTouchedFiles requires a baseSha to diff against');
  }

  const current = snapshotWorkingTree(projectRoot);
  // `--raw -z` emits `:<src_mode> <dst_mode> <src_sha> <dst_sha> <status>\0<path>\0`
  // per record; `--no-renames` guarantees exactly one path per record.
  const fields = execFileSync(
    'git',
    ['diff-tree', '-r', '--no-renames', '--raw', '-z', `${baseSha}^{tree}`, current],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
  ).split('\0');

  const records = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const [src_mode, mode, , dst_sha, status] = fields[i].slice(1).split(' ');
    records.push({ path: fields[i + 1], status, mode, src_mode, dst_sha });
  }
  return records;
}

const TEST_BASENAME_RE = /^.+\.(test|spec)\.(js|mjs|cjs|ts|tsx|jsx|py|go|rb|rs)$/;

/**
 * Whether a touched path the task did not declare may stay inside a `lite`
 * task without tripping scope-mismatch. Pass the record's `mode`, or its
 * `src_mode` for a `D` record, so a deleted symlink is caught.
 *
 * Never exempt: a symlink (`120000`); a path with a leading `/` or an empty,
 * `.` or `..` segment, since `tests/../lib/x.mjs` names a file outside
 * `tests/`; a path with any segment that lowercases to `.context-index`; a
 * path whose lowercased form ends in `.spec.md`. The last two are matched
 * case-insensitively so a case-folding filesystem cannot route around them.
 *
 * Otherwise exempt, matched case-sensitively: a path under the repo-root
 * `tests/` or `docs/`, a `README.md` basename, or a `*.test.<ext>` /
 * `*.spec.<ext>` basename for a source extension.
 *
 * @param {string} path - repo-relative, `/`-separated
 * @param {string} mode - git mode
 * @returns {boolean}
 */
export function isTripwireExempt(path, mode) {
  if (isNeverExempt(path, mode)) return false;
  if (path.startsWith('tests/') || path.startsWith('docs/')) return true;
  const segments = path.split('/');
  const basename = segments[segments.length - 1];
  return basename === 'README.md' || TEST_BASENAME_RE.test(basename);
}

/** Whether `path` (git `mode`) has a shape no tripwire exemption may cover, isTripwireExempt()'s or isRegeneratedProviderMirror()'s. */
export function isNeverExempt(path, mode) {
  if (mode === '120000') return true;
  if (path.toLowerCase().endsWith('.spec.md')) return true;
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return true;
  return segments.some((s) => s.toLowerCase() === '.context-index');
}

const REGULAR_FILE_MODES = new Set(['100644', '100755']);
// Blob ids are recomputed in-process as SHA-1, so a SHA-256 repository's ids
// never match and its mirrors are never exempt.
const SHA1_RE = /^[0-9a-f]{40}$/;

function gitBlobSha1(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

// `path`'s mode and blob id in `baseSha`'s tree, or null when absent or not a blob.
function blobAtBase(projectRoot, baseSha, path) {
  const out = execFileSync(
    'git',
    ['--literal-pathspecs', 'ls-tree', '-z', `${baseSha}^{tree}`, '--', path],
    { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  for (const entry of out.split('\0')) {
    const tab = entry.indexOf('\t');
    if (tab === -1 || entry.slice(tab + 1) !== path) continue;
    const [mode, type, dst_sha] = entry.slice(0, tab).split(' ');
    return type === 'blob' ? { mode, dst_sha } : null;
  }
  return null;
}

/**
 * Whether an undeclared touched record is a provider mirror the sync script
 * regenerated from a canonical skill file in the task's own scope, so it may
 * stay inside a `lite` task without tripping scope-mismatch. This exemption is
 * the scope-mismatch check's only; the sensitive-path and boundary legs see
 * the mirror path like any other.
 *
 * Exempt only when all hold:
 *   - the record is `A`, `M` or `D` (a type change is never a regeneration);
 *     none of isTripwireExempt()'s never-exempt shapes applies; and its mode
 *     (`src_mode` for a `D` record) is a regular file, never a symlink
 *     (`120000`) or gitlink;
 *   - canonicalForMirror() maps the path to `skills/<rest>`, so `<p>` is a
 *     provider the sync handles and the sync writes that path at all (never
 *     `agents/`, a nested SKILL.md or an `adev-*` skill);
 *   - `skills/<rest>` is declared or touched;
 *   - for a `D` record: `skills/<rest>` was deleted too (the sync never deletes
 *     a mirror, and a mirror cannot be regenerated from a missing file);
 *   - otherwise the mode matches: the sync gives every mirror it writes its
 *     canonical file's executable bit, so the record's `mode` must equal the
 *     canonical file's mode as the diff sees it (its touched record's `mode`,
 *     or its entry in `baseSha` when untouched), for `A` and `M` alike;
 *   - and the content matches: the canonical file is read from the working
 *     tree, and its blob id must equal the one the diff saw (its touched
 *     record's `dst_sha`, or its entry in `baseSha` when untouched), so the
 *     generator runs on the state the diff compares; the blob id of
 *     `generate(path, canonicalBytes)` must equal the mirror's `dst_sha`.
 *
 * Fails closed: a throwing generator, a missing, unreadable, symlinked or
 * since-changed canonical file, a git error, or a non-SHA-1 object id means
 * not exempt.
 *
 * @param {{ path: string, status: string, mode: string, src_mode: string, dst_sha: string }} record
 * @param {{ declared: Set<string>, touched: Map<string, { status: string, mode: string, dst_sha: string }>,
 *   projectRoot: string, baseSha: string,
 *   generate?: (mirrorPath: string, canonicalBytes: Buffer) => Buffer }} ctx
 * @returns {boolean}
 */
export function isRegeneratedProviderMirror(record, { declared, touched, projectRoot, baseSha, generate = generateMirrorBytes }) {
  const { path, status } = record;
  if (status !== 'A' && status !== 'M' && status !== 'D') return false;
  const mode = status === 'D' ? record.src_mode : record.mode;
  if (isNeverExempt(path, mode) || !REGULAR_FILE_MODES.has(mode)) return false;
  const source = canonicalForMirror(path);
  if (!source) return false;
  const touchedCanonical = touched.get(source.canonicalPath);
  if (!declared.has(source.canonicalPath) && !touchedCanonical) return false;
  if (status === 'D') return touchedCanonical?.status === 'D';
  if (!SHA1_RE.test(record.dst_sha ?? '')) return false;
  if (touchedCanonical && touchedCanonical.status !== 'A' && touchedCanonical.status !== 'M') return false;
  try {
    const canonical = touchedCanonical ?? blobAtBase(projectRoot, baseSha, source.canonicalPath);
    if (!canonical || !REGULAR_FILE_MODES.has(canonical.mode) || !SHA1_RE.test(canonical.dst_sha ?? '')) return false;
    if (record.mode !== canonical.mode) return false;
    const { bytes } = readCanonicalForMirror(projectRoot, path);
    if (gitBlobSha1(bytes) !== canonical.dst_sha) return false;
    const expected = generate(path, bytes);
    return Buffer.isBuffer(expected) && gitBlobSha1(expected) === record.dst_sha;
  } catch {
    return false;
  }
}

// Some filesystems store mtimes at 1–2 s granularity (FAT/exFAT: 2 s; older
// ext3/HFS+: 1 s), so a file written just after `sinceMs` can carry an mtime
// just before it. The cut-off is widened by this much so that error falls on
// the side of escalation, never on a missed write.
const IGNORED_MTIME_SLACK_MS = 2000;

/**
 * Gitignored untracked files whose `lstat` mtime is at or after
 * `sinceMs - IGNORED_MTIME_SLACK_MS`.
 * Such files can never enter the task's commit, so computeTouchedFiles()
 * never sees them; the tripwire's sensitive-path and boundary legs still
 * need them, because a task can write a secret into an ignored file.
 *
 * A `sinceMs` of null keeps every entry: with no recorded start time old
 * files cannot be told from new ones, and the safe error is escalation.
 * `filter` runs before `lstat`, so large ignored trees (`node_modules/`) are
 * listed but not stat'ed file by file. A file that vanishes between the
 * listing and its `lstat` is skipped.
 *
 * @param {string} projectRoot
 * @param {number|null} sinceMs - ms epoch
 * @param {{ filter?: (path: string) => boolean }} [options]
 * @returns {string[]} repo-relative paths, in git's order
 */
export function listIgnoredWrittenSince(projectRoot, sinceMs, { filter } = {}) {
  const listed = execFileSync('git', ['ls-files', '-z', '--others', '--ignored', '--exclude-standard'], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split('\0')
    .filter((p) => p !== '');

  const kept = [];
  for (const p of listed) {
    if (typeof filter === 'function' && !filter(p)) continue;
    if (sinceMs == null) {
      kept.push(p);
      continue;
    }
    let mtimeMs;
    try {
      ({ mtimeMs } = lstatSync(join(projectRoot, p)));
    } catch {
      continue;
    }
    if (mtimeMs >= sinceMs - IGNORED_MTIME_SLACK_MS) kept.push(p);
  }
  return kept;
}

/**
 * Output Contract K: excludes exactly one record from the touched-path
 * floor legs — a status-`M` (not A, not D) touch to the CURRENT task's
 * own spec's lifecycle log at `.context-index/lifecycle-state/<slug>.jsonl`,
 * which the orchestrator itself appends to during every task. Nothing wider:
 * other specs' logs and other statuses on this spec's own log both remain in
 * scope. A missing/unparseable `spec.specPath` disables the exclusion
 * entirely (nothing to derive a slug from).
 *
 * @param {{ path: string, status: string }[]} records
 * @param {object} spec
 * @returns {{ path: string, status: string }[]}
 */
function excludeOwnLifecycleLogTouch(records, spec) {
  if (!spec?.specPath) return records;

  let ownLogPath;
  try {
    ownLogPath = `.context-index/lifecycle-state/${slugFromSpec(spec.specPath)}.jsonl`;
  } catch {
    return records;
  }

  let excluded = false;
  return records.filter((r) => {
    if (!excluded && r.status === 'M' && r.path === ownLogPath) {
      excluded = true;
      return false;
    }
    return true;
  });
}

// The legs the lite cap lowers to `quick`; any other holding leg gives `full`.
const LITE_CAP_LEGS = new Set(['boundary', 'sensitive-path']);

/**
 * Floor pass. Applied after the baseline, escalating only: any holding leg
 * forces `depth: 'full'`, except under `liteCap` (lite authorized for the run
 * and a spec that is not high-risk, or a lite task's tripwire), where a floor
 * whose every holding leg is in LITE_CAP_LEGS gives at least `quick` instead,
 * and `floor_cap` is `quick` when that lowered the result.
 *
 *   - `risk-level`: the spec is high-risk and the task is not routed
 *     `auto-agent` (a missing routing entry is not `auto-agent`).
 *   - `routing`: the task is routed `human-only`.
 *   - `boundary` / `sensitive-path`: the declared paths on both passes; on the
 *     final pass also every touched path from computeTouchedFiles(), after
 *     the Output-Contract-K exclusion. The touched-path `boundary` check runs
 *     only when the caller injects `boundaryCheck`, so this module never reads
 *     boundaries.yaml itself.
 *   - `critical-finding`: final pass only.
 *
 * The final pass always needs `baseSha` (throws `MISSING_DIFF_RANGE`), since
 * the touched-path legs cannot be evaluated without a diff range.
 *
 * With `includeIgnored` (the lite tripwire only), the touched-path
 * `boundary` and `sensitive-path` legs also see listIgnoredWrittenSince()
 * paths since `inProgressAt`, pre-filtered to those either leg could match.
 * The returned `touchedRecords` are the computeTouchedFiles() records after
 * the Output-Contract-K exclusion; ignored paths are never among them.
 *
 * @param {object} input
 * @returns {{ depth: string, floor_applied: boolean, floor_legs: string[], floor_cap: string|null,
 *   warnings: object[], touchedRecords: { path: string, status: string, mode: string, src_mode: string }[] }}
 */
function resolveFloor({
  depth,
  spec,
  task,
  routingEntry,
  boundaryCrossing,
  boundaryCheck,
  targetPaths,
  sensitivePaths,
  pass,
  baseSha,
  projectRoot,
  includeIgnored = false,
  inProgressAt = null,
  liteCap = false,
}) {
  let touchedRecords = [];
  if (pass === 'final') {
    if (!baseSha) {
      throw codedError('MISSING_DIFF_RANGE', 'the final pass requires a baseSha to compute touched files');
    }
    touchedRecords = excludeOwnLifecycleLogTouch(computeTouchedFiles(projectRoot, baseSha), spec);
  }

  const effective = effectiveSensitivePaths(sensitivePaths ?? []);
  const isSensitive = (p) => effective.some((pattern) => matchGlob(pattern, p));
  const anySensitive = (paths) => paths.some(isSensitive);
  const hasBoundaryCheck = typeof boundaryCheck === 'function';

  let touchedPaths = touchedRecords.map((r) => r.path);
  if (pass === 'final' && includeIgnored) {
    const ignored = listIgnoredWrittenSince(projectRoot, inProgressAt, {
      filter: (p) => isSensitive(p) || (hasBoundaryCheck && boundaryCheck([p]) === true),
    });
    touchedPaths = [...touchedPaths, ...ignored];
  }
  const touchedCrossesBoundary = touchedPaths.length > 0 && hasBoundaryCheck && boundaryCheck(touchedPaths) === true;
  const selectedAgent = routingEntry?.selected_agent;

  const legs = [];
  if (spec?.risk_level === 'high' && selectedAgent !== 'auto-agent') legs.push('risk-level');
  if (selectedAgent === 'human-only') legs.push('routing');
  if (boundaryCrossing || touchedCrossesBoundary) legs.push('boundary');
  if (anySensitive(targetPaths ?? []) || anySensitive(touchedPaths)) legs.push('sensitive-path');
  if (pass === 'final' && task?.had_critical_finding === true) legs.push('critical-finding');

  const floor_applied = legs.length > 0;
  const capped = floor_applied && liteCap && legs.every((leg) => LITE_CAP_LEGS.has(leg));
  let finalDepth = depth;
  if (floor_applied) finalDepth = capped && depth !== 'full' ? 'quick' : 'full';
  const floor_cap = capped && finalDepth === 'quick' ? 'quick' : null;

  // A REVIEW_DEPTH_FLOOR_APPLIED warning is emitted whenever any evaluated
  // floor leg held, whether or not the floor changed the resolved value
  // (floor visibility must be unconditional).
  const warnings = floor_applied
    ? [{ code: 'REVIEW_DEPTH_FLOOR_APPLIED', message: `review depth floored to ${finalDepth} (${legs.join(', ')})`, legs }]
    : [];

  return { depth: finalDepth, floor_applied, floor_legs: legs, floor_cap, warnings, touchedRecords };
}

/**
 * The final-pass tripwire for a task whose provisional pass resolved `lite`.
 * It never re-evaluates the grant; it only escalates:
 *   1. the floor, under the lite cap, over every touched path after the
 *      Output-Contract-K exclusion, plus gitignored paths written since
 *      `inProgressAt` for the `boundary` and `sensitive-path` legs: when
 *      those are the only holding legs the task goes to `quick`, and any
 *      other holding leg gives `full`. Provider mirrors are floor-evaluated
 *      like every other path;
 *   2. otherwise `scope-mismatch`: a touched (never ignored) path that is
 *      not declared, not isTripwireExempt() and not
 *      isRegeneratedProviderMirror() gives `quick`;
 *   3. otherwise the task stays `lite`.
 *
 * @returns {{ depth: string, source: string, floor_applied: boolean, floor_legs: string[],
 *   warnings: object[], escalated_from: string|null, floor_cap: string|null }}
 */
function liteTripwire({ mirrorGenerator, ...floorInput }) {
  const { task, targetPaths, projectRoot, baseSha } = floorInput;
  const floor = resolveFloor({ ...floorInput, depth: 'lite', includeIgnored: true, liteCap: true });

  let depth = floor.depth;
  let legs = floor.floor_legs;
  if (!floor.floor_applied) {
    const declared = new Set(Array.isArray(task?.declared_files) ? task.declared_files : (targetPaths ?? []));
    const mirrorCtx = {
      declared,
      touched: new Map(floor.touchedRecords.map((r) => [r.path, r])),
      projectRoot,
      baseSha,
      generate: mirrorGenerator,
    };
    const mismatch = floor.touchedRecords.some(
      (r) =>
        !declared.has(r.path) &&
        !isTripwireExempt(r.path, r.status === 'D' ? r.src_mode : r.mode) &&
        !isRegeneratedProviderMirror(r, mirrorCtx),
    );
    if (!mismatch) {
      return {
        depth: 'lite', source: 'lite-grant', floor_applied: false, floor_legs: [], warnings: [], escalated_from: null, floor_cap: null,
      };
    }
    depth = 'quick';
    legs = ['scope-mismatch'];
  }

  const taskId = task?.id ?? null;
  return {
    depth,
    source: 'lite-tripwire',
    floor_applied: true,
    floor_legs: legs,
    warnings: [
      ...floor.warnings,
      {
        code: 'LITE_TRIPWIRE_ESCALATED',
        message: `lite task ${taskId} escalated to ${depth} (${legs.join(', ')})`,
        task_id: taskId,
        legs,
      },
    ],
    escalated_from: 'lite',
    floor_cap: floor.floor_cap,
  };
}

/**
 * The baseline depth before the floor. An explicit `--tier quick` is the run's
 * baseline and outranks the policy. `--tier lite` only authorizes the lite
 * grant, so it reads the policy exactly as no `--tier` does. A policy `lite`
 * is a `quick` baseline here, because only the lite grant resolves a task
 * `lite`.
 *
 * @param {string|null|undefined} tierFlag - already validated; never `full`
 * @param {object} [policies]
 * @param {string} riskLevel
 * @returns {{ depth: string, source: string }}
 */
function resolveBaseline(tierFlag, policies, riskLevel) {
  if (tierFlag === 'quick') return { depth: 'quick', source: 'policy-baseline' };

  const value = policies?.[riskLevel]?.implement_mode;
  if (value == null) return { depth: 'quick', source: 'default-quick' };
  // loadRigorPolicies validates on load; a caller passing an unvalidated map
  // must not have a typo read as a lighter review.
  if (!isValidTier(value)) throw new InvalidTierError(value, { level: riskLevel, field: 'implement_mode' });
  return { depth: value === 'lite' ? 'quick' : value, source: 'policy-baseline' };
}

/**
 * Resolves the review depth for a single /adev:implement task: tier-full
 * absolute check, then the baseline, then the floor pass, then (provisional
 * pass only) the lite grant. Not pure on the final pass — it shells out to
 * `git` via `computeTouchedFiles`.
 *
 * The floor runs under the lite cap on both passes whenever lite is
 * authorized (`lite_source` non-null) and the spec is not high-risk, so an
 * authorized task denied `floor:boundary` or `floor:sensitive-path` resolves
 * `quick` with `floor_cap: 'quick'`.
 *
 * Lite authorization is `liteFlag` or `tierFlag: 'lite'` (lite_source
 * `flag`), or, with no `--tier`, a policy `implement_mode: lite` for the
 * spec's risk level (lite_source `policy`). An explicit `--tier quick` or
 * `--tier full` is the per-run opt-out and authorizes nothing, `--lite`
 * included.
 *
 * `lite_source` depends only on the inputs, so it is reported on both passes.
 * The grant is a provisional-pass decision, and `lite_denied` is meaningful
 * only there (it is null on the final pass, where the grant is not
 * evaluated). The final pass is keyed on `provisionalDepth`, the task's
 * recorded provisional resolution: `'lite'` runs liteTripwire(), whatever the
 * final call's `liteFlag`/`tierFlag`/`parallel` say (only `--tier full`
 * returns before it, and that only raises the depth); any other value takes
 * the baseline-and-floor path, which never resolves `lite`.
 *
 * `MISSING_DIFF_RANGE` is thrown by the floor, so it applies only once the
 * floor is consulted: `--tier full` returns before the check and needs no
 * `baseSha` on the final pass.
 *
 * @param {object} input
 * @param {object} [input.spec] - Spec frontmatter (`risk_level` drives the policy lookup, the risk-level leg and grant condition (c); `specPath` drives the own-lifecycle-log exclusion).
 * @param {object} [input.task] - The plan task (`had_critical_finding` feeds the critical-finding leg; `in_batch` and `additive_only` are ignored).
 * @param {object} [input.routingEntry] - This task's `.routing.json` entry (`selected_agent` feeds the risk-level and routing legs and liteEligible(); `scores` are not read).
 * @param {string} [input.tierFlag] - Explicit `--tier full|quick|lite`, if given.
 * @param {boolean} [input.liteFlag=false] - `--lite`: operator authorization for the lite grant.
 * @param {boolean} [input.parallel=false] - The run is `--parallel`, which denies the lite grant.
 * @param {string|null} [input.liteUnavailable=null] - Provisional pass: a `lite_denied` reason (e.g. `no-routing-entry` when the routing sidecar is not committed at run_base) that denies an authorized grant right after condition (a), without reading the routing entry.
 * @param {object} [input.policies] - `risk-policies.yaml` `policies` map.
 * @param {boolean} [input.boundaryCrossing=false] - Whether the declared paths cross a `boundaries.yaml` rule.
 * @param {(paths: string[]) => boolean} [input.boundaryCheck] - Final pass: whether the touched paths cross a `boundaries.yaml` rule. When absent, the touched-path boundary check is skipped.
 * @param {string[]} [input.targetPaths] - Declared task paths for the sensitive-path leg; may be empty/absent.
 * @param {string[]} [input.sensitivePaths] - Configured sensitive-path extensions (unioned with the built-in set).
 * @param {string} [input.pass] - `'final'` adds the touched-path legs and the critical-finding leg, and skips the lite grant.
 * @param {string} [input.baseSha] - Required on the final pass unless `--tier full`: the diff range for touched files.
 * @param {string} [input.projectRoot] - Working tree root for the final pass's git calls.
 * @param {string|null} [input.provisionalDepth=null] - Final pass: the task's recorded provisional depth (`lite|quick|full`); `'lite'` runs the tripwire.
 * @param {number|null} [input.inProgressAt=null] - Final pass, tripwire only: ms epoch of the task's latest `plan_task` `in_progress`; gitignored files with an mtime at or after it (less listIgnoredWrittenSince()'s coarse-mtime slack) feed the sensitive-path and boundary legs. Null counts every ignored file.
 * @param {(mirrorPath: string, canonicalBytes: Buffer) => Buffer} [input.mirrorGenerator] - Final pass, tripwire only: the bytes the sync would write to a provider mirror from its canonical file's bytes; defaults to generateMirrorBytes(), the sync script's own transform. A test seam: callers outside tests omit it.
 * @returns {{ depth: string, source: string, floor_applied: boolean, floor_legs: string[], warnings: object[],
 *   lite_denied: string|null, lite_source: string|null, escalated_from: string|null, floor_cap: string|null }}
 */
export function resolveImplementReviewDepth({
  spec,
  task,
  routingEntry,
  tierFlag,
  liteFlag = false,
  parallel = false,
  policies,
  boundaryCrossing = false,
  boundaryCheck,
  targetPaths,
  sensitivePaths,
  pass,
  baseSha,
  projectRoot,
  provisionalDepth = null,
  inProgressAt = null,
  liteUnavailable = null,
  mirrorGenerator,
} = {}) {
  const hasTier = tierFlag != null && tierFlag !== '';
  if (hasTier && !isValidTier(tierFlag)) throw new InvalidTierError(tierFlag);
  const isFinal = pass === 'final';
  const riskLevel = spec?.risk_level ?? 'medium';

  let lite_source = null;
  if (tierFlag !== 'quick' && tierFlag !== 'full') {
    if (liteFlag === true || tierFlag === 'lite') lite_source = 'flag';
    else if (policies?.[riskLevel]?.implement_mode === 'lite') lite_source = 'policy';
  }

  if (tierFlag === 'full') {
    return {
      depth: 'full', source: 'tier-full-absolute', floor_applied: false, floor_legs: [], warnings: [],
      lite_denied: isFinal ? null : 'not-authorized', lite_source, escalated_from: null, floor_cap: null,
    };
  }

  const floorInput = {
    spec,
    task,
    routingEntry,
    boundaryCrossing,
    boundaryCheck,
    targetPaths,
    sensitivePaths,
    pass,
    baseSha,
    projectRoot,
    inProgressAt,
  };

  if (isFinal && provisionalDepth === 'lite') {
    return { ...liteTripwire({ ...floorInput, mirrorGenerator }), lite_denied: null, lite_source };
  }

  const { depth, source } = resolveBaseline(tierFlag, policies, riskLevel);

  const liteCap = lite_source !== null && riskLevel !== 'high';
  const floorResult = resolveFloor({ ...floorInput, depth, liteCap });
  const resolved = {
    depth: floorResult.depth,
    source,
    floor_applied: floorResult.floor_applied,
    floor_legs: floorResult.floor_legs,
    warnings: floorResult.warnings,
  };
  if (isFinal) return { ...resolved, lite_denied: null, lite_source, escalated_from: null, floor_cap: floorResult.floor_cap };

  const grant = liteGrant({
    authorized: lite_source !== null,
    routingEntry,
    riskLevel,
    provisionalLegs: floorResult.floor_legs,
    parallel,
    liteUnavailable,
  });
  if (grant.granted) {
    return {
      depth: 'lite', source: 'lite-grant', floor_applied: false, floor_legs: [], warnings: grant.warnings,
      lite_denied: null, lite_source, escalated_from: null, floor_cap: null,
    };
  }
  return {
    ...resolved,
    warnings: [...grant.warnings, ...resolved.warnings],
    lite_denied: grant.lite_denied,
    lite_source,
    escalated_from: null,
    floor_cap: floorResult.floor_cap,
  };
}
