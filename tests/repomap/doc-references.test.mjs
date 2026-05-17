/**
 * Tests for lib/repomap/doc-references.mjs — Behaviors 1 & 2 of
 * non-code-reference-detection.spec.md.
 *
 * Fixture: tests/repomap/fixtures/doc-refs/
 *   skills/skill-a/SKILL.md — references assignment.mjs (twice), registry.mjs,
 *                             cli/index.mjs, fenced ref that must be ignored
 *   skills/skill-b/SKILL.md — references assignment.mjs, traversal attempt,
 *                             missing-target ref
 *   lib/test-strategies/assignment.mjs — exists
 *   lib/governance/registry.mjs       — exists
 *   cli/index.mjs                     — exists
 *   manifest.yaml                     — declares test-strategies, governance, cli roots
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { scanDocReferences } from "../../lib/repomap/doc-references.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, "fixtures", "doc-refs");

function cloneFixture() {
  const tmp = mkdtempSync(join(tmpdir(), "doc-refs-"));
  cpSync(FIXTURE_ROOT, tmp, { recursive: true });
  return tmp;
}

function cleanup(p) {
  try {
    rmSync(p, { recursive: true, force: true });
  } catch {}
}

test("scanDocReferences uses manifest modules[].paths as detection roots", () => {
  const root = cloneFixture();
  try {
    const manifest = {
      modules: [
        { slug: "test-strategies", paths: ["lib/test-strategies"] },
        { slug: "governance", paths: ["lib/governance"] },
        { slug: "cli", paths: ["cli"] },
      ],
    };
    const { edges } = scanDocReferences({ projectRoot: root, manifest });
    // assignment.mjs referenced from both skills (single edge per source/target)
    const assignmentEdges = edges.filter(
      (e) => e.to === "lib/test-strategies/assignment.mjs",
    );
    assert.equal(assignmentEdges.length, 2, "two skills reference assignment.mjs");
    // Each is a separate skill source — one edge per source/target pair.
    const sources = new Set(assignmentEdges.map((e) => e.from));
    assert.equal(sources.size, 2, "two distinct source skill files");
  } finally {
    cleanup(root);
  }
});

test("scanDocReferences falls back to default roots when manifest absent", () => {
  const root = cloneFixture();
  try {
    const { edges } = scanDocReferences({ projectRoot: root });
    // Default roots include lib, cli — should still find references.
    const hasAssignment = edges.some(
      (e) => e.to === "lib/test-strategies/assignment.mjs",
    );
    assert.ok(hasAssignment, "fallback roots should still detect lib/ references");
  } finally {
    cleanup(root);
  }
});

test("emits one edge per source/target with count of occurrences", () => {
  const root = cloneFixture();
  try {
    const { edges } = scanDocReferences({ projectRoot: root });
    // skill-a references assignment.mjs twice (outside the fence) — collapsed to one edge
    const skillAToAssignment = edges.filter(
      (e) =>
        e.from === "skills/skill-a/SKILL.md" &&
        e.to === "lib/test-strategies/assignment.mjs",
    );
    assert.equal(skillAToAssignment.length, 1, "single edge for one source/target pair");
    assert.equal(skillAToAssignment[0].count, 2, "count records text occurrences");
  } finally {
    cleanup(root);
  }
});

test("edge shape matches spec: type=doc-reference, symbols=[]", () => {
  const root = cloneFixture();
  try {
    const { edges } = scanDocReferences({ projectRoot: root });
    for (const edge of edges) {
      assert.equal(edge.type, "doc-reference");
      assert.deepEqual(edge.symbols, []);
      assert.ok(typeof edge.from === "string");
      assert.ok(typeof edge.to === "string");
      assert.ok(typeof edge.count === "number" && edge.count >= 1);
    }
  } finally {
    cleanup(root);
  }
});

test("references inside fenced code blocks are ignored", () => {
  const root = cloneFixture();
  try {
    const { edges } = scanDocReferences({ projectRoot: root });
    const fencedRef = edges.find(
      (e) =>
        e.from === "skills/skill-a/SKILL.md" &&
        e.to === "lib/test-strategies/should-not-detect.mjs",
    );
    assert.equal(fencedRef, undefined, "fenced reference must not produce an edge");
  } finally {
    cleanup(root);
  }
});

test("missing-target references are dropped from edges and listed in missing[]", () => {
  const root = cloneFixture();
  try {
    const { edges, missing } = scanDocReferences({ projectRoot: root });
    const missingEdge = edges.find(
      (e) => e.to === "lib/governance/does-not-exist.mjs",
    );
    assert.equal(missingEdge, undefined, "missing target must not produce an edge");
    const missingEntry = missing.find(
      (m) => m.ref === "lib/governance/does-not-exist.mjs",
    );
    assert.ok(missingEntry, "missing target must appear in missing[]");
    assert.equal(missingEntry.source, "skills/skill-b/SKILL.md");
    assert.ok(typeof missingEntry.line === "number" && missingEntry.line > 0);
  } finally {
    cleanup(root);
  }
});

test("path-traversal references are rejected with warning", () => {
  const root = cloneFixture();
  try {
    const { edges, warnings } = scanDocReferences({ projectRoot: root });
    const traversal = edges.find((e) => e.to && e.to.includes(".."));
    assert.equal(traversal, undefined, "traversal must not produce an edge");
    const traversalWarning = warnings.find(
      (w) => w.code === "REPOMAP_DOC_REFERENCE_PATH_TRAVERSAL",
    );
    assert.ok(traversalWarning, "traversal must emit REPOMAP_DOC_REFERENCE_PATH_TRAVERSAL");
  } finally {
    cleanup(root);
  }
});

test("supported extensions are mjs, js, ts, mts, cjs, sh, yaml", () => {
  const root = cloneFixture();
  try {
    // Create one extra fixture file with a reference to a .yaml file in scope.
    writeFileSync(
      join(root, "skills/skill-a/SKILL.md"),
      "Edit `cli/index.mjs` and read `cli/config.yaml`.\n",
    );
    writeFileSync(join(root, "cli", "config.yaml"), "key: value\n");
    const { edges } = scanDocReferences({ projectRoot: root });
    const hasYaml = edges.some((e) => e.to === "cli/config.yaml");
    const hasMjs = edges.some((e) => e.to === "cli/index.mjs");
    assert.ok(hasYaml, "yaml extension should be detected");
    assert.ok(hasMjs, "mjs extension should be detected");
  } finally {
    cleanup(root);
  }
});

test("returns deterministic output across runs", () => {
  const root = cloneFixture();
  try {
    const a = scanDocReferences({ projectRoot: root });
    const b = scanDocReferences({ projectRoot: root });
    assert.deepEqual(a.edges, b.edges, "edges should be deterministic");
    assert.deepEqual(a.missing, b.missing, "missing should be deterministic");
  } finally {
    cleanup(root);
  }
});

test("when projectRoot has no skills/ directory, returns empty result", () => {
  const tmp = mkdtempSync(join(tmpdir(), "doc-refs-no-skills-"));
  try {
    mkdirSync(join(tmp, "lib"), { recursive: true });
    const result = scanDocReferences({ projectRoot: tmp });
    assert.deepEqual(result.edges, []);
    assert.deepEqual(result.missing, []);
  } finally {
    cleanup(tmp);
  }
});
