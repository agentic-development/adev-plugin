import assert from "node:assert/strict";
import test from "node:test";

import { createTask } from "../src/tasks/service";

test("createTask returns a task payload", () => {
  assert.equal(createTask("Ship medium fixture", "user-1").title, "Ship medium fixture");
});
