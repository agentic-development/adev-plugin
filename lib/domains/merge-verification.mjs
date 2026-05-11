/**
 * Verification config merge function.
 *
 * Validates and normalizes domain verification config.
 * Valid types: visual, output, flow.
 * Rejects path traversal in trigger_patterns and validates tool availability.
 *
 * No governance layer — verification is domain-only (SA-3).
 * Pure function — never mutates inputs.
 *
 * @module lib/domains/merge-verification
 */

const VALID_TYPES = new Set(['visual', 'output', 'flow']);

/**
 * Merge/validate verification overlay data.
 *
 * @param {object|null} overlayData - Verification config overlay
 * @param {Set<string>} [activeServers] - Set of active MCP server names for tool validation
 * @returns {{ config: object|null, warnings: Array<{ code: string, message: string }> }}
 */
export function mergeVerification(overlayData, activeServers) {
  const warnings = [];

  if (!overlayData || typeof overlayData !== 'object') {
    return { config: null, warnings };
  }

  // Validate type
  if (!VALID_TYPES.has(overlayData.type)) {
    warnings.push({
      code: 'UNKNOWN_VERIFY_TYPE',
      message: `Unknown verification type '${overlayData.type}' — expected one of: ${[...VALID_TYPES].join(', ')}.`,
    });
    return { config: null, warnings };
  }

  // Validate trigger_patterns
  const rawPatterns = Array.isArray(overlayData.trigger_patterns) ? overlayData.trigger_patterns : [];
  const validPatterns = [];

  for (const pattern of rawPatterns) {
    if (typeof pattern !== 'string') continue;
    if (pattern.includes('..')) {
      warnings.push({
        code: 'INVALID_PATTERN',
        message: `Trigger pattern '${pattern}' contains path traversal (..) — rejected.`,
      });
      continue;
    }
    if (pattern.startsWith('/')) {
      warnings.push({
        code: 'INVALID_PATTERN',
        message: `Trigger pattern '${pattern}' is an absolute path — rejected.`,
      });
      continue;
    }
    validPatterns.push(pattern);
  }

  // Validate tool
  const tool = overlayData.tool ?? 'none';
  if (tool !== 'none' && activeServers && !activeServers.has(tool)) {
    warnings.push({
      code: 'TOOL_UNAVAILABLE',
      message: `Verification tool '${tool}' is not in active MCP servers. Install and configure it before using.`,
    });
    return { config: null, warnings };
  }

  return {
    config: {
      type: overlayData.type,
      trigger_patterns: validPatterns,
      tool,
    },
    warnings,
  };
}
