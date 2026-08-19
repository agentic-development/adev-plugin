// Drift guard for the single-front-door contract (SA-1 from
// single-front-door.review.md). The contract lives in SKILL.md prose; these
// assertions fail CI if a future edit silently removes it.
//
// Spec: .context-index/specs/cross-cutting/single-front-door.spec.md
//
// This is a structural/prose-shape guard, not a behavioral test — it verifies
// the skill files *say* the right things (these are markdown instructions to a
// model, not code with a runtime), matching the convention of
// skills-extension-coverage and skills-no-inline-node.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillSurface } from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS = resolve(__dirname, "..", "..", "skills");
// SKILL.md plus its references/ companions: /adev:work's routing tables moved
// into step companions under progressive disclosure, and this suite is about
// the routes the skill ships, not which file holds the table.
const read = (slug) => readSkillSurface(slug);

// The lifecycle-spine skills that must carry a next-step handoff.
const SPINE = ["brainstorm", "specify", "review-specs", "plan", "route", "implement"];

// Skills that must NOT carry the footer — they emit terminal completion tokens
// that must remain the final line of output.
const TERMINAL = ["build", "validate"];

// The routes /adev:work's classification table documents (26). Removing any of
// these is the drift SA-1 warns about.
const DOCUMENTED_ROUTES = [
  "brainstorm", "specify", "review-specs", "plan", "route", "build",
  "implement", "write-test", "debug", "validate", "eval", "status",
  "hygiene", "reconcile", "codehealth", "issues", "research", "document",
  "deploy", "retro", "sample", "learn", "init", "sync", "prototype", "repomap",
];

const NEXT_STEP_HEADING = "## Next Step in the Lifecycle";

test("gateway (using-adev) keeps the tiered table and route-through-the-door framing", () => {
  const md = read("using-adev");
  assert.ok(md.includes("### Start here"), "gateway must keep a 'Start here' tier");
  assert.ok(
    md.includes("### Lifecycle stages"),
    "gateway must keep a 'Lifecycle stages' tier",
  );
  assert.ok(
    md.includes("## Route Through the Front Door"),
    "gateway must keep the 'Route Through the Front Door' framing (not the old always-hunt-for-a-skill rule)",
  );
});

test("/adev:work keeps the conductor surface (table, projection, conductor mode)", () => {
  const md = read("work");
  assert.ok(
    md.includes("### Work Type Classification Table"),
    "work must keep its classification table",
  );
  assert.ok(
    md.includes("### Next-Step Projection"),
    "work must keep the Next-Step Projection table (no-arg continue)",
  );
  assert.ok(
    md.includes("## Conductor Mode"),
    "work must keep Conductor Mode",
  );
});

test("/adev:work routes to every documented skill (route coverage)", () => {
  const md = read("work");
  const missing = DOCUMENTED_ROUTES.filter((slug) => !md.includes(`/adev:${slug}`));
  assert.deepEqual(
    missing,
    [],
    `work's routing lost coverage for: ${missing.join(", ")}`,
  );
});

test("spine skills each carry a Next Step handoff", () => {
  for (const slug of SPINE) {
    const md = read(slug);
    assert.ok(
      md.includes(NEXT_STEP_HEADING),
      `skills/${slug}/SKILL.md must carry a '${NEXT_STEP_HEADING}' handoff`,
    );
  }
});

test("terminal-token skills do NOT carry the Next Step footer", () => {
  for (const slug of TERMINAL) {
    const md = read(slug);
    assert.ok(
      !md.includes(NEXT_STEP_HEADING),
      `skills/${slug}/SKILL.md must NOT carry '${NEXT_STEP_HEADING}' (would follow the terminal completion token)`,
    );
  }
});
