/**
 * Content installation for extensions.
 *
 * Handles domain profile installation, governance config merging,
 * sample installation with path containment, and skill conflict detection.
 *
 * Spec: .context-index/specs/features/extensions/content-installation.spec.md
 *
 * @module lib/extensions/content-install
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLED_DOMAIN_NAMES, DOMAIN_NAME_PATTERN, DOMAIN_CONFIG_FILENAMES } from '../domains/constants.mjs';
import { parseYaml } from '../profiles/yaml.mjs';
import { loadProfiles } from '../profiles/index.mjs';
import { mergePacks } from '../governance/context-pack.mjs';
import { assertWithinCaps } from './governance-values.mjs';
import { resolveRootKey, validateEntryFields, OPEN_NAMESPACE_FIELDS } from './governance-registry.mjs';
import { spliceRegistryEntries } from './governance-splice.mjs';
import { collectExecutableContributions } from './exec-consent.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Plugin root — two levels up from lib/extensions/ */
const PLUGIN_ROOT = resolve(__dirname, '..', '..');

/** Recognized domain profile filenames (from DOMAIN_CONFIG_FILENAMES). */
const RECOGNIZED_DOMAIN_FILES = new Set(DOMAIN_CONFIG_FILENAMES.values());

// ── Domain Profile Installation ────────────────────────────────────────

/**
 * Install a domain profile from an extension source directory.
 *
 * Copies recognized domain profile files to `.context-index/domains/<name>/`
 * and generates a `domain.yaml` with `extends: <parent>`.
 *
 * @param {string} projectRoot - Project root directory.
 * @param {string} extSourceDir - Extension source directory containing profile files.
 * @param {{ name: string, extends: string }} opts - Domain profile options.
 * @returns {{ filesWritten: string[] }}
 */
export function installDomainProfile(projectRoot, extSourceDir, opts) {
  const { name } = opts;
  const parent = opts.extends;

  // Validate name against bundled domain names
  if (BUNDLED_DOMAIN_NAMES.has(name)) {
    const err = new Error(
      `Domain profile name '${name}' collides with a bundled domain name. ` +
      `Bundled domain names (${[...BUNDLED_DOMAIN_NAMES].join(', ')}) cannot be overridden.`
    );
    err.code = 'BUNDLED_COLLISION';
    throw err;
  }

  // Validate name against kebab-case pattern
  if (!DOMAIN_NAME_PATTERN.test(name)) {
    const err = new Error(
      `Domain profile name '${name}' is not valid. ` +
      `Expected pattern: ${DOMAIN_NAME_PATTERN.source}`
    );
    err.code = 'INVALID_DOMAIN_NAME';
    throw err;
  }

  const domainDir = join(projectRoot, '.context-index', 'domains', name);
  mkdirSync(domainDir, { recursive: true });

  const filesWritten = [];

  // Copy recognized domain profile files from extension source
  const sourceFiles = existsSync(extSourceDir) ? readdirSync(extSourceDir) : [];
  for (const file of sourceFiles) {
    if (RECOGNIZED_DOMAIN_FILES.has(file)) {
      const src = join(extSourceDir, file);
      const dest = join(domainDir, file);
      copyFileSync(src, dest);
      filesWritten.push(dest);
    }
  }

  // Generate domain.yaml with extends
  const domainYamlPath = join(domainDir, 'domain.yaml');
  writeFileSync(domainYamlPath, `extends: ${parent}\n`);
  filesWritten.push(domainYamlPath);

  return { filesWritten };
}

// ── Governance Registry Merge ──────────────────────────────────────────

/**
 * Refuse with a coded error, matching the governance modules' error style.
 */
function refuse(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

/**
 * A `plugin:<other-plugin>:<path>` reference. Mirrors
 * `lib/governance/review-config.mjs:430` and `lib/governance/validate-config.mjs:306`,
 * both of which refuse it outright.
 */
const CROSS_PLUGIN_REF = /^plugin:[^/]*:/;

/**
 * Read the existing entry ids of a registry block, refusing anything that cannot
 * be read faithfully.
 *
 * The behaviour this replaces swallowed the parse error and started fresh. That
 * fallback was doubly destructive: the whole file was then reserialized from an
 * empty parse, and collision detection silently degraded to append-everything
 * because nothing remained to collide with. Both failures are now refusals.
 *
 * @param {string} rawText - Current file text.
 * @param {string} rootKey - Registry root key.
 * @param {string} target - Governance filename, used in messages.
 * @returns {Set<string>} Ids already present under `rootKey`.
 * @throws {Error} code `GOVERNANCE_PARSE_REFUSED`.
 */
function readExistingIds(rawText, rootKey, target) {
  let parsed;
  try {
    parsed = parseYaml(rawText);
  } catch (e) {
    refuse(
      `Governance file '${target}' could not be parsed: ${e.message}. The merge is refused ` +
      `rather than started fresh — rewriting an unparseable registry would destroy it, and ` +
      `would also bypass collision detection because nothing would remain to collide with.`,
      'GOVERNANCE_PARSE_REFUSED'
    );
  }

  const block = parsed?.[rootKey];
  if (block === undefined || block === null) return new Set();
  if (!Array.isArray(block)) {
    refuse(
      `Root key '${rootKey}' in '${target}' is not a sequence. A map or scalar there would ` +
      `yield zero existing entries and degrade collision detection to append-everything, ` +
      `so the merge is refused.`,
      'GOVERNANCE_PARSE_REFUSED'
    );
  }

  const ids = new Set();
  for (const item of block) {
    if (item && typeof item === 'object' && !Array.isArray(item) && item.id !== undefined) {
      // Stringified deliberately: `lib/profiles/yaml.mjs:173-183` coerces `id: 42`
      // to a Number, and a numeric existing id must still occupy its string key.
      ids.add(String(item.id));
    }
  }
  return ids;
}

/**
 * Parse a YAML file into a map, treating an unreadable file as contributing no
 * names.
 *
 * Used only to build the set of KNOWN profile / context-pack names. Falling back
 * to `{}` makes {@link assertOpenNamespacesResolvable} strictly stricter, never
 * laxer, so the failure direction is closed. Refusing instead would let an
 * unrelated broken file block a contribution this function has no verdict on.
 */
function readYamlMap(path) {
  if (!existsSync(path)) return {};
  try {
    const parsed = parseYaml(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Lazily resolve the open namespaces an extension may reference.
 *
 * Both lookups are deferred: a contribution that names neither `profile` nor
 * `context_pack` never pays for loading them.
 */
function createNamespaceResolver(projectRoot, pluginRoot) {
  let profiles = null;
  let packs = null;
  return {
    pluginRoot,
    projectRoot,
    profiles() {
      if (profiles === null) profiles = loadProfiles(projectRoot, { pluginRoot }).profiles ?? {};
      return profiles;
    },
    contextPacks() {
      if (packs === null) {
        const bundled = readYamlMap(join(pluginRoot, 'templates', 'review-specs', 'defaults.yaml'));
        const project = readYamlMap(join(projectRoot, '.context-index', 'governance', 'review.yaml'));
        packs = mergePacks(bundled.context_packs ?? {}, project.context_packs ?? {}).packs;
      }
      return packs;
    },
  };
}

/**
 * Close the denial-of-review lever that `OPEN_NAMESPACE_FIELDS` documents.
 *
 * `profile`, `context_pack` and `prompt` have no statically knowable vocabulary,
 * so `governance-registry.mjs` cannot constrain them. But an unresolvable value
 * makes the loader push an error (`UNKNOWN_PROFILE` at
 * `lib/governance/validate-config.mjs:423-428`, `UNKNOWN_CONTEXT_PACK` at
 * `lib/governance/context-pack.mjs:80-86`, a `resolveReviewerPath` failure at
 * `lib/governance/review-config.mjs:424+`), and `skills/review-specs/SKILL.md:152`
 * aborts the entire review on any loader error. An extension could therefore
 * disable review for the whole project by contributing one bad name.
 *
 * This function has `projectRoot` and `pluginRoot`, which the per-entry
 * validator does not, so the lever is closed here by resolving each value
 * against the same merged project+plugin state the loaders read.
 *
 * One part is deliberately NOT checked: whether a `.context-index/`-relative
 * `prompt` file EXISTS. `lib/extensions/install.mjs:89-94` merges governance
 * BEFORE copying samples (`:102`) and skill extensions (`:119`), so an
 * extension-shipped prompt legitimately does not exist yet at plan time. Every
 * order-INDEPENDENT part of `resolveReviewerPath` (cross-plugin form, plugin
 * skills-tree containment and existence, absolute paths, `..` segments,
 * `.context-index/` containment) is enforced.
 *
 * @param {Record<string, unknown>} entry - Extension-supplied entry.
 * @param {ReturnType<typeof createNamespaceResolver>} resolver
 * @throws {Error} code `GOVERNANCE_FIELD_VALUE_INVALID`.
 */
function assertOpenNamespacesResolvable(entry, resolver) {
  for (const field of OPEN_NAMESPACE_FIELDS) {
    const value = entry[field];
    if (value === undefined) continue;

    if (field === 'profile') {
      const profiles = resolver.profiles();
      if (typeof value !== 'string' || !Object.hasOwn(profiles, value)) {
        refuse(
          `Field 'profile' names ${JSON.stringify(value)}, which resolves to no bundled or ` +
          `project profile (known: ${Object.keys(profiles).join(', ')}). An unknown profile ` +
          `makes the loader push UNKNOWN_PROFILE, which aborts the whole review.`,
          'GOVERNANCE_FIELD_VALUE_INVALID'
        );
      }
      continue;
    }

    if (field === 'context_pack') {
      const packs = resolver.contextPacks();
      if (typeof value !== 'string' || !Object.hasOwn(packs, value)) {
        refuse(
          `Field 'context_pack' names ${JSON.stringify(value)}, which resolves to no bundled ` +
          `or project context pack (known: ${Object.keys(packs).join(', ')}). An unknown pack ` +
          `makes the loader push UNKNOWN_CONTEXT_PACK, which aborts the whole review.`,
          'GOVERNANCE_FIELD_VALUE_INVALID'
        );
      }
      continue;
    }

    assertPromptResolvable(value, resolver);
  }
}

/**
 * Enforce the order-independent half of `resolveReviewerPath` /
 * `resolvePromptUri` on an extension-supplied `prompt`.
 */
function assertPromptResolvable(value, resolver) {
  if (typeof value !== 'string' || value === '') {
    refuse(
      `Field 'prompt' must be a non-empty string, got ${JSON.stringify(value)}.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }

  if (CROSS_PLUGIN_REF.test(value)) {
    refuse(
      `Field 'prompt' names ${JSON.stringify(value)}, a cross-plugin reference. Both loaders ` +
      `refuse that form outright, so contributing it would abort the review.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }

  if (value.startsWith('plugin:')) {
    const skillsRoot = resolve(resolver.pluginRoot, 'skills');
    const target = resolve(skillsRoot, value.slice('plugin:'.length));
    if (target !== skillsRoot && !target.startsWith(skillsRoot + sep)) {
      refuse(
        `Field 'prompt' names ${JSON.stringify(value)}, which resolves outside the plugin ` +
        `'skills/' tree.`,
        'GOVERNANCE_FIELD_VALUE_INVALID'
      );
    }
    if (!existsSync(target)) {
      refuse(
        `Field 'prompt' names ${JSON.stringify(value)}, which resolves to no file in the ` +
        `plugin 'skills/' tree. An unresolvable prompt aborts the whole review.`,
        'GOVERNANCE_FIELD_VALUE_INVALID'
      );
    }
    return;
  }

  if (isAbsolute(value)) {
    refuse(
      `Field 'prompt' is the absolute path ${JSON.stringify(value)}. Both loaders reject ` +
      `absolute prompt paths, so contributing one is permanently unloadable.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }

  if (value.split('/').includes('..')) {
    refuse(
      `Field 'prompt' ${JSON.stringify(value)} contains a '..' segment, which both loaders ` +
      `reject before resolution.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }

  const contextRoot = resolve(resolver.projectRoot, '.context-index');
  const target = resolve(contextRoot, value);
  if (target !== contextRoot && !target.startsWith(contextRoot + sep)) {
    refuse(
      `Field 'prompt' ${JSON.stringify(value)} resolves outside '.context-index/'.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }
}

/**
 * Whether an entry carries a contribution the project would actually execute.
 *
 * Delegates to `collectExecutableContributions` so the set stamped with
 * `exec_consented_at` is, by construction, the same set the operator consented
 * to in `lib/extensions/exec-consent.mjs`.
 */
function isExecutableEntry(target, entry) {
  return collectExecutableContributions([{ target, entries: [entry] }]).length > 0;
}

/**
 * Apply the payload rewrites planned by `lib/extensions/exec-payload.mjs`.
 *
 * The two emission forms are NOT collapsed. `command` argv elements take the
 * ABSOLUTE payload path, because `lib/gates/doctor.mjs:755-768` (`cwd: projectRoot`
 * at `:757`, invoked from `:1004`) and `lib/governance/quality-gate.mjs:39-55`
 * resolve relative argv against a `cwd` this module does not control.
 * `package.skill` / `package.adapter` take the `.context-index/`-RELATIVE path,
 * because `lib/governance/review-config.mjs:459-465` rejects an absolute path
 * with `ABS_PATH_REJECTED` before it ever realpaths (`:492-509`).
 * The `form` discriminator that `planExecPayload` already sets selects between
 * them, so the choice is made once, upstream, rather than re-derived here.
 *
 * `rewrites` must already be scoped to this target by the caller: rewrites carry
 * an `entryId` but no target, so two registries with a same-named entry cannot
 * be told apart here.
 */
function applyPayloadRewrites(entry, rewrites) {
  const out = { ...entry };

  for (const rewrite of rewrites) {
    if (rewrite?.entryId !== entry.id) continue;
    const value = rewrite.form === 'contextRelative' ? rewrite.contextRelative : rewrite.absolute;

    if (rewrite.field === 'command') {
      if (!Array.isArray(out.command)) {
        refuse(
          `Payload rewrite targets 'command' on entry '${entry.id}', which carries no argv ` +
          `command. A rewrite that cannot be applied would leave an unrelocated path in the file.`,
          'GOVERNANCE_FIELD_VALUE_INVALID'
        );
      }
      const argv = [...out.command];
      argv[rewrite.index] = `${rewrite.prefix ?? ''}${value}`;
      out.command = argv;
      continue;
    }

    if (rewrite.field === 'package.skill' || rewrite.field === 'package.adapter') {
      // Symmetric with the `command` branch above, and for a sharper reason: a
      // `package` CREATED here would make the entry executable —
      // `resolveReviewerPath` resolves `package.skill` and the reviewer runs it
      // — while `collectExecutableContributions:102-109` only reports package
      // fields on an entry that already HAS a `package`. The entry would
      // therefore be written executable but never stamped `exec_consented_at`,
      // inverting the rule that the stamped set equals the consented set.
      // Unreachable through `planExecPayload`, which derives its rewrites from
      // that same collector; refused so a second caller cannot reach it either.
      const pkg = out.package;
      if (pkg === null || typeof pkg !== 'object' || Array.isArray(pkg)) {
        refuse(
          `Payload rewrite targets '${rewrite.field}' on entry '${entry.id}', which carries no ` +
          `'package'. Creating one would write an executable entry that was never part of the ` +
          `consented set, so the rewrite is refused rather than applied.`,
          'GOVERNANCE_FIELD_VALUE_INVALID'
        );
      }
      const key = rewrite.field.slice('package.'.length);
      out.package = { ...pkg, [key]: value };
      continue;
    }

    refuse(
      `Payload rewrite for entry '${entry.id}' names unsupported field ` +
      `${JSON.stringify(rewrite.field)}; expected 'command', 'package.skill' or 'package.adapter'.`,
      'GOVERNANCE_FIELD_NOT_ALLOWED'
    );
  }

  return out;
}

/**
 * Plan a governance merge. Writes NOTHING — not even a directory.
 *
 * Every refusal in the merge lives here, so a caller can validate an entire
 * multi-target install before a single byte reaches disk. The order of the
 * checks is contract:
 *
 *   1. path containment            → PATH_TRAVERSAL
 *   2. writable registry           → UNKNOWN_GOVERNANCE_TARGET
 *   3. entries shape and caps      → GOVERNANCE_LIMIT_EXCEEDED
 *   4. existing file readable      → GOVERNANCE_PARSE_REFUSED
 *   5. per-entry field validation  → GOVERNANCE_SOURCE_FORGED / …_FIELD_NOT_ALLOWED /
 *                                    …_FIELD_VALUE_INVALID / …_SCALAR_UNSAFE
 *   6. open-namespace resolution   → GOVERNANCE_FIELD_VALUE_INVALID
 *   7. splice (dry)                → GOVERNANCE_PARSE_REFUSED
 *
 * Step 1 precedes step 2 because a traversing target is a containment failure
 * whatever it is named; reporting it as merely "not writable" would understate
 * what was attempted.
 *
 * Step 7 runs the splice here rather than in {@link applyGovernanceMerge} so
 * that every refusal the splice owns (duplicate root key, non-sequence root key,
 * mixed line endings, an unsafe scalar at emission) is also a PLAN-time verdict.
 * `applyGovernanceMerge` then has no decision left to make: it writes the text
 * this function already computed.
 *
 * A colliding id is SKIPPED. The pre-existing entry is left byte-identical — no
 * field is filled in on it, absent or otherwise. The old fill-gap behaviour let
 * an extension attach a `command` to a project's existing gate, which is
 * arbitrary code execution dressed as a merge.
 *
 * @param {string} projectRoot - Project root directory.
 * @param {string} target - Governance filename (e.g. `review.yaml`).
 * @param {Array<object>} entries - Extension governance entries to merge.
 * @param {{ extensionName?: string, extensionRoot?: string, pluginRoot?: string,
 *           execConsent?: { granted: boolean, at: string|null },
 *           payloadRewrites?: Array<object> }} [options]
 * @returns {{ projectRoot: string, target: string, targetPath: string, rootKey: string,
 *             entries: Array<object>, mergesApplied: string[], text: string|null }}
 * @throws {Error} codes `PATH_TRAVERSAL`, `UNKNOWN_GOVERNANCE_TARGET`,
 *   `GOVERNANCE_PARSE_REFUSED`, `GOVERNANCE_SOURCE_FORGED`,
 *   `GOVERNANCE_FIELD_NOT_ALLOWED`, `GOVERNANCE_FIELD_VALUE_INVALID`,
 *   `GOVERNANCE_SCALAR_UNSAFE`, `GOVERNANCE_LIMIT_EXCEEDED`.
 */
export function planGovernanceMerge(projectRoot, target, entries, options = {}) {
  const govDir = resolve(projectRoot, '.context-index', 'governance');
  const targetPath = resolve(govDir, typeof target === 'string' ? target : '');

  if (targetPath === govDir || !targetPath.startsWith(govDir + sep)) {
    refuse(
      `Governance target ${JSON.stringify(target)} resolves to '${targetPath}', which escapes ` +
      `'${govDir}'. The merge is refused rather than written outside the governance directory.`,
      'PATH_TRAVERSAL'
    );
  }

  const rootKey = resolveRootKey(target);

  if (!Array.isArray(entries)) {
    refuse(
      `Governance entries for '${target}' must be an array, got ${typeof entries}.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }
  assertWithinCaps({ entriesPerTarget: entries.length }, `'${target}' contribution`);

  // `null` means the file is absent and is the ONLY input that makes the splice
  // generate a provenance header. An existing-but-blank file must stay `''`, and
  // `undefined` is a hard error there — so this ternary must not be "simplified".
  const rawText = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : null;
  const existingIds = rawText === null ? new Set() : readExistingIds(rawText, rootKey, target);

  const resolver = createNamespaceResolver(projectRoot, options.pluginRoot ?? PLUGIN_ROOT);
  for (const entry of entries) {
    validateEntryFields(target, entry);
    assertOpenNamespacesResolvable(entry, resolver);
  }

  const extensionName =
    typeof options.extensionName === 'string' && options.extensionName !== ''
      ? options.extensionName
      : null;
  const execAt = options.execConsent?.at ?? null;
  const rewrites = Array.isArray(options.payloadRewrites) ? options.payloadRewrites : [];

  const mergesApplied = [];
  const toAppend = [];
  const claimed = new Set(existingIds);

  for (const entry of entries) {
    if (claimed.has(entry.id)) {
      mergesApplied.push(`skipped: ${entry.id}`);
      continue;
    }
    claimed.add(entry.id);

    const stamped = applyPayloadRewrites(entry, rewrites);
    if (extensionName !== null) stamped.source = `extension:${extensionName}`;
    if (execAt !== null && isExecutableEntry(target, entry)) stamped.exec_consented_at = execAt;

    toAppend.push(stamped);
    mergesApplied.push(`appended: ${entry.id}`);
  }

  // The two modules spell "no extension" differently and that is deliberate:
  // here it is `null`, because `options.extensionName` may legitimately be
  // absent; `spliceRegistryEntries` reads `''`, because `generateHeader` tests
  // `!== ''` to decide whether to emit the `# Extension:` line. The conversion
  // is done once, at the boundary, rather than teaching either module the
  // other's sentinel.
  const text = toAppend.length === 0
    ? null
    : spliceRegistryEntries(rawText, rootKey, toAppend, { extensionName: extensionName ?? '' }).text;

  return { projectRoot, target, targetPath, rootKey, entries: toAppend, mergesApplied, text };
}

/**
 * Execute a plan produced by {@link planGovernanceMerge}.
 *
 * A plan whose `text` is `null` appended nothing — every contributed id already
 * existed — so nothing is written and the target stays byte-identical.
 *
 * @param {ReturnType<typeof planGovernanceMerge>} plan
 * @returns {{ mergesApplied: string[] }}
 */
export function applyGovernanceMerge(plan) {
  if (!plan || typeof plan !== 'object' || typeof plan.targetPath !== 'string') {
    refuse(
      'applyGovernanceMerge requires a plan from planGovernanceMerge.',
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }

  const mergesApplied = plan.mergesApplied ?? [];
  if (plan.text === null) return { mergesApplied };

  mkdirSync(dirname(plan.targetPath), { recursive: true });
  writeFileSync(plan.targetPath, plan.text);
  return { mergesApplied };
}

/**
 * Plan and apply a governance merge for one target.
 *
 * Retained as the single-target convenience entry point; the two phases are
 * separately exported so a multi-target install can plan everything before
 * writing anything.
 *
 * @param {string} projectRoot - Project root directory.
 * @param {string} target - Governance filename (e.g. `review.yaml`).
 * @param {Array<object>} entries - Extension governance entries to merge.
 * @param {Parameters<typeof planGovernanceMerge>[3]} [options]
 * @returns {{ mergesApplied: string[] }}
 */
export function mergeGovernanceEntries(projectRoot, target, entries, options = {}) {
  return applyGovernanceMerge(planGovernanceMerge(projectRoot, target, entries, options));
}

// ── Sample Installation ────────────────────────────────────────────────

/**
 * Install sample files from an extension source directory.
 *
 * Each path can be a string (filename) or an object `{ src, dest }`.
 * Source paths are verified to fall within extSourceDir.
 * Destination paths are verified to fall within `.context-index/samples/`.
 *
 * @param {string} projectRoot - Project root directory.
 * @param {string} extSourceDir - Extension source directory.
 * @param {Array<string|{src: string, dest: string}>} samplePaths - Sample file paths.
 * @returns {{ filesWritten: string[], warnings: string[] }}
 */
export function installSamples(projectRoot, extSourceDir, samplePaths) {
  const samplesDir = join(projectRoot, '.context-index', 'samples');
  mkdirSync(samplesDir, { recursive: true });

  const filesWritten = [];
  const warnings = [];

  const resolvedExtDir = resolve(extSourceDir);
  const resolvedSamplesDir = resolve(samplesDir);

  for (const pathEntry of samplePaths) {
    let srcRelative, destRelative;

    if (typeof pathEntry === 'string') {
      srcRelative = pathEntry;
      destRelative = pathEntry;
    } else {
      srcRelative = pathEntry.src;
      destRelative = pathEntry.dest;
    }

    // Canonicalize source path and check containment
    const srcFull = resolve(resolvedExtDir, srcRelative);
    if (!srcFull.startsWith(resolvedExtDir + '/') && srcFull !== resolvedExtDir) {
      const err = new Error(
        `Sample source path '${srcRelative}' escapes the extension source directory.`
      );
      err.code = 'PATH_TRAVERSAL';
      throw err;
    }

    // Canonicalize dest path and check containment
    const destFull = resolve(resolvedSamplesDir, destRelative);
    if (!destFull.startsWith(resolvedSamplesDir + '/') && destFull !== resolvedSamplesDir) {
      const err = new Error(
        `Sample destination path '${destRelative}' escapes the samples directory.`
      );
      err.code = 'PATH_TRAVERSAL';
      throw err;
    }

    // Check for overwrite
    if (existsSync(destFull)) {
      warnings.push(`Overwriting existing sample: ${destRelative}`);
    }

    // Ensure dest directory exists
    mkdirSync(dirname(destFull), { recursive: true });

    // Copy
    copyFileSync(srcFull, destFull);
    filesWritten.push(destFull);
  }

  return { filesWritten, warnings };
}

// ── Skill Extension Installation ──────────────────────────────────────

/** Valid skill name pattern per spec Preconditions. */
const SKILL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Install skill extension files from an extension to the project's
 * `.context-index/skill-extensions/_<extName>/` directory.
 *
 * Each entry in skillExtensions maps a skill name to a source file path
 * (relative to extSourceDir). All entries are validated before any writes
 * occur (fail-fast). The destination directory is namespaced with a leading
 * underscore (`_<extName>`) to distinguish extension-managed files from
 * project-level `skill-extensions/<skill>.md` files.
 *
 * Spec: .context-index/specs/features/extensions/skill-extension-install.spec.md
 *
 * @param {string} projectRoot - Project root directory.
 * @param {string} extSourceDir - Extension source directory (files resolved from here).
 * @param {string} extName - Extension name (used as the namespaced directory `_<extName>`).
 * @param {Record<string, string>} skillExtensions - Map of skill name → source path relative to extSourceDir.
 * @returns {{ filesWritten: string[] }}
 */
export function installSkillExtensions(projectRoot, extSourceDir, extName, skillExtensions) {
  const entries = Object.entries(skillExtensions);
  if (entries.length === 0) {
    return { filesWritten: [] };
  }

  const resolvedExtDir = resolve(extSourceDir);

  // Validate all entries first (fail-fast before any writes)
  for (const [skillName, srcRelative] of entries) {
    // 1. Validate skill name
    if (!SKILL_NAME_PATTERN.test(skillName)) {
      const err = new Error(`Skill name '${skillName}' is invalid. Must match [a-zA-Z0-9_-]+.`);
      err.code = 'INVALID_SKILL_NAME';
      throw err;
    }

    // 2. Validate source path containment (path traversal) — before any other file checks
    const srcFull = resolve(resolvedExtDir, srcRelative);
    if (!srcFull.startsWith(resolvedExtDir + '/') && srcFull !== resolvedExtDir) {
      const err = new Error(`Source path '${srcRelative}' escapes the extension root.`);
      err.code = 'PATH_TRAVERSAL';
      throw err;
    }

    // 3. Validate source file exists
    if (!existsSync(srcFull)) {
      const err = new Error(`Declared skill extension source file '${srcRelative}' does not exist in extension.`);
      err.code = 'MISSING_SKILL_EXT_FILE';
      throw err;
    }

    // 4. Validate source path — must be .md (review note SA-1)
    if (!srcRelative.endsWith('.md')) {
      const err = new Error(`Skill extension source '${srcRelative}' is not a markdown file. Extension files must be .md.`);
      err.code = 'INVALID_FILE_TYPE';
      throw err;
    }
  }

  // All entries valid — create the namespaced dir and copy
  const extSkillDir = join(projectRoot, '.context-index', 'skill-extensions', `_${extName}`);
  try {
    mkdirSync(extSkillDir, { recursive: true });
  } catch (ioErr) {
    const err = new Error(`Cannot create directory '${extSkillDir}': ${ioErr.message}`);
    err.code = 'INSTALL_IO_ERROR';
    throw err;
  }

  const filesWritten = [];
  for (const [skillName, srcRelative] of entries) {
    const srcFull = resolve(resolvedExtDir, srcRelative);
    const destPath = join(extSkillDir, `${skillName}.md`);
    copyFileSync(srcFull, destPath);
    filesWritten.push(destPath);
  }

  return { filesWritten };
}

// ── Skill Conflict Detection ───────────────────────────────────────────

/**
 * Check extension skill names against bundled skill names.
 *
 * Reads the bundled skill names from the plugin's `skills/` directory.
 *
 * @param {string[]} skillNames - Extension skill names to check.
 * @param {{ pluginRoot?: string }} [opts] - Options.
 * @returns {{ conflicts: string[] }} - Empty conflicts array if no collisions.
 * @throws {{ code: 'SKILL_COLLISION', conflicts: string[] }} if any collision found.
 */
export function checkSkillConflicts(skillNames, opts = {}) {
  const pluginRoot = opts.pluginRoot || PLUGIN_ROOT;
  const skillsDir = join(pluginRoot, 'skills');

  // Read bundled skill names from directory listing
  let bundledSkillNames;
  try {
    bundledSkillNames = new Set(
      readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
    );
  } catch {
    // If we can't read the skills directory, assume no bundled skills
    bundledSkillNames = new Set();
  }

  const conflicts = skillNames.filter(name => bundledSkillNames.has(name));

  if (conflicts.length > 0) {
    const err = new Error(
      `Extension skill names conflict with bundled skills: ${conflicts.join(', ')}. ` +
      `Bundled skill names cannot be overridden.`
    );
    err.code = 'SKILL_COLLISION';
    err.conflicts = conflicts;
    throw err;
  }

  return { conflicts: [] };
}
