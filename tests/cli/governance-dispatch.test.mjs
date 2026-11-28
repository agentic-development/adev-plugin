/**
 * CLI tests for `adev governance dispatch` — the Agent-ready reviewer dispatch
 * plan. The review-integrity sections that `buildReviewerDispatches` owns
 * (Truncated Context, Prior-Round Review) only reach a real reviewer through
 * this verb, so these tests drive it end to end over a temp project with a
 * materialized review.yaml.
 */

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "../../cli/index.mjs");

const SPEC = ".context-index/specs/features/demo/target.spec.md";
const PRIOR = ".context-index/specs/features/demo/target.review.md";
const BIG_SIBLING = `# Sibling\n${"Decision 11: principle 4 is satisfied by the adapter seam.\n".repeat(40)}`;

const REVIEW_YAML = `reviewers:
  - id: demo-consistency
    name: Demo Consistency
    dispatch: always
    profile: reviewer-fast
    context_pack: demo-siblings
    severity_cap: blocker
    prompt: prompts/demo-reviewer.md
  - id: demo-packaged
    name: Demo Packaged
    dispatch: always
    profile: reviewer-capable
    context_pack: demo-siblings
    package:
      skill: skills/demo-pkg/SKILL.md
  - id: demo-never
    dispatch: never
    prompt: prompts/demo-reviewer.md
context_packs:
  demo-siblings:
    max_file_bytes: 256
    include:
      - glob: <charter-dir>/*.spec.md
        exclude: ["<target-spec>"]
        title: Sibling Specs
materialized_at: 2026-11-19T00:00:00.000Z
`;

const PRIOR_REVIEW = `---
spec: ${SPEC}
verdict: BLOCK
last-reviewed-revision: 1
---

# Architecture Review: target

### CON-1 — blocker — violates constitution principle 4
`;

const tempDirs = [];
afterEach(() => {
  while (tempDirs.length) cleanupTempDir(tempDirs.pop());
});

function project({ prior = false, reviewYaml = REVIEW_YAML } = {}) {
  const root = createTempDir();
  tempDirs.push(root);
  writeFixture(root, ".context-index/manifest.yaml", "project:\n  name: demo\n");
  writeFixture(root, ".context-index/governance/review.yaml", reviewYaml);
  writeFixture(root, ".context-index/prompts/demo-reviewer.md", "# Demo reviewer\nReview it.\n");
  writeFixture(root, ".context-index/skills/demo-pkg/SKILL.md", "# Demo package skill\n");
  writeFixture(root, SPEC, "---\nrevision: 2\n---\n\n# Target\n\n## Behaviors\n\nDo the thing.\n");
  writeFixture(root, ".context-index/specs/features/demo/sibling.spec.md", BIG_SIBLING);
  if (prior) writeFixture(root, PRIOR, PRIOR_REVIEW);
  return root;
}

function dispatch(root, args) {
  return spawnSync("node", [CLI, "governance", "dispatch", ...args], { cwd: root, encoding: "utf8" });
}

function plan(root, extra = []) {
  const r = dispatch(root, ["--spec", SPEC, "--json", ...extra]);
  assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout.slice(0, 2000)}`);
  return JSON.parse(r.stdout);
}

test("selects reviewers via shouldDispatch and reports the selection", () => {
  const p = plan(project());
  assert.equal(p.tier, "full");
  assert.deepEqual(
    p.reviewers.map((r) => [r.id, r.dispatched]),
    [
      ["demo-consistency", true],
      ["demo-packaged", true],
      ["demo-never", false],
    ],
  );
  assert.equal(p.diff_scope.scoped, false);
});

test("each dispatch carries Agent-ready description, prompt and model fields", () => {
  const p = plan(project());
  const sub = p.dispatches.find((d) => d.reviewer_id === "demo-consistency");
  assert.equal(sub.stage, "subagent");
  assert.match(sub.description, /Demo Consistency review of target\.spec\.md/);
  assert.match(sub.prompt, /^Context below is delimited by fences bearing the token `ADEV-PACK-/);
  assert.match(sub.prompt, /# Demo reviewer/);
  assert.match(sub.prompt, /role="target-spec" path="\.context-index\/specs\/features\/demo\/target\.spec\.md"/);
  assert.ok("model" in sub);
  assert.ok(Array.isArray(sub.allowed_tools));
  assert.equal("env" in sub, false, "env values are never emitted");
});

test("package mode yields a runner and an adapter that expects the runner output", () => {
  const p = plan(project());
  const stages = p.dispatches.filter((d) => d.reviewer_id === "demo-packaged");
  assert.deepEqual(stages.map((d) => d.stage), ["runner", "adapter"]);
  assert.equal(stages[0].append_runner_output, false);
  assert.equal(stages[1].append_runner_output, true);
  assert.match(stages[0].prompt, /# Demo package skill/);
});

test("a truncated sibling spec yields the Truncated Context section", () => {
  const p = plan(project());
  const sub = p.dispatches.find((d) => d.reviewer_id === "demo-consistency");
  assert.match(sub.prompt, /…\[adev: truncated 256 of \d+ bytes of \.context-index\/specs\/features\/demo\/sibling\.spec\.md/);
  assert.match(sub.prompt, /## Truncated Context/);
  assert.match(sub.prompt, /quote the conflicting text/);
  const runner = p.dispatches.find((d) => d.stage === "runner");
  const adapter = p.dispatches.find((d) => d.stage === "adapter");
  assert.match(runner.prompt, /## Truncated Context/);
  assert.equal(adapter.prompt.includes("## Truncated Context"), false);
});

test("a prior .review.md yields the Prior-Round Review section", () => {
  const p = plan(project({ prior: true }));
  assert.deepEqual(p.prior_review, { path: PRIOR, verdict: "BLOCK", revision: 1 });
  for (const d of p.dispatches.filter((x) => x.stage !== "adapter")) {
    assert.match(d.prompt, /## Prior-Round Review/, d.reviewer_id);
    assert.match(d.prompt, /verdict: BLOCK/);
    assert.ok(d.prompt.includes(`role="prior-review" path="${PRIOR}"`));
    assert.match(d.prompt, /CON-1 — blocker — violates constitution principle 4/);
  }
});

test("no prior .review.md → no Prior-Round Review section", () => {
  const p = plan(project());
  assert.equal(p.prior_review, null);
  for (const d of p.dispatches) assert.equal(d.prompt.includes("## Prior-Round Review"), false);
});

test("--tier quick dispatches only the synthesized reviewer with the bundled prompt", () => {
  const p = plan(project({ prior: true }), ["--tier", "quick"]);
  assert.equal(p.tier, "quick");
  assert.deepEqual(p.dispatches.map((d) => [d.reviewer_id, d.stage]), [["quick-synthesized-reviewer", "subagent"]]);
  const [d] = p.dispatches;
  assert.match(d.prompt, /# Quick Synthesized Review/);
  assert.match(d.prompt, /## Prior-Round Review/);
});

test("--tier lite plans the quick reviewer set and prints the mapping line on stderr only", () => {
  const root = project({ prior: true });
  const r = dispatch(root, ["--spec", SPEC, "--tier", "lite", "--json"]);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  const p = JSON.parse(r.stdout);
  assert.equal(p.tier, "quick");
  assert.deepEqual(p.dispatches.map((d) => [d.reviewer_id, d.stage]), [["quick-synthesized-reviewer", "subagent"]]);
  assert.deepEqual(r.stderr.split("\n").filter(Boolean), ["--tier lite runs as quick for review-specs"]);
  assert.equal(r.stdout.includes("--tier lite runs as quick"), false);
});

test("--tier lite without --json reports tier quick in the header", () => {
  const r = dispatch(project(), ["--spec", SPEC, "--tier", "lite"]);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /\(tier: quick, harness: claude-code\)/);
  assert.match(r.stderr, /^--tier lite runs as quick for review-specs$/m);
});

test("an unknown --tier names all three legal values", () => {
  const r = dispatch(project(), ["--spec", SPEC, "--tier", "Lite", "--json"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^INVALID_TIER: --tier must be one of: full, quick, lite \(got "Lite"\)$/m);
  assert.equal(r.stdout, "");
});

test("argument and path errors exit 1", () => {
  const root = project();
  assert.equal(dispatch(root, ["--json"]).status, 1);
  assert.equal(dispatch(root, ["--spec", SPEC, "--tier", "medium"]).status, 1);
  assert.equal(dispatch(root, ["--spec", "../outside.spec.md"]).status, 1);
  assert.equal(dispatch(root, ["--spec", ".context-index/specs/features/demo/missing.spec.md"]).status, 1);
  const badHarness = dispatch(root, ["--spec", SPEC, "--harness", "nope", "--json"]);
  assert.equal(badHarness.status, 1);
  assert.match(badHarness.stdout, /UNKNOWN_HARNESS/);
});

test("an unmaterialized review.yaml fails closed", () => {
  const root = project({ reviewYaml: REVIEW_YAML.replace(/^materialized_at:.*$/m, "") });
  const r = dispatch(root, ["--spec", SPEC, "--json"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /REGISTRY_NOT_MATERIALIZED/);
});

test("--note values reach every reviewing prompt, fenced", () => {
  const p = plan(project(), ["--note", "Cross-repo dependency '@x/y' is superseded"]);
  for (const d of p.dispatches.filter((x) => x.stage !== "adapter")) {
    assert.match(d.prompt, /role="orchestrator-notes">>>\n- Cross-repo dependency '@x\/y' is superseded/);
  }
});
