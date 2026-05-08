/**
 * Visual reference capture library for prototype sessions.
 *
 * Validates, copies, deduplicates, and summarizes user-provided images,
 * storing them in `.context-index/references/<module>/visuals/`.
 *
 * @module lib/visual-references
 */

import { existsSync, lstatSync, statSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, extname, join, basename, relative } from 'node:path';

/**
 * Supported image formats (lowercase, with leading dot).
 */
const SUPPORTED_FORMATS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

/**
 * Maximum file size in bytes (10 MB).
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Maximum slug length in characters.
 */
const MAX_SLUG_LENGTH = 60;

/**
 * Check whether a file extension is a supported image format.
 * Comparison is case-insensitive.
 *
 * @param {string} ext - File extension (e.g., '.png', '.JPG')
 * @returns {boolean}
 */
export function isSupportedFormat(ext) {
  return SUPPORTED_FORMATS.has(ext.toLowerCase());
}

/**
 * Slugify a description string for use as a filename.
 *
 * Rules: lowercase, replace non-alphanumeric with hyphens, collapse
 * consecutive hyphens, trim to MAX_SLUG_LENGTH at a word boundary,
 * trim trailing hyphens. Returns empty string if nothing remains.
 *
 * @param {string} description
 * @returns {string}
 */
export function slugifyDescription(description) {
  let slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // non-alphanumeric → hyphens
    .replace(/-+/g, '-')           // collapse consecutive hyphens
    .replace(/^-|-$/g, '');        // trim leading/trailing hyphens

  if (slug.length > MAX_SLUG_LENGTH) {
    // Truncate at word boundary (hyphens are word separators in a slug)
    slug = slug.slice(0, MAX_SLUG_LENGTH);
    const lastHyphen = slug.lastIndexOf('-');
    if (lastHyphen > 0) {
      slug = slug.slice(0, lastHyphen);
    }
    slug = slug.replace(/-$/, '');
  }

  return slug;
}

/**
 * Validate a source file path for visual reference capture.
 *
 * Checks: existence, regular file (not symlink/directory), supported format,
 * size limit, and whether the path is external to the project root.
 *
 * @param {string} sourcePath - Path to the image file
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {{ valid: boolean, code?: string, external?: boolean, resolvedPath?: string, size?: number, ext?: string }}
 */
export function validateSourcePath(sourcePath, projectRoot) {
  const resolvedPath = resolve(sourcePath);

  // Check existence
  if (!existsSync(resolvedPath)) {
    return { valid: false, code: 'IMAGE_NOT_FOUND' };
  }

  // Check symlink (lstat does not follow symlinks)
  const lstats = lstatSync(resolvedPath);
  if (lstats.isSymbolicLink()) {
    return { valid: false, code: 'IMAGE_SYMLINK' };
  }

  // Check regular file (not directory)
  if (!lstats.isFile()) {
    return { valid: false, code: 'IMAGE_NOT_FOUND' };
  }

  // Check supported format
  const ext = extname(resolvedPath).toLowerCase();
  if (!isSupportedFormat(ext)) {
    return { valid: false, code: 'UNSUPPORTED_FORMAT' };
  }

  // Check file size
  const stats = statSync(resolvedPath);
  if (stats.size > MAX_FILE_SIZE) {
    return { valid: false, code: 'IMAGE_TOO_LARGE' };
  }

  // Check if external to project root
  const resolvedRoot = resolve(projectRoot);
  const rel = relative(resolvedRoot, resolvedPath);
  const external = rel.startsWith('..') || resolve(resolvedRoot, rel) !== resolvedPath;

  return {
    valid: true,
    external,
    resolvedPath,
    size: stats.size,
    ext,
  };
}

/**
 * Resolve a target file path with deduplication.
 *
 * If `<dir>/<slug>.<ext>` exists, tries `<slug>-2.<ext>`, `<slug>-3.<ext>`, etc.
 *
 * @param {string} dir - Target directory
 * @param {string} slug - Slugified filename (without extension)
 * @param {string} ext - File extension (with leading dot)
 * @returns {string} Full path to the deduplicated filename
 */
export function resolveTargetPath(dir, slug, ext) {
  const base = join(dir, `${slug}${ext}`);
  if (!existsSync(base)) return base;

  let suffix = 2;
  while (true) {
    const candidate = join(dir, `${slug}-${suffix}${ext}`);
    if (!existsSync(candidate)) return candidate;
    suffix++;
  }
}

/**
 * Copy a visual reference to the context-index references directory.
 *
 * @param {{ sourcePath: string, module: string, description: string, projectRoot: string }} opts
 * @returns {{ destinationPath: string, slug: string, source: string }}
 */
export function copyVisualReference({ sourcePath, module, description, projectRoot }) {
  let slug = slugifyDescription(description);
  if (!slug) slug = 'reference';

  const resolvedSource = resolve(sourcePath);
  const ext = extname(resolvedSource).toLowerCase();
  const targetDir = join(projectRoot, '.context-index', 'references', module, 'visuals');

  mkdirSync(targetDir, { recursive: true });

  const destinationPath = resolveTargetPath(targetDir, slug, ext);
  copyFileSync(resolvedSource, destinationPath);

  return { destinationPath, slug, source: 'user-upload' };
}

/**
 * Create a session tracker for visual references.
 *
 * @returns {{ add: Function, count: Function, toArray: Function, summary: Function }}
 */
export function createVisualReferenceTracker() {
  const refs = [];

  return {
    /**
     * Add a captured reference to the tracker.
     * @param {{ path: string, description: string }} ref
     */
    add(ref) {
      refs.push(ref);
    },

    /**
     * Return the count of captured references.
     * @returns {number}
     */
    count() {
      return refs.length;
    },

    /**
     * Return the captured references as an array.
     * @returns {{ path: string, description: string }[]}
     */
    toArray() {
      return [...refs];
    },

    /**
     * Generate a session summary string.
     * Returns empty string if no references were captured.
     *
     * @param {string} module - Module name for the summary header
     * @returns {string}
     */
    summary(module) {
      if (refs.length === 0) return '';

      const lines = [
        `Captured ${refs.length} visual reference(s) in \`.context-index/references/${module}/visuals/\`:`,
      ];
      for (const ref of refs) {
        lines.push(`- ${ref.description}: \`${ref.path}\``);
      }
      return lines.join('\n');
    },
  };
}
