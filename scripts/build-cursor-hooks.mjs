// Build step: derive providers/cursor/hooks.json from canonical hooks/hooks.json.
// Pure Node built-ins. Throws on unknown events, unknown matchers, and
// non-canonical hook command shapes. See
// .context-index/specs/features/cursor-provider/hook-config-generator.spec.md
// for the contract.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    claudeMatcher: "Write|Edit",
    cursorEvent: "preToolUse",
    cursorMatcher: "Write|Edit",
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

// Plugin root: parent of scripts/
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL_PATH = join(PLUGIN_ROOT, "hooks", "hooks.json");
const OUTPUT_PATH = join(PLUGIN_ROOT, "providers", "cursor", "hooks.json");

// Canonical command shape: bash "${CLAUDE_PLUGIN_ROOT}/hooks/<name>.sh"
// Captures the script basename for both translation and on-disk existence check.
const CANONICAL_COMMAND_RE = /^bash "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([^"/]+\.sh)"$/;

function lookupTranslation(claudeEvent, claudeMatcher) {
  // First check whether the event is known at all (any matcher).
  const eventKnown = TRANSLATION_TABLE.some((e) => e.claudeEvent === claudeEvent);
  if (!eventKnown) {
    throw new Error(
      `Unknown Claude event: ${claudeEvent}. Add an entry to TRANSLATION_TABLE in scripts/build-cursor-hooks.mjs.`,
    );
  }
  const row = TRANSLATION_TABLE.find(
    (e) => e.claudeEvent === claudeEvent && e.claudeMatcher === claudeMatcher,
  );
  if (!row) {
    throw new Error(
      `Unknown Claude matcher: ${claudeEvent}/${claudeMatcher}. Add an entry to TRANSLATION_TABLE in scripts/build-cursor-hooks.mjs.`,
    );
  }
  return row;
}

/**
 * Pure transform: canonical hooks.json shape → Cursor hooks.json shape.
 *
 * @param {object} canonical - parsed contents of hooks/hooks.json
 * @param {(scriptName: string) => boolean} hookScriptExists - predicate for
 *   on-disk script existence (injectable for tests; production usage passes
 *   a closure over existsSync against PLUGIN_ROOT/hooks/)
 * @returns {{ version: 1, hooks: Record<string, Array<object>> }}
 */
export function buildCursorHooks(canonical, hookScriptExists) {
  const out = { version: 1, hooks: {} };
  for (const [claudeEvent, entries] of Object.entries(canonical.hooks || {})) {
    for (const entry of entries) {
      const claudeMatcher = entry.matcher;
      const row = lookupTranslation(claudeEvent, claudeMatcher);
      for (const hook of entry.hooks || []) {
        const match = CANONICAL_COMMAND_RE.exec(hook.command);
        if (!match) {
          throw new Error(
            `Non-canonical hook command at ${claudeEvent}/${claudeMatcher}: ${hook.command}. Translation only supports the canonical bash-script form; new command shapes need explicit translation logic.`,
          );
        }
        const scriptName = match[1];
        if (!hookScriptExists(scriptName)) {
          throw new Error(
            `Hook script not found: hooks/${scriptName} referenced from ${claudeEvent}/${claudeMatcher}`,
          );
        }
        const cursorEntry = {
          command: `./hooks/${scriptName}`,
          failClosed: row.intent === "fail-closed",
          timeout: row.intent === "fail-closed" ? FAIL_CLOSED_TIMEOUT : ADVISORY_TIMEOUT,
        };
        if (row.cursorMatcher) cursorEntry.matcher = row.cursorMatcher;
        out.hooks[row.cursorEvent] ||= [];
        out.hooks[row.cursorEvent].push(cursorEntry);
      }
    }
  }
  return out;
}

/**
 * Read canonical, transform, write atomically. Exits non-zero on any throw via
 * the default unhandled-exception behaviour.
 */
function main() {
  if (!existsSync(CANONICAL_PATH)) {
    throw new Error(`Canonical hooks/hooks.json not found at ${CANONICAL_PATH}`);
  }
  const canonical = JSON.parse(readFileSync(CANONICAL_PATH, "utf8"));
  const result = buildCursorHooks(canonical, (scriptName) =>
    existsSync(join(PLUGIN_ROOT, "hooks", scriptName)),
  );
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  // Atomic write: temp file in same directory + rename.
  const tmp = `${OUTPUT_PATH}.tmp.${process.pid}`;
  const body = JSON.stringify(result, null, 2) + "\n";
  writeFileSync(tmp, body, { mode: 0o644 });
  renameSync(tmp, OUTPUT_PATH);
}

// ESM "run only when invoked as a script" idiom.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
