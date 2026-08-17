/**
 * URI classification, pattern validation, and per-type source resolution
 * for extension installation.
 *
 * Resolves npm packages, git repos, and local directories to a local
 * directory path containing a valid `adev-extension.yaml`.
 *
 * All subprocess calls use `child_process.spawn` with argument arrays
 * (no shell) to prevent command injection.
 *
 * @module lib/extensions/resolve-source
 */

import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { parseExtensionManifest } from './manifest-schema.mjs';
import { codedError as makeError } from '../errors.mjs';

/** Maximum URI length to prevent pathological regex evaluation. */
const MAX_URI_LENGTH = 2048;

/** npm package name pattern (scoped and unscoped). */
const NPM_NAME_PATTERN = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** Git URL patterns. */
const GIT_URL_PATTERN = /^(https?|git|ssh|file):\/\/.+\/.+/;
const GIT_SSH_PATTERN = /^git@.+:.+/;

/**
 * Classify a URI into a source type.
 *
 * Rules (applied in order):
 * 1. Starts with `/`, `./`, or `../` -> local
 * 2. Starts with `https://`, `http://`, `git://`, `git@`, or `ssh://` -> git
 * 3. Otherwise -> npm
 *
 * @param {string} uri
 * @returns {'local' | 'git' | 'npm'}
 */
export function classifyUri(uri) {
  if (uri.startsWith('/') || uri.startsWith('./') || uri.startsWith('../')) {
    return 'local';
  }
  if (
    uri.startsWith('https://') ||
    uri.startsWith('http://') ||
    uri.startsWith('git://') ||
    uri.startsWith('git@') ||
    uri.startsWith('ssh://') ||
    uri.startsWith('file://')
  ) {
    return 'git';
  }
  return 'npm';
}

/**
 * Strip credentials (userinfo) from a URI per RFC 3986.
 * Handles `scheme://user:pass@host/path` and `scheme://user@host/path`.
 *
 * @param {string} uri
 * @returns {string}
 */
export function stripCredentials(uri) {
  // Only strip from URL-style URIs (scheme://)
  const schemeMatch = uri.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (!schemeMatch) return uri;

  try {
    const url = new URL(uri);
    url.username = '';
    url.password = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    // If URL parsing fails, try regex-based stripping
    return uri.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@]+@/, '$1');
  }
}

/**
 * Resolve an extension source URI to a local directory.
 *
 * @param {string} uri - npm package name, git URL, or local path.
 * @returns {Promise<{ type: string, resolved_path: string, manifest: object }>}
 * @throws {{ code: string, message: string }} On resolution failure.
 */
export async function resolveExtensionSource(uri) {
  if (typeof uri !== 'string' || uri.length === 0) {
    throw makeError('SOURCE_RESOLUTION', `Invalid URI: expected a non-empty string.`);
  }
  if (uri.length > MAX_URI_LENGTH) {
    throw makeError('SOURCE_RESOLUTION', `URI exceeds maximum length of ${MAX_URI_LENGTH} characters.`);
  }

  const type = classifyUri(uri);

  switch (type) {
    case 'local':
      return resolveLocal(uri);
    case 'npm':
      return resolveNpm(uri);
    case 'git':
      return resolveGit(uri);
    default:
      throw makeError('SOURCE_RESOLUTION', `URI "${uri}" does not match any supported format (local path, npm package, or git URL).`);
  }
}

/**
 * Resolve a local directory extension source.
 */
async function resolveLocal(uri) {
  const resolved = resolve(uri);
  const manifest = readAndValidateManifest(resolved);
  return { type: 'local', resolved_path: resolved, manifest };
}

/**
 * Resolve an npm package extension source.
 */
async function resolveNpm(uri) {
  if (!NPM_NAME_PATTERN.test(uri)) {
    throw makeError('SOURCE_RESOLUTION', `"${uri}" is not a valid npm package name. Expected pattern: ${NPM_NAME_PATTERN}.`);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'adev-ext-npm-'));
  try {
    // Fetch tarball via npm pack
    const packOutput = await runCommand('npm', ['pack', uri, '--pack-destination', tmpDir], { cwd: tmpDir });

    // Find the tarball
    const tarball = packOutput.stdout.trim().split('\n').pop();
    if (!tarball) {
      throw makeError('SOURCE_RESOLUTION', `npm pack produced no output for "${uri}".`);
    }

    const tarballPath = join(tmpDir, tarball);
    const extractDir = join(tmpDir, 'extracted');

    // Extract tarball
    await runCommand('tar', ['-xzf', tarballPath, '-C', tmpDir]);

    // npm pack extracts to a 'package' directory
    const packageDir = join(tmpDir, 'package');
    const manifest = readAndValidateManifest(packageDir);
    return { type: 'npm', resolved_path: packageDir, manifest, _tmpDir: tmpDir };
  } catch (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    if (err.code === 'MISSING_MANIFEST' || err.code === 'INVALID_SCHEMA' || err.code === 'SOURCE_RESOLUTION') {
      throw err;
    }
    throw makeError('SOURCE_RESOLUTION', `Failed to resolve npm package "${uri}": ${err.message}`);
  }
}

/**
 * Resolve a git repository extension source.
 */
async function resolveGit(uri) {
  // Split URI on first '#' to extract optional subdirectory fragment
  const hashIdx = uri.indexOf('#');
  const repoUrl = hashIdx >= 0 ? uri.slice(0, hashIdx) : uri;
  const subdir = hashIdx >= 0 ? uri.slice(hashIdx + 1) : '';

  // Validate against known git URL patterns (check repoUrl, not full URI with fragment)
  if (!GIT_URL_PATTERN.test(repoUrl) && !GIT_SSH_PATTERN.test(repoUrl)) {
    throw makeError('SOURCE_RESOLUTION', `"${repoUrl}" is not a valid git URL. Expected https://, http://, git://, ssh://, or git@ format.`);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'adev-ext-git-'));
  try {
    const cloneDir = join(tmpDir, 'repo');
    await runCommand('git', [
      'clone', '--depth', '1',
      '--config', 'core.hooksPath=/dev/null',
      repoUrl, cloneDir
    ]);

    // Resolve the extension directory (subdirectory or repo root)
    const extensionDir = subdir ? join(cloneDir, subdir) : cloneDir;

    // Path traversal guard: ensure resolved path stays within clone directory
    if (!resolve(extensionDir).startsWith(resolve(cloneDir))) {
      throw makeError('SOURCE_RESOLUTION', `Fragment path "${subdir}" escapes the clone directory.`);
    }

    // Check subdirectory exists
    if (subdir && !existsSync(extensionDir)) {
      throw makeError('SOURCE_RESOLUTION', `Subdirectory "${subdir}" not found in cloned repository.`);
    }

    const manifest = readAndValidateManifest(extensionDir);
    return { type: 'git', resolved_path: extensionDir, manifest, _tmpDir: tmpDir };
  } catch (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    if (err.code === 'MISSING_MANIFEST' || err.code === 'INVALID_SCHEMA' || err.code === 'SOURCE_RESOLUTION') {
      throw err;
    }
    throw makeError('SOURCE_RESOLUTION', `Failed to clone git repository "${stripCredentials(repoUrl)}": ${err.message}`);
  }
}

/**
 * Read and validate `adev-extension.yaml` from a directory.
 *
 * @param {string} dir - Directory containing the manifest.
 * @returns {object} Validated manifest object.
 * @throws {{ code: string, message: string }}
 */
function readAndValidateManifest(dir) {
  const manifestPath = join(dir, 'adev-extension.yaml');
  if (!existsSync(manifestPath)) {
    throw makeError('MISSING_MANIFEST', `No adev-extension.yaml found at ${dir}.`);
  }

  const content = readFileSync(manifestPath, 'utf8');
  const result = parseExtensionManifest(content);
  if (!result.valid) {
    throw makeError('INVALID_SCHEMA', result.message);
  }

  return result.manifest;
}

/**
 * Run a command via spawn (no shell) and return stdout/stderr.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} [opts]
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('error', (err) => {
      reject(makeError('SOURCE_RESOLUTION', `Failed to run ${cmd}: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const errOutput = stderr.slice(-8192); // Truncate to last 8KB
        reject(makeError('SOURCE_RESOLUTION', `${cmd} exited with code ${code}: ${errOutput}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

