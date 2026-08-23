import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import { resolveExtends, renderPack } from "../../lib/governance/context-pack.mjs";
import { loadReviewConfig } from "../../lib/governance/review-config.mjs";
import { PLUGIN_ROOT } from "../helpers.mjs";

// BEH-1. Every assertion runs against the SHIPPED
// `templates/review-specs/defaults.yaml` as parsed by `loadReviewConfig` — a
// hand-written fixture pack would prove nothing, because the defect being
// guarded here is in the bundled file itself.
const REPO = PLUGIN_ROOT; // the plugin root IS this repository
const TARGET = ".context-index/specs/features/review/configurable-reviewers.spec.md";
const SIDECAR_RE = /\.(review|plan|validate|blockers)\.md$/;
const CROSS_CUTTING_PREFIX = ".context-index/specs/cross-cutting/";

/** Include entries are either a bare string glob or `{ glob, title, exclude }`. */
function normalizeGlob(entry) {
  return typeof entry === "string" ? entry : String(entry?.glob ?? "");
}

/**
 * Every file the rendered pack NAMES: the bodies it inlined plus the paths the
 * aggregate truncation notice lists as omitted at the byte cap. Counting only
 * `r.files` would conflate "the glob is too wide" with "the cap happened to
 * land here", which is a different concern.
 */
function namedFiles(rendered, files, nonce) {
  const noticeRe = new RegExp(
    `<<<ADEV-PACK-${nonce} role="truncation-notice">>>\\n([\\s\\S]*?)\\n<<<END-ADEV-PACK-${nonce}>>>`
  );
  const notice = rendered.match(noticeRe);
  if (!notice) return [...files];
  const omitted = notice[1].match(/Omitted: ([^\]]*)\]/);
  assert.ok(omitted, `truncation notice not interpolated: ${notice[1].slice(0, 120)}`);
  return [...files, ...omitted[1].split(", ").filter(Boolean)];
}

describe("bundled consistency pack glob (BEH-1)", () => {
  test("the cross-cutting include glob is spec-only", () => {
    const { contextPacks } = loadReviewConfig(REPO);
    const { includes } = resolveExtends("consistency", contextPacks);
    const crossCutting = includes.find((i) => normalizeGlob(i).includes("cross-cutting"));
    assert.ok(crossCutting, "consistency pack must carry a cross-cutting include");
    // RECURSIVE (`**`) is deliberate, and the `*.spec.md` suffix is what makes
    // it safe. The guard this test exists for is "spec-only, never a lifecycle
    // sidecar" — see assertion 3 — not "single directory level". A non-recursive
    // glob made `cross-cutting/completion-tokens/completion-tokens.spec.md`
    // unreachable at ANY budget, and on 2026-08-20 that produced a false
    // `blocker` finding: a reviewer was asked to verify a citation against a
    // spec that had never been delivered to it. Widening to `**` still matches
    // only `*.spec.md`, so the sidecars living in that same nested directory
    // (`.plan.md`, `.review.md`, `.validate.md`) remain excluded.
    assert.equal(
      normalizeGlob(crossCutting),
      ".context-index/specs/cross-cutting/**/*.spec.md"
    );
  });

  test("rendered against this repo, the pack names 19 cross-cutting specs, not 55 files", () => {
    // LIVE COUNT against this repository's own .context-index/specs/cross-cutting/.
    // 19 `*.spec.md` files: 18 at the top level plus
    // `completion-tokens/completion-tokens.spec.md` one level down. Everything
    // else there is a lifecycle sidecar that must never reach a reviewer
    // prompt (`.review.md`, `.plan.md`, `.validate.md`, `.blockers.md`), plus
    // a bare `lifecycle-gate-validation.md` and the nested `charter.md`.
    //
    // Raised 18 -> 19 on 2026-08-20 when the glob became recursive. The 19th
    // is a genuine spec that already existed; it was simply unreachable while
    // the glob was single-level.
    //
    // FUTURE CONTRIBUTOR: bump this when you add or remove a cross-cutting
    // *spec*. NEVER bump it because a sidecar appeared — a sidecar reaching
    // this count means the glob regressed, which is the bug this test exists
    // to catch.
    const { contextPacks } = loadReviewConfig(REPO);
    const r = renderPack("consistency", contextPacks, {
      repoRoot: REPO,
      targetSpecPath: TARGET,
    });
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
    const crossCuttingMatches = namedFiles(r.rendered, r.files, r.nonce).filter((f) =>
      f.startsWith(CROSS_CUTTING_PREFIX)
    );
    assert.equal(crossCuttingMatches.length, 19);
  });

  test("no lifecycle sidecar reaches any bundled pack", () => {
    const { contextPacks } = loadReviewConfig(REPO);
    for (const pack of ["base", "review-base", "architecture", "security", "consistency"]) {
      const r = renderPack(pack, contextPacks, {
        repoRoot: REPO,
        targetSpecPath: TARGET,
      });
      assert.equal(r.errors.length, 0, `${pack}: ${JSON.stringify(r.errors)}`);
      // "Reaches the prompt" is the same set assertion 2 counts: bodies inlined
      // PLUS the paths the truncation notice names. A sidecar omitted at the byte
      // cap still has its path rendered into the reviewer's context, so checking
      // only `r.files` would let one through in the omitted tail.
      const named = namedFiles(r.rendered, r.files, r.nonce);
      assert.ok(named.length > 0, `pack '${pack}' named no files — assertion would be vacuous`);
      for (const f of named) {
        assert.doesNotMatch(f, SIDECAR_RE, `pack '${pack}' pulled in sidecar '${f}'`);
      }
    }
  });
});
