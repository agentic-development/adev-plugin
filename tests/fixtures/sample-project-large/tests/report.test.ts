import assert from "node:assert/strict";
import test from "node:test";

import { buildReport } from "../src/domain/reports/service";

test("buildReport returns aggregate counts", () => {
  assert.equal(buildReport().totalTasks, 0);
});
