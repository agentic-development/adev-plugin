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

import { SUPPORTED_BACKENDS, DEFAULT_BACKEND, getIssueManager } from "../issues/registry.mjs";

const READONLY_BACKENDS = new Set(["file"]);

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

  // ---------------------------------------------------------------------
  // Plan-tasks 5-8: dry-run path, live loop, dependency replay, report.
  // ---------------------------------------------------------------------
  console.error(
    "MIGRATE_NOT_IMPLEMENTED: arguments validated and source read " +
      `(source='${source}', target='${opts.to}', issues=${sourceState.issues.length}, ` +
      `epics=${sourceState.epics.length}, dryRun=${opts.dryRun}, ` +
      `includeClosed=${opts.includeClosed}). Implementation continues in plan-tasks 5-8.`,
  );
  return 1;
}

export default { run, help, parseArgs, readSource };
