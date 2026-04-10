/**
 * Eval tests for Step 7 "Extract Heuristic" of /adev:recover.
 *
 * Covers all six diagnosis categories. Each test constructs a mock
 * recovery-record context, invokes the Step 7 harness, asserts the
 * derived fields (id, scope, title, confidence, evidence, antiPattern
 * presence), and verifies the entry round-trips through
 * `readHeuristics`.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readHeuristics } from "../../lib/heuristics.mjs";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import {
  CATEGORY_ID_SLUGS,
  CATEGORY_LABELS,
  deriveId,
  extractHeuristic,
  normalizeRootCause,
} from "./recover-extract-heuristic-harness.mjs";

/**
 * Write a minimal manifest.yaml fixture declaring a single module.
 * @param {string} root
 * @param {string} moduleSlug
 */
function writeManifest(root, moduleSlug) {
  mkdirSync(join(root, ".context-index"), { recursive: true });
  writeFileSync(
    join(root, ".context-index", "manifest.yaml"),
    `modules:\n  - slug: ${moduleSlug}\n    path: ${moduleSlug}/\n`,
  );
}

/**
 * Write a fake Step 6 recovery record fixture and return its relative path.
 * @param {string} root
 * @param {string} date
 * @param {string} taskSlug
 * @returns {string}
 */
function writeRecoveryRecord(root, date, taskSlug) {
  const rel = `.context-index/hygiene/recoveries/${date}-${taskSlug}.md`;
  const full = join(root, rel);
  mkdirSync(join(root, ".context-index/hygiene/recoveries"), { recursive: true });
  writeFileSync(full, `# Recovery Record: ${taskSlug}\n`);
  return rel;
}

/**
 * Table of per-category fixtures. Each record provides the inputs the
 * Step 7 harness expects plus the expected derived values.
 */
const FIXTURES = [
  {
    category: "MISSING_CONTEXT",
    rootCauseText: "Cache invalidation assumptions not documented",
    pattern: "Include cache invalidation docs in hook context packets",
    antiPattern: "Assuming cache behavior without reading the cache module",
    taskSlug: "cache-task",
    expectAntiPattern: true,
  },
  {
    category: "AMBIGUOUS_SPEC",
    rootCauseText: "Unclear retry policy wording in spec",
    pattern: "Specify exact retry count and backoff strategy",
    antiPattern: "Leaving retry semantics implicit in prose",
    taskSlug: "retry-task",
    expectAntiPattern: true,
  },
  {
    category: "CONSTRAINT_CONFLICT",
    rootCauseText: "ESM import rule conflicts with CommonJS dependency",
    pattern: "Precedence rule: ESM first, adapter-wrap legacy CommonJS modules",
    antiPattern: "Mixing require and import within a single module",
    taskSlug: "esm-task",
    expectAntiPattern: true,
  },
  {
    category: "NOVEL_PROBLEM",
    rootCauseText: "New requirement: streaming SSE output from hook",
    pattern: "Buffer SSE chunks and flush on newline boundaries",
    antiPattern: "",
    taskSlug: "sse-task",
    expectAntiPattern: false,
  },
  {
    category: "TOOL_FAILURE",
    rootCauseText: "Git hook invoked without bash shebang on linux runner",
    pattern: "Pre-flight: verify shebang and executable bit on hook scripts",
    antiPattern: "Assuming CI runners have zsh as their default shell",
    taskSlug: "shebang-task",
    expectAntiPattern: true,
  },
  {
    category: "BUDGET_EXHAUSTION",
    rootCauseText: "Single task attempted to refactor the entire CLI module",
    pattern: "Split refactors by file when blast radius exceeds 10 files",
    antiPattern: "Treating multi-file refactors as a single implementation task",
    taskSlug: "refactor-task",
    expectAntiPattern: true,
  },
];

describe("Step 7 extractHeuristic — per-category eval", () => {
  let tempDir;
  const moduleSlug = "hooks";
  const date = "2026-04-09";

  beforeEach(() => {
    tempDir = createTempDir();
    writeManifest(tempDir, moduleSlug);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  for (const fx of FIXTURES) {
    it(`produces a well-formed heuristic for ${fx.category}`, async () => {
      const planPath = `.context-index/specs/features/${moduleSlug}/${fx.taskSlug}.plan.md`;
      const recoveryRecordPath = writeRecoveryRecord(tempDir, date, fx.taskSlug);

      const stored = await extractHeuristic(tempDir, {
        category: fx.category,
        rootCauseText: fx.rootCauseText,
        pattern: fx.pattern,
        antiPattern: fx.antiPattern,
        planPath,
        recoveryRecordPath,
        date,
        modules: [moduleSlug],
      });

      // ── Derivation assertions ─────────────────────────────────────────
      const normalized = normalizeRootCause(fx.rootCauseText);
      const expectedId = deriveId(fx.category, normalized);
      assert.equal(stored.id, expectedId, "id must match sha256-prefix derivation");
      assert.ok(
        /^[_a-z0-9][_a-z0-9-]{0,63}$/.test(stored.id),
        `id '${stored.id}' must match safe-slug pattern`,
      );
      assert.equal(
        stored.id.startsWith(`${CATEGORY_ID_SLUGS[fx.category]}-`),
        true,
        "id must begin with category slug",
      );

      // Scope derives to the module from the plan path.
      assert.equal(stored.scope, moduleSlug, "scope must match plan path module");

      // Title: "<Category label>: <summary>" and ≤120 chars.
      assert.equal(
        stored.title.startsWith(`${CATEGORY_LABELS[fx.category]}: `),
        true,
        `title must begin with '${CATEGORY_LABELS[fx.category]}: '`,
      );
      assert.ok(stored.title.length <= 120, "title must be ≤120 chars");

      // Pattern is stored verbatim from distilled input.
      assert.equal(stored.pattern, fx.pattern);

      // antiPattern presence matches category expectation.
      if (fx.expectAntiPattern) {
        assert.equal(stored.antiPattern, fx.antiPattern);
      } else {
        assert.equal(
          stored.antiPattern,
          undefined,
          `${fx.category} must not persist an antiPattern`,
        );
      }

      // Confidence starts at low (single evidence path, no auto-promotion).
      assert.equal(stored.confidence, "low");

      // Evidence contains exactly one recovery ref.
      assert.equal(stored.evidence.length, 1);
      assert.deepEqual(stored.evidence[0], {
        path: recoveryRecordPath,
        date,
        source: "recovery",
      });

      // ── Round-trip via readHeuristics ────────────────────────────────
      const readBack = await readHeuristics(tempDir, { module: moduleSlug });
      assert.equal(readBack.length, 1);
      assert.equal(readBack[0].id, expectedId);
      assert.equal(readBack[0].scope, moduleSlug);
      assert.equal(readBack[0].title, stored.title);
      assert.equal(readBack[0].pattern, fx.pattern);
      if (fx.expectAntiPattern) {
        assert.equal(readBack[0].antiPattern, fx.antiPattern);
      } else {
        assert.equal(readBack[0].antiPattern, undefined);
      }
      assert.equal(readBack[0].confidence, "low");
    });
  }
});
