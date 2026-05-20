// lib/cli/implement.mjs
//
// `adev implement read-routing` — CLI surface wrapping
// lib/plan-routing-sidecar.mjs::lookupRoutingEntry so the /adev:implement
// SKILL.md names a verb instead of inlining inline-Routing-block parsing
// against the plan body (cli-driver-surface charter; CON-8 in
// plan-task-events.spec.md).
//
// Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
// Plan-task: t3
//
// Subverbs:
//   adev implement read-routing --plan <plan-path> --task-id <id>
//                               [--agents-allowlist <csv>]
//
// Exit codes:
//   0 success — entry printed as JSON on stdout
//   1 argument error, INVALID_PLAN_PATH
//   2 ROUTING_SIDECAR_MISSING
//   3 ROUTING_ENTRY_MISSING
//   4 ROUTING_AGENT_INVALID
//
// The `--agents-allowlist` flag is optional. When supplied (comma-separated
// list of legal agent slugs), the resolved entry's `selected_agent` is
// validated against the list — if absent, ROUTING_AGENT_INVALID is raised
// without dispatching anything. When the flag is omitted, the agent slug is
// passed through unchecked (callers without an allowlist accept whatever the
// sidecar names).

import { parseArgs } from "node:util";

import { lookupRoutingEntry } from "../plan-routing-sidecar.mjs";

const USAGE =
  "usage: adev implement <read-routing> --plan <plan-path> --task-id <id> [--agents-allowlist <csv>]";

export async function run({ argv }) {
  const sub = argv[0];
  if (!sub) {
    console.error(USAGE);
    process.exit(1);
  }
  switch (sub) {
    case "read-routing":
      return cmdReadRouting(argv.slice(1));
    default:
      console.error(`unknown subverb: ${sub}\n${USAGE}`);
      process.exit(1);
  }
}

function cmdReadRouting(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        plan: { type: "string" },
        "task-id": { type: "string" },
        "agents-allowlist": { type: "string" },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(`argument error: ${err.message}\n${USAGE}`);
    process.exit(1);
  }

  const planPath = parsed.values.plan;
  const taskId = parsed.values["task-id"];
  const allowlistArg = parsed.values["agents-allowlist"];

  if (!planPath) {
    console.error("--plan <plan-path> is required");
    process.exit(1);
  }
  if (!taskId) {
    console.error("--task-id <id> is required");
    process.exit(1);
  }

  const allowlist = allowlistArg
    ? new Set(
        allowlistArg
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;

  let entry;
  try {
    entry = lookupRoutingEntry(planPath, taskId);
  } catch (err) {
    const code = err && err.code;
    if (code === "ROUTING_SIDECAR_MISSING") {
      console.error(err.message);
      process.exit(2);
    }
    if (code === "ROUTING_ENTRY_MISSING") {
      console.error(err.message);
      process.exit(3);
    }
    if (code === "INVALID_PLAN_PATH") {
      console.error(err.message);
      process.exit(1);
    }
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }

  if (allowlist && !allowlist.has(entry.selected_agent)) {
    console.error(
      `ROUTING_AGENT_INVALID: '${entry.selected_agent}' for task ${taskId} is not in allowlist (${[...allowlist].join(", ")}) — re-run /adev:route`,
    );
    process.exit(4);
  }

  console.log(JSON.stringify(entry));
  process.exit(0);
}

export function help() {
  console.log("Usage: adev implement <subverb> [flags]");
  console.log("");
  console.log("Subverbs:");
  console.log("  read-routing --plan <plan-path> --task-id <id> [--agents-allowlist <csv>]");
  console.log("");
  console.log("    Resolves the routing entry for a single task and prints it as JSON.");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  success — entry JSON on stdout");
  console.log("  1  argument error, INVALID_PLAN_PATH");
  console.log("  2  ROUTING_SIDECAR_MISSING");
  console.log("  3  ROUTING_ENTRY_MISSING");
  console.log("  4  ROUTING_AGENT_INVALID");
}
