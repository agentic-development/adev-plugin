/**
 * Task 2 — thread `signature` through the three write-path gates.
 *
 * Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
 * Covers Behaviors 5, 5a, 5b, 6.
 *
 * All three gates must pass, and adding `signature` to FIELD_ORDER alone is
 * insufficient: `writeHeuristic` builds `finalEntry` as an explicit object
 * literal on BOTH the update path and the new-entry path, so any field not
 * named there is discarded before serialization.
 *
 * The rule that is easy to get wrong: `signature` uses **existing-wins**
 * semantics, the opposite of the incoming-wins rule that `antiPattern` and
 * `tags` use immediately above it. A signature is an identity, not a
 * refinement — the charter states unconditionally that it is never rewritten
 * once assigned.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import {
  writeHeuristic,
  readHeuristics,
  validateEntry,
  serializeHeuristic,
} from "../../lib/heuristics.mjs";

let root;

beforeEach(() => {
  root = createTempDir();
});

afterEach(() => {
  cleanupTempDir(root);
});

/** Minimal valid entry, overridable per test. */
function entry(overrides = {}) {
  return {
    id: "sig-test",
    scope: "heuristics",
    title: "t",
    pattern: "p",
    confidence: "low",
    evidence: [],
    contradictedBy: [],
    ...overrides,
  };
}

function scopeFile(projectRoot, scope) {
  return join(projectRoot, ".context-index", "memory", "heuristics", `${scope}.md`);
}

async function readOne(projectRoot, id, scope = "heuristics") {
  const all = await readHeuristics(projectRoot, { module: scope });
  return all.find((e) => e.id === id);
}

// ── Gate a: validateEntry (Behavior 5a) ──────────────────────────────────

describe("validateEntry — signature is optional and validated", () => {
  it("accepts an entry with no signature", () => {
    validateEntry(entry());
  });

  it("accepts a well-formed signature", () => {
    validateEntry(entry({ signature: "recover-a1b2c3d4" }));
    validateEntry(entry({ signature: "a" }));
    validateEntry(entry({ signature: "0" }));
    validateEntry(entry({ signature: "a".repeat(64) }));
  });

  it("rejects a non-string signature", () => {
    for (const bad of [42, true, {}, ["recover-a1b2c3d4"]]) {
      assert.throws(
        () => validateEntry(entry({ signature: bad })),
        (e) => e.code === "HEURISTICS_SCHEMA_ERROR",
        `signature ${JSON.stringify(bad)} must be rejected`,
      );
    }
  });

  it("rejects a signature that does not match /^[a-z0-9][a-z0-9-]*$/", () => {
    for (const bad of ["-leading-hyphen", "Upper-Case", "has_underscore", "has space", "", "dots.here"]) {
      assert.throws(
        () => validateEntry(entry({ signature: bad })),
        (e) => e.code === "HEURISTICS_SCHEMA_ERROR",
        `signature '${bad}' must be rejected`,
      );
    }
  });

  it("rejects a signature longer than 64 characters", () => {
    assert.throws(
      () => validateEntry(entry({ signature: "a".repeat(65) })),
      (e) => e.code === "HEURISTICS_SCHEMA_ERROR",
    );
  });
});

// ── Gate c: FIELD_ORDER / serialization (Behavior 5c) ────────────────────

describe("serializeHeuristic — signature has a deterministic position", () => {
  it("emits signature between tags and confidence", () => {
    const out = serializeHeuristic(
      entry({ tags: ["x"], signature: "recover-a1b2c3d4" }),
    );
    const lines = out.split("\n");
    const tagsAt = lines.findIndex((l) => l.startsWith("tags:"));
    const sigAt = lines.findIndex((l) => l.startsWith("signature:"));
    const confAt = lines.findIndex((l) => l.startsWith("confidence:"));
    assert.ok(sigAt > tagsAt, "signature must follow tags");
    assert.ok(sigAt < confAt, "signature must precede confidence");
  });

  it("omits the line entirely when the entry has no signature", () => {
    assert.ok(!serializeHeuristic(entry()).includes("signature:"));
  });

  it("omits the line for an empty-string signature rather than emitting a bare key", () => {
    // A bare `signature: ` line would be re-read by parseHeuristicsFile as a
    // block-form array, which is how the same bug bit `antiPattern`.
    assert.ok(!serializeHeuristic(entry({ signature: "" })).includes("signature:"));
  });
});

// ── Gate b: writeHeuristic, both finalEntry literals (Behavior 5b) ───────

describe("writeHeuristic — signature round-trips on both paths", () => {
  it("round-trips on the NEW-entry path", async () => {
    await writeHeuristic(root, entry({ signature: "recover-a1b2c3d4" }));
    const stored = await readOne(root, "sig-test");
    assert.equal(stored.signature, "recover-a1b2c3d4");
  });

  it("the new-entry return value already carries the signature", async () => {
    const written = await writeHeuristic(root, entry({ signature: "recover-a1b2c3d4" }));
    assert.equal(written.signature, "recover-a1b2c3d4");
  });

  it("round-trips on the UPDATE path", async () => {
    await writeHeuristic(root, entry({ signature: "recover-a1b2c3d4" }));
    await writeHeuristic(root, entry({ title: "refined" }));
    const stored = await readOne(root, "sig-test");
    assert.equal(stored.signature, "recover-a1b2c3d4");
    assert.equal(stored.title, "refined");
  });

  it("survives serialization to disk, not just the in-memory return", async () => {
    await writeHeuristic(root, entry({ signature: "recover-a1b2c3d4" }));
    const raw = await readFile(scopeFile(root, "heuristics"), "utf8");
    assert.match(raw, /^signature: recover-a1b2c3d4$/m);
  });

  it("rejects a malformed signature at the writeHeuristic boundary, not just via validateEntry", async () => {
    await assert.rejects(
      () => writeHeuristic(root, entry({ signature: "Not A Signature" })),
      (e) => e.code === "HEURISTICS_SCHEMA_ERROR",
    );
    // Validation precedes the write, so nothing reached disk.
    assert.equal(await readOne(root, "sig-test"), undefined);
  });

  it("a signature assigned only on the SECOND write is adopted", async () => {
    // The stored entry has none, so existing-wins has nothing to protect.
    await writeHeuristic(root, entry());
    await writeHeuristic(root, entry({ signature: "validate-99887766" }));
    const stored = await readOne(root, "sig-test");
    assert.equal(stored.signature, "validate-99887766");
  });
});

// ── Existing-wins semantics (Behaviors 5a, 5b) ───────────────────────────

describe("writeHeuristic — the stored signature always wins", () => {
  it("stored signature wins when incoming omits it", async () => {
    await writeHeuristic(root, entry({ signature: "recover-a1b2c3d4" }));
    await writeHeuristic(root, entry());
    const stored = await readOne(root, "sig-test");
    assert.equal(stored.signature, "recover-a1b2c3d4");
  });

  it("stored signature wins when incoming carries the SAME one", async () => {
    await writeHeuristic(root, entry({ signature: "recover-a1b2c3d4" }));
    await writeHeuristic(root, entry({ signature: "recover-a1b2c3d4" }));
    const stored = await readOne(root, "sig-test");
    assert.equal(stored.signature, "recover-a1b2c3d4");
  });

  it("stored signature wins when incoming carries a DIFFERENT one", async () => {
    await writeHeuristic(root, entry({ signature: "recover-a1b2c3d4" }));
    const written = await writeHeuristic(root, entry({ signature: "validate-99887766" }));
    assert.equal(written.signature, "recover-a1b2c3d4");
    const stored = await readOne(root, "sig-test");
    assert.equal(stored.signature, "recover-a1b2c3d4");
  });

  it("a divergent incoming signature is a warning, not a throw", async () => {
    await writeHeuristic(root, entry({ signature: "recover-a1b2c3d4" }));
    // Must not throw: one id reached by two failure texts is informative,
    // not invalid.
    await writeHeuristic(root, entry({ signature: "validate-99887766" }));
  });

  it("the divergence is logged to stderr naming id, stored and incoming", async () => {
    await writeHeuristic(root, entry({ signature: "recover-a1b2c3d4" }));

    const captured = [];
    const original = process.stderr.write;
    process.stderr.write = (chunk) => {
      captured.push(String(chunk));
      return true;
    };
    try {
      await writeHeuristic(root, entry({ signature: "validate-99887766" }));
    } finally {
      process.stderr.write = original;
    }

    const log = captured.join("");
    assert.match(log, /sig-test/);
    assert.match(log, /recover-a1b2c3d4/);
    assert.match(log, /validate-99887766/);
  });

  it("no divergence warning is emitted when the signatures agree", async () => {
    await writeHeuristic(root, entry({ signature: "recover-a1b2c3d4" }));

    const captured = [];
    const original = process.stderr.write;
    process.stderr.write = (chunk) => {
      captured.push(String(chunk));
      return true;
    };
    try {
      await writeHeuristic(root, entry({ signature: "recover-a1b2c3d4" }));
    } finally {
      process.stderr.write = original;
    }

    assert.doesNotMatch(captured.join(""), /signature/i);
  });

  it("a malformed stored signature is discarded rather than preferred forever", async () => {
    // Reachable by hand-editing the store: parseHeuristicsFile does not
    // re-validate, so without this guard existing-wins would make the bad
    // value permanently unfixable.
    await writeHeuristic(root, entry());
    const file = scopeFile(root, "heuristics");
    const raw = await readFile(file, "utf8");
    await writeFile(file, raw.replace(/^confidence:/m, "signature: Bad Value\nconfidence:"));

    const written = await writeHeuristic(root, entry({ signature: "validate-99887766" }));
    assert.equal(written.signature, "validate-99887766");
  });

  it("antiPattern still uses incoming-wins — the opposite rule, unchanged", async () => {
    await writeHeuristic(root, entry({ signature: "recover-a1b2c3d4", antiPattern: "old" }));
    await writeHeuristic(root, entry({ antiPattern: "new" }));
    const stored = await readOne(root, "sig-test");
    assert.equal(stored.antiPattern, "new", "antiPattern is a refinement");
    assert.equal(stored.signature, "recover-a1b2c3d4", "signature is an identity");
  });
});

// ── Backward compatibility (Behavior 6) ──────────────────────────────────

describe("entries without a signature (Behavior 6)", () => {
  it("an entry written without a signature reads back with signature undefined", async () => {
    await writeHeuristic(root, entry());
    const stored = await readOne(root, "sig-test");
    assert.equal(stored.signature, undefined);
  });

  it("a pre-existing on-disk entry with no signature parses and is never rejected", async () => {
    await writeHeuristic(root, entry({ id: "legacy-entry" }));
    const raw = await readFile(scopeFile(root, "heuristics"), "utf8");
    assert.ok(!raw.includes("signature:"));
    const stored = await readOne(root, "legacy-entry");
    assert.equal(stored.id, "legacy-entry");
    assert.equal(stored.signature, undefined);
  });

  it("updating a signature-less entry leaves it signature-less", async () => {
    await writeHeuristic(root, entry());
    await writeHeuristic(root, entry({ title: "refined" }));
    const stored = await readOne(root, "sig-test");
    assert.equal(stored.signature, undefined);
    assert.equal(stored.title, "refined");
  });

  it("signature does not participate in id uniqueness", async () => {
    await writeHeuristic(root, entry({ id: "one", signature: "recover-a1b2c3d4" }));
    await writeHeuristic(root, entry({ id: "two", signature: "recover-a1b2c3d4" }));
    const all = await readHeuristics(root, { module: "heuristics" });
    assert.equal(all.length, 2);
    assert.equal(all.filter((e) => e.signature === "recover-a1b2c3d4").length, 2);
  });
});
