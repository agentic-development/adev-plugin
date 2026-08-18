/**
 * Tests for lib/provider/ship-filter.mjs — the install-copy allowlist.
 *
 * Regression context (adev-plugin-1gts): provider adapters copied the plugin
 * root behind a three-item denylist, which for a git checkout copied 358 MB
 * across 25,191 files — .claude/, .beads/, tests/ and .context-index/ included —
 * against a ~5 MB shipped plugin. The allowlist is derived from package.json
 * `files` so it cannot drift from what npm actually publishes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  shippedTopLevel,
  installCopyFilter,
  shouldCopyTopLevel,
} from "../../../lib/provider/ship-filter.mjs";

/** Build a fake plugin root with a declared `files` array. */
function fakeRoot(files, extraDirs = []) {
  const root = mkdtempSync(join(tmpdir(), "shipfilter-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", files }));
  for (const d of [...files.map((f) => f.replace(/\/$/, "")), ...extraDirs]) {
    mkdirSync(join(root, d), { recursive: true });
    writeFileSync(join(root, d, "f.txt"), "x");
  }
  return root;
}

describe("shippedTopLevel", () => {
  it("derives the allowlist from package.json files, stripping trailing slashes", () => {
    const root = fakeRoot(["lib/", "cli/"]);
    try {
      const ship = shippedTopLevel(root);
      assert.ok(ship.has("lib"));
      assert.ok(ship.has("cli"));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("reduces a nested files entry to its top-level segment", () => {
    const root = fakeRoot(["providers/cursor/hooks.json"]);
    try {
      assert.ok(shippedTopLevel(root).has("providers"));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("includes the files npm ships regardless of the files array", () => {
    const root = fakeRoot(["lib/"]);
    try {
      const ship = shippedTopLevel(root);
      for (const implicit of ["package.json", "README.md", "LICENSE"]) {
        assert.ok(ship.has(implicit), `${implicit} must be shipped implicitly`);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("throws rather than returning an empty allowlist when files is absent", () => {
    // An empty allowlist would install nothing at all — that must not be silent.
    const root = mkdtempSync(join(tmpdir(), "shipfilter-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x" }));
    try {
      assert.throws(() => shippedTopLevel(root), /SHIP_MANIFEST_EMPTY/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("throws when package.json cannot be read", () => {
    const root = mkdtempSync(join(tmpdir(), "shipfilter-"));
    try {
      assert.throws(() => shippedTopLevel(root), /SHIP_MANIFEST_UNREADABLE/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("installCopyFilter", () => {
  it("copies only declared top-level entries and prunes everything else", () => {
    const root = fakeRoot(["lib/", "skills/"], ["tests", ".beads", ".claude", "viz"]);
    const dest = mkdtempSync(join(tmpdir(), "shipdest-"));
    try {
      cpSync(root, dest, { recursive: true, filter: installCopyFilter(root) });
      const got = readdirSync(dest).sort();
      assert.deepEqual(got, ["lib", "package.json", "skills"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("prunes node_modules nested inside a shipped directory", () => {
    const root = fakeRoot(["lib/"]);
    mkdirSync(join(root, "lib", "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(root, "lib", "node_modules", "pkg", "index.js"), "x");
    const dest = mkdtempSync(join(tmpdir(), "shipdest-"));
    try {
      cpSync(root, dest, { recursive: true, filter: installCopyFilter(root) });
      assert.equal(
        readdirSync(join(dest, "lib")).includes("node_modules"),
        false,
        "node_modules must be pruned even under a shipped directory"
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("keeps the real plugin payload far below the unfiltered tree", () => {
    // Guards the regression directly: the shipped set must stay small.
    const ROOT = process.cwd();
    const dest = mkdtempSync(join(tmpdir(), "shipreal-"));
    try {
      cpSync(ROOT, dest, { recursive: true, filter: installCopyFilter(ROOT) });
      let bytes = 0;
      (function walk(p) {
        for (const e of readdirSync(p, { withFileTypes: true })) {
          const q = join(p, e.name);
          if (e.isDirectory()) walk(q);
          else bytes += statSync(q).size;
        }
      })(dest);
      const mb = bytes / 1e6;
      assert.ok(mb < 50, `installed payload should be well under 50 MB, got ${mb.toFixed(1)} MB`);
      assert.equal(readdirSync(dest).includes("tests"), false, "tests/ must not be installed");
      assert.equal(readdirSync(dest).includes(".beads"), false, ".beads/ must not be installed");
    } finally { rmSync(dest, { recursive: true, force: true }); }
  });
});

describe("shouldCopyTopLevel", () => {
  it("accepts declared entries and rejects undeclared ones", () => {
    const root = fakeRoot(["lib/"], ["tests"]);
    try {
      const ok = shouldCopyTopLevel(root);
      assert.equal(ok("lib"), true);
      assert.equal(ok("package.json"), true);
      assert.equal(ok("tests"), false);
      assert.equal(ok("node_modules"), false);
      assert.equal(ok(".git"), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
