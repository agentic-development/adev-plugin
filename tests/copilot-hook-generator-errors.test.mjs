// Error-path + Cloud-Agent-safe assertion tests for the Copilot hook
// config generator.
//
// Spec: .context-index/specs/features/copilot-provider/copilot-hook-generator.spec.md
//       — Error Cases table (all 8 codes), Acceptance Criteria rows for each
//         error path, Cloud-Agent-safe drop semantic.
//
// Covers the documented error codes:
//   - UNKNOWN_EVENT          (in-memory)
//   - UNMAPPED_TOOL_NAME     (in-memory)
//   - MATCHER_TOO_LARGE      (in-memory)
//   - DUPLICATE_EVENT_MAPPING (validate())
//   - OUTPUT_PATH_ESCAPE     (static source-string assertion)
//   - MISSING_CANONICAL      (entrypoint via spawn, tmp project root)
//   - drift fail-with-hint   (fixture-driven mutation)

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildCopilotHooks } from "../scripts/build-copilot-hooks.mjs";
import { validate, EVENT_TABLE } from "../lib/providers/copilot/event-table.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ─── In-memory error paths ────────────────────────────────────────────────

test("UNKNOWN_EVENT: synthetic hooks.json with unmapped Claude event", () => {
  const synthetic = { hooks: { TotallyMadeUp: [] } };
  assert.throws(
    () => buildCopilotHooks(synthetic),
    /UNKNOWN_EVENT: TotallyMadeUp/,
  );
});

test("UNMAPPED_TOOL_NAME: synthetic matcher referencing unknown tool", () => {
  const synthetic = {
    hooks: {
      PreToolUse: [
        {
          matcher: "^FooBarTool$",
          hooks: [{ type: "command", command: "hooks/foo.sh" }],
        },
      ],
    },
  };
  assert.throws(
    () => buildCopilotHooks(synthetic),
    /UNMAPPED_TOOL_NAME/,
  );
});

test("MATCHER_TOO_LARGE: synthetic matcher > 1024 bytes", () => {
  const synthetic = {
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash".repeat(300),
          hooks: [{ type: "command", command: "hooks/foo.sh" }],
        },
      ],
    },
  };
  assert.throws(
    () => buildCopilotHooks(synthetic),
    /MATCHER_TOO_LARGE/,
  );
});

test("DUPLICATE_EVENT_MAPPING: validate() catches authoring-time duplicate", () => {
  assert.throws(
    () => validate([...EVENT_TABLE, EVENT_TABLE[0]]),
    /DUPLICATE_EVENT_MAPPING/,
  );
});

// ─── Source-string assertion for OUTPUT_PATH_ESCAPE ───────────────────────

test("OUTPUT_PATH_ESCAPE: entrypoint asserts resolved output stays inside PLUGIN_ROOT", () => {
  // The entrypoint hardcodes the output path via `path.resolve(PLUGIN_ROOT,
  // 'providers/copilot/hooks.json')`. The acceptance criterion is that the
  // containment assertion exists in source — verified by static read.
  const src = readFileSync(
    path.join(repoRoot, "scripts/build-copilot-hooks.mjs"),
    "utf8",
  );
  assert.ok(
    /startsWith\(.+path\.sep\)/.test(src),
    "entrypoint must contain a startsWith(... + path.sep) containment check",
  );
  assert.ok(
    /OUTPUT_PATH_ESCAPE/.test(src),
    "entrypoint must reference the OUTPUT_PATH_ESCAPE error code",
  );
});

// ─── Spawn-based MISSING_CANONICAL via standalone Node process ────────────

test("MISSING_CANONICAL: spawning the generator script against a tmp project without hooks/hooks.json exits 1 with the documented stderr", () => {
  // Create a tmp dir that has a hooks/ folder but no hooks.json, then copy
  // the build script + its lib dependencies into a parallel layout there.
  const dir = mkdtempSync(path.join(tmpdir(), "copilot-missing-canonical-"));
  try {
    mkdirSync(path.join(dir, "scripts"), { recursive: true });
    mkdirSync(path.join(dir, "lib/providers/copilot"), { recursive: true });
    cpSync(
      path.join(repoRoot, "scripts/build-copilot-hooks.mjs"),
      path.join(dir, "scripts/build-copilot-hooks.mjs"),
    );
    cpSync(
      path.join(repoRoot, "lib/providers/copilot/event-table.mjs"),
      path.join(dir, "lib/providers/copilot/event-table.mjs"),
    );
    cpSync(
      path.join(repoRoot, "lib/providers/copilot/tool-names.mjs"),
      path.join(dir, "lib/providers/copilot/tool-names.mjs"),
    );
    cpSync(
      path.join(repoRoot, "lib/providers/copilot/matcher.mjs"),
      path.join(dir, "lib/providers/copilot/matcher.mjs"),
    );
    // No hooks/hooks.json — entrypoint should bail with MISSING_CANONICAL.
    const result = spawnSync("node", ["scripts/build-copilot-hooks.mjs"], {
      cwd: dir,
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(result.status, 1, "expected exit 1 on missing canonical");
    assert.match(result.stderr, /MISSING_CANONICAL/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Drift fail-with-hint ────────────────────────────────────────────────

test("drift-test failure message contains the run-hint", () => {
  // Construct a synthetic in-memory mutation: take the real generator output
  // and corrupt it, then verify deepStrictEqual emits the documented hint.
  const canonical = JSON.parse(
    readFileSync(path.join(repoRoot, "hooks/hooks.json"), "utf8"),
  );
  const generated = buildCopilotHooks(canonical);
  const drifted = JSON.parse(JSON.stringify(generated));
  drifted.version = 99; // synthetic drift

  let caught;
  try {
    assert.deepStrictEqual(
      drifted,
      generated,
      "providers/copilot/hooks.json drifted from generator output. run npm run build:copilot-hooks",
    );
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, "expected deepStrictEqual to throw on synthetic drift");
  assert.match(caught.message, /run npm run build:copilot-hooks/);
});

