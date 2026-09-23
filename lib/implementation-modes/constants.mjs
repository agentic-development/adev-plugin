/**
 * Implementation mode constants.
 *
 * Central registry of mode names and their resolution config. Implementation
 * mode is a project-level axis orthogonal to risk tier (lib/risk-tiers/) — it
 * selects how strictly /adev:implement enforces TDD dispatch and ordering,
 * not how much governance scrutiny a project's bundle applies.
 *
 * @module lib/implementation-modes/constants
 */

/** Valid implementation mode names (closed set). */
export const IMPLEMENTATION_MODE_NAMES = new Set(['tdd', 'test-required', 'agent-default']);

/** Default mode when a project has no `implementation_mode` key in manifest.yaml. */
export const DEFAULT_IMPLEMENTATION_MODE = 'tdd';

/** Map implementation mode name -> resolution config. */
export const IMPLEMENTATION_MODE_CONFIGS = new Map([
  ['tdd', { dispatch_red: true, ordering_enforced: true, coverage_check: 'pre-hoc' }],
  ['test-required', { dispatch_red: false, ordering_enforced: false, coverage_check: 'post-hoc' }],
  ['agent-default', { dispatch_red: false, ordering_enforced: false, coverage_check: 'none' }],
]);
