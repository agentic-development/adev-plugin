// lib/cost-summary.mjs
//
// Per-spec / per-step cost aggregator for the cost-ticker capability
// (.context-index/specs/features/session-awareness/cost-ticker.spec.md).
//
// Performs a single-pass line-stream read of
// `<projectRoot>/.context-index/.session-tracking.jsonl`, filters entries
// by `spec_ref` (or by the spec's bound Feature work-item ID), groups
// them by the most recent preceding `lifecycle_step started` event read
// from `<root>/.context-index/lifecycle-state/<slug>.jsonl`, and returns
// a JSON-shape object matching Behavior 3.
//
// Contract:
//   - Read-only — no on-disk writes anywhere in this module.
//   - 1 MB per-line cap (SEC-1): lines exceeding the cap are counted in
//     `skipped_lines` and dropped before JSON.parse is attempted.
//   - JSON.parse failures are counted in `skipped_lines` and the line
//     is dropped. The aggregator never throws on individual malformed
//     lines.
//   - Slug derivation uses `slugFromSpec()` from lib/lifecycle-state.mjs
//     (SA-2 resolution from review).
//
// Zero new external dependencies. Pure ESM.

import { existsSync, readFileSync, openSync, closeSync, readSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { slugFromSpec } from "./lifecycle-state.mjs";
import { loadManifest } from "./manifest.mjs";
import { getIssueManager } from "./issues/registry.mjs";

const MAX_LINE_BYTES = 1024 * 1024; // 1 MB per SEC-1
const READ_CHUNK_BYTES = 64 * 1024; // 64 KB read buffer

const CANONICAL_STEPS = new Set(["review", "plan", "route", "implement", "validate"]);

/**
 * @typedef {object} UsageTotals
 * @property {number} input_tokens
 * @property {number} output_tokens
 * @property {number} cache_read_tokens
 * @property {number} cache_creation_tokens
 * @property {number} cost_usd
 * @property {number} wall_seconds
 */

/**
 * @typedef {object} Checkpoint
 * @property {string} step
 * @property {number} input_tokens
 * @property {number} output_tokens
 * @property {number} cache_read_tokens
 * @property {number} cache_creation_tokens
 * @property {number} cost_usd
 * @property {number} wall_seconds
 */

/**
 * @typedef {object} ModelBreakdownEntry
 * @property {string} model
 * @property {number} cost_usd
 * @property {number} share  // 0..1 rounded to 3 decimals
 */

/**
 * @typedef {object} AggregateResult
 * @property {string|null}        spec
 * @property {string|null}        issue_id
 * @property {UsageTotals|null}   totals          null when no matching entries
 * @property {Checkpoint[]}       checkpoints
 * @property {ModelBreakdownEntry[]} model_breakdown
 * @property {number}             skipped_lines
 */

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

function round3(n) {
  return Math.round(n * 1e3) / 1e3;
}

function emptyTotalsAccumulator() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    cost_usd: 0,
    wall_seconds: 0,
  };
}

function addUsage(acc, usage) {
  acc.input_tokens += Number(usage?.input_tokens) || 0;
  acc.output_tokens += Number(usage?.output_tokens) || 0;
  acc.cache_read_tokens += Number(usage?.cache_read_tokens) || 0;
  acc.cache_creation_tokens += Number(usage?.cache_creation_tokens) || 0;
  acc.cost_usd += Number(usage?.cost_usd) || 0;
}

/**
 * Stream-style line reader with a per-line byte cap. Returns lines as
 * UTF-8 strings (sans newline). Oversized lines (> MAX_LINE_BYTES of
 * pre-newline bytes) are reported via `onOversize()` and dropped.
 *
 * Implementation: open + readSync in 64 KB chunks. Avoids pulling
 * the whole file into memory and never instantiates a buffer larger
 * than MAX_LINE_BYTES + READ_CHUNK_BYTES.
 *
 * @param {string} path
 * @param {(line: string) => void} onLine
 * @param {() => void} onOversize  Called once per oversized line.
 */
function readLines(path, onLine, onOversize) {
  const stat = statSync(path);
  if (stat.size === 0) return;

  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(READ_CHUNK_BYTES);
    let carry = Buffer.alloc(0);
    let oversized = false;

    while (true) {
      const bytesRead = readSync(fd, buf, 0, READ_CHUNK_BYTES, null);
      if (bytesRead === 0) break;

      let start = 0;
      for (let i = 0; i < bytesRead; i += 1) {
        if (buf[i] === 0x0a /* \n */) {
          const segment = buf.slice(start, i);
          let lineBuf;
          if (carry.length > 0) {
            lineBuf = Buffer.concat([carry, segment]);
            carry = Buffer.alloc(0);
          } else {
            lineBuf = segment;
          }
          if (oversized) {
            // Already counted; reset and continue.
            oversized = false;
          } else if (lineBuf.length > MAX_LINE_BYTES) {
            onOversize();
          } else if (lineBuf.length > 0) {
            onLine(lineBuf.toString("utf8"));
          }
          start = i + 1;
        }
      }
      // Carry over the partial line.
      const remainder = buf.slice(start, bytesRead);
      if (carry.length + remainder.length > MAX_LINE_BYTES) {
        // We can't keep buffering. Mark oversized; we'll skip the next
        // newline boundary as malformed.
        if (!oversized) {
          onOversize();
          oversized = true;
        }
        carry = Buffer.alloc(0);
      } else {
        carry = carry.length === 0 ? Buffer.from(remainder) : Buffer.concat([carry, remainder]);
      }
    }

    // Trailing line (no terminating newline).
    if (carry.length > 0) {
      if (carry.length > MAX_LINE_BYTES) {
        onOversize();
      } else {
        onLine(carry.toString("utf8"));
      }
    }
  } finally {
    closeSync(fd);
  }
}

/**
 * Read lifecycle_step `started` events for the spec, sorted ascending
 * by timestamp. Steps not in CANONICAL_STEPS are skipped.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @returns {{ ts: number, step: string }[]}
 */
function readStepBoundaries(projectRoot, specPath) {
  let slug;
  try {
    slug = slugFromSpec(specPath);
  } catch {
    return [];
  }
  const logPath = join(projectRoot, ".context-index", "lifecycle-state", `${slug}.jsonl`);
  if (!existsSync(logPath)) return [];

  const events = [];
  let raw;
  try {
    raw = readFileSync(logPath, "utf8");
  } catch {
    return [];
  }
  for (const line of raw.split("\n")) {
    if (!line) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      ev?.event === "lifecycle_step" &&
      ev.status === "started" &&
      typeof ev.step === "string" &&
      CANONICAL_STEPS.has(ev.step) &&
      typeof ev.ts === "string"
    ) {
      const ts = Date.parse(ev.ts);
      if (!Number.isNaN(ts)) events.push({ ts, step: ev.step });
    }
  }
  events.sort((a, b) => a.ts - b.ts);
  return events;
}

/**
 * Find the most recent preceding step boundary for a given timestamp.
 * Returns "ungrouped" when no boundary precedes.
 *
 * @param {{ ts: number, step: string }[]} boundaries  Sorted ascending.
 * @param {number} entryTs
 * @returns {string}
 */
function checkpointFor(boundaries, entryTs) {
  let current = "ungrouped";
  for (const b of boundaries) {
    if (b.ts <= entryTs) current = b.step;
    else break;
  }
  return current;
}

/**
 * Resolve the spec's bound Feature work-item ID via the issue manager,
 * or null if unavailable / unsupported. Tolerates missing `tasks.backend`
 * (returns null) and missing `findBySpecRef` method (returns null).
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @returns {Promise<string|null>}
 */
async function resolveIssueId(projectRoot, specPath) {
  let manifest;
  try {
    manifest = loadManifest(projectRoot);
  } catch {
    return null;
  }
  if (!manifest?.tasks?.backend) return null;

  let mgr;
  try {
    mgr = getIssueManager(manifest, projectRoot);
  } catch {
    return null;
  }
  if (typeof mgr?.findBySpecRef !== "function") return null;

  try {
    const result = await mgr.findBySpecRef(specPath);
    if (result === null || result === undefined) return null;
    // Adapter may return an issue object or a bare ID.
    if (typeof result === "string") return result;
    return result.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the default `--since` cutoff from the spec's lifecycle log
 * (most recent `review:started`). Returns null when no such event exists.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @returns {number|null}  Millisecond timestamp.
 */
function defaultSinceFromReview(projectRoot, specPath) {
  const boundaries = readStepBoundaries(projectRoot, specPath);
  // Most recent review:started.
  for (let i = boundaries.length - 1; i >= 0; i -= 1) {
    if (boundaries[i].step === "review") return boundaries[i].ts;
  }
  return null;
}

/**
 * Main aggregator entry point.
 *
 * @param {object}   opts
 * @param {string}   opts.projectRoot   Absolute or relative project root.
 * @param {string=}  opts.specPath      Spec path; mutually exclusive with epicId.
 * @param {string=}  opts.epicId        Epic ID; mutually exclusive with specPath.
 * @param {string|null=} opts.since     ISO-8601 timestamp; explicit null disables default.
 * @returns {Promise<AggregateResult>}
 */
export async function aggregate(opts = {}) {
  const projectRoot = resolve(opts.projectRoot ?? process.cwd());
  const specPath = opts.specPath ?? null;
  const epicId = opts.epicId ?? null;

  // Resolve `since`:
  //   - explicit `null` disables the filter entirely
  //   - explicit string → parse to ms
  //   - undefined → default from review:started (specPath only)
  let sinceMs = null;
  if (opts.since === null) {
    sinceMs = null;
  } else if (typeof opts.since === "string") {
    const parsed = Date.parse(opts.since);
    sinceMs = Number.isNaN(parsed) ? null : parsed;
  } else if (opts.since === undefined && specPath) {
    sinceMs = defaultSinceFromReview(projectRoot, specPath);
  }

  // Resolve issue binding (best-effort, never throws).
  let issueId = null;
  let epicMemberIds = null;
  if (specPath) {
    issueId = await resolveIssueId(projectRoot, specPath);
  } else if (epicId) {
    // For --epic, collect all member work-item IDs.
    try {
      const manifest = loadManifest(projectRoot);
      if (manifest?.tasks?.backend) {
        const mgr = getIssueManager(manifest, projectRoot);
        if (typeof mgr?.walkTree === "function") {
          const members = await mgr.walkTree(epicId);
          epicMemberIds = new Set([epicId, ...members.map((m) => m.id ?? m).filter(Boolean)]);
        }
      }
    } catch {
      epicMemberIds = null;
    }
  }

  // Read step boundaries once for checkpoint grouping.
  const boundaries = specPath ? readStepBoundaries(projectRoot, specPath) : [];

  const totals = emptyTotalsAccumulator();
  const perStep = new Map(); // step → UsageTotals accumulator
  const perModel = new Map(); // modelId → cost_usd
  let matched = 0;
  let skipped = 0;
  let minTs = Number.POSITIVE_INFINITY;
  let maxTs = Number.NEGATIVE_INFINITY;

  const jsonlPath = join(projectRoot, ".context-index", ".session-tracking.jsonl");

  if (existsSync(jsonlPath)) {
    readLines(
      jsonlPath,
      (line) => {
        let entry;
        try {
          entry = JSON.parse(line);
        } catch {
          skipped += 1;
          return;
        }
        if (!entry || typeof entry !== "object") {
          skipped += 1;
          return;
        }

        // Filter: --epic takes precedence; otherwise match spec_ref OR issue_id.
        let match = false;
        if (epicMemberIds) {
          if (entry.issue && epicMemberIds.has(entry.issue)) match = true;
        } else if (specPath) {
          if (entry.spec_ref === specPath) match = true;
          else if (issueId && entry.issue === issueId) match = true;
        } else {
          // No filter — accept all (used for unfiltered totals; not exposed via CLI today).
          match = true;
        }
        if (!match) return;

        // Apply `since` filter (entry timestamps may be absent).
        const entryTsStr = entry.timestamp;
        let entryTs = null;
        if (typeof entryTsStr === "string") {
          const t = Date.parse(entryTsStr);
          if (!Number.isNaN(t)) entryTs = t;
        }
        if (sinceMs !== null && entryTs !== null && entryTs < sinceMs) return;

        matched += 1;
        addUsage(totals, entry.usage);

        if (entryTs !== null) {
          if (entryTs < minTs) minTs = entryTs;
          if (entryTs > maxTs) maxTs = entryTs;
        }

        // Per-step bucket.
        const step = entryTs !== null ? checkpointFor(boundaries, entryTs) : "ungrouped";
        if (!perStep.has(step)) perStep.set(step, emptyTotalsAccumulator());
        addUsage(perStep.get(step), entry.usage);
        // Track wall time per step too.
        const stepBucket = perStep.get(step);
        if (entryTs !== null) {
          if (stepBucket._minTs === undefined || entryTs < stepBucket._minTs) stepBucket._minTs = entryTs;
          if (stepBucket._maxTs === undefined || entryTs > stepBucket._maxTs) stepBucket._maxTs = entryTs;
        }

        // Per-model accumulator.
        const model = typeof entry.model === "string" ? entry.model : "unknown";
        perModel.set(model, (perModel.get(model) ?? 0) + (Number(entry.usage?.cost_usd) || 0));
      },
      () => {
        skipped += 1;
      },
    );
  }

  if (matched === 0) {
    return {
      spec: specPath ? resolve(projectRoot, specPath) : null,
      issue_id: issueId,
      totals: null,
      checkpoints: [],
      model_breakdown: [],
      skipped_lines: skipped,
    };
  }

  // Finalize totals.
  totals.cost_usd = round6(totals.cost_usd);
  totals.wall_seconds =
    minTs !== Number.POSITIVE_INFINITY && maxTs !== Number.NEGATIVE_INFINITY
      ? Math.max(0, Math.round((maxTs - minTs) / 1000))
      : 0;

  // Build checkpoints array, ordered by canonical step order then ungrouped last.
  const stepOrder = ["review", "plan", "route", "implement", "validate", "ungrouped"];
  const checkpoints = [];
  for (const step of stepOrder) {
    if (!perStep.has(step)) continue;
    const bucket = perStep.get(step);
    const wallSeconds =
      bucket._minTs !== undefined && bucket._maxTs !== undefined
        ? Math.max(0, Math.round((bucket._maxTs - bucket._minTs) / 1000))
        : 0;
    checkpoints.push({
      step,
      input_tokens: bucket.input_tokens,
      output_tokens: bucket.output_tokens,
      cache_read_tokens: bucket.cache_read_tokens,
      cache_creation_tokens: bucket.cache_creation_tokens,
      cost_usd: round6(bucket.cost_usd),
      wall_seconds: wallSeconds,
    });
  }
  // Append any unknown steps (defensive — should not happen with current
  // grouping, but keeps the contract: every matched entry contributes).
  for (const [step] of perStep) {
    if (!stepOrder.includes(step)) {
      const bucket = perStep.get(step);
      const wallSeconds =
        bucket._minTs !== undefined && bucket._maxTs !== undefined
          ? Math.max(0, Math.round((bucket._maxTs - bucket._minTs) / 1000))
          : 0;
      checkpoints.push({
        step,
        input_tokens: bucket.input_tokens,
        output_tokens: bucket.output_tokens,
        cache_read_tokens: bucket.cache_read_tokens,
        cache_creation_tokens: bucket.cache_creation_tokens,
        cost_usd: round6(bucket.cost_usd),
        wall_seconds: wallSeconds,
      });
    }
  }

  // Model breakdown: sort by cost descending.
  const totalCost = totals.cost_usd > 0 ? totals.cost_usd : 0;
  const model_breakdown = [...perModel.entries()]
    .map(([model, cost]) => ({
      model,
      cost_usd: round6(cost),
      share: totalCost > 0 ? round3(cost / totalCost) : 0,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  return {
    spec: specPath ? resolve(projectRoot, specPath) : null,
    issue_id: issueId,
    totals,
    checkpoints,
    model_breakdown,
    skipped_lines: skipped,
  };
}

export default { aggregate };
