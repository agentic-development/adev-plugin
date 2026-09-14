import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readHeuristics } from "../../lib/heuristics.mjs";
import { PLUGIN_ROOT, cleanupTempDir, createTempDir, readSkillSurface } from "../helpers.mjs";
import { CATEGORY_ID_SLUGS, CATEGORY_LABELS, deriveId, extractHeuristic, normalizeRootCause } from "./recover-extract-heuristic-harness.mjs";
import { runCheck12 } from "./validate-success-heuristic-harness.mjs";

/**
 * Eval tests for Step 7 "Extract Heuristic" of /adev:recover.
 *
 * Covers all six diagnosis categories. Each test constructs a mock
 * recovery-record context, invokes the Step 7 harness, asserts the
 * derived fields (id, scope, title, confidence, evidence, antiPattern
 * presence), and verifies the entry round-trips through
 * `readHeuristics`.
 */










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
  const src = () => readSkillSurface("recover");

  it("carries no prose derivation rule", () => {
    const source = src();
    assert.doesNotMatch(source, /ID Derivation Rule/);
    assert.doesNotMatch(source, /SHA-256/);
    assert.doesNotMatch(source, /collapse consecutive whitespace/i);
  });

  it("names the signature verb twice: once bare, once with --digest-only", () => {
    const lines = src().split("\n");
    const invocations = lines.filter((line) =>
      line.includes("adev heuristics signature --origin recover --text"),
    );
    // The two invocations must be distinct lines: the bare form yields the
    // `recover-<digest>` signature, the --digest-only form yields the digest
    // the id is composed from. One line naming both would not prove that.
    const bare = invocations.filter((line) => !line.includes("--digest-only"));
    const digestOnly = invocations.filter((line) => line.includes("--digest-only"));
    assert.ok(
      bare.length >= 1,
      "the skill must name a bare `adev heuristics signature --origin recover --text` invocation",
    );
    assert.ok(
      digestOnly.length >= 1,
      "the skill must name an `adev heuristics signature ... --digest-only` invocation",
    );
    assert.ok(
      bare.length + digestOnly.length === invocations.length && invocations.length >= 2,
      "the bare and --digest-only invocations must appear on separate lines",
    );
  });

  it("names the write verb with --signature", () => {
    const source = src();
    assert.match(source, /adev heuristics write/);
    // `+`, not `*`: a bare `--signature recover-` with no digest must not pass.
    assert.match(source, /--signature recover-<?[a-z0-9-]+>?/);
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

  it("contains no executable inline-Node directive", () => {
    // Pins the three patterns the constitution and .githooks/pre-commit-no-inline-node
    // forbid. It does NOT assert the absence of the pre-existing
    // `#### Inline Node Invocation` prose section, which is out of Task 6's scope.
    const source = src();
    assert.doesNotMatch(source, /node -e/);
    assert.doesNotMatch(source, /node --input-type=module -e/);
    assert.doesNotMatch(source, /Run inline Node\.js:/);
  });
});

// ─── merged from tests/skills/validate-extraction.test.mjs ──────────────────────────────────────────────
{
  /**
   * Integration tests for `/adev:validate` Check 13 "Success Heuristic
   * Extraction".
   *
   * Exercise the Check 13 harness end-to-end:
   *
   *   1. End-to-end round-trip at `medium` confidence — writes a heuristic
   *      via the harness, reads it back through `readHeuristics`, and
   *      verifies the title, pattern, and evidence match what the harness
   *      derived from the target spec.
   *
   *   2. Distillation discipline + antiPattern shape — verifies that when
   *      the caller supplies an explicit, distilled `successFactor` (with
   *      the raw credential stripped), the resulting heuristic never
   *      contains the raw literal, and that the empty `antiPattern` field
   *      is dropped by the serializer so it round-trips as absent.
   *
   * The distillation discipline for Check 13 is enforced by the harness's
   * INTERFACE: it takes `successFactor` as an explicit string, not a raw
   * context packet reference, which prevents the harness from accidentally
   * copying raw packet content into the heuristic. This test file proves
   * that contract works end-to-end.
   */









  const MODULE_SLUG = "demo";
  const DATE = "2026-04-09";
  const SPEC_TITLE = "Sample Demo";

  /**
   * Seed a temp project with a manifest declaring the `demo` module and a
   * target spec at `.context-index/specs/features/demo/sample.md`.
   *
   * @param {string} root
   * @returns {{ specAbs: string, specRel: string, reportRel: string }}
   */
  function seedFixture(root) {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index", "manifest.yaml"),
      `modules:\n  - slug: ${MODULE_SLUG}\n    path: ${MODULE_SLUG}/\n`,
    );

    const specDirRel = `.context-index/specs/features/${MODULE_SLUG}`;
    const specDirAbs = join(root, specDirRel);
    mkdirSync(specDirAbs, { recursive: true });

    const specRel = `${specDirRel}/sample.md`;
    const specAbs = join(root, specRel);
    writeFileSync(
      specAbs,
      `---\ncharter: ${MODULE_SLUG}\n---\n\n# Live Spec: ${SPEC_TITLE}\n\nBody.\n`,
    );

    const reportRel = `${specDirRel}/sample-validation.md`;
    return { specAbs, specRel, reportRel };
  }

  /**
   * Build a passing checkResults map for all 11 sub-checks.
   * @returns {Record<string, boolean>}
   */
  function allPassing() {
    const results = {};
    for (let i = 1; i <= 11; i += 1) {
      results[String(i)] = true;
    }
    return results;
  }

  describe("validate Check 13 integration — end-to-end round-trip", () => {
    let tempDir;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it("writes and reads back a success heuristic at medium confidence", async () => {
      const { specAbs, reportRel } = seedFixture(tempDir);

      const result = await runCheck12(tempDir, {
        specPath: specAbs,
        charter: MODULE_SLUG,
        specTitle: SPEC_TITLE,
        reportPath: reportRel,
        checkResults: allPassing(),
        modules: [MODULE_SLUG],
        date: DATE,
      });

      assert.equal(result.status, "PASS");
      assert.ok(result.heuristic, "expected heuristic on PASS");

      const h = result.heuristic;
      const expectedTitle = `First-run PASS: ${SPEC_TITLE}`;
      const expectedPattern = `First-run PASS for ${SPEC_TITLE}: implementation matched all acceptance criteria without revision`;

      assert.equal(h.title, expectedTitle);
      assert.equal(h.pattern, expectedPattern);
      assert.equal(h.scope, MODULE_SLUG);
      assert.equal(h.confidence, "medium");

      // Read the entry back through the public store API and verify it
      // shows up under a medium-or-higher query scoped to `demo`.
      const found = await readHeuristics(tempDir, {
        module: MODULE_SLUG,
        minConfidence: "medium",
      });
      assert.equal(found.length, 1);
      assert.equal(found[0].id, h.id);
      assert.equal(found[0].title, expectedTitle);
      assert.equal(found[0].pattern, expectedPattern);
      assert.equal(found[0].confidence, "medium");
      assert.equal(found[0].evidence.length, 1);
      assert.equal(found[0].evidence[0].source, "validation");
      assert.equal(found[0].evidence[0].path, reportRel);
      assert.equal(found[0].evidence[0].date, DATE);
    });
  });

  describe("validate Check 13 integration — distillation discipline + antiPattern shape", () => {
    let tempDir;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it("distilled successFactor never leaks raw credentials and omits antiPattern", async () => {
      const { specAbs, reportRel } = seedFixture(tempDir);

      // Sanity: the RAW context packet that the caller would have
      // inspected contains an AWS credential literal. The caller is
      // expected to distill this into a structural lesson BEFORE invoking
      // the harness. We assert the raw literal elsewhere to make the
      // intent of the test obvious.
      const RAW_CREDENTIAL = "AKIAIOSFODNN7EXAMPLE";
      const rawPacket = `api_key=${RAW_CREDENTIAL}\nreference: see cross-cutting auth spec`;
      assert.ok(
        rawPacket.includes(RAW_CREDENTIAL),
        "fixture sanity: raw packet must contain the credential literal",
      );

      // The DISTILLED pattern the caller actually supplies. It describes
      // the structural lesson (cross-cutting auth spec dependency) and
      // deliberately omits any credential literal.
      const distilledSuccessFactor =
        "context packet referenced cross-cutting auth spec for authentication dependency";
      assert.equal(
        distilledSuccessFactor.includes(RAW_CREDENTIAL),
        false,
        "fixture sanity: distilled pattern must not contain the credential",
      );

      const result = await runCheck12(tempDir, {
        specPath: specAbs,
        charter: MODULE_SLUG,
        specTitle: SPEC_TITLE,
        reportPath: reportRel,
        checkResults: allPassing(),
        modules: [MODULE_SLUG],
        date: DATE,
        successFactor: distilledSuccessFactor,
      });

      assert.equal(result.status, "PASS");
      assert.ok(result.heuristic, "expected heuristic on PASS");
      const h = result.heuristic;

      // (a) Written at medium confidence (single evidence entry, no
      //     auto-promotion).
      assert.equal(h.confidence, "medium");

      // (b) Title must not contain the credential.
      assert.equal(h.title.includes(RAW_CREDENTIAL), false);

      // (c) Pattern must not contain the credential and must be the
      //     distilled text we supplied.
      assert.equal(h.pattern.includes(RAW_CREDENTIAL), false);
      assert.equal(h.pattern, distilledSuccessFactor);

      // (d) antiPattern must be empty-or-absent on the returned entry —
      //     the harness sends `antiPattern: ""`, and the serializer drops
      //     the empty string so the field does not round-trip through
      //     the store (asserted below).
      assert.ok(h.antiPattern === "" || h.antiPattern === undefined);

      // Round-trip via readHeuristics to confirm the stored shape matches.
      const found = await readHeuristics(tempDir, {
        module: MODULE_SLUG,
        minConfidence: "medium",
      });
      assert.equal(found.length, 1);
      const stored = found[0];
      assert.equal(stored.id, h.id);
      assert.equal(stored.title.includes(RAW_CREDENTIAL), false);
      assert.equal(stored.pattern.includes(RAW_CREDENTIAL), false);
      assert.equal(stored.pattern, distilledSuccessFactor);
      assert.equal(stored.confidence, "medium");
      // After round-trip through readHeuristics the antiPattern field
      // must NOT have been reintroduced as an empty string — the
      // serializer drop is the contract that Check 13 relies on.
      assert.equal(
        stored.antiPattern,
        undefined,
        "antiPattern should be absent after round-trip (serializer drops empty string)",
      );
    });

    it("harness interface forces distillation by taking successFactor as an explicit string", async () => {
      // This is a CONTRACT test: the harness API accepts a single
      // distilled pattern string, not a raw context packet reference. By
      // construction, callers cannot accidentally pass raw packet content
      // through — they must reduce it to the structural lesson first.
      // We encode the contract by verifying the harness surface area.
      const harnessModule = await import("./validate-success-heuristic-harness.mjs");
      assert.equal(typeof harnessModule.runCheck12, "function");

      // Demonstrate the contract: even when the caller's intent is to
      // summarize the packet, the string they pass is what gets persisted
      // verbatim (up to the pattern cap), so the distillation discipline
      // lives entirely in the caller's responsibility to pre-distill.
      const { specAbs, reportRel } = seedFixture(tempDir);
      const distilled = "packet referenced golden sample demonstrating idempotent handler pattern";

      const result = await runCheck12(tempDir, {
        specPath: specAbs,
        charter: MODULE_SLUG,
        specTitle: SPEC_TITLE,
        reportPath: reportRel,
        checkResults: allPassing(),
        modules: [MODULE_SLUG],
        date: DATE,
        successFactor: distilled,
      });

      assert.equal(result.status, "PASS");
      assert.equal(result.heuristic.pattern, distilled);
      assert.ok(
        result.heuristic.antiPattern === "" || result.heuristic.antiPattern === undefined,
      );
    });
  });
}
