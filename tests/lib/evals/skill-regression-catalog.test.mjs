/**
 * Tier A catalog-integrity check for the skill-regression fixture.
 *
 * Spec: .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md
 *
 * This file hosts two things the spec keeps deliberately apart:
 *
 *   1. The thirteen `CATALOG_*` integrity rules — `validateCatalog()`, applied
 *      to the REAL catalog, plus a per-rule `checked` counter so a rule that
 *      quietly stopped running is caught. A rule that iterates an empty
 *      collection reports zero and turns the counter assertion red; without it
 *      "the catalog conforms" is thirteen no-ops. The validator itself lives in
 *      the sibling `catalog-validator.mjs` — a test-support module, NOT a lib
 *      module: the spec's Consumers section states this spec introduces "no new
 *      library module". It was split out to leave room for Task 7's thirteen
 *      rejecting fixtures.
 *   2. Nine assertions the thirteen rules do NOT subsume, each about the
 *      catalog's relationship to a fixture file rather than about the
 *      catalog's own shape.
 *
 * The thirteen REJECTING fixtures — one per rule, proving each rule can also
 * say no — are Task 7's deliverable and deliberately absent here. A rejecting
 * fixture written before the real catalog exists has nothing to be a
 * counterexample to.
 *
 * It lives in tests/lib/evals/ rather than beside the fixture on purpose:
 * `scripts/run-tests.mjs::isEvalFile` routes everything under `tests/evals/`
 * into the opt-in `npm run test:evals` bucket, and the charter requires this
 * check on every PR.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { CATALOG_ERROR_CODES } from "../../../lib/evals/catalog-codes.mjs";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { isContained, lenientRealpath } from "../../../lib/path-safety.mjs";
import { parseYaml } from "../../../lib/profiles/yaml.mjs";

import {
  CATALOG_PATH,
  FIXTURE_DIR,
  STATUS_EVENT_PAIRS,
  TOP_LEVEL_KEYS,
  readEvents,
  readFrontmatterStatus,
  splitSlugs,
  validateCatalog,
  walkFiles,
} from "./catalog-validator.mjs";

// ---------------------------------------------------------------------------
// 1. The code registry
// ---------------------------------------------------------------------------

test("CATALOG_ERROR_CODES holds exactly the thirteen documented codes, frozen", () => {
  assert.ok(Object.isFrozen(CATALOG_ERROR_CODES), "CATALOG_ERROR_CODES must be frozen");
  assert.deepEqual(
    [...CATALOG_ERROR_CODES].sort(),
    [
      "CATALOG_ANCHOR_NOT_UNIQUE",
      "CATALOG_DUPLICATE_ID",
      "CATALOG_MISSING_KEY",
      "CATALOG_NESTED_MAP",
      "CATALOG_PATH_ESCAPE",
      "CATALOG_PATH_MISSING",
      "CATALOG_ROLE_UNKNOWN",
      "CATALOG_STATUS_EVENT_MISMATCH",
      "CATALOG_UNKNOWN_SKILL",
      "CATALOG_UNPAIRED_TWIN",
      "CATALOG_UNRESOLVED_CITATION",
      "CATALOG_UNSAFE_SCALAR",
      "CATALOG_VERDICT_IDS_UNRESOLVED",
    ],
  );
  assert.equal(CATALOG_ERROR_CODES.length, 13);
  assert.equal(new Set(CATALOG_ERROR_CODES).size, 13);
});

// ---------------------------------------------------------------------------
// 2. Shape: exactly five top-level keys, no `version`
// ---------------------------------------------------------------------------

test("catalog.yaml carries exactly the five documented top-level keys", () => {
  const doc = parseYaml(readFileSync(CATALOG_PATH, "utf8"));
  assert.deepEqual(Object.keys(doc).sort(), [...TOP_LEVEL_KEYS].sort());
  // CATALOG_MISSING_KEY catches absence; a sixth key nobody reads is the other
  // half, and the minimal parser will not complain about it. `version`
  // specifically: a revision counter no check reads is write-only state.
  assert.ok(!("version" in doc), "catalog.yaml must not carry a `version` key");
  assert.equal(doc.catalog_id, "skill-regression");
  assert.equal(doc.fixture_root, "project");
});

// ---------------------------------------------------------------------------
// 3. The real catalog conforms — and every rule was reached
// ---------------------------------------------------------------------------

test("the real catalog satisfies all thirteen integrity rules", () => {
  const { errors } = validateCatalog(CATALOG_PATH);
  assert.deepEqual(errors, [], `catalog.yaml violated: ${JSON.stringify(errors, null, 2)}`);
});

test("every one of the thirteen rules actually ran over a non-empty input", () => {
  const { checked } = validateCatalog(CATALOG_PATH);
  for (const code of CATALOG_ERROR_CODES) {
    assert.ok(
      checked[code] > 0,
      `rule ${code} never ran (checked = ${checked[code]}) — a rule that iterates an empty collection reports no errors and proves nothing`,
    );
  }
});

test("the default rubric roots are non-vacuous — the scan reaches skills/eval/default-rubric.yaml", () => {
  // Both real roots are citation-free today, so an implementation defaulting
  // `rubricRoots` to [] would pass every criterion while the growth rule
  // enforced nothing. Assert the EFFECT: the scan reports having visited a real
  // rubric. `tests/evals/skill-regression/rubrics/` does not exist until a tier
  // lands and contributes nothing until then — a green run there is not
  // coverage.
  const { scannedRubricFiles } = validateCatalog(CATALOG_PATH);
  assert.ok(
    scannedRubricFiles.includes(join("skills", "eval", "default-rubric.yaml")),
    `expected the citation scan to visit skills/eval/default-rubric.yaml, visited: ${JSON.stringify(scannedRubricFiles)}`,
  );
});

// ---------------------------------------------------------------------------
// 4. The nine assertions the thirteen rules do not subsume
// ---------------------------------------------------------------------------

/**
 * Every fixture file that exists as of Task 5. Task 6 adds README.md, and
 * extends this list, in the same commit that creates it.
 *
 * The plan's Task 5 says thirty-two, counting the spec's Required Files table
 * minus README.md. The tree holds thirty-three, because Task 4's review round
 * added `project/tests/rates.test.mjs` — the dirty slice was shipping
 * implemented code with no tests, a shape asymmetry a rubric could score
 * instead of the planted defect — and the spec's Required Files table was not
 * extended with it. This list is pinned to the TREE, which is what the
 * both-ways comparison is for; the table is the artifact that is behind.
 */
const REQUIRED_FIXTURE_FILES = Object.freeze([
  "catalog.yaml",
  "project/AGENTS.md",
  "project/CLAUDE.md",
  "project/docs/api.md",
  "project/package.json",
  "project/src/index.mjs",
  "project/src/orders/create-order.mjs",
  "project/src/orders/legacy-loader.js",
  "project/src/orders/orphaned-helper.mjs",
  "project/src/shipping/rates.mjs",
  "project/tests/create-order.test.mjs",
  "project/tests/rates.test.mjs",
  "project/.context-index/adrs/0001-esm-only.md",
  "project/.context-index/constitution.md",
  "project/.context-index/deploy.yaml",
  "project/.context-index/evals/config.yaml",
  "project/.context-index/evals/orders-rubric.yaml",
  "project/.context-index/evals/orders-verdicts.json",
  "project/.context-index/governance/review.yaml",
  "project/.context-index/governance/validate.yaml",
  "project/.context-index/lifecycle-state/create-order.jsonl",
  "project/.context-index/lifecycle-state/shipping-rates.jsonl",
  "project/.context-index/manifest.yaml",
  "project/.context-index/memory/heuristics/orders.md",
  "project/.context-index/platform-context.yaml",
  "project/.context-index/samples/order-pipeline-create-order.md",
  "project/.context-index/specs/features/orders/charter.md",
  "project/.context-index/specs/features/orders/create-order.plan.md",
  "project/.context-index/specs/features/orders/create-order.spec.md",
  "project/.context-index/specs/features/orders/shipping-rates.plan.md",
  "project/.context-index/specs/features/orders/shipping-rates.spec.md",
  "project/.context-index/specs/product.md",
  "project/.context-index/tasks/tasks.json",
]);

test("Required Files is enumerated both ways — every pinned path exists and the tree holds nothing else", () => {
  // CATALOG_PATH_MISSING only covers paths the catalog happens to cite, and
  // nothing obliges `scaffolding` to enumerate the whole tree. The both-ways
  // comparison is what catches a file added to the fixture and registered
  // nowhere — which is exactly how `project/tests/rates.test.mjs` reached the
  // tree without reaching the spec's Required Files table.
  const onDisk = walkFiles(FIXTURE_DIR).sort();
  assert.deepEqual(onDisk, [...REQUIRED_FIXTURE_FILES].sort());
  assert.equal(REQUIRED_FIXTURE_FILES.length, 33, "README.md is Task 6's file and makes it 34");
  assert.ok(!REQUIRED_FIXTURE_FILES.includes("README.md"));
});

test("catalog.yaml sits outside fixture_root", () => {
  // Trivially true today and trivially breakable by a reorganisation that moves
  // the catalog inside the tree it describes, at which point every entry path
  // silently gains a level. (README.md's half lands in Task 6.)
  const doc = parseYaml(readFileSync(CATALOG_PATH, "utf8"));
  const fixtureRootReal = lenientRealpath(join(FIXTURE_DIR, doc.fixture_root));
  assert.ok(!isContained(lenientRealpath(CATALOG_PATH), fixtureRootReal));
});

test("the fixture's evals/config.yaml names orders-rubric.yaml, and that rubric loads through loadRubric", () => {
  const projectRoot = join(FIXTURE_DIR, "project");
  const config = parseYaml(readFileSync(join(projectRoot, ".context-index", "evals", "config.yaml"), "utf8"));
  // skills/eval/SKILL.md resolves the project rubric ONLY through this key.
  assert.equal(config.rubric, ".context-index/evals/orders-rubric.yaml");

  // "The file exists" is not the property that matters: /adev:eval refuses a
  // non-conforming rubric, so a tier scenario would fail for a reason that has
  // nothing to do with the skill under test.
  const rubric = loadRubric(config.rubric, { projectRoot });
  assert.equal(rubric.rubric_id, "orders-service-project");
});

test("the tasks/tasks.json scaffolding entry carries role: issue-board specifically", () => {
  // CATALOG_ROLE_UNKNOWN is satisfied identically by any enum member, so
  // without this a `role: manifest` typo passes every rule while making the
  // spec's issue-board prose silently false.
  const doc = parseYaml(readFileSync(CATALOG_PATH, "utf8"));
  const board = doc.scaffolding.find((e) => e.path === ".context-index/tasks/tasks.json");
  assert.ok(board, "no scaffolding entry for the issue board");
  assert.equal(board.role, "issue-board");
});

test("the four covers_skills content pins hold", () => {
  const doc = parseYaml(readFileSync(CATALOG_PATH, "utf8"));
  const pairs = [...doc.planted_violations, ...doc.known_clean];
  const skillsFor = (klass) =>
    new Set(pairs.filter((e) => e.class === klass).flatMap((e) => splitSlugs(e.covers_skills)));
  const everySlug = new Set(pairs.flatMap((e) => splitSlugs(e.covers_skills)));

  // The two absence pins below are vacuous over an empty set — a rename of
  // `covers_skills`, or a catalog that stopped carrying PV/KC pairs, would keep
  // them green while checking nothing.
  assert.ok(everySlug.size > 0, "no covers_skills slugs were collected — the absence pins below would be vacuous");

  // `assess` scans a codebase but its dimensions are presence-based: none opens
  // an issue board and none diffs a spec against its source, so listing it
  // would ship a rubric citing pairs the skill cannot resolve.
  assert.ok(!everySlug.has("assess"), "assess must appear in no class's covers_skills");
  // `issues` MANAGES work items rather than auditing them — a producer.
  assert.ok(!everySlug.has("issues"), "issues must appear in no class's covers_skills");
  // The change-imminent tier's detector/producer split puts repomap on dead-export.
  assert.ok(skillsFor("dead-export").has("repomap"));
  // The core-lifecycle tier owns `brainstorm` and classes it a producer that
  // nonetheless cites this class.
  assert.ok(skillsFor("charter-scope-escape").has("brainstorm"));
});

test("orphan-source-file's covers_skills is exactly codehealth, repomap — hygiene deliberately absent", () => {
  // Do NOT "improve" this by adding `hygiene`. The core-lifecycle tier adds it
  // as its own task and proves RUBRIC_COVERS_SKILLS_UNLISTED red-then-green
  // across that edit; pre-extending it here makes that proof unreachable.
  const doc = parseYaml(readFileSync(CATALOG_PATH, "utf8"));
  let matched = 0;
  for (const entry of [...doc.planted_violations, ...doc.known_clean]) {
    if (entry.class !== "orphan-source-file") continue;
    matched += 1;
    assert.deepEqual(splitSlugs(entry.covers_skills), ["codehealth", "repomap"], entry.id);
    assert.ok(!splitSlugs(entry.covers_skills).includes("hygiene"), `${entry.id} must not list hygiene yet`);
  }
  // Same reason the `checked` counters exist: a class-slug rename empties the
  // loop, and a pin that iterates nothing stops checking without going red.
  // One PV and its KC twin.
  assert.equal(matched, 2, "no orphan-source-file pair was matched — the pin above checked nothing");
});

test("the two lifecycle chains have the shapes /adev:work routes on", () => {
  // Asserted through CATALOG_STATUS_EVENT_MISMATCH so "consistent" is a
  // predicate rather than a word...
  const { errors, checked } = validateCatalog(CATALOG_PATH);
  assert.equal(checked.CATALOG_STATUS_EVENT_MISMATCH, STATUS_EVENT_PAIRS.length);
  assert.deepEqual(errors.filter((e) => e.code === "CATALOG_STATUS_EVENT_MISMATCH"), []);

  // ...and directly on the derived shapes, because the predicate above is
  // keyed on whatever status the frontmatter declares.
  const projectRoot = join(FIXTURE_DIR, "project");
  const shipping = readEvents(join(projectRoot, ".context-index/lifecycle-state/shipping-rates.jsonl"));
  const shippingSteps = new Set(shipping.map((e) => e.step).filter(Boolean));
  assert.ok(shipping.some((e) => e.event === "step_completed" && e.step === "specify"));
  assert.ok(!shippingSteps.has("review"), "a review step would make the spec look reviewed");
  // The absent `plan` step is load-bearing: skills/work/SKILL.md's resume
  // override routes to /adev:implement whenever it finds an incomplete plan,
  // and shipping-rates.plan.md IS on disk, so a stray plan event would invert
  // the core tier's routing assertion with every other check still green.
  assert.ok(!shippingSteps.has("plan"), "a plan step would fire work's resume override");
  assert.ok(!shipping.some((e) => e.event === "plan_task"));

  const clean = readEvents(join(projectRoot, ".context-index/lifecycle-state/create-order.jsonl"));
  const completed = new Set(clean.filter((e) => e.event === "step_completed").map((e) => e.step));
  assert.deepEqual(
    ["specify", "review", "plan", "implement", "validate"].filter((s) => !completed.has(s)),
    [],
  );
});

test("the two slices' status: values are pinned directly on the frontmatter", () => {
  // Not via CATALOG_STATUS_EVENT_MISMATCH, which compares frontmatter to the
  // event chain and would pass on a pair that agreed with each other at the
  // WRONG value. `work` must route shipping-rates to /adev:review-specs and not
  // to /adev:plan; a `validated` there silently inverts that assertion.
  const specs = join(FIXTURE_DIR, "project", ".context-index", "specs", "features", "orders");
  assert.equal(readFrontmatterStatus(join(specs, "shipping-rates.spec.md")), "review-pending");
  assert.equal(readFrontmatterStatus(join(specs, "create-order.spec.md")), "validated");
});
