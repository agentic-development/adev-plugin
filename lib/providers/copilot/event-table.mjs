// Claude Code → GitHub Copilot event translation table.
//
// Authored as an Array (not an object literal) so the module-load-time
// `Set`-based duplicate check in `validate()` can surface authoring errors —
// object literals would silently discard duplicate keys.
//
// `cloudAgentSafe: false` rows are emitted by the canonical adev hook layer
// but DROPPED by the generator: they map to Copilot events the Cloud Agent
// runtime does not support (e.g. `notification`, `permissionRequest`).

/**
 * @typedef {Object} EventTableEntry
 * @property {string}  claudeEvent          - Claude Code event name (PascalCase).
 * @property {string}  copilotEvent         - Copilot event name (camelCase).
 * @property {boolean} cloudAgentSafe       - When false, the generator drops
 *                                            the entry rather than emit it.
 * @property {number}  [defaultTimeoutSec]  - Optional per-event default that
 *                                            overrides the hardcoded `30`.
 */

/** @type {EventTableEntry[]} */
export const EVENT_TABLE = [
  { claudeEvent: "PreToolUse", copilotEvent: "preToolUse", cloudAgentSafe: true },
  { claudeEvent: "PostToolUse", copilotEvent: "postToolUse", cloudAgentSafe: true },
  { claudeEvent: "SessionStart", copilotEvent: "sessionStart", cloudAgentSafe: true },
  { claudeEvent: "SessionEnd", copilotEvent: "sessionEnd", cloudAgentSafe: true },
  { claudeEvent: "Stop", copilotEvent: "agentStop", cloudAgentSafe: true },
  { claudeEvent: "SubagentStart", copilotEvent: "subagentStart", cloudAgentSafe: true },
  { claudeEvent: "SubagentStop", copilotEvent: "subagentStop", cloudAgentSafe: true },
  { claudeEvent: "UserPromptSubmit", copilotEvent: "userPromptSubmitted", cloudAgentSafe: true },
  { claudeEvent: "PostToolUseFailure", copilotEvent: "postToolUseFailure", cloudAgentSafe: true },
  { claudeEvent: "PreCompact", copilotEvent: "preCompact", cloudAgentSafe: true },
  { claudeEvent: "Notification", copilotEvent: "notification", cloudAgentSafe: false },
];

/**
 * Set-based duplicate check. Throws on the first repeated `claudeEvent` key.
 *
 * Runs at generator entrypoint (before any output is attempted) so an
 * authoring-time duplicate aborts cleanly with a documented error code.
 *
 * @param {EventTableEntry[]} table
 * @throws {Error} `DUPLICATE_EVENT_MAPPING: <claudeEvent>` on first collision.
 */
export function validate(table) {
  const seen = new Set();
  for (const entry of table) {
    if (seen.has(entry.claudeEvent)) {
      throw new Error(`DUPLICATE_EVENT_MAPPING: ${entry.claudeEvent}`);
    }
    seen.add(entry.claudeEvent);
  }
}

/**
 * Look up the translation row for a Claude Code event. Returns `undefined`
 * when the event is unknown — the caller (the generator entrypoint) is
 * responsible for raising `UNKNOWN_EVENT`.
 *
 * @param {string} claudeEvent
 * @returns {EventTableEntry | undefined}
 */
export function lookupEvent(claudeEvent) {
  return EVENT_TABLE.find((e) => e.claudeEvent === claudeEvent);
}
