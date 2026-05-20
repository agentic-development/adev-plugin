// Claude Code → GitHub Copilot tool-name vocabulary mapping.
//
// Authored as an Array of tuples (not an object literal) so duplicate
// `claudeToolName` keys can surface as authoring errors rather than be
// silently discarded by the JS runtime.
//
// Consumed by lib/providers/copilot/matcher.mjs to rewrite tool-name tokens
// inside the canonical matcher regexes when emitting Copilot hook configs.
//
// Spec: .context-index/specs/features/copilot-provider/copilot-hook-generator.spec.md
//       — Per-Field Source Mapping (matcher row), Actionable Task Map row for
//         tool-name mapping.

/**
 * @typedef {Object} ToolNameEntry
 * @property {string} claudeToolName  - Claude Code tool name (PascalCase).
 * @property {string} copilotToolName - Copilot tool name (snake_case or lower).
 */

/** @type {ToolNameEntry[]} */
export const TOOL_NAMES = [
  { claudeToolName: "Bash", copilotToolName: "bash" },
  { claudeToolName: "Write", copilotToolName: "create" },
  // Order matters at lookup time, but ordering here is purely documentary —
  // matcher.mjs sorts by source-name length descending so `MultiEdit` is
  // substituted before `Edit`.
  { claudeToolName: "MultiEdit", copilotToolName: "edit" },
  { claudeToolName: "Edit", copilotToolName: "edit" },
  { claudeToolName: "Read", copilotToolName: "view" },
  { claudeToolName: "Glob", copilotToolName: "glob" },
  { claudeToolName: "Grep", copilotToolName: "grep" },
  { claudeToolName: "WebFetch", copilotToolName: "web_fetch" },
  { claudeToolName: "Task", copilotToolName: "task" },
  { claudeToolName: "AskUser", copilotToolName: "ask_user" },
];
