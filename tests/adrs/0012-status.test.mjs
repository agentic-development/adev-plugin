// tests/adrs/0012-status.test.mjs
//
// Architectural test for ADR-0012 acceptance transition.
//
// Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
//       System Constitution Reference — ADR-0012 acceptance gate
// Plan-task: t8

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const ADR_PATH = ".context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md";

test("ADR-0012 status is Accepted", () => {
  const md = readFileSync(ADR_PATH, "utf8");
  // Status section: H2 "## Status" followed by bold "**Accepted**" marker.
  // Match the line within the first 800 chars where the Status section sits.
  const head = md.slice(0, 800);
  assert.match(head, /##\s+Status\s*\n+\*\*Accepted\*\*/);
  // Defensive: the Proposed marker must not remain as the active status.
  // (The historical proposal note may still be cited inside the section as
  // a date-stamped record; we accept that as long as the active status is
  // Accepted.)
  assert.doesNotMatch(head, /##\s+Status\s*\n+\*\*Proposed\*\*/);
});

test("ADR-0012 cites the plan-routing-sidecar spec", () => {
  const md = readFileSync(ADR_PATH, "utf8");
  assert.match(md, /plan-routing-sidecar\.spec\.md/);
});

test("ADR-0012 documents the three satisfied acceptance gates", () => {
  const md = readFileSync(ADR_PATH, "utf8");
  // The acceptance record must mention each of: /adev:route fix, CON-8
  // enumeration, detector enhancement (PLAN_MUTATED_WITHOUT_SIDECAR).
  assert.match(md, /\/adev:route/, "must cite /adev:route fix");
  assert.match(md, /CON-8/, "must cite CON-8 amendment");
  assert.match(
    md,
    /PLAN_MUTATED_WITHOUT_SIDECAR|detector enhancement/,
    "must cite the detector enhancement",
  );
});
