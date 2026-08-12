// tests/lib/test-strategies/sensitive-paths.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SENSITIVE_PATHS,
  effectiveSensitivePaths,
} from "../../../lib/test-strategies/sensitive-paths.mjs";

test("DEFAULT_SENSITIVE_PATHS covers auth, secrets, credentials, env, key material, governance", () => {
  assert.ok(DEFAULT_SENSITIVE_PATHS.some((p) => p.includes("auth")));
  assert.ok(DEFAULT_SENSITIVE_PATHS.some((p) => p.includes(".env")));
  assert.ok(DEFAULT_SENSITIVE_PATHS.some((p) => p.includes("governance")));
});

test("effectiveSensitivePaths unions configured entries with the built-in default", () => {
  const result = effectiveSensitivePaths(["src/billing/**"]);
  assert.ok(result.includes("src/billing/**"));
  for (const p of DEFAULT_SENSITIVE_PATHS) assert.ok(result.includes(p));
});

test("effectiveSensitivePaths never returns fewer entries than the built-in default", () => {
  assert.ok(effectiveSensitivePaths([]).length >= DEFAULT_SENSITIVE_PATHS.length);
  assert.ok(effectiveSensitivePaths(undefined).length >= DEFAULT_SENSITIVE_PATHS.length);
});

test("malformed configured input degrades to the built-in set with an advisory", () => {
  const { paths, warnings } = effectiveSensitivePaths({ not: "an array" }, { withWarnings: true });
  assert.deepEqual(paths, DEFAULT_SENSITIVE_PATHS);
  assert.ok(warnings.some((w) => w.code === "INVALID_SENSITIVE_PATHS"));
});
