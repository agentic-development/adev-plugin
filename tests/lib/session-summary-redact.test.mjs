/**
 * Tests for `redactSecrets(text)` in `lib/session-summary.mjs` — SEC-1, SEC-9.
 *
 * One test per pattern class plus an ordering test asserting that the
 * PEM-block redaction runs before specific key patterns (so an inner
 * sk- key inside a PEM block does not leak its own redaction token).
 */

import { test } from "node:test";
import assert from "node:assert";

import { redactSecrets } from "../../lib/session-summary.mjs";

test("redactSecrets returns input unchanged when no secret present", () => {
  const text = "Hello, this is a benign comment.";
  assert.strictEqual(redactSecrets(text), text);
});

test("redactSecrets handles empty / non-string input gracefully", () => {
  assert.strictEqual(redactSecrets(""), "");
  assert.strictEqual(redactSecrets(null), "");
  assert.strictEqual(redactSecrets(undefined), "");
});

test("redactSecrets handles PEM private-key block (multiline)", () => {
  const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIE...lots of base64...
multiple
lines
-----END RSA PRIVATE KEY-----`;
  assert.strictEqual(redactSecrets(pem), "[REDACTED:private-key]");
});

test("redactSecrets handles plain PRIVATE KEY (no type qualifier)", () => {
  const pem = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANB...
-----END PRIVATE KEY-----`;
  assert.strictEqual(redactSecrets(pem), "[REDACTED:private-key]");
});

test("redactSecrets handles AWS access keys", () => {
  const text = "config: AKIAIOSFODNN7EXAMPLE done.";
  assert.strictEqual(
    redactSecrets(text),
    "config: [REDACTED:aws-access-key] done.",
  );
});

test("redactSecrets handles GitHub tokens (ghp_, gho_, ghs_, ghr_, ghu_)", () => {
  for (const prefix of ["ghp", "gho", "ghs", "ghr", "ghu"]) {
    const token = `${prefix}_${"A".repeat(40)}`;
    assert.match(redactSecrets(`token=${token}`), /\[REDACTED:github-token\]/);
  }
});

test("redactSecrets handles OpenAI/Anthropic sk- keys", () => {
  const llmKey = "sk-" + "A".repeat(40);
  assert.match(redactSecrets(`key=${llmKey}`), /\[REDACTED:llm-key\]/);
  const antKey = "sk-ant-" + "A".repeat(40);
  assert.match(redactSecrets(`key=${antKey}`), /\[REDACTED:llm-key\]/);
});

test("redactSecrets distinguishes Stripe sk_ from LLM sk-", () => {
  const stripe = "sk_live_" + "0".repeat(30);
  const llm = "sk-" + "0".repeat(30);
  assert.match(redactSecrets(stripe), /\[REDACTED:stripe-key\]/);
  assert.match(redactSecrets(llm), /\[REDACTED:llm-key\]/);
  // The two patterns must not cross-collapse.
  assert.doesNotMatch(redactSecrets(stripe), /llm-key/);
  assert.doesNotMatch(redactSecrets(llm), /stripe-key/);
});

test("redactSecrets handles Slack tokens (xoxb-, xoxp-, etc.)", () => {
  const token = "xoxb-1234567890-abcdef0123";
  assert.match(redactSecrets(token), /\[REDACTED:slack-token\]/);
});

test("redactSecrets handles Google API keys", () => {
  const key = "AIza" + "A".repeat(35);
  assert.match(redactSecrets(key), /\[REDACTED:google-api-key\]/);
});

test("redactSecrets handles generic JWTs (three dot-separated b64 parts)", () => {
  const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6.eyJzdWIiOiIxMjM0NTY3ODkw.SflKxw_efgh";
  assert.match(redactSecrets(jwt), /\[REDACTED:jwt\]/);
});

test("redactSecrets handles Authorization: Bearer headers", () => {
  const text = "Authorization: Bearer abc123def456ghi";
  assert.strictEqual(redactSecrets(text), "Authorization: [REDACTED:bearer]");
});

test("redactSecrets handles env-style KEY=VALUE patterns", () => {
  for (const key of [
    "API_KEY",
    "api-key",
    "TOKEN",
    "Token",
    "SECRET",
    "PASSWORD",
    "auth",
    "AUTH",
    "PRIVATE_KEY",
    "private-key",
  ]) {
    const text = `${key}=supersecretvalue123`;
    const out = redactSecrets(text);
    assert.match(out, /\[REDACTED:env-secret\]/, `key=${key}`);
  }
});

test("redactSecrets ordering: PEM block redacts the whole thing (inner keys do not leak)", () => {
  // An sk- pattern lives inside the PEM block. After redaction, only the
  // PEM token should appear; the inner sk- pattern must NOT separately surface.
  const text = `-----BEGIN PRIVATE KEY-----
some=junk and a key sk-${"X".repeat(40)} inside the block
-----END PRIVATE KEY-----`;
  const out = redactSecrets(text);
  assert.strictEqual(out, "[REDACTED:private-key]");
  assert.doesNotMatch(out, /llm-key/);
});

test("redactSecrets leaves benign content intact", () => {
  const text = `Project says: hello world\nUses some/path/here.\nNo secrets here.`;
  assert.strictEqual(redactSecrets(text), text);
});
