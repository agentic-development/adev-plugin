import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  loadValidateConfig,
  shouldSkipDueToFailFast,
} from "../../lib/governance/validate-config.mjs";
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

function hasCode(issues, code) {
  return issues.some((i) => i.code === code);
}

describe("validate-config loadValidateConfig", () => {
  test("project with scaffolded governance/validate.yaml returns the 12 checks in topological order", () => {
    // Post-refactor: zero-config means no file → MISSING_VALIDATE_CONFIG.
    // The "12 checks" path now requires a scaffolded file (as init does).
    // We simulate scaffolding by copying the software starter into the repo.
    const repo = tmp();
    const starterPath = join(PLUGIN_ROOT, "templates", "domains", "software", "validate.yaml");
    const starterBytes = readFileSync(starterPath, "utf8");
    writeFixture(repo, ".context-index/governance/validate.yaml", starterBytes);
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

  test("missing governance/validate.yaml throws MISSING_VALIDATE_CONFIG (Behavior 1)", () => {
    const repo = tmp();
    // No governance/validate.yaml written
    assert.throws(
      () => loadValidateConfig(repo),
      (err) => {
        return err.code === "MISSING_VALIDATE_CONFIG"
          && /No governance\/validate\.yaml found/.test(err.message)
          && /\/adev:init/.test(err.message);
      },
    );
  });

  test("id with path traversal fails load with INVALID_CHECK_ID (Behavior 0 / SEC-1)", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: ../../bad
    kind: observational
`
    );
    const r = loadValidateConfig(repo);
    assert.ok(
      hasCode(r.errors, "INVALID_CHECK_ID"),
      `expected INVALID_CHECK_ID; got: ${JSON.stringify(r.errors)}`
    );
  });

  test("id with spaces fails load with INVALID_CHECK_ID", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: with spaces
    kind: observational
`
    );
    const r = loadValidateConfig(repo);
    assert.ok(hasCode(r.errors, "INVALID_CHECK_ID"));
  });

  test("id with control characters fails load with INVALID_CHECK_ID; diagnostic strips them", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: "bad\\u001bid"
    kind: observational
`
    );
    const r = loadValidateConfig(repo);
    const err = r.errors.find((e) => e.code === "INVALID_CHECK_ID");
    assert.ok(err, `expected INVALID_CHECK_ID; got: ${JSON.stringify(r.errors)}`);
    // Diagnostic should NOT contain the raw ANSI escape
    assert.ok(!err.message.includes(""), "diagnostic must strip control chars");
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

  test("plugin:validate/checks/<id>.md URI resolves to plugin tree file", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.uses-plugin-uri
    kind: subagent-review
    profile: reviewer-capable
    prompt: plugin:validate/checks/validate.check-2-spec-compliance.md
`
    );
    const r = loadValidateConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    const check = r.checks.find((c) => c.id === "project.uses-plugin-uri");
    assert.ok(check, "check should be present");
    assert.ok(
      typeof check.resolvedPromptPath === "string",
      "resolvedPromptPath should be set"
    );
    assert.ok(
      check.resolvedPromptPath.includes("skills/validate/checks"),
      `resolvedPromptPath should point at plugin checks dir; got ${check.resolvedPromptPath}`
    );
  });

  test("plugin: URI to unknown check file fails with PROMPT_NOT_FOUND", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.missing-prompt-file
    kind: subagent-review
    profile: reviewer-capable
    prompt: plugin:validate/checks/validate.check-does-not-exist.md
`
    );
    const r = loadValidateConfig(repo);
    assert.ok(
      hasCode(r.errors, "PROMPT_NOT_FOUND"),
      `expected PROMPT_NOT_FOUND; got: ${JSON.stringify(r.errors)}`
    );
  });

  test("cross-plugin prompt URI (plugin:other:...) fails with PROMPT_CROSS_PLUGIN", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.cross-plugin
    kind: subagent-review
    profile: reviewer-capable
    prompt: "plugin:other:checks/foo.md"
`
    );
    const r = loadValidateConfig(repo);
    assert.ok(
      hasCode(r.errors, "PROMPT_CROSS_PLUGIN"),
      `expected PROMPT_CROSS_PLUGIN; got: ${JSON.stringify(r.errors)}`
    );
  });

  test("PROMPT_NOT_FOUND diagnostic emits sanitized + truncated URI (≤128 chars + allowlist-stripped)", () => {
    const repo = tmp();
    // Pad the file portion so the URI exceeds 128 chars before sanitization.
    const longSuffix = "a".repeat(200);
    writeFixture(
      repo,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: project.long-uri
    kind: subagent-review
    profile: reviewer-capable
    prompt: "plugin:validate/checks/validate.${longSuffix}.md"
`
    );
    const r = loadValidateConfig(repo);
    const err = r.errors.find((e) => e.code === "PROMPT_NOT_FOUND");
    assert.ok(err, "expected PROMPT_NOT_FOUND");
    // The displayed URI substring inside the message should be capped near 128 chars.
    // We check that the message length is bounded (well under the worst-case 200+char prompt).
    assert.ok(
      err.message.length < 300,
      `diagnostic should be bounded; length=${err.message.length}`
    );
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
