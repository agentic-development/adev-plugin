// tests/lib/implement/review-depth-lite-grant.test.mjs
//
// The lite grant: liteEligible (an entry routed auto-agent or assisted-agent,
// scores ignored), liteGrant (the four conditions in order, naming the first
// that fails), the lite cap (a boundary or sensitive-path floor gives quick
// under lite authorization on a spec that is not high-risk) and the
// resolver's lite_denied / lite_source / escalated_from / floor_cap output
// fields.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  liteEligible,
  liteGrant,
  resolveImplementReviewDepth,
  snapshotWorkingTree,
} from "../../../lib/implement/review-depth.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";

const SPEC = ".context-index/specs/features/m/my-spec.spec.md";
const s = (spec_completeness, pattern_coverage, blast_radius, novelty) => ({ spec_completeness, pattern_coverage, blast_radius, novelty });
const auto = { selected_agent: "auto-agent", scores: s(0.8, 0.8, 0.8, 0.8) };
const assisted = { ...auto, selected_agent: "assisted-agent" };
const base = { spec: { risk_level: "medium", specPath: SPEC }, policies: {}, task: { id: "1", declared_files: ["lib/a.mjs"] }, routingEntry: auto, pass: "provisional" };
const withPolicyLite = (overrides) => ({ ...base, policies: { medium: { implement_mode: "lite" } }, ...overrides });

// ── liteEligible ────────────────────────────────────────────────────────────

test("liteEligible: auto-agent and assisted-agent are eligible whatever their scores", () => {
  for (const selected_agent of ["auto-agent", "assisted-agent"]) {
    for (const scores of [s(0.8, 0.8, 0.8, 0.8), s(0.4, 0.4, 0.4, 0.4), s("0.8", 0.8, 0.8, 0.8), s(NaN, 1.2, -0.1, Infinity), undefined, null]) {
      const r = liteEligible({ selected_agent, scores });
      assert.deepEqual(r, { eligible: true, warnings: [] }, `${selected_agent} ${JSON.stringify(scores)}`);
    }
    assert.deepEqual(liteEligible({ selected_agent }), { eligible: true, warnings: [] }, `${selected_agent} without scores`);
  }
});

test("liteEligible: human-only, a missing entry and an unknown selected_agent are not eligible, and none warns", () => {
  for (const entry of [{ selected_agent: "human-only", scores: s(1, 1, 1, 1) }, null, undefined, {}, { selected_agent: "robot" }, { selected_agent: "Auto-Agent" }]) {
    assert.deepEqual(liteEligible(entry), { eligible: false, warnings: [] }, JSON.stringify(entry));
  }
});

test("the module exports no lite score threshold", async () => {
  const mod = await import("../../../lib/implement/review-depth.mjs");
  assert.equal("LITE_GRANT_THRESHOLD" in mod, false);
});

// ── liteGrant truth table ───────────────────────────────────────────────────

function fixtureFor({ a, b, c, d }) {
  return {
    authorized: a,
    routingEntry: b ? auto : undefined,
    riskLevel: c === "high-risk" ? "high" : "medium",
    provisionalLegs: c === "floor:sensitive-path" ? ["sensitive-path"] : [],
    parallel: !d,
  };
}

// (a) authorized, (b) eligible, (c) not-high & no provisional floor leg, (d) not parallel.
for (const a of [true, false]) for (const b of [true, false]) for (const c of ["ok", "high-risk", "floor:sensitive-path"]) for (const d of [true, false]) {
  test(`liteGrant a=${a} b=${b} c=${c} d=${d}`, () => {
    const r = liteGrant(fixtureFor({ a, b, c, d }));
    const granted = a && b && c === "ok" && d;
    assert.equal(r.granted, granted);
    const expected = !a ? "not-authorized" : !b ? "no-routing-entry" : c !== "ok" ? c : !d ? "parallel" : null;
    assert.equal(r.lite_denied, expected);
  });
}

test("liteGrant (c): high-risk is reported before a floor leg, and the first floor leg is named", () => {
  const highAndFloor = liteGrant({ authorized: true, routingEntry: auto, riskLevel: "high", provisionalLegs: ["boundary"], parallel: false });
  assert.equal(highAndFloor.lite_denied, "high-risk");
  const twoLegs = liteGrant({ authorized: true, routingEntry: auto, riskLevel: "low", provisionalLegs: ["boundary", "sensitive-path"], parallel: false });
  assert.equal(twoLegs.lite_denied, "floor:boundary");
});

test("liteGrant: scores are not consulted; an assisted-agent entry or an out-of-range score is granted without a warning", () => {
  for (const routingEntry of [assisted, { selected_agent: "auto-agent", scores: s(0.8, 0.8, 5, 0.8) }, { selected_agent: "auto-agent", scores: s(0.4, "0.8", NaN, 0.8) }]) {
    const r = liteGrant({ authorized: true, routingEntry, riskLevel: "low", provisionalLegs: [], parallel: false });
    assert.deepEqual(r, { granted: true, lite_denied: null, warnings: [] }, JSON.stringify(routingEntry));
  }
});

test("liteGrant: a missing or unknown entry is no-routing-entry; a human-only entry is floor:routing", () => {
  for (const routingEntry of [undefined, null, {}, { selected_agent: "robot" }]) {
    const r = liteGrant({ authorized: true, routingEntry, riskLevel: "low", provisionalLegs: [], parallel: false });
    assert.equal(r.lite_denied, "no-routing-entry", JSON.stringify(routingEntry));
    assert.deepEqual(r.warnings, []);
  }
  const humanOnly = { selected_agent: "human-only", scores: s(1, 1, 1, 1) };
  assert.equal(liteGrant({ authorized: true, routingEntry: humanOnly, riskLevel: "low", provisionalLegs: [], parallel: false }).lite_denied, "floor:routing");
  assert.equal(
    liteGrant({ authorized: true, routingEntry: humanOnly, riskLevel: "low", provisionalLegs: ["routing"], parallel: false }).lite_denied,
    "floor:routing",
  );
  assert.equal(liteGrant({ authorized: false, routingEntry: humanOnly, riskLevel: "low" }).lite_denied, "not-authorized");
});

test("liteGrant liteUnavailable: denies with its reason right after (a), before the entry, risk, floor and parallel", () => {
  const blocked = liteGrant({
    authorized: true, routingEntry: auto, riskLevel: "high", provisionalLegs: ["sensitive-path"], parallel: true,
    liteUnavailable: "no-routing-entry",
  });
  assert.equal(blocked.granted, false);
  assert.equal(blocked.lite_denied, "no-routing-entry");
  assert.deepEqual(blocked.warnings, []);

  const unscored = liteGrant({
    authorized: true, routingEntry: { selected_agent: "auto-agent" }, riskLevel: "low", provisionalLegs: [], parallel: false,
    liteUnavailable: "no-routing-entry",
  });
  assert.equal(unscored.lite_denied, "no-routing-entry", "an eligible entry is not used when the caller says it is unavailable");

  const unauthorized = liteGrant({ authorized: false, routingEntry: auto, riskLevel: "low", liteUnavailable: "no-routing-entry" });
  assert.equal(unauthorized.lite_denied, "not-authorized");
});

// ── resolver: lite path ─────────────────────────────────────────────────────

test("resolver liteUnavailable: a high-risk spec with --lite reports no-routing-entry and resolves quick", () => {
  const r = resolveImplementReviewDepth({
    ...base, spec: { ...base.spec, risk_level: "high" }, liteFlag: true, liteUnavailable: "no-routing-entry",
  });
  assert.equal(r.depth, "quick");
  assert.equal(r.source, "default-quick");
  assert.equal(r.lite_denied, "no-routing-entry");
  assert.equal(r.lite_source, "flag");
  const unauthorized = resolveImplementReviewDepth({ ...base, liteUnavailable: "no-routing-entry" });
  assert.equal(unauthorized.lite_denied, "not-authorized");
});

test("lite_source: flag, policy, or null; explicit --tier quick outranks policy lite", () => {
  assert.equal(resolveImplementReviewDepth(withPolicyLite({ liteFlag: true })).lite_source, "flag");
  assert.equal(resolveImplementReviewDepth(withPolicyLite({})).lite_source, "policy");
  const r = resolveImplementReviewDepth(withPolicyLite({ tierFlag: "quick" }));
  assert.equal(r.depth, "quick");
  assert.equal(r.lite_source, null);
  assert.equal(r.lite_denied, "not-authorized");
});

test("granted provisional pass returns depth lite, source lite-grant", () => {
  const r = resolveImplementReviewDepth({ ...base, liteFlag: true });
  assert.deepEqual(r, {
    depth: "lite", source: "lite-grant", floor_applied: false, floor_legs: [], warnings: [],
    lite_denied: null, lite_source: "flag", escalated_from: null, floor_cap: null,
  });
});

test("policy-authorized grant records lite_source policy", () => {
  const r = resolveImplementReviewDepth(withPolicyLite({}));
  assert.equal(r.depth, "lite");
  assert.equal(r.source, "lite-grant");
  assert.equal(r.lite_denied, null);
  assert.equal(r.lite_source, "policy");
});

test("--tier lite is the same authorization as --lite", () => {
  const viaTier = resolveImplementReviewDepth({ ...base, tierFlag: "lite" });
  const viaFlag = resolveImplementReviewDepth({ ...base, liteFlag: true });
  assert.deepEqual(viaTier, viaFlag);
  assert.equal(viaTier.depth, "lite");
  assert.equal(viaTier.lite_source, "flag");
});

test("--tier lite on an ineligible task falls through to the policy baseline, as --lite does", () => {
  const policies = { medium: { implement_mode: "full" } };
  const viaTier = resolveImplementReviewDepth({ ...base, policies, routingEntry: undefined, tierFlag: "lite" });
  const viaFlag = resolveImplementReviewDepth({ ...base, policies, routingEntry: undefined, liteFlag: true });
  assert.deepEqual(viaTier, viaFlag);
  assert.equal(viaTier.depth, "full");
  assert.equal(viaTier.source, "policy-baseline");
  assert.equal(viaTier.lite_denied, "no-routing-entry");
  assert.equal(viaTier.floor_cap, null);
});

test("no authorization: the Task-3 result plus lite_denied not-authorized, lite_source null", () => {
  const r = resolveImplementReviewDepth({ ...base });
  assert.deepEqual(r, {
    depth: "quick", source: "default-quick", floor_applied: false, floor_legs: [], warnings: [],
    lite_denied: "not-authorized", lite_source: null, escalated_from: null, floor_cap: null,
  });
});

test("a policy lite for another risk level does not authorize", () => {
  const r = resolveImplementReviewDepth({ ...base, policies: { low: { implement_mode: "lite" } } });
  assert.equal(r.lite_denied, "not-authorized");
  assert.equal(r.depth, "quick");
});

test("high-risk auto-agent with --lite resolves quick with lite_denied high-risk", () => {
  const r = resolveImplementReviewDepth({ ...base, spec: { ...base.spec, risk_level: "high" }, liteFlag: true });
  assert.equal(r.depth, "quick");
  assert.equal(r.lite_denied, "high-risk");
  assert.equal(r.lite_source, "flag");
});

test("an assisted-agent task with --lite is granted lite", () => {
  const r = resolveImplementReviewDepth({ ...base, routingEntry: assisted, liteFlag: true });
  assert.equal(r.depth, "lite");
  assert.equal(r.lite_denied, null);
});

test("a missing routing entry with --lite resolves quick with no-routing-entry; human-only resolves full with floor:routing", () => {
  const missing = resolveImplementReviewDepth({ ...base, routingEntry: undefined, liteFlag: true });
  assert.equal(missing.depth, "quick");
  assert.equal(missing.lite_denied, "no-routing-entry");
  assert.equal(missing.floor_cap, null);
  const humanOnly = resolveImplementReviewDepth({ ...base, routingEntry: { selected_agent: "human-only" }, liteFlag: true });
  assert.equal(humanOnly.depth, "full");
  assert.deepEqual(humanOnly.floor_legs, ["routing"]);
  assert.equal(humanOnly.lite_denied, "floor:routing");
  assert.equal(humanOnly.floor_cap, null);
});

// ── the lite cap ────────────────────────────────────────────────────────────

test("lite cap: a declared sensitive path under authorization denies lite and resolves quick with floor_cap quick", () => {
  const r = resolveImplementReviewDepth({ ...base, liteFlag: true, targetPaths: ["src/auth/session.ts"] });
  assert.equal(r.depth, "quick");
  assert.equal(r.floor_applied, true);
  assert.deepEqual(r.floor_legs, ["sensitive-path"]);
  assert.equal(r.floor_cap, "quick");
  assert.equal(r.lite_denied, "floor:sensitive-path");
  const floor = r.warnings.find((w) => w.code === "REVIEW_DEPTH_FLOOR_APPLIED");
  assert.equal(floor.message, "review depth floored to quick (sensitive-path)");
  assert.deepEqual(floor.legs, ["sensitive-path"]);
});

test("lite cap: a declared boundary crossing under authorization resolves quick with floor:boundary", () => {
  const r = resolveImplementReviewDepth({ ...base, liteFlag: true, boundaryCrossing: true });
  assert.equal(r.depth, "quick");
  assert.deepEqual(r.floor_legs, ["boundary"]);
  assert.equal(r.floor_cap, "quick");
  assert.equal(r.lite_denied, "floor:boundary");
  const both = resolveImplementReviewDepth({ ...base, liteFlag: true, boundaryCrossing: true, targetPaths: ["src/auth/x.ts"] });
  assert.equal(both.depth, "quick");
  assert.deepEqual(both.floor_legs, ["boundary", "sensitive-path"]);
  assert.equal(both.floor_cap, "quick");
});

test("lite cap: a policy-sourced authorization caps too", () => {
  const r = resolveImplementReviewDepth(withPolicyLite({ targetPaths: ["src/auth/session.ts"] }));
  assert.equal(r.depth, "quick");
  assert.equal(r.floor_cap, "quick");
  assert.equal(r.lite_source, "policy");
});

test("lite cap: without authorization a sensitive path or boundary still resolves full with floor_cap null", () => {
  for (const extra of [{ targetPaths: ["src/auth/session.ts"] }, { boundaryCrossing: true }, { tierFlag: "quick", liteFlag: true, targetPaths: ["src/auth/x.ts"] }]) {
    const r = resolveImplementReviewDepth({ ...base, ...extra });
    assert.equal(r.depth, "full", JSON.stringify(extra));
    assert.equal(r.floor_cap, null);
    assert.match(r.warnings.find((w) => w.code === "REVIEW_DEPTH_FLOOR_APPLIED").message, /^review depth floored to full \(/);
  }
});

test("lite cap: a high-risk spec is never capped", () => {
  const r = resolveImplementReviewDepth({ ...base, spec: { ...base.spec, risk_level: "high" }, liteFlag: true, targetPaths: ["src/auth/x.ts"] });
  assert.equal(r.depth, "full");
  assert.deepEqual(r.floor_legs, ["sensitive-path"]);
  assert.equal(r.floor_cap, null);
  assert.equal(r.lite_denied, "high-risk");
});

test("lite cap: a human-only task with a sensitive path resolves full; any other holding leg removes the cap", () => {
  const r = resolveImplementReviewDepth({ ...base, routingEntry: { selected_agent: "human-only" }, liteFlag: true, targetPaths: ["src/auth/x.ts"] });
  assert.equal(r.depth, "full");
  assert.deepEqual(r.floor_legs, ["routing", "sensitive-path"]);
  assert.equal(r.floor_cap, null);
  assert.equal(r.lite_denied, "floor:routing");
});

test("lite cap: a policy full baseline is not lowered, and floor_cap stays null", () => {
  const r = resolveImplementReviewDepth({ ...base, policies: { medium: { implement_mode: "full" } }, liteFlag: true, targetPaths: ["src/auth/x.ts"] });
  assert.equal(r.depth, "full");
  assert.equal(r.source, "policy-baseline");
  assert.equal(r.floor_cap, null);
});

test("lite cap: --tier full stays absolute", () => {
  const r = resolveImplementReviewDepth({ ...base, tierFlag: "full", liteFlag: true, targetPaths: ["src/auth/x.ts"] });
  assert.equal(r.depth, "full");
  assert.equal(r.source, "tier-full-absolute");
  assert.equal(r.floor_cap, null);
});

test("--parallel denies lite and resolves the baseline", () => {
  const r = resolveImplementReviewDepth({ ...base, liteFlag: true, parallel: true });
  assert.equal(r.depth, "quick");
  assert.equal(r.source, "default-quick");
  assert.equal(r.lite_denied, "parallel");
});

test("an authorized task with an out-of-range score is granted lite without a warning", () => {
  const routingEntry = { selected_agent: "auto-agent", scores: s(0.8, 0.8, 0.8, 1.2) };
  const r = resolveImplementReviewDepth({ ...base, liteFlag: true, routingEntry });
  assert.equal(r.depth, "lite");
  assert.equal(r.lite_denied, null);
  assert.deepEqual(r.warnings, []);
});

test("--tier full is absolute: no lite, not-authorized even with --lite or a policy lite", () => {
  for (const input of [{ ...base, tierFlag: "full", liteFlag: true }, withPolicyLite({ tierFlag: "full" })]) {
    const r = resolveImplementReviewDepth(input);
    assert.equal(r.depth, "full");
    assert.equal(r.source, "tier-full-absolute");
    assert.equal(r.lite_denied, "not-authorized");
    assert.equal(r.lite_source, null);
    assert.equal(r.escalated_from, null);
    assert.equal(r.floor_cap, null);
  }
});

test("--tier quick is the per-run opt-out: --lite with --tier quick authorizes nothing", () => {
  for (const input of [{ ...base, tierFlag: "quick", liteFlag: true }, withPolicyLite({ tierFlag: "quick", liteFlag: true })]) {
    const r = resolveImplementReviewDepth(input);
    assert.equal(r.depth, "quick");
    assert.equal(r.source, "policy-baseline");
    assert.equal(r.lite_denied, "not-authorized");
    assert.equal(r.lite_source, null);
  }
});

test("an authorized task with an out-of-range score and a sensitive declared path reports floor:sensitive-path with only the floor warning", () => {
  const routingEntry = { selected_agent: "auto-agent", scores: s(0.8, 0.8, 0.8, 1.2) };
  const r = resolveImplementReviewDepth({ ...base, liteFlag: true, routingEntry, targetPaths: ["src/auth/x.ts"] });
  assert.equal(r.depth, "quick");
  assert.deepEqual(r.floor_legs, ["sensitive-path"]);
  assert.equal(r.lite_denied, "floor:sensitive-path");
  assert.deepEqual(r.warnings.map((w) => w.code), ["REVIEW_DEPTH_FLOOR_APPLIED"]);
});

test("the final pass never grants lite: lite_denied is null and lite_source still reflects the inputs", (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t.com");
  git("config", "user.name", "t");
  writeFileSync(join(dir, "a.txt"), "1\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const baseSha = git("rev-parse", "HEAD").trim();
  const final = { pass: "final", baseSha, projectRoot: dir };
  const r = resolveImplementReviewDepth({ ...base, liteFlag: true, ...final });
  assert.equal(r.depth, "quick");
  assert.equal(r.source, "default-quick");
  assert.equal(r.lite_denied, null);
  assert.equal(r.lite_source, "flag");
  assert.equal(r.escalated_from, null);

  const viaPolicy = resolveImplementReviewDepth(withPolicyLite(final));
  assert.equal(viaPolicy.depth, "quick");
  assert.equal(viaPolicy.lite_denied, null);
  assert.equal(viaPolicy.lite_source, "policy");

  const unauthorized = resolveImplementReviewDepth({ ...base, ...final });
  assert.equal(unauthorized.lite_denied, null);
  assert.equal(unauthorized.lite_source, null);

  const tierFull = resolveImplementReviewDepth({ ...base, tierFlag: "full", liteFlag: true, pass: "final" });
  assert.equal(tierFull.lite_denied, null);
  assert.equal(tierFull.lite_source, null);
});

test("lite cap, final pass of a non-lite task: a touched sensitive path gives quick under authorization; a Critical finding gives full", (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t.com");
  git("config", "user.name", "t");
  writeFileSync(join(dir, "a.txt"), "1\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const baseSha = snapshotWorkingTree(dir);
  mkdirSync(dirname(join(dir, "lib/auth/token.mjs")), { recursive: true });
  writeFileSync(join(dir, "lib/auth/token.mjs"), "export {};\n");
  const final = { pass: "final", baseSha, projectRoot: dir, provisionalDepth: "quick" };

  const capped = resolveImplementReviewDepth({ ...base, liteFlag: true, ...final });
  assert.equal(capped.depth, "quick");
  assert.deepEqual(capped.floor_legs, ["sensitive-path"]);
  assert.equal(capped.floor_cap, "quick");
  assert.equal(capped.escalated_from, null);
  assert.equal(capped.warnings.find((w) => w.code === "REVIEW_DEPTH_FLOOR_APPLIED").message, "review depth floored to quick (sensitive-path)");

  const critical = resolveImplementReviewDepth({
    ...base, liteFlag: true, ...final, task: { ...base.task, had_critical_finding: true },
  });
  assert.equal(critical.depth, "full");
  assert.deepEqual(critical.floor_legs, ["sensitive-path", "critical-finding"]);
  assert.equal(critical.floor_cap, null);

  const unauthorized = resolveImplementReviewDepth({ ...base, ...final });
  assert.equal(unauthorized.depth, "full");
  assert.equal(unauthorized.floor_cap, null);
});

test("lite cap: a --parallel run is still authorized, so a declared sensitive path is capped", () => {
  const r = resolveImplementReviewDepth({ ...base, liteFlag: true, parallel: true, targetPaths: ["src/auth/x.ts"] });
  assert.equal(r.depth, "quick");
  assert.equal(r.floor_cap, "quick");
  assert.equal(r.lite_denied, "floor:sensitive-path");
});
