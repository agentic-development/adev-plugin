/**
 * Doc-link sentinel test for docs/extensions.md.
 *
 * Walks the rendered guide and asserts that every code symbol or file path it
 * cites resolves to an existing artifact in the repo. The point is to catch
 * doc drift early: a docs change that renames a file or moves a symbol should
 * fail this test before the doc lands.
 *
 * Spec: .context-index/specs/features/extensions/extension-authoring-docs.spec.md
 *       AC line 112 — every code symbol cited in docs/extensions.md resolves
 *       to an existing export or file.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve, normalize } from "node:path";

import { PLUGIN_ROOT } from "../helpers.mjs";

const DOCS_PATH = join(PLUGIN_ROOT, "docs", "extensions.md");

/**
 * Pull every backticked code reference from the doc that looks like a path.
 * Heuristic: tokens containing a slash and at least one of the recognized
 * source-tree prefixes (lib/, templates/, extensions/, docs/, .context-index/,
 * skills/, hooks/, tests/). Strips trailing punctuation and anchor fragments.
 */
function extractFileReferences(body) {
  const out = new Set();
  // Pull backticked literals.
  for (const match of body.matchAll(/`([^`\n]+)`/g)) {
    const tok = match[1].trim();
    if (isFileReference(tok)) {
      out.add(normalizeReference(tok));
    }
  }
  // Pull markdown link targets that look like relative paths.
  for (const match of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].trim();
    if (target.startsWith("http") || target.startsWith("#")) continue;
    const stripped = target.split("#")[0];
    if (stripped && isFileReference(stripped)) {
      out.add(normalizeReference(stripped));
    }
  }
  return [...out];
}

function isFileReference(tok) {
  if (!tok || tok.includes(" ")) return false;
  const prefixes = [
    "lib/",
    "templates/",
    "extensions/",
    "docs/",
    ".context-index/",
    "skills/",
    "hooks/",
    "tests/",
    "cli/",
    "../lib/",
    "../templates/",
    "../extensions/",
    "../docs/",
    "../.context-index/",
    "../../lib/",
    "../../.context-index/",
  ];
  return prefixes.some((p) => tok.startsWith(p));
}

function normalizeReference(tok) {
  // Strip trailing punctuation that markdown sometimes glues onto the end.
  return tok.replace(/[.,;:)]+$/, "");
}

/**
 * Schema-placeholder references that are intentionally generic and should
 * not be resolved to a concrete file (e.g., '<name>', '<target>'). The
 * sentinel exists to catch real path drift, not placeholder text.
 */
function isPlaceholder(ref) {
  return /<[^>]+>/.test(ref);
}

function resolveToRepo(ref) {
  // Two reference styles appear in the guide:
  //  (a) Markdown link targets that climb out of docs/: e.g. '../lib/extensions/install.mjs'.
  //      Resolve relative to docs/.
  //  (b) Backticked literals that name repo-root-relative paths: 'lib/cli/report.mjs',
  //      '.context-index/...', 'extensions/...'. Resolve relative to PLUGIN_ROOT.
  if (ref.startsWith("../")) {
    return normalize(resolve(dirname(DOCS_PATH), ref));
  }
  return normalize(resolve(PLUGIN_ROOT, ref));
}

describe("docs/extensions.md — file existence sentinel", () => {
  it("guide file itself exists", () => {
    assert.ok(existsSync(DOCS_PATH), `docs/extensions.md must exist at ${DOCS_PATH}`);
  });

  it("every cited file path resolves to an existing artifact", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    const refs = extractFileReferences(body);

    assert.ok(refs.length > 0, "guide must cite at least one repo path");

    const missing = [];
    for (const ref of refs) {
      if (isPlaceholder(ref)) continue; // schema placeholders like '<name>'
      const target = resolveToRepo(ref);
      if (!existsSync(target)) {
        missing.push(`${ref}  →  ${target}`);
      }
    }

    assert.equal(
      missing.length,
      0,
      `broken references in docs/extensions.md:\n  ${missing.join("\n  ")}`,
    );
  });
});

describe("docs/extensions.md — required content references", () => {
  it("cites the reference extension directory", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    assert.match(body, /extensions\/example-validation-check/, "must reference the worked example");
  });

  it("cites the manifest template", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    assert.match(body, /templates\/adev-extension\.example\.yaml/, "must reference the manifest template");
  });

  it("cites ADR-0003 for merge semantics", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    assert.match(body, /0003-configurable-review-registry\.md/, "must link ADR-0003");
  });

  it("cites lib/extensions/install.mjs as the install implementation", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    assert.match(body, /lib\/extensions\/install\.mjs/, "must reference install implementation");
  });

  it("cites lib/cli/report.mjs as the validator-id binding surface", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    assert.match(body, /lib\/cli\/report\.mjs/, "must reference the report verb");
  });

  it("references the write-time diagnostic hook spec", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    assert.match(
      body,
      /write-time-diagnostic-hook\.spec\.md/,
      "must reference write-time-diagnostic-hook spec",
    );
  });

  it("contains the profile-permissions threat-model paragraph (SEC2-2)", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    assert.match(
      body,
      /profile.*does NOT sandbox|profile.*not.*sandbox/i,
      "must state profile does not sandbox the subprocess (SEC2-2)",
    );
  });

  it("contains the Untrusted sources subsection (SEC2-9)", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    assert.match(body, /Untrusted sources/, "must include Untrusted sources subsection (SEC2-9)");
    assert.match(
      body,
      /npx adev-cli extension install/,
      "Untrusted sources subsection must call out the npx install vector",
    );
  });
});

describe("docs/extensions.md — adev CLI verbs referenced exist", () => {
  it("'adev report --type validator' is registered in cli/index.mjs", () => {
    const cliPath = join(PLUGIN_ROOT, "cli", "index.mjs");
    const cliBody = readFileSync(cliPath, "utf8");
    // The dispatcher in cli/index.mjs imports lib/cli/report.mjs and registers
    // `report` as a verb. Assert both surfaces are present.
    assert.match(cliBody, /report/, "cli/index.mjs must reference the report verb");
    const reportLib = join(PLUGIN_ROOT, "lib", "cli", "report.mjs");
    assert.ok(existsSync(reportLib), "lib/cli/report.mjs must exist");
    const reportBody = readFileSync(reportLib, "utf8");
    assert.match(reportBody, /--type validator/, "report.mjs must support --type validator");
  });
});
