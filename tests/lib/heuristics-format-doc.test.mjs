/**
 * Tests that the public schema doc at
 * .context-index/memory/heuristics/_format.md exists and covers the
 * required sections described by the store-and-helper plan.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const formatDocPath = resolve(
  projectRoot,
  ".context-index",
  "memory",
  "heuristics",
  "_format.md",
);

describe("heuristics _format.md schema doc", () => {
  it("exists and is non-empty", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.ok(content.length > 0, "_format.md must not be empty");
  });

  it("documents the Frontmatter Schema", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /Frontmatter Schema/);
    // spot-check key fields
    for (const field of [
      "id",
      "scope",
      "title",
      "pattern",
      "anti-pattern",
      "confidence",
      "evidence",
      "contradicted-by",
      "created",
      "updated",
      "archived",
    ]) {
      assert.match(
        content,
        new RegExp(`\\b${field.replace("-", "[-]")}\\b`),
        `frontmatter field '${field}' must be documented`,
      );
    }
  });

  it("documents the Confidence Lifecycle with promotion thresholds", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /Confidence Lifecycle/);
    assert.match(content, /\blow\b/);
    assert.match(content, /\bmedium\b/);
    assert.match(content, /\bhigh\b/);
    assert.match(content, /2 distinct/);
    assert.match(content, /3 distinct/);
  });

  it("documents the ID Namespace Convention", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /ID Namespace Convention/);
    assert.match(content, /<category-slug>/);
    assert.match(content, /<spec-slug>/);
  });

  it("documents the Redaction Advisory", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /Redaction Advisory/);
    assert.match(content, /distill generalizations/);
  });
});

// ── Task 9: the doc must describe the SHIPPED contract ───────────────────
//
// Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
//
// `_format.md` is the public schema contract (charter row 152), so an
// implementer building against it must not be misled. Two of its sections
// were made wrong by this spec landing: the ID Namespace Convention still
// described an absolute-path hash input, and the recover category slugs
// listed three names that do not exist.

/**
 * The authoritative six diagnosis-category slugs, taken from
 * `skills/recover/SKILL.md` — NOT from `_format.md`, which was the stale
 * source this task exists to correct.
 */
const RECOVER_CATEGORY_SLUGS = [
  "missing-context",
  "ambiguous-spec",
  "constraint-conflict",
  "novel-problem",
  "tool-failure",
  "budget-exhaustion",
];

const recoverSkillPath = resolve(projectRoot, "skills", "recover", "SKILL.md");

describe("heuristics _format.md — signature field", () => {
  it("documents the signature field with its constraints", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /Signature Field/);
    assert.match(content, /\[a-z0-9\]\[a-z0-9-\]\*/);
    assert.match(content, /64/);
    assert.match(content, /optional/i);
  });

  it("states that a signature is never rewritten once assigned", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /never rewritten once assigned/i);
  });

  it("states that signature does not participate in id uniqueness", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /does not participate in\s+.?id.?\s+uniqueness/i);
  });

  it("lists signature in the Frontmatter Schema table", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /^\| `signature` +\| `signature` +\|/m);
  });

  it("documents both signature modes, derived and inherited", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /derived/i);
    assert.match(content, /inherited/i);
    assert.match(content, /blocker_id/);
    // Inherited mode hashes nothing — that is the whole point of the mode.
    assert.match(content, /hashes nothing/i);
  });

  it("names the three derived-mode origins and the single inherited-mode origin", async () => {
    const content = await readFile(formatDocPath, "utf8");
    for (const origin of ["recover", "validate", "implement", "review-specs"]) {
      assert.match(content, new RegExp(`\`${origin}\``), `origin '${origin}' must be documented`);
    }
  });
});

describe("heuristics _format.md — corrected ID Namespace Convention", () => {
  it("describes a repo-relative hash input", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /repo-relative/i);
    assert.match(content, /<repo-relative-spec-path>\\?\|<pattern>/);
  });

  it("no longer describes the hash input as a normalized absolute path", async () => {
    const content = await readFile(formatDocPath, "utf8");
    // Target the actual pre-change claim, and tolerate line wrapping — the
    // doc may legitimately mention the absolute path when explaining what the
    // old rule got wrong.
    assert.doesNotMatch(content, /hash\s+input\s+is\s+(a\s+|an\s+)?(normalized\s+)?absolute/i);
    assert.doesNotMatch(content, /normalized-abs-path/i);
  });

  it("documents the normalizeFailureText operation order, which is load-bearing", async () => {
    const content = await readFile(formatDocPath, "utf8");
    // Stripping before collapsing is what keeps the rule byte-compatible with
    // the one that produced the recover ids already in the store.
    assert.match(
      content,
      /lowercase\s*→\s*strip punctuation[^→]*→\s*collapse[^→]*→\s*trim/i,
    );
  });

  it("states the derived id is location-independent", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /location-independent/i);
  });

  it("states the `.spec` stem is stripped from the slug", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /\.spec/);
    assert.match(content, /stripped/i);
  });

  it("names normalizeIdInput and states there is no punctuation stripping", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /normalizeIdInput/);
    assert.match(content, /no punctuation stripping/i);
  });
});

describe("heuristics _format.md — recover category slugs", () => {
  it("matches exactly the six categories in skills/recover/SKILL.md", async () => {
    const skill = await readFile(recoverSkillPath, "utf8");
    // `#### Category N: NAME` headings are the authoritative source.
    const fromSkill = [...skill.matchAll(/^#### Category \d+: ([A-Z_]+)\s*$/gm)]
      .map((m) => m[1].toLowerCase().replace(/_/g, "-"));
    assert.deepEqual(
      [...fromSkill].sort(),
      [...RECOVER_CATEGORY_SLUGS].sort(),
      "the fixture must track SKILL.md",
    );

    const content = await readFile(formatDocPath, "utf8");
    for (const slug of fromSkill) {
      assert.match(content, new RegExp(`\`${slug}\``), `_format.md must list '${slug}'`);
    }
  });

  it("contains no spec-violation or context-gap slug", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.doesNotMatch(content, /spec-violation/);
    assert.doesNotMatch(content, /context-gap/);
  });

  it("uses a real category slug in its example id", async () => {
    const content = await readFile(formatDocPath, "utf8");
    const example = content.match(/^Example: `?([a-z0-9-]+)-[0-9a-f]+`?\s*$/m);
    assert.ok(example, "the recover section must carry an example id");
    assert.ok(
      RECOVER_CATEGORY_SLUGS.includes(example[1]),
      `example prefix '${example[1]}' must be one of the six real category slugs`,
    );
  });
});
