/**
 * `adev issues migrate` — convert the issue board between backends.
 *
 * Spec: .context-index/specs/features/task-management/backend-migration.spec.md
 * Plan: .context-index/specs/features/task-management/backend-migration.plan.md
 *
 * Skeleton at plan-task 2; arg parsing + behavior lands in plan-task 3+.
 *
 * Contract (new-pattern CLI helper):
 *   - exports `run({ projectRoot, argv, manifest })` returning a numeric exit code
 *   - exports `help()` printing usage to stdout
 *
 * Uses only Node.js built-ins.
 */

export function help() {
  console.log(
    "Usage: adev issues migrate --to <backend> [--from <backend>] " +
      "[--include-closed] [--dry-run]",
  );
  console.log("");
  console.log("Migrate the configured issue board to a different backend.");
  console.log("");
  console.log("Flags:");
  console.log("  --to <backend>       Target backend (json, beads). Required.");
  console.log("  --from <backend>     Source backend; defaults to manifest tasks.backend.");
  console.log("  --include-closed     Include closed items in scope (default excludes them).");
  console.log("  --dry-run            Print the planned actions as JSON; write nothing.");
}

export async function run({ projectRoot, argv, manifest }) {
  // Plan-task 2 stub: wiring only. Subsequent tasks flesh out the body.
  // Returning a non-zero exit when no args are provided keeps the dispatcher
  // honest once Task 3 starts validating --to.
  if (!argv || argv.length === 0) {
    help();
    return 1;
  }
  return 0;
}

export default { run, help };
