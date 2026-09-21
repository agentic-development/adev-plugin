/**
 * Read-trace capture for skill-disclosure evals.
 *
 * Progressive disclosure moves prose an agent needs only sometimes into
 * `references/`, leaving a one-line summary and a pointer in the body. The
 * regression that creates is invisible to every prose assertion in this repo: the
 * agent reads the summary, never opens the companion, and silently skips the step.
 * The instruction still ships. The test still passes.
 *
 * What makes that observable is the `PostToolUse` hook with matcher `.*`, which runs
 * `hooks/session-capture.sh` and appends `{tool, files, timestamp}` to
 * `.context-index/.session-tracking.jsonl` for EVERY tool call — including calls made
 * by dispatched subagents (verified empirically 2026-08-19: a subagent Read landed in
 * the log with its absolute path). So the trace is OBSERVED, not self-reported, which
 * matters — an agent asked to report what it read can be wrong or agreeable.
 *
 * Two phases, because a node test cannot dispatch a model:
 *
 *   A. in-session — `snapshot()` before the run, `since()` after, write the result to
 *      `tests/evals/skill-disclosure/traces/<scenario>.json`
 *   B. in CI      — the eval compares that recorded trace against a baseline
 *
 * Pure Node built-ins.
 *
 * @module lib/eval/read-trace
 */

import { existsSync, readFileSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";

/** Default location of the capture log the PostToolUse hook writes. */
export function trackingLogPath(projectRoot) {
  return join(projectRoot, ".context-index", ".session-tracking.jsonl");
}

/**
 * Number of entries currently in the log — the "before" mark for a capture window.
 * A missing log is 0, not an error: the hook may simply not have fired yet.
 */
export function snapshot(projectRoot) {
  const p = trackingLogPath(projectRoot);
  if (!existsSync(p)) return 0;
  return readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).length;
}

/**
 * Files read since `mark`, as repo-relative paths.
 *
 * Only `Read` entries count. Bash `cat`/`sed` are deliberately NOT treated as reads:
 * a skill that shells out to inspect a companion is doing something different from
 * following a conditional-loading pointer, and conflating them would let a regression
 * hide behind an unrelated grep.
 *
 * @returns {{all: string[], companions: string[], bodies: string[]}}
 */
export function since(projectRoot, mark, opts = {}) {
  const p = trackingLogPath(projectRoot);
  if (!existsSync(p)) return { all: [], companions: [], bodies: [] };

  const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).slice(mark);
  const all = [];
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.tool !== "Read") continue;
    for (const f of e.files ?? []) {
      const rel = isAbsolute(f) ? relative(projectRoot, f) : f;
      if (!rel.startsWith("..")) all.push(rel);
    }
  }
  let uniq = [...new Set(all)];

  // Concurrent captures share one log. Filtering by skill keeps two scenarios
  // dispatched at the same time separable, which matters because the log has no
  // per-agent key — a capture window alone cannot tell two runs apart.
  if (opts.skill) {
    const own = new RegExp(`^skills/${opts.skill}/`);
    uniq = uniq.filter((f) => own.test(f));
  }

  return {
    all: uniq,
    companions: uniq.filter((f) => /^skills\/[a-z-]+\/(references|scripts)\//.test(f)),
    bodies: uniq.filter((f) => /^skills\/[a-z-]+\/SKILL\.md$/.test(f)),
  };
}

/**
 * Compare an observed companion set against a baseline.
 *
 * `missing` is the regression that matters: a companion the baseline says this path
 * requires, which the agent did not open. `extra` is reported but is NOT a failure —
 * an agent reading more than the minimum is doing its job, and failing on it would
 * make the baseline a straitjacket that discourages thoroughness.
 *
 * @param {string[]} observed repo-relative companion paths actually read
 * @param {{required: string[]}} baseline
 */
export function compareToBaseline(observed, baseline) {
  const seen = new Set(observed);
  const missing = (baseline.required ?? []).filter((f) => !seen.has(f));
  const extra = observed.filter((f) => !(baseline.required ?? []).includes(f));
  return { missing, extra, ok: missing.length === 0 };
}
