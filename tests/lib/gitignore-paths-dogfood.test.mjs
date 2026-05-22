// tests/lib/gitignore-paths-dogfood.test.mjs
//
// Parity check: this repo's `.gitignore` carries the canonical adev:gitignore
// managed block byte-for-byte. Pins the dogfood install (Task 8) to the
// canonical render of `MANAGED_GITIGNORE_PATHS`.
//
// Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { renderBlock } from "../../lib/gitignore-installer.mjs";

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

test("repo .gitignore carries canonical adev:gitignore block byte-for-byte", () => {
  const content = readFileSync(join(REPO_ROOT, ".gitignore"), "utf8");
  const open = "# >>> adev:gitignore >>>";
  const close = "# <<< adev:gitignore <<<";
  const openIdx = content.indexOf(open);
  const closeIdx = content.indexOf(close);
  assert.ok(openIdx >= 0, "missing adev:gitignore open marker in repo .gitignore");
  assert.ok(closeIdx > openIdx, "missing or misordered adev:gitignore close marker");
  const blockInRepo = content.slice(openIdx, closeIdx + close.length);
  assert.equal(
    blockInRepo,
    renderBlock(),
    "repo .gitignore block drifted from MANAGED_GITIGNORE_PATHS",
  );
});

test("repo .gitignore: adev:gitignore does NOT include the session-capture sentinel (SA-1 carve-out)", () => {
  // SA-1 carve-out: the adev:gitignore block must NEVER contain the
  // session-capture sentinel paths (`.context-index/sessions/`). The
  // session-capture block is separately owned by
  // `lib/session-capture-installer.mjs`.
  const content = readFileSync(join(REPO_ROOT, ".gitignore"), "utf8");
  const open = "# >>> adev:gitignore >>>";
  const close = "# <<< adev:gitignore <<<";
  const openIdx = content.indexOf(open);
  const closeIdx = content.indexOf(close);
  if (openIdx < 0 || closeIdx <= openIdx) return; // first test already failed
  const block = content.slice(openIdx, closeIdx + close.length);
  assert.ok(
    !block.includes(".context-index/sessions/"),
    "adev:gitignore must NOT enumerate .context-index/sessions/ (separately owned)",
  );
});
