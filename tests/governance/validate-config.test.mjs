import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import {
  loadValidateConfig,
  shouldSkipDueToFailFast,
} from "../../lib/governance/validate-config.mjs";
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

describe("validate-config loadValidateConfig", () => {
  test("zero-config returns the 12 bundled checks in topological order", () => {
    const repo = tmp();
    const r = loadValidateConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    assert.equal(r.checks.length, 12);
    const ids = r.checks.map((c) => c.id);
    assert.ok(ids.includes("validate.check-1.5-source-manifest"));
    assert.ok(ids.includes("validate.check-11-visual-verification"));
    // check-1.5-source-manifest has no `after` → must appear before check-2
    const idx1_5 = ids.indexOf("validate.check-1.5-source-manifest");
    const idx2 = ids.indexOf("validate.check-2-spec-compliance");
    assert.ok(idx1_5 < idx2, "1.5 should run before check-2");
  });

  test("enabled: false surfaces as SKIPPED-DISABLED entry without running", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: validate.check-10-platform-drift
    enabled: false
`
    );
    const r = loadValidateConfig(repo);
    assert.equal(r.errors.length, 0);
    const disabled = r.checks.find((c) => c.id === "validate.check-10-platform-drift");
    assert.equal(disabled.enabled, false);
    assert.match(disabled.disabledNote, /skipped/);
  });

  test("project cannot register a deterministic-check", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.my-check
    kind: deterministic-check
`
    );
    const r = loadValidateConfig(repo);
    assert.ok(hasCode(r.errors, "DETERMINISTIC_PROJECT"));
  });

  test("quality-gate without explicit profile fails load", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.gate
    kind: quality-gate
    command: [npm, test]
`
    );
    const r = loadValidateConfig(repo);
    assert.ok(hasCode(r.errors, "QUALITY_GATE_PROFILE_MISSING"));
  });

  test("quality-gate with string command fails load", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.gate
    kind: quality-gate
    profile: read-only
    command: "npm test"
`
    );
    const r = loadValidateConfig(repo);
    assert.ok(hasCode(r.errors, "QUALITY_GATE_COMMAND_SHELL"));
  });

  test("quality-gate with interpolation in argv fails load", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.gate
    kind: quality-gate
    profile: read-only
    command: [npm, test, "{{ spec.slug }}"]
`
    );
    const r = loadValidateConfig(repo);
    assert.ok(hasCode(r.errors, "QUALITY_GATE_INTERPOLATION"));

    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.gate
    kind: quality-gate
    profile: read-only
    command: [npm, test, "$VAR_NAME"]
`
    );
    const r2 = loadValidateConfig(repo);
    assert.ok(hasCode(r2.errors, "QUALITY_GATE_INTERPOLATION"));

    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.gate
    kind: quality-gate
    profile: read-only
    command: [npm, test, "\${VAR}"]
`
    );
    const r3 = loadValidateConfig(repo);
    assert.ok(hasCode(r3.errors, "QUALITY_GATE_INTERPOLATION"));
  });

  test("quality-gate with valid argv + profile passes load", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.gate
    kind: quality-gate
    profile: read-only
    command: [npm, test, --, --silent]
`
    );
    const r = loadValidateConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    const gate = r.checks.find((c) => c.id === "project.gate");
    assert.ok(gate);
    assert.equal(gate.kind, "quality-gate");
  });

  test("observational with severity: error fails load", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.obs
    kind: observational
    severity: error
`
    );
    const r = loadValidateConfig(repo);
    assert.ok(hasCode(r.errors, "OBSERVATIONAL_ERROR_SEVERITY"));
  });

  test("project subagent-review with `after` runs after predecessor", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/skills/my-checker/prompt.md",
      "# prompt\n"
    );
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.my-post
    kind: subagent-review
    profile: reviewer-capable
    prompt: "skills/my-checker/prompt.md"
    after: [validate.check-2-spec-compliance]
`
    );
    const r = loadValidateConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    const ids = r.checks.map((c) => c.id);
    const idxParent = ids.indexOf("validate.check-2-spec-compliance");
    const idxChild = ids.indexOf("project.my-post");
    assert.ok(idxParent < idxChild, "child should follow parent");
  });

  test("cycles in `after` fail load", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.a
    kind: observational
    after: [project.b]
  - id: project.b
    kind: observational
    after: [project.a]
`
    );
    const r = loadValidateConfig(repo);
    assert.ok(hasCode(r.errors, "AFTER_CYCLE"));
  });

  test("subagent-review project entry without prompt fails load", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.no-prompt
    kind: subagent-review
`
    );
    const r = loadValidateConfig(repo);
    assert.ok(hasCode(r.errors, "SUBAGENT_PROMPT_REQUIRED"));
  });
});

describe("validate-config shouldSkipDueToFailFast", () => {
  test("skips when predecessor failed with fail_fast + severity error", () => {
    const prior = [
      { id: "parent", status: "FAIL", severity: "error", fail_fast: true },
    ];
    const r = shouldSkipDueToFailFast({ id: "child", after: ["parent"] }, prior);
    assert.equal(r.skip, true);
    assert.match(r.reason, /parent/);
  });

  test("does not skip if predecessor succeeded", () => {
    const prior = [
      { id: "parent", status: "PASS", severity: "error", fail_fast: true },
    ];
    const r = shouldSkipDueToFailFast({ id: "child", after: ["parent"] }, prior);
    assert.equal(r.skip, false);
  });

  test("does not skip without fail_fast on predecessor", () => {
    const prior = [
      { id: "parent", status: "FAIL", severity: "error", fail_fast: false },
    ];
    const r = shouldSkipDueToFailFast({ id: "child", after: ["parent"] }, prior);
    assert.equal(r.skip, false);
  });
});
