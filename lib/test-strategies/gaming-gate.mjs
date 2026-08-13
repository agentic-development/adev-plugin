/**
 * Gaming Detector Gate — deterministic enforcement wiring for the 8 gaming
 * detectors in lib/test-strategies/gaming.mjs.
 *
 * Consumed by hooks/_gaming-gate-check.mjs (a PreToolUse hook helper) to
 * block a pending Write/Edit of a test file when it would introduce a new
 * gaming violation not already present in the file's current on-disk
 * content. See:
 * .context-index/specs/features/test-strategies/gaming-detector-gate-enforcement.spec.md
 */

// ---------------------------------------------------------------------------
// Path classification
// ---------------------------------------------------------------------------

/**
 * Is this a test file the gate should scan?
 * @param {string} filePath
 * @returns {boolean}
 */
export function isTestFile(filePath) {
  const p = filePath.replace(/\\/g, "/");
  if (/(^|\/)tests\//.test(p)) return true;
  if (/(^|\/)providers\/[^/]+\/tests\//.test(p)) return true;
  return /\.(test|spec)\.mjs$/.test(p);
}

const FIXTURE_FILES = [
  /(^|\/)tests\/lib\/test-strategies\/gaming.*\.mjs$/,
  /(^|\/)tests\/lib\/test-strategies\/integration-gaming.*\.mjs$/,
  /(^|\/)tests\/test-strategies\/gaming-agent-skip\.test\.mjs$/,
];

/**
 * Is this one of the gaming-detector's own fixture test files? These
 * intentionally embed gaming-pattern fixture strings to test the detector
 * logic itself and must never be scanned by the gate (spec Behavior 2).
 * @param {string} filePath
 * @returns {boolean}
 */
export function isDetectorFixtureFile(filePath) {
  const p = filePath.replace(/\\/g, "/");
  return FIXTURE_FILES.some((re) => re.test(p));
}

/**
 * Should the 4 integration-specific detectors also run for this test file?
 * A dedicated, test-path-specific heuristic — NOT detectTaskStrategy() from
 * detection.mjs, which is keyed to production-source path conventions and
 * was verified to never resolve "integration" for any real test-file path
 * in this repo (spec Behavior 6 rationale).
 * @param {string} filePath
 * @returns {boolean}
 */
export function isIntegrationTestFile(filePath) {
  const p = filePath.replace(/\\/g, "/");
  if (/(^|\/)integration\//.test(p)) return true;
  const base = p.split("/").pop() ?? "";
  return /integration/i.test(base);
}
