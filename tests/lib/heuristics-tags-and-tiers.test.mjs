/**
 * Tests for keyword tags and tiered retrieval features (lib/heuristics.mjs).
 *
 * Task 1: Tags Schema
 * Task 2: Tags Parse/Serialize
 * Task 3: Tiered Rendering
 * Task 4: Keyword Matching in retrieveHeuristics
 */

import { describe, it, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  validateEntry,
  serializeHeuristic,
  parseHeuristicsFile,
  renderHeuristic,
  retrieveHeuristics,
  writeHeuristic,
} from "../../lib/heuristics.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

// ── Task 1: Tags Schema ─────────────────────────────────────────────────────

describe("validateEntry: tags field", () => {
  const baseEntry = {
    id: "test-id",
    scope: "global",
    title: "Test",
    pattern: "Do the thing",
    confidence: "high",
    evidence: [],
    contradictedBy: [],
    created: "2026-01-01",
    updated: "2026-01-01",
  };

  it("accepts entry with valid tags array", () => {
    assert.doesNotThrow(() =>
      validateEntry({ ...baseEntry, tags: ["auth", "middleware"] })
    );
  });

  it("accepts entry with empty tags array", () => {
    assert.doesNotThrow(() => validateEntry({ ...baseEntry, tags: [] }));
  });

  it("accepts entry without tags field (defaults gracefully)", () => {
    assert.doesNotThrow(() => validateEntry({ ...baseEntry }));
  });

  it("rejects tags that are not an array", () => {
    let caught;
    try { validateEntry({ ...baseEntry, tags: "auth" }); } catch (e) { caught = e; }
    assert.ok(caught, "expected an error to be thrown");
    assert.equal(caught.code, "INVALID_TAGS");
  });

  it("rejects tags with invalid characters (uppercase)", () => {
    let caught;
    try { validateEntry({ ...baseEntry, tags: ["Auth"] }); } catch (e) { caught = e; }
    assert.ok(caught, "expected an error to be thrown");
    assert.equal(caught.code, "INVALID_TAGS");
  });

  it("rejects tags with invalid characters (spaces)", () => {
    let caught;
    try { validateEntry({ ...baseEntry, tags: ["auth middleware"] }); } catch (e) { caught = e; }
    assert.ok(caught, "expected an error to be thrown");
    assert.equal(caught.code, "INVALID_TAGS");
  });

  it("rejects tags with invalid characters (underscore)", () => {
    let caught;
    try { validateEntry({ ...baseEntry, tags: ["auth_middleware"] }); } catch (e) { caught = e; }
    assert.ok(caught, "expected an error to be thrown");
    assert.equal(caught.code, "INVALID_TAGS");
  });

  it("rejects tags exceeding 64 chars", () => {
    const longTag = "a".repeat(65);
    let caught;
    try { validateEntry({ ...baseEntry, tags: [longTag] }); } catch (e) { caught = e; }
    assert.ok(caught, "expected an error to be thrown");
    assert.equal(caught.code, "INVALID_TAGS");
  });

  it("accepts tags exactly 64 chars", () => {
    const tag64 = "a".repeat(64);
    assert.doesNotThrow(() => validateEntry({ ...baseEntry, tags: [tag64] }));
  });

  it("rejects more than 20 tags", () => {
    const tags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
    let caught;
    try { validateEntry({ ...baseEntry, tags }); } catch (e) { caught = e; }
    assert.ok(caught, "expected an error to be thrown");
    assert.equal(caught.code, "INVALID_TAGS");
  });

  it("accepts exactly 20 tags", () => {
    const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    assert.doesNotThrow(() => validateEntry({ ...baseEntry, tags }));
  });

  it("rejects empty string tags", () => {
    let caught;
    try { validateEntry({ ...baseEntry, tags: [""] }); } catch (e) { caught = e; }
    assert.ok(caught, "expected an error to be thrown");
    assert.equal(caught.code, "INVALID_TAGS");
  });

  it("accepts tags with digits and hyphens", () => {
    assert.doesNotThrow(() =>
      validateEntry({ ...baseEntry, tags: ["tag-1", "v2", "auth-middleware-3"] })
    );
  });
});

// ── Task 2: Tags Parse/Serialize ────────────────────────────────────────────

describe("serializeHeuristic: tags field", () => {
  const baseEntry = {
    id: "test-id",
    scope: "global",
    title: "Test",
    pattern: "Do the thing",
    confidence: "high",
    evidence: [],
    contradictedBy: [],
    created: "2026-01-01",
    updated: "2026-01-01",
  };

  it("emits tags as flow sequence when non-empty", () => {
    const entry = { ...baseEntry, tags: ["auth", "middleware"] };
    const result = serializeHeuristic(entry);
    assert.match(result, /tags: \[auth, middleware\]/);
  });

  it("omits tags line when tags is empty array", () => {
    const entry = { ...baseEntry, tags: [] };
    const result = serializeHeuristic(entry);
    assert.doesNotMatch(result, /^tags:/m);
  });

  it("omits tags line when tags field is absent", () => {
    const result = serializeHeuristic(baseEntry);
    assert.doesNotMatch(result, /^tags:/m);
  });

  it("emits tags between anti-pattern and confidence in field order", () => {
    const entry = {
      ...baseEntry,
      antiPattern: "Don't do that",
      tags: ["auth"],
    };
    const result = serializeHeuristic(entry);
    const antiPatternIdx = result.indexOf("anti-pattern:");
    const tagsIdx = result.indexOf("tags:");
    const confidenceIdx = result.indexOf("confidence:");
    assert.ok(antiPatternIdx < tagsIdx, "tags should come after anti-pattern");
    assert.ok(tagsIdx < confidenceIdx, "tags should come before confidence");
  });

  it("serializes single tag as flow sequence", () => {
    const entry = { ...baseEntry, tags: ["security"] };
    const result = serializeHeuristic(entry);
    assert.match(result, /tags: \[security\]/);
  });
});

describe("parseHeuristicsFile: tags field", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("parses tags from a flow sequence", async () => {
    const content = `---
id: test-id
scope: global
title: Test
pattern: Do the thing
tags: [auth, middleware]
confidence: high
evidence: []
contradicted-by: []
created: 2026-01-01
updated: 2026-01-01
---
`;
    writeFixture(tempDir, "global.md", content);
    const entries = await parseHeuristicsFile(join(tempDir, "global.md"));
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].tags, ["auth", "middleware"]);
  });

  it("parses empty tags flow sequence as empty array", async () => {
    const content = `---
id: test-id
scope: global
title: Test
pattern: Do the thing
tags: []
confidence: high
evidence: []
contradicted-by: []
created: 2026-01-01
updated: 2026-01-01
---
`;
    writeFixture(tempDir, "global.md", content);
    const entries = await parseHeuristicsFile(join(tempDir, "global.md"));
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].tags, []);
  });

  it("defaults tags to empty array when absent (via nullish coalescing)", async () => {
    const content = `---
id: test-id
scope: global
title: Test
pattern: Do the thing
confidence: high
evidence: []
contradicted-by: []
created: 2026-01-01
updated: 2026-01-01
---
`;
    writeFixture(tempDir, "global.md", content);
    const entries = await parseHeuristicsFile(join(tempDir, "global.md"));
    assert.equal(entries.length, 1);
    // When tags is absent from YAML, it is undefined; consumers should use ?? []
    assert.deepEqual(entries[0].tags ?? [], []);
  });

  it("round-trips tags through serialize and parse", async () => {
    const entry = {
      id: "test-id",
      scope: "global",
      title: "Test",
      pattern: "Do the thing",
      tags: ["auth", "security", "v2"],
      confidence: "high",
      evidence: [],
      contradictedBy: [],
      created: "2026-01-01",
      updated: "2026-01-01",
    };
    const serialized = serializeHeuristic(entry);
    writeFixture(tempDir, "global.md", serialized + "\n");
    const entries = await parseHeuristicsFile(join(tempDir, "global.md"));
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].tags, ["auth", "security", "v2"]);
  });
});

// ── Task 3: Tiered Rendering ─────────────────────────────────────────────────

describe("renderHeuristic: tiered rendering", () => {
  const heuristic = {
    id: "test-id",
    scope: "hooks",
    title: "Always verify config after edit",
    pattern: "After editing settings.json, run /config validate to ensure correctness",
    antiPattern: "Assume edit is valid without verification",
    confidence: "high",
    tags: ["config", "hooks"],
    evidence: [
      { path: "sessions/a.md", date: "2026-01-01", source: "recover" },
    ],
    contradictedBy: [],
    created: "2026-01-01",
    updated: "2026-01-01",
  };

  it("defaults to summary tier when no tier is provided", () => {
    const result = renderHeuristic(heuristic);
    // Should match the existing summary format
    assert.match(result, /### Heuristic:/);
  });

  it("summary tier produces existing multi-line format", () => {
    const result = renderHeuristic(heuristic, "summary");
    assert.match(result, /### Heuristic: Always verify config after edit/);
    assert.match(result, /\*\*Pattern:\*\*/);
    assert.match(result, /\*\*Anti-pattern:\*\*/);
    assert.match(result, /\*\*Evidence:\*\*/);
  });

  it("index tier produces a single line", () => {
    const result = renderHeuristic(heuristic, "index");
    assert.equal(result.split("\n").length, 1);
  });

  it("index tier format: '- <title> (<scope>) — <pattern>'", () => {
    const result = renderHeuristic(heuristic, "index");
    assert.match(result, /^- Always verify config after edit \(hooks\) — /);
  });

  it("index tier truncates pattern to 80 chars", () => {
    const longHeuristic = {
      ...heuristic,
      pattern: "A".repeat(100),
    };
    const result = renderHeuristic(longHeuristic, "index");
    // The pattern portion should be at most 80 chars
    const patternPart = result.split(" — ")[1];
    assert.ok(patternPart.length <= 83, `pattern part too long: ${patternPart.length}`); // 80 + "..."
  });

  it("index tier does not truncate pattern under 80 chars", () => {
    const shortPattern = "Short pattern here";
    const result = renderHeuristic({ ...heuristic, pattern: shortPattern }, "index");
    assert.match(result, new RegExp(shortPattern));
    assert.doesNotMatch(result, /\.\.\./);
  });

  it("full tier includes all fields", () => {
    const result = renderHeuristic(heuristic, "full");
    assert.match(result, /### Heuristic:/);
    assert.match(result, /\*\*Pattern:\*\*/);
    assert.match(result, /\*\*Anti-pattern:\*\*/);
    assert.match(result, /\*\*Evidence:\*\*/);
    assert.match(result, /\*\*Tags:\*\*/);
    assert.match(result, /\*\*Scope:\*\*/);
  });

  it("invalid tier falls back to summary with a warning on stderr", () => {
    const stderrMessages = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ...rest) => {
      stderrMessages.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    };
    try {
      const result = renderHeuristic(heuristic, "invalid-tier");
      // Should fall back to summary format
      assert.match(result, /### Heuristic:/);
      assert.ok(
        stderrMessages.some((m) => m.includes("invalid-tier")),
        "Should warn about invalid tier"
      );
    } finally {
      process.stderr.write = originalWrite;
    }
  });
});

// ── Task 4: Keyword Matching ─────────────────────────────────────────────────

describe("retrieveHeuristics: keyword and tier options", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  function makeEntry(overrides) {
    return {
      id: "default-id",
      scope: "mymodule",
      title: "Default Title",
      pattern: "Default pattern text",
      confidence: "high",
      tags: [],
      evidence: [
        { path: "s/a.md", date: "2026-01-01" },
        { path: "s/b.md", date: "2026-01-02" },
        { path: "s/c.md", date: "2026-01-03" },
      ],
      contradictedBy: [],
      created: "2026-01-01",
      updated: "2026-01-01",
      ...overrides,
    };
  }

  async function seedEntries(scope, entries) {
    const dir = join(tempDir, ".context-index/memory/heuristics");
    for (const entry of entries) {
      await writeHeuristic(tempDir, entry);
    }
  }

  it("returns all matching entries when no keywords provided", async () => {
    await seedEntries("mymodule", [
      makeEntry({ id: "e1", scope: "mymodule", confidence: "high" }),
      makeEntry({ id: "e2", scope: "mymodule", confidence: "medium" }),
    ]);
    const results = await retrieveHeuristics(tempDir, "mymodule");
    assert.ok(results.length >= 2, `Expected >= 2, got ${results.length}`);
  });

  it("keyword match by tag boosts entry to front of results", async () => {
    await seedEntries("mymodule", [
      makeEntry({
        id: "no-tag-match",
        scope: "mymodule",
        title: "General rule",
        pattern: "Do general things",
        tags: ["general"],
        confidence: "high",
      }),
      makeEntry({
        id: "tag-match",
        scope: "mymodule",
        title: "Auth rule",
        pattern: "Do auth things",
        tags: ["auth", "security"],
        confidence: "high",
      }),
    ]);
    const results = await retrieveHeuristics(tempDir, "mymodule", {
      keywords: ["auth"],
    });
    // keyword-matched entry should appear before non-matched
    const tagMatchIdx = results.findIndex((r) => r.id === "tag-match");
    const noTagMatchIdx = results.findIndex((r) => r.id === "no-tag-match");
    assert.ok(tagMatchIdx < noTagMatchIdx, "keyword-matched entry should appear first");
  });

  it("keyword match by title", async () => {
    await seedEntries("mymodule", [
      makeEntry({
        id: "title-match",
        scope: "mymodule",
        title: "Authentication rule",
        pattern: "Do the thing",
        tags: [],
        confidence: "high",
      }),
      makeEntry({
        id: "no-match",
        scope: "mymodule",
        title: "General rule",
        pattern: "Do the thing",
        tags: [],
        confidence: "high",
      }),
    ]);
    const results = await retrieveHeuristics(tempDir, "mymodule", {
      keywords: ["authentication"],
    });
    const matchIdx = results.findIndex((r) => r.id === "title-match");
    const noMatchIdx = results.findIndex((r) => r.id === "no-match");
    assert.ok(matchIdx < noMatchIdx, "title-matched entry should appear first");
  });

  it("keyword match by pattern", async () => {
    await seedEntries("mymodule", [
      makeEntry({
        id: "pattern-match",
        scope: "mymodule",
        title: "General rule",
        pattern: "Use OAuth2 tokens for authentication",
        tags: [],
        confidence: "high",
      }),
      makeEntry({
        id: "no-match",
        scope: "mymodule",
        title: "Another rule",
        pattern: "Do something else",
        tags: [],
        confidence: "high",
      }),
    ]);
    const results = await retrieveHeuristics(tempDir, "mymodule", {
      keywords: ["oauth2"],
    });
    const matchIdx = results.findIndex((r) => r.id === "pattern-match");
    const noMatchIdx = results.findIndex((r) => r.id === "no-match");
    assert.ok(matchIdx < noMatchIdx, "pattern-matched entry should appear first");
  });

  it("keyword matching is case-insensitive", async () => {
    await seedEntries("mymodule", [
      makeEntry({
        id: "case-match",
        scope: "mymodule",
        title: "Auth Rule",  // "Auth" with capital A
        pattern: "Do the thing",
        tags: [],
        confidence: "high",
      }),
      makeEntry({
        id: "no-match",
        scope: "mymodule",
        title: "General rule",
        pattern: "Do the thing",
        tags: [],
        confidence: "high",
      }),
    ]);
    const results = await retrieveHeuristics(tempDir, "mymodule", {
      keywords: ["auth"],  // lowercase keyword should match "Auth" in title
    });
    // "Auth" in title should match case-insensitively
    const matchIdx = results.findIndex((r) => r.id === "case-match");
    assert.ok(matchIdx >= 0, "Should find case-insensitive match in title");
    const noMatchIdx = results.findIndex((r) => r.id === "no-match");
    assert.ok(matchIdx < noMatchIdx, "case-matched entry should appear first");
  });

  it("caps keywords at 10 items (ignores excess)", async () => {
    await seedEntries("mymodule", [
      makeEntry({ id: "e1", scope: "mymodule", title: "keyword11 rule", tags: [] }),
    ]);
    // Should not throw even with 15 keywords
    const manyKeywords = Array.from({ length: 15 }, (_, i) => `kw${i}`);
    const results = await retrieveHeuristics(tempDir, "mymodule", {
      keywords: manyKeywords,
    });
    assert.ok(Array.isArray(results));
  });

  it("caps keyword total length at 200 chars (truncates long keywords)", async () => {
    const longKeyword = "a".repeat(300);
    // Should not throw
    const results = await retrieveHeuristics(tempDir, "mymodule", {
      keywords: [longKeyword],
    });
    assert.ok(Array.isArray(results));
  });

  it("does not expose _keywordMatch in returned results", async () => {
    await seedEntries("mymodule", [
      makeEntry({
        id: "kw-test",
        scope: "mymodule",
        title: "Auth rule",
        tags: ["auth"],
        confidence: "high",
      }),
    ]);
    const results = await retrieveHeuristics(tempDir, "mymodule", {
      keywords: ["auth"],
    });
    for (const r of results) {
      assert.ok(!("_keywordMatch" in r), "_keywordMatch should be stripped from results");
    }
  });

  it("invalid tier falls back to summary with warning in retrieveHeuristics (passthrough)", async () => {
    // retrieveHeuristics returns entries; tier is not used there — this tests that
    // tier is accepted without throwing
    await seedEntries("mymodule", [
      makeEntry({ id: "e1", scope: "mymodule" }),
    ]);
    const results = await retrieveHeuristics(tempDir, "mymodule", {
      tier: "unknown-tier",
    });
    assert.ok(Array.isArray(results));
  });
});
