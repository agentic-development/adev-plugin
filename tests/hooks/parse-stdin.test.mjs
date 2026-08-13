import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

/**
 * Tests for the hoisted _parse-stdin.sh (spec Migration Path step 1):
 *   - find_context_index() is available to sourcing hooks (regression,
 *     covered indirectly by every other hooks/*.test.mjs file since they all
 *     exercise a consumer of the hoisted function).
 *   - tool_input key names are allowlisted before being interpolated into an
 *     `eval`'d `export NAME=...` line — a key containing shell metacharacters
 *     must NOT execute as a command (pre-existing key-injection surface,
 *     closed by this hoist).
 *
 * context-preflight.sh is used as the harness: it sources _parse-stdin.sh and
 * has no side effects beyond reading CLAUDE_TOOL_INPUT_file_path, making it a
 * clean vessel for observing whether stdin-bridging executed safely.
 */
describe("_parse-stdin.sh key allowlist", () => {
  it("rejects a key containing shell metacharacters (no command injection via eval)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");

    const maliciousKey = "a; touch INJECTED;#";
    const { exitCode } = runHook("context-preflight.sh", {
      cwd: tmp,
      // No CLAUDE_TOOL_INPUT_* env vars — forces the stdin-JSON parse branch.
      env: { CLAUDE_TOOL_INPUT_file_path: "", CLAUDE_TOOL_INPUT_command: "" },
      stdin: JSON.stringify({
        tool_input: {
          [maliciousKey]: "x",
          file_path: "src/main.mjs",
        },
      }),
    });

    assert.equal(exitCode, 0);
    assert.ok(
      !existsSync(join(tmp, "INJECTED")),
      "malicious key must not be interpolated into an executable eval statement"
    );
    cleanupTempDir(tmp);
  });

  it("still exports well-formed keys (regression — allowlist is not overly strict)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    writeFixture(tmp, "src/main.mjs", "");

    // No prior .context-preflight-ok flag and no early-exit extension match
    // (.mjs is not in the fast-path exclusion list) — the warning only fires
    // if file_path was correctly bridged from stdin JSON.
    const { exitCode, stdout } = runHook("context-preflight.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: "", CLAUDE_TOOL_INPUT_command: "" },
      stdin: JSON.stringify({ tool_input: { file_path: "src/main.mjs" } }),
    });

    assert.equal(exitCode, 0);
    assert.ok(stdout.includes("additionalContext"), "well-formed file_path key should be bridged from stdin");
    cleanupTempDir(tmp);
  });
});
