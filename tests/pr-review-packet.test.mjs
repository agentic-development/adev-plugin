import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const TEMPLATE_PATH = resolve(REPO_ROOT, ".github", "pull_request_template.md");

// Contractual: these four strings are the charter's Review Packet attributes
// (what, risk_areas, verified_line_by_line, cannot_explain). A rename here is a
// spec change, not an edit. Exported for reuse by the interlock test (Task 3).
export const PACKET_HEADINGS = [
  "## What",
  "## Risk areas and trust boundaries touched",
  "## Verified line by line",
  "## What I cannot explain",
];

const OPEN_MARKER = "<!-- adev:pr-brief -->";
const CLOSE_MARKER = "<!-- /adev:pr-brief -->";

const template = () => readFileSync(TEMPLATE_PATH, "utf8");

test("template contains the four packet headings in the specified order", () => {
  const lines = template().split("\n");
  const h2s = lines.filter((l) => l.startsWith("## ")).map((l) => l.trimEnd());
  assert.deepEqual(h2s, PACKET_HEADINGS);
});

test("template has no frontmatter", () => {
  assert.ok(!template().startsWith("---"), "GitHub renders the file verbatim; frontmatter would be visible");
});

test("template contains exactly one marker pair with nothing between", () => {
  const body = template();
  assert.equal(body.split(OPEN_MARKER).length - 1, 1, "exactly one opening marker");
  assert.equal(body.split(CLOSE_MARKER).length - 1, 1, "exactly one closing marker");
  assert.ok(body.indexOf(OPEN_MARKER) < body.indexOf(CLOSE_MARKER), "opening marker must precede the closing marker");
  const between = body.slice(body.indexOf(OPEN_MARKER) + OPEN_MARKER.length, body.indexOf(CLOSE_MARKER));
  assert.equal(between.trim(), "", "the generated slot ships empty");
});

test("the closing marker is the last non-blank line", () => {
  const lines = template().split("\n").filter((l) => l.trim() !== "");
  assert.equal(lines.at(-1).trim(), CLOSE_MARKER);
});

test("the 'What I cannot explain' section is present by literal heading match", () => {
  // Asserted separately from the ordered check so deleting this section fails
  // with a message naming it, rather than degrading into a generic order diff.
  assert.ok(template().includes("## What I cannot explain"));
});

test("every H2 heading is followed by an HTML-comment prompt", () => {
  const lines = template().split("\n");
  for (const [i, line] of lines.entries()) {
    if (!line.startsWith("## ")) continue;
    const next = lines.slice(i + 1).find((l) => l.trim() !== "");
    assert.ok(
      next && next.trimStart().startsWith("<!--") && next.trim() !== OPEN_MARKER,
      `heading "${line.trim()}" ships bare — every section needs its instructional prompt`,
    );
  }
});

const SKILL_CONSUMERS = ["skills/validate/SKILL.md", "skills/implement/SKILL.md"];

for (const rel of SKILL_CONSUMERS) {
  test(`${rel} names the PR template in its gh pr create prose`, () => {
    const body = readFileSync(resolve(REPO_ROOT, rel), "utf8");
    const prLines = body.split("\n").filter((l) => l.includes("gh pr create"));
    assert.ok(prLines.length > 0, "expected at least one gh pr create suggestion");
    for (const line of prLines) {
      assert.match(
        line,
        /--body-file \.github\/pull_request_template\.md/,
        `gh pr create prose in ${rel} must name the template, else agent-opened PRs carry no packet`,
      );
    }
  });

  test(`${rel} adds no step directive or inline Node alongside the edit`, () => {
    const body = readFileSync(resolve(REPO_ROOT, rel), "utf8");
    for (const line of body.split("\n").filter((l) => l.includes("pull_request_template.md"))) {
      assert.ok(!/node\s+(--input-type=module\s+)?-e/.test(line), "no inline Node on the edited line");
      assert.ok(!/^Run inline Node/.test(line.trim()), "no step directive on the edited line");
    }
  });
}
