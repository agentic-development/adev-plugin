// tests/lib/cost-summary.test.mjs
//
// Unit tests for lib/cost-summary.mjs (Task 1 of cost-ticker plan).
// Covers Behaviors 1, 3, 6, 10, 13 and the SEC-1 1-MB line cap.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { aggregate } from "../../lib/cost-summary.mjs";

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "cost-"));
  mkdirSync(join(root, ".context-index"), { recursive: true });
  writeFileSync(join(root, ".context-index", "manifest.yaml"), "project:\n  name: test\n");
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, "specs/x.spec.md"), "# spec");
  return root;
}

describe("aggregate (cost-summary)", () => {
  it("filters by spec_ref and sums usage fields (Behavior 1)", async () => {
    const root = makeRoot();
    const specPath = "specs/x.spec.md";
    const lines = [
      JSON.stringify({
        spec_ref: specPath,
        model: "claude-sonnet-4-6",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_tokens: 1000,
          cache_creation_tokens: 20,
          cost_usd: 0.01,
        },
        timestamp: "2026-05-22T10:00:00Z",
      }),
      JSON.stringify({
        spec_ref: "specs/other.spec.md",
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 999, output_tokens: 999, cost_usd: 0.99 },
        timestamp: "2026-05-22T10:01:00Z",
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, ".context-index", ".session-tracking.jsonl"), lines);

    const result = await aggregate({ projectRoot: root, specPath });

    assert.equal(result.totals.input_tokens, 100);
    assert.equal(result.totals.output_tokens, 50);
    assert.equal(result.totals.cache_read_tokens, 1000);
    assert.equal(result.totals.cache_creation_tokens, 20);
    assert.equal(result.totals.cost_usd, 0.01);
  });

  it("returns null totals when JSONL is missing (Behavior 5)", async () => {
    const root = makeRoot();
    const result = await aggregate({ projectRoot: root, specPath: "specs/x.spec.md" });
    assert.equal(result.totals, null);
    assert.equal(result.skipped_lines, 0);
    assert.deepEqual(result.checkpoints, []);
    assert.deepEqual(result.model_breakdown, []);
  });

  it("returns null totals when JSONL has zero matching entries", async () => {
    const root = makeRoot();
    writeFileSync(
      join(root, ".context-index", ".session-tracking.jsonl"),
      JSON.stringify({
        spec_ref: "specs/other.spec.md",
        usage: { cost_usd: 0.5 },
      }) + "\n",
    );
    const result = await aggregate({ projectRoot: root, specPath: "specs/x.spec.md" });
    assert.equal(result.totals, null);
  });

  it("skips malformed lines and counts them (Behavior 13)", async () => {
    const root = makeRoot();
    const lines = [
      "not-json",
      "{broken",
      JSON.stringify({ spec_ref: "specs/x.spec.md", usage: { cost_usd: 0.5 } }),
    ].join("\n");
    writeFileSync(join(root, ".context-index", ".session-tracking.jsonl"), lines + "\n");
    const result = await aggregate({ projectRoot: root, specPath: "specs/x.spec.md" });
    assert.equal(result.skipped_lines, 2);
    assert.equal(result.totals.cost_usd, 0.5);
  });

  it("rejects lines exceeding 1 MB as malformed (SEC-1)", async () => {
    const root = makeRoot();
    const oversized = "x".repeat(1024 * 1024 + 1);
    writeFileSync(join(root, ".context-index", ".session-tracking.jsonl"), oversized + "\n");
    const result = await aggregate({ projectRoot: root, specPath: "specs/x.spec.md" });
    assert.equal(result.skipped_lines, 1);
    assert.equal(result.totals, null);
  });

  it("produces model_breakdown sorted by cost_usd descending (Behavior 10)", async () => {
    const root = makeRoot();
    const lines = [
      JSON.stringify({
        spec_ref: "specs/x.spec.md",
        model: "claude-opus-4-7",
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.06 },
        timestamp: "2026-05-22T10:00:00Z",
      }),
      JSON.stringify({
        spec_ref: "specs/x.spec.md",
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.28 },
        timestamp: "2026-05-22T10:01:00Z",
      }),
    ].join("\n");
    writeFileSync(join(root, ".context-index", ".session-tracking.jsonl"), lines + "\n");
    const result = await aggregate({ projectRoot: root, specPath: "specs/x.spec.md" });

    assert.equal(result.model_breakdown.length, 2);
    assert.equal(result.model_breakdown[0].model, "claude-sonnet-4-6");
    assert.equal(result.model_breakdown[1].model, "claude-opus-4-7");
    // shares should sum to ~1.0
    const sumShare = result.model_breakdown.reduce((s, m) => s + m.share, 0);
    assert.ok(Math.abs(sumShare - 1.0) < 0.01, `shares ${sumShare} should sum to 1.0`);
    // share precision = 3 decimals
    assert.equal(result.model_breakdown[0].share, 0.824);
    assert.equal(result.model_breakdown[1].share, 0.176);
  });

  it("groups entries into checkpoints by preceding lifecycle_step (Behavior 4)", async () => {
    const root = makeRoot();
    const specPath = "specs/x.spec.md";
    // Set up lifecycle log with review:started at t=10:00, plan:started at t=11:00
    const logDir = join(root, ".context-index", "lifecycle-state");
    mkdirSync(logDir, { recursive: true });
    const lifecycle = [
      JSON.stringify({ event: "lifecycle_step", step: "review", status: "started", ts: "2026-05-22T10:00:00Z" }),
      JSON.stringify({ event: "lifecycle_step", step: "plan", status: "started", ts: "2026-05-22T11:00:00Z" }),
    ].join("\n") + "\n";
    writeFileSync(join(logDir, "x.jsonl"), lifecycle);
    // Session entries: one before review (ungrouped), one at review, one at plan
    const lines = [
      JSON.stringify({
        spec_ref: specPath,
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.001 },
        timestamp: "2026-05-22T09:00:00Z",
      }),
      JSON.stringify({
        spec_ref: specPath,
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.01 },
        timestamp: "2026-05-22T10:30:00Z",
      }),
      JSON.stringify({
        spec_ref: specPath,
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.02 },
        timestamp: "2026-05-22T11:30:00Z",
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, ".context-index", ".session-tracking.jsonl"), lines);

    // Disable default --since so the 09:00 entry isn't filtered out.
    const result = await aggregate({ projectRoot: root, specPath, since: null });

    // Expect at least one of each: ungrouped, review, plan.
    const steps = new Set(result.checkpoints.map((c) => c.step));
    assert.ok(steps.has("ungrouped"), `expected 'ungrouped' in ${[...steps]}`);
    assert.ok(steps.has("review"), `expected 'review' in ${[...steps]}`);
    assert.ok(steps.has("plan"), `expected 'plan' in ${[...steps]}`);
  });

  it("applies default --since from review:started (Behavior 6)", async () => {
    const root = makeRoot();
    const specPath = "specs/x.spec.md";
    const logDir = join(root, ".context-index", "lifecycle-state");
    mkdirSync(logDir, { recursive: true });
    writeFileSync(
      join(logDir, "x.jsonl"),
      JSON.stringify({ event: "lifecycle_step", step: "review", status: "started", ts: "2026-05-22T10:00:00Z" }) + "\n",
    );
    // Two entries: one before review (should be filtered out), one after.
    const lines = [
      JSON.stringify({
        spec_ref: specPath,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.5 },
        timestamp: "2026-05-22T09:00:00Z",
      }),
      JSON.stringify({
        spec_ref: specPath,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.01 },
        timestamp: "2026-05-22T11:00:00Z",
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, ".context-index", ".session-tracking.jsonl"), lines);

    const result = await aggregate({ projectRoot: root, specPath });
    assert.equal(result.totals.cost_usd, 0.01);
  });

  it("explicit --since filters before timestamp (Behavior 6)", async () => {
    const root = makeRoot();
    const specPath = "specs/x.spec.md";
    const lines = [
      JSON.stringify({
        spec_ref: specPath,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.5 },
        timestamp: "2026-05-22T09:00:00Z",
      }),
      JSON.stringify({
        spec_ref: specPath,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.01 },
        timestamp: "2026-05-22T11:00:00Z",
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, ".context-index", ".session-tracking.jsonl"), lines);

    const result = await aggregate({
      projectRoot: root,
      specPath,
      since: "2026-05-22T10:00:00Z",
    });
    assert.equal(result.totals.cost_usd, 0.01);
  });

  it("computes wall_seconds as max-min timestamp difference", async () => {
    const root = makeRoot();
    const specPath = "specs/x.spec.md";
    const lines = [
      JSON.stringify({
        spec_ref: specPath,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.01 },
        timestamp: "2026-05-22T10:00:00Z",
      }),
      JSON.stringify({
        spec_ref: specPath,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.01 },
        timestamp: "2026-05-22T10:04:12Z",
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, ".context-index", ".session-tracking.jsonl"), lines);

    const result = await aggregate({ projectRoot: root, specPath, since: null });
    assert.equal(result.totals.wall_seconds, 252);
  });

  it("rounds cost_usd to 6 decimals", async () => {
    const root = makeRoot();
    const specPath = "specs/x.spec.md";
    const lines = [
      JSON.stringify({
        spec_ref: specPath,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.123456789 },
      }),
    ].join("\n") + "\n";
    writeFileSync(join(root, ".context-index", ".session-tracking.jsonl"), lines);

    const result = await aggregate({ projectRoot: root, specPath });
    assert.equal(result.totals.cost_usd, 0.123457);
  });
});
