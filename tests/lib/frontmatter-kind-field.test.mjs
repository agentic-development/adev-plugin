/**
 * Tests for the kind-aware frontmatter parser.
 *
 * Covers the 8 behaviors from
 * .context-index/specs/features/lifecycle-artifacts/frontmatter-discriminator.spec.md
 *
 * Behaviors 7-8 (skill-write rejection on missing/invalid kind) are owned by
 * the specify-kind-routing / brainstorm-kind-routing specs and tested there,
 * not here. This file covers behaviors 1-6 (parser-side behavior) and the
 * postcondition that parsed results always expose `kind`, `kindValid`, and
 * `kindResolved` as non-null fields.
 *
 * The parser is exposed via `parseSpecFrontmatter(filePath)` from
 * `lib/meta-tools.mjs`. The function reads the file, parses the YAML
 * frontmatter, infers the artifact layer from the path (`*.spec.md` → 'spec',
 * `charter.md` → 'charter'), and adds the three sentinel fields.
 */

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpecFrontmatter } from "../../lib/meta-tools.mjs";
import {
  createTempDir,
  cleanupTempDir,
  writeFixture,
} from "../helpers.mjs";

// Track temp dirs so `after` can clean them up even on test failure.
const tempDirs = [];

function makeTempDir() {
  const dir = createTempDir();
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs) {
    try {
      cleanupTempDir(dir);
    } catch {
      /* swallow */
    }
  }
});

// ── Behavior 1: spec with valid `kind:` exposes that value ──────────────────

describe("parseSpecFrontmatter — behavior 1: valid kind on spec", () => {
  it("exposes the verbatim kind for `kind: behavioral` on a .spec.md", () => {
    const dir = makeTempDir();
    writeFixture(
      dir,
      "demo.spec.md",
      "---\ncharter: x\nkind: behavioral\nstatus: draft\n---\n\n# x\n",
    );
    const result = parseSpecFrontmatter(join(dir, "demo.spec.md"));
    assert.equal(result.kind, "behavioral");
    assert.equal(result.kindValid, true);
    assert.equal(result.kindResolved, "explicit");
  });

  it("exposes the verbatim kind for `kind: refactor`", () => {
    const dir = makeTempDir();
    writeFixture(
      dir,
      "r.spec.md",
      "---\nkind: refactor\n---\n",
    );
    const result = parseSpecFrontmatter(join(dir, "r.spec.md"));
    assert.equal(result.kind, "refactor");
    assert.equal(result.kindValid, true);
    assert.equal(result.kindResolved, "explicit");
  });
});

// ── Behavior 2: spec without `kind:` defaults to 'behavioral' ───────────────

describe("parseSpecFrontmatter — behavior 2: missing kind on spec defaults", () => {
  it("defaults `kind` to 'behavioral' when absent from a .spec.md", () => {
    const dir = makeTempDir();
    writeFixture(
      dir,
      "no-kind.spec.md",
      "---\ncharter: x\nstatus: draft\n---\n\n# body\n",
    );
    const result = parseSpecFrontmatter(join(dir, "no-kind.spec.md"));
    assert.equal(result.kind, "behavioral");
    assert.equal(result.kindResolved, "default");
    assert.equal(result.kindValid, true);
  });

  it("does not modify the file on disk during the read", () => {
    const dir = makeTempDir();
    const original = "---\ncharter: x\nstatus: draft\n---\n\n# body\n";
    writeFixture(dir, "ro.spec.md", original);
    parseSpecFrontmatter(join(dir, "ro.spec.md"));
    // Re-read raw bytes and assert they are byte-identical.
    const afterContent = readFileSync(join(dir, "ro.spec.md"), "utf8");
    assert.equal(afterContent, original);
  });
});

// ── Behavior 3: charter with valid `kind:` exposes that value ───────────────

describe("parseSpecFrontmatter — behavior 3: valid kind on charter", () => {
  it("exposes `kind: feature` verbatim on charter.md", () => {
    const dir = makeTempDir();
    writeFixture(
      dir,
      "x/charter.md",
      "---\nkind: feature\n---\n\n# Charter\n",
    );
    const result = parseSpecFrontmatter(join(dir, "x/charter.md"));
    assert.equal(result.kind, "feature");
    assert.equal(result.kindValid, true);
    assert.equal(result.kindResolved, "explicit");
  });

  it("exposes `kind: cross-cutting` verbatim on charter.md", () => {
    const dir = makeTempDir();
    writeFixture(
      dir,
      "y/charter.md",
      "---\nkind: cross-cutting\n---\n",
    );
    const result = parseSpecFrontmatter(join(dir, "y/charter.md"));
    assert.equal(result.kind, "cross-cutting");
    assert.equal(result.kindValid, true);
    assert.equal(result.kindResolved, "explicit");
  });
});

// ── Behavior 4: charter without `kind:` defaults to 'feature' ───────────────

describe("parseSpecFrontmatter — behavior 4: missing kind on charter defaults", () => {
  it("defaults `kind` to 'feature' when absent from a charter.md", () => {
    const dir = makeTempDir();
    writeFixture(
      dir,
      "m/charter.md",
      "---\ntitle: Some Module\n---\n",
    );
    const result = parseSpecFrontmatter(join(dir, "m/charter.md"));
    assert.equal(result.kind, "feature");
    assert.equal(result.kindResolved, "default");
    assert.equal(result.kindValid, true);
  });
});

// ── Behavior 5: invalid `kind:` exposed verbatim, kindValid=false ───────────

describe("parseSpecFrontmatter — behavior 5: invalid kind exposes raw value", () => {
  it("preserves the raw kind and sets kindValid=false on a .spec.md", () => {
    const dir = makeTempDir();
    writeFixture(
      dir,
      "bad.spec.md",
      "---\nkind: invalid-value\n---\n",
    );
    const result = parseSpecFrontmatter(join(dir, "bad.spec.md"));
    assert.equal(result.kind, "invalid-value");
    assert.equal(result.kindValid, false);
    assert.equal(result.kindResolved, "explicit");
  });

  it("treats a cross-layer kind as invalid (charter with `kind: behavioral`)", () => {
    const dir = makeTempDir();
    writeFixture(
      dir,
      "z/charter.md",
      "---\nkind: behavioral\n---\n",
    );
    const result = parseSpecFrontmatter(join(dir, "z/charter.md"));
    assert.equal(result.kind, "behavioral");
    assert.equal(result.kindValid, false);
    assert.equal(result.kindResolved, "explicit");
  });
});

// ── Behavior 6: kindResolved discriminates explicit vs default ──────────────

describe("parseSpecFrontmatter — behavior 6: kindResolved sentinel", () => {
  it("is 'explicit' when kind: was present in the frontmatter", () => {
    const dir = makeTempDir();
    writeFixture(
      dir,
      "ex.spec.md",
      "---\nkind: action\n---\n",
    );
    const result = parseSpecFrontmatter(join(dir, "ex.spec.md"));
    assert.equal(result.kindResolved, "explicit");
  });

  it("is 'default' when kind: was applied by read-time defaulting (spec)", () => {
    const dir = makeTempDir();
    writeFixture(dir, "d.spec.md", "---\nstatus: draft\n---\n");
    const result = parseSpecFrontmatter(join(dir, "d.spec.md"));
    assert.equal(result.kindResolved, "default");
  });

  it("is 'default' when kind: was applied by read-time defaulting (charter)", () => {
    const dir = makeTempDir();
    writeFixture(dir, "f/charter.md", "---\ntitle: M\n---\n");
    const result = parseSpecFrontmatter(join(dir, "f/charter.md"));
    assert.equal(result.kindResolved, "default");
  });
});

// ── Postcondition: parsed result always carries the three sentinel fields ───

describe("parseSpecFrontmatter — postcondition: sentinels always present", () => {
  it("exposes kind/kindValid/kindResolved as non-null fields on every parse", () => {
    const dir = makeTempDir();
    writeFixture(dir, "p.spec.md", "---\n---\n");
    const result = parseSpecFrontmatter(join(dir, "p.spec.md"));
    assert.notEqual(result.kind, null);
    assert.notEqual(result.kindValid, null);
    assert.notEqual(result.kindResolved, null);
    assert.equal(typeof result.kind, "string");
    assert.equal(typeof result.kindValid, "boolean");
    assert.equal(typeof result.kindResolved, "string");
  });
});

// ── Error cases inherited from existing parser contract ─────────────────────

describe("parseSpecFrontmatter — error cases", () => {
  it("throws when the file does not exist", () => {
    assert.throws(() => parseSpecFrontmatter("/nonexistent/x.spec.md"));
  });
});

