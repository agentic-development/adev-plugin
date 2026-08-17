/**
 * BEH-11: denylist parity for manifest entries.
 *
 * Replacing file BODIES with file PATHS must change nothing about the denylist:
 * the rev-4 three-way split applies unchanged, reusing its existing codes and
 * adding NONE.
 *
 *   - a glob whose LITERAL pattern is denied            → fails load
 *   - a match arriving through a WILDCARD include       → skip + WARN, render on
 *   - a match arriving through an ENUMERATED include    → HARD ERROR
 *
 * The assertion that actually distinguishes manifest delivery from rev 4 is
 * "the denied path is never NAMED": under inline delivery a skip meant the
 * BODY never shipped, but under manifest delivery the path itself IS the
 * payload, so a skip must keep it out of both the render and `files[]`.
 *
 * This suite is deliberately test-only. The denylist filter runs in Pass 1,
 * before the manifest branch groups anything, so the three codes are already
 * delivery-agnostic — the point is to pin that down so a later refactor cannot
 * quietly re-source the manifest body from the PRE-filter match set.
 *
 * All three codes are reachable, and each is asserted positively.
 * `CONTEXT_PACK_DENYLIST_MATCH` is reached by an enumerated include carrying a
 * TRAILING SLASH: `expandGlob` normalizes separators (`split("/").filter(Boolean)`)
 * so the directory walk still finds the file, while `isDenied` is regex-anchored
 * on the RAW glob string and `/(^|\/)profiles\.yaml$/` cannot match through the
 * trailing `/`. The literal-glob check therefore passes and the resolved-path
 * check fires — no wildcard and no symlink required. Separately, a SYMLINK to a
 * denied file is silently unmatched, because `expandGlob` filters on lstat-based
 * `Dirent.isFile()`; that is asserted too, as its own distinct behavior.
 *
 * Two gaps are pinned below as executable markers asserting TODAY's behavior,
 * so the fixes force a deliberate update here rather than a silent one:
 *   - SEC-2 (adev-plugin-j7pq.7): a control character in a path component
 *     defeats the `(^|/)`-anchored denylist regexes, so BEH-11's closing claim
 *     "a denied path is never named in the manifest either" is NOT entailed.
 *   - Inherited rev-4 behavior (adev-plugin-j7pq.7): when the denied file was an
 *     include's ONLY match, `safe.length === 0` and a no-matches section is
 *     emitted whose HEADER carries the glob string — so the denied path IS
 *     named, and `rendered` is non-empty while `errors` is non-empty.
 */

import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, symlinkSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { renderPack } from "../../lib/governance/context-pack.mjs";
import { parseSections } from "./helpers/parse-pack-sections.mjs";
import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

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

/** Every denylist fixture in both delivery modes, so parity is asserted not assumed. */
function packs() {
  const deniedGlob = [".env*"];
  const wildcard = [{ glob: "conf/*.yaml", title: "Conf" }];
  const enumerated = ["conf/profiles.yaml"];
  return {
    deniedGlob: { delivery: "manifest", include: deniedGlob },
    deniedGlobInline: { delivery: "inline", include: deniedGlob },

    wildcardOverGovernance: { delivery: "manifest", include: wildcard },
    wildcardOverGovernanceInline: { delivery: "inline", include: wildcard },

    enumeratedDenied: { delivery: "manifest", include: enumerated },
    enumeratedDeniedInline: { delivery: "inline", include: enumerated },

    // Wildcard-free, but the trailing slash slips past the RAW-string denylist
    // check while `expandGlob` still resolves the file — the live route to
    // CONTEXT_PACK_DENYLIST_MATCH.
    trailingSlash: { delivery: "manifest", include: ["conf/profiles.yaml/"] },
    trailingSlashInline: { delivery: "inline", include: ["conf/profiles.yaml/"] },
    trailingSlashEnv: { delivery: "manifest", include: ["conf/.env/"] },
    doubleSlash: { delivery: "manifest", include: ["conf//profiles.yaml/"] },

    // A wildcard-free include pointing at a SYMLINK whose target is denylisted.
    enumeratedSymlink: { delivery: "manifest", include: ["conf/link.yaml"] },

    siblings: {
      delivery: "manifest",
      include: [{ glob: "<charter-dir>/*.spec.md", exclude: ["<target-spec>"], title: "Siblings" }],
    },
  };
}

/** A repo carrying a denylisted `profiles.yaml` next to an innocent sibling. */
function governanceRepo() {
  const repo = tmp();
  writeFixture(repo, TARGET, "# Target\n");
  writeFixture(repo, "conf/ok.yaml", "ok: true");
  writeFixture(repo, "conf/profiles.yaml", "secret: yes");
  // `.env` does not match `conf/*.yaml`, so it only participates in the
  // trailing-slash fixtures.
  writeFixture(repo, "conf/.env", "TOKEN=super-secret");
  return repo;
}

function ctxFor(repo) {
  return { repoRoot: repo, targetSpecPath: TARGET };
}

function codesOf(result) {
  return [...result.errors, ...result.warnings].map((x) => x.code);
}

function denylistCodesOf(result) {
  return codesOf(result).filter((c) => c.includes("DENYLIST"));
}

/** Union of every denylist code the fixture corpus actually emits at runtime. */
function allDenylistCodesEmitted(p, repo) {
  const names = [
    "deniedGlob",
    "deniedGlobInline",
    "wildcardOverGovernance",
    "wildcardOverGovernanceInline",
    "enumeratedDenied",
    "enumeratedDeniedInline",
    "trailingSlash",
    "trailingSlashInline",
    "trailingSlashEnv",
    "doubleSlash",
    "enumeratedSymlink",
  ];
  const seen = new Set();
  for (const name of names) {
    for (const code of denylistCodesOf(renderPack(name, p, ctxFor(repo)))) seen.add(code);
  }
  return [...seen];
}

describe("context-pack manifest denylist parity (BEH-11)", () => {
  test("(1) a glob whose LITERAL pattern is denied fails load", () => {
    const repo = governanceRepo();
    const r = renderPack("deniedGlob", packs(), ctxFor(repo));
    assert.equal(r.errors[0].code, "CONTEXT_PACK_DENYLIST");
    assert.equal(r.rendered, "");
    assert.deepEqual(r.files, []);
  });

  test("(2) a WILDCARD include sweeping up a denied file skips + warns, render continues", () => {
    const repo = governanceRepo();
    const wild = renderPack("wildcardOverGovernance", packs(), ctxFor(repo));

    assert.equal(wild.errors.length, 0, JSON.stringify(wild.errors));
    assert.ok(wild.warnings.some((w) => w.code === "CONTEXT_PACK_DENYLIST_SKIP"));
    assert.ok(wild.rendered.length > 0, "the render must continue past the skip");

    // The distinguishing claim for manifest delivery: the path is never NAMED.
    assert.ok(!wild.rendered.includes("profiles.yaml"), "denied path leaked into the manifest");
    assert.ok(!wild.rendered.includes("secret: yes"));
    assert.ok(!wild.files.some((f) => f.endsWith("profiles.yaml")), "denied path leaked into files[]");
    assert.deepEqual(wild.files, ["conf/ok.yaml"]);

    // The surviving sibling really is manifested, so the skip is surgical.
    const sections = parseSections(wild.rendered, wild.nonce);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].attrs.role, "path-manifest");
    assert.equal(sections[0].body, "conf/ok.yaml");
  });

  test("(3) an ENUMERATED include naming a denied file is a HARD ERROR", () => {
    const repo = governanceRepo();
    const r = renderPack("enumeratedDenied", packs(), ctxFor(repo));

    assert.ok(r.errors.length > 0, "naming a secret file directly must fail loudly");
    assert.equal(r.rendered, "");
    assert.deepEqual(r.files, []);
    // When the glob string ITSELF is denied, the literal-glob check fires first
    // and the code is CONTEXT_PACK_DENYLIST. Asserted exactly so a change to
    // which of the two errors wins has to be deliberate.
    assert.equal(r.errors[0].code, "CONTEXT_PACK_DENYLIST");
  });

  test("(3b) an ENUMERATED include whose RESOLVED path is denied is CONTEXT_PACK_DENYLIST_MATCH", () => {
    // The live route: a trailing slash defeats the raw-string denylist regexes
    // (`/(^|\/)profiles\.yaml$/` cannot match through the trailing `/`) while
    // `expandGlob`'s `split("/").filter(Boolean)` still resolves the file. No
    // wildcard, no symlink — so the resolved-path branch is genuinely reached and
    // the enumerated half of the severity split is asserted end to end.
    const repo = governanceRepo();
    const r = renderPack("trailingSlash", packs(), ctxFor(repo));

    assert.equal(r.errors[0].code, "CONTEXT_PACK_DENYLIST_MATCH");
    // The message names the RESOLVED path, not the glob it arrived through.
    assert.match(r.errors[0].message, /'conf\/profiles\.yaml'/);
    assert.deepEqual(r.files, [], "the denied file must never reach files[]");
    assert.ok(!r.rendered.includes("secret: yes"), "and its body must never ship");
    // Not a wildcard, so no skip-warning may be emitted for it.
    assert.deepEqual(denylistCodesOf(r), ["CONTEXT_PACK_DENYLIST_MATCH"]);
  });

  test("(3c) the same trailing-slash evasion reaches DENYLIST_MATCH for `.env` and for a doubled separator", () => {
    const repo = governanceRepo();
    const p = packs();
    const env = renderPack("trailingSlashEnv", p, ctxFor(repo));
    assert.equal(env.errors[0].code, "CONTEXT_PACK_DENYLIST_MATCH");
    assert.match(env.errors[0].message, /'conf\/\.env'/);
    assert.ok(!env.rendered.includes("TOKEN=super-secret"));
    assert.deepEqual(env.files, []);

    const dbl = renderPack("doubleSlash", p, ctxFor(repo));
    assert.equal(dbl.errors[0].code, "CONTEXT_PACK_DENYLIST_MATCH");
    assert.match(dbl.errors[0].message, /'conf\/profiles\.yaml'/);
    assert.deepEqual(dbl.files, []);
  });

  test("(4) the fixture corpus emits exactly the three existing denylist codes and no fourth", () => {
    const repo = governanceRepo();
    assert.deepEqual(allDenylistCodesEmitted(packs(), repo).sort(), [
      "CONTEXT_PACK_DENYLIST",
      "CONTEXT_PACK_DENYLIST_MATCH",
      "CONTEXT_PACK_DENYLIST_SKIP",
    ]);
  });

  test("(4b) the module DECLARES exactly three denylist codes and no others", () => {
    // Source-level, because BEH-11 forbids ADDING a code — not merely emitting
    // one. SEC-2's recommended `CONTEXT_PACK_UNSAFE_PATH` would trip this even
    // though no fixture would reach it, which is the point.
    const source = readFileSync(join(PLUGIN_ROOT, "lib/governance/context-pack.mjs"), "utf8");
    const declared = [...source.matchAll(/code: "([A-Z_]+)"/g)].map((m) => m[1]);
    const denylist = [...new Set(declared.filter((c) => c.includes("DENYLIST")))].sort();
    assert.deepEqual(denylist, [
      "CONTEXT_PACK_DENYLIST",
      "CONTEXT_PACK_DENYLIST_MATCH",
      "CONTEXT_PACK_DENYLIST_SKIP",
    ]);
    // And the module's whole code vocabulary is frozen for this amendment.
    assert.deepEqual([...new Set(declared)].sort(), [
      "CONTEXT_PACK_CYCLE",
      "CONTEXT_PACK_DENYLIST",
      "CONTEXT_PACK_DENYLIST_MATCH",
      "CONTEXT_PACK_DENYLIST_SKIP",
      "CONTEXT_PACK_ESCAPE",
      "CONTEXT_PACK_FENCE_COLLISION",
      "CONTEXT_PACK_NO_TARGET",
      "CONTEXT_PACK_OVERRIDE",
      "CONTEXT_PACK_READ",
      "CONTEXT_PACK_TRAVERSAL",
      "INVALID_PACK_DELIVERY",
      "UNKNOWN_CONTEXT_PACK",
    ]);
  });

  test("the enabled/severity split survives: wildcard is WARN-only, enumerated is ERROR-only", () => {
    const repo = governanceRepo();
    const p = packs();
    const wild = renderPack("wildcardOverGovernance", p, ctxFor(repo));
    const enumd = renderPack("enumeratedDenied", p, ctxFor(repo));

    assert.equal(wild.errors.length, 0);
    assert.deepEqual(denylistCodesOf(wild), ["CONTEXT_PACK_DENYLIST_SKIP"]);

    assert.equal(
      enumd.warnings.filter((w) => w.code.includes("DENYLIST")).length,
      0,
      "the enumerated case must not double-report as a warning",
    );
    assert.deepEqual(denylistCodesOf(enumd), ["CONTEXT_PACK_DENYLIST"]);
  });

  test("rev-4 inline behavior is retained VERBATIM for the same three fixtures", () => {
    const repo = governanceRepo();
    const p = packs();
    for (const [manifestName, inlineName] of [
      ["deniedGlob", "deniedGlobInline"],
      ["wildcardOverGovernance", "wildcardOverGovernanceInline"],
      ["enumeratedDenied", "enumeratedDeniedInline"],
    ]) {
      const m = renderPack(manifestName, p, ctxFor(repo));
      const i = renderPack(inlineName, p, ctxFor(repo));
      assert.deepEqual(
        m.errors.map((e) => e.code),
        i.errors.map((e) => e.code),
        `${manifestName} vs ${inlineName}: error codes must match`,
      );
      assert.deepEqual(
        denylistCodesOf(m),
        denylistCodesOf(i),
        `${manifestName} vs ${inlineName}: denylist codes and severities must match`,
      );
    }
    // Inline delivery still hides the BODY on a skip, exactly as rev 4 did.
    const inlineWild = renderPack("wildcardOverGovernanceInline", p, ctxFor(repo));
    assert.deepEqual(inlineWild.files, ["conf/ok.yaml"]);
    assert.ok(inlineWild.rendered.includes("ok: true"));
    assert.ok(!inlineWild.rendered.includes("secret: yes"));
  });

  test("a symlink to a denied file is silently unmatched — no error, and the target is never named", () => {
    // `expandGlob` filters on `Dirent.isFile()`, which is lstat-based, so a
    // symlink is never matched at all: the include resolves to nothing rather
    // than to its denied target. The outcome is SAFE, and it is asserted as its
    // own distinct behavior — this says nothing about whether
    // CONTEXT_PACK_DENYLIST_MATCH is reachable, which (3b) shows it is.
    const repo = governanceRepo();
    mkdirSync(join(repo, "vault"), { recursive: true });
    writeFileSync(join(repo, "vault", "profiles.yaml"), "secret: yes");
    symlinkSync(join(repo, "vault", "profiles.yaml"), join(repo, "conf", "link.yaml"));

    const r = renderPack("enumeratedSymlink", packs(), ctxFor(repo));
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
    assert.deepEqual(denylistCodesOf(r), []);
    assert.deepEqual(r.files, []);
    const sections = parseSections(r.rendered, r.nonce);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].body, "<no matches>");
    // The safety claim still holds regardless of which code would have fired.
    assert.ok(!r.rendered.includes("profiles.yaml"));
    assert.ok(!r.rendered.includes("secret: yes"));
  });

  test("KNOWN GAP (adev-plugin-j7pq.7): a DENYLIST_MATCH include still names the denied glob in its no-matches header", () => {
    // Inherited rev-4 behavior, NOT a rev-5 regression. When the denied file was
    // the include's only match, `safe.length === 0`, so a no-matches unit is
    // emitted carrying the glob string — under manifest delivery as
    // `title="conf/profiles.yaml/"`, under inline delivery as
    // `path="conf/profiles.yaml/"`, which is what rev 4 already did. So
    // `rendered` is non-empty even though `errors` is non-empty, and BEH-11's
    // closing claim "a denied path is never named in the manifest either" is not
    // entailed for this case. BEH-11 requires the split be retained verbatim and
    // forbids new codes, so the fix is j7pq.7's, not this amendment's.
    // Asserted as CURRENT behavior so the fix flips it deliberately.
    const repo = governanceRepo();
    const p = packs();

    const m = renderPack("trailingSlash", p, ctxFor(repo));
    assert.equal(m.errors[0].code, "CONTEXT_PACK_DENYLIST_MATCH");
    assert.ok(m.rendered.length > 0, "a hard error still emits a section today");
    const sections = parseSections(m.rendered, m.nonce);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].body, "<no matches>");
    assert.equal(sections[0].attrs.title, "conf/profiles.yaml/");
    assert.ok(m.rendered.includes("profiles.yaml"), "the denied path IS named, in the header");

    // The identical shape under inline delivery is the proof it is inherited.
    const i = renderPack("trailingSlashInline", p, ctxFor(repo));
    const inlineSections = parseSections(i.rendered, i.nonce);
    assert.equal(inlineSections[0].attrs.role, "no-matches");
    assert.equal(inlineSections[0].attrs.path, "conf/profiles.yaml/");
    // Neither mode ever ships the BODY, which is the guarantee that does hold.
    assert.ok(!m.rendered.includes("secret: yes"));
    assert.ok(!i.rendered.includes("secret: yes"));
  });

  test("KNOWN GAP (adev-plugin-j7pq.7 / SEC-2): a control character in a path component defeats the denylist and names a bare `.env`", () => {
    // LF is legal in a POSIX path component, passes `neutralizeFenceTokens`
    // untouched, and the denylist regexes anchor on `(^|/)` — so the embedded
    // `.env` is not preceded by a separator and is not denied. The single matched
    // path then renders as THREE manifest lines, the middle one a bare `.env`.
    // BEH-11's closing claim "a denied path is never named in the manifest
    // either" is therefore NOT entailed. Asserted as CURRENT behavior; the fix
    // (per-segment evaluation / control-character rejection) needs a new code,
    // which BEH-11 forbids this amendment from adding, so it is j7pq.7's.
    const repo = tmp();
    writeFixture(repo, TARGET, "# Target\n");
    const hostile = "a\n.env\nb.spec.md";
    writeFileSync(join(repo, "specs", "review", hostile), "# Hostile\n");

    const r = renderPack("siblings", packs(), ctxFor(repo));
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
    assert.deepEqual(denylistCodesOf(r), [], "the embedded .env is NOT denied today");
    assert.ok(r.files.includes(`specs/review/${hostile}`));

    const sections = parseSections(r.rendered, r.nonce);
    assert.equal(sections.length, 1);
    assert.match(sections[0].body, /^\.env$/m, "a bare `.env` line is produced today");
    assert.deepEqual(sections[0].body.split("\n"), ["specs/review/a", ".env", "b.spec.md"]);
  });
});
