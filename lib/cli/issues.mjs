/**
 * `adev issues <subcommand>` — parent dispatcher for issue-board sub-verbs.
 *
 * Currently exposes one subcommand: `migrate`. Structured this way so future
 * sub-verbs (e.g., `issues list`, `issues ready`) compose cleanly without
 * polluting the top-level VERB_REGISTRY.
 *
 * Spec: .context-index/specs/features/task-management/backend-migration.spec.md
 * Plan-task: 2
 *
 * Contract:
 *   - `run({ projectRoot, argv, manifest })` returns a numeric exit code.
 *     The CLI dispatcher does not honor the return value (it always exits 0
 *     on a clean throw-free completion), so non-zero exits also call
 *     `process.exit(code)` directly. Tests that need to call `run()` in-
 *     process should rely on the returned code; tests that drive the CLI
 *     surface should invoke `node cli/index.mjs issues …` via `spawnSync`
 *     to observe the real exit code.
 *
 * Uses only Node.js built-ins.
 */

export function help() {
  console.log("Usage: adev issues <subcommand> [args]");
  console.log("");
  console.log("Subcommands:");
  console.log("  migrate    Convert the issue board to a different backend");
  console.log("");
  console.log("Run `adev issues <subcommand> --help` for subcommand-specific help.");
}

export async function run({ projectRoot, argv, manifest }) {
  const sub = argv && argv[0];
  if (!sub) {
    help();
    return 1;
  }

  if (sub === "migrate") {
    const mod = await import("./issues-migrate.mjs");
    return mod.run({ projectRoot, argv: argv.slice(1), manifest });
  }

  console.error(`unknown issues subcommand: ${sub}`);
  help();
  return 1;
}

export default { run, help };
