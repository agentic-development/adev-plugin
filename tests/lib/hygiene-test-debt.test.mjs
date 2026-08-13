// Behavioral coverage for lib/hygiene/test-debt.mjs (Audit Pass 23).
//
// Spec: .context-index/specs/features/maintenance/hygiene-test-debt.spec.md

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";
import {
  runTestDebtPass,
  resolveTestDebtConfig,
  classifyAnchors,
  extractReferences,
  assertionRatio,
  maskTemplateLiterals,
  globToRegExp,
  discoverTestFiles,
  DEFAULT_TEST_DEBT_CONFIG,
  DETECTOR_CODES,
} from "../../lib/hygiene/test-debt.mjs";

/** Minimal manifest with the source roots the pass needs. */
const MANIFEST = { hygiene: { source_roots: ["lib/", "skills/"], coverage_exclude: ["tests/**"] } };

function project(files, manifest = MANIFEST) {
  const dir = createTempDir();
  for (const [rel, body] of Object.entries(files)) writeFixture(dir, rel, body);
  return { dir, manifest };
}

describe("config resolution", () => {
  test("absent config yields the documented defaults", () => {
    const cfg = resolveTestDebtConfig({});
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.append_chain_threshold, DEFAULT_TEST_DEBT_CONFIG.append_chain_threshold);
    assert.equal(cfg.append_chain_threshold, 4);
    assert.equal(cfg.prose_ratio_threshold, 0.5);
    assert.deepEqual(cfg.rev_numbered_prefixes, ["rev"]);
  });

  test("a null manifest is tolerated", () => {
    assert.equal(resolveTestDebtConfig(null).enabled, true);
  });

  test("append_chain_threshold below 2 is rejected", () => {
    assert.throws(
      () => resolveTestDebtConfig({ hygiene: { test_debt: { append_chain_threshold: 1 } } }),
      (e) => e.code === "INVALID_TEST_DEBT_CONFIG",
    );
  });

  test("prose_ratio_threshold outside (0, 1] is rejected", () => {
    for (const bad of [0, 1.5, -0.2, "half"]) {
      assert.throws(
        () => resolveTestDebtConfig({ hygiene: { test_debt: { prose_ratio_threshold: bad } } }),
        (e) => e.code === "INVALID_TEST_DEBT_CONFIG",
        `expected rejection for ${JSON.stringify(bad)}`,
      );
    }
  });

  test("non-alphabetic rev_numbered_prefixes are rejected", () => {
    assert.throws(
      () => resolveTestDebtConfig({ hygiene: { test_debt: { rev_numbered_prefixes: ["rev1"] } } }),
      (e) => e.code === "INVALID_TEST_DEBT_CONFIG",
    );
  });
});

describe("discovery", () => {
  test("globToRegExp handles **, * and ?", () => {
    assert.ok(globToRegExp("**/*.test.mjs").test("a/b/c.test.mjs"));
    assert.ok(globToRegExp("**/*.test.mjs").test("c.test.mjs"));
    assert.ok(!globToRegExp("**/*.test.mjs").test("c.spec.mjs"));
    assert.ok(globToRegExp("tests/**").test("tests/a/b.mjs"));
  });

  test("coverage_exclude is NOT applied — the whole premise of the pass", () => {
    const { dir, manifest } = project({
      "tests/a.test.mjs": "assert.ok(1);",
      "tests/b.test.mjs": "assert.ok(1);",
    });
    try {
      const result = runTestDebtPass(dir, { manifest });
      assert.equal(result.scannedFileCount, 2, "coverage_exclude must not filter the test-debt scan");
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("hygiene.test_debt.exclude does filter", () => {
    const { dir } = project({ "tests/a.test.mjs": "x", "tests/skip/b.test.mjs": "x" });
    try {
      const result = runTestDebtPass(dir, {
        manifest: { hygiene: { source_roots: ["lib/"], test_debt: { exclude: ["tests/skip/**"] } } },
      });
      assert.equal(result.scannedFileCount, 1);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("symlinked directories are not descended", () => {
    const dir = createTempDir();
    try {
      mkdirSync(join(dir, "real"), { recursive: true });
      writeFileSync(join(dir, "real", "a.test.mjs"), "assert.ok(1);");
      mkdirSync(join(dir, "tests"), { recursive: true });
      symlinkSync(join(dir, "real"), join(dir, "tests", "linked"), "dir");

      const found = discoverTestFiles(dir, dir, resolveTestDebtConfig({}), []);
      assert.ok(found.includes("real/a.test.mjs"));
      assert.ok(
        !found.some((f) => f.startsWith("tests/linked/")),
        "walk must not descend a symlinked directory",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("a project with no test files yields SKIP, not a failure", () => {
    const { dir, manifest } = project({ "lib/a.mjs": "export const a = 1;" });
    try {
      const result = runTestDebtPass(dir, { manifest });
      assert.equal(result.verdict, "SKIP");
      assert.equal(result.scannedFileCount, 0);
      assert.deepEqual(result.findings, []);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("enabled: false yields SKIP with a reason", () => {
    const { dir } = project({ "tests/a.test.mjs": "x" });
    try {
      const result = runTestDebtPass(dir, {
        manifest: { hygiene: { source_roots: ["lib/"], test_debt: { enabled: false } } },
      });
      assert.equal(result.verdict, "SKIP");
      assert.match(result.summary.reason, /disabled by manifest/);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe("anchor classification", () => {
  test("__dirname-rooted constants resolve to a concrete directory", () => {
    const src = `const FIXTURE_DIR = join(__dirname, "fixtures", "x");`;
    const anchors = classifyAnchors(src, "tests/evals/a.test.mjs");
    assert.deepEqual(anchors.get("FIXTURE_DIR"), { class: "repo", dir: "tests/evals/fixtures/x" });
  });

  test("chains resolve transitively", () => {
    const src = [
      `const DOMAINS_DIR = join(import.meta.dirname, "..", "..", "templates", "domains");`,
      `const SW_DIR = join(DOMAINS_DIR, "software");`,
    ].join("\n");
    const anchors = classifyAnchors(src, "tests/domains/a.test.mjs");
    assert.deepEqual(anchors.get("SW_DIR"), { class: "repo", dir: "templates/domains/software" });
  });

  test("temp-dir constants are classified temp and carry no directory", () => {
    const anchors = classifyAnchors(`const dir = createTempDir();`, "tests/a.test.mjs");
    assert.equal(anchors.get("dir").class, "temp");
    assert.equal(anchors.get("dir").dir, null);
  });
});

describe("reference extraction", () => {
  test("ESM imports are Class A references", () => {
    const { classA } = extractReferences(`import { x } from "../../lib/foo.mjs";`, "tests/a/b.test.mjs");
    assert.ok(classA.some((r) => r.path === "../../lib/foo.mjs"));
  });

  test("readFileSync(new URL(...)) is a Class B repo-anchored reference", () => {
    const src = `const s = readFileSync(new URL("../../skills/hygiene/SKILL.md", import.meta.url), "utf8");`;
    const { classB } = extractReferences(src, "tests/skills/a.test.mjs");
    const hit = classB.find((r) => r.path.endsWith("SKILL.md"));
    assert.ok(hit, "the repo's dominant skill-coverage idiom must be visible");
    assert.equal(hit.anchor, "repo");
  });

  test("imports inside a template literal are fixture data, not references", () => {
    // A test that BUILDS a source file as a string must not be read as
    // importing the module that string names — otherwise every test about
    // import syntax reports a dead reference to a module that never existed.
    const src = ["const fixture = `", `import { x } from "../lib/never-existed.mjs";`, "`;"].join("\n");
    const { classA } = extractReferences(src, "tests/a.test.mjs");
    assert.equal(
      classA.filter((r) => r.path.includes("never-existed")).length,
      0,
      "template-literal contents are data and must not be extracted as imports",
    );
  });

  test("masking a template literal preserves line structure", () => {
    const src = ["const a = `", "line two", "`;"].join("\n");
    assert.equal(maskTemplateLiterals(src).split("\n").length, src.split("\n").length);
  });

  test("a stray backtick in a comment does not blind the rest of the file", () => {
    // Regression: a naive backtick toggle desyncs on any prose backtick and
    // silently drops every subsequent import — a false NEGATIVE, which is the
    // worst kind because the pass looks clean while seeing nothing.
    const src = [
      "// prose mentioning a ` backtick",
      `import { real } from "../lib/really-missing.mjs";`,
    ].join("\n");
    const { classA } = extractReferences(src, "tests/a.test.mjs");
    assert.ok(
      classA.some((r) => r.path === "../lib/really-missing.mjs"),
      "an import after a comment backtick must still be extracted",
    );
  });

  test("a stray backtick inside a quoted string does not blind the rest of the file", () => {
    const src = [`const s = "a \` tick";`, `import { real } from "../lib/also-missing.mjs";`].join("\n");
    const { classA } = extractReferences(src, "tests/a.test.mjs");
    assert.ok(classA.some((r) => r.path === "../lib/also-missing.mjs"));
  });

  test("escaped backticks inside a template literal do not end it early", () => {
    const src = ["const fixture = `", "  a \\` escaped tick", `  import { x } from "../lib/inside.mjs";`, "`;"].join(
      "\n",
    );
    const { classA } = extractReferences(src, "tests/a.test.mjs");
    assert.equal(
      classA.filter((r) => r.path.includes("inside")).length,
      0,
      "content after an escaped backtick is still fixture data",
    );
  });

  test("a loop variable between anchor and literal downgrades to unresolvable", () => {
    const src = [
      `const SKILLS_DIR = join(__dirname, "..", "skills");`,
      `const body = readFileSync(join(SKILLS_DIR, slug, "SKILL.md"), "utf8");`,
    ].join("\n");
    const { classB } = extractReferences(src, "tests/a.test.mjs");
    const hit = classB.find((r) => r.path.includes("SKILL.md"));
    assert.equal(hit.anchor, "unknown", "an underdetermined path must never assert absence");
  });
});

describe("assertion-line taxonomy", () => {
  test("ratio counts only enumerated assertion lines", () => {
    const src = [
      `assert.match(skill, /foo/);`,
      `assert.ok(content.includes("bar"));`,
      `assert.equal(n, 3);`,
      `const notAnAssertion = "includes(";`,
    ].join("\n");
    const { numerator, denominator, ratio } = assertionRatio(src);
    assert.equal(denominator, 3);
    assert.equal(numerator, 2);
    assert.ok(Math.abs(ratio - 2 / 3) < 1e-9);
  });

  test("zero assertions yields ratio 0 and never a finding", () => {
    assert.deepEqual(assertionRatio("const a = 1;"), { denominator: 0, numerator: 0, ratio: 0 });
  });
});

describe("detectors", () => {
  test("APPEND_CHAIN fires at the threshold and names the module", () => {
    const files = { "lib/target.mjs": "export const t = 1;" };
    for (let i = 0; i < 4; i += 1) {
      files[`tests/t${i}.test.mjs`] = `import { t } from "../lib/target.mjs";\nassert.ok(t);`;
    }
    const { dir, manifest } = project(files);
    try {
      const result = runTestDebtPass(dir, { manifest });
      const chain = result.findings.find((f) => f.code === "APPEND_CHAIN");
      assert.ok(chain, "4 test files on one module should trip the default threshold");
      assert.equal(chain.path, "lib/target.mjs");
      assert.equal(chain.count, 4);
      assert.equal(chain.severity, "warn");
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("APPEND_CHAIN stays silent below the threshold", () => {
    const files = { "lib/target.mjs": "export const t = 1;" };
    for (let i = 0; i < 3; i += 1) {
      files[`tests/t${i}.test.mjs`] = `import { t } from "../lib/target.mjs";`;
    }
    const { dir, manifest } = project(files);
    try {
      const result = runTestDebtPass(dir, { manifest });
      assert.equal(result.findings.filter((f) => f.code === "APPEND_CHAIN").length, 0);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("REV_NUMBERED matches configured prefixes only", () => {
    const { dir, manifest } = project({
      "tests/validate_rev6_e2e.test.mjs": "assert.ok(1);",
      "tests/payload-v1.test.mjs": "assert.ok(1);",
    });
    try {
      const result = runTestDebtPass(dir, { manifest });
      const hits = result.findings.filter((f) => f.code === "REV_NUMBERED");
      assert.equal(hits.length, 1, "v1 must not fire under the default rev-only prefix set");
      assert.match(hits[0].path, /rev6/);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("REV_NUMBERED honours an opt-in v prefix", () => {
    const { dir } = project({ "tests/payload-v1.test.mjs": "assert.ok(1);" });
    try {
      const result = runTestDebtPass(dir, {
        manifest: { hygiene: { source_roots: ["lib/"], test_debt: { rev_numbered_prefixes: ["rev", "v"] } } },
      });
      assert.equal(result.findings.filter((f) => f.code === "REV_NUMBERED").length, 1);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("PLAN_TASK_STRUCTURED needs the literal on a test-declaration line", () => {
    const { dir, manifest } = project({
      "tests/a.test.mjs": `describe("renders the board (plan-task 2)", () => {});`,
      "tests/b.test.mjs": `// Task 7 was implemented here\nassert.ok(1);`,
    });
    try {
      const result = runTestDebtPass(dir, { manifest });
      const hits = result.findings.filter((f) => f.code === "PLAN_TASK_STRUCTURED");
      assert.equal(hits.length, 1, "a bare comment mentioning a task is not a plan-task-structured test");
      assert.equal(hits[0].path, "tests/a.test.mjs");
      assert.equal(hits[0].count, 1);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("DEAD_TEST_REFERENCE fires on a resolvable missing source path", () => {
    const { dir, manifest } = project({
      "tests/a.test.mjs": `import { gone } from "../lib/deleted.mjs";\nassert.ok(gone);`,
    });
    try {
      const result = runTestDebtPass(dir, { manifest });
      const hits = result.findings.filter((f) => f.code === "DEAD_TEST_REFERENCE");
      assert.equal(hits.length, 1);
      assert.equal(hits[0].target, "lib/deleted.mjs");
      assert.equal(hits[0].severity, "error");
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("DEAD_TEST_REFERENCE does NOT fire on a temp-anchored fixture path", () => {
    const { dir, manifest } = project({
      "tests/a.test.mjs": [
        `const tmp = createTempDir();`,
        `const body = readFileSync(join(tmp, "lib/generated.mjs"), "utf8");`,
        `assert.ok(body);`,
      ].join("\n"),
    });
    try {
      const result = runTestDebtPass(dir, { manifest });
      assert.equal(
        result.findings.filter((f) => f.code === "DEAD_TEST_REFERENCE").length,
        0,
        "a runtime temp fixture must never be reported as a dead reference",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("DEAD_TEST_REFERENCE resolves the anchor directory, not the bare literal", () => {
    const { dir, manifest } = project({
      "tests/fixtures/lib/orphan.mjs": "export const o = 1;",
      "tests/a.test.mjs": [
        `const FIXTURE_DIR = join(__dirname, "fixtures");`,
        `const body = readFileSync(join(FIXTURE_DIR, "lib/orphan.mjs"), "utf8");`,
        `assert.ok(body);`,
      ].join("\n"),
    });
    try {
      const result = runTestDebtPass(dir, { manifest });
      assert.equal(
        result.findings.filter((f) => f.code === "DEAD_TEST_REFERENCE").length,
        0,
        "join(FIXTURE_DIR, 'lib/orphan.mjs') denotes the fixture tree, not lib/",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("PROSE_ASSERTION needs both a .md reference and the ratio", () => {
    const { dir, manifest } = project({
      "skills/x/SKILL.md": "# x",
      "tests/prose.test.mjs": [
        `const skill = readFileSync(new URL("../skills/x/SKILL.md", import.meta.url), "utf8");`,
        `assert.match(skill, /foo/);`,
        `assert.ok(skill.includes("bar"));`,
      ].join("\n"),
      "tests/behavior.test.mjs": [`import { f } from "../lib/f.mjs";`, `assert.equal(f(1), 2);`].join("\n"),
    });
    try {
      const result = runTestDebtPass(dir, { manifest });
      const hits = result.findings.filter((f) => f.code === "PROSE_ASSERTION");
      assert.equal(hits.length, 1);
      assert.equal(hits[0].path, "tests/prose.test.mjs");
      assert.equal(hits[0].severity, "info");
      assert.equal(hits[0].denominator, 2);
      assert.equal(hits[0].numerator, 2);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("--detector restricts the run to one code", () => {
    const { dir, manifest } = project({
      "tests/validate_rev2.test.mjs": `describe("thing (Task 3)", () => {});`,
    });
    try {
      const result = runTestDebtPass(dir, { manifest, detector: "REV_NUMBERED" });
      assert.deepEqual(Object.keys(result.summary), ["REV_NUMBERED"]);
      assert.ok(result.findings.every((f) => f.code === "REV_NUMBERED"));
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe("pass contract", () => {
  test("absent source_roots degrades with a header note, other detectors still run", () => {
    const { dir } = project({ "tests/a_rev3.test.mjs": "assert.ok(1);" }, {});
    try {
      const result = runTestDebtPass(dir, { manifest: {} });
      assert.ok(result.headerNotes.some((n) => /source_roots/.test(n)));
      assert.equal(result.findings.filter((f) => f.code === "REV_NUMBERED").length, 1);
      assert.equal(result.findings.filter((f) => f.code === "DEAD_TEST_REFERENCE").length, 0);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("a null manifest raises the degrade note — not only an undefined one", () => {
    // The CLI driver hands the pass `null`, never `undefined`, so keying the
    // note on `undefined` alone made it unreachable on every real CLI run.
    const { dir } = project({ "tests/a.test.mjs": "assert.ok(1);" });
    try {
      const result = runTestDebtPass(dir, { manifest: null });
      assert.ok(
        result.headerNotes.some((n) => /manifest\.yaml missing or unparseable/.test(n)),
        "a null manifest must surface the documented degrade note",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("the pass never mutates process.exitCode and returns the documented shape", () => {
    const before = process.exitCode;
    const { dir, manifest } = project({ "tests/a.test.mjs": "assert.ok(1);" });
    try {
      const result = runTestDebtPass(dir, { manifest });
      assert.equal(process.exitCode, before);
      for (const key of ["verdict", "findings", "summary", "headerNotes", "scannedFileCount"]) {
        assert.ok(key in result, `result must expose ${key}`);
      }
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("detector codes are a closed enumeration of five", () => {
    assert.equal(DETECTOR_CODES.length, 5);
    assert.deepEqual(
      [...DETECTOR_CODES].sort(),
      ["APPEND_CHAIN", "DEAD_TEST_REFERENCE", "PLAN_TASK_STRUCTURED", "PROSE_ASSERTION", "REV_NUMBERED"],
    );
  });
});
