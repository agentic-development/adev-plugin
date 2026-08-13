// tests/skills/claim-preflight.test.mjs
//
// Architectural test for the claim-preflight contract in /adev:implement and
// /adev:debug.
//
// Spec: .context-index/specs/features/task-management/lifecycle-integration.spec.md
//       Behaviors 12-17; Error Cases ISSUE_ALREADY_CLAIMED, ISSUE_CLOSED,
//       CLAIM_UNSUPPORTED_BACKEND.
//
// Origin: two agents independently fixed the same p0 bug an hour apart (PRs
// #214 / #215) because no skill re-read the board at the moment work began.
// These assertions pin the halt behaviour, not the wording around it — the
// failure mode being guarded is a future edit that softens "STOP" into
// "consider stopping", which no runtime test would catch.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const IMPLEMENT = "skills/implement/SKILL.md";
const DEBUG = "skills/debug/SKILL.md";

const read = (p) => readFileSync(p, "utf8");

/**
 * Slice out the section a claim block lives in, so "exit 2 means stop" is
 * asserted against the claim gate rather than against some other exit-code
 * table elsewhere in the same file.
 */
function claimSection(md) {
  const start = md.indexOf("adev issues claim");
  assert.notEqual(start, -1, "no `adev issues claim` invocation found");
  const rest = md.slice(start);
  const end = rest.indexOf("\n### ");
  return end === -1 ? rest : rest.slice(0, end);
}

for (const [label, path] of [
  ["/adev:implement", IMPLEMENT],
  ["/adev:debug", DEBUG],
]) {
  test(`${label} claims through the CLI verb, not by writing board fields`, () => {
    const md = read(path);
    assert.match(
      md,
      /adev issues claim <(epic|issue)-id> --owner/,
      "must name the CAS-atomic CLI verb (cli-driver-surface charter)",
    );
    assert.doesNotMatch(
      md,
      /update\([^)]*\bowner\s*:/,
      "must not set `owner` directly — only the CAS loop may write a claim",
    );
    assert.doesNotMatch(
      md,
      /claimed_at\s*:\s*(new Date|Date\.now)/,
      "must not stamp `claimed_at` itself",
    );
  });

  test(`${label} halts on a refused claim and never takes over autonomously`, () => {
    const section = claimSection(read(path));
    assert.match(
      section,
      /\*\*`2`\*\*/,
      "must document exit 2 as its own outcome",
    );
    assert.match(
      section,
      /STOP|halt/i,
      "exit 2 must be a halt, not an advisory",
    );
    assert.match(
      section,
      /never take (the claim )?over autonomously/i,
      "must forbid autonomous takeover of a live claim",
    );
  });

  test(`${label} warns and continues when the backend cannot claim atomically`, () => {
    const section = claimSection(read(path));
    assert.match(section, /CLAIM_UNSUPPORTED_BACKEND/);
    assert.match(
      section,
      /Warn and continue/i,
      "a non-atomic backend must not block work — that trains bypassing",
    );
  });

  test(`${label} releases the claim when the work is finished`, () => {
    assert.match(
      read(path),
      /adev issues release <(epic|issue)-id> --owner/,
      "an unreleased claim outlives the session that took it",
    );
  });
}

test("/adev:implement skips the claim when no backend is configured", () => {
  assert.match(
    read(IMPLEMENT),
    /If `tasks\.backend` is not configured, skip the claim\./,
    "backward compatibility: boards are optional",
  );
});

test("/adev:debug documents the --issue argument it claims against", () => {
  const md = read(DEBUG);
  assert.match(md, /^- `--issue <id>`/m, "must be listed under Arguments");
  assert.match(
    md,
    /### Phase 1\.6: Ownership Claim/,
    "the claim gate is a named phase, so /adev:recover can point at it",
  );
});

test("/adev:debug claims before investigating, not after", () => {
  const md = read(DEBUG);
  const claim = md.indexOf("### Phase 1.6: Ownership Claim");
  const investigate = md.indexOf("### Phase 2: Investigate");
  assert.ok(claim > 0 && investigate > 0, "both phases must exist");
  assert.ok(
    claim < investigate,
    "claiming after Phase 2 would spend the investigation hour this gate exists to save",
  );
});
