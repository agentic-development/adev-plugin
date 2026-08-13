// tests/lib/test-strategies/helper-inventory.test.mjs
//
// Tests for lib/test-strategies/helper-inventory.mjs — the language-agnostic
// shared-test-helper / fixture / golden-test-sample inventory injected into
// write-test and implement subagent prompts.
//
// Spec: .context-index/specs/features/test-strategies/test-helper-inventory.spec.md

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  HELPER_REGISTRY,
  buildInventory,
  collectHelperSources,
  collectTestSamples,
  extractSymbols,
  findDuplicateHelpers,
  renderInventoryText,
} from "../../../lib/test-strategies/helper-inventory.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";

function write(root, relPath, content) {
  const abs = join(root, relPath);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
  return abs;
}

// ---------------------------------------------------------------------------
// Behavior 1-2: language-agnostic discovery
// ---------------------------------------------------------------------------

test("detects a JavaScript shared helper module", () => {
  const dir = createTempDir();
  try {
    write(dir, "tests/helpers.mjs", "export function makeTempProject() {}\n");
    const { entries } = collectHelperSources(dir);
    const paths = entries.map((e) => e.path);
    assert.ok(paths.includes("tests/helpers.mjs"), `got ${JSON.stringify(paths)}`);
    const entry = entries.find((e) => e.path === "tests/helpers.mjs");
    assert.equal(entry.language, "javascript");
    assert.equal(entry.kind, "helper");
  } finally {
    cleanupTempDir(dir);
  }
});

test("detects conftest.py in a Python project without any JavaScript entry", () => {
  const dir = createTempDir();
  try {
    write(dir, "tests/conftest.py", "import pytest\n\n@pytest.fixture\ndef db():\n    return 1\n");
    write(dir, "tests/test_thing.py", "def test_a():\n    assert True\n");
    const { entries } = collectHelperSources(dir);
    const paths = entries.map((e) => e.path);
    assert.deepEqual(paths, ["tests/conftest.py"]);
    assert.equal(entries[0].language, "python");
    assert.equal(entries[0].kind, "fixture");
    assert.ok(!entries.some((e) => e.language === "javascript"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("registry is a data table with language/kind/globs on every row", () => {
  assert.ok(Array.isArray(HELPER_REGISTRY));
  assert.ok(HELPER_REGISTRY.length >= 14);
  const languages = new Set(HELPER_REGISTRY.map((r) => r.language));
  for (const lang of ["javascript", "python", "ruby", "go", "rust", "java", "elixir", "php", "csharp"]) {
    assert.ok(languages.has(lang), `registry missing language ${lang}`);
  }
  for (const row of HELPER_REGISTRY) {
    assert.ok(["helper", "fixture", "setup"].includes(row.kind), `bad kind ${row.kind}`);
    assert.ok(Array.isArray(row.globs) && row.globs.length > 0);
  }
});

test("a path matching two registry rows is reported exactly once", () => {
  const dir = createTempDir();
  try {
    // tests/support/** matches the javascript helper row; also inside tests/
    write(dir, "tests/support/factory.mjs", "export const x = 1;\n");
    const { entries } = collectHelperSources(dir);
    const hits = entries.filter((e) => e.path === "tests/support/factory.mjs");
    assert.equal(hits.length, 1);
  } finally {
    cleanupTempDir(dir);
  }
});

test("test case files are never inventory entries", () => {
  const dir = createTempDir();
  try {
    // `**/tests/**/helpers.*` would otherwise match this via matchGlob's segment-crossing `**`.
    write(dir, "tests/cli/test-helpers.test.mjs", "export function a() {}\n");
    write(dir, "tests/support/thing_test.go", "func Helper() {}\n");
    write(dir, "tests/support/test_util.py", "def helper():\n    pass\n");
    write(dir, "tests/helpers.mjs", "export function real() {}\n");
    const { entries } = collectHelperSources(dir);
    assert.deepEqual(entries.map((e) => e.path), ["tests/helpers.mjs"]);
  } finally {
    cleanupTempDir(dir);
  }
});

test("skips vendored and build directories", () => {
  const dir = createTempDir();
  try {
    write(dir, "node_modules/pkg/tests/helpers.js", "export function a() {}\n");
    write(dir, "dist/tests/helpers.js", "export function b() {}\n");
    write(dir, "tests/helpers.mjs", "export function c() {}\n");
    const { entries } = collectHelperSources(dir);
    assert.deepEqual(entries.map((e) => e.path), ["tests/helpers.mjs"]);
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Behavior 3: directory-shaped probes
// ---------------------------------------------------------------------------

test("fixture data directories are reported once with a fileCount, not per file", () => {
  const dir = createTempDir();
  try {
    for (let i = 0; i < 5; i++) write(dir, `tests/fixtures/f${i}.json`, "{}\n");
    const { entries } = collectHelperSources(dir);
    const fixtures = entries.filter((e) => e.path === "tests/fixtures");
    assert.equal(fixtures.length, 1);
    assert.equal(fixtures[0].directory, true);
    assert.equal(fixtures[0].fileCount, 5);
    assert.ok(!entries.some((e) => e.path.startsWith("tests/fixtures/")));
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Behavior 4: manifest declaration
// ---------------------------------------------------------------------------

test("test_helpers.paths adds entries", () => {
  const dir = createTempDir();
  try {
    write(dir, "src/testing/factories.py", "def make_user():\n    pass\n");
    const manifest = { test_helpers: { paths: ["src/testing/factories.py"] } };
    const { entries } = collectHelperSources(dir, { manifest });
    assert.ok(entries.some((e) => e.path === "src/testing/factories.py"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("test_helpers.exclude removes entries and wins over both builtins and paths", () => {
  const dir = createTempDir();
  try {
    write(dir, "tests/helpers.mjs", "export function a() {}\n");
    write(dir, "tests/support/extra.mjs", "export function b() {}\n");
    const manifest = {
      test_helpers: {
        paths: ["tests/support/**"],
        exclude: ["tests/support/**", "tests/helpers.mjs"],
      },
    };
    const { entries } = collectHelperSources(dir, { manifest });
    assert.deepEqual(entries.map((e) => e.path), []);
  } finally {
    cleanupTempDir(dir);
  }
});

test("test_helpers.detect false suppresses the built-in registry", () => {
  const dir = createTempDir();
  try {
    write(dir, "tests/helpers.mjs", "export function a() {}\n");
    write(dir, "custom/place/thing.mjs", "export function b() {}\n");
    const manifest = { test_helpers: { detect: false, paths: ["custom/place/**"] } };
    const { entries } = collectHelperSources(dir, { manifest });
    assert.deepEqual(entries.map((e) => e.path), ["custom/place/thing.mjs"]);
  } finally {
    cleanupTempDir(dir);
  }
});

test("malformed test_helpers warns instead of throwing", () => {
  const dir = createTempDir();
  try {
    write(dir, "tests/helpers.mjs", "export function a() {}\n");
    const { entries, warnings } = collectHelperSources(dir, {
      manifest: { test_helpers: "nope" },
    });
    assert.deepEqual(entries.map((e) => e.path), ["tests/helpers.mjs"]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /test_helpers/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("non-array paths/exclude warn instead of throwing", () => {
  const dir = createTempDir();
  try {
    write(dir, "tests/helpers.mjs", "export function a() {}\n");
    const { entries, warnings } = collectHelperSources(dir, {
      manifest: { test_helpers: { paths: "tests/**", exclude: 3 } },
    });
    assert.deepEqual(entries.map((e) => e.path), ["tests/helpers.mjs"]);
    assert.equal(warnings.length, 2);
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Behavior 5: symbol extraction
// ---------------------------------------------------------------------------

test("extracts JavaScript exported symbols with kinds and line numbers", () => {
  const src = [
    "import { x } from 'y';",
    "export function makeTempProject() {}",
    "export async function boot() {}",
    "export const PLUGIN_ROOT = 1;",
    "export class Runner {}",
    "function notExported() {}",
    "export { alpha, beta };",
  ].join("\n");
  const symbols = extractSymbols(src, "javascript");
  const names = symbols.map((s) => s.name);
  assert.deepEqual(names.sort(), ["PLUGIN_ROOT", "Runner", "alpha", "beta", "boot", "makeTempProject"].sort());
  assert.ok(!names.includes("notExported"));
  const fn = symbols.find((s) => s.name === "makeTempProject");
  assert.equal(fn.kind, "function");
  assert.equal(fn.line, 2);
  assert.equal(symbols.find((s) => s.name === "Runner").kind, "class");
  assert.equal(symbols.find((s) => s.name === "PLUGIN_ROOT").kind, "constant");
});

test("marks pytest-decorated defs as fixtures", () => {
  const src = [
    "import pytest",
    "",
    "@pytest.fixture",
    "def db_session():",
    "    return 1",
    "",
    "def helper_thing():",
    "    return 2",
    "",
    "class Base:",
    "    pass",
  ].join("\n");
  const symbols = extractSymbols(src, "python");
  const db = symbols.find((s) => s.name === "db_session");
  assert.equal(db.kind, "fixture");
  assert.equal(symbols.find((s) => s.name === "helper_thing").kind, "function");
  assert.equal(symbols.find((s) => s.name === "Base").kind, "class");
});

test("go extraction keeps exported functions only", () => {
  const src = "func NewFixture() {}\nfunc unexported() {}\n";
  const names = extractSymbols(src, "go").map((s) => s.name);
  assert.deepEqual(names, ["NewFixture"]);
});

test("exportedOnly false also picks up local definitions", () => {
  const src = "function makeTempProject() {}\nconst cleanup = () => {};\n";
  const names = extractSymbols(src, "javascript", { exportedOnly: false }).map((s) => s.name);
  assert.ok(names.includes("makeTempProject"));
  assert.ok(names.includes("cleanup"));
});

test("symbol extraction is capped at 25 symbols per file", () => {
  const dir = createTempDir();
  try {
    const lines = [];
    for (let i = 0; i < 40; i++) lines.push(`export function fn${String(i).padStart(2, "0")}() {}`);
    write(dir, "tests/helpers.mjs", lines.join("\n"));
    const { entries } = collectHelperSources(dir);
    const entry = entries.find((e) => e.path === "tests/helpers.mjs");
    assert.equal(entry.symbols.length, 25);
    assert.equal(entry.symbolsTruncated, 15);
  } finally {
    cleanupTempDir(dir);
  }
});

test("oversize files are listed without symbol extraction", () => {
  const dir = createTempDir();
  try {
    const big = "export function a() {}\n" + "// pad\n".repeat(100000);
    write(dir, "tests/helpers.mjs", big);
    const { entries } = collectHelperSources(dir);
    const entry = entries.find((e) => e.path === "tests/helpers.mjs");
    assert.equal(entry.oversize, true);
    assert.deepEqual(entry.symbols, []);
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Behavior 6: golden TEST samples
// ---------------------------------------------------------------------------

test("classifies samples by explicit Sample kind marker and by test-shaped Source", () => {
  const dir = createTempDir();
  try {
    write(
      dir,
      ".context-index/samples/general-test-helpers.md",
      "# Golden Sample: Test Helpers\n\n> **Pattern:** general\n> **Source:** tests/helpers.mjs\n",
    );
    write(
      dir,
      ".context-index/samples/api-route-crud.md",
      "# Golden Sample: CRUD Route\n\n> **Pattern:** api-route\n> **Source:** src/app/api/users/route.ts\n",
    );
    write(
      dir,
      ".context-index/samples/marked.md",
      "# Golden Sample: Marked\n\n> **Sample kind:** test\n> **Source:** anywhere/at/all.rb\n",
    );
    const samples = collectTestSamples(dir);
    const paths = samples.map((s) => s.path);
    assert.ok(paths.includes(".context-index/samples/general-test-helpers.md"));
    assert.ok(paths.includes(".context-index/samples/marked.md"));
    assert.ok(!paths.includes(".context-index/samples/api-route-crud.md"));
    const helperSample = samples.find((s) => s.path.endsWith("general-test-helpers.md"));
    assert.equal(helperSample.title, "Golden Sample: Test Helpers");
    assert.equal(helperSample.source, "tests/helpers.mjs");
  } finally {
    cleanupTempDir(dir);
  }
});

test("missing samples directory yields an empty sample list", () => {
  const dir = createTempDir();
  try {
    assert.deepEqual(collectTestSamples(dir), []);
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Behavior 7: determinism
// ---------------------------------------------------------------------------

test("two runs on an unchanged tree produce byte-identical output", () => {
  const dir = createTempDir();
  try {
    write(dir, "tests/helpers.mjs", "export function a() {}\nexport function b() {}\n");
    write(dir, "tests/support/one.mjs", "export const one = 1;\n");
    write(dir, "tests/support/two.mjs", "export const two = 2;\n");
    write(dir, "tests/fixtures/x.json", "{}\n");
    write(dir, "spec/spec_helper.rb", "def helper_a\nend\n");
    const a = buildInventory(dir);
    const b = buildInventory(dir);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.equal(renderInventoryText(a), renderInventoryText(b));
  } finally {
    cleanupTempDir(dir);
  }
});

test("entries sort by kind then path", () => {
  const dir = createTempDir();
  try {
    write(dir, "tests/fixtures/x.json", "{}\n");
    write(dir, "spec/spec_helper.rb", "def a\nend\n");
    write(dir, "tests/helpers.mjs", "export function z() {}\n");
    const { entries } = buildInventory(dir);
    assert.deepEqual(
      entries.map((e) => `${e.kind}:${e.path}`),
      ["helper:tests/helpers.mjs", "fixture:tests/fixtures", "setup:spec/spec_helper.rb"],
    );
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Behavior 8: rendering and injection budget
// ---------------------------------------------------------------------------

test("text render never exceeds the budget and ends with a +N more footer", () => {
  const dir = createTempDir();
  try {
    for (let i = 0; i < 40; i++) {
      write(dir, `tests/support/mod${String(i).padStart(2, "0")}.mjs`, "export function a() {}\n");
    }
    const inventory = buildInventory(dir);
    const text = renderInventoryText(inventory, { maxLines: 12 });
    const lines = text.split("\n");
    assert.ok(lines.length <= 12, `got ${lines.length} lines`);
    assert.match(lines[lines.length - 1], /^\+\d+ more/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("empty inventory renders the single empty-result line", () => {
  const dir = createTempDir();
  try {
    const inventory = buildInventory(dir);
    assert.equal(
      renderInventoryText(inventory),
      "No shared test helpers, fixtures, or test samples detected.",
    );
    assert.equal(inventory.empty, true);
  } finally {
    cleanupTempDir(dir);
  }
});

test("render lists helper symbols and test samples", () => {
  const dir = createTempDir();
  try {
    write(dir, "tests/helpers.mjs", "export function makeTempProject() {}\n");
    write(
      dir,
      ".context-index/samples/general-test-helpers.md",
      "# Golden Sample: Test Helpers\n\n> **Source:** tests/helpers.mjs\n",
    );
    const text = renderInventoryText(buildInventory(dir));
    assert.match(text, /tests\/helpers\.mjs/);
    assert.match(text, /makeTempProject/);
    assert.match(text, /general-test-helpers\.md/);
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Behavior 10: advisory duplicate detection
// ---------------------------------------------------------------------------

test("reports a locally redefined helper that already exists in a shared module", () => {
  const dir = createTempDir();
  try {
    write(dir, "tests/helpers.mjs", "export function makeTempProject() {}\nexport function cleanup() {}\n");
    write(
      dir,
      "tests/feature/thing.test.mjs",
      "function makeTempProject() {}\nfunction unrelated() {}\n",
    );
    const result = findDuplicateHelpers(dir, "tests/feature/thing.test.mjs");
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].name, "makeTempProject");
    assert.equal(result.findings[0].helper.path, "tests/helpers.mjs");
    assert.equal(result.findings[0].helper.symbol, "makeTempProject");
    assert.equal(result.findings[0].line, 1);
  } finally {
    cleanupTempDir(dir);
  }
});

test("name matching is normalized (case and separators ignored)", () => {
  const dir = createTempDir();
  try {
    write(dir, "tests/helpers.mjs", "export function makeTempProject() {}\n");
    write(dir, "tests/feature/thing.test.mjs", "function make_temp_project() {}\n");
    const result = findDuplicateHelpers(dir, "tests/feature/thing.test.mjs");
    assert.equal(result.findings.length, 1);
  } finally {
    cleanupTempDir(dir);
  }
});

test("checking an inventoried helper against itself reports nothing", () => {
  const dir = createTempDir();
  try {
    write(dir, "tests/helpers.mjs", "export function makeTempProject() {}\n");
    const result = findDuplicateHelpers(dir, "tests/helpers.mjs");
    assert.deepEqual(result.findings, []);
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Behavior 13: degraded modes
// ---------------------------------------------------------------------------

test("works without .context-index and without a manifest", () => {
  const dir = createTempDir();
  try {
    write(dir, "tests/helpers.mjs", "export function a() {}\n");
    const inventory = buildInventory(dir, { manifest: null });
    assert.equal(inventory.entries.length, 1);
    assert.deepEqual(inventory.samples, []);
    assert.deepEqual(inventory.warnings, []);
  } finally {
    cleanupTempDir(dir);
  }
});
