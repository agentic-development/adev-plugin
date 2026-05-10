// tests/skills/validate-ghost-validation.test.mjs
// Regression test for issue-184: adev:validate ghost validation —
// three failure modes that allowed PASS to be fabricated.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "validate", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

describe("validate SKILL.md — ghost validation guards (issue-184)", () => {
  describe("Check 1.5: verifyManifest API call", () => {
    it("does NOT call verifyManifest(specPath) with a single argument", () => {
      // The actual API requires two args: verifyManifest(manifest, projectRoot).
      // Calling with specPath as sole arg returns wrong results.
      assert.doesNotMatch(
        skill,
        /verifyManifest\(specPath\)/,
        "Must not call verifyManifest(specPath) — wrong API signature"
      );
    });

    it("calls verifyManifest with manifest object and projectRoot", () => {
      assert.match(
        skill,
        /verifyManifest\(manifest,\s*projectRoot\)/,
        "Must call verifyManifest(manifest, projectRoot) — the correct two-argument API"
      );
    });

    it("parses the source-manifest block from frontmatter before calling verifyManifest", () => {
      // The manifest object must be parsed from the spec's frontmatter, not derived from the path.
      assert.match(
        skill,
        /[Pp]arse.*source-manifest.*frontmatter|frontmatter.*source-manifest.*[Pp]arse/s,
        "Must instruct parsing source-manifest from spec frontmatter before calling verifyManifest"
      );
    });

    it("describes SHA as SHA-256 of file contents, not git hash-object", () => {
      // The library uses SHA-256 of file contents, not git hash-object.
      // Check that the description does not say git hash-object for this check.
      const check15Match = skill.match(/### Check 1\.5:([\s\S]*?)### Check 2:/);
      assert.ok(check15Match, "Check 1.5 section must exist");
      assert.doesNotMatch(
        check15Match[1],
        /git hash-object/,
        "Check 1.5 must not describe SHA comparison as git hash-object — library uses SHA-256 of file contents"
      );
    });
  });

  describe("Check 2: file reading requirement", () => {
    it("requires Read tool use before citing file:line references", () => {
      assert.match(
        skill,
        /MUST use the Read tool|must.*Read tool.*read.*actual file|Read tool.*before.*cit/i,
        "Check 2 must require explicit Read tool use before citing file:line"
      );
    });

    it("prohibits fabricating or inferring file contents", () => {
      assert.match(
        skill,
        /Do not infer.*fabricate|not.*fabricate.*file|fabricate.*file.*content/i,
        "Check 2 must prohibit inferring or fabricating file contents"
      );
    });

    it("explicitly forbids using plan checkboxes as evidence of completion", () => {
      assert.match(
        skill,
        /Do NOT use plan.*checkbox|plan.*\[x\].*not.*evidence|checkbox.*not.*proof/i,
        "Check 2 must warn against treating plan [x] checkboxes as proof of implementation"
      );
    });

    it("requires Glob or Grep to locate files before reading", () => {
      assert.match(
        skill,
        /Glob.*Grep.*identify|Use Glob and Grep/i,
        "Check 2 must instruct using Glob/Grep to find files before reading them"
      );
    });
  });
});
