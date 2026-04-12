/**
 * Integration tests for `/adev:validate` Check 12 "Success Heuristic
 * Extraction".
 *
 * Exercise the Check 12 harness end-to-end:
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
 * The distillation discipline for Check 12 is enforced by the harness's
 * INTERFACE: it takes `successFactor` as an explicit string, not a raw
 * context packet reference, which prevents the harness from accidentally
 * copying raw packet content into the heuristic. This test file proves
 * that contract works end-to-end.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readHeuristics } from "../../lib/heuristics.mjs";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { runCheck12 } from "./validate-success-heuristic-harness.mjs";

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

describe("validate Check 12 integration — end-to-end round-trip", () => {
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

describe("validate Check 12 integration — distillation discipline + antiPattern shape", () => {
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
    // serializer drop is the contract that Check 12 relies on.
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
