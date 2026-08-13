import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { run as frontmatterPresent } from "../../lib/diagnostics/tier1/frontmatter-present.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATES = join(REPO_ROOT, "templates");

/**
 * Guard for the template-induced frontmatter defect (issue-585).
 *
 * All six spec templates opened with an H1 and a comment block *above* the
 * `---` delimiter. `lib/diagnostics/tier1/frontmatter-present.mjs` rejects any
 * markdown body before the delimiter, so every spec scaffolded from a template
 * fired an error-severity diagnostic — 128 of 235 spec files in this repo.
 *
 * It was not cosmetic: `adev specify revise` could not parse those specs at
 * all, failing with `INVALID_SPEC_PATH: spec missing or malformed revision`
 * even when `revision:` was present. Since `--revise` is the prescribed path
 * out of a BLOCK verdict, the review-block-auto-retry loop could not run on
 * any template-authored spec.
 *
 * The four charter templates already got this right and produced zero
 * violations, which is what identified the templates as the cause.
 */
describe("templates emit frontmatter first", () => {
  const templateFiles = readdirSync(TEMPLATES)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => f.startsWith("spec-template.") || f.startsWith("charter-template."));

  it("finds the spec and charter templates", () => {
    assert.ok(
      templateFiles.filter((f) => f.startsWith("spec-template.")).length >= 6,
      "expected at least six spec templates",
    );
  });

  for (const file of templateFiles) {
    it(`${file}: first non-blank line is the --- delimiter`, () => {
      const content = readFileSync(join(TEMPLATES, file), "utf8");
      const firstMeaningful = content
        .split(/\r?\n/)
        .find((l) => l.trim() !== "");

      assert.equal(
        firstMeaningful?.trim(),
        "---",
        `${file} must open with frontmatter; a leading H1 or comment makes every ` +
          `artifact scaffolded from it unparseable by adev specify revise`,
      );
    });
  }

  it("a spec scaffolded from each template passes adev/frontmatter-present", () => {
    const dir = mkdtempSync(join(tmpdir(), "adev-template-frontmatter-"));
    try {
      for (const file of templateFiles.filter((f) => f.startsWith("spec-template."))) {
        // Substitute every `{{ placeholder }}` generically — an unreplaced one
        // is not valid YAML and would fail the diagnostic for the wrong reason.
        const body = readFileSync(join(TEMPLATES, file), "utf8").replace(
          /\{\{\s*([a-z_]+)\s*\}\}/gi,
          (_m, name) => (name === "date" ? "2026-01-01" : `example-${name}`),
        );

        const scaffolded = join(dir, `${file.replace(/\.md$/, "")}.spec.md`);
        writeFileSync(scaffolded, body);

        const result = frontmatterPresent({ spec: scaffolded });
        assert.equal(
          result.fired,
          false,
          `${file} scaffolds a spec that fires the diagnostic: ${result.message ?? ""}`,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
