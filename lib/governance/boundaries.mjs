/**
 * Boundary compliance — do the changed files violate a rule the project
 * declared in `.context-index/governance/boundaries.yaml`?
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 *
 * Before this module the only thing that read `boundaries.yaml` was a markdown
 * check body asking an LLM subagent to "run regex `pattern` against file
 * contents, respecting `exclude` globs" — a predicate dispatched as reasoning.
 * This is the predicate. It is a **pure evaluator**: it reads a registry and a
 * caller-supplied file list, and returns a verdict. It writes nothing, dispatches
 * nothing, and has no coupling to the diagnostics registry — ADR-0010's deferred
 * consolidation of `boundaries.yaml` into `diagnostics.yaml` is meant to WRAP
 * this rather than reimplement it.
 *
 * ## SKIP is not PASS
 *
 * A project declaring no rules gets `SKIP`, never `PASS`. A PASS would assert
 * that boundaries were checked; nothing was checked. (Behavior 1 / AC: "Check 8
 * records SKIP, not PASS, on an empty `boundaries.yaml`".)
 *
 * ## boundaries.yaml is marker-EXEMPT — do not add a marker guard here
 *
 * `review.yaml`, `diagnostics.yaml` and `gates.yaml` acquire a
 * `materialized_at` marker and their loaders raise `REGISTRY_NOT_MATERIALIZED`
 * without one. `boundaries.yaml` and `validate.yaml` are **exempt** (SA-2, spec
 * Behavior 11): both are already explicit single-source, so there is no
 * implicit-to-explicit transition for a marker to record. Adding a marker guard
 * here would make the empty-registry SKIP above unreachable on the current tree
 * — the loader would halt the caller instead of reaching it. This comment is
 * here so nobody adds one later.
 *
 * ## Failing closed
 *
 * Three things are deliberately loud rather than silent, because each silent
 * variant is a way to switch a merge gate off without editing the registry:
 *
 *   - **Invalid pattern** → `INVALID_BOUNDARY_PATTERN`, thrown before ANY file
 *     is opened. Every pattern is compiled up front; a broken rule refuses the
 *     whole run rather than yielding a partial evaluation that looks complete.
 *   - **Budget exceeded** → the worker is terminated and a `BOUNDARY_PATTERN_TIMEOUT`
 *     finding is recorded at `error` severity whatever the rule's own severity,
 *     so a pattern that cannot be evaluated can never be reported as clean.
 *   - **Oversize input** (SEC-3) → a finding at the RULE'S OWN severity naming
 *     file and rule. The originally specified behaviour — skip the file — meant
 *     padding a file past the cap silently disabled every boundary rule on it.
 *
 * Binary content (DDR-14) is the one skip, and it is still reported: an `info`
 * finding, which never moves a verdict.
 *
 * Zero external dependencies (Constitution Principle 1): `RegExp`, `node:fs`,
 * `node:path`, `node:worker_threads`.
 *
 * @module lib/governance/boundaries
 */

import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { Worker } from "node:worker_threads";

import { parseYaml } from "../profiles/yaml.mjs";

/** Project-relative location of the boundary registry. */
export const DEFAULT_BOUNDARIES_PATH = ".context-index/governance/boundaries.yaml";

/**
 * Largest file a boundary rule will be evaluated against, in bytes (spec AC 12).
 * Checked with `statSync().size` BEFORE the file is read, so an oversize file is
 * never loaded into memory. Exceeding it is a FINDING, not a skip.
 */
export const MAX_INPUT_BYTES = 1024 * 1024;

/** Per-file, per-rule evaluation budget in milliseconds (spec AC 12). */
export const PER_FILE_BUDGET_MS = 250;

/** Bytes sniffed for a NUL when deciding whether a file is binary (DDR-14). */
export const BINARY_SNIFF_BYTES = 8192;

/** Longest matched line retained on a finding. Keeps findings bounded. */
export const MAX_MATCHED_LINE_CHARS = 240;

/** Severity of a rule that does not declare one. Fails closed. */
const DEFAULT_SEVERITY = "error";

const VALID_SEVERITIES = new Set(["error", "warning"]);

// A worker boots in tens of milliseconds; the per-task budget must not start
// ticking until it says it is ready, or a slow machine would report a timeout
// for a pattern that never ran. This is the separate, generous ceiling on the
// boot itself, so a worker that never boots still cannot hang the caller.
const WORKER_STARTUP_BUDGET_MS = 30_000;

// One worker handles a run of tasks so a full tracked-file list does not cost
// one thread spawn per file. Both caps bound the structured clone into the
// worker: `content` is copied once per task in the chunk.
const MAX_CHUNK_TASKS = 64;
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

const WORKER_PATH = new URL("./boundary-worker.mjs", import.meta.url);

/**
 * Finding codes. Stable strings; callers (Task 9's check body, Task 14, Task 18)
 * may match on them.
 */
export const BOUNDARY_CODES = Object.freeze({
  MATCH: "BOUNDARY_RULE_MATCH",
  TIMEOUT: "BOUNDARY_PATTERN_TIMEOUT",
  TOO_LARGE: "BOUNDARY_INPUT_TOO_LARGE",
  BINARY: "BOUNDARY_BINARY_SKIPPED",
  WORKER_ERROR: "BOUNDARY_WORKER_ERROR",
});

/**
 * @typedef {object} BoundaryFinding
 * @property {string} file Project-relative, POSIX-separated path.
 * @property {string|null} ruleId The rule that produced it (`null` for a
 *   file-level note such as a binary skip).
 * @property {"error"|"warning"|"info"} severity Drives the verdict: any `error`
 *   makes it FAIL, any `warning` (with no error) makes it WARN, `info` never
 *   moves it.
 * @property {number|null} line 1-based line number of the match.
 * @property {string|null} matchedLine The matched line's text, truncated to
 *   {@link MAX_MATCHED_LINE_CHARS}.
 * @property {string} message Human-readable explanation.
 * @property {string} code One of {@link BOUNDARY_CODES}.
 */

/**
 * @typedef {object} BoundaryResult
 * @property {"SKIP"|"PASS"|"WARN"|"FAIL"} verdict
 * @property {string} reason
 * @property {BoundaryFinding[]} findings Ordered FILE-MAJOR, RULE-MINOR: files
 *   in the order the caller supplied them (after de-duplication), and within a
 *   file, rules in `boundaries.yaml` declaration order. Deterministic across
 *   runs — evaluation is concurrent with nothing.
 */

/**
 * Evaluate every declared boundary rule against an explicit list of files.
 *
 * The file list is a PARAMETER, not something this function derives: the CLI
 * verb (`adev boundaries check`) owns the git-diff default, `/adev:validate`
 * Check 8 passes the changed set it already knows, and Task 14 passes the full
 * tracked-file list. Keeping derivation out here is what makes the evaluator
 * pure and reusable.
 *
 * @param {string} projectRoot Project root, absolute or relative.
 * @param {object} [options]
 * @param {string[]} [options.changed] Files to evaluate, project-relative or
 *   absolute. Paths outside the project root are refused. Missing paths (a
 *   deleted file still named in a diff) are ignored.
 * @param {string} [options.boundariesPath] Override the registry location.
 * @returns {Promise<BoundaryResult>}
 * @throws {Error} `code: "INVALID_BOUNDARY_PATTERN"` — a rule is malformed or
 *   its pattern/flags do not compile. Thrown BEFORE any file is opened; the
 *   error carries no partial findings.
 * @throws {Error} `code: "BOUNDARY_PATH_ESCAPE"` — a supplied path escapes the
 *   project root.
 * @throws {Error} `code: "BOUNDARIES_PARSE_ERROR"` — the registry is not
 *   parseable YAML.
 */
export async function checkBoundaries(projectRoot, options = {}) {
  const absRoot = resolve(projectRoot);
  const rules = loadRules(absRoot, options.boundariesPath ?? DEFAULT_BOUNDARIES_PATH);

  // Behavior 1. Nothing is read and no worker is spawned: the caller learns that
  // no boundary was checked, which is not the same as every boundary holding.
  if (rules.length === 0) {
    return { verdict: "SKIP", reason: "no boundary rules declared", findings: [] };
  }

  const changed = normalizeChanged(absRoot, options.changed ?? []);
  const { findings, tasks } = collectInputs(absRoot, changed, rules);
  findings.push(...(await evaluateTasks(tasks)));

  findings.sort((a, b) => a._f - b._f || a._r - b._r);
  const ordered = findings.map(({ _f, _r, ...f }) => f);

  const errors = ordered.filter((f) => f.severity === "error").length;
  const warnings = ordered.filter((f) => f.severity === "warning").length;

  if (errors > 0) {
    return {
      verdict: "FAIL",
      reason:
        `${errors} error-severity boundary finding(s) across ${changed.length} ` +
        `changed file(s) and ${rules.length} rule(s)`,
      findings: ordered,
    };
  }
  if (warnings > 0) {
    return {
      verdict: "WARN",
      reason:
        `${warnings} warning-severity boundary finding(s) across ${changed.length} ` +
        `changed file(s) and ${rules.length} rule(s)`,
      findings: ordered,
    };
  }
  return {
    verdict: "PASS",
    reason: `no boundary violations in ${changed.length} changed file(s) against ${rules.length} rule(s)`,
    findings: ordered,
  };
}

// ── registry ────────────────────────────────────────────────────────────────

/**
 * Read and fully validate the rule list.
 *
 * Validation is total and up front: `new RegExp(pattern, flags)` is called for
 * EVERY rule here, before the caller opens a single file. That is what makes
 * "no partial evaluation" true rather than aspirational.
 *
 * `enabled: false` disables a rule (the field is in the registry's
 * FIELD_ALLOWLIST and the validate loader already honours it). A registry whose
 * every rule is disabled has no rules, and therefore SKIPs.
 *
 * NOTE: no `materialized_at` check — see the module header. `boundaries.yaml` is
 * marker-exempt by SA-2.
 *
 * @param {string} absRoot
 * @param {string} boundariesPath
 * @returns {Array<{id: string, severity: string, pattern: string, flags: string,
 *                  exclude: string[], description: string|null}>}
 */
function loadRules(absRoot, boundariesPath) {
  const abs = isAbsolute(boundariesPath) ? boundariesPath : resolve(absRoot, boundariesPath);
  assertContained(absRoot, abs, boundariesPath);

  let raw;
  try {
    raw = readFileSync(abs, "utf8");
  } catch {
    return [];
  }
  if (raw.trim() === "") return [];

  let doc;
  try {
    doc = parseYaml(raw);
  } catch (parseErr) {
    const err = new Error(parseErr?.message ?? String(parseErr));
    err.code = "BOUNDARIES_PARSE_ERROR";
    throw err;
  }

  const declared = doc?.boundaries;
  if (!Array.isArray(declared)) return [];

  const rules = [];
  for (let i = 0; i < declared.length; i++) {
    const entry = declared[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw invalidPattern(`boundaries[${i}] is not a rule map`);
    }
    if (entry.enabled === false) continue;

    const where = typeof entry.id === "string" && entry.id ? `rule "${entry.id}"` : `boundaries[${i}]`;
    if (typeof entry.id !== "string" || entry.id.trim() === "") {
      throw invalidPattern(`${where}: missing a string "id"`);
    }
    if (typeof entry.pattern !== "string" || entry.pattern === "") {
      throw invalidPattern(`${where}: missing a string "pattern"`);
    }
    const severity = entry.severity ?? DEFAULT_SEVERITY;
    if (typeof severity !== "string" || !VALID_SEVERITIES.has(severity)) {
      throw invalidPattern(`${where}: severity must be "error" or "warning"`);
    }
    const flags = entry.flags ?? "";
    if (typeof flags !== "string") {
      throw invalidPattern(`${where}: "flags" must be a string`);
    }
    let exclude = [];
    if (entry.exclude !== undefined && entry.exclude !== null) {
      if (!Array.isArray(entry.exclude) || entry.exclude.some((g) => typeof g !== "string")) {
        throw invalidPattern(`${where}: "exclude" must be a list of glob strings`);
      }
      exclude = entry.exclude;
    }

    // Compiling is safe; only EXECUTING a pattern can run away, and that happens
    // in the worker. A pattern that will not compile refuses the run right here.
    try {
      new RegExp(entry.pattern, flags);
    } catch (compileErr) {
      throw invalidPattern(`${where}: ${compileErr?.message ?? String(compileErr)}`);
    }

    rules.push({
      id: entry.id,
      severity,
      pattern: entry.pattern,
      flags,
      exclude,
      description: typeof entry.description === "string" ? entry.description : null,
    });
  }
  return rules;
}

function invalidPattern(message) {
  const err = new Error(message);
  err.code = "INVALID_BOUNDARY_PATTERN";
  return err;
}

// ── inputs ──────────────────────────────────────────────────────────────────

/**
 * Normalize the caller's file list: contain it, make it project-relative and
 * POSIX-separated, and de-duplicate it while preserving the caller's order
 * (which the finding order then inherits).
 *
 * @param {string} absRoot
 * @param {string[]} changed
 * @returns {string[]}
 */
function normalizeChanged(absRoot, changed) {
  const seen = new Set();
  const out = [];
  for (const entry of changed) {
    if (typeof entry !== "string" || entry.trim() === "") continue;
    const abs = isAbsolute(entry) ? resolve(entry) : resolve(absRoot, entry);
    assertContained(absRoot, abs, entry);
    const rel = abs.slice(absRoot.length + 1).split(sep).join("/");
    if (rel === "" || seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
  }
  return out;
}

function assertContained(absRoot, abs, original) {
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) {
    const err = new Error(`path escapes the project root: ${original}`);
    err.code = "BOUNDARY_PATH_ESCAPE";
    throw err;
  }
}

/**
 * Decide, per file, what will actually be evaluated.
 *
 * The order matters and is the SEC-3 fix: `statSync` first (so an oversize file
 * is never read), then the binary sniff on the first {@link BINARY_SNIFF_BYTES},
 * then the read. A file that fails either check produces findings instead of
 * tasks, so no rule silently goes unevaluated.
 *
 * @returns {{findings: object[], tasks: object[]}}
 */
function collectInputs(absRoot, changed, rules) {
  const findings = [];
  const tasks = [];

  for (let fileIdx = 0; fileIdx < changed.length; fileIdx++) {
    const file = changed[fileIdx];
    const applicable = [];
    for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
      if (!isExcluded(rules[ruleIdx], file)) applicable.push({ ruleIdx, rule: rules[ruleIdx] });
    }
    if (applicable.length === 0) continue;

    const abs = join(absRoot, file);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      // A path named in a diff that no longer exists (deleted, renamed away).
      // There is no content to evaluate and nothing to report.
      continue;
    }
    if (!stat.isFile()) continue;

    if (stat.size > MAX_INPUT_BYTES) {
      for (const { ruleIdx, rule } of applicable) {
        findings.push({
          _f: fileIdx,
          _r: ruleIdx,
          file,
          ruleId: rule.id,
          severity: rule.severity,
          line: null,
          matchedLine: null,
          message:
            `${file} is ${stat.size} bytes, which exceeds the input cap of ` +
            `${MAX_INPUT_BYTES} bytes, so rule "${rule.id}" could not be evaluated against it`,
          code: BOUNDARY_CODES.TOO_LARGE,
        });
      }
      continue;
    }

    if (looksBinary(abs, stat.size)) {
      findings.push({
        _f: fileIdx,
        _r: -1,
        file,
        ruleId: null,
        severity: "info",
        line: null,
        matchedLine: null,
        message: `${file} contains a NUL byte in its first ${BINARY_SNIFF_BYTES} bytes and was skipped as binary`,
        code: BOUNDARY_CODES.BINARY,
      });
      continue;
    }

    let content;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    for (const { ruleIdx, rule } of applicable) {
      tasks.push({ fileIdx, ruleIdx, file, rule, content });
    }
  }

  return { findings, tasks };
}

/** DDR-14: a NUL in the first {@link BINARY_SNIFF_BYTES} means binary. */
function looksBinary(abs, size) {
  if (size === 0) return false;
  const length = Math.min(size, BINARY_SNIFF_BYTES);
  const buf = Buffer.allocUnsafe(length);
  let fd;
  try {
    fd = openSync(abs, "r");
    const read = readSync(fd, buf, 0, length, 0);
    return buf.subarray(0, read).includes(0);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* the descriptor is already gone; nothing to release */
      }
    }
  }
}

/**
 * Glob matching for `exclude`, over the project-relative POSIX path.
 * Supports `**`, `*` and `?` — the same subset the review registry uses.
 */
function isExcluded(rule, file) {
  return rule.exclude.some((glob) => globToRegExp(glob).test(file));
}

function globToRegExp(pattern) {
  let re = "^";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      re += ".*";
      i += 2;
      if (pattern[i] === "/") i++;
      continue;
    }
    if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if ("^$.+(){}[]\\|".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
    i++;
  }
  return new RegExp(re + "$");
}

// ── evaluation ──────────────────────────────────────────────────────────────

/**
 * Run every task through worker threads, one chunk at a time.
 *
 * Termination is what bounds this. The worker reports each task as it finishes,
 * and the parent re-arms a {@link PER_FILE_BUDGET_MS} timer on each report. When
 * the timer fires the worker is terminated mid-regex — `worker.terminate()`
 * stops the V8 isolate, which is the only way to interrupt a synchronous
 * catastrophic backtrack — the in-flight task becomes a fail-closed finding, and
 * a FRESH worker resumes from the next task. So the total cost is bounded by
 * `tasks.length × PER_FILE_BUDGET_MS` in the worst case, and one blown budget
 * never abandons the remaining rules.
 *
 * @param {object[]} tasks
 * @returns {Promise<object[]>} findings
 */
async function evaluateTasks(tasks) {
  const findings = [];
  let cursor = 0;

  while (cursor < tasks.length) {
    const chunk = tasks.slice(cursor, chunkEnd(tasks, cursor));
    const outcome = await runChunk(chunk);

    for (const result of outcome.results) {
      if (result.index === null || result.index === undefined) continue;
      const task = chunk[result.i];
      const { line, matchedLine } = locate(task.content, result.index);
      findings.push({
        _f: task.fileIdx,
        _r: task.ruleIdx,
        file: task.file,
        ruleId: task.rule.id,
        severity: task.rule.severity,
        line,
        matchedLine,
        message:
          `${task.file}:${line} matches boundary rule "${task.rule.id}"` +
          (task.rule.description ? ` — ${task.rule.description}` : ""),
        code: BOUNDARY_CODES.MATCH,
      });
    }

    cursor += outcome.completed;

    if (outcome.interrupted && cursor < tasks.length) {
      // The task the worker was executing when its budget expired (or when the
      // worker died). Fails closed at `error` severity regardless of the rule's
      // own severity: a pattern that could not be evaluated must never be
      // reportable as clean.
      const task = tasks[cursor];
      const timedOut = !outcome.error;
      findings.push({
        _f: task.fileIdx,
        _r: task.ruleIdx,
        file: task.file,
        ruleId: task.rule.id,
        severity: "error",
        line: null,
        matchedLine: null,
        message: timedOut
          ? `boundary rule "${task.rule.id}" exceeded its ${PER_FILE_BUDGET_MS} ms budget on ` +
            `${task.file}; the worker was terminated and the check fails closed`
          : `boundary rule "${task.rule.id}" could not be evaluated against ${task.file}: ` +
            `${outcome.error}; the check fails closed`,
        code: timedOut ? BOUNDARY_CODES.TIMEOUT : BOUNDARY_CODES.WORKER_ERROR,
      });
      cursor += 1;
    }
  }

  return findings;
}

function chunkEnd(tasks, cursor) {
  let bytes = 0;
  let i = cursor;
  while (i < tasks.length && i - cursor < MAX_CHUNK_TASKS) {
    bytes += tasks[i].content.length;
    i++;
    if (bytes >= MAX_CHUNK_BYTES) break;
  }
  return Math.max(i, cursor + 1);
}

/**
 * Execute one chunk in a single worker.
 *
 * @param {object[]} chunk
 * @returns {Promise<{completed: number, results: object[], interrupted: boolean,
 *                    error: string|null}>}
 *   `completed` counts the tasks that reported; `interrupted` is true when the
 *   worker was terminated before reporting them all.
 */
function runChunk(chunk) {
  return new Promise((settle) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: {
        tasks: chunk.map((t) => ({
          pattern: t.rule.pattern,
          flags: t.rule.flags,
          content: t.content,
        })),
      },
    });

    const results = [];
    let done = false;
    let timer = null;

    const finish = (interrupted, error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker.removeAllListeners();
      worker.terminate().catch(() => {
        /* the worker already exited; nothing left to terminate */
      });
      settle({ completed: results.length, results, interrupted, error: error ?? null });
    };

    const arm = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(true, null), ms);
    };

    arm(WORKER_STARTUP_BUDGET_MS);

    worker.on("message", (msg) => {
      if (msg?.type === "ready") {
        arm(PER_FILE_BUDGET_MS);
        return;
      }
      if (msg?.type === "result") {
        results.push(msg);
        arm(PER_FILE_BUDGET_MS);
        return;
      }
      if (msg?.type === "done") finish(false, null);
    });
    worker.on("error", (err) => finish(true, err?.message ?? String(err)));
    worker.on("exit", () => finish(true, "the boundary worker exited before finishing"));
  });
}

/**
 * Turn a match offset into a 1-based line number and the matched line's text.
 * Done in the parent, which already holds the content — only a number crosses
 * back from the worker.
 */
function locate(content, index) {
  const before = content.slice(0, index);
  const line = before.split("\n").length;
  const start = before.lastIndexOf("\n") + 1;
  let end = content.indexOf("\n", index);
  if (end < 0) end = content.length;
  let matchedLine = content.slice(start, end).replace(/\r$/, "");
  if (matchedLine.length > MAX_MATCHED_LINE_CHARS) {
    matchedLine = matchedLine.slice(0, MAX_MATCHED_LINE_CHARS) + "…";
  }
  return { line, matchedLine };
}
