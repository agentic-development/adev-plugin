/**
 * Tests for the stderr diagnostic helper (SEC-7 + CON-10).
 * Confirms the documented format `[adev:session-capture] <reason>[ <subject>][ <path>]`.
 */

import { test } from "node:test";
import assert from "node:assert";

import { formatDiagnostic, emitDiagnostic } from "../../lib/session-capture.mjs";

test("formatDiagnostic emits prefix + reason-code only", () => {
  assert.strictEqual(
    formatDiagnostic("disabled"),
    "[adev:session-capture] disabled",
  );
});

test("formatDiagnostic appends subject when provided", () => {
  assert.strictEqual(
    formatDiagnostic("validation-error", { subject: "session-id" }),
    "[adev:session-capture] validation-error session-id",
  );
});

test("formatDiagnostic appends subject and path", () => {
  assert.strictEqual(
    formatDiagnostic("path-error", {
      subject: "transcript",
      path: ".context-index/sessions/2024.md",
    }),
    "[adev:session-capture] path-error transcript .context-index/sessions/2024.md",
  );
});

test("formatDiagnostic appends path without subject", () => {
  assert.strictEqual(
    formatDiagnostic("disabled", { path: ".githooks/post-commit" }),
    "[adev:session-capture] disabled .githooks/post-commit",
  );
});

test("emitDiagnostic writes a newline-terminated line via the sink", () => {
  let captured = "";
  emitDiagnostic("validation-error", {
    subject: "cwd",
    sink: (line) => {
      captured = line;
    },
  });
  assert.strictEqual(captured, "[adev:session-capture] validation-error cwd\n");
});

test("formatDiagnostic accepts SEC-12/SEC-13 subjects (cost-usd, model, issue-id, etc.)", () => {
  for (const subject of [
    "cost-usd",
    "input-tokens",
    "output-tokens",
    "model",
    "issue-id",
    "epic-id",
  ]) {
    assert.strictEqual(
      formatDiagnostic("validation-error", { subject }),
      `[adev:session-capture] validation-error ${subject}`,
    );
  }
});
