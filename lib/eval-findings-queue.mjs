/**
 * Durable fallback queue for eval findings discovered while the issue board
 * is unreachable.
 *
 * A manual Tier B / operator-half eval pass can surface real product
 * defects while `br`/the configured backend is in a sync-conflict or
 * otherwise unreachable state. Before this module, that meant writing the
 * finding into markdown prose and hoping a later session noticed —
 * `tier-b-2026-09-07-01.md` recorded 11 findings this way, and they sat
 * unfiled for the rest of that day (adev-plugin-tierb-findings-queue-bsb9).
 *
 * Owns the append-only JSONL queue at
 * `.context-index/evals/pending-findings.jsonl`. Draining an entry (filing
 * it as a real board issue) removes its line via a full rewrite — this
 * queue is expected to hold at most a handful of entries at a time, so a
 * rewrite-on-drain is simpler than a tombstone scheme and cheap enough not
 * to matter.
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/eval-findings-queue
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { codedError as mkErr } from "./errors.mjs";

/**
 * Resolve the path to the pending-findings JSONL queue for a project root.
 * @param {string} projectRoot
 * @returns {string}
 */
export function resolveQueuePath(projectRoot) {
  return join(projectRoot, ".context-index", "evals", "pending-findings.jsonl");
}

/**
 * Read and parse every valid line in the queue. Corrupted lines are skipped
 * with a logged warning — fail-open, matching bugfix-loop-attempts.mjs's own
 * tolerance for a log a concurrent writer partially wrote.
 *
 * @param {string} projectRoot
 * @returns {object[]} findings in file order (oldest first)
 */
export function listFindings(projectRoot) {
  const queuePath = resolveQueuePath(projectRoot);
  if (!existsSync(queuePath)) return [];
  const raw = readFileSync(queuePath, "utf8");
  const findings = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // eslint-disable-next-line no-console
      console.warn(`[eval-findings-queue] skipping corrupted line in ${queuePath}`);
      continue;
    }
    if (!parsed || typeof parsed.id !== "string") continue;
    findings.push(parsed);
  }
  return findings;
}

/**
 * Append one finding to the queue.
 *
 * @param {string} projectRoot
 * @param {{ title: string, description: string, severity?: string, module?: string, source?: string }} finding
 * @returns {object} the written record, with `id` and `queued_at` assigned
 * @throws {Error} `EVAL_FINDING_INVALID` when `title` or `description` is missing/blank
 */
export function appendFinding(projectRoot, finding) {
  if (!finding || typeof finding.title !== "string" || finding.title.trim() === "") {
    throw mkErr("EVAL_FINDING_INVALID", "a finding requires a non-empty title");
  }
  if (typeof finding.description !== "string" || finding.description.trim() === "") {
    throw mkErr("EVAL_FINDING_INVALID", "a finding requires a non-empty description");
  }

  const record = {
    id: randomBytes(4).toString("hex"),
    title: finding.title,
    description: finding.description,
    queued_at: new Date().toISOString(),
  };
  if (finding.severity !== undefined) record.severity = finding.severity;
  if (finding.module !== undefined) record.module = finding.module;
  if (finding.source !== undefined) record.source = finding.source;

  const queuePath = resolveQueuePath(projectRoot);
  mkdirSync(dirname(queuePath), { recursive: true });
  appendFileSync(queuePath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

/**
 * Remove one finding from the queue by id (drains it after filing as a
 * real board issue). A full rewrite, not an in-place edit — see module doc.
 *
 * @param {string} projectRoot
 * @param {string} id
 * @returns {boolean} true when a matching finding was found and removed
 */
export function removeFinding(projectRoot, id) {
  const findings = listFindings(projectRoot);
  const remaining = findings.filter((f) => f.id !== id);
  if (remaining.length === findings.length) return false;

  const queuePath = resolveQueuePath(projectRoot);
  const body = remaining.map((f) => JSON.stringify(f)).join("\n");
  writeFileSync(queuePath, remaining.length > 0 ? `${body}\n` : "", "utf8");
  return true;
}
