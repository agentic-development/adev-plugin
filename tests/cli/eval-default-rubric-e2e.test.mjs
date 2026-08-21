// tests/cli/eval-default-rubric-e2e.test.mjs
//
// End-to-end regression for the shipped default rubric, composing Task 1
// (the verb bounds `--rubric default` by the PLUGIN root, not the project
// root) and Task 2 (skills/eval/SKILL.md passes the bare keyword `default`,
// not an `<ADEV_ROOT>`-resolved path).
//
// WHY THIS FILE EXISTS. The defect it closes survived 7270 tests and five
// spec review rounds because in THIS repository the plugin root and the
// project root are the same directory: a test written naturally here cannot
// tell "resolved against the plugin root" apart from "resolved against the
// project root". So this file deliberately does four things a natural test
// would not:
//
//   1. It runs the real `dispatch()` -> VERB_REGISTRY wiring by SPAWNING
//      cli/index.mjs, so `projectRoot` is derived from the child's cwd
//      exactly as it is in production. It never imports `cmdScore` and hands
//      it a root — that would assert the argument, not how the root is got.
//   2. It builds the plugin root and the project root as SIBLING temp
//      directories, so neither contains the other. This is the one property
//      the repository's own layout cannot supply.
//   3. It EXTRACTS the `--rubric` argument from the real SKILL.md Step 3
//      invocation and feeds that extracted value to the spawn, rather than
//      hardcoding `default`. A test that hardcodes the keyword stays green
//      while the real caller still sends a resolved path.
//   4. It passes a DECOY `CLAUDE_PLUGIN_ROOT` holding a valid-but-different
//      rubric, and asserts positively that the shipped ids came back and the
//      decoy's did not. Exit 0 alone would pass if the env var were read and
//      happened to point somewhere readable.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";
import { loadRubric } from "../../lib/evals/rubric.mjs";

/**
 * Entries of the repository the CLI entrypoint needs in order to boot:
 * `cli/` (the entrypoint and dispatcher), `lib/` (every verb module, and
 * `lib/profiles/index.mjs` whose own location IS `getPluginRoot()`),
 * `providers/` (imported by lib/provider/registry.mjs at load) and
 * `.claude-plugin/` (read by providers/claude-code/adapter.mjs at load).
 * The whole repo is deliberately NOT copied: it is slow, and it would drag
 * in `.context-index/`, changing what the verb sees.
 */
const RUNTIME_ENTRIES = Object.freeze(["cli", "lib", "providers", ".claude-plugin"]);

/** Relative path of the shipped rubric inside a plugin root. */
const SHIPPED_RUBRIC_REL = join("skills", "eval", "default-rubric.yaml");

/** Relative path the verdict set takes inside the temp project root. */
const VERDICTS_REL = "verdicts.json";

/**
 * Every id the shipped rubric declares — six deterministic
 * `required_elements` then five judged `quality_dimensions`. The verdict
 * fixture covers all eleven, so a successful score prints all eleven rows.
 */
const SHIPPED_IDS = Object.freeze([
  "spec_criteria_referenced",
  "tests_accompany_source",
  "no_debug_residue",
  "no_disabled_tests_added",
  "error_paths_asserted",
  "exported_symbols_documented",
  "readability_naming",
  "separation_of_concerns",
  "spec_intent_fidelity",
  "idiomatic_conformance",
  "error_handling_placement",
]);

/**
 * Every row the shipped rubric produces for the fixture verdict set, as
 * `[id, kind, verdict]`. The KIND is the load-bearing column: it is decided
 * by which of the two lists the rubric declares an id in, so a table whose
 * kinds match the shipped assignment could only have come from the shipped
 * file. Verified against a real run, not hand-derived.
 */
const SHIPPED_ROWS = Object.freeze([
  ["spec_criteria_referenced", "element", "met"],
  ["tests_accompany_source", "element", "met"],
  ["no_debug_residue", "element", "met"],
  ["no_disabled_tests_added", "element", "met"],
  ["error_paths_asserted", "element", "met"],
  ["exported_symbols_documented", "element", "met"],
  ["readability_naming", "criterion", "met"],
  ["separation_of_concerns", "criterion", "not_met"],
  ["spec_intent_fidelity", "criterion", "met"],
  ["idiomatic_conformance", "criterion", "met"],
  ["error_handling_placement", "criterion", "met"],
]);

/**
 * The shipped rubric's aggregate line, to the digit. Its budgets (10 and 15)
 * come from the shipped file's `required_element_points` and
 * `judged_criterion_points`, and its numerators from the fixture's six met
 * elements and four-of-five met criteria.
 */
const SHIPPED_AGGREGATE = /^deterministic: 10\/10\s+judged: 12\/15\s+total: 22\/25$/m;

/** Decoy 1's `rubric_id` and its ids — disjoint from `SHIPPED_IDS`. */
const DECOY_RUBRIC_ID = "decoy-rubric-never-loaded";
const DECOY_IDS = Object.freeze([
  "decoy_element_alpha",
  "decoy_element_beta",
  "decoy_criterion_omega",
]);

/** Decoy 2's `rubric_id`. Its ids are EXACTLY `SHIPPED_IDS`. */
const DECOY2_RUBRIC_ID = "decoy-rubric-same-ids";

/**
 * The two ids decoy 2 declares in the OTHER list than the shipped rubric
 * does, as `[id, decoyKind]`. `met` is a legal verdict for both kinds, so
 * the fixture verdict set scores cleanly against either assignment — which
 * is what lets decoy 2 reach exit 0 and put its own kinds in the table.
 */
const DECOY2_FLIPPED_ROWS = Object.freeze([
  ["error_paths_asserted", "criterion", "met"],
  ["readability_naming", "element", "met"],
]);

/**
 * Decoy 2's aggregate line, to the digit: budgets 15/10 rather than the
 * shipped 10/15, over six met elements and four-of-five met criteria.
 * Asserted ABSENT.
 */
const DECOY2_AGGREGATE = /deterministic: 15\/15\s+judged: 8\/10\s+total: 23\/25/;

/**
 * A rubric that is VALID — same twelve required top-level keys, flat values
 * only, complete entry fields, no pinned verdicts, budgets summing to
 * `layer3_max_points` — but carries a different `rubric_id` and an id set
 * disjoint from the shipped rubric's. Validity is load-bearing: a decoy that
 * would fail to load makes the "shipped ids present" assertion weaker,
 * because its absence could be explained by rejection rather than by the env
 * var never being consulted. `assertDecoyIsLoadable` proves it.
 */
const DECOY_RUBRIC_YAML = `rubric_id: "${DECOY_RUBRIC_ID}"
version: 1
layer: 3
verdict_values: "met | not_met | unknown (judged criteria) | not_applicable (deterministic elements)"

required_elements:
  - id: ${DECOY_IDS[0]}
    description: "A decoy deterministic element that must never reach a report"
    source: "the decoy plugin root planted at CLAUDE_PLUGIN_ROOT"
    met_when: "never — this rubric exists only to be absent from the output"

  - id: ${DECOY_IDS[1]}
    description: "A second decoy deterministic element"
    source: "the decoy plugin root planted at CLAUDE_PLUGIN_ROOT"
    met_when: "never — this rubric exists only to be absent from the output"

quality_dimensions:
  - id: ${DECOY_IDS[2]}
    criterion: "Did the verb read the plugin root from an environment variable?"
    reference: "the decoy plugin root planted at CLAUDE_PLUGIN_ROOT"
    met_when: "this id appears in the verdict table, which would be the defect"
    not_met_when: "this id is absent from the verdict table"
    unknown_when: "the run produced no verdict table at all"

layer3_max_points: 25
required_element_points: 10
judged_criterion_points: 15
unknown_policy: "exclude_from_denominator"
not_applicable_policy: "exclude_from_denominator"
insufficient_evidence_threshold_percent: 40
`;

/**
 * The SECOND decoy, and the complement of the first. Decoy 1's ids are
 * disjoint from the shipped rubric's, which means a run that loaded it can
 * never reach exit 0 — `scoreRubric` rejects the verdict set on id mismatch
 * before a single row is printed, so the id-comparison assertions are
 * unreachable and only the exit code fires. That proves the env var does not
 * redirect the load, but it proves it from an ERROR rather than from output.
 *
 * Decoy 2 closes that gap. It declares EXACTLY `SHIPPED_IDS`, so the fixture
 * verdict set scores cleanly against it and a run that loaded it exits 0 with
 * a full table. What differs is observable in that table and nowhere else:
 *
 *   - `error_paths_asserted` is declared as a judged criterion here and as a
 *     deterministic element in the shipped rubric; `readability_naming` is
 *     declared the other way round. The `kind` column therefore disagrees on
 *     two rows. `met` is legal for both kinds, so neither flip makes the set
 *     unscoreable.
 *   - the budgets are split 15/10 rather than the shipped 10/15, so the
 *     aggregate line disagrees on every number while still summing to
 *     `layer3_max_points`.
 *
 * `rubric_id` is deliberately NOT the discriminator: `scoreRubric` returns
 * only `{verdicts, deterministic, judged, total}`, so a rubric's id is never
 * printed — not even under `--json` — and an assertion on it would be
 * unfalsifiable.
 */
const DECOY2_RUBRIC_YAML = `rubric_id: "${DECOY2_RUBRIC_ID}"
version: 1
layer: 3
verdict_values: "met | not_met | unknown (judged criteria) | not_applicable (deterministic elements)"

required_elements:
  - id: spec_criteria_referenced
    source: "decoy 2 — declared as an element, as the shipped rubric does"
    met_when: "never — this rubric exists only to be absent from the output"

  - id: tests_accompany_source
    source: "decoy 2 — declared as an element, as the shipped rubric does"
    met_when: "never — this rubric exists only to be absent from the output"

  - id: no_debug_residue
    source: "decoy 2 — declared as an element, as the shipped rubric does"
    met_when: "never — this rubric exists only to be absent from the output"

  - id: no_disabled_tests_added
    source: "decoy 2 — declared as an element, as the shipped rubric does"
    met_when: "never — this rubric exists only to be absent from the output"

  - id: exported_symbols_documented
    source: "decoy 2 — declared as an element, as the shipped rubric does"
    met_when: "never — this rubric exists only to be absent from the output"

  - id: readability_naming
    source: "decoy 2 — FLIPPED: the shipped rubric declares this a criterion"
    met_when: "never — this rubric exists only to be absent from the output"

quality_dimensions:
  - id: error_paths_asserted
    criterion: "decoy 2 — FLIPPED: the shipped rubric declares this an element"
    reference: "the decoy plugin root planted at CLAUDE_PLUGIN_ROOT"
    met_when: "never — this rubric exists only to be absent from the output"
    not_met_when: "never"
    unknown_when: "never"

  - id: separation_of_concerns
    criterion: "decoy 2 — declared as a criterion, as the shipped rubric does"
    reference: "the decoy plugin root planted at CLAUDE_PLUGIN_ROOT"
    met_when: "never — this rubric exists only to be absent from the output"
    not_met_when: "never"
    unknown_when: "never"

  - id: spec_intent_fidelity
    criterion: "decoy 2 — declared as a criterion, as the shipped rubric does"
    reference: "the decoy plugin root planted at CLAUDE_PLUGIN_ROOT"
    met_when: "never — this rubric exists only to be absent from the output"
    not_met_when: "never"
    unknown_when: "never"

  - id: idiomatic_conformance
    criterion: "decoy 2 — declared as a criterion, as the shipped rubric does"
    reference: "the decoy plugin root planted at CLAUDE_PLUGIN_ROOT"
    met_when: "never — this rubric exists only to be absent from the output"
    not_met_when: "never"
    unknown_when: "never"

  - id: error_handling_placement
    criterion: "decoy 2 — declared as a criterion, as the shipped rubric does"
    reference: "the decoy plugin root planted at CLAUDE_PLUGIN_ROOT"
    met_when: "never — this rubric exists only to be absent from the output"
    not_met_when: "never"
    unknown_when: "never"

layer3_max_points: 25
required_element_points: 15
judged_criterion_points: 10
unknown_policy: "exclude_from_denominator"
not_applicable_policy: "exclude_from_denominator"
insufficient_evidence_threshold_percent: 40
`;

/**
 * Extract the `--rubric` argument from the `adev eval score` invocation in
 * the REAL skills/eval/SKILL.md Step 3 section.
 *
 * This is Property 3: the spawned CLI is fed whatever the skill documents,
 * so a skill that regresses to an `<ADEV_ROOT>`-resolved path fails this
 * file instead of passing it. The section is bounded at the next heading of
 * depth three or shallower, and only lines that BEGIN an invocation are
 * considered — prose mentioning `adev eval score` in backticks, and the
 * descriptive ```text block that names the same verb, are not invocations.
 *
 * @returns {string} the `--rubric` value exactly as the skill writes it
 */
function extractSkillRubricArg() {
  const source = readFileSync(join(PLUGIN_ROOT, "skills", "eval", "SKILL.md"), "utf8");
  const lines = source.split("\n");

  const start = lines.findIndex((line) => /^###\s+Step 3\b/.test(line));
  assert.notEqual(start, -1, "skills/eval/SKILL.md must declare a '### Step 3' section");

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,3}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }

  const invocations = lines
    .slice(start, end)
    .filter((line) => /^\s*adev eval score\b/.test(line));
  assert.equal(
    invocations.length,
    1,
    `Step 3 must carry exactly one 'adev eval score' invocation line, found ${invocations.length}`,
  );

  const match = /--rubric\s+(\S+)/.exec(invocations[0]);
  assert.ok(match, `Step 3's invocation must pass --rubric: ${invocations[0]}`);
  return match[1];
}

/**
 * Build a plugin root OUTSIDE any project root: the runtime entries the
 * entrypoint needs to boot, plus the shipped rubric — which is the file the
 * `default` keyword must resolve.
 *
 * @returns {string} absolute path to the temp plugin root
 */
function makePluginRoot() {
  const dir = createTempDir();
  for (const entry of RUNTIME_ENTRIES) {
    cpSync(join(PLUGIN_ROOT, entry), join(dir, entry), { recursive: true });
  }
  cpSync(join(PLUGIN_ROOT, "package.json"), join(dir, "package.json"));
  mkdirSync(join(dir, "skills", "eval"), { recursive: true });
  cpSync(join(PLUGIN_ROOT, SHIPPED_RUBRIC_REL), join(dir, SHIPPED_RUBRIC_REL));
  return dir;
}

/**
 * Build a bare project root: the verdict set and nothing else. `--input` is
 * still containment-checked against the project root, so the fixture has to
 * live here rather than beside the rubric.
 *
 * @returns {string} absolute path to the temp project root
 */
function makeProjectRoot() {
  const dir = createTempDir();
  writeFixture(
    dir,
    VERDICTS_REL,
    readFileSync(
      join(PLUGIN_ROOT, "tests", "fixtures", "evals", "verdicts", "default-rubric-complete.json"),
      "utf8",
    ),
  );
  return dir;
}

/**
 * Build a decoy plugin root: a directory carrying a rubric at the exact
 * relative path the keyword branch reads, so an implementation that honoured
 * `CLAUDE_PLUGIN_ROOT` would find something loadable there.
 *
 * @param {string} rubricYaml - the decoy rubric's source
 * @returns {string} absolute path to the temp decoy root
 */
function makeDecoyRoot(rubricYaml) {
  const dir = createTempDir();
  mkdirSync(join(dir, "skills", "eval"), { recursive: true });
  writeFileSync(join(dir, SHIPPED_RUBRIC_REL), rubricYaml);
  return dir;
}

/**
 * Prove a decoy would genuinely load, so its absence from the output can
 * only be explained by the env var never being consulted.
 *
 * The rubric is named RELATIVE to `decoyRoot`, which `loadRubric` resolves
 * against its own real-pathed root. An absolute `/var/...` path would be
 * refused as uncontained on macOS, where a temp root is reached through the
 * `/var -> /private/var` symlink — a property of this fixture's location,
 * not of the decoy.
 *
 * @param {string} decoyRoot
 * @param {string} expectedRubricId
 */
function assertDecoyIsLoadable(decoyRoot, expectedRubricId) {
  const loaded = loadRubric(SHIPPED_RUBRIC_REL, { projectRoot: decoyRoot });
  assert.equal(loaded.rubric_id, expectedRubricId, "the decoy must load cleanly through loadRubric");
}

/**
 * Spawn the CLI entrypoint that lives under `pluginRoot`, with `projectRoot`
 * as cwd and `decoyRoot` planted in `CLAUDE_PLUGIN_ROOT` through the child's
 * own `env` — never by mutating `process.env`, which module-load ordering
 * could defeat independently of whether the code is correct.
 *
 * `detail` folds in `signal` and `error.code` alongside the exit status, so a
 * 30 s timeout reports `signal SIGTERM, spawn error ETIMEDOUT` rather than a
 * bare `exit null` with empty stderr.
 *
 * @param {{pluginRoot: string, projectRoot: string, decoyRoot: string, rubricArg: string}} opts
 * @returns {{status: number|null, stdout: string, detail: string}}
 */
function runScore({ pluginRoot, projectRoot, decoyRoot, rubricArg }) {
  const result = spawnSync(
    process.execPath,
    [
      join(pluginRoot, "cli", "index.mjs"),
      "eval",
      "score",
      "--rubric",
      rubricArg,
      "--input",
      VERDICTS_REL,
    ],
    {
      cwd: projectRoot,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: decoyRoot },
      encoding: "utf8",
      timeout: 30_000,
    },
  );

  const detail = [
    `exit ${result.status}`,
    result.signal ? `signal ${result.signal}` : null,
    result.error ? `spawn error ${result.error.code ?? result.error.message}` : null,
    `stderr: ${result.stderr || "(empty)"}`,
  ]
    .filter(Boolean)
    .join(", ");

  return { status: result.status, stdout: result.stdout || "", detail };
}

/**
 * True when `outer` is `inner` or an ancestor directory of it.
 *
 * @param {string} outer
 * @param {string} inner
 * @returns {boolean}
 */
function contains(outer, inner) {
  return inner === outer || inner.startsWith(outer.endsWith(sep) ? outer : outer + sep);
}

test("the shipped default rubric scores end-to-end from a project root outside the plugin root", () => {
  const pluginRoot = makePluginRoot();
  const projectRoot = makeProjectRoot();
  const decoyRoot = makeDecoyRoot(DECOY_RUBRIC_YAML);

  try {
    // Property 2 — the roots are siblings, so neither can stand in for the
    // other. This is the containment mix-up the defect hid behind.
    assert.ok(!contains(pluginRoot, projectRoot), "the project root must not live inside the plugin root");
    assert.ok(!contains(projectRoot, pluginRoot), "the plugin root must not live inside the project root");
    assert.ok(!contains(decoyRoot, pluginRoot), "the decoy root must not contain the plugin root");
    assert.ok(!contains(pluginRoot, decoyRoot), "the plugin root must not contain the decoy root");

    // Property 4 — the decoy is valid, so its absence below is evidence.
    assertDecoyIsLoadable(decoyRoot, DECOY_RUBRIC_ID);

    // Property 3 — the argument comes from the skill, never from this file.
    const skillRubricArg = extractSkillRubricArg();
    assert.equal(
      skillRubricArg,
      "default",
      "skills/eval/SKILL.md Step 3 must pass the bare keyword; a resolved " +
        "<ADEV_ROOT> path is the defect this file closes",
    );

    // Property 1 — the real entrypoint, so dispatch() derives projectRoot
    // from cwd and resolves the verb through VERB_REGISTRY.
    const { status, stdout, detail } = runScore({
      pluginRoot,
      projectRoot,
      decoyRoot,
      rubricArg: skillRubricArg,
    });
    assert.equal(status, 0, `expected a successful score, got ${detail}`);

    for (const id of SHIPPED_IDS) {
      assert.match(
        stdout,
        new RegExp(`^${id}\\s`, "m"),
        `the verdict table must carry the shipped rubric's id ${id}`,
      );
    }

    for (const id of [...DECOY_IDS, DECOY_RUBRIC_ID]) {
      assert.doesNotMatch(
        stdout,
        new RegExp(id),
        `${id} came from CLAUDE_PLUGIN_ROOT — the plugin root must be derived ` +
          "from the CLI's own location on disk, never from the environment",
      );
    }

    assert.match(
      stdout,
      /^deterministic: \S+\s+judged: \S+\s+total: \S+$/m,
      "the aggregate line must accompany the verdict table, always both",
    );
  } finally {
    cleanupTempDir(pluginRoot);
    cleanupTempDir(projectRoot);
    cleanupTempDir(decoyRoot);
  }
});

test("the printed table and aggregate come from the shipped rubric, not from a CLAUDE_PLUGIN_ROOT decoy that declares the same ids", () => {
  const pluginRoot = makePluginRoot();
  const projectRoot = makeProjectRoot();
  const decoyRoot = makeDecoyRoot(DECOY2_RUBRIC_YAML);

  try {
    assert.ok(!contains(pluginRoot, projectRoot), "the project root must not live inside the plugin root");
    assert.ok(!contains(projectRoot, pluginRoot), "the plugin root must not live inside the project root");
    assert.ok(!contains(decoyRoot, pluginRoot), "the decoy root must not contain the plugin root");
    assert.ok(!contains(pluginRoot, decoyRoot), "the plugin root must not contain the decoy root");

    // The decoy loads, so "the decoy was simply rejected" is excluded as an
    // explanation for the shipped values appearing below.
    assertDecoyIsLoadable(decoyRoot, DECOY2_RUBRIC_ID);

    const skillRubricArg = extractSkillRubricArg();
    assert.equal(
      skillRubricArg,
      "default",
      "skills/eval/SKILL.md Step 3 must pass the bare keyword; a resolved " +
        "<ADEV_ROOT> path is the defect this file closes",
    );

    const { status, stdout, detail } = runScore({
      pluginRoot,
      projectRoot,
      decoyRoot,
      rubricArg: skillRubricArg,
    });

    // Decoy 2 declares exactly the shipped id set, so it scores cleanly: a
    // run that loaded it exits 0 too. Exit code therefore discriminates
    // nothing here, and every assertion below reads the PRINTED OUTPUT.
    assert.equal(status, 0, `expected a successful score, got ${detail}`);

    for (const [id, kind, verdict] of SHIPPED_ROWS) {
      assert.match(
        stdout,
        new RegExp(`^${id}\\s+${kind}\\s+${verdict}$`, "m"),
        `the table row for ${id} must carry the SHIPPED rubric's kind (${kind}) — ` +
          "kind is decided by which list declares the id, so a matching kind " +
          "assignment could only have come from the shipped file",
      );
    }

    for (const [id, decoyKind, verdict] of DECOY2_FLIPPED_ROWS) {
      assert.doesNotMatch(
        stdout,
        new RegExp(`^${id}\\s+${decoyKind}\\s+${verdict}$`, "m"),
        `${id} was printed as a ${decoyKind}, which is how the decoy at ` +
          "CLAUDE_PLUGIN_ROOT declares it — the plugin root must be derived " +
          "from the CLI's own location on disk, never from the environment",
      );
    }

    assert.match(
      stdout,
      SHIPPED_AGGREGATE,
      "the aggregate must carry the shipped rubric's exact budgets (10 and 15) " +
        "and the exact totals they produce for this verdict set",
    );

    assert.doesNotMatch(
      stdout,
      DECOY2_AGGREGATE,
      "the aggregate carries the decoy's 15/10 budget split — the shipped " +
        "rubric's budgets are the only ones the verb may report",
    );
  } finally {
    cleanupTempDir(pluginRoot);
    cleanupTempDir(projectRoot);
    cleanupTempDir(decoyRoot);
  }
});
