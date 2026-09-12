/**
 * Tests for `writeRegistrySelection` — the shared explicit-selection write
 * path for `governance/validate.yaml` and `governance/review.yaml`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeRegistrySelection } from "../../lib/governance/registry-scaffold.mjs";
import { readMarker } from "../../lib/governance/registry-marker.mjs";
import { createTempDir, captureThrow } from "../helpers.mjs";

test("non-empty validate selection writes a fresh checks: block, no marker", () => {
  const dir = createTempDir();
  const result = writeRegistrySelection(dir, "validate", [
    { id: "validate.check-1-quality-gates", kind: "deterministic-check", severity: "error", source: "project" },
  ]);
  const text = readFileSync(join(dir, ".context-index/governance/validate.yaml"), "utf8");
  assert.match(text, /checks:\n\s+- id: validate\.check-1-quality-gates/);
  assert.equal(readMarker(join(dir, ".context-index/governance/validate.yaml")), null);
  assert.equal(result.entry_count, 1);
});

test("non-empty selection's header names the scaffold's own provenance, never the extension-install header", () => {
  const dir = createTempDir();
  writeRegistrySelection(dir, "validate", [
    { id: "validate.check-1-quality-gates", kind: "deterministic-check", severity: "error", source: "project" },
  ]);
  const text = readFileSync(join(dir, ".context-index/governance/validate.yaml"), "utf8");
  assert.doesNotMatch(text, /created by adev extension install/);
  assert.match(text, /explicit operator selection/);
  assert.match(text, /adev governance scaffold/);
});

test("non-empty review selection's marker comment names 'adev governance scaffold', not 'adev governance materialize'", () => {
  const dir = createTempDir();
  writeRegistrySelection(dir, "review", [
    { id: "my-reviewer", prompt: "prompts/x.md" },
  ]);
  const text = readFileSync(join(dir, ".context-index/governance/review.yaml"), "utf8");
  assert.match(text, /Stamped by 'adev governance scaffold'/);
  assert.doesNotMatch(text, /Stamped by 'adev governance materialize'/);
  assert.doesNotMatch(text, /the complete effective set/, "scaffold never computed a merged effective set");
});

test("zero-selection review's marker comment also names 'adev governance scaffold'", () => {
  const dir = createTempDir();
  writeRegistrySelection(dir, "review", []);
  const text = readFileSync(join(dir, ".context-index/governance/review.yaml"), "utf8");
  assert.match(text, /Stamped by 'adev governance scaffold'/);
  assert.match(text, /operator's own explicit selection/);
});

test("unknown registry name is refused with GOVERNANCE_SCAFFOLD_REGISTRY_UNKNOWN", () => {
  const dir = createTempDir();
  const err = captureThrow(() => writeRegistrySelection(dir, "gates", []));
  assert.equal(err.code, "GOVERNANCE_SCAFFOLD_REGISTRY_UNKNOWN");
});

test("non-array entries is refused with GOVERNANCE_SCAFFOLD_ENTRIES_INVALID", () => {
  const dir = createTempDir();
  const err = captureThrow(() => writeRegistrySelection(dir, "validate", "not-an-array"));
  assert.equal(err.code, "GOVERNANCE_SCAFFOLD_ENTRIES_INVALID");
});

test("zero-selection validate writes an explicit empty list, not an absent file", () => {
  const dir = createTempDir();
  writeRegistrySelection(dir, "validate", []);
  const path = join(dir, ".context-index/governance/validate.yaml");
  assert.ok(existsSync(path));
  assert.match(readFileSync(path, "utf8"), /^checks:\s*\[\]\s*$/m);
});

test("zero-selection review writes an explicit empty list WITH the materialized_at marker", () => {
  const dir = createTempDir();
  writeRegistrySelection(dir, "review", []);
  const path = join(dir, ".context-index/governance/review.yaml");
  assert.match(readFileSync(path, "utf8"), /^reviewers:\s*\[\]\s*$/m);
  assert.ok(readMarker(path) !== null, "review.yaml must carry the marker even when empty");
});

test("refuses to run against an already-existing file", () => {
  const dir = createTempDir();
  writeRegistrySelection(dir, "validate", []);
  const err = captureThrow(() => writeRegistrySelection(dir, "validate", []));
  assert.equal(err.code, "GOVERNANCE_SCAFFOLD_EXISTS");
});
