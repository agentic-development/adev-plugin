import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import {
  loadReviewConfig,
  shouldDispatch,
  applySeverityCap,
  computeVerdict,
  sanitizeAdapterOutput,
} from "../../lib/governance/review-config.mjs";
import { createRedactor } from "../../lib/profiles/redaction.mjs";
import { stampMarker } from "../../lib/governance/registry-marker.mjs";
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

/**
 * Fixture maintenance (Task 10): `review.yaml` is a MARKED registry, so
 * `loadReviewConfig` fails closed on a file with no `materialized_at` marker.
 * Every fixture below is about reviewer validation, path resolution, posture
 * and merge precedence — none is about materialization — so each is seeded
 * already-materialized, the state `adev governance materialize` leaves behind.
 * No assertion is relaxed; the guard just runs first. The zero-config test
 * writes no governance file at all, and absence is deliberately unguarded.
 */
function writeReview(repo, body) {
  writeFixture(
    repo,
    ".context-index/governance/review.yaml",
    stampMarker(body, "2026-08-15T00:00:00Z"),
  );
}

function hasCode(issues, code) {
  return issues.some((i) => i.code === code);
}

describe("review-config loadReviewConfig", () => {
  test("zero-config returns no reviewers — and still loads packs and verdict rules", () => {
    const repo = tmp();
    writeFixture(repo, ".context-index/.keep", "");
    const r = loadReviewConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    // Fixture maintenance (Task 11) — an INVERSION. This asserted the OLD
    // contract: that the three bundled reviewers were injected at run time into
    // a project that declares none. They are now adopted once, by
    // `adev governance materialize`, so a project with no review.yaml runs
    // nothing. The rest of the loader's zero-config behaviour is unchanged and
    // is asserted here so the inversion does not quietly widen into "the
    // zero-config path stopped working".
    assert.deepEqual(r.reviewers, []);
    assert.deepEqual(r.verdictRules, { blocker_threshold: 1 });
    assert.ok(r.contextPacks.base, "bundled context packs are still contributed");
  });

  test("a materialized project's own reviewers load and resolve", () => {
    const repo = tmp();
    writeReview(
      repo,
      `reviewers:
  - id: security-reviewer
    name: "Security Reviewer"
    dispatch: always
    prompt: plugin:review-specs/security-reviewer-prompt.md
    profile: reviewer-capable
    context_pack: base
    severity_cap: blocker
`
    );
    const r = loadReviewConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    const sec = r.reviewers.find((x) => x.id === "security-reviewer");
    assert.equal(sec.profile, "reviewer-capable");
    assert.equal(sec.mode, "subagent");
    assert.ok(sec.promptPath.endsWith("security-reviewer-prompt.md"));
  });

  test("enabled: false excludes a reviewer from dispatch, but not from the registry", () => {
    // Fixture maintenance (Task 13) — an INVERSION of the second assertion.
    // This asserted that a disabled reviewer was REMOVED, which made it
    // indistinguishable from a reviewer the project never declared — the exact
    // conflation `explicit-governance-registries.spec.md` Invariant 5 forbids.
    // The entry is now retained and marked; `shouldDispatch` is what excludes
    // it. Nothing is loosened: "does not run" is still asserted, now at the
    // gate that actually decides it.
    const repo = tmp();
    writeReview(
      repo,
      `reviewers:
  - id: consistency-analyzer
    enabled: false
    disabled_reason: 'superseded by the linter'
`
    );
    const r = loadReviewConfig(repo);
    assert.equal(r.errors.length, 0);
    const entry = r.reviewers.find((x) => x.id === "consistency-analyzer");
    assert.equal(entry.enabled, false);
    assert.equal(entry.disabled_reason, "superseded by the linter");
    assert.equal(
      shouldDispatch(entry, { targetSpecPath: "a/b.spec.md", specContent: "" }).dispatch,
      false,
    );
  });

  test("reviewer referencing implementer profile fails load (Behavior 11a)", () => {
    const repo = tmp();
    // Fixture maintenance (Task 11): the row used to be a PATCH over the
    // bundled `security-reviewer`, inheriting its `prompt`. With no run-time
    // bundled layer the project file must declare the whole reviewer — which is
    // the point of materialization — so the prompt moves into the fixture. The
    // assertion (an implementer-profile reviewer is refused) is untouched.
    writeReview(
      repo,
      `reviewers:
  - id: security-reviewer
    prompt: plugin:review-specs/security-reviewer-prompt.md
    profile: implementer
`
    );
    const r = loadReviewConfig(repo);
    assert.ok(hasCode(r.errors, "REVIEWER_PROFILE_POSTURE"));
  });

  test("relative prompt path with '..' is rejected", () => {
    const repo = tmp();
    writeReview(
      repo,
      `reviewers:
  - id: traversal-attempt
    dispatch: always
    prompt: "../../../etc/passwd"
`
    );
    const r = loadReviewConfig(repo);
    assert.ok(hasCode(r.errors, "PATH_DOT_DOT"));
  });

  test("cross-plugin prompt reference rejected with v2-deferral message", () => {
    const repo = tmp();
    writeReview(
      repo,
      `reviewers:
  - id: x
    dispatch: always
    prompt: "plugin:other-plugin:review/prompt.md"
`
    );
    const r = loadReviewConfig(repo);
    assert.ok(hasCode(r.errors, "CROSS_PLUGIN_REF"));
  });

  test("reviewer with both prompt and package fails load", () => {
    const repo = tmp();
    writeReview(
      repo,
      `reviewers:
  - id: hybrid
    dispatch: always
    prompt: "plugin:review-specs/structural-architect-prompt.md"
    package:
      skill: "plugin:review-specs/SKILL.md"
`
    );
    const r = loadReviewConfig(repo);
    assert.ok(hasCode(r.errors, "REVIEWER_MODE_CONFLICT"));
  });

  test("reviewer with neither prompt nor package fails load", () => {
    const repo = tmp();
    writeReview(
      repo,
      `reviewers:
  - id: empty
    dispatch: always
`
    );
    const r = loadReviewConfig(repo);
    assert.ok(hasCode(r.errors, "REVIEWER_MODE_MISSING"));
  });

  test("package-mode reviewer resolves skill + adapter paths", () => {
    const repo = tmp();
    // project-local skill: write a minimal SKILL.md
    writeFixture(
      repo,
      ".context-index/skills/my-reviewer/SKILL.md",
      "# Project skill\n"
    );
    writeReview(
      repo,
      `reviewers:
  - id: project-pkg
    dispatch: always
    package:
      skill: "skills/my-reviewer/SKILL.md"
`
    );
    const r = loadReviewConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    const pkg = r.reviewers.find((x) => x.id === "project-pkg");
    assert.equal(pkg.mode, "package");
    assert.ok(pkg.skillPath.includes("SKILL.md"));
    assert.ok(pkg.adapterPath.endsWith("generic.md"));
  });

  test("a partial row is no longer a patch over a bundled default", () => {
    const repo = tmp();
    // Fixture maintenance (Task 11) — an INVERSION. This asserted the OLD
    // contract: `- id: security-reviewer / severity_cap: warning` patched the
    // bundled entry field-by-field and emitted REVIEWER_OVERRIDE. There is no
    // entry to patch now, so the same row is an INCOMPLETE reviewer and the
    // loader says so — a louder failure than the silent partial merge it
    // replaces, not a weaker one.
    writeReview(
      repo,
      `reviewers:
  - id: security-reviewer
    severity_cap: warning
`
    );
    const r = loadReviewConfig(repo);
    assert.ok(hasCode(r.errors, "REVIEWER_MODE_MISSING"));
    assert.ok(!hasCode(r.warnings, "REVIEWER_OVERRIDE"));
  });

  test("REVIEWER_OVERRIDE now means a duplicate id inside the project's own file", () => {
    const repo = tmp();
    writeReview(
      repo,
      `reviewers:
  - id: dupe
    prompt: plugin:review-specs/security-reviewer-prompt.md
    severity_cap: blocker
  - id: dupe
    prompt: plugin:review-specs/security-reviewer-prompt.md
    severity_cap: warning
`
    );
    const r = loadReviewConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    assert.ok(hasCode(r.warnings, "REVIEWER_OVERRIDE"));
    assert.equal(r.reviewers.length, 1);
    assert.equal(r.reviewers[0].severity_cap, "warning", "the last entry wins");
  });

  test("manifest specialists are converted to triggered reviewers with deprecation note", () => {
    const repo = tmp();
    const manifest = {
      specialists: [
        { id: "my-specialist", trigger_patterns: ["**/foo.md"], trigger_keywords: ["widget"], prompt: "plugin:review-specs/structural-architect-prompt.md" },
      ],
    };
    const r = loadReviewConfig(repo, { manifest });
    assert.equal(r.errors.length, 0);
    assert.ok(r.notes.some((n) => n.includes("manifest.yaml:specialists is deprecated")));
    const spec = r.reviewers.find((x) => x.id === "my-specialist");
    assert.ok(spec);
    assert.ok(spec.dispatch?.triggered);
  });

  test("a materialized domain reviewer runs on the project file's own terms", () => {
    const repo = tmp();
    // Fixture maintenance (Task 11) — an INVERSION of the two tests that used
    // to sit here ("domainReviewers replaces bundled defaults as base" and
    // "domainReviewers + governance overlay merges correctly"). Both asserted
    // the OLD contract: that a domain overlay handed to `loadReviewConfig`
    // formed the base and the project file patched it field-by-field. The
    // overlay is composed once now, by `adev governance materialize`, which
    // writes the WHOLE row into the project's file — so the state under test is
    // that written row, and it must load with its own declared fields and
    // nothing inherited from anywhere.
    writeReview(
      repo,
      `reviewers:
  - id: data-contract-reviewer
    name: "Data Contract Reviewer"
    dispatch: always
    prompt: "plugin:review-specs/structural-architect-prompt.md"
    profile: reviewer-capable
    severity_cap: warning
    source: domain:data-engineering
  - id: custom-project-reviewer
    dispatch: always
    prompt: "plugin:review-specs/structural-architect-prompt.md"
    profile: reviewer-capable
`
    );
    const r = loadReviewConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    const ids = r.reviewers.map((x) => x.id).sort();
    assert.deepEqual(ids, ["custom-project-reviewer", "data-contract-reviewer"]);
    const dcr = r.reviewers.find((x) => x.id === "data-contract-reviewer");
    assert.equal(dcr.severity_cap, "warning");
    assert.equal(
      dcr.source,
      "domain:data-engineering",
      "the row still records where it originated, even though nothing re-derives it",
    );
    assert.ok(!ids.includes("structural-architect"), "bundled defaults are never contributed");
  });
});

// ─── Task 11: the run-time overlays are gone ────────────────────────────────
//
// The reviewer set is read from the materialized project file ALONE. Neither
// the bundled defaults nor a domain overlay contributes at run time; adoption
// happens once, through `adev governance materialize`, and drift is surfaced by
// hygiene Pass 19 rather than silently merged back in on every load.

/** A full, self-sufficient reviewer row — the shape materialization writes. */
function reviewerRow(id, extra = "") {
  return (
    `  - id: ${id}\n` +
    `    name: "${id}"\n` +
    `    dispatch: always\n` +
    `    prompt: "plugin:review-specs/structural-architect-prompt.md"\n` +
    `    profile: reviewer-capable\n` +
    extra
  );
}

/** A domain reviewers overlay, as `adev domain load-reviewers` would emit it. */
function domainOverlay(ids) {
  return {
    merge_strategy: "append",
    reviewers: ids.map((id) => ({
      id,
      name: id,
      dispatch: "always",
      prompt: "plugin:review-specs/structural-architect-prompt.md",
      profile: "reviewer-capable",
    })),
  };
}

describe("review-config run-time overlays (Task 11)", () => {
  test("a domain-only reviewer no longer appears at run time", () => {
    const repo = tmp();
    // The materialized state: the domain's reviewer was adopted into the
    // project's own file, so it runs because the FILE says so.
    writeReview(repo, `reviewers:\n${reviewerRow("domain-only")}`);

    // The domain later grows a second reviewer. Nothing adopted it.
    const r = loadReviewConfig(repo, {
      domainReviewers: domainOverlay(["domain-only", "added-later"]),
    });

    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    const ids = r.reviewers.map((x) => x.id);
    assert.ok(ids.includes("domain-only"));
    assert.ok(
      !ids.includes("added-later"),
      "run-time overlay is gone; adoption is via `adev governance materialize` / hygiene",
    );
  });

  test("a domain reviewer that was never materialized does not appear at all", () => {
    const repo = tmp();
    writeFixture(repo, ".context-index/.keep", "");

    const r = loadReviewConfig(repo, { domainReviewers: domainOverlay(["never-adopted"]) });

    assert.deepEqual(
      r.reviewers.map((x) => x.id),
      [],
      "fail-closed consequence: an un-materialized project runs no reviewers, " +
        "which is exactly why hygiene Pass 19 exists",
    );
  });

  test("bundled defaults are not contributed at run time either", () => {
    const repo = tmp();
    writeReview(repo, `reviewers:\n${reviewerRow("project-only")}`);

    const ids = loadReviewConfig(repo).reviewers.map((x) => x.id).sort();

    assert.deepEqual(ids, ["project-only"]);
  });

  test("every entry still carries provenance", () => {
    const repo = tmp();
    writeReview(
      repo,
      `reviewers:\n${reviewerRow("declared", "    source: domain:acme\n")}${reviewerRow("plain")}`,
    );

    const r = loadReviewConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    for (const entry of r.reviewers) {
      assert.equal(typeof entry.__source, "string", `${entry.id} lost __source`);
    }
    assert.equal(
      r.reviewers.find((x) => x.id === "declared").source,
      "domain:acme",
      "a declared `source` is the entry's recorded origin and must survive the load",
    );
  });

  test("an unmarked registry still raises REGISTRY_NOT_MATERIALIZED", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/review.yaml",
      `reviewers:\n${reviewerRow("unmarked")}`,
    );

    assert.throws(
      () => loadReviewConfig(repo),
      (err) => err.code === "REGISTRY_NOT_MATERIALIZED",
    );
  });
});

describe("review-config shouldDispatch", () => {
  test("always dispatches", () => {
    const r = shouldDispatch({ dispatch: "always" }, { targetSpecPath: "a.md", specContent: "" });
    assert.equal(r.dispatch, true);
  });

  test("never skips", () => {
    const r = shouldDispatch({ dispatch: "never" }, { targetSpecPath: "a.md", specContent: "" });
    assert.equal(r.dispatch, false);
  });

  test("triggered dispatches on pattern match", () => {
    const r = shouldDispatch(
      { dispatch: { triggered: { patterns: ["specs/features/**/*.md"], keywords: [], min_score: 1 } } },
      { targetSpecPath: "specs/features/auth/login.md", specContent: "" }
    );
    assert.equal(r.dispatch, true);
  });

  test("triggered dispatches on keyword match", () => {
    const r = shouldDispatch(
      { dispatch: { triggered: { patterns: [], keywords: ["password"], min_score: 1 } } },
      { targetSpecPath: "x.md", specContent: "this spec handles password login" }
    );
    assert.equal(r.dispatch, true);
  });

  test("triggered skips below threshold", () => {
    const r = shouldDispatch(
      { dispatch: { triggered: { patterns: ["specs/other/**"], keywords: ["nope"], min_score: 2 } } },
      { targetSpecPath: "specs/features/x.md", specContent: "nothing" }
    );
    assert.equal(r.dispatch, false);
  });
});

describe("review-config applySeverityCap", () => {
  test("clamps blocker → warning", () => {
    const clamped = applySeverityCap(
      { severity: "blocker", message: "orig" },
      { severity_cap: "warning" }
    );
    assert.equal(clamped.severity, "warning");
    assert.match(clamped.message, /capped from blocker to warning/);
  });

  test("no clamp when under cap", () => {
    const clamped = applySeverityCap(
      { severity: "warning", message: "orig" },
      { severity_cap: "blocker" }
    );
    assert.equal(clamped.severity, "warning");
    assert.equal(clamped.message, "orig");
  });
});

describe("review-config computeVerdict", () => {
  test("PASS on zero findings or suggestions only (+2 more contract assertions)", () => {
    // PASS on zero findings or suggestions only
    assert.equal(computeVerdict([], {}), "PASS");
    assert.equal(computeVerdict([{ severity: "suggestion" }], {}), "PASS");

    // PASS_WITH_NOTES on warnings
    assert.equal(computeVerdict([{ severity: "warning" }], {}), "PASS_WITH_NOTES");

    // BLOCK on blocker when threshold is 1
    assert.equal(computeVerdict([{ severity: "blocker" }], {}), "BLOCK");
  });
  test("threshold > 1 requires more blockers", () => {
    const rules = { blocker_threshold: 2 };
    assert.equal(computeVerdict([{ severity: "blocker" }], rules), "PASS_WITH_NOTES");
    assert.equal(
      computeVerdict([{ severity: "blocker" }, { severity: "blocker" }], rules),
      "BLOCK"
    );
  });
});

describe("review-config sanitizeAdapterOutput (Behavior 33 fallback)", () => {
  test("redacts profile secrets before truncation", () => {
    const redactor = createRedactor({ API_TOKEN: "this-is-a-long-secret-value" });
    const raw = "runner said: this-is-a-long-secret-value in output";
    const r = sanitizeAdapterOutput(raw, { redactor });
    assert.match(r.visible, /<REDACTED:API_TOKEN>/);
    assert.ok(!r.visible.includes("this-is-a-long-secret-value"));
    assert.ok(!r.full.includes("this-is-a-long-secret-value"));
  });

  test("truncates visible output to 8192 bytes with tail marker; full retains post-redact bytes", () => {
    const redactor = createRedactor({});
    const big = "a".repeat(20_000);
    const r = sanitizeAdapterOutput(big, { redactor });
    assert.ok(r.visible.length < big.length);
    assert.match(r.visible, /truncated \d+ bytes of adapter output/);
    assert.equal(r.full.length, big.length);
  });

  test("normalizes absolute paths under contextIndexRoot / pluginRoot / homeDir", () => {
    const redactor = createRedactor({});
    const raw = [
      "config at /tmp/repo/.context-index/governance/review.yaml",
      "plugin file at /opt/adev-plugin/skills/review-specs/SKILL.md",
      "user cache at /home/alice/.cache/adev/state.json",
    ].join("\n");
    const r = sanitizeAdapterOutput(raw, {
      redactor,
      contextIndexRoot: "/tmp/repo/.context-index",
      pluginRoot: "/opt/adev-plugin",
      homeDir: "/home/alice",
    });
    assert.ok(!r.visible.includes("/tmp/repo/.context-index"));
    assert.ok(!r.visible.includes("/opt/adev-plugin"));
    assert.ok(!r.visible.includes("/home/alice"));
    assert.match(r.visible, /\.context-index\/governance\/review\.yaml/);
    assert.match(r.visible, /plugin:\/skills\/review-specs\/SKILL\.md/);
    assert.match(r.visible, /~\/\.cache\/adev\/state\.json/);
  });

  test("handles non-string / null input safely", () => {
    const redactor = createRedactor({});
    const r = sanitizeAdapterOutput(null, { redactor });
    assert.equal(typeof r.visible, "string");
    assert.equal(typeof r.full, "string");
  });
});
