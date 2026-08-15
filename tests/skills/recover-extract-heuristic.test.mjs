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
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readHeuristics } from "../../lib/heuristics.mjs";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../helpers.mjs";
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

// ── Convergence on the shared digest function ────────────────────────────
//
// Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
// Plan-task: 6
//
// /adev:recover ids must be byte-identical before and after the harness stops
// holding a private copy of the derivation. `failure-capture.spec.md`
// Behavior 6 depends on it, and Behavior 8's migration deliberately never
// rekeys these entries — so a drift here would silently orphan every recover
// heuristic already in the store.

/**
 * Ids captured from the harness BEFORE it was converged onto
 * `lib/heuristics.mjs`. If `normalizeFailureText` is not byte-compatible with
 * the deleted `normalizeRootCause`, this is where it surfaces — fix the
 * normalizer, never the fixture.
 */
const PRE_CHANGE_RECOVER_IDS = [
  {
    category: "MISSING_CONTEXT",
    rootCause: "Error: cache miss on third-party API",
    normalized: "error cache miss on third-party api",
    id: "missing-context-3afbd8be",
  },
  {
    category: "AMBIGUOUS_SPEC",
    rootCause: "Spec says 'handle errors appropriately' without a response shape",
    normalized: "spec says handle errors appropriately without a response shape",
    id: "ambiguous-spec-81e9ee99",
  },
  {
    category: "CONSTRAINT_CONFLICT",
    rootCause:
      "ADR-0004 forbids direct DB access, but the spec requires an unsupported query",
    normalized:
      "adr-0004 forbids direct db access but the spec requires an unsupported query",
    id: "constraint-conflict-11feedad",
  },
  {
    category: "NOVEL_PROBLEM",
    rootCause: "First WebSocket integration in a REST-only project",
    normalized: "first websocket integration in a rest-only project",
    id: "novel-problem-dbf24ac6",
  },
  {
    category: "TOOL_FAILURE",
    rootCause: "npm run test failed: Cannot find module '@prisma/client'",
    normalized: "npm run test failed cannot find module prismaclient",
    id: "tool-failure-4c373923",
  },
  {
    category: "BUDGET_EXHAUSTION",
    rootCause:
      "Task spans 5 endpoints, their tests and their consumers in one dispatch",
    normalized:
      "task spans 5 endpoints their tests and their consumers in one dispatch",
    id: "budget-exhaustion-c33638e7",
  },
  {
    category: "MISSING_CONTEXT",
    rootCause: "  MIXED  Case,, punctuation!!  and   run-length   whitespace  ",
    normalized: "mixed case punctuation and run-length whitespace",
    id: "missing-context-7367d80b",
  },
  {
    category: "TOOL_FAILURE",
    rootCause: "Café — Ünïcode 42! in the root cause",
    normalized: "café ünïcode 42 in the root cause",
    id: "tool-failure-369f30a9",
  },
];

describe("recover harness — convergence on the shared digest function", () => {
  for (const fx of PRE_CHANGE_RECOVER_IDS) {
    it(`normalization is byte-identical for ${fx.category}: ${fx.id}`, () => {
      assert.equal(normalizeRootCause(fx.rootCause), fx.normalized);
    });

    it(`the id is byte-identical to the pre-change fixture for ${fx.id}`, () => {
      assert.equal(deriveId(fx.category, normalizeRootCause(fx.rootCause)), fx.id);
    });
  }

  it("covers all six diagnosis categories", () => {
    const covered = new Set(PRE_CHANGE_RECOVER_IDS.map((f) => f.category));
    assert.deepEqual([...covered].sort(), Object.keys(CATEGORY_ID_SLUGS).sort());
  });

  it("the harness holds no private createHash call", () => {
    const source = readFileSync(
      new URL("./recover-extract-heuristic-harness.mjs", import.meta.url),
      "utf8",
    );
    // Assert on the import graph rather than a raw substring: a comment that
    // merely names `createHash` must not fail this guard, but pulling the
    // primitive back in must.
    assert.doesNotMatch(
      source,
      /^\s*import\s[^\n]*["']node:crypto["']/m,
      "the harness must not import node:crypto — hashing belongs to the shared digest function",
    );
    assert.match(
      source,
      /from ["']\.\.\/\.\.\/lib\/heuristics\.mjs["']/,
      "the harness must import the shared helpers from lib/heuristics.mjs",
    );
  });

  it("the harness still composes category-prefixed ids, not origin-prefixed ones", () => {
    for (const [category, slug] of Object.entries(CATEGORY_ID_SLUGS)) {
      const id = deriveId(category, normalizeRootCause("some root cause"));
      assert.ok(id.startsWith(`${slug}-`), `${category} must yield a '${slug}-' prefix`);
    }
  });

  it("an unknown category is still rejected", () => {
    assert.throws(() => deriveId("NOT_A_CATEGORY", "text"), /unknown category/);
  });
});

// ── Task 6: migration onto the shared `adev heuristics signature` verb ───────
//
// Spec: .context-index/specs/features/heuristics/failure-capture.spec.md
// Plan-task: 6
//
// Behavior 6's acceptance bar is BYTE IDENTITY: recover ids for the same
// normalized root cause must be unchanged after Step 7 stops carrying its own
// prose derivation rule. The fixture below was captured from the UNMODIFIED
// skills/recover/SKILL.md derivation and is IMMUTABLE — if an assertion here
// fails, the code is wrong, never the fixture.

const RECOVER_SKILL = join(PLUGIN_ROOT, "skills", "recover", "SKILL.md");
const ADEV_CLI = join(PLUGIN_ROOT, "cli", "index.mjs");

const PRE_CHANGE_FIXTURE = JSON.parse(
  readFileSync(
    new URL("../fixtures/recover-heuristic-ids.pre-change.json", import.meta.url),
    "utf8",
  ),
).cases;

/**
 * Invoke the adev CLI with argv, returning its result.
 * @param {string[]} args
 */
function runCli(args) {
  const result = spawnSync("node", [ADEV_CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, ADEV_ROOT: PLUGIN_ROOT },
  });
  assert.equal(
    result.status,
    0,
    `adev ${args.join(" ")} must exit 0 (stderr: ${result.stderr})`,
  );
  return result.stdout.trim();
}

describe("Task 6 — recover keys derive from `adev heuristics signature`", () => {
  it("the fixture covers all six categories plus edge cases", () => {
    assert.equal(PRE_CHANGE_FIXTURE.length, 9, "fixture must hold 9 cases");
    const covered = new Set(PRE_CHANGE_FIXTURE.map((c) => c.category));
    assert.deepEqual([...covered].sort(), Object.keys(CATEGORY_ID_SLUGS).sort());
  });

  for (const { category, categorySlug, rootCause, normalized, id } of PRE_CHANGE_FIXTURE) {
    it(`verb id is byte-identical to the pre-change fixture for ${id}`, () => {
      const digest = runCli([
        "heuristics",
        "signature",
        "--origin",
        "recover",
        "--text",
        rootCause,
        "--digest-only",
      ]);
      assert.equal(
        `${CATEGORY_ID_SLUGS[category]}-${digest}`,
        id,
        `${category} / "${rootCause}" must still compose ${id}`,
      );
      assert.equal(
        CATEGORY_ID_SLUGS[category],
        categorySlug,
        `${category} slug must still be '${categorySlug}'`,
      );
    });

    it(`the shipped normalizer still agrees with the fixture for ${id}`, () => {
      assert.equal(
        normalizeRootCause(rootCause),
        normalized,
        `normalization of "${rootCause}" must be unchanged`,
      );
    });

    it(`the harness deriveId still equals the fixture id for ${id}`, () => {
      assert.equal(
        deriveId(category, normalizeRootCause(rootCause)),
        id,
        `harness deriveId must agree with the verb for ${id}`,
      );
    });

    it(`the signature is recover-<digest> and shares the id digest for ${id}`, () => {
      const sig = runCli([
        "heuristics",
        "signature",
        "--origin",
        "recover",
        "--text",
        rootCause,
      ]);
      const digest = runCli([
        "heuristics",
        "signature",
        "--origin",
        "recover",
        "--text",
        rootCause,
        "--digest-only",
      ]);
      assert.equal(sig, `recover-${digest}`, "signature must be recover-<digest>");
      assert.equal(
        id.endsWith(`-${digest}`),
        true,
        `${id} must end with the same digest the signature carries`,
      );
    });
  }
});

describe("Task 6 — skills/recover/SKILL.md names the verb, not the rule", () => {
  const src = () => readFileSync(RECOVER_SKILL, "utf8");

  it("carries no prose derivation rule", () => {
    const source = src();
    assert.doesNotMatch(source, /ID Derivation Rule/);
    assert.doesNotMatch(source, /SHA-256/);
    assert.doesNotMatch(source, /collapse consecutive whitespace/i);
  });

  it("names the signature verb for both the signature and the digest", () => {
    const source = src();
    assert.match(source, /adev heuristics signature --origin recover --text/);
    assert.match(source, /--digest-only/);
  });

  it("names the write verb with --signature", () => {
    const source = src();
    assert.match(source, /adev heuristics write/);
    assert.match(source, /--signature recover-<?[a-z0-9-]*>?/);
  });

  it("states the fail-closed rule when the verb is unavailable", () => {
    const source = src();
    assert.match(source, /heuristics: extraction skipped — signature verb unavailable/);
    assert.match(source, /skip heuristic extraction entirely/i);
  });

  it("keeps the sibling derivation sections intact", () => {
    const source = src();
    for (const heading of [
      "#### Category Templates",
      "#### Scope Derivation Rule",
      "#### Title Derivation Rule",
      "#### Contradiction Scan (before write)",
    ]) {
      assert.ok(source.includes(heading), `${heading} must survive the migration`);
    }
  });

  it("its composition rule still lists the six category slugs from the harness", () => {
    const source = src();
    for (const slug of Object.values(CATEGORY_ID_SLUGS)) {
      assert.ok(source.includes(slug), `category slug '${slug}' must appear in the skill`);
    }
  });

  it("contains no inline-Node invocation", () => {
    const source = src();
    assert.doesNotMatch(source, /node -e/);
    assert.doesNotMatch(source, /node --input-type=module -e/);
    assert.doesNotMatch(source, /Run inline Node\.js:/);
  });
});
