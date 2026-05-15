/**
 * End-to-end integration test for the read-time defaulting flow.
 *
 * Spec:  .context-index/specs/features/lifecycle-artifacts/read-time-defaulting.spec.md
 * Plan:  .context-index/specs/features/lifecycle-artifacts/read-time-defaulting.plan.md (Task 3)
 *
 * Wires together:
 *   - `lib/kinds.mjs` (kind enumeration + defaults)
 *   - frontmatter parser (`parseSpecFrontmatter` in `lib/meta-tools.mjs`)
 *   - `lib/git-timestamp.mjs` (creation timestamp + mtime fallback)
 *
 * Verifies the spec's Interaction Contract end-to-end on a temp git repo:
 *   1. Explicit `kind:` → kindResolved='explicit', kindValid=true
 *   2. Missing `kind:` on pre-cutover artifact → defaulted + LEGACY_DEFAULTED
 *   3. Missing `kind:` on post-cutover artifact → defaulted + MISSING_KIND
 *   4. Uncommitted file → mtime fallback with warning attached
 *   5. Disk content is never modified by parsing
 *
 * The cutover classification logic in this test mirrors what
 * `/adev:hygiene`'s kind-validity pass (hygiene-kind-validity plan) will
 * implement — this integration test asserts the building blocks (parser +
 * timestamp helper) compose correctly into that flow.
 */

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";

import { createTempGitRepo, cleanupTempDir, writeFixture } from "../helpers.mjs";
import { parseSpecFrontmatter } from "../../lib/meta-tools.mjs";
import { getCreationTimestamp } from "../../lib/git-timestamp.mjs";

/**
 * Classify an artifact per the spec's Interaction Contract.
 * Mirrors the future `/adev:hygiene` kind-validity pass logic.
 *
 * @param {string} filePath
 * @param {string} cutoverIso - ISO 8601 cutover date.
 * @returns {Promise<{ code: string|null, warning: string|null, kind: string, kindValid: boolean, kindResolved: string }>}
 */
async function classify(filePath, cutoverIso) {
  const fm = parseSpecFrontmatter(filePath);
  const ts = await getCreationTimestamp(filePath);

  let code = null;
  if (!fm.kindValid) {
    code = "INVALID_KIND";
  } else if (fm.kindResolved === "default") {
    code =
      Date.parse(ts.timestamp) > Date.parse(cutoverIso)
        ? "MISSING_KIND"
        : "LEGACY_DEFAULTED";
  }
  return {
    code,
    warning: ts.warning,
    kind: fm.kind,
    kindValid: fm.kindValid,
    kindResolved: fm.kindResolved,
  };
}

describe("read-time defaulting integration", () => {
  let repo;
  const cutover = "2026-01-01T00:00:00Z";

  // Fixture paths.
  let explicitSpec;
  let legacySpec;
  let postCutoverSpec;
  let uncommittedSpec;
  let invalidKindSpec;

  before(() => {
    repo = createTempGitRepo();

    // 1. Explicit kind, committed at a recent date.
    explicitSpec = "specs/features/foo/explicit.spec.md";
    writeFixture(
      repo,
      explicitSpec,
      [
        "---",
        "charter: foo",
        "kind: behavioral",
        "status: planned",
        "---",
        "",
        "# Explicit behavioral spec — distinct fixture body",
        "",
        "Each fixture in this suite uses a unique body to prevent git's",
        "rename-detection heuristic from linking unrelated sibling files.",
        "",
      ].join("\n")
    );
    commit(repo, explicitSpec, "2026-03-01T10:00:00Z", "add explicit");

    // 2. Pre-cutover artifact: no kind:, committed BEFORE cutover.
    // Body deliberately distinct so `git log --follow`'s rename heuristic
    // does not misattribute later sibling files as renames of this one.
    legacySpec = "specs/features/foo/legacy.spec.md";
    writeFixture(
      repo,
      legacySpec,
      [
        "---",
        "charter: foo",
        "status: planned",
        "---",
        "",
        "# Legacy spec — pre-cutover content unique to this file",
        "",
        "Body text exclusive to the legacy fixture so git rename",
        "detection does not link it to siblings.",
        "",
      ].join("\n")
    );
    commit(repo, legacySpec, "2025-08-01T10:00:00Z", "add legacy");

    // 3. Post-cutover artifact: no kind:, committed AFTER cutover.
    postCutoverSpec = "specs/features/foo/post-cutover.spec.md";
    writeFixture(
      repo,
      postCutoverSpec,
      [
        "---",
        "charter: foo",
        "status: planned",
        "---",
        "",
        "# Post-cutover spec — content distinct from legacy and uncommitted",
        "",
        "Lorem ipsum dolor sit amet consectetur adipiscing elit, distinct",
        "phrasing to avoid git --follow misattributing this as a rename.",
        "",
      ].join("\n")
    );
    commit(repo, postCutoverSpec, "2026-04-01T10:00:00Z", "add post-cutover");

    // 4. Uncommitted: no kind:, file exists on disk only.
    uncommittedSpec = "specs/features/foo/uncommitted.spec.md";
    writeFixture(
      repo,
      uncommittedSpec,
      [
        "---",
        "charter: foo",
        "status: planned",
        "---",
        "",
        "# Uncommitted spec — never staged",
        "",
        "Content unique to the uncommitted fixture; mtime drives classification.",
        "",
      ].join("\n")
    );
    // Pin mtime so the warning path is deterministic.
    const knownMtime = new Date("2026-02-15T12:00:00Z");
    utimesSync(join(repo, uncommittedSpec), knownMtime, knownMtime);

    // 5. Invalid kind value (not in SPEC_KINDS).
    invalidKindSpec = "specs/features/foo/invalid-kind.spec.md";
    writeFixture(
      repo,
      invalidKindSpec,
      [
        "---",
        "charter: foo",
        "kind: bogus",
        "status: planned",
        "---",
        "",
        "# Invalid kind spec — value `bogus` is not in SPEC_KINDS",
        "",
        "Distinct body so rename-tracking does not associate this fixture.",
        "",
      ].join("\n")
    );
    commit(repo, invalidKindSpec, "2026-03-15T10:00:00Z", "add invalid-kind");
  });

  after(() => cleanupTempDir(repo));

  it("exposes kind, kindValid, kindResolved on every parsed artifact", () => {
    const explicit = parseSpecFrontmatter(join(repo, explicitSpec));
    assert.equal(explicit.kind, "behavioral");
    assert.equal(explicit.kindValid, true);
    assert.equal(explicit.kindResolved, "explicit");

    const legacy = parseSpecFrontmatter(join(repo, legacySpec));
    assert.equal(legacy.kindResolved, "default");
    assert.equal(legacy.kindValid, true);
    assert.ok(legacy.kind, "kind must be non-null even when defaulted");

    const invalid = parseSpecFrontmatter(join(repo, invalidKindSpec));
    assert.equal(invalid.kind, "bogus");
    assert.equal(invalid.kindValid, false);
    assert.equal(invalid.kindResolved, "explicit");
  });

  it("classifies pre-cutover defaulted artifact as LEGACY_DEFAULTED", async () => {
    const result = await classify(join(repo, legacySpec), cutover);
    assert.equal(result.kindResolved, "default");
    assert.equal(result.code, "LEGACY_DEFAULTED");
    assert.equal(result.warning, null, "committed file uses git, no warning");
  });

  it("classifies post-cutover defaulted artifact as MISSING_KIND", async () => {
    const result = await classify(join(repo, postCutoverSpec), cutover);
    assert.equal(result.kindResolved, "default");
    assert.equal(result.code, "MISSING_KIND");
    assert.equal(result.warning, null);
  });

  it("falls back to mtime with warning on uncommitted artifact", async () => {
    const result = await classify(join(repo, uncommittedSpec), cutover);
    // mtime (2026-02-15) is AFTER cutover (2026-01-01) → MISSING_KIND with warning.
    assert.equal(result.kindResolved, "default");
    assert.equal(result.code, "MISSING_KIND");
    assert.ok(result.warning, "mtime fallback must attach a warning");
    assert.match(result.warning, /Git creation timestamp unavailable/i);
  });

  it("flags INVALID_KIND when kind value is not in the enumeration", async () => {
    const result = await classify(join(repo, invalidKindSpec), cutover);
    assert.equal(result.kindValid, false);
    assert.equal(result.code, "INVALID_KIND");
  });

  it("explicit kind on post-cutover artifact yields no finding", async () => {
    const result = await classify(join(repo, explicitSpec), cutover);
    assert.equal(result.code, null);
    assert.equal(result.kindResolved, "explicit");
    assert.equal(result.kindValid, true);
  });

  it("does not modify disk content while parsing", () => {
    const before = readFileSync(join(repo, legacySpec), "utf8");
    const mtimeBefore = statSync(join(repo, legacySpec)).mtimeMs;

    // Parse multiple times.
    parseSpecFrontmatter(join(repo, legacySpec));
    parseSpecFrontmatter(join(repo, legacySpec));
    parseSpecFrontmatter(join(repo, explicitSpec));

    const after = readFileSync(join(repo, legacySpec), "utf8");
    const mtimeAfter = statSync(join(repo, legacySpec)).mtimeMs;
    assert.equal(before, after, "file content unchanged");
    assert.equal(mtimeBefore, mtimeAfter, "mtime unchanged");
  });
});

/**
 * Commit a single file inside `repo` at a fixed author/committer date.
 * @param {string} repo
 * @param {string} relPath
 * @param {string} iso
 * @param {string} msg
 */
function commit(repo, relPath, iso, msg) {
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: iso,
    GIT_COMMITTER_DATE: iso,
  };
  execSync(`git add ${JSON.stringify(relPath)}`, { cwd: repo, stdio: "ignore" });
  execSync(`git commit -m ${JSON.stringify(msg)}`, {
    cwd: repo,
    stdio: "ignore",
    env,
  });
}
