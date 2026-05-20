import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = join(dirname(__filename), "..", "..");
const SCRIPT = join(PROJECT_ROOT, "scripts", "persona-jsonl-analysis.mjs");

const SENTINEL_USER = "SECRET_TRANSCRIPT_CONTENT_QWERTY_12345_USER";
const SENTINEL_ASSISTANT = "SECRET_TRANSCRIPT_CONTENT_QWERTY_12345_ASSISTANT";

function buildFixture(dir) {
  const lines = [
    JSON.stringify({
      type: "attachment",
      attachment: {
        stdout: "Output Persona: Architect\nverbosity: terse",
      },
    }),
    JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "text", text: SENTINEL_USER }],
      },
    }),
    JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: SENTINEL_ASSISTANT }],
        usage: {
          output_tokens: 10,
          input_tokens: 5,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    }),
  ];
  writeFileSync(join(dir, "session.jsonl"), lines.join("\n") + "\n");
}

test("persona-jsonl-analysis.mjs does not echo user/assistant content to stdout", () => {
  const dir = mkdtempSync(join(tmpdir(), "persona-jsonl-"));
  try {
    buildFixture(dir);
    const result = spawnSync("node", [SCRIPT, dir], { encoding: "utf-8" });
    assert.equal(result.status, 0, `script must exit 0; stderr: ${result.stderr}`);
    assert.ok(
      !result.stdout.includes(SENTINEL_USER),
      "stdout must not include user message content (no-content-echo invariant)"
    );
    assert.ok(
      !result.stdout.includes(SENTINEL_ASSISTANT),
      "stdout must not include assistant message content (no-content-echo invariant)"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("persona-jsonl-analysis.mjs renders a persona × verbosity aggregates table", () => {
  const dir = mkdtempSync(join(tmpdir(), "persona-jsonl-"));
  try {
    buildFixture(dir);
    const result = spawnSync("node", [SCRIPT, dir], { encoding: "utf-8" });
    assert.equal(result.status, 0, `script must exit 0; stderr: ${result.stderr}`);
    // The extended script (Task 9) must emit a persona × verbosity section.
    assert.ok(
      /Persona\s*[xX×]\s*Verbosity/i.test(result.stdout),
      "stdout must contain a persona × verbosity aggregates table heading"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
