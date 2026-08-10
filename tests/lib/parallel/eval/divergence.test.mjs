// tests/lib/parallel/eval/divergence.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { testSetDivergence, surfaceDivergence, judge } from "../../../../lib/parallel/eval/divergence.mjs";

describe("testSetDivergence", () => {
  it("is empty when the pass/fail sets match", () => {
    assert.deepEqual(testSetDivergence({ a: "pass", b: "fail" }, { a: "pass", b: "fail" }), []);
  });
  it("names tests whose status differs or are present in one only", () => {
    assert.deepEqual(testSetDivergence({ a: "pass", b: "fail" }, { a: "fail", c: "pass" }).sort(), ["a", "b", "c"]);
  });
});

describe("surfaceDivergence", () => {
  it("is empty for the same surface regardless of order", () => {
    assert.deepEqual(surfaceDivergence(["x", "y"], ["y", "x"]), []);
  });
  it("returns the symmetric difference", () => {
    assert.deepEqual(surfaceDivergence(["x", "y"], ["y", "z"]).sort(), ["x", "z"]);
  });
});

describe("judge", () => {
  const A = { tests: { t1: "pass", t2: "pass" }, surface: ["f()", "g()"] };
  it("equivalent when control is empty and parallel matches serialA exactly", () => {
    const r = judge({ serialA: A, serialB: { ...A }, parallel: { ...A } });
    assert.equal(r.verdict, "equivalent");
  });
  it("inconclusive when the two serial arms already diverge (non-deterministic fixture)", () => {
    const serialB = { tests: { t1: "pass", t2: "fail" }, surface: ["f()", "g()"] };
    const r = judge({ serialA: A, serialB, parallel: { ...A } });
    assert.equal(r.verdict, "inconclusive");
  });
  it("not_equivalent with divergence_kind=tests when parallel test set diverges (deterministic control)", () => {
    const parallel = { tests: { t1: "pass", t2: "fail" }, surface: ["f()", "g()"] };
    const r = judge({ serialA: A, serialB: { ...A }, parallel });
    assert.equal(r.verdict, "not_equivalent");
    assert.equal(r.divergence_kind, "tests");
    assert.deepEqual(r.delta, ["t2"]);
  });
  it("not_equivalent with divergence_kind=surface when only the surface diverges", () => {
    const parallel = { tests: { t1: "pass", t2: "pass" }, surface: ["f()"] };
    const r = judge({ serialA: A, serialB: { ...A }, parallel });
    assert.equal(r.verdict, "not_equivalent");
    assert.equal(r.divergence_kind, "surface");
  });
});
