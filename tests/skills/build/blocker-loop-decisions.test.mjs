// Contract: the /adev:build review loop owns the operator decision round.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PLUGIN_ROOT } from "../../helpers.mjs";

const REFS = join(PLUGIN_ROOT, "skills", "build", "references");
const LOOP = readFileSync(join(REFS, "blocker-auto-retry-loop.md"), "utf8");
const STEP1 = readFileSync(join(REFS, "pipeline", "step-1-review.md"), "utf8");
const RESUME = readFileSync(join(REFS, "resume-mode.md"), "utf8");

// A dispatch site passes args to a review-specs run: either an `args="..."`
// attribute naming the skill, or a "Re-run `/adev:review-specs ...`" directive.
// Plain prose mentions of the skill are not sites.
function dispatchSites(text) {
  return text.split("\n").filter(
    (l) =>
      /skill="adev:review-specs"\s+args="/.test(l) ||
      /Re-run `\/adev:review-specs --spec/.test(l),
  );
}

function buildMarkdown(dir = join(PLUGIN_ROOT, "skills", "build")) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return buildMarkdown(p);
    return e.name.endsWith(".md") ? [p] : [];
  });
}

function step4(text) {
  const start = text.search(/^4\. \*\*Branch on `finding_class`\*\*/m);
  assert.ok(start >= 0, "loop step 4 not found");
  const end = text.slice(start).search(/^5\. \*\*Dispatch per-anchor authoring/m);
  assert.ok(end > 0, "loop step 5 not found");
  return text.slice(start, start + end);
}

function resumeSection() {
  const start = RESUME.search(/^### Resuming a `DECISION_REQUIRED` halt/m);
  assert.ok(start >= 0, "resume subsection not found");
  const rest = RESUME.slice(start).replace(/^.*\n/, "");
  const end = rest.search(/^#{2,3} /m);
  return end < 0 ? rest : rest.slice(0, end);
}

describe("review dispatches defer decisions", () => {
  it("every /adev:review-specs dispatch site under skills/build carries --defer-decisions", () => {
    const sites = buildMarkdown().flatMap((f) =>
      dispatchSites(readFileSync(f, "utf8")).map((l) => `${f}: ${l}`),
    );
    assert.ok(sites.length >= 2, `expected at least the 2 known sites, found ${sites.length}`);
    assert.ok(sites.some((s) => s.includes("step-1-review.md")), "step-1-review.md site missing");
    assert.ok(sites.some((s) => s.includes("blocker-auto-retry-loop.md")), "loop step 6 site missing");
    for (const s of sites) assert.match(s, /--defer-decisions/, s);
  });

  it("step-1-review.md states why: the review subagent has no operator", () => {
    assert.match(STEP1, /review subagent has no operator/);
  });
});

describe("loop step 4: decision_blocker_ids branch", () => {
  const s4 = step4(LOOP);
  const bullets = s4.split(/^ {5}- (?=\*\*)/m).slice(1);
  const budget = bullets.find((b) => b.startsWith("**`retries_remaining` is 0"));
  const auto = bullets.find((b) => b.startsWith("**`--auto`"));
  const interactive = bullets.find((b) => b.startsWith("**Interactive"));

  it("splits into exactly three decision bullets: budget, --auto, interactive, in that order", () => {
    assert.equal(bullets.length, 3);
    assert.ok(budget && auto && interactive, "a decision bullet is missing");
    assert.deepEqual(bullets, [budget, auto, interactive]);
    assert.match(s4, /The budget is checked first, in any mode/);
  });

  it("the budget bullet covers --auto, exits LOOP_BUDGET_EXHAUSTED and runs no ask round", () => {
    assert.match(budget, /^\*\*`retries_remaining` is 0, in any mode including `--auto`:\*\* exit `LOOP_BUDGET_EXHAUSTED`/);
    assert.match(budget, /no ask round runs/);
    assert.match(budget, /lists each open decision with its question and options/);
  });

  it("the --auto bullet applies only with retries remaining and halts DECISION_REQUIRED without asking", () => {
    assert.match(auto, /^\*\*`--auto` with `retries_remaining > 0`:\*\*/);
    assert.match(auto, /halt `DECISION_REQUIRED` without asking/);
    assert.match(auto, /every pending decision with its question and options/);
    assert.match(auto, /adev decisions record[^\n]*then `\/adev:build --resume`/);
  });

  it("interactive branch runs pending, record, then group-blockers, in that order", () => {
    const p = interactive.indexOf("adev decisions pending --spec <spec-path> --json");
    const ask = interactive.indexOf("step-8-decision-ask-round.md");
    const r = interactive.indexOf("adev decisions record");
    const g = interactive.indexOf("adev specify group-blockers", r);
    assert.ok(p >= 0 && ask > p && r > ask && g > r, `order pending=${p} ask=${ask} record=${r} group=${g}`);
  });

  it("the ask round is run by the top-level orchestrator, never the review subagent", () => {
    assert.match(s4, /top-level orchestrator runs the ask round/);
    assert.match(s4, /never the review subagent/);
  });

  it("at most one ask round per review cycle, dispatching no reviewer and consuming no retry", () => {
    assert.match(interactive, /At most one ask round runs per review cycle/);
    assert.match(interactive, /dispatches no reviewer and consumes no retry/);
  });

  it("no open decision after the round continues to step 5; an open one halts DECISION_REQUIRED", () => {
    assert.match(interactive, /no open `decision_blocker_ids` remain[^.]*continue to step 5 in the same cycle/);
    assert.match(interactive, /still open after the round[^.]*`DECISION_REQUIRED`/);
  });
});

describe("resume-mode.md: DECISION_REQUIRED re-entry", () => {
  it("re-enters loop step 4 (group-blockers), never re-dispatching review", () => {
    const s = resumeSection();
    assert.match(s, /`adev build-state read --spec <path>`/);
    assert.match(s, /`review` step with `status: failed` and `verdict: DECISION_REQUIRED`/);
    assert.match(s, /re-enters the loop at step 4/);
    assert.match(s, /adev specify group-blockers/);
    assert.match(s, /never re-dispatches `\/adev:review-specs`/);
    assert.match(s, /rewrite `\.blockers\.md` and discard the recorded answers/);
  });

  it("a repeated open decision repeats the halt; otherwise the loop continues at step 5", () => {
    const s = resumeSection();
    assert.match(s, /open `decision_blocker_ids`[^.]*halt repeats/);
    assert.match(s, /continues at step 5 \(authoring, then revise\) on the same revision/);
  });

  it("re-seeds retries_remaining from build.max_review_retries, never reading it from build state", () => {
    const s = resumeSection();
    assert.match(s, /`retries_remaining` is re-seeded from `build\.max_review_retries`/);
    assert.match(s, /resume is the budget boundary/);
    assert.doesNotMatch(s, /read from build state/);
  });

  it("names BLOCKERS_REVISION_MISMATCH as the stale-sidecar signal requiring a fresh review", () => {
    const s = resumeSection();
    assert.match(s, /`BLOCKERS_REVISION_MISMATCH`[^.]*stale/);
    assert.match(s, /hand-edited/);
    assert.match(s, /fresh `\/adev:review-specs`/);
  });
});
