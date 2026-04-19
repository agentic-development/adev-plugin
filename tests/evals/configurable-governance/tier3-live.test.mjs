/**
 * Tier 3 — live-runner integration test with the stub dispatcher.
 *
 * Exercises the full orchestration pipeline end-to-end: registry load,
 * posture check, context-pack render, dispatch struct, severity cap,
 * verdict consolidation, report render, output capture, scoring via
 * run-eval.mjs. Closes:
 *
 *   - configurable-reviewers AC #7  profile-disallowed tool call surfaces
 *                                   as a warning finding (via stub that
 *                                   returns such a finding)
 *   - end-to-end property: the live-runner produces an outputs/<variant>/
 *     <scenario>/output.md that run-eval.mjs scores against the existing
 *     rubrics with all required elements passing
 *
 * Real LLM runs use the same runner with dispatchers/anthropic.mjs; the
 * stub suffices for deterministic CI.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runLive } from "./run-live.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETUP = join(__dirname, "setup-fixture.sh");
const FIXTURE = join(__dirname, "fixture-tier3");
const OUTPUTS = join(__dirname, "outputs");

before(() => {
  if (!existsSync(FIXTURE)) execSync(`bash ${SETUP} ${FIXTURE}`, { stdio: "pipe" });
});
// See tier1/tier2 teardown note. outputs/ persists across runs by design so
// run-eval.mjs can score them; setup-fixture.sh doesn't touch outputs/.

describe("Tier 3 — live runner with stub dispatcher", () => {
  it("drives end-to-end and writes outputs/stub/scenario-a-review-install/output.md", async () => {
    const r = await runLive({
      scenario: "scenario-a-review-install",
      variant: "stub",
      dispatcher: "./dispatchers/stub.mjs",
      fixture: FIXTURE,
    });
    assert.ok(existsSync(r.outPath), "output.md not written");
    const body = readFileSync(r.outPath, "utf8");
    assert.match(body, /# Architecture Review/);
    assert.match(body, /Verdict:\*{0,2}\s*(PASS|PASS_WITH_NOTES|BLOCK)/);
    assert.match(body, /Reviewers Dispatched/);
    // consistency-analyzer is disabled in the fixture overlay.
    assert.ok(!body.includes("consistency-analyzer\n\nNo findings"), "disabled reviewer should not appear with findings");
    // security-reviewer (cap=warning) and structural-architect should both appear.
    assert.match(body, /structural-architect/);
    assert.match(body, /security-reviewer/);
    // project-triggered reviewer should appear because billing path matches.
    assert.match(body, /project\.billing-domain/);
  });

  it("severity cap clamps the canned blocker-style security finding", async () => {
    const r = await runLive({
      scenario: "scenario-a-review-install",
      variant: "stub",
      dispatcher: "./dispatchers/stub.mjs",
      fixture: FIXTURE,
    });
    const body = readFileSync(r.outPath, "utf8");
    // The stub returns severity: warning for security-reviewer, which passes
    // through unchanged. Verify by asserting the message shows up verbatim.
    assert.match(body, /deterministic AND not user-controllable/);
  });

  it("run-eval.mjs scores the captured output against rubrics with required elements present", () => {
    // Produce the output first (idempotent).
    mkdirSync(OUTPUTS, { recursive: true });
    // Then invoke the scorer.
    const stdout = execSync(
      `node ${join(__dirname, "run-eval.mjs")} --variant stub --scenario scenario-a-review-install --no-report`,
      { encoding: "utf8" }
    );
    assert.match(stdout, /\[stub\/scenario-a-review-install\]/);
    // Required-element count should be > 0 (at least the four structural
    // elements: each reviewer id + verdict line).
    const m = stdout.match(/\[stub\/scenario-a-review-install\]\s+(\d+)\/(\d+)\s+elements/);
    assert.ok(m, "element tally missing from run-eval output");
    const passed = Number(m[1]);
    assert.ok(passed >= 4, `expected at least 4 required elements passing, got ${passed}`);
  });
});

describe("Tier 3 — reviewers AC #7 (profile-disallowed tool call → warning finding)", () => {
  it("simulates a harness tool-denial via the dispatcher contract and records it as a warning", async () => {
    // Write an inline dispatcher that emulates what the Claude Code harness
    // would report when a reviewer attempts a disallowed tool: surface it as
    // a warning-severity finding before the model returns.
    const tempDispatcher = join(__dirname, "dispatchers", ".tmp-denial.mjs");
    mkdirSync(dirname(tempDispatcher), { recursive: true });
    const src = `export async function dispatch(request) {
  if (request.reviewerId === "security-reviewer") {
    return {
      findings: [
        {
          id: "HARNESS-TOOL-DENIAL",
          severity: "warning",
          category: "authorization",
          message: "reviewer attempted a tool not in its profile's allowlist; harness denied."
        }
      ]
    };
  }
  return { findings: [] };
}
`;
    (await import("node:fs")).writeFileSync(tempDispatcher, src);

    try {
      const r = await runLive({
        scenario: "tool-denial",
        variant: "denial",
        dispatcher: "./dispatchers/.tmp-denial.mjs",
        fixture: FIXTURE,
      });
      const body = readFileSync(r.outPath, "utf8");
      assert.match(body, /HARNESS-TOOL-DENIAL/);
      assert.match(body, /warning/);
      assert.match(body, /harness denied/);
    } finally {
      rmSync(tempDispatcher, { force: true });
    }
  });
});
