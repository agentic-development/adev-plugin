// tests/cli/heuristics-signature.test.mjs
//
// Tests for `adev heuristics signature` (lib/cli/heuristics.mjs).
//
// Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
// Plan: .context-index/specs/features/heuristics/failure-signature-key.plan.md
//       Task 3 (derived mode) and Task 4 (inherited `--blocker-id` mode).
//
// The verb has TWO modes, not one:
//   derived   — origins recover | validate | implement. Hashes normalized
//               failure text via deriveSignature (Behaviors 1, 2, 4).
//   inherited — origin review-specs ONLY. Hashes nothing; it reuses the hash
//               component of the supplied blocker_id (Behaviors 3a, 3b).
//
// Exit-code / channel contract (Error Cases table):
//   INVALID_SIGNATURE_ORIGIN    exit 1, stdout empty, legal set printed
//   EMPTY_SIGNATURE_TEXT        exit 1, stdout empty
//   CONFLICTING_SIGNATURE_INPUT exit 1, stdout empty
//   INVALID_BLOCKER_ID          exit 1, stdout empty

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import {
  PLUGIN_ROOT,
  createTempDir,
  cleanupTempDir,
  writeFixture,
} from "../helpers.mjs";
import { deriveSignature, deriveDigest, normalizeFailureText } from "../../lib/heuristics.mjs";
import { buildBlockerId } from "../../lib/blocker-id.mjs";

const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");

function makeTempProject() {
  const dir = createTempDir();
  writeFixture(
    dir,
    ".context-index/manifest.yaml",
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
  );
  return dir;
}

const cleanup = cleanupTempDir;

/** Run `adev heuristics signature ...` inside an existing project dir. */
function runSignatureIn(dir, args) {
  const r = spawnSync("node", [CLI, "heuristics", "signature", ...args], {
    encoding: "utf8",
    cwd: dir,
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

/** Run `adev heuristics signature ...` in a throwaway temp project. */
function runSignature(args) {
  const dir = makeTempProject();
  try {
    return runSignatureIn(dir, args);
  } finally {
    cleanup(dir);
  }
}

// ── Derived mode (Task 3, Behaviors 1, 2, 4) ─────────────────────────────

test("derived mode prints <origin>-<8hex> and exits 0", () => {
  const r = runSignature(["--origin", "recover", "--text", "Error: cache miss"]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout.trim(), /^recover-[0-9a-f]{8}$/);
});

test("derived mode matches deriveSignature from lib/heuristics.mjs exactly", () => {
  const r = runSignature(["--origin", "recover", "--text", "Error: cache miss"]);
  assert.strictEqual(r.stdout.trim(), deriveSignature("recover", "Error: cache miss"));
});

test("case, whitespace and punctuation drift yield an identical digest", () => {
  const a = runSignature(["--origin", "recover", "--text", "Error: cache miss"]);
  const b = runSignature(["--origin", "recover", "--text", "  ERROR   cache,  miss  "]);
  assert.strictEqual(a.status, 0, a.stderr);
  assert.strictEqual(b.status, 0, b.stderr);
  assert.strictEqual(a.stdout.trim(), b.stdout.trim());
});

test("every legal derived origin is accepted and prefixes its own signature", () => {
  for (const origin of ["recover", "validate", "implement"]) {
    const r = runSignature(["--origin", origin, "--text", "Error: cache miss"]);
    assert.strictEqual(r.status, 0, `${origin}: ${r.stderr}`);
    assert.match(r.stdout.trim(), new RegExp(`^${origin}-[0-9a-f]{8}$`));
  }
});

test("derivation reads no path — the same text in two cwds yields the same signature", () => {
  const one = makeTempProject();
  const two = makeTempProject();
  try {
    const a = runSignatureIn(one, ["--origin", "validate", "--text", "Boom"]);
    const b = runSignatureIn(two, ["--origin", "validate", "--text", "Boom"]);
    assert.strictEqual(a.status, 0, a.stderr);
    assert.strictEqual(a.stdout.trim(), b.stdout.trim());
  } finally {
    cleanup(one);
    cleanup(two);
  }
});

// ── Origin validation (Behavior 3) ────────────────────────────────────────

test("illegal --origin exits 1 with INVALID_SIGNATURE_ORIGIN and empty stdout", () => {
  const r = runSignature(["--origin", "bogus", "--text", "x"]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /INVALID_SIGNATURE_ORIGIN/);
});

test("the rejection prints the legal set", () => {
  const r = runSignature(["--origin", "bogus", "--text", "x"]);
  for (const legal of ["recover", "validate", "review-specs", "implement"]) {
    assert.match(r.stderr, new RegExp(legal), `legal set must name '${legal}'`);
  }
});

test("a rejected origin carrying ANSI escapes and control chars is sanitized in the echo", () => {
  const nasty = "\u001b[31mred\u001b[0m\u0007\nbad";
  const r = runSignature(["--origin", nasty, "--text", "x"]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.ok(!r.stderr.includes("\u001b"), "ANSI escape must not be echoed");
  assert.ok(!r.stderr.includes("\u0007"), "control char must not be echoed");
  // The sanitized remnant is still shown so the operator can see what was sent.
  assert.match(r.stderr, /red/);
});

test("a rejected origin longer than the echo cap is truncated", () => {
  const long = "z".repeat(500);
  const r = runSignature(["--origin", long, "--text", "x"]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.ok(
    !r.stderr.includes("z".repeat(200)),
    "the echoed origin must be truncated well below its 500-char input",
  );
});

test("missing --origin exits 1 with empty stdout", () => {
  const r = runSignature(["--text", "x"]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /INVALID_SIGNATURE_ORIGIN|missing --origin/);
});

// ── Text validation (Behavior 1 / EMPTY_SIGNATURE_TEXT) ───────────────────

test("--text missing exits 1 with EMPTY_SIGNATURE_TEXT and empty stdout", () => {
  const r = runSignature(["--origin", "recover"]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /EMPTY_SIGNATURE_TEXT/);
});

test("--text that is empty exits 1 with EMPTY_SIGNATURE_TEXT", () => {
  const r = runSignature(["--origin", "recover", "--text", ""]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /EMPTY_SIGNATURE_TEXT/);
});

test("--text that normalizes to empty exits 1 with EMPTY_SIGNATURE_TEXT", () => {
  // Ordering matters: "!!!" is non-empty as an argument but normalizes to "".
  const r = runSignature(["--origin", "recover", "--text", "!!!"]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /EMPTY_SIGNATURE_TEXT/);
});

test("--text of only whitespace exits 1 with EMPTY_SIGNATURE_TEXT", () => {
  const r = runSignature(["--origin", "recover", "--text", "   \t  "]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /EMPTY_SIGNATURE_TEXT/);
});

test("origin validation precedes text validation", () => {
  // Both are wrong; the origin error is the one reported.
  const r = runSignature(["--origin", "bogus", "--text", "!!!"]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /INVALID_SIGNATURE_ORIGIN/);
  assert.doesNotMatch(r.stderr, /EMPTY_SIGNATURE_TEXT/);
});

// ── Mode conflicts (Behavior 3b — permanent rules, not Task-4 stubs) ──────

test("--origin review-specs with --text → CONFLICTING_SIGNATURE_INPUT", () => {
  const r = runSignature(["--origin", "review-specs", "--text", "some finding"]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /CONFLICTING_SIGNATURE_INPUT/);
});

test("--origin review-specs with neither --text nor --blocker-id → CONFLICTING_SIGNATURE_INPUT", () => {
  const r = runSignature(["--origin", "review-specs"]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /CONFLICTING_SIGNATURE_INPUT/);
});

test("--blocker-id with every non-review-specs origin → CONFLICTING_SIGNATURE_INPUT", () => {
  for (const origin of ["recover", "validate", "implement"]) {
    const r = runSignature([
      "--origin",
      origin,
      "--blocker-id",
      "structural-architect:mutable-hash-input:a15235f5",
    ]);
    assert.strictEqual(r.status, 1, origin);
    assert.strictEqual(r.stdout, "", origin);
    assert.match(r.stderr, /CONFLICTING_SIGNATURE_INPUT/, origin);
  }
});

test("an EMPTY --blocker-id still conflicts — the rule keys on the flag, not its value", () => {
  const r = runSignature(["--origin", "recover", "--text", "x", "--blocker-id", ""]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /CONFLICTING_SIGNATURE_INPUT/);
});

// ── Inherited mode (Task 4, Behaviors 3a, 3b) ────────────────────────────
//
// Inherited mode hashes NOTHING. It reuses the hash component that
// parseBlockerId already extracted, so one reviewer finding resolves to one
// identity across the retry loop and the store.

const SAMPLE_BLOCKER_ID = "structural-architect:mutable-hash-input:a15235f5";

test("inherited mode reuses the blocker_id hash component verbatim", () => {
  const r = runSignature(["--origin", "review-specs", "--blocker-id", SAMPLE_BLOCKER_ID]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout.trim(), "review-specs-a15235f5");
});

test("inherited mode hashes nothing — it differs from the derived signature of the same id text", () => {
  const r = runSignature(["--origin", "review-specs", "--blocker-id", SAMPLE_BLOCKER_ID]);
  assert.notStrictEqual(r.stdout.trim(), deriveSignature("review-specs", SAMPLE_BLOCKER_ID));
});

test("a blocker_id built by buildBlockerId round-trips into the signature", () => {
  const id = buildBlockerId({
    reviewer: "structural-architect",
    type: "mutable-hash-input",
    sectionAnchor: "behavior-8",
    findingText: "the migrated id claim is false when the stored pattern has drifted",
  });
  const hash = id.split(":")[2];
  const r = runSignature(["--origin", "review-specs", "--blocker-id", id]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout.trim(), `review-specs-${hash}`);
});

test("the same finding yields the same signature regardless of reviewer-slug or type", () => {
  // Only the location hash participates, so two findings that share it agree.
  const a = runSignature(["--origin", "review-specs", "--blocker-id", "alpha:one:a15235f5"]);
  const b = runSignature(["--origin", "review-specs", "--blocker-id", "beta:two:a15235f5"]);
  assert.strictEqual(a.status, 0, a.stderr);
  assert.strictEqual(a.stdout.trim(), b.stdout.trim());
});

test("two different blocker ids yield two different signatures", () => {
  const a = runSignature(["--origin", "review-specs", "--blocker-id", "alpha:one:a15235f5"]);
  const b = runSignature(["--origin", "review-specs", "--blocker-id", "alpha:one:b26346a6"]);
  assert.notStrictEqual(a.stdout.trim(), b.stdout.trim());
});

test("the inherited signature is a valid store signature", () => {
  const r = runSignature(["--origin", "review-specs", "--blocker-id", SAMPLE_BLOCKER_ID]);
  assert.match(r.stdout.trim(), /^[a-z0-9][a-z0-9-]{0,63}$/);
});

test("unparseable --blocker-id → INVALID_BLOCKER_ID, stdout empty", () => {
  const r = runSignature(["--origin", "review-specs", "--blocker-id", "not-an-id"]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /INVALID_BLOCKER_ID/);
});

test("a blocker_id whose hash component is not 8 lowercase hex → INVALID_BLOCKER_ID", () => {
  const r = runSignature(["--origin", "review-specs", "--blocker-id", "reviewer:type:NOTHEX12"]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /INVALID_BLOCKER_ID/);
});

test("a blocker_id with a non-kebab component → INVALID_BLOCKER_ID", () => {
  const r = runSignature([
    "--origin",
    "review-specs",
    "--blocker-id",
    "Reviewer_Slug:type:a15235f5",
  ]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /INVALID_BLOCKER_ID/);
});

test("an unparseable blocker id is sanitized before it is echoed", () => {
  const ESC = "\u001b";
  const r = runSignature([
    "--origin",
    "review-specs",
    "--blocker-id",
    `${ESC}[31ma:b:zzzzzzzz${ESC}[0m`,
  ]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.ok(!r.stderr.includes(ESC), "ANSI escape must not be echoed");
});

// ── --digest-only (Behavior 5a) ──────────────────────────────────────────
//
// The primitive half of the recover migration: `/adev:recover` composes its
// own `<category-slug>-<digest>` id, so it needs the digest WITHOUT the
// origin prefix that `deriveSignature` bakes in. `--origin` stays required
// (one argument shape for the verb, and origin errors still report first),
// but the digest itself does not depend on it.

test("--digest-only emits the bare 8-hex digest and nothing else", () => {
  const r = runSignature([
    "--origin",
    "recover",
    "--text",
    "Error: cache miss on third-party API",
    "--digest-only",
  ]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /^[0-9a-f]{8}\n$/);
  assert.strictEqual(r.stderr, "");
});

test("--digest-only agrees with deriveDigest from lib/heuristics.mjs exactly", () => {
  const text = "Error: cache miss on third-party API";
  const r = runSignature(["--origin", "recover", "--text", text, "--digest-only"]);
  assert.strictEqual(r.stdout.trim(), deriveDigest(text, normalizeFailureText));
});

test("--digest-only output is the digest half of the composed signature", () => {
  const composed = runSignature(["--origin", "recover", "--text", "boom"]);
  const bare = runSignature(["--origin", "recover", "--text", "boom", "--digest-only"]);
  assert.strictEqual(composed.status, 0, composed.stderr);
  assert.strictEqual(bare.status, 0, bare.stderr);
  assert.strictEqual(composed.stdout.trim(), `recover-${bare.stdout.trim()}`);
});

test("the digest does not depend on the origin", () => {
  const text = "Error: cache miss on third-party API";
  const base = runSignature(["--origin", "recover", "--text", text, "--digest-only"]);
  assert.strictEqual(base.status, 0, base.stderr);
  for (const origin of ["validate", "implement"]) {
    const r = runSignature(["--origin", origin, "--text", text, "--digest-only"]);
    assert.strictEqual(r.status, 0, `${origin}: ${r.stderr}`);
    assert.strictEqual(r.stdout.trim(), base.stdout.trim(), origin);
  }
});

test("--digest-only with --blocker-id → CONFLICTING_SIGNATURE_INPUT, exit 1", () => {
  const r = runSignature([
    "--origin",
    "review-specs",
    "--blocker-id",
    SAMPLE_BLOCKER_ID,
    "--digest-only",
  ]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /CONFLICTING_SIGNATURE_INPUT/);
});

test("--digest-only with --blocker-id conflicts on derived origins too", () => {
  const r = runSignature([
    "--origin",
    "recover",
    "--blocker-id",
    SAMPLE_BLOCKER_ID,
    "--digest-only",
  ]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /CONFLICTING_SIGNATURE_INPUT/);
});

test("--digest-only with --origin review-specs and no --blocker-id also conflicts", () => {
  const r = runSignature(["--origin", "review-specs", "--digest-only"]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /CONFLICTING_SIGNATURE_INPUT/);
});

test("the --digest-only conflict is reported ahead of a missing --text", () => {
  const r = runSignature([
    "--origin",
    "recover",
    "--blocker-id",
    SAMPLE_BLOCKER_ID,
    "--digest-only",
  ]);
  assert.match(r.stderr, /CONFLICTING_SIGNATURE_INPUT/);
  assert.doesNotMatch(r.stderr, /EMPTY_SIGNATURE_TEXT/);
});

test("an illegal --origin still reports ahead of any --digest-only conflict", () => {
  const r = runSignature(["--origin", "bogus", "--blocker-id", SAMPLE_BLOCKER_ID, "--digest-only"]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /INVALID_SIGNATURE_ORIGIN/);
  assert.doesNotMatch(r.stderr, /CONFLICTING_SIGNATURE_INPUT/);
});

test("--digest-only still requires --text to survive normalization", () => {
  const r = runSignature(["--origin", "recover", "--text", "!!!", "--digest-only"]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /EMPTY_SIGNATURE_TEXT/);
});

test("--digest-only with no --text at all → EMPTY_SIGNATURE_TEXT", () => {
  const r = runSignature(["--origin", "recover", "--digest-only"]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /EMPTY_SIGNATURE_TEXT/);
});

test("absence of the flag leaves the composed output byte-identical", () => {
  const r = runSignature(["--origin", "recover", "--text", "Error: cache miss"]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, `${deriveSignature("recover", "Error: cache miss")}\n`);
  assert.strictEqual(r.stderr, "");
});

// ── Help surface ─────────────────────────────────────────────────────────

test("help() documents both signature modes", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "heuristics", "--help"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /signature/);
    assert.match(r.stdout, /--origin/);
    assert.match(r.stdout, /--blocker-id/);
    assert.match(r.stdout, /--digest-only/);
  } finally {
    cleanup(dir);
  }
});

