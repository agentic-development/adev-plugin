/**
 * Architectural test: asserts every in-scope lifecycle skill's SKILL.md
 * carries an "API reference" appendix with the canonical exports it
 * actually invokes. Drift defense for skill prose.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readSkillSurface } from "../helpers.mjs";

const __filename = fileURLToPath(import.meta.url);
const PLUGIN_ROOT = join(__filename, "..", "..", "..");

// Lifecycle skills that must carry an API reference appendix.
const IN_SCOPE_SKILLS = [
  "issues",
  "plan",
  "implement",
  "work",
  "specify",
  "validate",
  "reconcile",
  "debug",
  "status",
  "hygiene",
  "research",
  "sync",
  "build",
  "review-specs",
];

test("api-reference-appendix: every in-scope skill carries an 'API reference' heading", () => {
  for (const skill of IN_SCOPE_SKILLS) {
    const path = join(PLUGIN_ROOT, "skills", skill, "SKILL.md");
    const content = readFileSync(path, "utf8");
    assert.ok(
      /^##\s+API reference\b/im.test(content),
      `skills/${skill}/SKILL.md missing "## API reference" appendix heading`,
    );
  }
});

test("api-reference-appendix: gate-bearing skills cite lifecycle-state APIs", () => {
  // Plan, implement, build, validate, review-specs all gate on prior steps
  // and emit step/intervention/validator/reviewer events.
  const GATE_SKILLS = ["plan", "implement", "build", "validate", "review-specs"];
  for (const skill of GATE_SKILLS) {
    // Whole instruction surface: several appendices moved into
    // references/api-reference.md under progressive disclosure. The heading
    // test above still pins "## API reference" to SKILL.md itself.
    const content = readSkillSurface(skill);
    assert.ok(
      /currentState|requireGate|reportStep|reportReviewer|reportValidator|reportIntervention/.test(
        content,
      ),
      `skills/${skill} missing lifecycle-state API references`,
    );
  }
});

test("api-reference-appendix: issue-board skills cite the issue manager interface", () => {
  // issues, status, hygiene, work, reconcile, research all touch the
  // issue manager.
  const BOARD_SKILLS = [
    "issues",
    "status",
    "hygiene",
    "work",
    "reconcile",
    "research",
  ];
  for (const skill of BOARD_SKILLS) {
    const content = readSkillSurface(skill);
    assert.ok(
      /getIssueManager|IssueManagerInterface/.test(content),
      `skills/${skill} missing issue manager references`,
    );
  }
});

test("api-reference-appendix: code snippets use <ADEV_ROOT> placeholder", () => {
  // Every code snippet that imports from lib/ MUST use <ADEV_ROOT> rather
  // than `~/.claude/` or absolute paths. (This is also asserted by the
  // no-stale-format-refs audit; here we positively verify the placeholder.)
  for (const skill of IN_SCOPE_SKILLS) {
    const path = join(PLUGIN_ROOT, "skills", skill, "SKILL.md");
    const content = readFileSync(path, "utf8");
    // Pick out import-style lines that mention lib/*
    const importLines = content
      .split("\n")
      .filter((l) => /from\s+['"][^'"]*\/lib\//.test(l));
    for (const line of importLines) {
      assert.ok(
        /<ADEV_ROOT>/.test(line) ||
          /\.\.\/(?:\.\.\/)+lib\//.test(line) ||
          /^[^'"]*['"]\.\/.+/.test(line),
        `skills/${skill}/SKILL.md import does not use <ADEV_ROOT>: ${line.trim()}`,
      );
    }
  }
});
