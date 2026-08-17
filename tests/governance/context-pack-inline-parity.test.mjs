/**
 * BEH-9 postcondition: inline delivery is byte-identical to rev 4.
 *
 * This is a REGRESSION GUARD, not a feature test. It exists so the later
 * manifest-delivery tasks cannot silently change what the three `context_pack:
 * base` consumers in `templates/domains/software/validate.yaml` receive.
 *
 * Acceptance criterion 4: "A pack that does not declare `delivery` renders
 * byte-identically to rev 4, verified on `base` against all three validate.yaml
 * check consumers."
 *
 * No production change accompanies this file. If it ever needs one to pass, the
 * `delivery` default is wrong — fix that, never this test.
 */

import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveExtends, renderPack } from "../../lib/governance/context-pack.mjs";
import { loadReviewConfig } from "../../lib/governance/review-config.mjs";
import { parseYaml } from "../../lib/profiles/yaml.mjs";
import { createTempDir, cleanupTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";

const tempDirs = [];
function tmp() {
  const d = createTempDir();
  tempDirs.push(d);
  return d;
}
afterEach(() => {
  while (tempDirs.length) cleanupTempDir(tempDirs.pop());
});

/**
 * Replace a render's own per-run nonce with a fixed token so two renders can be
 * compared byte-for-byte. The nonce is random per `renderPack` call by design
 * (Behavior 22g) and is deliberately NOT stubbed.
 */
function denonce(rendered, nonce) {
  assert.ok(nonce, "renderPack must return the per-run nonce");
  return rendered.split(nonce).join("<NONCE>");
}

/** Every check in a validate overlay whose `context_pack` is `packName`. */
function checksReferencing(packName, relPath) {
  const overlay = parseYaml(readFileSync(join(PLUGIN_ROOT, relPath), "utf8"));
  return (overlay.checks ?? []).filter((check) => check.context_pack === packName);
}

/** Structured clone of the pack map with `base.delivery` forced to a value. */
function withBaseDelivery(packs, delivery) {
  const clone = JSON.parse(JSON.stringify(packs));
  clone.base = { ...clone.base, delivery };
  return clone;
}

describe("inline delivery byte-parity guard", () => {
  test("the software validate overlay has exactly three `base` consumers", () => {
    const consumers = checksReferencing("base", "templates/domains/software/validate.yaml");
    assert.equal(
      consumers.length,
      3,
      `expected three context_pack: base checks, found ${consumers.map((c) => c.id).join(", ")}`
    );
    // Each one is a subagent-review — the only dispatch path where a pack is
    // rendered at all — so all three really do consume `base`'s bytes.
    for (const check of consumers) {
      assert.equal(check.kind, "subagent-review", `check ${check.id} is not a subagent-review`);
    }
  });

  test("bundled `base` resolves to inline whether or not it says so", () => {
    const repo = tmp();
    const packs = loadReviewConfig(repo).contextPacks;
    assert.equal(resolveExtends("base", packs).delivery, "inline");
    assert.equal(resolveExtends("base", withBaseDelivery(packs, "inline")).delivery, "inline");
  });

  test("bundled `base` stays target-agnostic — no <charter-dir> / <target-spec>", () => {
    const repo = tmp();
    writeFixture(repo, ".context-index/constitution.md", "# Constitution\n");
    writeFixture(repo, ".context-index/platform-context.yaml", "language: js\n");
    const packs = loadReviewConfig(repo).contextPacks;

    const { includes } = resolveExtends("base", packs);
    for (const entry of includes) {
      const text = JSON.stringify(entry);
      assert.ok(!text.includes("<charter-dir>"), `base include carries <charter-dir>: ${text}`);
      assert.ok(!text.includes("<target-spec>"), `base include carries <target-spec>: ${text}`);
    }

    const r = renderPack("base", packs, { repoRoot: repo, targetSpecPath: undefined });
    assert.equal(
      r.errors.filter((e) => e.code === "CONTEXT_PACK_NO_TARGET").length,
      0,
      JSON.stringify(r.errors)
    );
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  });

  test("declaring `delivery: inline` on `base` changes nothing byte-for-byte", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/constitution.md",
      "# Constitution\n\n## Principles\n\n1. Minimize external dependencies.\n2. Pure ESM.\n"
    );
    writeFixture(
      repo,
      ".context-index/platform-context.yaml",
      "language: javascript\nruntime: node\npackage_manager: npm\ntest_runner: node:test\n"
    );
    const packs = loadReviewConfig(repo).contextPacks;

    const a = renderPack("base", packs, { repoRoot: repo });
    const b = renderPack("base", withBaseDelivery(packs, "inline"), { repoRoot: repo });

    // Guard against a vacuous comparison over two empty renders.
    assert.ok(a.rendered.length > 0, "fixture rendered nothing — the parity check would be vacuous");
    assert.ok(a.files.length > 0, "fixture inlined no files — the parity check would be vacuous");
    assert.deepEqual(a.files, [
      ".context-index/constitution.md",
      ".context-index/platform-context.yaml",
    ]);
    assert.ok(a.rendered.includes("Minimize external dependencies"));

    assert.equal(denonce(a.rendered, a.nonce), denonce(b.rendered, b.nonce));
    assert.deepEqual(a.files, b.files);
    assert.deepEqual(a.errors, b.errors);
    assert.deepEqual(a.warnings, b.warnings);
  });

  test("the rev-4 size-bounding paths are byte-identical too", () => {
    const repo = tmp();
    // (a) each file is far over max_file_bytes, so the per-file truncation
    // marker fires; (b) the sections together blow max_total_bytes, so the
    // aggregate role="truncation-notice" fires.
    writeFixture(repo, "docs/a.md", "a".repeat(300));
    writeFixture(repo, "docs/b.md", "b".repeat(300));
    writeFixture(repo, "docs/c.md", "c".repeat(300));

    const bounded = {
      base: { max_file_bytes: 64, max_total_bytes: 300, include: ["docs/*.md"] },
    };
    const a = renderPack("base", bounded, { repoRoot: repo });
    const b = renderPack("base", withBaseDelivery(bounded, "inline"), { repoRoot: repo });

    // The fixture must actually exercise both bounding paths, or this guard
    // silently stops guarding them.
    assert.ok(a.rendered.length > 0);
    assert.ok(a.files.length > 0);
    assert.match(a.rendered, /…\[adev: truncated 64 of 300 bytes of docs\/a\.md — per-file cap 64\]/);
    const noticeRe = new RegExp(
      `<<<ADEV-PACK-${a.nonce} role="truncation-notice">>>\\n([\\s\\S]*?)\\n<<<END-ADEV-PACK-${a.nonce}>>>`
    );
    const notice = a.rendered.match(noticeRe);
    assert.ok(notice, "expected a nonce-fenced truncation-notice section");
    assert.match(notice[1], /pack truncated — \d+ of 3 matched files omitted at the 300-byte cap/);

    assert.equal(denonce(a.rendered, a.nonce), denonce(b.rendered, b.nonce));
    assert.deepEqual(a.files, b.files);
    assert.deepEqual(a.errors, b.errors);
    assert.deepEqual(a.warnings, b.warnings);
  });
});
