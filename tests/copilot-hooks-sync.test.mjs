// Drift test for the Copilot hook config generator.
//
// Spec: .context-index/specs/features/copilot-provider/copilot-hook-generator.spec.md
//       — Behaviors §8, §9.
//
// Re-runs the generator in-memory against the canonical hooks/hooks.json and
// asserts `deepStrictEqual` against the committed providers/copilot/hooks.json.
// Generator exceptions propagate unmodified (no permissive try/catch around
// the in-memory call) so authoring-time errors (UNKNOWN_EVENT, etc.) surface
// as test failures rather than being swallowed.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildCopilotHooks } from "../scripts/build-copilot-hooks.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalPath = path.join(pluginRoot, "hooks", "hooks.json");
const committedPath = path.join(pluginRoot, "providers", "copilot", "hooks.json");

test("canonical hooks.json exists", () => {
  assert.ok(
    existsSync(canonicalPath),
    `MISSING_CANONICAL: ${canonicalPath}`,
  );
});

test("committed providers/copilot/hooks.json exists", () => {
  assert.ok(
    existsSync(committedPath),
    `MISSING_COMMITTED: ${committedPath}. Run \`npm run build:copilot-hooks\` to create it.`,
  );
});

test("committed providers/copilot/hooks.json matches generator output", () => {
  // No permissive try/catch around the generator call — exceptions propagate
  // unmodified so authoring-time errors surface here as test failures.
  const canonical = JSON.parse(readFileSync(canonicalPath, "utf8"));
  const expected = buildCopilotHooks(canonical);
  const committed = JSON.parse(readFileSync(committedPath, "utf8"));
  assert.deepStrictEqual(
    committed,
    expected,
    "providers/copilot/hooks.json drifted from generator output. run npm run build:copilot-hooks",
  );
});
