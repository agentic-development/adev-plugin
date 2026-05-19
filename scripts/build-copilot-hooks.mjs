// Build step: derive providers/copilot/hooks.json from canonical hooks/hooks.json.
//
// Pure Node built-ins only. The pure transform `buildCopilotHooks(canonical)`
// is library-testable; `main()` handles I/O, path containment, and atomic
// write. The entrypoint try/catches the whole body and converts throws into
// `process.exit(1)` with `err.message` on stderr, per spec throw-vs-exit
// semantics.
//
// Spec: .context-index/specs/features/copilot-provider/copilot-hook-generator.spec.md

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EVENT_TABLE, validate, lookupEvent } from "../lib/providers/copilot/event-table.mjs";
import { TOOL_NAMES } from "../lib/providers/copilot/tool-names.mjs";
import { rewriteMatcher } from "../lib/providers/copilot/matcher.mjs";

// Eager-import duplicate validation. Aborts the entrypoint at module load
// time (before any output is attempted) if the translation table contains
// a duplicate claudeEvent key — surfaces DUPLICATE_EVENT_MAPPING from the
// shared validator.
validate(EVENT_TABLE);

/** Hardcoded defaults (Per-Field Source Mapping table). */
export const DEFAULT_TYPE = "command";
export const DEFAULT_CWD = ".";
export const DEFAULT_TIMEOUT_SEC = 30;

/**
 * Recursively sort object keys for byte-deterministic JSON output.
 * Arrays preserve element order (canonical hook ordering is meaningful).
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysDeep(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Pure transform: canonical hooks.json shape → Copilot hooks.json shape.
 *
 * @param {{ hooks?: Record<string, Array<{matcher?: string, hooks?: Array<{type: string, command: string, env?: object, timeoutSec?: number}>}>> }} canonical
 * @returns {{ version: 1, hooks: Record<string, Array<object>> }}
 * @throws {Error} `UNKNOWN_EVENT: <claudeEvent>` when an event has no row in EVENT_TABLE
 * @throws {Error} `UNMAPPED_TOOL_NAME: <tok>` / `MATCHER_TOO_LARGE: ...` from rewriteMatcher
 */
export function buildCopilotHooks(canonical) {
  const outHooks = {};
  for (const [claudeEvent, entries] of Object.entries(canonical.hooks || {})) {
    const row = lookupEvent(claudeEvent);
    if (!row) {
      throw new Error(`UNKNOWN_EVENT: ${claudeEvent}`);
    }
    if (!row.cloudAgentSafe) {
      // Cloud-Agent-unsafe events are dropped: emit nothing for the event.
      continue;
    }
    const copilotEvent = row.copilotEvent;
    for (const entry of entries) {
      const claudeMatcher = entry.matcher ?? "";
      const copilotMatcher = rewriteMatcher(claudeMatcher, TOOL_NAMES);
      for (const hook of entry.hooks || []) {
        const out = {
          type: DEFAULT_TYPE,
          bash: hook.command,
          cwd: DEFAULT_CWD,
          matcher: copilotMatcher,
          timeoutSec:
            hook.timeoutSec ??
            row.defaultTimeoutSec ??
            DEFAULT_TIMEOUT_SEC,
        };
        if (hook.env !== undefined) {
          out.env = hook.env;
        }
        if (!outHooks[copilotEvent]) outHooks[copilotEvent] = [];
        outHooks[copilotEvent].push(out);
      }
    }
  }
  // Deterministic key ordering at every level.
  return sortKeysDeep({ version: 1, hooks: outHooks });
}

/** Plugin root: parent of scripts/. */
const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function main() {
  const canonicalPath = path.join(PLUGIN_ROOT, "hooks", "hooks.json");
  if (!existsSync(canonicalPath)) {
    throw new Error(`MISSING_CANONICAL: ${canonicalPath}`);
  }
  let canonical;
  try {
    canonical = JSON.parse(readFileSync(canonicalPath, "utf8"));
  } catch (err) {
    const rel = path.relative(PLUGIN_ROOT, canonicalPath);
    throw new Error(`${rel}: ${err.message}`);
  }

  const result = buildCopilotHooks(canonical);

  // Path containment: refuse to write outside PLUGIN_ROOT.
  const outputPath = path.resolve(PLUGIN_ROOT, "providers/copilot/hooks.json");
  if (!outputPath.startsWith(PLUGIN_ROOT + path.sep)) {
    throw new Error(`OUTPUT_PATH_ESCAPE: ${outputPath}`);
  }

  mkdirSync(path.dirname(outputPath), { recursive: true });

  // Atomic write: temp file in same directory + rename.
  const body = JSON.stringify(result, null, 2) + "\n";
  const tmp = `${outputPath}.tmp.${process.pid}`;
  writeFileSync(tmp, body, { mode: 0o644 });
  renameSync(tmp, outputPath);
}

// ESM "run only when invoked as a script" idiom.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
