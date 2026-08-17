/**
 * Milestone JSON I/O and command logic.
 *
 * Manages milestones.json in `.context-index/` (resolved via the shared
 * `resolveStorageRoot()` helper from `lib/issues/resolve-root.mjs`, so
 * milestones live alongside the issue board in the main repo and are
 * shared across `git worktree` checkouts).
 *
 * Writes are atomic via temp-file-then-rename, mirroring
 * `lib/build-state.mjs::atomicWriteJson`. On rename failure the temp file
 * is best-effort cleaned up and the underlying `fs` error is rethrown.
 *
 * Path safety: every public function resolves `projectRoot` via
 * `path.resolve()`, requires `.context-index/manifest.yaml` to exist, and
 * verifies the resolved storage path is a real directory contained under
 * the resolved storage root (defeats traversal via crafted `tasks.db_path`
 * overrides and symlink escapes under `.context-index/`).
 *
 * Zero external dependencies — uses only `node:fs`, `node:path`,
 * `node:crypto`, and `node:child_process` (the latter only transitively
 * via `resolveStorageRoot`).
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  unlinkSync,
  statSync,
  realpathSync,
} from "node:fs";
import { join, resolve, sep, dirname, isAbsolute } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolveStorageRoot } from "./issues/resolve-root.mjs";
import {
  assertProjectRoot as validateProjectRoot,
  loadManifestForStorage,
} from "./manifest.mjs";
import { parseYaml } from "./profiles/yaml.mjs";
import { mergeGates } from "./domains/merge-gates.mjs";

const MILESTONES_REL_PATH = join(".context-index", "milestones.json");
const GATES_REL_PATH = join(".context-index", "governance", "gates.yaml");
const NAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Path-safety helpers (SEC-1)
// ---------------------------------------------------------------------------

/**
 * Resolve and validate the storage root for milestones.
 * Asserts the resolved root is a real existing directory (positive
 * containment — defeats `tasks.db_path: /etc/passwd` style attacks).
 *
 * Throws `INVALID_STORAGE_PATH` if validation fails.
 *
 * @param {string} projectRoot - Already-resolved absolute path
 * @returns {string} Absolute storage root path (real-pathed for symlink safety)
 */
function resolveAndValidateStorageRoot(projectRoot) {
  const manifest = loadManifestForStorage(projectRoot);
  const storageRoot = resolveStorageRoot(manifest, projectRoot);

  // Positive containment: the storage root itself must be a real directory.
  let stat;
  try {
    stat = statSync(storageRoot);
  } catch (e) {
    const err = new Error(
      `tasks.db_path must point at an existing directory (got "${storageRoot}")`
    );
    err.code = "INVALID_STORAGE_PATH";
    throw err;
  }
  if (!stat.isDirectory()) {
    const err = new Error(
      `tasks.db_path must point at an existing directory (got "${storageRoot}")`
    );
    err.code = "INVALID_STORAGE_PATH";
    throw err;
  }

  return storageRoot;
}

/**
 * Compute the resolved milestones.json file path under `<storageRoot>/.context-index/`
 * and assert (via realpath containment) that the resolved path is contained
 * within the realpath of `<storageRoot>/.context-index/`. Defeats symlink
 * escape (CWE-59) and traversal (CWE-22).
 *
 * Throws `INVALID_STORAGE_PATH` on containment failure.
 *
 * @param {string} storageRoot - Validated storage root (absolute)
 * @returns {{ filePath: string, storageDir: string }}
 */
function resolveMilestonesPath(storageRoot) {
  const storageDir = join(storageRoot, ".context-index");
  const filePath = join(storageDir, "milestones.json");

  // Realpath the parent dir (it should exist after first write; before that
  // we still want a safe prefix check via the resolved storage root). The
  // storage root itself has already been statSync'd as a directory, so its
  // realpath is well-defined.
  let realStorageRoot;
  try {
    realStorageRoot = realpathSync.native(storageRoot);
  } catch {
    const err = new Error(
      `Resolved storage root "${storageRoot}" cannot be canonicalized`
    );
    err.code = "INVALID_STORAGE_PATH";
    throw err;
  }
  const realStorageDir = join(realStorageRoot, ".context-index");

  // If the storage dir already exists, realpath it for symlink-safety. If
  // it doesn't (first-run case), the prefix check is still valid against
  // the canonical storage-root prefix.
  let realCheckBase = realStorageDir;
  if (existsSync(storageDir)) {
    try {
      realCheckBase = realpathSync.native(storageDir);
    } catch {
      // Fall back to the join'd realpath above — still safe.
    }
  }

  // Target file: realpath the parent dir if it exists, else use realCheckBase.
  // Then assert the resulting target dir matches the expected base.
  let realTargetDir = realCheckBase;
  if (existsSync(filePath)) {
    try {
      realTargetDir = realpathSync.native(dirname(filePath));
    } catch {
      realTargetDir = realCheckBase;
    }
  }

  const basePrefix = realCheckBase.endsWith(sep) ? realCheckBase : realCheckBase + sep;
  const targetWithSep = realTargetDir.endsWith(sep) ? realTargetDir : realTargetDir + sep;
  if (!(realTargetDir === realCheckBase || targetWithSep.startsWith(basePrefix))) {
    const err = new Error(
      `Resolved milestones path "${filePath}" escapes storage root "${realCheckBase}"`
    );
    err.code = "INVALID_STORAGE_PATH";
    throw err;
  }

  return { filePath, storageDir };
}

/**
 * Resolve the full milestones.json path given an unresolved `projectRoot`.
 * Performs all the path-safety checks. Internal entry point used by every
 * public function.
 *
 * @param {string} projectRoot
 * @returns {{ filePath: string, storageDir: string, storageRoot: string }}
 */
function resolveMilestonesContext(projectRoot) {
  const resolvedRoot = validateProjectRoot(projectRoot);
  const storageRoot = resolveAndValidateStorageRoot(resolvedRoot);
  const { filePath, storageDir } = resolveMilestonesPath(storageRoot);
  return { filePath, storageDir, storageRoot };
}

/**
 * Atomic JSON write via temp-file-then-rename. Mirrors
 * `lib/build-state.mjs::atomicWriteJson` (8 hex char temp suffix, best-effort
 * cleanup on rename failure, original error rethrown).
 *
 * @param {string} filePath - Absolute target path
 * @param {string} storageDir - Absolute parent directory (containment base for temp)
 * @param {object} data - JSON-serializable payload
 */
function atomicWriteJson(filePath, storageDir, data) {
  mkdirSync(dirname(filePath), { recursive: true });

  const tmpPath = filePath + "." + randomBytes(4).toString("hex") + ".tmp";

  // Also assert the temp path is inside the storage dir (defensive; the
  // suffix can't escape but we mirror json-adapter's containment discipline).
  const baseWithSep = storageDir.endsWith(sep) ? storageDir : storageDir + sep;
  if (!(tmpPath === storageDir || tmpPath.startsWith(baseWithSep))) {
    const err = new Error(
      `Temp path "${tmpPath}" escapes storage dir "${storageDir}"`
    );
    err.code = "INVALID_STORAGE_PATH";
    throw err;
  }

  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { /* swallow cleanup errors */ }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Validators (pure; unchanged)
// ---------------------------------------------------------------------------

/**
 * Validate a milestone name.
 * @param {string} name
 * @throws {{ code: "MISSING_NAME" | "INVALID_NAME" }}
 */
export function validateMilestoneName(name) {
  if (!name) {
    const err = new Error("Milestone name is required.");
    err.code = "MISSING_NAME";
    throw err;
  }
  if (!NAME_REGEX.test(name)) {
    const err = new Error(`Invalid milestone name: "${name}". Must match [a-zA-Z0-9._-]+`);
    err.code = "INVALID_NAME";
    throw err;
  }
}

/**
 * Validate a target date string.
 * @param {string} dateStr
 * @throws {{ code: "INVALID_DATE" }}
 */
export function validateTargetDate(dateStr) {
  if (!DATE_REGEX.test(dateStr)) {
    const err = new Error("Invalid date format. Use YYYY-MM-DD.");
    err.code = "INVALID_DATE";
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Core I/O
// ---------------------------------------------------------------------------

/**
 * Load milestones from `.context-index/milestones.json` (resolved via the
 * shared storage root — see `resolveStorageRoot`).
 *
 * Synchronous: returns the milestones array directly (CON-5).
 *
 * @param {string} projectRoot
 * @returns {Array<object>} Array of milestone objects
 * @throws {{ code: "INVALID_PROJECT_ROOT" | "INVALID_STORAGE_PATH" | "PARSE_ERROR" }}
 */
export function loadMilestones(projectRoot) {
  const { filePath } = resolveMilestonesContext(projectRoot);
  if (!existsSync(filePath)) return [];

  let content;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const err = new Error("milestones.json is malformed — cannot parse");
    err.code = "PARSE_ERROR";
    throw err;
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.milestones)) {
    return [];
  }
  return parsed.milestones.map((m) => ({
    name: m.name ?? "",
    status: m.status ?? "planned",
    epic_id: m.epic_id ?? null,
    target_date: m.target_date ?? null,
    release: m.release ?? null,
    ship_criteria: Array.isArray(m.ship_criteria) ? m.ship_criteria : [],
    defer_reason: m.defer_reason ?? null,
  }));
}

/**
 * Serialize and save milestones to `.context-index/milestones.json` via
 * atomic temp-then-rename.
 *
 * Document shape: `{ version: 1, milestones: [...] }` (mirrors the JSON
 * adapter pattern and matches the schema declared in the spec).
 *
 * @param {string} projectRoot
 * @param {Array<object>} milestones
 * @throws {{ code: "INVALID_PROJECT_ROOT" | "INVALID_STORAGE_PATH" }} | fs errors
 */
export function saveMilestones(projectRoot, milestones) {
  const { filePath, storageDir } = resolveMilestonesContext(projectRoot);
  atomicWriteJson(filePath, storageDir, { version: 1, milestones });
}

/**
 * Find a milestone by name.
 * @param {string} projectRoot
 * @param {string} name
 * @returns {object|null}
 */
export function findMilestone(projectRoot, name) {
  const milestones = loadMilestones(projectRoot);
  return milestones.find((m) => m.name === name) ?? null;
}

// ---------------------------------------------------------------------------
// Mutators (signatures unchanged; storage migrated)
// ---------------------------------------------------------------------------

/**
 * Create or update a milestone with optional epic linking.
 *
 * @param {string} projectRoot
 * @param {string} name
 * @param {object} options
 * @param {object} [options.issueManager] - Issue manager adapter (createEpic)
 * @param {string} [options.targetDate] - Target date (YYYY-MM-DD)
 * @param {string[]} [options.checks] - Ship criteria check types
 * @param {string[]} [options.confirms] - Ship criteria confirm texts
 * @returns {Promise<object>} The created or updated milestone entry
 */
export async function milestoneCreate(projectRoot, name, options = {}) {
  validateMilestoneName(name);

  if (options.targetDate) {
    validateTargetDate(options.targetDate);
  }

  // Validate and resolve release strategy
  let release = null;
  if (options.strategy) {
    resolveStrategy({ release: { strategy: options.strategy } }); // throws UNKNOWN_STRATEGY if invalid
    release = { strategy: options.strategy };
  }

  const milestones = loadMilestones(projectRoot);
  const existing = milestones.find((m) => m.name === name);

  // Build ship criteria
  const shipCriteria = [];
  if (options.checks) {
    for (const check of options.checks) {
      shipCriteria.push({ check });
    }
  }
  if (options.confirms) {
    for (const confirm of options.confirms) {
      shipCriteria.push({ confirm });
    }
  }

  if (existing) {
    // Idempotent update — keep epic_id, update other fields
    if (options.targetDate) existing.target_date = options.targetDate;
    if (shipCriteria.length > 0) existing.ship_criteria = shipCriteria;
    if (release) existing.release = release;
    saveMilestones(projectRoot, milestones);
    return existing;
  }

  // New milestone — attempt epic creation
  let epicId = null;
  const { issueManager } = options;

  if (issueManager) {
    try {
      const epic = await issueManager.createEpic({
        title: name,
        milestone: name,
      });
      epicId = epic.id;
    } catch {
      // EPIC_CREATE_FAILED — write milestone with epic_id: null
      epicId = null;
    }
  }

  const entry = {
    name,
    status: "planned",
    epic_id: epicId,
    target_date: options.targetDate ?? null,
    release,
    ship_criteria: shipCriteria,
  };

  milestones.push(entry);
  saveMilestones(projectRoot, milestones);
  return entry;
}

/**
 * List milestones with progress from linked epics.
 *
 * @param {string} projectRoot
 * @param {object} options
 * @param {object} [options.issueManager] - Issue manager adapter (list, listEpics)
 * @returns {Promise<string>} Formatted table or help message
 */
export async function milestoneList(projectRoot, options = {}) {
  const milestones = loadMilestones(projectRoot);

  if (milestones.length === 0) {
    return "No milestones defined. Run `milestone create <name>` to create one.";
  }

  const { issueManager } = options;

  // Collect epic data if issue manager available
  let epics = [];
  if (issueManager) {
    try {
      epics = await issueManager.listEpics();
    } catch {
      epics = [];
    }
  }

  const header = "| Name | Status | Target Date | Epic | Progress |";
  const sep = "|------|--------|-------------|------|----------|";
  const rows = [];

  for (const ms of milestones) {
    const targetDate = ms.target_date ?? "—";
    let epicCell = ms.epic_id ?? "—";
    let progress = "—";

    if (ms.epic_id && issueManager) {
      const epicExists = epics.some((e) => e.id === ms.epic_id);
      if (!epicExists) {
        epicCell = `${ms.epic_id} (broken)`;
        progress = "—";
      } else {
        try {
          const issues = await issueManager.list({ epicId: ms.epic_id });
          const open = issues.filter((i) => i.status !== "closed").length;
          const total = issues.length;
          progress = `${open}/${total} open`;
        } catch {
          progress = "—";
        }
      }
    }

    rows.push(`| ${ms.name} | ${ms.status} | ${targetDate} | ${epicCell} | ${progress} |`);
  }

  return [header, sep, ...rows].join("\n");
}

/**
 * Defer a milestone with a reason.
 *
 * @param {string} projectRoot
 * @param {string} name
 * @param {string} reason
 * @param {object} [options]
 * @param {object} [options.issueManager]
 * @returns {Promise<object>} The updated milestone entry
 */
export async function milestoneDefer(projectRoot, name, reason, options = {}) {
  validateMilestoneName(name);

  if (!reason) {
    const err = new Error('Reason is required. Use --reason "<text>"');
    err.code = "MISSING_REASON";
    throw err;
  }

  const milestones = loadMilestones(projectRoot);
  const milestone = milestones.find((m) => m.name === name);

  if (!milestone) {
    const err = new Error(`Milestone '${name}' not found`);
    err.code = "MILESTONE_NOT_FOUND";
    throw err;
  }

  if (milestone.status === "shipped") {
    const err = new Error("Cannot defer a shipped milestone");
    err.code = "ALREADY_SHIPPED";
    throw err;
  }

  milestone.status = "deferred";
  milestone.defer_reason = reason;
  saveMilestones(projectRoot, milestones);

  const { issueManager } = options;
  if (issueManager && milestone.epic_id) {
    try {
      await issueManager.updateEpic(milestone.epic_id, { status: "deferred" });
    } catch {
      // EPIC_UPDATE_FAILED — milestone is already deferred in JSON
    }
  }

  return milestone;
}

// ---------------------------------------------------------------------------
// Quality gates (gates_pass ship criterion)
// ---------------------------------------------------------------------------

/** Tier execution order documented in `.context-index/governance/gates.yaml`. */
const GATE_TIER_ORDER = ["fast", "integration", "e2e"];

/** Per-gate wall-clock budget; mirrors lib/governance/quality-gate.mjs. */
const GATE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Subprocess stdout/stderr buffer. `execFileSync`'s 1 MiB default makes a
 * chatty-but-passing gate throw (ENOBUFS) and read as a failure, so it is
 * raised to match lib/governance/quality-gate.mjs.
 */
const GATE_MAX_BUFFER = 16 * 1024 * 1024;

/** Max characters of gate output retained in a failure detail. */
const GATE_DETAIL_CAP = 500;

/**
 * Resolve the effective severity of a merged gate entry.
 *
 * Rules are the ones documented in the `gates.yaml` header:
 *   - `required: false` forces `warning` (overrides an explicit severity).
 *   - otherwise an explicit `severity` wins.
 *   - otherwise the tier default: fast/integration → error;
 *     e2e → error for `group: smoke`, warning for `group: full`/unset.
 *
 * @param {object} gate
 * @returns {"error"|"warning"}
 */
export function resolveGateSeverity(gate) {
  if (gate?.required === false) return "warning";
  if (gate?.severity === "error" || gate?.severity === "warning") return gate.severity;
  const tier = gate?.tier || "fast";
  if (tier === "e2e") return gate?.group === "smoke" ? "error" : "warning";
  return "error";
}

/**
 * Load quality gates the same way every other consumer does: read
 * `.context-index/governance/gates.yaml` and run it through
 * `lib/domains/merge-gates.mjs::mergeGates`, which validates each entry and
 * rejects shell-string commands (argv lists only).
 *
 * Never throws — a missing/unreadable/unparseable file degrades to an empty
 * gate list plus a warning the caller can surface.
 *
 * @param {string} projectRoot - Absolute project root
 * @param {string} [gatesPath] - Override, project-relative or absolute
 * @returns {{ gates: object[], warnings: Array<{code: string, message: string}>, source: string, missing: boolean }}
 */
export function loadGovernanceGates(projectRoot, gatesPath) {
  const absRoot = resolve(projectRoot);
  const rel = gatesPath || GATES_REL_PATH;
  const abs = isAbsolute(rel) ? resolve(rel) : resolve(absRoot, rel);

  // Containment: a gates path may not escape the project root.
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) {
    return {
      gates: [],
      warnings: [{ code: "GATES_PATH_ESCAPE", message: `gates path escapes project root: ${rel}` }],
      source: rel,
      missing: true,
    };
  }

  if (!existsSync(abs)) {
    return { gates: [], warnings: [], source: rel, missing: true };
  }

  let raw;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (e) {
    return {
      gates: [],
      warnings: [{ code: "GATES_UNREADABLE", message: `cannot read ${rel}: ${e.message ?? e}` }],
      source: rel,
      missing: true,
    };
  }
  if (raw.trim() === "") {
    return { gates: [], warnings: [], source: rel, missing: false };
  }

  let doc;
  try {
    doc = parseYaml(raw);
  } catch (e) {
    return {
      gates: [],
      warnings: [{ code: "GATES_PARSE_ERROR", message: `parse error in ${rel}: ${e.message ?? e}` }],
      source: rel,
      missing: false,
    };
  }

  const { gates, warnings } = mergeGates(null, doc);

  // `mergeGates` keeps only id/command/description/severity/tier — it drops
  // `required` and `group`, both of which the documented severity rules need.
  // Re-attach them from the raw document (last entry wins, matching the
  // merge's own id-override order) without bypassing the merge itself.
  const rawById = new Map();
  for (const entry of Array.isArray(doc?.gates) ? doc.gates : []) {
    if (entry && typeof entry === "object" && entry.id) rawById.set(entry.id, entry);
  }
  const enriched = gates.map((gate) => {
    const raw = rawById.get(gate.id);
    if (!raw) return gate;
    return {
      ...gate,
      ...(raw.required !== undefined ? { required: raw.required } : {}),
      ...(raw.group !== undefined ? { group: raw.group } : {}),
    };
  });

  return { gates: enriched, warnings, source: rel, missing: false };
}

/** Order gates by documented tier order; unknown tiers run last, in declaration order. */
function orderGatesByTier(gates) {
  return gates
    .map((gate, index) => ({ gate, index }))
    .sort((a, b) => {
      const ta = GATE_TIER_ORDER.indexOf(a.gate.tier || "fast");
      const tb = GATE_TIER_ORDER.indexOf(b.gate.tier || "fast");
      const ra = ta === -1 ? GATE_TIER_ORDER.length : ta;
      const rb = tb === -1 ? GATE_TIER_ORDER.length : tb;
      if (ra !== rb) return ra - rb;
      return a.index - b.index;
    })
    .map((entry) => entry.gate);
}

/**
 * Execute one gate's argv command. No shell — `gate.command` is an argv list
 * (enforced by `mergeGates`), so nothing in it is ever shell-interpreted.
 *
 * @param {object} gate - Merged gate ({ id, command: string[] })
 * @param {{ cwd: string, timeoutMs: number }} ctx
 * @returns {{ passed: boolean, output: string }}
 */
function runGateCommand(gate, ctx) {
  const [executable, ...args] = gate.command;
  try {
    execFileSync(executable, args, {
      cwd: ctx.cwd,
      stdio: "pipe",
      shell: false,
      timeout: ctx.timeoutMs,
      maxBuffer: GATE_MAX_BUFFER,
    });
    return { passed: true, output: "" };
  } catch (e) {
    if (e && e.killed && e.signal === "SIGTERM") {
      return { passed: false, output: `timed out after ${ctx.timeoutMs}ms` };
    }
    // Test runners report failures on stdout at least as often as stderr.
    const stdout = e && e.stdout ? e.stdout.toString() : "";
    const stderr = e && e.stderr ? e.stderr.toString() : "";
    const output = `${stdout}${stderr}`.trim();
    return { passed: false, output: output || (e && e.message) || "Command failed" };
  }
}

/**
 * Evaluate the `gates_pass` ship criterion.
 *
 * Gates come from `.context-index/governance/gates.yaml` via `mergeGates`
 * (never from the obsolete `manifest.gates.*` block). All merged gates run
 * by default, in tier order; a criterion may narrow the set with
 * `gate: "<id>"` or `gates: ["<id>", …]`.
 *
 * Severity decides blocking: an error-severity failure fails the criterion
 * (`passed: false`) and stops the run; a warning-severity failure is recorded
 * in `warnings` and does NOT block the ship.
 *
 * @param {object} criterion - The ship-criterion entry
 * @param {object} options - { projectRoot, gatesPath, runGate, timeoutMs }
 * @returns {Promise<object>} Result entry for the criterion
 */
async function evaluateGatesPass(criterion, options) {
  const { projectRoot, gatesPath, runGate, timeoutMs } = options || {};

  if (!projectRoot) {
    return {
      check: "gates_pass",
      passed: false,
      detail:
        "Cannot resolve quality gates: no projectRoot supplied to evaluateShipCriteria " +
        `(gates are read from ${GATES_REL_PATH})`,
    };
  }

  const loaded = loadGovernanceGates(projectRoot, gatesPath);
  const configWarnings = loaded.warnings.map((w) => `${w.code}: ${w.message}`);

  if (loaded.gates.length === 0) {
    const reason = loaded.missing
      ? `${loaded.source} not found`
      : `${loaded.source} declares no runnable gates`;
    const suffix = configWarnings.length > 0 ? ` (${configWarnings.join("; ")})` : "";
    return {
      check: "gates_pass",
      passed: false,
      detail: `No quality gates configured: ${reason}${suffix}`,
      ...(configWarnings.length > 0 ? { warnings: configWarnings } : {}),
    };
  }

  // Optional narrowing: `gate: "test"` or `gates: ["test", "lint"]`.
  const requested = Array.isArray(criterion?.gates)
    ? criterion.gates
    : criterion?.gate
      ? [criterion.gate]
      : null;

  let selected = loaded.gates;
  if (requested) {
    const byId = new Map(loaded.gates.map((g) => [g.id, g]));
    const missing = requested.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      return {
        check: "gates_pass",
        passed: false,
        detail:
          `Ship criterion references unknown gate${missing.length > 1 ? "s" : ""} ` +
          `${missing.map((id) => `'${id}'`).join(", ")} — not declared in ${loaded.source}`,
        ...(configWarnings.length > 0 ? { warnings: configWarnings } : {}),
      };
    }
    selected = requested.map((id) => byId.get(id));
  }

  const exec = runGate || runGateCommand;
  const ctx = { cwd: resolve(projectRoot), timeoutMs: timeoutMs ?? GATE_TIMEOUT_MS };

  const gateResults = [];
  const warnings = [...configWarnings];
  const blocking = [];

  for (const gate of orderGatesByTier(selected)) {
    const severity = resolveGateSeverity(gate);
    const outcome = (await exec(gate, ctx)) || {};
    const output = (outcome.output || "").slice(0, GATE_DETAIL_CAP);

    gateResults.push({
      id: gate.id,
      severity,
      passed: outcome.passed === true,
      command: [...gate.command],
      ...(outcome.passed === true ? {} : { detail: output }),
    });

    if (outcome.passed === true) continue;

    const summary = `Gate '${gate.id}' failed (${severity})${output ? `: ${output}` : ""}`;
    if (severity === "error") {
      blocking.push(summary);
      // Documented semantics: an error-severity failure stops remaining gates.
      break;
    }
    warnings.push(summary);
  }

  return {
    check: "gates_pass",
    passed: blocking.length === 0,
    gates: gateResults,
    ...(blocking.length > 0 ? { detail: blocking.join(" | ") } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * Evaluate ship criteria for a milestone.
 * Pure query — never mutates state.
 *
 * @param {object} milestone - Milestone object with ship_criteria array
 * @param {object} issueManager - Issue manager adapter
 * @param {object} manifest - Parsed manifest content (reserved; gate
 *   definitions live in `.context-index/governance/gates.yaml`, not here)
 * @param {object} [options] - { projectRoot, gatesPath, runGate, timeoutMs }.
 *   `projectRoot` is required for the `gates_pass` check to resolve gates.
 * @returns {Promise<Array<object>>} Results array with pass/fail per criterion
 */
export async function evaluateShipCriteria(milestone, issueManager, manifest, options = {}) {
  if (!milestone.ship_criteria || milestone.ship_criteria.length === 0) {
    return [];
  }

  // Validate epic exists
  if (!milestone.epic_id) {
    const err = new Error(`Milestone '${milestone.name}' has no valid linked epic — cannot evaluate ship criteria`);
    err.code = "BROKEN_EPIC";
    throw err;
  }

  if (issueManager.listEpics) {
    const epics = await issueManager.listEpics();
    const epicExists = epics.some((e) => e.id === milestone.epic_id);
    if (!epicExists) {
      const err = new Error(`Milestone '${milestone.name}' has no valid linked epic — cannot evaluate ship criteria`);
      err.code = "BROKEN_EPIC";
      throw err;
    }
  }

  const results = [];

  for (const criterion of milestone.ship_criteria) {
    if (criterion.check === "all_issues_closed") {
      const issues = await issueManager.list({ epicId: milestone.epic_id });
      const openIssues = issues.filter((i) => i.status !== "closed");
      if (openIssues.length === 0) {
        results.push({ check: "all_issues_closed", passed: true });
      } else {
        results.push({
          check: "all_issues_closed",
          passed: false,
          detail: `${openIssues.length} issue${openIssues.length > 1 ? "s" : ""} still open`,
        });
      }
    } else if (criterion.check === "gates_pass") {
      results.push(await evaluateGatesPass(criterion, options));
    } else if (criterion.confirm) {
      results.push({ confirm: criterion.confirm, passed: null });
    }
  }

  return results;
}

const SEMVER_REGEX = /^v?\d+\.\d+\.\d+/;

const VALID_STRATEGIES = new Set(["manual", "tag-only", "release-please"]);

/**
 * Resolve the release strategy for a milestone.
 * Returns "manual" for null/missing/absent release or release.strategy.
 *
 * @param {object} milestone
 * @returns {string} "manual" | "tag-only" | "release-please"
 * @throws {{ code: "UNKNOWN_STRATEGY" }}
 */
export function resolveStrategy(milestone) {
  const release = milestone?.release;
  if (!release || !release.strategy) return "manual";
  if (!VALID_STRATEGIES.has(release.strategy)) {
    const err = new Error(
      `Unknown release strategy '${release.strategy}'. Expected: manual, tag-only, release-please`
    );
    err.code = "UNKNOWN_STRATEGY";
    throw err;
  }
  return release.strategy;
}

/**
 * Ship a milestone: evaluate criteria, create git tag, update status, close epic.
 *
 * @param {string} projectRoot
 * @param {string} name
 * @param {object} options
 * @param {object} options.issueManager
 * @param {object} options.manifest
 * @param {function} [options.execGit] - Injectable git executor for testing
 * @param {function} [options.execGh] - Injectable gh executor for testing
 * @param {function} [options.confirmFn] - Injectable confirm prompt for testing
 * @param {function} [options.runGate] - Injectable quality-gate runner for testing
 * @param {string} [options.gatesPath] - Override for the gates.yaml location
 * @param {number} [options.gateTimeoutMs] - Per-gate timeout override
 * @returns {Promise<object>} Ship result
 */
export async function milestoneShip(projectRoot, name, options = {}) {
  validateMilestoneName(name);

  const milestone = findMilestone(projectRoot, name);
  if (!milestone) {
    const err = new Error(`Milestone '${name}' not found`);
    err.code = "MILESTONE_NOT_FOUND";
    throw err;
  }

  if (milestone.status === "shipped") {
    return { shipped: true, skipped: true };
  }

  const { issueManager, manifest } = options;

  // Evaluate criteria. `projectRoot` is threaded through so the `gates_pass`
  // check can resolve gates from .context-index/governance/gates.yaml.
  const results = await evaluateShipCriteria(milestone, issueManager, manifest || {}, {
    projectRoot: resolve(projectRoot),
    gatesPath: options.gatesPath,
    runGate: options.runGate,
    timeoutMs: options.gateTimeoutMs,
  });

  // Check auto-check results
  const failedChecks = results.filter((r) => r.passed === false);
  if (failedChecks.length > 0) {
    return { shipped: false, results };
  }

  // Handle manual confirms
  const confirms = results.filter((r) => r.passed === null);
  if (confirms.length > 0 && options.confirmFn) {
    for (const c of confirms) {
      const accepted = await options.confirmFn(c.confirm);
      if (!accepted) {
        return { shipped: false, results, confirmRejected: c.confirm };
      }
    }
  }

  // Resolve release strategy
  const strategy = resolveStrategy(milestone);

  // Helper to update status and close epic
  const updateStatusAndCloseEpic = async () => {
    const milestones = loadMilestones(projectRoot);
    const ms = milestones.find((m) => m.name === name);
    ms.status = "shipped";
    saveMilestones(projectRoot, milestones);

    if (issueManager && milestone.epic_id) {
      try {
        await issueManager.close(milestone.epic_id, "Milestone shipped");
      } catch {
        // EPIC_CLOSE_FAILED — status already committed
      }
    }
  };

  // Strategy dispatch
  switch (strategy) {
    case "manual": {
      // Execution order: (1) update status, (2) close epic
      await updateStatusAndCloseEpic();
      return { shipped: true, strategy: "manual", results };
    }

    case "tag-only": {
      // Determine tag name for semver milestones
      let tag = null;
      if (SEMVER_REGEX.test(name)) {
        tag = name.startsWith("v") ? name : `v${name}`;

        // Execution order: (1) create git tag, (2) update status, (3) close epic
        const gitExec = options.execGit || ((args) => execFileSync("git", args, { stdio: "pipe" }));
        try {
          gitExec(["tag", tag]);
        } catch (e) {
          if (e.code === "TAG_EXISTS" || (e.stderr && e.stderr.toString().includes("already exists"))) {
            return { shipped: false, results, tag, error: "TAG_EXISTS" };
          }
          throw e;
        }
      }

      await updateStatusAndCloseEpic();

      // Optional GitHub release
      if (tag && options.execGh) {
        try {
          options.execGh(["release", "create", tag, "--generate-notes", "--draft"]);
        } catch {
          // GitHub release skipped
        }
      }

      return { shipped: true, strategy: "tag-only", results, tag };
    }

    case "release-please": {
      const configPath = join(projectRoot, "release-please-config.json");

      // Check if config file exists
      if (!existsSync(configPath)) {
        // Fall back to manual strategy with warning
        await updateStatusAndCloseEpic();
        return { shipped: true, strategy: "manual", results };
      }

      // Write release-as for semver names
      if (SEMVER_REGEX.test(name)) {
        let configContent;
        try {
          configContent = readFileSync(configPath, "utf8");
        } catch (e) {
          const err = new Error("release-please-config.json could not be read");
          err.code = "RELEASE_CONFIG_INVALID";
          throw err;
        }

        let config;
        try {
          config = JSON.parse(configContent);
        } catch (e) {
          const err = new Error("release-please-config.json is not valid JSON — cannot write release-as");
          err.code = "RELEASE_CONFIG_INVALID";
          throw err;
        }

        // Strip v prefix for release-as value
        const version = name.startsWith("v") ? name.slice(1) : name;

        // Write to packages["."] (canonical package entry per ADR-0008)
        if (config.packages && config.packages["."]) {
          config.packages["."]["release-as"] = version;
        }

        writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
      }

      // Execution order: (1) config write done above, (2) update status, (3) close epic
      await updateStatusAndCloseEpic();

      // Optional PR detection
      if (options.execGh) {
        try {
          options.execGh(["pr", "list", "--head", "release-please--branches--main", "--json", "number,title,url", "--limit", "1"]);
        } catch {
          // gh unavailable — skip PR detection
        }
      }

      return { shipped: true, strategy: "release-please", results };
    }

    default: {
      // Should not reach here — resolveStrategy validates
      const err = new Error(`Unknown release strategy '${strategy}'`);
      err.code = "UNKNOWN_STRATEGY";
      throw err;
    }
  }
}

/**
 * Advisory check: warn if a milestone name is not defined in milestones.json.
 * Fail-open — returns null on missing file, malformed JSON, missing manifest,
 * or any other error. Never throws.
 *
 * @param {string} projectRoot
 * @param {string} name
 * @returns {string|null} Warning string, or null if milestone exists / file missing
 */
export function warnIfMilestoneUndefined(projectRoot, name) {
  try {
    const milestones = loadMilestones(projectRoot);
    if (milestones.length === 0) return null; // no file or empty — milestones are optional
    const found = milestones.some((m) => m.name === name);
    if (found) return null;
    return `Warning: milestone '${name}' is not defined in milestones.json. Run \`milestone create ${name}\` to define it.`;
  } catch {
    return null; // fail-open
  }
}

/**
 * Get milestone metadata for status display.
 * Graceful — returns { milestone: null, found: false } on any error.
 *
 * @param {string} projectRoot
 * @param {string} name
 * @returns {{ milestone: object|null, found: boolean }}
 */
export function getMilestoneStatusData(projectRoot, name) {
  try {
    const ms = findMilestone(projectRoot, name);
    if (ms) return { milestone: ms, found: true };
    return { milestone: null, found: false };
  } catch {
    return { milestone: null, found: false };
  }
}
