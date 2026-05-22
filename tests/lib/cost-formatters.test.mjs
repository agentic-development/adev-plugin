// tests/lib/cost-formatters.test.mjs
//
// Unit tests for lib/cost-formatters.mjs (Task 2 of cost-ticker plan).
// Covers Behaviors 2, 3, 4, 10.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatText, formatJson } from "../../lib/cost-formatters.mjs";

describe("formatText", () => {
  it("renders the compact one-line format (Behavior 2)", () => {
    const agg = {
      spec: "/abs/specs/x.spec.md",
      issue_id: "issue-1",
      totals: {
        input_tokens: 14000,
        output_tokens: 18000,
        cache_read_tokens: 1170000,
        cache_creation_tokens: 22000,
        cost_usd: 0.34,
        wall_seconds: 252,
      },
      checkpoints: [],
      model_breakdown: [{ model: "claude-sonnet-4-6", cost_usd: 0.34, share: 1.0 }],
      skipped_lines: 0,
    };
    const out = formatText(agg, { includeCheckpoints: false });
    assert.match(out, /cost: \$0\.34/);
    assert.match(out, /1\.2M tok/);
    assert.match(out, /cache·read/);
    assert.match(out, /sonnet/);
    assert.match(out, /252s/);
  });

  it('emits "(no usage data yet)" when totals are null (Behavior 5)', () => {
    const out = formatText({
      totals: null,
      model_breakdown: [],
      checkpoints: [],
      skipped_lines: 0,
    });
    assert.equal(out, "cost: (no usage data yet)");
  });

  it("appends per-step table when includeCheckpoints (Behavior 4)", () => {
    const agg = {
      totals: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        cost_usd: 0.01,
        wall_seconds: 10,
      },
      checkpoints: [
        {
          step: "review",
          input_tokens: 50,
          output_tokens: 25,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          cost_usd: 0.005,
          wall_seconds: 5,
        },
      ],
      model_breakdown: [{ model: "sonnet", cost_usd: 0.01, share: 1.0 }],
      skipped_lines: 0,
    };
    const out = formatText(agg, { includeCheckpoints: true });
    assert.match(out, /review/);
    assert.match(out, /total/);
  });

  it("suffixes +N when multiple models contribute (Behavior 10)", () => {
    const agg = {
      totals: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        cost_usd: 0.34,
        wall_seconds: 10,
      },
      checkpoints: [],
      skipped_lines: 0,
      model_breakdown: [
        { model: "claude-sonnet-4-6", cost_usd: 0.28, share: 0.823 },
        { model: "claude-opus-4-7", cost_usd: 0.06, share: 0.177 },
      ],
    };
    const out = formatText(agg, { includeCheckpoints: false });
    assert.match(out, /sonnet\+1/);
  });

  it("uses compact units (K, M) per Behavior 2", () => {
    const agg = {
      totals: {
        input_tokens: 38000,
        output_tokens: 512,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        cost_usd: 0.01,
        wall_seconds: 5,
      },
      checkpoints: [],
      skipped_lines: 0,
      model_breakdown: [{ model: "sonnet", cost_usd: 0.01, share: 1.0 }],
    };
    const out = formatText(agg);
    // 38K tok (in tokens column or total tokens)
    assert.match(out, /38K|38\.\dK/);
    assert.match(out, /512/);
  });

  it("includes 'ungrouped' row when ungrouped checkpoint exists", () => {
    const agg = {
      totals: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        cost_usd: 0.01,
        wall_seconds: 10,
      },
      checkpoints: [
        {
          step: "ungrouped",
          input_tokens: 100,
          output_tokens: 50,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          cost_usd: 0.01,
          wall_seconds: 10,
        },
      ],
      model_breakdown: [{ model: "sonnet", cost_usd: 0.01, share: 1.0 }],
      skipped_lines: 0,
    };
    const out = formatText(agg, { includeCheckpoints: true });
    assert.match(out, /ungrouped/);
  });
});

describe("formatJson", () => {
  it("produces the schema from Behavior 3", () => {
    const agg = {
      spec: "/abs/x.spec.md",
      issue_id: null,
      totals: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        cost_usd: 0.123457,
        wall_seconds: 10,
      },
      checkpoints: [],
      model_breakdown: [{ model: "sonnet", cost_usd: 0.123457, share: 1.0 }],
      skipped_lines: 0,
    };
    const out = JSON.parse(formatJson(agg));
    assert.equal(out.spec, "/abs/x.spec.md");
    assert.equal(out.issue_id, null);
    assert.ok(typeof out.totals.cost_usd === "number");
    assert.ok(Array.isArray(out.checkpoints));
    assert.ok(Array.isArray(out.model_breakdown));
    assert.equal(out.totals.cost_usd, 0.123457);
  });

  it("includes skipped_lines when nonzero", () => {
    const agg = {
      spec: "/abs/x.spec.md",
      issue_id: null,
      totals: null,
      checkpoints: [],
      model_breakdown: [],
      skipped_lines: 2,
    };
    const out = JSON.parse(formatJson(agg));
    assert.equal(out.skipped_lines, 2);
  });

  it("emits totals: null when no matching entries (Behavior 5)", () => {
    const agg = {
      spec: "/abs/x.spec.md",
      issue_id: null,
      totals: null,
      checkpoints: [],
      model_breakdown: [],
      skipped_lines: 0,
    };
    const out = JSON.parse(formatJson(agg));
    assert.equal(out.totals, null);
  });

  it("preserves 3-decimal precision on share", () => {
    const agg = {
      spec: "/abs/x.spec.md",
      issue_id: null,
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        cost_usd: 0.34,
        wall_seconds: 10,
      },
      checkpoints: [],
      model_breakdown: [
        { model: "sonnet", cost_usd: 0.28, share: 0.823 },
        { model: "opus", cost_usd: 0.06, share: 0.177 },
      ],
      skipped_lines: 0,
    };
    const out = JSON.parse(formatJson(agg));
    assert.equal(out.model_breakdown[0].share, 0.823);
    assert.equal(out.model_breakdown[1].share, 0.177);
  });
});
