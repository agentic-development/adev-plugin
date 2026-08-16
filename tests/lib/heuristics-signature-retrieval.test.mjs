/**
 * Tests for signature-aware retrieval in `retrieveHeuristics` (lib/heuristics.mjs).
 *
 * Shared suite for the signature/recurrence retrieval behaviors:
 *   Behavior 1: `signature` option and signature-primary ranking
 *   Behavior 2: exact signature matches are exempt from the `low` floor
 *   Behavior 3: an entry is allocated once even when it matches several axes
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

describe("retrieveHeuristics: low-floor exemption for exact signature matches", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("returns a low-confidence entry on an exact signature match", async () => {
    await seedEntries(tempDir, [
      makeEntry({ id: "low-sig", confidence: "low", signature: "validate-abc" }),
    ]);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: "validate-abc",
    });

    const ids = out.map((e) => e.id);
    assert.ok(
      ids.includes("low-sig"),
      `expected the low-confidence signature match to be returned, got ${ids.join(", ") || "(none)"}`,
    );
  });

  it("still excludes a low-confidence entry that does not match the signature", async () => {
    await seedEntries(tempDir, [
      makeEntry({ id: "low-sig", confidence: "low", signature: "validate-abc" }),
      makeEntry({ id: "low-nomatch", confidence: "low", signature: "validate-xyz" }),
    ]);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: "validate-abc",
    });

    const ids = out.map((e) => e.id);
    assert.ok(ids.includes("low-sig"), `expected 'low-sig', got ${ids.join(", ") || "(none)"}`);
    assert.equal(
      ids.includes("low-nomatch"),
      false,
      `the exemption must not leak to non-matching low entries, got ${ids.join(", ")}`,
    );
  });

  it("still excludes every low-confidence entry when no signature is passed", async () => {
    await seedEntries(tempDir, [
      makeEntry({ id: "low-sig", confidence: "low", signature: "validate-abc" }),
      makeEntry({ id: "low-nomatch", confidence: "low" }),
      makeEntry({ id: "hi", confidence: "high" }),
    ]);

    const out = await retrieveHeuristics(tempDir, MODULE, {});

    assert.deepEqual(
      out.map((e) => e.id),
      ["hi"],
      "no-signature retrieval must keep the low floor for every entry",
    );
  });

  it("ranks a low signature match above an unrelated medium module entry", async () => {
    await seedEntries(tempDir, [
      makeEntry({ id: "med", confidence: "medium" }),
      makeEntry({ id: "low-sig", confidence: "low", signature: "validate-abc" }),
    ]);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: "validate-abc",
    });

    const ids = out.map((e) => e.id);
    assert.equal(
      ids[0],
      "low-sig",
      `expected the low signature match first, got ${ids.join(", ") || "(none)"}`,
    );
  });
});

describe("retrieveHeuristics: signature-first off-the-top budget allocation", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  const SIG = "validate-abc";

  /** Count returned entries carrying the queried signature. */
  function countSignature(entries, signature) {
    return entries.filter((e) => e.signature === signature).length;
  }

  /** Count returned entries at a given confidence. */
  function countConfidence(entries, confidence) {
    return entries.filter((e) => e.confidence === confidence).length;
  }

  it("takes signature matches off the top, then splits only the remainder", async () => {
    // 2 matches + plenty of non-matching filler. limit 3 => remaining 1,
    // highMax = ceil(1 * 5 / 8) = 1, mediumMax = 0.
    await seedEntries(tempDir, [
      makeEntry({ id: "sig-1", confidence: "medium", signature: SIG }),
      makeEntry({ id: "sig-2", confidence: "medium", signature: SIG }),
      makeEntry({ id: "h1", confidence: "high" }),
      makeEntry({ id: "h2", confidence: "high" }),
      makeEntry({ id: "h3", confidence: "high" }),
      makeEntry({ id: "m1", confidence: "medium" }),
    ]);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: SIG,
      injectionLimit: 3,
    });

    assert.equal(
      out.length,
      3,
      `expected exactly 3 entries (2 signature + 1 from the remainder), got ${out.length}: ${out.map((e) => e.id).join(", ")}`,
    );
    assert.equal(
      countSignature(out, SIG),
      2,
      `expected both signature matches retained, got ${out.map((e) => e.id).join(", ")}`,
    );
  });

  it("never exceeds injectionLimit when signature matches are plentiful", async () => {
    const many = [];
    for (let i = 0; i < 10; i++) {
      many.push(
        makeEntry({ id: `many-${i}`, confidence: "high", signature: "validate-many" }),
      );
    }
    await seedEntries(tempDir, many);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: "validate-many",
      injectionLimit: 2,
    });

    assert.equal(
      out.length,
      2,
      `signature phase must be capped at injectionLimit; got ${out.length} entries: ${out.map((e) => e.id).join(", ")}`,
    );
  });

  it("is arithmetically identical to the no-signature split when nothing matches", async () => {
    // 7 high + 5 medium, none carrying a signature. limit 8 =>
    // highMax = ceil(8 * 5 / 8) = 5, mediumMax = 3.
    const filler = [];
    for (let i = 0; i < 7; i++) {
      filler.push(makeEntry({ id: `h${i}`, confidence: "high" }));
    }
    for (let i = 0; i < 5; i++) {
      filler.push(makeEntry({ id: `m${i}`, confidence: "medium" }));
    }
    await seedEntries(tempDir, filler);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: "validate-nomatch",
      injectionLimit: 8,
    });
    const baseline = await retrieveHeuristics(tempDir, MODULE, {
      injectionLimit: 8,
    });

    assert.equal(out.length, 8, `expected 8 entries, got ${out.length}`);
    assert.equal(
      countConfidence(out, "high"),
      5,
      `expected exactly 5 high, got ${countConfidence(out, "high")}`,
    );
    assert.equal(
      countConfidence(out, "medium"),
      3,
      `expected exactly 3 medium, got ${countConfidence(out, "medium")}`,
    );
    assert.deepEqual(
      out,
      baseline,
      "zero signature matches must leave the existing split byte-identical",
    );
  });

  it("retains a low signature match and drops an unrelated medium at limit 1", async () => {
    await seedEntries(tempDir, [
      makeEntry({ id: "low-sig", confidence: "low", signature: SIG }),
      makeEntry({ id: "med", confidence: "medium" }),
    ]);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: SIG,
      injectionLimit: 1,
    });

    assert.equal(
      out.length,
      1,
      `expected exactly 1 entry, got ${out.length}: ${out.map((e) => e.id).join(", ")}`,
    );
    assert.equal(
      out[0].id,
      "low-sig",
      `drop order follows ranking, not confidence: expected 'low-sig', got '${out[0].id}'`,
    );
  });

  it("retains a low signature match and drops an unrelated high at limit 1", async () => {
    // Sharper form of the drop-order case: the non-match is `high`, which the
    // remainder split would otherwise admit first.
    await seedEntries(tempDir, [
      makeEntry({ id: "low-sig", confidence: "low", signature: SIG }),
      makeEntry({ id: "hi", confidence: "high" }),
    ]);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: SIG,
      injectionLimit: 1,
    });

    assert.equal(
      out.length,
      1,
      `expected exactly 1 entry, got ${out.length}: ${out.map((e) => e.id).join(", ")}`,
    );
    assert.equal(
      out[0].id,
      "low-sig",
      `expected the signature match to win the only slot, got '${out[0].id}'`,
    );
  });

  it("recomputes the bucket sizes from the remainder, not the full limit", async () => {
    // Arithmetic boundary: 1 match at limit 8 => remaining 7, so
    // highMax = ceil(7 * 5 / 8) = 5 and mediumMax = 2 (NOT the 5/3 split of
    // the full limit). The match is `low` so it lands in neither bucket.
    const filler = [makeEntry({ id: "sig-1", confidence: "low", signature: SIG })];
    for (let i = 0; i < 6; i++) {
      filler.push(makeEntry({ id: `h${i}`, confidence: "high" }));
    }
    for (let i = 0; i < 4; i++) {
      filler.push(makeEntry({ id: `m${i}`, confidence: "medium" }));
    }
    await seedEntries(tempDir, filler);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: SIG,
      injectionLimit: 8,
    });

    assert.equal(
      out.length,
      8,
      `expected exactly 8 entries, got ${out.length}: ${out.map((e) => e.id).join(", ")}`,
    );
    assert.equal(countSignature(out, SIG), 1, "expected the single signature match");
    assert.equal(
      countConfidence(out, "high"),
      5,
      `expected ceil(7 * 5 / 8) = 5 high, got ${countConfidence(out, "high")}`,
    );
    assert.equal(
      countConfidence(out, "medium"),
      2,
      `expected 7 - 5 = 2 medium, got ${countConfidence(out, "medium")}`,
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

describe("retrieveHeuristics: an entry is allocated once across all axes", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  const SIG = "validate-abc";
  const KEYWORD = "auth";

  it("returns an entry matching BOTH signature and keyword exactly once", async () => {
    await seedEntries(tempDir, [
      makeEntry({
        id: "both-axes",
        confidence: "high",
        signature: SIG,
        title: "Auth token refresh rule",
        pattern: "When auth tokens expire, refresh before retrying",
        tags: ["auth"],
      }),
      makeEntry({ id: "plain", confidence: "high", title: "Unrelated", tags: ["misc"] }),
    ]);

    // Fixture proof, axis 1 (keyword): a keyword-only query with no signature
    // must already return the entry. Without this, the both-axes assertion
    // below could pass vacuously because the entry never matched the keyword.
    const keywordOnly = await retrieveHeuristics(tempDir, MODULE, {
      keywords: [KEYWORD],
    });
    assert.ok(
      keywordOnly.some((e) => e.id === "both-axes"),
      `fixture does not match the keyword axis: ${keywordOnly.map((e) => e.id).join(", ") || "(none)"}`,
    );

    // Fixture proof, axis 2 (signature): the stored signature is the queried one.
    const signatureOnly = await retrieveHeuristics(tempDir, MODULE, { signature: SIG });
    const seeded = signatureOnly.find((e) => e.id === "both-axes");
    assert.ok(seeded, "fixture missing from a signature-only query");
    assert.equal(seeded.signature, SIG, "fixture does not carry the queried signature");

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: SIG,
      keywords: [KEYWORD],
    });

    const ids = out.map((e) => e.id);
    assert.ok(
      ids.includes("both-axes"),
      `expected the both-axes entry to be returned, got ${ids.join(", ") || "(none)"}`,
    );
    assert.equal(
      out.filter((e) => e.id === "both-axes").length,
      1,
      `an entry matching both axes must be allocated once, got ${ids.join(", ")}`,
    );
  });

  it("returns no duplicate ids under any axis combination", async () => {
    await seedEntries(tempDir, [
      makeEntry({ id: "sig-only", confidence: "high", signature: SIG, title: "Signature only", tags: ["misc"] }),
      makeEntry({ id: "sig-only-low", confidence: "low", signature: SIG, title: "Signature only low", tags: ["misc"] }),
      makeEntry({ id: "kw-one", confidence: "high", title: "Auth handling", tags: ["auth"] }),
      makeEntry({ id: "kw-two", confidence: "medium", title: "Retry rule", pattern: "retry on failure", tags: ["retry"] }),
      makeEntry({
        id: "both-axes",
        confidence: "medium",
        signature: SIG,
        title: "Auth retry rule",
        pattern: "auth retry backoff",
        tags: ["auth", "retry"],
      }),
      makeEntry({ id: "neither-one", confidence: "high", title: "Unrelated one", tags: ["misc"] }),
      makeEntry({ id: "neither-two", confidence: "medium", title: "Unrelated two", tags: ["misc"] }),
    ]);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: SIG,
      keywords: [KEYWORD, "retry"],
      injectionLimit: 8,
    });

    const ids = out.map((e) => e.id);
    assert.ok(ids.includes("both-axes"), `expected 'both-axes' in ${ids.join(", ") || "(none)"}`);
    assert.equal(
      new Set(ids).size,
      out.length,
      `duplicate ids returned: ${ids.join(", ")}`,
    );
  });
});

describe("retrieveHeuristics: unmatched-signature fallback to module scope", () => {
  let tempDir;

  /** A well-formed signature that no seeded entry carries. */
  const UNMATCHED_SIG = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

  /**
   * Seed 6 `high` + 4 `medium` entries, none carrying a signature. Ten eligible
   * entries is deliberately more than any cap under test (3 and 8), so a cap
   * assertion cannot pass merely because the store was too small to exceed it.
   */
  async function seedTenEligible(dir) {
    const entries = [];
    for (let i = 0; i < 6; i++) {
      entries.push(makeEntry({ id: `high-${i}`, confidence: "high", title: `High ${i}` }));
    }
    for (let i = 0; i < 4; i++) {
      entries.push(makeEntry({ id: `medium-${i}`, confidence: "medium", title: `Medium ${i}` }));
    }
    await seedEntries(dir, entries);
    return entries.length;
  }

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("falls back to module scope rather than returning empty when the signature matches nothing", async () => {
    await seedTenEligible(tempDir);

    const out = await retrieveHeuristics(tempDir, MODULE, { signature: UNMATCHED_SIG });

    // A FIRST occurrence of a failure matches no stored signature by
    // definition. Blanking the context on the modal path would be worse than
    // having no signature support at all.
    assert.ok(
      out.length > 0,
      "an unmatched signature must fall back to module-scope retrieval, got an empty result",
    );
    assert.ok(
      out.every((e) => e.signature === undefined),
      `fallback fixture must carry no signatures, got ${out.map((e) => e.signature).join(", ")}`,
    );
  });

  it("bounds the unmatched-signature fallback by the caller's cap, never the entry-time default", async () => {
    const seeded = await seedTenEligible(tempDir);
    assert.ok(seeded > 3, `fixture must exceed the cap under test, seeded ${seeded}`);

    const out = await retrieveHeuristics(tempDir, MODULE, {
      signature: UNMATCHED_SIG,
      injectionLimit: 3,
    });

    // The cap genuinely binds: 10 eligible entries, caller asked for 3.
    // Substituting the default 8 here would inject 8 unrelated entries on top
    // of the entry-time injection that already happened.
    assert.equal(
      out.length,
      3,
      `expected the caller's cap of 3 to bind over ${seeded} eligible entries, got ${out.length}: ${out.map((e) => e.id).join(", ")}`,
    );
  });

  it("keeps the default budget of 8 for entry-time callers that pass no signature", async () => {
    const seeded = await seedTenEligible(tempDir);
    assert.ok(seeded > 8, `fixture must exceed the default budget, seeded ${seeded}`);

    const out = await retrieveHeuristics(tempDir, MODULE, {});

    // Deterministic by construction: with limit 8 the split is 5 high / 3
    // medium, and the fixture supplies 6 high and 4 medium, so both buckets
    // fill exactly.
    assert.equal(
      out.length,
      8,
      `expected the default budget of 8 to fill exactly, got ${out.length}: ${out.map((e) => e.id).join(", ")}`,
    );
    assert.equal(out.filter((e) => e.confidence === "high").length, 5);
    assert.equal(out.filter((e) => e.confidence === "medium").length, 3);
  });
});
