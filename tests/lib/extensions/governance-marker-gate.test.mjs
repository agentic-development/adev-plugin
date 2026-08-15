/**
 * The install-time marker gate, and the init-time marker it depends on.
 *
 * Two halves of one rule (Task 12 of the explicit-governance-registries plan):
 *
 *   1. An extension may not install into one of the THREE MARKED registries
 *      (`review.yaml`, `diagnostics.yaml`, `gates.yaml`) until that registry
 *      carries a top-level `materialized_at`. Otherwise the install would
 *      pre-empt materialization and leave a registry whose only vouched
 *      content is the extension's own entry. The refusal is evaluated BEFORE
 *      any `mkdirSync` or file write (review finding SEC-8), so a refused
 *      install leaves the filesystem byte-identical — including not creating
 *      the governance DIRECTORY.
 *
 *   2. `/adev:init` scaffolds all three from templates that already carry the
 *      marker, so a freshly scaffolded project is born materialized and never
 *      meets the guard on first run.
 *
 * The two EXEMPT registries (`validate.yaml`, `boundaries.yaml`) are untouched
 * by both halves — that bounding is what keeps
 * `tests/lib/extensions/example-validation-check-install.test.mjs` green
 * without modification.
 *
 * Assertions are written INLINE rather than behind a local helper: the repo's
 * PreToolUse gaming gate (EMPTY_ASSERTIONS) treats a block whose only
 * assertion is a helper call as unasserted.
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createTempDir, cleanupTempDir, writeFixture, PLUGIN_ROOT } from "../../helpers.mjs";
import { mergeGovernanceEntries } from "../../../lib/extensions/content-install.mjs";
import { readMarker, MARKED_REGISTRIES } from "../../../lib/governance/registry-marker.mjs";

const GOV_REL = ".context-index/governance";
const govPath = (root, file) => join(root, GOV_REL, file);

/** ISO-8601 UTC — the only marker shape `readMarker` accepts back. */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * The real single-target installer entry point, called the way
 * `lib/extensions/install.mjs` calls it.
 */
function installGovernance(root, target, entries) {
  return mergeGovernanceEntries(root, target, entries, {
    extensionName: "demo",
    execConsent: { granted: true, at: null },
  });
}

/**
 * The scaffold sources `/adev:init` and `cli/index.mjs::scaffoldContextKit`
 * copy verbatim into `.context-index/governance/`.
 */
const SCAFFOLD_SOURCES = new Map([
  ["gates.yaml", join(PLUGIN_ROOT, "templates", "gates-template.yaml")],
  ["diagnostics.yaml", join(PLUGIN_ROOT, "templates", "diagnostics-template.yaml")],
  ["review.yaml", join(PLUGIN_ROOT, "templates", "governance", "review.example.yaml")],
]);

/** Scaffold a project's marked registries exactly as init does — `cpSync`, verbatim. */
function scaffold(root) {
  mkdirSync(join(root, GOV_REL), { recursive: true });
  for (const [dest, src] of SCAFFOLD_SOURCES) cpSync(src, govPath(root, dest));
  return root;
}

// ── Rule 1: the install gate on the three MARKED registries ────────────

test("install into an unmarked gates.yaml is refused before any write", (t) => {
  const root = createTempDir();
  t.after(() => cleanupTempDir(root));
  writeFixture(root, `${GOV_REL}/gates.yaml`, "gates: []\n");
  const before = readFileSync(govPath(root, "gates.yaml"), "utf8");

  assert.throws(
    () => installGovernance(root, "gates.yaml", [{ id: "x", command: ["npm", "test"] }]),
    (err) => err.code === "REGISTRY_NOT_MATERIALIZED"
  );
  assert.equal(readFileSync(govPath(root, "gates.yaml"), "utf8"), before);
});

test("install into an unmarked review.yaml is refused and leaves it byte-identical", (t) => {
  const root = createTempDir();
  t.after(() => cleanupTempDir(root));
  writeFixture(root, `${GOV_REL}/review.yaml`, "reviewers: []\n");
  const before = readFileSync(govPath(root, "review.yaml"), "utf8");

  assert.throws(
    () => installGovernance(root, "review.yaml", [{ id: "r1", dispatch: "always" }]),
    (err) => err.code === "REGISTRY_NOT_MATERIALIZED"
  );
  assert.equal(readFileSync(govPath(root, "review.yaml"), "utf8"), before);
});

test("install into an unmarked diagnostics.yaml is refused and leaves it byte-identical", (t) => {
  const root = createTempDir();
  t.after(() => cleanupTempDir(root));
  writeFixture(root, `${GOV_REL}/diagnostics.yaml`, "diagnostics: []\n");
  const before = readFileSync(govPath(root, "diagnostics.yaml"), "utf8");

  assert.throws(
    () =>
      installGovernance(root, "diagnostics.yaml", [
        { id: "v/d1", runner: "plugin:tier1/frontmatter-present.mjs", severity: "info", tier: 1, scope: "spec" },
      ]),
    (err) => err.code === "REGISTRY_NOT_MATERIALIZED"
  );
  assert.equal(readFileSync(govPath(root, "diagnostics.yaml"), "utf8"), before);
});

test("SEC-8 — the refusal precedes mkdirSync: no governance DIRECTORY is created", (t) => {
  const root = createTempDir();
  t.after(() => cleanupTempDir(root));
  // Nothing under .context-index/ yet — an install must not bring the
  // governance directory (or an unvouched gates.yaml) into existence.
  assert.equal(existsSync(join(root, GOV_REL)), false);

  assert.throws(
    () => installGovernance(root, "gates.yaml", [{ id: "x", command: ["npm", "test"] }]),
    (err) => err.code === "REGISTRY_NOT_MATERIALIZED"
  );
  assert.equal(existsSync(join(root, GOV_REL)), false);
  assert.equal(existsSync(govPath(root, "gates.yaml")), false);
});

test("install into a MARKED gates.yaml succeeds and does not re-stamp the marker", (t) => {
  const root = createTempDir();
  t.after(() => cleanupTempDir(root));
  const stamped = "2026-01-02T03:04:05Z";
  writeFixture(
    root,
    `${GOV_REL}/gates.yaml`,
    `gates:\n  - id: existing\n    command: [npm, test]\n\nmaterialized_at: ${stamped}\n`
  );

  const report = installGovernance(root, "gates.yaml", [
    { id: "ext-gate", command: ["node", "g.mjs"] },
  ]);
  const out = readFileSync(govPath(root, "gates.yaml"), "utf8");
  assert.ok(report.mergesApplied.includes("appended: ext-gate"), report.mergesApplied.join(", "));
  assert.ok(out.includes("ext-gate"), out);
  assert.equal(readMarker(govPath(root, "gates.yaml")), stamped);
  assert.equal(out.match(/^materialized_at:/gm).length, 1, out);
});

// ── The two EXEMPT registries keep working with no marker at all ───────

test("install into validate.yaml needs no marker (exempt registry)", (t) => {
  const root = createTempDir();
  t.after(() => cleanupTempDir(root));
  writeFixture(root, `${GOV_REL}/validate.yaml`, "checks: []\n");

  const report = installGovernance(root, "validate.yaml", [
    { id: "ext-check", kind: "deterministic-check", command: ["npm", "test"] },
  ]);
  assert.ok(report.mergesApplied.includes("appended: ext-check"), report.mergesApplied.join(", "));
  assert.equal(readMarker(govPath(root, "validate.yaml")), null);
  assert.ok(readFileSync(govPath(root, "validate.yaml"), "utf8").includes("ext-check"));
});

test("install into boundaries.yaml needs no marker (exempt registry)", (t) => {
  const root = createTempDir();
  t.after(() => cleanupTempDir(root));
  writeFixture(root, `${GOV_REL}/boundaries.yaml`, "boundaries: []\n");

  const report = installGovernance(root, "boundaries.yaml", [
    { id: "b1", severity: "error", pattern: "src/**" },
  ]);
  assert.ok(report.mergesApplied.includes("appended: b1"), report.mergesApplied.join(", "));
  assert.equal(readMarker(govPath(root, "boundaries.yaml")), null);
  assert.ok(readFileSync(govPath(root, "boundaries.yaml"), "utf8").includes("b1"));
});

// ── Rule 2: a scaffolded project is born materialized ──────────────────

test("a freshly scaffolded project carries the marker on all three registries", (t) => {
  const root = createTempDir();
  t.after(() => cleanupTempDir(root));
  scaffold(root);

  for (const file of MARKED_REGISTRIES) {
    const marker = readMarker(govPath(root, file));
    assert.ok(marker, `${file} missing marker`);
    assert.match(marker, ISO_UTC, `${file} marker is not ISO-8601 UTC`);
    assert.equal(Number.isNaN(Date.parse(marker)), false, `${file} marker is not a real instant`);
  }
});

test("an extension can install into a scaffolded gates.yaml without materializing first", (t) => {
  const root = createTempDir();
  t.after(() => cleanupTempDir(root));
  scaffold(root);
  const marker = readMarker(govPath(root, "gates.yaml"));

  const report = installGovernance(root, "gates.yaml", [
    { id: "ext-gate", command: ["node", "g.mjs"] },
  ]);
  assert.ok(report.mergesApplied.includes("appended: ext-gate"), report.mergesApplied.join(", "));
  assert.equal(readMarker(govPath(root, "gates.yaml")), marker);
});

test("templates/boundaries-template.yaml carries NO marker — it is marker-exempt (DDR-1)", () => {
  const text = readFileSync(join(PLUGIN_ROOT, "templates", "boundaries-template.yaml"), "utf8");
  assert.equal(/^materialized_at:/m.test(text), false, "boundaries-template.yaml must stay unmarked");
  assert.equal(MARKED_REGISTRIES.has("boundaries.yaml"), false);
});
