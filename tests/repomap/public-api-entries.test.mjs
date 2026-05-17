/**
 * Tests for lib/repomap/public-api-entries.mjs — Behavior 3 of
 * non-code-reference-detection.spec.md.
 *
 * Supported shapes (in scope):
 *   - Top-level entry string: `{ ".": "./cli/index.mjs" }`
 *   - Conditional object with `import` and/or `default` keys (`import` wins
 *     when both are present).
 *
 * Out-of-scope shapes (emit REPOMAP_EXPORTS_UNSUPPORTED_SHAPE, skip):
 *   - Conditional object missing both `import` and `default`
 *   - Subpath entries (`"./feature"`)
 *   - Glob entries (`"./*.mjs"`)
 *   - `null` blocking entries
 *
 * Error cases:
 *   - REPOMAP_EXPORTS_PARSE_ERROR — malformed JSON
 *   - REPOMAP_EXPORTS_OUT_OF_ROOT — entry resolves outside the project root
 *   - REPOMAP_EXPORTS_UNSUPPORTED_SHAPE — shapes listed above
 *
 * Missing `package.json` returns an empty result, no errors.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolvePublicApiEntries } from "../../lib/repomap/public-api-entries.mjs";

function makeProject(pkg) {
  const tmp = mkdtempSync(join(tmpdir(), "public-api-"));
  mkdirSync(join(tmp, "cli"), { recursive: true });
  writeFileSync(join(tmp, "cli/index.mjs"), "export function main() {}\n");
  if (pkg !== null) {
    writeFileSync(
      join(tmp, "package.json"),
      typeof pkg === "string" ? pkg : JSON.stringify(pkg, null, 2),
    );
  }
  return tmp;
}

function cleanup(p) {
  try {
    rmSync(p, { recursive: true, force: true });
  } catch {}
}

test("resolves top-level entry: { '.': './cli/index.mjs' }", () => {
  const root = makeProject({
    name: "test",
    exports: { ".": "./cli/index.mjs" },
  });
  try {
    const { tagged, warnings } = resolvePublicApiEntries({ projectRoot: root });
    assert.equal(tagged.length, 1);
    assert.equal(tagged[0].path, "cli/index.mjs");
    assert.equal(tagged[0].key, ".");
    assert.deepEqual(warnings, []);
  } finally {
    cleanup(root);
  }
});

test("resolves conditional with `import` only", () => {
  const root = makeProject({
    name: "test",
    exports: { ".": { import: "./cli/index.mjs" } },
  });
  try {
    const { tagged, warnings } = resolvePublicApiEntries({ projectRoot: root });
    assert.equal(tagged.length, 1);
    assert.equal(tagged[0].path, "cli/index.mjs");
    assert.deepEqual(warnings, []);
  } finally {
    cleanup(root);
  }
});

test("resolves conditional with both `import` and `default` — `import` wins", () => {
  const root = makeProject({
    name: "test",
    exports: {
      ".": {
        import: "./cli/index.mjs",
        default: "./cli/other.mjs",
      },
    },
  });
  try {
    mkdirSync(join(root, "cli"), { recursive: true });
    writeFileSync(join(root, "cli/other.mjs"), "export function other() {}\n");
    const { tagged } = resolvePublicApiEntries({ projectRoot: root });
    assert.equal(tagged.length, 1);
    assert.equal(tagged[0].path, "cli/index.mjs", "import wins over default");
  } finally {
    cleanup(root);
  }
});

test("resolves conditional with `default` only", () => {
  const root = makeProject({
    name: "test",
    exports: { ".": { default: "./cli/index.mjs" } },
  });
  try {
    const { tagged } = resolvePublicApiEntries({ projectRoot: root });
    assert.equal(tagged.length, 1);
    assert.equal(tagged[0].path, "cli/index.mjs");
  } finally {
    cleanup(root);
  }
});

test("conditional with neither `import` nor `default` emits UNSUPPORTED_SHAPE", () => {
  const root = makeProject({
    name: "test",
    exports: { ".": { require: "./cli/index.mjs" } },
  });
  try {
    const { tagged, warnings } = resolvePublicApiEntries({ projectRoot: root });
    assert.deepEqual(tagged, []);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, "REPOMAP_EXPORTS_UNSUPPORTED_SHAPE");
  } finally {
    cleanup(root);
  }
});

test("subpath entry emits UNSUPPORTED_SHAPE", () => {
  const root = makeProject({
    name: "test",
    exports: {
      ".": "./cli/index.mjs",
      "./feature": "./cli/feature.mjs",
    },
  });
  try {
    const { tagged, warnings } = resolvePublicApiEntries({ projectRoot: root });
    // root entry resolves, subpath does not.
    assert.equal(tagged.length, 1);
    assert.equal(tagged[0].key, ".");
    assert.ok(
      warnings.some(
        (w) =>
          w.code === "REPOMAP_EXPORTS_UNSUPPORTED_SHAPE" && w.key === "./feature",
      ),
    );
  } finally {
    cleanup(root);
  }
});

test("glob entry emits UNSUPPORTED_SHAPE", () => {
  const root = makeProject({
    name: "test",
    exports: { "./*": "./cli/*.mjs" },
  });
  try {
    const { tagged, warnings } = resolvePublicApiEntries({ projectRoot: root });
    assert.deepEqual(tagged, []);
    assert.ok(
      warnings.some((w) => w.code === "REPOMAP_EXPORTS_UNSUPPORTED_SHAPE"),
    );
  } finally {
    cleanup(root);
  }
});

test("null blocking entry emits UNSUPPORTED_SHAPE", () => {
  const root = makeProject({
    name: "test",
    exports: { ".": null },
  });
  try {
    const { tagged, warnings } = resolvePublicApiEntries({ projectRoot: root });
    assert.deepEqual(tagged, []);
    assert.ok(
      warnings.some((w) => w.code === "REPOMAP_EXPORTS_UNSUPPORTED_SHAPE"),
    );
  } finally {
    cleanup(root);
  }
});

test("non-`import`/`default` conditional (only `require`) emits UNSUPPORTED_SHAPE", () => {
  const root = makeProject({
    name: "test",
    exports: { ".": { node: "./cli/index.mjs" } },
  });
  try {
    const { tagged, warnings } = resolvePublicApiEntries({ projectRoot: root });
    assert.deepEqual(tagged, []);
    assert.ok(
      warnings.some((w) => w.code === "REPOMAP_EXPORTS_UNSUPPORTED_SHAPE"),
    );
  } finally {
    cleanup(root);
  }
});

test("out-of-root path emits OUT_OF_ROOT", () => {
  const root = makeProject({
    name: "test",
    exports: { ".": "../escape.mjs" },
  });
  try {
    const { tagged, warnings } = resolvePublicApiEntries({ projectRoot: root });
    assert.deepEqual(tagged, []);
    assert.ok(warnings.some((w) => w.code === "REPOMAP_EXPORTS_OUT_OF_ROOT"));
  } finally {
    cleanup(root);
  }
});

test("malformed JSON emits PARSE_ERROR", () => {
  const root = makeProject("{ not valid json");
  try {
    const { tagged, warnings } = resolvePublicApiEntries({ projectRoot: root });
    assert.deepEqual(tagged, []);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, "REPOMAP_EXPORTS_PARSE_ERROR");
  } finally {
    cleanup(root);
  }
});

test("missing package.json returns empty (no error)", () => {
  const root = makeProject(null);
  try {
    const { tagged, warnings } = resolvePublicApiEntries({ projectRoot: root });
    assert.deepEqual(tagged, []);
    assert.deepEqual(warnings, []);
  } finally {
    cleanup(root);
  }
});

test("no exports field returns empty (no error)", () => {
  const root = makeProject({ name: "test" });
  try {
    const { tagged, warnings } = resolvePublicApiEntries({ projectRoot: root });
    assert.deepEqual(tagged, []);
    assert.deepEqual(warnings, []);
  } finally {
    cleanup(root);
  }
});

test("returns deterministic output across runs", () => {
  const root = makeProject({
    name: "test",
    exports: {
      ".": "./cli/index.mjs",
      "./feature": "./cli/feature.mjs",
    },
  });
  try {
    const a = resolvePublicApiEntries({ projectRoot: root });
    const b = resolvePublicApiEntries({ projectRoot: root });
    assert.deepEqual(a.tagged, b.tagged);
    assert.deepEqual(a.warnings, b.warnings);
  } finally {
    cleanup(root);
  }
});
