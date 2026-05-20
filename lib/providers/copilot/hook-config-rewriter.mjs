/**
 * Hook-config rewriter for the Copilot adapter.
 *
 * The committed `providers/copilot/hooks.json` references hook scripts via the
 * `${CLAUDE_PLUGIN_ROOT}/hooks/<name>.sh` runtime placeholder (the canonical
 * shape emitted by the hook generator). The Copilot adapter copies scripts
 * into `.github/hooks/scripts/` at install time, so every script reference in
 * the committed `.github/hooks/hooks.json` must be rewritten to the relative
 * form `./scripts/<name>.sh`.
 *
 * Two input forms are supported:
 *   1. Absolute paths under `pluginRoot/hooks/<name>.sh` (legacy or pre-rendered).
 *   2. `${CLAUDE_PLUGIN_ROOT}/hooks/<name>.sh` runtime placeholders.
 *
 * Post-condition: the rewritten config contains zero `${CLAUDE_PLUGIN_ROOT}`
 * substrings AND zero pluginRoot absolute-path substrings. This closes SEC-5
 * (absolute-path leak in committed output).
 */

const PLACEHOLDER_REGEX = /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([a-z0-9_.-]+\.sh)/g;

function escapeRegex(s) {
  // Escape every metacharacter — pluginRoot may contain dots, dashes, etc.
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deep clone via JSON round-trip. Adequate for the hooks.json shape (plain
 * objects, arrays, strings, numbers, booleans — no functions, no cycles).
 */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Walk every `bash` field in the config's hooks tree, rewriting script
 * references and collecting the basenames into a deduplicated, sorted list.
 *
 * @param {object} config - The parsed hooks.json content.
 * @param {string} pluginRoot - Absolute path of the running plugin.
 * @returns {{ rewrittenConfig: object, scriptFiles: string[] }}
 */
export function rewriteHookConfigForCopilot(config, pluginRoot) {
  const rewrittenConfig = clone(config);
  const captured = new Set();

  // Pre-build the absolute-path regex once per call.
  const absRegex = new RegExp(`${escapeRegex(pluginRoot)}/hooks/([a-z0-9_.-]+\\.sh)`, 'g');

  function rewriteBash(bashStr) {
    let out = bashStr;
    // 1) Replace the runtime placeholder form.
    out = out.replace(PLACEHOLDER_REGEX, (_match, name) => {
      captured.add(name);
      return `./scripts/${name}`;
    });
    // 2) Replace any absolute pluginRoot/hooks/<name>.sh substrings.
    out = out.replace(absRegex, (_match, name) => {
      captured.add(name);
      return `./scripts/${name}`;
    });
    return out;
  }

  const hooks = rewrittenConfig.hooks;
  if (hooks && typeof hooks === 'object') {
    for (const eventName of Object.keys(hooks)) {
      const entries = hooks[eventName];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry && typeof entry === 'object' && typeof entry.bash === 'string') {
          entry.bash = rewriteBash(entry.bash);
        }
      }
    }
  }

  return {
    rewrittenConfig,
    scriptFiles: [...captured].sort(),
  };
}
