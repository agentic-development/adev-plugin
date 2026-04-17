/**
 * Tests for the generic (free-text) type field.
 *
 * Covers:
 * - validateIssue accepts free-text types not in the legacy enum
 * - validateIssue defaults type to "task" when omitted
 * - validateIssue rejects empty string type with INVALID_TYPE
 * - validateIssue rejects non-string type with INVALID_TYPE
 * - Legacy enum values (bug, feature, task) continue to round-trip unchanged
 *
 * Behaviors from spec: generic type field, behaviors 7–11
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateIssue } from "../../lib/issues/interface.mjs";

describe("validateIssue — free-text type field", () => {
  it("defaults type to 'task' when not provided", () => {
    const issue = validateIssue({ title: "No type" });
    assert.equal(issue.type, "task");
  });

  it("accepts legacy type 'bug' unchanged", () => {
    const issue = validateIssue({ title: "A bug", type: "bug" });
    assert.equal(issue.type, "bug");
  });

  it("accepts legacy type 'feature' unchanged", () => {
    const issue = validateIssue({ title: "A feature", type: "feature" });
    assert.equal(issue.type, "feature");
  });

  it("accepts legacy type 'task' unchanged", () => {
    const issue = validateIssue({ title: "A task", type: "task" });
    assert.equal(issue.type, "task");
  });

  it("accepts free-text type 'incident'", () => {
    const issue = validateIssue({ title: "Incident", type: "incident" });
    assert.equal(issue.type, "incident");
  });

  it("accepts free-text type 'chore'", () => {
    const issue = validateIssue({ title: "Chore", type: "chore" });
    assert.equal(issue.type, "chore");
  });

  it("accepts free-text type 'epic' (was previously rejected by enum)", () => {
    const issue = validateIssue({ title: "Epic item", type: "epic" });
    assert.equal(issue.type, "epic");
  });

  it("accepts free-text type 'story'", () => {
    const issue = validateIssue({ title: "User story", type: "story" });
    assert.equal(issue.type, "story");
  });

  it("throws INVALID_TYPE with correct message when type is empty string", () => {
    assert.throws(
      () => validateIssue({ title: "Empty type", type: "" }),
      (err) => {
        assert.equal(err.code, "INVALID_TYPE");
        assert.ok(err.message.includes("type must be a non-empty string when provided"));
        return true;
      }
    );
  });

  it("throws INVALID_TYPE with correct message when type is a number", () => {
    assert.throws(
      () => validateIssue({ title: "Numeric type", type: 42 }),
      (err) => {
        assert.equal(err.code, "INVALID_TYPE");
        assert.ok(err.message.includes("type must be a string"));
        return true;
      }
    );
  });

  it("treats type as null as 'not provided' — defaults to 'task'", () => {
    // null is treated the same as undefined (not provided); defaults to "task"
    const issue = validateIssue({ title: "Null type", type: null });
    assert.equal(issue.type, "task");
  });

  it("throws INVALID_TYPE when type is an object", () => {
    assert.throws(
      () => validateIssue({ title: "Object type", type: {} }),
      (err) => err.code === "INVALID_TYPE"
    );
  });

  it("throws INVALID_TYPE when type is a boolean", () => {
    assert.throws(
      () => validateIssue({ title: "Bool type", type: false }),
      (err) => err.code === "INVALID_TYPE"
    );
  });

  it("accepts whitespace-only type (not empty by strict check — trimming is not applied to type)", () => {
    // The spec says empty string is rejected but doesn't say whitespace-only is.
    // If type is "  " (spaces), it's technically non-empty, so it passes.
    // This documents current behavior for whitespace-only strings.
    const issue = validateIssue({ title: "Whitespace type", type: "  " });
    assert.equal(issue.type, "  ");
  });
});
