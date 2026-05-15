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
  readFileSync,
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

// ── Bundled-template coverage: action / skill / integration / artifact ─────
//
// Covers spec-templates.plan.md Task 5: for each new kind, assert
//   * resolveTemplate('spec', kind, null) returns the bundled path
//   * the file exists on disk
//   * the body contains the documented H2 section list in the documented order
//
// These tests intentionally run against the real plugin `templates/` directory
// (no __setAllowedRootsForTest override) so they pin the actually-shipped
// templates to the structural contract in spec-templates.spec.md.

describe("resolveTemplate — bundled new-kind spec templates (Task 5)", () => {
  // Documented H2 section order per spec-templates.spec.md "Structural Shape".
  const EXPECTED_H2 = {
    action: [
      "Postconditions",
      "Procedure",
      "Idempotency",
      "Rollback",
      "System Constitution Reference",
      "Acceptance Criteria",
    ],
    skill: [
      "Invocation Modes",
      "Arguments",
      "Output Contract",
      "Failure Modes",
      "System Constitution Reference",
      "Acceptance Criteria",
    ],
    integration: [
      "Participants",
      "Interaction Contract",
      "State Machine",
      "Error Propagation",
      "System Constitution Reference",
      "Acceptance Criteria",
    ],
    artifact: [
      "Structural Shape",
      "Required Files",
      "Consumers",
      "System Constitution Reference",
      "Acceptance Criteria",
    ],
  };

  // Extract the ordered list of H2 headings ("## Title") from a markdown body.
  function extractH2Sections(body) {
    const out = [];
    for (const line of body.split("\n")) {
      const m = line.match(/^##\s+(.+?)\s*$/);
      if (m) out.push(m[1].trim());
    }
    return out;
  }

  for (const kind of ["action", "skill", "integration", "artifact"]) {
    it(`resolves bundled spec template for kind '${kind}' to ${kind}-file under PLUGIN_ROOT/templates/`, async () => {
      const expected = resolve(
        PLUGIN_ROOT,
        "templates",
        `spec-template.${kind}.md`,
      );
      const p = await resolveTemplate("spec", kind, null);
      // realpathSync of the expected path normalizes /var → /private/var on macOS.
      assert.equal(p, realpathSync(expected));
      assert.equal(existsSync(p), true);
    });

    it(`bundled spec template for kind '${kind}' has the documented H2 section list in order`, async () => {
      const p = await resolveTemplate("spec", kind, null);
      const body = readFileSync(p, "utf8");
      const sections = extractH2Sections(body);
      assert.deepEqual(
        sections,
        EXPECTED_H2[kind],
        `Template '${kind}' H2 sections mismatch.\n` +
          `Expected: ${JSON.stringify(EXPECTED_H2[kind])}\n` +
          `Got:      ${JSON.stringify(sections)}`,
      );
    });

    it(`bundled spec template for kind '${kind}' frontmatter declares kind: ${kind}`, async () => {
      const p = await resolveTemplate("spec", kind, null);
      const body = readFileSync(p, "utf8");
      // Frontmatter line should be 'kind: <kind>' (no quotes per templates).
      const re = new RegExp(`^kind:\\s*${kind}\\b`, "m");
      assert.match(
        body,
        re,
        `Template '${kind}' frontmatter must contain 'kind: ${kind}'.`,
      );
    });
  }
});

// ── Bundled-template coverage: charter kinds (feature / module / cross-cutting / initiative) ──
//
// Covers charter-templates.plan.md Task 5: for each charter kind, assert
//   * resolveTemplate('charter', kind, null) returns the bundled path
//   * the file exists on disk
//   * the body contains the documented H2 section list in the documented order
//   * frontmatter declares `kind: <kind>`
//
// Like the spec-template coverage above, these tests intentionally run against
// the real plugin `templates/` directory (no __setAllowedRootsForTest override)
// so they pin the actually-shipped templates to the structural contract in
// charter-templates.spec.md.

describe("resolveTemplate — bundled charter templates (Task 5)", () => {
  // Documented H2 section order per charter-templates.spec.md "Structural Shape".
  //
  // The feature charter retains the existing six-section shape plus the
  // organically-added "Deferred Capabilities" section that ships in the
  // existing template (spec line 50: "H2 structure unchanged" — i.e., what is
  // currently on disk after the rename). The other three kinds match the
  // section lists documented in the spec verbatim.
  const EXPECTED_H2 = {
    feature: [
      "Business Intent",
      "Scope and Boundaries",
      "Domain Model",
      "Capability Map",
      "Deferred Capabilities",
      "Interface Contracts",
      "Quality Attributes",
    ],
    module: [
      "Purpose",
      "Skills",
      "Key Behaviors",
      "Key Files",
      "Constitution Reference",
      "Capability Map",
    ],
    "cross-cutting": [
      "Business Intent",
      "Scope",
      "Affected Modules",
      "Interface Contracts",
      "Quality Attributes",
    ],
    initiative: [
      "Business Intent",
      "Scope",
      "Current State",
      "Target State",
      "Migration Plan",
      "Acceptance Criteria",
    ],
  };

  // Extract the ordered list of H2 headings ("## Title") from a markdown body.
  function extractH2Sections(body) {
    const out = [];
    for (const line of body.split("\n")) {
      const m = line.match(/^##\s+(.+?)\s*$/);
      if (m) out.push(m[1].trim());
    }
    return out;
  }

  for (const kind of ["feature", "module", "cross-cutting", "initiative"]) {
    it(`resolves bundled charter template for kind '${kind}' to ${kind}-file under PLUGIN_ROOT/templates/`, async () => {
      const expected = resolve(
        PLUGIN_ROOT,
        "templates",
        `charter-template.${kind}.md`,
      );
      const p = await resolveTemplate("charter", kind, null);
      // realpathSync of the expected path normalizes /var → /private/var on macOS.
      assert.equal(p, realpathSync(expected));
      assert.equal(existsSync(p), true);
    });

    it(`bundled charter template for kind '${kind}' has the documented H2 section list in order`, async () => {
      const p = await resolveTemplate("charter", kind, null);
      const body = readFileSync(p, "utf8");
      const sections = extractH2Sections(body);
      assert.deepEqual(
        sections,
        EXPECTED_H2[kind],
        `Charter template '${kind}' H2 sections mismatch.\n` +
          `Expected: ${JSON.stringify(EXPECTED_H2[kind])}\n` +
          `Got:      ${JSON.stringify(sections)}`,
      );
    });

    it(`bundled charter template for kind '${kind}' frontmatter declares kind: ${kind}`, async () => {
      const p = await resolveTemplate("charter", kind, null);
      const body = readFileSync(p, "utf8");
      // Frontmatter line should be 'kind: <kind>' (no quotes per templates).
      const re = new RegExp(`^kind:\\s*${kind}\\b`, "m");
      assert.match(
        body,
        re,
        `Charter template '${kind}' frontmatter must contain 'kind: ${kind}'.`,
      );
    });
  }
});
