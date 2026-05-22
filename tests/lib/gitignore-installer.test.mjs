// tests/lib/gitignore-installer.test.mjs
//
// Smoke test for the gitignore-installer (Task 2 RED phase). The full test
// suite (idempotency, drift, preservation, repair, dedupe, --remove,
// SEC-1/2/6 hardenings) is added in Task 3.
//
// Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ensureManagedBlock } from "../../lib/gitignore-installer.mjs";

test("ensureManagedBlock creates .gitignore from scratch with block + trailing newline", () => {
  const root = mkdtempSync(join(tmpdir(), "mgb-smoke-"));
  mkdirSync(join(root, ".context-index"), { recursive: true });
  try {
    const result = ensureManagedBlock(root);
    assert.equal(result, "added");
    const content = readFileSync(join(root, ".gitignore"), "utf8");
    assert.ok(
      content.startsWith("# >>> adev:gitignore >>>\n"),
      "block must start the file with open marker on line 1",
    );
    assert.ok(
      content.trimEnd().endsWith("# <<< adev:gitignore <<<"),
      "block must end with close marker",
    );
    assert.ok(content.endsWith("\n"), "file must end with single trailing newline");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
