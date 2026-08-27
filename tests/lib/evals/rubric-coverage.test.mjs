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
 * Task 3 adds the eleventh and last, `RUBRIC_SCENARIO_STEP_MISSING` — the
 * only rule that reads markdown rather than YAML, driven by `TOKEN_TABLE`,
 * a twenty-row `{ token, scope }` table declared as data below. Proven per
 * TOKEN BRANCH, not per rule, and on synthetic roots only: the real
 * `tests/evals/skill-regression/scenarios/` tree is legitimately empty at
 * this task's landing state.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { resolveStorageRoot } from "../../../lib/issues/resolve-root.mjs";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { RUBRIC_COVERAGE_ERROR_CODES } from "../../../lib/evals/rubric-coverage-codes.mjs";
import { isContained, lenientRealpath, resolveContained } from "../../../lib/path-safety.mjs";
import { parseYaml } from "../../../lib/profiles/yaml.mjs";
// `spliceDbPath`, `createScenarioCopy` and `createOutputsRoot` are Task 4's
// production deliverable (RED phase: the file does not exist yet, so this
// import throws and every test below fails at module load — the failure
// mode the plan's "Verify test fails" step names explicitly: "FAIL —
// scripts/eval-scenario-setup.mjs does not exist, so the import throws.").
import { createOutputsRoot, createScenarioCopy, spliceDbPath } from "../../../scripts/eval-scenario-setup.mjs";
import { captureThrow, cleanupTempDir, createTempDir, createTempGitRepo } from "../../helpers.mjs";
import { splitSlugs, validateCatalog } from "./catalog-validator.mjs";

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

/** All eleven codes have an implemented branch as of Task 3. */
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
  "RUBRIC_SCENARIO_STEP_MISSING",
]);

/**
 * The twenty token-branches `RUBRIC_SCENARIO_STEP_MISSING` checks for,
 * declared as data — `{ token, scope }`, where `scope` is `'every'` (every
 * scenario file), `'prototype'` (only `prototype.md`), or an array of slugs
 * (only scenario files whose basename is one of them). Both the checking
 * loop in `checkRubricSet` and the rejecting-input loop in section 14 below
 * drive off this ONE array — adding a row adds both a check and a rejecting
 * case, which is what keeps the per-token-branch obligation from drifting.
 *
 * The check below is LITERAL SUBSTRING PRESENCE, never meaning: a scenario
 * naming every required step in the wrong order still passes. That is the
 * honest limit of a static check over prose.
 */
const TOKEN_TABLE = Object.freeze([
  { token: "createTempGitRepo", scope: "every" },
  { token: "flat copy of fixture_root contents into <copy-root>", scope: "every" },
  { token: "tasks.db_path", scope: "every" },
  { token: "cwd: realpath(<copy-root>)", scope: "every" },
  { token: "isContained under <copy-root>", scope: "every" },
  { token: "artifact: sources re-resolved under <copy-root> after the run", scope: "every" },
  {
    token: "outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy",
    scope: "every",
  },
  { token: "copy root matches ^[A-Za-z0-9._/-]+$ before any typed command", scope: "every" },
  { token: "teardown deletes only the two mkdtempSync-returned roots", scope: "every" },
  { token: "tasks.backend: json survives the splice, and the manifest's comments survive it", scope: "every" },
  { token: "db_path read back as <copy-root>", scope: "every" },
  { token: "no infra_requirements: in the copy", scope: "every" },
  { token: "no .claude/ or .mcp.json anywhere under <copy-root>", scope: "every" },
  { token: "git status and rev-parse HEAD equality at every worktree root", scope: "every" },
  { token: "kill <recorded-pid>", scope: "prototype" },
  { token: "loopback", scope: "prototype" },
  { token: "recorded PID and bound port each match ^[0-9]+$ before any typed command", scope: "prototype" },
  { token: "no listener on <port> after teardown", scope: "prototype" },
  { token: "scored tier: non-functional", scope: "prototype" },
  { token: "ADEV_NO_INFRA=1 in the step's own env", scope: ["build", "work"] },
]);

/**
 * Whether TOKEN_TABLE row `scope` selects a scenario file's bare slug —
 * `'every'` selects unconditionally, `'prototype'` selects only the literal
 * slug `prototype`, and an array selects by membership.
 *
 * @param {'every'|'prototype'|string[]} scope
 * @param {string} slug - a scenario file's basename with `.md` stripped
 * @returns {boolean}
 */
function scopeSelects(scope, slug) {
  if (scope === "every") return true;
  if (scope === "prototype") return slug === "prototype";
  if (Array.isArray(scope)) return scope.includes(slug);
  return false;
}

/**
 * The TOKEN_TABLE rows applicable to `slug` — used both to render a fully
 * conforming scenario file and, with one row removed, a rejecting one.
 *
 * @param {string} slug
 * @returns {Array<{token: string, scope: string|string[]}>}
 */
function tokensFor(slug) {
  return TOKEN_TABLE.filter((row) => scopeSelects(row.scope, slug));
}

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
 * @param {string[]} [options.onlyStems] - Task 5's extension: when supplied,
 *   restrict every stem-scoped check (`RUBRIC_TIER_ORPHAN`,
 *   `RUBRIC_TIER_UNCOVERED`, the six shared-contract rules,
 *   `RUBRIC_SCENARIO_STEP_MISSING`) to rubric/scenario files whose basename
 *   stem is a member of this list, as if `rubricRoot`/`scenarioRoot`
 *   contained only those stems. `RUBRIC_TIER_INCOMPLETE` and
 *   `RUBRIC_LANDED_INVALID` are unaffected — they decide `tiersPath` against
 *   `skillsRoot` alone and have no rubric/scenario file to filter. Lets a
 *   tier-landing task assert "these N files conform" in isolation against
 *   real roots that will, over later tasks, accumulate files this task did
 *   not author. `null`/absent means "no filter" — every file present is
 *   considered, the pre-Task-5 behaviour.
 * @returns {{errors: Array<{code: string, detail: string}>, checked: Set<string>,
 *   matchedRubricFiles: string[], matchedScenarioFiles: string[]}}
 */
export function checkRubricSet({
  tiersPath = DEFAULT_TIERS_PATH,
  rubricRoot = DEFAULT_RUBRIC_ROOT,
  scenarioRoot = DEFAULT_SCENARIO_ROOT,
  skillsRoot = DEFAULT_SKILLS_ROOT,
  onlyStems = null,
} = {}) {
  const onlyStemsSet = Array.isArray(onlyStems) ? new Set(onlyStems) : null;
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
  // `onlyStems` filters the shared `rubricFiles` list BEFORE any rule below
  // consumes it, so every stem-scoped rule (ORPHAN here, the six
  // shared-contract rules further down) sees only the requested subset —
  // as if `rubricRoot` contained nothing else.
  if (onlyStemsSet) {
    rubricFiles = rubricFiles.filter((f) => onlyStemsSet.has(f.slice(0, -".yaml".length)));
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
      // `onlyStems` restricts coverage scope too: a slug outside the filter
      // is treated as out of scope for THIS call, not as an uncovered
      // finding — the same "as if rubricRoot contained only these stems"
      // semantics the rubricFiles filter above applies.
      if (onlyStemsSet && !onlyStemsSet.has(slug)) continue;
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

  // --- RUBRIC_SCENARIO_STEP_MISSING ------------------------------------------
  // The only rule in the set that reads markdown, not YAML, and is decided
  // independently of the rubrics loaded above: for every `scenarioRoot/*.md`
  // file, every TOKEN_TABLE row whose scope selects that file's slug must
  // appear as a literal substring somewhere in the file. LITERAL SUBSTRING
  // PRESENCE, never meaning — a scenario naming every step in the wrong
  // order still passes. That is the honest limit of a static check over
  // prose.
  checked.add("RUBRIC_SCENARIO_STEP_MISSING");
  let scenarioFiles = [];
  try {
    scenarioFiles = readdirSync(scenarioRoot).filter((f) => f.endsWith(".md"));
  } catch {
    // scenarioRoot does not exist yet — expands to nothing, the same
    // convention rubricFiles above uses for rubricRoot.
    scenarioFiles = [];
  }
  if (onlyStemsSet) {
    scenarioFiles = scenarioFiles.filter((f) => onlyStemsSet.has(f.slice(0, -".md".length)));
  }
  for (const file of scenarioFiles) {
    const slug = file.slice(0, -".md".length);
    const content = readFileSync(join(scenarioRoot, file), "utf8");
    for (const row of TOKEN_TABLE) {
      if (!scopeSelects(row.scope, slug)) continue;
      if (!content.includes(row.token)) {
        fail("RUBRIC_SCENARIO_STEP_MISSING", `scenario "${file}" is missing required step token "${row.token}"`);
      }
    }
  }

  return { errors, checked, matchedRubricFiles: rubricFiles, matchedScenarioFiles: scenarioFiles };
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
  // All eleven codes have branches as of Task 3 — the real scenarioRoot
  // being legitimately empty at this landing state does not stop
  // RUBRIC_SCENARIO_STEP_MISSING's `checked.add` from running; it only
  // means the loop it guards iterates zero files.
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
 * an empty `rubrics/` directory, and a `scenarios/<slug>.md` file carrying
 * every TOKEN_TABLE token `slug` requires — so neither `RUBRIC_SCENARIO_MISSING`
 * nor `RUBRIC_SCENARIO_STEP_MISSING` (Task 3) fires as background noise in a
 * case that is not testing either of them. `renderScenarioBody`/`tokensFor`
 * are defined later in this file (section 14) but, as top-level function
 * declarations, are hoisted and callable here.
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
  writeFileSync(join(scenarioRoot, `${slug}.md`), renderScenarioBody(tokensFor(slug)));
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

// ---------------------------------------------------------------------------
// 14. RUBRIC_SCENARIO_STEP_MISSING — twenty token branches (Task 3)
// ---------------------------------------------------------------------------

/**
 * A minimal harness for RUBRIC_SCENARIO_STEP_MISSING alone: a valid
 * single-bucket `tiers.yaml`, a matching `skills/` directory, an empty
 * `rubrics/` directory, and an empty `scenarios/` directory for the caller to
 * populate. RUBRIC_SCENARIO_STEP_MISSING's own branch is decided entirely by
 * `scenarioRoot`'s `*.md` files, independent of `tiersPath`/`rubricRoot`/
 * `skillsRoot` — so every test below filters `errors` down to this rule's own
 * code rather than asserting on the full list, exactly like the other ten
 * rules' sections do when a shared harness necessarily also exercises them.
 *
 * @param {string} tmp - a directory from `createTempDir()`
 * @returns {{tiersPath: string, rubricRoot: string, scenarioRoot: string, skillsRoot: string}}
 */
function buildScenarioOnlyHarness(tmp) {
  const tiersPath = join(tmp, "tiers.yaml");
  writeFileSync(tiersPath, ['landed: "b1"', 'b1: "codehealth"'].join("\n") + "\n");
  const skillsRoot = join(tmp, "skills");
  mkdirSync(join(skillsRoot, "codehealth"), { recursive: true });
  const rubricRoot = join(tmp, "rubrics");
  mkdirSync(rubricRoot, { recursive: true });
  const scenarioRoot = join(tmp, "scenarios");
  mkdirSync(scenarioRoot, { recursive: true });
  return { tiersPath, rubricRoot, scenarioRoot, skillsRoot };
}

/**
 * Render a scenario markdown body carrying every token in `tokens`, one per
 * bullet — order does not matter to the rule (LITERAL SUBSTRING PRESENCE
 * only), so a bulleted list is as good as prose here and far easier to build.
 *
 * @param {Array<{token: string}>} tokens
 * @returns {string}
 */
function renderScenarioBody(tokens) {
  return `# scenario\n\n${tokens.map((row) => `- ${row.token}`).join("\n")}\n`;
}

test("TOKEN_TABLE holds exactly 20 rows — a silently deleted row must go red here first", () => {
  assert.equal(TOKEN_TABLE.length, 20);
});

test("RUBRIC_SCENARIO_STEP_MISSING: conforming scenario files for an ordinary, prototype, and synthetic build slug are accepted", () => {
  const tmp = createTempDir();
  try {
    const harness = buildScenarioOnlyHarness(tmp);
    // "build" is a synthetic build-shaped fixture: neither `build` nor `work`
    // is authored by this tier, so its only real input here is this one.
    for (const slug of ["codehealth", "prototype", "build"]) {
      writeFileSync(join(harness.scenarioRoot, `${slug}.md`), renderScenarioBody(tokensFor(slug)));
    }
    assert.equal(
      readdirSync(harness.scenarioRoot).filter((f) => f.endsWith(".md")).length,
      3,
      "precondition: all three synthetic scenario files must be present before checkRubricSet is asked to glob them",
    );
    const { errors } = checkRubricSet(harness);
    assert.deepEqual(errors.filter((e) => e.code === "RUBRIC_SCENARIO_STEP_MISSING"), []);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("RUBRIC_SCENARIO_STEP_MISSING: an empty scenarioRoot glob is the non-emptiness failure mode, not a vacuous pass", () => {
  // The second harness probe from the plan's falsification step: a token
  // check over zero files passes vacuously — the exact anti-pattern being
  // guarded against — so this asserts the precondition itself fails here,
  // never that checkRubricSet silently reports zero errors.
  const tmp = createTempDir();
  try {
    const harness = buildScenarioOnlyHarness(tmp);
    assert.equal(readdirSync(harness.scenarioRoot).filter((f) => f.endsWith(".md")).length, 0);
    const err = captureThrow(() =>
      assert.ok(
        readdirSync(harness.scenarioRoot).filter((f) => f.endsWith(".md")).length > 0,
        "precondition: scenarioRoot must be non-empty before checkRubricSet is asked to glob it",
      ),
    );
    assert.equal(err.code, "ERR_ASSERTION");
    // And distinctly: the token loop itself passes vacuously over the same
    // empty root — proving the two failure modes are different, not that
    // either is acceptable on its own.
    const { errors } = checkRubricSet(harness);
    assert.deepEqual(errors.filter((e) => e.code === "RUBRIC_SCENARIO_STEP_MISSING"), []);
  } finally {
    cleanupTempDir(tmp);
  }
});

for (const [index, row] of TOKEN_TABLE.entries()) {
  test(`RUBRIC_SCENARIO_STEP_MISSING: row ${index + 1} — omitting "${row.token}" fires, naming only it`, () => {
    const tmp = createTempDir();
    try {
      const harness = buildScenarioOnlyHarness(tmp);
      // The representative slug this row's scope resolves to: 'every' picks
      // an ordinary skill slug, 'prototype' picks itself, and the
      // build/work slug list picks its first member — the synthetic
      // build-shaped fixture the plan calls for, since neither `build` nor
      // `work` is authored by this tier.
      const slug = row.scope === "prototype" ? "prototype" : Array.isArray(row.scope) ? row.scope[0] : "codehealth";
      // Every OTHER token applicable to this slug stays present — omitting
      // more than the one target token would prove nothing about this row
      // specifically.
      const tokens = tokensFor(slug).filter((candidate) => candidate !== row);
      assert.equal(
        tokens.length,
        tokensFor(slug).length - 1,
        "precondition: exactly the target row was removed from this slug's applicable set",
      );
      writeFileSync(join(harness.scenarioRoot, `${slug}.md`), renderScenarioBody(tokens));
      assert.equal(
        readdirSync(harness.scenarioRoot).filter((f) => f.endsWith(".md")).length,
        1,
        "precondition: exactly one synthetic scenario file is present",
      );
      const { errors } = checkRubricSet(harness);
      const missing = errors.filter((e) => e.code === "RUBRIC_SCENARIO_STEP_MISSING");
      assert.equal(missing.length, 1, `row ${index + 1} must fire exactly once, naming only the omitted token`);
      assert.ok(
        missing[0].detail.includes(row.token),
        `row ${index + 1}'s error detail must literally name the omitted token`,
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });
}

// ---------------------------------------------------------------------------
// 15. spliceDbPath — the splice refusal set (Task 4)
// ---------------------------------------------------------------------------
//
// `spliceDbPath(manifestText, value)` is a smaller, single-purpose sibling of
// `lib/extensions/governance-splice.mjs`'s registry splice: same discipline
// (never reserialize through `parseYaml`, since that discards comments;
// locate the target by line range; refuse an ambiguous form rather than
// guessing), a different key shape (a single nested `db_path` scalar under
// `tasks:`, rather than a registry array). It accepts exactly two on-disk
// forms and refuses every other, each refusal distinguishable by its
// message even though every shape-refusal below shares one error code
// (`DB_PATH_SPLICE_REFUSED`) — the same convention `governance-splice.mjs`
// uses for its own `GOVERNANCE_PARSE_REFUSED`.

/**
 * The normal, accepted block-map manifest form: `tasks:` as a multi-line
 * YAML block carrying `backend: json`, with a comment before and after —
 * the fixture the round-trip and indent assertions below build on, and the
 * "pre-existing normal block-map acceptance" row of the form table.
 */
function baseManifestText() {
  return [
    "# eval scenario manifest",
    "platform: javascript",
    "",
    "tasks:",
    "  backend: json",
    "  claim_ttl_minutes: 240",
    "",
    "# trailing comment about tasks",
    "",
  ].join("\n");
}

const SPLICE_VALUE = "/private/tmp/adev-eval-scenario-abc123";

/**
 * The seven refusal rows of Task 4's form table, plus the two acceptance
 * rows, as one table so the row order here mirrors the plan's table order
 * exactly (traceability, same convention `TOKEN_TABLE` uses above).
 *
 * `reason` is a regex the thrown message must match — distinct per row, so a
 * future implementation that throws the right code for the wrong reason is
 * still caught.
 */
const REFUSAL_TABLE = Object.freeze([
  {
    name: "tasks: absent",
    manifestText: ["# eval scenario manifest", "platform: javascript", ""].join("\n"),
    reason: /absent/i,
  },
  {
    name: "db_path: already present under tasks:",
    manifestText: ["tasks:", "  backend: json", "  db_path: /already/set", ""].join("\n"),
    reason: /db_path/i,
  },
  {
    name: "tasks: duplicated (appears twice at top level)",
    manifestText: ["tasks:", "  backend: json", "tasks:", "  claim_ttl_minutes: 240", ""].join("\n"),
    reason: /duplicat/i,
  },
  {
    name: "tasks: {backend: json} (non-empty inline flow map)",
    manifestText: ["tasks: {backend: json}", ""].join("\n"),
    reason: /non-empty|backend/i,
  },
  {
    name: "tasks: [] (empty inline flow sequence)",
    manifestText: ["tasks: []", ""].join("\n"),
    reason: /sequence/i,
  },
  {
    name: "tasks: present but not a map (a scalar value)",
    manifestText: ['tasks: "x"', ""].join("\n"),
    reason: /scalar|not a map/i,
  },
  {
    name: "mixed or lone-CR line endings in the manifest text",
    manifestText: "tasks:\r\n  backend: json\n  claim_ttl_minutes: 240\n",
    reason: /carriage return|line ending|CRLF/i,
  },
]);

for (const [index, row] of REFUSAL_TABLE.entries()) {
  test(`spliceDbPath: row ${index + 1} — ${row.name} — refuses, distinct reason`, () => {
    const err = captureThrow(() => spliceDbPath(row.manifestText, SPLICE_VALUE));
    assert.equal(err.code, "DB_PATH_SPLICE_REFUSED", `row ${index + 1} must refuse with the splice-refusal code`);
    assert.match(err.message, row.reason, `row ${index + 1}'s message must name its own distinct reason`);
    for (const [otherIndex, other] of REFUSAL_TABLE.entries()) {
      if (otherIndex === index) continue;
      assert.doesNotMatch(
        err.message,
        other.reason,
        `row ${index + 1}'s message must not also match row ${otherIndex + 1}'s reason — the two refusals must stay distinguishable`,
      );
    }
  });
}

test("spliceDbPath: tasks: {} (empty inline flow map) is accepted — the deliberate widening", () => {
  const result = spliceDbPath(["tasks: {}", ""].join("\n"), SPLICE_VALUE);
  const parsed = parseYaml(result);
  assert.equal(typeof parsed.tasks.db_path, "string");
  assert.equal(parsed.tasks.db_path, SPLICE_VALUE);
});

test("spliceDbPath: tasks: {} widening does not also accept a non-empty inline flow map", () => {
  // Falsification companion to the acceptance test above, written now so the
  // widening's boundary is pinned from the start rather than discovered at
  // GREEN: `{}` is accepted because it is provably empty, not because any
  // inline flow map is.
  const err = captureThrow(() => spliceDbPath(["tasks: {backend: json}", ""].join("\n"), SPLICE_VALUE));
  assert.equal(err.code, "DB_PATH_SPLICE_REFUSED");
});

test("spliceDbPath: tasks: present as a normal block map is accepted, appending db_path nested beneath it", () => {
  const result = spliceDbPath(baseManifestText(), SPLICE_VALUE);
  const parsed = parseYaml(result);
  assert.equal(typeof parsed.tasks.db_path, "string");
  assert.equal(parsed.tasks.db_path, SPLICE_VALUE);
});

test("spliceDbPath: an unsafe value is rejected via assertSafeScalar, not silently written", () => {
  // A colon-followed-by-space value reparses as a nested map key
  // (`lib/profiles/yaml.mjs`'s block-sequence/map branch — see
  // `governance-values.mjs`'s UNSAFE_COLON doc comment) — exactly the class
  // of value assertSafeScalar exists to refuse before it ever reaches emission.
  const unsafeValue = "/tmp/evil: rm -rf /";
  const err = captureThrow(() => spliceDbPath(baseManifestText(), unsafeValue));
  assert.equal(err.code, "GOVERNANCE_SCALAR_UNSAFE");
});

test("spliceDbPath: an unsafe value carrying a flow indicator is also rejected", () => {
  const unsafeValue = "/tmp/[bad]";
  const err = captureThrow(() => spliceDbPath(baseManifestText(), unsafeValue));
  assert.equal(err.code, "GOVERNANCE_SCALAR_UNSAFE");
});

test("spliceDbPath: the value is checked before any manifest-shape parsing — an unsafe value on an absent tasks: manifest still reports GOVERNANCE_SCALAR_UNSAFE, not DB_PATH_SPLICE_REFUSED", () => {
  // Distinguishes the PRE-check from the emission re-check: pairing an
  // unsafe value with a manifest shape that would ALSO be refused on its
  // own (tasks: absent) proves which check fires first. If the pre-check
  // were skipped and only the emission check ran, the absent-tasks: shape
  // refusal would fire first instead, since emission is never reached.
  const unsafeValue = "/tmp/evil: rm -rf /";
  const manifestText = ["# eval scenario manifest", "platform: javascript", ""].join("\n");
  const err = captureThrow(() => spliceDbPath(manifestText, unsafeValue));
  assert.equal(err.code, "GOVERNANCE_SCALAR_UNSAFE");
});

test("spliceDbPath: round-trip pin — db_path is a string equal to the value, backend: json survives, and every comment line survives on the text", () => {
  const before = baseManifestText();
  const result = spliceDbPath(before, SPLICE_VALUE);

  const parsed = parseYaml(result);
  assert.equal(typeof parsed.tasks.db_path, "string");
  assert.equal(parsed.tasks.db_path, SPLICE_VALUE);
  assert.equal(parsed.tasks.backend, "json");

  // Checked on the raw TEXT, not the parsed doc — parseYaml discards comments,
  // which is exactly what makes this assertion meaningful: a reserialize-based
  // splice would still pass the parsed-doc assertions above while silently
  // dropping every comment line below.
  const beforeCommentLines = before.split("\n").filter((line) => line.trim().startsWith("#"));
  assert.ok(beforeCommentLines.length > 0, "precondition: the fixture must actually carry comment lines to prove");
  for (const commentLine of beforeCommentLines) {
    assert.ok(
      result.includes(commentLine),
      `comment line ${JSON.stringify(commentLine)} must survive the splice verbatim`,
    );
  }
});

test("spliceDbPath: db_path is emitted nested under tasks:, not at the top level", () => {
  const result = spliceDbPath(baseManifestText(), SPLICE_VALUE);
  const parsed = parseYaml(result);
  // This is the assertion that actually detects a wrong-indent emission:
  // `resolveStorageRoot` reads `manifest?.tasks?.db_path` with optional
  // chaining, so a leaf emitted one column too shallow reads back as
  // `undefined` at `parsed.tasks.db_path` even though `parsed.db_path` would
  // hold the value instead.
  assert.equal(parsed.tasks.db_path, SPLICE_VALUE);
  assert.equal(parsed.db_path, undefined, "db_path must not land at the top level of the document");
});

test("spliceDbPath: indent correctness is decided by resolveStorageRoot against a DIFFERENT cwd, not a same-cwd difference", () => {
  // Part two of the indent-correctness assertion (part one is the parsed-leaf
  // check above). A same-cwd comparison cannot distinguish correct from
  // wrong-indent code: for a mkdtempSync + git init root, dirname(git
  // rev-parse --git-common-dir) returns exactly realpathSync(dir) — the
  // git-common-dir fallback is byte-identical to the value the splice
  // writes, at the copy root. So spliced and unspliced resolveStorageRoot
  // return the SAME string there regardless of indent, and an assertion
  // built on that pair would be red before any perturbation and could never
  // go red because of one. The differ-assertion is only meaningful against
  // a cwd OTHER than the copy root.
  const copyRoot = createTempGitRepo();
  const otherRoot = createTempGitRepo();
  try {
    const realCopyRoot = realpathSync(copyRoot);
    const spliced = spliceDbPath(baseManifestText(), realCopyRoot);
    const unspliced = baseManifestText();

    assert.equal(
      resolveStorageRoot(parseYaml(spliced), otherRoot),
      realCopyRoot,
      "a correctly-nested db_path must win over cwd when resolved from a different root",
    );
    assert.equal(
      resolveStorageRoot(parseYaml(unspliced), otherRoot),
      realpathSync(otherRoot),
      "with no db_path declared, the git-common-dir fallback must answer for cwd",
    );

    // The wrong-indent perturbation: emit db_path at the top level instead
    // of nested under tasks:. resolveStorageRoot's optional chaining reads
    // manifest?.tasks?.db_path, so a top-level leaf is invisible to it and
    // the fallback fires — the perturbation this test exists to catch.
    const wronglyIndented = spliced.replace(/^(\s*)db_path:/m, "db_path:");
    assert.equal(
      resolveStorageRoot(parseYaml(wronglyIndented), otherRoot),
      realpathSync(otherRoot),
      "a top-level (wrongly-indented) db_path must not be honoured — this must go red under the perturbation",
    );
  } finally {
    cleanupTempDir(copyRoot);
    cleanupTempDir(otherRoot);
  }
});

test("createScenarioCopy: the copy is a git repo whose root is simultaneously the project root — a flat copy, not a nested one", () => {
  // The falsification target: if cpSync ever copied fixtureRoot AS a
  // subdirectory instead of flattening its contents into copyRoot,
  // resolveStorageRoot's git-common-dir fallback would still resolve to
  // copyRoot (the git root), but .context-index/manifest.yaml would sit one
  // level too deep to be found at the path this test checks — the
  // git-root/project-root identity this row exists to prove.
  const { copyRoot } = createScenarioCopy();
  try {
    const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      cwd: copyRoot,
    }).trim();
    assert.equal(realpathSync(gitRoot), copyRoot, "the copy's git root must equal the copy root itself");

    const manifestPath = join(copyRoot, ".context-index", "manifest.yaml");
    assert.ok(existsSync(manifestPath), "the manifest must be directly under the copy root, not nested under a fixture-named subdirectory");

    const parsed = parseYaml(readFileSync(manifestPath, "utf8"));
    assert.equal(parsed.tasks.db_path, copyRoot, "the copy's own manifest must already carry its own db_path, spliced to itself");
  } finally {
    cleanupTempDir(copyRoot);
  }
});

test("createOutputsRoot: the outputs root is a sibling of the copy root, not nested inside it", () => {
  const { copyRoot } = createScenarioCopy();
  try {
    const outputsRoot = createOutputsRoot(copyRoot);
    try {
      assert.equal(dirname(outputsRoot), dirname(copyRoot), "outputs must sit beside the copy root, in the same parent");
      assert.ok(!outputsRoot.startsWith(copyRoot + "/"), "outputs must not be nested inside the copy");
    } finally {
      cleanupTempDir(outputsRoot);
    }
  } finally {
    cleanupTempDir(copyRoot);
  }
});

// ---------------------------------------------------------------------------
// 16. Task 5 — the three detector rubrics conform (codehealth, repomap, document)
// ---------------------------------------------------------------------------
//
// No new RUBRIC_* rule here: these three files are validated by the checker
// Tasks 1-3 already landed. This section adds one test that runs
// `checkRubricSet` over the REAL roots, narrowed by `onlyStems` to exactly
// these three stems, plus three detector-specific assertions the generic
// eleven rules do not cover (acceptance criterion 19 and the catalog-side
// coverage-transfer guarantee).

/** The three detector-tier stems this task authors. */
const DETECTOR_STEMS = Object.freeze(["codehealth", "repomap", "document"]);

test("the three detector rubrics conform", () => {
  const { errors, matchedRubricFiles } = checkRubricSet({
    tiersPath: DEFAULT_TIERS_PATH,
    rubricRoot: DEFAULT_RUBRIC_ROOT,
    scenarioRoot: DEFAULT_SCENARIO_ROOT,
    onlyStems: [...DETECTOR_STEMS],
  });

  // The stem filter matching zero files would let "errors is empty" pass
  // vacuously — every one of the eleven rules reports clean over an empty
  // set. Pin the filter actually narrowed rubricRoot's real files down to
  // exactly these three before trusting the error-free result.
  assert.equal(
    matchedRubricFiles.length,
    3,
    `onlyStems must narrow rubricRoot to exactly the three detector stems, matched: ${JSON.stringify(matchedRubricFiles)}`,
  );
  assert.deepEqual(errors, []);

  // The count-of-3 above cannot alone distinguish real filtering from a
  // no-op: rubricRoot happens to hold exactly these three files today, so
  // an unfiltered readdirSync would report the same count. Prove the
  // filter narrows by passing a genuine PROPER SUBSET of the real stems
  // and asserting the match count shrinks accordingly — this is red the
  // moment onlyStems degrades to a no-op, independently of how many files
  // rubricRoot happens to hold.
  const { matchedRubricFiles: subsetMatch } = checkRubricSet({
    tiersPath: DEFAULT_TIERS_PATH,
    rubricRoot: DEFAULT_RUBRIC_ROOT,
    scenarioRoot: DEFAULT_SCENARIO_ROOT,
    onlyStems: ["codehealth"],
  });
  assert.deepEqual(
    subsetMatch,
    ["codehealth.yaml"],
    "onlyStems: ['codehealth'] must narrow to exactly one file — proves the filter is real narrowing, not a no-op that happens to report 3",
  );

  const catalogDoc = parseYaml(readFileSync(DEFAULT_CATALOG_PATH, "utf8"));
  const catalogById = new Map();
  const catalogTwinById = new Map();
  for (const list of [catalogDoc.planted_violations, catalogDoc.known_clean]) {
    for (const entry of list) {
      catalogById.set(entry.id, entry);
      catalogTwinById.set(entry.id, entry.twin);
    }
  }

  // Assertion 1: each of the three cites >= 1 skill-regression:PV-nn AND its
  // KC twin (acceptance criterion 19). RUBRIC_TWIN_UNCITED, proven clean
  // above, only proves the negative (no PV cited without its twin) — this
  // proves the positive (some PV actually IS cited) is non-empty, since a
  // rubric citing nothing would also pass that rule vacuously.
  for (const stem of DETECTOR_STEMS) {
    const doc = loadRubric(`${stem}.yaml`, { projectRoot: DEFAULT_RUBRIC_ROOT });
    const citedIds = new Set();
    for (const entry of doc.required_elements ?? []) {
      if (!entry || typeof entry.source !== "string") continue;
      const m = SKILL_REGRESSION_CITATION_RE.exec(entry.source.trim());
      if (m) citedIds.add(m[1]);
    }
    const citedPVs = [...citedIds].filter((id) => id.startsWith("PV-"));
    assert.ok(
      citedPVs.length > 0,
      `rubric "${stem}.yaml" cites no skill-regression:PV-nn — the positive half of acceptance criterion 19`,
    );
    for (const pv of citedPVs) {
      const twin = catalogTwinById.get(pv);
      assert.ok(
        twin && citedIds.has(twin),
        `rubric "${stem}.yaml" cites ${pv} without also citing its catalog twin ${twin ?? "(unresolved)"}`,
      );
    }

    // Assertion 3: each rubric's `skill` appears in each cited entry's
    // `covers_skills`. Confirmed here against the real catalog rather than
    // assumed: PV-03/PV-04 carry "codehealth, repomap", PV-05 carries
    // "codehealth", PV-08 carries "document".
    for (const id of citedIds) {
      const catalogEntry = catalogById.get(id);
      assert.ok(catalogEntry, `rubric "${stem}.yaml" cites ${id}, which resolves to nothing in catalog.yaml`);
      const coveredSkills = splitSlugs(catalogEntry.covers_skills);
      assert.ok(
        coveredSkills.includes(doc.skill),
        `catalog entry ${id} covers_skills (${JSON.stringify(catalogEntry.covers_skills)}) ` +
          `does not list "${doc.skill}", cited by rubric "${stem}.yaml"`,
      );
    }
  }

  // Assertion 2: every cited id resolves in catalog.yaml, guaranteed by the
  // FIXTURE's own CATALOG_UNRESOLVED_CITATION scan (tests/lib/evals/
  // catalog-validator.mjs::validateCatalog), never by an alias this tier
  // mints. Proven by running that scan with its DEFAULT roots and asserting
  // its reported scanned-file list now CONTAINS these three new rubric
  // paths — before this task that list held only skills/eval/default-rubric.yaml.
  const { scannedRubricFiles } = validateCatalog(DEFAULT_CATALOG_PATH);
  for (const stem of DETECTOR_STEMS) {
    const expected = join("tests", "evals", "skill-regression", "rubrics", `${stem}.yaml`);
    assert.ok(
      scannedRubricFiles.includes(expected),
      `expected the catalog's citation scan to have grown to include ${expected}, visited: ${JSON.stringify(scannedRubricFiles)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 17. Task 6 — the four state-writer rubrics conform (deploy, sync, learn, issues)
// ---------------------------------------------------------------------------
//
// No new RUBRIC_* rule here either: these four files are validated by the
// checker Tasks 1-3 already landed, the same as section 16. Unlike the three
// detector rubrics, these four are PRODUCERS — they cite no catalog id at
// all, so this section adds no PV/KC-twin-citation assertion (there is
// nothing to cite). What it does add is the producer-tier's own convention:
// no `skill-regression:` citation anywhere in these four files' raw text,
// checked as a plain predicate over the source text rather than through
// `checkRubricSet` — RUBRIC_TWIN_UNCITED only resolves a PV cited without its
// KC twin, so a producer citing BOTH halves of a pair would sail past it
// clean. That is exactly why this tier needs its own predicate: the shared
// rules do not forbid a producer from citing a catalog id, this convention
// does.

/** The four producer-tier stems this task authors. */
const PRODUCER_STEMS = Object.freeze(["deploy", "sync", "learn", "issues"]);

test("the four state-writer rubrics conform", () => {
  const { errors, matchedRubricFiles } = checkRubricSet({
    tiersPath: DEFAULT_TIERS_PATH,
    rubricRoot: DEFAULT_RUBRIC_ROOT,
    scenarioRoot: DEFAULT_SCENARIO_ROOT,
    onlyStems: [...PRODUCER_STEMS],
  });

  // The stem filter matching zero files would let "errors is empty" pass
  // vacuously — every one of the eleven rules reports clean over an empty
  // set. Pin the filter actually narrowed rubricRoot's real files down to
  // exactly these four before trusting the error-free result.
  assert.equal(
    matchedRubricFiles.length,
    4,
    `onlyStems must narrow rubricRoot to exactly the four producer stems, matched: ${JSON.stringify(matchedRubricFiles)}`,
  );
  assert.deepEqual(errors, []);

  // The count-of-4 above cannot alone distinguish real filtering from a
  // no-op — prove the filter narrows by passing a genuine PROPER SUBSET of
  // the real stems and asserting the match count shrinks accordingly. Same
  // anti-vacuity habit section 16 established for the detector tier.
  const { matchedRubricFiles: subsetMatch } = checkRubricSet({
    tiersPath: DEFAULT_TIERS_PATH,
    rubricRoot: DEFAULT_RUBRIC_ROOT,
    scenarioRoot: DEFAULT_SCENARIO_ROOT,
    onlyStems: ["deploy"],
  });
  assert.deepEqual(
    subsetMatch,
    ["deploy.yaml"],
    "onlyStems: ['deploy'] must narrow to exactly one file — proves the filter is real narrowing, not a no-op that happens to report 4",
  );
});

test("no producer rubric in this tier cites a catalog id", () => {
  // The predicate this convention needs, applied to the raw file text —
  // never through checkRubricSet's element-level source parsing, since the
  // point of this test is that the CONVENTION forbids what the shared rules
  // do not.
  for (const stem of PRODUCER_STEMS) {
    const path = join(DEFAULT_RUBRIC_ROOT, `${stem}.yaml`);
    const yamlText = readFileSync(path, "utf8");
    assert.ok(
      !/skill-regression:/.test(yamlText),
      `rubrics/${stem}.yaml must cite no skill-regression: catalog id anywhere in its raw text — this tier's producers are not detectors`,
    );
  }
});

test("RUBRIC_TWIN_UNCITED stays silent on a producer citing both halves of a PV/KC pair — proving the no-citation rule needs its OWN predicate", () => {
  // Falsification companion, proven now rather than only asserted in the
  // commit body: a producer rubric that cited PV-03 AND its correct twin
  // KC-03 would pass RUBRIC_TWIN_UNCITED cleanly, because that rule only
  // ever complains about a PV cited WITHOUT its twin. The shared rules
  // impose no ban on a producer citing a catalog id at all — that ban is
  // this tier's convention alone, which is exactly what the previous test
  // enforces and this test explains why it has to exist as its own check.
  const tmp = createTempDir();
  try {
    const doc = makeConformingRubric("deploy");
    doc.required_elements[0].source = "skill-regression:PV-03";
    doc.required_elements[1].source = "skill-regression:KC-03";
    const { errors } = runOneRubric(tmp, "deploy", doc);
    assert.deepEqual(
      errors.filter((e) => e.code === "RUBRIC_TWIN_UNCITED"),
      [],
      "RUBRIC_TWIN_UNCITED must stay silent here — both halves of the pair are cited, which is exactly the gap this tier's own no-citation predicate exists to close",
    );

    // Half two of the proof, not merely asserted in the commit body: the
    // SAME synthetic doc's rendered YAML text must fail this tier's own
    // no-citation predicate — the exact check the previous test applies to
    // the four real files. Without this half, the test above only shows
    // the shared rule is silent; it does not show why this tier needs a
    // predicate of its own to catch what the shared rule lets through.
    const yamlText = renderRubricYaml(doc);
    assert.ok(
      /skill-regression:/.test(yamlText),
      "precondition: the rendered doc must actually carry a skill-regression: citation for this half to mean anything",
    );
  } finally {
    cleanupTempDir(tmp);
  }
});

// ---------------------------------------------------------------------------
// 18. Task 6 — the two reference-anchor assertions (sync, issues)
// ---------------------------------------------------------------------------
//
// Per-tier reference anchors are not covered by any of the eleven shared
// rules — a `reference` field is free text as far as `checkRubricSet` is
// concerned. The plan's own heuristic ("an unbacked review convention is not
// acceptable") requires a testable predicate for each of the two anchors
// this task's table names, so both are written here rather than left as
// prose-only review guidance.

test("sync's manifest-mapping-anchored criterion cites the real sync.targets mapping", () => {
  const doc = loadRubric("sync.yaml", { projectRoot: DEFAULT_RUBRIC_ROOT });
  const anchored = (doc.quality_dimensions ?? []).some(
    (c) =>
      typeof c.reference === "string" &&
      /sync\.targets/.test(c.reference) &&
      /CLAUDE\.md/.test(c.reference) &&
      /AGENTS\.md/.test(c.reference),
  );
  assert.ok(
    anchored,
    "sync.yaml must carry at least one quality_dimensions[].reference anchored on the real sync.targets mapping (naming both CLAUDE.md and AGENTS.md), not an invented standard",
  );
});

test("issues' board-granularity-anchored criterion cites the real charter invariant", () => {
  const doc = loadRubric("issues.yaml", { projectRoot: DEFAULT_RUBRIC_ROOT });
  const anchored = (doc.quality_dimensions ?? []).some(
    (c) =>
      typeof c.reference === "string" &&
      /agent-reliable-state-artifacts\/charter\.md/.test(c.reference) &&
      /planRef/.test(c.reference) &&
      /planTask/.test(c.reference),
  );
  assert.ok(
    anchored,
    "issues.yaml must carry at least one quality_dimensions[].reference anchored on the agent-reliable-state-artifacts charter's board-granularity invariant (naming both planRef and planTask), not an invented standard",
  );
});
