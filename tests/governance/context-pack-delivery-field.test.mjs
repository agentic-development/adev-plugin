/**
 * BEH-9 (first half): the per-pack `delivery` field.
 *
 * A resolved pack carries `delivery`, a CLOSED enum of `inline` | `manifest`,
 * defaulting to `inline`, inherited through `resolveExtends` with exactly the
 * same precedence as `max_file_bytes` / `max_total_bytes` (nearest declaration
 * walking child → root wins). An unrecognised value is a LOAD ERROR
 * (`INVALID_PACK_DELIVERY`), never a silent fallback.
 *
 * This suite stays scoped to the FIELD: how `delivery` resolves through an
 * `extends` chain, and how `renderPack` surfaces a bad value. BEH-10's manifest
 * *rendering* assertions — section shape, one-per-include grouping, the title
 * fallback chain, ordering — live in `context-pack-path-manifest.test.mjs`.
 * The two tests below only pin the seam between the two: that a resolved
 * `manifest` actually reaches the manifest branch, and that the branch's
 * delivery-level target guard fires.
 */

import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import { resolveExtends, renderPack } from "../../lib/governance/context-pack.mjs";
import { parseSections } from "./helpers/parse-pack-sections.mjs";
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

/** Fixture packs covering default, inheritance, override and invalid value. */
function deliveryPacks() {
  return {
    // Declares nothing at all → default.
    plain: { include: ["docs/*.md"] },

    // parent declares manifest ...
    manifestParent: { delivery: "manifest", include: ["docs/*.md"] },
    // ... child declares nothing → inherits manifest.
    childOfManifest: { extends: "manifestParent", include: [] },
    // ... child declares inline → child is nearer, so inline wins.
    childOverridesInline: { extends: "manifestParent", delivery: "inline", include: [] },

    // grandparent manifest, parent silent, child silent → manifest.
    silentParent: { extends: "manifestParent", include: [] },
    grandchild: { extends: "silentParent", include: [] },

    // Unrecognised value on the pack itself.
    badDelivery: { delivery: "sideband", include: ["docs/*.md"] },

    // Unrecognised value in an ANCESTOR that the child overrides. Still an
    // authoring error: the typo is real regardless of who wins precedence.
    badAncestor: { delivery: "sideband", include: [] },
    overridesBadAncestor: { extends: "badAncestor", delivery: "inline", include: [] },
  };
}

describe("context-pack delivery field", () => {
  test("defaults to inline when no pack in the chain declares it", () => {
    const packs = deliveryPacks();
    assert.equal(resolveExtends("plain", packs).delivery, "inline");
  });

  test("inherits with the same precedence as max_file_bytes", () => {
    const packs = deliveryPacks();
    // parent declares manifest, child declares nothing -> child is manifest
    assert.equal(resolveExtends("childOfManifest", packs).delivery, "manifest");
    // parent declares manifest, child declares inline -> child is nearer
    assert.equal(resolveExtends("childOverridesInline", packs).delivery, "inline");
    // grandparent manifest, parent silent, child silent -> child is manifest
    assert.equal(resolveExtends("grandchild", packs).delivery, "manifest");
    // the declaring pack itself resolves to its own value
    assert.equal(resolveExtends("manifestParent", packs).delivery, "manifest");
  });

  test("an unrecognised value is a load error naming pack and value", () => {
    const packs = deliveryPacks();
    const bad = resolveExtends("badDelivery", packs);
    assert.equal(bad.errors.length, 1, JSON.stringify(bad.errors));
    assert.equal(bad.errors[0].code, "INVALID_PACK_DELIVERY");
    assert.match(bad.errors[0].message, /badDelivery/);
    assert.match(bad.errors[0].message, /sideband/);
    // No silent fallback on the error path.
    assert.equal(bad.delivery, undefined);
    // Error path mirrors CONTEXT_PACK_CYCLE / UNKNOWN_CONTEXT_PACK exactly.
    assert.deepEqual(bad.includes, []);
    assert.deepEqual(bad.budgets, { maxFileBytes: 16384, maxTotalBytes: 262144 });
  });

  test("a typo in an ANCESTOR the child overrides still fails loud", () => {
    const packs = deliveryPacks();
    const r = resolveExtends("overridesBadAncestor", packs);
    assert.equal(r.errors[0].code, "INVALID_PACK_DELIVERY");
    assert.match(r.errors[0].message, /badAncestor/);
    assert.match(r.errors[0].message, /sideband/);
    assert.equal(r.delivery, undefined);
  });

  test("renderPack surfaces the load error and renders nothing", () => {
    const repo = tmp();
    writeFixture(repo, "docs/one.md", "hello one");
    const packs = deliveryPacks();
    const r = renderPack("badDelivery", packs, { repoRoot: repo });
    assert.equal(r.rendered, "");
    assert.deepEqual(r.files, []);
    assert.ok(r.errors.some((e) => e.code === "INVALID_PACK_DELIVERY"));
  });

  test("a manifest pack renders path-manifest sections, not inline bodies", () => {
    const repo = tmp();
    writeFixture(repo, "docs/one.md", "hello one");
    const packs = deliveryPacks();
    const r = renderPack("manifestParent", packs, {
      repoRoot: repo,
      targetSpecPath: "specs/review/target.spec.md",
    });
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
    assert.deepEqual(r.files, ["docs/one.md"]);
    // The resolved `delivery` really does reach the manifest branch: the path is
    // named inside a `role="path-manifest"` fence and the body is NOT inlined.
    const sections = parseSections(r.rendered, r.nonce);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].attrs.role, "path-manifest");
    assert.equal(sections[0].body, "docs/one.md");
    assert.ok(!r.rendered.includes("hello one"));
  });

  test("a manifest pack with no targetSpecPath fails load with CONTEXT_PACK_NO_TARGET", () => {
    const repo = tmp();
    writeFixture(repo, "docs/one.md", "hello one");
    const packs = deliveryPacks();
    // `manifestParent`'s include carries no <charter-dir> / <target-spec> token,
    // so this can only come from the delivery-level guard, not token expansion.
    const r = renderPack("manifestParent", packs, { repoRoot: repo });
    assert.equal(r.errors[0].code, "CONTEXT_PACK_NO_TARGET");
    assert.match(r.errors[0].message, /manifestParent/);
    assert.equal(r.rendered, "");
    assert.deepEqual(r.files, []);
  });
});
