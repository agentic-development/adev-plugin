/**
 * Extension install orchestrator and manifest stamp writer.
 *
 * `installExtension()` orchestrates the full install pipeline:
 *   1. Read and validate adev-extension.yaml
 *   2. Check version compatibility
 *   3. Delegate content operations (domain profiles, governance, samples)
 *   4. Delegate registration (skills, hooks into provider hooks.json)
 *   5. Write manifest stamp
 *   6. Return install report
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
import { installDomainProfile, mergeGovernanceEntries, installSamples, checkSkillConflicts } from './content-install.mjs';
import { registerSkill, registerHook } from './register.mjs';
import { parseYaml } from '../profiles/yaml.mjs';

/**
 * Install an extension from a resolved local directory into a project.
 *
 * @param {string} resolvedPath - Local directory containing adev-extension.yaml.
 * @param {string} projectRoot - Project root directory.
 * @param {object} [options]
 * @param {string} [options.pluginRoot] - Plugin root for version resolution.
 * @param {string} [options.sourceUri] - Original source URI (for manifest stamp).
 * @returns {Promise<{ name: string, version: string, filesWritten: string[], mergesApplied: string[] }>}
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

  // 3. Content operations
  const filesWritten = [];
  const mergesApplied = [];
  const warnings = [];
  const provides = manifest.provides || {};

  try {
    // 3a. Domain profile
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

    // 3b. Governance
    if (provides.governance && Array.isArray(provides.governance)) {
      for (const govEntry of provides.governance) {
        const target = govEntry.target || 'review.yaml';
        const entries = govEntry.entries || [];
        if (entries.length > 0) {
          const report = mergeGovernanceEntries(projectRoot, target, entries);
          mergesApplied.push(...report.mergesApplied);
        }
      }
    }

    // 3c. Samples
    if (provides.samples && Array.isArray(provides.samples)) {
      const report = installSamples(projectRoot, resolvedPath, provides.samples);
      filesWritten.push(...report.filesWritten);
      warnings.push(...report.warnings);
    }

    // 3d. Skill conflict detection
    if (provides.skills && Array.isArray(provides.skills)) {
      const skillNames = provides.skills.map(s => typeof s === 'string' ? s : s.name);
      checkSkillConflicts(skillNames, { pluginRoot: options.pluginRoot });
    }

    // 4. Registration
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

    // 5. Write manifest stamp
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
