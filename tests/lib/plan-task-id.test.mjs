import test from "node:test";
import assert from "node:assert/strict";
import {
  indexByTaskIdKey,
  sameTaskId,
  taskHeadingNumber,
  taskIdKey,
} from "../../lib/plan-task-id.mjs";

test("taskIdKey collapses the route, parallelization, and heading spellings to one key", () => {
  for (const id of ["t1", "T1", "1", "Task 1", "task 1", "task-1", " t1 "]) {
    assert.equal(taskIdKey(id), "1", id);
  }
  assert.equal(taskIdKey(1), "1");
});

test("taskIdKey keeps hierarchical and suffixed tails", () => {
  assert.equal(taskIdKey("t1.2"), "1.2");
  assert.equal(taskIdKey("Task 9b"), "9b");
  assert.equal(taskIdKey("t9B"), "9b");
});

test("taskIdKey leaves non-numeric ids alone so they never alias a numbered task", () => {
  assert.equal(taskIdKey("tZ"), "tz");
  assert.equal(taskIdKey("does-not-exist"), "does-not-exist");
  assert.equal(taskIdKey("t"), "t");
  assert.equal(taskIdKey(null), "");
  assert.equal(taskIdKey(undefined), "");
});

test("sameTaskId matches across spellings and never matches two empty ids", () => {
  assert.equal(sameTaskId("t1", "Task 1"), true);
  assert.equal(sameTaskId("1", "t1"), true);
  assert.equal(sameTaskId("t1", "t11"), false);
  assert.equal(sameTaskId("t1", "1.1"), false);
  assert.equal(sameTaskId(null, undefined), false);
});

test("taskHeadingNumber returns the integer heading number or null", () => {
  assert.equal(taskHeadingNumber("t3"), "3");
  assert.equal(taskHeadingNumber("3"), "3");
  assert.equal(taskHeadingNumber("Task 3"), "3");
  assert.equal(taskHeadingNumber("t9b"), null);
  assert.equal(taskHeadingNumber("t1.2"), null);
  assert.equal(taskHeadingNumber("slug"), null);
});

test("indexByTaskIdKey re-keys by taskIdKey and resolves collisions with prefer", () => {
  const plain = indexByTaskIdKey({ t1: "a", "2": "b" });
  assert.equal(plain.get("1"), "a");
  assert.equal(plain.get("2"), "b");

  assert.equal(indexByTaskIdKey({ "1": "first", t1: "second" }).get("1"), "first");
  assert.equal(
    indexByTaskIdKey({ "1": "first", t1: "second" }, { prefer: (_a, b) => b }).get("1"),
    "second",
  );
  assert.equal(indexByTaskIdKey(null).size, 0);
});
