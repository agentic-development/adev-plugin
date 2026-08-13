// tests/cli/artifact-frontmatter-first.test.mjs
//
// Guard for issue-586: `adev artifact commit` must refuse a report whose
// frontmatter is not the first non-blank content.
//
// Why the check lives in the verb rather than in skill prose: prose demonstrably
// did not hold the line. Measured 2026-08-13 — 122 of 123 `.validate.md` and 153
// of 202 `.review.md` files in this repo violate the rule, and `/adev:validate`
// ALREADY routes through this verb. The rename simply never inspected content.
// Per constitution.md:68, a check that gates the next step belongs in the CLI.
//
// The rule mirrors lib/diagnostics/tier1/frontmatter-present.mjs exactly (leading
// blank lines tolerated; any markdown body before `---` rejected) so the writer
// and the diagnostic cannot drift apart.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hasLeadingFrontmatter } from "../../lib/cli/artifact.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");
const SPEC_REL = ".context-index/specs/features/m/s.spec.md";

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "adev-artifact-fm-"));
  mkdirSync(join(dir, ".context-index/specs/features/m"), { recursive: true });
  writeFileSync(join(dir, ".context-index/manifest.yaml"), "project:\n  name: t\n");
  writeFileSync(join(dir, SPEC_REL), "---\ncharter: m\n---\n\n# s\n");
  return dir;
}

function commit(dir, kind = "validate") {
  return spawnSync("node", [CLI, "artifact", "commit", "--spec", SPEC_REL, "--kind", kind], {
    encoding: "utf8",
    cwd: dir,
  });
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe("adev artifact commit — frontmatter must be first", () => {
  it("rejects a report that opens with a heading", () => {
    const dir = makeProject();
    try {
      const tmp = join(dir, ".context-index/specs/features/m/s.validate.md.tmp");
      writeFileSync(tmp, "# Validation Report\n\n---\nverdict: PASS\n---\n\nbody\n");

      const r = commit(dir);

      assert.notStrictEqual(r.status, 0, "must refuse a heading-first artifact");
      assert.match(r.stderr, /ARTIFACT_FRONTMATTER_NOT_FIRST/);
      assert.ok(existsSync(tmp), "the .tmp must survive so the author can fix and re-run");
      assert.ok(
        !existsSync(join(dir, ".context-index/specs/features/m/s.validate.md")),
        "must not publish a malformed artifact",
      );
    } finally {
      cleanup(dir);
    }
  });

  it("rejects a report that opens with an HTML comment", () => {
    // This is the .partial marker shape (issue-517) — the other way artifacts
    // acquire a body above the delimiter.
    const dir = makeProject();
    try {
      writeFileSync(
        join(dir, ".context-index/specs/features/m/s.validate.md.tmp"),
        "<!-- partial_schema: validate@1 -->\n\n---\nverdict: PASS\n---\n\nbody\n",
      );
      const r = commit(dir);
      assert.notStrictEqual(r.status, 0);
      assert.match(r.stderr, /ARTIFACT_FRONTMATTER_NOT_FIRST/);
    } finally {
      cleanup(dir);
    }
  });

  it("accepts a report that opens with frontmatter, and publishes it", () => {
    const dir = makeProject();
    try {
      writeFileSync(
        join(dir, ".context-index/specs/features/m/s.validate.md.tmp"),
        "---\nverdict: PASS\n---\n\n# Validation Report\n\nbody\n",
      );

      const r = commit(dir);

      assert.strictEqual(r.status, 0, `${r.stderr}${r.stdout}`);
      assert.ok(existsSync(join(dir, ".context-index/specs/features/m/s.validate.md")));
    } finally {
      cleanup(dir);
    }
  });

  it("tolerates leading blank lines, matching the diagnostic", () => {
    const dir = makeProject();
    try {
      writeFileSync(
        join(dir, ".context-index/specs/features/m/s.validate.md.tmp"),
        "\n\n---\nverdict: PASS\n---\n\nbody\n",
      );
      const r = commit(dir);
      assert.strictEqual(r.status, 0, `${r.stderr}${r.stdout}`);
    } finally {
      cleanup(dir);
    }
  });

  it("applies to review artifacts too, not just validate", () => {
    const dir = makeProject();
    try {
      writeFileSync(
        join(dir, ".context-index/specs/features/m/s.review.md.tmp"),
        "# Architecture Review\n\n---\nverdict: PASS\n---\n",
      );
      const r = commit(dir, "review");
      assert.notStrictEqual(r.status, 0);
      assert.match(r.stderr, /ARTIFACT_FRONTMATTER_NOT_FIRST/);
    } finally {
      cleanup(dir);
    }
  });

  it("the zero-byte guard still fires before the frontmatter check", () => {
    const dir = makeProject();
    try {
      writeFileSync(join(dir, ".context-index/specs/features/m/s.validate.md.tmp"), "");
      const r = commit(dir);
      assert.notStrictEqual(r.status, 0);
      assert.match(r.stderr, /empty/i, "empty-file diagnostic must not be masked by the new check");
    } finally {
      cleanup(dir);
    }
  });

  it("hasLeadingFrontmatter mirrors the diagnostic's rule", () => {
    const dir = makeProject();
    try {
      const p = join(dir, "probe.md");
      writeFileSync(p, "---\na: 1\n---\n");
      assert.equal(hasLeadingFrontmatter(p), true);
      writeFileSync(p, "\n\n---\na: 1\n---\n");
      assert.equal(hasLeadingFrontmatter(p), true, "leading blanks are tolerated");
      writeFileSync(p, "# h\n---\na: 1\n---\n");
      assert.equal(hasLeadingFrontmatter(p), false);
      writeFileSync(p, "");
      assert.equal(hasLeadingFrontmatter(p), false, "empty file has no frontmatter");
      assert.equal(hasLeadingFrontmatter(join(dir, "nope.md")), false, "missing file is false");
    } finally {
      cleanup(dir);
    }
  });
});
