/**
 * Task 1 — shared digest function and the two normalizers.
 *
 * Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
 * Covers Behaviors 2, 4, and the derivation half of 7/7a.
 *
 * The load-bearing property under test is that ONE digest function serves two
 * derivation rules that must never share a normalizer: `signature` strips
 * punctuation (so casing/whitespace/punctuation drift collapses onto one key),
 * while `id` preserves `/`, `.` and `|` (they are the separators that carry the
 * meaning of a `<path>|<pattern>` hash input).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  normalizeFailureText,
  normalizeIdInput,
  deriveDigest,
  deriveSignature,
  deriveHeuristicId,
  validateEntry,
} from "../../lib/heuristics.mjs";

/** Reference digest, computed independently of lib/heuristics.mjs. */
function sha8(s) {
  return createHash("sha256").update(s).digest("hex").slice(0, 8);
}

describe("normalizeFailureText", () => {
  it("strips punctuation but keeps - and _ (+1 more contract assertions)", () => {
    // strips punctuation but keeps - and _
    assert.equal(
    normalizeFailureText("Error:  Cache   MISS, on-disk_v2!"),
    "error cache miss on-disk_v2",
    );

    // lowercases, collapses run-length whitespace, and trims
    assert.equal(normalizeFailureText("  A\t\tB\n\nC  "), "a b c");
  });

  it("strips the separators that an id hash input depends on", () => {
    // `/`, `.` and `|` all vanish — which is exactly why this normalizer must
    // never be applied to an id hash input.
    assert.equal(normalizeFailureText("specs/features/a/foo.spec.md|P"), "specsfeaturesafoospecmdp");
  });

  it("keeps Unicode letters and numbers", () => {
    assert.equal(normalizeFailureText("Café — Ünïcode 42!"), "café ünïcode 42");
  });

  it("is idempotent (normalizing an already-normalized string is a no-op)", () => {
    const once = normalizeFailureText("Error: Cache MISS, on-disk_v2!");
    assert.equal(normalizeFailureText(once), once);
  });

  it("returns an empty string for non-string input (+1 more contract assertions)", () => {
    // returns an empty string for non-string input
    assert.equal(normalizeFailureText(undefined), "");
    assert.equal(normalizeFailureText(null), "");
    assert.equal(normalizeFailureText(42), "");

    // normalizes a punctuation-only string to the empty string
    assert.equal(normalizeFailureText("!!!"), "");
  });
});

describe("normalizeIdInput", () => {
  it("preserves /, . and | and folds backslashes (+1 more contract assertions)", () => {
    // preserves /, . and | and folds backslashes
    assert.equal(
    normalizeIdInput(".context-index\\Specs\\Foo.spec.md|Some Pattern."),
    ".context-index/specs/foo.spec.md|some pattern.",
    );

    // does not collapse whitespace or trim (no punctuation stripping at all)
    assert.equal(normalizeIdInput("A  B "), "a  b ");
  });

  it("is idempotent", () => {
    const once = normalizeIdInput("Specs\\A\\B.spec.md|P");
    assert.equal(normalizeIdInput(once), once);
  });

  it("returns an empty string for non-string input", () => {
    assert.equal(normalizeIdInput(undefined), "");
    assert.equal(normalizeIdInput(null), "");
  });
});

describe("deriveDigest", () => {
  it("is the first 8 lowercase hex chars of sha256(normalizer(input)) (+1 more contract assertions)", () => {
    // is the first 8 lowercase hex chars of sha256(normalizer(input))
    assert.equal(
    deriveDigest("Error: cache miss", normalizeFailureText),
    sha8("error cache miss"),
    );
    assert.equal(deriveDigest("A\\B", normalizeIdInput), sha8("a/b"));

    // always returns 8 lowercase hex characters
    assert.match(deriveDigest("payload", normalizeFailureText), /^[0-9a-f]{8}$/);
  });

  it("never chooses a normalizer itself — the two produce different digests", () => {
    const input = "specs/features/a/foo.spec.md|P";
    assert.notEqual(
      deriveDigest(input, normalizeFailureText),
      deriveDigest(input, normalizeIdInput),
    );
  });

  it("reads no clock, path, or env — repeated calls are identical", () => {
    const first = deriveDigest("payload", normalizeFailureText);
    const previousCwd = process.cwd();
    try {
      process.env.ADEV_TEST_NOISE = "x";
      process.chdir("/");
      assert.equal(deriveDigest("payload", normalizeFailureText), first);
    } finally {
      process.chdir(previousCwd);
      delete process.env.ADEV_TEST_NOISE;
    }
  });

  it("rejects a missing or non-function normalizer rather than guessing one", () => {
    const isDigestError = (e) =>
      e.code === "HEURISTICS_DIGEST_ERROR" && /normalizer/i.test(e.message);
    assert.throws(() => deriveDigest("payload"), isDigestError);
    assert.throws(() => deriveDigest("payload", "normalizeFailureText"), isDigestError);
    assert.throws(() => deriveDigest("payload", null), isDigestError);
  });
});

describe("deriveSignature", () => {
  it("composes <origin>-<8hex> from the failure-text normalizer (+2 more contract assertions)", () => {
    // composes <origin>-<8hex> from the failure-text normalizer
    assert.match(deriveSignature("recover", "Error: cache miss"), /^recover-[0-9a-f]{8}$/);
    assert.equal(
    deriveSignature("recover", "Error: cache miss"),
    `recover-${sha8("error cache miss")}`,
    );

    // is stable across case, whitespace and punctuation drift
    assert.equal(
    deriveSignature("recover", "Error: cache miss"),
    deriveSignature("recover", "  ERROR   cache,  miss  "),
    );

    // keys on the origin prefix — the same text under two origins differs
    assert.notEqual(
    deriveSignature("recover", "Error: cache miss"),
    deriveSignature("validate", "Error: cache miss"),
    );
  });

  it("produces the same digest for the same text under different origins", () => {
    const a = deriveSignature("recover", "Error: cache miss").split("-")[1];
    const b = deriveSignature("validate", "Error: cache miss").split("-")[1];
    assert.equal(a, b);
  });
});

describe("deriveHeuristicId", () => {
  it("composes <prefix>-<8hex> over `<path>|<pattern>` under normalizeIdInput", () => {
    assert.equal(
      deriveHeuristicId("foo", "specs/features/a/foo.spec.md", "Some Pattern"),
      `foo-${sha8("specs/features/a/foo.spec.md|some pattern")}`,
    );
  });

  it("two distinct spec paths do not collide", () => {
    const a = deriveHeuristicId("x", "specs/features/a/foo.spec.md", "P");
    const b = deriveHeuristicId("x", "specs/features/b/foo.spec.md", "P");
    assert.notEqual(a, b);
  });

  it("two distinct patterns under one path do not collide", () => {
    const a = deriveHeuristicId("x", "specs/a.spec.md", "P1");
    const b = deriveHeuristicId("x", "specs/a.spec.md", "P2");
    assert.notEqual(a, b);
  });

  it("folds backslash path separators so two worktree spellings agree", () => {
    assert.equal(
      deriveHeuristicId("x", "specs\\features\\a\\foo.spec.md", "P"),
      deriveHeuristicId("x", "specs/features/a/foo.spec.md", "P"),
    );
  });

  it("the prefix is caller-supplied and never derived from the origin", () => {
    const asSpecSlug = deriveHeuristicId("foo", "specs/a.spec.md", "P");
    const asCategory = deriveHeuristicId("tool-failure", "specs/a.spec.md", "P");
    assert.ok(asSpecSlug.startsWith("foo-"));
    assert.ok(asCategory.startsWith("tool-failure-"));
    assert.equal(asSpecSlug.split("-").pop(), asCategory.split("-").pop());
  });

  it("yields an id the store itself accepts, not merely one that looks slug-shaped", () => {
    const id = deriveHeuristicId("validate-config-single-source", "specs/a.spec.md", "P");
    // validateEntry owns the safe-slug rule; asserting through it means a
    // change to that rule cannot silently diverge from what we derive here.
    validateEntry({
      id,
      scope: "heuristics",
      title: "t",
      pattern: "p",
      confidence: "low",
    });
  });
});
