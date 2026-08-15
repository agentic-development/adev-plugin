/**
 * `adev governance materialize` — write a registry's EFFECTIVE set into the
 * project's own governance file, then stamp the write-once marker.
 *
 * Zero external dependencies (Constitution Principle 1). Library semantics:
 * nothing here calls `process.exit`, writes to stdout, or prints. Every failure
 * is a coded throw; `lib/cli/governance.mjs` owns exit codes and output.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE CANONICALISATION ORDER — a recorded contract, not an implementation note
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Three registries, three different composition models. The order below is
 * fixed so that "materialization changes nothing that runs" is a checkable
 * claim (`tests/governance/registry-effective-set.test.mjs`) rather than an
 * opinion.
 *
 * 1. EFFECTIVE SET, per registry, through the EXISTING machinery — never
 *    reimplemented here:
 *      - `gates.yaml`       → `lib/gates/gate-sets.mjs::loadCheck1Gates`, which
 *                             is the single resolved-gate-set authority and
 *                             reaches `mergeGates` itself.
 *      - `review.yaml`      → `lib/domains/merge-reviewers.mjs::mergeReviewers`,
 *                             reached exactly the way `lib/cli/domain.mjs`'s
 *                             `load-reviewers` path reaches it.
 *      - `diagnostics.yaml` → `lib/diagnostics/index.mjs::loadRegistry`, whose
 *                             first-wins duplicate rule IS the composition.
 *
 * 2. CANONICAL COMPARISON FORM — what the byte-identity test compares. NOT the
 *    file's bytes:
 *      - entries sorted ascending by `id`, default JS string comparison;
 *      - each entry serialised with `JSON.stringify` over its keys sorted
 *        ascending;
 *      - EXCLUDED: `__source` (run-time-only provenance) and `materialized_at`.
 *        INCLUDED: `source`.
 *      - the canonical form of a registry is the JSON array of those strings.
 *
 *    `source` being INCLUDED is what forces {@link resolveSource} to exist. An
 *    entry's `source` is read off the file when the file declares it, and
 *    derived from `__source` only when it does not — so an entry reads the same
 *    before materialization (derived) and after (declared). Deriving
 *    unconditionally would flip every materialized gate from `domain:<slug>` to
 *    `project`, because writing a domain gate into the governance file is
 *    precisely what makes `mergeGates` label it `governance`.
 *
 * 3. WRITE ORDER: entries already present on disk keep their existing
 *    positions and their bytes; entries contributed by the merge that are not
 *    already on disk are APPENDED at the end of the root key's block, in merge
 *    order. Comments and sibling keys survive by construction because
 *    `spliceRegistryEntries` never reserialises (DDR-7).
 *
 *    A corollary: `source` is stamped on entries this verb WRITES. An entry
 *    already on disk is not rewritten, so an absent `source` there keeps
 *    resolving to its derived provenance — which for a project-file entry is
 *    `project`, the only thing it can be.
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 *
 * @module lib/governance/materialize
 */

import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDomainConfig } from "../domains/domain-config.mjs";
import { mergeReviewers } from "../domains/merge-reviewers.mjs";
import { resolveDomain } from "../domains/resolve.mjs";
import { loadRegistry } from "../diagnostics/index.mjs";
import { loadCheck1Gates } from "../gates/gate-sets.mjs";
import { FIELD_ALLOWLIST, resolveRootKey } from "../extensions/governance-registry.mjs";
import { spliceRegistryEntries } from "../extensions/governance-splice.mjs";
import { parseYaml } from "../profiles/yaml.mjs";
import { MARKED_REGISTRIES, stampMarker } from "./registry-marker.mjs";

/** This file lives at <pluginRoot>/lib/governance/materialize.mjs. */
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const GOVERNANCE_DIR = join(".context-index", "governance");

/**
 * Bare registry NAMES accepted by `--registry`, derived from
 * {@link MARKED_REGISTRIES} so the two cannot drift.
 * @type {string[]}
 */
export const MARKED_REGISTRY_NAMES = [...MARKED_REGISTRIES].map((f) => f.replace(/\.yaml$/, ""));

/**
 * Fields excluded from the canonical comparison form (rule 2) and from the
 * would-drop field comparison. `command_sha` and `runner_path` are DERIVED —
 * recomputed on every load from `command` / `runner` — so they are never
 * written and never compared.
 * @type {Set<string>}
 */
const DERIVED_FIELDS = new Set([
  "__source",
  "materialized_at",
  "command_sha",
  "runner_path",
]);

/** Fields excluded from the canonical form only (rule 2 names exactly these two). */
const CANONICAL_EXCLUDED = new Set(["__source", "materialized_at"]);

function coded(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Resolve a bare `--registry` name to its filename, refusing an unknown name
 * and refusing the two DDR-1 EXEMPT registries by name.
 *
 * @param {string} name
 * @returns {string} The registry filename.
 * @throws {Error} `MATERIALIZE_REGISTRY_EXEMPT` or `MATERIALIZE_REGISTRY_UNKNOWN`.
 */
export function resolveRegistryName(name) {
  const file = `${name}.yaml`;
  if (MARKED_REGISTRIES.has(file)) return file;

  if (file === "validate.yaml" || file === "boundaries.yaml") {
    throw coded(
      "MATERIALIZE_REGISTRY_EXEMPT",
      `${name}.yaml is exempt from materialization (DDR-1). It is already an ` +
        `explicit single-source registry — the project file is its only ` +
        `contributor — so a marker would discriminate nothing, and stamping it ` +
        `would break the reference extension-install path (validate.yaml) and ` +
        `Check 8's SKIP over an empty boundaries.yaml. Materializable ` +
        `registries: ${MARKED_REGISTRY_NAMES.join(", ")}.`,
    );
  }

  throw coded(
    "MATERIALIZE_REGISTRY_UNKNOWN",
    `unknown registry ${JSON.stringify(name)}. Valid: ` +
      `${MARKED_REGISTRY_NAMES.join(", ")}.`,
  );
}

/**
 * Resolve the registry file inside `absRoot`, refusing anything that escapes —
 * INCLUDING through a symlink (DDR-15 / SEC-7).
 *
 * `resolve()` + `startsWith(dir + sep)` does not resolve symlinks and
 * `writeFileSync` follows them, so a `gates.yaml` symlinked at some other
 * repository would be silently rewritten. The path is therefore re-asserted
 * against the REAL root once the target is known to exist.
 *
 * @param {string} absRoot Absolute project root.
 * @param {string} relPath Project-relative registry path.
 * @returns {string} Absolute path safe to write.
 * @throws {Error} `MATERIALIZE_PATH_ESCAPE`.
 */
export function resolveRegistryTarget(absRoot, relPath) {
  const abs = resolve(absRoot, relPath);
  if (!abs.startsWith(absRoot + sep)) {
    throw coded(
      "MATERIALIZE_PATH_ESCAPE",
      `${relPath} fails containment: it resolves outside the project root.`,
    );
  }

  let realRoot;
  try {
    realRoot = realpathSync(absRoot);
  } catch (err) {
    throw coded(
      "MATERIALIZE_PATH_ESCAPE",
      `project root fails containment: ${err?.message ?? String(err)}`,
    );
  }

  let present = true;
  try {
    lstatSync(abs);
  } catch {
    present = false;
  }
  if (!present) return abs;

  let real;
  try {
    real = realpathSync(abs);
  } catch (err) {
    throw coded(
      "MATERIALIZE_PATH_ESCAPE",
      `${relPath} fails containment: its target cannot be resolved ` +
        `(${err?.message ?? String(err)}). A dangling symlink is refused rather ` +
        `than followed.`,
    );
  }
  if (!real.startsWith(realRoot + sep)) {
    throw coded(
      "MATERIALIZE_PATH_ESCAPE",
      `${relPath} fails containment: it is a symlink whose target lies outside ` +
        `the project root. Writing through it would modify a file this project ` +
        `does not own.`,
    );
  }
  return real;
}

/**
 * Rule 2 — the canonical COMPARISON form of a registry.
 *
 * Exported so `tests/governance/registry-effective-set.test.mjs` (and Task 11,
 * which extends that suite) compare the same thing this module does.
 *
 * @param {object[]} entries
 * @returns {string}
 */
export function canonicalise(entries) {
  const sorted = [...entries].sort((a, b) => {
    const x = String(a?.id);
    const y = String(b?.id);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return JSON.stringify(sorted.map(canonicalEntry));
}

function canonicalEntry(entry) {
  const keys = Object.keys(entry).filter((k) => !CANONICAL_EXCLUDED.has(k)).sort();
  const out = {};
  for (const key of keys) out[key] = entry[key];
  return JSON.stringify(out);
}

/**
 * Rule 1 — the effective set of one registry, computed through the existing
 * machinery, with every entry carrying a resolved `source`.
 *
 * @param {string} projectRoot
 * @param {string} registry Bare name: `gates`, `review` or `diagnostics`.
 * @returns {Promise<object[]>}
 */
export async function effectiveSet(projectRoot, registry) {
  const file = resolveRegistryName(registry);
  const absRoot = resolve(projectRoot);
  const relPath = join(GOVERNANCE_DIR, file);
  const rootKey = resolveRootKey(file);
  const declared = declaredSourceById(absRoot, relPath, rootKey);

  if (file === "gates.yaml") {
    const { domain, gates } = loadCheck1Gates(absRoot, { gatesPath: relPath });
    return gates.map((g) => withSource(g, declared, "gates", domain.resolved_domain));
  }

  if (file === "review.yaml") {
    const domain = resolveDomain(readManifest(absRoot), null, null);
    const overlay = loadDomainConfig(domain.resolved_domain, "reviewers", absRoot, PLUGIN_ROOT);
    const governance = readRegistryDoc(absRoot, relPath);
    const { reviewers } = mergeReviewers(overlay, governance);
    return reviewers.map((r) => withSource(r, declared, "review", domain.resolved_domain));
  }

  const { entries } = await loadRegistry(absRoot);
  return entries.map((e) => withSource(e, declared, "diagnostics", null));
}

/**
 * The `source` an entry resolves to: the value DECLARED on the on-disk row when
 * the file declares one, otherwise the value derived from where the merge says
 * the entry came from. See rule 2's note for why the declared value wins.
 */
function withSource(entry, declared, registry, domainSlug) {
  const id = String(entry?.id);
  const explicit = declared.get(id);
  const source = typeof explicit === "string" && explicit !== ""
    ? explicit
    : deriveSource(entry, registry, domainSlug);
  return { ...entry, source };
}

/**
 * Map today's provenance vocabulary onto the `source` vocabulary
 * (`project` | `bundled` | `domain:<slug>`).
 *
 * TASK 16 SEAM. Task 16 supplies the full mapping from the `__source`
 * vocabulary; the two values it still owns are `project-override` and
 * `manifest-specialist`, both of which map to `project`. Neither is produced by
 * `mergeGates` or `mergeReviewers` — they come from
 * `lib/governance/review-config.mjs`, which this verb does not use — so they
 * are left UNMAPPED rather than guessed. An unmapped value throws instead of
 * silently becoming `project`: a wrong `source` is worse than a refusal,
 * because the whole point of the field is that it is trustworthy.
 */
function deriveSource(entry, registry, domainSlug) {
  if (registry === "diagnostics") {
    // Diagnostics have no `__source`: the registry is single-file. The runner
    // prefix IS the provenance — `plugin:` names a file the plugin ships,
    // `project:` one the project owns (lib/diagnostics/index.mjs Step B).
    return typeof entry?.runner === "string" && entry.runner.startsWith("plugin:")
      ? "bundled"
      : "project";
  }

  const dunder = entry?.__source;
  if (dunder === "domain") return `domain:${domainSlug}`;
  if (dunder === "governance" || dunder === "project") return "project";
  if (dunder === "bundled") return "bundled";

  throw coded(
    "MATERIALIZE_SOURCE_UNMAPPED",
    `entry '${entry?.id}' carries provenance ${JSON.stringify(dunder)}, which has ` +
      `no 'source' mapping yet. Task 16 owns 'project-override' and ` +
      `'manifest-specialist' (both → project); anything else is a new vocabulary ` +
      `value that must be mapped deliberately.`,
  );
}

/**
 * Materialize one registry.
 *
 * @param {string} projectRoot
 * @param {string} registry Bare registry name.
 * @param {{ dryRun?: boolean, now?: string }} [options]
 * @returns {Promise<object>} Result record; see `lib/cli/governance.mjs` for the
 *   JSON envelope projected out of it.
 * @throws {Error} `MATERIALIZE_REGISTRY_UNKNOWN`, `MATERIALIZE_REGISTRY_EXEMPT`,
 *   `MATERIALIZE_PATH_ESCAPE`, `MATERIALIZE_WOULD_DROP`,
 *   `MATERIALIZE_SOURCE_UNMAPPED`, plus any coded throw from the loaders and
 *   from `spliceRegistryEntries`.
 */
export async function materialize(projectRoot, registry, options = {}) {
  const dryRun = options.dryRun === true;
  const file = resolveRegistryName(registry);
  const absRoot = resolve(projectRoot);
  const relPath = join(GOVERNANCE_DIR, file);
  const rootKey = resolveRootKey(file);
  const absPath = resolveRegistryTarget(absRoot, relPath);

  const effective = await effectiveSet(absRoot, registry);
  const beforeText = existsSync(absPath) ? readFileSync(absPath, "utf8") : null;

  const onDiskIds = new Set(
    readEntries(beforeText, rootKey)
      .filter((e) => e && typeof e === "object" && e.id !== undefined)
      .map((e) => String(e.id)),
  );

  // Rule 3 — only entries the merge contributes that are NOT already on disk.
  const newEntries = effective.filter((e) => !onDiskIds.has(String(e.id)));
  const projected = newEntries.map((e) => projectEntry(e, file));

  const spliced = spliceRegistryEntries(beforeText, rootKey, projected);
  const now = options.now ?? new Date().toISOString();
  const afterText = stampMarker(spliced.text, now);

  assertNoDrop(effective, readEntries(afterText, rootKey), relPath);

  if (!dryRun && afterText !== beforeText) {
    writeFileSync(absPath, afterText, "utf8");
  }

  const finalMarker = markerOf(afterText);
  return {
    registry,
    path: relPath,
    root_key: rootKey,
    abs_path: absPath,
    materialized_at: finalMarker,
    marker_written: markerOf(beforeText ?? "") === null,
    already_explicit: effective.filter((e) => onDiskIds.has(String(e.id))).map((e) => String(e.id)),
    newly_written: newEntries.map((e) => String(e.id)),
    changed: afterText !== beforeText,
    dry_run: dryRun,
    before_text: beforeText,
    after_text: afterText,
  };
}

/**
 * The write-time projection: the registry's contribution allowlist, in
 * allowlist order with `id` first and `source` last, plus nothing else. Derived
 * fields (`command_sha`, `runner_path`) are never written — they are recomputed
 * on every load and an on-disk copy could only go stale.
 */
function projectEntry(entry, file) {
  const allowed = FIELD_ALLOWLIST.get(file);
  const out = { id: entry.id };
  for (const field of allowed) {
    if (field === "id") continue;
    if (DERIVED_FIELDS.has(field)) continue;
    if (entry[field] === undefined) continue;
    out[field] = entry[field];
  }
  out.source = entry.source;
  return out;
}

/**
 * The refusal that makes this verb safe to run before the Task 10 guard exists:
 * if the file this run would write does not, on its own, reproduce every entry
 * of the effective set, refuse and name the entry.
 *
 * Two failure shapes, both real:
 *   - the id is absent from the file entirely;
 *   - the id IS on disk but a field it declares disagrees with the effective
 *     value — meaning the effective entry comes from somewhere else and rule 3
 *     forbids rewriting the on-disk row to match. A field the on-disk row does
 *     NOT declare is not a disagreement: its loader supplies the documented
 *     default (a gate without `tier` runs as `fast`).
 */
function assertNoDrop(effective, fileEntries, relPath) {
  const byId = new Map(
    fileEntries
      .filter((e) => e && typeof e === "object" && e.id !== undefined)
      .map((e) => [String(e.id), e]),
  );

  for (const entry of effective) {
    const id = String(entry.id);
    const row = byId.get(id);
    if (row === undefined) {
      throw coded(
        "MATERIALIZE_WOULD_DROP",
        `entry '${id}' is in the effective set but would not be written into ` +
          `${relPath}. Materializing must never lose an entry that runs today.`,
      );
    }
    for (const [field, value] of Object.entries(entry)) {
      if (DERIVED_FIELDS.has(field) || field === "source") continue;
      if (!Object.hasOwn(row, field)) continue;
      if (JSON.stringify(row[field]) === JSON.stringify(value)) continue;
      throw coded(
        "MATERIALIZE_WOULD_DROP",
        `entry '${id}' in ${relPath} declares ${field}=${JSON.stringify(row[field])} ` +
          `but the effective set resolves ${field}=${JSON.stringify(value)}. The ` +
          `on-disk row does not reproduce the entry that runs, and materializing ` +
          `must not rewrite an entry already on disk — fix the row by hand, then ` +
          `re-run.`,
      );
    }
  }
}

// ── Small readers ───────────────────────────────────────────────────────────

/** Parsed registry document, or null when the file is absent or blank. */
function readRegistryDoc(absRoot, relPath) {
  const abs = resolve(absRoot, relPath);
  if (!existsSync(abs)) return null;
  const raw = readFileSync(abs, "utf8");
  if (raw.trim() === "") return null;
  return parseYaml(raw);
}

/** Entries under `rootKey` in `text`; `[]` for absent, blank or non-sequence. */
function readEntries(text, rootKey) {
  if (typeof text !== "string" || text.trim() === "") return [];
  const doc = parseYaml(text);
  const entries = doc?.[rootKey];
  return Array.isArray(entries) ? entries : [];
}

/** `id` → declared `source`, for the rows the file itself states. */
function declaredSourceById(absRoot, relPath, rootKey) {
  const abs = resolve(absRoot, relPath);
  const text = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  const map = new Map();
  for (const entry of readEntries(text, rootKey)) {
    if (entry && typeof entry === "object" && entry.id !== undefined) {
      map.set(String(entry.id), entry.source);
    }
  }
  return map;
}

function readManifest(absRoot) {
  const abs = join(absRoot, ".context-index", "manifest.yaml");
  if (!existsSync(abs)) return null;
  return parseYaml(readFileSync(abs, "utf8"));
}

/**
 * The marker in `text`, without touching the filesystem. The file-path form is
 * `readMarker` in `./registry-marker.mjs`; this one exists because the write
 * decision is made on text that has not been written yet.
 */
function markerOf(text) {
  const line = text.split(/\r?\n/).find((l) => /^materialized_at:/.test(l));
  return line === undefined ? null : line.slice("materialized_at:".length).trim();
}
