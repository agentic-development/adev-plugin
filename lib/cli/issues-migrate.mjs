/**
 * `adev issues migrate` — convert the issue board between backends.
 *
 * Spec: .context-index/specs/features/task-management/backend-migration.spec.md
 * Plan: .context-index/specs/features/task-management/backend-migration.plan.md
 *
 * Contract (new-pattern CLI helper):
 *   - exports `run({ projectRoot, argv, manifest })` returning a numeric exit code
 *   - exports `help()` printing usage to stdout
 *
 * Plan-task 3 lands argument parsing + environment validation. Subsequent
 * tasks fill in source-read, dry-run, live loop, dependency replay, and
 * report/cleanup.
 *
 * Uses only Node.js built-ins.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";

import { SUPPORTED_BACKENDS, DEFAULT_BACKEND, getIssueManager } from "../issues/registry.mjs";

const READONLY_BACKENDS = new Set(["file"]);
const BEADS_MAP_REL = join(".context-index", "tasks", ".beads-map.json");
const MIGRATE_STATE_REL = join(".context-index", "tasks", ".migrate-state.json");

/**
 * Schema for `.context-index/tasks/.migrate-state.json` (SA-1 inline reference):
 *
 *   {
 *     "source": "<backend-name>",
 *     "target": "<backend-name>",
 *     "last_successful_index": <integer 0-N>,
 *     "scope_args": { "includeClosed": <boolean> }
 *   }
 *
 * Written via atomic temp-rename after each successful target adapter call
 * (per-item granularity per SA-2 — see plan task 6). On successful run
 * completion, the file is removed by the verb's run() (plan task 8).
 */

/**
 * Atomic write via temp-rename, mirroring `lib/build-state.mjs::atomicWriteJson`.
 * Used for `.migrate-state.json` (SA-2 per-item state file).
 *
 * @param {string} filePath
 * @param {object} data
 */
function atomicWriteJson(filePath, data) {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = filePath + "." + randomBytes(4).toString("hex") + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Best-effort removal of a path. Tolerates ENOENT.
 * @param {string} p
 */
function safeUnlink(p) {
  try {
    unlinkSync(p);
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      // Surface non-ENOENT errors so operator sees them, but don't throw —
      // cleanup is best-effort.
      console.error(`warning: failed to remove ${p}: ${err.message}`);
    }
  }
}

/**
 * Read the .beads-map.json file at the canonical path. Returns an empty
 * object on absence or parse failure (the file is local recoverable state).
 *
 * @param {string} projectRoot
 * @returns {object} map keyed by source issue id
 */
function readBeadsMap(projectRoot) {
  const p = join(projectRoot, BEADS_MAP_REL);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Build a synthetic manifest object that overrides `tasks.backend` to the
 * supplied source value. Used to drive `getIssueManager()` against the
 * source backend without mutating the caller's manifest.
 *
 * @param {object|null} manifest
 * @param {string} source
 * @returns {object}
 */
function overrideManifestBackend(manifest, source) {
  const base = manifest && typeof manifest === "object" ? manifest : {};
  const tasks = (base.tasks && typeof base.tasks === "object") ? base.tasks : {};
  return { ...base, tasks: { ...tasks, backend: source } };
}

/**
 * Read items and epics from the source backend, applying the scope filter.
 *
 * @param {object} args
 * @param {string} args.projectRoot - Absolute project root
 * @param {string} args.source - Source backend name (json|file|beads)
 * @param {boolean} args.includeClosed - When true, retain closed items
 * @param {object|null} args.manifest - Loaded manifest (passed through to adapter)
 * @returns {Promise<{ adapter: object, issues: object[], epics: object[] }>}
 * @throws {Error} with code MIGRATE_SOURCE_INVALID on adapter parse failures
 */
export async function readSource({ projectRoot, source, includeClosed, manifest }) {
  const overridden = overrideManifestBackend(manifest, source);
  let adapter;
  try {
    adapter = getIssueManager(overridden, projectRoot);
  } catch (err) {
    const out = new Error(
      `MIGRATE_SOURCE_INVALID: failed to construct ${source} adapter at ` +
        `${projectRoot}: ${err.message}`,
    );
    out.code = "MIGRATE_SOURCE_INVALID";
    out.cause = err;
    throw out;
  }

  let issues;
  let epics;
  try {
    issues = await adapter.list({});
    epics = await adapter.listEpics({});
  } catch (err) {
    // Bubble adapter parse errors with a path-aware MIGRATE_SOURCE_INVALID
    // message. The adapter's own error.message typically includes the
    // offending file (e.g., MALFORMED_BOARD on tasks.json).
    const out = new Error(
      `MIGRATE_SOURCE_INVALID: failed to read ${source} source at ` +
        `${projectRoot}: ${err.message}`,
    );
    out.code = "MIGRATE_SOURCE_INVALID";
    out.cause = err;
    throw out;
  }

  if (!includeClosed) {
    issues = issues.filter((i) => i.status !== "closed");
    epics = epics.filter((e) => e.status !== "closed");
  }

  return { adapter, issues, epics };
}

/**
 * Read items + epics from the TARGET backend for dry-run idempotency
 * counting (Behavior 11/15). Returns empty arrays on adapter construction
 * failure — a fresh target board is the expected state.
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {string} args.target - Target backend name
 * @param {object|null} args.manifest
 * @returns {Promise<{ issues: object[], epics: object[] }>}
 */
async function readTarget({ projectRoot, target, manifest }) {
  const overridden = overrideManifestBackend(manifest, target);
  let adapter;
  try {
    adapter = getIssueManager(overridden, projectRoot);
  } catch {
    return { issues: [], epics: [] };
  }
  let issues = [];
  let epics = [];
  try {
    issues = await adapter.list({});
  } catch {
    /* empty target — fresh board */
  }
  try {
    epics = await adapter.listEpics({});
  } catch {
    /* empty target — fresh board */
  }
  return { issues, epics };
}

/**
 * Count items already migrated to the target backend.
 *
 * For json → beads: every source issue whose id appears in `.beads-map.json`
 * is considered already migrated.
 *
 * For beads → json: every source issue that has a target item matching
 * `(title, spec_ref)` — or whose source id appears in a target item's
 * `notes` metadata under the `original_id` marker — is considered already
 * migrated.
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {string} args.source
 * @param {string} args.target
 * @param {object[]} args.sourceIssues
 * @param {object[]} args.sourceEpics
 * @param {object[]} args.targetIssues
 * @param {object[]} args.targetEpics
 * @returns {{ issues: number, epics: number, sourceIssueIds: Set<string>, sourceEpicIds: Set<string> }}
 *   The returned Sets carry the SOURCE ids that were detected as already
 *   migrated — useful for live-loop idempotency in subsequent tasks.
 */
export function computeAlreadyMigrated({
  projectRoot,
  source,
  target,
  sourceIssues,
  sourceEpics,
  targetIssues,
  targetEpics,
}) {
  const sourceIssueIds = new Set();
  const sourceEpicIds = new Set();

  if (source === "json" && target === "beads") {
    const map = readBeadsMap(projectRoot);
    for (const issue of sourceIssues) {
      if (map[issue.id]) sourceIssueIds.add(issue.id);
    }
    // Epics live in the file adapter on the beads side; a re-run finds
    // matches by title (epics don't have spec_ref). We use exact title.
    const epicTitles = new Set((targetEpics || []).map((e) => e.title));
    for (const epic of sourceEpics) {
      if (epicTitles.has(epic.title)) sourceEpicIds.add(epic.id);
    }
  } else if (source === "beads" && target === "json") {
    // Build a target index keyed by (title || spec_ref). Empty spec_ref is
    // matched as empty string for symmetry.
    const targetIndex = new Map();
    for (const t of targetIssues) {
      const key = `${t.title}||${t.spec_ref || ""}`;
      targetIndex.set(key, t);
    }
    // Also build an original_id index from target notes (back-compat).
    const originalIdIndex = new Map();
    const ORIGINAL_RE = /original_id:\s*(\S+)/;
    for (const t of targetIssues) {
      const m = ORIGINAL_RE.exec(t.notes || "");
      if (m) originalIdIndex.set(m[1], t);
    }
    for (const issue of sourceIssues) {
      const key = `${issue.title}||${issue.spec_ref || ""}`;
      if (targetIndex.has(key)) {
        sourceIssueIds.add(issue.id);
      } else if (originalIdIndex.has(issue.id)) {
        sourceIssueIds.add(issue.id);
      }
    }
    const epicTitles = new Set((targetEpics || []).map((e) => e.title));
    for (const epic of sourceEpics) {
      if (epicTitles.has(epic.title)) sourceEpicIds.add(epic.id);
    }
  }
  // Other direction pairs (file→x, x→file) are blocked earlier by
  // MIGRATE_TARGET_READONLY / MIGRATE_UNKNOWN_BACKEND.

  return {
    issues: sourceIssueIds.size,
    epics: sourceEpicIds.size,
    sourceIssueIds,
    sourceEpicIds,
  };
}

/**
 * Count in-scope dependency edges. An edge is in-scope when both its source
 * issue AND its target issue are in the source-issue set.
 *
 * @param {object[]} sourceIssues
 * @returns {{ total: number, edges: Array<{ from: string, to: string }> }}
 */
export function computeInScopeEdges(sourceIssues) {
  const inScope = new Set(sourceIssues.map((i) => i.id));
  const edges = [];
  for (const issue of sourceIssues) {
    for (const dep of issue.dependencies || []) {
      if (inScope.has(dep)) {
        edges.push({ from: issue.id, to: dep });
      }
    }
  }
  return { total: edges.length, edges };
}

/**
 * Read and validate `.context-index/tasks/.migrate-state.json`. Returns
 * `{ startIndex }` where `startIndex` is either 0 (no resume) or
 * `last_successful_index + 1` (resume from next item).
 *
 * Per Procedure Step 2, when the state file exists and its `source` or
 * `target` does not match the current invocation, throws
 * `MIGRATE_RESUME_MISMATCH` so the operator must reconcile manually before
 * a new migration begins.
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {string} args.source
 * @param {string} args.target
 * @param {object} [args.scopeArgs]
 * @returns {{ startIndex: number, resumed: boolean }}
 */
export function loadResumeState({ projectRoot, source, target, scopeArgs }) {
  const path = join(projectRoot, MIGRATE_STATE_REL);
  if (!existsSync(path)) return { startIndex: 0, resumed: false };

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    const out = new Error(
      `MIGRATE_RESUME_INVALID: failed to parse ${path}: ${err.message}. ` +
        "Delete the file or fix it manually before retrying.",
    );
    out.code = "MIGRATE_RESUME_INVALID";
    throw out;
  }

  if (parsed.source !== source || parsed.target !== target) {
    const out = new Error(
      `MIGRATE_RESUME_MISMATCH: ${path} records a different migration ` +
        `(source='${parsed.source}', target='${parsed.target}') than the current ` +
        `invocation (source='${source}', target='${target}'). ` +
        "Delete the state file or re-run with matching arguments before resuming.",
    );
    out.code = "MIGRATE_RESUME_MISMATCH";
    throw out;
  }

  // Optional scope_args match: warn if differs but don't refuse — the
  // scope only affects which items are in the iteration order; the
  // last_successful_index is still a valid offset into the new order if
  // operators understand the trade-off.
  if (
    scopeArgs &&
    parsed.scope_args &&
    parsed.scope_args.includeClosed !== scopeArgs.includeClosed
  ) {
    console.error(
      `warning: resume state recorded includeClosed=${parsed.scope_args.includeClosed} ` +
        `but current invocation uses includeClosed=${scopeArgs.includeClosed}. ` +
        "Resume offset may not align with the new scope; consider deleting the state file.",
    );
  }

  const lastIdx = Number.isInteger(parsed.last_successful_index)
    ? parsed.last_successful_index
    : -1;
  return { startIndex: lastIdx + 1, resumed: true };
}

/**
 * Write the per-item state file atomically.
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {string} args.source
 * @param {string} args.target
 * @param {number} args.lastSuccessfulIndex
 * @param {object} args.scopeArgs
 */
function writeMigrateState({ projectRoot, source, target, lastSuccessfulIndex, scopeArgs }) {
  const path = join(projectRoot, MIGRATE_STATE_REL);
  atomicWriteJson(path, {
    source,
    target,
    last_successful_index: lastSuccessfulIndex,
    scope_args: scopeArgs,
  });
}

/**
 * Remove the per-item state file. Best-effort — tolerates ENOENT.
 *
 * @param {string} projectRoot
 */
export function clearMigrateState(projectRoot) {
  safeUnlink(join(projectRoot, MIGRATE_STATE_REL));
}

/**
 * Strip the source `id` field from the issue payload before handing it to
 * the target adapter's `create()`. The target adapter assigns its own ids;
 * preserving the source id would either be ignored (json adapter) or
 * cause confusion. All other fields (title, type, priority, notes, epicId,
 * parent_id, planRef, spec_ref, next_action) pass through verbatim per
 * Behaviors 9-10.
 *
 * Dependencies are stripped here too — they are replayed via addDependency
 * after the create loop (Procedure Step 6).
 *
 * @param {object} src
 * @returns {object}
 */
function projectIssueForCreate(src) {
  const { id, dependencies, created, updated, ...rest } = src;
  return rest;
}

function projectEpicForCreate(src) {
  const { id, created, updated, ...rest } = src;
  return rest;
}

/**
 * Run the live migration loop for issues and epics.
 *
 * Iterates `sourceIssues` starting at `startIndex`. For each item not in
 * `alreadyMigratedIssueIds`, calls `targetAdapter.create()`. On success,
 * atomically updates `.migrate-state.json` with the new
 * `last_successful_index`. On adapter failure, writes the final state and
 * throws `MIGRATE_PARTIAL_FAILURE` with the underlying adapter stderr
 * verbatim (SEC-1).
 *
 * Epics are migrated AFTER issues. Per Behavior 9/10 epics use
 * `createEpic()`.
 *
 * @param {object} args
 * @returns {Promise<{ created: { issues: number, epics: number }, skipped: number, lastSuccessfulIndex: number, errors: object[] }>}
 */
export async function runLiveMigration({
  projectRoot,
  source,
  target,
  sourceAdapter,
  targetAdapter,
  sourceIssues,
  sourceEpics,
  alreadyMigratedIssueIds,
  alreadyMigratedEpicIds,
  startIndex = 0,
  scopeArgs = { includeClosed: false },
}) {
  const created = { issues: 0, epics: 0 };
  let skipped = 0;
  const errors = [];
  let lastSuccessfulIndex = startIndex - 1;

  // ---- Issues loop ----
  for (let i = startIndex; i < sourceIssues.length; i++) {
    const sourceIssue = sourceIssues[i];
    if (alreadyMigratedIssueIds.has(sourceIssue.id)) {
      skipped++;
      lastSuccessfulIndex = i;
      writeMigrateState({
        projectRoot,
        source,
        target,
        lastSuccessfulIndex,
        scopeArgs,
      });
      continue;
    }

    let payload = projectIssueForCreate(sourceIssue);
    // For beads → json, stamp the original source id into notes metadata so
    // a subsequent re-run can dedupe via the `original_id` marker.
    if (source === "beads" && target === "json") {
      const notes = payload.notes || "";
      const marker = `original_id: ${sourceIssue.id}`;
      payload = {
        ...payload,
        notes: notes ? `${notes}\n\n${marker}` : marker,
      };
    }

    try {
      await targetAdapter.create(payload);
      created.issues++;
      lastSuccessfulIndex = i;
      writeMigrateState({
        projectRoot,
        source,
        target,
        lastSuccessfulIndex,
        scopeArgs,
      });
    } catch (err) {
      // Preserve adapter stderr verbatim per SEC-1 (ADR 0014).
      const stderr = (err && err.stderr) || (err && err.message) || String(err);
      const failureMessage =
        `MIGRATE_PARTIAL_FAILURE: target adapter '${target}' failed on item ` +
        `'${sourceIssue.id}' (index ${i}). Underlying error: ${stderr}`;
      // Persist final state so a subsequent run can resume from i (next index = lastSuccessfulIndex + 1).
      writeMigrateState({
        projectRoot,
        source,
        target,
        lastSuccessfulIndex,
        scopeArgs,
      });
      errors.push({ id: sourceIssue.id, index: i, stderr });
      const out = new Error(failureMessage);
      out.code = "MIGRATE_PARTIAL_FAILURE";
      out.failingItemId = sourceIssue.id;
      out.failingIndex = i;
      out.adapterStderr = stderr;
      out.errors = errors;
      out.cause = err;
      // Also emit stderr passthrough on the user's terminal at failure time
      // per SEC-1 ADR: stderr is forwarded BOTH in errors[] AND on the
      // terminal so operators see it without re-parsing the JSON report.
      console.error(stderr);
      throw out;
    }
  }

  // ---- Epics loop ----
  // Epics are not part of the index-based resume model (they are written
  // after issues complete). A failed epic create still writes state with
  // the post-issues index so resume picks up at the first epic position
  // (we encode epic state via a separate file in a future iteration if
  // needed — for now, epic failures abort with MIGRATE_PARTIAL_FAILURE).
  for (let j = 0; j < sourceEpics.length; j++) {
    const sourceEpic = sourceEpics[j];
    if (alreadyMigratedEpicIds.has(sourceEpic.id)) {
      skipped++;
      continue;
    }
    const payload = projectEpicForCreate(sourceEpic);
    try {
      await targetAdapter.createEpic(payload);
      created.epics++;
    } catch (err) {
      const stderr = (err && err.stderr) || (err && err.message) || String(err);
      const failureMessage =
        `MIGRATE_PARTIAL_FAILURE: target adapter '${target}' failed on epic ` +
        `'${sourceEpic.id}' (epic index ${j}). Underlying error: ${stderr}`;
      errors.push({ id: sourceEpic.id, index: sourceIssues.length + j, stderr });
      writeMigrateState({
        projectRoot,
        source,
        target,
        lastSuccessfulIndex,
        scopeArgs,
      });
      const out = new Error(failureMessage);
      out.code = "MIGRATE_PARTIAL_FAILURE";
      out.failingItemId = sourceEpic.id;
      out.errors = errors;
      out.cause = err;
      console.error(stderr);
      throw out;
    }
  }

  return {
    created,
    skipped,
    lastSuccessfulIndex,
    errors,
  };
}

/**
 * Replay dependency edges on the target backend (Procedure Step 6).
 *
 * For json → beads, the verb passes SOURCE ids to `BeadsAdapter.addDependency`
 * which internally maps via `.beads-map.json`. Edges whose endpoints are
 * out-of-scope (missing from `sourceIssues`) are skipped with a warning.
 *
 * For beads → json, the verb resolves each endpoint's TARGET id by
 * scanning the target adapter's `list()` for an item whose `notes` contains
 * the `original_id: <source-id>` marker. Edges whose endpoint cannot be
 * resolved on the target are skipped with a warning.
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {string} args.source
 * @param {string} args.target
 * @param {object[]} args.sourceIssues
 * @param {object} args.targetAdapter
 * @returns {Promise<{ replayed: number, skippedEdges: Array<{ from: string, to: string }> }>}
 */
export async function replayDependencies({
  projectRoot,
  source,
  target,
  sourceIssues,
  targetAdapter,
}) {
  const inScopeIds = new Set(sourceIssues.map((i) => i.id));
  const skippedEdges = [];
  let replayed = 0;

  // For beads → json, build an index from source id → target id by
  // matching `original_id` markers in target notes.
  let targetIdResolver = null;
  if (source === "beads" && target === "json") {
    let targetItems = [];
    try {
      targetItems = await targetAdapter.list();
    } catch {
      targetItems = [];
    }
    const idIndex = new Map();
    const ORIGINAL_RE = /original_id:\s*(\S+)/;
    for (const t of targetItems) {
      const m = ORIGINAL_RE.exec(t.notes || "");
      if (m) idIndex.set(m[1], t.id);
    }
    targetIdResolver = (sourceId) => idIndex.get(sourceId) || null;
  }

  // For json → beads, the adapter does the source-id-to-target-id lookup
  // internally via `.beads-map.json`. The verb passes source ids verbatim.
  const passthroughResolver = (sourceId) => sourceId;
  const resolveTargetId = targetIdResolver || passthroughResolver;

  for (const issue of sourceIssues) {
    for (const dep of issue.dependencies || []) {
      // Behavior 14: out-of-scope endpoint → warn + skip.
      if (!inScopeIds.has(dep)) {
        console.error(
          `warning: dependency edge (${issue.id} → ${dep}) skipped — ` +
            `endpoint '${dep}' is out of scope for this migration. ` +
            "Re-run with --include-closed if you want this edge migrated.",
        );
        skippedEdges.push({ from: issue.id, to: dep });
        continue;
      }

      const targetFrom = resolveTargetId(issue.id);
      const targetTo = resolveTargetId(dep);

      if (!targetFrom || !targetTo) {
        const missing = !targetFrom ? issue.id : dep;
        console.error(
          `warning: dependency edge (${issue.id} → ${dep}) skipped — ` +
            `target id resolution failed for source id '${missing}'. ` +
            "The target backend may not contain a matching item " +
            `(check ${source === "beads" ? "original_id markers" : ".beads-map.json"}).`,
        );
        skippedEdges.push({ from: issue.id, to: dep });
        continue;
      }

      try {
        await targetAdapter.addDependency(targetFrom, targetTo);
        replayed++;
      } catch (err) {
        // addDependency on both adapters is idempotent and is expected to
        // succeed once the endpoints exist. Any throw here is a real
        // failure — surface it but continue with remaining edges (dependency
        // replay is best-effort; the loop guarantee is "edges to in-scope
        // items get a chance" not "all edges land").
        console.error(
          `warning: addDependency(${targetFrom} → ${targetTo}) failed: ` +
            `${err.message}. Skipping this edge.`,
        );
        skippedEdges.push({ from: issue.id, to: dep });
      }
    }
  }

  return { replayed, skippedEdges };
}

/**
 * Build the dry-run JSON report shape (Behavior 15, Dry-Run Output Shape).
 *
 * @param {object} args
 * @returns {{ source: string, target: string, in_scope: { issues: number, epics: number }, already_migrated: number, would_create: { issues: number, epics: number }, dependencies_to_replay: number }}
 */
export function buildDryRunReport({
  source,
  target,
  sourceIssues,
  sourceEpics,
  alreadyMigrated,
  dependenciesToReplay,
}) {
  return {
    source,
    target,
    in_scope: { issues: sourceIssues.length, epics: sourceEpics.length },
    already_migrated: alreadyMigrated.issues + alreadyMigrated.epics,
    would_create: {
      issues: sourceIssues.length - alreadyMigrated.issues,
      epics: sourceEpics.length - alreadyMigrated.epics,
    },
    dependencies_to_replay: dependenciesToReplay,
  };
}

export function help() {
  console.log(
    "Usage: adev issues migrate --to <backend> [--from <backend>] " +
      "[--include-closed] [--dry-run]",
  );
  console.log("");
  console.log("Migrate the configured issue board to a different backend.");
  console.log("");
  console.log("Flags:");
  console.log(`  --to <backend>       Target backend. One of: ${SUPPORTED_BACKENDS.join(", ")}. Required.`);
  console.log("  --from <backend>     Source backend; defaults to manifest tasks.backend.");
  console.log("  --include-closed     Include closed items in scope (default excludes them).");
  console.log("  --dry-run            Print the planned actions as JSON; write nothing.");
}

/**
 * Parse the argv array supplied by the dispatcher into a structured options
 * object. Throws an error with code MIGRATE_ARG_PARSE for unrecognised flags
 * or missing flag values.
 *
 * @param {string[]} argv
 * @returns {{ to: string|null, from: string|null, includeClosed: boolean, dryRun: boolean }}
 */
export function parseArgs(argv) {
  const opts = {
    to: null,
    from: null,
    includeClosed: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--to") {
      i++;
      if (i >= argv.length) {
        const err = new Error("flag --to requires a value");
        err.code = "MIGRATE_ARG_PARSE";
        throw err;
      }
      opts.to = argv[i];
    } else if (a === "--from") {
      i++;
      if (i >= argv.length) {
        const err = new Error("flag --from requires a value");
        err.code = "MIGRATE_ARG_PARSE";
        throw err;
      }
      opts.from = argv[i];
    } else if (a === "--include-closed") {
      opts.includeClosed = true;
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--help" || a === "-h") {
      opts.help = true;
    } else if (a === "--auto") {
      // Tolerated for compatibility with other adev verbs (no behavior change
      // per Behavior 19 — the manifest is NEVER written, regardless).
      opts.auto = true;
    } else {
      const err = new Error(`unrecognized argument: ${a}`);
      err.code = "MIGRATE_ARG_PARSE";
      throw err;
    }
  }

  return opts;
}

/**
 * Resolve the source backend from --from or manifest.tasks.backend. Falls
 * back to DEFAULT_BACKEND when neither is set.
 *
 * @param {{ from: string|null }} opts
 * @param {object|null} manifest
 * @returns {string}
 */
function resolveSource(opts, manifest) {
  if (opts.from) return opts.from;
  const fromManifest = manifest && manifest.tasks && manifest.tasks.backend;
  return fromManifest || DEFAULT_BACKEND;
}

/**
 * Validate environment for the chosen target backend. Returns null on
 * success or an `{ code, message }` pair to emit.
 *
 * @param {string} target
 * @returns {Promise<{ code: string, message: string }|null>}
 */
async function validateEnvForTarget(target) {
  if (target !== "beads") return null;
  // Probe `br` lazily via BeadsAdapter so we share the canonical detection
  // path (matches Behavior 7: BEADS_NOT_AVAILABLE before any source state
  // is read).
  const { BeadsAdapter } = await import("../issues/beads-adapter.mjs");
  try {
    // checkBr: true triggers _detectBr() which throws BEADS_NOT_AVAILABLE.
    // The path passed here is never written to; the constructor only uses
    // it to compute dbPath. Use a sentinel that does not exist on disk.
    // eslint-disable-next-line no-new
    new BeadsAdapter("/tmp/issues-migrate-probe", { checkBr: true });
    return null;
  } catch (err) {
    if (err && err.code === "BEADS_NOT_AVAILABLE") {
      return {
        code: "BEADS_NOT_AVAILABLE",
        message:
          "BEADS_NOT_AVAILABLE: target backend 'beads' requires the `br` CLI on PATH. " +
          "Install from https://github.com/Dicklesworthstone/beads_rust then retry.",
      };
    }
    // Surface unexpected errors verbatim — operator-local diagnostic.
    return {
      code: "BEADS_PROBE_FAILED",
      message: `failed to probe br: ${err.message}`,
    };
  }
}

export async function run({ projectRoot, argv, manifest }) {
  let opts;
  try {
    opts = parseArgs(argv || []);
  } catch (err) {
    if (err && err.code === "MIGRATE_ARG_PARSE") {
      console.error(`MIGRATE_ARG_PARSE: ${err.message}`);
      help();
      return 1;
    }
    throw err;
  }

  if (opts.help) {
    help();
    return 0;
  }

  // Behavior 4: --to is required.
  if (!opts.to) {
    console.error(
      "MIGRATE_MISSING_TARGET: --to <backend> is required. " +
        `Supported targets: ${SUPPORTED_BACKENDS.join(", ")}`,
    );
    help();
    return 1;
  }

  // Behavior 5: --to must be a known backend. Source list from
  // SUPPORTED_BACKENDS per SEC-2 (no literal duplication).
  if (!SUPPORTED_BACKENDS.includes(opts.to)) {
    console.error(
      `MIGRATE_UNKNOWN_BACKEND: '${opts.to}' is not a supported backend. ` +
        `Supported: ${SUPPORTED_BACKENDS.join(", ")}`,
    );
    return 1;
  }

  // Behavior 6: --to file is read-only-deprecated.
  if (READONLY_BACKENDS.has(opts.to)) {
    console.error(
      `MIGRATE_TARGET_READONLY: target backend '${opts.to}' is read-only-deprecated. ` +
        "Use --to json or --to beads.",
    );
    return 1;
  }

  // Resolve source backend (--from or manifest.tasks.backend or default).
  const source = resolveSource(opts, manifest);

  // Behavior 3: source == target → MIGRATE_NOOP.
  if (source === opts.to) {
    console.error(
      `MIGRATE_NOOP: source and target backends are both '${source}'. Nothing to migrate.`,
    );
    return 1;
  }

  // The source value itself must be a known backend — if --from supplied an
  // unknown value, surface MIGRATE_UNKNOWN_BACKEND symmetrically.
  if (!SUPPORTED_BACKENDS.includes(source)) {
    console.error(
      `MIGRATE_UNKNOWN_BACKEND: source backend '${source}' is not supported. ` +
        `Supported: ${SUPPORTED_BACKENDS.join(", ")}`,
    );
    return 1;
  }

  // Behavior 7: probe target environment (br) BEFORE reading any source state.
  const envErr = await validateEnvForTarget(opts.to);
  if (envErr) {
    console.error(envErr.message);
    return 1;
  }

  // Behavior 8 + 12: read source state and apply scope filter.
  let sourceState;
  try {
    sourceState = await readSource({
      projectRoot,
      source,
      includeClosed: opts.includeClosed,
      manifest,
    });
  } catch (err) {
    if (err && err.code === "MIGRATE_SOURCE_INVALID") {
      console.error(err.message);
      return 1;
    }
    throw err;
  }

  // Read target state for idempotency counting (dry-run + live loop).
  const targetState = await readTarget({
    projectRoot,
    target: opts.to,
    manifest,
  });

  const alreadyMigrated = computeAlreadyMigrated({
    projectRoot,
    source,
    target: opts.to,
    sourceIssues: sourceState.issues,
    sourceEpics: sourceState.epics,
    targetIssues: targetState.issues,
    targetEpics: targetState.epics,
  });

  const edges = computeInScopeEdges(sourceState.issues);

  // Behavior 15 + Postcondition 7: dry-run early exit.
  if (opts.dryRun) {
    const report = buildDryRunReport({
      source,
      target: opts.to,
      sourceIssues: sourceState.issues,
      sourceEpics: sourceState.epics,
      alreadyMigrated,
      dependenciesToReplay: edges.total,
    });
    console.log(JSON.stringify(report));
    return 0;
  }

  // ---- Live migration path ----

  // Procedure Step 2: load resume state. Refuse on source/target mismatch.
  const scopeArgs = { includeClosed: opts.includeClosed };
  let resume;
  try {
    resume = loadResumeState({
      projectRoot,
      source,
      target: opts.to,
      scopeArgs,
    });
  } catch (err) {
    if (
      err && (err.code === "MIGRATE_RESUME_MISMATCH" || err.code === "MIGRATE_RESUME_INVALID")
    ) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }

  // Construct the target adapter. The source adapter was already returned
  // from readSource; the target adapter needs its own construction (with
  // the manifest backend overridden).
  const targetManifest = overrideManifestBackend(manifest, opts.to);
  let targetAdapter;
  try {
    targetAdapter = getIssueManager(targetManifest, projectRoot);
  } catch (err) {
    console.error(`failed to construct target adapter '${opts.to}': ${err.message}`);
    return 1;
  }

  let liveResult;
  try {
    liveResult = await runLiveMigration({
      projectRoot,
      source,
      target: opts.to,
      sourceAdapter: sourceState.adapter,
      targetAdapter,
      sourceIssues: sourceState.issues,
      sourceEpics: sourceState.epics,
      alreadyMigratedIssueIds: alreadyMigrated.sourceIssueIds,
      alreadyMigratedEpicIds: alreadyMigrated.sourceEpicIds,
      startIndex: resume.startIndex,
      scopeArgs,
    });
  } catch (err) {
    if (err && err.code === "MIGRATE_PARTIAL_FAILURE") {
      // Emit the partial-failure report on stdout per SEC-1.
      const report = {
        source,
        target: opts.to,
        created: { issues: 0, epics: 0 }, // best-effort; lib doesn't yet expose counts on throw
        skipped: 0,
        dependencies_replayed: 0,
        manifest_update_suggested: false,
        errors: err.errors || [{ stderr: err.adapterStderr || err.message }],
      };
      console.log(JSON.stringify(report));
      console.error(err.message);
      return 1;
    }
    throw err;
  }

  // Procedure Step 6: replay dependency edges on the target.
  const replayResult = await replayDependencies({
    projectRoot,
    source,
    target: opts.to,
    sourceIssues: sourceState.issues,
    targetAdapter,
  });

  // ---------------------------------------------------------------------
  // Plan-task 8: final report + manifest-update prompt + state cleanup.
  // ---------------------------------------------------------------------
  console.error(
    "MIGRATE_NOT_IMPLEMENTED: dependency replay landed " +
      `(replayed=${replayResult.replayed}, skipped=${replayResult.skippedEdges.length}). ` +
      "Final report + cleanup continues in plan-task 8.",
  );
  return 1;
}

export default {
  run,
  help,
  parseArgs,
  readSource,
  computeAlreadyMigrated,
  computeInScopeEdges,
  buildDryRunReport,
  loadResumeState,
  clearMigrateState,
  runLiveMigration,
  replayDependencies,
};
