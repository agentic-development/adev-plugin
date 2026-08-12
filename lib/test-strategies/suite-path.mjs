/**
 * Resolve whether a plan task should create a new test suite or extend an
 * existing one, per the granularity configured by `resolveGranularity()`
 * (see `lib/test-strategies/policy.mjs`).
 *
 * - `per-task`: always proposes a new suite (one per task).
 * - `per-behavior`: extends the suite already covering `behaviorSlug` when
 *   `behaviorSuiteIndex` has an entry for it; otherwise proposes a new suite
 *   for the not-yet-covered behavior.
 * - `per-spec`: extends an existing suite for `specSlug` when one is found
 *   in `existingSuites`; otherwise proposes the canonical per-spec path.
 *
 * The `per-spec` existing-suite lookup matches on the suite *file name*
 * (`<specSlug>.test.mjs`), anchored at a path boundary, rather than a bare
 * substring match — `tests/specs/test-depth-policy-old.test.mjs` must not
 * be treated as covering `specSlug: "test-depth-policy"` merely because it
 * contains that slug as a prefix.
 *
 * `path: undefined` on a `"create"` result (per-task, and per-behavior
 * without a match) is intentional: this function has no target source file
 * to derive a conventional test path from, so the concrete new path is left
 * to the caller (`/adev:plan`, which knows the task's target module).
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveSuitePath({
  granularity,
  behaviorSlug,
  specSlug,
  existingSuites = [],
  behaviorSuiteIndex = {},
} = {}) {
  if (granularity === "per-behavior") {
    const covering = behaviorSuiteIndex[behaviorSlug];
    if (covering) {
      return { action: "extend", path: covering };
    }
    return { action: "create", path: undefined };
  }

  if (granularity === "per-spec") {
    const canonicalPath = `tests/specs/${specSlug}.test.mjs`;
    const suiteNamePattern = new RegExp(`(^|/)${escapeRegExp(specSlug)}\\.test\\.mjs$`);
    const existing = existingSuites.find(
      (p) => p === canonicalPath || suiteNamePattern.test(p),
    );
    return existing
      ? { action: "extend", path: existing }
      : { action: "create", path: canonicalPath };
  }

  // per-task (and any other/unrecognized granularity) always proposes a new suite.
  return { action: "create", path: undefined };
}
