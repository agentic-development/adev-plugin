/**
 * Gate config merge function.
 *
 * Extracts file_exclusions and bash_passthrough arrays from domain overlay.
 * Returns empty arrays when overlay is null (strictest mode — Behavior 18).
 *
 * No governance layer — gate-config is domain-only (SA-3).
 * Pure function — never mutates inputs.
 *
 * @module lib/domains/merge-gate-config
 */

/**
 * Merge gate config from domain overlay.
 *
 * @param {object|null} overlayData - Gate config overlay with file_exclusions and bash_passthrough
 * @returns {{ config: { file_exclusions: string[], bash_passthrough: string[] }, warnings: Array<{ code: string, message: string }> }}
 */
export function mergeGateConfig(overlayData) {
  const warnings = [];

  if (!overlayData || typeof overlayData !== 'object') {
    return {
      config: { file_exclusions: [], bash_passthrough: [] },
      warnings,
    };
  }

  const fileExclusions = Array.isArray(overlayData.file_exclusions)
    ? [...overlayData.file_exclusions]
    : [];

  const bashPassthrough = Array.isArray(overlayData.bash_passthrough)
    ? [...overlayData.bash_passthrough]
    : [];

  return {
    config: { file_exclusions: fileExclusions, bash_passthrough: bashPassthrough },
    warnings,
  };
}
