/**
 * Integration tests for `/adev:recover` Step 7 "Extract Heuristic".
 *
 * These tests exercise the Step 7 harness end-to-end:
 *   T10 — happy-path integration with a fake project fixture.
 *   T11 — recurrence auto-promotion (low → medium → high) across 2–3
 *         distinct plan/evidence paths.
 *   T12 — distillation discipline: verifies the harness actively
 *         rejects credential-like literals in produced heuristic fields.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readHeuristics } from "../../lib/heuristics.mjs";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import {
  deriveId,
  extractHeuristic,
  normalizeRootCause,
} from "./recover-extract-heuristic-harness.mjs";

const MODULE_SLUG = "hooks";
const DATE = "2026-04-09";

/**
 * Seed a temp project with a manifest declaring one module, a fake plan
 * file, and a fake Step 6 recovery record. Returns paths the caller
 * needs for the Step 7 context.
 * @param {string} root
 * @param {object} opts
 * @param {string} opts.taskSlug
 * @returns {{planPath: string, recoveryRecordPath: string}}
 */
function seedFixture(root, { taskSlug }) {
  mkdirSync(join(root, ".context-index"), { recursive: true });
  writeFileSync(
    join(root, ".context-index", "manifest.yaml"),
    `modules:\n  - slug: ${MODULE_SLUG}\n    path: ${MODULE_SLUG}/\n`,
  );

  const planRel = `.context-index/specs/features/${MODULE_SLUG}/${taskSlug}.plan.md`;
  mkdirSync(join(root, `.context-index/specs/features/${MODULE_SLUG}`), {
    recursive: true,
  });
  writeFileSync(join(root, planRel), `# Plan: ${taskSlug}\n`);

  const recRel = `.context-index/hygiene/recoveries/${DATE}-${taskSlug}.md`;
  mkdirSync(join(root, ".context-index/hygiene/recoveries"), { recursive: true });
  writeFileSync(
    join(root, recRel),
    `# Recovery Record: ${taskSlug}\n> **Root Cause:** MISSING_CONTEXT\n`,
  );

  return { planPath: planRel, recoveryRecordPath: recRel };
}

describe("recover Step 7 integration (T10) — end-to-end happy path", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("writes and reads back a MISSING_CONTEXT heuristic scoped to the module", async () => {
    const { planPath, recoveryRecordPath } = seedFixture(tempDir, {
      taskSlug: "some-task",
    });

    const rootCauseText =
      "Hook context missing cache-invalidation assumptions for the merge-guard module";
    const result = await extractHeuristic(tempDir, {
      category: "MISSING_CONTEXT",
      rootCauseText,
      pattern: "Include cache invalidation docs in hook context packets",
      antiPattern: "Assuming cache behavior without reading the cache module",
      planPath,
      recoveryRecordPath,
      date: DATE,
      modules: [MODULE_SLUG],
    });

    assert.equal(result.scope, MODULE_SLUG);
    assert.equal(result.confidence, "low");

    const entries = await readHeuristics(tempDir, { module: MODULE_SLUG });
    assert.equal(entries.length, 1, "exactly one heuristic must be stored");

    const entry = entries[0];
    const expectedId = deriveId("MISSING_CONTEXT", normalizeRootCause(rootCauseText));
    assert.equal(entry.id, expectedId);
    assert.equal(entry.scope, MODULE_SLUG);
    assert.equal(entry.title.startsWith("Missing context: "), true);
    assert.ok(entry.title.length <= 120);
    assert.equal(
      entry.pattern,
      "Include cache invalidation docs in hook context packets",
    );
    assert.equal(
      entry.antiPattern,
      "Assuming cache behavior without reading the cache module",
    );
    assert.equal(entry.confidence, "low");
    assert.equal(entry.evidence.length, 1);
    assert.equal(entry.evidence[0].path, recoveryRecordPath);
    assert.equal(entry.evidence[0].date, DATE);
    assert.equal(entry.evidence[0].source, "recovery");
  });
});

describe("recover Step 7 integration (T11) — recurrence auto-promotion", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("promotes low → medium → high as evidence paths accumulate", async () => {
    // Seed the manifest once; tasks differ per extraction.
    mkdirSync(join(tempDir, ".context-index"), { recursive: true });
    writeFileSync(
      join(tempDir, ".context-index", "manifest.yaml"),
      `modules:\n  - slug: ${MODULE_SLUG}\n    path: ${MODULE_SLUG}/\n`,
    );
    mkdirSync(join(tempDir, `.context-index/specs/features/${MODULE_SLUG}`), {
      recursive: true,
    });
    mkdirSync(join(tempDir, ".context-index/hygiene/recoveries"), { recursive: true });

    // Same normalized root cause across all three extractions so the
    // derived id is identical and writeHeuristic merges evidence.
    const rootCauseText = "Retry policy ambiguous between minutes and seconds units";
    const pattern = "Specify exact units for all timeout and retry fields";
    const antiPattern = "Leaving timeout units implicit in spec prose";

    // Helper to run one extraction with a distinct plan + recovery path.
    async function extractFor(taskSlug, dateOverride) {
      const planRel = `.context-index/specs/features/${MODULE_SLUG}/${taskSlug}.plan.md`;
      const recRel = `.context-index/hygiene/recoveries/${dateOverride}-${taskSlug}.md`;
      writeFileSync(join(tempDir, planRel), `# Plan: ${taskSlug}\n`);
      writeFileSync(join(tempDir, recRel), `# Recovery Record: ${taskSlug}\n`);
      return extractHeuristic(tempDir, {
        category: "AMBIGUOUS_SPEC",
        rootCauseText,
        pattern,
        antiPattern,
        planPath: planRel,
        recoveryRecordPath: recRel,
        date: dateOverride,
        modules: [MODULE_SLUG],
      });
    }

    // 1st extraction — single evidence path → low.
    const first = await extractFor("task-a", "2026-04-09");
    assert.equal(first.confidence, "low");
    assert.equal(first.evidence.length, 1);

    // 2nd extraction — second distinct path → auto-promote to medium.
    const second = await extractFor("task-b", "2026-04-10");
    assert.equal(
      second.id,
      first.id,
      "same normalized root cause must yield the same id",
    );
    assert.equal(second.confidence, "medium");
    assert.equal(second.evidence.length, 2);
    const distinctPathsAfterSecond = new Set(second.evidence.map((e) => e.path)).size;
    assert.equal(distinctPathsAfterSecond, 2);

    // 3rd extraction — third distinct path → auto-promote to high.
    const third = await extractFor("task-c", "2026-04-11");
    assert.equal(third.id, first.id);
    assert.equal(third.confidence, "high");
    assert.equal(third.evidence.length, 3);
    const distinctPathsAfterThird = new Set(third.evidence.map((e) => e.path)).size;
    assert.equal(distinctPathsAfterThird, 3);

    // Round-trip: the stored entry reflects the final high confidence.
    const stored = await readHeuristics(tempDir, { module: MODULE_SLUG });
    assert.equal(stored.length, 1);
    assert.equal(stored[0].id, first.id);
    assert.equal(stored[0].confidence, "high");
    assert.equal(stored[0].evidence.length, 3);
  });
});

describe("recover Step 7 integration (T12) — distillation discipline", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("rejects raw credential literals before writing the heuristic", async () => {
    const { planPath, recoveryRecordPath } = seedFixture(tempDir, {
      taskSlug: "ambiguous-spec-task",
    });

    // The raw recovery text contains a fake AWS-style credential. The
    // harness must NEVER let this string reach writeHeuristic: the caller
    // accidentally leaks it into `pattern` and the distillation guard
    // should throw.
    const rawCredential = "api_key=AKIAIOSFODNN7EXAMPLE";
    const leakyPattern = `Clarify retry behavior — observed raw header ${rawCredential}`;

    await assert.rejects(
      () =>
        extractHeuristic(tempDir, {
          category: "AMBIGUOUS_SPEC",
          rootCauseText: "Retry header semantics ambiguous in upstream spec",
          pattern: leakyPattern,
          antiPattern: "Pasting raw HTTP samples into the spec",
          planPath,
          recoveryRecordPath,
          date: DATE,
          modules: [MODULE_SLUG],
        }),
      (err) => {
        assert.equal(err.code, "DISTILLATION_GUARD_VIOLATION");
        assert.match(err.message, /distillation guard violated/i);
        return true;
      },
    );

    // Nothing was persisted — the heuristics directory is empty.
    const entries = await readHeuristics(tempDir, { module: MODULE_SLUG });
    assert.equal(entries.length, 0, "no heuristic must be written when guards fail");
  });

  it("stores a distilled AMBIGUOUS_SPEC heuristic without the raw credential", async () => {
    const { planPath, recoveryRecordPath } = seedFixture(tempDir, {
      taskSlug: "ambiguous-spec-clean",
    });

    const rawCredential = "api_key=AKIAIOSFODNN7EXAMPLE";
    // Caller distilled the fields correctly — no credential literal.
    const stored = await extractHeuristic(tempDir, {
      category: "AMBIGUOUS_SPEC",
      rootCauseText: "Upstream retry header semantics ambiguous in spec",
      pattern: "Document expected retry-after header unit explicitly",
      antiPattern: "Leaving retry-after unit implicit in prose",
      planPath,
      recoveryRecordPath,
      date: DATE,
      modules: [MODULE_SLUG],
      // Caller can still pass extra guards; harness compiles them.
      distillationGuards: [rawCredential],
    });

    // None of the persisted fields may contain the credential literal.
    assert.ok(!stored.title.includes(rawCredential));
    assert.ok(!stored.pattern.includes(rawCredential));
    assert.ok(!(stored.antiPattern || "").includes(rawCredential));
    assert.ok(!stored.title.includes("AKIAIOSFODNN7EXAMPLE"));
    assert.ok(!stored.pattern.includes("AKIAIOSFODNN7EXAMPLE"));

    // Also verify via round-trip read that the on-disk file is clean.
    const readBack = await readHeuristics(tempDir, { module: MODULE_SLUG });
    assert.equal(readBack.length, 1);
    const entry = readBack[0];
    assert.ok(!entry.title.includes(rawCredential));
    assert.ok(!entry.pattern.includes(rawCredential));
    assert.ok(!(entry.antiPattern || "").includes(rawCredential));
  });
});
