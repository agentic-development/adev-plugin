/**
 * Tests for signature-aware retrieval in `retrieveHeuristics` (lib/heuristics.mjs).
 *
 * Shared suite for the signature/recurrence retrieval behaviors:
 *   Behavior 1: `signature` option and signature-primary ranking
 *
 * Fixture note: `validateEntry` enforces SIGNATURE_PATTERN, so `writeHeuristic`
 * cannot seed an entry carrying a malformed signature. Those fixtures are
 * written straight to the scope file via `serializeEntries` + `writeFixture`,
 * which is the exact on-disk format `writeHeuristic` produces but skips
 * validation.
 */

import { describe, it, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  retrieveHeuristics,
  writeHeuristic,
  serializeEntries,
  parseHeuristicsFile,
  validateEntry,
} from "../../lib/heuristics.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const MODULE = "mymodule";

/** Relative path of a module's scope file inside the project root. */
function scopeFileRelPath(module) {
  return `.context-index/memory/heuristics/${module}.md`;
}

/**
 * Build a heuristic entry. Defaults to a single evidence path so `autoPromote`
 * (which promotes at >= 3 distinct paths) never rewrites the caller's
 * confidence out from under a fixture.
 */
function makeEntry(overrides = {}) {
  return {
    id: "default-id",
    scope: MODULE,
    title: "Default Title",
    pattern: "Default pattern text",
    confidence: "high",
    tags: [],
    evidence: [{ path: "s/a.md", date: "2026-01-01" }],
    contradictedBy: [],
    created: "2026-01-01",
    updated: "2026-01-01",
    ...overrides,
  };
}

/** Seed entries through the validating write path. */
async function seedEntries(tempDir, entries) {
  for (const entry of entries) {
    await writeHeuristic(tempDir, entry);
  }
}

/**
 * Seed a scope file directly, bypassing `validateEntry`. Required for entries
 * whose stored `signature` is malformed.
 */
function seedRawScopeFile(tempDir, module, entries) {
  writeFixture(tempDir, scopeFileRelPath(module), serializeEntries(entries));
}

describe("retrieveHeuristics: signature-primary ranking", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("ranks an exact signature match above a higher-confidence non-match", async () => {
    await seedEntries(tempDir, [
      makeEntry({ id: "a", confidence: "high" }),
      makeEntry({ id: "b", confidence: "medium", signature: "validate-abc" }),
    ]);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: "validate-abc",
    });

    assert.equal(
      out[0].id,
      "b",
      `expected signature match 'b' first, got ${out.map((e) => e.id).join(", ")}`,
    );
    assert.deepEqual(out.map((e) => e.id), ["b", "a"]);
  });

  it("ranks a signature match above a keyword match", async () => {
    await seedEntries(tempDir, [
      makeEntry({
        id: "kw",
        confidence: "high",
        title: "Auth rule",
        tags: ["auth"],
      }),
      makeEntry({
        id: "sig",
        confidence: "medium",
        title: "General rule",
        tags: ["general"],
        signature: "validate-abc",
      }),
    ]);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: "validate-abc",
      keywords: ["auth"],
    });

    assert.equal(
      out[0].id,
      "sig",
      `expected signature match ahead of keyword match, got ${out.map((e) => e.id).join(", ")}`,
    );
    assert.deepEqual(out.map((e) => e.id), ["sig", "kw"]);
  });
});

describe("retrieveHeuristics: signature option is inert when absent", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("produces byte-identical results with no signature and an undefined signature", async () => {
    await seedEntries(tempDir, [
      makeEntry({ id: "a", confidence: "high" }),
      makeEntry({ id: "b", confidence: "medium", signature: "validate-abc" }),
      makeEntry({ id: "c", confidence: "medium", signature: "validate-xyz" }),
    ]);

    const baseline = await retrieveHeuristics(tempDir, MODULE, {});
    const withUndefined = await retrieveHeuristics(tempDir, MODULE, {
      signature: undefined,
    });

    assert.deepEqual(withUndefined, baseline);
    // Ordering must remain confidence-first for the existing entry-time callers.
    assert.equal(baseline[0].id, "a");
  });

  it("degrades a non-string or blank signature to 'no match' without throwing", async () => {
    await seedEntries(tempDir, [
      makeEntry({ id: "a", confidence: "high" }),
      makeEntry({ id: "b", confidence: "medium", signature: "validate-abc" }),
    ]);

    const baseline = await retrieveHeuristics(tempDir, MODULE, {});

    for (const bad of ["", "   ", 42, null, {}, []]) {
      const out = await retrieveHeuristics(tempDir, MODULE, { signature: bad });
      assert.deepEqual(
        out,
        baseline,
        `signature ${JSON.stringify(bad)} should behave as no signature`,
      );
    }
  });
});

describe("retrieveHeuristics: malformed stored signature", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  const MALFORMED = "Validate_ABC";

  it("round-trips a malformed stored signature verbatim (fixture sanity)", async () => {
    seedRawScopeFile(tempDir, MODULE, [
      makeEntry({ id: "malformed", confidence: "medium", signature: MALFORMED }),
    ]);

    const parsed = await parseHeuristicsFile(
      join(tempDir, scopeFileRelPath(MODULE)),
    );
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].signature, MALFORMED);

    // Prove the stored value really is malformed by the schema's own rule.
    let caught;
    try {
      validateEntry(parsed[0]);
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, "expected validateEntry to reject the malformed signature");
    assert.equal(caught.code, "HEURISTICS_SCHEMA_ERROR");
  });

  it("skips a malformed stored signature for matching but still returns the entry", async () => {
    // Callers derive the query signature from `deriveValidateFailureSignature`,
    // so it is always well-formed. A malformed stored value can therefore never
    // be equal to it — matching is exact and the stored value is not normalized.
    seedRawScopeFile(tempDir, MODULE, [
      makeEntry({ id: "malformed", confidence: "medium", signature: MALFORMED }),
      makeEntry({ id: "plain", confidence: "high" }),
      makeEntry({ id: "good", confidence: "medium", signature: "validate-abc" }),
    ]);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: "validate-abc",
    });

    const ids = out.map((e) => e.id);
    // The well-formed match still wins the top slot.
    assert.equal(ids[0], "good", `expected 'good' first, got ${ids.join(", ")}`);
    // The malformed entry is still returned under module scope.
    assert.ok(
      ids.includes("malformed"),
      `malformed-signature entry must remain available under module scope, got ${ids.join(", ")}`,
    );
    // But it got no signature boost: it stays behind the higher-confidence entry.
    assert.ok(
      ids.indexOf("plain") < ids.indexOf("malformed"),
      `malformed stored signature must not match, got ${ids.join(", ")}`,
    );
  });
});

describe("retrieveHeuristics: internal signature tag does not leak", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("strips _signatureMatch from every returned entry", async () => {
    await seedEntries(tempDir, [
      makeEntry({ id: "a", confidence: "high" }),
      makeEntry({ id: "b", confidence: "medium", signature: "validate-abc" }),
    ]);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: "validate-abc",
      keywords: ["auth"],
    });

    assert.ok(out.length > 0, "expected at least one entry");
    for (const entry of out) {
      assert.equal(
        "_signatureMatch" in entry,
        false,
        `_signatureMatch leaked on '${entry.id}'`,
      );
      assert.equal("_keywordMatch" in entry, false);
      assert.equal("_scopePriority" in entry, false);
    }
  });
});
