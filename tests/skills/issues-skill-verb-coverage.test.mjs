/**
 * Regression guard: skills/issues/SKILL.md is verb-driven.
 *
 * Spec: BEH-9 / INV-3 / INV-7 — the issues skill instructs the agent through
 * `adev issues <sub>` invocations only. It must not name a lib function as a
 * directive, must not carry fenced JavaScript, must state the raw-`br`
 * prohibition, and must retain its Load Skill Extensions block.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SKILL_PATH = join(REPO_ROOT, "skills", "issues", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

/**
 * Lib symbols that may appear ONLY under `## API reference`, where they are
 * documentation of what the verbs wrap — never as a step directive.
 */
const LIB_SYMBOLS = [
  "getIssueManager",
  "renderTasksMd",
  "createEpic",
  "addDependency",
  "milestoneCreate",
  "milestoneList",
  "milestoneShip",
  "milestoneDefer",
  "loadManifest",
];

/**
 * H3 sections under `## Process` that legitimately carry no `adev issues`
 * invocation. Exempted BY NAME — never by loosening the assertion.
 */
const EXEMPT_SECTIONS = new Map([
  [
    // Framing-only: states where the backend configuration comes from and
    // loads skill extensions. It performs no board operation, so its only
    // fenced command is `adev skill-ext load --skill issues` (INV-7).
    "Backend Resolution",
    "framing only; its single command is the Load Skill Extensions block",
  ],
]);

/**
 * Parse the H3 sections that live under a given H2 heading, returning each
 * section's name and the concatenated contents of its fenced `bash` blocks.
 */
function parseH3Sections(md, h2Name) {
  const lines = md.split("\n");
  const sections = [];
  let currentH2 = null;
  let current = null;
  let fenceLang = null;

  for (const line of lines) {
    const fence = /^```(\w*)/.exec(line);
    if (fence) {
      fenceLang = fenceLang === null ? (fence[1] || "") : null;
      continue;
    }
    if (fenceLang !== null) {
      if (current && fenceLang === "bash") current.bash += line + "\n";
      continue;
    }
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      currentH2 = h2[1];
      current = null;
      continue;
    }
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h3) {
      if (currentH2 === h2Name) {
        current = { name: h3[1], bash: "" };
        sections.push(current);
      } else {
        current = null;
      }
      continue;
    }
  }
  return sections;
}

describe("skills/issues/SKILL.md is verb-driven (BEH-9)", () => {
  it("contains no fenced javascript block", () => {
    assert.doesNotMatch(skill, /```javascript/);
    assert.doesNotMatch(skill, /```js\b/);
  });

  it("names no lib function outside the API reference section", () => {
    const parts = skill.split(/^## API reference$/m);
    assert.equal(parts.length, 2, "SKILL.md must have exactly one `## API reference` heading");
    const body = parts[0];
    for (const name of LIB_SYMBOLS) {
      assert.doesNotMatch(body, new RegExp(name), `${name} still appears as a directive`);
    }
  });

  it("every H3 step section names an `adev issues` invocation", () => {
    const sections = parseH3Sections(skill, "Process");
    assert.ok(sections.length >= 12, `expected the Process step sections, found ${sections.length}`);

    const missing = [];
    for (const section of sections) {
      if (EXEMPT_SECTIONS.has(section.name)) {
        assert.doesNotMatch(
          section.bash,
          /\badev issues\b/,
          `${section.name} is exempted but now names an \`adev issues\` verb — drop the exemption`,
        );
        continue;
      }
      if (!/\badev issues\b/.test(section.bash)) missing.push(section.name);
    }
    assert.deepEqual(
      missing,
      [],
      `H3 step sections with no fenced \`adev issues\` invocation: ${missing.join(", ")}`,
    );
  });

  it("states the raw-`br` prohibition", () => {
    assert.match(skill, /never .*\bbr\b/i);
    assert.match(skill, /SYNC_CONFLICT/);
  });

  it("retains the Load Skill Extensions block (INV-7)", () => {
    assert.match(skill, /adev skill-ext load --skill issues/);
  });
});
