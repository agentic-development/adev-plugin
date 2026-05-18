/**
 * Unit tests for lib/partial-artifact.mjs schema-marker validation.
 *
 * Covers Task 3 (validateSchemaMarker + SCHEMA_ALLOWLIST) from
 * incremental-artifact-writes.plan.md. Closes SEC-6 (regex + allowlist)
 * and CON-12 (syntax decision: `<skill>@<version>` retained).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  validateSchemaMarker,
  SCHEMA_ALLOWLIST,
  isAllowedSchema,
} from "../../lib/partial-artifact.mjs";

test("validateSchemaMarker accepts canonical markers", () => {
  assert.deepEqual(validateSchemaMarker("plan@1"), { skill: "plan", version: 1 });
  assert.deepEqual(validateSchemaMarker("spec@1"), { skill: "spec", version: 1 });
  assert.deepEqual(validateSchemaMarker("validate@1"), {
    skill: "validate",
    version: 1,
  });
  assert.deepEqual(validateSchemaMarker("implement@1"), {
    skill: "implement",
    version: 1,
  });
});

test("validateSchemaMarker accepts hyphenated skill names", () => {
  assert.deepEqual(validateSchemaMarker("write-test@1"), {
    skill: "write-test",
    version: 1,
  });
  assert.deepEqual(validateSchemaMarker("review-specs@2"), {
    skill: "review-specs",
    version: 2,
  });
});

test("validateSchemaMarker rejects invalid input", () => {
  // Empty, non-string, missing parts
  assert.throws(() => validateSchemaMarker(""));
  assert.throws(() => validateSchemaMarker(null));
  assert.throws(() => validateSchemaMarker(undefined));
  assert.throws(() => validateSchemaMarker(42));

  // Path-traversal payloads
  assert.throws(() => validateSchemaMarker("../etc/passwd"));
  assert.throws(() => validateSchemaMarker("plan@1; rm -rf /"));
  assert.throws(() => validateSchemaMarker("plan@1\nrm"));

  // Missing version
  assert.throws(() => validateSchemaMarker("plan"));
  assert.throws(() => validateSchemaMarker("plan@"));

  // Missing skill
  assert.throws(() => validateSchemaMarker("@1"));

  // Uppercase rejected (lowercase-only per regex)
  assert.throws(() => validateSchemaMarker("Plan@1"));
  assert.throws(() => validateSchemaMarker("PLAN@1"));

  // Starts with digit / hyphen
  assert.throws(() => validateSchemaMarker("1plan@1"));
  assert.throws(() => validateSchemaMarker("-plan@1"));

  // Skill name exceeds 32 chars (1 leading + 31 trailing)
  const tooLong = "a" + "b".repeat(32) + "@1";
  assert.throws(() => validateSchemaMarker(tooLong));

  // Version > 3 digits
  assert.throws(() => validateSchemaMarker("plan@1234"));

  // Version not numeric
  assert.throws(() => validateSchemaMarker("plan@v1"));

  // Whitespace
  assert.throws(() => validateSchemaMarker(" plan@1"));
  assert.throws(() => validateSchemaMarker("plan@1 "));
});

test("validateSchemaMarker throws with code PARTIAL_ARTIFACT_SCHEMA_MISMATCH on shape failure", () => {
  try {
    validateSchemaMarker("not a marker");
    assert.fail("should have thrown");
  } catch (err) {
    assert.equal(err.code, "PARTIAL_ARTIFACT_SCHEMA_MISMATCH");
  }
});

test("SCHEMA_ALLOWLIST contains the documented entries", () => {
  // Per spec: plan@1, spec@1, validate@1, implement@1 are the v1 adopting skills.
  assert.ok(SCHEMA_ALLOWLIST instanceof Map, "allowlist is a Map");
  assert.ok(SCHEMA_ALLOWLIST.has("plan@1"));
  assert.ok(SCHEMA_ALLOWLIST.has("spec@1"));
  assert.ok(SCHEMA_ALLOWLIST.has("validate@1"));
  assert.ok(SCHEMA_ALLOWLIST.has("implement@1"));
});

test("isAllowedSchema returns true for documented markers and false for novel ones", () => {
  assert.equal(isAllowedSchema("plan@1"), true);
  assert.equal(isAllowedSchema("spec@1"), true);
  assert.equal(isAllowedSchema("validate@1"), true);
  assert.equal(isAllowedSchema("implement@1"), true);
  // Valid-shape but not in allowlist:
  assert.equal(isAllowedSchema("plan@99"), false);
  assert.equal(isAllowedSchema("unknown@1"), false);
  // Invalid-shape returns false (does not throw):
  assert.equal(isAllowedSchema("not a marker"), false);
  assert.equal(isAllowedSchema(""), false);
  assert.equal(isAllowedSchema(null), false);
});
