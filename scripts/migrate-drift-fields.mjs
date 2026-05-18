#!/usr/bin/env node
/**
 * scripts/migrate-drift-fields.mjs — One-shot Migration Step 4
 *
 * Drains legacy `drift_source` / `drift_at` YAML frontmatter fields from
 * every `.spec.md` under `.context-index/specs/` into per-spec
 * `code_drift_detected` JSONL events. See:
 *
 *   .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
 *     § Migration Step 4 (Behaviors 6 & 7; SEC-1, SEC-3, SEC-4, SEC-5)
 *
 * Idempotency rules:
 *   (a) Frontmatter has drift_source/drift_at → append event + strip fields.
 *   (b) Frontmatter has NEITHER drift_source nor drift_at → no-op.
 *   (c) Both frontmatter AND a matching JSONL event with the same drift_at →
 *       strip fields without re-appending the event (partial-state recovery).
 *
 * Safety:
 *   - SEC-1: Path canonicalization. A drift_source that escapes projectRoot
 *     causes the spec to be skipped with a stderr warning.
 *   - SEC-5: --dry-run is side-effect-free.
 *   - SEC-4: Malformed YAML frontmatter → skip the spec with a warning.
 *
 * Exit codes:
 *   0 — all specs migrated or no-op
 *   1 — at least one spec skipped (traversal escape, malformed frontmatter,
 *       or argument error)
 *
 * Usage:
 *   node scripts/migrate-drift-fields.mjs [--dry-run] [--root <path>]
 *
 *     --dry-run            Print the migration plan without writing.
 *     --root <path>        Scope the scan to <path> (default:
 *                          ".context-index/specs"). Resolved relative to
 *                          process.cwd().
 *
 * Zero external dependencies (Node built-ins only).
 *
 * @module scripts/migrate-drift-fields
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, relative, join, dirname, sep } from "node:path";
import { parseArgs } from "node:util";
import { appendEvent, readEvents } from "../lib/lifecycle-state.mjs";

// ── Frontmatter parsing helpers ─────────────────────────────────────────────

/**
 * Extract the YAML frontmatter block from a markdown file.
 * @param {string} content - File contents.
 * @returns {{fm: string, body: string} | null}
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  return { fm: match[1], body: match[2] };
}

/**
 * Read a single scalar field from frontmatter via regex (line-based).
 * Returns null if the field is absent or the line is malformed.
 */
function readField(fm, name) {
  const re = new RegExp("^" + name + ":\\s*(.+)$", "m");
  const m = fm.match(re);
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * Strip drift_source / drift_at lines from a frontmatter block.
 * Leaves drift_detected alone (caller's choice).
 */
function stripLegacyFields(fm) {
  let out = fm;
  out = out.replace(/^drift_source:.*\n?/gm, "");
  out = out.replace(/^drift_at:.*\n?/gm, "");
  out = out.replace(/\n+$/, "");
  return out;
}

// ── Path safety (SEC-1) ─────────────────────────────────────────────────────

/**
 * Canonicalize a driftSource. Throws `PATH_TRAVERSAL_REJECTED` on escape.
 * Mirrors lib/spec-drift.mjs::canonicalizeDriftSource for migration parity.
 */
function canonicalizeDriftSource(projectRoot, driftSource) {
  const absRoot = resolve(projectRoot);
  const absolute = resolve(absRoot, driftSource);
  if (absolute !== absRoot && !absolute.startsWith(absRoot + sep)) {
    const err = new Error(
      `PATH_TRAVERSAL_REJECTED: ${driftSource} resolves outside projectRoot`,
    );
    err.code = "PATH_TRAVERSAL_REJECTED";
    throw err;
  }
  const canonical = relative(absRoot, absolute);
  if (canonical.startsWith("..") || canonical === "") {
    const err = new Error(
      `PATH_TRAVERSAL_REJECTED: ${driftSource} resolves outside projectRoot`,
    );
    err.code = "PATH_TRAVERSAL_REJECTED";
    throw err;
  }
  return canonical.split(sep).join("/");
}

// ── Spec discovery ──────────────────────────────────────────────────────────

/**
 * Recursively collect every `.spec.md` file under `dir`.
 */
function collectSpecs(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSpecs(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".spec.md")) {
      out.push(full);
    }
  }
  return out;
}

// ── Per-spec migration ──────────────────────────────────────────────────────

/**
 * Migrate one spec. Returns a result describing what happened.
 *
 * @param {string} projectRoot - Absolute project root.
 * @param {string} specAbs - Absolute path to the spec.
 * @param {{dryRun: boolean}} opts
 * @returns {{spec: string, status: 'migrated'|'noop'|'recovered'|'skipped', reason?: string}}
 */
function migrateSpec(projectRoot, specAbs, { dryRun }) {
  const specRel = relative(projectRoot, specAbs);
  let content;
  try {
    content = readFileSync(specAbs, "utf-8");
  } catch (err) {
    return { spec: specRel, status: "skipped", reason: `read failed: ${err.message}` };
  }
  const fmExt = extractFrontmatter(content);
  if (!fmExt) {
    return { spec: specRel, status: "noop", reason: "no frontmatter" };
  }
  const driftSourceRaw = readField(fmExt.fm, "drift_source");
  const driftAt = readField(fmExt.fm, "drift_at");

  // Case (b): already migrated.
  if (driftSourceRaw == null && driftAt == null) {
    return { spec: specRel, status: "noop" };
  }
  // Both must be present to migrate cleanly; one missing is malformed (SEC-4).
  if (driftSourceRaw == null || driftAt == null) {
    return {
      spec: specRel,
      status: "skipped",
      reason: `malformed legacy frontmatter (only one of drift_source/drift_at present)`,
    };
  }

  // SEC-1: canonicalize, reject traversal escape.
  let canonical;
  try {
    canonical = canonicalizeDriftSource(projectRoot, driftSourceRaw);
  } catch (err) {
    return {
      spec: specRel,
      status: "skipped",
      reason: err.message,
    };
  }

  // Case (c): partial state — JSONL already has a matching event.
  let existing = [];
  try {
    existing = readEvents(projectRoot, specRel);
  } catch {
    // readEvents throws on INVALID_SPEC_PATH etc; treat as no-existing-events.
  }
  const alreadyEmitted = existing.some(
    (ev) => ev.event === "code_drift_detected" && ev.drift_at === driftAt,
  );

  if (dryRun) {
    return {
      spec: specRel,
      status: alreadyEmitted ? "recovered" : "migrated",
      reason: "dry-run",
    };
  }

  // Emit the event (case a). Skip the append on partial state (case c).
  if (!alreadyEmitted) {
    try {
      appendEvent(projectRoot, specRel, {
        event: "code_drift_detected",
        drift_source: canonical,
        drift_at: driftAt,
      });
    } catch (err) {
      return {
        spec: specRel,
        status: "skipped",
        reason: `appendEvent failed: ${err.message}`,
      };
    }
  }

  // Strip the legacy fields from frontmatter.
  const newFm = stripLegacyFields(fmExt.fm);
  const newContent = content.replace(/^---\n[\s\S]*?\n---/, "---\n" + newFm + "\n---");
  try {
    writeFileSync(specAbs, newContent);
  } catch (err) {
    return {
      spec: specRel,
      status: "skipped",
      reason: `frontmatter write failed: ${err.message}`,
    };
  }

  return { spec: specRel, status: alreadyEmitted ? "recovered" : "migrated" };
}

// ── CLI entry ───────────────────────────────────────────────────────────────

function printUsage() {
  console.log(
    "Usage: node scripts/migrate-drift-fields.mjs [--dry-run] [--root <path>]",
  );
  console.log("");
  console.log("  --dry-run       Print plan without mutating files (SEC-5).");
  console.log("  --root <path>   Scope the scan (default: .context-index/specs).");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  all specs migrated or no-op");
  console.log("  1  at least one spec skipped (traversal escape or malformed FM)");
}

function main() {
  let parsed;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      options: {
        "dry-run": { type: "boolean", default: false },
        root: { type: "string" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error("error:", err.message);
    printUsage();
    process.exit(1);
  }

  const v = parsed.values;
  if (v.help) {
    printUsage();
    process.exit(0);
  }

  const projectRoot = process.cwd();
  if (!existsSync(join(projectRoot, ".context-index", "manifest.yaml"))) {
    console.error(
      "error: no .context-index/manifest.yaml in current working directory",
    );
    process.exit(1);
  }

  const scanRoot = resolve(projectRoot, v.root ?? ".context-index/specs");
  if (!existsSync(scanRoot)) {
    console.error(`error: scan root does not exist: ${scanRoot}`);
    process.exit(1);
  }

  const specs = collectSpecs(scanRoot);
  if (v["dry-run"]) {
    console.log(`[dry-run] Scanning ${specs.length} spec file(s) under ${relative(projectRoot, scanRoot) || "."}`);
  }

  let migrated = 0;
  let recovered = 0;
  let noop = 0;
  let skipped = 0;
  const skippedRows = [];

  for (const specAbs of specs) {
    const result = migrateSpec(projectRoot, specAbs, { dryRun: v["dry-run"] });
    switch (result.status) {
      case "migrated":
        migrated += 1;
        console.log(
          `${v["dry-run"] ? "[dry-run] would migrate" : "migrated"}: ${result.spec}`,
        );
        break;
      case "recovered":
        recovered += 1;
        console.log(
          `${v["dry-run"] ? "[dry-run] would recover" : "recovered"}: ${result.spec} (partial state — matching event already in JSONL)`,
        );
        break;
      case "noop":
        noop += 1;
        break;
      case "skipped":
        skipped += 1;
        skippedRows.push(`${result.spec}: ${result.reason}`);
        console.error(`SKIP: ${result.spec}: ${result.reason}`);
        break;
      default:
        skipped += 1;
        skippedRows.push(`${result.spec}: unknown status ${result.status}`);
    }
  }

  // Summary
  console.log("");
  console.log(`Summary${v["dry-run"] ? " (dry-run)" : ""}:`);
  console.log(`  migrated:  ${migrated}`);
  console.log(`  recovered: ${recovered}`);
  console.log(`  no-op:     ${noop}`);
  console.log(`  skipped:   ${skipped}`);
  if (skippedRows.length > 0) {
    console.log("");
    console.log("Skipped specs:");
    for (const row of skippedRows) console.log(`  - ${row}`);
  }

  process.exit(skipped > 0 ? 1 : 0);
}

main();
