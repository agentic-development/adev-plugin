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
 * 4. LOAD COMPLETENESS PRECEDES THE STAMP. The marker says "the entries above
 *    are the complete effective set". That claim is only honest if the load
 *    that produced them was itself complete, so {@link assertLoadComplete} runs
 *    BEFORE anything is written or stamped, and refuses with
 *    `MATERIALIZE_LOAD_INCOMPLETE` when a row failed to load. Two signals, both
 *    checked: an ERROR-severity loader diagnostic, and an id present on disk
 *    but absent from the effective set. A WARNING-severity diagnostic does NOT
 *    block — see {@link classifyDiagnostics} for why.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHAT `source` MEANS — and what it does NOT mean
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `source` is **provenance AT MATERIALIZATION TIME**: it records where the
 * entry came from at the instant this verb wrote it, and it is never revised.
 *
 * It is NOT the entry's current contributor. Write-once plus rule 3 (an entry
 * already on disk is never rewritten) means the value cannot follow a later
 * change: once `acme-gate` has been written into the project's own file with
 * `source: domain:acme`, the merge labels it `governance` on every subsequent
 * load — it IS a project entry now — yet the row keeps reading `domain:acme`.
 * Change the manifest's domain and the row still keeps `domain:acme` while the
 * new domain's gates are appended beside it under a different slug. Nothing
 * re-reconciles them, by design: re-deriving would flip every materialized
 * entry to `project` and destroy Invariant 2 (see rule 2), and rewriting the
 * row would destroy the byte-identity guarantee that makes a second run a
 * verifiable no-op.
 *
 * So `source` answers "where did this entry originate?", not "who owns it
 * today?". A consumer that needs the second question — Migration Step 6's
 * drift pass, and the `enabled: false` audit — must not read this field as if
 * it answered it. Surfacing the divergence is **hygiene Pass 19's** job:
 * the standing state is visible to an audit pass that compares the
 * declared slug against what the active domain actually contributes. The
 * behaviour is pinned by `tests/governance/materialize.test.mjs` ("the `source`
 * field records provenance AT MATERIALIZATION TIME") so a later author reads it
 * as a decided contract rather than an accident.
 *
 * @module lib/governance/materialize
 */

import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteFile as atomicWrite } from "../atomic-write.mjs";
import { isContained } from "../path-safety.mjs";

import { loadDomainConfig } from "../domains/domain-config.mjs";
import { mergeReviewers } from "../domains/merge-reviewers.mjs";
import { resolveDomain } from "../domains/resolve.mjs";
import { loadRegistry } from "../diagnostics/index.mjs";
import { loadCheck1Gates } from "../gates/gate-sets.mjs";
import { FIELD_ALLOWLIST, resolveRootKey } from "../extensions/governance-registry.mjs";
import { spliceRegistryEntries } from "../extensions/governance-splice.mjs";
import { parseYaml } from "../profiles/yaml.mjs";
import { MARKED_REGISTRIES, readMarkerText, stampMarker } from "./registry-marker.mjs";
import { ON_DISK_SOURCE, mapSourceVocabulary } from "./source-vocabulary.mjs";
import { codedError as coded } from "../errors.mjs";

// Re-exported so the producer's importers reach the vocabulary through the
// module they already import, while `lib/governance/review-config.mjs` reaches
// the SAME table without pulling this module's loader tree in behind it.
export { ON_DISK_SOURCE, mapSourceVocabulary };

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
  if (!isContained(abs, absRoot)) {
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
  if (!isContained(real, realRoot)) {
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
 * Refuses (`MATERIALIZE_LOAD_INCOMPLETE`) when the load was not complete; see
 * rule 4 and {@link assertLoadComplete}.
 *
 * @param {string} projectRoot
 * @param {string} registry Bare name: `gates`, `review` or `diagnostics`.
 * @returns {Promise<object[]>}
 */
export async function effectiveSet(projectRoot, registry) {
  const loaded = await loadEffective(resolve(projectRoot), registry);
  assertLoadComplete(loaded, registry);
  return loaded.entries;
}

/**
 * The effective set AND the loader's own account of how the load went.
 *
 * `effectiveSet` throws away the second half; `materialize` reports it, because
 * a WARNING is information the operator should see even though it does not
 * block the stamp.
 *
 * Deliberately does NOT assert on its own result: both callers do, but
 * `materialize` runs {@link assertNoDrop} FIRST, because when a row both failed
 * to load and disagrees with an entry that still runs, the drop message is the
 * one that names the offending field and its remedy.
 *
 * @param {string} absRoot Absolute project root.
 * @param {string} registry Bare registry name.
 * @returns {Promise<{ entries: object[], diagnostics: Array<{severity: string, code: string, message: string}>, declared: Map<string, unknown>, relPath: string }>}
 */
async function loadEffective(absRoot, registry) {
  const file = resolveRegistryName(registry);
  const relPath = join(GOVERNANCE_DIR, file);
  const rootKey = resolveRootKey(file);
  const declared = declaredSourceById(absRoot, relPath, rootKey);

  // `requireMaterialized: false` here, and only here. Task 10's guard fails
  // every read of an unmarked registry closed — including this one, which
  // exists to CREATE the marker. Opting out is what keeps the remedy reachable;
  // no consumer may do the same.
  //
  // `composeDomainOverlay: true` likewise, and for the mirrored reason: Task 11
  // removed the run-time overlay, so this verb is the one place the domain's
  // contribution is still composed — in order to WRITE it into the project's
  // own file. `review.yaml` reaches `mergeReviewers` directly below for exactly
  // the same purpose.
  let entries;
  let diagnostics;
  if (file === "gates.yaml") {
    const { domain, gates, disabled, warnings } = loadCheck1Gates(absRoot, {
      gatesPath: relPath,
      requireMaterialized: false,
      composeDomainOverlay: true,
    });
    // Disabled gates are part of the effective set even though nothing runs
    // them: rule 4 refuses to stamp a set that dropped a DECLARED id, and the
    // marker's sentence is about what the file declares, not about what
    // executes. They are appended after the executable ones rather than being
    // interleaved back into declaration order — materialization is write-once
    // and happens before a project has had anything to switch off, so the
    // ordering only shows on a hand-authored file that already disabled a gate
    // before its first `adev governance materialize`.
    entries = [...gates, ...disabled].map((g) =>
      withSource(g, declared, "gates", domain.resolved_domain),
    );
    diagnostics = classifyDiagnostics("gates", warnings);
  } else if (file === "review.yaml") {
    const manifest = readManifest(absRoot);
    assertNoManifestSpecialists(manifest, relPath);
    const domain = resolveDomain(manifest, null, null);
    const overlay = loadDomainConfig(domain.resolved_domain, "reviewers", absRoot, PLUGIN_ROOT);
    const governance = readRegistryDoc(absRoot, relPath);
    const { reviewers, warnings } = mergeReviewers(overlay, governance);
    entries = reviewers.map((r) => withSource(r, declared, "review", domain.resolved_domain));
    diagnostics = classifyDiagnostics("review", warnings);
  } else {
    const { entries: rows, errors } = await loadRegistry(absRoot, { requireMaterialized: false });
    entries = rows.map((e) => withSource(e, declared, "diagnostics", null));
    diagnostics = classifyDiagnostics("diagnostics", errors);
  }

  return { entries, diagnostics, declared, relPath };
}

/**
 * Normalise the three loaders' incompatible report shapes into one list of
 * `{ severity, code, message }`, where `severity: "error"` means A ROW DID NOT
 * LOAD.
 *
 * The severity split is the whole decision, so it is recorded here rather than
 * inferred at the call site:
 *
 *   - **error blocks.** The loader refused a row. The marker's sentence — "the
 *     entries above are the complete effective set; nothing is contributed from
 *     anywhere else" — would be a false statement about that row, and a false
 *     marker is worse than no marker, because every downstream consumer is
 *     built to trust it without re-deriving anything.
 *   - **warning does not block, it is surfaced.** Every warning-severity
 *     diagnostic these loaders emit names a condition under which nothing was
 *     lost from what runs: a governance gate OVERRIDING a domain gate, a
 *     first-wins duplicate whose id still runs, "no reviewers are configured",
 *     an unknown `merge_strategy` treated as `append`. Blocking on those would
 *     make materialization unreachable for entirely legitimate projects — the
 *     opposite failure, and one that has no manual remedy at all.
 *
 * `loadRegistry` already classifies its own findings, so its severity is taken
 * verbatim. `mergeGates` and `mergeReviewers` predate the distinction: for
 * gates the dropping code is `INVALID_GATE` and nothing else drops, and for
 * reviewers the single code `DOMAIN_CONFIG_MERGE_WARN` covers both classes, so
 * the loader's own "— skipped." suffix is what separates them. That string
 * match is deliberately the SECONDARY net: the primary one is structural and
 * message-independent (see {@link assertLoadComplete}).
 */
function classifyDiagnostics(registry, reported) {
  const list = Array.isArray(reported) ? reported : [];
  return list.map((item) => {
    const code = item?.code ?? item?.id ?? "UNKNOWN";
    const message = String(item?.message ?? "");
    let severity;
    if (registry === "diagnostics") severity = item?.severity === "error" ? "error" : "warning";
    else if (registry === "gates") severity = code === "INVALID_GATE" ? "error" : "warning";
    else severity = /—\s*skipped\.?$/.test(message.trim()) ? "error" : "warning";
    return { severity, code, message };
  });
}

/**
 * Rule 4, second half — refuse to stamp `review.yaml` while `manifest.yaml`
 * still declares `specialists`.
 *
 * This module composes review through `mergeReviewers`, which sees the domain
 * overlay and the project's own file. That is NOT the whole dispatching set:
 * `lib/governance/review-config.mjs::loadReviewConfig` — the path
 * `/adev:review-specs` actually runs on — additionally projects every
 * `manifest.yaml:specialists` entry into a reviewer (`__source:
 * "manifest-specialist"`), a deprecated route supported until 0.19.0.
 *
 * So for a project still declaring specialists, materializing review would
 * write a file, stamp it, and claim "the entries above are the complete
 * effective set; nothing is contributed from anywhere else" — while a reviewer
 * that genuinely dispatches is absent from it. That is precisely the false
 * marker the whole spec exists to make impossible, and Task 10's guard would
 * then vouch for the incomplete file.
 *
 * REFUSING rather than folding them in is the conservative half of the choice,
 * and it matches {@link assertLoadComplete}'s posture. Folding them in would
 * mean re-implementing `loadReviewConfig`'s specialist→reviewer projection
 * here, in a second place, where the two copies could disagree about
 * `dispatch`, `profile` or `min_score` — and the migration the deprecation note
 * already asks for ("move entries to governance/review.yaml:reviewers") is
 * exactly the remedy this refusal names, so refusing costs the operator no work
 * they were not already going to do. Once they have moved, the set materialize
 * composes IS the set that dispatches.
 *
 * An EMPTY list is not a declaration: `specialists: []` is what
 * `templates/manifest-template.yaml` scaffolds and contributes nothing.
 *
 * @throws {Error} `MATERIALIZE_SPECIALISTS_DECLARED`.
 */
function assertNoManifestSpecialists(manifest, relPath) {
  const specialists = manifest?.specialists;
  if (!Array.isArray(specialists) || specialists.length === 0) return;

  const named = specialists
    .map((s) => (s && typeof s === "object" && s.id !== undefined ? String(s.id) : "<no id>"))
    .join(", ");

  throw coded(
    "MATERIALIZE_SPECIALISTS_DECLARED",
    `.context-index/manifest.yaml still declares specialists (${named}), and ` +
      `/adev:review-specs dispatches every one of them as a reviewer — but they ` +
      `are not part of the set this verb composes. Writing ${relPath} now would ` +
      `stamp it with a marker claiming the entries in it are the complete ` +
      `effective set, while a reviewer that actually runs is missing from it. ` +
      `manifest.yaml:specialists is deprecated and support ends in 0.19.0; move ` +
      `each entry into ${relPath} under 'reviewers:' (id, name, prompt, and a ` +
      `dispatch block), delete the manifest's specialists list, then re-run: ` +
      `adev governance materialize --registry review`,
  );
}

/**
 * Rule 4 — refuse to stamp a set that did not fully load.
 *
 * Two independent signals, because neither alone is complete:
 *
 *   1. an ERROR-severity loader diagnostic (catches a row so malformed it has
 *      no usable `id` to look for); and
 *   2. an id the project's file DECLARES that is absent from the effective set
 *      (catches a drop whatever the loader chose to call it, and is the signal
 *      that can NAME the rows).
 *
 * Both are pre-write: nothing is written and no marker is stamped, so `--dry-run`
 * and a real run report the identical refusal.
 *
 * @throws {Error} `MATERIALIZE_LOAD_INCOMPLETE`.
 */
function assertLoadComplete(loaded, registry) {
  const { entries, declared, diagnostics, relPath } = loaded;
  const blocking = diagnostics.filter((d) => d.severity === "error");
  const effectiveIds = new Set(entries.map((e) => String(e?.id)));
  const unloaded = [...declared.keys()].filter((id) => !effectiveIds.has(id));
  if (blocking.length === 0 && unloaded.length === 0) return;

  const rows = unloaded.length > 0
    ? `Rows declared in ${relPath} that did not load: ${unloaded.join(", ")}.`
    : `No declared row could be named — the failing entries have no usable id.`;
  const detail = blocking.map((d) => `  - ${d.code}: ${d.message}`).join("\n");

  throw coded(
    "MATERIALIZE_LOAD_INCOMPLETE",
    `${relPath} did not load completely, so its effective set is not known and the ` +
      `write-once marker — which states that the entries in the file ARE the ` +
      `complete effective set — cannot honestly be stamped. ${rows}` +
      (detail === "" ? "" : `\nLoader errors:\n${detail}`) +
      `\nFix the rows above, then re-run: adev governance materialize --registry ${registry}`,
  );
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
 * An ENTRY's on-disk `source`, derived from where the merge says it came from.
 *
 * The vocabulary mapping itself — DDR-4's table, its refusal on an unmapped
 * value, and the anchored on-disk enum — lives in
 * `lib/governance/source-vocabulary.mjs` and is reached through
 * {@link mapSourceVocabulary}. Task 16 moved it there because
 * `lib/governance/review-config.mjs` must reach the SAME table: two copies
 * could disagree about `project-override`, and Migration Step 6's drift
 * exclusion matches the on-disk enum, so a disagreement there is undefined
 * behaviour for the entry rather than a visible failure.
 *
 * What stays here is the part that is about ENTRIES rather than about the
 * vocabulary: the diagnostics registry has no `__source` at all, so its
 * provenance is read off the runner prefix instead.
 *
 * Exported so the entry-shaped path is testable, and because
 * `tests/governance/materialize.test.mjs` pins it. Every consumer inside this
 * module reaches it through {@link withSource}.
 *
 * @param {object} entry Effective-set entry, carrying `__source` (or, for
 *   diagnostics, a prefixed `runner`).
 * @param {string} registry Bare registry name.
 * @param {string|null} domainSlug Resolved domain slug, for the `domain:` form.
 * @returns {string} The on-disk `source` value.
 * @throws {Error} `MATERIALIZE_SOURCE_UNMAPPED`.
 */
export function deriveSource(entry, registry, domainSlug) {
  if (registry === "diagnostics") {
    // Diagnostics have no `__source`: the registry is single-file. The runner
    // prefix IS the provenance — `plugin:` names a file the plugin ships,
    // `project:` one the project owns (lib/diagnostics/index.mjs Step B).
    return typeof entry?.runner === "string" && entry.runner.startsWith("plugin:")
      ? "bundled"
      : "project";
  }

  try {
    return mapSourceVocabulary(entry?.__source, domainSlug);
  } catch (err) {
    if (err?.code !== "MATERIALIZE_SOURCE_UNMAPPED") throw err;
    // The table refuses on the VALUE; only the caller knows which row carried
    // it, and a refusal that cannot name the row is not actionable.
    err.message = `entry '${entry?.id}' — ${err.message}`;
    throw err;
  }
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
 *   `MATERIALIZE_PATH_ESCAPE`, `MATERIALIZE_LOAD_INCOMPLETE`,
 *   `MATERIALIZE_WOULD_DROP`, `MATERIALIZE_SOURCE_UNMAPPED`, plus any coded
 *   throw from the loaders and from `spliceRegistryEntries`.
 */
export async function materialize(projectRoot, registry, options = {}) {
  const dryRun = options.dryRun === true;
  const file = resolveRegistryName(registry);
  const absRoot = resolve(projectRoot);
  const relPath = join(GOVERNANCE_DIR, file);
  const rootKey = resolveRootKey(file);
  const absPath = resolveRegistryTarget(absRoot, relPath);

  const loaded = await loadEffective(absRoot, registry);
  const { entries: effective, diagnostics } = loaded;
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
  // Rule 4 — both refusals are PRE-WRITE, so `--dry-run` reports them
  // identically and no marker is ever stamped over an incomplete load.
  assertLoadComplete(loaded, registry);

  // The `afterText !== beforeText` guard is what makes a second run leave the
  // mtime untouched — a stronger idempotence claim than byte-identity, and one
  // the test suite pins. It must precede the write, not be folded into it.
  if (!dryRun && afterText !== beforeText) {
    atomicWrite(absPath, afterText);
  }

  return {
    registry,
    path: relPath,
    root_key: rootKey,
    abs_path: absPath,
    materialized_at: readMarkerText(afterText),
    // "did THIS run add the marker key?" — asked of the stamp itself rather
    // than re-read off the text. `stampMarker` returns its input by identity
    // when a top-level key is already present, whatever its value, so this is
    // exact even when the existing marker is corrupt (where re-reading would
    // say `null` and wrongly report the key as newly written).
    marker_written: afterText !== spliced.text,
    already_explicit: effective.filter((e) => onDiskIds.has(String(e.id))).map((e) => String(e.id)),
    newly_written: newEntries.map((e) => String(e.id)),
    warnings: diagnostics.filter((d) => d.severity === "warning"),
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
 * `atomicWrite` here is `lib/atomic-write.mjs::atomicWriteFile` — the repo's
 * established temp-then-rename durability idiom (`lib/gitignore-installer.mjs`,
 * `lib/token-cursor.mjs`, `lib/execution-state.mjs`), imported under its
 * original local name.
 *
 * It matters more here than in most places: a crash, SIGKILL or ENOSPC partway
 * through a bare `writeFileSync` leaves a TRUNCATED governance registry — and
 * this is the exact file every marked-registry loader now fails CLOSED on, with
 * no backup and no way to tell a truncated file from a hand-edit. A crash would
 * become a bricked project. `rename(2)` within a directory is atomic, so a
 * reader sees either the whole old file or the whole new one.
 *
 * `spliceRegistryEntries` is pure text-in/text-out, so this is the module's
 * only write site.
 */
