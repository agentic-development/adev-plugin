// tests/lib/parallel/config.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampMaxParallel, detectRerunCollision } from "../../../lib/parallel/config.mjs";

describe("clampMaxParallel", () => {
  it("returns the configured value when valid", () => {
    assert.equal(clampMaxParallel({ implement: { max_parallel: 8 } }), 8);
  });
  it("defaults to 4 when unset", () => {
    assert.equal(clampMaxParallel({}), 4);
    assert.equal(clampMaxParallel(null), 4);
    assert.equal(clampMaxParallel(undefined), 4);
  });
  it("floors 0, negative, and NaN to 1", () => {
    assert.equal(clampMaxParallel({ implement: { max_parallel: 0 } }), 1);
    assert.equal(clampMaxParallel({ implement: { max_parallel: -3 } }), 1);
    assert.equal(clampMaxParallel({ implement: { max_parallel: "nonsense" } }), 1);
  });
  it("floors fractional values down but not below 1", () => {
    assert.equal(clampMaxParallel({ implement: { max_parallel: 3.9 } }), 3);
    assert.equal(clampMaxParallel({ implement: { max_parallel: 0.5 } }), 1);
  });
});

describe("detectRerunCollision", () => {
  it("returns true when a retained worktree exists for the slug", () => {
    const listFn = () => [{ slug: "plan-a" }, { slug: "plan-b" }];
    assert.equal(detectRerunCollision("plan-a", { listFn }), true);
  });
  it("returns false when no worktree matches the slug", () => {
    const listFn = () => [{ slug: "plan-b" }];
    assert.equal(detectRerunCollision("plan-a", { listFn }), false);
  });
  it("returns false on an empty worktree list", () => {
    assert.equal(detectRerunCollision("plan-a", { listFn: () => [] }), false);
  });
});
