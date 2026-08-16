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

describe("docs/extensions.md — governance contribution contract", () => {
  const GOV_PATH = join(PLUGIN_ROOT, "docs", "governance.md");
  const CLI_PATH = join(PLUGIN_ROOT, "docs", "cli-reference.md");

  it("documents the payload directory, consent flag, interpreter allowlist and never-writable registries", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    for (const needle of [
      ".context-index/extensions/",
      "--allow-exec",
      "interpreter allowlist",
      "risk-policies.yaml",
      "sensitive-paths.yaml",
    ]) {
      assert.ok(body.includes(needle), `docs/extensions.md must document ${needle}`);
    }
  });

  it("names the five writable registries with their root keys", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    const pairs = [
      ["validate.yaml", "checks"],
      ["review.yaml", "reviewers"],
      ["gates.yaml", "gates"],
      ["diagnostics.yaml", "diagnostics"],
      ["boundaries.yaml", "boundaries"],
    ];
    for (const [file, rootKey] of pairs) {
      const row = new RegExp(
        `\`${file.replace(".", "\\.")}\`[^\\n]*\`${rootKey}\``,
      );
      assert.match(body, row, `must map ${file} to root key ${rootKey}`);
    }
  });

  it("field-allowlist tables match FIELD_ALLOWLIST field-for-field", async () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    const { FIELD_ALLOWLIST } = await import("../../lib/extensions/governance-registry.mjs");

    for (const [target, fields] of FIELD_ALLOWLIST) {
      // The allowlist row is the table row whose first cell is the registry file.
      const row = body
        .split("\n")
        .find((l) => l.startsWith(`| \`${target}\` |`) && l.includes("`id`"));
      assert.ok(row, `docs/extensions.md has no field-allowlist row for ${target}`);

      const documented = new Set([...row.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]));
      documented.delete(target.replace(".yaml", ""));

      for (const field of fields) {
        assert.ok(
          documented.has(field),
          `${target} allowlist row omits '${field}' (FIELD_ALLOWLIST has it)`,
        );
      }
      for (const field of documented) {
        assert.ok(
          fields.has(field),
          `${target} allowlist row documents '${field}', which FIELD_ALLOWLIST does not allow`,
        );
      }
      assert.equal(
        documented.size,
        fields.size,
        `${target} allowlist row lists ${documented.size} fields, FIELD_ALLOWLIST has ${fields.size}`,
      );
    }
  });

  it("states that the payload set is derived, not declared", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    assert.match(body, /derived/i, "must say the payload set is derived");
    assert.ok(body.includes("package.skill"), "must name package.skill");
    assert.ok(body.includes("package.adapter"), "must name package.adapter");
    assert.ok(body.includes("INTERPRETER_ALLOWLIST"), "must cite INTERPRETER_ALLOWLIST");
    assert.ok(body.includes("FIELD_ALLOWLIST"), "must cite FIELD_ALLOWLIST");
  });

  it("documents both emission forms and why they differ", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    assert.ok(body.includes("ABS_PATH_REJECTED"), "must cite ABS_PATH_REJECTED");
    assert.match(body, /absolute/i, "must describe the absolute command form");
    assert.match(
      body,
      /`\.context-index\/`-relative/,
      "must describe the .context-index/-relative package form",
    );
  });

  it("documents the non-contributable dispatch and package.args fields", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    assert.ok(body.includes("dispatch: triggered"), "must name dispatch: triggered");
    assert.ok(body.includes("package.args"), "must name package.args");
  });

  it("documents the project-path install limitation", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    assert.match(
      body,
      /project whose absolute path contains/i,
      "must document the refusal for unsafe project paths",
    );
    assert.ok(body.includes("assertSafeScalar"), "must cite assertSafeScalar as the cause");
  });

  it("no longer cites the removed validateGovernanceEntry / GOVERNANCE_SCHEMA surface", () => {
    const body = readFileSync(DOCS_PATH, "utf8");
    assert.equal(
      body.includes("validateGovernanceEntry"),
      false,
      "validateGovernanceEntry was removed in 7f841825",
    );
    assert.equal(body.includes("GOVERNANCE_SCHEMA"), false, "GOVERNANCE_SCHEMA no longer exists");
    assert.ok(body.includes("validateEntryFields"), "must cite validateEntryFields instead");
  });

  it("docs/cli-reference.md documents the --allow-exec install flag", () => {
    const cli = readFileSync(CLI_PATH, "utf8");
    assert.match(cli, /extension install[^\n]*--allow-exec/);
    assert.match(cli, /per-install/i, "consent is per-install and never remembered");
    assert.match(cli, /non-interactive/i, "must describe the non-interactive refusal");
  });

  it("docs/governance.md documents extension provenance and merge refusals", () => {
    const gov = readFileSync(GOV_PATH, "utf8");
    assert.ok(gov.includes("source: extension:"), "must document the source stamp");
    assert.ok(gov.includes("exec_consented_at"), "must document the consent stamp");
    assert.ok(gov.includes("lib/domains/merge-gates.mjs"), "must cite the gate projection");
    assert.ok(gov.includes("GOVERNANCE_PARSE_REFUSED"), "must document the parse refusal");
    assert.match(gov, /byte-identical/, "must state a colliding entry is left byte-identical");
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
