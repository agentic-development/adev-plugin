/**
 * `adev issues <subcommand>` — parent dispatcher for issue-board sub-verbs.
 *
 * Exposes `create`, `migrate`, `claim`, `release`, and `stale`. Structured this
 * way so future sub-verbs (e.g., `issues list`, `issues ready`) compose cleanly
 * without polluting the top-level VERB_REGISTRY.
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

/**
 * Opt out of the dispatcher's blanket `--help` short-circuit in cli/index.mjs.
 *
 * That short-circuit fires on `--help` anywhere in the args, so without this
 * flag `adev issues create --help` printed THIS subcommand list instead of
 * create's own flags. Every sub-verb below either handles `--help` itself or
 * is routed to its `help()` here, and a bare `adev issues --help` still lands
 * on the parent help via `run()`.
 */
export const dispatchesSubcommandHelp = true;

export function help() {
  console.log("Usage: adev issues <subcommand> [args]");
  console.log("");
  console.log("Subcommands:");
  console.log("  create     Create a board item (epic, feature, task, bug)");
  console.log("  migrate    Convert the issue board to a different backend");
  console.log("  claim      Take ownership of an issue (atomic check-and-set)");
  console.log("  release    Give up ownership of an issue");
  console.log("  stale      List claims whose lease has expired (read-only report)");
  console.log("");
  console.log("Run `adev issues <subcommand> --help` for subcommand-specific help.");
}

export async function run({ projectRoot, argv, manifest }) {
  const sub = argv && argv[0];
  if (!sub) {
    help();
    return 1;
  }

  // `adev issues --help` — the parent's own help, and a success, not the
  // usage error that a missing subcommand returns.
  if (sub === "--help" || sub === "-h") {
    help();
    return 0;
  }

  if (sub === "create") {
    const mod = await import("./issues-create.mjs");
    if (argv.includes("--help") || argv.includes("-h")) {
      mod.help();
      return 0;
    }
    return mod.run({ projectRoot, argv: argv.slice(1), manifest });
  }

  if (sub === "migrate") {
    // issues-migrate parses `--help` itself; pass the args through untouched.
    const mod = await import("./issues-migrate.mjs");
    return mod.run({ projectRoot, argv: argv.slice(1), manifest });
  }

  if (sub === "claim" || sub === "release") {
    const mod = await import("./issues-claim.mjs");
    if (argv.includes("--help") || argv.includes("-h")) {
      mod.help();
      return 0;
    }
    return mod.run(sub, { projectRoot, argv: argv.slice(1), manifest });
  }

  if (sub === "stale") {
    const mod = await import("./issues-stale.mjs");
    if (argv.includes("--help") || argv.includes("-h")) {
      mod.help();
      return 0;
    }
    return mod.run({ projectRoot, argv: argv.slice(1), manifest });
  }

  console.error(`unknown issues subcommand: ${sub}`);
  help();
  return 1;
}

export default { run, help };
