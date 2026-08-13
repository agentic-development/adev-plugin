// tests/cli/diagnose-slow-budget.test.mjs
//
// Regression guard for the load-sensitive `adev diagnose` flake (issue-593).
//
// `adev/diagnostic-slow` fires when a producer exceeds a 200 ms SOFT timing
// budget. It carries `severity: 'info'` — it reports a property of the machine
// (how loaded it was), not of the artifacts being inspected, and
// lib/lifecycle-state.mjs already excludes it from `diagnostic_warnings` as
// "observability-only severity".
//
// `formatHuman` did not make that distinction: any entry in `envelope.errors`
// suppressed the "All checks passed." line. So under full-suite concurrency a
// clean project rendered as
//
//   [registry-error] adev/diagnostic-slow: runner exceeded 200 ms soft budget:
//                    adev/status-enum-legal (took 250 ms)
//
// with no verdict line at all — which is how tests/cli/diagnose.test.mjs came
// to pass 29/29 in isolation and fail in the full suite. It was never a
// shared-state isolation bug; it was a wall-clock threshold leaking into the
// program's semantic output.
//
// These assertions are deterministic: they drive the renderer with a synthetic
// envelope rather than trying to make a machine slow on demand.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatHuman } from "../../lib/cli/diagnose.mjs";

const SLOW = {
  id: "adev/diagnostic-slow",
  severity: "info",
  message: "runner exceeded 200 ms soft budget: adev/status-enum-legal (took 250 ms)",
};

describe("adev diagnose — info-severity registry entries are observability, not verdicts", () => {
  it("still reports success when only a slow-budget entry is present", () => {
    const out = formatHuman({ fired: [], errors: [SLOW] }, { quiet: false });

    assert.match(
      out,
      /All checks passed\./,
      "a slow producer must not suppress the verdict line — it says nothing about the artifacts",
    );
  });

  it("still surfaces the slow entry so the observability is not lost", () => {
    const out = formatHuman({ fired: [], errors: [SLOW] }, { quiet: false });
    assert.match(out, /adev\/diagnostic-slow/);
    assert.match(out, /soft budget/);
  });

  it("drops info-severity registry entries under --quiet, like info firings", () => {
    const out = formatHuman({ fired: [], errors: [SLOW] }, { quiet: true });
    assert.doesNotMatch(out, /adev\/diagnostic-slow/);
    assert.match(out, /All checks passed\./);
  });

  it("a genuine error-severity registry entry still suppresses the success line", () => {
    const out = formatHuman(
      {
        fired: [],
        errors: [{ id: "adev/registry-broken", severity: "error", message: "bad entry" }],
      },
      { quiet: false },
    );

    assert.doesNotMatch(
      out,
      /All checks passed\./,
      "real registry errors must still prevent a success verdict",
    );
    assert.match(out, /adev\/registry-broken/);
  });

  it("a warning-severity registry entry also suppresses the success line", () => {
    const out = formatHuman(
      {
        fired: [],
        errors: [{ id: "adev/runner-threw", severity: "warning", message: "boom" }],
      },
      { quiet: false },
    );
    assert.doesNotMatch(out, /All checks passed\./);
  });

  it("a slow entry alongside a real firing does not change the firing output", () => {
    const out = formatHuman(
      {
        fired: [
          { id: "adev/status-enum-legal", severity: "error", message: "illegal status", spec: "a.spec.md" },
        ],
        errors: [SLOW],
      },
      { quiet: false },
    );

    assert.doesNotMatch(out, /All checks passed\./);
    assert.match(out, /adev\/status-enum-legal/);
    assert.match(out, /adev\/diagnostic-slow/);
  });
});
