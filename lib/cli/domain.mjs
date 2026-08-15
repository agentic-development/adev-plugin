// lib/cli/domain.mjs
//
// `adev domain` — CLI surface for domain-aware config loading. Replaces the
// inline-Node blocks formerly embedded in:
//
//   skills/validate/SKILL.md      "Domain-Aware Gate Loading"
//   skills/review-specs/SKILL.md  "Domain-Aware Reviewer Loading"
//   skills/implement/SKILL.md     "Domain-Aware Test Config"
//   skills/implement/SKILL.md     "Domain-Aware Verification Config"
//
// Multi-mode verb per spec Behavior 9 — CLI-verb naming is canonical and
// shared. A single `adev domain <subcommand>` dispatches to the four domain
// config flavours, emitting a JSON object on stdout:
//
//   { domain: { resolved_domain, source_level }, gates|reviewers|config, warnings }
//
// Source spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// Task: Task 6 (extract domain-aware gate / reviewer / test-config / verification loading)
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — domain config loading is observational
//     metadata inside lifecycle steps; it is not a step entry/exit. The
//     cli-driver pattern test (tests/cli-driver-pattern.test.mjs) does NOT
//     assert requireGate-first on this module.
//
// Plugin-root resolution: `loadDomainConfig` requires both repoRoot and
// pluginRoot. We resolve pluginRoot from this module's URL — lib/cli/domain.mjs
// → up two levels to the plugin root.
//
// CLI surface:
//   adev domain load-gates         --module <slug> [--charter <path>] [--governance <path>]
//   adev domain load-reviewers     --module <slug> [--charter <path>] [--governance <path>]
//   adev domain load-test-config   --module <slug> [--charter <path>]
//   adev domain load-verification  --module <slug> [--charter <path>]
//                                  [--mcp-server <name>]...
//   adev domain --help
//
// Exit codes (per hook protocol):
//   0  success — JSON written to stdout
//   1  argument error, containment violation, or domain-config error
//      (INVALID_DOMAIN_NAME, BUNDLED_OVERRIDE_BLOCKED, EXTENDS_NOT_FOUND,
//       DOMAIN_CONFIG_TOO_LARGE, DOMAIN_CONFIG_PARSE_ERROR, PATH_ESCAPE).

import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDomain } from "../domains/resolve.mjs";
import { loadDomainConfig } from "../domains/domain-config.mjs";
import { DEFAULT_GATES_PATH, loadCheck1Gates } from "../gates/gate-sets.mjs";
import { mergeReviewers } from "../domains/merge-reviewers.mjs";
import { mergeTestConfig } from "../domains/merge-test-config.mjs";
import { mergeVerification } from "../domains/merge-verification.mjs";
import { parseYaml } from "../profiles/yaml.mjs";

const USAGE =
  "usage: adev domain <resolve|load-gates|load-reviewers|load-test-config|load-verification> --module <slug> [flags]";

// Plugin root: this file lives at <pluginRoot>/lib/cli/domain.mjs.
const __filename = fileURLToPath(import.meta.url);
const PLUGIN_ROOT = resolve(dirname(__filename), "..", "..");

/**
 * Containment check (mirrors lib/cli/gate.mjs SEC-1 and lib/cli/source-manifest.mjs):
 * resolve `relPath` against `absRoot` and reject anything that escapes the
 * tree. Returns the absolute path on success, or null on out-of-bounds.
 */
function resolveContained(absRoot, relPath) {
  const abs = isAbsolute(relPath) ? relPath : resolve(absRoot, relPath);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) return null;
  return abs;
}

/**
 * Read the YAML frontmatter from a charter or spec file and return the parsed
 * object, or null if there is no frontmatter / parse fails. Pure string scan
 * for the delimiters; defers to lib/profiles/yaml.mjs for the actual parse.
 *
 * Exported because `adev gate transitions` must resolve the domain by the same
 * precedence this verb does (charter > module > project). A second frontmatter
 * parser there would be a divergence waiting to happen.
 */
export function readFrontmatter(absPath) {
  let body;
  try {
    body = readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  if (!body.startsWith("---\n") && !body.startsWith("---\r\n")) return null;
  const end = body.indexOf("\n---", 4);
  if (end < 0) return null;
  const front = body.slice(4, end);
  try {
    return parseYaml(front);
  } catch {
    return null;
  }
}

/**
 * Shared argv parser for all four subcommands. The `mcp-server` flag is
 * multivalued (use `multiple: true`) for `load-verification`; other modes
 * accept the flag but ignore it.
 */
function parseCommonArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        module: { type: "string" },
        charter: { type: "string" },
        governance: { type: "string" },
        "mcp-server": { type: "string", multiple: true },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
  return { ok: true, values: parsed.values };
}

/**
 * Resolve the project root, charter frontmatter, and active domain. Shared
 * by all four subcommands. Returns null when an argument error has already
 * been reported and the caller should exit 1.
 */
function resolveActiveDomain({ projectRoot, manifest, values }) {
  if (!values.module) {
    console.error(USAGE);
    console.error("  missing --module");
    return null;
  }

  const absRoot = resolve(projectRoot);

  // Charter frontmatter is optional. When provided, it must live under the
  // project root.
  let charterFrontmatter = null;
  if (values.charter) {
    const absCharter = resolveContained(absRoot, values.charter);
    if (!absCharter) {
      console.error(`charter path escapes project root: ${values.charter}`);
      return null;
    }
    if (!existsSync(absCharter)) {
      console.error(`charter not found: ${values.charter}`);
      return null;
    }
    charterFrontmatter = readFrontmatter(absCharter);
  }

  let domain;
  try {
    domain = resolveDomain(manifest, charterFrontmatter, values.module);
  } catch (err) {
    if (err && err.code === "INVALID_DOMAIN_NAME") {
      console.error(err.message);
      return null;
    }
    throw err;
  }

  return { absRoot, domain };
}

/**
 * Read a governance YAML file (gates.yaml or review.yaml) and return the
 * parsed object, or null when the file is absent. Containment-checked.
 */
function readGovernanceFile(absRoot, relPath) {
  const abs = resolveContained(absRoot, relPath);
  if (!abs) {
    return { ok: false, error: `governance path escapes project root: ${relPath}` };
  }
  if (!existsSync(abs)) {
    return { ok: true, data: null };
  }
  let raw;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (err) {
    return { ok: false, error: `cannot read ${relPath}: ${err.message ?? err}` };
  }
  if (raw.trim() === "") return { ok: true, data: null };
  try {
    return { ok: true, data: parseYaml(raw) };
  } catch (err) {
    return { ok: false, error: `parse error in ${relPath}: ${err.message ?? err}` };
  }
}

export async function run({ projectRoot, argv, manifest }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  const subArgv = argv.slice(1);

  const parseResult = parseCommonArgs(subArgv);
  if (!parseResult.ok) {
    console.error(USAGE);
    console.error(`  ${parseResult.error}`);
    process.exit(1);
  }
  const v = parseResult.values;

  if (v.help) {
    help();
    process.exit(0);
  }

  if (sub === "resolve") {
    runResolve({ projectRoot, manifest, values: v });
    return;
  }
  if (sub === "load-gates") {
    await runLoadGates({ projectRoot, manifest, values: v });
    return;
  }
  if (sub === "load-reviewers") {
    await runLoadReviewers({ projectRoot, manifest, values: v });
    return;
  }
  if (sub === "load-test-config") {
    await runLoadTestConfig({ projectRoot, manifest, values: v });
    return;
  }
  if (sub === "load-verification") {
    await runLoadVerification({ projectRoot, manifest, values: v });
    return;
  }

  console.error(USAGE);
  console.error(`  unknown subcommand: ${sub}`);
  process.exit(1);
}

function runResolve({ projectRoot, manifest, values }) {
  // `resolve` is the minimal mode: just emit the resolved domain. Used by
  // skills that need only `resolved_domain` (e.g., brainstorm Step 1
  // "Domain-Aware Charter Template") without loading gates / reviewers /
  // test-config / verification overlays.
  const resolved = resolveActiveDomain({ projectRoot, manifest, values });
  if (!resolved) process.exit(1);
  console.log(JSON.stringify({ domain: resolved.domain }));
  process.exit(0);
}

async function runLoadGates({ projectRoot, manifest, values }) {
  const resolved = resolveActiveDomain({ projectRoot, manifest, values });
  if (!resolved) process.exit(1);
  const { absRoot, domain } = resolved;

  // The merge itself lives in lib/gates/gate-sets.mjs::loadCheck1Gates, which
  // `lib/gates/doctor.mjs` calls too. This function is the printing and
  // exit-code shell around it; a second copy of the merge here is exactly the
  // duplication that made the doctor's gate-set-divergence finding unreliable.
  // Governance gates default to .context-index/governance/gates.yaml.
  let merged;
  try {
    merged = loadCheck1Gates(absRoot, {
      domain,
      gatesPath: values.governance ?? DEFAULT_GATES_PATH,
    });
  } catch (err) {
    console.error(err.message ?? String(err));
    process.exit(1);
  }

  const { gates, warnings } = merged;
  console.log(JSON.stringify({ domain, gates, warnings }));
  process.exit(0);
}

async function runLoadReviewers({ projectRoot, manifest, values }) {
  const resolved = resolveActiveDomain({ projectRoot, manifest, values });
  if (!resolved) process.exit(1);
  const { absRoot, domain } = resolved;

  let overlay;
  try {
    overlay = loadDomainConfig(
      domain.resolved_domain,
      "reviewers",
      absRoot,
      PLUGIN_ROOT,
    );
  } catch (err) {
    console.error(err.message ?? String(err));
    process.exit(1);
  }

  const govPath =
    values.governance ?? ".context-index/governance/review.yaml";
  const govRead = readGovernanceFile(absRoot, govPath);
  if (!govRead.ok) {
    console.error(govRead.error);
    process.exit(1);
  }

  const { reviewers, warnings } = mergeReviewers(overlay, govRead.data);
  console.log(JSON.stringify({ domain, reviewers, warnings }));
  process.exit(0);
}

async function runLoadTestConfig({ projectRoot, manifest, values }) {
  const resolved = resolveActiveDomain({ projectRoot, manifest, values });
  if (!resolved) process.exit(1);
  const { absRoot, domain } = resolved;

  let overlay;
  try {
    overlay = loadDomainConfig(
      domain.resolved_domain,
      "test-config",
      absRoot,
      PLUGIN_ROOT,
    );
  } catch (err) {
    console.error(err.message ?? String(err));
    process.exit(1);
  }

  const { config, warnings } = mergeTestConfig(overlay);
  console.log(JSON.stringify({ domain, config, warnings }));
  process.exit(0);
}

async function runLoadVerification({ projectRoot, manifest, values }) {
  const resolved = resolveActiveDomain({ projectRoot, manifest, values });
  if (!resolved) process.exit(1);
  const { absRoot, domain } = resolved;

  let overlay;
  try {
    overlay = loadDomainConfig(
      domain.resolved_domain,
      "verification",
      absRoot,
      PLUGIN_ROOT,
    );
  } catch (err) {
    console.error(err.message ?? String(err));
    process.exit(1);
  }

  // Active MCP servers come from --mcp-server (multivalued). When absent,
  // pass an empty Set so mergeVerification treats tools as unavailable.
  const activeServers = new Set(
    Array.isArray(values["mcp-server"]) ? values["mcp-server"] : [],
  );

  const { config, warnings } = mergeVerification(overlay, activeServers);
  console.log(JSON.stringify({ domain, config, warnings }));
  process.exit(0);
}

export function help() {
  console.log("Usage: adev domain <subcommand> --module <slug> [flags]");
  console.log("");
  console.log("Resolve the active domain for a module and load domain-aware");
  console.log("config (gates, reviewers, test-config, verification). Replaces");
  console.log("the inline-Node blocks formerly embedded in skills/validate,");
  console.log("skills/review-specs, and skills/implement.");
  console.log("");
  console.log("Subcommands:");
  console.log("");
  console.log("  resolve            --module <slug> [--charter <path>]");
  console.log("    Resolve the active domain WITHOUT loading any overlay.");
  console.log("    Stdout: JSON { domain: { resolved_domain, source_level } }.");
  console.log("");
  console.log("  load-gates         --module <slug> [--charter <path>] [--governance <path>]");
  console.log("    Resolve the domain, load templates/domains/<d>/gates.yaml,");
  console.log("    and merge .context-index/governance/gates.yaml on top.");
  console.log("    Stdout: JSON { domain, gates, warnings }.");
  console.log("");
  console.log("  load-reviewers     --module <slug> [--charter <path>] [--governance <path>]");
  console.log("    Resolve the domain, load templates/domains/<d>/reviewers.yaml,");
  console.log("    and merge .context-index/governance/review.yaml on top.");
  console.log("    Stdout: JSON { domain, reviewers, warnings }.");
  console.log("");
  console.log("  load-test-config   --module <slug> [--charter <path>]");
  console.log("    Resolve the domain and load templates/domains/<d>/test-config.yaml.");
  console.log("    No governance layer — test-config is domain-only.");
  console.log("    Stdout: JSON { domain, config, warnings }.");
  console.log("");
  console.log("  load-verification  --module <slug> [--charter <path>]");
  console.log("                     [--mcp-server <name>]...");
  console.log("    Resolve the domain and load templates/domains/<d>/verification.yaml.");
  console.log("    Validates tool availability against --mcp-server values.");
  console.log("    Stdout: JSON { domain, config, warnings }.");
  console.log("");
  console.log("Common flags:");
  console.log("  --module <slug>      Module slug for module-level domain lookup (required)");
  console.log("  --charter <path>     Charter file to read domain frontmatter from (optional)");
  console.log("  --governance <path>  Project governance file (defaults under .context-index/governance/)");
  console.log("");
  console.log("Domain resolution precedence (lib/domains/resolve.mjs):");
  console.log("  charter.frontmatter.domain > manifest.modules[].domain > manifest.project.domain > 'software'");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  success — JSON written to stdout");
  console.log("  1  argument error, containment violation, or domain-config error");
}
