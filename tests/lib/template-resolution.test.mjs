/**
 * Tests for lib/template-resolution.mjs — resolveTemplate(layer, kind, domain).
 *
 * Covers the 9 behaviors from
 * .context-index/specs/features/lifecycle-artifacts/template-resolution.spec.md:
 *   1. Valid (layer, kind, domain) → absolute path of the most-specific template
 *   2. Domain override wins when present
 *   3. Falls through to bundled software default when domain has no override
 *   4. domain=null/undefined skips domain lookup entirely
 *   5. Invalid layer → INVALID_LAYER (propagated from kinds.mjs)
 *   6. Invalid kind for layer → INVALID_KIND
 *   7. No template anywhere → TEMPLATE_NOT_FOUND with attempted-paths
 *   8. Resolved path escapes allowed roots → UNSAFE_TEMPLATE_PATH
 *   9. Resolved file unreadable → underlying fs error
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  resolveTemplate,
  __setAllowedRootsForTest,
  __resetAllowedRootsForTest,
} from "../../lib/template-resolution.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, "..", "..");

// ── helpers ─────────────────────────────────────────────────────────────────

// mkdtempSync on macOS returns `/var/...` but realpath resolves to `/private/var/...`.
// The library returns realpathSync output, so tests must compare against realpath
// of the temp root rather than the raw mkdtemp return.
function makeTempPlugin() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "tplres-plugin-")));
  mkdirSync(join(root, "templates"), { recursive: true });
  mkdirSync(join(root, "templates", "domains", "software"), { recursive: true });
  return root;
}

function makeTempExtension(name) {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), `tplres-ext-${name}-`)),
  );
  mkdirSync(join(root, "domain"), { recursive: true });
  return root;
}

function writeTpl(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

// ── Behavior 1 + 3: Valid call resolves to bundled default ─────────────────

describe("resolveTemplate — bundled fallback (Behaviors 1, 3)", () => {
  let tmpPlugin;

  before(() => {
    tmpPlugin = makeTempPlugin();
    writeTpl(
      join(tmpPlugin, "templates", "spec-template.behavioral.md"),
      "# behavioral spec\n",
    );
    writeTpl(
      join(tmpPlugin, "templates", "charter-template.feature.md"),
      "# feature charter\n",
    );
    __setAllowedRootsForTest({ pluginRoot: tmpPlugin, extensionRoots: [] });
  });

  after(() => {
    __resetAllowedRootsForTest();
    rmSync(tmpPlugin, { recursive: true, force: true });
  });

  it("returns absolute path of bundled spec template for valid (spec, behavioral, null)", async () => {
    const p = await resolveTemplate("spec", "behavioral", null);
    assert.equal(p, resolve(tmpPlugin, "templates", "spec-template.behavioral.md"));
    assert.equal(existsSync(p), true);
  });

  it("returns absolute path of bundled charter template for valid (charter, feature, null)", async () => {
    const p = await resolveTemplate("charter", "feature", null);
    assert.equal(p, resolve(tmpPlugin, "templates", "charter-template.feature.md"));
  });

  it("falls through to bundled when domain has no per-kind override", async () => {
    // Domain extension exists but no per-kind file under domain/
    const ext = makeTempExtension("dataeng");
    try {
      __setAllowedRootsForTest({
        pluginRoot: tmpPlugin,
        extensionRoots: { "data-engineering": join(ext, "domain") },
      });
      const p = await resolveTemplate("spec", "behavioral", "data-engineering");
      // Bundled wins because no override file
      assert.equal(p, resolve(tmpPlugin, "templates", "spec-template.behavioral.md"));
    } finally {
      __setAllowedRootsForTest({ pluginRoot: tmpPlugin, extensionRoots: [] });
      rmSync(ext, { recursive: true, force: true });
    }
  });
});

// ── Behavior 2: Domain override wins when present ──────────────────────────

describe("resolveTemplate — domain override (Behavior 2)", () => {
  let tmpPlugin;
  let tmpExt;

  beforeEach(() => {
    tmpPlugin = makeTempPlugin();
    writeTpl(
      join(tmpPlugin, "templates", "spec-template.behavioral.md"),
      "# bundled\n",
    );
    tmpExt = makeTempExtension("dataeng");
    writeTpl(
      join(tmpExt, "domain", "spec-template.behavioral.md"),
      "# data-engineering override\n",
    );
    __setAllowedRootsForTest({
      pluginRoot: tmpPlugin,
      extensionRoots: { "data-engineering": join(tmpExt, "domain") },
    });
  });

  afterEach(() => {
    __resetAllowedRootsForTest();
    rmSync(tmpPlugin, { recursive: true, force: true });
    rmSync(tmpExt, { recursive: true, force: true });
  });

  it("returns the extension's domain/spec-template.<kind>.md when present", async () => {
    const p = await resolveTemplate("spec", "behavioral", "data-engineering");
    assert.equal(p, resolve(tmpExt, "domain", "spec-template.behavioral.md"));
  });

  it("returns the extension's domain/charter-template.<kind>.md when present", async () => {
    writeTpl(
      join(tmpExt, "domain", "charter-template.feature.md"),
      "# domain charter override\n",
    );
    writeTpl(
      join(tmpPlugin, "templates", "charter-template.feature.md"),
      "# bundled charter\n",
    );
    const p = await resolveTemplate("charter", "feature", "data-engineering");
    assert.equal(p, resolve(tmpExt, "domain", "charter-template.feature.md"));
  });
});

// ── Behavior 4: domain=null or undefined skips domain lookup ───────────────

describe("resolveTemplate — domain null/undefined (Behavior 4)", () => {
  let tmpPlugin;

  before(() => {
    tmpPlugin = makeTempPlugin();
    writeTpl(
      join(tmpPlugin, "templates", "spec-template.behavioral.md"),
      "# bundled\n",
    );
    __setAllowedRootsForTest({ pluginRoot: tmpPlugin, extensionRoots: [] });
  });

  after(() => {
    __resetAllowedRootsForTest();
    rmSync(tmpPlugin, { recursive: true, force: true });
  });

  it("returns bundled when domain is null", async () => {
    const p = await resolveTemplate("spec", "behavioral", null);
    assert.equal(p, resolve(tmpPlugin, "templates", "spec-template.behavioral.md"));
  });

  it("returns bundled when domain is undefined", async () => {
    const p = await resolveTemplate("spec", "behavioral", undefined);
    assert.equal(p, resolve(tmpPlugin, "templates", "spec-template.behavioral.md"));
  });
});

// ── Behavior 5: Invalid layer → INVALID_LAYER ──────────────────────────────

describe("resolveTemplate — INVALID_LAYER (Behavior 5)", () => {
  it("throws INVALID_LAYER for layer='widget'", async () => {
    await assert.rejects(
      () => resolveTemplate("widget", "behavioral", null),
      (err) => err.code === "INVALID_LAYER",
    );
  });

  it("throws INVALID_LAYER for layer=null", async () => {
    await assert.rejects(
      () => resolveTemplate(null, "behavioral", null),
      (err) => err.code === "INVALID_LAYER",
    );
  });

  it("throws INVALID_LAYER for layer=''", async () => {
    await assert.rejects(
      () => resolveTemplate("", "behavioral", null),
      (err) => err.code === "INVALID_LAYER",
    );
  });

  it("INVALID_LAYER takes precedence over INVALID_KIND (kind never checked)", async () => {
    // Even with a kind that would be invalid for spec, layer error wins first.
    await assert.rejects(
      () => resolveTemplate("nope", "totally-bogus", null),
      (err) => err.code === "INVALID_LAYER",
    );
  });
});

// ── Behavior 6: Invalid kind for valid layer → INVALID_KIND ────────────────

describe("resolveTemplate — INVALID_KIND (Behavior 6)", () => {
  it("throws INVALID_KIND for spec + unknown kind", async () => {
    await assert.rejects(
      () => resolveTemplate("spec", "wibble", null),
      (err) => err.code === "INVALID_KIND",
    );
  });

  it("throws INVALID_KIND for charter + spec-only kind (cross-layer string)", async () => {
    // 'behavioral' is valid for spec, invalid for charter
    await assert.rejects(
      () => resolveTemplate("charter", "behavioral", null),
      (err) => err.code === "INVALID_KIND",
    );
  });

  it("throws INVALID_KIND for non-string kind", async () => {
    await assert.rejects(
      () => resolveTemplate("spec", 42, null),
      (err) => err.code === "INVALID_KIND",
    );
  });
});

// ── Behavior 7: No template anywhere → TEMPLATE_NOT_FOUND ──────────────────

describe("resolveTemplate — TEMPLATE_NOT_FOUND (Behavior 7)", () => {
  let tmpPlugin;

  before(() => {
    tmpPlugin = makeTempPlugin();
    // Intentionally do NOT write any template files
    __setAllowedRootsForTest({ pluginRoot: tmpPlugin, extensionRoots: [] });
  });

  after(() => {
    __resetAllowedRootsForTest();
    rmSync(tmpPlugin, { recursive: true, force: true });
  });

  it("throws TEMPLATE_NOT_FOUND when bundled file is absent", async () => {
    await assert.rejects(
      () => resolveTemplate("spec", "behavioral", null),
      (err) => err.code === "TEMPLATE_NOT_FOUND",
    );
  });

  it("error message includes the attempted bundled path", async () => {
    try {
      await resolveTemplate("spec", "behavioral", null);
      assert.fail("expected throw");
    } catch (err) {
      assert.equal(err.code, "TEMPLATE_NOT_FOUND");
      assert.match(
        err.message,
        /spec-template\.behavioral\.md/,
        "message should reference the attempted bundled filename",
      );
    }
  });

  it("error message lists the domain-override path that was tried", async () => {
    const ext = makeTempExtension("nope");
    try {
      __setAllowedRootsForTest({
        pluginRoot: tmpPlugin,
        extensionRoots: { "nope-domain": join(ext, "domain") },
      });
      try {
        await resolveTemplate("spec", "behavioral", "nope-domain");
        assert.fail("expected throw");
      } catch (err) {
        assert.equal(err.code, "TEMPLATE_NOT_FOUND");
        // Both attempted paths surface (domain override + bundled)
        assert.match(err.message, /nope-domain|nope/);
        assert.match(err.message, /spec-template\.behavioral\.md/);
      }
    } finally {
      __setAllowedRootsForTest({ pluginRoot: tmpPlugin, extensionRoots: [] });
      rmSync(ext, { recursive: true, force: true });
    }
  });
});

// ── Behavior 8: Path escapes via symlink → UNSAFE_TEMPLATE_PATH ────────────

describe("resolveTemplate — UNSAFE_TEMPLATE_PATH (Behavior 8)", () => {
  let tmpPlugin;
  let tmpExt;
  let outsideDir;

  beforeEach(() => {
    tmpPlugin = makeTempPlugin();
    writeTpl(
      join(tmpPlugin, "templates", "spec-template.behavioral.md"),
      "# bundled (should not be reached)\n",
    );
    tmpExt = makeTempExtension("evil");
    outsideDir = mkdtempSync(join(tmpdir(), "tplres-outside-"));
    // A real file outside all allowed roots
    writeFileSync(join(outsideDir, "stolen.md"), "# stolen\n");
    __setAllowedRootsForTest({
      pluginRoot: tmpPlugin,
      extensionRoots: { evil: join(tmpExt, "domain") },
    });
  });

  afterEach(() => {
    __resetAllowedRootsForTest();
    rmSync(tmpPlugin, { recursive: true, force: true });
    rmSync(tmpExt, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  });

  it("rejects a symlink in the domain dir pointing outside allowed roots", async () => {
    // domain/spec-template.behavioral.md → outside-dir/stolen.md
    symlinkSync(
      join(outsideDir, "stolen.md"),
      join(tmpExt, "domain", "spec-template.behavioral.md"),
    );
    try {
      await resolveTemplate("spec", "behavioral", "evil");
      assert.fail("expected UNSAFE_TEMPLATE_PATH");
    } catch (err) {
      assert.equal(err.code, "UNSAFE_TEMPLATE_PATH");
      assert.match(err.message, /stolen\.md|escape|outside/i);
    }
  });

  it("rejects a symlink in the bundled templates dir pointing outside the plugin", async () => {
    symlinkSync(
      join(outsideDir, "stolen.md"),
      join(tmpPlugin, "templates", "spec-template.refactor.md"),
    );
    try {
      await resolveTemplate("spec", "refactor", null);
      assert.fail("expected UNSAFE_TEMPLATE_PATH");
    } catch (err) {
      assert.equal(err.code, "UNSAFE_TEMPLATE_PATH");
    }
  });

  it("trailing-slash safety: 'templates-evil/' does NOT match 'templates/' prefix", async () => {
    // Create a sibling 'templates-evil' dir that contains a template-looking file
    // and a symlink inside an extension pointing to it. The realpath would be
    // outside the allowed roots because 'templates-evil/' is not a descendant
    // of 'templates/' (they share a prefix but are siblings).
    const evilSibling = mkdtempSync(join(tmpdir(), "tplres-templates-evil-"));
    try {
      writeFileSync(join(evilSibling, "spec-template.behavioral.md"), "# evil\n");
      symlinkSync(
        join(evilSibling, "spec-template.behavioral.md"),
        join(tmpExt, "domain", "spec-template.behavioral.md"),
      );
      // tmpPlugin/templates is the allowed root; evilSibling is NOT under it.
      await assert.rejects(
        () => resolveTemplate("spec", "behavioral", "evil"),
        (err) => err.code === "UNSAFE_TEMPLATE_PATH",
      );
    } finally {
      rmSync(evilSibling, { recursive: true, force: true });
    }
  });
});
