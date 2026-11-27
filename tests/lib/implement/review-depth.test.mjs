// tests/lib/implement/review-depth.test.mjs
//
// resolveImplementReviewDepth: the `--tier full` absolute, the baseline
// (`quick` unless a policy or `--tier quick` says otherwise), and the floor
// legs that raise a task to `full` (risk-level, routing, boundary,
// sensitive-path, critical-finding). The final pass evaluates the boundary and
// sensitive-path legs on every touched path as well as the declared ones.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveImplementReviewDepth, computeTouchedFiles } from "../../../lib/implement/review-depth.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";

const SPEC = ".context-index/specs/features/m/my-spec.spec.md";
const OWN_LOG = ".context-index/lifecycle-state/my-spec.jsonl";

const base = { spec: { risk_level: "medium", specPath: SPEC }, policies: {}, task: { id: "1", declared_files: ["lib/a.mjs"] } };
const auto = { selected_agent: "auto-agent", scores: { spec_completeness: 0.8, pattern_coverage: 0.8, blast_radius: 0.8, novelty: 0.8 } };
const assisted = { ...auto, selected_agent: "assisted-agent" };
const humanOnly = { ...auto, selected_agent: "human-only" };

const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });

function repo(files = { "lib/a.mjs": "export {};\n" }) {
  const dir = createTempDir();
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.com");
  git(dir, "config", "user.name", "t");
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", "base");
  return { dir, head: git(dir, "rev-parse", "HEAD").trim() };
}

function write(dir, rel, body = "x\n") {
  mkdirSync(join(dir, rel, ".."), { recursive: true });
  writeFileSync(join(dir, rel), body);
}

function finalPass(dir, baseSha, overrides = {}) {
  return resolveImplementReviewDepth({ ...base, routingEntry: auto, pass: "final", baseSha, projectRoot: dir, ...overrides });
}

// ── baseline ────────────────────────────────────────────────────────────────

test("no policy and no tier resolves quick with source default-quick", () => {
  const r = resolveImplementReviewDepth({ ...base, routingEntry: auto, pass: "provisional" });
  assert.equal(r.depth, "quick");
  assert.equal(r.source, "default-quick");
  assert.deepEqual(r.floor_legs, []);
  assert.equal(r.floor_applied, false);
  assert.deepEqual(r.warnings, []);
});

test("an absent policies map, or a policy for another risk level only, also falls back to default-quick", () => {
  for (const policies of [undefined, null, { low: { implement_mode: "full" } }, { medium: {} }, { medium: { implement_mode: null } }]) {
    const r = resolveImplementReviewDepth({ ...base, policies, routingEntry: auto, pass: "provisional" });
    assert.equal(r.depth, "quick", `policies=${JSON.stringify(policies)}`);
    assert.equal(r.source, "default-quick", `policies=${JSON.stringify(policies)}`);
  }
});

test("a spec with no risk_level is looked up as medium", () => {
  const r = resolveImplementReviewDepth({
    ...base, spec: { specPath: SPEC }, policies: { medium: { implement_mode: "full" } }, routingEntry: auto, pass: "provisional",
  });
  assert.equal(r.depth, "full");
  assert.equal(r.source, "policy-baseline");
});

test("policy implement_mode quick resolves quick with source policy-baseline", () => {
  const r = resolveImplementReviewDepth({ ...base, policies: { medium: { implement_mode: "quick" } }, routingEntry: auto, pass: "provisional" });
  assert.equal(r.depth, "quick");
  assert.equal(r.source, "policy-baseline");
  assert.deepEqual(r.floor_legs, []);
});

test("policy implement_mode full resolves full with source policy-baseline and no floor leg", () => {
  const r = resolveImplementReviewDepth({ ...base, policies: { medium: { implement_mode: "full" } }, routingEntry: auto, pass: "provisional" });
  assert.equal(r.depth, "full");
  assert.equal(r.source, "policy-baseline");
  assert.deepEqual(r.floor_legs, []);
  assert.equal(r.floor_applied, false);
  assert.deepEqual(r.warnings, []);
});

test("policy implement_mode lite maps to the quick baseline with source policy-baseline", () => {
  const r = resolveImplementReviewDepth({ ...base, policies: { medium: { implement_mode: "lite" } }, routingEntry: undefined, pass: "provisional" });
  assert.equal(r.depth, "quick");
  assert.equal(r.source, "policy-baseline");
  assert.equal(r.lite_denied, "no-routing-entry");
});

test("a policy implement_mode outside the rigor modes throws INVALID_TIER naming the level", () => {
  assert.throws(
    () => resolveImplementReviewDepth({ ...base, policies: { medium: { implement_mode: "not-a-real-tier" } }, routingEntry: auto, pass: "provisional" }),
    (err) => err.code === "INVALID_TIER" && err.level === "medium" && err.field === "implement_mode",
  );
});

test("--tier full is absolute: full, tier-full-absolute, no floor consulted even for high-risk human-only", () => {
  const r = resolveImplementReviewDepth({
    ...base, spec: { ...base.spec, risk_level: "high" }, routingEntry: humanOnly, tierFlag: "full",
    policies: { high: { implement_mode: "quick" } }, boundaryCrossing: true, pass: "provisional",
  });
  assert.equal(r.depth, "full");
  assert.equal(r.source, "tier-full-absolute");
  assert.deepEqual(r.floor_legs, []);
  assert.equal(r.floor_applied, false);
  assert.deepEqual(r.warnings, []);
});

test("--tier full on the final pass returns before any diff is needed", () => {
  const r = resolveImplementReviewDepth({ ...base, routingEntry: auto, tierFlag: "full", pass: "final" });
  assert.equal(r.source, "tier-full-absolute");
});

test("explicit --tier quick records policy-baseline and outranks a policy full", () => {
  const r = resolveImplementReviewDepth({ ...base, policies: { medium: { implement_mode: "full" } }, routingEntry: auto, tierFlag: "quick", pass: "provisional" });
  assert.equal(r.depth, "quick");
  assert.equal(r.source, "policy-baseline");
  assert.deepEqual(r.floor_legs, []);
});

test("explicit --tier quick with no policy still records policy-baseline, not default-quick", () => {
  const r = resolveImplementReviewDepth({ ...base, routingEntry: auto, tierFlag: "quick", pass: "provisional" });
  assert.equal(r.depth, "quick");
  assert.equal(r.source, "policy-baseline");
});

test("--tier quick keeps the floor: a human-only task under --tier quick resolves full", () => {
  const r = resolveImplementReviewDepth({ ...base, routingEntry: humanOnly, tierFlag: "quick", pass: "provisional" });
  assert.equal(r.depth, "full");
  assert.equal(r.source, "policy-baseline");
  assert.deepEqual(r.floor_legs, ["routing"]);
});

test("--tier lite does not outrank the policy: an ineligible task resolves the policy baseline", () => {
  const withPolicy = resolveImplementReviewDepth({ ...base, policies: { medium: { implement_mode: "full" } }, routingEntry: undefined, tierFlag: "lite", pass: "provisional" });
  assert.equal(withPolicy.depth, "full");
  assert.equal(withPolicy.source, "policy-baseline");
  assert.deepEqual(withPolicy.floor_legs, []);

  const noPolicy = resolveImplementReviewDepth({ ...base, routingEntry: undefined, tierFlag: "lite", pass: "provisional" });
  assert.equal(noPolicy.depth, "quick");
  assert.equal(noPolicy.source, "default-quick");
});

test("an unknown --tier throws INVALID_TIER", () => {
  assert.throws(
    () => resolveImplementReviewDepth({ ...base, routingEntry: auto, tierFlag: "bogus", pass: "provisional" }),
    (err) => err.code === "INVALID_TIER",
  );
});

// ── retired grant rows: routing and file-set shape no longer deny quick ──────

test("editing a declared file, a batched task, an assisted-agent task resolve quick", () => {
  for (const routingEntry of [auto, assisted]) {
    const r = resolveImplementReviewDepth({ ...base, routingEntry, task: { ...base.task, additive_only: false, in_batch: true }, pass: "provisional" });
    assert.equal(r.depth, "quick", `selected_agent=${routingEntry.selected_agent}`);
    assert.deepEqual(r.floor_legs, []);
  }
});

test("low routing scores, out-of-range scores and a missing routing entry no longer deny quick", () => {
  const entries = [
    { ...auto, scores: { ...auto.scores, novelty: 0.4 } },
    { ...auto, scores: { ...auto.scores, novelty: 5 } },
    { ...auto, scores: { ...auto.scores, blast_radius: NaN } },
    null,
    undefined,
  ];
  for (const routingEntry of entries) {
    const r = resolveImplementReviewDepth({ ...base, routingEntry, pass: "provisional" });
    assert.equal(r.depth, "quick", `routingEntry=${JSON.stringify(routingEntry)}`);
    assert.equal(r.source, "default-quick");
    assert.deepEqual(r.floor_legs, []);
  }
});

test("task.in_batch is ignored: no batched-task leg on either pass", (t) => {
  const { dir, head } = repo();
  t.after(() => cleanupTempDir(dir));
  const prov = resolveImplementReviewDepth({ ...base, routingEntry: auto, task: { ...base.task, in_batch: true }, pass: "provisional" });
  const fin = finalPass(dir, head, { task: { ...base.task, in_batch: true } });
  for (const r of [prov, fin]) {
    assert.equal(r.depth, "quick");
    assert.deepEqual(r.floor_legs, []);
  }
});

// ── floor legs ───────────────────────────────────────────────────────────────

test("high-risk: auto-agent resolves quick, assisted-agent resolves full via risk-level", () => {
  const spec = { ...base.spec, risk_level: "high" };
  const viaAuto = resolveImplementReviewDepth({ ...base, spec, routingEntry: auto, pass: "provisional" });
  assert.equal(viaAuto.depth, "quick");
  assert.deepEqual(viaAuto.floor_legs, []);
  const r = resolveImplementReviewDepth({ ...base, spec, routingEntry: assisted, pass: "provisional" });
  assert.equal(r.depth, "full");
  assert.deepEqual(r.floor_legs, ["risk-level"]);
  assert.equal(r.floor_applied, true);
});

test("high-risk with no routing entry is not routed auto-agent, so risk-level holds", () => {
  const spec = { ...base.spec, risk_level: "high" };
  for (const routingEntry of [null, undefined, { selected_agent: "auto-agent-ish" }]) {
    const r = resolveImplementReviewDepth({ ...base, spec, routingEntry, pass: "provisional" });
    assert.equal(r.depth, "full");
    assert.deepEqual(r.floor_legs, ["risk-level"]);
  }
});

test("risk-level never fires below high, whatever the routing", () => {
  for (const risk_level of ["low", "medium"]) {
    const r = resolveImplementReviewDepth({ ...base, spec: { ...base.spec, risk_level }, routingEntry: assisted, pass: "provisional" });
    assert.ok(!r.floor_legs.includes("risk-level"), `risk_level=${risk_level}`);
  }
});

test("human-only forces full via the routing leg", () => {
  const r = resolveImplementReviewDepth({ ...base, routingEntry: humanOnly, pass: "provisional" });
  assert.deepEqual(r.floor_legs, ["routing"]);
  assert.equal(r.depth, "full");
});

test("a high-risk human-only task holds both risk-level and routing", () => {
  const r = resolveImplementReviewDepth({ ...base, spec: { ...base.spec, risk_level: "high" }, routingEntry: humanOnly, pass: "provisional" });
  assert.deepEqual([...r.floor_legs].sort(), ["risk-level", "routing"]);
  assert.equal(r.depth, "full");
});

test("sensitive declared path and boundary crossing force full; critical-finding only on final", (t) => {
  const sensitive = resolveImplementReviewDepth({
    ...base, routingEntry: auto, targetPaths: ["lib/governance/rigor-mode.mjs"], sensitivePaths: ["lib/governance/**"], pass: "provisional",
  });
  assert.equal(sensitive.depth, "full");
  assert.deepEqual(sensitive.floor_legs, ["sensitive-path"]);

  const builtIn = resolveImplementReviewDepth({ ...base, routingEntry: auto, targetPaths: ["src/auth/session.ts"], pass: "provisional" });
  assert.deepEqual(builtIn.floor_legs, ["sensitive-path"]);

  const boundary = resolveImplementReviewDepth({ ...base, routingEntry: auto, boundaryCrossing: true, pass: "provisional" });
  assert.equal(boundary.depth, "full");
  assert.deepEqual(boundary.floor_legs, ["boundary"]);

  const criticalProvisional = resolveImplementReviewDepth({
    ...base, routingEntry: auto, task: { ...base.task, had_critical_finding: true }, pass: "provisional",
  });
  assert.equal(criticalProvisional.depth, "quick");
  assert.deepEqual(criticalProvisional.floor_legs, []);

  const { dir, head } = repo();
  t.after(() => cleanupTempDir(dir));
  const criticalFinal = finalPass(dir, head, { task: { ...base.task, had_critical_finding: true } });
  assert.equal(criticalFinal.depth, "full");
  assert.deepEqual(criticalFinal.floor_legs, ["critical-finding"]);
});

test("declared-path boundary and sensitive-path legs also hold on the final pass with nothing touched", (t) => {
  const { dir, head } = repo();
  t.after(() => cleanupTempDir(dir));
  const r = finalPass(dir, head, { boundaryCrossing: true, targetPaths: ["lib/governance/x.mjs"], sensitivePaths: ["lib/governance/**"] });
  assert.equal(r.depth, "full");
  assert.deepEqual([...r.floor_legs].sort(), ["boundary", "sensitive-path"]);
});

test("a declared path that matches no sensitive glob holds no leg", () => {
  const r = resolveImplementReviewDepth({ ...base, routingEntry: auto, targetPaths: ["lib/a.mjs"], sensitivePaths: ["lib/governance/**"], pass: "provisional" });
  assert.deepEqual(r.floor_legs, []);
  assert.equal(r.depth, "quick");
});

test("REVIEW_DEPTH_FLOOR_APPLIED names the legs and fires even when the baseline was already full", () => {
  const r = resolveImplementReviewDepth({
    ...base, policies: { medium: { implement_mode: "full" } }, routingEntry: humanOnly, pass: "provisional",
  });
  assert.equal(r.depth, "full");
  assert.equal(r.source, "policy-baseline");
  assert.equal(r.floor_applied, true);
  const floorWarnings = r.warnings.filter((w) => w.code === "REVIEW_DEPTH_FLOOR_APPLIED");
  assert.equal(floorWarnings.length, 1);
  assert.deepEqual(floorWarnings[0].legs, ["routing"]);
});

test("the floor keeps the baseline's source: default-quick raised to full still records default-quick", () => {
  const r = resolveImplementReviewDepth({ ...base, routingEntry: humanOnly, pass: "provisional" });
  assert.equal(r.depth, "full");
  assert.equal(r.source, "default-quick");
});

// ── final pass: touched paths ───────────────────────────────────────────────

test("final pass: undeclared non-sensitive touch no longer forces full (scope-mismatch retired from the floor)", (t) => {
  const { dir, head } = repo();
  t.after(() => cleanupTempDir(dir));
  write(dir, "lib/undeclared.mjs");
  write(dir, "lib/a.mjs", "export const changed = 1;\n");
  const r = finalPass(dir, head, { task: { ...base.task, in_batch: true } });
  assert.equal(r.depth, "quick");
  assert.ok(!r.floor_legs.includes("scope-mismatch"));
  assert.ok(!r.floor_legs.includes("batched-task"));
  assert.deepEqual(r.floor_legs, []);
});

test("final pass: deleting an out-of-scope file or a rename pair does not force full", (t) => {
  const { dir, head } = repo({ "lib/a.mjs": "a\n", "gone.txt": "1\n", "old.txt": "shared content for rename detection\n" });
  t.after(() => cleanupTempDir(dir));
  git(dir, "rm", "-q", "gone.txt");
  git(dir, "mv", "old.txt", "new.txt");
  const r = finalPass(dir, head);
  assert.equal(r.depth, "quick");
  assert.deepEqual(r.floor_legs, []);
});

test("final pass: touched sensitive or boundary path forces full even when undeclared", (t) => {
  const { dir, head } = repo();
  t.after(() => cleanupTempDir(dir));
  write(dir, "lib/governance/x.mjs");
  const sensitive = finalPass(dir, head, { targetPaths: ["lib/a.mjs"], sensitivePaths: ["lib/governance/**"] });
  assert.equal(sensitive.depth, "full");
  assert.ok(sensitive.floor_legs.includes("sensitive-path"));

  rmSync(join(dir, "lib/governance"), { recursive: true });
  write(dir, "lib/b.mjs");
  const seen = [];
  const boundary = finalPass(dir, head, {
    targetPaths: ["lib/a.mjs"],
    boundaryCheck: (paths) => {
      seen.push([...paths]);
      return paths.includes("lib/b.mjs");
    },
  });
  assert.equal(boundary.depth, "full");
  assert.deepEqual(boundary.floor_legs, ["boundary"]);
  assert.deepEqual(seen, [["lib/b.mjs"]]);
});

test("final pass: a built-in sensitive path touched outside the declared set forces full", (t) => {
  const { dir, head } = repo();
  t.after(() => cleanupTempDir(dir));
  write(dir, "docs/.env.local", "TOKEN=x\n");
  const r = finalPass(dir, head, { targetPaths: ["lib/a.mjs"] });
  assert.equal(r.depth, "full");
  assert.deepEqual(r.floor_legs, ["sensitive-path"]);
});

test("final pass: deleting a tracked sensitive file forces full", (t) => {
  const { dir, head } = repo({ "lib/a.mjs": "a\n", "lib/governance/old.mjs": "o\n" });
  t.after(() => cleanupTempDir(dir));
  git(dir, "rm", "-q", "lib/governance/old.mjs");
  const r = finalPass(dir, head, { sensitivePaths: ["lib/governance/**"] });
  assert.deepEqual(r.floor_legs, ["sensitive-path"]);
});

test("final pass: a sensitive path both declared and touched is named once", (t) => {
  const { dir, head } = repo();
  t.after(() => cleanupTempDir(dir));
  write(dir, "lib/governance/x.mjs");
  const r = finalPass(dir, head, {
    targetPaths: ["lib/governance/x.mjs"], sensitivePaths: ["lib/governance/**"],
    boundaryCrossing: true, boundaryCheck: () => true,
  });
  assert.deepEqual([...r.floor_legs].sort(), ["boundary", "sensitive-path"]);
});

test("final pass: without a boundaryCheck the touched-path boundary leg is skipped", (t) => {
  const { dir, head } = repo();
  t.after(() => cleanupTempDir(dir));
  write(dir, "lib/b.mjs");
  const r = finalPass(dir, head);
  assert.equal(r.depth, "quick");
  assert.deepEqual(r.floor_legs, []);
});

test("final pass: boundaryCheck is not called when nothing was touched", (t) => {
  const { dir, head } = repo();
  t.after(() => cleanupTempDir(dir));
  let calls = 0;
  const r = finalPass(dir, head, { boundaryCheck: () => { calls += 1; return true; } });
  assert.equal(calls, 0);
  assert.deepEqual(r.floor_legs, []);
});

test("provisional pass never computes touched files or calls boundaryCheck", () => {
  let calls = 0;
  const r = resolveImplementReviewDepth({
    ...base, routingEntry: auto, pass: "provisional", projectRoot: "/nonexistent/not-a-repo",
    boundaryCheck: () => { calls += 1; return true; },
  });
  assert.equal(calls, 0);
  assert.equal(r.depth, "quick");
});

// The current spec's own lifecycle log is written by the orchestrator during
// every task; a status-M touch to it is excluded from the touched-path legs,
// and nothing wider is.
test("own lifecycle log: a status-M touch is excluded from the touched-path legs", (t) => {
  const { dir, head } = repo({ "lib/a.mjs": "a\n", [OWN_LOG]: "{}\n" });
  t.after(() => cleanupTempDir(dir));
  write(dir, OWN_LOG, "{}\n{}\n");
  const r = finalPass(dir, head, { sensitivePaths: [".context-index/lifecycle-state/**"] });
  assert.equal(r.depth, "quick");
  assert.deepEqual(r.floor_legs, []);
});

test("own lifecycle log: status A, status D and another spec's log are not excluded", (t) => {
  const sensitivePaths = [".context-index/lifecycle-state/**"];

  const added = repo();
  t.after(() => cleanupTempDir(added.dir));
  write(added.dir, OWN_LOG, "{}\n");
  assert.deepEqual(finalPass(added.dir, added.head, { sensitivePaths }).floor_legs, ["sensitive-path"]);

  const deleted = repo({ "lib/a.mjs": "a\n", [OWN_LOG]: "{}\n" });
  t.after(() => cleanupTempDir(deleted.dir));
  git(deleted.dir, "rm", "-q", OWN_LOG);
  assert.deepEqual(finalPass(deleted.dir, deleted.head, { sensitivePaths }).floor_legs, ["sensitive-path"]);

  const other = ".context-index/lifecycle-state/other-spec.jsonl";
  const another = repo({ "lib/a.mjs": "a\n", [other]: "{}\n" });
  t.after(() => cleanupTempDir(another.dir));
  write(another.dir, other, "{}\n{}\n");
  assert.deepEqual(finalPass(another.dir, another.head, { sensitivePaths }).floor_legs, ["sensitive-path"]);
});

test("MISSING_DIFF_RANGE: the final pass without a baseSha throws, with or without declared files", () => {
  for (const task of [base.task, { id: "1" }]) {
    assert.throws(
      () => resolveImplementReviewDepth({ ...base, task, routingEntry: auto, pass: "final", projectRoot: "/tmp/does-not-matter" }),
      (err) => err.code === "MISSING_DIFF_RANGE",
    );
  }
});

test("computeTouchedFiles: no baseSha throws MISSING_DIFF_RANGE", () => {
  assert.throws(
    () => computeTouchedFiles("/tmp/does-not-matter", undefined),
    (err) => err.code === "MISSING_DIFF_RANGE",
  );
});

test("two tasks in the same run resolve independently", () => {
  const easy = resolveImplementReviewDepth({ ...base, routingEntry: auto, pass: "provisional" });
  const hard = resolveImplementReviewDepth({ ...base, task: { id: "2", declared_files: ["lib/b.mjs"] }, routingEntry: humanOnly, pass: "provisional" });
  assert.equal(easy.depth, "quick");
  assert.equal(hard.depth, "full");
});
