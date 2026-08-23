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
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import test from "node:test";

import { CATALOG_ERROR_CODES } from "../../../lib/evals/catalog-codes.mjs";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { isContained, lenientRealpath } from "../../../lib/path-safety.mjs";
import { parseYaml } from "../../../lib/profiles/yaml.mjs";
import { cleanupTempDir, createTempDir } from "../../helpers.mjs";

import {
  CATALOG_PATH,
  FIXTURE_DIR,
  REPO_ROOT,
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
  // Task 7 extends this rather than duplicating it: the rejecting fixture for
  // CATALOG_UNRESOLVED_CITATION passes an explicit `rubricRoots`, so the DEFAULT
  // root set is proved non-vacuous only here. Non-empty first — a scan that
  // reached nothing is the failure mode, and `includes` on [] is the same
  // silence as `includes` on the wrong file.
  assert.ok(
    scannedRubricFiles.length > 0,
    "the default rubric roots expanded to no files at all — the growth rule enforces nothing",
  );
  assert.ok(
    scannedRubricFiles.includes(join("skills", "eval", "default-rubric.yaml")),
    `expected the citation scan to visit skills/eval/default-rubric.yaml, visited: ${JSON.stringify(scannedRubricFiles)}`,
  );
});

// ---------------------------------------------------------------------------
// 4. The nine assertions the thirteen rules do not subsume
// ---------------------------------------------------------------------------

/**
 * Every fixture file in the committed tree. Task 6 added `README.md` and
 * extended this list in the same commit that created it.
 *
 * The plan's Task 5 says thirty-two, counting the spec's Required Files table
 * minus README.md. With Task 6's README the tree holds thirty-four, because
 * Task 4's review round
 * added `project/tests/rates.test.mjs` — the dirty slice was shipping
 * implemented code with no tests, a shape asymmetry a rubric could score
 * instead of the planted defect — and the spec's Required Files table was not
 * extended with it. This list is pinned to the TREE, which is what the
 * both-ways comparison is for; the table is the artifact that is behind.
 */
const REQUIRED_FIXTURE_FILES = Object.freeze([
  "README.md",
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
  assert.equal(REQUIRED_FIXTURE_FILES.length, 34, "Task 6's README.md took the count from 33 to 34");
  assert.ok(REQUIRED_FIXTURE_FILES.includes("README.md"), "Task 6's README.md must be registered here");
});

test("catalog.yaml sits outside fixture_root", () => {
  // Trivially true today and trivially breakable by a reorganisation that moves
  // the catalog inside the tree it describes, at which point every entry path
  // silently gains a level. (README.md's half is the next test.)
  const doc = parseYaml(readFileSync(CATALOG_PATH, "utf8"));
  const fixtureRootReal = lenientRealpath(join(FIXTURE_DIR, doc.fixture_root));
  assert.ok(!isContained(lenientRealpath(CATALOG_PATH), fixtureRootReal));
});

/**
 * The README's growth rule, pinned verbatim.
 *
 * A rule stated only in prose holds until the next author disagrees with it.
 * Pinning the sentence makes a reword a deliberate test change rather than a
 * silent repeal — the README says so about itself, so the pin is not a
 * surprise to whoever edits it.
 */
const README_GROWTH_RULE =
  "Pair or do not add: every entry added to `planted_violations` ships with its known-clean twin in `known_clean`, because a planted violation without a known-clean twin is a sensitivity assertion with no specificity control.";

test("the README states the growth rule, and the catalog obeys it", () => {
  // Two failures, in one test because neither half means anything alone: the
  // prose without the count is unenforced, the count without the prose is
  // unexplained.
  const readmePath = join(FIXTURE_DIR, "README.md");
  assert.ok(existsSync(readmePath), `expected ${readmePath} to exist`);
  const readme = readFileSync(readmePath, "utf8");
  assert.ok(
    readme.includes(README_GROWTH_RULE),
    "the README no longer states the growth rule verbatim — a reword here is a test change",
  );

  const doc = parseYaml(readFileSync(CATALOG_PATH, "utf8"));
  // Non-vacuity: two empty lists are equal in length and pair nothing.
  assert.ok(doc.planted_violations.length > 0, "no planted_violations — the pairing check would be vacuous");
  assert.equal(
    doc.planted_violations.length,
    doc.known_clean.length,
    "the growth rule is violated: every planted violation needs a known-clean twin",
  );
});

test("README.md sits outside fixture_root", () => {
  // The other half of the criterion the previous test's neighbour covers for
  // `catalog.yaml`. A README moved inside `project/` becomes content the
  // fixture's own skills read as the mini-project's, and every catalog entry
  // path silently gains a level.
  const doc = parseYaml(readFileSync(CATALOG_PATH, "utf8"));
  const fixtureRootReal = lenientRealpath(join(FIXTURE_DIR, doc.fixture_root));
  const readmePath = join(FIXTURE_DIR, "README.md");
  assert.ok(existsSync(readmePath), `expected ${readmePath} to exist`);
  assert.ok(!isContained(lenientRealpath(readmePath), fixtureRootReal));
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

// ---------------------------------------------------------------------------
// 5. The thirteen rejecting fixtures — proving each rule can also say no
// ---------------------------------------------------------------------------
//
// Section 3 proved the real catalog is ACCEPTED by all thirteen rules and that
// every rule was reached. A validator that only ever sees a conforming input is
// untested: the accepting half cannot distinguish a guard from a branch that
// can never fire. Each fixture below differs from a conforming baseline in
// EXACTLY ONE way and must be refused with its own code AND NO OTHER — a
// rejecting fixture that trips two rules does not prove the rule it names.
//
// The baseline is the real catalog re-serialised into a temp directory beside a
// copy of the real fixture tree, so "exactly one way" is a mutation of a parsed
// document rather than a hand-written near-miss that drifts from the real one.

/** The real catalog, parsed once; every fixture starts from a clone of it. */
const REAL_DOC = parseYaml(readFileSync(CATALOG_PATH, "utf8"));

const isRaw = (v) => v !== null && typeof v === "object" && Object.hasOwn(v, "raw");
const isBlock = (v) => v !== null && typeof v === "object" && Object.hasOwn(v, "block");

/**
 * Emit one scalar the way the real catalog does. `lib/profiles/yaml.mjs`'s
 * `unquote` strips outer quotes without interpreting escapes, so a value
 * carrying `"` is single-quoted rather than backslash-escaped — exactly what
 * the real catalog does for anchors like `'"ajv": "^8.17.1"'`. A `{raw}` value
 * is emitted verbatim, which is how the coercion fixtures put an UNQUOTED
 * `42` / `true` / `null` on the wire.
 */
function emitScalar(value) {
  if (isRaw(value)) return value.raw;
  const s = String(value);
  if (!s.includes('"')) return `"${s}"`;
  if (!s.includes("'")) return `'${s}'`;
  throw new Error(`cannot emit a scalar carrying both quote characters: ${s}`);
}

function serializeCatalog(doc) {
  const out = [];
  for (const [key, value] of Object.entries(doc)) {
    if (isBlock(value)) {
      out.push(`${key}:`, ...value.block);
      continue;
    }
    if (isRaw(value)) {
      out.push(`${key}: ${value.raw}`);
      continue;
    }
    if (Array.isArray(value)) {
      out.push(`${key}:`);
      for (const item of value) {
        if (isRaw(item)) {
          out.push(`  - ${item.raw}`);
          continue;
        }
        Object.entries(item).forEach(([k, v], i) =>
          out.push(`${i === 0 ? "  - " : "    "}${k}: ${emitScalar(v)}`),
        );
      }
      continue;
    }
    out.push(`${key}: ${emitScalar(value)}`);
  }
  return `${out.join("\n")}\n`;
}

/** A rubric-root glob for a directory outside the repo, as `expandRubricRoot` takes it. */
function rubricRootGlob(dir) {
  return `${relative(REPO_ROOT, dir).split(sep).join("/")}/*.yaml`;
}

/**
 * Build a synthetic catalog in a temp dir — a copy of the real fixture tree
 * under `project/`, plus a `catalog.yaml` carrying `mutate`'s single edit — and
 * hand it to `run`. `treeMutate` is for the rules whose input is a fixture FILE
 * rather than a catalog field.
 */
function withSyntheticCatalog({ mutate, treeMutate }, run) {
  const base = createTempDir();
  try {
    cpSync(join(FIXTURE_DIR, "project"), join(base, "project"), { recursive: true });
    if (treeMutate) treeMutate(base);
    const doc = structuredClone(REAL_DOC);
    if (mutate) mutate(doc, base);
    const catalogPath = join(base, "catalog.yaml");
    writeFileSync(catalogPath, serializeCatalog(doc));
    return run(catalogPath, base);
  } finally {
    cleanupTempDir(base);
  }
}

/** Distinct codes a mutated catalog is refused with, plus the raw errors for the message. */
function codesFor(fixture) {
  return withSyntheticCatalog(fixture, (catalogPath, base) => {
    const options = fixture.validateOptions ? fixture.validateOptions(base) : {};
    const { errors } = validateCatalog(catalogPath, options);
    return { codes: [...new Set(errors.map((e) => e.code))].sort(), errors };
  });
}

/**
 * The thirteen. Several rules carry more than one entry because their
 * "rejected when" clause is a disjunction — `CATALOG_UNSAFE_SCALAR` most of
 * all, whose sub-conditions are separately breakable and therefore separately
 * proved. Every entry is isolating: one code, nothing else.
 *
 * Where a fixture targets a field, it targets the one whose corruption has no
 * downstream: `scaffolding[0]` carries no twin and its `id` feeds no other
 * rule, so a coerced id reports UNSAFE_SCALAR alone, whereas coercing a
 * `planted_violations` id would strand its twin and report UNPAIRED_TWIN too.
 */
const REJECTING_FIXTURES = [
  {
    code: "CATALOG_NESTED_MAP",
    label: "a top-level value that loads as a map",
    mutate: (doc) => {
      doc.notes = { block: ['  kind: "map"'] };
    },
  },
  {
    code: "CATALOG_NESTED_MAP",
    label: "a declared collection that is not a list of maps",
    // `scaffolding`, not `planted_violations`: a discarded PV collection also
    // strands ten twins, and a fixture that trips two rules proves neither.
    mutate: (doc) => {
      doc.scaffolding = { raw: '"oops"' };
    },
  },
  {
    code: "CATALOG_NESTED_MAP",
    label: "a scalar list item inside a collection",
    mutate: (doc) => {
      doc.planted_violations.push({ raw: '"oops"' });
    },
  },
  {
    code: "CATALOG_MISSING_KEY",
    label: "a top-level key is absent",
    mutate: (doc) => {
      delete doc.scaffolding;
    },
  },
  {
    code: "CATALOG_MISSING_KEY",
    label: "an entry field is absent",
    mutate: (doc) => {
      delete doc.planted_violations[0].detect_when;
    },
  },
  {
    code: "CATALOG_DUPLICATE_ID",
    label: "two entries share an id",
    mutate: (doc) => {
      doc.scaffolding[1].id = doc.scaffolding[0].id;
    },
  },
  {
    code: "CATALOG_UNPAIRED_TWIN",
    label: "a PV names a KC that does not name it back",
    mutate: (doc) => {
      doc.planted_violations[0].twin = "KC-99";
    },
  },
  {
    code: "CATALOG_UNPAIRED_TWIN",
    label: "twins carry different class values",
    mutate: (doc) => {
      doc.planted_violations[0].class = "dead-export";
    },
  },
  {
    code: "CATALOG_PATH_ESCAPE",
    label: "an entry path resolves outside fixture_root",
    mutate: (doc) => {
      doc.planted_violations[0].path = "../../../../etc/definitely-not-here";
    },
  },
  {
    code: "CATALOG_PATH_MISSING",
    label: "an entry path does not exist on disk",
    mutate: (doc) => {
      doc.planted_violations[0].path = "src/orders/never-written.mjs";
    },
  },
  {
    code: "CATALOG_UNSAFE_SCALAR",
    label: "a bare digit string reparses as a number",
    mutate: (doc) => {
      doc.scaffolding[0].id = { raw: "42" };
    },
  },
  {
    code: "CATALOG_UNSAFE_SCALAR",
    label: "true reparses as a boolean",
    mutate: (doc) => {
      doc.scaffolding[0].id = { raw: "true" };
    },
  },
  {
    code: "CATALOG_UNSAFE_SCALAR",
    label: "false reparses as a boolean",
    mutate: (doc) => {
      doc.scaffolding[0].id = { raw: "false" };
    },
  },
  {
    code: "CATALOG_UNSAFE_SCALAR",
    label: "null reparses as null",
    mutate: (doc) => {
      doc.scaffolding[0].id = { raw: "null" };
    },
  },
  {
    code: "CATALOG_UNSAFE_SCALAR",
    label: "an empty string",
    mutate: (doc) => {
      doc.scaffolding[0].id = "";
    },
  },
  {
    code: "CATALOG_UNSAFE_SCALAR",
    label: "a structural field carrying a flow indicator",
    mutate: (doc) => {
      doc.scaffolding[0].id = "SC-{01}";
    },
  },
  {
    code: "CATALOG_UNSAFE_SCALAR",
    label: "a structural field carrying colon-space",
    mutate: (doc) => {
      doc.scaffolding[0].id = "SC: 01";
    },
  },
  {
    code: "CATALOG_UNSAFE_SCALAR",
    label: "a read_by component failing the slug pattern",
    mutate: (doc) => {
      doc.scaffolding[0].read_by = "sync, Validate";
    },
  },
  {
    code: "CATALOG_UNSAFE_SCALAR",
    label: "catalog_id failing the slug pattern",
    mutate: (doc) => {
      doc.catalog_id = "Skill-Regression";
    },
  },
  {
    code: "CATALOG_UNSAFE_SCALAR",
    label: "fixture_root that is not exactly project",
    // The tree gains a `projects` symlink so the containment base still
    // resolves: without it every entry path would also report PATH_MISSING and
    // the fixture would stop isolating the rule it names.
    treeMutate: (base) => {
      symlinkSync(join(base, "project"), join(base, "projects"), "dir");
    },
    mutate: (doc) => {
      doc.fixture_root = "projects";
    },
  },
  {
    code: "CATALOG_STATUS_EVENT_MISMATCH",
    label: "a lifecycle log carrying a step the declared status forbids",
    treeMutate: (base) => {
      appendFileSync(
        join(base, "project", ".context-index", "lifecycle-state", "shipping-rates.jsonl"),
        `${JSON.stringify({ event: "step_completed", step: "review", at: "2026-08-20T00:00:00Z" })}\n`,
      );
    },
  },
  {
    code: "CATALOG_ROLE_UNKNOWN",
    label: "a scaffolding role outside the enum",
    mutate: (doc) => {
      doc.scaffolding[0].role = "constitition";
    },
  },
  {
    code: "CATALOG_ANCHOR_NOT_UNIQUE",
    label: "an anchor that occurs zero times",
    mutate: (doc) => {
      doc.planted_violations[0].anchor = "no anchor in this file reads like this";
    },
  },
  {
    code: "CATALOG_ANCHOR_NOT_UNIQUE",
    label: "an anchor that occurs twice",
    treeMutate: (base) => {
      appendFileSync(
        join(base, "project", ".context-index", "specs", "features", "orders", "shipping-rates.spec.md"),
        `\n${REAL_DOC.planted_violations[0].anchor}\n`,
      );
    },
  },
  {
    code: "CATALOG_VERDICT_IDS_UNRESOLVED",
    label: "a verdict id absent from orders-rubric.yaml",
    treeMutate: (base) => {
      const verdictsPath = join(base, "project", ".context-index", "evals", "orders-verdicts.json");
      const verdicts = JSON.parse(readFileSync(verdictsPath, "utf8"));
      verdicts[0].id = "V-does-not-exist";
      writeFileSync(verdictsPath, JSON.stringify(verdicts, null, 2));
    },
  },
  {
    code: "CATALOG_VERDICT_IDS_UNRESOLVED",
    label: "orders-verdicts.json fails to parse",
    treeMutate: (base) => {
      writeFileSync(join(base, "project", ".context-index", "evals", "orders-verdicts.json"), "{ not json");
    },
  },
  {
    code: "CATALOG_UNKNOWN_SKILL",
    label: "a read_by slug naming no skill under skills/",
    mutate: (doc) => {
      doc.scaffolding[0].read_by = "sync, not-a-real-skill";
    },
  },
  {
    code: "CATALOG_UNRESOLVED_CITATION",
    label: "a rubric citing a catalog id that does not exist",
    // The reason `rubricRoots` is a PARAMETER and not a constant: neither real
    // root can host a rubric carrying a dangling citation, so the case points
    // the scan at a temp root it writes. `repoRoot` stays the real repo so
    // CATALOG_UNKNOWN_SKILL still resolves against the real `skills/`.
    treeMutate: (base) => {
      mkdirSync(join(base, "rubrics"), { recursive: true });
      writeFileSync(
        join(base, "rubrics", "dangling.yaml"),
        'rubric_id: "dangling-citation-probe"\nsource: "skill-regression:PV-does-not-exist"\n',
      );
    },
    validateOptions: (base) => ({ rubricRoots: [rubricRootGlob(join(base, "rubrics"))] }),
  },
];

test("the synthetic baseline is itself conforming — every mutation below is the ONLY difference", () => {
  // Without this the rejecting fixtures could be green because the baseline is
  // broken in the same way, and "exactly one code" would be an accident.
  const { codes, errors } = codesFor({});
  assert.deepEqual(codes, [], `the unmutated synthetic baseline was refused: ${JSON.stringify(errors, null, 2)}`);
});

test("the synthetic baseline round-trips through the minimal reader unchanged", () => {
  // The serialiser is test-owned; if it lost a field the fixtures would be
  // mutating a document that is not the real catalog.
  assert.deepEqual(parseYaml(serializeCatalog(structuredClone(REAL_DOC))), REAL_DOC);
});

test("the rejecting fixtures cover all thirteen codes", () => {
  assert.deepEqual(
    [...new Set(REJECTING_FIXTURES.map((f) => f.code))].sort(),
    [...CATALOG_ERROR_CODES].sort(),
  );
});

for (const fixture of REJECTING_FIXTURES) {
  test(`rejecting fixture: ${fixture.label} → ${fixture.code}`, () => {
    const { codes, errors } = codesFor(fixture);
    assert.deepEqual(
      codes,
      [fixture.code],
      `expected exactly ${fixture.code}; a fixture that trips two rules proves neither. Got: ${JSON.stringify(errors, null, 2)}`,
    );
  });
}

// --- The two containment cases a one-field mutation cannot express ----------

test("containment ordering: an escaping path is an escape, not a miss, when the target does not exist", () => {
  // `assertContained` (lib/extensions/exec-payload.mjs:158) decides escape
  // LEXICALLY, ahead of any filesystem access, precisely so that
  // `../../../etc/passwd` on a machine lacking that file reports as an escape
  // rather than as merely missing. Reversing the two would make the escape
  // verdict depend on what happens to exist on the running machine.
  const escaping = "../../../../etc/definitely-not-here";
  withSyntheticCatalog(
    {
      mutate: (doc) => {
        doc.planted_violations[0].path = escaping;
      },
    },
    (catalogPath, base) => {
      assert.ok(
        !existsSync(resolve(join(base, "project"), escaping)),
        "precondition: the escape target must NOT exist, or the ordering is untested",
      );
      const { errors } = validateCatalog(catalogPath);
      assert.deepEqual(errors.map((e) => e.code), ["CATALOG_PATH_ESCAPE"]);
      assert.match(errors[0].detail, /escapes fixture_root/);
    },
  );
});

test("containment: a symlinked fixture_root is realpathed on BOTH sides, so an in-base path is not an escape", () => {
  // The failure a raw `startsWith` produces: the declared base is the link, the
  // resolved child is the target, and every legitimate path reads as an escape.
  // macOS makes this the default case rather than an exotic one — `/var`
  // resolves to `/private/var` and temp directories land there.
  const target = createTempDir();
  const viaLink = createTempDir();
  try {
    cpSync(join(FIXTURE_DIR, "project"), join(target, "project"), { recursive: true });
    symlinkSync(join(target, "project"), join(viaLink, "project"), "dir");
    const catalogPath = join(viaLink, "catalog.yaml");
    writeFileSync(catalogPath, serializeCatalog(structuredClone(REAL_DOC)));

    const declaredBase = join(viaLink, "project");
    assert.notEqual(
      lenientRealpath(declaredBase),
      declaredBase,
      "precondition: the base must actually be a symlink",
    );
    assert.ok(
      !lenientRealpath(join(declaredBase, "src", "index.mjs")).startsWith(declaredBase + sep),
      "precondition: a raw startsWith against the DECLARED base must fail here, or the case proves nothing",
    );

    const { errors } = validateCatalog(catalogPath);
    assert.deepEqual(
      errors,
      [],
      `a symlinked fixture_root must not read as an escape: ${JSON.stringify(errors, null, 2)}`,
    );
  } finally {
    cleanupTempDir(viaLink);
    cleanupTempDir(target);
  }
});
