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

import { SHARED_PATTERNS, INTEGRATION_PATTERNS } from "./gaming.mjs";

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

// ---------------------------------------------------------------------------
// Detector dispatch
// ---------------------------------------------------------------------------

/**
 * Runs the applicable gaming detectors directly against each pattern's
 * `.detect()` method — never through detectSharedGamingPatterns()'s
 * size-capped wrapper. This gate has no file-size exemption of any kind
 * (spec Behavior 5 / SEC-1: the wrapper's 500KB cap would otherwise be a
 * silent, deterministic bypass).
 * @param {string} content
 * @param {string} filePath
 * @returns {{ violations: Array<{patternId:string, prefix:string, line:number, match:string, message:string}> }}
 */
export function runGamingDetectors(content, filePath) {
  const violations = [];
  for (const pattern of SHARED_PATTERNS) {
    for (const v of pattern.detect(content)) {
      violations.push({ patternId: pattern.id, prefix: "SHARED", ...v });
    }
  }
  if (isIntegrationTestFile(filePath)) {
    for (const pattern of INTEGRATION_PATTERNS) {
      for (const v of pattern.detect(content)) {
        violations.push({ patternId: pattern.id, prefix: "INTEGRATION", ...v });
      }
    }
  }
  return { violations };
}

// ---------------------------------------------------------------------------
// Post-edit content reconstruction
// ---------------------------------------------------------------------------

/**
 * Reconstructs the file content a pending Write/Edit tool call would
 * produce, without performing the write. Returns null when reconstruction
 * is not possible — callers must treat null as a fail-open signal (spec
 * Behavior 3, Error Cases table): a crash in enforcement must never block.
 * @param {{tool:string, before:string, content?:string, oldString?:string, newString?:string}} args
 * @returns {string|null}
 */
export function reconstructAfterContent({ tool, before, content, oldString, newString }) {
  if (tool === "Write") {
    return typeof content === "string" ? content : null;
  }
  if (tool === "Edit") {
    if (typeof oldString !== "string" || typeof newString !== "string") return null;
    const idx = before.indexOf(oldString);
    if (idx === -1) return null;
    return before.slice(0, idx) + newString + before.slice(idx + oldString.length);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Violation diff
// ---------------------------------------------------------------------------

function fingerprint(v) {
  return `${v.patternId}::${v.match.trim()}`;
}

/**
 * Compares gaming violations in `before` vs `after` and returns only the
 * violations newly introduced. Identity ignores line number (spec
 * Behavior 7) — an edit earlier in the file shifts every line number below
 * it, and a line-number-keyed diff would misreport every pre-existing
 * violation after the edit point as "new."
 * @param {string} beforeContent
 * @param {string} afterContent
 * @param {string} filePath
 * @returns {{ newViolations: Array<object>, beforeViolations: Array<object>, afterViolations: Array<object> }}
 */
export function diffNewViolations(beforeContent, afterContent, filePath) {
  const before = runGamingDetectors(beforeContent, filePath).violations;
  const after = runGamingDetectors(afterContent, filePath).violations;
  const beforeFingerprints = new Set(before.map(fingerprint));
  const newViolations = after.filter((v) => !beforeFingerprints.has(fingerprint(v)));
  return { newViolations, beforeViolations: before, afterViolations: after };
}
