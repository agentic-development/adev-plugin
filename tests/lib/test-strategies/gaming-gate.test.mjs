import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  isTestFile,
  isDetectorFixtureFile,
  isIntegrationTestFile,
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
