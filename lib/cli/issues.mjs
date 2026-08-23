/**
 * `adev issues <subcommand>` — parent dispatcher for issue-board sub-verbs.
 *
 * Exposes `board`, `create`, `epic`, `update`, `close`, `dep`, `milestone`,
 * `migrate`, `claim`, `release`, `stale`, `set-modules`, `next`,
 * `record-attempt`, `show`, `list`, and `ready`. Structured this way so
 * further sub-verbs compose cleanly without polluting the top-level
 * VERB_REGISTRY.
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
  console.log("  board      Print the whole board as canonical markdown (read-only)");
  console.log("  create     Create a board item (feature, task, bug) in the issue store");
  console.log("  epic       Create an epic in the epic store, optionally on a milestone");
  console.log("  update     Edit an issue or an epic, resolved from the id alone");
  console.log("  close      Close an item through the dependency/cascade guards");
  console.log("  dep        Record that one issue is blocked by another");
  console.log("  milestone  Create, list, ship or defer a milestone (create|list|ship|defer)");
  console.log("  migrate    Convert the issue board to a different backend");
  console.log("  claim      Take ownership of an issue (atomic check-and-set)");
  console.log("  release    Give up ownership of an issue");
  console.log("  stale      List claims whose lease has expired (read-only report)");
  console.log("  set-modules  Set WorkItem.affected_modules (module-safety tag for the bugfix loop)");
  console.log("  next         Return the next eligible bug (read-only)");
  console.log("  record-attempt  Write an AttemptRecord for a completed /adev:debug --auto attempt");
  console.log("  show       Print one issue's fields as JSON (read-only)");
  console.log("  list       List issues as a table, filtered and priority-sorted");
  console.log("  ready      List open, unblocked issues (read-only)");
  console.log("  board migrate  Manage the beads board's git topology");
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

  if (sub === "epic") {
    const mod = await import("./issues-epic.mjs");
    if (argv.includes("--help") || argv.includes("-h")) {
      mod.help();
      return 0;
    }
    return mod.run({ projectRoot, argv: argv.slice(1), manifest });
  }

  if (sub === "update" || sub === "close" || sub === "dep") {
    const mod = await import("./issues-mutate.mjs");
    if (argv.includes("--help") || argv.includes("-h")) {
      mod.help(sub);
      return 0;
    }
    return mod.run(sub, { projectRoot, argv: argv.slice(1), manifest });
  }

  if (sub === "milestone") {
    // Pass the args through untouched — issues-milestone parses `--help`
    // itself, the way `migrate` does. It has FOUR second-level sub-verbs, each
    // with its own usage line, so intercepting `--help` here would answer
    // `adev issues milestone ship --help` with the milestone subcommand list
    // and put ship's flags out of reach. Do not "fix" this into the
    // board/list shape below.
    const mod = await import("./issues-milestone.mjs");
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

  if (sub === "board") {
    const mod = await import("./issues-board.mjs");
    if (argv.includes("--help") || argv.includes("-h")) {
      mod.help();
      return 0;
    }
    return mod.run({ projectRoot, argv: argv.slice(1), manifest });
  }

  if (sub === "list" || sub === "ready") {
    const mod = await import("./issues-list.mjs");
    if (argv.includes("--help") || argv.includes("-h")) {
      mod.help(sub);
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

  if (sub === "set-modules") {
    const mod = await import("./issues-set-modules.mjs");
    if (argv.includes("--help") || argv.includes("-h")) {
      mod.help();
      return 0;
    }
    return mod.run({ projectRoot, argv: argv.slice(1), manifest });
  }

  if (sub === "next") {
    const mod = await import("./issues-next.mjs");
    if (argv.includes("--help") || argv.includes("-h")) {
      mod.help();
      return 0;
    }
    return mod.run({ projectRoot, argv: argv.slice(1), manifest });
  }

  if (sub === "record-attempt") {
    const mod = await import("./issues-record-attempt.mjs");
    if (argv.includes("--help") || argv.includes("-h")) {
      mod.help();
      return 0;
    }
    return mod.run({ projectRoot, argv: argv.slice(1), manifest });
  }

  if (sub === "show") {
    const mod = await import("./issues-show.mjs");
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
