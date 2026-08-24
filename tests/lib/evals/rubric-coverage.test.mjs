/**
 * Rubric-set coverage check for the change-imminent tier's `tiers.yaml`.
 *
 * Spec: `.context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md`,
 * section "Conformance Rules".
 *
 * This file hosts `checkRubricSet()` — the eleven `RUBRIC_*` coverage rules
 * decided by `tiers.yaml` and the filesystem alone — plus a per-rule `checked`
 * set so a rule that quietly stopped running is caught, the same pattern
 * `tests/lib/evals/skill-regression-catalog.test.mjs` uses for its thirteen
 * `CATALOG_*` rules (see that file's `validateCatalog`). `checkRubricSet`
 * itself is NOT a lib module: per the spec's registry-placement note, only
 * the eleven error-code strings belong in `lib/evals/rubric-coverage-codes.mjs`
 * — the check function and its branches stay here.
 *
 * Task 1 implements four of the eleven rules only: `RUBRIC_TIER_INCOMPLETE`,
 * `RUBRIC_TIER_ORPHAN`, `RUBRIC_LANDED_INVALID` (two branches), and
 * `RUBRIC_TIER_UNCOVERED` (proven on synthetic roots only — the real
 * `tests/evals/skill-regression/rubrics/` tree is legitimately empty at this
 * task's landing state, and applying the rule there is a later task's job).
 * The remaining seven codes are declared in the registry but have no branch
 * here yet; Tasks 2 and 3 add them to this same file.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { RUBRIC_COVERAGE_ERROR_CODES } from "../../../lib/evals/rubric-coverage-codes.mjs";
import { parseYaml } from "../../../lib/profiles/yaml.mjs";
import { captureThrow, cleanupTempDir, createTempDir } from "../../helpers.mjs";
import { splitSlugs } from "./catalog-validator.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");

const DEFAULT_TIERS_PATH = join(REPO_ROOT, "tests", "evals", "skill-regression", "tiers.yaml");
const DEFAULT_RUBRIC_ROOT = join(REPO_ROOT, "tests", "evals", "skill-regression", "rubrics");
const DEFAULT_SCENARIO_ROOT = join(REPO_ROOT, "tests", "evals", "skill-regression", "scenarios");
const DEFAULT_SKILLS_ROOT = join(REPO_ROOT, "skills");

/** The four codes with an implemented branch as of Task 1. */
const IMPLEMENTED_CODES = Object.freeze([
  "RUBRIC_TIER_INCOMPLETE",
  "RUBRIC_TIER_ORPHAN",
  "RUBRIC_LANDED_INVALID",
  "RUBRIC_TIER_UNCOVERED",
]);

/**
 * Every top-level key of a parsed `tiers.yaml` except `landed` — a bucket key.
 * Generic over whatever keys the document declares, so a synthetic fixture
 * can use arbitrary bucket names (e.g. `b1`) without pretending to be the
 * real four-bucket file.
 */
function bucketKeysOf(tiersDoc) {
  return Object.keys(tiersDoc).filter((k) => k !== "landed");
}

/**
 * The eleven `RUBRIC_*` coverage rules, decided by `tiersPath` and the
 * filesystem alone. Only four have branches at Task 1; the rest are no-ops
 * reserved for Tasks 2 and 3.
 *
 * @param {object} [options]
 * @param {string} [options.tiersPath]
 * @param {string} [options.rubricRoot]
 * @param {string} [options.scenarioRoot]
 * @param {string} [options.skillsRoot]
 * @returns {{errors: Array<{code: string, detail: string}>, checked: Set<string>}}
 */
export function checkRubricSet({
  tiersPath = DEFAULT_TIERS_PATH,
  rubricRoot = DEFAULT_RUBRIC_ROOT,
  scenarioRoot = DEFAULT_SCENARIO_ROOT,
  skillsRoot = DEFAULT_SKILLS_ROOT,
} = {}) {
  // scenarioRoot is accepted now (the contract fixes the four-argument
  // shape) but unused until Tasks 2/3 add RUBRIC_SCENARIO_MISSING and
  // RUBRIC_SCENARIO_STEP_MISSING, whose rules read it.
  void scenarioRoot;

  const errors = [];
  const checked = new Set();
  const fail = (code, detail) => {
    errors.push({ code, detail });
  };

  const tiersDoc = parseYaml(readFileSync(tiersPath, "utf8"));
  const bucketKeys = bucketKeysOf(tiersDoc);

  // --- RUBRIC_TIER_INCOMPLETE ----------------------------------------------
  // The declared buckets must partition `skillsRoot`'s directories exactly:
  // every directory in exactly one bucket, no bucket token naming a
  // directory that does not exist.
  checked.add("RUBRIC_TIER_INCOMPLETE");
  const dirNames = new Set(
    readdirSync(skillsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name),
  );
  if (dirNames.size === 0) {
    // Short-circuit: a directory set with nothing in it has nothing to
    // partition, and running the partition branch over it would report every
    // bucket token as "phantom" — noise that drowns out the real defect (an
    // empty/misconfigured skillsRoot).
    fail("RUBRIC_TIER_INCOMPLETE", `skillsRoot "${skillsRoot}" contains no directories`);
  } else {
    const bucketedIn = new Map(); // slug -> [bucket keys it appears in]
    for (const key of bucketKeys) {
      for (const slug of splitSlugs(tiersDoc[key])) {
        if (!bucketedIn.has(slug)) bucketedIn.set(slug, []);
        bucketedIn.get(slug).push(key);
      }
    }
    // Phantom: a bucket names a slug with no matching directory.
    for (const [slug, keys] of bucketedIn) {
      if (!dirNames.has(slug)) {
        fail(
          "RUBRIC_TIER_INCOMPLETE",
          `bucket(s) ${keys.join(", ")} name "${slug}", which is not a directory under "${skillsRoot}"`,
        );
      }
    }
    // Missing: a directory appears in no bucket.
    for (const dir of dirNames) {
      if (!bucketedIn.has(dir)) {
        fail("RUBRIC_TIER_INCOMPLETE", `"${dir}" is not listed in any bucket`);
      }
    }
    // Double-listed: a slug appears in more than one bucket. A set-union
    // check ignores multiplicity and would miss this — checked separately.
    for (const [slug, keys] of bucketedIn) {
      if (keys.length > 1) {
        fail("RUBRIC_TIER_INCOMPLETE", `"${slug}" is listed in more than one bucket: ${keys.join(", ")}`);
      }
    }
  }

  // --- RUBRIC_TIER_ORPHAN ---------------------------------------------------
  // Every `rubrics/*.yaml` stem must appear in some bucket.
  checked.add("RUBRIC_TIER_ORPHAN");
  let rubricFiles = [];
  try {
    rubricFiles = readdirSync(rubricRoot).filter((f) => f.endsWith(".yaml"));
  } catch {
    // rubricRoot does not exist yet — expands to nothing rather than
    // throwing, matching `expandRubricRoot`'s convention in catalog-validator.mjs.
    rubricFiles = [];
  }
  const allBucketedSlugs = new Set(bucketKeys.flatMap((key) => splitSlugs(tiersDoc[key])));
  for (const file of rubricFiles) {
    const stem = file.slice(0, -".yaml".length);
    if (!allBucketedSlugs.has(stem)) {
      fail("RUBRIC_TIER_ORPHAN", `rubrics/${file} names "${stem}", which appears in no tiers.yaml bucket`);
    }
  }

  // --- RUBRIC_LANDED_INVALID -----------------------------------------------
  // Two disjoint branches: (a) a `landed:` token names no declared bucket
  // key, (b) a `landed:` token is the literal `uncovered`. Checked in that
  // order so the literal `uncovered` (which IS a declared bucket key on the
  // real four-bucket file) is reported as branch (b), never re-reported by
  // branch (a)'s membership check.
  checked.add("RUBRIC_LANDED_INVALID");
  const landedTokens = splitSlugs(tiersDoc.landed);
  for (const token of landedTokens) {
    if (token === "uncovered") {
      fail("RUBRIC_LANDED_INVALID", `landed: names "uncovered", which must never be listed`);
      continue;
    }
    if (!bucketKeys.includes(token)) {
      fail("RUBRIC_LANDED_INVALID", `landed: names "${token}", which is not a declared bucket key`);
    }
  }

  // --- RUBRIC_TIER_UNCOVERED ------------------------------------------------
  // For every bucket key named in `landed:` (excluding the literal
  // `uncovered`, which RUBRIC_LANDED_INVALID already refuses and which this
  // rule must not also treat as legitimate), every slug in that bucket must
  // have a `rubrics/<slug>.yaml`. A bucket absent from `landed:` is never
  // checked here — deliberately bucket-agnostic in scope, not in coverage.
  checked.add("RUBRIC_TIER_UNCOVERED");
  const landedBucketKeys = landedTokens.filter((t) => t !== "uncovered" && bucketKeys.includes(t));
  for (const key of landedBucketKeys) {
    for (const slug of splitSlugs(tiersDoc[key])) {
      const rubricPath = join(rubricRoot, `${slug}.yaml`);
      if (!existsSync(rubricPath)) {
        fail("RUBRIC_TIER_UNCOVERED", `bucket "${key}" names "${slug}", which has no ${rubricPath}`);
      }
    }
  }

  return { errors, checked };
}

// ---------------------------------------------------------------------------
// 1. The code registry
// ---------------------------------------------------------------------------

test("RUBRIC_COVERAGE_ERROR_CODES holds exactly the eleven documented codes, frozen", () => {
  assert.ok(Object.isFrozen(RUBRIC_COVERAGE_ERROR_CODES), "RUBRIC_COVERAGE_ERROR_CODES must be frozen");
  assert.deepEqual(
    [...RUBRIC_COVERAGE_ERROR_CODES].sort(),
    [
      "RUBRIC_ELEMENT_FLOOR",
      "RUBRIC_EXCEPTION_ID_MALFORMED",
      "RUBRIC_ID_MISMATCH",
      "RUBRIC_LANDED_INVALID",
      "RUBRIC_SCENARIO_MISSING",
      "RUBRIC_SCENARIO_STEP_MISSING",
      "RUBRIC_SOURCE_PATH_ESCAPE",
      "RUBRIC_TIER_INCOMPLETE",
      "RUBRIC_TIER_ORPHAN",
      "RUBRIC_TIER_UNCOVERED",
      "RUBRIC_TWIN_UNCITED",
    ],
  );
  assert.equal(RUBRIC_COVERAGE_ERROR_CODES.length, 11);
  assert.equal(new Set(RUBRIC_COVERAGE_ERROR_CODES).size, 11);
});

test("every implemented rule's checked counter was reached", () => {
  // Only four of the eleven codes have branches at this task; asserting the
  // other seven would be asserting code that does not exist yet.
  const { checked } = checkRubricSet();
  for (const code of IMPLEMENTED_CODES) {
    assert.ok(
      checked.has(code),
      `rule ${code} never ran — a rule that quietly stops running proves nothing`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. The real tiers.yaml's shape
// ---------------------------------------------------------------------------

test("tiers.yaml parses, carries exactly five top-level keys, and no tiers_version", () => {
  const doc = parseYaml(readFileSync(DEFAULT_TIERS_PATH, "utf8"));
  assert.deepEqual(Object.keys(doc).sort(), ["change_imminent", "core_lifecycle", "landed", "remaining", "uncovered"]);
  assert.ok(!("tiers_version" in doc), "tiers.yaml must not carry a tiers_version key");
});

test("five-key shape: a tiers_version key alongside the five real keys makes the key-count assertion go red", () => {
  // Falsification-table row 10, as a rejecting fixture rather than only an
  // absence-check against the golden file: build a synthetic tiers.yaml
  // carrying the same five real keys PLUS `tiers_version: 1`, then run the
  // IDENTICAL key-count assertion the previous test runs against the real
  // file and confirm it throws.
  const tmp = createTempDir();
  try {
    const tiersPath = join(tmp, "tiers.yaml");
    writeFileSync(
      tiersPath,
      [
        'landed: "change_imminent"',
        'change_imminent: "codehealth"',
        'core_lifecycle: "work"',
        'remaining: "init"',
        'uncovered: "bugfix-loop"',
        "tiers_version: 1",
      ].join("\n") + "\n",
    );
    const doc = parseYaml(readFileSync(tiersPath, "utf8"));
    assert.ok("tiers_version" in doc, "precondition: the synthetic fixture must actually carry tiers_version");
    const err = captureThrow(() =>
      assert.deepEqual(Object.keys(doc).sort(), ["change_imminent", "core_lifecycle", "landed", "remaining", "uncovered"]),
    );
    assert.equal(err.code, "ERR_ASSERTION");
  } finally {
    cleanupTempDir(tmp);
  }
});

test("tiers.yaml's landed: is the literal change_imminent", () => {
  const doc = parseYaml(readFileSync(DEFAULT_TIERS_PATH, "utf8"));
  assert.equal(doc.landed, "change_imminent");
});

test("every bucket token in tiers.yaml matches ^[a-z][a-z0-9-]*$", () => {
  const doc = parseYaml(readFileSync(DEFAULT_TIERS_PATH, "utf8"));
  const SLUG_RE = /^[a-z][a-z0-9-]*$/;
  for (const key of ["change_imminent", "core_lifecycle", "remaining", "uncovered"]) {
    for (const slug of splitSlugs(doc[key])) {
      assert.match(slug, SLUG_RE, `bucket "${key}" token "${slug}" fails ${SLUG_RE}`);
    }
  }
});

test("the 31 skills/ directories are enumerated, non-empty, and the four buckets partition them exactly", () => {
  // A direct, independent pin alongside RUBRIC_TIER_INCOMPLETE's own rule
  // (the same "assert directly, don't only trust the validator" habit
  // `skill-regression-catalog.test.mjs` uses for its five-key shape test).
  const dirs = readdirSync(DEFAULT_SKILLS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  assert.ok(dirs.length > 0, "skills/ enumerated to nothing — the partition check below would be vacuous");
  assert.equal(dirs.length, 31);

  const doc = parseYaml(readFileSync(DEFAULT_TIERS_PATH, "utf8"));
  // A plain array concat (not a Set union) so a double-listed slug inflates
  // the array's length past 31 and the sorted comparison catches it too —
  // not only RUBRIC_TIER_INCOMPLETE's own multiplicity check.
  const bucketed = [
    ...splitSlugs(doc.change_imminent),
    ...splitSlugs(doc.core_lifecycle),
    ...splitSlugs(doc.remaining),
    ...splitSlugs(doc.uncovered),
  ];
  assert.deepEqual([...bucketed].sort(), [...dirs].sort());
});

// ---------------------------------------------------------------------------
// 3. RUBRIC_TIER_INCOMPLETE
// ---------------------------------------------------------------------------

test("RUBRIC_TIER_INCOMPLETE: the real tiers.yaml partitions the real skills/ exactly", () => {
  const { errors } = checkRubricSet();
  assert.deepEqual(errors.filter((e) => e.code === "RUBRIC_TIER_INCOMPLETE"), []);
});

test("RUBRIC_TIER_INCOMPLETE: a directory absent from every bucket is rejected, naming it", () => {
  const tmp = createTempDir();
  try {
    const tiersPath = join(tmp, "tiers.yaml");
    writeFileSync(
      tiersPath,
      [
        'landed: "change_imminent"',
        'change_imminent: "codehealth"',
        'core_lifecycle: "work"',
        'remaining: "init"',
        'uncovered: "bugfix-loop"',
      ].join("\n") + "\n",
    );
    const skillsRoot = join(tmp, "skills");
    for (const name of ["codehealth", "work", "init", "bugfix-loop", "mystery-skill"]) {
      mkdirSync(join(skillsRoot, name), { recursive: true });
    }
    const { errors } = checkRubricSet({
      tiersPath,
      skillsRoot,
      rubricRoot: join(tmp, "rubrics"),
      scenarioRoot: join(tmp, "scenarios"),
    });
    const incomplete = errors.filter((e) => e.code === "RUBRIC_TIER_INCOMPLETE");
    assert.equal(incomplete.length, 1);
    assert.match(incomplete[0].detail, /mystery-skill/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_TIER_INCOMPLETE: a bucket naming a nonexistent directory is rejected, naming it", () => {
  const tmp = createTempDir();
  try {
    const tiersPath = join(tmp, "tiers.yaml");
    writeFileSync(
      tiersPath,
      [
        'landed: "change_imminent"',
        'change_imminent: "codehealth,ghost-skill"',
        'core_lifecycle: ""',
        'remaining: ""',
        'uncovered: ""',
      ].join("\n") + "\n",
    );
    const skillsRoot = join(tmp, "skills");
    mkdirSync(join(skillsRoot, "codehealth"), { recursive: true });
    const { errors } = checkRubricSet({
      tiersPath,
      skillsRoot,
      rubricRoot: join(tmp, "rubrics"),
      scenarioRoot: join(tmp, "scenarios"),
    });
    const incomplete = errors.filter((e) => e.code === "RUBRIC_TIER_INCOMPLETE");
    assert.equal(incomplete.length, 1);
    assert.match(incomplete[0].detail, /ghost-skill/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_TIER_INCOMPLETE: a slug double-listed across buckets is rejected, and multiplicity is not ignored", () => {
  const tmp = createTempDir();
  try {
    const tiersPath = join(tmp, "tiers.yaml");
    writeFileSync(
      tiersPath,
      [
        'landed: "change_imminent"',
        'change_imminent: "codehealth"',
        'core_lifecycle: "codehealth,work"',
        'remaining: ""',
        'uncovered: ""',
      ].join("\n") + "\n",
    );
    const skillsRoot = join(tmp, "skills");
    mkdirSync(join(skillsRoot, "codehealth"), { recursive: true });
    mkdirSync(join(skillsRoot, "work"), { recursive: true });
    const { errors } = checkRubricSet({
      tiersPath,
      skillsRoot,
      rubricRoot: join(tmp, "rubrics"),
      scenarioRoot: join(tmp, "scenarios"),
    });
    const incomplete = errors.filter((e) => e.code === "RUBRIC_TIER_INCOMPLETE");
    assert.equal(incomplete.length, 1);
    assert.match(incomplete[0].detail, /codehealth/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_TIER_INCOMPLETE: an empty skillsRoot short-circuits, reporting exactly the non-emptiness code", () => {
  const tmp = createTempDir();
  try {
    const tiersPath = join(tmp, "tiers.yaml");
    writeFileSync(
      tiersPath,
      ['landed: "change_imminent"', 'change_imminent: ""', 'core_lifecycle: ""', 'remaining: ""', 'uncovered: ""'].join(
        "\n",
      ) + "\n",
    );
    const skillsRoot = join(tmp, "empty-skills");
    mkdirSync(skillsRoot, { recursive: true });
    const { errors } = checkRubricSet({
      tiersPath,
      skillsRoot,
      rubricRoot: join(tmp, "rubrics"),
      scenarioRoot: join(tmp, "scenarios"),
    });
    // Not "not the partition branch" — exactly the one non-emptiness error,
    // full stop: no phantom-token noise from a partition branch that never ran.
    assert.deepEqual(errors.map((e) => e.code), ["RUBRIC_TIER_INCOMPLETE"]);
  } finally {
    cleanupTempDir(tmp);
  }
});

// ---------------------------------------------------------------------------
// 4. RUBRIC_TIER_ORPHAN
// ---------------------------------------------------------------------------

test("RUBRIC_TIER_ORPHAN: the real (currently empty) rubrics/ tree is vacuously clean", () => {
  // Legitimately empty at this task's landing state — a later task adds the
  // real-root application. Vacuously passing here is expected, not a gap.
  const { errors } = checkRubricSet();
  assert.deepEqual(errors.filter((e) => e.code === "RUBRIC_TIER_ORPHAN"), []);
});

test("RUBRIC_TIER_ORPHAN: a rubric stem in no bucket is rejected, over a non-vacuous glob", () => {
  const tmp = createTempDir();
  try {
    const tiersPath = join(tmp, "tiers.yaml");
    writeFileSync(
      tiersPath,
      ['landed: "change_imminent"', 'change_imminent: "codehealth"', 'core_lifecycle: ""', 'remaining: ""', 'uncovered: ""'].join(
        "\n",
      ) + "\n",
    );
    const rubricRoot = join(tmp, "rubrics");
    mkdirSync(rubricRoot, { recursive: true });
    writeFileSync(join(rubricRoot, "codehealth.yaml"), "rubric_id: skill-regression-codehealth\n");
    writeFileSync(join(rubricRoot, "nosuchskill.yaml"), "rubric_id: skill-regression-nosuchskill\n");
    const skillsRoot = join(tmp, "skills");
    mkdirSync(join(skillsRoot, "codehealth"), { recursive: true });

    // Precondition: prove the glob actually found files, or the rejecting
    // assertion below is vacuous over an empty scan.
    assert.ok(readdirSync(rubricRoot).length > 0, "precondition: rubricRoot must be non-empty");

    const { errors } = checkRubricSet({ tiersPath, rubricRoot, skillsRoot, scenarioRoot: join(tmp, "scenarios") });
    const orphan = errors.filter((e) => e.code === "RUBRIC_TIER_ORPHAN");
    assert.equal(orphan.length, 1);
    assert.match(orphan[0].detail, /nosuchskill/);
  } finally {
    cleanupTempDir(tmp);
  }
});

// ---------------------------------------------------------------------------
// 5. RUBRIC_LANDED_INVALID — two disjoint branches
// ---------------------------------------------------------------------------

test("RUBRIC_LANDED_INVALID: the real landed: change_imminent is a valid, non-uncovered bucket key", () => {
  const { errors } = checkRubricSet();
  assert.deepEqual(errors.filter((e) => e.code === "RUBRIC_LANDED_INVALID"), []);
});

test("RUBRIC_LANDED_INVALID (a): a landed: token naming no declared bucket key is rejected", () => {
  const tmp = createTempDir();
  try {
    const tiersPath = join(tmp, "tiers.yaml");
    writeFileSync(
      tiersPath,
      ['landed: "core_lifecycl"', 'change_imminent: "codehealth"', 'core_lifecycle: ""', 'remaining: ""', 'uncovered: ""'].join(
        "\n",
      ) + "\n",
    );
    const skillsRoot = join(tmp, "skills");
    mkdirSync(join(skillsRoot, "codehealth"), { recursive: true });
    const { errors } = checkRubricSet({
      tiersPath,
      rubricRoot: join(tmp, "rubrics"),
      scenarioRoot: join(tmp, "scenarios"),
      skillsRoot,
    });
    const invalid = errors.filter((e) => e.code === "RUBRIC_LANDED_INVALID");
    assert.equal(invalid.length, 1);
    assert.match(invalid[0].detail, /core_lifecycl/);
    assert.doesNotMatch(invalid[0].detail, /uncovered/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_LANDED_INVALID (b): a landed: token that is the literal uncovered fires on branch b, not a", () => {
  const tmp = createTempDir();
  try {
    const tiersPath = join(tmp, "tiers.yaml");
    writeFileSync(
      tiersPath,
      [
        'landed: "change_imminent,uncovered"',
        'change_imminent: "codehealth"',
        'core_lifecycle: ""',
        'remaining: ""',
        'uncovered: "bugfix-loop"',
      ].join("\n") + "\n",
    );
    const skillsRoot = join(tmp, "skills");
    mkdirSync(join(skillsRoot, "codehealth"), { recursive: true });
    mkdirSync(join(skillsRoot, "bugfix-loop"), { recursive: true });
    const { errors } = checkRubricSet({
      tiersPath,
      rubricRoot: join(tmp, "rubrics"),
      scenarioRoot: join(tmp, "scenarios"),
      skillsRoot,
    });
    const invalid = errors.filter((e) => e.code === "RUBRIC_LANDED_INVALID");
    assert.equal(invalid.length, 1);
    assert.match(invalid[0].detail, /uncovered.*must never be listed/);
  } finally {
    cleanupTempDir(tmp);
  }
});

// ---------------------------------------------------------------------------
// 6. RUBRIC_TIER_UNCOVERED — synthetic roots only
// ---------------------------------------------------------------------------

test("RUBRIC_TIER_UNCOVERED: a missing rubric in a landed: bucket fires, naming the slug", () => {
  const tmp = createTempDir();
  try {
    const tiersPath = join(tmp, "tiers.yaml");
    writeFileSync(tiersPath, ['landed: "b1"', 'b1: "s1,s2"'].join("\n") + "\n");
    const rubricRoot = join(tmp, "rubrics");
    mkdirSync(rubricRoot, { recursive: true });
    writeFileSync(join(rubricRoot, "s1.yaml"), "rubric_id: s1\n");
    // s2's rubric is deliberately absent.
    const skillsRoot = join(tmp, "skills");
    mkdirSync(join(skillsRoot, "s1"), { recursive: true });
    mkdirSync(join(skillsRoot, "s2"), { recursive: true });

    const { errors } = checkRubricSet({ tiersPath, rubricRoot, skillsRoot, scenarioRoot: join(tmp, "scenarios") });
    const uncovered = errors.filter((e) => e.code === "RUBRIC_TIER_UNCOVERED");
    assert.equal(uncovered.length, 1);
    assert.match(uncovered[0].detail, /s2/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_TIER_UNCOVERED: a bucket absent from landed: with no rubrics does not fire", () => {
  const tmp = createTempDir();
  try {
    const tiersPath = join(tmp, "tiers.yaml");
    writeFileSync(tiersPath, ['landed: "b1"', 'b1: "s1"', 'b2: "s3,s4"'].join("\n") + "\n");
    const rubricRoot = join(tmp, "rubrics");
    mkdirSync(rubricRoot, { recursive: true });
    writeFileSync(join(rubricRoot, "s1.yaml"), "rubric_id: s1\n"); // b1 fully covered
    // s3, s4 (bucket b2) have no rubric files, and b2 is absent from landed:.
    const skillsRoot = join(tmp, "skills");
    for (const name of ["s1", "s3", "s4"]) mkdirSync(join(skillsRoot, name), { recursive: true });

    const { errors } = checkRubricSet({ tiersPath, rubricRoot, skillsRoot, scenarioRoot: join(tmp, "scenarios") });
    assert.deepEqual(
      errors.filter((e) => e.code === "RUBRIC_TIER_UNCOVERED"),
      [],
      "a bucket absent from landed: must not be checked for coverage — the rule would be bucket-agnostic in the wrong direction",
    );
  } finally {
    cleanupTempDir(tmp);
  }
});
