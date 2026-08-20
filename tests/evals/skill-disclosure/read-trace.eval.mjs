// tests/evals/skill-disclosure/read-trace.eval.mjs
//
// TIER 1 — read trace. The question no prose assertion can answer:
// did the agent actually OPEN the companion the body pointed it at?
//
// Progressive disclosure leaves a heading, a one-line summary and a pointer in the
// body. An agent that stops at the summary still satisfies every string assertion in
// tests/ — the instruction is present in the repo — while silently skipping the step.
//
// The trace is OBSERVED, not self-reported. `hooks/hooks.json` registers
// `session-capture.sh` on PostToolUse with matcher `.*`, which appends
// `{tool, files, timestamp}` for every tool call INCLUDING those made by dispatched
// subagents (verified empirically 2026-08-19). Asking an agent to report what it read
// would be weaker — a cooperative model tends to report what it was asked about.
//
// TWO PHASES, because a node test cannot dispatch a model:
//   A. in-session: mark the log, run the scenario, write traces/<scenario>.json
//      (see lib/eval/read-trace.mjs — snapshot() then since())
//   B. here:       compare the recorded trace against baselines/<scenario>.json
//
// Run: node --test tests/evals/skill-disclosure/read-trace.eval.mjs
// Excluded from `npm test` by the tests/evals/ rule in scripts/run-tests.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compareToBaseline } from "../../../lib/eval/read-trace.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINES = join(HERE, "baselines");
const TRACES = join(HERE, "traces");

const scenarios = readdirSync(BASELINES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

test("every baseline has a recorded trace to compare against", () => {
  // A baseline with no trace is a silently skipped eval. Failing here is the point:
  // this whole directory exists because tests that cannot fail were shipped green.
  const orphans = scenarios.filter((s) => !existsSync(join(TRACES, `${s}.json`)));
  assert.deepEqual(
    orphans,
    [],
    "baselines with no captured trace — re-run the scenario and record it:\n  " +
      orphans.join("\n  "),
  );
});

for (const scenario of scenarios) {
  const basePath = join(BASELINES, `${scenario}.json`);
  const tracePath = join(TRACES, `${scenario}.json`);
  if (!existsSync(tracePath)) continue;

  const baseline = JSON.parse(readFileSync(basePath, "utf8"));
  const trace = JSON.parse(readFileSync(tracePath, "utf8"));

  test(`${scenario}: opened every companion the path requires`, () => {
    const { missing, extra, ok } = compareToBaseline(trace.companions ?? [], baseline);
    assert.ok(
      ok,
      `the agent did not open ${missing.length} required companion(s) — it ran from ` +
        `the body's summary alone, which is the regression this tier exists for:\n  ` +
        missing.join("\n  ") +
        (extra.length ? `\n(also read, not a failure: ${extra.join(", ")})` : ""),
    );
  });

  test(`${scenario}: read the skill body`, () => {
    for (const b of baseline.requiredBodies ?? []) {
      assert.ok(
        (trace.bodies ?? []).includes(b),
        `${b} was never read — the trace cannot be about this skill`,
      );
    }
  });

  test(`${scenario}: did not load companions this path does not need`, () => {
    // Disclosure is only a saving if the unused companions stay unread.
    const overread = (baseline.mustNotRead ?? []).filter((f) =>
      (trace.companions ?? []).includes(f),
    );
    assert.deepEqual(
      overread,
      [],
      "companions loaded that this invocation does not need — the disclosure benefit " +
        "is lost if a single-pass run pulls the whole catalogue:\n  " + overread.join("\n  "),
    );
  });
}
