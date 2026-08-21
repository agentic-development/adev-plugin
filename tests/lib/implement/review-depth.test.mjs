// tests/lib/implement/review-depth.test.mjs
//
// Task 4: precedence chain for resolveImplementReviewDepth (tier-full absolute,
// policy baseline, quick-grant predicate, score validation).
// Task 5: the floor pass (5 legs, including the scope-mismatch git-diff leg
// and its Output-Contract-K lifecycle-log exclusion).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveImplementReviewDepth, computeTouchedFiles } from "../../../lib/implement/review-depth.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";

function initGitRepo(dir) {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
}

test("--tier full is absolute — resolves full even with perfect scores and no floor", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" },
    task: { id: "t1" },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: "full",
    policies: { low: { implement_mode: "quick" } },
  });
  assert.equal(result.depth, "full");
  assert.equal(result.source, "tier-full-absolute");
});

test("policy baseline resolves full when implement_mode is missing/malformed", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "medium" }, task: { id: "t1" },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { medium: { implement_mode: "not-a-real-tier" } },
  });
  assert.equal(result.depth, "full");
});

test("quick-grant predicate: all four rows pass -> quick", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 0.6, pattern_coverage: 0.6, blast_radius: 0.6, novelty: 0.6 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "quick");
  assert.equal(result.source, "predicate-grant");
});

test("quick-grant predicate: a single failing dimension (novelty 0.4) keeps full even under --tier quick", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 0.6, pattern_coverage: 0.6, blast_radius: 0.6, novelty: 0.4 } },
    tierFlag: "quick", policies: { low: { implement_mode: "full" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
});

test("--tier quick authorizes predicate evaluation even when baseline is full", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "medium" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 0.6, pattern_coverage: 0.6, blast_radius: 0.6, novelty: 0.6 } },
    tierFlag: "quick", policies: { medium: { implement_mode: "full" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "quick");
});

test("selected_agent other than auto-agent never grants quick", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "assisted-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
});

test("a governance boundary crossing keeps full even with perfect scores", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: true,
  });
  assert.equal(result.depth, "full");
});

test("additive-only row fails independently — a task with an otherwise-perfect predicate but additive_only: false resolves full", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: false },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
});

test("an out-of-range score resolves full with ROUTING_SCORE_OUT_OF_RANGE, no coercion", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 5 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
  assert.ok(result.warnings.some(w => w.code === "ROUTING_SCORE_OUT_OF_RANGE"));
});

test("a raw un-normalized score of 1 documents the accepted boundary (not a regression)", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } }, boundaryCrossing: false,
  });
  assert.equal(result.depth, "quick");
});

test("non-finite / non-numeric score resolves full", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: NaN, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } }, boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
});

test("boundary floor leg fires and is named in floor_legs when a governance boundary is crossed", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: true,
  });
  assert.equal(result.depth, "full");
  assert.ok(result.floor_legs.includes("boundary"));
});

test("risk-level floor forces full even with a granted predicate", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "high" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: "quick", policies: { high: { implement_mode: "full" } }, boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
  assert.ok(result.floor_applied);
  assert.ok(result.floor_legs.includes("risk-level"));
});

test("REVIEW_DEPTH_FLOOR_APPLIED fires even when the resolved value was already full", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "high" }, task: { id: "t1" },
    routingEntry: null, tierFlag: null, policies: { high: { implement_mode: "full" } },
  });
  assert.equal(result.depth, "full");
  assert.ok(result.floor_applied);
});

test("batched-task floor leg forces full regardless of predicate or --tier quick", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true, in_batch: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: "quick", policies: { low: { implement_mode: "quick" } }, boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
  assert.ok(result.floor_legs.includes("batched-task"));
});

test("scope-mismatch: final pass, an undeclared path outside the additive set forces full", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    writeFileSync(join(dir, "a.txt"), "1"); execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    writeFileSync(join(dir, "b.txt"), "new");
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low" }, task: { id: "t1", additive_only: true, declared_files: ["c.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "full");
    assert.ok(result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("scope-mismatch: modifying (not adding) a declared-additive path also forces full", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    writeFileSync(join(dir, "existing.txt"), "1"); execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    writeFileSync(join(dir, "existing.txt"), "2");
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low" }, task: { id: "t1", additive_only: true, declared_files: ["existing.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "full");
    assert.ok(result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("scope-mismatch: an out-of-scope tracked file deleted still fires the leg", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    writeFileSync(join(dir, "gone.txt"), "1"); execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    execFileSync("git", ["rm", "-q", "gone.txt"], { cwd: dir });
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low" }, task: { id: "t1", additive_only: true, declared_files: ["new.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "full");
    assert.ok(result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("scope-mismatch: a staged rename pairing an out-of-scope delete with an in-scope add still fires (no-renames)", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    writeFileSync(join(dir, "old.txt"), "shared content for rename detection");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    execFileSync("git", ["rm", "-q", "old.txt"], { cwd: dir });
    writeFileSync(join(dir, "new.txt"), "shared content for rename detection");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low" }, task: { id: "t1", additive_only: true, declared_files: ["new.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "full");
    assert.ok(result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("Output Contract K: status-M on the current spec's own lifecycle log is excluded", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
    writeFileSync(join(dir, ".context-index/lifecycle-state/my-spec.jsonl"), "{}\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    writeFileSync(join(dir, ".context-index/lifecycle-state/my-spec.jsonl"), "{}\n{}\n");
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low", specPath: "specs/my-spec.spec.md" },
      task: { id: "t1", additive_only: true, declared_files: ["new.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "quick");
    assert.ok(!result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("Output Contract K: the exclusion does NOT apply to status A (log did not exist before this task) on the same log", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base", "--allow-empty"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
    writeFileSync(join(dir, ".context-index/lifecycle-state/my-spec.jsonl"), "{}\n");
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low", specPath: "specs/my-spec.spec.md" },
      task: { id: "t1", additive_only: true, declared_files: ["new.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "full");
    assert.ok(result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("Output Contract K: the exclusion does NOT apply to status D (log deleted) on the same log", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
    writeFileSync(join(dir, ".context-index/lifecycle-state/my-spec.jsonl"), "{}\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    execFileSync("git", ["rm", "-q", ".context-index/lifecycle-state/my-spec.jsonl"], { cwd: dir });
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low", specPath: "specs/my-spec.spec.md" },
      task: { id: "t1", additive_only: true, declared_files: ["new.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "full");
    assert.ok(result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("Output Contract K: the exclusion does NOT apply to a status-M touch on ANOTHER spec's lifecycle log", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
    writeFileSync(join(dir, ".context-index/lifecycle-state/other-spec.jsonl"), "{}\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    writeFileSync(join(dir, ".context-index/lifecycle-state/other-spec.jsonl"), "{}\n{}\n");
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low", specPath: "specs/my-spec.spec.md" },
      task: { id: "t1", additive_only: true, declared_files: ["new.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "full");
    assert.ok(result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("critical-finding leg persists for the remainder of a task once triggered", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true, had_critical_finding: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } }, pass: "final",
  });
  assert.equal(result.depth, "full");
  assert.ok(result.floor_legs.includes("critical-finding"));
});

test("sensitive-path floor leg respects this repo's own configured extension (lib/governance/**)", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    targetPaths: ["lib/governance/rigor-mode.mjs"], sensitivePaths: ["lib/governance/**"],
  });
  assert.equal(result.depth, "full");
  assert.ok(result.floor_legs.includes("sensitive-path"));
});

test("MISSING_DIFF_RANGE: final pass with declared_files but no baseSha throws with the coded error", () => {
  assert.throws(
    () => resolveImplementReviewDepth({
      spec: { risk_level: "low" }, task: { id: "t1", additive_only: true, declared_files: ["a.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", projectRoot: "/tmp/does-not-matter",
    }),
    (err) => err.code === "MISSING_DIFF_RANGE",
  );
});

test("computeTouchedFiles: no baseSha throws MISSING_DIFF_RANGE", () => {
  assert.throws(
    () => computeTouchedFiles("/tmp/does-not-matter", undefined),
    (err) => err.code === "MISSING_DIFF_RANGE",
  );
});

test("solo dispatch: two tasks in the same run resolve independently", () => {
  const inputBase = { spec: { risk_level: "low" }, tierFlag: null, policies: { low: { implement_mode: "quick" } } };
  const easy = resolveImplementReviewDepth({ ...inputBase, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } } });
  const hard = resolveImplementReviewDepth({ ...inputBase, task: { id: "t2", additive_only: true, in_batch: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } } });
  assert.equal(easy.depth, "quick");
  assert.equal(hard.depth, "full");
});
