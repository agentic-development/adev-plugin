/**
 * Test config merge function.
 *
 * Extracts permitted_tools, max_test_file_size, and skip_patterns from domain overlay.
 * Returns empty permitted_tools with warning when overlay is null (Behavior 20).
 *
 * No governance layer — test-config is domain-only (SA-3).
 * Pure function — never mutates inputs.
 *
 * @module lib/domains/merge-test-config
 */

/**
 * Merge test config from domain overlay.
 *
 * @param {object|null} overlayData - Test config overlay
 * @returns {{ config: { permitted_tools: string[], max_test_file_size: number|undefined, skip_patterns: string[] }, warnings: Array<{ code: string, message: string }> }}
 */
export function mergeTestConfig(overlayData) {
  const warnings = [];

  if (!overlayData || typeof overlayData !== 'object') {
    warnings.push({
      code: 'DOMAIN_CONFIG_MERGE_WARN',
      message: 'No test config overlay — using empty permitted_tools.',
    });
    return {
      config: { permitted_tools: [], max_test_file_size: undefined, skip_patterns: [] },
      warnings,
    };
  }

  const permittedTools = Array.isArray(overlayData.permitted_tools)
    ? [...overlayData.permitted_tools]
    : [];

  const maxTestFileSize = typeof overlayData.max_test_file_size === 'number'
    ? overlayData.max_test_file_size
    : undefined;

  const skipPatterns = Array.isArray(overlayData.skip_patterns)
    ? [...overlayData.skip_patterns]
    : [];

  return {
    config: { permitted_tools: permittedTools, max_test_file_size: maxTestFileSize, skip_patterns: skipPatterns },
    warnings,
  };
}
