// The managed block ignores regenerated hygiene output but keeps the
// append-only history that /adev:retro and /adev:recover read back:
// retros/ (velocity trend across periods), blockers/ (blockers in the
// analysis window), recoveries/ (recovery records kept for retrospective
// analysis). Checked with real `git check-ignore` so a pattern that looks
// right but does not un-ignore (e.g. a negation under an ignored parent
// directory) fails here.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { renderBlock } from "../../lib/gitignore-installer.mjs";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";

function ignored(root, relPath) {
  const r = spawnSync("git", ["check-ignore", "-q", "--no-index", relPath], { cwd: root });
  return r.status === 0;
}

test("managed block keeps hygiene history tracked and regenerated output ignored", () => {
  const root = createTempDir();
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    writeFileSync(join(root, ".gitignore"), `${renderBlock()}\n`);

    for (const kept of [
      ".context-index/hygiene/retros/2026-11-17.md",
      ".context-index/hygiene/recoveries/2026-11-17-task.md",
      ".context-index/hygiene/blockers/task-3.md",
    ]) {
      assert.equal(ignored(root, kept), false, `${kept} must not be ignored`);
    }

    for (const dropped of [
      ".context-index/hygiene/repo-map.md",
      ".context-index/hygiene/dependency-graph.json",
      ".context-index/hygiene/symbol-ranks.json",
      ".context-index/hygiene/drift-report.md",
      ".context-index/hygiene/coverage-report.md",
      ".context-index/hygiene/.active-plan",
      ".context-index/hygiene/sessions/s.jsonl",
    ]) {
      assert.equal(ignored(root, dropped), true, `${dropped} must stay ignored`);
    }
  } finally {
    cleanupTempDir(root);
  }
});
