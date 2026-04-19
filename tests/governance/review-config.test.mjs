import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import {
  loadReviewConfig,
  shouldDispatch,
  applySeverityCap,
  computeVerdict,
} from "../../lib/governance/review-config.mjs";
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

function hasCode(issues, code) {
  return issues.some((i) => i.code === code);
}

describe("review-config loadReviewConfig", () => {
  test("zero-config returns the three bundled reviewers", () => {
    const repo = tmp();
    writeFixture(repo, ".context-index/.keep", "");
    const r = loadReviewConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    const ids = r.reviewers.map((x) => x.id).sort();
    assert.deepEqual(ids, ["consistency-analyzer", "security-reviewer", "structural-architect"]);
    const sec = r.reviewers.find((x) => x.id === "security-reviewer");
    assert.equal(sec.profile, "reviewer-capable");
    assert.equal(sec.mode, "subagent");
    assert.ok(sec.promptPath.endsWith("security-reviewer-prompt.md"));
  });

  test("enabled: false excludes a reviewer", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/review.yaml",
      `reviewers:
  - id: consistency-analyzer
    enabled: false
`
    );
    const r = loadReviewConfig(repo);
    assert.equal(r.errors.length, 0);
    const ids = r.reviewers.map((x) => x.id);
    assert.ok(!ids.includes("consistency-analyzer"));
  });

  test("reviewer referencing implementer profile fails load (Behavior 11a)", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/review.yaml",
      `reviewers:
  - id: security-reviewer
    profile: implementer
`
    );
    const r = loadReviewConfig(repo);
    assert.ok(hasCode(r.errors, "REVIEWER_PROFILE_POSTURE"));
  });

  test("relative prompt path with '..' is rejected", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/review.yaml",
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
    writeFixture(
      repo,
      ".context-index/governance/review.yaml",
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
    writeFixture(
      repo,
      ".context-index/governance/review.yaml",
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
    writeFixture(
      repo,
      ".context-index/governance/review.yaml",
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
    writeFixture(
      repo,
      ".context-index/governance/review.yaml",
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

  test("bundled default override emits WARN", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/review.yaml",
      `reviewers:
  - id: security-reviewer
    severity_cap: warning
`
    );
    const r = loadReviewConfig(repo);
    assert.equal(r.errors.length, 0);
    assert.ok(hasCode(r.warnings, "BUNDLED_DEFAULT_OVERRIDE"));
    const sec = r.reviewers.find((x) => x.id === "security-reviewer");
    assert.equal(sec.severity_cap, "warning");
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
  test("PASS on zero findings or suggestions only", () => {
    assert.equal(computeVerdict([], {}), "PASS");
    assert.equal(computeVerdict([{ severity: "suggestion" }], {}), "PASS");
  });
  test("PASS_WITH_NOTES on warnings", () => {
    assert.equal(computeVerdict([{ severity: "warning" }], {}), "PASS_WITH_NOTES");
  });
  test("BLOCK on blocker when threshold is 1", () => {
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
