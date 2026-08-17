/**
 * BEH-10 + BEH-5: path-manifest section rendering for `delivery: manifest`.
 *
 * A manifest pack emits ONE nonce-fenced `role="path-manifest"` section per
 * include, in declaration order, whose body is one repo-root-relative path per
 * line sorted in BYTE order. No matched file's body is inlined: the target spec
 * is supplied separately by `buildReviewerDispatches` as its own
 * `role="target-spec"` section, so inlining it inside `renderPack` would ship
 * the spec twice in every prompt.
 *
 * Companion guards that must stay green alongside this suite:
 *   - `context-pack-inline-parity.test.mjs` — inline delivery is byte-identical
 *     to rev 4 (the oracle for "the manifest branch changed nothing inline").
 *   - `context-pack.test.mjs` — the rev-4 behavior set.
 */

import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import { renderPack } from "../../lib/governance/context-pack.mjs";
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

const TARGET = "specs/review/target.spec.md";
const SENTINEL = "SENTINEL-BODY-MUST-NOT-BE-INLINED";

/** The five-include fixture used by the header/ordering/body assertions. */
const FIVE_INCLUDES = [
  // 0: declared title wins.
  { glob: "<charter-dir>/charter.md", title: "Parent Charter" },
  // 1: several matches, so byte ordering within the include is observable.
  { glob: "<charter-dir>/*.spec.md", exclude: ["<target-spec>"], title: "Siblings" },
  // 2: bare string include — `normalizeInclude` yields title: null, so the
  //    header falls back to the glob itself.
  "docs/*.md",
  // 3: neither a title nor a glob → `title` is omitted ENTIRELY.
  "",
  // 4: a titled include that matches nothing → still emits a section.
  { glob: "nowhere/*.md", title: "Nothing Here" },
];

function packs() {
  return {
    manifestPack: { delivery: "manifest", include: FIVE_INCLUDES },
    inlinePack: { delivery: "inline", include: FIVE_INCLUDES },

    // An ancestor declares the mode; the rendered pack itself says nothing.
    manifestRoot: { delivery: "manifest", include: [] },
    inheritsManifest: { extends: "manifestRoot", include: [{ glob: "docs/*.md", title: "Docs" }] },

    // Declaration order is deliberately the reverse of alphabetical.
    declOrder: {
      delivery: "manifest",
      include: [
        { glob: "zed/*.md", title: "Zed" },
        { glob: "alpha/*.md", title: "Alpha" },
        { glob: "mid/*.md", title: "Mid" },
      ],
    },

    byteOrder: { delivery: "manifest", include: [{ glob: "docs/*.md", title: "Docs" }] },

    denied: { delivery: "manifest", include: [{ glob: "conf/*.yaml", title: "Conf" }] },

    // No `<charter-dir>` / `<target-spec>` token anywhere, so a missing
    // targetSpecPath can only be caught by the delivery-level check.
    tokenFreeManifest: { delivery: "manifest", include: ["docs/*.md"] },
    tokenFreeInline: { delivery: "inline", include: ["docs/*.md"] },

    hugeManifest: { delivery: "manifest", include: [{ glob: "big/*.md", title: "Big" }] },
  };
}

/** Repo laid out for the five-include fixture. */
function fiveIncludeRepo() {
  const repo = tmp();
  writeFixture(repo, "specs/review/charter.md", "# Review Charter\n");
  writeFixture(repo, "specs/review/target.spec.md", "# Target\n");
  writeFixture(repo, "specs/review/Zeta.spec.md", "# Zeta\n");
  writeFixture(repo, "specs/review/_alpha.spec.md", "# Alpha\n");
  writeFixture(repo, "specs/review/beta.spec.md", "# Beta\n");
  writeFixture(repo, "docs/one.md", `# One\n${SENTINEL}\n`);
  writeFixture(repo, "docs/two.md", "# Two\n");
  return repo;
}

describe("context-pack path-manifest rendering (BEH-10)", () => {
  test("one section per include, in declaration order, all role=path-manifest", () => {
    const repo = fiveIncludeRepo();
    const r = renderPack("manifestPack", packs(), { repoRoot: repo, targetSpecPath: TARGET });
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
    const sections = parseSections(r.rendered, r.nonce);
    assert.equal(sections.length, FIVE_INCLUDES.length);
    assert.deepEqual(
      sections.map((s) => s.attrs.role),
      Array(FIVE_INCLUDES.length).fill("path-manifest"),
    );
  });

  test("body is one repo-root-relative path per line, byte-sorted within the include", () => {
    const repo = fiveIncludeRepo();
    const r = renderPack("manifestPack", packs(), { repoRoot: repo, targetSpecPath: TARGET });
    const sections = parseSections(r.rendered, r.nonce);
    const paths = sections[1].body.split("\n");
    assert.ok(paths.length > 1, "fixture must match several files or the sort is unobservable");
    assert.deepEqual(paths, [...paths].sort());
    for (const p of paths) assert.ok(!p.startsWith("/"), `paths are repo-root-relative: ${p}`);
    // The spec under review is excluded via <target-spec>, exactly as rev 4.
    assert.ok(!paths.includes(TARGET));
  });

  test("zero inlined bodies: no matched file's content appears anywhere", () => {
    const repo = fiveIncludeRepo();
    const r = renderPack("manifestPack", packs(), { repoRoot: repo, targetSpecPath: TARGET });
    assert.ok(!r.rendered.includes(SENTINEL), "a matched file's body leaked into the manifest");
    assert.ok(!r.rendered.includes("# Review Charter"));
    assert.ok(!r.rendered.includes("# Beta"));
    // ...but the paths themselves are named.
    assert.ok(r.rendered.includes("docs/one.md"));
  });

  test("title fallback chain: declared → glob → omitted entirely", () => {
    const repo = fiveIncludeRepo();
    const r = renderPack("manifestPack", packs(), { repoRoot: repo, targetSpecPath: TARGET });
    const sections = parseSections(r.rendered, r.nonce);
    assert.equal(sections[0].attrs.title, "Parent Charter");
    assert.equal(sections[1].attrs.title, "Siblings");
    assert.equal(sections[2].attrs.title, "docs/*.md");
    assert.equal("title" in sections[3].attrs, false);
    // Omitted ENTIRELY, not `title=""`.
    assert.equal(sections[3].header, 'role="path-manifest"');
    assert.ok(!sections[3].raw.includes('title=""'));
  });

  test("an include matching nothing still emits a path-manifest section", () => {
    const repo = fiveIncludeRepo();
    const r = renderPack("manifestPack", packs(), { repoRoot: repo, targetSpecPath: TARGET });
    const sections = parseSections(r.rendered, r.nonce);
    const empty = sections[4];
    assert.equal(empty.attrs.role, "path-manifest");
    assert.equal(empty.attrs.title, "Nothing Here");
    assert.equal(empty.body, "<no matches>");
  });

  test("under delivery: inline the same empty include keeps role=no-matches", () => {
    const repo = fiveIncludeRepo();
    const r = renderPack("inlinePack", packs(), { repoRoot: repo, targetSpecPath: TARGET });
    const sections = parseSections(r.rendered, r.nonce);
    const empty = sections.filter((s) => s.attrs.role === "no-matches");
    assert.ok(empty.length > 0, "inline delivery must still emit role=no-matches");
    assert.equal(empty.at(-1).attrs.path, "Nothing Here");
    assert.equal(empty.at(-1).body, "<no matches>");
    assert.equal(
      sections.some((s) => s.attrs.role === "path-manifest"),
      false,
      "inline delivery must never emit a path-manifest section",
    );
  });

  test("no truncation-notice section is ever emitted for a manifest pack", () => {
    const repo = fiveIncludeRepo();
    const r = renderPack("manifestPack", packs(), { repoRoot: repo, targetSpecPath: TARGET });
    const sections = parseSections(r.rendered, r.nonce);
    assert.equal(sections.some((s) => s.attrs.role === "truncation-notice"), false);
    assert.ok(!r.rendered.includes("pack truncated"));
  });

  test("files[] carries every manifested path", () => {
    const repo = fiveIncludeRepo();
    const r = renderPack("manifestPack", packs(), { repoRoot: repo, targetSpecPath: TARGET });
    const expected = [
      "specs/review/charter.md",
      "specs/review/Zeta.spec.md",
      "specs/review/_alpha.spec.md",
      "specs/review/beta.spec.md",
      "docs/one.md",
      "docs/two.md",
    ];
    assert.deepEqual([...r.files].sort(), [...expected].sort());
    // Every name in files[] is also named in the rendered manifest.
    for (const rel of r.files) assert.ok(r.rendered.includes(rel), `${rel} missing from manifest`);
  });

  test("a pack that INHERITS delivery: manifest renders manifest sections", () => {
    const repo = tmp();
    writeFixture(repo, "docs/one.md", `# One\n${SENTINEL}\n`);
    const r = renderPack("inheritsManifest", packs(), { repoRoot: repo, targetSpecPath: TARGET });
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
    const sections = parseSections(r.rendered, r.nonce);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].attrs.role, "path-manifest");
    assert.equal(sections[0].attrs.title, "Docs");
    assert.equal(sections[0].body, "docs/one.md");
    assert.ok(!r.rendered.includes(SENTINEL));
  });
});

describe("context-pack path-manifest ordering (BEH-5)", () => {
  test("section order is include DECLARATION order, not alphabetical", () => {
    const repo = tmp();
    writeFixture(repo, "zed/z.md", "z");
    writeFixture(repo, "alpha/a.md", "a");
    writeFixture(repo, "mid/m.md", "m");
    const r = renderPack("declOrder", packs(), { repoRoot: repo, targetSpecPath: TARGET });
    const sections = parseSections(r.rendered, r.nonce);
    assert.deepEqual(sections.map((s) => s.attrs.title), ["Zed", "Alpha", "Mid"]);
    assert.deepEqual(sections.map((s) => s.body), ["zed/z.md", "alpha/a.md", "mid/m.md"]);
    assert.deepEqual(r.files, ["zed/z.md", "alpha/a.md", "mid/m.md"]);
  });

  test("within an include the sort is BYTE order, not locale collation", () => {
    const repo = tmp();
    // 'Z' (0x5A) < '_' (0x5F) < 'a' (0x61). `localeCompare` would give _a/a/b/c/Z.
    for (const n of ["c", "a", "_a", "Z", "b"]) writeFixture(repo, `docs/${n}.md`, n);
    const r = renderPack("byteOrder", packs(), { repoRoot: repo, targetSpecPath: TARGET });
    const sections = parseSections(r.rendered, r.nonce);
    assert.equal(sections.length, 1);
    assert.deepEqual(sections[0].body.split("\n"), [
      "docs/Z.md",
      "docs/_a.md",
      "docs/a.md",
      "docs/b.md",
      "docs/c.md",
    ]);
    assert.deepEqual(r.files, [
      "docs/Z.md",
      "docs/_a.md",
      "docs/a.md",
      "docs/b.md",
      "docs/c.md",
    ]);
    // Guard the fixture itself: a case-insensitive FS would collapse a name.
    assert.equal(new Set(r.files).size, 5);
  });

  test("renders reproducibly across calls modulo the per-run nonce", () => {
    const repo = tmp();
    for (const n of ["c", "a", "b"]) writeFixture(repo, `docs/${n}.md`, n);
    const ctx = { repoRoot: repo, targetSpecPath: TARGET };
    const a = renderPack("byteOrder", packs(), ctx);
    const b = renderPack("byteOrder", packs(), ctx);
    assert.equal(a.rendered.split(a.nonce).join("N"), b.rendered.split(b.nonce).join("N"));
    assert.deepEqual(a.files, b.files);
  });
});

describe("context-pack path-manifest guards", () => {
  test("a denylisted file swept up by a wildcard is neither manifested nor in files[]", () => {
    const repo = tmp();
    writeFixture(repo, "conf/ok.yaml", "ok: true");
    writeFixture(repo, "conf/profiles.yaml", "secret: yes");
    const r = renderPack("denied", packs(), { repoRoot: repo, targetSpecPath: TARGET });
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
    assert.ok(r.warnings.some((w) => w.code === "CONTEXT_PACK_DENYLIST_SKIP"));
    assert.deepEqual(r.files, ["conf/ok.yaml"]);
    const sections = parseSections(r.rendered, r.nonce);
    assert.equal(sections[0].body, "conf/ok.yaml");
    assert.ok(!r.rendered.includes("conf/profiles.yaml"), "denylisted path leaked into the manifest");
    assert.ok(!r.rendered.includes("secret: yes"));
  });

  test("a manifest pack with no targetSpecPath fails load with CONTEXT_PACK_NO_TARGET", () => {
    const repo = tmp();
    writeFixture(repo, "docs/one.md", "hello one");
    const noTarget = renderPack("tokenFreeManifest", packs(), { repoRoot: repo });
    assert.equal(noTarget.errors[0].code, "CONTEXT_PACK_NO_TARGET");
    assert.match(noTarget.errors[0].message, /tokenFreeManifest/);
    assert.equal(noTarget.rendered, "");
    assert.deepEqual(noTarget.files, []);
  });

  test("the same token-free pack under delivery: inline still renders target-agnostically", () => {
    const repo = tmp();
    writeFixture(repo, "docs/one.md", "hello one");
    const r = renderPack("tokenFreeInline", packs(), { repoRoot: repo });
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
    assert.deepEqual(r.files, ["docs/one.md"]);
    assert.ok(r.rendered.includes("hello one"));
  });

  test("SA-2 gap: a manifest section over max_file_bytes is emitted WHOLE, unmarked", () => {
    const repo = tmp();
    const stem = "q".repeat(80);
    for (let i = 0; i < 200; i++) {
      writeFixture(repo, `big/${stem}-${String(i).padStart(3, "0")}.md`, "x");
    }
    const big = renderPack("hugeManifest", packs(), { repoRoot: repo, targetSpecPath: TARGET });
    assert.equal(big.errors.length, 0, JSON.stringify(big.errors));
    const sections = parseSections(big.rendered, big.nonce);
    assert.equal(sections.length, 1);
    assert.ok(
      Buffer.byteLength(sections[0].body, "utf8") > 16384,
      "fixture must exceed the default per-file cap or the gap is unobserved",
    );
    assert.equal(sections[0].body.includes("…[adev:"), false);
    assert.equal(big.files.length, 200);
  });
});
