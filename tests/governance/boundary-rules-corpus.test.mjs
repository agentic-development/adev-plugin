// tests/governance/boundary-rules-corpus.test.mjs
//
// The corpus that keeps `.context-index/governance/boundaries.yaml` honest.
//
// Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
// Plan-task: 14
//
// This project's constitution states its anti-patterns in prose. Four of them
// are mechanically decidable, and Task 14 moves those four into the boundary
// registry so `adev boundaries check` enforces what CLAUDE.md asserts. A rule
// in that registry has exactly two ways to be useless, and both are SILENT:
//
//   1. It never fires. `lib/profiles/yaml.mjs::unquote()` processes NO escape
//      sequences for either quote style, so a double-quoted `"console\\.log"`
//      yields a pattern containing a LITERAL double backslash, which compiles
//      fine and matches nothing. Every rule below is therefore proved against a
//      fixture that it MUST match, through the repo's own parser.
//   2. It fires on sanctioned code, and somebody edits the code — or deletes
//      the rule — to shut it up. The tree-wide assertion at the bottom is what
//      forces a mis-scoped rule to be fixed at the rule.
//
// ## Why the fixtures are copied into a temp project
//
// `checkBoundaries` matches regexes against file CONTENT. There is no `include`
// field — scope is expressed only through `exclude` globs — so a fixture that
// deliberately contains `require(` would trip `no-commonjs` during the tree-wide
// run no matter what extension it carries. Extensions cannot save it; only an
// exclude can. So every rule excludes `tests/fixtures/governance/**` (stated
// explicitly as the first entry of each rule's `exclude`), and the per-rule
// assertions copy the fixtures into a temp project under `probe/`, a path no
// rule excludes. The "no enabled rule excludes the probe directory" test below
// asserts that second half rather than trusting it: a fixture silently excluded
// from its own corpus test would make every assertion here vacuously green.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkBoundaries } from "../../lib/governance/boundaries.mjs";
import { globToRegExp } from "../../lib/hygiene/test-debt.mjs";
import { parseYaml } from "../../lib/profiles/yaml.mjs";
import { cleanupTempDir, createTempDir, writeFixture } from "../helpers.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTRY_REL = ".context-index/governance/boundaries.yaml";
const REGISTRY_ABS = join(REPO_ROOT, REGISTRY_REL);
const FIXTURE_DIR = join(REPO_ROOT, "tests", "fixtures", "governance");

/** The rule ids this task ships, in declaration order. */
const EXPECTED_IDS = [
  "no-commonjs",
  "no-inline-node-in-skills",
  "no-hardcoded-claude-home",
  "no-manual-version-bump",
];

const RAW = readFileSync(REGISTRY_ABS, "utf8");
const DECLARED = declaredRules(RAW);
const ENABLED = DECLARED.filter((rule) => rule.enabled !== false);

function declaredRules(raw) {
  const doc = parseYaml(raw);
  return Array.isArray(doc?.boundaries) ? doc.boundaries : [];
}

/**
 * The TERRITORY each rule is scoped to, and the probe path inside it.
 *
 * This file used to probe every rule at a neutral `probe/<id>.<kind>`. That was
 * a hole, because `checkBoundaries` has no `include` field: a rule expresses its
 * scope purely through `exclude`, and a neutral path is inside no rule's scope
 * in particular. `globToRegExp('skills/**').test('probe/no-inline-node-in-skills.violating')`
 * is `false`, so adding `skills/**` to that rule's excludes — which kills the
 * rule outright, since its exclude set is what emulates an include of
 * `skills/**` — left the whole corpus green.
 *
 * Each rule is now probed at a path in the territory it actually polices, so
 * "no enabled rule excludes the probe directory" below becomes the real guard:
 * excluding a rule's own territory now fails that test by construction.
 *
 * `territory` is asserted against the probe paths so this map cannot drift into
 * naming a path the rule does not police.
 */
const PROBE_TERRITORY = new Map([
  ["no-commonjs", { territory: "lib/**", dir: "lib/probe", ext: ".mjs" }],
  ["no-inline-node-in-skills", { territory: "skills/**", dir: "skills/probe", ext: "/SKILL.md" }],
  ["no-hardcoded-claude-home", { territory: "lib/**", dir: "lib/probe", ext: ".mjs" }],
]);

/** Where a fixture is copied to inside the probe project — inside its rule's territory. */
function probePath(id, kind) {
  const scope = PROBE_TERRITORY.get(id);
  assert.ok(scope, "no probe territory declared for rule " + id);
  return scope.dir + "/" + id + "." + kind + scope.ext;
}

function fixtureText(id, kind) {
  const path = join(FIXTURE_DIR, id + "." + kind);
  assert.ok(existsSync(path), "missing corpus fixture: tests/fixtures/governance/" + id + "." + kind);
  return readFileSync(path, "utf8");
}

/**
 * A temp project holding the SHIPPED registry verbatim plus every fixture, so
 * the rules under test are the real ones and the paths under test are not
 * excluded. Built per assertion that needs it; torn down by the caller.
 */
function buildProbeProject() {
  const root = createTempDir();
  writeFixture(root, REGISTRY_REL, RAW);
  for (const rule of ENABLED) {
    for (const kind of ["violating", "clean"]) {
      writeFixture(root, probePath(rule.id, kind), fixtureText(rule.id, kind));
    }
  }
  return root;
}

/**
 * The probe project, built ONCE for this file.
 *
 * It used to be rebuilt per assertion — a fresh temp dir, a registry write and
 * six fixture writes for each of ~8 tests. The project is READ-ONLY to every
 * assertion (`checkBoundaries` never writes), so one build serves them all;
 * rebuilding it was a measurable slice of the suite's wall time for no isolation
 * anyone was relying on.
 */
let _probeRoot = null;
function probeProject() {
  if (_probeRoot === null) {
    _probeRoot = buildProbeProject();
    process.on("exit", () => cleanupTempDir(_probeRoot));
  }
  return _probeRoot;
}

// ── the registry itself ─────────────────────────────────────────────────────

test("the registry declares the constitution's mechanical anti-patterns", () => {
  // Non-vacuity guard. Every per-rule assertion below is generated FROM this
  // list, so a registry that degraded to zero rules would make the whole file
  // pass by iterating nothing. This is the assertion an empty registry cannot
  // satisfy.
  assert.ok(
    DECLARED.length >= 4,
    "boundaries.yaml declares " + DECLARED.length + " rule(s); the constitution's " +
      "mechanically-decidable anti-patterns are " + EXPECTED_IDS.length,
  );
  assert.deepEqual(DECLARED.map((rule) => rule.id), EXPECTED_IDS);
  assert.ok(ENABLED.length >= 3, "at least three of the declared rules must be enabled");
});

test("every pattern is SINGLE-quoted with single backslashes", () => {
  // `unquote()` strips the outer quotes and does nothing else — no escape
  // processing, for either quote style. A double-quoted pattern therefore keeps
  // its backslashes LITERALLY: `"console\\.log"` parses to `console\\.log`,
  // which compiles to /console\\.log/ and matches a backslash followed by
  // "log" — i.e. nothing. Single quotes with single backslashes is the only
  // form that survives this parser, so it is pinned against the RAW file text.
  const lines = RAW.split(/\r?\n/);
  const patternLines = lines.filter((line) => /^\s*pattern:\s*\S/.test(line));
  assert.ok(
    patternLines.length >= EXPECTED_IDS.length,
    "expected at least " + EXPECTED_IDS.length + " live pattern lines, found " + patternLines.length,
  );
  for (const line of patternLines) {
    const value = line.replace(/^\s*pattern:\s*/, "").trimEnd();
    assert.ok(
      value.startsWith("'") && value.endsWith("'") && value.length >= 2,
      "pattern must be single-quoted (this parser processes no escapes): " + line.trim(),
    );
    assert.ok(
      !value.includes("\\\\"),
      "pattern contains a double backslash, which this parser preserves LITERALLY " +
        "and which therefore cannot match: " + line.trim(),
    );
  }
  // The commented-out worked example in the file is documentation; it must not
  // teach the broken double-quoted form to the next author.
  const commentedPatternLines = lines.filter((line) => /^\s*#.*\bpattern:/.test(line));
  for (const line of commentedPatternLines) {
    const value = line.replace(/^\s*#\s*/, "").replace(/^pattern:\s*/, "").trimEnd();
    assert.ok(
      value.startsWith("'"),
      "the commented example must show the single-quoted form: " + line.trim(),
    );
  }
});

test("every rule ships at severity: warning (DDR-11)", () => {
  // Promotion to `error` is a deliberate follow-up after one clean cycle. Until
  // then a boundary finding must never block a merge on rules nobody has lived
  // with yet.
  for (const rule of DECLARED) {
    assert.equal(rule.severity, "warning", "rule " + rule.id + " must ship at severity: warning");
  }
});

test("every declared pattern compiles through the repo's own parser", () => {
  // Including the disabled one: `loadRules` skips validation for a disabled
  // rule, so nothing else in the system would notice a pattern that cannot
  // compile until the day somebody enables it.
  for (const rule of DECLARED) {
    assert.equal(typeof rule.pattern, "string", "rule " + rule.id + " has no string pattern");
    assert.doesNotThrow(
      () => new RegExp(rule.pattern, rule.flags ?? ""),
      "rule " + rule.id + " has a pattern that does not compile",
    );
  }
});

test("every rule is probed INSIDE the territory it polices", () => {
  // The assertion that closes the neutral-path hole. A probe that sits outside
  // the rule's scope cannot detect a scope-killing exclude, because the exclude
  // never covers the probe. Pinning the probe to the territory glob is what
  // makes the exclude-swallow test below a real guard rather than a tautology.
  for (const rule of ENABLED) {
    const scope = PROBE_TERRITORY.get(rule.id);
    assert.ok(scope, "rule " + rule.id + " declares no probe territory");
    for (const kind of ["violating", "clean"]) {
      assert.equal(
        globToRegExp(scope.territory).test(probePath(rule.id, kind)),
        true,
        "rule " + rule.id + " is probed at " + probePath(rule.id, kind) +
          ", which its territory " + scope.territory + " does not cover",
      );
    }
  }
});

test("no enabled rule excludes the probe directory", () => {
  // Guards the fixture strategy itself. If a rule's exclude set grew to cover
  // `probe/**`, every per-rule assertion below would silently pass on a rule
  // that was never evaluated.
  for (const rule of ENABLED) {
    for (const glob of rule.exclude ?? []) {
      for (const kind of ["violating", "clean"]) {
        assert.equal(
          globToRegExp(glob).test(probePath(rule.id, kind)),
          false,
          "rule " + rule.id + " exclude glob " + glob + " swallows its own corpus fixture",
        );
      }
    }
  }
});

test("every rule excludes the committed corpus fixtures", () => {
  // The other half of the strategy: on disk the fixtures live under
  // `tests/fixtures/governance/`, and the tree-wide run must not see them.
  for (const rule of ENABLED) {
    const globs = rule.exclude ?? [];
    assert.ok(
      globs.some((glob) => globToRegExp(glob).test("tests/fixtures/governance/anything.violating")),
      "rule " + rule.id + " does not exclude tests/fixtures/governance/**, so its own " +
        "fixtures would fire during the tree-wide run",
    );
  }
});

// ── per-rule corpus ─────────────────────────────────────────────────────────

for (const rule of ENABLED) {
  test(rule.id + ": the compiled RegExp matches its violating fixture", () => {
    // The round-trip proof, independent of the evaluator: registry text →
    // parseYaml → RegExp → fixture. This is what a silently-dead pattern fails.
    const re = new RegExp(rule.pattern, rule.flags ?? "");
    assert.match(fixtureText(rule.id, "violating"), re);
    assert.doesNotMatch(fixtureText(rule.id, "clean"), re);
  });

  test(rule.id + " fires on its violating fixture", async () => {
    const result = await checkBoundaries(probeProject(), {
      changed: [probePath(rule.id, "violating")],
    });
    assert.ok(
      result.findings.some((f) => f.ruleId === rule.id),
      rule.id + " did not fire on its own violating fixture: " +
        JSON.stringify(result.findings, null, 2),
    );
  });

  test(rule.id + " is silent on its clean fixture", async () => {
    const result = await checkBoundaries(probeProject(), {
      changed: [probePath(rule.id, "clean")],
    });
    assert.deepEqual(result.findings, []);
    assert.equal(result.verdict, "PASS");
  });
}

test("each violating fixture is matched by ITS OWN rule and by no other", async () => {
  // Cross-contamination check. A rule whose pattern is broad enough to fire on
  // a neighbour's fixture reports the wrong anti-pattern to the operator, and
  // keeps reporting it after the neighbour's rule is fixed.
  const changed = ENABLED.map((rule) => probePath(rule.id, "violating"));
  const result = await checkBoundaries(probeProject(), { changed });
  for (const rule of ENABLED) {
    const fired = result.findings
      .filter((f) => f.file === probePath(rule.id, "violating"))
      .map((f) => f.ruleId);
    assert.deepEqual(
      fired,
      [rule.id],
      probePath(rule.id, "violating") + " should be matched by exactly one rule",
    );
  }
});

test("the disabled rule stays visible with a stated reason (Invariant 5)", async () => {
  // `no-manual-version-bump` is declared and switched off, not omitted: the
  // evaluator is content-based and a version FIELD is not a version BUMP, so
  // enabling it would fire on package.json forever. Declared-and-disabled keeps
  // the decision on the record instead of leaving the anti-pattern unrepresented.
  const result = await checkBoundaries(probeProject(), {
    changed: [probePath("no-commonjs", "clean")],
  });
  const off = result.disabled.find((d) => d.id === "no-manual-version-bump");
  assert.ok(
    off,
    "expected no-manual-version-bump on the disabled list: " + JSON.stringify(result.disabled),
  );
  assert.equal(off.enabled, false);
  assert.equal(typeof off.disabled_reason, "string");
  assert.ok(off.disabled_reason.trim() !== "", "a disabled rule must say why");
  assert.deepEqual(
    result.warnings.filter((w) => w.code === "DISABLED_WITHOUT_REASON"),
    [],
  );
});

// ── the tree ────────────────────────────────────────────────────────────────

test("no rule fires on the current tree", async () => {
  // The rule that keeps the rules honest. A finding here means the rule is
  // mis-specified — its exclude set does not describe the sanctioned code it
  // meets — and the fix belongs in boundaries.yaml, NEVER in the source file it
  // flagged.
  const files = trackedFiles(REPO_ROOT);
  assert.ok(files.length > 100, "expected a populated tracked-file list, got " + files.length);
  const result = await checkBoundaries(REPO_ROOT, { changed: files });
  assert.deepEqual(
    result.findings,
    [],
    "boundaries.yaml flags sanctioned code in this repository; fix the RULE, not the tree",
  );
  assert.equal(result.verdict, "PASS");
});

function trackedFiles(root) {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter((p) => p !== "");
}
