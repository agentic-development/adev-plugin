// lib/cli/governance.mjs
//
// adev governance materialize --registry <name> [--dry-run] [--json]
// adev governance drift [--registry <name>] [--json]
// adev governance reviewers [--json]
// adev governance diff-scope --spec <path> [--json]
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
// Exit codes (the `adev gate doctor` convention, minus the findings code —
// materialize either succeeds or refuses, it never reports findings):
//   0  success, including a no-op second run and every --dry-run; and every
//      successful `drift` scan regardless of finding count
//   1  argument error, an unknown or EXEMPT registry, a containment refusal,
//      or a refusal to write (MATERIALIZE_LOAD_INCOMPLETE, MATERIALIZE_WOULD_DROP,
//      MATERIALIZE_SOURCE_UNMAPPED, GOVERNANCE_PARSE_REFUSED,
//      GOVERNANCE_SCALAR_UNSAFE)
//
// Contract (driver-substrate): exports `run({ projectRoot, argv, manifest })`
// and `help()`. Does NOT export LIFECYCLE_STEP — materializing a registry, and
// auditing one, are maintenance, not lifecycle step entry or exit.

import { parseArgs } from "node:util";
import { resolve, isAbsolute, relative, sep } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const USAGE =
  "usage: adev governance materialize --registry <review|diagnostics|gates> [--dry-run] [--json]\n" +
  "       adev governance drift [--registry <validate|review|diagnostics|gates>] [--json]\n" +
  "       adev governance reviewers [--json]\n" +
  "       adev governance diff-scope --spec <path> [--json]";

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
  if (sub === "diff-scope") {
    return runDiffScope(projectRoot, argv.slice(1));
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
 * Strip a leading `# Title` line and `---`-delimited frontmatter block,
 * returning everything after the closing fence. Mirrors the same pattern
 * `lib/cli/specify.mjs`'s `group-blockers`/`check-mechanisms` verbs use.
 * Falls back to the input unchanged if fewer than two `---`-only lines
 * are found (no frontmatter to strip).
 *
 * @param {string} text
 * @returns {string}
 */
function stripFrontmatter(text) {
  const fenceMatches = [...text.matchAll(/^---\s*$/gm)];
  if (fenceMatches.length < 2) return text;
  return text.slice(fenceMatches[1].index + fenceMatches[1][0].length).replace(/^\n/, "");
}

/**
 * `adev governance diff-scope --spec <path>` — Task 10 / BEH-8.
 *
 * Computes whether `/adev:review-specs` Step 4 should diff-scope reviewer
 * dispatch for this spec, and if so, the scoped content to pass as
 * `shouldDispatch`'s `specContent` argument and to restrict each dispatched
 * reviewer's rendered context pack to.
 *
 * "First review of any spec always uses full-context dispatch" (BEH-8): this
 * verb reads the lifecycle log itself (`currentState`) to decide — the
 * skill never has to reason about revision history inline. Diff-scoping
 * requires BOTH a completed review at an earlier revision AND a readable
 * prior committed spec text (best-effort `git show HEAD:<path>`); either
 * condition failing means "cannot safely scope" and the verb reports
 * `scoped: false`, never a partial/guessed scope. Diff-scoping is a cost
 * optimization only — full-context dispatch is always correct, just more
 * expensive, so every failure mode here fails OPEN to full context rather
 * than failing closed.
 */
async function runDiffScope(projectRoot, args) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: { spec: { type: "string" }, json: { type: "boolean", default: false } },
      allowPositionals: false,
    });
  } catch (err) {
    console.error("usage: adev governance diff-scope --spec <path> [--json]");
    process.exit(1);
  }

  const { spec, json } = parsed.values;
  if (!spec) {
    console.error("usage: adev governance diff-scope --spec <path> [--json]");
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);
  const absSpec = isAbsolute(spec) ? spec : resolve(absRoot, spec);
  if (!absSpec.startsWith(absRoot + sep) && absSpec !== absRoot) {
    console.error(`INVALID_SPEC_PATH: spec not inside projectRoot: ${spec}`);
    process.exit(1);
  }
  if (!existsSync(absSpec)) {
    console.error(`INVALID_SPEC_PATH: spec not found: ${spec}`);
    process.exit(1);
  }
  if (!absSpec.endsWith(".spec.md")) {
    console.error(`INVALID_SPEC_PATH: spec path must end with .spec.md: ${spec}`);
    process.exit(1);
  }
  const relSpec = relative(absRoot, absSpec);

  const currFullText = readFileSync(absSpec, "utf8");
  const revMatch = /^revision:\s*(\d+)\s*$/m.exec(currFullText);
  const currentRevision = revMatch ? Number(revMatch[1]) : 1;
  // Frontmatter-stripped body only: splitIntoSections' heading-range logic
  // treats a heading's range as extending to the next SAME-OR-HIGHER-level
  // heading, so the doc's own H1 title (level 1, nothing else in a spec is
  // level 1) would otherwise swallow the entire rest of the document as
  // "its" section — including every H2 the frontmatter's revision bump has
  // nothing to do with.
  const currText = stripFrontmatter(currFullText);

  const emit = (envelope) => {
    if (json) {
      console.log(JSON.stringify(envelope));
    } else {
      console.log(`scoped: ${envelope.scoped}`);
      console.log(`reason: ${envelope.reason}`);
      if (envelope.scoped) {
        console.log(`changed_anchors: ${envelope.changed_anchors.join(", ")}`);
      }
    }
    process.exit(0);
  };

  const { currentState } = await import("../lifecycle-state.mjs");
  const state = currentState(absRoot, relSpec);
  const byRevision = state?.steps?.review?.byRevision ?? {};
  const hasEarlierCompletedReview = Object.values(byRevision).some(
    (b) => b && typeof b.revision === "number" && b.revision < currentRevision && b.completed_at !== null,
  );
  if (!hasEarlierCompletedReview) {
    emit({ scoped: false, reason: "first-review", changed_anchors: [], content: "" });
    return;
  }

  // Best-effort prior text via git. Any failure (not a repo, file untracked,
  // no HEAD, spawn error) fails open to full-context dispatch.
  const gitResult = spawnSync("git", ["show", `HEAD:${relSpec}`], {
    cwd: absRoot, encoding: "utf8",
  });
  if (gitResult.status !== 0 || typeof gitResult.stdout !== "string") {
    emit({ scoped: false, reason: "git-unavailable", changed_anchors: [], content: "" });
    return;
  }
  const prevText = stripFrontmatter(gitResult.stdout);

  const { extractChangedSections, expandWithCrossReferences } = await import("../governance/diff-scope.mjs");
  const changed = extractChangedSections(prevText, currText);
  if (changed.size === 0) {
    emit({ scoped: true, reason: "no-content-changed", changed_anchors: [], content: "" });
    return;
  }
  const expandedAnchors = expandWithCrossReferences(currText, new Set(changed.keys()));

  // `changed` only carries the ORIGINAL changed set's text. Cross-reference
  // -added anchors need their current text pulled too — reuse
  // extractChangedSections against an empty prior text, which trivially
  // reports every anchor in currText as "changed" and gives us its text.
  const allSections = extractChangedSections("", currText);
  const contentParts = [];
  for (const anchor of expandedAnchors) {
    const text = changed.get(anchor) ?? allSections.get(anchor);
    if (text) contentParts.push(text);
  }

  emit({
    scoped: true,
    reason: "diff-scoped",
    changed_anchors: [...expandedAnchors],
    content: contentParts.join("\n\n"),
  });
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
  console.log("adev governance diff-scope --spec <path> [--json]");
  console.log("");
  console.log("Decide whether /adev:review-specs Step 4 should diff-scope reviewer");
  console.log("dispatch for this spec (BEH-8), and if so, the scoped content to pass as");
  console.log("shouldDispatch's specContent and to restrict each reviewer's context pack");
  console.log("to. Reads the lifecycle log itself -- the skill never has to reason about");
  console.log("revision history inline.");
  console.log("");
  console.log("  --spec <path>       Project-root-relative path to the .spec.md file");
  console.log("  --json              emit the machine-readable envelope");
  console.log("");
  console.log("  scoped:false, reason:first-review    — no completed review at an earlier");
  console.log("                                          revision; always full-context.");
  console.log("  scoped:false, reason:git-unavailable — could not read the prior committed");
  console.log("                                          text; fails OPEN to full context.");
  console.log("  scoped:true,  reason:no-content-changed / diff-scoped");
  console.log("");
  console.log("  Exit codes:");
  console.log("    0  always, on a successful scan (scoped or not — never a gate)");
  console.log("    1  argument error or path traversal");
}
