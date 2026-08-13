import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const dir = new URL("../../.context-index/specs/features/spec-lifecycle/", import.meta.url);

test("an amendment artifact against plan-test-mapping.spec.md exists", () => {
  const files = readdirSync(dir).filter((f) => f.startsWith("plan-test-mapping-") && f.endsWith(".spec.md"));
  assert.ok(files.length > 0, "expected a plan-test-mapping-rev-*-*.spec.md amendment file");
});

test("the base spec's lifecycle log recorded a spec_amended event", () => {
  const log = readFileSync(
    new URL("../../.context-index/lifecycle-state/plan-test-mapping.jsonl", import.meta.url),
    "utf8",
  );
  assert.match(log, /"event":"spec_amended"/);
});
