// tests/lib/implement/review-depth-lite-grant.test.mjs
//
// The lite grant: liteEligible (route's "easy" signal on the sidecar scale),
// liteGrant (the four conditions in order, naming the first that fails) and
// the resolver's provisional-pass `lite` path with its lite_denied /
// lite_source / escalated_from output fields.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  liteEligible,
  liteGrant,
  LITE_GRANT_THRESHOLD,
  resolveImplementReviewDepth,
} from "../../../lib/implement/review-depth.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";

const SPEC = ".context-index/specs/features/m/my-spec.spec.md";
const s = (spec_completeness, pattern_coverage, blast_radius, novelty) => ({ spec_completeness, pattern_coverage, blast_radius, novelty });
const auto = { selected_agent: "auto-agent", scores: s(0.8, 0.8, 0.8, 0.8) };
const assisted = { ...auto, selected_agent: "assisted-agent" };
const base = { spec: { risk_level: "medium", specPath: SPEC }, policies: {}, task: { id: "1", declared_files: ["lib/a.mjs"] }, routingEntry: auto, pass: "provisional" };
const withPolicyLite = (overrides) => ({ ...base, policies: { medium: { implement_mode: "lite" } }, ...overrides });

// ── liteEligible ────────────────────────────────────────────────────────────

test("threshold is 0.6 on the sidecar scale", () => assert.equal(LITE_GRANT_THRESHOLD, 0.6));

test("liteEligible: auto-agent and every score in [0.6, 1]", () => {
  assert.equal(liteEligible({ selected_agent: "auto-agent", scores: s(0.6, 0.6, 0.6, 0.6) }).eligible, true);
  assert.equal(liteEligible({ selected_agent: "auto-agent", scores: s(1, 1, 1, 1) }).eligible, true);
  assert.equal(liteEligible({ selected_agent: "assisted-agent", scores: s(1, 1, 1, 1) }).eligible, false);
  assert.equal(liteEligible({ selected_agent: "human-only", scores: s(1, 1, 1, 1) }).eligible, false);
  for (const bad of ["0.8", NaN, 1.2, undefined, -0.1, Infinity, null]) {
    const r = liteEligible({ selected_agent: "auto-agent", scores: s(bad, 0.8, 0.8, 0.8) });
    assert.equal(r.eligible, false, `score=${String(bad)}`);
    assert.deepEqual(
      r.warnings.filter((w) => w.code === "ROUTING_SCORE_OUT_OF_RANGE").map((w) => w.dimension),
      ["spec_completeness"],
      `score=${String(bad)}`,
    );
  }
});

test("liteEligible: a valid score just below the threshold is ineligible without a warning", () => {
  const r = liteEligible({ selected_agent: "auto-agent", scores: s(0.8, 0.8, 0.8, 0.59) });
  assert.equal(r.eligible, false);
  assert.deepEqual(r.warnings, []);
});

test("liteEligible: a missing entry or missing scores object is ineligible", () => {
  for (const entry of [null, undefined, { selected_agent: "auto-agent" }]) {
    const r = liteEligible(entry);
    assert.equal(r.eligible, false, JSON.stringify(entry));
  }
  assert.equal(liteEligible({ selected_agent: "auto-agent" }).warnings.length, 4);
});

// ── liteGrant truth table ───────────────────────────────────────────────────

function fixtureFor({ a, b, c, d }) {
  return {
    authorized: a,
    routingEntry: b ? auto : assisted,
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
    const expected = !a ? "not-authorized" : !b ? "routing-scores" : c !== "ok" ? c : !d ? "parallel" : null;
    assert.equal(r.lite_denied, expected);
  });
}

test("liteGrant (c): high-risk is reported before a floor leg, and the first floor leg is named", () => {
  const highAndFloor = liteGrant({ authorized: true, routingEntry: auto, riskLevel: "high", provisionalLegs: ["boundary"], parallel: false });
  assert.equal(highAndFloor.lite_denied, "high-risk");
  const twoLegs = liteGrant({ authorized: true, routingEntry: auto, riskLevel: "low", provisionalLegs: ["boundary", "sensitive-path"], parallel: false });
  assert.equal(twoLegs.lite_denied, "floor:boundary");
});

test("liteGrant: an unauthorized task is silent; an authorized out-of-range score warns", () => {
  const bad = { selected_agent: "auto-agent", scores: s(0.8, 0.8, 5, 0.8) };
  const silent = liteGrant({ authorized: false, routingEntry: bad, riskLevel: "low", provisionalLegs: [], parallel: false });
  assert.equal(silent.lite_denied, "not-authorized");
  assert.deepEqual(silent.warnings, []);
  const warned = liteGrant({ authorized: true, routingEntry: bad, riskLevel: "low", provisionalLegs: [], parallel: false });
  assert.equal(warned.lite_denied, "routing-scores");
  assert.deepEqual(warned.warnings.map((w) => [w.code, w.dimension]), [["ROUTING_SCORE_OUT_OF_RANGE", "blast_radius"]]);
});

test("liteGrant liteUnavailable: denies with its reason right after (a), before scores, risk, floor and parallel", () => {
  const blocked = liteGrant({
    authorized: true, routingEntry: auto, riskLevel: "high", provisionalLegs: ["sensitive-path"], parallel: true,
    liteUnavailable: "routing-scores",
  });
  assert.equal(blocked.granted, false);
  assert.equal(blocked.lite_denied, "routing-scores");
  assert.deepEqual(blocked.warnings, []);

  const unscored = liteGrant({
    authorized: true, routingEntry: { selected_agent: "auto-agent" }, riskLevel: "low", provisionalLegs: [], parallel: false,
    liteUnavailable: "routing-scores",
  });
  assert.deepEqual(unscored.warnings, [], "an entry the grant cannot use is not score-checked");

  const unauthorized = liteGrant({ authorized: false, routingEntry: auto, riskLevel: "low", liteUnavailable: "routing-scores" });
  assert.equal(unauthorized.lite_denied, "not-authorized");
});

// ── resolver: lite path ─────────────────────────────────────────────────────

test("resolver liteUnavailable: a high-risk spec with --lite reports routing-scores and resolves quick", () => {
  const r = resolveImplementReviewDepth({
    ...base, spec: { ...base.spec, risk_level: "high" }, liteFlag: true, liteUnavailable: "routing-scores",
  });
  assert.equal(r.depth, "quick");
  assert.equal(r.source, "default-quick");
  assert.equal(r.lite_denied, "routing-scores");
  assert.equal(r.lite_source, "flag");
  const unauthorized = resolveImplementReviewDepth({ ...base, liteUnavailable: "routing-scores" });
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
    lite_denied: null, lite_source: "flag", escalated_from: null,
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
  const viaTier = resolveImplementReviewDepth({ ...base, policies, routingEntry: assisted, tierFlag: "lite" });
  const viaFlag = resolveImplementReviewDepth({ ...base, policies, routingEntry: assisted, liteFlag: true });
  assert.deepEqual(viaTier, viaFlag);
  assert.equal(viaTier.depth, "full");
  assert.equal(viaTier.source, "policy-baseline");
  assert.equal(viaTier.lite_denied, "routing-scores");
});

test("no authorization: the Task-3 result plus lite_denied not-authorized, lite_source null", () => {
  const r = resolveImplementReviewDepth({ ...base });
  assert.deepEqual(r, {
    depth: "quick", source: "default-quick", floor_applied: false, floor_legs: [], warnings: [],
    lite_denied: "not-authorized", lite_source: null, escalated_from: null,
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

test("a declared sensitive path denies lite as floor:sensitive-path and resolves full", () => {
  const r = resolveImplementReviewDepth({ ...base, liteFlag: true, targetPaths: ["src/auth/session.ts"] });
  assert.equal(r.depth, "full");
  assert.deepEqual(r.floor_legs, ["sensitive-path"]);
  assert.equal(r.lite_denied, "floor:sensitive-path");
});

test("a declared boundary crossing denies lite as floor:boundary", () => {
  const r = resolveImplementReviewDepth({ ...base, liteFlag: true, boundaryCrossing: true });
  assert.equal(r.depth, "full");
  assert.equal(r.lite_denied, "floor:boundary");
});

test("--parallel denies lite and resolves the baseline", () => {
  const r = resolveImplementReviewDepth({ ...base, liteFlag: true, parallel: true });
  assert.equal(r.depth, "quick");
  assert.equal(r.source, "default-quick");
  assert.equal(r.lite_denied, "parallel");
});

test("an authorized task with an out-of-range score warns and resolves quick", () => {
  const routingEntry = { selected_agent: "auto-agent", scores: s(0.8, 0.8, 0.8, 1.2) };
  const r = resolveImplementReviewDepth({ ...base, liteFlag: true, routingEntry });
  assert.equal(r.depth, "quick");
  assert.equal(r.lite_denied, "routing-scores");
  assert.deepEqual(r.warnings.map((w) => w.code), ["ROUTING_SCORE_OUT_OF_RANGE"]);
});

test("--tier full is absolute: no lite, not-authorized even with --lite or a policy lite", () => {
  for (const input of [{ ...base, tierFlag: "full", liteFlag: true }, withPolicyLite({ tierFlag: "full" })]) {
    const r = resolveImplementReviewDepth(input);
    assert.equal(r.depth, "full");
    assert.equal(r.source, "tier-full-absolute");
    assert.equal(r.lite_denied, "not-authorized");
    assert.equal(r.lite_source, null);
    assert.equal(r.escalated_from, null);
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

test("an authorized task with an out-of-range score and a sensitive declared path reports routing-scores with both warnings", () => {
  const routingEntry = { selected_agent: "auto-agent", scores: s(0.8, 0.8, 0.8, 1.2) };
  const r = resolveImplementReviewDepth({ ...base, liteFlag: true, routingEntry, targetPaths: ["src/auth/x.ts"] });
  assert.equal(r.depth, "full");
  assert.deepEqual(r.floor_legs, ["sensitive-path"]);
  assert.equal(r.lite_denied, "routing-scores");
  assert.deepEqual(r.warnings.map((w) => w.code).sort(), ["REVIEW_DEPTH_FLOOR_APPLIED", "ROUTING_SCORE_OUT_OF_RANGE"]);
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
