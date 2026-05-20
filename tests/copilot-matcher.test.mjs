// Tests for lib/providers/copilot/matcher.mjs
// Spec: .context-index/specs/features/copilot-provider/copilot-hook-generator.spec.md
// Behaviors §2 — tokenization, longest-name-first, 1024-byte cap.
// Error Cases — MATCHER_TOO_LARGE, UNMAPPED_TOOL_NAME.

import test from "node:test";
import assert from "node:assert/strict";
import { rewriteMatcher } from "../lib/providers/copilot/matcher.mjs";
import { TOOL_NAMES } from "../lib/providers/copilot/tool-names.mjs";

test("substitutes Bash → bash on word boundaries", () => {
  assert.equal(rewriteMatcher("^Bash$", TOOL_NAMES), "^bash$");
});

test("MultiEdit is rewritten as edit, NOT corrupted into Multiedit", () => {
  // Without longest-first ordering, the Edit substitution would replace
  // the `Edit` substring inside `MultiEdit` and produce `Multiedit`.
  assert.equal(rewriteMatcher("^MultiEdit$", TOOL_NAMES), "^edit$");
});

test("MultiEdit and Edit in alternation each map to edit", () => {
  assert.equal(rewriteMatcher("^(MultiEdit|Edit)$", TOOL_NAMES), "^(edit|edit)$");
});

test("alternation passthrough — non-identifier characters preserved", () => {
  assert.equal(rewriteMatcher("^(Bash|Write)$", TOOL_NAMES), "^(bash|create)$");
});

test("preserves regex metacharacters around tokens", () => {
  assert.equal(rewriteMatcher(".*Read.*", TOOL_NAMES), ".*view.*");
});

test("handles WebFetch (longer name with same prefix as Web*)", () => {
  assert.equal(rewriteMatcher("^WebFetch$", TOOL_NAMES), "^web_fetch$");
});

test("an empty matcher round-trips unchanged", () => {
  assert.equal(rewriteMatcher("", TOOL_NAMES), "");
});

test("matcher with no identifier tokens passes through unchanged", () => {
  assert.equal(rewriteMatcher(".*", TOOL_NAMES), ".*");
});

test("throws MATCHER_TOO_LARGE for inputs > 1024 bytes", () => {
  const huge = "Bash".repeat(300); // ~1200 bytes
  assert.throws(() => rewriteMatcher(huge, TOOL_NAMES), /MATCHER_TOO_LARGE/);
});

test("matcher exactly 1024 bytes does NOT throw", () => {
  // Build a 1024-byte string of unmapped passthrough characters.
  const exact = ".".repeat(1024);
  assert.doesNotThrow(() => rewriteMatcher(exact, TOOL_NAMES));
});

test("throws UNMAPPED_TOOL_NAME for unmapped identifier tokens", () => {
  assert.throws(
    () => rewriteMatcher("^Unknown$", TOOL_NAMES),
    /UNMAPPED_TOOL_NAME: Unknown/,
  );
});

test("UNMAPPED_TOOL_NAME mentions the first offending token", () => {
  // Multiple unmapped tokens; the throw should surface the first one we see.
  assert.throws(
    () => rewriteMatcher("^(Foo|Bar)$", TOOL_NAMES),
    /UNMAPPED_TOOL_NAME: Foo/,
  );
});
