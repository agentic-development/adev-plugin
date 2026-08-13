import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSuitePath } from "../../../lib/test-strategies/suite-path.mjs";

test("per-task granularity always proposes a new suite path", () => {
  const r = resolveSuitePath({ granularity: "per-task", behaviorSlug: "resolve-depth", existingSuites: ["tests/foo.test.mjs"] });
  assert.equal(r.action, "create");
});

test("per-behavior granularity reuses an existing suite covering the behavior", () => {
  const r = resolveSuitePath({
    granularity: "per-behavior", behaviorSlug: "resolve-depth",
    existingSuites: ["tests/lib/test-strategies/depth.test.mjs"],
    behaviorSuiteIndex: { "resolve-depth": "tests/lib/test-strategies/depth.test.mjs" },
  });
  assert.equal(r.action, "extend");
  assert.equal(r.path, "tests/lib/test-strategies/depth.test.mjs");
});

test("per-behavior granularity without a matching index entry creates a new suite", () => {
  const r = resolveSuitePath({
    granularity: "per-behavior", behaviorSlug: "resolve-granularity",
    existingSuites: ["tests/lib/test-strategies/depth.test.mjs"],
    behaviorSuiteIndex: { "resolve-depth": "tests/lib/test-strategies/depth.test.mjs" },
  });
  assert.equal(r.action, "create");
});

test("per-spec granularity proposes one suite for the whole spec", () => {
  const r = resolveSuitePath({ granularity: "per-spec", specSlug: "test-depth-policy", existingSuites: [] });
  assert.equal(r.action, "create");
  assert.match(r.path, /test-depth-policy/);
});

test("per-spec granularity extends an already-existing suite for the spec", () => {
  const r = resolveSuitePath({
    granularity: "per-spec", specSlug: "test-depth-policy",
    existingSuites: ["tests/specs/test-depth-policy.test.mjs"],
  });
  assert.equal(r.action, "extend");
  assert.equal(r.path, "tests/specs/test-depth-policy.test.mjs");
});

test("per-spec granularity does not treat a merely-substring-matching suite as covering the spec", () => {
  const r = resolveSuitePath({
    granularity: "per-spec", specSlug: "test-depth-policy",
    existingSuites: ["tests/specs/test-depth-policy-old.test.mjs"],
  });
  assert.equal(r.action, "create");
  assert.equal(r.path, "tests/specs/test-depth-policy.test.mjs");
});
