import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import {
  mergePacks,
  resolveExtends,
  renderPack,
  expandGlob,
} from "../../lib/governance/context-pack.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const tempDirs = [];
function tmp() {
  const d = createTempDir();
  tempDirs.push(d);
  return d;
}
afterEach(() => {
  while (tempDirs.length) cleanupTempDir(tempDirs.pop());
});

function hasCode(issues, code) {
  return issues.some((i) => i.code === code);
}

describe("context-pack mergePacks", () => {
  test("project pack overrides bundled with WARN", () => {
    const r = mergePacks(
      { base: { include: ["a.md"] } },
      { base: { include: ["b.md"] } }
    );
    assert.equal(r.packs.base.include[0], "b.md");
    assert.ok(hasCode(r.warnings, "CONTEXT_PACK_OVERRIDE"));
  });
});

describe("context-pack resolveExtends", () => {
  test("concatenates extends chain root → child", () => {
    const packs = {
      base: { include: ["base.md"] },
      child: { extends: "base", include: ["child.md"] },
    };
    const r = resolveExtends("child", packs);
    assert.deepEqual(r.includes, ["base.md", "child.md"]);
  });

  test("detects cycles", () => {
    const packs = {
      a: { extends: "b", include: [] },
      b: { extends: "a", include: [] },
    };
    const r = resolveExtends("a", packs);
    assert.ok(hasCode(r.errors, "CONTEXT_PACK_CYCLE"));
  });
});

describe("context-pack renderPack", () => {
  test("renders matched files with per-file header", () => {
    const repo = tmp();
    writeFixture(repo, "docs/one.md", "hello one");
    writeFixture(repo, "docs/two.md", "hello two");
    const packs = { base: { include: ["docs/*.md"] } };
    const r = renderPack("base", packs, { repoRoot: repo });
    assert.equal(r.errors.length, 0);
    assert.ok(r.rendered.includes("=== docs/one.md ==="));
    assert.ok(r.rendered.includes("=== docs/two.md ==="));
  });

  test("empty glob emits <no matches>", () => {
    const repo = tmp();
    writeFixture(repo, ".keep", "");
    const packs = { base: { include: ["docs/*.md"] } };
    const r = renderPack("base", packs, { repoRoot: repo });
    assert.equal(r.errors.length, 0);
    assert.ok(r.rendered.includes("<no matches>"));
  });

  test("denylist rejects .env glob", () => {
    const repo = tmp();
    const packs = { base: { include: [".env*"] } };
    const r = renderPack("base", packs, { repoRoot: repo });
    assert.ok(hasCode(r.errors, "CONTEXT_PACK_DENYLIST"));
  });

  test("denylist rejects secrets glob", () => {
    const repo = tmp();
    const packs = { base: { include: ["**/secrets/**"] } };
    const r = renderPack("base", packs, { repoRoot: repo });
    assert.ok(hasCode(r.errors, "CONTEXT_PACK_DENYLIST"));
  });

  test("denylist rejects *.pem glob", () => {
    const repo = tmp();
    const packs = { base: { include: ["*.pem"] } };
    const r = renderPack("base", packs, { repoRoot: repo });
    assert.ok(hasCode(r.errors, "CONTEXT_PACK_DENYLIST"));
  });

  test("traversal `..` segment rejected", () => {
    const repo = tmp();
    const packs = { base: { include: ["../outside.md"] } };
    const r = renderPack("base", packs, { repoRoot: repo });
    assert.ok(hasCode(r.errors, "CONTEXT_PACK_TRAVERSAL"));
  });

  test("unknown pack produces error", () => {
    const repo = tmp();
    const r = renderPack("missing", {}, { repoRoot: repo });
    assert.ok(hasCode(r.errors, "UNKNOWN_CONTEXT_PACK"));
  });
});

describe("context-pack expandGlob", () => {
  test("matches * and **", () => {
    const repo = tmp();
    writeFixture(repo, "src/a.js", "a");
    writeFixture(repo, "src/nested/b.js", "b");
    writeFixture(repo, "src/c.txt", "c");
    const oneLevel = expandGlob("src/*.js", repo);
    assert.equal(oneLevel.length, 1);
    const deep = expandGlob("src/**/*.js", repo);
    assert.equal(deep.length, 2);
  });
});
