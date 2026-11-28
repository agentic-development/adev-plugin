/**
 * `adev issues github setup` — verify the configured GitHub Project, or create
 * the recommended default board's missing fields after confirmation.
 *
 * `--yes` is read from argv alone: never from the manifest, never from a prior
 * run (setup writes no local state), and `--auto` does not imply it.
 *
 * @module lib/cli/issues-github
 */

import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { normalizeGithubConfig } from "../issues/github/config.mjs";
import { GITHUB_ERROR_CODES as CODES, githubError } from "../issues/github/errors.mjs";
import { CREATE_FIELD } from "../issues/github/mutations.mjs";
import { probeProject } from "../issues/github/preflight.mjs";
import { readBoard } from "../issues/github/board-read.mjs";
import { RECOMMENDED_BOARD, SETUP_CANCELLED, SETUP_CONFIRMATION_REQUIRED, checkProject, planWrites, typeLabel } from "../issues/github/setup.mjs";
import { createTransport } from "../issues/github/transport.mjs";

const USAGE = "usage: adev issues github setup [--check] [--dry-run] [--yes] [--json]";
const OPTION_COLOR = "GRAY";

export function help(log = console.log) {
  log(USAGE);
  log("");
  log("Verify the GitHub Project configured in tasks.github, or create the recommended");
  log("default board's missing fields (Status, Priority and the adev text fields).");
  log("");
  log("  --check    Read-only: report each required field and option as ok / missing /");
  log("             wrong type, and board drift. Exit 0 when every field and option is");
  log("             present with the right type (drift is a warning), else 1.");
  log("  --dry-run  Print the write set and exit 0 without writing.");
  log("  --yes      Apply the write set without the interactive confirmation (required");
  log("             when not on a terminal; never read from configuration).");
  log("  --json     Emit the report (--check), the write set (--dry-run) or the apply result");
  log("             as one JSON object on stdout; progress and prompts go to stderr.");
  log("");
  log("setup only creates missing fields. It never deletes, renames or retypes a field,");
  log("never changes an existing field's options and never clears an item's value;");
  log("those changes are printed as manual steps.");
}

function parseFlags(args) {
  const opts = { check: false, dryRun: false, yes: false, json: false, help: false };
  for (const a of args) {
    if (a === "--check") opts.check = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--yes") opts.yes = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--auto") continue;
    else return { error: `unrecognized argument: ${a}` };
  }
  return { opts };
}

/**
 * Whether setup may ask for confirmation. Decided by stdin and stderr, not stdout:
 * the prompt is written to stderr, so `setup --json | jq` from a terminal still prompts.
 */
export function isInteractive({ stdin = process.stdin, stderr = process.stderr } = {}) {
  return Boolean(stdin?.isTTY && stderr?.isTTY);
}

/** Ask a yes/no question on stderr, keeping stdout free for the --json result. */
export async function promptConfirm(message, { input = process.stdin, output = process.stderr } = {}) {
  const rl = createInterface({ input, output });
  try {
    return /^y(es)?$/i.test((await rl.question(message)).trim());
  } finally {
    rl.close();
  }
}

// GitHub rejecting the mutation (the transport's catch-all) is a write failure;
// a more specific code (permission, rate limit, unreachable) is kept.
function writeFailed(err, name) {
  if (err?.code !== CODES.GITHUB_REQUEST_FAILED) return err;
  const reasons = Array.isArray(err.graphqlErrors) && err.graphqlErrors.length > 0
    ? err.graphqlErrors.map((e) => e.message).join("; ")
    : err.message;
  return githubError(CODES.GITHUB_WRITE_FAILED, `GitHub rejected creating field "${name}": ${reasons}`, { field: name });
}

function printCheck(report, project, log) {
  log(`Project ${project}:`);
  for (const field of report.fields) {
    const detail = field.status === "wrong type" ? ` (is ${typeLabel(field.actualType)})` : "";
    log(`  ${field.name} (${typeLabel(field.type)}): ${field.status}${detail}`);
    for (const option of field.options ?? []) log(`    option ${option.name}: ${option.status}`);
  }
  log(report.ok ? "Ready: every required field and option is present." : "Not ready: run `adev issues github setup` to create the missing fields.");
  if (report.drift.length === 0) {
    log("Drift: none.");
    return;
  }
  log(`Drift (warnings, ${report.drift.length}):`);
  for (const d of report.drift) log(`${d.id}  ${d.kind}  ${d.value}`);
}

function printPlan(plan, project, log) {
  if (plan.create.length === 0) {
    log(`Nothing to create on ${project}.`);
  } else {
    log(`Write set for ${project} (${plan.create.length} field(s) to create):`);
    for (const field of plan.create) {
      const options = field.options ? ` with options ${field.options.join(", ")}` : "";
      log(`  create field ${field.name} (${typeLabel(field.dataType)})${options}`);
    }
  }
  if (plan.skipped.length > 0) {
    log("Manual steps (not applied by setup):");
    for (const step of plan.skipped) log(`  ${step.name}: ${step.manual}`);
  }
  log("Suggested views (documentation only; setup does not create views):");
  for (const view of RECOMMENDED_BOARD.views) log(`  ${view.name} (${view.layout}): ${view.description}`);
}

function createVariables(projectId, field) {
  const variables = { projectId, name: field.name, dataType: field.dataType };
  if (field.options) variables.singleSelectOptions = field.options.map((name) => ({ name, color: OPTION_COLOR, description: "" }));
  return variables;
}

/**
 * @param {{ projectRoot: string, argv: string[], manifest: object, exec?: Function, env?: object,
 *   isTTY?: boolean, confirm?: (message: string) => Promise<boolean>,
 *   log?: (s: string) => void, error?: (s: string) => void }} options -
 *   `exec`, `isTTY`, `confirm`, `log` and `error` are injectable for tests
 * @returns {Promise<number>} exit code
 */
export async function run({
  argv,
  manifest,
  exec = execFileSync,
  env = process.env,
  isTTY = isInteractive(),
  confirm = promptConfirm,
  log = console.log,
  error = console.error,
}) {
  const [sub, ...rest] = argv ?? [];
  if (sub === "--help" || sub === "-h") {
    help(log);
    return 0;
  }
  if (sub !== "setup") {
    error(sub ? `unknown issues github subcommand: ${sub}` : "missing issues github subcommand");
    help(error);
    return 1;
  }
  const { opts, error: parseError } = parseFlags(rest);
  if (parseError) {
    error(parseError);
    error(USAGE);
    return 1;
  }
  if (opts.help) {
    help(log);
    return 0;
  }

  let applying = false;
  const fail = (code, message, created = []) => {
    error(`${code}: ${message}`);
    if (applying && opts.json) log(JSON.stringify({ ok: false, code, created }));
    return 1;
  };

  try {
    applying = !opts.check && !opts.dryRun;
    const config = normalizeGithubConfig(manifest?.tasks?.github);
    const transport = createTransport({ exec, env });
    const { project } = probeProject(transport, config);
    const fields = project.fields?.nodes ?? [];

    if (opts.check) {
      const moduleSlugs = (manifest?.modules ?? []).map((m) => m?.slug).filter((s) => typeof s === "string");
      const board = readBoard(transport, config, { projectId: project.id, moduleSlugs });
      const report = checkProject({ fields, board }, config);
      if (opts.json) log(JSON.stringify(report));
      else printCheck(report, config.project, log);
      return report.ok ? 0 : 1;
    }

    const plan = planWrites(checkProject({ fields }, config));
    if (opts.dryRun && opts.json) {
      log(JSON.stringify({ dryRun: true, ...plan, views: RECOMMENDED_BOARD.views }));
      return 0;
    }
    // In --json mode stdout carries only the final result object.
    const say = opts.json ? error : log;
    printPlan(plan, config.project, say);
    if (opts.dryRun) return 0;
    if (plan.create.length === 0) {
      if (opts.json) log(JSON.stringify({ ok: true, created: [], skipped: plan.skipped }));
      return 0;
    }

    if (!opts.yes) {
      if (!isTTY) {
        return fail(SETUP_CONFIRMATION_REQUIRED, `setup would write to ${config.project}, but this is not an interactive terminal. Rerun with --yes to apply the write set above, or --dry-run to only print it.`);
      }
      if (!(await confirm(`Create ${plan.create.length} field(s) on ${config.project}? [y/N] `))) {
        return fail(SETUP_CANCELLED, "setup cancelled; nothing was written.");
      }
    }

    const created = [];
    for (const field of plan.create) {
      try {
        transport.request(CREATE_FIELD, createVariables(project.id, field));
      } catch (err) {
        throw Object.assign(writeFailed(err, field.name), { created: [...created] });
      }
      created.push(field.name);
      say(`created field ${field.name}`);
    }
    if (opts.json) log(JSON.stringify({ ok: true, created, skipped: plan.skipped }));
    else say(`Created ${created.length} field(s).${plan.skipped.length > 0 ? " Complete the manual steps above, then run `adev issues github setup --check`." : ""}`);
    return 0;
  } catch (err) {
    const created = Array.isArray(err?.created) ? err.created : [];
    fail(err?.code ?? "ERROR", err?.message ?? String(err), created);
    if (created.length > 0) error(`Already created before the failure: ${created.join(", ")}. Rerun setup to create the rest.`);
    return 1;
  }
}

export default { run, help };
