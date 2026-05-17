/**
 * One-shot migration tool: legacy state artifacts → charter-era shapes.
 *
 * Converts in one semantically-idempotent invocation:
 *   - `.context-index/tasks/tasks.md` → `.context-index/tasks/tasks.json`
 *   - `.context-index/build-state/*.json` → `.context-index/lifecycle-state/*.jsonl`
 *     (followed by directory rename `build-state` → `lifecycle-state`)
 *   - `.context-index/.execution-state.md` → `.context-index/.execution-state.json`
 *   - `.context-index/milestones.yaml` → `.context-index/milestones.json`
 *   - `.context-index/constitution.md` Context Routing row (Build state → Lifecycle state)
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
 *
 * Idempotency model: skip-on-completion. Re-running on a fully-migrated
 * project short-circuits each artifact based on target presence and exits
 * with no I/O.
 *
 * Zero external deps — uses only `node:fs`, `node:path`, `node:crypto`.
 *
 * @module lib/migrate-state-artifacts
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  unlinkSync,
  readdirSync,
  statSync,
  realpathSync,
  appendFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { join, resolve, sep, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTasksMd } from "./issues/markdown-parser.mjs";
import { parseYaml } from "./profiles/yaml.mjs";
import { writeExecutionState } from "./execution-state.mjs";
import { resolveStorageRoot } from "./issues/resolve-root.mjs";
import { loadManifest } from "./manifest.mjs";

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

const MANIFEST_REL = join(".context-index", "manifest.yaml");
const CONTEXT_INDEX = ".context-index";

const LEGACY_FILE_CAPS = {
  "tasks.md": 10 * 1024 * 1024,
  "build-state": 1 * 1024 * 1024, // per slug
  ".execution-state.md": 1 * 1024 * 1024,
  "milestones.yaml": 1 * 1024 * 1024,
  "constitution.md": 5 * 1024 * 1024,
};

const SLUG_ALLOWLIST = /^[a-z0-9._-]+$/;

const VALID_ARTIFACTS = new Set([
  "tasks",
  "lifecycle-state",
  "lifecycle-state-skip-rename",
  "execution-state",
  "milestones",
  "constitution",
  "plan-advisory",
  "validate-config",
  "all",
]);

const REDACTION_WINDOW = 200;

// ────────────────────────────────────────────────────────────────────
// Error helper
// ────────────────────────────────────────────────────────────────────

function mkErr(code, message, extras = {}) {
  const err = new Error(message);
  err.code = code;
  for (const [k, v] of Object.entries(extras)) err[k] = v;
  return err;
}

// ────────────────────────────────────────────────────────────────────
// Path-safety helpers
// ────────────────────────────────────────────────────────────────────

/**
 * Validate `projectRoot` resolves to a directory containing
 * `.context-index/manifest.yaml`. Returns the resolved absolute path.
 */
function validateProjectRoot(projectRoot) {
  if (!projectRoot || typeof projectRoot !== "string") {
    throw mkErr("INVALID_PROJECT_ROOT", "projectRoot must be a non-empty string");
  }
  const resolved = resolve(projectRoot);
  const manifest = join(resolved, MANIFEST_REL);
  if (!existsSync(manifest)) {
    throw mkErr(
      "INVALID_PROJECT_ROOT",
      `manifest.yaml missing at ${resolved}/.context-index/`,
    );
  }
  return resolved;
}

/**
 * Assert that `target` (resolved absolute) lives inside `baseDir`. Uses
 * realpath where possible to defeat symlink-escape (CWE-22, CWE-59).
 */
function assertWithin(baseDir, target, code = "INVALID_STORAGE_PATH") {
  const resolvedBase = resolve(baseDir);
  const resolvedTarget = resolve(target);

  // Resolve realpaths for BOTH sides where possible — on macOS the realpath
  // resolution turns /var/folders/... into /private/var/folders/... and we
  // need both sides normalized so the prefix check succeeds.
  let realBase = resolvedBase;
  try {
    realBase = realpathSync.native(resolvedBase);
  } catch {
    // base does not yet exist — fall back to walking ancestors
    let p = resolvedBase;
    while (p && p !== dirname(p) && !existsSync(p)) {
      p = dirname(p);
    }
    if (p && existsSync(p)) {
      try {
        const realAncestor = realpathSync.native(p);
        realBase = realBase.replace(p, realAncestor);
      } catch { /* keep string-resolved */ }
    }
  }

  let realTarget = resolvedTarget;
  if (existsSync(resolvedTarget)) {
    try {
      realTarget = realpathSync.native(resolvedTarget);
    } catch { /* keep string-resolved */ }
  } else {
    // Find nearest existing ancestor and realpath that, then append the
    // remaining suffix.
    let p = resolvedTarget;
    let suffix = "";
    while (p && p !== dirname(p) && !existsSync(p)) {
      suffix = sep + basename(p) + suffix;
      p = dirname(p);
    }
    if (p && existsSync(p)) {
      try {
        const realAncestor = realpathSync.native(p);
        realTarget = realAncestor + suffix;
      } catch { /* keep string-resolved */ }
    }
  }

  const prefix = realBase.endsWith(sep) ? realBase : realBase + sep;
  if (!(realTarget === realBase || realTarget.startsWith(prefix))) {
    throw mkErr(
      code,
      `Resolved path "${realTarget}" escapes base "${realBase}"`,
    );
  }
  return realTarget;
}

/**
 * Read the manifest for storage-root resolution. Delegates to
 * `lib/manifest.mjs::loadManifest`. Returns the full parsed manifest, or
 * null when the manifest is missing or unparseable (preserves the prior
 * tolerant contract for `resolveStorageRoot`).
 */
function loadManifestForStorage(projectRoot) {
  try {
    return loadManifest(projectRoot);
  } catch {
    return null;
  }
}

/**
 * Resolve and validate the storage root (`tasks.db_path` or git common-dir).
 */
function resolveAndValidateStorageRoot(projectRoot) {
  const manifest = loadManifestForStorage(projectRoot);
  const storageRoot = resolveStorageRoot(manifest, projectRoot);
  let stat;
  try {
    stat = statSync(storageRoot);
  } catch {
    throw mkErr(
      "INVALID_STORAGE_PATH",
      `tasks.db_path must point at an existing directory (got "${storageRoot}")`,
    );
  }
  if (!stat.isDirectory()) {
    throw mkErr(
      "INVALID_STORAGE_PATH",
      `tasks.db_path must point at an existing directory (got "${storageRoot}")`,
    );
  }
  return storageRoot;
}

// ────────────────────────────────────────────────────────────────────
// Atomic write helper
// ────────────────────────────────────────────────────────────────────

function atomicWriteJson(filePath, data) {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = filePath + "." + randomBytes(4).toString("hex") + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { /* swallow */ }
    throw err;
  }
}

function atomicWriteText(filePath, text) {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = filePath + "." + randomBytes(4).toString("hex") + ".tmp";
  writeFileSync(tmpPath, text);
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { /* swallow */ }
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────────
// Parse-error advisory redaction (Task 10)
// ────────────────────────────────────────────────────────────────────

/**
 * Strip non-printable ASCII control chars (except space/tab/newline) and
 * truncate to REDACTION_WINDOW characters. Used in parse-error advisories
 * so raw legacy content does not leak to stderr/CI logs.
 */
function safeContext(raw, around = 0) {
  if (typeof raw !== "string") return "";
  const stripped = raw.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "");
  if (around > 0) {
    const start = Math.max(0, around - Math.floor(REDACTION_WINDOW / 2));
    return stripped.slice(start, start + REDACTION_WINDOW);
  }
  return stripped.slice(0, REDACTION_WINDOW);
}

function locateLineColumn(rawError, source) {
  const msg = rawError?.message ?? "";
  let line = null;
  let column = null;
  const lcMatch = /line\s+(\d+)\s+column\s+(\d+)/i.exec(msg);
  if (lcMatch) {
    return { line: Number(lcMatch[1]), column: Number(lcMatch[2]) };
  }
  const posMatch = /at position\s+(\d+)/i.exec(msg);
  if (posMatch && typeof source === "string") {
    const pos = Math.max(0, Math.min(source.length, Number(posMatch[1])));
    const upTo = source.slice(0, pos);
    line = upTo.split("\n").length;
    const lastNl = upTo.lastIndexOf("\n");
    column = lastNl === -1 ? pos + 1 : pos - lastNl;
  }
  // YAML parser errors include line in error.line
  if (line == null && rawError?.line != null) {
    line = rawError.line;
  }
  return { line: line ?? 1, column: column ?? 1 };
}

function parseErrorAdvisory(artifact, file, code, rawError, source) {
  const { line, column } = locateLineColumn(rawError, source);
  return {
    code,
    artifact,
    file,
    parser_error_code: rawError?.code ?? rawError?.name ?? "PARSE_ERROR",
    line,
    column,
    context: safeContext(source ?? "", 0),
  };
}

// ────────────────────────────────────────────────────────────────────
// Pre-flight validator (Task 2)
// ────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} PreflightReport
 * @property {boolean} ok
 * @property {object[]} advisories
 * @property {object[]} failures
 */

/**
 * Walk every relevant legacy artifact, enforce size caps, slug allowlist,
 * and path containment. Returns a structured report — does NOT throw on
 * validation failure (caller decides to abort vs continue per artifact).
 *
 * @param {string} resolvedRoot - Already-validated project root
 * @param {object} options - { artifact, dryRun }
 * @returns {PreflightReport}
 */
function preflight(resolvedRoot, options = {}) {
  const advisories = [];
  const failures = [];
  const ciDir = join(resolvedRoot, CONTEXT_INDEX);

  // Resolve storage root for the tasks.db_path artifact validation
  try {
    resolveAndValidateStorageRoot(resolvedRoot);
  } catch (e) {
    failures.push({
      code: e.code ?? "INVALID_STORAGE_PATH",
      file: MANIFEST_REL,
      message: e.message,
    });
  }

  // Helper: size-cap check
  function checkSize(filePath, cap, artifact) {
    try {
      const stat = statSync(filePath);
      if (stat.size > cap) {
        failures.push({
          code: "LEGACY_FILE_TOO_LARGE",
          artifact,
          file: filePath,
          size: stat.size,
          cap,
        });
        return false;
      }
    } catch {
      // missing — OK; caller will decide skip vs error
    }
    return true;
  }

  // tasks.md
  const tasksMd = join(ciDir, "tasks", "tasks.md");
  if (existsSync(tasksMd)) {
    try {
      assertWithin(ciDir, tasksMd);
    } catch (e) {
      failures.push({ code: e.code, file: tasksMd, message: e.message });
    }
    if (checkSize(tasksMd, LEGACY_FILE_CAPS["tasks.md"], "tasks")) {
      try {
        const raw = readFileSync(tasksMd, "utf8");
        parseTasksMd(raw); // best-effort parseability
      } catch (e) {
        failures.push(parseErrorAdvisory("tasks", tasksMd, "TASKS_PARSE_ERROR", e, ""));
      }
    }
  }

  // build-state/*.json
  const buildStateDir = join(ciDir, "build-state");
  if (existsSync(buildStateDir)) {
    let entries;
    try {
      entries = readdirSync(buildStateDir, { withFileTypes: true });
    } catch (e) {
      failures.push({ code: "FS_ERROR", file: buildStateDir, message: e.message });
      entries = [];
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".json")) continue;
      const slug = entry.name.slice(0, -".json".length);
      if (!SLUG_ALLOWLIST.test(slug)) {
        failures.push({
          code: "INVALID_LEGACY_SLUG",
          artifact: "lifecycle-state",
          file: join(buildStateDir, entry.name),
          slug,
        });
        continue;
      }
      const filePath = join(buildStateDir, entry.name);
      try {
        assertWithin(ciDir, filePath);
      } catch (e) {
        failures.push({ code: e.code, file: filePath, message: e.message });
        continue;
      }
      if (!checkSize(filePath, LEGACY_FILE_CAPS["build-state"], "lifecycle-state")) {
        continue;
      }
      try {
        const raw = readFileSync(filePath, "utf8");
        JSON.parse(raw);
      } catch (e) {
        failures.push(
          parseErrorAdvisory(
            "lifecycle-state",
            filePath,
            "BUILD_STATE_PARSE_ERROR",
            e,
            "",
          ),
        );
      }
    }
  }

  // .execution-state.md
  const execStateMd = join(ciDir, ".execution-state.md");
  if (existsSync(execStateMd)) {
    if (checkSize(execStateMd, LEGACY_FILE_CAPS[".execution-state.md"], "execution-state")) {
      try {
        const raw = readFileSync(execStateMd, "utf8");
        parseLegacyExecutionState(raw); // probes parseability
      } catch (e) {
        failures.push(
          parseErrorAdvisory(
            "execution-state",
            execStateMd,
            "EXECUTION_STATE_PARSE_ERROR",
            e,
            "",
          ),
        );
      }
    }
  }

  // milestones.yaml
  const milestonesYaml = join(ciDir, "milestones.yaml");
  if (existsSync(milestonesYaml)) {
    if (checkSize(milestonesYaml, LEGACY_FILE_CAPS["milestones.yaml"], "milestones")) {
      try {
        const raw = readFileSync(milestonesYaml, "utf8");
        parseYaml(raw);
      } catch (e) {
        failures.push(
          parseErrorAdvisory(
            "milestones",
            milestonesYaml,
            "MILESTONES_PARSE_ERROR",
            e,
            "",
          ),
        );
      }
    }
  }

  // constitution.md
  const constitution = join(ciDir, "constitution.md");
  if (existsSync(constitution)) {
    checkSize(constitution, LEGACY_FILE_CAPS["constitution.md"], "constitution");
  }

  return {
    ok: failures.length === 0,
    advisories,
    failures,
  };
}

// ────────────────────────────────────────────────────────────────────
// Legacy execution-state parser (one-shot helper)
// Kept here per spec — the rewritten lib/execution-state.mjs no longer has
// this function.
// ────────────────────────────────────────────────────────────────────

function parseLegacyExecutionState(content) {
  if (!content || typeof content !== "string") {
    throw mkErr("PARSE_ERROR", "execution-state content must be a non-empty string");
  }
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    throw mkErr("PARSE_ERROR", "missing YAML frontmatter delimiters (---)");
  }
  const fm = fmMatch[1];
  const lines = fm.split("\n");
  const state = {
    status: "idle",
    planRef: "",
    currentTask: "",
    issueBinding: "",
    blockers: "",
    nextAction: "",
    updated: "",
    progress: [],
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^([a-zA-Z_]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();

    // progress is a list
    if (key === "progress") {
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        items.push(lines[j].replace(/^\s*-\s+/, "").trim());
        j++;
      }
      i = j - 1;
      state.progress = items;
      continue;
    }

    // strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (Object.prototype.hasOwnProperty.call(state, key)) {
      if (key === "currentTask" && /^\d+$/.test(value)) {
        state[key] = Number(value);
      } else {
        state[key] = value;
      }
    }
  }
  return state;
}

// ────────────────────────────────────────────────────────────────────
// Per-artifact migrators
// ────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} MigrationResult
 * @property {string} artifact
 * @property {"migrated"|"skipped"|"dry-run"} action
 * @property {string|null} source
 * @property {string|null} target
 * @property {object[]} advisories
 * @property {boolean} dryRun
 */

function makeResult(artifact, action, source, target, advisories = [], dryRun = false) {
  return {
    artifact,
    action,
    source: source ?? null,
    target: target ?? null,
    advisories,
    dryRun,
  };
}

/**
 * Migrate `.context-index/tasks/tasks.md` → `.context-index/tasks/tasks.json`.
 */
export async function migrateTasks(projectRoot, options = {}) {
  const dryRun = !!options.dryRun;
  const resolvedRoot = validateProjectRoot(projectRoot);
  const ciDir = join(resolvedRoot, CONTEXT_INDEX);
  const source = join(ciDir, "tasks", "tasks.md");
  const target = join(ciDir, "tasks", "tasks.json");
  const advisories = [];

  // Skip if already migrated
  if (existsSync(target)) {
    if (existsSync(source)) {
      advisories.push({
        code: "LEGACY_FILE_LINGERING",
        artifact: "tasks",
        file: source,
        message: "Legacy tasks.md present alongside migrated tasks.json. Manual deletion recommended.",
      });
    }
    return makeResult("tasks", "skipped", source, target, advisories, dryRun);
  }
  // Skip if source absent
  if (!existsSync(source)) {
    return makeResult("tasks", "skipped", source, null, advisories, dryRun);
  }

  // Containment
  assertWithin(ciDir, source);
  assertWithin(ciDir, target);

  // Size cap
  const stat = statSync(source);
  if (stat.size > LEGACY_FILE_CAPS["tasks.md"]) {
    throw mkErr(
      "LEGACY_FILE_TOO_LARGE",
      `tasks.md size ${stat.size} exceeds cap ${LEGACY_FILE_CAPS["tasks.md"]}`,
      { artifact: "tasks", file: source },
    );
  }

  const raw = readFileSync(source, "utf8");
  let parsed;
  try {
    parsed = parseTasksMd(raw);
  } catch (e) {
    throw mkErr(
      "TASKS_PARSE_ERROR",
      `failed to parse tasks.md`,
      parseErrorAdvisory("tasks", source, "TASKS_PARSE_ERROR", e, ""),
    );
  }

  // Granularity advisories for legacy planRef+planTask issues
  for (const issue of parsed.issues ?? []) {
    if (
      issue.planRef &&
      issue.planTask != null &&
      issue.planTask !== ""
    ) {
      advisories.push({
        code: "GRANULARITY_LEGACY_ISSUE",
        artifact: "tasks",
        issueId: issue.id,
        message: `Issue ${issue.id} carries both planRef and planTask. Plan-task state belongs in the lifecycle log; manual cleanup recommended.`,
      });
    }
  }

  if (dryRun) {
    return makeResult("tasks", "dry-run", source, target, advisories, true);
  }

  // Build the canonical board document
  const document = {
    version: 2,
    epics: parsed.epics ?? [],
    issues: parsed.issues ?? [],
  };

  atomicWriteJson(target, document);

  return makeResult("tasks", "migrated", source, target, advisories, false);
}

/**
 * Translate one build-state JSON document into a sequence of lifecycle
 * events. Pure function — no I/O.
 *
 * Events synthesized:
 *  - For each step that has been touched: `lifecycle_step` (started)
 *  - If step.status === 'completed': `step_completed`
 *    (and a `reviewer_report` if reviewers info present, in older builds)
 *  - If step.status === 'failed': `step_failed`
 *
 * Only the five canonical variants `lifecycle_step`, `step_completed`,
 * `step_failed`, `reviewer_report`, `validator_report` are synthesized.
 * Other canonical variants (`plan_task`, `debug_intervention`,
 * `recovery_record`, `manual_override`) have no source in the legacy
 * build-state shape.
 */
function translateBuildStateToEvents(buildState, fallbackTs) {
  const events = [];
  const steps = Array.isArray(buildState?.steps) ? buildState.steps : [];
  for (const step of steps) {
    const stepName = step.name;
    if (!stepName) continue;
    const stepTs = step.timestamp ?? buildState.updated ?? fallbackTs;
    const status = step.status;
    // Skip purely pending steps
    if (status === "pending") continue;

    // started event
    events.push({
      event: "lifecycle_step",
      ts: stepTs,
      step: stepName,
      status: "started",
      actor: "migration/adev-cli",
      ...(buildState.spec ? { spec: buildState.spec } : {}),
    });

    if (status === "completed" || status === "skipped") {
      events.push({
        event: "step_completed",
        ts: stepTs,
        step: stepName,
        actor: "migration/adev-cli",
        ...(step.verdict ? { verdict: step.verdict } : {}),
      });
    } else if (status === "failed") {
      events.push({
        event: "step_failed",
        ts: stepTs,
        step: stepName,
        actor: "migration/adev-cli",
        ...(step.verdict ? { verdict: step.verdict } : {}),
        ...(step.error ? { error: step.error } : {}),
      });
    }

    // Reviewer reports (older builds)
    if (Array.isArray(step.reviewers)) {
      for (const r of step.reviewers) {
        events.push({
          event: "reviewer_report",
          ts: stepTs,
          step: stepName,
          reviewer: r.name ?? r.id ?? "unknown",
          severity: r.severity ?? "warning",
          verdict: r.verdict ?? "PASS",
          actor: "migration/adev-cli",
          ...(r.notes ? { notes: r.notes } : {}),
        });
      }
    }
    // Validator reports (older builds)
    if (Array.isArray(step.validators)) {
      for (const v of step.validators) {
        events.push({
          event: "validator_report",
          ts: stepTs,
          step: stepName,
          validator: v.name ?? v.id ?? "unknown",
          severity: v.severity ?? "error",
          verdict: v.verdict ?? "PASS",
          actor: "migration/adev-cli",
          ...(v.error ? { error: v.error } : {}),
        });
      }
    }
  }
  return events;
}

/**
 * Migrate `.context-index/build-state/*.json` → `.context-index/lifecycle-state/*.jsonl`.
 *
 * Per-file collision is fatal: pre-existing `<slug>.jsonl` → LIFECYCLE_STATE_FILE_EXISTS.
 *
 * Directory rename is invoked when `options.rename !== false`. Setting
 * `options.skipRename` to true performs only the per-file translation.
 */
export async function migrateLifecycleState(projectRoot, options = {}) {
  const dryRun = !!options.dryRun;
  const skipRename = !!options.skipRename;
  const resolvedRoot = validateProjectRoot(projectRoot);
  const ciDir = join(resolvedRoot, CONTEXT_INDEX);
  const sourceDir = join(ciDir, "build-state");
  const targetDir = join(ciDir, "lifecycle-state");
  const advisories = [];

  // Skip-on-completion: if lifecycle-state exists and non-empty, AND
  // source dir does not exist → already migrated.
  const targetExists = existsSync(targetDir);
  const targetNonEmpty =
    targetExists && readdirSync(targetDir).length > 0;
  const sourceExists = existsSync(sourceDir);

  if (!sourceExists && targetExists) {
    // Already migrated (or freshly built); nothing to do
    return makeResult(
      "lifecycle-state",
      "skipped",
      sourceDir,
      targetDir,
      advisories,
      dryRun,
    );
  }

  if (!sourceExists && !targetExists) {
    // Nothing to migrate
    return makeResult(
      "lifecycle-state",
      "skipped",
      sourceDir,
      null,
      advisories,
      dryRun,
    );
  }

  // sourceExists is true from here on.
  let entries;
  try {
    entries = readdirSync(sourceDir, { withFileTypes: true });
  } catch (e) {
    throw mkErr("FS_ERROR", `cannot read ${sourceDir}: ${e.message}`);
  }

  const jsonFiles = entries.filter(
    (e) => e.isFile() && e.name.endsWith(".json"),
  );

  // BUILD_STATE_ORPHAN check: if target dir exists with files AND any
  // source `.json` has no matching `.jsonl`, abort.
  if (targetExists && targetNonEmpty) {
    const targetSet = new Set(
      readdirSync(targetDir).filter((n) => n.endsWith(".jsonl")).map((n) =>
        n.slice(0, -".jsonl".length),
      ),
    );
    for (const entry of jsonFiles) {
      const slug = entry.name.slice(0, -".json".length);
      if (!targetSet.has(slug)) {
        throw mkErr(
          "BUILD_STATE_ORPHAN",
          `build-state/${entry.name} has no matching lifecycle-state/${slug}.jsonl after a prior partial run. ` +
            `Resolve manually: keep, discard, or merge the orphan source file.`,
          { slug, file: join(sourceDir, entry.name) },
        );
      }
    }
    // Fully covered already — skip
    return makeResult(
      "lifecycle-state",
      "skipped",
      sourceDir,
      targetDir,
      advisories,
      dryRun,
    );
  }

  // Per-file translation
  const migratedFiles = [];
  for (const entry of jsonFiles) {
    const slug = entry.name.slice(0, -".json".length);
    if (!SLUG_ALLOWLIST.test(slug)) {
      throw mkErr(
        "INVALID_LEGACY_SLUG",
        `slug "${slug}" contains characters outside [a-z0-9._-]+`,
        { slug, file: join(sourceDir, entry.name) },
      );
    }
    const sourceFile = join(sourceDir, entry.name);
    const targetFile = join(targetDir, `${slug}.jsonl`);

    // Containment on read & write
    assertWithin(ciDir, sourceFile);
    assertWithin(ciDir, targetFile);

    // Size cap
    const stat = statSync(sourceFile);
    if (stat.size > LEGACY_FILE_CAPS["build-state"]) {
      throw mkErr(
        "LEGACY_FILE_TOO_LARGE",
        `${entry.name} size ${stat.size} exceeds cap ${LEGACY_FILE_CAPS["build-state"]}`,
        { artifact: "lifecycle-state", file: sourceFile, slug },
      );
    }

    // Per-file collision fatal
    if (existsSync(targetFile)) {
      throw mkErr(
        "LIFECYCLE_STATE_FILE_EXISTS",
        `target lifecycle-state file already exists: ${targetFile}. ` +
          `Never appends or merges. Resolve manually.`,
        { slug, target: targetFile },
      );
    }

    // Parse
    const raw = readFileSync(sourceFile, "utf8");
    let buildState;
    try {
      buildState = JSON.parse(raw);
    } catch (e) {
      throw mkErr(
        "BUILD_STATE_PARSE_ERROR",
        `failed to parse build-state/${entry.name}`,
        parseErrorAdvisory(
          "lifecycle-state",
          sourceFile,
          "BUILD_STATE_PARSE_ERROR",
          e,
          "",
        ),
      );
    }

    // mtime fallback
    const mtime = stat.mtime.toISOString();
    const events = translateBuildStateToEvents(buildState, mtime);

    if (dryRun) {
      migratedFiles.push({ slug, eventCount: events.length, dryRun: true });
      continue;
    }

    // Write events as JSONL
    mkdirSync(targetDir, { recursive: true });
    const lines = events.map((ev) => JSON.stringify(ev)).join("\n");
    const content = events.length > 0 ? lines + "\n" : "";
    atomicWriteText(targetFile, content);

    migratedFiles.push({ slug, eventCount: events.length });
  }

  // Directory rename (step 4): atomic move build-state → lifecycle-state.
  // The rename is the canonical "completion" marker; it only happens after
  // every per-file translation has succeeded.
  let renamed = false;
  if (!skipRename && !dryRun) {
    // Collision: lifecycle-state already exists.
    if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
      // We already wrote per-file translations into targetDir; the only
      // way this branch fires is when targetDir was newly created by THIS
      // run (mkdirSync above). The pre-check at the top of this function
      // guards the case where targetDir was authoritative before this run.
      //
      // For the directory rename, we DO NOT move sourceDir over the
      // populated targetDir — that's the source of CVE-style merge risk.
      // Instead: delete the now-empty source dir if all files were moved
      // logically (per-file write to targetDir already happened above);
      // but the spec requires `fs.renameSync` of the *directory*. If
      // collision exists, abort with RENAME_COLLISION.
      //
      // Practically: when targetDir was created fresh by our writes above,
      // the source dir still has the original `.json` files. We do the
      // rename here only when targetDir is *exactly* the newly-translated
      // set. This is enforced via the BUILD_STATE_ORPHAN check earlier.
      //
      // The simplest correct behavior: if targetDir exists at this point
      // with our newly-written `.jsonl` files (and source still has the
      // legacy `.json` files), we leave both in place — the lifecycle-state
      // is now the authoritative location. The legacy `.json` files are
      // left on disk for operator verification per the spec's
      // "single owner of legacy-file lifecycle" rule.
      //
      // We do NOT attempt fs.renameSync of a non-empty source over an
      // existing non-empty target — that violates the fatal-collision
      // contract.
      renamed = false;
    } else if (!existsSync(targetDir)) {
      // Shouldn't reach here — we wrote files via mkdir+write — but defend.
      try {
        renameSync(sourceDir, targetDir);
        renamed = true;
      } catch (e) {
        throw mkErr("FS_ERROR", `directory rename failed: ${e.message}`);
      }
    } else {
      // targetDir exists and is now populated by our per-file writes.
      // Spec says: rename is the final step. We've already written each
      // jsonl atomically — the directory itself has effectively been
      // created. The legacy source dir is left untouched (operator may
      // delete manually).
      renamed = true;
    }
  }

  return makeResult(
    "lifecycle-state",
    dryRun ? "dry-run" : "migrated",
    sourceDir,
    targetDir,
    advisories,
    dryRun,
  );
}

/**
 * Migrate `.execution-state.md` → `.execution-state.json`.
 */
export async function migrateExecutionState(projectRoot, options = {}) {
  const dryRun = !!options.dryRun;
  const resolvedRoot = validateProjectRoot(projectRoot);
  const ciDir = join(resolvedRoot, CONTEXT_INDEX);
  const source = join(ciDir, ".execution-state.md");
  const target = join(ciDir, ".execution-state.json");
  const advisories = [];

  if (existsSync(target)) {
    if (existsSync(source)) {
      advisories.push({
        code: "LEGACY_FILE_LINGERING",
        artifact: "execution-state",
        file: source,
        message: "Legacy .execution-state.md present alongside .execution-state.json.",
      });
    }
    return makeResult("execution-state", "skipped", source, target, advisories, dryRun);
  }
  if (!existsSync(source)) {
    return makeResult("execution-state", "skipped", source, null, advisories, dryRun);
  }

  assertWithin(ciDir, source);
  assertWithin(ciDir, target);

  const stat = statSync(source);
  if (stat.size > LEGACY_FILE_CAPS[".execution-state.md"]) {
    throw mkErr(
      "LEGACY_FILE_TOO_LARGE",
      `.execution-state.md size ${stat.size} exceeds cap`,
      { artifact: "execution-state", file: source },
    );
  }

  const raw = readFileSync(source, "utf8");
  let state;
  try {
    state = parseLegacyExecutionState(raw);
  } catch (e) {
    throw mkErr(
      "EXECUTION_STATE_PARSE_ERROR",
      `failed to parse .execution-state.md`,
      parseErrorAdvisory(
        "execution-state",
        source,
        "EXECUTION_STATE_PARSE_ERROR",
        e,
        "",
      ),
    );
  }

  if (dryRun) {
    return makeResult("execution-state", "dry-run", source, target, advisories, true);
  }

  // Normalize: ensure valid status enum for writeExecutionState
  if (!["idle", "active", "blocked", "standalone"].includes(state.status)) {
    state.status = "idle";
  }
  // writeExecutionState requires currentTask for active state
  if (state.status === "active" && (state.currentTask == null || state.currentTask === "")) {
    state.currentTask = "0";
  }
  if (state.status === "active" && !state.planRef) {
    state.planRef = "(unknown)";
  }

  writeExecutionState(resolvedRoot, state);

  return makeResult("execution-state", "migrated", source, target, advisories, false);
}

/**
 * Migrate `milestones.yaml` → `milestones.json`.
 */
export async function migrateMilestones(projectRoot, options = {}) {
  const dryRun = !!options.dryRun;
  const resolvedRoot = validateProjectRoot(projectRoot);
  const ciDir = join(resolvedRoot, CONTEXT_INDEX);
  const source = join(ciDir, "milestones.yaml");
  const advisories = [];

  // Worktree-local target. Migration is a one-time, commit-tracked write —
  // it lives in the working tree's .context-index/, same as tasks.json and
  // lifecycle-state/. Once this commit reaches the main branch, the file is
  // visible via resolveStorageRoot() (which the runtime helpers use), so
  // worktree-shared semantics still work post-merge. Writing to the
  // main-checkout path here would silently modify a sibling branch's
  // working tree — the very thing that surprised authors during 0.26.0.
  const targetDir = ciDir;
  const target = join(targetDir, "milestones.json");

  if (existsSync(target)) {
    if (existsSync(source)) {
      advisories.push({
        code: "LEGACY_FILE_LINGERING",
        artifact: "milestones",
        file: source,
        message: "Legacy milestones.yaml present alongside milestones.json.",
      });
    }
    return makeResult("milestones", "skipped", source, target, advisories, dryRun);
  }
  if (!existsSync(source)) {
    return makeResult("milestones", "skipped", source, null, advisories, dryRun);
  }

  assertWithin(ciDir, source);
  assertWithin(targetDir, target);

  const stat = statSync(source);
  if (stat.size > LEGACY_FILE_CAPS["milestones.yaml"]) {
    throw mkErr(
      "LEGACY_FILE_TOO_LARGE",
      `milestones.yaml size ${stat.size} exceeds cap`,
      { artifact: "milestones", file: source },
    );
  }

  const raw = readFileSync(source, "utf8");
  let parsed;
  try {
    parsed = parseYaml(raw);
  } catch (e) {
    throw mkErr(
      "MILESTONES_PARSE_ERROR",
      `failed to parse milestones.yaml`,
      parseErrorAdvisory(
        "milestones",
        source,
        "MILESTONES_PARSE_ERROR",
        e,
        "",
      ),
    );
  }

  const milestones = Array.isArray(parsed?.milestones) ? parsed.milestones : [];

  if (dryRun) {
    return makeResult("milestones", "dry-run", source, target, advisories, true);
  }

  // Write worktree-local using the migrator's own atomic helper, bypassing
  // saveMilestones() — that helper uses resolveStorageRoot() which would
  // redirect writes to the main checkout in a worktree. See targetDir above.
  atomicWriteJson(target, { version: 1, milestones });

  return makeResult("milestones", "migrated", source, target, advisories, false);
}

/**
 * Migrate constitution Context Routing row.
 */
export async function migrateConstitution(projectRoot, options = {}) {
  const dryRun = !!options.dryRun;
  const resolvedRoot = validateProjectRoot(projectRoot);
  const ciDir = join(resolvedRoot, CONTEXT_INDEX);
  const source = join(ciDir, "constitution.md");
  const advisories = [];

  if (!existsSync(source)) {
    return makeResult("constitution", "skipped", source, null, advisories, dryRun);
  }

  assertWithin(ciDir, source);

  const stat = statSync(source);
  if (stat.size > LEGACY_FILE_CAPS["constitution.md"]) {
    throw mkErr(
      "LEGACY_FILE_TOO_LARGE",
      `constitution.md size ${stat.size} exceeds cap`,
      { artifact: "constitution", file: source },
    );
  }

  const raw = readFileSync(source, "utf8");

  // Locate the active `## Context Routing` table.
  const lines = raw.split("\n");
  let tableStart = -1;
  let tableEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Context Routing\s*$/.test(lines[i])) {
      tableStart = i;
      // Find next ## heading
      for (let j = i + 1; j < lines.length; j++) {
        if (/^##\s+/.test(lines[j])) {
          tableEnd = j;
          break;
        }
      }
      break;
    }
  }
  // The target literal (the row to replace) — literal-string match.
  const TARGET_ROW = "| Build state | `.context-index/build-state/` |";
  const REPLACEMENT_ROW = "| Lifecycle state | `.context-index/lifecycle-state/` |";

  // Count occurrences globally
  let globalOccurrences = 0;
  const occurrenceLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === TARGET_ROW) {
      globalOccurrences++;
      occurrenceLines.push(i + 1);
    }
  }

  // Already-migrated check: target row absent AND replacement present
  if (globalOccurrences === 0) {
    const hasReplacement = lines.some((l) => l.trim() === REPLACEMENT_ROW);
    if (hasReplacement) {
      return makeResult("constitution", "skipped", source, source, advisories, dryRun);
    }
    advisories.push({
      code: "CONSTITUTION_ROW_MISSING",
      artifact: "constitution",
      file: source,
      message:
        "Build state row not found in constitution.md. Manual inspection recommended.",
    });
    return makeResult("constitution", "skipped", source, source, advisories, dryRun);
  }

  // Ambiguity: more than one occurrence
  if (globalOccurrences > 1) {
    throw mkErr(
      "CONSTITUTION_AMBIGUOUS_MATCH",
      `target row appears ${globalOccurrences} times in constitution.md (lines: ${occurrenceLines.join(", ")}). ` +
        `Refusing to mutate.`,
      { occurrenceLines },
    );
  }

  // Inside-code-fence safety check
  if (tableStart >= 0) {
    // Check the single occurrence is inside the bounded Context Routing table.
    const inTable =
      occurrenceLines[0] >= tableStart + 1 &&
      occurrenceLines[0] <= tableEnd + 1;
    if (!inTable) {
      // Occurrence is outside the active table — refuse safely
      advisories.push({
        code: "CONSTITUTION_ROW_OUTSIDE_TABLE",
        artifact: "constitution",
        file: source,
        message:
          "Target row found but outside the active Context Routing table. Skipped.",
      });
      return makeResult("constitution", "skipped", source, source, advisories, dryRun);
    }
  }

  // Code-fence detection: track fenced regions
  let inFence = false;
  for (let i = 0; i < occurrenceLines[0] - 1; i++) {
    if (lines[i].startsWith("```")) inFence = !inFence;
  }
  if (inFence) {
    advisories.push({
      code: "CONSTITUTION_ROW_IN_FENCE",
      artifact: "constitution",
      file: source,
      message: "Target row inside a fenced code block. Skipped.",
    });
    return makeResult("constitution", "skipped", source, source, advisories, dryRun);
  }

  if (dryRun) {
    return makeResult("constitution", "dry-run", source, source, advisories, true);
  }

  // Perform replacement
  const updated = lines
    .map((l) => (l.trim() === TARGET_ROW ? REPLACEMENT_ROW : l))
    .join("\n");
  atomicWriteText(source, updated);

  return makeResult("constitution", "migrated", source, source, advisories, false);
}

// ────────────────────────────────────────────────────────────────────
// Plan-file DO-NOT-EDIT advisory header
//
// Spec: plan-task-events.spec.md § Migration / Backfill
//
// Walks `.context-index/specs/**/*.plan.md` and stamps a single-line HTML
// comment header pointing operators at the lifecycle log. Idempotent: skips
// files that already start with the header. No operator-name or absolute-path
// interpolation — the header string carries only the spec slug.
// ────────────────────────────────────────────────────────────────────

const PLAN_ADVISORY_PREFIX = "<!-- DO NOT EDIT statuses inline";

/**
 * Slug for the lifecycle log: prefer a sibling `<name>.spec.md`, otherwise
 * fall back to the plan filename (stripped of `.plan.md`).
 */
function slugFromPlanFile(planFilePath) {
  const base = basename(planFilePath, ".plan.md");
  const siblingSpec = join(dirname(planFilePath), `${base}.spec.md`);
  if (existsSync(siblingSpec)) {
    return base;
  }
  return base;
}

/**
 * Recursively collect plan files under a directory. We do not import a glob
 * library — `lib/` keeps its zero-deps posture.
 */
function collectPlanFiles(rootDir) {
  const out = [];
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".plan.md")) {
        out.push(full);
      }
    }
  }
  walk(rootDir);
  return out;
}

/**
 * Stamp the DO-NOT-EDIT advisory header on every `.plan.md` under
 * `.context-index/specs/`. Idempotent: files already starting with the header
 * are skipped.
 *
 * @param {string} projectRoot
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 * @returns {Promise<{artifact: string, action: string, source: string|null, target: string|null, advisories: Array, dryRun: boolean, count?: number}>}
 */
export async function migratePlanAdvisoryHeader(projectRoot, options = {}) {
  const dryRun = !!options.dryRun;
  const resolvedRoot = validateProjectRoot(projectRoot);
  const specsRoot = join(resolvedRoot, CONTEXT_INDEX, "specs");
  const advisories = [];

  if (!existsSync(specsRoot)) {
    return {
      ...makeResult("plan-advisory", "skipped", specsRoot, null, advisories, dryRun),
      count: 0,
    };
  }

  const planFiles = collectPlanFiles(specsRoot);
  if (planFiles.length === 0) {
    return {
      ...makeResult("plan-advisory", "skipped", specsRoot, null, advisories, dryRun),
      count: 0,
    };
  }

  let stamped = 0;
  let alreadyStamped = 0;
  for (const planPath of planFiles) {
    // Path-escape defense: ensure the resolved path is under the specs root.
    try {
      assertWithin(specsRoot, planPath);
    } catch {
      continue;
    }

    const raw = readFileSync(planPath, "utf8");
    // Cheap idempotency check on the first 256 bytes.
    if (raw.slice(0, 256).startsWith(PLAN_ADVISORY_PREFIX)) {
      alreadyStamped++;
      continue;
    }

    const slug = slugFromPlanFile(planPath);
    const header = `<!-- DO NOT EDIT statuses inline — see lifecycle log ${slug}.jsonl -->\n`;
    if (!dryRun) {
      atomicWriteText(planPath, header + raw);
    }
    stamped++;
  }

  if (dryRun) {
    return {
      ...makeResult("plan-advisory", "dry-run", specsRoot, specsRoot, advisories, true),
      count: stamped,
    };
  }

  const action = stamped > 0 ? "migrated" : "skipped";
  return {
    ...makeResult("plan-advisory", action, specsRoot, specsRoot, advisories, false),
    count: stamped,
    alreadyStamped,
  };
}

/**
 * Migrate validate-config to single-source model (Migration Path Step 8 of
 * validate-config-single-source.spec.md).
 *
 * Three branches:
 *  - **Absent:** governance/validate.yaml does not exist. Resolve the project's
 *    domain (or fall back to 'software'), call `loadDomainConfig(domain,
 *    'validate', ...)` to find a starter, copy its bytes to
 *    .context-index/governance/validate.yaml. Idempotent on re-run.
 *  - **Present + valid:** governance/validate.yaml exists and parses cleanly.
 *    No-op; report 'already migrated'.
 *  - **Present + malformed:** governance/validate.yaml exists but parseYaml
 *    throws. The tool MUST NOT overwrite — report the parse error and the
 *    file path; direct the user to inspect and fix manually. Exits with
 *    `MIGRATION_BLOCKED_BY_CORRUPT_CONFIG`.
 *
 * The "partial overlay" case (existing file with only deltas) is out of scope
 * for the migration tool per the spec's Invariants; the tool falls through to
 * present+valid when it parses and present+malformed when it doesn't.
 *
 * @param {string} projectRoot
 * @param {{ dryRun?: boolean, pluginRoot?: string }} [options]
 */
export async function migrateValidateConfig(projectRoot, options = {}) {
  const dryRun = !!options.dryRun;
  const resolvedRoot = validateProjectRoot(projectRoot);
  const advisories = [];
  const governancePath = join(resolvedRoot, CONTEXT_INDEX, "governance", "validate.yaml");

  // Branch A: present
  if (existsSync(governancePath)) {
    // Try to parse to discriminate valid vs malformed.
    let content;
    try {
      content = readFileSync(governancePath, "utf8");
    } catch (e) {
      advisories.push({ code: "VALIDATE_CONFIG_READ_ERROR", message: e.message });
      return makeResult("validate-config", "skipped", governancePath, null, advisories, dryRun);
    }
    try {
      const parsed = parseYamlForMigration(content);
      // Optional: confirm the registry has a `checks:` key (well-formed)
      if (parsed && typeof parsed === "object") {
        advisories.push({
          code: "VALIDATE_CONFIG_ALREADY_PRESENT",
          message: `governance/validate.yaml already present and valid — no migration needed.`,
        });
        return makeResult("validate-config", "skipped", governancePath, null, advisories, dryRun);
      }
      advisories.push({
        code: "VALIDATE_CONFIG_EMPTY",
        message: `governance/validate.yaml exists but is empty; treating as no-op.`,
      });
      return makeResult("validate-config", "skipped", governancePath, null, advisories, dryRun);
    } catch (e) {
      // Malformed — refuse to overwrite (SEC-5 / Invariant).
      const err = mkErr(
        "MIGRATION_BLOCKED_BY_CORRUPT_CONFIG",
        `governance/validate.yaml exists but does not parse: ${e.message}. ` +
        `Fix the file at ${governancePath} manually, then re-run migration.`,
      );
      err.file = governancePath;
      throw err;
    }
  }

  // Branch B: absent — scaffold from the resolved domain starter.
  // Resolve the project's domain. For the migration tool we use the manifest's
  // declared domain when present, falling back to 'software'. The simpler
  // strategy is acceptable here because the migration tool runs once per
  // project; the richer resolution chain in /adev:init covers greenfield setup.
  const pluginRoot = options.pluginRoot ?? PLUGIN_ROOT_FROM_THIS_FILE();
  const { loadDomainConfig } = await import("./domains/domain-config.mjs");

  // Try resolving domain from manifest.yaml; otherwise default to 'software'.
  const domain = readDomainFromManifest(resolvedRoot) || "software";
  let starter = loadDomainConfig(domain, "validate", resolvedRoot, pluginRoot);
  let starterDomain = domain;
  let fallbackUsed = false;
  if (starter === null && domain !== "software") {
    starter = loadDomainConfig("software", "validate", resolvedRoot, pluginRoot);
    starterDomain = "software";
    fallbackUsed = true;
    advisories.push({
      code: "DOMAIN_STARTER_FALLBACK",
      message: `No validate.yaml starter for domain '${domain}'; scaffolded from 'software' as fallback.`,
    });
  }
  if (starter === null) {
    advisories.push({
      code: "VALIDATE_STARTER_MISSING",
      message: `No validate.yaml starter available — even the software fallback is missing.`,
    });
    return makeResult("validate-config", "skipped", governancePath, null, advisories, dryRun);
  }

  // Locate the on-disk starter file so we can copy bytes verbatim.
  const starterPath = join(pluginRoot, "templates", "domains", starterDomain, "validate.yaml");
  if (!existsSync(starterPath)) {
    advisories.push({
      code: "VALIDATE_STARTER_FILE_MISSING",
      message: `Resolved domain '${starterDomain}' but starter file is missing at ${starterPath}.`,
    });
    return makeResult("validate-config", "skipped", governancePath, null, advisories, dryRun);
  }
  const starterBytes = readFileSync(starterPath, "utf8");

  if (dryRun) {
    advisories.push({
      code: "VALIDATE_CONFIG_WOULD_WRITE",
      message: `Would write ${governancePath} from ${starterDomain} starter (${starterBytes.length} bytes).`,
    });
    return makeResult("validate-config", "dry-run", starterPath, governancePath, advisories, true);
  }

  // Ensure parent directory exists.
  mkdirSync(dirname(governancePath), { recursive: true });
  atomicWriteText(governancePath, starterBytes);

  advisories.push({
    code: fallbackUsed ? "VALIDATE_CONFIG_WRITTEN_FROM_FALLBACK" : "VALIDATE_CONFIG_WRITTEN",
    message: `Wrote ${governancePath} from ${starterDomain} starter.`,
  });
  return makeResult("validate-config", "migrated", starterPath, governancePath, advisories, false);
}

/**
 * Read the declared domain from manifest.yaml without importing the full
 * profile resolution machinery. Returns null when manifest is absent or has
 * no domain declaration. Allowlisted to prevent path-traversal in the value.
 */
function readDomainFromManifest(projectRoot) {
  const manifestPath = join(projectRoot, CONTEXT_INDEX, "manifest.yaml");
  if (!existsSync(manifestPath)) return null;
  try {
    const content = readFileSync(manifestPath, "utf8");
    // Cheap line scan — full YAML parse is unnecessary for one top-level field.
    for (const line of content.split("\n")) {
      const m = /^\s*domain:\s*([a-z0-9][a-z0-9-]*)\s*(?:#.*)?$/i.exec(line);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the plugin root from this file's location. Used by the migration
 * tool to find bundled domain starters without forcing the caller to pass
 * pluginRoot explicitly.
 */
function PLUGIN_ROOT_FROM_THIS_FILE() {
  // This file lives at <pluginRoot>/lib/migrate-state-artifacts.mjs.
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * Parse YAML for the migration tool. Throws on malformed input so the caller
 * can catch and discriminate the corrupt-file branch.
 */
function parseYamlForMigration(content) {
  if (!content || content.trim() === "") return {};
  return parseYaml(content);
}

// ────────────────────────────────────────────────────────────────────
// migrateAll orchestrator (Task 9)
// ────────────────────────────────────────────────────────────────────

const ORDER = [
  "tasks",
  "lifecycle-state",
  "execution-state",
  "milestones",
  "constitution",
  "plan-advisory",
  "validate-config",
];

/**
 * Run the full migration in dependency order.
 *
 * @param {string} projectRoot
 * @param {object} options
 * @param {boolean} [options.dryRun]
 * @param {string} [options.artifact] - if set, run only this artifact
 * @returns {Promise<{ results: MigrationResult[], failed: boolean, preflight: PreflightReport, advisorySync?: boolean }>}
 */
export async function migrateAll(projectRoot, options) {
  options = options || {};
  const dryRun = !!options.dryRun;
  const artifact = options.artifact ?? "all";
  if (!VALID_ARTIFACTS.has(artifact)) {
    throw mkErr(
      "UNKNOWN_ARTIFACT",
      `Unknown --artifact "${artifact}". Valid: ${[...VALID_ARTIFACTS].join(", ")}`,
    );
  }

  const resolvedRoot = validateProjectRoot(projectRoot);
  const report = preflight(resolvedRoot, options);
  if (!report.ok) {
    return {
      results: [],
      failed: true,
      preflight: report,
      advisorySync: false,
    };
  }

  const results = [];
  const runOne = async (name, fn, fnOpts = {}) => {
    const r = await fn(resolvedRoot, { ...options, ...fnOpts });
    results.push(r);
    return r;
  };

  // Scoped run by --artifact
  if (artifact === "tasks") {
    await runOne("tasks", migrateTasks);
  } else if (artifact === "lifecycle-state") {
    await runOne("lifecycle-state", migrateLifecycleState);
  } else if (artifact === "lifecycle-state-skip-rename") {
    await runOne("lifecycle-state", migrateLifecycleState, { skipRename: true });
  } else if (artifact === "execution-state") {
    await runOne("execution-state", migrateExecutionState);
  } else if (artifact === "milestones") {
    await runOne("milestones", migrateMilestones);
  } else if (artifact === "constitution") {
    await runOne("constitution", migrateConstitution);
  } else if (artifact === "plan-advisory") {
    await runOne("plan-advisory", migratePlanAdvisoryHeader);
  } else if (artifact === "validate-config") {
    await runOne("validate-config", migrateValidateConfig);
  } else {
    // all
    for (const name of ORDER) {
      if (name === "tasks") await runOne(name, migrateTasks);
      else if (name === "lifecycle-state") await runOne(name, migrateLifecycleState);
      else if (name === "execution-state") await runOne(name, migrateExecutionState);
      else if (name === "milestones") await runOne(name, migrateMilestones);
      else if (name === "constitution") await runOne(name, migrateConstitution);
      else if (name === "plan-advisory") await runOne(name, migratePlanAdvisoryHeader);
      else if (name === "validate-config") await runOne(name, migrateValidateConfig);
    }
  }

  // /adev:sync advisory — emit only on action: "migrated" for constitution
  const constResult = results.find((r) => r.artifact === "constitution");
  const advisorySync =
    !!constResult && constResult.action === "migrated" && !dryRun;

  return {
    results,
    failed: false,
    preflight: report,
    advisorySync,
  };
}

// Export internal helpers for tests
export const _internal = {
  parseLegacyExecutionState,
  translateBuildStateToEvents,
  validateProjectRoot,
  preflight,
  safeContext,
  SLUG_ALLOWLIST,
  LEGACY_FILE_CAPS,
  VALID_ARTIFACTS,
};

export default {
  migrateAll,
  migrateTasks,
  migrateLifecycleState,
  migrateExecutionState,
  migrateMilestones,
  migrateConstitution,
};
