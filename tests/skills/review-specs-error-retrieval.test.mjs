// tests/skills/review-specs-error-retrieval.test.mjs
//
// Task 10 — "Error-triggered retrieval — review-specs BLOCK".
//
// The SECOND and final error-triggered surface. Unlike the validate FAIL path
// (Task 9), a review BLOCK synthesizes NOTHING: the finding already carries a
// canonical identity in its `blocker_id`, so the key is derived in INHERITED
// mode —
//
//   adev heuristics signature --origin review-specs --blocker-id <id>
//
// which reuses the blocker_id's location-hash component and hashes nothing.
// Falling back to `--origin review-specs --text <prose>` would mint a SECOND
// identity for the same finding, so the skill must never do it.
//
// Explicitly OUT OF SCOPE: implement-task failure and recover dispatch. There
// are exactly two error-triggered surfaces; Task 11 asserts the others stay
// unwired.

import { test } from "node:test";
import assert from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, sep } from "node:path";

import {
  PLUGIN_ROOT,
  createTempDir,
  cleanupTempDir,
  writeFixture,
  readSkillSurface,
} from "../helpers.mjs";
import { buildBlockerId } from "../../lib/blocker-id.mjs";
import { writeHeuristic } from "../../lib/heuristics.mjs";

const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");

/**
 * Run the adev CLI with the project root ALWAYS first.
 *
 * Uniform arity across the Task 9 / 10 / 12 suites, even for subcommands that
 * ignore the root (`signature` derives from its flags alone; the root only
 * supplies a cwd for the child process).
 *
 * @param {string} projectRoot
 * @param {string[]} argv
 */
function runCli(projectRoot, argv) {
  const r = spawnSync("node", [CLI, ...argv], { encoding: "utf8", cwd: projectRoot });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function makeTempProject() {
  const dir = createTempDir();
  writeFixture(
    dir,
    ".context-index/manifest.yaml",
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
  );
  return dir;
}

// A REAL blocker_id, produced by the canonical builder rather than typed by
// hand: a hand-invented string might not survive `parseBlockerId`, and the
// inherited-mode verb rejects anything that does not.
const BLOCKER_ID = buildBlockerId({
  reviewer: "structural-architect",
  type: "missing-error-path",
  sectionAnchor: "behavior-4",
  findingText: "the BLOCK path never re-queries the store for prior occurrences of this finding",
});

// ── skills/review-specs/SKILL.md BLOCK path ──────────────────────────────

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "review-specs", "SKILL.md");
const SKILL = readSkillSurface("review-specs");

test("the BLOCK path names the inherited-mode signature verb", () => {
  // assert.ok over assert.match: a failed assert.match on a large skill file
  // dumps the entire document into the test output.
  assert.ok(
    /adev heuristics signature --origin review-specs --blocker-id/.test(SKILL),
    "skills/review-specs/SKILL.md must invoke 'adev heuristics signature --origin review-specs --blocker-id <id>' on the BLOCK path",
  );
});

/**
 * The BLOCK-path window, anchored on the inherited-mode marker.
 *
 * Scoped rather than whole-file on purpose. `skills/review-specs/SKILL.md`
 * carries a SECOND `adev heuristics retrieve` line — the Step 0 entry-time
 * block, ~12 KB earlier — which has no `--signature` today. An unscoped regex
 * would silently retarget onto that earlier line the moment Step 0 ever gained
 * the flag, and would then pass while asserting nothing whatsoever about the
 * step under test. The BLOCK retrieve sits ~550 chars after the marker, so
 * +800 reaches it with margin while staying far clear of Step 0.
 */
function blockWindow() {
  const i = SKILL.indexOf("--blocker-id");
  assert.notEqual(
    i,
    -1,
    "the marker '--blocker-id' is absent from skills/review-specs/SKILL.md — the BLOCK path does not name the inherited-mode signature verb",
  );
  return SKILL.slice(Math.max(0, i - 1200), i + 800);
}

test("the BLOCK path re-queries by signature and lets the verb supply the cap", () => {
  const m = blockWindow().match(/adev heuristics retrieve[^\n]*--signature[^\n]*/);
  assert.ok(m, "the BLOCK path must invoke 'adev heuristics retrieve ... --signature' on one line");
  assert.ok(
    !m[0].includes("--injection-limit"),
    "the error-time cap comes from the verb's own default, not from skill prose: " + m[0],
  );
});

test("the BLOCK path never synthesizes a key from finding prose", () => {
  // `--origin review-specs --text <prose>` would mint a second identity for a
  // finding that already has one.
  assert.equal(
    /--origin review-specs[^\n]*--text/.test(SKILL),
    false,
    "review-specs must stay in inherited mode: no --text fallback for a finding that already carries a blocker_id",
  );
});

test("the skill adds no inline Node", () => {
  assert.doesNotMatch(SKILL, /node\s+(-e|--input-type)/);
  assert.doesNotMatch(SKILL, /Run inline Node/);
});

// ── End-to-end: an inherited signature retrieves what was stored under it ──

test("an inherited signature retrieves the entry stored under it", async () => {
  const dir = makeTempProject();
  try {
    const sig = runCli(dir, [
      "heuristics",
      "signature",
      "--origin",
      "review-specs",
      "--blocker-id",
      BLOCKER_ID,
    ]);
    assert.strictEqual(sig.status, 0, sig.stderr);
    const signature = sig.stdout.trim();
    // A malformed key must not pass silently: the inherited form is the origin
    // prefix plus the blocker_id's hex location hash and nothing else.
    assert.match(signature, /^review-specs-[0-9a-f]+$/);

    // Seed through the validating write path so the fixture is schema-checked.
    // `low` confidence is realistic: failure-derived entries stay low forever,
    // and an exact signature match is exempt from the low floor.
    await writeHeuristic(dir, {
      id: "review-specs-block-recurrence",
      scope: "heuristics",
      title: "This blocker has fired before",
      pattern: "The BLOCK path must re-query the store with the finding's inherited signature",
      confidence: "low",
      signature,
      tags: [],
      evidence: [{ path: "s/a.md", date: "2026-01-01" }],
      contradictedBy: [],
      created: "2026-01-01",
      updated: "2026-01-01",
    });

    const r = runCli(dir, [
      "heuristics",
      "retrieve",
      "--module",
      "heuristics",
      "--signature",
      signature,
      "--injection-limit",
      "3",
    ]);
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(
      out.count,
      1,
      "the entry stored under the inherited signature must come back on a signature-keyed retrieval",
    );
  } finally {
    cleanupTempDir(dir);
  }
});

// ── Task 11 — negative scope: exactly TWO signature-keyed call surfaces ────
//
// An earlier spec revision listed FOUR error-triggered surfaces while defining
// a signature derivation input for only TWO. Behavior 6's table gives inputs
// for the validate FAIL path and the review-specs BLOCK path and for nothing
// else, so implement-task failure and recover dispatch stay UNWIRED until a
// follow-up states their inputs with the same precision. These assertions are
// what keeps them out.

/** Line-scoped on purpose: `skills/recover/SKILL.md` wraps a heuristics
 * invocation across newlines (`adev heuristics write \` + continuations), so a
 * pattern letting `.` cross lines could stitch an unrelated `retrieve` to an
 * unrelated `--signature` and manufacture a false positive. */
const SIGNATURE_RETRIEVAL = /heuristics retrieve[^\n]*--signature/;

/** @param {string} src */
const usesSignatureRetrieval = (src) => SIGNATURE_RETRIEVAL.exec(src) !== null;

/** @param {string[]} segments */
const readSurface = (...segments) => readFileSync(join(PLUGIN_ROOT, ...segments), "utf8");

/**
 * Every executable call surface, as repo-root-relative POSIX paths.
 *
 * Deliberately narrow. `lib/` implements the parameter, `tests/` exercises it,
 * `docs/cli-reference.md` documents it, `.context-index/` quotes the
 * invocation in the spec and plan, and `providers/*` are checked-in mirrors —
 * all legitimate mentions that a whole-tree sweep would wrongly flag. What is
 * pinned here is the set of surfaces that actually RUN the retrieval.
 *
 * `hooks/` is swept precisely so it can be asserted to contribute NOTHING: the
 * Stop hook is capture-only and must never re-query.
 *
 * @param {string} dir absolute
 * @returns {string[]} absolute paths
 */
function walkHookScripts(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    const isScript = entry.isFile() && (entry.name.endsWith(".mjs") || entry.name.endsWith(".sh"));
    return entry.isDirectory() ? walkHookScripts(full) : isScript ? [full] : [];
  });
}

/** Every markdown file under a skill: SKILL.md and its references/ companions. */
function walkSkillDocs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walkSkillDocs(full);
    return entry.isFile() && entry.name.endsWith(".md") ? [full] : [];
  });
}

function callSurfaces() {
  // Walks references/ as well as SKILL.md. Progressive disclosure moved several
  // of these call sites into companions; a SKILL.md-only sweep would report ZERO
  // matches and the equality below would degenerate into `[] === []`.
  const skillDocs = walkSkillDocs(join(PLUGIN_ROOT, "skills"));

  return [...walkHookScripts(join(PLUGIN_ROOT, "hooks")), ...skillDocs].map((abs) =>
    relative(PLUGIN_ROOT, abs).split(sep).join("/"),
  );
}

test("implement-task failure does not trigger signature-keyed retrieval", () => {
  assert.equal(
    usesSignatureRetrieval(readSkillSurface("implement")),
    false,
    "implement must NOT perform signature-keyed retrieval anywhere in its instruction surface: the spec defines no signature input for a failed implement task",
  );
});

test("recover dispatch does not trigger signature-keyed retrieval", () => {
  assert.equal(
    usesSignatureRetrieval(readSkillSurface("recover")),
    false,
    "recover must NOT perform signature-keyed retrieval anywhere in its instruction surface: recover MINTS a signature for the lesson it writes, it does not re-query by one",
  );
});

test("exactly two call surfaces name --signature on a retrieve", () => {
  const surfaces = callSurfaces();
  // Guards the sweep itself: an empty or truncated walk would make the
  // equality below unfalsifiable rather than true.
  //
  // Each ROOT is asserted separately, deliberately. A single combined floor is
  // durable only by coincidence — `hooks/` alone already supplies ~20 files, so
  // one added hook script would let a skills walk that returned NOTHING clear a
  // combined threshold while the equality below silently degenerated into
  // `[] === []`-shaped nonsense. Per-root floors cannot be satisfied by the
  // other root growing.
  const hookFiles = surfaces.filter((rel) => rel.startsWith("hooks/"));
  const skillFiles = surfaces.filter((rel) => rel.startsWith("skills/"));
  assert.ok(
    hookFiles.length >= 10,
    `the sweep collected only ${hookFiles.length} files under hooks/ — the hooks walk is truncated`,
  );
  assert.ok(
    skillFiles.length >= 20,
    `the sweep collected only ${skillFiles.length} files under skills/ — the skills walk is truncated`,
  );
  assert.equal(
    hookFiles.length + skillFiles.length,
    surfaces.length,
    "the sweep must scan only hooks/ and skills/ — lib/, tests/, docs/, .context-index/ and providers/ all legitimately name the flag",
  );

  const matched = surfaces.filter((rel) => usesSignatureRetrieval(readSurface(rel))).sort();

  assert.deepStrictEqual(
    matched,
    [
      "skills/review-specs/references/steps/step-6-events-and-report.md",
      "skills/validate/references/overall-status.md",
    ],
    "signature-keyed retrieval is limited to the validate FAIL path and the review-specs BLOCK path; a third surface means one was wired without a spec-defined signature input",
  );
});
