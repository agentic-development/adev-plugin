/**
 * Loop-convergence detector for `/adev:build --full` BLOCK→revise auto-retry.
 *
 * Task 11 of review-block-auto-retry.plan.md. Owned by the
 * `strategic-planning` charter (SA-3 ownership note).
 *
 * Pure functions over canonical `blocker_id` sets — no I/O. The build
 * orchestrator computes `prev_blockers` (rev N's blocker IDs) and
 * `curr_blockers` (rev N+1's blocker IDs), then asks this module:
 *
 *   1. `partitionBlockers(prev, curr) → { addressed, persistent, new_ }`
 *   2. `evaluateStopCondition({...}) → { stop, verdict }`
 *
 * Verdicts (closed set):
 *   - PASS                 — review verdict is PASS, loop ends successfully
 *   - PASS_PENDING_HUMAN   — PASS reached with --require-human-final-pass on
 *   - NOT_CONVERGING       — loop-eligible blocker count non-decreasing for
 *                            `not_converging_window` consecutive cycles
 *   - NO_PROGRESS          — addressed == ∅ AND new == ∅ AND persistent == prev
 *   - REGRESSED            — |new_| > |addressed|
 *   - BUDGET_EXHAUSTED     — retries_remaining === 0 AND not PASS
 *   - CONTINUE             — loop continues with another `/adev:specify --revise` cycle
 *
 * Precedence when multiple conditions are true, evaluated in this exact
 * order — the first match wins (selected to surface the most actionable
 * signal to the operator):
 *
 *   1. PASS / PASS_PENDING_HUMAN   (always wins if verdict is PASS)
 *   2. NOT_CONVERGING               (blocker count is stuck/climbing — the
 *                                    reviser is churning without shrinking
 *                                    the pile; per BEH-9 / TR-4 this is
 *                                    evaluated BEFORE NO_PROGRESS, because
 *                                    `persistent == prev_blockers` is
 *                                    structurally near-unreachable against
 *                                    an LLM reviser that always responds to
 *                                    every listed blocker — NOT_CONVERGING
 *                                    is the reachable stall signal)
 *   3. NO_PROGRESS                  (operator must intervene — stuck)
 *   4. REGRESSED                    (operator may want to revert)
 *   5. BUDGET_EXHAUSTED             (operator may raise the cap)
 *   6. CONTINUE                     (default)
 *
 * Note: BEH-7's inner mechanism-existence-check round-trip (a fixed cap of
 * 3 attempts per revision, distinct from `retries_remaining`) is a SEPARATE
 * counter owned and evaluated by the caller (the build orchestrator)
 * BEFORE this function is ever invoked for a given cycle. It is never
 * merged into this function's precedence chain — this module has no
 * knowledge of it. (Implementing that inner cap is a later task's job.)
 *
 * @module lib/loop-convergence
 */

/**
 * Deduplicate an iterable of strings (stable order — first appearance wins).
 * @param {Iterable<string>} arr
 * @returns {string[]}
 */
function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    if (typeof v !== 'string') continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Partition two blocker-id sets into addressed / persistent / new_.
 *
 * - `addressed`: in `prev` but not in `curr` (the revise fixed them)
 * - `persistent`: in both (still present after the revise)
 * - `new_`: in `curr` but not in `prev` (revise introduced them)
 *
 * Note the trailing underscore on `new_` — `new` is a JavaScript reserved
 * word; the underscore is the standard escape. Behavior 7 of the spec
 * uses the same notation.
 *
 * @param {Array<string>} prev
 * @param {Array<string>} curr
 * @returns {{ addressed: string[], persistent: string[], new_: string[] }}
 */
export function partitionBlockers(prev, curr) {
  const prevSet = new Set(dedupe(prev ?? []));
  const currSet = new Set(dedupe(curr ?? []));
  const addressed = [];
  const persistent = [];
  const new_ = [];
  for (const id of prevSet) {
    if (currSet.has(id)) persistent.push(id);
    else addressed.push(id);
  }
  for (const id of currSet) {
    if (!prevSet.has(id)) new_.push(id);
  }
  return { addressed, persistent, new_ };
}

/**
 * True when every element of `arr` is >= the one before it (or `arr` has
 * fewer than 2 elements — trivially non-decreasing).
 * @param {number[]} arr
 * @returns {boolean}
 */
function isNonDecreasing(arr) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < arr[i - 1]) return false;
  }
  return true;
}

/**
 * Evaluate the loop stop condition.
 *
 * @param {object} args
 * @param {string[]} args.addressed              - blocker IDs the revise resolved
 * @param {string[]} args.persistent             - blocker IDs unchanged across revisions
 * @param {string[]} args.new_                   - blocker IDs introduced by the latest revision
 * @param {string[]} args.prev_blockers          - prev-revision blocker set (full)
 * @param {number}   args.retries_remaining      - how many more revise cycles are budgeted
 * @param {string}   args.verdict                - latest reviewer verdict (PASS | PASS_WITH_NOTES | BLOCK | FAIL)
 * @param {boolean}  args.human_final_pass       - --require-human-final-pass flag
 * @param {number[]} [args.blocker_count_history] - per-cycle loop-eligible blocker counts,
 *                                                  oldest first, current cycle last (BEH-9)
 * @param {number}   [args.not_converging_window] - consecutive non-decreasing cycles required
 *                                                  to fire NOT_CONVERGING (manifest
 *                                                  `build.not_converging_window`, default 2)
 * @returns {{ stop: boolean, verdict: 'PASS'|'PASS_PENDING_HUMAN'|'NOT_CONVERGING'|'NO_PROGRESS'|'REGRESSED'|'BUDGET_EXHAUSTED'|'CONTINUE' }}
 */
export function evaluateStopCondition({
  addressed = [],
  persistent = [],
  new_ = [],
  prev_blockers = [],
  retries_remaining = 0,
  verdict = 'BLOCK',
  human_final_pass = false,
  blocker_count_history = [],
  not_converging_window = 2,
} = {}) {
  // PASS is the happy path — always wins.
  if (verdict === 'PASS' || verdict === 'PASS_WITH_NOTES') {
    if (human_final_pass) {
      return { stop: true, verdict: 'PASS_PENDING_HUMAN' };
    }
    return { stop: true, verdict: 'PASS' };
  }

  // NOT_CONVERGING (BEH-9 / TR-4): the loop-eligible blocker count has been
  // non-decreasing for `not_converging_window` consecutive cycles. Evaluated
  // BEFORE NO_PROGRESS — see module-doc precedence note. Only meaningful
  // once there's enough history to fill the window; otherwise it cannot yet
  // be evaluated and must not fire.
  if (
    not_converging_window > 0 &&
    blocker_count_history.length >= not_converging_window
  ) {
    const window = blocker_count_history.slice(-not_converging_window);
    if (isNonDecreasing(window)) {
      return { stop: true, verdict: 'NOT_CONVERGING' };
    }
  }

  const prevSet = new Set(dedupe(prev_blockers));
  const persistentSet = new Set(dedupe(persistent));
  const noProgress =
    addressed.length === 0 &&
    new_.length === 0 &&
    prevSet.size > 0 &&             // must have had prior blockers to be "stuck"
    persistentSet.size === prevSet.size;
  if (noProgress) {
    return { stop: true, verdict: 'NO_PROGRESS' };
  }

  // Regression: the revise introduced MORE new blockers than it resolved.
  // Only meaningful when there WAS a prior blocker set — first-revision
  // findings are not regressions.
  if (prevSet.size > 0 && new_.length > addressed.length) {
    return { stop: true, verdict: 'REGRESSED' };
  }

  // Budget exhausted: not PASS and no retries left.
  if (retries_remaining <= 0) {
    return { stop: true, verdict: 'BUDGET_EXHAUSTED' };
  }

  return { stop: false, verdict: 'CONTINUE' };
}
