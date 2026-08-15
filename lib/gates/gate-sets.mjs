/**
 * The two gate-set views, as one shared library.
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 *
 * A project's gates can be read two ways, and adev reads them both:
 *
 *   - **the raw view** (`loadDoctorGates`) — `.context-index/governance/gates.yaml`
 *     verbatim, which is what `adev gate doctor` diagnoses;
 *   - **the consumer view** (`loadCheck1Gates`) — the active domain's gates
 *     overlay with the project's governance file merged on top, which is what
 *     `adev domain load-gates` emits and what validate check 1 actually runs.
 *
 * Before this module the second view existed TWICE: once in
 * `lib/cli/domain.mjs::runLoadGates` and once, copied, in
 * `lib/gates/doctor.mjs::mergedGateIds`. The copy was not laziness —
 * `runLoadGates` calls `process.exit()` on every path and writes to stdout, so
 * it cannot be called as a library. The cost of the copy is that the doctor's
 * `gate-set-divergence` finding compares against a merge only the doctor
 * performs: change one side and the finding either fires forever or never
 * fires again, with every test still green. One definition, two callers, is
 * the only arrangement in which that finding means anything.
 *
 * **Library semantics.** Nothing here calls `process.exit()` and nothing here
 * writes to stdout or stderr. Every failure is a return value or a throw, and
 * every throw that describes a PROJECT state (as opposed to a bug in this
 * file) carries a `code`. The CLI layer owns exit codes and printing; the
 * doctor layer owns findings.
 *
 * Zero external dependencies (Constitution Principle 1).
 *
 * @module lib/gates/gate-sets
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDomainConfig } from "../domains/domain-config.mjs";
import { mergeGates } from "../domains/merge-gates.mjs";
import { resolveDomain } from "../domains/resolve.mjs";
import { parseYaml } from "../profiles/yaml.mjs";

/** Project-relative default locations, shared by both views. */
export const DEFAULT_GATES_PATH = ".context-index/governance/gates.yaml";
export const DEFAULT_MANIFEST_PATH = ".context-index/manifest.yaml";

/**
 * The tier a gate that declares none runs in. `gates.yaml` documents `tier` as
 * optional with this default, and `/adev:validate` § Check 1 says the same; the
 * consumer view materialises it so no downstream reader has to re-derive it.
 */
export const DEFAULT_GATE_TIER = "fast";

/** This file lives at <pluginRoot>/lib/gates/gate-sets.mjs. */
export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Resolve `relPath` against `absRoot` and refuse anything that escapes the
 * tree. Returns the absolute path, or null when out of bounds.
 *
 * @param {string} absRoot
 * @param {string} relPath
 * @returns {string|null}
 */
function resolveContained(absRoot, relPath) {
  const abs = isAbsolute(relPath) ? relPath : resolve(absRoot, relPath);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) return null;
  return abs;
}

/**
 * Build an Error that describes a project state rather than a defect here.
 *
 * @param {string} code
 * @param {string} message
 * @returns {Error}
 */
function coded(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Hash a gate's RESOLVED ARGV into the `command_sha` that Check 1 records on
 * each `gate_outcomes[]` element.
 *
 * **The canonical form is `JSON.stringify(argv)`** — the argv array exactly as
 * it would be handed to `execFile`, serialised by `JSON.stringify` with no
 * sorting, no separator joining, no trimming and no normalisation — hashed as
 * UTF-8 with SHA-256 and rendered lowercase hex.
 *
 * That sentence is a CONTRACT, not an implementation note. The attestation rule
 * recomputes this value from `loadCheck1Gates(projectRoot)` — the RESOLVED,
 * merged gate set, the same function Check 1 itself calls — and compares it
 * against what Check 1 recorded. Reading `governance/gates.yaml` directly is
 * the wrong recompute source: the domain overlay contributes gates that have
 * no row in that file at all (in this repo, `quality-gate` and
 * `integration-test` come only from `templates/domains/software/gates.yaml`),
 * so a raw-file reader finds nothing to hash for them and degrades every one of
 * their outcomes to `unattested-gate-record`. The divergence is membership, not
 * serialisation: `mergeGates` copies `command` verbatim, so for a gate that
 * does have a row the two sides agree element for element.
 *
 * If the two sides disagree on the serialisation, every gate
 * looks tampered with and every outcome degrades to an
 * `unattested-gate-record` SKIP with the whole suite still green. Changing the
 * canonical form is therefore a breaking change to recorded history — old
 * records cannot be re-verified — and needs the recomputing side changed in the
 * same commit.
 *
 * `JSON.stringify` is chosen over a joined string because argv element
 * boundaries are semantically load-bearing: `["npm test"]` (one argument
 * containing a space) and `["npm", "test"]` are different commands, and a
 * `join(" ")` would hash them identically.
 *
 * @param {string[]} argv Resolved argv list.
 * @returns {string} Lowercase hex SHA-256 digest.
 * @throws {Error} `code: "INVALID_ARGV"` when `argv` is not an array of
 *   strings. A shell-form command string is refused rather than hashed, and so
 *   is an array carrying a non-string element: `validateGate`
 *   (lib/domains/merge-gates.mjs) drops both shapes with an `INVALID_GATE`
 *   warning, so anything reaching here in either shape is a caller defect and
 *   never a project-authoring mistake. Callers that resolve gates through
 *   `loadCheck1Gates` cannot trip this.
 */
export function computeCommandSha(argv) {
  if (!Array.isArray(argv) || argv.some((token) => typeof token !== "string")) {
    throw coded(
      "INVALID_ARGV",
      `command_sha requires an argv list of strings; got ${JSON.stringify(argv)}`,
    );
  }
  return createHash("sha256").update(JSON.stringify(argv), "utf8").digest("hex");
}

/**
 * The RAW gate view: `gates.yaml` exactly as authored, with no domain overlay
 * and no merge. This is the set `adev gate doctor` diagnoses.
 *
 * @param {string} projectRoot Absolute project root.
 * @param {string} [gatesPath] Project-relative (or absolute) gates.yaml path.
 * @returns {object[]|null} The declared gate objects, or `null` when the file
 *   is absent, empty, unreadable, or declares no `gates:` list. `null` means
 *   "there is nothing here to diagnose", which is not the same as `[]`.
 * @throws {Error} `code: "GATES_PATH_ESCAPE"` when `gatesPath` leaves the
 *   project root; `code: "GATES_PARSE_ERROR"` when the file exists but is not
 *   valid YAML (the message is the parser's).
 */
export function loadDoctorGates(projectRoot, gatesPath = DEFAULT_GATES_PATH) {
  const absRoot = resolve(projectRoot);
  const abs = resolveContained(absRoot, gatesPath);
  if (!abs) {
    throw coded("GATES_PATH_ESCAPE", `gates path escapes the project root: ${gatesPath}`);
  }
  if (!existsSync(abs)) return null;

  let raw;
  try {
    raw = readFileSync(abs, "utf8");
  } catch {
    return null;
  }
  if (raw.trim() === "") return null;

  let doc;
  try {
    doc = parseYaml(raw);
  } catch (err) {
    throw coded("GATES_PARSE_ERROR", err?.message ?? String(err));
  }

  const gates = doc?.gates;
  if (!Array.isArray(gates)) return null;
  return gates.filter((g) => g && typeof g === "object");
}

/**
 * Read the project manifest. Absent is `null`; present-but-unparseable throws,
 * because a manifest that exists may well declare a domain other than the
 * default and treating it as absent resolves the WRONG domain silently.
 *
 * @param {string} absRoot
 * @returns {object|null}
 * @throws {Error} `code: "MANIFEST_PARSE_ERROR"`
 */
function readManifest(absRoot) {
  const abs = resolve(absRoot, DEFAULT_MANIFEST_PATH);
  if (!existsSync(abs)) return null;
  try {
    return parseYaml(readFileSync(abs, "utf8"));
  } catch (err) {
    throw coded(
      "MANIFEST_PARSE_ERROR",
      `parse error in ${DEFAULT_MANIFEST_PATH}: ${err?.message ?? String(err)}`,
    );
  }
}

/**
 * The CONSUMER gate view — "check 1" being validate's quality-gate check, the
 * reference consumer. Resolves the active domain, loads that domain's gates
 * overlay, and merges the project's governance file on top. This is exactly
 * what `adev domain load-gates` emits; that verb is a thin printing shell
 * around this function.
 *
 * @param {string} projectRoot Absolute project root.
 * @param {object} [options]
 * @param {object|null} [options.domain] A pre-resolved
 *   `{ resolved_domain, source_level }`. When given, resolution is skipped —
 *   the CLI resolves the domain itself because it must also honour `--charter`
 *   and `--module`.
 * @param {object|null} [options.manifest] Parsed manifest. Omit to read it
 *   from disk; pass `null` explicitly for "no manifest".
 * @param {string|null} [options.moduleSlug] Module slug for level-2 domain
 *   resolution. Production callers resolve the domain themselves and pass
 *   `domain`; this exists so tests can drive fixture-domain resolution.
 * @param {object|null} [options.governance] A pre-read governance document
 *   (`{ gates: [...] }`). Omit to read `gatesPath` from disk; pass `null` for
 *   "no governance layer".
 * @param {string} [options.gatesPath] Project-relative governance gates path.
 * @returns {{domain: {resolved_domain: string, source_level: string},
 *            gates: object[], warnings: object[]}}
 *   The resolved domain, the merged gate list every consumer runs, and the
 *   merge warnings (e.g. `INVALID_GATE` for a gate the merge dropped). Every
 *   returned gate additionally carries `command_sha` — see
 *   {@link computeCommandSha} for the canonical form and why it is stamped
 *   here rather than recomputed by each consumer.
 * @throws {Error} Coded, and every code names a project misconfiguration the
 *   caller should report: `MANIFEST_PARSE_ERROR`, `INVALID_DOMAIN_NAME`,
 *   `INVALID_DOMAIN_ARG`, `BUNDLED_OVERRIDE_BLOCKED`, `EXTENDS_NOT_FOUND`,
 *   `DOMAIN_CONFIG_PARSE_ERROR`, `DOMAIN_CONFIG_TOO_LARGE`, `PATH_ESCAPE`,
 *   `GOVERNANCE_PATH_ESCAPE`, `GOVERNANCE_READ_ERROR`,
 *   `GOVERNANCE_PARSE_ERROR`. An UNCODED throw is either a defect here or an
 *   unclassified parse failure escaping `lib/domains/*` (see `resolveExtends`,
 *   which does not code its `parseYaml`). Callers must decide deliberately:
 *   `lib/cli/domain.mjs::runLoadGates` catches everything;
 *   `lib/gates/doctor.mjs::mergedGateIds` rethrows uncoded.
 */
export function loadCheck1Gates(projectRoot, options = {}) {
  const absRoot = resolve(projectRoot);
  const gatesPath = options.gatesPath ?? DEFAULT_GATES_PATH;

  const domain =
    options.domain ??
    resolveDomain(
      options.manifest === undefined ? readManifest(absRoot) : options.manifest,
      null,
      options.moduleSlug ?? null,
    );

  // Overlay first, then the governance file: a broken overlay is the more
  // fundamental failure and is the one the CLI has always reported first.
  const overlay = loadDomainConfig(domain.resolved_domain, "gates", absRoot, PLUGIN_ROOT);

  const governance =
    options.governance === undefined ? readGovernanceGates(absRoot, gatesPath) : options.governance;

  const { gates, warnings } = mergeGates(overlay, governance);

  // Stamp each gate with the hash of its own resolved argv, and materialise the
  // documented `tier` default. Check 1 already makes this call to resolve its
  // gate set, so carrying both fields here is what lets a markdown check body
  // record them without a second verb and without arithmetic in prose (the
  // constitution forbids inline Node in a check body).
  //
  // `tier` is optional in `gates.yaml` and defaults to `fast`, but `mergeGates`
  // copies it only when declared — and `reportValidator` refuses a
  // `gate_outcomes[]` element whose `tier` is not a non-empty string
  // (lib/lifecycle-state.mjs), rejecting the ENTIRE emission. Defaulting in
  // skill prose alone would leave one tier-less gate able to kill Check 1's
  // whole attestation, so the resolved set is where the default belongs.
  //
  // `mergeGates` drops every command that is not an argv list of strings, so
  // every gate that reaches this line can be hashed.
  for (const gate of gates) {
    gate.tier ??= DEFAULT_GATE_TIER;
    gate.command_sha = computeCommandSha(gate.command);
  }

  return { domain, gates, warnings };
}

/**
 * Read the project's governance gates file for the consumer view. Absent or
 * empty is `null` (no governance layer), which `mergeGates` accepts.
 *
 * @param {string} absRoot
 * @param {string} relPath
 * @returns {object|null}
 * @throws {Error} coded `GOVERNANCE_PATH_ESCAPE` / `GOVERNANCE_READ_ERROR` /
 *   `GOVERNANCE_PARSE_ERROR`. The messages are the ones `adev domain
 *   load-gates` has always printed.
 */
function readGovernanceGates(absRoot, relPath) {
  const abs = resolveContained(absRoot, relPath);
  if (!abs) {
    throw coded(
      "GOVERNANCE_PATH_ESCAPE",
      `governance path escapes project root: ${relPath}`,
    );
  }
  if (!existsSync(abs)) return null;

  let raw;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (err) {
    throw coded(
      "GOVERNANCE_READ_ERROR",
      `cannot read ${relPath}: ${err?.message ?? String(err)}`,
    );
  }
  if (raw.trim() === "") return null;

  try {
    return parseYaml(raw);
  } catch (err) {
    throw coded(
      "GOVERNANCE_PARSE_ERROR",
      `parse error in ${relPath}: ${err?.message ?? String(err)}`,
    );
  }
}
