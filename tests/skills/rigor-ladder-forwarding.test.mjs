// tests/skills/rigor-ladder-forwarding.test.mjs
//
// BEH-11: `lite` reaches /adev:implement only when the operator typed it, and
// every other consumer runs it as `quick`. These skill-text assertions pin the
// forwarding rules in /adev:build, /adev:work, /adev:review-specs and
// /adev:validate, and validate's `lite-report` advisory (BEH-10).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const BUILD_SKILL = join(PLUGIN_ROOT, "skills", "build", "SKILL.md");
const BUILD_ARGUMENTS = join(PLUGIN_ROOT, "skills", "build", "references", "arguments.md");
const BUILD_STEP4_REF = join(PLUGIN_ROOT, "skills", "build", "references", "pipeline", "step-4-implement.md");
const STEP4_COMPANION = join(PLUGIN_ROOT, "skills", "build", "step4-tier-propagation.md");
const WORK_SKILL = join(PLUGIN_ROOT, "skills", "work", "SKILL.md");
const REVIEW_SPECS_SKILL = join(PLUGIN_ROOT, "skills", "review-specs", "SKILL.md");
const VALIDATE_SKILL = join(PLUGIN_ROOT, "skills", "validate", "SKILL.md");
const VALIDATE_EXECUTION_STRATEGY = join(PLUGIN_ROOT, "skills", "validate", "references", "execution-strategy.md");
const VALIDATE_REPORT_FORMAT = join(PLUGIN_ROOT, "skills", "validate", "references", "report-format.md");
const VALIDATE_CHECK2_REF = join(
  PLUGIN_ROOT, "skills", "validate", "references", "checks-orchestration", "check-2-spec-compliance.md",
);

function read(path) {
  return readFileSync(path, "utf8");
}

function section(md, startHeading, endHeading) {
  const start = md.indexOf(startHeading);
  assert.notEqual(start, -1, `heading not found: ${startHeading}`);
  const end = md.indexOf(endHeading, start + startHeading.length);
  assert.notEqual(end, -1, `heading not found: ${endHeading}`);
  return md.slice(start, end);
}

test("build body documents --lite in its Arguments section", () => {
  const args = section(read(BUILD_SKILL), "## Arguments", "## Prerequisites");
  assert.match(args, /`--lite`[^\n]*forwarded to `\/adev:implement` only[^\n]*only when the operator passed it/);
});

test("build arguments reference lists lite and states each forwarding target", () => {
  const md = read(BUILD_ARGUMENTS);
  assert.match(md, /^- `--tier <full\|quick\|lite>`:/m);
  const lite = md.split("\n").find((line) => line.startsWith("- `--lite`:"));
  assert.ok(lite, "the --lite argument bullet is present");
  assert.match(lite, /reaches Step 4 as `--lite` on the `\/adev:implement` dispatch/);
  assert.match(lite, /Steps 1 and 5 receive `--tier lite` unchanged/);
  assert.match(lite, /never add it on your own/);
});

test("build forwards --lite to /adev:implement and --tier lite unchanged to review-specs and validate", () => {
  const md = read(STEP4_COMPANION);
  assert.match(md, /append `--lite` to the dispatched args so `\/adev:implement` receives/);
  assert.match(md, /Steps 1 and 5 forward `--tier lite` unchanged to `\/adev:review-specs` and `\/adev:validate`/);
});

test("both Step 4 pointers to the propagation companion are ADEV_ROOT-anchored", () => {
  const pointer =
    "Read `<ADEV_ROOT>/skills/build/step4-tier-propagation.md` for the `--tier` and `--lite` handoff to `/adev:implement`.";
  assert.ok(read(BUILD_SKILL).includes(pointer), "SKILL.md Step 4 pointer");
  assert.ok(read(BUILD_STEP4_REF).includes(pointer), "step-4-implement.md pointer");
  assert.doesNotMatch(read(BUILD_SKILL), /Read `skills\/build\/step4-tier-propagation\.md`/);
  assert.doesNotMatch(read(BUILD_STEP4_REF), /Read `skills\/build\/step4-tier-propagation\.md`/);
});

test("work forwards only operator-typed --lite/--tier lite", () => {
  const md = read(WORK_SKILL);
  assert.match(md, /`--lite`[^\n]*`--tier lite`[^\n]*only when the operator typed it/);
  assert.match(md, /only when the operator typed it[^\n]*[Nn]ever add[^\n]*on your own judgment/);
});

test("work names each lite forwarding target and keeps a typed --tier beside --lite", () => {
  const bullet = read(WORK_SKILL).split("\n").find((line) => line.includes("**Operator-typed `lite`:**"));
  assert.ok(bullet, "the operator-typed lite bullet is present");
  assert.match(bullet, /as `--lite` to `\/adev:implement`/);
  assert.match(bullet, /`--tier lite` alone, unchanged to `\/adev:review-specs` and `\/adev:validate`/);
  assert.match(bullet, /explicit `--tier full\|quick` they also typed \(never drop it; `check-flags` raises `CONFLICTING_TIER_FLAGS`\)/);
});

test("work's easy-work bullet still propagates --tier quick and never --lite", () => {
  const md = read(WORK_SKILL);
  const easy = md.split("\n").find((line) => line.includes('classify the work as "easy"'));
  assert.ok(easy, "the easy-work bullet is present");
  assert.match(easy, /propagate `--tier quick`/);
  assert.doesNotMatch(easy, /--lite|--tier lite/);
});

test("review-specs accepts --tier lite as quick with one printed line", () => {
  const md = read(REVIEW_SPECS_SKILL);
  assert.match(md, /`--tier <full\|quick\|lite>`[^\n]*`lite` runs exactly as `quick`/);
  assert.match(md, /`--tier lite runs as quick here`/);
});

test("review-specs precedence item 1 names lite and maps it to quick", () => {
  const step = section(read(REVIEW_SPECS_SKILL), "## Step 2.5: Resolve Rigor Tier", "## Step 3:");
  assert.match(step, /Resolve the \*\*rigor tier\*\* \(`full` \| `quick`\)[^\n]*`--tier lite` resolves to `quick`/);
  assert.match(step, /1\. \*\*Explicit `--tier <full\|quick\|lite>`\*\*[^\n]*`lite` runs exactly as `quick`/);
});

test("validate accepts --tier lite as quick with one printed line", () => {
  const args = section(read(VALIDATE_SKILL), "## Arguments", "## Prerequisites");
  assert.match(args, /`--tier <full\|quick\|lite>`[^\n]*`lite` runs exactly as `quick`/);
  assert.match(args, /`--tier lite runs as quick here`/);
});

test("validate's rigor-tier precedence item 1 names lite and maps it to quick", () => {
  const md = read(VALIDATE_EXECUTION_STRATEGY);
  assert.match(md, /Resolve the \*\*rigor tier\*\* \(`full` \| `quick`\)[^\n]*`--tier lite` resolves to `quick`/);
  assert.match(md, /1\. \*\*Explicit `--tier <full\|quick\|lite>`\*\*[^\n]*`lite` runs exactly as `quick`/);
  assert.doesNotMatch(md, /`--tier <full\|quick>`/);
});

test("validate calls adev implement lite-report and reports the advisory (WR-6)", () => {
  const md = read(VALIDATE_SKILL);
  assert.match(md, /adev implement lite-report --spec <spec-path> --json/);
  assert.match(md, /implemented without per-task review/);
});

test("lite tasks' diffs are in Check 2 scope in both tiers; validate is never skipped", () => {
  const check2 = section(read(VALIDATE_SKILL), "### Check 2: Spec Compliance", "### Check 4:");
  assert.match(check2, /lite-report/);
  assert.match(check2, /task_ids/);
  assert.match(check2, /`Plan-task:` trailer/);
  assert.match(check2, /quick tier's synthesized compliance check/);
  assert.match(check2, /never skipped/);
});

test("validate emits the advisory row only when the lite count is non-zero", () => {
  const body = section(read(VALIDATE_SKILL), "## Report Format", "## Overall Status");
  assert.match(body, /implemented without per-task review: <count> \(<task_ids>\)/);
  assert.match(body, /only when `count` is non-zero/);
  const template = read(VALIDATE_REPORT_FORMAT);
  assert.match(template, /> \*\*Advisory:\*\* implemented without per-task review: <count> \(<task_ids>\)/);
  assert.match(template, /[Oo]mit[^\n]*when `count` is 0/);
});

test("lite-report runs on every validate run, before Check 1, even when Check 1 fails fast or Check 2 is disabled", () => {
  const md = read(VALIDATE_SKILL);
  const step = section(md, "### Step 0b: Lite-task report", "## Workspace-Aware Validation Mode");
  assert.match(step, /adev implement lite-report --spec <spec-path> --json/);
  assert.match(step, /every validate run/);
  assert.match(step, /Check 1 fails fast/);
  assert.match(step, /Check 2 is disabled/);
  assert.match(step, /advisory is emitted/);
  assert.ok(md.indexOf("### Step 0b: Lite-task report") > md.indexOf("### Step 0a: Implement-step gate"));
  assert.ok(md.indexOf("### Step 0b: Lite-task report") < md.indexOf("### Check 1: Quality Gates"));
});

test("the full-tier Check 2 reference carries the lite-task scope step into the subagent's prompt", () => {
  const md = read(VALIDATE_CHECK2_REF);
  const scope = section(md, "**Lite-task scope", "**Cross-repo interface verification");
  assert.match(scope, /Step 0b/);
  assert.match(scope, /task_ids/);
  assert.match(scope, /Check 2 subagent's prompt/);
});

test("the quick tier's synthesized compliance check carries the same lite-task scope", () => {
  const bullet = read(VALIDATE_EXECUTION_STRATEGY)
    .split("\n")
    .find((line) => line.includes("**one synthesized compliance check**"));
  assert.ok(bullet, "the quick-tier synthesized-check bullet is present");
  assert.match(bullet, /lite-task scope/);
  assert.match(bullet, /check-2-spec-compliance\.md/);
  assert.match(bullet, /synthesized subagent's prompt/);
});

test("lite-task commits are selected with anchored trailer greps, then shown", () => {
  const scope = section(read(VALIDATE_CHECK2_REF), "**Lite-task scope", "**Cross-repo interface verification");
  assert.ok(
    scope.includes("git log --format=%H --all-match --grep='^Spec: <spec-path>$' --grep='^Plan-task: <n>$'"),
    "the per-task anchored grep is named exactly",
  );
  assert.ok(scope.includes("git show <sha>"), "each selected commit is read with git show");
  assert.match(scope, /`Plan-task: 1` must not match `Plan-task: 10`/);
});

test("both Spec-trailer greps say to escape the spec path and never use fixed strings", () => {
  const scope = section(read(VALIDATE_CHECK2_REF), "**Lite-task scope", "**Cross-repo interface verification");
  const rule =
    "Escape regex metacharacters in `<spec-path>` (at least `.` → `\\.`), and never pass `-F`/`--fixed-strings`: " +
    "it makes `^` and `$` literal, so the grep matches nothing and the scope is empty.";
  assert.equal(scope.split(rule).length - 1, 2, "the escaping rule sits beside each `^Spec:` grep");
});

test("lite task ids are normalized so t<n>, task-<n> and Task <n> match Plan-task: <n>", () => {
  const scope = section(read(VALIDATE_CHECK2_REF), "**Lite-task scope", "**Cross-repo interface verification");
  assert.match(scope, /`t<n>`[^\n]*`task-<n>`[^\n]*`Task <n>`[^\n]*`<n>`[^\n]*`Plan-task: <n>`/);
  assert.match(scope, /case-insensitive/);
});

test("an unmatched lite task id is a Check 2 PARTIAL", () => {
  const scope = section(read(VALIDATE_CHECK2_REF), "**Lite-task scope", "**Cross-repo interface verification");
  assert.match(scope, /PARTIAL[^\n]*"no commit found for lite task <id>"/);
});

test("a failed lite-report fails closed: unknown advisory and the scope widens to every commit of the spec", () => {
  const step = section(read(VALIDATE_SKILL), "### Step 0b: Lite-task report", "## Workspace-Aware Validation Mode");
  assert.match(step, /implemented without per-task review: unknown \(lite-report failed: <stderr>\)/);
  assert.match(step, /never skipped/);
  const scope = section(read(VALIDATE_CHECK2_REF), "**Lite-task scope", "**Cross-repo interface verification");
  assert.ok(
    scope.includes("git log --format=%H --grep='^Spec: <spec-path>$'"),
    "the widened, spec-only grep is named exactly",
  );
  assert.match(scope, /every commit whose `Spec:` trailer names this spec/);
  assert.match(
    read(VALIDATE_REPORT_FORMAT),
    /implemented without per-task review: unknown \(lite-report failed: <stderr>\)/,
  );
});

test("the advisory row writes task ids comma-separated, matching the verb's text mode", () => {
  assert.match(read(VALIDATE_REPORT_FORMAT), /`<task_ids>` is written comma-separated/);
});
