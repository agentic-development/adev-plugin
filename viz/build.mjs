#!/usr/bin/env node

/**
 * Context Index Graph Extraction
 *
 * Reads .context-index/ and produces graph-data.json with all nodes, edges,
 * type registries, and analytics. Zero external dependencies.
 *
 * Usage: node viz/build.mjs [--root <path>]
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, dirname, relative, extname } from 'node:path';
import { execSync } from 'node:child_process';
import { getIssueManager } from '../lib/issues/registry.mjs';
import { loadManifest } from '../lib/manifest.mjs';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let root = process.cwd();
const rootIdx = args.indexOf('--root');
if (rootIdx !== -1 && args[rootIdx + 1]) root = args[rootIdx + 1];

const ctxDir = join(root, '.context-index');
if (!existsSync(ctxDir)) {
  console.error(`No .context-index/ found at ${root}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    const val = raw.trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      meta[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    } else {
      meta[key] = val.replace(/^["']|["']$/g, '') || null;
    }
  }
  return { meta, body: content.slice(match[0].length) };
}

function readFileSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function contentPreview(body, maxLen = 500) {
  if (!body) return null;
  // Strip markdown headings, frontmatter artifacts, and excessive whitespace
  const text = body
    .replace(/^#{1,6}\s+.+$/gm, '')  // headings
    .replace(/\|[^\n]+\|/g, '')       // table rows
    .replace(/```[\s\S]*?```/g, '')   // code blocks
    .replace(/<!--[\s\S]*?-->/g, '')  // HTML comments
    .replace(/\n{3,}/g, '\n\n')       // collapse blank lines
    .trim();
  if (!text) return null;
  return text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text;
}

function fileModTime(path) {
  try { return statSync(path).mtime.toISOString().slice(0, 10); } catch { return null; }
}

function titleFromMarkdown(body) {
  const m = body.match(/^#\s+(.+)/m);
  return m ? m[1].replace(/^(Feature Charter|Live Spec|ADR \d+):\s*/i, '').trim() : null;
}

function listMdFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .filter(f => f.endsWith('.md') && !basename(f).startsWith('.'))
    .map(f => join(dir, f));
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const nodes = [];
const edges = [];
const nodeIds = new Set();

function addNode(node) {
  if (nodeIds.has(node.id)) return;
  nodeIds.add(node.id);
  nodes.push(node);
}

function addEdge(source, target, type) {
  if (!source || !target) return;
  edges.push({ source, target, type });
}

// ---------------------------------------------------------------------------
// Type Registries
// ---------------------------------------------------------------------------

const nodeTypeRegistry = {
  module:        { label: 'Module',        color: '#6366f1', shape: 'hexagon' },
  charter:       { label: 'Charter',       color: '#8b5cf6', shape: 'diamond' },
  spec:          { label: 'Spec',          color: '#3b82f6', shape: 'round-rectangle' },
  review:        { label: 'Review',        color: '#f59e0b', shape: 'ellipse' },
  plan:          { label: 'Plan',          color: '#10b981', shape: 'round-rectangle' },
  epic:          { label: 'Epic',          color: '#ec4899', shape: 'diamond' },
  issue:         { label: 'Issue',         color: '#f97316', shape: 'ellipse' },
  adr:           { label: 'ADR',           color: '#14b8a6', shape: 'octagon' },
  session:       { label: 'Session',       color: '#64748b', shape: 'round-rectangle' },
  'code-file':   { label: 'Code File',     color: '#22c55e', shape: 'rectangle', hidden: true },
  'cross-cutting': { label: 'Cross-Cutting', color: '#a855f7', shape: 'star' },
  heuristic:     { label: 'Heuristic',     color: '#f43f5e', shape: 'triangle' },
  provider:      { label: 'Provider',      color: '#0ea5e9', shape: 'pentagon' },
  commit:        { label: 'Commit',        color: '#a3e635', shape: 'round-rectangle', hidden: true },
};

const edgeTypeRegistry = {
  'module-owns-charter':     { label: 'owns',          color: '#6366f1', style: 'solid' },
  'charter-scopes-spec':     { label: 'scopes',        color: '#8b5cf6', style: 'solid' },
  'spec-has-review':         { label: 'has review',     color: '#f59e0b', style: 'solid' },
  'spec-has-plan':           { label: 'has plan',       color: '#10b981', style: 'solid' },
  'plan-references-spec':    { label: 'references',     color: '#10b981', style: 'dashed' },
  'plan-references-review':  { label: 'references',     color: '#f59e0b', style: 'dashed' },
  'spec-implemented-by':     { label: 'implemented by', color: '#22c55e', style: 'solid' },
  'cross-cutting-affects':   { label: 'affects',        color: '#a855f7', style: 'dashed' },
  'epic-planned-by':         { label: 'planned by',     color: '#ec4899', style: 'solid' },
  'issue-belongs-to-epic':   { label: 'belongs to',     color: '#f97316', style: 'solid' },
  'issue-planned-by':        { label: 'planned by',     color: '#f97316', style: 'dashed' },
  'issue-implements-task':   { label: 'implements',     color: '#f97316', style: 'solid' },
  'issue-blocked-by':        { label: 'blocked by',     color: '#ef4444', style: 'solid' },
  'session-touches-spec':    { label: 'touches',        color: '#64748b', style: 'dashed' },
  'session-creates-commit':  { label: 'creates commit', color: '#64748b', style: 'dashed' },
  'code-imports-code':       { label: 'imports',        color: '#22c55e', style: 'solid' },
  'code-belongs-to-module':  { label: 'belongs to',     color: '#22c55e', style: 'solid' },
  'heuristic-scoped-to':     { label: 'scoped to',      color: '#f43f5e', style: 'solid' },
  'heuristic-evidenced-by':  { label: 'evidenced by',   color: '#f43f5e', style: 'dashed' },
  'provider-adapts':         { label: 'adapts',         color: '#0ea5e9', style: 'dashed' },
  'commit-touches-file':     { label: 'touches',        color: '#a3e635', style: 'dashed' },
  'commit-references-spec':  { label: 'references',     color: '#a3e635', style: 'solid' },
};

// ---------------------------------------------------------------------------
// 1. readManifest
// ---------------------------------------------------------------------------

function readManifest() {
  const content = readFileSafe(join(ctxDir, 'manifest.yaml'));
  if (!content) return { projectName: basename(root), modules: [] };

  // Simple YAML parser for manifest — handles the flat structure we need
  const projectName = content.match(/^\s*name:\s*"?([^"\n]+)"?/m)?.[1] || basename(root);
  const modules = [];
  const moduleBlocks = content.split(/^\s+-\s+slug:/m).slice(1);
  for (const block of moduleBlocks) {
    const slug = block.match(/^([^\n]+)/)?.[1]?.trim();
    const name = block.match(/name:\s*(.+)/)?.[1]?.trim();
    const pathMatches = [...block.matchAll(/^\s+-\s+(.+)/gm)];
    // Skip the slug line itself, get paths under paths:
    const pathsStart = block.indexOf('paths:');
    const paths = [];
    if (pathsStart !== -1) {
      const pathSection = block.slice(pathsStart);
      for (const m of pathSection.matchAll(/^\s+-\s+(.+)/gm)) {
        paths.push(m[1].trim().replace(/^["']|["']$/g, ''));
      }
    }
    if (slug) modules.push({ slug, name: name || slug, paths });
  }
  return { projectName, modules };
}

// ---------------------------------------------------------------------------
// 2. extractCharters
// ---------------------------------------------------------------------------

function extractCharters(modules) {
  const charterDir = join(ctxDir, 'specs', 'features');
  if (!existsSync(charterDir)) return;

  for (const dir of readdirSync(charterDir, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name.startsWith('.')) continue;
    const charterPath = join(charterDir, dir.name, 'charter.md');
    const content = readFileSafe(charterPath);
    if (!content) continue;

    const { meta, body } = parseFrontmatter(content);
    const title = titleFromMarkdown(body) || dir.name;
    const id = `charter:${dir.name}`;

    addNode({
      id,
      type: 'charter',
      title,
      status: meta.status || null,
      created: meta.created || fileModTime(charterPath),
      updated: meta.updated || fileModTime(charterPath),
      metadata: {
        module: dir.name,
        revision: meta.revision || null,
        contentPreview: contentPreview(body),
      },
    });

    // module-owns-charter edge
    const moduleNode = modules.find(m => m.slug === dir.name);
    if (moduleNode) {
      addEdge(`module:${moduleNode.slug}`, id, 'module-owns-charter');
    }
  }
}

// ---------------------------------------------------------------------------
// 3. extractSpecs
// ---------------------------------------------------------------------------

function extractSpecs() {
  const featDir = join(ctxDir, 'specs', 'features');
  if (!existsSync(featDir)) return;

  for (const moduleDir of readdirSync(featDir, { withFileTypes: true })) {
    if (!moduleDir.isDirectory() || moduleDir.name.startsWith('.')) continue;
    const modulePath = join(featDir, moduleDir.name);

    for (const file of readdirSync(modulePath)) {
      if (!file.endsWith('.md') || file.startsWith('.') || file === 'charter.md') continue;
      const filePath = join(modulePath, file);
      const content = readFileSafe(filePath);
      if (!content) continue;
      const { meta, body } = parseFrontmatter(content);

      const slug = file.replace('.md', '');
      const specModule = moduleDir.name;

      if (file.endsWith('.review.md')) {
        // Review node
        const specSlug = slug.replace('.review', '');
        const id = `review:${specModule}/${specSlug}`;
        addNode({
          id,
          type: 'review',
          title: `Review: ${specSlug}`,
          status: meta.verdict || null,
          created: meta.date || fileModTime(filePath),
          updated: meta.date || fileModTime(filePath),
          metadata: {
            verdict: meta.verdict || null,
            'last-reviewed-revision': meta['last-reviewed-revision'] || null,
            'file-sha': meta['file-sha'] || null,
          },
        });
        addEdge(`spec:${specModule}/${specSlug}`, id, 'spec-has-review');

      } else if (file.endsWith('.plan.md')) {
        // Plan node
        const specSlug = slug.replace('.plan', '');
        const id = `plan:${specModule}/${specSlug}`;

        // Count tasks
        const checked = (body.match(/- \[x\]/gi) || []).length;
        const unchecked = (body.match(/- \[ \]/g) || []).length;

        addNode({
          id,
          type: 'plan',
          title: `Plan: ${specSlug}`,
          status: unchecked === 0 && checked > 0 ? 'complete' : 'in-progress',
          created: fileModTime(filePath),
          updated: fileModTime(filePath),
          metadata: {
            'spec-ref': meta['spec-ref'] || null,
            'review-verdict': meta['review-verdict'] || null,
            tasksComplete: checked,
            tasksTotal: checked + unchecked,
          },
        });
        addEdge(`spec:${specModule}/${specSlug}`, id, 'spec-has-plan');

        // plan-references-spec: look for "> **Spec:**" or "Spec:" line in plan body
        const specRef = body.match(/\*?\*?Spec:?\*?\*?\s*(.+)/m);
        if (specRef) {
          const refMatch = specRef[1].trim().match(/features\/([^/]+)\/(.+?)(?:\.md)?$/);
          if (refMatch) addEdge(id, `spec:${refMatch[1]}/${refMatch[2]}`, 'plan-references-spec');
        }

        // plan-references-review: look for "> **Review:**" or "Review:" in plan body
        const reviewRef = body.match(/\*?\*?Review:?\*?\*?\s*(.+)/m);
        if (reviewRef) {
          const refMatch = reviewRef[1].trim().match(/features\/([^/]+)\/(.+?)(?:\.review)?(?:\.md)?$/);
          if (refMatch) addEdge(id, `review:${refMatch[1]}/${refMatch[2]}`, 'plan-references-review');
        }

      } else if (file.endsWith('-validation.md')) {
        // Skip validation files (derived by convention, not a primary node type)
        continue;

      } else {
        // Spec node
        const id = `spec:${specModule}/${slug}`;
        addNode({
          id,
          type: 'spec',
          title: titleFromMarkdown(body) || slug,
          status: meta.status || null,
          created: meta.created || fileModTime(filePath),
          updated: meta.updated || fileModTime(filePath),
          metadata: {
            charter: meta.charter || specModule,
            risk_level: meta.risk_level || null,
            milestone: meta.milestone || null,
            revision: meta.revision || null,
            contentPreview: contentPreview(body),
          },
        });
        // charter-scopes-spec
        addEdge(`charter:${meta.charter || specModule}`, id, 'charter-scopes-spec');

        // spec-implemented-by from source-manifest
        if (meta['source-manifest']) {
          // source-manifest is complex YAML; try to find files references in the body
          const smMatch = body.match(/source-manifest[\s\S]*?files:\s*\n((?:\s+-\s+.+\n?)*)/);
          if (smMatch) {
            for (const m of smMatch[1].matchAll(/^\s+-\s+(.+)/gm)) {
              const filePath = m[1].trim();
              const codeId = `code-file:${filePath}`;
              addEdge(id, codeId, 'spec-implemented-by');
            }
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. extractTasks
// ---------------------------------------------------------------------------

async function extractTasks() {
  let adapter;
  try {
    const manifest = loadManifest(root);
    adapter = getIssueManager(manifest, root);
  } catch {
    return;
  }

  const planRefRegex = /features\/([^/]+)\/(.+)\.plan\.md/;
  const isoDate = (v) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);

  let epics = [];
  let issues = [];
  try {
    [epics, issues] = await Promise.all([adapter.listEpics(), adapter.list()]);
  } catch {
    return;
  }

  for (const epic of epics) {
    if (!epic.id) continue;
    addNode({
      id: `epic:${epic.id}`,
      type: 'epic',
      title: epic.title || epic.id,
      status: epic.status || null,
      created: isoDate(epic.created),
      updated: isoDate(epic.updated),
      metadata: {
        'plan-ref': epic.planRef || null,
        milestone: epic.milestone || null,
      },
    });

    if (epic.planRef) {
      const planMatch = epic.planRef.match(planRefRegex);
      if (planMatch) {
        addEdge(`epic:${epic.id}`, `plan:${planMatch[1]}/${planMatch[2]}`, 'epic-planned-by');
      }
    }
  }

  for (const issue of issues) {
    if (!issue.id) continue;
    const deps = Array.isArray(issue.dependencies) ? issue.dependencies : [];
    addNode({
      id: `issue:${issue.id}`,
      type: 'issue',
      title: issue.title || issue.id,
      status: issue.status || null,
      created: isoDate(issue.created),
      updated: isoDate(issue.updated),
      metadata: {
        priority: issue.priority ?? null,
        type: issue.type || null,
        epic: issue.epicId || null,
        'plan-ref': issue.planRef || null,
        'plan-task': issue.planTask ?? null,
        deps,
      },
    });

    if (issue.epicId) addEdge(`issue:${issue.id}`, `epic:${issue.epicId}`, 'issue-belongs-to-epic');

    if (issue.planRef) {
      const planMatch = issue.planRef.match(planRefRegex);
      if (planMatch) {
        addEdge(`issue:${issue.id}`, `plan:${planMatch[1]}/${planMatch[2]}`, 'issue-planned-by');
        if (issue.planTask != null) {
          addEdge(`issue:${issue.id}`, `plan:${planMatch[1]}/${planMatch[2]}`, 'issue-implements-task');
        }
      }
    }

    for (const dep of deps) {
      if (dep) addEdge(`issue:${issue.id}`, `issue:${dep}`, 'issue-blocked-by');
    }
  }
}

// ---------------------------------------------------------------------------
// 5. extractADRs
// ---------------------------------------------------------------------------

function extractADRs() {
  const adrDir = join(ctxDir, 'adrs');
  if (!existsSync(adrDir)) return;

  for (const file of readdirSync(adrDir)) {
    if (!file.endsWith('.md') || file.startsWith('.')) continue;
    const filePath = join(adrDir, file);
    const content = readFileSafe(filePath);
    if (!content) continue;

    const { meta, body } = parseFrontmatter(content);
    const title = titleFromMarkdown(body) || file.replace('.md', '');
    const slug = file.replace('.md', '');

    // Extract status from markdown body (ADRs use ## Status section, not frontmatter)
    const statusMatch = body.match(/## Status\s*\n\s*(\w+)/);

    addNode({
      id: `adr:${slug}`,
      type: 'adr',
      title,
      status: meta.status || (statusMatch ? statusMatch[1].toLowerCase() : null),
      created: meta.date || fileModTime(filePath),
      updated: fileModTime(filePath),
      metadata: {
        slug,
        contentPreview: contentPreview(body),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// 6. extractSessions
// ---------------------------------------------------------------------------

function extractSessions() {
  const sessionDir = join(ctxDir, 'sessions');
  if (!existsSync(sessionDir)) return;

  for (const file of readdirSync(sessionDir)) {
    if (!file.endsWith('.md') || file.startsWith('.')) continue;
    const filePath = join(sessionDir, file);
    const content = readFileSafe(filePath);
    if (!content) continue;

    const { meta, body } = parseFrontmatter(content);
    const slug = file.replace('.md', '');

    // Extract intent summary from body
    const intentMatch = body.match(/## Intent\s*\n\s*(.+)/);
    const title = intentMatch ? intentMatch[1].trim() : slug;

    addNode({
      id: `session:${slug}`,
      type: 'session',
      title,
      status: null,
      created: meta.date || slug.slice(0, 10),
      updated: meta.date || slug.slice(0, 10),
      metadata: {
        type: meta.type || null,
        mode: meta.mode || null,
        agent: meta.agent || null,
        'specs-touched': meta['specs-touched'] || [],
        commits: meta.commits || [],
      },
    });

    // session-touches-spec
    const specsTouched = meta['specs-touched'];
    if (Array.isArray(specsTouched)) {
      for (const specRef of specsTouched) {
        if (!specRef) continue;
        // Try to match spec path to ID
        const specMatch = specRef.match?.(/features\/([^/]+)\/(.+)\.md/);
        if (specMatch) {
          addEdge(`session:${slug}`, `spec:${specMatch[1]}/${specMatch[2]}`, 'session-touches-spec');
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 7. extractCodeFiles
// ---------------------------------------------------------------------------

function extractCodeFiles(modules) {
  // Extract code-file nodes from source-manifest references in specs
  // We collect all spec-implemented-by edges and create nodes for the targets
  for (const edge of edges) {
    if (edge.type === 'spec-implemented-by') {
      const filePath = edge.target.replace('code-file:', '');
      addNode({
        id: edge.target,
        type: 'code-file',
        title: basename(filePath),
        status: null,
        created: null,
        updated: fileModTime(join(root, filePath)),
        metadata: {
          path: filePath,
        },
      });

      // code-belongs-to-module
      for (const mod of modules) {
        if (mod.paths.some(p => filePath.startsWith(p))) {
          addEdge(edge.target, `module:${mod.slug}`, 'code-belongs-to-module');
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 8. extractHeuristics
// ---------------------------------------------------------------------------

function extractHeuristics() {
  const heurDir = join(ctxDir, 'memory', 'heuristics');
  if (!existsSync(heurDir)) return;

  for (const file of readdirSync(heurDir)) {
    if (!file.endsWith('.md') || file.startsWith('.') || file === '_format.md') continue;
    const filePath = join(heurDir, file);
    const content = readFileSafe(filePath);
    if (!content) continue;

    const slug = file.replace('.md', '');
    const { meta, body } = parseFrontmatter(content);
    const title = titleFromMarkdown(body) || `Heuristics: ${slug}`;
    const isGlobal = slug === '_global';

    addNode({
      id: `heuristic:${slug}`,
      type: 'heuristic',
      title,
      status: null,
      created: fileModTime(filePath),
      updated: fileModTime(filePath),
      metadata: {
        scope: isGlobal ? 'global' : slug,
      },
    });

    // heuristic-scoped-to module
    if (!isGlobal) {
      addEdge(`heuristic:${slug}`, `module:${slug}`, 'heuristic-scoped-to');
    }

    // Scan for evidence references (spec paths in body)
    for (const m of body.matchAll(/specs\/features\/([^/]+)\/([^\s,)]+\.md)/g)) {
      const specSlug = m[2].replace('.md', '');
      if (!specSlug.includes('.review') && !specSlug.includes('.plan')) {
        addEdge(`heuristic:${slug}`, `spec:${m[1]}/${specSlug}`, 'heuristic-evidenced-by');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 9. extractProviders
// ---------------------------------------------------------------------------

function extractProviders() {
  const providerDir = join(root, 'providers');
  if (!existsSync(providerDir)) return;

  for (const dir of readdirSync(providerDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const adapterPath = join(providerDir, dir.name, 'adapter.mjs');
    if (!existsSync(adapterPath)) continue;

    const slug = dir.name;
    addNode({
      id: `provider:${slug}`,
      type: 'provider',
      title: `Provider: ${slug}`,
      status: null,
      created: fileModTime(adapterPath),
      updated: fileModTime(adapterPath),
      metadata: {
        slug,
        platform: slug,
      },
    });

    // provider-adapts: check imports in the adapter
    const content = readFileSafe(adapterPath);
    if (content) {
      for (const m of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const importPath = m[1];
        // Check if it imports from a module path
        if (importPath.includes('lib/') || importPath.includes('skills/')) {
          // Don't create edges to non-existent module nodes
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 10. mergeRepomap
// ---------------------------------------------------------------------------

function mergeRepomap() {
  const graphPath = join(ctxDir, 'repomap', 'dependency-graph.json');
  if (!existsSync(graphPath)) return;

  try {
    const graph = JSON.parse(readFileSafe(graphPath));
    if (graph && graph.edges) {
      for (const edge of graph.edges) {
        const srcId = `code-file:${edge.source}`;
        const tgtId = `code-file:${edge.target}`;
        addNode({
          id: srcId, type: 'code-file', title: basename(edge.source),
          status: null, created: null, updated: null,
          metadata: { path: edge.source },
        });
        addNode({
          id: tgtId, type: 'code-file', title: basename(edge.target),
          status: null, created: null, updated: null,
          metadata: { path: edge.target },
        });
        addEdge(srcId, tgtId, 'code-imports-code');
      }
    }
  } catch { /* repomap not available or malformed */ }
}

// ---------------------------------------------------------------------------
// 11. extractCommits
// ---------------------------------------------------------------------------

function extractCommits() {
  try {
    // Get commits with stats and trailers
    const log = execSync(
      'git log --format="---COMMIT---%n%H%n%h%n%s%n%aI%n%an%n%b%n---FILES---" --stat --max-count=500',
      { cwd: root, encoding: 'utf8', timeout: 15000 }
    );

    const entries = log.split('---COMMIT---').filter(e => e.trim());

    for (const entry of entries) {
      const parts = entry.split('---FILES---');
      const header = parts[0].trim().split('\n');
      if (header.length < 5) continue;

      const hash = header[0];
      const shortHash = header[1];
      const subject = header[2];
      const date = header[3].slice(0, 10); // YYYY-MM-DD
      const author = header[4];
      const body = header.slice(5).join('\n');

      // Stat lines are after ---FILES---
      const statBlock = parts[1] || '';
      const changedFiles = [];
      for (const m of statBlock.matchAll(/^\s+([^\s|]+)\s+\|/gm)) {
        changedFiles.push(m[1]);
      }

      // Create commit node
      const commitId = `commit:${shortHash}`;
      addNode({
        id: commitId,
        type: 'commit',
        title: `${shortHash}: ${subject}`,
        status: null,
        created: date,
        updated: date,
        metadata: {
          hash,
          shortHash,
          subject,
          author,
          filesChanged: changedFiles.length,
        },
      });

      // session-creates-commit: link sessions that reference this commit
      for (const node of nodes) {
        if (node.type === 'session' && node.metadata.commits?.includes(hash)) {
          addEdge(node.id, commitId, 'session-creates-commit');
        }
      }

      // commit-touches-file: link to code files
      for (const file of changedFiles) {
        const codeId = `code-file:${file}`;
        addNode({
          id: codeId, type: 'code-file', title: basename(file),
          status: null, created: null, updated: date,
          metadata: { path: file },
        });
        addEdge(commitId, codeId, 'commit-touches-file');
      }

      // commit-references-spec: from Spec: trailers
      for (const m of body.matchAll(/^Spec:\s*(.+)/gm)) {
        const specRef = m[1].trim();
        const specMatch = specRef.match(/features\/([^/]+)\/(.+?)(?:\.md)?$/);
        if (specMatch) {
          addEdge(commitId, `spec:${specMatch[1]}/${specMatch[2]}`, 'commit-references-spec');
        }
      }
    }
  } catch { /* git not available */ }
}

// ---------------------------------------------------------------------------
// 12. deriveImplicitEdges
// ---------------------------------------------------------------------------

function deriveImplicitEdges() {
  // cross-cutting affects modules
  const ccDir = join(ctxDir, 'specs', 'cross-cutting');
  if (existsSync(ccDir)) {
    for (const file of readdirSync(ccDir)) {
      if (!file.endsWith('.md') || file.startsWith('.') || file.endsWith('.review.md') || file.endsWith('.plan.md')) continue;
      const filePath = join(ccDir, file);
      const content = readFileSafe(filePath);
      if (!content) continue;

      const { meta, body } = parseFrontmatter(content);
      const slug = file.replace('.md', '');
      const title = titleFromMarkdown(body) || slug;

      addNode({
        id: `cross-cutting:${slug}`,
        type: 'cross-cutting',
        title,
        status: meta.status || null,
        created: meta.created || fileModTime(filePath),
        updated: meta.updated || fileModTime(filePath),
        metadata: {
          affects: meta.affects || [],
          risk_level: meta.risk_level || null,
        },
      });

      if (Array.isArray(meta.affects)) {
        for (const mod of meta.affects) {
          addEdge(`cross-cutting:${slug}`, `module:${mod}`, 'cross-cutting-affects');
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 13. computeAnalytics
// ---------------------------------------------------------------------------

function computeAnalytics() {
  const analytics = {};

  // Orphan specs: specs with no plan, no review, and no source-manifest edges
  const specIds = nodes.filter(n => n.type === 'spec').map(n => n.id);
  const connectedSpecs = new Set(edges.filter(e =>
    e.type === 'spec-has-review' || e.type === 'spec-has-plan' || e.type === 'spec-implemented-by'
  ).map(e => e.source));
  analytics.orphanSpecs = specIds.filter(id => !connectedSpecs.has(id));

  // Staleness: nodes not updated in 30+ days
  const now = new Date();
  analytics.staleNodes = nodes
    .filter(n => n.updated && (now - new Date(n.updated)) / 86400000 > 30)
    .map(n => n.id);

  // Coverage: specs with source-manifest / total specs
  const implementedSpecs = new Set(edges.filter(e => e.type === 'spec-implemented-by').map(e => e.source));
  analytics.coverageRatio = specIds.length > 0
    ? (implementedSpecs.size / specIds.length).toFixed(2)
    : '0.00';

  // Epic completion
  const epicIds = nodes.filter(n => n.type === 'epic').map(n => n.id);
  analytics.epicCompletion = {};
  for (const epicId of epicIds) {
    const epicIssues = nodes.filter(n =>
      n.type === 'issue' && n.metadata.epic === epicId.replace('epic:', '')
    );
    const closed = epicIssues.filter(n => n.status === 'closed').length;
    analytics.epicCompletion[epicId] = {
      closed,
      total: epicIssues.length,
      ratio: epicIssues.length > 0 ? (closed / epicIssues.length).toFixed(2) : '0.00',
    };
  }

  return analytics;
}

// ---------------------------------------------------------------------------
// 14. writeGraphData
// ---------------------------------------------------------------------------

function writeGraphData(projectName, analytics) {
  let commitHash = 'unknown';
  try {
    commitHash = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch { /* not in git */ }

  // Filter out edges referencing non-existent nodes
  const validEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  const droppedEdges = edges.length - validEdges.length;
  if (droppedEdges > 0) {
    console.log(`Dropped ${droppedEdges} edges with missing source/target nodes`);
  }

  const data = {
    version: '1.0.0',
    metadata: {
      projectName,
      generated: new Date().toISOString(),
      commit: commitHash,
      nodeCount: nodes.length,
      edgeCount: validEdges.length,
    },
    typeRegistry: {
      nodeTypes: nodeTypeRegistry,
      edgeTypes: edgeTypeRegistry,
    },
    nodes,
    edges: validEdges,
    analytics,
  };

  const outPath = join(root, 'viz', 'dist', 'graph-data.json');
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`Wrote ${outPath} (${nodes.length} nodes, ${edges.length} edges)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const startTime = Date.now();

const { projectName, modules } = readManifest();

// Create module nodes
for (const mod of modules) {
  addNode({
    id: `module:${mod.slug}`,
    type: 'module',
    title: mod.name,
    status: null,
    created: null,
    updated: null,
    metadata: { slug: mod.slug, paths: mod.paths },
  });
}

extractCharters(modules);
extractSpecs();
await extractTasks();
extractADRs();
extractSessions();
extractCodeFiles(modules);
extractHeuristics();
extractProviders();
mergeRepomap();
extractCommits();
deriveImplicitEdges();
const analytics = computeAnalytics();
writeGraphData(projectName, analytics);

const elapsed = Date.now() - startTime;
console.log(`Extraction completed in ${elapsed}ms`);
