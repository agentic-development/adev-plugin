/**
 * `PROFILE_CANNOT_CONSUME_MANIFEST` — rev 5 Error Cases delta of
 * `.context-index/specs/features/review/configurable-reviewers-rev-5-path-manifest-context-packs.spec.md`.
 *
 * A reviewer whose resolved context pack declares `delivery: manifest` receives
 * PATHS instead of file bodies. If its profile does not grant `filesystem-read`
 * and `search`, it cannot open a single path it is handed — so the reviewer is
 * rejected at LOAD (an error, never a warning), rather than dispatched with a
 * list it cannot consume.
 *
 * NOTE ON FIXTURES: this check is UNREACHABLE with bundled configuration.
 * `templates/governance/profiles.yaml`'s `read-only` grants BOTH
 * `filesystem-read` and `search`, and all three bundled reviewer profiles
 * (`reviewer-fast` / `reviewer-capable` / `reviewer-reasoning`) extend it — which
 * is exactly what the rev-5 Preconditions delta records. Every negative case
 * below therefore has to construct a CUSTOM PROFILE in a project-level
 * `.context-index/profiles.yaml`; the shipped file cannot exercise this path.
 *
 * The custom profiles are deliberately built to stay read-only-COMPATIBLE (deny
 * filesystem write/execute, deny network, no literal tools, no `filesystem-write`
 * or `shell` category) so that the PRE-EXISTING `REVIEWER_PROFILE_POSTURE` check
 * admits them and the new check is the one that actually fires. Each negative
 * case asserts the absence of `REVIEWER_PROFILE_POSTURE` for that reason.
 */

import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import { loadReviewConfig } from "../../lib/governance/review-config.mjs";
import { stampMarker } from "../../lib/governance/registry-marker.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const CODE = "PROFILE_CANNOT_CONSUME_MANIFEST";

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
 * `review.yaml` is a MARKED registry — `loadReviewConfig` fails closed with
 * `REGISTRY_NOT_MATERIALIZED` on a file carrying no `materialized_at:` marker.
 * Every fixture here is about profile/pack compatibility, not materialization,
 * so each is seeded already-materialized.
 */
function writeReview(repo, body) {
  writeFixture(
    repo,
    ".context-index/governance/review.yaml",
    stampMarker(body, "2026-08-15T00:00:00Z"),
  );
}

/**
 * Project profile overlay.
 *
 * `no-read-no-search` grants neither capability; `no-search` grants
 * `filesystem-read` only; `no-read` grants `search` only. All three are
 * read-only-compatible.
 */
function writeProfiles(repo) {
  writeFixture(
    repo,
    ".context-index/profiles.yaml",
    `profiles:
  no-read-no-search:
    description: "Read-only compatible, but grants neither filesystem-read nor search."
    permissions:
      tools:
        allow:
          - { category: agent }
      filesystem: { write: deny, execute: deny }
      network: deny
  no-search:
    description: "Read-only compatible, can read files but cannot search for them."
    permissions:
      tools:
        allow:
          - { category: filesystem-read }
          - { category: agent }
      filesystem: { write: deny, execute: deny }
      network: deny
  no-read:
    description: "Read-only compatible, can search but cannot read."
    permissions:
      tools:
        allow:
          - { category: search }
          - { category: agent }
      filesystem: { write: deny, execute: deny }
      network: deny
`,
  );
}

const PROMPT = "plugin:review-specs/security-reviewer-prompt.md";

/**
 * Packs shared by the fixtures below:
 *   - `manifest-pack`  declares `delivery: manifest` directly
 *   - `inline-pack`    declares nothing, so it resolves to the `inline` default
 *   - `manifest-child` declares nothing but INHERITS `manifest` from its parent
 */
const PACKS = `context_packs:
  manifest-pack:
    delivery: manifest
    include:
      - "docs/*.md"
  inline-pack:
    include:
      - "docs/*.md"
  manifest-parent:
    delivery: manifest
    include:
      - "docs/*.md"
  manifest-child:
    extends: manifest-parent
    include:
      - "docs/*.md"
`;

function reviewer(id, profile, pack) {
  return `  - id: ${id}
    name: "${id}"
    dispatch: always
    prompt: ${PROMPT}
    profile: ${profile}
    context_pack: ${pack}
    severity_cap: blocker
`;
}

function build(repo, reviewerRows) {
  writeProfiles(repo);
  writeReview(repo, `reviewers:\n${reviewerRows}${PACKS}`);
  return loadReviewConfig(repo);
}

function findings(issues) {
  return issues.filter((i) => i.code === CODE);
}

describe("PROFILE_CANNOT_CONSUME_MANIFEST", () => {
  test("a profile without filesystem-read is rejected at LOAD, not at dispatch", () => {
    const repo = tmp();
    const cfg = build(repo, reviewer("no-read-reviewer", "no-read-no-search", "manifest-pack"));

    const e = cfg.errors.find((x) => x.code === CODE);
    assert.ok(e, `expected ${CODE}; got ${JSON.stringify(cfg.errors, null, 2)}`);
    assert.match(e.message, /no-read-reviewer/); // names the reviewer
    assert.match(e.message, /no-read-no-search/); // names the profile
    assert.match(e.message, /filesystem-read/); // names the missing capability
    assert.match(e.message, /manifest-pack/); // names the pack that forced it

    // The finding is an ERROR, never a warning.
    assert.equal(findings(cfg.warnings).length, 0, "must not be reported as a warning");

    // The fixture genuinely reached the NEW check: the pre-existing read-only
    // posture check admitted this profile rather than eliminating the reviewer
    // before the pack's delivery mode was known.
    assert.ok(
      !cfg.errors.some((x) => x.code === "REVIEWER_PROFILE_POSTURE"),
      "fixture profile must be read-only-compatible so the new check is what fires",
    );

    // Rejected means gone: a reviewer that cannot read the paths it would be
    // handed must not remain dispatchable.
    assert.equal(cfg.reviewers.find((r) => r.id === "no-read-reviewer"), undefined);
  });

  test("the same profile with an INLINE pack loads fine — the check is delivery-conditional", () => {
    const repo = tmp();
    const cfg = build(repo, reviewer("inline-reviewer", "no-read-no-search", "inline-pack"));
    assert.equal(findings(cfg.errors).length, 0, JSON.stringify(cfg.errors, null, 2));
    assert.ok(cfg.reviewers.find((r) => r.id === "inline-reviewer"));
  });

  test("missing `search` alone also trips it", () => {
    const repo = tmp();
    const cfg = build(repo, reviewer("no-search-reviewer", "no-search", "manifest-pack"));
    const hits = findings(cfg.errors);
    assert.equal(hits.length, 1, JSON.stringify(cfg.errors, null, 2));
    assert.match(hits[0].message, /search/);
    assert.ok(
      !cfg.errors.some((x) => x.code === "REVIEWER_PROFILE_POSTURE"),
      "fixture profile must be read-only-compatible so the new check is what fires",
    );
  });

  test("missing `filesystem-read` alone also trips it", () => {
    const repo = tmp();
    const cfg = build(repo, reviewer("read-less-reviewer", "no-read", "manifest-pack"));
    const hits = findings(cfg.errors);
    assert.equal(hits.length, 1, JSON.stringify(cfg.errors, null, 2));
    assert.match(hits[0].message, /filesystem-read/);
  });

  test("a pack that INHERITS `delivery: manifest` from an ancestor trips it too", () => {
    // Proves the check reads the RESOLVED delivery, not `packs[name].delivery`:
    // `manifest-child` declares no `delivery` of its own.
    const repo = tmp();
    const cfg = build(repo, reviewer("inherited-reviewer", "no-read-no-search", "manifest-child"));
    const hits = findings(cfg.errors);
    assert.equal(hits.length, 1, JSON.stringify(cfg.errors, null, 2));
    assert.match(hits[0].message, /manifest-child/);
  });

  test("a DISABLED reviewer never trips it", () => {
    // A disabled reviewer never dispatches, so it must not fail the load —
    // matching the existing reasoning that switched-off rows are retained and
    // refused by `shouldDispatch` instead.
    const repo = tmp();
    writeProfiles(repo);
    writeReview(
      repo,
      `reviewers:
  - id: off-reviewer
    enabled: false
    disabled_reason: 'switched off'
    profile: no-read-no-search
    context_pack: manifest-pack
${PACKS}`,
    );
    const cfg = loadReviewConfig(repo);
    assert.equal(findings(cfg.errors).length, 0, JSON.stringify(cfg.errors, null, 2));
  });

  test("a reviewer whose context_pack does not resolve gets no spurious finding", () => {
    // An unresolvable pack has NO determined delivery mode, so this check must
    // decline to fire. The pack's own `UNKNOWN_CONTEXT_PACK` error is raised
    // where the pack is resolved for rendering (`renderPack`), not by this
    // loader — so the point asserted here is strictly the ABSENCE of a second,
    // spurious finding stacked on top of it.
    const repo = tmp();
    const cfg = build(repo, reviewer("ghost-pack-reviewer", "no-read-no-search", "nope-not-a-pack"));
    assert.equal(findings(cfg.errors).length, 0, JSON.stringify(cfg.errors, null, 2));
    assert.equal(findings(cfg.warnings).length, 0);
  });

  test("error ordering for pre-existing codes is unchanged", () => {
    // The whole reason the new check runs as a SECOND pass after `mergePacks`:
    // it must not reorder which errors surface first. The bad-severity_cap row
    // is declared FIRST and its pre-existing error must still come first.
    const repo = tmp();
    writeProfiles(repo);
    writeReview(
      repo,
      `reviewers:
  - id: bad-cap-reviewer
    name: "bad-cap-reviewer"
    dispatch: always
    prompt: ${PROMPT}
    profile: reviewer-capable
    context_pack: inline-pack
    severity_cap: nonsense
${reviewer("no-read-reviewer", "no-read-no-search", "manifest-pack")}${PACKS}`,
    );
    const cfg = loadReviewConfig(repo);
    const codes = cfg.errors.map((e) => e.code);
    assert.ok(codes.includes("REVIEWER_SEVERITY_CAP"), JSON.stringify(codes));
    assert.ok(codes.includes(CODE), JSON.stringify(codes));
    assert.ok(
      codes.indexOf("REVIEWER_SEVERITY_CAP") < codes.indexOf(CODE),
      `pre-existing error must still surface first; got ${JSON.stringify(codes)}`,
    );
  });

  test("bundled reviewer profiles are clean even against a manifest pack", () => {
    // All three extend `read-only`, which grants BOTH `filesystem-read` and
    // `search` — this is why the check is unreachable without a custom profile.
    const repo = tmp();
    writeReview(
      repo,
      `reviewers:
${reviewer("fast-reviewer", "reviewer-fast", "manifest-pack")}${reviewer("capable-reviewer", "reviewer-capable", "manifest-pack")}${reviewer("reasoning-reviewer", "reviewer-reasoning", "manifest-pack")}${PACKS}`,
    );
    const cfg = loadReviewConfig(repo);
    assert.equal(findings(cfg.errors).length, 0, JSON.stringify(cfg.errors, null, 2));
    assert.equal(cfg.reviewers.length, 3);
  });
});
