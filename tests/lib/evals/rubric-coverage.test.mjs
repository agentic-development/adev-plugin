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
 * Task 1 implements four of the eleven rules: `RUBRIC_TIER_INCOMPLETE`,
 * `RUBRIC_TIER_ORPHAN`, `RUBRIC_LANDED_INVALID` (two branches), and
 * `RUBRIC_TIER_UNCOVERED` (proven on synthetic roots only — the real
 * `tests/evals/skill-regression/rubrics/` tree is legitimately empty at this
 * task's landing state, and applying the rule there is a later task's job).
 *
 * Task 2 adds six more — the shared per-skill rubric contract's rules, every
 * one of which needs a rubric actually LOADED via `lib/evals/rubric.mjs::loadRubric`
 * first, so its own codes surface unmodified before any of these six run:
 * `RUBRIC_ID_MISMATCH`, `RUBRIC_SCENARIO_MISSING`, `RUBRIC_SOURCE_PATH_ESCAPE`,
 * `RUBRIC_ELEMENT_FLOOR`, `RUBRIC_EXCEPTION_ID_MALFORMED`, and
 * `RUBRIC_TWIN_UNCITED`. Proven on synthetic roots only, for the same reason
 * as `RUBRIC_TIER_UNCOVERED`.
 *
 * The remaining code, `RUBRIC_SCENARIO_STEP_MISSING`, is declared in the
 * registry but has no branch here yet; Task 3 adds it to this same file.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { RUBRIC_COVERAGE_ERROR_CODES } from "../../../lib/evals/rubric-coverage-codes.mjs";
import { isContained, lenientRealpath, resolveContained } from "../../../lib/path-safety.mjs";
import { parseYaml } from "../../../lib/profiles/yaml.mjs";
import { captureThrow, cleanupTempDir, createTempDir } from "../../helpers.mjs";
import { splitSlugs } from "./catalog-validator.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");

const DEFAULT_TIERS_PATH = join(REPO_ROOT, "tests", "evals", "skill-regression", "tiers.yaml");
const DEFAULT_RUBRIC_ROOT = join(REPO_ROOT, "tests", "evals", "skill-regression", "rubrics");
const DEFAULT_SCENARIO_ROOT = join(REPO_ROOT, "tests", "evals", "skill-regression", "scenarios");
const DEFAULT_SKILLS_ROOT = join(REPO_ROOT, "skills");
// Fixed, not a parameter: whichever rubric root a caller passes, the catalog a
// rubric cites against is always this tier's one fixture (RUBRIC_TWIN_UNCITED
// resolves twins here, never by string arithmetic on an id).
const DEFAULT_CATALOG_PATH = join(REPO_ROOT, "tests", "evals", "skill-regression", "catalog.yaml");

/** The shape `baseline_exception_issue` / `spec_behaviour_gap_issue` must take, when present. */
const EXCEPTION_ID_RE = /^[a-z][a-z0-9-]*-[0-9a-z]+$/;

/** An exact `skill-regression:PV-nn` or `skill-regression:KC-nn` citation, and nothing else. */
const SKILL_REGRESSION_CITATION_RE = /^skill-regression:(PV-\d+|KC-\d+)$/;

/** Ten of the eleven codes with an implemented branch as of Task 2; only `RUBRIC_SCENARIO_STEP_MISSING` (Task 3) remains. */
const IMPLEMENTED_CODES = Object.freeze([
  "RUBRIC_TIER_INCOMPLETE",
  "RUBRIC_TIER_ORPHAN",
  "RUBRIC_LANDED_INVALID",
  "RUBRIC_TIER_UNCOVERED",
  "RUBRIC_ID_MISMATCH",
  "RUBRIC_SCENARIO_MISSING",
  "RUBRIC_SOURCE_PATH_ESCAPE",
  "RUBRIC_ELEMENT_FLOOR",
  "RUBRIC_EXCEPTION_ID_MALFORMED",
  "RUBRIC_TWIN_UNCITED",
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

  // --- The six shared-contract rules ----------------------------------------
  // Every rubric under rubricRoot is loaded through `loadRubric` FIRST, and a
  // load failure surfaces the loader's own code unmodified and skips the rest
  // of this block for that file — these six rules sit ON TOP of the loader's,
  // never in place of it, and a document that never finished loading has no
  // fields left to check.
  checked.add("RUBRIC_ID_MISMATCH");
  checked.add("RUBRIC_SCENARIO_MISSING");
  checked.add("RUBRIC_SOURCE_PATH_ESCAPE");
  checked.add("RUBRIC_ELEMENT_FLOOR");
  checked.add("RUBRIC_EXCEPTION_ID_MALFORMED");
  checked.add("RUBRIC_TWIN_UNCITED");

  // `artifact:` sources resolve against the fixture root, which sits beside
  // `rubricRoot` — `tests/evals/skill-regression/{rubrics,project}` in the
  // real tree, and the same sibling shape a synthetic root reproduces.
  // Real-pathed ONCE, up front, and reused for both the lexical pre-check and
  // the realpath-contained verdict below: `loadRubric` real-paths its own
  // root first for the identical reason — on macOS a temp root is reached
  // through `/var` -> `/private/var`, so handing a raw base to the lexical
  // step fails closed on every candidate, escaping or not.
  const fixtureRoot = join(dirname(rubricRoot), "project");
  const fixtureRootReal = lenientRealpath(fixtureRoot);
  const scenarioRootReal = lenientRealpath(scenarioRoot);

  // RUBRIC_TWIN_UNCITED resolves a cited PV's twin through the real catalog's
  // `twin:` field, never by string arithmetic on the id, so a catalog that
  // ever renumbers does not silently un-pair. A missing/unparsable catalog
  // leaves `twinById` empty, which is fail-closed: every PV citation then
  // reports its twin as unresolved rather than the rule silently no-opping.
  const twinById = new Map();
  try {
    const catalogDoc = parseYaml(readFileSync(DEFAULT_CATALOG_PATH, "utf8"));
    for (const list of [catalogDoc.planted_violations, catalogDoc.known_clean]) {
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        if (entry && typeof entry.id === "string" && typeof entry.twin === "string") {
          twinById.set(entry.id, entry.twin);
        }
      }
    }
  } catch {
    // handled by the empty map above
  }

  for (const file of rubricFiles) {
    const stem = file.slice(0, -".yaml".length);

    let doc;
    try {
      // A relative path plus `projectRoot`, never a pre-joined absolute path:
      // `rubricRoot` itself may be a raw (non-real) temp path on macOS, and an
      // absolute path built from it would be compared against `loadRubric`'s
      // OWN real-pathed root and rejected as unsafe on every call.
      doc = loadRubric(file, { projectRoot: rubricRoot });
    } catch (err) {
      fail(err.code ?? "RUBRIC_LOAD_ERROR", err.message);
      continue;
    }

    // --- RUBRIC_ID_MISMATCH ---------------------------------------------------
    const expectedId = `skill-regression-${stem}`;
    if (doc.rubric_id !== expectedId) {
      fail(
        "RUBRIC_ID_MISMATCH",
        `rubric "${file}" declares rubric_id "${doc.rubric_id}", expected "${expectedId}"`,
      );
    }
    if (doc.skill !== stem) {
      fail(
        "RUBRIC_ID_MISMATCH",
        `rubric "${file}" declares skill "${doc.skill}", expected the filename stem "${stem}"`,
      );
    }

    // --- RUBRIC_ELEMENT_FLOOR ---------------------------------------------------
    const elementCount = Array.isArray(doc.required_elements) ? doc.required_elements.length : 0;
    const criterionCount = Array.isArray(doc.quality_dimensions) ? doc.quality_dimensions.length : 0;
    if (elementCount < 5) {
      fail(
        "RUBRIC_ELEMENT_FLOOR",
        `rubric "${file}" declares ${elementCount} required_elements, fewer than the floor of 5`,
      );
    }
    if (criterionCount < 3 || criterionCount > 6) {
      fail(
        "RUBRIC_ELEMENT_FLOOR",
        `rubric "${file}" declares ${criterionCount} quality_dimensions, outside the 3-6 range`,
      );
    }

    // --- RUBRIC_EXCEPTION_ID_MALFORMED ------------------------------------------
    for (const key of ["baseline_exception_issue", "spec_behaviour_gap_issue"]) {
      if (!(key in doc)) continue; // present-and-malformed, not required
      const value = doc[key];
      if (typeof value !== "string" || !EXCEPTION_ID_RE.test(value)) {
        fail(
          "RUBRIC_EXCEPTION_ID_MALFORMED",
          `rubric "${file}" declares ${key} ${JSON.stringify(value)}, which fails ${EXCEPTION_ID_RE}`,
        );
      }
    }

    // --- RUBRIC_SOURCE_PATH_ESCAPE (scenario) / RUBRIC_SCENARIO_MISSING --------
    // Escape is decided before existence: an escaping scenario value never
    // reaches the existence check below, even when the escaping path happens
    // to exist on disk.
    if (typeof doc.scenario === "string") {
      const lexical = resolveContained(scenarioRootReal, `${doc.scenario}.md`);
      if (lexical === null) {
        fail(
          "RUBRIC_SOURCE_PATH_ESCAPE",
          `rubric "${file}" scenario "${doc.scenario}" escapes scenarioRoot "${scenarioRoot}"`,
        );
      } else {
        const real = lenientRealpath(lexical);
        if (!isContained(real, scenarioRootReal)) {
          fail(
            "RUBRIC_SOURCE_PATH_ESCAPE",
            `rubric "${file}" scenario "${doc.scenario}" escapes scenarioRoot "${scenarioRoot}" after realpath resolution`,
          );
        } else if (!existsSync(real)) {
          fail(
            "RUBRIC_SCENARIO_MISSING",
            `rubric "${file}" scenario "${doc.scenario}" names no file at "${real}"`,
          );
        }
      }
    }

    // --- RUBRIC_SOURCE_PATH_ESCAPE (artifact:) ----------------------------------
    const elements = Array.isArray(doc.required_elements) ? doc.required_elements : [];
    for (let i = 0; i < elements.length; i++) {
      const entry = elements[i];
      if (!entry || typeof entry.source !== "string" || !entry.source.startsWith("artifact:")) continue;
      const rawPath = entry.source.slice("artifact:".length).trim();
      const lexical = resolveContained(fixtureRootReal, rawPath);
      if (lexical === null) {
        fail(
          "RUBRIC_SOURCE_PATH_ESCAPE",
          `rubric "${file}" required_elements[${i}] artifact source "${rawPath}" escapes fixture_root "${fixtureRoot}"`,
        );
        continue;
      }
      const real = lenientRealpath(lexical);
      if (!isContained(real, fixtureRootReal)) {
        fail(
          "RUBRIC_SOURCE_PATH_ESCAPE",
          `rubric "${file}" required_elements[${i}] artifact source "${rawPath}" escapes fixture_root "${fixtureRoot}" after realpath resolution`,
        );
      }
    }

    // --- RUBRIC_TWIN_UNCITED -----------------------------------------------------
    const citedIds = new Set();
    for (const entry of elements) {
      if (!entry || typeof entry.source !== "string") continue;
      const m = SKILL_REGRESSION_CITATION_RE.exec(entry.source.trim());
      if (m) citedIds.add(m[1]);
    }
    for (const cited of citedIds) {
      if (!cited.startsWith("PV-")) continue;
      const twin = twinById.get(cited);
      if (!twin || !citedIds.has(twin)) {
        fail(
          "RUBRIC_TWIN_UNCITED",
          `rubric "${file}" cites ${cited} without also citing its known-clean twin` +
            (twin ? ` ${twin}` : " (unresolved in the catalog)"),
        );
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
  // Ten of the eleven codes have branches as of Task 2; asserting
  // RUBRIC_SCENARIO_STEP_MISSING too would be asserting code that does not
  // exist yet (Task 3).
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

// ---------------------------------------------------------------------------
// 7. Shared-contract rule test helpers (Task 2)
// ---------------------------------------------------------------------------

/**
 * Render a value as it must appear on the right of a `key:` in these flat-YAML
 * fixtures — every string quoted, since several values here carry a colon
 * (`"artifact: docs/foo.md"`, `"output: ..."`) that an unquoted scalar cannot
 * survive through `lib/profiles/yaml.mjs`'s first-colon-split reader.
 *
 * @param {any} value
 * @returns {string}
 */
function yamlScalar(value) {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

/**
 * Build `count` `required_elements` entries, each declaring every field the
 * shared contract's field-shapes paragraph names (`id`, `description`,
 * `source`, `met_when`, `not_applicable_when`), with an `output:` source —
 * never `artifact:` or `skill-regression:`, so building N of these never by
 * itself trips `RUBRIC_SOURCE_PATH_ESCAPE` or `RUBRIC_TWIN_UNCITED`.
 *
 * @param {number} count
 * @returns {object[]}
 */
function makeElements(count) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      id: `element_${n}`,
      description: `Deterministic check ${n}`,
      source: `output: the span element ${n} reads`,
      met_when: `condition ${n} holds`,
      not_applicable_when: `never — element ${n} always answers this`,
    };
  });
}

/**
 * Build `count` `quality_dimensions` entries, each declaring every field
 * `REQUIRED_CRITERION_FIELDS` names.
 *
 * @param {number} count
 * @returns {object[]}
 */
function makeCriteria(count) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      id: `criterion_${n}`,
      criterion: `Does the run satisfy judged condition ${n}?`,
      reference: "the matched golden sample, else the constitution",
      met_when: `condition ${n} is satisfied`,
      not_met_when: `condition ${n} is not satisfied`,
      unknown_when: `no reference exists to judge condition ${n} against`,
    };
  });
}

/**
 * Build the conforming baseline every shared-contract rule test mutates in
 * exactly one way: five `required_elements`, three `quality_dimensions`, the
 * shipped point budgets, both `exclude_from_denominator` policies, and
 * `insufficient_evidence_threshold_percent: 40` — the shared contract table
 * field-for-field.
 *
 * @param {string} slug - bare skill slug, e.g. "codehealth"
 * @returns {object} a plain-object rubric document, ready for `renderRubricYaml`
 */
function makeConformingRubric(slug) {
  return {
    rubric_id: `skill-regression-${slug}`,
    version: 1,
    layer: 3,
    verdict_values: "met | not_met | unknown (judged criteria) | not_applicable (deterministic elements)",
    skill: slug,
    scenario: slug,
    required_elements: makeElements(5),
    quality_dimensions: makeCriteria(3),
    layer3_max_points: 25,
    required_element_points: 10,
    judged_criterion_points: 15,
    unknown_policy: "exclude_from_denominator",
    not_applicable_policy: "exclude_from_denominator",
    insufficient_evidence_threshold_percent: 40,
  };
}

/**
 * Render a rubric document built by {@link makeConformingRubric} (or a
 * mutation of one) as flat-YAML source, in `REQUIRED_TOP_LEVEL_KEYS` order.
 *
 * @param {object} doc
 * @returns {string}
 */
function renderRubricYaml(doc) {
  const lines = [];
  const scalarKey = (key) => {
    if (key in doc) lines.push(`${key}: ${yamlScalar(doc[key])}`);
  };
  scalarKey("rubric_id");
  scalarKey("version");
  scalarKey("layer");
  scalarKey("verdict_values");
  scalarKey("skill");
  scalarKey("scenario");

  lines.push("required_elements:");
  for (const el of doc.required_elements ?? []) {
    lines.push(`  - id: ${el.id}`);
    for (const field of ["description", "source", "met_when", "not_applicable_when"]) {
      if (field in el) lines.push(`    ${field}: ${yamlScalar(el[field])}`);
    }
  }

  lines.push("quality_dimensions:");
  for (const c of doc.quality_dimensions ?? []) {
    lines.push(`  - id: ${c.id}`);
    for (const field of ["criterion", "reference", "met_when", "not_met_when", "unknown_when"]) {
      if (field in c) lines.push(`    ${field}: ${yamlScalar(c[field])}`);
    }
  }

  scalarKey("layer3_max_points");
  scalarKey("required_element_points");
  scalarKey("judged_criterion_points");
  scalarKey("unknown_policy");
  scalarKey("not_applicable_policy");
  scalarKey("insufficient_evidence_threshold_percent");
  scalarKey("baseline_exception_issue");
  scalarKey("spec_behaviour_gap_issue");

  return `${lines.join("\n")}\n`;
}

/**
 * Build a complete, otherwise-conforming harness for one shared-contract rule
 * case: a single-bucket `tiers.yaml`, a matching `skills/<slug>/` directory,
 * an empty `rubrics/` directory, and a `scenarios/<slug>.md` file so
 * `RUBRIC_SCENARIO_MISSING` never fires as background noise in a case that is
 * not testing it.
 *
 * @param {string} tmp - a directory from `createTempDir()`
 * @param {string} slug - bare skill slug
 * @returns {{tiersPath: string, rubricRoot: string, scenarioRoot: string, skillsRoot: string}}
 */
function buildHarness(tmp, slug) {
  const tiersPath = join(tmp, "tiers.yaml");
  writeFileSync(tiersPath, [`landed: "b1"`, `b1: "${slug}"`].join("\n") + "\n");
  const skillsRoot = join(tmp, "skills");
  mkdirSync(join(skillsRoot, slug), { recursive: true });
  const rubricRoot = join(tmp, "rubrics");
  mkdirSync(rubricRoot, { recursive: true });
  const scenarioRoot = join(tmp, "scenarios");
  mkdirSync(scenarioRoot, { recursive: true });
  writeFileSync(join(scenarioRoot, `${slug}.md`), `# ${slug} scenario\n`);
  return { tiersPath, rubricRoot, scenarioRoot, skillsRoot };
}

/**
 * Write `doc` as `<rubricRoot>/<slug>.yaml` over a harness {@link buildHarness}
 * builds, and run `checkRubricSet` over it.
 *
 * Asserts the rubric glob found the one file written before returning — the
 * "assert the glob returned a non-zero count" heuristic, applied once here so
 * every case built on top of this helper inherits it.
 *
 * @param {string} tmp - a directory from `createTempDir()`
 * @param {string} slug - bare skill slug
 * @param {object} doc - a rubric document, from `makeConformingRubric` or a mutation of one
 * @returns {{errors: Array<{code: string, detail: string}>, checked: Set<string>}}
 */
function runOneRubric(tmp, slug, doc) {
  const harness = buildHarness(tmp, slug);
  writeFileSync(join(harness.rubricRoot, `${slug}.yaml`), renderRubricYaml(doc));
  assert.ok(
    readdirSync(harness.rubricRoot).length > 0,
    "precondition: rubricRoot must be non-empty before checkRubricSet is asked to glob it",
  );
  return checkRubricSet(harness);
}

// ---------------------------------------------------------------------------
// 8. RUBRIC_ID_MISMATCH
// ---------------------------------------------------------------------------

test("RUBRIC_ID_MISMATCH: the conforming baseline is accepted outright", () => {
  const tmp = createTempDir();
  try {
    const { errors } = runOneRubric(tmp, "codehealth", makeConformingRubric("codehealth"));
    assert.deepEqual(errors, []);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_ID_MISMATCH: a wrong rubric_id with a correct skill is rejected, and only that", () => {
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("codehealth");
    doc.rubric_id = "skill-regression-wrong-name";
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors.map((e) => e.code), ["RUBRIC_ID_MISMATCH"]);
    assert.match(errors[0].detail, /wrong-name/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_ID_MISMATCH: a wrong skill with a correct rubric_id is rejected, and only that", () => {
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("codehealth");
    doc.skill = "not-codehealth";
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors.map((e) => e.code), ["RUBRIC_ID_MISMATCH"]);
    assert.match(errors[0].detail, /not-codehealth/);
  } finally {
    cleanupTempDir(tmp);
  }
});

// ---------------------------------------------------------------------------
// 9. RUBRIC_SCENARIO_MISSING
// ---------------------------------------------------------------------------

test("RUBRIC_SCENARIO_MISSING: a scenario naming no file under scenarioRoot is rejected, and only that", () => {
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("codehealth");
    doc.scenario = "no-such-scenario";
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors.map((e) => e.code), ["RUBRIC_SCENARIO_MISSING"]);
    assert.match(errors[0].detail, /no-such-scenario/);
  } finally {
    cleanupTempDir(tmp);
  }
});

// ---------------------------------------------------------------------------
// 10. RUBRIC_SOURCE_PATH_ESCAPE
// ---------------------------------------------------------------------------

test("RUBRIC_SOURCE_PATH_ESCAPE: an artifact: source escaping fixture_root is rejected before existence", () => {
  const tmp = createTempDir();
  try {
    mkdirSync(join(tmp, "project"), { recursive: true });
    const doc = makeConformingRubric("codehealth");
    doc.required_elements[0].source = "artifact: ../../../../etc/definitely-not-here";
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors.map((e) => e.code), ["RUBRIC_SOURCE_PATH_ESCAPE"]);
    assert.match(errors[0].detail, /definitely-not-here/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_SOURCE_PATH_ESCAPE: a scenario value escaping scenarioRoot is rejected, and only that", () => {
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("codehealth");
    doc.scenario = "../../../../etc/passwd";
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors.map((e) => e.code), ["RUBRIC_SOURCE_PATH_ESCAPE"]);
    assert.match(errors[0].detail, /passwd/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_SOURCE_PATH_ESCAPE: a symlinked fixture_root does not falsely report a legitimate artifact as escaping", () => {
  const tmp = createTempDir();
  try {
    // The base is reached through a symlink — the same shape a macOS temp
    // root has via /var -> /private/var. A candidate real-pathed through it
    // must still compare as contained once the base is real-pathed too.
    const realProject = join(tmp, "real-project");
    mkdirSync(realProject, { recursive: true });
    writeFileSync(join(realProject, "docs-architecture.md"), "# architecture\n");
    symlinkSync(realProject, join(tmp, "project"));

    const doc = makeConformingRubric("codehealth");
    doc.required_elements[0].source = "artifact: docs-architecture.md";
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors, [], "a legitimate in-base path must not be reported as an escape");
  } finally {
    cleanupTempDir(tmp);
  }
});

// ---------------------------------------------------------------------------
// 11. RUBRIC_ELEMENT_FLOOR
// ---------------------------------------------------------------------------

test("RUBRIC_ELEMENT_FLOOR: 4 required_elements is rejected, and only that", () => {
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("codehealth");
    doc.required_elements = makeElements(4);
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors.map((e) => e.code), ["RUBRIC_ELEMENT_FLOOR"]);
    assert.match(errors[0].detail, /\b4\b/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_ELEMENT_FLOOR: 2 quality_dimensions is rejected, and only that", () => {
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("codehealth");
    doc.quality_dimensions = makeCriteria(2);
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors.map((e) => e.code), ["RUBRIC_ELEMENT_FLOOR"]);
    assert.match(errors[0].detail, /\b2\b/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_ELEMENT_FLOOR: 7 quality_dimensions is rejected, and only that", () => {
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("codehealth");
    doc.quality_dimensions = makeCriteria(7);
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors.map((e) => e.code), ["RUBRIC_ELEMENT_FLOOR"]);
    assert.match(errors[0].detail, /\b7\b/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_ELEMENT_FLOOR: the boundary values 5 elements and 3 criteria (the baseline) are accepted", () => {
  const tmp = createTempDir();
  try {
    const { errors } = runOneRubric(tmp, "codehealth", makeConformingRubric("codehealth"));
    assert.deepEqual(errors.filter((e) => e.code === "RUBRIC_ELEMENT_FLOOR"), []);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_ELEMENT_FLOOR: the boundary value 6 criteria is accepted", () => {
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("codehealth");
    doc.quality_dimensions = makeCriteria(6);
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors, []);
  } finally {
    cleanupTempDir(tmp);
  }
});

// ---------------------------------------------------------------------------
// 12. RUBRIC_EXCEPTION_ID_MALFORMED
// ---------------------------------------------------------------------------

test("RUBRIC_EXCEPTION_ID_MALFORMED: a malformed baseline_exception_issue is rejected, and only that", () => {
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("codehealth");
    doc.baseline_exception_issue = "ISSUE-1"; // fails: must start with a lowercase letter
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors.map((e) => e.code), ["RUBRIC_EXCEPTION_ID_MALFORMED"]);
    assert.match(errors[0].detail, /baseline_exception_issue/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_EXCEPTION_ID_MALFORMED: a malformed spec_behaviour_gap_issue is rejected, and only that", () => {
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("codehealth");
    // Unquoted in the rendered YAML, this reparses as a Number, not a string —
    // exactly the "bare digit ... reparsing as a non-string" failure the rule exists to catch.
    doc.spec_behaviour_gap_issue = 123;
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors.map((e) => e.code), ["RUBRIC_EXCEPTION_ID_MALFORMED"]);
    assert.match(errors[0].detail, /spec_behaviour_gap_issue/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_EXCEPTION_ID_MALFORMED: absent keys do not fire — present-and-malformed, not required", () => {
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("codehealth"); // declares neither key
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors.filter((e) => e.code === "RUBRIC_EXCEPTION_ID_MALFORMED"), []);
  } finally {
    cleanupTempDir(tmp);
  }
});

// ---------------------------------------------------------------------------
// 13. RUBRIC_TWIN_UNCITED
// ---------------------------------------------------------------------------

test("RUBRIC_TWIN_UNCITED: PV-03 cited alone is rejected, and only that", () => {
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("codehealth");
    doc.required_elements[0].source = "skill-regression:PV-03";
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors.map((e) => e.code), ["RUBRIC_TWIN_UNCITED"]);
    assert.match(errors[0].detail, /PV-03/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_TWIN_UNCITED: PV-03 cited with the wrong twin KC-04 is rejected, and only that", () => {
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("codehealth");
    doc.required_elements[0].source = "skill-regression:PV-03";
    doc.required_elements[1].source = "skill-regression:KC-04";
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors.map((e) => e.code), ["RUBRIC_TWIN_UNCITED"]);
    assert.match(errors[0].detail, /PV-03/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_TWIN_UNCITED: PV-03 cited with its correct twin KC-03 is accepted", () => {
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("codehealth");
    doc.required_elements[0].source = "skill-regression:PV-03";
    doc.required_elements[1].source = "skill-regression:KC-03";
    const { errors } = runOneRubric(tmp, "codehealth", doc);
    assert.deepEqual(errors, []);
  } finally {
    cleanupTempDir(tmp);
  }
});
