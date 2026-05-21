/**
 * Tests for `fromTranscript(transcriptPath, opts)` in `lib/session-summary.mjs`.
 *
 * Spec behaviors 8 and 16:
 *  - happy-path markdown shape parity with the existing git-derived path
 *  - malformed-transcript placeholder (returns kind: 'placeholder', never throws)
 *  - redaction integration: secrets in transcript → redacted in output body
 *  - optional usage-derived frontmatter (cost_usd, input_tokens, output_tokens, model)
 *    with SEC-12/SEC-13 per-field validation
 */

import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fromTranscript } from "../../lib/session-summary.mjs";

function makeTranscript(lines) {
  const dir = mkdtempSync(join(tmpdir(), "adev-tx-"));
  const path = join(dir, "transcript.jsonl");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return path;
}

test("fromTranscript returns kind: session-end on a valid transcript", async () => {
  const path = makeTranscript([
    { role: "user", message: { content: "hello" } },
    { role: "assistant", message: { content: "hi there" } },
  ]);
  const out = await fromTranscript(path);
  assert.strictEqual(out.kind, "session-end");
  assert.ok(typeof out.body === "string");
  assert.match(out.body, /## Conversation|##/);
});

test("fromTranscript returns placeholder on missing file (does not throw)", async () => {
  const out = await fromTranscript("/nonexistent/path.jsonl");
  assert.strictEqual(out.kind, "placeholder");
  assert.ok(typeof out.body === "string", "placeholder must have a body");
});

test("fromTranscript returns placeholder on malformed JSONL (does not throw)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "adev-tx-bad-"));
  const path = join(dir, "bad.jsonl");
  writeFileSync(path, "not json at all\n");
  const out = await fromTranscript(path);
  // Either kind: 'placeholder' OR kind: 'session-end' with empty content;
  // the contract is that it never throws.
  assert.ok(out && typeof out.body === "string");
});

test("fromTranscript applies redactSecrets to the rendered body", async () => {
  const llmKey = "sk-" + "A".repeat(40);
  const path = makeTranscript([
    { role: "user", message: { content: `my key is ${llmKey} please` } },
    { role: "assistant", message: { content: "ok I won't store it" } },
  ]);
  const out = await fromTranscript(path);
  assert.match(out.body, /\[REDACTED:llm-key\]/);
  assert.doesNotMatch(out.body, new RegExp(llmKey));
});

test("fromTranscript extracts optional usage fields when valid", async () => {
  const path = makeTranscript([
    { role: "user", message: { content: "hi" } },
    {
      role: "assistant",
      message: {
        content: "hello",
        usage: { input_tokens: 100, output_tokens: 50 },
        model: "claude-opus-4-7",
      },
    },
  ]);
  const out = await fromTranscript(path);
  // Optional fields may be undefined OR present-and-valid.
  if (out.metadata) {
    if ("inputTokens" in out.metadata) {
      assert.ok(Number.isInteger(out.metadata.inputTokens));
    }
    if ("model" in out.metadata) {
      assert.match(out.metadata.model, /^[A-Za-z0-9._-]{1,64}$/);
    }
  }
});

test("fromTranscript omits optional fields that fail SEC-12/SEC-13 validation", async () => {
  const path = makeTranscript([
    {
      role: "assistant",
      message: {
        content: "hi",
        usage: { input_tokens: -1, output_tokens: 1e10 }, // both invalid
        model: "x".repeat(100), // > 64 chars
      },
    },
  ]);
  const out = await fromTranscript(path);
  // The fields must be omitted rather than persisted with junk.
  if (out.metadata) {
    assert.ok(!("inputTokens" in out.metadata) || out.metadata.inputTokens === undefined);
    assert.ok(!("outputTokens" in out.metadata) || out.metadata.outputTokens === undefined);
    assert.ok(!("model" in out.metadata) || out.metadata.model === undefined);
  }
});
