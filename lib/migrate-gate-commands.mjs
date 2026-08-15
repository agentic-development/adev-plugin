/**
 * Migrate legacy shell-string gate commands to argv lists.
 *
 * WHY THIS EXISTS. `lib/domains/merge-gates.mjs` rejects any gate whose
 * `command` is a string (SEC-2 — commands are executed without shell
 * interpolation). That requirement first shipped in adev-cli v0.25.0. Every
 * `governance/gates.yaml` authored before it declares `command: "npm test"`
 * and is DROPPED AT LOAD with an INVALID_GATE warning.
 *
 * Nothing migrated those files. `cmdInstall`/`cmdUpgrade` scaffold templates
 * with `if (!existsSync(destPath))`, so an existing gates.yaml is skipped
 * entirely — the file that needs fixing is precisely the file the installer
 * refuses to touch. The result is a project whose quality gates silently
 * evaluate zero gates, which reads identically to a project that passed them.
 *
 * This module converts the shell-string form to argv in place, so `adev
 * upgrade` repairs a config the installer would otherwise leave broken.
 *
 * SCOPE. Deliberately narrow. A shell string is only migrated when it is
 * unambiguously a simple command: no shell metacharacters at all. Anything
 * involving `&&`, `|`, `>`, `;`, `$`, backticks, or quotes is reported as
 * UNSAFE and left alone, because splitting it on whitespace would produce an
 * argv list that runs something different from what the author wrote. Those
 * need a human.
 *
 * @module lib/migrate-gate-commands
 */

/** Shell metacharacters that make naive whitespace splitting unsafe. */
const SHELL_METACHARS = /[&|;<>$`"'\\(){}[\]*?~#\n]/;

/**
 * Decide whether a shell-string command can be safely converted to argv.
 *
 * @param {string} command
 * @returns {{ safe: boolean, reason?: string }}
 */
export function classifyCommand(command) {
  if (typeof command !== 'string') return { safe: false, reason: 'not a string' };
  const trimmed = command.trim();
  if (trimmed === '') return { safe: false, reason: 'empty command' };
  if (SHELL_METACHARS.test(trimmed)) {
    return { safe: false, reason: 'contains shell metacharacters — splitting would change its meaning' };
  }
  return { safe: true };
}

/**
 * Convert a safe shell string to an argv list.
 *
 * @param {string} command
 * @returns {string[]}
 */
export function toArgv(command) {
  return command.trim().split(/\s+/);
}

/**
 * Rewrite string `command:` values in a gates.yaml source to argv lists.
 *
 * Operates on raw YAML text rather than a parse/serialize round trip: this
 * repo has no YAML writer, and re-emitting the document would discard the
 * comments that explain each gate. A line-scoped regex preserves the file
 * byte-for-byte apart from the lines it rewrites.
 *
 * @param {string} source - Raw gates.yaml contents.
 * @returns {{ content: string, migrated: Array<{ from: string, to: string[] }>, skipped: Array<{ command: string, reason: string }> }}
 */
export function migrateGateCommands(source) {
  const migrated = [];
  const skipped = [];

  const lines = source.split('\n');
  const out = lines.map((line) => {
    // Match `  command: <value>` where value is NOT already a list ([...]).
    const m = /^(\s*command:\s*)(.+?)\s*$/.exec(line);
    if (!m) return line;

    const [, prefix, rawValue] = m;
    // Strip a trailing comment, then surrounding quotes.
    const withoutComment = rawValue.replace(/\s+#.*$/, '');
    const value = withoutComment.trim();

    // Already an argv list, or an empty template placeholder — leave alone.
    if (value.startsWith('[')) return line;

    const unquoted = value.replace(/^["']|["']$/g, '');
    if (unquoted.trim() === '') return line;

    // Re-check the UNQUOTED text: `"npm test"` is safe even though the raw
    // value carries quote characters.
    const verdict = classifyCommand(unquoted);
    if (!verdict.safe) {
      skipped.push({ command: unquoted, reason: verdict.reason });
      return line;
    }

    const argv = toArgv(unquoted);
    migrated.push({ from: unquoted, to: argv });
    const comment = rawValue.match(/\s+#.*$/)?.[0] ?? '';
    return `${prefix}[${argv.join(', ')}]${comment}`;
  });

  return { content: out.join('\n'), migrated, skipped };
}
