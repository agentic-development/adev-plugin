// Plan task ids are spelled three ways for the same task: the plan's own
// headings and `## Parallelization` lines say `Task 1`, lib/parallel/groups.mjs
// extracts a bare `1` from those, and /adev:route writes `t1` into the routing
// sidecar (and agents pass `t1` as `--task-id`). Every site where one of these
// spellings meets another must compare through taskIdKey(), never with `===`
// on the raw strings: a raw comparison silently misses and the caller falls
// into its "no entry" branch (e.g. the batching gate's `routing-unusable`).
//
// The key is only a comparison form. Callers keep emitting the spelling they
// received; the sidecar's on-disk `t<n>` format is unchanged.

const PREFIX_RE = /^(?:task[\s_-]*|t)(?=\d)/i;

/**
 * Canonical comparison key for a plan task id: `t1`, `T1`, `1`, `Task 1`, and
 * `task-1` all map to `"1"`; hierarchical and suffixed ids keep their tail
 * (`t1.2` -> `"1.2"`, `Task 9b` -> `"9b"`). A value with no recognisable
 * prefix is returned trimmed and lower-cased, so unrelated ids never collide.
 *
 * @param {unknown} taskId
 * @returns {string}
 */
export function taskIdKey(taskId) {
  if (taskId == null) return "";
  return String(taskId).trim().replace(PREFIX_RE, "").toLowerCase();
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function sameTaskId(a, b) {
  const ka = taskIdKey(a);
  return ka !== "" && ka === taskIdKey(b);
}

/**
 * The plan heading number (`### Task <n>`) a task id refers to, or null when
 * the id is not a plain integer task (e.g. `t9b`, `t1.2`, or a slug), since
 * plan task-body headings are matched on `\d+` only.
 *
 * @param {unknown} taskId
 * @returns {string|null}
 */
export function taskHeadingNumber(taskId) {
  const key = taskIdKey(taskId);
  return /^\d+$/.test(key) ? key : null;
}

/**
 * Re-key a task-id-indexed object by taskIdKey(). When two spellings collapse
 * to the same key (`"1"` and `"t1"` both present), `prefer(existing, incoming)`
 * picks the value to keep; by default the first-inserted value wins.
 *
 * @template T
 * @param {Record<string, T>|null|undefined} byTaskId
 * @param {{ prefer?: (existing: T, incoming: T) => T }} [opts]
 * @returns {Map<string, T>}
 */
export function indexByTaskIdKey(byTaskId, { prefer } = {}) {
  const out = new Map();
  if (!byTaskId || typeof byTaskId !== "object") return out;
  for (const [id, value] of Object.entries(byTaskId)) {
    const key = taskIdKey(id);
    if (key === "") continue;
    if (!out.has(key)) out.set(key, value);
    else if (prefer) out.set(key, prefer(out.get(key), value));
  }
  return out;
}
