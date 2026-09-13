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
import { readSkillSurface } from "../helpers.mjs";

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

/**
 * Slice out one `## <heading>` section so an assertion cannot be satisfied by
 * an unrelated part of the file. Several of the strings below (`64`,
 * `[a-z0-9][a-z0-9-]*`, `derived`) already appear elsewhere in the document,
 * so a whole-file match would pass against the pre-change version.
 */
function section(content, heading) {
  const parts = content.split(/^## /m);
  const found = parts.find((p) => p.startsWith(heading));
  assert.ok(found, `_format.md must carry a '## ${heading}' section`);
  return found;
}

describe("heuristics _format.md — signature field", () => {
  it("documents the signature field with its constraints", async () => {
    const content = await readFile(formatDocPath, "utf8");
    const sig = section(content, "Signature Field");
    assert.match(sig, /\/\^\[a-z0-9\]\[a-z0-9-\]\*\$\//);
    assert.match(sig, /Maximum length: 64/);
    assert.match(sig, /\*\*Optional\.\*\*/);
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
    const sig = section(content, "Signature Field");
    assert.match(sig, /The two signature modes/);
    assert.match(sig, /Derived mode/);
    assert.match(sig, /Inherited mode/);
    assert.match(sig, /blocker_id/);
    // Inherited mode hashes nothing — that is the whole point of the mode.
    assert.match(sig, /hashes nothing/i);
  });

  it("names the three derived-mode origins and the single inherited-mode origin", async () => {
    const content = await readFile(formatDocPath, "utf8");
    const sig = section(content, "Signature Field");
    for (const origin of ["recover", "validate", "implement", "review-specs"]) {
      assert.match(sig, new RegExp(`\`${origin}\``), `origin '${origin}' must be documented`);
    }
  });

  it("documents the normalizeFailureText operation order, which is load-bearing", async () => {
    const sig = section(await readFile(formatDocPath, "utf8"), "Signature Field");
    // Stripping before collapsing is what keeps the rule byte-compatible with
    // the one that produced the recover ids already in the store. Matched
    // order-only, so rewording the connectors does not break the assertion.
    const order = ["lowercase", "strip punctuation", "collapse", "trim"].map((step) =>
      sig.toLowerCase().indexOf(step),
    );
    for (const idx of order) assert.notEqual(idx, -1, "every step must be named");
    assert.deepEqual([...order].sort((a, b) => a - b), order, "the steps must appear in order");
  });
});

describe("heuristics _format.md — corrected ID Namespace Convention", () => {
  it("describes a repo-relative hash input", async () => {
    const content = await readFile(formatDocPath, "utf8");
    assert.match(content, /repo-relative/i);
    assert.match(content, /<repo-relative-spec-path>\\?\|<pattern>/);
  });

  it("no longer describes the digest with the vague pre-change wording", async () => {
    const content = await readFile(formatDocPath, "utf8");
    // This is the phrasing the pre-change file actually used. It said nothing
    // about the hash INPUT, which is what made the section wrong once the
    // input changed from an absolute path to a repo-relative one.
    assert.doesNotMatch(content, /6-8 hex chars/i);
    assert.doesNotMatch(content, /normalized-abs-path/i);
  });

  it("names the normalizer each extractor passes to the shared digest function", async () => {
    const ids = section(await readFile(formatDocPath, "utf8"), "ID Namespace Convention");
    // The two extractors deliberately differ: /adev:validate hashes a path,
    // /adev:recover hashes free text. Claiming one normalizer for both is the
    // divergence this assertion guards.
    assert.match(ids, /normalizeIdInput/);
    assert.match(ids, /normalizeFailureText/);
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
    // The six `#### Category N:` headings live in recover's Step 3 companion
    // under progressive disclosure; read the whole instruction surface so this
    // still tracks them.
    const skill = readSkillSurface("recover");
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
    // Scope to the recover subsection — the validate subsection carries its
    // own `Example:` line, and an unanchored match would silently retarget
    // onto it if the sections were ever reordered.
    const ids = section(content, "ID Namespace Convention");
    const recoverSubsection = ids.split(/^### /m).find((s) => s.startsWith("`/adev:recover`"));
    assert.ok(recoverSubsection, "the ID section must carry a /adev:recover subsection");
    const example = recoverSubsection.match(/^Example: `?([a-z0-9-]+)-[0-9a-f]+`?\s*$/m);
    assert.ok(example, "the recover section must carry an example id");
    assert.ok(
      RECOVER_CATEGORY_SLUGS.includes(example[1]),
      `example prefix '${example[1]}' must be one of the six real category slugs`,
    );
  });
});
