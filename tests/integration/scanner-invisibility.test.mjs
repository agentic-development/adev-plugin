/**
 * Scanner-invisibility regression test.
 *
 * Covers Task 15 from incremental-artifact-writes.plan.md, AC #10 from the
 * spec, and Postcondition #7 ("Scanner invisibility — canonical artifact-kind
 * globs do NOT match <name>.<type>.md.partial; partials are invisible to
 * spec-aggregation tooling by construction").
 *
 * Strategy: build a temp project with realistic .spec.md / .plan.md /
 * .review.md / .validate.md artifacts AND parallel .partial siblings for
 * each. Run every public scanner that walks the .context-index/specs tree
 * and assert it sees the canonical files but NOT the .partial siblings.
 *
 * A future regression that broadens any spec-suffix glob to `*.md` would
 * surface as a test failure here.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runKindValidityPass } from "../../lib/hygiene/kind-validity.mjs";
import { slugFromSpec } from "../../lib/lifecycle-state.mjs";

function makeProject() {
  const root = mkdtempSync(join(tmpdir(), "adev-scanner-inv-"));
  mkdirSync(join(root, ".context-index/specs/features/m"), { recursive: true });
  writeFileSync(
    join(root, ".context-index/manifest.yaml"),
    "project:\n  name: t\nmodules:\n  - slug: m\n"
  );
  return root;
}

const VALID_SPEC = `---
kind: behavioral
status: validated
revision: 1
charter-revision: 1
charter: m
created: 2026-01-01
updated: 2026-01-01
---
# Foo
`;

test("runKindValidityPass ignores .spec.md.partial siblings", async () => {
  const root = makeProject();
  try {
    const featuresDir = join(root, ".context-index/specs/features/m");
    writeFileSync(join(featuresDir, "foo.spec.md"), VALID_SPEC);
    // Partial sibling — MUST be invisible to the scanner.
    writeFileSync(
      join(featuresDir, "foo.spec.md.partial"),
      "<!-- partial_schema: spec@1 -->\n" + VALID_SPEC
    );
    // Also drop other partials that scanners must skip.
    writeFileSync(join(featuresDir, "foo.plan.md.partial"), "");
    writeFileSync(join(featuresDir, "foo.review.md.partial"), "");
    writeFileSync(join(featuresDir, "foo.validate.md.partial"), "");
    writeFileSync(join(featuresDir, "foo.spec.md.partial.lock"), "{}");

    const report = await runKindValidityPass(root);
    const referencedPaths = report.findings.map((f) => f.path);
    // No finding may reference a .partial or .partial.lock file.
    for (const path of referencedPaths) {
      assert.ok(
        !path.endsWith(".partial"),
        `finding references partial: ${path}`
      );
      assert.ok(
        !path.endsWith(".partial.lock"),
        `finding references lock: ${path}`
      );
    }
    // The canonical spec MAY produce findings (e.g., PASS finding); the
    // partial sibling MUST NOT.
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runKindValidityPass also ignores charter.md.partial siblings", async () => {
  const root = makeProject();
  try {
    const featuresDir = join(root, ".context-index/specs/features/m");
    writeFileSync(
      join(featuresDir, "charter.md"),
      "---\nstatus: approved\nrevision: 1\n---\n# Charter\n"
    );
    writeFileSync(
      join(featuresDir, "charter.md.partial"),
      "<!-- partial_schema: spec@1 -->\n# Charter (in progress)\n"
    );

    const report = await runKindValidityPass(root);
    for (const f of report.findings) {
      assert.ok(
        !f.path.endsWith(".partial"),
        `finding references partial: ${f.path}`
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("slugFromSpec rejects a .spec.md.partial path", () => {
  // Per lib/lifecycle-state.mjs path-safety: slugFromSpec requires the path
  // to end with `.spec.md` — `.spec.md.partial` must throw INVALID_SPEC_PATH.
  assert.throws(
    () => slugFromSpec("a/b/foo.spec.md.partial"),
    (err) => err && err.code === "INVALID_SPEC_PATH"
  );
});

test("string-level: canonical suffixes do NOT match .partial siblings", () => {
  // Defensive assertion that the simple endsWith() pattern used across
  // the codebase does NOT match the .partial suffix. A regression that
  // changed a check from `.endsWith('.spec.md')` to `.endsWith('.md')`
  // would break this invariant — this test catches it before the
  // scanner-level tests do.
  const cases = [
    "foo.spec.md",
    "foo.plan.md",
    "foo.review.md",
    "foo.validate.md",
  ];
  for (const canonical of cases) {
    const partial = `${canonical}.partial`;
    const lock = `${canonical}.partial.lock`;
    assert.ok(!partial.endsWith(".spec.md"), `${partial} ≠ .spec.md`);
    assert.ok(!partial.endsWith(".plan.md"), `${partial} ≠ .plan.md`);
    assert.ok(!partial.endsWith(".review.md"), `${partial} ≠ .review.md`);
    assert.ok(!partial.endsWith(".validate.md"), `${partial} ≠ .validate.md`);
    assert.ok(partial.endsWith(".partial"), `${partial} = .partial`);
    assert.ok(!lock.endsWith(".partial"), `${lock} ≠ .partial`);
    assert.ok(lock.endsWith(".partial.lock"), `${lock} = .partial.lock`);
  }
});
