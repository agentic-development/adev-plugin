import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  isTestFile,
  isDetectorFixtureFile,
  isIntegrationTestFile,
  runGamingDetectors,
  reconstructAfterContent,
  diffNewViolations,
} from "../../../lib/test-strategies/gaming-gate.mjs";

describe("isTestFile", () => {
  it("matches files under tests/", () => {
    assert.equal(isTestFile("tests/cli/context.test.mjs"), true);
  });
  it("matches provider-mirror tests dirs", () => {
    assert.equal(isTestFile("providers/codex/tests/foo.test.mjs"), true);
  });
  it("matches .spec.mjs suffix outside tests/", () => {
    assert.equal(isTestFile("src/widget.spec.mjs"), true);
  });
  it("rejects non-test source files", () => {
    assert.equal(isTestFile("lib/test-strategies/gaming.mjs"), false);
  });
});

describe("isDetectorFixtureFile", () => {
  it("matches the three known gaming-detector fixture files", () => {
    assert.equal(isDetectorFixtureFile("tests/lib/test-strategies/gaming.test.mjs"), true);
    assert.equal(isDetectorFixtureFile("tests/lib/test-strategies/integration-gaming.test.mjs"), true);
    assert.equal(isDetectorFixtureFile("tests/test-strategies/gaming-agent-skip.test.mjs"), true);
  });
  it("does not match an unrelated test file", () => {
    assert.equal(isDetectorFixtureFile("tests/cli/context.test.mjs"), false);
  });
});

describe("isIntegrationTestFile", () => {
  it("matches a path with an integration/ segment", () => {
    assert.equal(isIntegrationTestFile("tests/integration/adapter.test.mjs"), true);
  });
  it("matches a filename containing the integration token", () => {
    assert.equal(isIntegrationTestFile("tests/lib/test-strategies/integration-gaming.test.mjs"), true);
    assert.equal(isIntegrationTestFile("tests/hooks/lifecycle-gate-integration.test.mjs"), true);
  });
  it("does not match an ordinary unit test path", () => {
    assert.equal(isIntegrationTestFile("tests/cli/context.test.mjs"), false);
  });
});

describe("runGamingDetectors", () => {
  it("runs only the 4 shared detectors for a non-integration test file", () => {
    const content = "test('x', () => { it.skip('y', () => {}); });";
    const result = runGamingDetectors(content, "tests/cli/context.test.mjs");
    assert.ok(result.violations.some((v) => v.patternId === "DISABLED_TESTS"));
    assert.ok(!result.violations.some((v) => v.patternId === "CI_BYPASS"));
  });

  it("also runs the 4 integration detectors for an integration test file", () => {
    const content = "if (process.env.CI) { return; }";
    const result = runGamingDetectors(content, "tests/integration/adapter.test.mjs");
    assert.ok(result.violations.some((v) => v.patternId === "CI_BYPASS"));
  });

  it("has no file-size exemption — a violation in a 600KB file still detects", () => {
    const padding = "// x\n".repeat(150000); // > 500KB
    const content = padding + "\nit.skip('y', () => {});\n";
    const result = runGamingDetectors(content, "tests/cli/context.test.mjs");
    assert.ok(result.violations.some((v) => v.patternId === "DISABLED_TESTS"));
  });
});

describe("reconstructAfterContent", () => {
  it("Write: returns the tool's content field directly", () => {
    const after = reconstructAfterContent({ tool: "Write", before: "old", content: "new full content" });
    assert.equal(after, "new full content");
  });

  it("Edit: replaces the first occurrence of old_string with new_string", () => {
    const before = "a\nb\na\n";
    const after = reconstructAfterContent({ tool: "Edit", before, oldString: "a", newString: "X" });
    assert.equal(after, "X\nb\na\n");
  });

  it("Edit: returns null when old_string is not found (fail-open signal)", () => {
    const after = reconstructAfterContent({ tool: "Edit", before: "a\nb\n", oldString: "zzz", newString: "X" });
    assert.equal(after, null);
  });

  it("unknown tool: returns null (fail-open signal)", () => {
    const after = reconstructAfterContent({ tool: "NotebookEdit", before: "a" });
    assert.equal(after, null);
  });
});

describe("diffNewViolations", () => {
  it("reports a violation present in after but not before as new", () => {
    const before = "test('x', () => { assert.ok(true); });";
    const after = "test('x', () => { it.skip('y', () => {}); assert.ok(true); });";
    const result = diffNewViolations(before, after, "tests/cli/context.test.mjs");
    assert.ok(result.newViolations.some((v) => v.patternId === "DISABLED_TESTS"));
  });

  it("does not report a pre-existing violation left untouched as new", () => {
    const content = "it.skip('y', () => {});";
    const result = diffNewViolations(content, content, "tests/cli/context.test.mjs");
    assert.equal(result.newViolations.length, 0);
  });

  it("is insensitive to line-number shift from an unrelated earlier edit", () => {
    const before = "it.skip('y', () => {});";
    const after = "// unrelated new comment\nit.skip('y', () => {});";
    const result = diffNewViolations(before, after, "tests/cli/context.test.mjs");
    assert.equal(result.newViolations.length, 0);
  });
});
