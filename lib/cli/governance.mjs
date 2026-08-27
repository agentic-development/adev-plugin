// lib/cli/governance.mjs
//
// adev governance materialize --registry <name> [--dry-run] [--json]
// adev governance drift [--registry <name>] [--json]
// adev governance reviewers [--json]
// adev governance migrate-gates [--dry-run] [--json]
//
// `materialize` writes a governance registry's EFFECTIVE set into the project's
// own file and stamps the write-once `materialized_at` marker, so that reading
// the file tells you what runs. All computation lives in
// lib/governance/materialize.mjs; this module owns argument parsing, output
// formatting and exit codes.
//
// `drift` is hygiene Audit Pass 19 — the read-only counterpart, and (since
// run-time composition was removed) the only channel through which an
// unadopted plugin/domain upgrade, a switched-off bundled check, or a
// non-project entry carrying an execution-bearing field becomes visible. Its
// computation lives in lib/hygiene/registry-drift.mjs. It is advisory: it exits
// 0 whether or not it found anything.
//
// `migrate-gates` rewrites shell-string `command:` values in the project's own
// governance/gates.yaml to argv lists (lib/migrate-gate-commands.mjs) —
// `mergeGates` (SEC-2) drops any such entry at load, silently, with no gate
// ever running in its place. `cmdUpgrade` already runs this repair, but only
// on the `adev upgrade` path — a plugin-cache version bump never calls it, so
// a project that only ever upgraded that way stays broken. This verb is the
// same repair reachable independent of `adev upgrade`, so `/adev:init`'s
// diagnostic mode (which users do run after a plugin upgrade) can offer it.
//
// Exit codes (the `adev gate doctor` convention, minus the findings code —
// materialize either succeeds or refuses, it never reports findings):
//   0  success, including a no-op second run and every --dry-run; and every
//      successful `drift` scan regardless of finding count; and every
//      `migrate-gates` run, migrated or not
//   1  argument error, an unknown or EXEMPT registry, a containment refusal,
//      or a refusal to write (MATERIALIZE_LOAD_INCOMPLETE, MATERIALIZE_WOULD_DROP,
//      MATERIALIZE_SOURCE_UNMAPPED, GOVERNANCE_PARSE_REFUSED,
//      GOVERNANCE_SCALAR_UNSAFE)
//
// Contract (driver-substrate): exports `run({ projectRoot, argv, manifest })`
// and `help()`. Does NOT export LIFECYCLE_STEP — materializing a registry, and
// auditing one, are maintenance, not lifecycle step entry or exit.

import { parseArgs } from "node:util";
import { resolve } from "node:path";

const USAGE =
  "usage: adev governance materialize --registry <review|diagnostics|gates> [--dry-run] [--json]\n" +
  "       adev governance drift [--registry <validate|review|diagnostics|gates>] [--json]\n" +
  "       adev governance reviewers [--json]\n" +
  "       adev governance migrate-gates [--dry-run] [--json]";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];
  if (sub === "--help" || sub === "-h" || sub === "help") {
    help();
    process.exit(0);
  }
  if (sub === "drift") {
    return runDrift(projectRoot, argv.slice(1));
  }
  if (sub === "reviewers") {
    return runReviewers(projectRoot, argv.slice(1));
  }
  if (sub === "migrate-gates") {
    return runMigrateGates(projectRoot, argv.slice(1));
  }
  if (sub !== "materialize") {
    console.error(USAGE);
    console.error(`  unknown subcommand: ${sub === undefined ? "<none>" : sub}`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        registry: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        json: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    console.error(`  ${err?.message ?? String(err)}`);
    process.exit(1);
  }

  const { registry } = parsed.values;
  if (!registry) {
    console.error(USAGE);
    console.error("  missing --registry");
    process.exit(1);
  }

  const { materialize } = await import("../governance/materialize.mjs");

  let result;
  try {
    result = await materialize(resolve(projectRoot), registry, {
      dryRun: parsed.values["dry-run"],
    });
  } catch (err) {
    console.error(`${err?.code ?? "ERROR"}: ${err?.message ?? String(err)}`);
    process.exit(1);
  }

  const envelope = {
    registry: result.registry,
    path: result.path,
    root_key: result.root_key,
    materialized_at: result.materialized_at,
    marker_written: result.marker_written,
    already_explicit: result.already_explicit,
    newly_written: result.newly_written,
    // Non-blocking loader diagnostics. An ERROR-severity one never reaches
    // here: it refuses the run (MATERIALIZE_LOAD_INCOMPLETE) rather than being
    // reported alongside a stamped marker.
    warnings: result.warnings,
    changed: result.changed,
    dry_run: result.dry_run,
  };

  if (parsed.values.json) {
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    printReport(result, envelope);
  }
  process.exit(0);
}

/**
 * `adev governance reviewers` — THE dispatching reviewer set.
 *
 * This verb exists because `lib/governance/review-config.mjs::loadReviewConfig`
 * had no CLI surface at all. `skills/review-specs/SKILL.md` names it as "the
 * reviewer set that actually dispatches", but a skill may not call a library
 * directly (no inline Node), so the only thing /adev:review-specs could
 * actually run was `adev domain load-reviewers` — which merges the DOMAIN
 * OVERLAY at run time and is exactly the composition Task 11 removed. Worse,
 * `loadReviewConfig`'s fail-closed `assertMaterialized` guard was therefore
 * unreachable in practice, which reads as coverage while enforcing nothing.
 *
 * So the resolution is to WIRE THE REAL PATH rather than to re-describe the
 * wrong one: this verb is the single dispatch surface, it runs the guard, and
 * `adev domain load-reviewers` is demoted in the skill to what it has actually
 * been since Task 11 — a comparison view of what the domain would contribute.
 *
 * Exit 1 on any loader error (the skill aborts on errors); exit 0 otherwise,
 * warnings and notes included in the envelope.
 */
async function runReviewers(projectRoot, args) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: { json: { type: "boolean", default: false } },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    console.error(`  ${err?.message ?? String(err)}`);
    process.exit(1);
  }

  const { loadReviewConfig } = await import("../governance/review-config.mjs");

  let cfg;
  try {
    cfg = loadReviewConfig(resolve(projectRoot));
  } catch (err) {
    console.error(`${err?.code ?? "ERROR"}: ${err?.message ?? String(err)}`);
    process.exit(1);
  }

  const envelope = {
    reviewers: cfg.reviewers,
    disabled: cfg.disabled ?? [],
    context_packs: cfg.contextPacks,
    verdict_rules: cfg.verdictRules,
    warnings: cfg.warnings,
    errors: cfg.errors,
    notes: cfg.notes,
  };

  if (parsed.values.json) {
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log("# governance reviewers — the set that dispatches");
    console.log("");
    for (const r of envelope.reviewers) {
      const off = r.enabled === false ? `  DISABLED (${r.disabled_reason ?? "no reason given"})` : "";
      console.log(`  ${r.id}  [${r.severity_cap ?? "blocker"}]${off}`);
    }
    if (envelope.reviewers.length === 0) console.log("  (none — the project declares no reviewers)");
    for (const n of envelope.notes) console.log(`note:    ${n}`);
    for (const w of envelope.warnings) console.log(`warning: ${w.code}: ${w.message}`);
    for (const e of envelope.errors) console.log(`error:   ${e.code}: ${e.message}`);
  }

  process.exit(envelope.errors.length > 0 ? 1 : 0);
}

/**
 * `adev governance migrate-gates` — repair legacy shell-string gate commands
 * outside the `adev upgrade` path.
 *
 * Operates on raw text via `migrateGateCommands` (lib/migrate-gate-commands.mjs),
 * the same pure function `cmdUpgrade` calls — this verb exists so the repair is
 * reachable from a caller other than `adev upgrade` itself, not as a second
 * implementation of it. No materialization check: this is a syntactic repair
 * (shell string → argv) independent of whether the file carries a
 * `materialized_at` marker.
 */
async function runMigrateGates(projectRoot, args) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: {
        "dry-run": { type: "boolean", default: false },
        json: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    console.error(`  ${err?.message ?? String(err)}`);
    process.exit(1);
  }

  const { existsSync, readFileSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { migrateGateCommands } = await import("../migrate-gate-commands.mjs");

  const gatesPath = join(resolve(projectRoot), ".context-index", "governance", "gates.yaml");

  if (!existsSync(gatesPath)) {
    const envelope = { path: gatesPath, exists: false, migrated: [], skipped: [], changed: false, dry_run: parsed.values["dry-run"] };
    if (parsed.values.json) {
      console.log(JSON.stringify(envelope));
    } else {
      console.log(`no governance/gates.yaml at ${gatesPath} — nothing to migrate.`);
    }
    process.exit(0);
  }

  const source = readFileSync(gatesPath, "utf8");
  const { content, migrated, skipped } = migrateGateCommands(source);
  const changed = migrated.length > 0;

  if (changed && !parsed.values["dry-run"]) {
    writeFileSync(gatesPath, content);
  }

  const envelope = {
    path: gatesPath,
    exists: true,
    migrated,
    skipped,
    changed,
    dry_run: parsed.values["dry-run"],
  };

  if (parsed.values.json) {
    console.log(JSON.stringify(envelope));
  } else if (migrated.length === 0 && skipped.length === 0) {
    console.log("governance/gates.yaml: no legacy shell-string commands found.");
  } else {
    for (const { from, to } of migrated) {
      const verb = envelope.dry_run ? "would migrate" : "migrated";
      console.log(`${verb} gate command: "${from}" -> [${to.join(", ")}]`);
    }
    for (const { command, reason } of skipped) {
      console.log(`gate command needs a shell and was left as-is: "${command}" (${reason})`);
    }
  }

  process.exit(0);
}

/**
 * `adev governance drift` — hygiene Audit Pass 19.
 *
 * Read-only and advisory: exit 0 on any successful scan, findings or not. A
 * non-zero exit would make the pass a gate, and divergence between a project's
 * registries and the shipped starters is the expected outcome of
 * customization, not a defect.
 */
async function runDrift(projectRoot, args) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: {
        registry: { type: "string" },
        json: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    console.error(`  ${err?.message ?? String(err)}`);
    process.exit(1);
  }

  const { runRegistryDriftPass, REGISTRY_NAMES } = await import("../hygiene/registry-drift.mjs");

  const registry = parsed.values.registry;
  if (registry !== undefined && !REGISTRY_NAMES.includes(registry)) {
    console.error(USAGE);
    console.error(
      `  unknown registry: ${registry} (Pass 19 audits ${REGISTRY_NAMES.join(", ")}; ` +
        `boundaries.yaml is out of the pass's remit)`,
    );
    process.exit(1);
  }

  let result;
  try {
    result = await runRegistryDriftPass(resolve(projectRoot), registry ? { registry } : {});
  } catch (err) {
    console.error(`${err?.code ?? "ERROR"}: ${err?.message ?? String(err)}`);
    process.exit(1);
  }

  if (parsed.values.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  console.log(`# governance drift (hygiene Audit Pass 19) — ${result.verdict}`);
  console.log("");
  console.log(`domain: ${result.summary.domain ?? "(unresolved)"}`);
  console.log(`registries: ${result.summary.registries.join(", ")}`);
  for (const note of result.headerNotes) console.log(`note: ${note}`);
  console.log("");
  if (result.findings.length === 0) {
    console.log("No divergence: every audited registry matches its starter, no bundled or");
    console.log("domain entry is switched off, and no non-project entry carries an");
    console.log("execution-bearing field.");
  } else {
    for (const f of result.findings) {
      console.log(`[${f.severity}] ${f.registry} — ${f.id}`);
      console.log(`    ${f.message}`);
    }
    console.log("");
    console.log(
      `${result.summary.finding_count} finding(s), ${result.summary.warning_count} warning(s). ` +
        `Advisory — this pass never blocks.`,
    );
  }
  process.exit(0);
}

function printReport(result, envelope) {
  console.log(`# governance materialize — ${result.registry}`);
  console.log("");
  console.log(`${result.path} (root key: ${result.root_key})`);
  console.log(`already explicit: ${format(envelope.already_explicit)}`);
  console.log(`newly written:    ${format(envelope.newly_written)}`);
  console.log(`materialized_at:  ${envelope.materialized_at}`);
  for (const warning of envelope.warnings) {
    console.log(`warning:          ${warning.code}: ${warning.message}`);
  }
  console.log("");
  const diff = unifiedDiff(result.before_text ?? "", result.after_text, result.path);
  console.log(diff === "" ? "(no change)" : diff);
  console.log("");
  console.log(result.dry_run ? "DRY RUN — nothing was written." : "written.");
}

function format(ids) {
  return ids.length === 0 ? "(none)" : ids.join(", ");
}

/**
 * A minimal diff for a write that only ever INSERTS lines: trim the common
 * prefix and suffix and print what is left. Correct for the general case too —
 * it degrades to "the whole middle changed" rather than to a wrong answer —
 * and needs no dependency (Constitution Principle 1).
 */
function unifiedDiff(before, after, label) {
  if (before === after) return "";
  const a = before.split("\n");
  const b = after.split("\n");

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }

  const out = [`--- a/${label}`, `+++ b/${label}`, `@@ -${head + 1} +${head + 1} @@`];
  for (const line of a.slice(head, a.length - tail)) out.push(`-${line}`);
  for (const line of b.slice(head, b.length - tail)) out.push(`+${line}`);
  return out.join("\n");
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Write a governance registry's EFFECTIVE set into the project's own file");
  console.log("and stamp the write-once `materialized_at` marker, so that reading the");
  console.log("file tells you what actually runs.");
  console.log("");
  console.log("  --registry <name>   review | diagnostics | gates");
  console.log("  --dry-run           print the diff and write nothing");
  console.log("  --json              emit the machine-readable envelope");
  console.log("");
  console.log("  validate.yaml and boundaries.yaml are EXEMPT (DDR-1): both are already");
  console.log("  explicit single-source registries, so naming either is refused.");
  console.log("");
  console.log("  Write-once: a second run preserves the original stamp verbatim, so an");
  console.log("  unchanged effective set produces byte-identical output. Entries already");
  console.log("  on disk keep their positions and their bytes; contributed entries are");
  console.log("  appended. Comments and sibling keys survive.");
  console.log("");
  console.log("  Exit codes:");
  console.log("    0  success (including a no-op second run and every --dry-run)");
  console.log("    1  argument error, unknown or exempt registry, containment refusal,");
  console.log("       or a refusal to write (MATERIALIZE_LOAD_INCOMPLETE when a row");
  console.log("       failed to load, MATERIALIZE_WOULD_DROP when one would be lost)");
  console.log("");
  console.log("adev governance drift [--registry <name>] [--json]");
  console.log("");
  console.log("Hygiene Audit Pass 19. Read-only, advisory, always exit 0 on a scan.");
  console.log("Audits validate.yaml, review.yaml, diagnostics.yaml and gates.yaml:");
  console.log("");
  console.log("  hygiene/unadopted-upgrade           info  — starter declares an id the");
  console.log("                                              project's file does not");
  console.log("  hygiene/project-addition            info  — project declares an id the");
  console.log("                                              starter does not");
  console.log("  hygiene/disabled-bundled-entry      WARN  — enabled: false on an entry");
  console.log("                                              whose source is bundled or domain:*");
  console.log("  hygiene/non-project-execution-field info  — a non-project entry carrying");
  console.log("                                              command, runner, prompt or pattern");
  console.log("");
  console.log("  Field NAMES are printed, never field values. An unmaterialized marked");
  console.log("  registry is reported and not read.");
  console.log("");
  console.log("adev governance reviewers [--json]");
  console.log("");
  console.log("Print the reviewer set that ACTUALLY DISPATCHES — the project's own");
  console.log("materialized governance/review.yaml and nothing else. This is the verb");
  console.log("/adev:review-specs dispatches from; `adev domain load-reviewers` shows");
  console.log("what the DOMAIN would contribute and is a comparison view only.");
  console.log("");
  console.log("  --json              emit the machine-readable envelope");
  console.log("");
  console.log("  Fails closed with REGISTRY_NOT_MATERIALIZED when review.yaml exists");
  console.log("  without its top-level materialized_at marker. Exit 1 on any loader");
  console.log("  error; exit 0 otherwise, with warnings and notes in the envelope.");
  console.log("");
  console.log("adev governance migrate-gates [--dry-run] [--json]");
  console.log("");
  console.log("Rewrite legacy shell-string `command:` values in governance/gates.yaml");
  console.log("to argv lists. A shell-string command is dropped at load (SEC-2, silent");
  console.log("INVALID_GATE) — this repairs it in place. Reachable independent of");
  console.log("`adev upgrade`, which only runs this on its own invocation.");
  console.log("");
  console.log("  --dry-run           report what would change and write nothing");
  console.log("  --json              emit the machine-readable envelope");
  console.log("");
  console.log("  Exit 0 always (no file, nothing to migrate, or migrated). Commands");
  console.log("  containing shell metacharacters are reported, never rewritten.");
}
