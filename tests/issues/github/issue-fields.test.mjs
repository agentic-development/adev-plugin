import { test } from "node:test";
import assert from "node:assert/strict";
import { validateIssue } from "../../../lib/issues/interface.mjs";

test("validateIssue keeps legacy_id and affected_modules", () => {
  const out = validateIssue({ title: "t", legacy_id: "issue-7k3f9a", affected_modules: ["lib"] });
  assert.equal(out.legacy_id, "issue-7k3f9a");
  assert.deepEqual(out.affected_modules, ["lib"]);
  const bare = validateIssue({ title: "t" });
  assert.equal("legacy_id" in bare && bare.legacy_id !== undefined, false);
});

test("absent affected_modules is carried as undefined, not dropped from the field set", () => {
  const bare = validateIssue({ title: "t" });
  assert.equal(Object.prototype.hasOwnProperty.call(bare, "affected_modules"), true);
  assert.equal(bare.affected_modules, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(bare, "legacy_id"), true);
  assert.equal(bare.legacy_id, undefined);
});

test("null and empty-string legacy_id normalize to undefined like claimed_at", () => {
  assert.equal(validateIssue({ title: "t", legacy_id: null }).legacy_id, undefined);
  assert.equal(validateIssue({ title: "t", legacy_id: "" }).legacy_id, undefined);
});

test("null affected_modules normalizes to undefined", () => {
  assert.equal(validateIssue({ title: "t", affected_modules: null }).affected_modules, undefined);
});

test("multi-slug affected_modules keeps every slug in order, including reserved safety tags", () => {
  const out = validateIssue({ title: "t", affected_modules: ["lib", "review-gate", "cli"] });
  assert.deepEqual(out.affected_modules, ["lib", "review-gate", "cli"]);
});

test("an empty affected_modules array is a valid array of strings and is kept", () => {
  assert.deepEqual(validateIssue({ title: "t", affected_modules: [] }).affected_modules, []);
});

test("non-array affected_modules is refused with INVALID_AFFECTED_MODULES", () => {
  for (const bad of ["lib", 7, { lib: true }, true]) {
    assert.throws(
      () => validateIssue({ title: "t", affected_modules: bad }),
      { code: "INVALID_AFFECTED_MODULES" },
      `expected refusal for ${JSON.stringify(bad)}`,
    );
  }
});

test("affected_modules containing a non-string element is refused with INVALID_AFFECTED_MODULES", () => {
  for (const bad of [["lib", 3], [null], [["lib"]], ["lib", undefined], [{ slug: "lib" }]]) {
    assert.throws(
      () => validateIssue({ title: "t", affected_modules: bad }),
      { code: "INVALID_AFFECTED_MODULES" },
      `expected refusal for ${JSON.stringify(bad)}`,
    );
  }
});

test("a sparse affected_modules array is refused with INVALID_AFFECTED_MODULES", () => {
  for (const bad of [[, "lib"], ["lib", , "cli"], new Array(2)]) {
    assert.throws(
      () => validateIssue({ title: "t", affected_modules: bad }),
      { code: "INVALID_AFFECTED_MODULES" },
      `expected refusal for a sparse array of length ${bad.length}`,
    );
  }
});

test("the new fields coexist with the existing whitelisted fields", () => {
  const out = validateIssue({
    title: "t",
    legacy_id: "issue-7k3f9a",
    affected_modules: ["lib"],
    claimed_at: "2026-11-26T00:00:00.000Z",
    owner: "alice",
    spec_ref: "a/b.spec.md",
    stray_key: "dropped",
  });
  assert.equal(out.claimed_at, "2026-11-26T00:00:00.000Z");
  assert.equal(out.owner, "alice");
  assert.equal(out.spec_ref, "a/b.spec.md");
  assert.equal(out.legacy_id, "issue-7k3f9a");
  assert.deepEqual(out.affected_modules, ["lib"]);
  assert.equal("stray_key" in out, false);
});
