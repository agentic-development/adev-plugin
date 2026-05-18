// Build step: derive providers/cursor/hooks.json from canonical hooks/hooks.json.
// Pure Node built-ins. Throws on unknown events, unknown matchers, and
// non-canonical hook command shapes. See
// .context-index/specs/features/cursor-provider/hook-config-generator.spec.md
// for the contract.

export const FAIL_CLOSED_TIMEOUT = 30; // seconds — short enough to prevent UI freezes during gates
export const ADVISORY_TIMEOUT = 60; // seconds — long enough for capture/sync

// Inline Claude → Cursor translation. Every row corresponds to one event/matcher
// pair currently registered in hooks/hooks.json. The generator throws when it
// encounters a pair not in this list (see Task 2).
export const TRANSLATION_TABLE = [
  {
    claudeEvent: "SessionStart",
    claudeMatcher: "startup|resume|clear|compact",
    cursorEvent: "sessionStart",
    cursorMatcher: null,
    intent: "advisory",
  },
  {
    claudeEvent: "PreToolUse",
    claudeMatcher: "Edit",
    cursorEvent: "preToolUse",
    cursorMatcher: "Edit",
    intent: "fail-closed",
  },
  {
    claudeEvent: "PreToolUse",
    claudeMatcher: "Bash",
    cursorEvent: "beforeShellExecution",
    cursorMatcher: null,
    intent: "fail-closed",
  },
  {
    claudeEvent: "PostToolUse",
    claudeMatcher: "Read",
    cursorEvent: "postToolUse",
    cursorMatcher: "Read",
    intent: "advisory",
  },
  {
    claudeEvent: "PostToolUse",
    claudeMatcher: "Edit",
    cursorEvent: "afterFileEdit",
    cursorMatcher: null,
    intent: "advisory",
  },
  {
    claudeEvent: "PostToolUse",
    claudeMatcher: ".*",
    cursorEvent: "postToolUse",
    cursorMatcher: null,
    intent: "advisory",
  },
  {
    claudeEvent: "Stop",
    claudeMatcher: ".*",
    cursorEvent: "stop",
    cursorMatcher: null,
    intent: "advisory",
  },
];
