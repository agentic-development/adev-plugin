/**
 * Tests for `redactSecrets(text)` in `lib/session-summary.mjs` — SEC-1, SEC-9.
 *
 * One test per pattern class plus an ordering test asserting that the
 * PEM-block redaction runs before specific key patterns (so an inner
 * sk- key inside a PEM block does not leak its own redaction token).
 */

import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { redactSecrets, writeSummary } from "../../lib/session-summary.mjs";

test("redactSecrets returns input unchanged when no secret present", () => {
  const text = "Hello, this is a benign comment.";
  assert.strictEqual(redactSecrets(text), text);
});

test("redactSecrets handles empty / non-string input gracefully (+1 more contract assertions)", () => {
  // redactSecrets handles empty / non-string input gracefully
  assert.strictEqual(redactSecrets(""), "");
  assert.strictEqual(redactSecrets(null), "");
  assert.strictEqual(redactSecrets(undefined), "");

  // redactSecrets does NOT redact the project root itself
  assert.strictEqual(redactSecrets(ROOT, OPTS), ROOT);
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

// ─────────────────────────────────────────────────────────────────────────────
// Out-of-repo absolute-path redaction — issue adev-plugin-3v2i.
//
// Session summaries are committed. A path from an unrelated checkout can carry
// a client/organisation name into a public repository even when no credential
// is present — that is the 2026-08-13 leak this class of test guards.
//
// These tests pass `projectRoot` EXPLICITLY with a synthetic root so that the
// assertions do not depend on where `npm test` happens to run. One test below
// deliberately exercises the no-options production call path instead.
// ─────────────────────────────────────────────────────────────────────────────

/** Synthetic project root — never touches the real filesystem. */
const ROOT = "/Users/testuser/dev/myrepo";
const OPTS = { projectRoot: ROOT };

test("redactSecrets redacts an out-of-repo absolute path", () => {
  const text = "Read /Users/someone/Development/other-repo/src/index.ts for context";
  const out = redactSecrets(text, OPTS);
  assert.match(out, /\[REDACTED:path\]/);
  assert.doesNotMatch(out, /other-repo/);
  assert.doesNotMatch(out, /someone/);
});

test("redactSecrets redacts a home-directory path containing an org name (the real leak shape)", () => {
  // Modelled on the committed leak: a "Files touched:" line listing paths from
  // another checkout whose directory name is a client's name.
  const text =
    "Files touched: /Users/dpavancini/Development/AcmeCorp-platform/api/billing.py, " +
    "/private/tmp/claude-501/scratchpad/AcmeCorp-notes.md";
  const out = redactSecrets(text, OPTS);
  assert.doesNotMatch(out, /AcmeCorp/, "organisation name must not survive");
  assert.doesNotMatch(out, /dpavancini/, "user name must not survive");
  assert.doesNotMatch(out, /scratchpad/);
  assert.strictEqual(out, "Files touched: [REDACTED:path], [REDACTED:path]");
});

test("redactSecrets redacts a scratchpad / temp path", () => {
  for (const p of [
    "/private/tmp/claude-501/session/x.json",
    "/tmp/build-cache/AcmeCorp/out.log",
    "/var/folders/qz/T/tmpabc/transcript.jsonl",
  ]) {
    assert.strictEqual(redactSecrets(p, OPTS), "[REDACTED:path]", p);
  }
});

test("redactSecrets does NOT redact an in-repo absolute path", () => {
  const text = `Edited ${ROOT}/lib/session-summary.mjs and ${ROOT}/tests/helpers.mjs`;
  assert.strictEqual(redactSecrets(text, OPTS), text);
});


test("redactSecrets does NOT redact in-repo relative paths", () => {
  const text =
    "See lib/session-summary.mjs, ./tests/helpers.mjs and ../sibling/notes.md";
  assert.strictEqual(redactSecrets(text, OPTS), text);
});

test("redactSecrets does NOT redact non-identifying system paths", () => {
  const text = "ran /usr/bin/node against /etc/hosts using /bin/sh and /opt/homebrew/bin/git";
  assert.strictEqual(redactSecrets(text, OPTS), text);
});

test("redactSecrets does NOT treat URL path components as absolute paths", () => {
  const text = "docs at https://example.com/Users/guide and http://host/home/index.html";
  assert.strictEqual(redactSecrets(text, OPTS), text);
});

test("redactSecrets is not fooled by a sibling directory sharing the root prefix", () => {
  const text = "/Users/testuser/dev/myrepo-client-fork/src/a.ts";
  assert.strictEqual(redactSecrets(text, OPTS), "[REDACTED:path]");
});

test("redactSecrets redacts a path that escapes the root via ..", () => {
  const text = `${ROOT}/../AcmeCorp-internal/secrets.md`;
  const out = redactSecrets(text, OPTS);
  assert.strictEqual(out, "[REDACTED:path]");
  assert.doesNotMatch(out, /AcmeCorp/);
});

test("redactSecrets expands ~ before deciding containment", () => {
  // `~/…` cannot be proven in-repo against a synthetic root, so it is redacted.
  const out = redactSecrets("opened ~/Development/AcmeCorp/app.py today", OPTS);
  assert.match(out, /\[REDACTED:path\]/);
  assert.doesNotMatch(out, /AcmeCorp/);
});

test("redactSecrets redacts Windows user paths but keeps sentence punctuation", () => {
  const out = redactSecrets("opened C:\\Users\\bob\\Work\\AcmeCorp\\main.cs. Done.", OPTS);
  assert.strictEqual(out, "opened [REDACTED:path]. Done.");
  assert.doesNotMatch(out, /AcmeCorp/);
});

test("redactSecrets preserves trailing sentence punctuation around a redacted path", () => {
  const out = redactSecrets("Edited /Users/someone/dev/x/y.mjs. Then stopped.", OPTS);
  assert.strictEqual(out, "Edited [REDACTED:path]. Then stopped.");
});

test("redactSecrets falls back to a resolved root when no options are passed", () => {
  // The production call path (`fromTranscript` → `redactSecrets(text)`) passes
  // no options. It must still redact an obviously foreign home path, and must
  // not throw.
  const out = redactSecrets("/Users/not-the-current-user/Development/AcmeCorp/x.txt");
  assert.strictEqual(out, "[REDACTED:path]");
  assert.doesNotMatch(out, /AcmeCorp/);
});

test("redactSecrets fails closed when the project root is too broad", () => {
  // A root of `/` (or the home directory) would mark every path as in-repo and
  // silently disable the redactor. Such roots are rejected.
  for (const badRoot of ["/", "", "   /not/absolute/../..", "relative/root"]) {
    const out = redactSecrets("/Users/someone/AcmeCorp/x", { projectRoot: badRoot });
    assert.strictEqual(out, "[REDACTED:path]", `root=${JSON.stringify(badRoot)}`);
  }
});

test("redactSecrets ordering: a secret embedded in an out-of-repo path is still redacted", () => {
  // Regression guard for pattern ORDER. If the path pattern ran before the
  // env-secret pattern it would consume `/Users/x/proj/token`, destroying the
  // `token=` anchor and leaving the value in the clear.
  const out = redactSecrets("/Users/someone/proj/token=supersecretvalue123", OPTS);
  assert.doesNotMatch(out, /supersecretvalue123/);
  assert.match(out, /\[REDACTED:env-secret\]/);
  assert.match(out, /\[REDACTED:path\]/);
});

test("redactSecrets does not double-mangle existing [REDACTED:...] placeholders", () => {
  const text =
    "already [REDACTED:path] and [REDACTED:private-key] and [REDACTED:env-secret] here";
  assert.strictEqual(redactSecrets(text, OPTS), text);
});

test("redactSecrets still redacts secrets alongside paths (no regression)", () => {
  const text = [
    "cd /Users/someone/Development/AcmeCorp",
    "export AWS key AKIAIOSFODNN7EXAMPLE",
    "Authorization: Bearer abc123def456ghi",
    `token=gh${"p"}_${"A".repeat(40)}`,
    `edited ${ROOT}/lib/x.mjs`,
  ].join("\n");
  const out = redactSecrets(text, OPTS);
  assert.doesNotMatch(out, /AcmeCorp/);
  assert.match(out, /\[REDACTED:aws-access-key\]/);
  assert.match(out, /Authorization: \[REDACTED:bearer\]/);
  assert.match(out, /\[REDACTED:env-secret\]|\[REDACTED:github-token\]/);
  assert.match(out, new RegExp(`${ROOT}/lib/x\\.mjs`), "in-repo path preserved");
});

test("writeSummary redacts the body before persisting it (post-commit leak vector)", async () => {
  // `.githooks/post-commit` builds its own `condensed` body — including the
  // `Files touched:` line that carried the 2026-08-13 leak — and calls
  // writeSummary() directly, never going through fromTranscript(). Redaction
  // must therefore happen at the persistence chokepoint too.
  const tempDir = createTempDir();
  try {
    const condensed = [
      "### Session activity",
      "- Tool calls: 12 Edit, 3 Bash",
      `- Files touched: /Users/someone/Development/AcmeCorp-platform/api/billing.py, ` +
        `/private/tmp/scratch/AcmeCorp.md, ${ROOT}/lib/session-summary.mjs`,
    ].join("\n");

    const filePath = await writeSummary(
      condensed,
      { date: "2026-08-14" },
      join(tempDir, "sessions"),
      { projectRoot: ROOT },
    );
    assert.ok(filePath, "writeSummary should return a path");

    const raw = readFileSync(filePath, "utf8");
    assert.doesNotMatch(raw, /AcmeCorp/, "org name must not reach disk");
    assert.doesNotMatch(raw, /someone/, "user name must not reach disk");
    assert.match(raw, /\[REDACTED:path\]/);
    // In-repo path and non-path content survive.
    assert.match(raw, /lib\/session-summary\.mjs/);
    assert.match(raw, /12 Edit, 3 Bash/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("writeSummary redaction is idempotent for already-redacted bodies", async () => {
  const tempDir = createTempDir();
  try {
    const condensed = "- Files touched: [REDACTED:path], [REDACTED:path]";
    const filePath = await writeSummary(
      condensed,
      { date: "2026-08-14" },
      join(tempDir, "sessions"),
      { projectRoot: ROOT },
    );
    const raw = readFileSync(filePath, "utf8");
    assert.match(raw, /- Files touched: \[REDACTED:path\], \[REDACTED:path\]/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("redactSecrets keeps PEM redaction intact when paths are present", () => {
  const text = `/Users/someone/keys/id_rsa contains:\n-----BEGIN PRIVATE KEY-----\nMIIE/base64/with/slashes\n-----END PRIVATE KEY-----`;
  const out = redactSecrets(text, OPTS);
  assert.match(out, /\[REDACTED:private-key\]/);
  assert.doesNotMatch(out, /MIIE/);
  assert.doesNotMatch(out, /someone/);
});
