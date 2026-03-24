import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Clone a repo to a cache directory, reusing cache if HEAD matches gitRef.
 * @param {{ url: string, name: string, gitRef: string }} repo
 * @param {string} cacheDir
 * @returns {{ path: string, cached: boolean }}
 */
export function cloneRepo(repo, cacheDir) {
  // 1. Validate URL scheme
  if (!repo.url.startsWith('https://')) {
    throw new Error(`repo.url must start with https:// — got: ${repo.url}`);
  }

  // 2. Validate repo name (lowercase alphanumeric + hyphens only)
  if (!/^[a-z0-9-]+$/.test(repo.name)) {
    throw new Error(`Invalid repo name: "${repo.name}" — must match /^[a-z0-9-]+$/`);
  }

  // 3. Validate gitRef (40-char hex string)
  if (!/^[0-9a-f]{40}$/.test(repo.gitRef)) {
    throw new Error(`Invalid gitRef: "${repo.gitRef}" — must be a 40-character hex string`);
  }

  // 4. Resolve cache path
  const resolvedCacheDir = resolve(cacheDir);
  const repoPath = resolve(resolvedCacheDir, repo.name);

  // 5. Verify resolved path is within cacheDir
  if (!repoPath.startsWith(resolvedCacheDir + '/') && repoPath !== resolvedCacheDir) {
    throw new Error(`Cache path escape detected: ${repoPath} is outside ${resolvedCacheDir}`);
  }

  // 6. If cache exists and HEAD matches, return cached
  if (existsSync(repoPath)) {
    try {
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoPath, encoding: 'utf-8' }).trim();
      if (head === repo.gitRef) {
        return { path: repoPath, cached: true };
      }
    } catch {
      // HEAD check failed — stale cache, remove it
    }

    // 7. Cache exists but HEAD differs — remove after verifying containment
    if (!repoPath.startsWith(resolvedCacheDir + '/')) {
      throw new Error(`Refusing to remove path outside cacheDir: ${repoPath}`);
    }
    rmSync(repoPath, { recursive: true, force: true });
  }

  // 8. Clone: --no-checkout then checkout specific ref
  try {
    execFileSync('git', ['clone', '--no-checkout', repo.url, repoPath], {
      stdio: 'pipe',
      timeout: 120_000,
    });
  } catch (err) {
    throw new Error(`Clone failed for ${repo.url}: ${err.message}`);
  }

  try {
    execFileSync('git', ['checkout', repo.gitRef], {
      cwd: repoPath,
      stdio: 'pipe',
      timeout: 30_000,
    });
  } catch (err) {
    // Clean up partial clone
    rmSync(repoPath, { recursive: true, force: true });
    throw new Error(`Checkout failed for ref ${repo.gitRef}: ${err.message}`);
  }

  return { path: repoPath, cached: false };
}
