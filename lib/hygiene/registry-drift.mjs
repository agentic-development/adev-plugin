/**
 * Hygiene Audit Pass 19 — governance registry drift, across all four
 * registries.
 *
 * ## Why this pass carries more weight than it used to
 *
 * Before Task 11 a new bundled or domain entry activated by itself: the
 * run-time merge composed it into whatever the project declared. Removing that
 * merge is what makes "reading the file tells you what runs" true — and it also
 * means a plugin upgrade that adds a check now changes NOTHING until somebody
 * runs `adev governance materialize`. **This pass is the only channel through
 * which that upgrade becomes visible.** Everything below follows from that.
 *
 * ## Four audits, one read of each file
 *
 * 1. **Unadopted upgrade** (`hygiene/unadopted-upgrade`, info) — an id the
 *    starter declares that the project's file does not. The starter is the
 *    resolved domain's overlay plus, for the two registries that ship one, the
 *    bundled template. Also its mirror, `hygiene/project-addition` (info): an
 *    id the project declares that the starter does not.
 *
 * 2. **Disabled bundled entry** (`hygiene/disabled-bundled-entry`, WARNING) —
 *    an entry carrying `enabled: false` whose `source` is `bundled` or
 *    `domain:*`. Audit 1 can never see this: it reports entries the project
 *    does NOT have, and a switched-off entry is present. Without this audit a
 *    bundled check is switched off in a one-line PR diff and every audit stays
 *    silent (SEC-4). It is the one WARNING in an otherwise INFO pass because
 *    switching off a bundled check is a decision someone should see, not a
 *    note — but it still never blocks; see the severity policy below.
 *
 * 3. **Execution-bearing non-project entry**
 *    (`hygiene/non-project-execution-field`, info) — every non-`project` entry
 *    carrying `command`, `runner`, `prompt` or `pattern` (DDR-6). The
 *    non-`project` `source` exclusion narrows to audit 1 ONLY: an extension's
 *    appended `command` reaches `spawnSync` at every post-task trigger, so
 *    "exempt from unadopted-upgrade noise" must not mean "invisible".
 *
 * The finding NAMES the execution-bearing field; it never prints the field's
 * VALUE, because `prompt` and `command` carry paths that can embed internal
 * codenames and hygiene output is routinely pasted into chat and PR
 * descriptions. This redaction is scoped to {@link EXECUTION_FIELDS} — audit 4
 * below compares a disjoint field set of short enum-like values and prints
 * them; naming the field alone ("context_pack diverges") would not tell an
 * operator what changed or how to judge it.
 *
 * 4. **Field-level drift** (`hygiene/entry-field-drift`, WARNING) — audits 1
 *    and 3 both key on entry ID: an entry present in both files is invisible
 *    to them no matter how far its FIELDS have diverged from the starter it
 *    was copied from. That gap let a project's reviewer `context_pack` drift
 *    from its domain profile for five days with no error, warning, or failed
 *    run — the reviewer still dispatched, still returned findings, still
 *    produced a PASS, just against a narrower context than the domain profile
 *    now specifies (see the spec's Reviewer Field Drift section). For every
 *    project entry whose `source` is `bundled` or `domain:<slug>`, this audit
 *    re-resolves THAT source (the bundled template, or the specific domain
 *    profile named — not necessarily the project's currently-resolved domain,
 *    which can differ from an entry's own stamp) and compares
 *    {@link FIELD_DRIFT_FIELDS} field-by-field against the matching id there.
 *    A field absent from both sides is not compared; a field present on
 *    either side alone counts as a divergence against "(not set)" on the
 *    other. It is WARNING, not info, because a narrowed `context_pack` (the
 *    field this audit exists for) degrades review quality silently — but
 *    divergence is still not itself a defect (see the severity policy below):
 *    the write-once `materialized_at` marker is never touched, and nothing
 *    here assumes the project is wrong to have diverged, only that it should
 *    be visible. The finding names the field AND both values, since without
 *    the values an operator cannot judge whether the divergence is the one
 *    that matters.
 *
 * ## Deferred, deliberately
 *
 * A *changed-since* diff — "this `command` APPEARED or CHANGED since your last
 * install" — needs an install ledger, and no ledger exists. Building one is a
 * separate contract with its own storage, staleness and trust questions, so
 * audit 3 lists the standing state every run rather than approximating a diff
 * it cannot compute. The install-time summary line waits on the same ledger.
 *
 * ## Why the project file is the authority here
 *
 * The pass parses the project's registry file directly rather than going
 * through each registry's loader. Post-Task-11 that IS the effective set, and
 * the loaders project entries down to what their consumer needs — `source`,
 * `enabled` and `disabled_reason` do not survive the gate merge — so a loader
 * read could not answer audits 2 and 3 at all. The one thing the pass borrows
 * from the loader contract is the fail-closed marker check: a MARKED registry
 * with no `materialized_at` is reported and NOT read, because its content is
 * not known to be the complete effective set.
 *
 * ## Severity policy
 *
 * Advisory, always. Nothing here sets `process.exitCode` or throws on a
 * finding. Divergence is the expected outcome of project customization; the
 * pass exists for visibility, not for nagging.
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 *
 * @module lib/hygiene/registry-drift
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDomainConfig } from "../domains/domain-config.mjs";
import { resolveDomain } from "../domains/resolve.mjs";
import { parseYaml } from "../profiles/yaml.mjs";
import { assertMaterialized, MARKED_REGISTRIES } from "../governance/registry-marker.mjs";
import { codedError as coded } from "../errors.mjs";

/** This file lives at <pluginRoot>/lib/hygiene/registry-drift.mjs. */
const DEFAULT_PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const GOVERNANCE_DIR = join(".context-index", "governance");

/**
 * The registries this pass audits, in report order.
 *
 * `boundaries.yaml` is NOT in the set: the spec's Step 6 names four registries
 * and boundaries is not one of them. It also has no starter to diverge from —
 * every rule in it is authored by the project — so audit 1 would have nothing
 * to compare. Audits 2 and 3 would apply the day boundary rules gain a
 * `bundled` source or an execution-bearing field; neither is true today.
 *
 * @type {string[]}
 */
export const REGISTRY_NAMES = ["validate", "review", "diagnostics", "gates"];

/**
 * Per-registry descriptor.
 *
 * - `file` / `rootKey` mirror `WRITABLE_REGISTRIES` in
 *   `lib/extensions/governance-registry.mjs`; they are restated rather than
 *   imported because that map is keyed by filename and also covers
 *   `boundaries.yaml`, which this pass deliberately excludes.
 * - `domainConfigType` is the `loadDomainConfig` config type carrying the
 *   domain's starter entries, or `null` when the registry has no domain
 *   overlay (`diagnostics` is single-file by design).
 * - `template` is the bundled starter shipped under `<pluginRoot>/templates/`,
 *   or `null`. `validate` and `review` have no bundled template — their
 *   starters are the domain overlay alone, which is what the pre-widening
 *   Pass 19 compared against.
 */
const REGISTRIES = new Map([
  ["validate", { file: "validate.yaml", rootKey: "checks", domainConfigType: "validate", template: null }],
  ["review", { file: "review.yaml", rootKey: "reviewers", domainConfigType: "reviewers", template: null }],
  ["diagnostics", { file: "diagnostics.yaml", rootKey: "diagnostics", domainConfigType: null, template: "diagnostics-template.yaml" }],
  ["gates", { file: "gates.yaml", rootKey: "gates", domainConfigType: "gates", template: "gates-template.yaml" }],
]);

/**
 * Fields whose presence means the entry reaches something executable: a
 * subprocess (`command`), an imported module (`runner`), or a model
 * (`prompt`, `pattern`).
 * @type {string[]}
 */
export const EXECUTION_FIELDS = ["command", "runner", "prompt", "pattern"];

/**
 * Fields audit 4 compares between a `bundled`/`domain:<slug>` entry and the
 * matching-id entry in the source it names. Short, enum-like values chosen
 * deliberately: `context_pack` is the field the audit exists for (see the
 * module header); `profile` and `severity_cap` govern the same dispatch
 * decision and are cheap to check the same way; `dispatch` is included
 * because it is structurally comparable (string or a small trigger object)
 * the same way the other three are, via {@link stableStringify}.
 * @type {string[]}
 */
export const FIELD_DRIFT_FIELDS = ["context_pack", "profile", "severity_cap", "dispatch"];

/** Finding ids this pass can emit. Stable — hygiene reports key on them. */
export const FINDING_IDS = [
  "hygiene/registry-absent",
  "hygiene/registry-not-materialized",
  "hygiene/registry-unreadable",
  "hygiene/starter-unavailable",
  "hygiene/unadopted-upgrade",
  "hygiene/project-addition",
  "hygiene/disabled-bundled-entry",
  "hygiene/non-project-execution-field",
  "hygiene/entry-field-drift",
];

/**
 * Run Pass 19 over one project.
 *
 * Never throws on a project-data problem: an unreadable file, an unresolvable
 * domain and an unmaterialized registry are all FINDINGS, because an audit
 * pass that crashes on the tree it audits reports nothing at all.
 *
 * @param {string} projectRoot Absolute (or resolvable) project root.
 * @param {{ pluginRoot?: string, registry?: string }} [options]
 *   `registry` narrows the pass to one registry name.
 * @returns {Promise<{verdict: string, findings: object[], headerNotes: string[], summary: object}>}
 */
export async function runRegistryDriftPass(projectRoot, options = {}) {
  const absRoot = resolve(projectRoot);
  const pluginRoot = resolve(options.pluginRoot ?? DEFAULT_PLUGIN_ROOT);
  const names = options.registry ? [options.registry] : REGISTRY_NAMES;

  const findings = [];
  const headerNotes = [];

  const domain = resolveDomainSlug(absRoot, headerNotes);

  for (const name of names) {
    const spec = REGISTRIES.get(name);
    if (spec === undefined) {
      throw coded(
        "DRIFT_REGISTRY_UNKNOWN",
        `${name} is not audited by Pass 19 (audited: ${REGISTRY_NAMES.join(", ")}).`,
      );
    }
    auditRegistry({ absRoot, pluginRoot, domain, name, spec, findings, headerNotes });
  }

  const warnings = findings.filter((f) => f.severity === "warning").length;
  return {
    verdict: findings.length === 0 ? "PASS" : "FINDINGS",
    findings,
    headerNotes,
    summary: {
      domain,
      registries: names,
      finding_count: findings.length,
      warning_count: warnings,
    },
  };
}

/** One registry's three audits. Appends to `findings` / `headerNotes` in place. */
function auditRegistry({ absRoot, pluginRoot, domain, name, spec, findings, headerNotes }) {
  const relPath = join(GOVERNANCE_DIR, spec.file);
  const absPath = join(absRoot, relPath);

  if (!existsSync(absPath)) {
    findings.push(
      finding("hygiene/registry-absent", "info", name, null, `${relPath} does not exist — run /adev:init to scaffold it, then adev governance materialize.`),
    );
    return;
  }

  // Fail-closed, borrowed from the loaders: an unmarked MARKED registry is not
  // known to be the complete effective set, so the audit reports it rather than
  // drawing conclusions from a possibly partial file.
  if (MARKED_REGISTRIES.has(spec.file)) {
    try {
      assertMaterialized(absPath, name);
    } catch (err) {
      if (err?.code !== "REGISTRY_NOT_MATERIALIZED") throw err;
      findings.push(
        finding("hygiene/registry-not-materialized", "info", name, null, `${relPath} carries no top-level materialized_at marker, so its effective set is unknown and Pass 19 did not audit it. Run: adev governance materialize --registry ${name}`),
      );
      return;
    }
  }

  const projectEntries = readEntries(absPath, spec.rootKey);
  if (projectEntries === null) {
    findings.push(
      finding("hygiene/registry-unreadable", "info", name, null, `${relPath} could not be parsed as YAML — Pass 19 did not audit it.`),
    );
    return;
  }

  // ── Audits 2, 3 and 4 read the project file alone, so they run whether or
  //    not a starter is available. Audit 4's own source lookups are cached
  //    per unique `source` value across this registry's entries.
  const fieldDriftCache = new Map();
  for (const entry of projectEntries) {
    const src = entrySource(entry);

    if (entry.enabled === false && isBundledOrDomain(src)) {
      const why = typeof entry.disabled_reason === "string" && entry.disabled_reason !== ""
        ? ` (disabled_reason: ${entry.disabled_reason})`
        : " (no disabled_reason declared)";
      findings.push(
        finding("hygiene/disabled-bundled-entry", "warning", name, entry.id, `${relPath}: '${entry.id}' carries enabled: false but its source is '${src}' — a bundled or domain-supplied check has been switched off${why}.`),
      );
    }

    // Two independent reasons a row is execution-bearing: its declared source
    // is not the project, OR it references plugin-provided code regardless of
    // what `source` says. See {@link pluginProvidedFields} for why the second
    // is needed — an unstamped row is not evidence of project authorship.
    const pluginFields = pluginProvidedFields(entry);
    if (src !== "project" || pluginFields.length > 0) {
      const carried = EXECUTION_FIELDS.filter((f) => entry[f] !== undefined && entry[f] !== null);
      if (carried.length > 0) {
        // `source` is reported as `plugin-referenced` when the row is surfaced
        // by its field values rather than by a stamp, so the report never
        // claims a provenance the file does not declare.
        const reported = src !== "project" ? src : "plugin-referenced";
        // Field NAMES only — never the values. See the module header.
        findings.push(
          finding("hygiene/non-project-execution-field", "info", name, entry.id, `${relPath}: '${entry.id}' (source: ${reported}) carries execution-bearing field${carried.length === 1 ? "" : "s"} ${carried.join(", ")} — confirm this entry is meant to run.`, { fields: carried, source: reported }),
        );
      }
    }

    // Audit 4: does this entry's FIELDS still match the source it was copied
    // from? Only meaningful for a stamped entry — a `project` row has no
    // source to diverge from. Resolved against the source THIS ENTRY names,
    // not the project's currently-resolved domain, so a stale stamp is
    // compared against what it actually claims.
    if (isBundledOrDomain(src)) {
      const profileEntries = sourceEntries({ absRoot, pluginRoot, spec, src, headerNotes, cache: fieldDriftCache });
      const profileEntry = profileEntries?.get(entry.id);
      if (profileEntry !== undefined) {
        for (const d of diffFields(entry, profileEntry)) {
          const originLabel = src === "bundled" ? "the bundled template" : `domain profile '${src}'`;
          findings.push(
            finding(
              "hygiene/entry-field-drift",
              "warning",
              name,
              entry.id,
              `${relPath}: '${entry.id}' field '${d.field}' diverges from ${originLabel} — project has ${describeValue(d.projectValue)}, ${originLabel} now has ${describeValue(d.profileValue)}.`,
              { field: d.field, project_value: d.projectValue, profile_value: d.profileValue, source: src },
            ),
          );
        }
      }
    }
  }

  // ── Audit 1 needs a starter to compare against.
  const starter = starterEntries({ absRoot, pluginRoot, domain, name, spec, headerNotes });
  if (starter === null) {
    findings.push(
      finding("hygiene/starter-unavailable", "info", name, null, `No starter for '${name}' under domain '${domain}' — the unadopted-upgrade comparison was skipped.`),
    );
    return;
  }

  const projectIds = new Set(projectEntries.map((e) => e.id));
  for (const entry of starter) {
    if (projectIds.has(entry.id)) continue;
    findings.push(
      finding("hygiene/unadopted-upgrade", "info", name, entry.id, `Starter for '${name}' declares '${entry.id}', which ${relPath} does not — a plugin or domain upgrade is unadopted. Run: adev governance materialize --registry ${name}`),
    );
  }

  const starterIds = new Set(starter.map((e) => e.id));
  for (const entry of projectEntries) {
    if (starterIds.has(entry.id)) continue;
    // DDR-6: the non-`project` exclusion is scoped to THIS audit. A bundled,
    // domain or extension entry absent from today's starter is not a project
    // customization, and calling it one would bury the real ones.
    if (entrySource(entry) !== "project") continue;
    findings.push(
      finding("hygiene/project-addition", "info", name, entry.id, `${relPath} declares '${entry.id}', which the starter for '${name}' does not — project customization.`),
    );
  }
}

/**
 * The starter's entries for one registry: the resolved domain's overlay, plus
 * the bundled template when the registry ships one. Ids are merged; the domain
 * overlay wins on a collision, which is the order `/adev:init` scaffolds in.
 *
 * @returns {object[]|null} `null` when neither contributor is available.
 */
function starterEntries({ absRoot, pluginRoot, domain, name, spec, headerNotes }) {
  const byId = new Map();
  let found = false;

  if (spec.template !== null) {
    const abs = join(pluginRoot, "templates", spec.template);
    const rows = existsSync(abs) ? readEntries(abs, spec.rootKey) : null;
    if (rows !== null) {
      found = true;
      for (const row of rows) byId.set(row.id, row);
    }
  }

  if (spec.domainConfigType !== null && domain !== null) {
    let doc;
    try {
      doc = loadDomainConfig(domain, spec.domainConfigType, absRoot, pluginRoot);
    } catch (err) {
      headerNotes.push(
        `Domain starter for '${name}' could not be loaded (${err?.code ?? "ERROR"}): ${err?.message ?? String(err)}`,
      );
      doc = null;
    }
    if (doc !== null && typeof doc === "object") {
      found = true;
      for (const row of normaliseEntries(doc[spec.rootKey])) byId.set(row.id, row);
    }
  }

  return found ? [...byId.values()] : null;
}

/**
 * The `source` an on-disk entry resolves to.
 *
 * An absent or non-string `source` reads as `project`: the project's own file
 * is the only place an unattributed entry can have come from, and it is also
 * what `lib/governance/materialize.mjs` derives for a row already on disk. That
 * default is what keeps audit 2 from flagging a hand-authored entry the project
 * switched off itself.
 */
function entrySource(entry) {
  const src = entry?.source;
  return typeof src === "string" && src !== "" ? src : "project";
}

/** `bundled`, or `domain:<slug>` — the set audit 2 covers. */
function isBundledOrDomain(source) {
  return source === "bundled" || source.startsWith("domain:");
}

/**
 * The entries of the source a `bundled`/`domain:<slug>` `source` value names,
 * keyed by id, or `null` when that source cannot be resolved (no bundled
 * template for this registry, no domain overlay for this config type, or the
 * named domain does not resolve). Cached per unique `source` string so a
 * registry with many entries sharing one domain reads it once.
 *
 * Deliberately independent of {@link starterEntries}: that function resolves
 * the project's currently-active domain for audit 1's id-set comparison. This
 * resolves whatever domain THIS ENTRY'S OWN `source` names, which is the same
 * domain only when the entry was materialized under the domain the project
 * resolves to today — comparing against the active domain instead would blame
 * an entry for "drifting" from a profile it was never copied from.
 *
 * @returns {Map<string, object>|null}
 */
function sourceEntries({ absRoot, pluginRoot, spec, src, headerNotes, cache }) {
  if (cache.has(src)) return cache.get(src);

  let rows = null;
  if (src === "bundled") {
    if (spec.template !== null) {
      const abs = join(pluginRoot, "templates", spec.template);
      rows = existsSync(abs) ? readEntries(abs, spec.rootKey) : null;
    }
  } else if (spec.domainConfigType !== null) {
    const slug = src.slice("domain:".length);
    try {
      const doc = loadDomainConfig(slug, spec.domainConfigType, absRoot, pluginRoot);
      if (doc !== null && typeof doc === "object") rows = normaliseEntries(doc[spec.rootKey]);
    } catch (err) {
      headerNotes.push(
        `Domain profile '${slug}' named by an entry's source could not be loaded for field-drift comparison (${err?.code ?? "ERROR"}): ${err?.message ?? String(err)}`,
      );
    }
  }

  const map = rows === null ? null : new Map(rows.map((r) => [r.id, r]));
  cache.set(src, map);
  return map;
}

/**
 * Field-level differences between a project entry and the matching-id entry
 * in the source it was copied from. A field absent from BOTH sides is not
 * compared — {@link FIELD_DRIFT_FIELDS} is a superset of what any one
 * registry's entries carry (e.g. `context_pack` is review-only), and a field
 * neither side declares is not a divergence. A field present on either side
 * alone IS compared, against `undefined` on the other — the source dropping a
 * field the project still carries is exactly the kind of change this audit
 * exists to surface.
 *
 * @returns {{field: string, projectValue: unknown, profileValue: unknown}[]}
 */
function diffFields(entry, profileEntry) {
  const diffs = [];
  for (const field of FIELD_DRIFT_FIELDS) {
    const inProject = field in entry;
    const inProfile = field in profileEntry;
    if (!inProject && !inProfile) continue;
    const projectValue = entry[field];
    const profileValue = profileEntry[field];
    if (stableStringify(projectValue) === stableStringify(profileValue)) continue;
    diffs.push({ field, projectValue, profileValue });
  }
  return diffs;
}

/** Order-independent structural equality key for a YAML-parsed value. */
function stableStringify(value) {
  if (value === undefined) return " undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Render a field value for a finding message. */
function describeValue(value) {
  if (value === undefined) return "(not set)";
  if (typeof value === "string") return `'${value}'`;
  return JSON.stringify(value);
}

/**
 * Execution-bearing fields whose value is itself proof the entry runs code the
 * project did not author.
 *
 * `source:` is not a reliable provenance signal here, and audit 3 must not
 * depend on it alone. `lib/governance/materialize.mjs` stamps `source` only on
 * rows it WRITES — a row already on disk keeps an absent `source`, which
 * {@link entrySource} reads as `project`. That module justifies the default
 * with "for a project-file entry [project] is the only thing it can be", which
 * is false: a project file routinely holds bundled rows. Every entry in this
 * repo's `.context-index/governance/diagnostics.yaml` carries
 * `runner: plugin:…` and every entry in `validate.yaml` carries `prompt:
 * plugin:…`, and not one of them carries `source:`. All twelve were invisible
 * to audit 3 — the audit built to surface exactly them.
 *
 * `validate.yaml` cannot be fixed by stamping: SA-2 exempts it from
 * materialization, so it can never acquire a `source`. Reading the `plugin:`
 * prefix works for both, needs no on-disk rewrite (DDR-7's no-reserialise
 * invariant and Behavior 7's byte-identity promise are untouched), and fails
 * safe — absent metadata now means "look closer" rather than "assume ours".
 *
 * Deliberately NOT folded into {@link entrySource}: that function also feeds
 * audit 2 (`disabled-bundled-entry`), which asks who the entry CAME FROM. A
 * project-authored row may legitimately point at a plugin-shipped prompt —
 * that is what `validate.yaml` is — and reporting it as a disabled *bundled*
 * check would be wrong. Provenance and what-it-executes are different
 * questions; only audit 3 asks the second one.
 *
 * @param {object} entry
 * @returns {string[]} execution fields carrying a `plugin:` reference
 */
function pluginProvidedFields(entry) {
  return EXECUTION_FIELDS.filter((f) => {
    const v = entry?.[f];
    return typeof v === "string" && v.startsWith("plugin:");
  });
}

/**
 * A registry file's entries, or `null` when the file cannot be parsed.
 * Entries without a usable string `id` are dropped: every audit here keys on
 * id, and a row without one cannot be named in a finding.
 */
function readEntries(absPath, rootKey) {
  let doc;
  try {
    doc = parseYaml(readFileSync(absPath, "utf8"));
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return [];
  return normaliseEntries(doc[rootKey]);
}

function normaliseEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e) => e !== null && typeof e === "object" && !Array.isArray(e) && typeof e.id === "string" && e.id !== "",
  );
}

/** The project's resolved domain slug, or `null` when resolution refuses. */
function resolveDomainSlug(absRoot, headerNotes) {
  let manifest = null;
  const abs = join(absRoot, ".context-index", "manifest.yaml");
  if (existsSync(abs)) {
    try {
      manifest = parseYaml(readFileSync(abs, "utf8"));
    } catch {
      headerNotes.push("manifest.yaml could not be parsed — the default domain was used.");
    }
  }
  try {
    return resolveDomain(manifest, null, null).resolved_domain;
  } catch (err) {
    headerNotes.push(
      `Domain could not be resolved (${err?.code ?? "ERROR"}): ${err?.message ?? String(err)} — domain starters were skipped.`,
    );
    return null;
  }
}

function finding(id, severity, registry, entryId, message, extra = {}) {
  return { id, severity, registry, entry_id: entryId, message, ...extra };
}
