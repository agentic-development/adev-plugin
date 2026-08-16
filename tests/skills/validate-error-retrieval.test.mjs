// tests/skills/validate-error-retrieval.test.mjs
//
// Task 9 — "Error-triggered retrieval — validate FAIL".
//
// Two halves, one contract:
//
//   Part A — `adev heuristics signature --origin validate --check-id <id>...`
//            The verb gains a REPEATABLE `--check-id` flag and hands the raw
//            ids straight to `deriveValidateFailureSignature`. The CLI adds no
//            composition of its own: the dedupe, the sort, the join and the
//            hash all stay in the single shared helper, so the read side and
//            the capture side cannot drift.
//
//   Part B — `skills/validate/SKILL.md` FAIL path. The skill supplies RAW check
//            ids and composes nothing (a skill cannot run inline Node, and
//            having the agent dedupe/sort/join in prose would mint a SECOND
//            composition). It then re-queries the store with the resulting
//            signature and lets the verb supply the error-time cap.
//
// Explicitly OUT OF SCOPE: `hooks/post-validate-extract-heuristics.sh`. That
// wrapper is registered under `Stop`, and a Stop hook has no non-blocking
// channel that reaches the model — its only model-reaching channel is
// `decision: "block"`, which retrieval must never use. The hook stays
// capture-only and its stdout contract is asserted UNCHANGED below.

import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import {
  PLUGIN_ROOT,
  createTempDir,
  cleanupTempDir,
  writeFixture,
} from "../helpers.mjs";
import { deriveValidateFailureSignature } from "../../lib/heuristics.mjs";

const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");

/**
 * Run the adev CLI with the project root ALWAYS first.
 *
 * The uniform arity is deliberate — the Task 9 / 10 / 12 suites all call
 * `runCli(projectRoot, argv)` even where the subcommand ignores the root.
 * `signature` is one such subcommand: derivation reads no clock, no path and
 * no env var, so the root only supplies a cwd for the process.
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

/** Run `adev heuristics signature ...` in a throwaway project. */
function runSignature(args) {
  const dir = makeTempProject();
  try {
    return runCli(dir, ["heuristics", "signature", ...args]);
  } finally {
    cleanupTempDir(dir);
  }
}

// ── Part A: `adev heuristics signature --check-id` ───────────────────────

test("--check-id delegates the composition to deriveValidateFailureSignature", () => {
  const r = runSignature([
    "--origin", "validate",
    "--check-id", "gate-1",
    "--check-id", "adr-3",
    "--check-id", "gate-1",
  ]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(
    r.stdout.trim(),
    deriveValidateFailureSignature([
      { id: "gate-1", outcome: "FAIL" },
      { id: "adr-3", outcome: "FAIL" },
      { id: "gate-1", outcome: "FAIL" },
    ]),
    "the verb must emit exactly what the shared helper composes — no second composition",
  );
});

test("--check-id is order-independent and duplicate-insensitive", () => {
  const a = runSignature([
    "--origin", "validate",
    "--check-id", "adr-3",
    "--check-id", "gate-1",
  ]);
  const b = runSignature([
    "--origin", "validate",
    "--check-id", "gate-1",
    "--check-id", "adr-3",
    "--check-id", "adr-3",
  ]);
  assert.strictEqual(a.status, 0, a.stderr);
  assert.strictEqual(b.status, 0, b.stderr);
  assert.strictEqual(a.stdout.trim(), b.stdout.trim());
});

test("--check-id combined with --text is rejected", () => {
  const r = runSignature([
    "--origin", "validate",
    "--check-id", "gate-1",
    "--text", "some failure text",
  ]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(
    r.stderr,
    /CONFLICTING_SIGNATURE_INPUT/,
    "two competing input forms must be reported as CONFLICTING_SIGNATURE_INPUT",
  );
});

test("--check-id combined with --blocker-id under --origin review-specs is rejected", () => {
  const r = runSignature([
    "--origin", "review-specs",
    "--blocker-id", "structural-architect:mutable-hash-input:a15235f5",
    "--check-id", "gate-1",
  ]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(
    r.stderr,
    /CONFLICTING_SIGNATURE_INPUT/,
    "--check-id is derived-mode-only; under review-specs it must be CONFLICTING_SIGNATURE_INPUT",
  );
});

test("--check-id combined with --digest-only is rejected, not silently ignored", () => {
  // deriveValidateFailureSignature returns the PREFIXED signature and exposes no
  // bare digest, so there is nothing for --digest-only to emit. Without an
  // explicit conflict the flag is quietly dropped and the caller gets
  // `validate-<digest>` where it asked for `<digest>` — a wrong answer rather
  // than a missing feature. Mirrors the existing --digest-only/--blocker-id rule.
  const r = runSignature([
    "--origin", "validate",
    "--check-id", "gate-1",
    "--digest-only",
  ]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(
    r.stderr,
    /CONFLICTING_SIGNATURE_INPUT/,
    "--digest-only has no bare digest to emit under --check-id",
  );
});

test("--check-id values that all sanitize away are an error", () => {
  const r = runSignature(["--origin", "validate", "--check-id", "///"]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, "");
  assert.match(
    r.stderr,
    /EMPTY_SIGNATURE_TEXT/,
    "ids that sanitize to nothing leave no signature input: EMPTY_SIGNATURE_TEXT",
  );
});

// ── Part B: skills/validate/SKILL.md FAIL path ───────────────────────────

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "validate", "SKILL.md");
const SKILL = readFileSync(SKILL_PATH, "utf8");

const CHECK_ID_MARKER = "--check-id";

/**
 * A TIGHT slice of the skill around the new FAIL-path step.
 *
 * Tightness is the whole point. The API-reference section at the tail of
 * `skills/validate/SKILL.md` names `lib/lifecycle-state.mjs` five times
 * (offsets ~49228-49881 in a ~50.5 KB file), and the earlier per-check-event
 * section names `.context-index/lifecycle-state/<slug>.jsonl`. A window wide
 * enough to reach either would fail on DOCUMENTATION rather than on the step
 * under test. The bounds below (-1200 / +800) keep the nearest such mention
 * several thousand characters outside the window for a step landing anywhere
 * in the `## Overall Status` / `If FAIL:` region.
 */
function failWindow() {
  const i = SKILL.indexOf(CHECK_ID_MARKER);
  assert.notStrictEqual(
    i,
    -1,
    `skills/validate/SKILL.md must invoke 'adev heuristics signature --origin validate ... ${CHECK_ID_MARKER}' on the FAIL path; the marker '${CHECK_ID_MARKER}' is absent from the file`,
  );
  return SKILL.slice(Math.max(0, i - 1200), Math.min(SKILL.length, i + 800));
}

test("the FAIL path names the check-id signature verb", () => {
  // assert.ok over assert.match on purpose: a failed assert.match on a 50 KB
  // string dumps the whole skill into the test output.
  assert.ok(
    /adev heuristics signature --origin validate[^\n]*--check-id/.test(SKILL),
    "skills/validate/SKILL.md must invoke 'adev heuristics signature --origin validate ... --check-id' on the FAIL path",
  );
});

test("the FAIL path re-queries by signature and lets the verb supply the cap", () => {
  const m = SKILL.match(/adev heuristics retrieve[^\n]*--signature[^\n]*/);
  assert.ok(m, "the FAIL path must invoke 'adev heuristics retrieve ... --signature' on one line");
  assert.ok(
    !m[0].includes("--injection-limit"),
    "the error-time cap comes from the verb's own default, not from skill prose: " + m[0],
  );
});

test("the check ids come from the live verdict, not from the lifecycle log", () => {
  // A lifecycle-state record carries `validator` and `verdict` but no
  // `checks[]`, so the key is underivable from the log. The FAIL path holds
  // the live verdict and must read the ids from there.
  assert.doesNotMatch(
    failWindow(),
    /lifecycle-state/,
    "the FAIL-path retrieval step must not source check ids from .context-index/lifecycle-state/",
  );
});

test("the FAIL-path retrieval skips rather than blocking when nothing matches", () => {
  // Scoped to the window on purpose: the Step 0 entry-time heuristics block
  // already contains __NONE__, so an unscoped assertion would pass today and
  // prove nothing about the new step.
  assert.match(
    failWindow(),
    /__NONE__/,
    "the FAIL-path retrieval must handle the empty-result sentinel and continue",
  );
});

test("the skill adds no inline Node", () => {
  assert.doesNotMatch(SKILL, /node\s+(-e|--input-type)/);
  assert.doesNotMatch(SKILL, /Run inline Node/);
});

// ── The Stop hook wrapper stays capture-only ─────────────────────────────

test("hooks/post-validate-extract-heuristics.sh is untouched by the re-query", () => {
  const hook = readFileSync(
    join(PLUGIN_ROOT, "hooks", "post-validate-extract-heuristics.sh"),
    "utf8",
  );
  assert.doesNotMatch(hook, /heuristics retrieve/, "a Stop hook must not perform retrieval");
  assert.doesNotMatch(hook, /--signature/, "a Stop hook must not compose or pass a signature");
  assert.doesNotMatch(
    hook,
    /systemMessage/,
    "systemMessage is a user-visible notice, not model context — not a retrieval channel",
  );
  // Its stdout contract is unchanged: the literal `echo '{}'` line.
  assert.match(hook, /^echo '\{\}'$/m, "the hook must still emit '{}' on stdout");
});
