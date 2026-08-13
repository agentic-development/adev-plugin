import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { parseYaml } from "../../../lib/profiles/yaml.mjs";

const PATH = new URL("../../../.context-index/governance/sensitive-paths.yaml", import.meta.url);

test("adev's own sensitive-paths.yaml exists", () => {
  assert.ok(existsSync(PATH));
});

test("it extends the default with lib/test-strategies/**, lib/governance/**, and lib/lifecycle-events.mjs", () => {
  const doc = parseYaml(readFileSync(PATH, "utf8"));
  assert.ok(doc.sensitive_paths.includes("lib/test-strategies/**"));
  assert.ok(doc.sensitive_paths.includes("lib/governance/**"));
  assert.ok(doc.sensitive_paths.includes("lib/lifecycle-events.mjs"));
});
