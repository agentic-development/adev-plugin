// Parity guard for the provider skill mirrors.
//
// Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
//
// The canonical skills/ directory is the single source of truth; the Codex
// and OpenCode mirrors under providers/<name>/skills/ are generated from it
// by scripts/sync-provider-skills.mjs (canonical content + a provider-specific
// description suffix). Nothing enforced that the committed mirrors stayed in
// sync, so they silently drifted — mirrors served stale skill instructions
// (missing the review-block-auto-retry `--from-summary` flag and `6b-bis`
// .blockers.md sidecar, among others) for weeks before anyone noticed.
//
// This test runs the real sync script in --dry-run mode (the source of truth
// for what "in sync" means — we do NOT re-implement the transform) and fails
// if it reports any pending update or creation. When it fails, run
// `node scripts/sync-provider-skills.mjs` and commit the result.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SYNC_SCRIPT = join(PLUGIN_ROOT, "scripts", "sync-provider-skills.mjs");

function runDryRun() {
  // The script always exits 0 (it is advisory in --dry-run); drift is reported
  // on stdout, not via exit code. Capture stdout for both the counts and the
  // actionable per-file change list.
  return execFileSync(process.execPath, [SYNC_SCRIPT, "--dry-run"], {
    cwd: PLUGIN_ROOT,
    encoding: "utf8",
  });
}

test("provider skill mirrors are in sync with canonical skills/ (no drift)", () => {
  const output = runDryRun();

  const match = output.match(/(\d+)\s+updated,\s+(\d+)\s+created,\s+(\d+)\s+up-to-date/);
  assert.ok(
    match,
    `could not parse sync summary from script output:\n${output}`,
  );

  const updated = Number(match[1]);
  const created = Number(match[2]);

  // Extract the "Changes:" listing (if any) so the failure message points at
  // the exact mirror files that drifted.
  const changesIdx = output.indexOf("Changes:");
  const changes = changesIdx >= 0 ? output.slice(changesIdx).trim() : "";

  assert.equal(
    updated + created,
    0,
    `Provider skill mirrors have drifted from canonical skills/ ` +
      `(${updated} updated, ${created} created). ` +
      `Run \`node scripts/sync-provider-skills.mjs\` and commit the result.\n${changes}`,
  );
});
