/**
 * Tests for lib/heuristics.mjs
 */

import { describe, it, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import * as heuristics from "../../lib/heuristics.mjs";
import {
  addContradiction,
  archiveHeuristic,
  atomicWrite,
  demoteHeuristic,
  parseHeuristicsFile,
  promoteHeuristic,
  readHeuristics,
  serializeHeuristic,
  validateEntry,
  validateProjectRoot,
  writeHeuristic,
} from "../../lib/heuristics.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

// ── Task 1: Smoke Test ──────────────────────────────────────────────────────

describe("heuristics module", () => {
  it("exports all six named functions", () => {
    assert.equal(typeof heuristics.readHeuristics, "function");
    assert.equal(typeof heuristics.writeHeuristic, "function");
    assert.equal(typeof heuristics.promoteHeuristic, "function");
    assert.equal(typeof heuristics.demoteHeuristic, "function");
    assert.equal(typeof heuristics.archiveHeuristic, "function");
    assert.equal(typeof heuristics.addContradiction, "function");
  });
});

// ── Task 2: parseHeuristicsFile ─────────────────────────────────────────────

describe("parseHeuristicsFile", () => {
  let tempDir;
  let capturedStderr;
  let originalStderrWrite;

  beforeEach(() => {
    tempDir = createTempDir();
    capturedStderr = [];
    originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ...rest) => {
      capturedStderr.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    };
  });

  afterEach(() => {
    process.stderr.write = originalStderrWrite;
    cleanupTempDir(tempDir);
  });

  it("parses a file with two well-formed entries", async () => {
    const content = `---
id: always-verify-config
scope: hooks
title: Always verify config after edit
pattern: After editing settings.json, run /config validate
anti-pattern: Assume edit is valid without verification
confidence: high
evidence:
  - path: sessions/2026-04-01-abc.md
    date: 2026-04-01
    source: recover
  - path: sessions/2026-04-05-def.md
    date: 2026-04-05
    source: validate
contradicted-by: []
created: 2026-04-01
updated: 2026-04-05
---

Optional body text for humans.

---
id: another-heuristic
scope: hooks
title: Another rule
pattern: Do the thing
confidence: low
evidence:
  - path: sessions/foo.md
    date: 2026-04-02
    source: validate
contradicted-by: []
created: 2026-04-02
updated: 2026-04-02
---
`;
    writeFixture(tempDir, "hooks.md", content);

    const entries = await parseHeuristicsFile(join(tempDir, "hooks.md"));

    assert.equal(entries.length, 2);

    const first = entries[0];
    assert.equal(first.id, "always-verify-config");
    assert.equal(first.scope, "hooks");
    assert.equal(first.title, "Always verify config after edit");
    assert.equal(first.pattern, "After editing settings.json, run /config validate");
    assert.equal(first.antiPattern, "Assume edit is valid without verification");
    assert.equal(first.confidence, "high");
    assert.deepEqual(first.contradictedBy, []);
    assert.equal(first.created, "2026-04-01");
    assert.equal(first.updated, "2026-04-05");
    assert.ok(Array.isArray(first.evidence));
    assert.equal(first.evidence.length, 2);
    assert.deepEqual(first.evidence[0], {
      path: "sessions/2026-04-01-abc.md",
      date: "2026-04-01",
      source: "recover",
    });
    assert.deepEqual(first.evidence[1], {
      path: "sessions/2026-04-05-def.md",
      date: "2026-04-05",
      source: "validate",
    });

    const second = entries[1];
    assert.equal(second.id, "another-heuristic");
    assert.equal(second.confidence, "low");
    assert.equal(second.evidence.length, 1);
    assert.deepEqual(second.evidence[0], {
      path: "sessions/foo.md",
      date: "2026-04-02",
      source: "validate",
    });
  });

  it("skips malformed blocks and logs a single-line stderr warning", async () => {
    // First block: well-formed
    // Second block: malformed (no id field)
    const content = `---
id: good-one
scope: hooks
title: A good heuristic
pattern: Do X
confidence: medium
evidence: []
contradicted-by: []
created: 2026-04-01
updated: 2026-04-01
---

---
scope: hooks
title: Missing id field
pattern: Nope
---
`;
    const filePath = join(tempDir, "hooks.md");
    writeFixture(tempDir, "hooks.md", content);

    const entries = await parseHeuristicsFile(filePath);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, "good-one");

    const warnings = capturedStderr.join("");
    assert.match(warnings, /heuristics: skipped malformed entry in /);
    // Single line warning
    const warningLines = warnings
      .split("\n")
      .filter((l) => l.includes("heuristics: skipped malformed entry"));
    assert.equal(warningLines.length, 1);
    assert.ok(warningLines[0].includes(filePath));
  });

  it("returns [] for a non-existent file", async () => {
    const entries = await parseHeuristicsFile(join(tempDir, "missing.md"));
    assert.deepEqual(entries, []);
  });

  it("converts kebab-case keys to camelCase", async () => {
    const content = `---
id: kebab-test
scope: test
title: Kebab keys
pattern: X
anti-pattern: Y
confidence: high
evidence: []
contradicted-by: []
created: 2026-04-01
updated: 2026-04-01
---
`;
    writeFixture(tempDir, "test.md", content);

    const entries = await parseHeuristicsFile(join(tempDir, "test.md"));
    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.equal(entry.antiPattern, "Y");
    assert.deepEqual(entry.contradictedBy, []);
    // Ensure original kebab keys are NOT present
    assert.equal(entry["anti-pattern"], undefined);
    assert.equal(entry["contradicted-by"], undefined);
  });
});

// ── Task 3: serializeHeuristic ──────────────────────────────────────────────

describe("serializeHeuristic", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("round-trips a fully-populated entry through parseHeuristicsFile", async () => {
    const entry = {
      id: "verify-config",
      scope: "hooks",
      title: "Verify config after edit",
      pattern: "Run /config validate",
      antiPattern: "Assume valid",
      confidence: "high",
      evidence: [
        { path: "sessions/a.md", date: "2026-04-01", source: "recover" },
        { path: "sessions/b.md", date: "2026-04-02", source: "validate" },
      ],
      contradictedBy: [],
      created: "2026-04-01",
      updated: "2026-04-02",
    };

    const serialized = serializeHeuristic(entry);
    writeFixture(tempDir, "hooks.md", serialized + "\n");

    const parsed = await parseHeuristicsFile(join(tempDir, "hooks.md"));
    assert.equal(parsed.length, 1);
    assert.deepEqual(parsed[0], entry);
  });

  it("emits `evidence: []` flow form for an empty evidence array", async () => {
    const entry = {
      id: "empty-evidence",
      scope: "global",
      title: "No evidence yet",
      pattern: "Do X",
      confidence: "low",
      evidence: [],
      contradictedBy: [],
      created: "2026-04-01",
      updated: "2026-04-01",
    };

    const serialized = serializeHeuristic(entry);
    assert.match(serialized, /^evidence: \[\]$/m);
    assert.match(serialized, /^contradicted-by: \[\]$/m);

    writeFixture(tempDir, "global.md", serialized + "\n");
    const parsed = await parseHeuristicsFile(join(tempDir, "global.md"));
    assert.equal(parsed.length, 1);
    assert.deepEqual(parsed[0], entry);
  });

  it("round-trips an archived entry with archived + archivedReason", async () => {
    const entry = {
      id: "old-rule",
      scope: "hooks",
      title: "Old rule",
      pattern: "Do Y",
      confidence: "medium",
      evidence: [
        { path: "sessions/old.md", date: "2026-01-01", source: "recover" },
      ],
      contradictedBy: [],
      archived: "2026-04-01",
      archivedReason: "superseded by new-rule",
      created: "2026-01-01",
      updated: "2026-04-01",
    };

    const serialized = serializeHeuristic(entry);
    assert.match(serialized, /^archived: 2026-04-01$/m);
    assert.match(serialized, /^archived-reason: superseded by new-rule$/m);

    writeFixture(tempDir, "archived.md", serialized + "\n");
    const parsed = await parseHeuristicsFile(join(tempDir, "archived.md"));
    assert.equal(parsed.length, 1);
    assert.deepEqual(parsed[0], entry);
  });
});

// ── Task 4: validateEntry + validateProjectRoot ─────────────────────────────

describe("validateProjectRoot", () => {
  it("throws INVALID_PROJECT_ROOT for a relative path", () => {
    assert.throws(
      () => validateProjectRoot("./relative"),
      {
        code: "INVALID_PROJECT_ROOT",
        message: /projectRoot must be an absolute path/,
      }
    );
  });

  it("does not throw for an absolute path", () => {
    assert.doesNotThrow(() => validateProjectRoot("/tmp"));
  });
});

describe("validateEntry", () => {
  /**
   * Helper to build a minimally valid entry that tests can mutate.
   */
  function baseEntry() {
    return {
      id: "verify-config",
      scope: "hooks",
      title: "Verify config",
      pattern: "Run /config validate",
      confidence: "high",
      evidence: [],
      contradictedBy: [],
      created: "2026-04-01",
      updated: "2026-04-01",
    };
  }

  it("does not throw for a valid entry", () => {
    assert.doesNotThrow(() => validateEntry(baseEntry()));
  });

  for (const field of ["id", "scope", "title", "pattern", "confidence"]) {
    it(`throws HEURISTICS_SCHEMA_ERROR when '${field}' is missing`, () => {
      const entry = baseEntry();
      delete entry[field];
      assert.throws(
        () => validateEntry(entry),
        {
          code: "HEURISTICS_SCHEMA_ERROR",
          message: new RegExp(`heuristics: missing required field '${field}'`),
        }
      );
    });

    it(`throws HEURISTICS_SCHEMA_ERROR when '${field}' is empty string`, () => {
      const entry = baseEntry();
      entry[field] = "";
      assert.throws(
        () => validateEntry(entry),
        {
          code: "HEURISTICS_SCHEMA_ERROR",
          message: new RegExp(`heuristics: missing required field '${field}'`),
        }
      );
    });
  }

  it("throws HEURISTICS_SCHEMA_ERROR for invalid confidence value", () => {
    const entry = baseEntry();
    entry.confidence = "very-high";
    assert.throws(
      () => validateEntry(entry),
      {
        code: "HEURISTICS_SCHEMA_ERROR",
        message: /heuristics: invalid confidence 'very-high'/,
      }
    );
  });

  it("throws HEURISTICS_SCHEMA_ERROR for scope with slash", () => {
    const entry = baseEntry();
    entry.scope = "hooks/evil";
    assert.throws(
      () => validateEntry(entry),
      {
        code: "HEURISTICS_SCHEMA_ERROR",
        message: /heuristics: invalid scope 'hooks\/evil'/,
      }
    );
  });

  it("throws HEURISTICS_SCHEMA_ERROR for scope with parent traversal", () => {
    const entry = baseEntry();
    entry.scope = "../etc";
    assert.throws(
      () => validateEntry(entry),
      {
        code: "HEURISTICS_SCHEMA_ERROR",
        message: /heuristics: invalid scope '\.\.\/etc'/,
      }
    );
  });

  it("throws HEURISTICS_SCHEMA_ERROR for uppercase scope", () => {
    const entry = baseEntry();
    entry.scope = "HOOKS";
    assert.throws(
      () => validateEntry(entry),
      {
        code: "HEURISTICS_SCHEMA_ERROR",
        message: /heuristics: invalid scope 'HOOKS'/,
      }
    );
  });

  it("allows scope with leading underscore", () => {
    const entry = baseEntry();
    entry.scope = "_global";
    assert.doesNotThrow(() => validateEntry(entry));
  });

  it("throws HEURISTICS_SCHEMA_ERROR for id with parent traversal", () => {
    const entry = baseEntry();
    entry.id = "../etc";
    assert.throws(
      () => validateEntry(entry),
      {
        code: "HEURISTICS_SCHEMA_ERROR",
        message: /heuristics: invalid id '\.\.\/etc'/,
      }
    );
  });

  it("allows id with mixed alphanumerics, hyphens, and underscores", () => {
    const entry = baseEntry();
    entry.id = "foo-bar_baz-1";
    assert.doesNotThrow(() => validateEntry(entry));
  });

  it("throws HEURISTICS_SCHEMA_ERROR when title exceeds 120 chars", () => {
    const entry = baseEntry();
    entry.title = "a".repeat(121);
    assert.throws(
      () => validateEntry(entry),
      {
        code: "HEURISTICS_SCHEMA_ERROR",
        message: /heuristics: field 'title' exceeds length cap/,
      }
    );
  });

  it("allows title exactly 120 chars", () => {
    const entry = baseEntry();
    entry.title = "a".repeat(120);
    assert.doesNotThrow(() => validateEntry(entry));
  });

  it("throws HEURISTICS_SCHEMA_ERROR when pattern exceeds 500 chars", () => {
    const entry = baseEntry();
    entry.pattern = "a".repeat(501);
    assert.throws(
      () => validateEntry(entry),
      {
        code: "HEURISTICS_SCHEMA_ERROR",
        message: /heuristics: field 'pattern' exceeds length cap/,
      }
    );
  });

  it("throws HEURISTICS_SCHEMA_ERROR when antiPattern exceeds 500 chars", () => {
    const entry = baseEntry();
    entry.antiPattern = "a".repeat(501);
    assert.throws(
      () => validateEntry(entry),
      {
        code: "HEURISTICS_SCHEMA_ERROR",
        message: /heuristics: field 'antiPattern' exceeds length cap/,
      }
    );
  });

  it("allows a valid antiPattern within length cap", () => {
    const entry = baseEntry();
    entry.antiPattern = "Short anti-pattern";
    assert.doesNotThrow(() => validateEntry(entry));
  });
});

// ── Task 5: atomicWrite ─────────────────────────────────────────────────────

describe("atomicWrite", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("creates the target file with the given content", async () => {
    const target = join(tempDir, "target.md");
    await atomicWrite(target, "hello");

    const actual = await readFile(target, "utf8");
    assert.equal(actual, "hello");
  });

  it("creates missing parent directories recursively", async () => {
    const target = join(tempDir, "a", "b", "c", "target.md");
    await atomicWrite(target, "nested content");

    const actual = await readFile(target, "utf8");
    assert.equal(actual, "nested content");
  });

  it("leaves no .tmp-* files in the parent dir after success", async () => {
    const target = join(tempDir, "target.md");
    await atomicWrite(target, "payload");

    const names = await readdir(tempDir);
    const tempLeftovers = names.filter((n) => n.includes(".tmp-"));
    assert.deepEqual(tempLeftovers, []);
    assert.ok(names.includes("target.md"));
  });

  it("writes content exactly as provided (no trailing newline injection)", async () => {
    const target = join(tempDir, "exact.md");
    const content = "line1\nline2\nline3";
    await atomicWrite(target, content);

    const actual = await readFile(target, "utf8");
    assert.equal(actual, content);
  });
});

// ── Task 6: readHeuristics ──────────────────────────────────────────────────

describe("readHeuristics", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  const HEURISTICS_REL = ".context-index/memory/heuristics";

  /**
   * Build a minimally valid heuristic entry with overrides.
   */
  function makeEntry(overrides = {}) {
    return {
      id: "entry-1",
      scope: "hooks",
      title: "Title",
      pattern: "Do X",
      confidence: "medium",
      evidence: [],
      contradictedBy: [],
      created: "2026-04-01",
      updated: "2026-04-01",
      ...overrides,
    };
  }

  /**
   * Serialize a list of entries into a single scope-file body.
   */
  function serializeAll(entries) {
    return entries.map(serializeHeuristic).join("\n\n") + "\n";
  }

  it("returns [] when the heuristics dir does not exist", async () => {
    const result = await readHeuristics(tempDir);
    assert.deepEqual(result, []);
  });

  it("returns [] when a module scope file does not exist", async () => {
    const result = await readHeuristics(tempDir, { module: "hooks" });
    assert.deepEqual(result, []);
  });

  it("returns [] for an unknown module without throwing", async () => {
    writeFixture(
      tempDir,
      `${HEURISTICS_REL}/hooks.md`,
      serializeAll([makeEntry({ id: "a", confidence: "high" })]),
    );
    const result = await readHeuristics(tempDir, { module: "unknown" });
    assert.deepEqual(result, []);
  });

  it("throws INVALID_PROJECT_ROOT for a relative path", async () => {
    await assert.rejects(
      () => readHeuristics("relative/path"),
      { code: "INVALID_PROJECT_ROOT" },
    );
  });

  it("reads all entries for a module sorted high/medium/low", async () => {
    const entries = [
      makeEntry({ id: "low-one", confidence: "low", updated: "2026-04-01" }),
      makeEntry({ id: "high-one", confidence: "high", updated: "2026-04-01" }),
      makeEntry({ id: "medium-one", confidence: "medium", updated: "2026-04-01" }),
    ];
    writeFixture(tempDir, `${HEURISTICS_REL}/hooks.md`, serializeAll(entries));

    const result = await readHeuristics(tempDir, { module: "hooks" });
    assert.equal(result.length, 3);
    assert.deepEqual(
      result.map((e) => e.id),
      ["high-one", "medium-one", "low-one"],
    );
  });

  it("filters out low confidence when minConfidence is 'medium'", async () => {
    const entries = [
      makeEntry({ id: "low-one", confidence: "low" }),
      makeEntry({ id: "high-one", confidence: "high" }),
      makeEntry({ id: "medium-one", confidence: "medium" }),
    ];
    writeFixture(tempDir, `${HEURISTICS_REL}/hooks.md`, serializeAll(entries));

    const result = await readHeuristics(tempDir, {
      module: "hooks",
      minConfidence: "medium",
    });
    assert.equal(result.length, 2);
    assert.deepEqual(
      result.map((e) => e.id),
      ["high-one", "medium-one"],
    );
  });

  it("filters to only high when minConfidence is 'high'", async () => {
    const entries = [
      makeEntry({ id: "low-one", confidence: "low" }),
      makeEntry({ id: "high-one", confidence: "high" }),
      makeEntry({ id: "medium-one", confidence: "medium" }),
    ];
    writeFixture(tempDir, `${HEURISTICS_REL}/hooks.md`, serializeAll(entries));

    const result = await readHeuristics(tempDir, {
      module: "hooks",
      minConfidence: "high",
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "high-one");
  });

  it("returns all entries when minConfidence is 'low'", async () => {
    const entries = [
      makeEntry({ id: "low-one", confidence: "low" }),
      makeEntry({ id: "high-one", confidence: "high" }),
    ];
    writeFixture(tempDir, `${HEURISTICS_REL}/hooks.md`, serializeAll(entries));

    const result = await readHeuristics(tempDir, {
      module: "hooks",
      minConfidence: "low",
    });
    assert.equal(result.length, 2);
  });

  it("applies limit after sorting", async () => {
    const entries = [
      makeEntry({ id: "low-one", confidence: "low" }),
      makeEntry({ id: "high-one", confidence: "high" }),
      makeEntry({ id: "medium-one", confidence: "medium" }),
    ];
    writeFixture(tempDir, `${HEURISTICS_REL}/hooks.md`, serializeAll(entries));

    const result = await readHeuristics(tempDir, { module: "hooks", limit: 2 });
    assert.equal(result.length, 2);
    assert.deepEqual(
      result.map((e) => e.id),
      ["high-one", "medium-one"],
    );
  });

  it("returns [] when limit is 0", async () => {
    writeFixture(
      tempDir,
      `${HEURISTICS_REL}/hooks.md`,
      serializeAll([makeEntry({ id: "high-one", confidence: "high" })]),
    );
    const result = await readHeuristics(tempDir, { module: "hooks", limit: 0 });
    assert.deepEqual(result, []);
  });

  it("combines entries across multiple scope files when no module is given", async () => {
    const hooksEntries = [
      makeEntry({ id: "hooks-high", scope: "hooks", confidence: "high" }),
      makeEntry({ id: "hooks-low", scope: "hooks", confidence: "low" }),
    ];
    const setupEntries = [
      makeEntry({ id: "setup-medium", scope: "setup", confidence: "medium" }),
      makeEntry({ id: "setup-high", scope: "setup", confidence: "high" }),
    ];
    writeFixture(tempDir, `${HEURISTICS_REL}/hooks.md`, serializeAll(hooksEntries));
    writeFixture(tempDir, `${HEURISTICS_REL}/setup.md`, serializeAll(setupEntries));

    const result = await readHeuristics(tempDir);
    assert.equal(result.length, 4);
    // Confidence-grouped: both highs first, then the medium, then the low.
    const ids = result.map((e) => e.id);
    // The two highs should be the first two (order within tie unspecified beyond
    // updated tie-break; all have same updated, so accept either order).
    assert.ok(ids.slice(0, 2).includes("hooks-high"));
    assert.ok(ids.slice(0, 2).includes("setup-high"));
    assert.equal(ids[2], "setup-medium");
    assert.equal(ids[3], "hooks-low");
  });

  it("sorts by updated DESC as a tie-break within the same confidence", async () => {
    const entries = [
      makeEntry({ id: "older", confidence: "high", updated: "2026-01-01" }),
      makeEntry({ id: "newest", confidence: "high", updated: "2026-06-01" }),
      makeEntry({ id: "middle", confidence: "high", updated: "2026-03-01" }),
    ];
    writeFixture(tempDir, `${HEURISTICS_REL}/hooks.md`, serializeAll(entries));

    const result = await readHeuristics(tempDir, { module: "hooks" });
    assert.deepEqual(
      result.map((e) => e.id),
      ["newest", "middle", "older"],
    );
  });

  it("excludes _format.md from multi-file reads", async () => {
    const realEntries = [makeEntry({ id: "real", confidence: "high" })];
    writeFixture(tempDir, `${HEURISTICS_REL}/hooks.md`, serializeAll(realEntries));
    // _format.md typically contains a template entry. Write one that would parse
    // but should be excluded.
    const formatEntries = [makeEntry({ id: "format-template", scope: "_format", confidence: "low" })];
    writeFixture(tempDir, `${HEURISTICS_REL}/_format.md`, serializeAll(formatEntries));

    const result = await readHeuristics(tempDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "real");
  });

  it("excludes the archive/ subdirectory from multi-file reads", async () => {
    writeFixture(
      tempDir,
      `${HEURISTICS_REL}/hooks.md`,
      serializeAll([makeEntry({ id: "active", confidence: "high" })]),
    );
    writeFixture(
      tempDir,
      `${HEURISTICS_REL}/archive/old.md`,
      serializeAll([makeEntry({ id: "archived-entry", confidence: "high" })]),
    );

    const result = await readHeuristics(tempDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "active");
  });
});

// ── Task 7: writeHeuristic ──────────────────────────────────────────────────

describe("writeHeuristic", () => {
  let tempDir;
  let capturedStderr;
  let originalStderrWrite;

  const HEURISTICS_REL = ".context-index/memory/heuristics";

  const TODAY = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    tempDir = createTempDir();
    capturedStderr = [];
    originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ..._rest) => {
      capturedStderr.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    };
  });

  afterEach(() => {
    process.stderr.write = originalStderrWrite;
    cleanupTempDir(tempDir);
  });

  /**
   * Build a minimally valid heuristic entry with overrides.
   */
  function makeEntry(overrides = {}) {
    return {
      id: "verify-config",
      scope: "hooks",
      title: "Verify config",
      pattern: "Run /config validate",
      confidence: "medium",
      evidence: [],
      contradictedBy: [],
      ...overrides,
    };
  }

  it("throws INVALID_PROJECT_ROOT for a relative path", async () => {
    await assert.rejects(
      () => writeHeuristic("relative/path", makeEntry()),
      { code: "INVALID_PROJECT_ROOT" },
    );
  });

  it("throws HEURISTICS_SCHEMA_ERROR for an invalid entry", async () => {
    const entry = makeEntry();
    delete entry.title;
    await assert.rejects(
      () => writeHeuristic(tempDir, entry),
      { code: "HEURISTICS_SCHEMA_ERROR" },
    );
  });

  it("creates the scope file and directory when missing", async () => {
    const entry = makeEntry({ id: "fresh", confidence: "high" });
    const stored = await writeHeuristic(tempDir, entry);

    assert.equal(stored.id, "fresh");
    assert.equal(stored.confidence, "high");
    assert.equal(stored.created, TODAY);
    assert.equal(stored.updated, TODAY);

    const parsed = await parseHeuristicsFile(
      join(tempDir, HEURISTICS_REL, "hooks.md"),
    );
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].id, "fresh");
  });

  it("stores a new entry with confidence 'low' and 1 evidence path as low", async () => {
    const entry = makeEntry({
      id: "one-evidence",
      confidence: "low",
      evidence: [{ path: "sessions/a.md", date: "2026-04-01", source: "recover" }],
    });
    const stored = await writeHeuristic(tempDir, entry);
    assert.equal(stored.confidence, "low");
  });

  it("auto-promotes new entry from low to medium with 2 distinct evidence paths", async () => {
    const entry = makeEntry({
      id: "two-evidence",
      confidence: "low",
      evidence: [
        { path: "sessions/a.md", date: "2026-04-01", source: "recover" },
        { path: "sessions/b.md", date: "2026-04-02", source: "validate" },
      ],
    });
    const stored = await writeHeuristic(tempDir, entry);
    assert.equal(stored.confidence, "medium");
  });

  it("auto-promotes new entry from low to high with 3 distinct evidence paths", async () => {
    const entry = makeEntry({
      id: "three-evidence",
      confidence: "low",
      evidence: [
        { path: "sessions/a.md", date: "2026-04-01", source: "recover" },
        { path: "sessions/b.md", date: "2026-04-02", source: "validate" },
        { path: "sessions/c.md", date: "2026-04-03", source: "debug" },
      ],
    });
    const stored = await writeHeuristic(tempDir, entry);
    assert.equal(stored.confidence, "high");
  });

  it("stores a new 'medium' entry with 1 evidence as medium", async () => {
    const entry = makeEntry({
      id: "medium-one",
      confidence: "medium",
      evidence: [{ path: "sessions/a.md", date: "2026-04-01", source: "recover" }],
    });
    const stored = await writeHeuristic(tempDir, entry);
    assert.equal(stored.confidence, "medium");
  });

  it("does not downgrade 'high' to 'medium' with 1 evidence", async () => {
    const entry = makeEntry({
      id: "high-one",
      confidence: "high",
      evidence: [{ path: "sessions/a.md", date: "2026-04-01", source: "recover" }],
    });
    const stored = await writeHeuristic(tempDir, entry);
    assert.equal(stored.confidence, "high");
  });

  it("ignores caller-supplied confidence on update (stored confidence wins)", async () => {
    // First write: stored at 'low' with 1 evidence.
    await writeHeuristic(
      tempDir,
      makeEntry({
        id: "update-target",
        confidence: "low",
        evidence: [{ path: "sessions/a.md", date: "2026-04-01", source: "recover" }],
      }),
    );

    // Second write: caller passes 'high', but a 2nd distinct path is added.
    // Caller's 'high' is ignored; final confidence is computed from stored
    // ('low') and merged evidence (2 distinct paths) -> 'medium'.
    const updated = await writeHeuristic(
      tempDir,
      makeEntry({
        id: "update-target",
        confidence: "high",
        evidence: [{ path: "sessions/b.md", date: "2026-04-02", source: "validate" }],
      }),
    );

    assert.equal(updated.confidence, "medium");
    assert.equal(updated.evidence.length, 2);
  });

  it("dedupes evidence by (path, date) on a second write with identical evidence", async () => {
    const ev = { path: "sessions/a.md", date: "2026-04-01", source: "recover" };
    await writeHeuristic(
      tempDir,
      makeEntry({ id: "dedup-1", confidence: "low", evidence: [ev] }),
    );
    const second = await writeHeuristic(
      tempDir,
      makeEntry({ id: "dedup-1", confidence: "low", evidence: [ev] }),
    );
    assert.equal(second.evidence.length, 1);
  });

  it("dedupes by (path, date) even if source differs", async () => {
    await writeHeuristic(
      tempDir,
      makeEntry({
        id: "dedup-source",
        confidence: "low",
        evidence: [{ path: "sessions/a.md", date: "2026-04-01", source: "recover" }],
      }),
    );
    const second = await writeHeuristic(
      tempDir,
      makeEntry({
        id: "dedup-source",
        confidence: "low",
        evidence: [{ path: "sessions/a.md", date: "2026-04-01", source: "validate" }],
      }),
    );
    assert.equal(second.evidence.length, 1);
  });

  it("preserves the original 'created' date on update", async () => {
    // Seed a pre-existing file with a known created date.
    const original = {
      id: "preserved",
      scope: "hooks",
      title: "Preserved",
      pattern: "X",
      confidence: "medium",
      evidence: [{ path: "sessions/a.md", date: "2026-01-01", source: "seed" }],
      contradictedBy: [],
      created: "2026-01-01",
      updated: "2026-01-01",
    };
    writeFixture(
      tempDir,
      `${HEURISTICS_REL}/hooks.md`,
      serializeHeuristic(original) + "\n",
    );

    const updated = await writeHeuristic(
      tempDir,
      makeEntry({
        id: "preserved",
        confidence: "low",
        evidence: [{ path: "sessions/b.md", date: "2026-04-02", source: "validate" }],
      }),
    );

    assert.equal(updated.created, "2026-01-01");
    assert.equal(updated.updated, TODAY);
  });

  it("refreshes 'updated' to today on update", async () => {
    await writeHeuristic(
      tempDir,
      makeEntry({ id: "refresh", confidence: "low" }),
    );
    const updated = await writeHeuristic(
      tempDir,
      makeEntry({ id: "refresh", confidence: "low" }),
    );
    assert.equal(updated.updated, TODAY);
  });

  it("overwrites a malformed block with matching id and logs a warning", async () => {
    // Compose a file containing a well-formed entry (other-id) and a
    // malformed block that contains `id: foo` in its body but cannot be
    // parsed by parseYamlBlock (broken indentation inside evidence).
    const goodEntry = {
      id: "other-id",
      scope: "hooks",
      title: "Other",
      pattern: "Do other",
      confidence: "high",
      evidence: [],
      contradictedBy: [],
      created: "2026-02-01",
      updated: "2026-02-01",
    };
    // Malformed: opens with `---`, contains `id: foo` at top of line, but
    // has NO closing `---` delimiter. parseHeuristicsFile walks delimiter
    // pairs and silently drops unpaired blocks, so this `id: foo` never
    // appears in the parsed entries list.
    const malformed = `---
id: foo
scope: hooks
title: Broken entry
pattern: Broken
confidence: low
`;
    const content = serializeHeuristic(goodEntry) + "\n\n" + malformed;
    writeFixture(tempDir, `${HEURISTICS_REL}/hooks.md`, content);

    // Sanity-check: the malformed block still has `id: foo` but may or may
    // not be parsed. Our helper should detect the raw-id mismatch case.
    // Drain any parse-time warnings emitted during the call.
    capturedStderr.length = 0;

    const stored = await writeHeuristic(
      tempDir,
      makeEntry({
        id: "foo",
        confidence: "low",
        evidence: [{ path: "sessions/x.md", date: "2026-04-01", source: "recover" }],
      }),
    );

    assert.equal(stored.id, "foo");
    assert.equal(stored.confidence, "low");

    // The warning should mention the overwrite.
    const warnings = capturedStderr.join("");
    assert.match(
      warnings,
      /heuristics: overwrote malformed entry 'foo' in 'hooks\.md'/,
    );

    // And the final file should contain both entries (other-id preserved,
    // foo now freshly written).
    const parsed = await parseHeuristicsFile(
      join(tempDir, HEURISTICS_REL, "hooks.md"),
    );
    const ids = parsed.map((e) => e.id).sort();
    assert.deepEqual(ids, ["foo", "other-id"]);
  });

  it("normalizes missing evidence/contradictedBy arrays on new entries", async () => {
    const entry = {
      id: "bare",
      scope: "hooks",
      title: "Bare entry",
      pattern: "Do X",
      confidence: "low",
    };
    const stored = await writeHeuristic(tempDir, entry);
    assert.deepEqual(stored.evidence, []);
    assert.deepEqual(stored.contradictedBy, []);
  });
});

// ── Task 8: promote / demote / archive ─────────────────────────────────────

describe("promoteHeuristic", () => {
  let tempDir;
  const HEURISTICS_REL = ".context-index/memory/heuristics";
  const TODAY = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  function seedEntry(overrides = {}) {
    return writeHeuristic(tempDir, {
      id: "target",
      scope: "hooks",
      title: "Target",
      pattern: "Do X",
      confidence: "low",
      evidence: [],
      contradictedBy: [],
      ...overrides,
    });
  }

  it("promotes low to medium", async () => {
    await seedEntry({ confidence: "low" });
    const result = await promoteHeuristic(tempDir, "target");
    assert.equal(result.confidence, "medium");
    assert.equal(result.updated, TODAY);

    const stored = await readHeuristics(tempDir, { module: "hooks" });
    assert.equal(stored.length, 1);
    assert.equal(stored[0].confidence, "medium");
  });

  it("promotes medium to high", async () => {
    await seedEntry({ confidence: "medium" });
    const result = await promoteHeuristic(tempDir, "target");
    assert.equal(result.confidence, "high");

    const stored = await readHeuristics(tempDir, { module: "hooks" });
    assert.equal(stored[0].confidence, "high");
  });

  it("is a no-op when already high (no mtime change, same entry returned)", async () => {
    const seeded = await seedEntry({ confidence: "high" });
    // Capture the on-disk bytes pre-call.
    const filePath = join(tempDir, HEURISTICS_REL, "hooks.md");
    const before = await readFile(filePath, "utf8");

    const result = await promoteHeuristic(tempDir, "target");
    assert.equal(result.confidence, "high");
    assert.equal(result.id, seeded.id);

    const after = await readFile(filePath, "utf8");
    assert.equal(after, before, "scope file should not have been rewritten");
  });

  it("throws HEURISTICS_NOT_FOUND for an unknown id", async () => {
    await seedEntry({ confidence: "low" });
    await assert.rejects(
      () => promoteHeuristic(tempDir, "does-not-exist"),
      { code: "HEURISTICS_NOT_FOUND" },
    );
  });

  it("throws HEURISTICS_NOT_FOUND when the heuristics dir is empty", async () => {
    await assert.rejects(
      () => promoteHeuristic(tempDir, "anything"),
      { code: "HEURISTICS_NOT_FOUND" },
    );
  });

  it("throws INVALID_PROJECT_ROOT for a relative path", async () => {
    await assert.rejects(
      () => promoteHeuristic("relative/path", "id"),
      { code: "INVALID_PROJECT_ROOT" },
    );
  });
});

describe("demoteHeuristic", () => {
  let tempDir;
  const HEURISTICS_REL = ".context-index/memory/heuristics";
  const TODAY = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  function seedEntry(overrides = {}) {
    return writeHeuristic(tempDir, {
      id: "target",
      scope: "hooks",
      title: "Target",
      pattern: "Do X",
      confidence: "low",
      evidence: [],
      contradictedBy: [],
      ...overrides,
    });
  }

  it("demotes high to medium", async () => {
    await seedEntry({ confidence: "high" });
    const result = await demoteHeuristic(tempDir, "target");
    assert.equal(result.confidence, "medium");
    assert.equal(result.updated, TODAY);

    const stored = await readHeuristics(tempDir, { module: "hooks" });
    assert.equal(stored[0].confidence, "medium");
  });

  it("demotes medium to low", async () => {
    await seedEntry({ confidence: "medium" });
    const result = await demoteHeuristic(tempDir, "target");
    assert.equal(result.confidence, "low");

    const stored = await readHeuristics(tempDir, { module: "hooks" });
    assert.equal(stored[0].confidence, "low");
  });

  it("archives when demoting below low with reason 'demoted-below-low'", async () => {
    await seedEntry({ confidence: "low" });
    const result = await demoteHeuristic(tempDir, "target");

    assert.equal(result.archived, TODAY);
    assert.equal(result.archivedReason, "demoted-below-low");

    // Source scope file no longer contains the entry.
    const stored = await readHeuristics(tempDir, { module: "hooks" });
    assert.equal(stored.length, 0);

    // Archive file exists at archive/<scope>-<id>.md.
    const archivePath = join(
      tempDir,
      HEURISTICS_REL,
      "archive",
      "hooks-target.md",
    );
    const archiveContents = await readFile(archivePath, "utf8");
    assert.match(archiveContents, /id: target/);
    assert.match(archiveContents, /archived-reason: demoted-below-low/);
    assert.match(archiveContents, new RegExp(`archived: ${TODAY}`));
  });

  it("throws HEURISTICS_NOT_FOUND for an unknown id", async () => {
    await seedEntry({ confidence: "medium" });
    await assert.rejects(
      () => demoteHeuristic(tempDir, "does-not-exist"),
      { code: "HEURISTICS_NOT_FOUND" },
    );
  });

  it("throws INVALID_PROJECT_ROOT for a relative path", async () => {
    await assert.rejects(
      () => demoteHeuristic("relative/path", "id"),
      { code: "INVALID_PROJECT_ROOT" },
    );
  });
});

describe("archiveHeuristic", () => {
  let tempDir;
  const HEURISTICS_REL = ".context-index/memory/heuristics";
  const TODAY = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  function seedEntry(overrides = {}) {
    return writeHeuristic(tempDir, {
      id: "target",
      scope: "hooks",
      title: "Target",
      pattern: "Do X",
      confidence: "medium",
      evidence: [],
      contradictedBy: [],
      ...overrides,
    });
  }

  it("archives a medium entry: source file drops it, archive file has it", async () => {
    await seedEntry({ confidence: "medium" });
    const result = await archiveHeuristic(tempDir, "target", "no-longer-valid");

    assert.equal(result.archived, TODAY);
    assert.equal(result.archivedReason, "no-longer-valid");
    assert.equal(result.id, "target");
    assert.equal(result.confidence, "medium");

    // Source scope file no longer contains the entry.
    const stored = await readHeuristics(tempDir, { module: "hooks" });
    assert.equal(stored.length, 0);

    // Archive file contains the entry with archived fields.
    const archivePath = join(
      tempDir,
      HEURISTICS_REL,
      "archive",
      "hooks-target.md",
    );
    const contents = await readFile(archivePath, "utf8");
    assert.match(contents, /id: target/);
    assert.match(contents, /archived-reason: no-longer-valid/);
    assert.match(contents, new RegExp(`archived: ${TODAY}`));
  });

  it("throws HEURISTICS_NOT_FOUND for an unknown id", async () => {
    await seedEntry({ confidence: "medium" });
    await assert.rejects(
      () => archiveHeuristic(tempDir, "does-not-exist", "reason"),
      { code: "HEURISTICS_NOT_FOUND" },
    );
  });

  it("throws HEURISTICS_ARCHIVE_CONFLICT when archive file already exists", async () => {
    await seedEntry({ confidence: "medium" });
    await archiveHeuristic(tempDir, "target", "first");

    // Re-seed the same id so findEntryById has something to return,
    // then attempt to archive again. The archive path is already present.
    await seedEntry({ confidence: "medium" });
    await assert.rejects(
      () => archiveHeuristic(tempDir, "target", "second"),
      { code: "HEURISTICS_ARCHIVE_CONFLICT" },
    );
  });

  it("leaves other entries in the scope file intact when archiving one", async () => {
    await seedEntry({ id: "keep-me", confidence: "medium" });
    await seedEntry({ id: "drop-me", confidence: "medium" });

    await archiveHeuristic(tempDir, "drop-me", "obsolete");

    const remaining = await readHeuristics(tempDir, { module: "hooks" });
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, "keep-me");

    // Archive only holds drop-me.
    const archiveDir = join(tempDir, HEURISTICS_REL, "archive");
    const files = await readdir(archiveDir);
    assert.deepEqual(files.sort(), ["hooks-drop-me.md"]);
  });

  it("throws INVALID_PROJECT_ROOT for a relative path", async () => {
    await assert.rejects(
      () => archiveHeuristic("relative/path", "id", "reason"),
      { code: "INVALID_PROJECT_ROOT" },
    );
  });
});

// ── Task 9: addContradiction ────────────────────────────────────────────────

describe("addContradiction", () => {
  let tempDir;
  const HEURISTICS_REL = ".context-index/memory/heuristics";
  const TODAY = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  function seedEntry(overrides = {}) {
    return writeHeuristic(tempDir, {
      id: "target",
      scope: "hooks",
      title: "Target",
      pattern: "Do X",
      confidence: "medium",
      evidence: [],
      contradictedBy: [],
      ...overrides,
    });
  }

  const ref = (overrides = {}) => ({
    path: "sessions/2026-04-09-xyz.md",
    date: "2026-04-09",
    source: "validate",
    ...overrides,
  });

  it("high + 1st contradiction → drops to medium with contradictedBy of length 1", async () => {
    await seedEntry({ confidence: "high" });
    const result = await addContradiction(tempDir, "target", ref());

    assert.equal(result.confidence, "medium");
    assert.equal(result.contradictedBy.length, 1);
    assert.equal(result.contradictedBy[0].path, "sessions/2026-04-09-xyz.md");
    assert.equal(result.updated, TODAY);
    // Not archived.
    assert.equal(result.archived, undefined);

    const stored = await readHeuristics(tempDir, { module: "hooks" });
    assert.equal(stored.length, 1);
    assert.equal(stored[0].confidence, "medium");
    assert.equal(stored[0].contradictedBy.length, 1);
  });

  it("medium + 1st contradiction → drops to low with contradictedBy of length 1", async () => {
    await seedEntry({ confidence: "medium" });
    const result = await addContradiction(tempDir, "target", ref());

    assert.equal(result.confidence, "low");
    assert.equal(result.contradictedBy.length, 1);
    assert.equal(result.archived, undefined);

    const stored = await readHeuristics(tempDir, { module: "hooks" });
    assert.equal(stored.length, 1);
    assert.equal(stored[0].confidence, "low");
  });

  it("low + 1st contradiction → archives with reason 'contradicted' (not 'demoted-below-low')", async () => {
    await seedEntry({ confidence: "low" });
    const result = await addContradiction(tempDir, "target", ref());

    assert.equal(result.archived, TODAY);
    assert.equal(result.archivedReason, "contradicted");
    assert.equal(result.confidence, "low");
    assert.equal(result.contradictedBy.length, 1);

    // Source scope file no longer contains the entry.
    const stored = await readHeuristics(tempDir, { module: "hooks" });
    assert.equal(stored.length, 0);

    // Archive file exists with reason "contradicted" and full contradictedBy.
    const archivePath = join(
      tempDir,
      HEURISTICS_REL,
      "archive",
      "hooks-target.md",
    );
    const contents = await readFile(archivePath, "utf8");
    assert.match(contents, /archived-reason: contradicted/);
    assert.doesNotMatch(contents, /demoted-below-low/);

    const parsed = await parseHeuristicsFile(archivePath);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].contradictedBy.length, 1);
    assert.equal(parsed[0].contradictedBy[0].path, "sessions/2026-04-09-xyz.md");
  });

  it("high + 2 contradictions → 1st drops to medium, 2nd archives with reason 'contradicted'", async () => {
    await seedEntry({ confidence: "high" });

    // First contradiction: high → medium.
    const first = await addContradiction(
      tempDir,
      "target",
      ref({ path: "sessions/first.md", date: "2026-04-08" }),
    );
    assert.equal(first.confidence, "medium");
    assert.equal(first.contradictedBy.length, 1);
    assert.equal(first.archived, undefined);

    // Second contradiction: now medium with 1 contradictedBy → archived.
    const second = await addContradiction(
      tempDir,
      "target",
      ref({ path: "sessions/second.md", date: "2026-04-09" }),
    );
    assert.equal(second.archived, TODAY);
    assert.equal(second.archivedReason, "contradicted");
    assert.equal(second.contradictedBy.length, 2);

    // Source scope file no longer contains the entry.
    const stored = await readHeuristics(tempDir, { module: "hooks" });
    assert.equal(stored.length, 0);

    // Archive file has BOTH contradictions in contradictedBy.
    const archivePath = join(
      tempDir,
      HEURISTICS_REL,
      "archive",
      "hooks-target.md",
    );
    const parsed = await parseHeuristicsFile(archivePath);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].contradictedBy.length, 2);
    const paths = parsed[0].contradictedBy.map((e) => e.path).sort();
    assert.deepEqual(paths, ["sessions/first.md", "sessions/second.md"]);
    assert.equal(parsed[0].archivedReason, "contradicted");
  });

  it("medium + 2 contradictions → 1st drops to low, 2nd archives with reason 'contradicted'", async () => {
    await seedEntry({ confidence: "medium" });

    // First: medium → low.
    const first = await addContradiction(
      tempDir,
      "target",
      ref({ path: "sessions/a.md", date: "2026-04-08" }),
    );
    assert.equal(first.confidence, "low");
    assert.equal(first.archived, undefined);

    // Second: low with 1 prior contradictedBy → archived (rule 1: length >= 2).
    // Note: rule 1 (length >= 2) fires before the low-path check in rule 2.
    // Either way the reason is "contradicted".
    const second = await addContradiction(
      tempDir,
      "target",
      ref({ path: "sessions/b.md", date: "2026-04-09" }),
    );
    assert.equal(second.archived, TODAY);
    assert.equal(second.archivedReason, "contradicted");
    assert.equal(second.contradictedBy.length, 2);
  });

  it("archive file has archivedReason 'contradicted' and all contradictions present", async () => {
    await seedEntry({ confidence: "high" });
    await addContradiction(
      tempDir,
      "target",
      ref({ path: "sessions/one.md", date: "2026-04-07" }),
    );
    await addContradiction(
      tempDir,
      "target",
      ref({ path: "sessions/two.md", date: "2026-04-08" }),
    );

    const archivePath = join(
      tempDir,
      HEURISTICS_REL,
      "archive",
      "hooks-target.md",
    );
    const raw = await readFile(archivePath, "utf8");
    assert.match(raw, /archived-reason: contradicted/);
    assert.match(raw, /path: sessions\/one\.md/);
    assert.match(raw, /path: sessions\/two\.md/);
  });

  it("does not dedup identical contradictions — each is a distinct event", async () => {
    await seedEntry({ confidence: "high" });

    // Same evidenceRef twice.
    await addContradiction(tempDir, "target", ref());
    const second = await addContradiction(tempDir, "target", ref());

    // Second call archives because contradictedBy.length reaches 2 even
    // though the refs are identical.
    assert.equal(second.archived, TODAY);
    assert.equal(second.archivedReason, "contradicted");
    assert.equal(second.contradictedBy.length, 2);
  });

  it("throws HEURISTICS_NOT_FOUND for an unknown id", async () => {
    await seedEntry({ confidence: "medium" });
    await assert.rejects(
      () => addContradiction(tempDir, "does-not-exist", ref()),
      { code: "HEURISTICS_NOT_FOUND" },
    );
  });

  it("throws INVALID_PROJECT_ROOT for a relative path", async () => {
    await assert.rejects(
      () => addContradiction("relative/path", "id", ref()),
      { code: "INVALID_PROJECT_ROOT" },
    );
  });
});

// ── Tasks 11-16: Edge-case coverage ────────────────────────────────────────

describe("parse/serialize edge cases", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("round-trips an entry with a non-empty antiPattern", async () => {
    const entry = {
      id: "with-anti",
      scope: "hooks",
      title: "Has anti-pattern",
      pattern: "Do X",
      antiPattern: "Do not do Y",
      confidence: "medium",
      evidence: [],
      contradictedBy: [],
      created: "2026-04-01",
      updated: "2026-04-01",
    };
    const serialized = serializeHeuristic(entry);
    assert.match(serialized, /^anti-pattern: Do not do Y$/m);

    writeFixture(tempDir, "hooks.md", serialized + "\n");
    const parsed = await parseHeuristicsFile(join(tempDir, "hooks.md"));
    assert.equal(parsed.length, 1);
    assert.deepEqual(parsed[0], entry);
  });

  it("round-trips an entry with antiPattern absent", async () => {
    const entry = {
      id: "no-anti",
      scope: "hooks",
      title: "No anti-pattern",
      pattern: "Do X",
      confidence: "medium",
      evidence: [],
      contradictedBy: [],
      created: "2026-04-01",
      updated: "2026-04-01",
    };
    const serialized = serializeHeuristic(entry);
    assert.doesNotMatch(serialized, /^anti-pattern:/m);

    writeFixture(tempDir, "hooks.md", serialized + "\n");
    const parsed = await parseHeuristicsFile(join(tempDir, "hooks.md"));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].antiPattern, undefined);
  });

  it("treats empty-string antiPattern as absent on serialize", async () => {
    // An empty anti-pattern cannot be distinguished from "no anti-pattern"
    // in the on-disk format (an empty `anti-pattern: ` line would parse
    // back as a block-form array), so the serializer skips the field.
    const entry = {
      id: "empty-anti",
      scope: "hooks",
      title: "Empty anti",
      pattern: "Do X",
      antiPattern: "",
      confidence: "low",
      evidence: [],
      contradictedBy: [],
      created: "2026-04-01",
      updated: "2026-04-01",
    };
    const serialized = serializeHeuristic(entry);
    assert.doesNotMatch(serialized, /^anti-pattern:/m);

    writeFixture(tempDir, "hooks.md", serialized + "\n");
    const parsed = await parseHeuristicsFile(join(tempDir, "hooks.md"));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].antiPattern, undefined);
  });

  it("round-trips an empty contradictedBy[] as flow form", async () => {
    const entry = {
      id: "empty-contra",
      scope: "hooks",
      title: "Empty contradictedBy",
      pattern: "Do X",
      confidence: "high",
      evidence: [
        { path: "sessions/a.md", date: "2026-04-01", source: "recover" },
      ],
      contradictedBy: [],
      created: "2026-04-01",
      updated: "2026-04-01",
    };
    const serialized = serializeHeuristic(entry);
    assert.match(serialized, /^contradicted-by: \[\]$/m);

    writeFixture(tempDir, "hooks.md", serialized + "\n");
    const parsed = await parseHeuristicsFile(join(tempDir, "hooks.md"));
    assert.equal(parsed.length, 1);
    assert.deepEqual(parsed[0].contradictedBy, []);
  });

  it("round-trips a title containing ':' and '#' characters", async () => {
    // Documents that our unquoted YAML subset tolerates ':' and '#'
    // inside scalar values because the parser uses the FIRST colon as
    // the key/value delimiter and does not treat '#' as a comment
    // marker. Quoting is not required or supported.
    const entry = {
      id: "special-chars",
      scope: "hooks",
      title: "Use foo: bar # now",
      pattern: "Run cmd --flag: value # comment-like",
      confidence: "medium",
      evidence: [],
      contradictedBy: [],
      created: "2026-04-01",
      updated: "2026-04-01",
    };
    const serialized = serializeHeuristic(entry);
    writeFixture(tempDir, "hooks.md", serialized + "\n");
    const parsed = await parseHeuristicsFile(join(tempDir, "hooks.md"));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, "Use foo: bar # now");
    assert.equal(parsed[0].pattern, "Run cmd --flag: value # comment-like");
  });
});

describe("writeHeuristic auto-promotion edge cases", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  function makeEntry(overrides = {}) {
    return {
      id: "edge",
      scope: "hooks",
      title: "Edge",
      pattern: "Do X",
      confidence: "low",
      evidence: [],
      contradictedBy: [],
      ...overrides,
    };
  }

  it("does NOT auto-promote low → medium when 2 evidence entries share a path", async () => {
    // Distinct-path rule: 2 evidence entries with the same path count as
    // 1 distinct path and must not trigger the low → medium bump.
    const stored = await writeHeuristic(
      tempDir,
      makeEntry({
        id: "same-path",
        confidence: "low",
        evidence: [
          { path: "sessions/a.md", date: "2026-04-01", source: "recover" },
          { path: "sessions/a.md", date: "2026-04-02", source: "validate" },
        ],
      }),
    );
    assert.equal(stored.confidence, "low");
    assert.equal(stored.evidence.length, 2);
  });

  it("keeps caller-supplied 'medium' at medium with 2 distinct evidence paths", async () => {
    // Auto-promotion to medium only fires from low; starting at medium
    // with 2 distinct paths stays at medium (needs 3 to reach high).
    const stored = await writeHeuristic(
      tempDir,
      makeEntry({
        id: "medium-two",
        confidence: "medium",
        evidence: [
          { path: "sessions/a.md", date: "2026-04-01", source: "recover" },
          { path: "sessions/b.md", date: "2026-04-02", source: "validate" },
        ],
      }),
    );
    assert.equal(stored.confidence, "medium");
  });

  it("promotes caller-supplied 'medium' to 'high' with 3 distinct evidence paths", async () => {
    const stored = await writeHeuristic(
      tempDir,
      makeEntry({
        id: "medium-three",
        confidence: "medium",
        evidence: [
          { path: "sessions/a.md", date: "2026-04-01", source: "recover" },
          { path: "sessions/b.md", date: "2026-04-02", source: "validate" },
          { path: "sessions/c.md", date: "2026-04-03", source: "debug" },
        ],
      }),
    );
    assert.equal(stored.confidence, "high");
  });

  it("keeps caller-supplied 'high' at high regardless of evidence count", async () => {
    const stored0 = await writeHeuristic(
      tempDir,
      makeEntry({ id: "high-zero", confidence: "high", evidence: [] }),
    );
    assert.equal(stored0.confidence, "high");

    const stored3 = await writeHeuristic(
      tempDir,
      makeEntry({
        id: "high-three",
        confidence: "high",
        evidence: [
          { path: "sessions/a.md", date: "2026-04-01", source: "recover" },
          { path: "sessions/b.md", date: "2026-04-02", source: "validate" },
          { path: "sessions/c.md", date: "2026-04-03", source: "debug" },
        ],
      }),
    );
    assert.equal(stored3.confidence, "high");
  });
});

// ── Retrieval Filtering ─────────────────────────────────────────────────────

describe("retrieveHeuristics", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  function makeEntry(id, scope, confidence, pattern, extra = {}) {
    return {
      id,
      scope,
      title: `Title for ${id}`,
      pattern,
      confidence,
      evidence: extra.evidence || [],
      contradictedBy: [],
      ...extra,
    };
  }

  it("merges module and _global heuristics, deduplicates by id", async () => {
    await writeHeuristic(tempDir, makeEntry("mod-1", "hooks", "high", "Pattern A"));
    await writeHeuristic(tempDir, makeEntry("glob-1", "_global", "high", "Pattern B"));
    // Write same id to both — module should win
    await writeHeuristic(tempDir, makeEntry("dup-1", "hooks", "medium", "Module version"));
    await writeHeuristic(tempDir, makeEntry("dup-1", "_global", "medium", "Global version"));

    const result = await heuristics.retrieveHeuristics(tempDir, "hooks", {});
    const ids = result.map((h) => h.id);
    assert.ok(ids.includes("mod-1"));
    assert.ok(ids.includes("glob-1"));
    // dup-1 appears exactly once
    assert.equal(ids.filter((id) => id === "dup-1").length, 1);
    // module version wins
    const dup = result.find((h) => h.id === "dup-1");
    assert.equal(dup.pattern, "Module version");
  });

  it("sorts module-scoped before _global at same confidence", async () => {
    await writeHeuristic(tempDir, makeEntry("glob-m", "_global", "medium", "Global med"));
    await writeHeuristic(tempDir, makeEntry("mod-m", "hooks", "medium", "Module med"));

    const result = await heuristics.retrieveHeuristics(tempDir, "hooks", {});
    const mediums = result.filter((h) => h.confidence === "medium");
    assert.ok(mediums.length >= 2);
    const modIdx = result.findIndex((h) => h.id === "mod-m");
    const globIdx = result.findIndex((h) => h.id === "glob-m");
    assert.ok(modIdx < globIdx, "module-scoped should sort before _global");
  });

  it("applies default budget cap: 5 high + 3 medium, excludes all low", async () => {
    // Write 7 high, 5 medium, 3 low to module
    for (let i = 0; i < 7; i++) {
      await writeHeuristic(tempDir, makeEntry(`h${i}`, "hooks", "high", `High ${i}`));
    }
    for (let i = 0; i < 5; i++) {
      await writeHeuristic(tempDir, makeEntry(`m${i}`, "hooks", "medium", `Med ${i}`));
    }
    for (let i = 0; i < 3; i++) {
      await writeHeuristic(tempDir, makeEntry(`l${i}`, "hooks", "low", `Low ${i}`));
    }

    const result = await heuristics.retrieveHeuristics(tempDir, "hooks", {});
    const highCount = result.filter((h) => h.confidence === "high").length;
    const medCount = result.filter((h) => h.confidence === "medium").length;
    const lowCount = result.filter((h) => h.confidence === "low").length;
    assert.equal(highCount, 5);
    assert.equal(medCount, 3);
    assert.equal(lowCount, 0);
    assert.equal(result.length, 8);
  });

  it("scales budget proportionally with custom injectionLimit", async () => {
    for (let i = 0; i < 10; i++) {
      await writeHeuristic(tempDir, makeEntry(`h${i}`, "hooks", "high", `High ${i}`));
    }
    for (let i = 0; i < 10; i++) {
      await writeHeuristic(tempDir, makeEntry(`m${i}`, "hooks", "medium", `Med ${i}`));
    }

    const result = await heuristics.retrieveHeuristics(tempDir, "hooks", { injectionLimit: 3 });
    // ceil(3 * 5/8) = ceil(1.875) = 2 high, 3-2 = 1 medium
    const highCount = result.filter((h) => h.confidence === "high").length;
    const medCount = result.filter((h) => h.confidence === "medium").length;
    assert.equal(highCount, 2);
    assert.equal(medCount, 1);
    assert.equal(result.length, 3);
  });

  it("returns empty array when injectionLimit is 0", async () => {
    await writeHeuristic(tempDir, makeEntry("h1", "hooks", "high", "Pattern"));

    const result = await heuristics.retrieveHeuristics(tempDir, "hooks", { injectionLimit: 0 });
    assert.deepEqual(result, []);
  });

  it("returns empty array when no heuristics exist", async () => {
    const result = await heuristics.retrieveHeuristics(tempDir, "hooks", {});
    assert.deepEqual(result, []);
  });

  it("catches readHeuristics errors and returns empty array", async () => {
    // Pass a relative path (triggers INVALID_PROJECT_ROOT) — should catch, not throw
    const result = await heuristics.retrieveHeuristics("relative/path", "hooks", {});
    assert.deepEqual(result, []);
  });

  it("treats non-integer injectionLimit as default 8", async () => {
    for (let i = 0; i < 10; i++) {
      await writeHeuristic(tempDir, makeEntry(`h${i}`, "hooks", "high", `High ${i}`));
    }

    const result = await heuristics.retrieveHeuristics(tempDir, "hooks", { injectionLimit: "abc" });
    // Default budget: 5 high
    assert.equal(result.filter((h) => h.confidence === "high").length, 5);
  });

  it("treats negative injectionLimit as default 8", async () => {
    for (let i = 0; i < 10; i++) {
      await writeHeuristic(tempDir, makeEntry(`h${i}`, "hooks", "high", `High ${i}`));
    }

    const result = await heuristics.retrieveHeuristics(tempDir, "hooks", { injectionLimit: -5 });
    assert.equal(result.filter((h) => h.confidence === "high").length, 5);
  });

  it("end-to-end: module + global heuristics with budget", async () => {
    // 3 high hooks, 2 high global, 4 medium hooks, 2 medium global
    for (let i = 0; i < 3; i++) {
      await writeHeuristic(tempDir, makeEntry(`hh${i}`, "hooks", "high", `Hook high ${i}`));
    }
    for (let i = 0; i < 2; i++) {
      await writeHeuristic(tempDir, makeEntry(`gh${i}`, "_global", "high", `Global high ${i}`));
    }
    for (let i = 0; i < 4; i++) {
      await writeHeuristic(tempDir, makeEntry(`hm${i}`, "hooks", "medium", `Hook med ${i}`));
    }
    for (let i = 0; i < 2; i++) {
      await writeHeuristic(tempDir, makeEntry(`gm${i}`, "_global", "medium", `Global med ${i}`));
    }

    const result = await heuristics.retrieveHeuristics(tempDir, "hooks", {});
    assert.equal(result.length, 8); // 5 high + 3 medium
    // First 5 should be high
    for (let i = 0; i < 5; i++) {
      assert.equal(result[i].confidence, "high");
    }
    // Next 3 should be medium
    for (let i = 5; i < 8; i++) {
      assert.equal(result[i].confidence, "medium");
    }
  });
});

describe("renderHeuristic", () => {
  it("renders a heuristic with pattern and antiPattern", () => {
    const h = {
      id: "test-001",
      title: "Test Title",
      confidence: "high",
      pattern: "Do this",
      antiPattern: "Avoid that",
      evidence: [
        { path: "a.md", date: "2026-01-01" },
        { path: "b.md", date: "2026-01-02" },
      ],
    };
    const result = heuristics.renderHeuristic(h);
    assert.ok(result.includes("### Heuristic: Test Title (confidence: high)"));
    assert.ok(result.includes("**Pattern:** Do this"));
    assert.ok(result.includes("**Anti-pattern:** Avoid that"));
    assert.ok(result.includes("**Evidence:** 2 observations"));
  });

  it("omits anti-pattern line when antiPattern is absent", () => {
    const h = {
      id: "test-002",
      title: "No Anti",
      confidence: "medium",
      pattern: "Do this",
      evidence: [{ path: "a.md", date: "2026-01-01" }],
    };
    const result = heuristics.renderHeuristic(h);
    assert.ok(!result.includes("Anti-pattern"));
  });

  it("renders evidence count of 0 for missing evidence array", () => {
    const h = {
      id: "test-003",
      title: "No Evidence",
      confidence: "low",
      pattern: "Something",
    };
    const result = heuristics.renderHeuristic(h);
    assert.ok(result.includes("**Evidence:** 0 observations"));
  });
});

describe("validateEntry scope edge cases", () => {
  function baseEntry() {
    return {
      id: "test",
      scope: "hooks",
      title: "Test",
      pattern: "Do X",
      confidence: "low",
      evidence: [],
      contradictedBy: [],
      created: "2026-04-01",
      updated: "2026-04-01",
    };
  }

  it("throws HEURISTICS_SCHEMA_ERROR for scope containing a null byte", () => {
    const entry = baseEntry();
    entry.scope = "hooks\u0000evil";
    assert.throws(
      () => validateEntry(entry),
      { code: "HEURISTICS_SCHEMA_ERROR" },
    );
  });

  it("throws HEURISTICS_SCHEMA_ERROR for scope '../../../etc/passwd'", () => {
    const entry = baseEntry();
    entry.scope = "../../../etc/passwd";
    assert.throws(
      () => validateEntry(entry),
      { code: "HEURISTICS_SCHEMA_ERROR" },
    );
  });

  it("throws HEURISTICS_SCHEMA_ERROR for id containing a null byte", () => {
    const entry = baseEntry();
    entry.id = "foo\u0000bar";
    assert.throws(
      () => validateEntry(entry),
      { code: "HEURISTICS_SCHEMA_ERROR" },
    );
  });
});
