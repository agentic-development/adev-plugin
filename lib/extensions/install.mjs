/**
 * Extension install orchestrator and manifest stamp writer.
 *
 * `installExtension()` orchestrates the full install pipeline as two phases,
 * so that the whole manifest is validated and consented to before the project
 * is touched:
 *
 *   Phase 0 — read and validate adev-extension.yaml; check version compatibility.
 *   Phase 1 — NO WRITES: resolve every governance target, contain and plan the
 *             executable payload, obtain consent for the install-wide union of
 *             executable contributions, plan every governance merge.
 *   Phase 2 — WRITES: relocate the payload, install the domain profile, apply
 *             the merge plans, install samples and skill extensions, register
 *             skills and hooks, write the manifest stamp.
 *
 * The ordering inside Phase 1 is forced by a data dependency: the merge plans
 * need the payload rewrites to stamp relocated paths, and the rewrites need the
 * contributions gathered from the raw manifest blocks. So the sequence is
 * blocks → entry-field validation → contributions → payload plan → consent →
 * merge plans. Field validation leads so that a malformed entry reports its own
 * schema verdict rather than a downstream payload one, and so the operator is
 * never asked to consent to a payload that could not be installed anyway.
 *
 * `writeManifestStamp()` performs an idempotent upsert of the extension
 * entry in manifest.yaml's `installed_extensions` array.
 *
 * @module lib/extensions/install
 */

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseExtensionManifest } from './manifest-schema.mjs';
import { resolveExtensionSource, stripCredentials } from './resolve-source.mjs';
import { checkVersionCompatibility, getInstalledVersion } from './version-check.mjs';
import {
  installDomainProfile,
  planGovernanceMerge,
  applyGovernanceMerge,
  installSamples,
  checkSkillConflicts,
  installSkillExtensions,
} from './content-install.mjs';
import { collectExecutableContributions, resolveExecConsent } from './exec-consent.mjs';
import { planExecPayload, applyExecPayload, payloadDir } from './exec-payload.mjs';
import { resolveRootKey, validateEntryFields } from './governance-registry.mjs';
import { assertWithinCaps } from './governance-values.mjs';
import { registerSkill, registerHook } from './register.mjs';
import { parseYaml } from '../profiles/yaml.mjs';

/** Governance target assumed when a `provides.governance` block omits one. */
const DEFAULT_GOVERNANCE_TARGET = 'review.yaml';

/**
 * Normalise `provides.governance` into one block per WRITABLE target.
 *
 * Two things happen here, both before any planning:
 *
 *   1. Every declared target is resolved through `resolveRootKey`, so a manifest
 *      naming `risk-policies.yaml` — or any other non-writable file — refuses at
 *      the very top of the install, before a payload is planned, before consent
 *      is asked for, and before a byte is written.
 *   2. Blocks sharing a target are CONCATENATED. Planning is a pure read of the
 *      current file, so two separate plans against the same target would each be
 *      computed against the pre-install text and the second would neither see
 *      nor collide with the first's appended ids. One block per target makes
 *      collision detection whole-install rather than per-block.
 *
 * @param {Array<{ target?: string, entries?: Array<object> }>} governance
 * @returns {Array<{ target: string, entries: Array<object> }>}
 * @throws {Error} code `UNKNOWN_GOVERNANCE_TARGET`.
 */
function groupGovernanceBlocks(governance) {
  const byTarget = new Map();
  for (const block of governance) {
    const target = block?.target || DEFAULT_GOVERNANCE_TARGET;
    resolveRootKey(target);
    const entries = Array.isArray(block?.entries) ? block.entries : [];
    if (entries.length === 0) continue;
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target).push(...entries);
  }
  return [...byTarget].map(([target, entries]) => ({ target, entries }));
}

/**
 * Whether an executable contribution names a file the EXTENSION ships, and so
 * must be relocated into the project-owned payload directory.
 *
 * A `package.skill` / `package.adapter` of the form `plugin:<skill>/<file>` is
 * resolved by `resolveReviewerPath` against the PLUGIN's `skills/` tree
 * (`lib/governance/review-config.mjs:424+`). It is not extension-shipped
 * content, so it is consented to like any other executable contribution but
 * passes through unrewritten — feeding it to `planExecPayload` would refuse it
 * with `GOVERNANCE_PAYLOAD_MISSING`.
 *
 * @param {{ field: string, value: unknown }} contribution
 * @returns {boolean} True when the contribution's payload must be copied.
 */
function isRelocatablePayload(contribution) {
  if (contribution.field === 'command') return true;
  return !(typeof contribution.value === 'string' && contribution.value.startsWith('plugin:'));
}

/**
 * Fold the per-target payload plans into the single plan `applyExecPayload`
 * expects.
 *
 * `planExecPayload` is called once per target so its rewrites are structurally
 * target-scoped (they carry an `entryId` and a `field` but no target, so an
 * install-wide plan would let a rewrite meant for `gates.yaml#build` also fire
 * on `validate.yaml#build`). The COPIES, however, are install-wide: the same
 * file contributed by two registries is one file on disk, and the
 * `payloadFiles` cap must be measured over the union rather than per plan.
 *
 * @param {Array<ReturnType<typeof planExecPayload>>} plans
 * @param {string} projectRoot - Absolute project root.
 * @param {string} extensionName - Kebab-case extension name.
 * @returns {ReturnType<typeof planExecPayload>|null} `null` when nothing is relocated.
 * @throws {Error} code `GOVERNANCE_LIMIT_EXCEEDED`.
 */
function mergePayloadPlans(plans, projectRoot, extensionName) {
  if (plans.length === 0) return null;

  const copies = new Map();
  const rewrites = [];
  const contributions = [];
  for (const plan of plans) {
    for (const copy of plan.copies) copies.set(copy.from, copy.toRelative);
    rewrites.push(...plan.rewrites);
    contributions.push(...plan.contributions);
  }
  assertWithinCaps({ payloadFiles: copies.size }, `extension '${extensionName}' payload`);

  return {
    copies: [...copies].map(([from, toRelative]) => ({ from, toRelative })),
    rewrites,
    contributions,
    extensionName,
    projectRoot,
  };
}

/**
 * Install an extension from a resolved local directory into a project.
 *
 * The install runs in two phases, and the split is the point of the function:
 *
 *   - **Phase 1 plans and consents, and writes nothing at all.** Targets are
 *     resolved, the executable payload is contained, consent is obtained for
 *     the union of executable contributions across EVERY block, and every
 *     governance merge is computed. A refusal anywhere here — an unwritable
 *     target, a payload that escapes the extension, a withheld consent, a
 *     disallowed field in the third block — aborts with the project untouched,
 *     including the domain profile.
 *   - **Phase 2 writes.** Every verdict has already been reached, so this phase
 *     applies the plans it was handed.
 *
 * @param {string} resolvedPath - Local directory containing adev-extension.yaml.
 * @param {string} projectRoot - Project root directory.
 * @param {object} [options]
 * @param {string} [options.pluginRoot] - Plugin root for version resolution.
 * @param {string} [options.sourceUri] - Original source URI (for manifest stamp).
 * @param {string} [options._tmpDir] - Temp dir from npm/git resolution, deleted on exit.
 * @param {boolean} [options.allowExec=false] - The `--allow-exec` flag: approves the
 *   extension's executable contributions for THIS install without prompting.
 * @param {boolean} [options.interactive=false] - Caller-computed TTY state. Defaults
 *   to `false` so a non-TTY installer that did not pass `--allow-exec` refuses
 *   rather than silently consenting.
 * @param {(text: string) => string} [options.promptFn] - Asks the operator for consent.
 *   Injectable for tests; consulted only when `interactive` is true and the manifest
 *   actually contributes something executable.
 * @returns {Promise<{ name: string, version: string, filesWritten: string[], mergesApplied: string[], warnings: string[] }>}
 * @throws {Error} codes `MISSING_MANIFEST`, `INVALID_SCHEMA`, `INCOMPATIBLE_VERSION`,
 *   `UNKNOWN_GOVERNANCE_TARGET`, `GOVERNANCE_EXEC_NOT_CONSENTED`, and every code
 *   `planExecPayload` / `planGovernanceMerge` raise.
 */
export async function installExtension(resolvedPath, projectRoot, options = {}) {
  // 1. Read and validate manifest
  const manifestPath = join(resolvedPath, 'adev-extension.yaml');
  if (!existsSync(manifestPath)) {
    const err = new Error(`No adev-extension.yaml found at ${resolvedPath}.`);
    err.code = 'MISSING_MANIFEST';
    throw err;
  }

  const content = readFileSync(manifestPath, 'utf8');
  const parseResult = parseExtensionManifest(content);
  if (!parseResult.valid) {
    const err = new Error(parseResult.message);
    err.code = 'INVALID_SCHEMA';
    throw err;
  }

  const manifest = parseResult.manifest;

  // 2. Check version compatibility
  if (manifest.requires && options.pluginRoot) {
    const installedVersion = getInstalledVersion(options.pluginRoot);
    const versionResult = checkVersionCompatibility(manifest.requires, installedVersion);
    if (!versionResult.compatible) {
      const err = new Error(versionResult.message);
      err.code = 'INCOMPATIBLE_VERSION';
      throw err;
    }
  }

  // 3. Content operations — planned in full, then written in full.
  const filesWritten = [];
  const mergesApplied = [];
  const warnings = [];
  const provides = manifest.provides || {};

  try {
    // ── Phase 1 — plan and consent. NOTHING below this comment writes. ────

    // 1a. Normalise and constrain the governance targets. An unwritable target
    //     refuses here, before the payload is even looked at.
    const govBlocks = Array.isArray(provides.governance)
      ? groupGovernanceBlocks(provides.governance)
      : [];

    // 1b. Validate every entry's FIELDS before anything else reads them.
    //
    //     `planGovernanceMerge` re-runs this — `validateEntryFields` is a pure
    //     function of (target, entry), so running it twice costs nothing and
    //     changes nothing. It runs HERE as well because the payload plan and the
    //     consent prompt both come first, and both read fields this has not yet
    //     vouched for. Without it, an entry that is malformed AND carries a
    //     command reports `Payload path 'undefined.command[1]' …` instead of the
    //     schema verdict that actually describes what is wrong, and the operator
    //     is asked to approve executing a payload from an entry that could never
    //     be installed under any answer.
    for (const { target, entries } of govBlocks) {
      for (const entry of entries) validateEntryFields(target, entry);
    }

    // 1c. The consent set is the union across the WHOLE install. A manifest
    //     whose first block is benign and whose second ships a command must
    //     surface both, once, before anything is written.
    const contributions = collectExecutableContributions(govBlocks);

    // 1d. Contain and relocate the payload, one plan per target so the rewrites
    //     cannot leak across registries that share an entry id.
    const payloadPlansByTarget = new Map();
    for (const { target } of govBlocks) {
      const scoped = contributions.filter(c => c.target === target && isRelocatablePayload(c));
      if (scoped.length === 0) continue;
      payloadPlansByTarget.set(target, planExecPayload({
        extensionRoot: resolvedPath,
        extensionName: manifest.name,
        projectRoot,
        contributions: scoped,
      }));
    }
    const payloadPlan = mergePayloadPlans(
      [...payloadPlansByTarget.values()],
      projectRoot,
      manifest.name
    );

    // 1e. Ask the operator. Refuses closed: a non-TTY install without
    //     --allow-exec never reaches Phase 2.
    const execConsent = resolveExecConsent({
      contributions,
      extensionName: manifest.name,
      allowExec: options.allowExec === true,
      interactive: options.interactive === true,
      promptFn: options.promptFn,
    });

    // 1f. Plan every merge. Every remaining governance refusal is raised here.
    const mergePlans = govBlocks.map(({ target, entries }) => planGovernanceMerge(
      projectRoot,
      target,
      entries,
      {
        extensionName: manifest.name,
        extensionRoot: resolvedPath,
        pluginRoot: options.pluginRoot,
        execConsent,
        payloadRewrites: payloadPlansByTarget.get(target)?.rewrites ?? [],
      }
    ));

    // ── Phase 2 — writes. Every verdict has already been reached. ─────────

    // 2a. Relocate the payload FIRST: the rewritten paths already spliced into
    //     the merge plans name files under it, and `resolvedPath` may be a temp
    //     dir this function deletes in its `finally`.
    if (payloadPlan !== null) {
      applyExecPayload(payloadPlan, projectRoot, manifest.name);
      filesWritten.push(payloadDir(projectRoot, manifest.name));
    }

    // 2b. Domain profile
    if (provides['domain-profile']) {
      const dp = provides['domain-profile'];
      const sourceSubdir = dp.source_dir || dp.path;
      const profileSourceDir = sourceSubdir
        ? join(resolvedPath, sourceSubdir)
        : resolvedPath;
      const report = installDomainProfile(projectRoot, profileSourceDir, {
        name: dp.name || manifest.name,
        extends: dp.extends || 'software',
      });
      filesWritten.push(...report.filesWritten);
    }

    // 2c. Governance
    for (const plan of mergePlans) {
      const report = applyGovernanceMerge(plan);
      mergesApplied.push(...report.mergesApplied);
    }

    // 2d. Samples
    if (provides.samples && Array.isArray(provides.samples)) {
      const report = installSamples(projectRoot, resolvedPath, provides.samples);
      filesWritten.push(...report.filesWritten);
      warnings.push(...report.warnings);
    }

    // 2e. Skill conflict detection
    if (provides.skills && Array.isArray(provides.skills)) {
      const skillNames = provides.skills.map(s => typeof s === 'string' ? s : s.name);
      checkSkillConflicts(skillNames, { pluginRoot: options.pluginRoot });
    }

    // 2f. Skill extensions
    if (
      provides.skill_extensions != null &&
      typeof provides.skill_extensions === 'object' &&
      !Array.isArray(provides.skill_extensions)
    ) {
      const report = installSkillExtensions(
        projectRoot,
        resolvedPath,
        manifest.name,
        provides.skill_extensions
      );
      filesWritten.push(...report.filesWritten);
    }

    // 2g. Registration
    const pluginRoot = options.pluginRoot;
    if (pluginRoot) {
      if (provides.skills && Array.isArray(provides.skills)) {
        for (const skill of provides.skills) {
          const skillName = typeof skill === 'string' ? skill : skill.name;
          const skillDesc = typeof skill === 'string' ? '' : (skill.description || '');
          const skillSourceDir = typeof skill === 'string'
            ? resolvedPath
            : join(resolvedPath, skill.source_dir || '');
          const result = registerSkill(projectRoot, pluginRoot, skillSourceDir, {
            extensionName: manifest.name,
            skillName,
            description: skillDesc,
          });
          filesWritten.push(...(result.filesWritten || []));
          warnings.push(...(result.warnings || []));
        }
      }

      if (provides.hooks && Array.isArray(provides.hooks)) {
        for (const hook of provides.hooks) {
          const event = typeof hook === 'string' ? hook : hook.event;
          const hookCommand = typeof hook === 'string' ? hook : (hook.command || hook.event + '.sh');
          const result = registerHook(projectRoot, pluginRoot, resolvedPath, {
            extensionName: manifest.name,
            event,
            command: hookCommand,
          });
          filesWritten.push(...(result.filesWritten || []));
          warnings.push(...(result.warnings || []));
        }
      }
    }

    // 2h. Write manifest stamp
    const sourceUri = options.sourceUri || resolvedPath;
    writeManifestStamp(projectRoot, {
      name: manifest.name,
      version: manifest.version,
      source_uri: sourceUri,
    });

    return {
      name: manifest.name,
      version: manifest.version,
      filesWritten,
      mergesApplied,
      warnings,
    };
  } finally {
    // Cleanup temp dirs from npm/git resolution (local sources have no _tmpDir)
    if (options._tmpDir) {
      rmSync(options._tmpDir, { recursive: true, force: true });
    }
  }
}

/**
 * Write (upsert) an extension stamp into manifest.yaml's installed_extensions.
 *
 * Idempotent: if the extension name already exists, its entry is updated.
 * Credentials are stripped from source_uri before writing.
 *
 * @param {string} projectRoot - Project root directory.
 * @param {{ name: string, version: string, source_uri: string }} stamp
 */
export function writeManifestStamp(projectRoot, stamp) {
  const manifestPath = join(projectRoot, '.context-index', 'manifest.yaml');
  const raw = readFileSync(manifestPath, 'utf8');

  const cleanUri = stripCredentials(stamp.source_uri);
  const installedDate = new Date().toISOString();

  const newEntry = {
    name: stamp.name,
    version: stamp.version,
    installed_date: installedDate,
    source_uri: cleanUri,
  };

  // Read existing stamps
  const existing = readManifestStampsFromContent(raw);

  // Upsert: replace if name matches, append otherwise
  const idx = existing.findIndex(e => e.name === stamp.name);
  if (idx >= 0) {
    existing[idx] = newEntry;
  } else {
    existing.push(newEntry);
  }

  // Rewrite manifest with updated installed_extensions
  const updated = rewriteManifestWithStamps(raw, existing);
  writeFileSync(manifestPath, updated);
}

/**
 * Read installed extension stamps from a project's manifest.yaml.
 *
 * @param {string} projectRoot - Project root directory.
 * @returns {Array<{ name: string, version: string, installed_date: string, source_uri: string }>}
 */
export function readManifestStamps(projectRoot) {
  const manifestPath = join(projectRoot, '.context-index', 'manifest.yaml');
  if (!existsSync(manifestPath)) return [];

  const raw = readFileSync(manifestPath, 'utf8');
  return readManifestStampsFromContent(raw);
}

/**
 * List installed extensions from a parsed manifest object.
 *
 * @param {object|null} manifest - Parsed manifest.yaml content.
 * @returns {Array<{ name: string, version: string, installed_date: string, source_uri: string }>}
 */
export function listExtensions(manifest) {
  if (!manifest || !Array.isArray(manifest.installed_extensions)) {
    return [];
  }
  return manifest.installed_extensions;
}

/**
 * Parse installed_extensions from raw manifest YAML content.
 */
function readManifestStampsFromContent(raw) {
  try {
    const parsed = parseYaml(raw);
    if (parsed && Array.isArray(parsed.installed_extensions)) {
      return parsed.installed_extensions;
    }
  } catch {
    // If YAML parsing fails, return empty
  }
  return [];
}

/**
 * Rewrite manifest.yaml content to include updated installed_extensions.
 *
 * This is a targeted rewrite: it preserves existing content and either
 * replaces or appends the installed_extensions block.
 */
function rewriteManifestWithStamps(raw, stamps) {
  const stampYaml = serializeStamps(stamps);

  // Check if installed_extensions already exists in the file
  const marker = 'installed_extensions:';
  const markerIdx = raw.indexOf(marker);

  if (markerIdx >= 0) {
    // Find the end of the installed_extensions block
    const afterMarker = markerIdx + marker.length;
    const lines = raw.split('\n');
    let startLine = -1;
    let endLine = lines.length;
    let charCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineStart = charCount;
      charCount += lines[i].length + 1; // +1 for \n
      if (lineStart <= markerIdx && markerIdx < charCount) {
        startLine = i;
        // Find end: next line at same or less indent, or end of file
        const baseIndent = lines[i].search(/\S/);
        for (let j = i + 1; j < lines.length; j++) {
          const line = lines[j];
          if (line.trim() === '') continue;
          const indent = line.search(/\S/);
          if (indent <= baseIndent) {
            endLine = j;
            break;
          }
        }
        break;
      }
    }

    if (startLine >= 0) {
      const before = lines.slice(0, startLine).join('\n');
      const after = lines.slice(endLine).join('\n');
      const parts = [before, stampYaml];
      if (after.trim()) parts.push(after);
      return parts.join('\n') + '\n';
    }
  }

  // Append installed_extensions at the end
  const trimmed = raw.trimEnd();
  return trimmed + '\n\n' + stampYaml + '\n';
}

/**
 * Serialize stamps array to YAML block format.
 */
function serializeStamps(stamps) {
  if (stamps.length === 0) {
    return 'installed_extensions: []';
  }

  const lines = ['installed_extensions:'];
  for (const stamp of stamps) {
    lines.push(`  - name: "${stamp.name}"`);
    lines.push(`    version: "${stamp.version}"`);
    lines.push(`    installed_date: "${stamp.installed_date}"`);
    lines.push(`    source_uri: "${stamp.source_uri}"`);
  }
  return lines.join('\n');
}
