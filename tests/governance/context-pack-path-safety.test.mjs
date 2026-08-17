/**
 * BEH-14: fence-token neutralization for PATH strings emitted into a manifest
 * section.
 *
 * Under `delivery: manifest` the payload is no longer file bodies but file
 * NAMES, and a name is just as attacker-influenceable as a body: a sibling file
 * dropped into the charter directory, or a charter directory name reached
 * through `<charter-dir>` expansion, both land verbatim inside a fence whose
 * provenance preamble declares the content repository-sourced. So a path goes
 * through the SAME neutralizer a body does, and a hit is reported with
 * `CONTEXT_PACK_FENCE_COLLISION` naming the offending path.
 *
 * Scope boundary, asserted rather than commented: only the section BODY is
 * covered here. Fence-header ATTRIBUTE values are still interpolated raw, so a
 * `"` or `>>>` in a title escapes the attribute. That is SEC-1, owned by
 * adev-plugin-j7pq.7, and the gap is pinned below as an executable marker
 * asserting TODAY's behavior — the day j7pq.7 lands, that assertion flips and
 * forces a deliberate update here.
 */

import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import { renderPack, neutralizeFenceTokens } from "../../lib/governance/context-pack.mjs";
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
/** The literal prefix an attacker wants to smuggle. */
const RAW_PREFIX = "<<<ADEV-PACK-";
/** What `neutralizeFenceTokens` rewrites it to (U+2039 as the middle char). */
const SAFE_PREFIX = "<‹<ADEV-PACK-";

/** File names that carry a literal fence token / the legacy `=== rel ===` delimiter. */
const OPEN_FENCE_NAME = "<<<ADEV-PACK-x>>>.spec.md";
const CLOSE_FENCE_NAME = "<<<END-ADEV-PACK-y>>>.spec.md";
const LEGACY_NAME = "=== forged ===.spec.md";

const SIBLINGS = {
  glob: "<charter-dir>/*.spec.md",
  exclude: ["<target-spec>"],
  title: "Siblings",
};

function packs() {
  return {
    manifestPack: { delivery: "manifest", include: [SIBLINGS] },
    cleanPack: { delivery: "manifest", include: [SIBLINGS] },
    titleCollision: {
      delivery: "manifest",
      include: [{ ...SIBLINGS, title: `<<<ADEV-PACK-T>>> title="pwned"` }],
    },
  };
}

function ctxFor(repo, target = TARGET) {
  return { repoRoot: repo, targetSpecPath: target };
}

/** Repo whose charter dir holds one hostile sibling plus one ordinary one. */
function hostileRepo(...names) {
  const repo = tmp();
  writeFixture(repo, TARGET, "# Target\n");
  writeFixture(repo, "specs/review/ordinary.spec.md", "# Ordinary\n");
  for (const name of names) writeFixture(repo, `specs/review/${name}`, "# Hostile\n");
  return repo;
}

function collisions(result) {
  return result.warnings.filter((w) => w.code === "CONTEXT_PACK_FENCE_COLLISION");
}

/**
 * Rev 4 replaced the legacy `=== rel ===` section delimiter with nonce fences,
 * so a file NAME containing that delimiter has nothing left to forge. A forged
 * section would have to appear as a line that is itself a bare `=== … ===`.
 */
function forgedByLegacyDelimiter(rendered) {
  return /^=== .* ===$/m.test(rendered);
}

describe("context-pack manifest path safety (BEH-14)", () => {
  test("a file NAME carrying a literal fence prefix cannot forge a fence in the body", () => {
    const repo = hostileRepo(OPEN_FENCE_NAME);
    const r = renderPack("manifestPack", packs(), ctxFor(repo));
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));

    const sections = parseSections(r.rendered, r.nonce);
    assert.equal(sections.length, 1, "one include → exactly one section, none forged");
    assert.ok(sections[0].body.includes(SAFE_PREFIX), "neutralized form must be present");
    assert.ok(!sections[0].body.includes(RAW_PREFIX), "raw fence prefix must be absent");
    // The rest of the path survives verbatim — neutralization is targeted, not lossy.
    assert.ok(sections[0].body.includes("specs/review/ordinary.spec.md"));
  });

  test("the collision warning names the offending PATH, not just the section", () => {
    const repo = hostileRepo(OPEN_FENCE_NAME);
    const r = renderPack("manifestPack", packs(), ctxFor(repo));

    const w = collisions(r);
    assert.equal(w.length, 1, JSON.stringify(r.warnings));
    assert.match(w[0].message, /ADEV-PACK/);
    // The message must carry the specific path, so an operator can find the file.
    const named = neutralizeFenceTokens(`specs/review/${OPEN_FENCE_NAME}`).body;
    assert.ok(
      w[0].message.includes(named),
      `warning must name the path; got: ${w[0].message}`,
    );
    assert.ok(!w[0].message.includes(RAW_PREFIX), "the warning must not re-emit a raw fence token");
  });

  test("one warning per offending path when several collide", () => {
    const repo = hostileRepo(OPEN_FENCE_NAME, CLOSE_FENCE_NAME);
    const r = renderPack("manifestPack", packs(), ctxFor(repo));

    const w = collisions(r);
    assert.equal(w.length, 2, "the contract is one warning per path, not one per section");
    const named = w.map((x) => x.message).join("\n");
    assert.ok(named.includes(neutralizeFenceTokens(`specs/review/${OPEN_FENCE_NAME}`).body));
    assert.ok(named.includes(neutralizeFenceTokens(`specs/review/${CLOSE_FENCE_NAME}`).body));
  });

  test("the legacy `=== rel ===` delimiter in a filename is inert", () => {
    const repo = hostileRepo(LEGACY_NAME);
    const r = renderPack("manifestPack", packs(), ctxFor(repo));

    assert.equal(forgedByLegacyDelimiter(r.rendered), false);
    assert.equal(collisions(r).length, 0, "the legacy delimiter is not a fence token");
    const sections = parseSections(r.rendered, r.nonce);
    assert.equal(sections.length, 1);
    // It still appears — inside the fence naming its real source, mid-line.
    assert.ok(sections[0].body.includes(LEGACY_NAME));
  });

  test("clean paths emit no collision warning at all", () => {
    const repo = tmp();
    writeFixture(repo, TARGET, "# Target\n");
    writeFixture(repo, "specs/review/a.spec.md", "# A\n");
    writeFixture(repo, "specs/review/b.spec.md", "# B\n");
    const r = renderPack("cleanPack", packs(), ctxFor(repo));
    assert.equal(collisions(r).length, 0);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  });

  test("a fence prefix in a declared TITLE is neutralized in the emitted header", () => {
    const repo = tmp();
    writeFixture(repo, TARGET, "# Target\n");
    writeFixture(repo, "specs/review/a.spec.md", "# A\n");
    const r = renderPack("titleCollision", packs(), ctxFor(repo));

    const sections = parseSections(r.rendered, r.nonce);
    assert.equal(sections.length, 1);
    assert.ok(sections[0].header.includes(SAFE_PREFIX), "title must be neutralized in the header");
    assert.ok(
      !sections[0].header.includes(RAW_PREFIX),
      "a raw fence prefix must never reach the header",
    );
    // The ONLY occurrences of the raw prefix in the whole render are the render's
    // own legitimate opening fences — one per section, each bearing this nonce.
    assert.equal(
      r.rendered.split(RAW_PREFIX).length - 1,
      sections.length,
      "the only raw prefixes may be the render's own opening fences",
    );
    assert.equal(r.rendered.split(`${RAW_PREFIX}${r.nonce} `).length - 1, sections.length);
    // Contract, stated deliberately: the collision WARNING is per-path. A title is
    // not a path, so a neutralized title is silent — BEH-14 asks for a warning
    // "naming the path", and there is no path to name here.
    assert.equal(collisions(r).length, 0);
  });

  test("files[] keeps the real on-disk path while the render carries the neutralized one", () => {
    const repo = hostileRepo(OPEN_FENCE_NAME);
    const r = renderPack("manifestPack", packs(), ctxFor(repo));
    // Deliberate asymmetry: `files[]` is a machine-readable list of paths a
    // reviewer will actually open, so neutralizing it would hand back a path that
    // does not exist. Only the RENDERED text is sanitized.
    assert.ok(r.files.includes(`specs/review/${OPEN_FENCE_NAME}`));
    assert.ok(!r.rendered.includes(`specs/review/${OPEN_FENCE_NAME}`));
  });

  test("KNOWN GAP (adev-plugin-j7pq.7 / SEC-1): a charter dir named `x\">>>` still escapes the title attribute", () => {
    // Asserted as CURRENT behavior on purpose. `attrs` is interpolated raw at
    // every `fenceBlock` call site, so a `"` in an attribute value closes it
    // early and the remainder lands in the header as attacker-chosen text.
    // When j7pq.7 escapes attribute values this assertion FAILS, which is the
    // signal to update this test deliberately rather than by accident.
    const repo = tmp();
    const hostileDir = 'specs/x">>>';
    writeFixture(repo, `${hostileDir}/target.spec.md`, "# Target\n");
    writeFixture(repo, `${hostileDir}/one.spec.md`, "# One\n");

    // No declared title, so the header title falls back to the EXPANDED glob,
    // which carries the hostile directory name.
    const p = {
      escaped: {
        delivery: "manifest",
        include: [{ glob: "<charter-dir>/*.spec.md", exclude: ["<target-spec>"] }],
      },
    };
    const r = renderPack("escaped", p, ctxFor(repo, `${hostileDir}/target.spec.md`));
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));

    const sections = parseSections(r.rendered, r.nonce);
    assert.equal(sections.length, 1);
    // TODAY: the raw `">>>` reaches the header verbatim...
    assert.ok(
      sections[0].header.includes('title="specs/x">>>'),
      `header should still carry the raw escape today; got: ${sections[0].header}`,
    );
    // ...and the parsed attribute is therefore TRUNCATED at the injected quote,
    // which is exactly what "the attribute is escapable" means.
    assert.equal(sections[0].attrs.title, "specs/x");
    assert.notEqual(sections[0].attrs.title, 'specs/x">>>/*.spec.md');
  });
});
