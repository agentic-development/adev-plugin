/**
 * RED-phase contract for the shared validate-failure lookup-key helper.
 *
 * `deriveValidateFailureSignature(checks)` must reproduce EXACTLY the capture-side
 * composition that currently lives inline in
 * `hooks/post-validate-extract-heuristics.mjs` (the FAIL branch): filter to checks
 * with a non-empty string `id` and a string `outcome !== 'PASS'`, sanitize each id
 * to the closed `[A-Za-z0-9._-]` charset, drop empties, and — when anything
 * survives — hash the deduped, sorted, space-joined list through
 * `deriveSignature('validate', ...)`. No survivors means `null`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PLUGIN_ROOT } from "../helpers.mjs";
import {
  deriveValidateFailureSignature,
  deriveSignature,
} from "../../lib/heuristics.mjs";

describe("deriveValidateFailureSignature", () => {
  it("dedupes, sorts, and joins failing check ids with a single space", () => {
    const checks = [
      { id: "gate-1", outcome: "FAIL" },
      { id: "adr-3", outcome: "FAIL" },
      { id: "gate-1", outcome: "FAIL" },
      { id: "spec-2", outcome: "PASS" },
    ];
    assert.equal(
      deriveValidateFailureSignature(checks),
      deriveSignature("validate", "adr-3 gate-1"),
    );
  });

  it("treats any non-PASS outcome as failing", () => {
    const checks = [
      { id: "gate-1", outcome: "WARN" },
      { id: "adr-3", outcome: "SKIP" },
    ];
    assert.equal(
      deriveValidateFailureSignature(checks),
      deriveSignature("validate", "adr-3 gate-1"),
    );
  });

  it("returns null when no check has a non-PASS outcome (+1 more contract assertions)", () => {
    // returns null when no check has a non-PASS outcome
    assert.equal(deriveValidateFailureSignature([]), null);
    assert.equal(
    deriveValidateFailureSignature([
    { id: "gate-1", outcome: "PASS" },
    { id: "adr-3", outcome: "PASS" },
    ]),
    null,
    );

    // returns null for a missing or non-array checks value
    assert.equal(deriveValidateFailureSignature(undefined), null);
    assert.equal(deriveValidateFailureSignature(null), null);
    assert.equal(deriveValidateFailureSignature({}), null);
    assert.equal(deriveValidateFailureSignature("gate-1"), null);
  });

  it("ignores entries with a missing, empty, or non-string id or outcome", () => {
    const checks = [
      null,
      { outcome: "FAIL" },
      { id: "", outcome: "FAIL" },
      { id: 7, outcome: "FAIL" },
      { id: "gate-1" },
      { id: "gate-1", outcome: 0 },
      { id: "adr-3", outcome: "FAIL" },
    ];
    assert.equal(
      deriveValidateFailureSignature(checks),
      deriveSignature("validate", "adr-3"),
    );
  });

  it("returns null when every failing id sanitizes away to empty", () => {
    assert.equal(
      deriveValidateFailureSignature([
        { id: "///", outcome: "FAIL" },
        { id: "  ", outcome: "FAIL" },
      ]),
      null,
    );
  });

  it("sanitizes ids to the closed charset before hashing", () => {
    const dirty = [{ id: "gate/1;rm -rf", outcome: "FAIL" }];
    assert.equal(
      deriveValidateFailureSignature(dirty),
      deriveSignature("validate", "gate1rm-rf"),
    );
  });

  it("no second composition of deriveSignature('validate', ...) exists in the tree", () => {
    const hook = readFileSync(
      join(PLUGIN_ROOT, "hooks", "post-validate-extract-heuristics.mjs"),
      "utf8",
    );
    assert.equal(
      /deriveSignature\(\s*['"]validate['"]/.test(hook),
      false,
      "the hook must call deriveValidateFailureSignature, not compose the input itself",
    );
  });
});
