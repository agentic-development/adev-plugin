/**
 * Boundary-rule regex worker.
 *
 * A STATIC file on disk (review finding SEC-5). It is spawned as
 * `new Worker(WORKER_PATH, { workerData })` from lib/governance/boundaries.mjs
 * — never from a source string, and never with the Worker option that would let
 * one be supplied. The only thing that crosses the boundary is DATA: a pattern,
 * its flags, and file content. The
 * regex is built with `new RegExp(pattern, flags)` and nothing else. There is no
 * dynamic code construction here, and `tests/governance/boundaries.test.mjs`
 * asserts that by reading this file's source.
 *
 * The worker exists so a catastrophically-backtracking pattern can be
 * TERMINATED rather than awaited: a regex that never returns burns this thread,
 * not the caller's. The parent arms a per-task timer and calls `terminate()`
 * when it expires.
 *
 * Protocol (all messages to the parent):
 *   { type: "ready" }                       once, before the first task
 *   { type: "result", i, index|null }       one per task, IN ORDER
 *   { type: "done" }                        after the last task
 *
 * `index` is the character offset of the first match, or null for no match. The
 * parent turns an offset into a line number and a matched line — it already
 * holds the content, so nothing but a number needs to come back.
 *
 * @module lib/governance/boundary-worker
 */

import { parentPort, workerData } from "node:worker_threads";

const tasks = Array.isArray(workerData?.tasks) ? workerData.tasks : [];

parentPort.postMessage({ type: "ready" });

for (let i = 0; i < tasks.length; i++) {
  const task = tasks[i];
  const re = new RegExp(task.pattern, task.flags ?? "");
  const m = re.exec(task.content);
  parentPort.postMessage({ type: "result", i, index: m ? m.index : null });
}

parentPort.postMessage({ type: "done" });
