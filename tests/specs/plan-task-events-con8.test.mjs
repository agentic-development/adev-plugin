// tests/specs/plan-task-events-con8.test.mjs
//
// Architectural test for the CON-8 amendment that enumerates the four
// permitted sidecar peers and cross-references ADR-0012.
//
// Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
//       Behavior 8
// Plan-task: t7

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const SPEC_PATH =
  ".context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md";

function loadCon8Block() {
  const md = readFileSync(SPEC_PATH, "utf8");
  // Capture the CON-8 section: from its heading up to (but not including) the
  // next H2 heading.
  const match = md.match(/##[^\n]*CON-8[\s\S]*?(?=\n## |$)/);
  assert.ok(match, "CON-8 section must exist in the spec");
  return match[0];
}

test("plan-task-events.spec.md CON-8 enumerates the four permitted sidecar peers", () => {
  const con8 = loadCon8Block();
  // Per plan-routing-sidecar.spec.md rev 2, the routing peer is `.routing.json`
  // (machine-primary), not `.routing.md`. The other three remain markdown.
  for (const peer of [".review.md", ".validate.md", ".routing.json", ".blockers.md"]) {
    assert.match(
      con8,
      new RegExp(peer.replace(/\./g, "\\.")),
      `CON-8 must enumerate the '${peer}' peer`,
    );
  }
});

test("plan-task-events.spec.md CON-8 cross-references ADR-0012", () => {
  const con8 = loadCon8Block();
  assert.match(con8, /ADR-0012/, "CON-8 must cross-reference ADR-0012");
});

test("plan-task-events.spec.md states adding a fifth peer requires an ADR amendment", () => {
  const con8 = loadCon8Block();
  assert.match(
    con8,
    /fifth\s+peer|adding\s+a\s+(new|fifth)\s+(peer|sidecar).{0,80}ADR/i,
    "CON-8 must state that adding a fifth peer requires an ADR amendment",
  );
});

test("plan-task-events.spec.md revision bumped to >= 2", () => {
  const md = readFileSync(SPEC_PATH, "utf8");
  const m = md.match(/^revision:\s*(\d+)\s*$/m);
  assert.ok(m, "spec must declare a revision field");
  const rev = Number(m[1]);
  assert.ok(rev >= 2, `revision must be >= 2 (got ${rev})`);
});
