/**
 * Meta-tools: deterministic helpers that replace multi-turn Read/Grep/Glob
 * sequences with single Bash calls. Used by skills via inline `node -e`.
 *
 * All functions are read-only and use only Node.js built-ins.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { basename, join, resolve, dirname } from 'path';
import { defaultKindFor, isValidKind } from './kinds.mjs';

/**
 * Extract YAML frontmatter from a markdown file's content.
 * Returns an object with parsed key-value pairs (simple flat parsing).
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const lines = match[1].split('\n');
  const result = {};
  for (const line of lines) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      let value = kv[2].trim();
      // Strip quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[kv[1]] = value;
    }
  }
  return result;
}

/**
 * Infer the artifact layer ('spec' or 'charter') from a file path.
 *
 * - Paths ending in `.spec.md` → 'spec'
 * - Paths whose basename is `charter.md` → 'charter'
 * - Anything else → null (caller decides how to handle non-artifact paths)
 *
 * @param {string} filePath
 * @returns {'spec'|'charter'|null}
 */
function inferLayer(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  if (filePath.endsWith('.spec.md')) return 'spec';
  if (basename(filePath) === 'charter.md') return 'charter';
  return null;
}

/**
 * Parse the YAML frontmatter of a spec or charter file and project the
 * canonical `kind`, `kindValid`, and `kindResolved` sentinel fields onto
 * the result.
 *
 * Owned by the frontmatter-discriminator spec
 * (`.context-index/specs/features/lifecycle-artifacts/frontmatter-discriminator.spec.md`).
 * Every parsed result exposes the three sentinel fields:
 *
 *   - `kind` (string): the verbatim `kind:` value from frontmatter, or the
 *     layer's default kind (via `defaultKindFor`) when missing.
 *   - `kindValid` (boolean): `isValidKind(layer, kind)` — distinguishes a
 *     known kind from an unknown / cross-layer value.
 *   - `kindResolved` ('explicit' | 'default'): `'explicit'` when `kind:` was
 *     present in the frontmatter, `'default'` when applied by this function.
 *
 * Pure read: never modifies disk content. The layer is inferred from the
 * file path (`*.spec.md` → 'spec', `charter.md` → 'charter') so callers do
 * not pass it explicitly.
 *
 * @param {string} filePath - Absolute or cwd-relative path to a spec/charter file.
 * @returns {object} Parsed frontmatter merged with kind sentinels. Throws
 *                   if the file does not exist (per existing parser contract).
 */
export function parseSpecFrontmatter(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const raw = parseFrontmatter(content) ?? {};
  const layer = inferLayer(filePath) ?? 'spec';

  const hasExplicitKind = Object.prototype.hasOwnProperty.call(raw, 'kind');
  const kind = hasExplicitKind ? raw.kind : defaultKindFor(layer);
  const kindResolved = hasExplicitKind ? 'explicit' : 'default';
  const kindValid = isValidKind(layer, kind);

  return {
    ...raw,
    kind,
    kindValid,
    kindResolved,
  };
}

/**
 * Extract a specific section from markdown content by heading.
 * Returns the content under the heading until the next heading of same or higher level.
 */
function extractSection(content, heading) {
  const headingLevel = heading.match(/^#+/)?.[0].length || 2;
  const pattern = new RegExp(
    `^#{${headingLevel}}\\s+${heading.replace(/^#+\s*/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
    'm'
  );
  const match = content.match(pattern);
  if (!match) return null;

  const start = match.index + match[0].length;
  // Find next heading of same or higher level
  const rest = content.slice(start);
  const nextHeading = rest.match(new RegExp(`^#{1,${headingLevel}}\\s`, 'm'));
  const end = nextHeading ? start + nextHeading.index : content.length;

  return content.slice(start, end).trim();
}

/**
 * Load spec context: returns spec + charter capability map + constitution principles
 * concatenated with --- delimiters.
 *
 * @param {string} specPath - Path to the spec file (relative to cwd or absolute)
 * @returns {Promise<string>} Concatenated context
 */
export async function loadSpecContext(specPath) {
  const resolvedSpec = resolve(specPath);

  let specContent;
  try {
    specContent = readFileSync(resolvedSpec, 'utf8');
  } catch {
    throw new Error(`Spec not found: ${specPath}`);
  }

  const frontmatter = parseFrontmatter(specContent);
  const projectRoot = findProjectRoot(dirname(resolvedSpec));

  const sections = [`## Spec\n\n${specContent}`];

  // Load charter if spec has a charter field
  if (frontmatter?.charter) {
    const charterPath = join(projectRoot, '.context-index', 'specs', 'features', frontmatter.charter, 'charter.md');
    try {
      const charterContent = readFileSync(charterPath, 'utf8');
      const capabilityMap = extractSection(charterContent, '## Capability Map');
      if (capabilityMap) {
        sections.push(`## Charter Capability Map\n\n${capabilityMap}`);
      } else {
        sections.push(`## Charter\n\n${charterContent}`);
      }
    } catch {
      process.stderr.write(`Warning: Charter not found for module "${frontmatter.charter}"\n`);
    }
  }

  // Load constitution principles
  const constitutionPath = join(projectRoot, '.context-index', 'constitution.md');
  try {
    const constitutionContent = readFileSync(constitutionPath, 'utf8');
    const principles = extractSection(constitutionContent, '## Non-Negotiable Principles');
    if (principles) {
      sections.push(`## Constitution Principles\n\n${principles}`);
    } else {
      sections.push(`## Constitution\n\n${constitutionContent}`);
    }
  } catch {
    process.stderr.write('Warning: Constitution not found\n');
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Find specs by status within a module or across all modules.
 *
 * @param {string|null} module - Module name, "*" for all, or null for all
 * @param {string} status - Status to filter by (e.g., "review-pending", "implemented")
 * @returns {Promise<Array<{path: string, title: string, status: string, milestone: string, revision: string}>>}
 */
export async function findSpecsByStatus(module, status) {
  const projectRoot = findProjectRoot(process.cwd());
  const results = [];

  const dirs = [];

  if (!module || module === '*') {
    // Scan all modules
    const featuresDir = join(projectRoot, '.context-index', 'specs', 'features');
    try {
      const entries = readdirSync(featuresDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          dirs.push(join(featuresDir, entry.name));
        }
      }
    } catch { /* directory doesn't exist */ }

    // Also scan cross-cutting
    const crossCuttingDir = join(projectRoot, '.context-index', 'specs', 'cross-cutting');
    try {
      statSync(crossCuttingDir);
      dirs.push(crossCuttingDir);
    } catch { /* doesn't exist */ }
  } else {
    dirs.push(join(projectRoot, '.context-index', 'specs', 'features', module));
  }

  for (const dir of dirs) {
    let files;
    try {
      files = readdirSync(dir);
    } catch { continue; }

    for (const file of files) {
      if (!file.endsWith('.spec.md')) continue;

      const filePath = join(dir, file);
      try {
        const content = readFileSync(filePath, 'utf8');
        const fm = parseFrontmatter(content);
        if (!fm || fm.status !== status) continue;

        // Extract title from first heading
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].replace(/^(Live Spec|Cross-Cutting Spec):\s*/, '') : file;

        results.push({
          path: filePath,
          title,
          status: fm.status,
          milestone: fm.milestone || '',
          revision: fm.revision || '1'
        });
      } catch { continue; }
    }
  }

  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}

/**
 * Get plan progress: count checkboxes and group by task.
 *
 * @param {string} planPath - Path to the plan file
 * @returns {Promise<{total: number, completed: number, remaining: number, percent: number, tasks: Array<{number: number, title: string, done: boolean}>}>}
 */
export async function getPlanProgress(planPath) {
  const resolvedPath = resolve(planPath);

  let content;
  try {
    content = readFileSync(resolvedPath, 'utf8');
  } catch {
    throw new Error(`Plan not found: ${planPath}`);
  }

  const lines = content.split('\n');
  let total = 0;
  let completed = 0;
  const tasks = [];
  let currentTask = null;
  let currentTaskDone = true;

  let inTasksSection = false;

  for (const line of lines) {
    // Detect task headings: ### Task N: Title
    const taskMatch = line.match(/^###\s+Task\s+(\d+)[:\s]+(.+)$/i);
    if (taskMatch) {
      inTasksSection = true;
      // Save previous task
      if (currentTask !== null) {
        tasks.push({ number: currentTask.number, title: currentTask.title, done: currentTaskDone });
      }
      currentTask = { number: parseInt(taskMatch[1], 10), title: taskMatch[2].trim() };
      currentTaskDone = true;
      continue;
    }

    // A ## heading after tasks started means we left the tasks section
    // (e.g., ## Quality Gates). Stop counting checkboxes.
    if (inTasksSection && /^##\s+/.test(line) && !/^###/.test(line)) {
      // Save last task before exiting
      if (currentTask !== null) {
        tasks.push({ number: currentTask.number, title: currentTask.title, done: currentTaskDone });
        currentTask = null;
      }
      inTasksSection = false;
      continue;
    }

    // Only count checkboxes inside task sections
    if (!inTasksSection) continue;

    const unchecked = line.match(/^\s*-\s+\[ \]/);
    const checked = line.match(/^\s*-\s+\[x\]/i);

    if (unchecked) {
      total++;
      if (currentTask) currentTaskDone = false;
    } else if (checked) {
      total++;
      completed++;
    }
  }

  // Save last task
  if (currentTask !== null) {
    tasks.push({ number: currentTask.number, title: currentTask.title, done: currentTaskDone });
  }

  const remaining = total - completed;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return { total, completed, remaining, percent, tasks };
}

/**
 * Walk up from a directory to find the project root (contains .context-index/).
 */
function findProjectRoot(startDir) {
  let dir = resolve(startDir);
  while (dir !== dirname(dir)) {
    try {
      statSync(join(dir, '.context-index'));
      return dir;
    } catch { /* not found, keep going */ }
    dir = dirname(dir);
  }
  // Fallback to cwd
  return process.cwd();
}
