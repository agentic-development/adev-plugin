/**
 * BEH-12: the target spec is exempt from a manifest pack's byte budgets.
 *
 * The exemption is a property of WHERE the target spec is inlined, not of a
 * mechanism inside `renderPack`:
 *
 *   1. `renderPack` has no target-spec special case — `targetSpecPath` reaches it
 *      only through `expandTargetTokens`.
 *   2. `templates/review-specs/defaults.yaml` gives `review-base`'s sibling-specs
 *      include `exclude: ["<target-spec>"]`, so the target spec is not even in
 *      the matched set.
 *   3. `buildReviewerDispatches` builds its own `role="target-spec"` fence and
 *      appends it to the prompt, never entering `renderPack`'s byte accounting.
 *
 * So this suite is a REGRESSION GUARD on that ownership split: it pins that the
 * target spec appears exactly once per prompt, byte-exact, untruncated, and
 * absent from the pack render — and that crossing `max_total_bytes` produces a
 * `TARGET_SPEC_OVERSIZE` WARNING rather than a truncation or an error.
 *
 * Companion guards that must stay green alongside this suite:
 *   - `context-pack-path-manifest.test.mjs` — BEH-10 manifest section shape.
 *   - `context-pack-inline-parity.test.mjs` — inline delivery is rev-4 exact.
 */

import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { join } from "node:path";

import { renderPack } from "../../lib/governance/context-pack.mjs";
import { buildReviewerDispatches } from "../../lib/governance/dispatch-shape.mjs";
import { loadProfiles } from "../../lib/profiles/index.mjs";
import * as claudeCode from "../../lib/profiles/adapters/claude-code.mjs";
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

const TARGET = "specs/review/target.spec.md";
const SENTINEL = "TARGET-SPEC-SENTINEL-4b7e91";
const DEFAULT_MAX_TOTAL_BYTES = 262144;
const TINY_CAP = 100;

const SIBLINGS = [
  { glob: "<charter-dir>/*.spec.md", exclude: ["<target-spec>"], title: "Siblings" },
];

const PACKS = {
  // Shaped like the bundled `review-base` once it declares manifest delivery.
  "review-base-like": { delivery: "manifest", include: SIBLINGS },
  "inline-base-like": { delivery: "inline", include: SIBLINGS },

  // Self-declared tiny cap.
  "tiny-cap-manifest": { delivery: "manifest", max_total_bytes: TINY_CAP, include: SIBLINGS },
  "tiny-cap-inline": { delivery: "inline", max_total_bytes: TINY_CAP, include: SIBLINGS },

  // Cap AND delivery come from an ancestor, so the comparison must read the
  // RESOLVED budgets rather than `packs[name].max_total_bytes`.
  "cap-root": { delivery: "manifest", max_total_bytes: TINY_CAP, include: [] },
  "inherits-cap": { extends: "cap-root", include: SIBLINGS },

  // Early-error paths.
  "cyclic-a": { extends: "cyclic-b", include: [] },
  "cyclic-b": { extends: "cyclic-a", include: [] },
  "unknown-parent": { extends: "no-such-pack", include: [] },
  "bad-delivery": { delivery: "sideways", include: [] },
  "no-target-manifest": { delivery: "manifest", include: ["docs/*.md"] },
};

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

/** A target-spec body of EXACTLY `bytes` UTF-8 bytes, carrying the sentinel. */
function sizedTarget(bytes) {
  const head = `# Target ${SENTINEL}\n`;
  const headBytes = Buffer.byteLength(head, "utf8");
  assert.ok(bytes >= headBytes, "sizedTarget cannot go below the sentinel header");
  const body = head + "x".repeat(bytes - headBytes);
  assert.equal(Buffer.byteLength(body, "utf8"), bytes);
  return body;
}

function fixtureRepo() {
  const repo = tmp();
  writeFixture(repo, "specs/review/target.spec.md", `# Target\n${SENTINEL}\n`);
  writeFixture(repo, "specs/review/sibling-a.spec.md", "# Sibling A\n");
  writeFixture(repo, "specs/review/sibling-b.spec.md", "# Sibling B\n");
  writeFixture(repo, "prompts/reviewer.md", "# Reviewer prompt\nDo the review.\n");
  writeFixture(repo, "skills/wrapper/SKILL.md", "# wrapper skill\n");
  writeFixture(repo, "adapters/generic.md", "# generic adapter\n");
  return repo;
}

function subagentReviewer(repo, contextPack) {
  return {
    id: "test.subagent",
    name: "Test Reviewer",
    mode: "subagent",
    promptPath: join(repo, "prompts/reviewer.md"),
    promptDisplay: "prompts/reviewer.md",
    profile: "reviewer-capable",
    context_pack: contextPack,
  };
}

function packageReviewer(repo, contextPack) {
  return {
    id: "test.packaged",
    name: "Packaged Reviewer",
    mode: "package",
    skillPath: join(repo, "skills/wrapper/SKILL.md"),
    skillDisplay: "skills/wrapper/SKILL.md",
    adapterPath: join(repo, "adapters/generic.md"),
    adapterDisplay: "adapters/generic.md",
    args: { spec: "<target>" },
    profile: "reviewer-capable",
    context_pack: contextPack,
  };
}

function ctxFor(repo, targetSpecContent, adapter = claudeCode) {
  const loaded = loadProfiles(repo);
  assert.equal(loaded.errors.length, 0, JSON.stringify(loaded.errors));
  return {
    profiles: loaded.profiles,
    contextPacks: PACKS,
    consumerRepoRoot: repo,
    adapter,
    targetSpecPath: TARGET,
    targetSpecContent,
  };
}

describe("BEH-12 — renderPack exposes the resolved budgets and delivery", () => {
  test("a manifest pack reports delivery and a numeric max_total_bytes", () => {
    const repo = fixtureRepo();
    const r = renderPack("review-base-like", PACKS, { repoRoot: repo, targetSpecPath: TARGET });
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
    assert.equal(r.delivery, "manifest");
    assert.equal(typeof r.budgets.maxTotalBytes, "number");
    assert.equal(r.budgets.maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES);
    assert.equal(typeof r.budgets.maxFileBytes, "number");
  });

  test("an exclude: [\"<target-spec>\"] keeps the target spec out of the manifest", () => {
    const repo = fixtureRepo();
    const r = renderPack("review-base-like", PACKS, { repoRoot: repo, targetSpecPath: TARGET });
    assert.equal(r.files.includes(TARGET), false, "target spec must not be manifested");
    assert.ok(r.files.includes("specs/review/sibling-a.spec.md"));
    assert.ok(!r.rendered.includes(TARGET));
  });

  test("an inherited cap is what renderPack reports", () => {
    const repo = fixtureRepo();
    const r = renderPack("inherits-cap", PACKS, { repoRoot: repo, targetSpecPath: TARGET });
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
    assert.equal(r.delivery, "manifest");
    assert.equal(r.budgets.maxTotalBytes, TINY_CAP);
  });

  // A caller reads `budgets.maxTotalBytes` unconditionally, so every early bail
  // must still carry a budgets object. `delivery` is deliberately `null` — not
  // `"inline"` — on the resolveExtends-error paths: the pack never resolved, so
  // claiming a mode would assert something the resolver did not determine.
  for (const [packName, code] of [
    ["cyclic-a", "CONTEXT_PACK_CYCLE"],
    ["unknown-parent", "UNKNOWN_CONTEXT_PACK"],
    ["bad-delivery", "INVALID_PACK_DELIVERY"],
  ]) {
    test(`${code}: budgets are defaulted and delivery is null`, () => {
      const repo = fixtureRepo();
      const r = renderPack(packName, PACKS, { repoRoot: repo, targetSpecPath: TARGET });
      assert.equal(r.errors[0].code, code);
      assert.equal(r.budgets.maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES);
      assert.equal(typeof r.budgets.maxFileBytes, "number");
      assert.equal(r.delivery, null);
    });
  }

  test("CONTEXT_PACK_NO_TARGET: delivery resolved to manifest, budgets present", () => {
    const repo = fixtureRepo();
    const r = renderPack("no-target-manifest", PACKS, { repoRoot: repo });
    assert.equal(r.errors[0].code, "CONTEXT_PACK_NO_TARGET");
    // Here the resolver DID determine the mode — it is why the bail happened.
    assert.equal(r.delivery, "manifest");
    assert.equal(r.budgets.maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES);
  });
});

describe("BEH-12 — the target spec is inlined once, whole, by dispatch assembly", () => {
  test("subagent prompt carries the target spec exactly once and byte-exact", () => {
    const repo = fixtureRepo();
    const content = sizedTarget(400);
    const ctx = ctxFor(repo, content);
    const res = buildReviewerDispatches(subagentReviewer(repo, "review-base-like"), ctx);
    assert.equal(res.errors.length, 0, JSON.stringify(res.errors));
    const d = res.dispatches[0];
    assert.equal(occurrences(d.prompt, SENTINEL), 1);
    assert.ok(d.prompt.includes(content), "target spec must be inlined byte-exact");
    // The pack render is the manifest only — it never carries the spec body.
    assert.equal(d.contextPack.includes(SENTINEL), false);
    assert.ok(d.contextPack.includes('role="path-manifest"'));
  });

  test("a target spec far over max_total_bytes is still emitted whole and unmarked", () => {
    const repo = fixtureRepo();
    const content = sizedTarget(TINY_CAP * 40);
    const ctx = ctxFor(repo, content);
    const res = buildReviewerDispatches(subagentReviewer(repo, "tiny-cap-manifest"), ctx);
    assert.equal(res.errors.length, 0, JSON.stringify(res.errors));
    const prompt = res.dispatches[0].prompt;
    assert.ok(prompt.includes(content), "the whole target spec must survive");
    assert.equal(prompt.includes("…[adev: truncated"), false, "no per-file marker");
    assert.equal(prompt.includes("truncation-notice"), false, "no aggregate notice");
    assert.equal(prompt.includes("pack truncated"), false);
  });
});

describe("BEH-12 — TARGET_SPEC_OVERSIZE is a warning naming path and both sizes", () => {
  test("over the cap: one warning, no error", () => {
    const repo = fixtureRepo();
    const size = TINY_CAP * 40;
    const content = sizedTarget(size);
    const ctx = ctxFor(repo, content);
    const res = buildReviewerDispatches(subagentReviewer(repo, "tiny-cap-manifest"), ctx);
    const oversize = res.warnings.filter((w) => w.code === "TARGET_SPEC_OVERSIZE");
    assert.equal(oversize.length, 1);
    assert.match(oversize[0].message, /specs\/.*\.spec\.md/);
    assert.match(oversize[0].message, new RegExp(String(size)));
    assert.match(oversize[0].message, new RegExp(String(TINY_CAP)));
    assert.equal(res.errors.length, 0, JSON.stringify(res.errors));
  });

  test("delivery: inline never emits the warning (rev-4 behavior unchanged)", () => {
    const repo = fixtureRepo();
    const content = sizedTarget(TINY_CAP * 40);
    const ctx = ctxFor(repo, content);
    const res = buildReviewerDispatches(subagentReviewer(repo, "tiny-cap-inline"), ctx);
    assert.equal(
      res.warnings.filter((w) => w.code === "TARGET_SPEC_OVERSIZE").length,
      0,
      "an inline pack bounds the spec through the pack, not through this warning",
    );
  });

  test("boundary: exactly at the cap does NOT warn, one byte over DOES", () => {
    const atRepo = fixtureRepo();
    const at = sizedTarget(TINY_CAP);
    assert.equal(Buffer.byteLength(at, "utf8"), TINY_CAP);
    const atRes = buildReviewerDispatches(
      subagentReviewer(atRepo, "tiny-cap-manifest"),
      ctxFor(atRepo, at),
    );
    assert.equal(atRes.warnings.filter((w) => w.code === "TARGET_SPEC_OVERSIZE").length, 0);

    const overRepo = fixtureRepo();
    const over = sizedTarget(TINY_CAP + 1);
    const overRes = buildReviewerDispatches(
      subagentReviewer(overRepo, "tiny-cap-manifest"),
      ctxFor(overRepo, over),
    );
    assert.equal(overRes.warnings.filter((w) => w.code === "TARGET_SPEC_OVERSIZE").length, 1);
  });

  test("multi-byte content is measured in BYTES, not code units", () => {
    const repo = fixtureRepo();
    // 40 × U+00E9 is 40 code units but 80 bytes — under the cap by `.length`,
    // over it by `Buffer.byteLength` once the sentinel header is added.
    const content = `# Target ${SENTINEL}\n` + "é".repeat(40);
    assert.ok(content.length <= TINY_CAP, "fixture must be under the cap by .length");
    assert.ok(Buffer.byteLength(content, "utf8") > TINY_CAP, "and over it by bytes");
    const res = buildReviewerDispatches(
      subagentReviewer(repo, "tiny-cap-manifest"),
      ctxFor(repo, content),
    );
    assert.equal(res.warnings.filter((w) => w.code === "TARGET_SPEC_OVERSIZE").length, 1);
  });

  test("the cap compared against is the INHERITED one, not the default", () => {
    const repo = fixtureRepo();
    const size = TINY_CAP + 1;
    const res = buildReviewerDispatches(
      subagentReviewer(repo, "inherits-cap"),
      ctxFor(repo, sizedTarget(size)),
    );
    const oversize = res.warnings.filter((w) => w.code === "TARGET_SPEC_OVERSIZE");
    assert.equal(oversize.length, 1);
    assert.match(oversize[0].message, new RegExp(String(TINY_CAP)));
    assert.equal(
      oversize[0].message.includes(String(DEFAULT_MAX_TOTAL_BYTES)),
      false,
      "comparing against the default cap would mean the resolved budgets were ignored",
    );
  });

  test("package mode: both stages carry the spec once; the warning fires once", () => {
    const repo = fixtureRepo();
    const content = sizedTarget(TINY_CAP * 40);
    const res = buildReviewerDispatches(
      packageReviewer(repo, "tiny-cap-manifest"),
      ctxFor(repo, content),
    );
    assert.equal(res.errors.length, 0, JSON.stringify(res.errors));
    assert.equal(res.dispatches.length, 2);
    assert.deepEqual(res.dispatches.map((d) => d.stage), ["runner", "adapter"]);
    for (const d of res.dispatches) {
      assert.equal(occurrences(d.prompt, SENTINEL), 1, `stage ${d.stage}`);
      assert.ok(d.prompt.includes(content), `stage ${d.stage} truncated the spec`);
    }
    assert.equal(
      res.warnings.filter((w) => w.code === "TARGET_SPEC_OVERSIZE").length,
      1,
      "the warning belongs to the build call, not to each stage",
    );
  });
});
