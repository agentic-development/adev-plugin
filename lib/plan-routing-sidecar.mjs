/**
 * Plan-routing sidecar reader/writer.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
 * Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md
 *   Capability: "Plan-adjacent sidecar pattern" (routing peer)
 * ADR: .context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md
 *
 * Persists routing decisions made by `/adev:route` to a sibling sidecar file
 * `<plan-stem>.routing.json` so the plan markdown body stays read-only after
 * authoring (CON-8 in plan-task-events.spec.md). Mirrors the atomic temp-then-
 * rename pattern from `lib/build-state.mjs`.
 *
 * File format (machine-primary; rendered to markdown on demand via
 * `adev route render-sidecar`):
 *
 *   {
 *     "version": 1,
 *     "_generated_by": "/adev:route — do not hand-edit; re-run instead.",
 *     "entries": [
 *       { "task_id": "t1", "selected_agent": "auto-agent",
 *         "scores": { "spec_completeness": 0.9, "pattern_coverage": 0.8,
 *                     "blast_radius": 0.2, "novelty": 0.3 },
 *         "rationale": "..." },
 *       ...
 *     ]
 *   }
 *
 * Surface:
 *   writeRoutingSidecar(planPath, entries)   — atomic write; full replace
 *   readRoutingSidecar(planPath)             — returns sorted entries
 *   lookupRoutingEntry(planPath, taskId)     — returns one entry or throws
 *   sidecarPathFor(planPath)                 — derives the sibling path
 *   renderRoutingMarkdown(entries)           — on-demand markdown view for humans
 *
 * Error codes (set on err.code):
 *   INVALID_PLAN_PATH       — path does not end with .plan.md
 *   INVALID_ROUTING_ENTRY   — entry fails schema validation
 *   INVALID_SIDECAR_JSON    — sidecar file is unparseable or schema-mismatched
 *   SIDECAR_WRITE_FAILED    — atomic rename failed; tmpPath surfaced for inspection
 *   ROUTING_SIDECAR_MISSING — sidecar file does not exist
 *   ROUTING_ENTRY_MISSING   — no entry in the sidecar matches the requested task_id
 *
 * Zero external deps — `node:fs` and `node:crypto` only.
 *
 * @module lib/plan-routing-sidecar
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

const PLAN_SUFFIX = ".plan.md";
const SIDECAR_SUFFIX = ".routing.json";
const SIDECAR_SCHEMA_VERSION = 1;
const GENERATED_BY = "/adev:route — do not hand-edit; re-run instead.";
const REQUIRED_SCORE_DIMENSIONS = [
  "spec_completeness",
  "pattern_coverage",
  "blast_radius",
  "novelty",
];
const MAX_RATIONALE_LEN = 400;

/**
 * Construct an error with a specific `code` property.
 *
 * @param {string} message
 * @param {string} code
 * @returns {Error}
 */
function makeError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Derive the sibling sidecar path for a plan file.
 *
 * @param {string} planPath - path ending in `.plan.md`
 * @returns {string} the sibling `<stem>.routing.json` path
 */
export function sidecarPathFor(planPath) {
  if (typeof planPath !== "string" || !planPath.endsWith(PLAN_SUFFIX)) {
    throw makeError(
      `INVALID_PLAN_PATH: expected path ending in '${PLAN_SUFFIX}', got '${planPath}'`,
      "INVALID_PLAN_PATH",
    );
  }
  return planPath.slice(0, -PLAN_SUFFIX.length) + SIDECAR_SUFFIX;
}

/**
 * Validate a routing entry against the spec schema (Behavior 2).
 *
 * @param {object} entry
 * @throws {Error} with `code: 'INVALID_ROUTING_ENTRY'`
 */
function validateEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw makeError("INVALID_ROUTING_ENTRY: entry must be an object", "INVALID_ROUTING_ENTRY");
  }
  if (typeof entry.task_id !== "string" || !entry.task_id) {
    throw makeError(
      `INVALID_ROUTING_ENTRY: task_id must be a non-empty string (got ${JSON.stringify(entry.task_id)})`,
      "INVALID_ROUTING_ENTRY",
    );
  }
  if (typeof entry.selected_agent !== "string" || !entry.selected_agent) {
    throw makeError(
      `INVALID_ROUTING_ENTRY: selected_agent must be a non-empty string for task ${entry.task_id}`,
      "INVALID_ROUTING_ENTRY",
    );
  }
  if (!entry.scores || typeof entry.scores !== "object") {
    throw makeError(
      `INVALID_ROUTING_ENTRY: scores must be an object for task ${entry.task_id}`,
      "INVALID_ROUTING_ENTRY",
    );
  }
  for (const dim of REQUIRED_SCORE_DIMENSIONS) {
    const v = entry.scores[dim];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      throw makeError(
        `INVALID_ROUTING_ENTRY: scores.${dim} must be a finite number in [0,1] for task ${entry.task_id} (got ${JSON.stringify(v)})`,
        "INVALID_ROUTING_ENTRY",
      );
    }
  }
  if (typeof entry.rationale !== "string") {
    throw makeError(
      `INVALID_ROUTING_ENTRY: rationale must be a string for task ${entry.task_id}`,
      "INVALID_ROUTING_ENTRY",
    );
  }
  if (entry.rationale.length > MAX_RATIONALE_LEN) {
    throw makeError(
      `INVALID_ROUTING_ENTRY: rationale exceeds ${MAX_RATIONALE_LEN} chars for task ${entry.task_id}`,
      "INVALID_ROUTING_ENTRY",
    );
  }
}

/**
 * Normalize an entry into the canonical key order written to disk. JSON
 * preserves key order on stringify, so this gives us deterministic output
 * regardless of how the caller built the entry object.
 */
function normalizeEntry(e) {
  return {
    task_id: e.task_id,
    selected_agent: e.selected_agent,
    scores: {
      spec_completeness: e.scores.spec_completeness,
      pattern_coverage: e.scores.pattern_coverage,
      blast_radius: e.scores.blast_radius,
      novelty: e.scores.novelty,
    },
    rationale: e.rationale,
  };
}

/**
 * Render the sidecar JSON body. Output is deterministic: entries sorted by
 * `task_id` ascending; each entry uses a fixed key order. Pretty-printed with
 * two-space indent so a casual `cat`/`less` is readable without `jq`.
 *
 * @param {object[]} entries
 * @returns {string}
 */
function renderSidecarJson(entries) {
  const sorted = entries
    .slice()
    .sort((a, b) => String(a.task_id).localeCompare(String(b.task_id)))
    .map(normalizeEntry);
  const doc = {
    version: SIDECAR_SCHEMA_VERSION,
    _generated_by: GENERATED_BY,
    entries: sorted,
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

/**
 * Parse the sidecar JSON body back into entry objects. Validates schema
 * version, top-level shape, and each entry — surfaces INVALID_SIDECAR_JSON
 * on any mismatch so callers can distinguish "missing" from "broken".
 *
 * @param {string} body
 * @returns {object[]}
 */
function parseSidecarJson(body) {
  let doc;
  try {
    doc = JSON.parse(body);
  } catch (cause) {
    throw makeError(
      `INVALID_SIDECAR_JSON: failed to parse sidecar JSON: ${cause.message}`,
      "INVALID_SIDECAR_JSON",
    );
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw makeError(
      "INVALID_SIDECAR_JSON: top-level must be an object",
      "INVALID_SIDECAR_JSON",
    );
  }
  if (doc.version !== SIDECAR_SCHEMA_VERSION) {
    throw makeError(
      `INVALID_SIDECAR_JSON: unsupported schema version ${JSON.stringify(doc.version)} (expected ${SIDECAR_SCHEMA_VERSION})`,
      "INVALID_SIDECAR_JSON",
    );
  }
  if (!Array.isArray(doc.entries)) {
    throw makeError(
      "INVALID_SIDECAR_JSON: 'entries' must be an array",
      "INVALID_SIDECAR_JSON",
    );
  }
  for (const e of doc.entries) validateEntry(e);
  return doc.entries
    .slice()
    .sort((a, b) => String(a.task_id).localeCompare(String(b.task_id)));
}

/**
 * Atomically write the routing sidecar for a plan.
 *
 * Writes to `<sidecar>.<rand>.tmp` then renames to the final path. On
 * rename failure, the tmp file is left for inspection (matching the
 * partial-artifact / build-state convention) and an `SIDECAR_WRITE_FAILED`
 * error is thrown.
 *
 * @param {string} planPath
 * @param {object[]} entries
 */
export function writeRoutingSidecar(planPath, entries) {
  const sidecarPath = sidecarPathFor(planPath);
  if (!Array.isArray(entries)) {
    throw makeError("INVALID_ROUTING_ENTRY: entries must be an array", "INVALID_ROUTING_ENTRY");
  }
  for (const e of entries) validateEntry(e);

  const body = renderSidecarJson(entries);
  const tmpPath = `${sidecarPath}.${randomBytes(6).toString("hex")}.tmp`;

  // Ensure the parent directory exists (the plan typically lives under a
  // managed specs/ directory, but defensive mkdir keeps the writer usable
  // from tests + edge cases).
  mkdirSync(dirname(sidecarPath), { recursive: true });
  writeFileSync(tmpPath, body);

  try {
    renameSync(tmpPath, sidecarPath);
  } catch (cause) {
    const err = makeError(
      `SIDECAR_WRITE_FAILED: rename(${tmpPath} → ${sidecarPath}) failed: ${cause.message}`,
      "SIDECAR_WRITE_FAILED",
    );
    err.tmpPath = tmpPath;
    err.cause = cause;
    throw err;
  }
}

/**
 * Read the routing sidecar for a plan.
 *
 * @param {string} planPath
 * @returns {object[]} entries sorted by task_id ascending
 * @throws {Error} with `code: 'ROUTING_SIDECAR_MISSING'` when the sidecar
 *   file does not exist, or `code: 'INVALID_SIDECAR_JSON'` when present but
 *   unparseable / schema-mismatched.
 */
export function readRoutingSidecar(planPath) {
  const sidecarPath = sidecarPathFor(planPath);
  if (!existsSync(sidecarPath)) {
    throw makeError(
      `ROUTING_SIDECAR_MISSING: ${sidecarPath} not found — run /adev:route against the plan`,
      "ROUTING_SIDECAR_MISSING",
    );
  }
  const body = readFileSync(sidecarPath, "utf8");
  return parseSidecarJson(body);
}

/**
 * Look up a single routing entry by `task_id`.
 *
 * @param {string} planPath
 * @param {string} taskId
 * @returns {object}
 * @throws {Error} `ROUTING_SIDECAR_MISSING` if the sidecar is absent;
 *   `ROUTING_ENTRY_MISSING` if no entry matches;
 *   `INVALID_SIDECAR_JSON` if the sidecar is present but unparseable.
 */
export function lookupRoutingEntry(planPath, taskId) {
  const entries = readRoutingSidecar(planPath);
  const found = entries.find((e) => e.task_id === taskId);
  if (!found) {
    throw makeError(
      `ROUTING_ENTRY_MISSING: no entry for task_id '${taskId}' in ${sidecarPathFor(planPath)} — re-run /adev:route`,
      "ROUTING_ENTRY_MISSING",
    );
  }
  return found;
}

/**
 * Render a human-readable markdown view of the routing entries. The persisted
 * sidecar is JSON; this helper is used by `adev route render-sidecar` to
 * produce a markdown table on demand (mirrors the markdown-rendering-layer
 * pattern used for tasks.json and the lifecycle log).
 *
 * @param {object[]} entries — typically the array returned by readRoutingSidecar
 * @returns {string} markdown body (no trailing newline)
 */
export function renderRoutingMarkdown(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "# Routing Sidecar\n\n_(no entries)_\n";
  }
  const sorted = entries
    .slice()
    .sort((a, b) => String(a.task_id).localeCompare(String(b.task_id)));
  const lines = [
    "<!-- Rendered from .routing.json by `adev route render-sidecar`. Do not hand-edit; re-run /adev:route. -->",
    "",
    "# Routing Sidecar",
    "",
    "| Task | Agent | spec | pattern | blast | novelty | Rationale |",
    "|------|-------|------|---------|-------|---------|-----------|",
  ];
  for (const e of sorted) {
    const s = e.scores;
    const rationale = String(e.rationale ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ");
    lines.push(
      `| ${e.task_id} | ${e.selected_agent} | ${s.spec_completeness} | ${s.pattern_coverage} | ${s.blast_radius} | ${s.novelty} | ${rationale} |`,
    );
  }
  return lines.join("\n") + "\n";
}

// Re-export the helper so callers needing cleanup (e.g. on SIDECAR_WRITE_FAILED)
// can unlink leftover tmp files without re-implementing the path math.
export function unlinkSidecarTmp(tmpPath) {
  try {
    unlinkSync(tmpPath);
  } catch (err) {
    if (err && err.code === "ENOENT") return;
    throw err;
  }
}

export default {
  sidecarPathFor,
  writeRoutingSidecar,
  readRoutingSidecar,
  lookupRoutingEntry,
  renderRoutingMarkdown,
  unlinkSidecarTmp,
};
