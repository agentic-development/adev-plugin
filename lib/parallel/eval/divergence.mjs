// lib/parallel/eval/divergence.mjs
//
// Behavioral divergence comparator + determinism gate for the equivalence eval
// (equivalence-eval.spec.md). Equivalence is judged on two behavioral signals —
// the test pass/fail SET and the public SURFACE set — never textual diff (two
// live LLM runs differ by nature). A serial-B control arm is a determinism gate:
// if the two serial arms already disagree, the fixture is non-deterministic and
// the verdict is INCONCLUSIVE; only on an empty control does an exact behavioral
// match of the parallel arm count as equivalent. Pure — Node built-ins only.

/**
 * Tests whose pass/fail status differs, or that appear in only one arm.
 * @param {Record<string,'pass'|'fail'>} a
 * @param {Record<string,'pass'|'fail'>} b
 * @returns {string[]} sorted test names
 */
export function testSetDivergence(a = {}, b = {}) {
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const n of names) if (a[n] !== b[n]) out.push(n);
  return out.sort();
}

/**
 * Symmetric difference of two public-surface sets (exports / verbs / files).
 * @param {string[]} a
 * @param {string[]} b
 * @returns {string[]} sorted
 */
export function surfaceDivergence(a = [], b = []) {
  const sa = new Set(a);
  const sb = new Set(b);
  const out = [];
  for (const x of sa) if (!sb.has(x)) out.push(x);
  for (const x of sb) if (!sa.has(x)) out.push(x);
  return out.sort();
}

function armDivergence(x, ref) {
  return {
    tests: testSetDivergence(x.tests, ref.tests),
    surface: surfaceDivergence(x.surface, ref.surface),
  };
}

/**
 * Judge parallel-vs-serial equivalence against the serial-vs-serial determinism gate.
 *
 * @param {object} arms
 * @param {{tests:object,surface:string[]}} arms.serialA baseline
 * @param {{tests:object,surface:string[]}} arms.serialB control
 * @param {{tests:object,surface:string[]}} arms.parallel variant
 * @returns {{ verdict:'equivalent'|'not_equivalent'|'inconclusive', divergence_kind?:'tests'|'surface', delta?:string[], d_ctrl:object, d_par:object }}
 */
export function judge({ serialA, serialB, parallel }) {
  const d_ctrl = armDivergence(serialB, serialA);
  const d_par = armDivergence(parallel, serialA);

  if (d_ctrl.tests.length > 0 || d_ctrl.surface.length > 0) {
    return { verdict: "inconclusive", d_ctrl, d_par };
  }
  if (d_par.tests.length === 0 && d_par.surface.length === 0) {
    return { verdict: "equivalent", d_ctrl, d_par };
  }
  // Deterministic fixture, but the parallel arm diverges from serial — a real failure.
  const kind = d_par.tests.length > 0 ? "tests" : "surface";
  return {
    verdict: "not_equivalent",
    divergence_kind: kind,
    delta: kind === "tests" ? d_par.tests : d_par.surface,
    d_ctrl,
    d_par,
  };
}
