/**
 * `adev issues <subcommand>` — parent dispatcher for issue-board sub-verbs.
 *
 * Exposes `migrate`, `claim`, `release`, `stale`, and `set-modules`. Structured
 * this way so future sub-verbs (e.g., `issues list`, `issues ready`) compose
 * cleanly without polluting the top-level VERB_REGISTRY.
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
  console.log("  claim      Take ownership of an issue (atomic check-and-set)");
  console.log("  release    Give up ownership of an issue");
  console.log("  stale      List claims whose lease has expired (read-only report)");
  console.log("  set-modules  Set WorkItem.affected_modules (module-safety tag for the bugfix loop)");
  console.log("  next         Return the next eligible bug (read-only)");
  console.log("  record-attempt  Write an AttemptRecord for a completed /adev:debug --auto attempt");
  console.log("  show         Print one issue's fields as JSON (read-only)");
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
