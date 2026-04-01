/**
 * Tests for lib/issues/interface.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  IssueManagerInterface,
  validateIssue,
  validateStatusTransition,
  validateEpic,
  detectCycle,
  checkCloseGuard,
  VALID_STATUSES,
  VALID_TYPES,
  VALID_PRIORITIES,
} from "../../lib/issues/interface.mjs";

describe("IssueManagerInterface", () => {
  it("exports all required methods", () => {
    const methods = [
      "init", "create", "update", "close", "list", "get",
      "createEpic", "updateEpic", "addDependency",
    ];
    for (const method of methods) {
      assert.equal(typeof IssueManagerInterface[method], "function",
        `Expected method '${method}' to be a function`);
    }
  });

  it("has a name property", () => {
    assert.equal(typeof IssueManagerInterface.name, "string");
  });

  it("all methods throw 'Not implemented' by default", async () => {
    const methods = [
      "create", "update", "close", "list", "get",
      "createEpic", "updateEpic", "addDependency",
    ];
    for (const method of methods) {
      await assert.rejects(
        () => IssueManagerInterface[method](),
        { message: "Not implemented" },
        `Expected '${method}' to throw 'Not implemented'`
      );
    }
  });
});

describe("validateIssue", () => {
  it("throws MISSING_REQUIRED_FIELD when title is missing", () => {
    assert.throws(
      () => validateIssue({}),
      (err) => err.code === "MISSING_REQUIRED_FIELD"
    );
  });

  it("throws MISSING_REQUIRED_FIELD when title is empty string", () => {
    assert.throws(
      () => validateIssue({ title: "  " }),
      (err) => err.code === "MISSING_REQUIRED_FIELD"
    );
  });

  it("accepts valid issue and applies defaults", () => {
    const issue = validateIssue({ title: "Fix bug", type: "bug" });
    assert.equal(issue.title, "Fix bug");
    assert.equal(issue.status, "open");
    assert.equal(issue.priority, 2);
    assert.equal(issue.type, "bug");
    assert.deepEqual(issue.dependencies, []);
    assert.ok(issue.created);
    assert.ok(issue.updated);
  });

  it("rejects invalid status", () => {
    assert.throws(
      () => validateIssue({ title: "t", status: "invalid" }),
      (err) => err.code === "VALIDATION"
    );
  });

  it("rejects invalid type", () => {
    assert.throws(
      () => validateIssue({ title: "t", type: "epic" }),
      (err) => err.code === "VALIDATION"
    );
  });

  it("rejects invalid priority", () => {
    assert.throws(
      () => validateIssue({ title: "t", priority: 5 }),
      (err) => err.code === "VALIDATION"
    );
  });

  it("preserves optional fields when provided", () => {
    const issue = validateIssue({
      title: "Issue",
      epicId: "epic-1",
      planRef: "plan.md",
      planTask: 3,
      notes: "some notes",
    });
    assert.equal(issue.epicId, "epic-1");
    assert.equal(issue.planRef, "plan.md");
    assert.equal(issue.planTask, 3);
    assert.equal(issue.notes, "some notes");
  });
});

describe("validateStatusTransition", () => {
  it("throws ISSUE_CLOSED when updating a closed issue", () => {
    assert.throws(
      () => validateStatusTransition("closed", { title: "new" }),
      (err) => err.code === "ISSUE_CLOSED"
    );
  });

  it("throws USE_CLOSE_METHOD when update sets status to closed", () => {
    assert.throws(
      () => validateStatusTransition("open", { status: "closed" }),
      (err) => err.code === "USE_CLOSE_METHOD"
    );
  });

  it("allows valid status transitions", () => {
    assert.doesNotThrow(() => validateStatusTransition("open", { status: "in_progress" }));
    assert.doesNotThrow(() => validateStatusTransition("open", { title: "updated" }));
    assert.doesNotThrow(() => validateStatusTransition("in_progress", { status: "deferred" }));
  });
});

describe("validateEpic", () => {
  it("throws MISSING_REQUIRED_FIELD when title is missing", () => {
    assert.throws(
      () => validateEpic({}),
      (err) => err.code === "MISSING_REQUIRED_FIELD"
    );
  });

  it("accepts valid epic with defaults", () => {
    const epic = validateEpic({ title: "Auth feature" });
    assert.equal(epic.title, "Auth feature");
    assert.equal(epic.status, "open");
    assert.ok(epic.created);
  });

  it("preserves planRef when provided", () => {
    const epic = validateEpic({ title: "E", planRef: "plan.md" });
    assert.equal(epic.planRef, "plan.md");
  });
});

describe("detectCycle", () => {
  it("detects self-dependency", () => {
    const deps = { "issue-1": [] };
    assert.throws(
      () => detectCycle("issue-1", "issue-1", deps),
      (err) => err.code === "CIRCULAR_DEPENDENCY"
    );
  });

  it("detects transitive cycle A→B→A", () => {
    const deps = { "issue-1": ["issue-2"], "issue-2": [] };
    assert.throws(
      () => detectCycle("issue-2", "issue-1", deps),
      (err) => err.code === "CIRCULAR_DEPENDENCY"
    );
  });

  it("detects deep transitive cycle A→B→C→A", () => {
    const deps = { "issue-1": ["issue-2"], "issue-2": ["issue-3"], "issue-3": [] };
    assert.throws(
      () => detectCycle("issue-3", "issue-1", deps),
      (err) => err.code === "CIRCULAR_DEPENDENCY"
    );
  });

  it("allows valid dependency", () => {
    const deps = { "issue-1": [], "issue-2": [] };
    assert.doesNotThrow(() => detectCycle("issue-1", "issue-2", deps));
  });

  it("allows chain without cycle", () => {
    const deps = { "issue-1": [], "issue-2": ["issue-1"], "issue-3": ["issue-2"] };
    assert.doesNotThrow(() => detectCycle("issue-3", "issue-1", deps));
  });
});

describe("checkCloseGuard", () => {
  it("throws BLOCKED_BY_DEPENDENCIES when deps are unclosed", () => {
    const issues = [
      { id: "issue-1", status: "open", dependencies: [] },
      { id: "issue-2", status: "open", dependencies: ["issue-1"] },
    ];
    assert.throws(
      () => checkCloseGuard("issue-2", issues),
      (err) => err.code === "BLOCKED_BY_DEPENDENCIES" && err.blockers.includes("issue-1")
    );
  });

  it("allows close when all deps are closed", () => {
    const issues = [
      { id: "issue-1", status: "closed", dependencies: [] },
      { id: "issue-2", status: "open", dependencies: ["issue-1"] },
    ];
    assert.doesNotThrow(() => checkCloseGuard("issue-2", issues));
  });

  it("allows close when issue has no dependencies", () => {
    const issues = [
      { id: "issue-1", status: "open", dependencies: [] },
    ];
    assert.doesNotThrow(() => checkCloseGuard("issue-1", issues));
  });
});

describe("constants", () => {
  it("exports valid status values", () => {
    assert.deepEqual(VALID_STATUSES, ["open", "in_progress", "closed", "deferred"]);
  });

  it("exports valid type values", () => {
    assert.deepEqual(VALID_TYPES, ["bug", "feature", "task"]);
  });

  it("exports valid priority values", () => {
    assert.deepEqual(VALID_PRIORITIES, [0, 1, 2, 3, 4]);
  });
});
