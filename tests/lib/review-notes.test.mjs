import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanupTempDir, createTempDir } from "../helpers.mjs";
import { reportStep } from "../../lib/lifecycle-state.mjs";
import { extractReviewWarnings, readReviewNotes } from "../../lib/review-notes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "..", "fixtures", "review-notes", "mixed-formats.review.md");
const SPEC_REL = ".context-index/specs/features/demo/sample.spec.md";
const REVIEW_REL = ".context-index/specs/features/demo/sample.review.md";

function makeProject() {
  const root = createTempDir();
  mkdirSync(join(root, ".context-index", "specs", "features", "demo"), { recursive: true });
  writeFileSync(
    join(root, ".context-index", "manifest.yaml"),
    "project:\n  name: test\nlifecycle:\n  event_diagnostics: off\n",
  );
  writeFileSync(join(root, SPEC_REL), "---\nstatus: review-passed\nrevision: 5\n---\n\n# Sample\n");
  return root;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeReview(root, fileSha) {
  const body = readFileSync(FIXTURE, "utf8").replace("file-sha: <PENDING>", `file-sha: ${fileSha}`);
  writeFileSync(join(root, REVIEW_REL), body);
}

function recordReview(root, verdict) {
  reportStep(root, SPEC_REL, { step: "review", status: "started" });
  reportStep(root, SPEC_REL, { step: "review", status: "completed", verdict });
}

test("extractReviewWarnings returns only open warning findings, with IDs and cited sections", () => {
  const warnings = extractReviewWarnings(readFileSync(FIXTURE, "utf8"));
  assert.deepEqual(
    warnings.map((w) => w.id),
    ["SA-1", "SA-2", "SEC-1", "CON-1", "CON-3", "BD-1", "BD-2", "BD-3"],
  );
  const byId = Object.fromEntries(warnings.map((w) => [w.id, w]));

  assert.equal(byId["SA-1"].section, 'Error Cases, "Store missing or unreadable" row');
  assert.equal(byId["SA-1"].summary, "The error row names no exit code for the unreadable-store case.");
  assert.equal(byId["SA-1"].reviewer, "structural-architect");

  assert.equal(byId["SA-2"].section, "Integration Points");
  assert.equal(byId["SA-2"].summary, "Projection requires lockstep amendment");

  assert.equal(byId["SEC-1"].section, "behaviors-3");
  assert.equal(byId["SEC-1"].summary, "Path containment is not re-asserted for the new `--out` flag.");
  assert.equal(byId["SEC-1"].reviewer, "security-reviewer");

  assert.equal(byId["CON-1"].section, null);
  assert.match(byId["CON-1"].summary, /^The warning is named "floor warning"/);

  assert.equal(byId["CON-3"].section, 'Behavior 4, "Staleness" / AC 389');
  assert.equal(byId["CON-3"].summary, "same defect as CON-1 (counted there)");

  assert.equal(byId["BD-1"].section, "Behaviors §11 (sticky tracker)");
  assert.equal(byId["BD-1"].summary, "The sticky tracker has no owner.");
  assert.equal(byId["BD-2"].section, null);
  assert.equal(byId["BD-2"].summary, "The `--since` flag is not validated.");
  assert.equal(byId["BD-3"].summary, "Merge target wording is ambiguous.");
});

test("extractReviewWarnings skips suggestions, resolved or struck-through warnings, and fenced examples", () => {
  const ids = extractReviewWarnings(readFileSync(FIXTURE, "utf8")).map((w) => w.id);
  for (const excluded of ["SA-3", "SA-4", "SEC-2", "SEC-3", "CON-2", "CON-9"]) {
    assert.ok(!ids.includes(excluded), `${excluded} must not be carried forward`);
  }
});

test("extractReviewWarnings keeps every summary to a single bounded line", () => {
  const long = `- **SA-7** (warning): ${"word ".repeat(80)}\n  continued on a second line`;
  const [w] = extractReviewWarnings(long);
  assert.equal(w.id, "SA-7");
  assert.ok(!w.summary.includes("\n"));
  assert.ok(w.summary.length <= 160, `summary is ${w.summary.length} chars`);
});

test("extractReviewWarnings joins a list finding's wrapped lines into its summary", () => {
  const md = [
    "- **WR-1** [warning] (orphaned-event-field, `behaviors-8`):",
    "  The block now has a consumer, but no test",
    "  exercises the round trip.",
    "- **WR-2** [suggestion]: unrelated",
  ].join("\n");
  const [w] = extractReviewWarnings(md);
  assert.equal(w.id, "WR-1");
  assert.equal(w.section, "behaviors-8");
  assert.equal(w.summary, "The block now has a consumer, but no test exercises the round trip.");
});

test("extractReviewWarnings lets a current warning reuse an ID a prior round resolved", () => {
  const md = [
    "## Prior round",
    "",
    "- ~~**SA-1** (warning): old finding~~ → Resolved.",
    "",
    "## Structural Architect (structural-architect)",
    "",
    "### SA-1 (carryover) — warning — Cross-charter ownership still ambiguous",
    "",
    "**Finding:** Nobody owns the edit.",
  ].join("\n");
  const warnings = extractReviewWarnings(md);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].summary, "Nobody owns the edit.");
  assert.equal(warnings[0].reviewer, "structural-architect");
});

test("extractReviewWarnings reports an ID-less WARNING line with a null id", () => {
  const md = "## Structural Architect\n\n- WARNING: `skills/retro/SKILL.md` globs validation reports\n";
  const [w] = extractReviewWarnings(md);
  assert.equal(w.id, null);
  assert.equal(w.summary, "`skills/retro/SKILL.md` globs validation reports");
});

test("extractReviewWarnings returns [] for empty or non-string input", () => {
  assert.deepEqual(extractReviewWarnings(""), []);
  assert.deepEqual(extractReviewWarnings(undefined), []);
});

test("readReviewNotes takes the verdict from the lifecycle log and carries PASS_WITH_NOTES warnings", () => {
  const root = makeProject();
  try {
    recordReview(root, "PASS_WITH_NOTES");
    writeReview(root, sha256(join(root, SPEC_REL)));
    const notes = readReviewNotes(root, SPEC_REL);
    assert.equal(notes.verdict, "PASS_WITH_NOTES");
    assert.equal(notes.review, REVIEW_REL);
    assert.equal(notes.unchangedSinceReview, true);
    assert.deepEqual(notes.warnings.map((w) => w.id), ["SA-1", "SA-2", "SEC-1", "CON-1", "CON-3", "BD-1", "BD-2", "BD-3"]);
  } finally {
    cleanupTempDir(root);
  }
});

test("readReviewNotes reports unchangedSinceReview false once the spec is edited", () => {
  const root = makeProject();
  try {
    recordReview(root, "PASS_WITH_NOTES");
    writeReview(root, sha256(join(root, SPEC_REL)));
    writeFileSync(join(root, SPEC_REL), "---\nstatus: review-passed\nrevision: 6\n---\n\n# Sample, edited\n");
    assert.equal(readReviewNotes(root, SPEC_REL).unchangedSinceReview, false);
  } finally {
    cleanupTempDir(root);
  }
});

test("readReviewNotes reports unchangedSinceReview null when the stored file-sha is not a sha256", () => {
  const root = makeProject();
  try {
    recordReview(root, "PASS_WITH_NOTES");
    writeReview(root, "<PENDING>");
    assert.equal(readReviewNotes(root, SPEC_REL).unchangedSinceReview, null);
  } finally {
    cleanupTempDir(root);
  }
});

test("readReviewNotes carries nothing forward when the latest verdict is PASS", () => {
  const root = makeProject();
  try {
    recordReview(root, "PASS");
    writeReview(root, sha256(join(root, SPEC_REL)));
    const notes = readReviewNotes(root, SPEC_REL);
    assert.equal(notes.verdict, "PASS");
    assert.deepEqual(notes.warnings, []);
  } finally {
    cleanupTempDir(root);
  }
});

test("readReviewNotes handles a spec with no review report", () => {
  const root = makeProject();
  try {
    const notes = readReviewNotes(root, SPEC_REL);
    assert.equal(notes.verdict, null);
    assert.equal(notes.review, null);
    assert.equal(notes.unchangedSinceReview, null);
    assert.deepEqual(notes.warnings, []);
  } finally {
    cleanupTempDir(root);
  }
});
