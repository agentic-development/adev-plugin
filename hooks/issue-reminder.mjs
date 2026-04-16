/**
 * Issue Reminder Hook — ESM module invoked by issue-reminder.sh
 *
 * Reads stdin JSON (PostToolUse protocol), maintains a counter,
 * and periodically surfaces active issues + execution state.
 *
 * Always outputs valid JSON to stdout. Always exits 0.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_ROOT = join(__dirname, "..", "lib");

const COUNTER_FILE = ".context-index/.reminder-counter";
const MANIFEST_FILE = ".context-index/manifest.yaml";

function output(json) {
  process.stdout.write(JSON.stringify(json) + "\n");
}

function exit0() {
  output({});
  process.exit(0);
}

/**
 * Read and parse the manifest's tasks section.
 * Returns { backend, reminderInterval } or null.
 */
function readManifestTasks() {
  try {
    const raw = readFileSync(MANIFEST_FILE, "utf8");
    const backendMatch = raw.match(/backend:\s*(\S+)/);
    const intervalMatch = raw.match(/reminder_interval:\s*(\S+)/);

    const backend = backendMatch ? backendMatch[1] : "";
    let interval = 25; // default
    if (intervalMatch) {
      const parsed = parseInt(intervalMatch[1], 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        interval = parsed;
      }
    }

    return { backend, interval };
  } catch {
    return null;
  }
}

/**
 * Read counter from file. Returns 0 if missing/malformed.
 */
function readCounter() {
  try {
    const raw = readFileSync(COUNTER_FILE, "utf8").trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Write counter to file.
 */
function writeCounter(n) {
  try {
    mkdirSync(dirname(COUNTER_FILE), { recursive: true });
    writeFileSync(COUNTER_FILE, String(n));
  } catch {
    // swallow — counter is best-effort
  }
}

/**
 * Detect git commit from PostToolUse input.
 */
function isGitCommit(input) {
  if (!input || input.tool_name !== "Bash") return false;
  const cmd = input.tool_input?.command || "";
  return cmd.includes("git commit");
}

/**
 * Format the standard reminder block (in-progress issues + execution state).
 */
function formatReminder(issues, executionState, isCommitTrigger) {
  let block = "---\nname: issue-reminder\ndescription: \"Periodic reminder of active issues and current execution state.\"\n---\n\n# Active Issues\n\n";
  block += "| ID | Title | Priority |\n|----|-------|----------|\n";

  for (const issue of issues) {
    block += `| ${issue.id} | ${issue.title} | ${issue.priority} |\n`;
  }

  if (executionState && executionState.status === "active") {
    block += `\n**Current Task:** ${executionState.currentTask} (from ${executionState.planRef})\n`;
    block += `**Next Action:** ${executionState.nextAction}\n`;
  }

  block += "\nKeep these issues updated as you work. Use /adev:issues to update status.";

  if (isCommitTrigger) {
    block += "\n\nYou just committed code. Verify that in-progress issues reflect your latest changes.";
  }

  return block;
}

/**
 * Format the idle nudge (no in-progress issues).
 */
function formatIdleNudge(openIssues, executionState) {
  let block = "";

  if (openIssues.length > 0) {
    block = "---\nname: idle-nudge\ndescription: \"No issues are in progress. Consider picking up the next task.\"\n---\n\n# No Active Work\n\n";
    block += "No issues are currently in_progress. Here are the next open issues by priority:\n\n";
    block += "| ID | Title | Priority | Type |\n|----|-------|----------|------|\n";

    const top3 = openIssues.slice(0, 3);
    for (const issue of top3) {
      block += `| ${issue.id} | ${issue.title} | ${issue.priority} | ${issue.type || "task"} |\n`;
    }

    block += "\nPick one up with `/adev:issues update <id> --status in_progress`, or run `/adev:issues` to review the full board.";
  } else {
    block = "---\nname: idle-nudge\ndescription: \"All tracked issues are resolved.\"\n---\n\n# All Issues Resolved\n\n";
    block += "All tracked issues are closed or deferred. If there is more work to do, run `/adev:work` to triage new tasks or `/adev:issues create` to file new issues.";
  }

  // Stale execution state warning
  if (executionState && executionState.status === "active") {
    block += `\n\n**Warning:** Execution state shows active work (plan: ${executionState.planRef}, task: ${executionState.currentTask}) but no issues are in_progress. This may indicate the issue board is out of sync. Run \`/adev:issues\` to review and update.`;
  }

  return block;
}

// --- Main ---

let stdinData = "";
process.stdin.on("data", (chunk) => { stdinData += chunk; });
process.stdin.on("end", async () => {
  try {
    let input = {};
    try { input = JSON.parse(stdinData); } catch { /* ignore */ }

    // Check manifest for tasks config
    const tasksCfg = readManifestTasks();
    if (!tasksCfg || !tasksCfg.backend) {
      exit0();
      return;
    }

    // If interval is 0, reminders are disabled
    if (tasksCfg.interval === 0) {
      exit0();
      return;
    }

    const commitTrigger = isGitCommit(input);
    const counter = readCounter();

    // Check if we should trigger
    const shouldTrigger = commitTrigger || (counter + 1 >= tasksCfg.interval);

    if (!shouldTrigger) {
      writeCounter(counter + 1);
      exit0();
      return;
    }

    // Reset counter
    writeCounter(0);

    // Dynamic import of ESM libs (relative to this file's location)
    let issues = [];
    let openIssues = [];
    let executionState = null;

    try {
      const { getIssueManager } = await import(join(LIB_ROOT, "issues", "registry.mjs"));
      const manifest = { tasks: { backend: tasksCfg.backend } };
      const mgr = getIssueManager(manifest);
      const allIssues = await mgr.list({});

      issues = allIssues.filter(i => i.status === "in_progress");
      openIssues = allIssues
        .filter(i => i.status === "open")
        .sort((a, b) => (a.priority || 4) - (b.priority || 4));
    } catch {
      // Issue board read failed — exit silently
      exit0();
      return;
    }

    try {
      const { readExecutionState } = await import(join(LIB_ROOT, "execution-state.mjs"));
      executionState = readExecutionState(process.cwd());
    } catch {
      // Execution state read failed — continue without it
    }

    let reminderBlock = "";
    if (issues.length > 0) {
      reminderBlock = formatReminder(issues, executionState, commitTrigger);
    } else {
      reminderBlock = formatIdleNudge(openIssues, executionState);
    }

    output({
      hookSpecificOutput: {
        additionalContext: reminderBlock,
      },
    });
  } catch {
    exit0();
  }
});
