# Live Spec: Context Graph Extraction & Visualization

<!-- Live Spec within the context-viz charter.
     This defines the complete data model, gap analysis, and technical design
     for extracting and visualizing the context index as an interactive graph.
     Parent Charter: .context-index/specs/features/context-viz/charter.md -->

---
charter: context-viz
status: draft
risk_level: medium
milestone: v1
created: 2026-04-11
updated: 2026-04-11
---

## 1. Graph Data Model

### 1.1 Node Types

The context index contains **11 distinct entity types** that become graph nodes:

| Node Type | Source Location | Key Attributes | Color | Shape |
|-----------|----------------|----------------|-------|-------|
| `module` | `manifest.yaml → modules[]` | slug, name, paths[] | `#6366f1` (indigo) | hexagon |
| `charter` | `specs/features/*/charter.md` | module, status, revision, created, updated | `#8b5cf6` (violet) | diamond |
| `spec` | `specs/features/*/*.md` (non-charter, non-plan, non-review) | charter, status, risk_level, milestone, revision, source-manifest | `#3b82f6` (blue) | round-rectangle |
| `review` | `specs/features/*/*.review.md` | verdict, last-reviewed-revision, file-sha, date | `#f59e0b` (amber) | ellipse |
| `plan` | `specs/features/*/*.plan.md` | spec-ref, review-verdict, tasks[] | `#10b981` (emerald) | round-rectangle |
| `epic` | `tasks/tasks.md → Epics table` | title, status, plan-ref, milestone | `#ec4899` (pink) | diamond |
| `issue` | `tasks/tasks.md → Issues table` | title, status, priority, type, epic, deps[], plan-ref, plan-task | `#f97316` (orange) | ellipse |
| `adr` | `adrs/*.md` | title, status, date, decision-summary | `#14b8a6` (teal) | octagon |
| `session` | `sessions/*.md` | date, type, mode, agent, specs-touched[], commits[] | `#64748b` (slate) | round-rectangle |
| `code-file` | Derived from source-manifest + repomap | path, module, exports[], imports[] | `#22c55e` (green) | rectangle |
| `cross-cutting` | `specs/cross-cutting/*.md` | status, affects[], risk_level | `#a855f7` (purple) | star |

### 1.2 Edge Types

The context index captures **17 relationship types** between entities:

| Edge Type | Source → Target | How Extracted | Style |
|-----------|-----------------|---------------|-------|
| `module-owns-charter` | module → charter | Directory convention: `specs/features/<module>/charter.md` | solid, thick |
| `charter-scopes-spec` | charter → spec | Spec frontmatter `charter:` field | solid |
| `spec-has-review` | spec → review | Adjacent file: `<spec>.review.md` | solid |
| `spec-has-plan` | spec → plan | Adjacent file: `<spec>.plan.md` | solid |
| `plan-references-spec` | plan → spec | Plan markdown `Spec:` line | dashed (redundant with above, used for validation) |
| `plan-references-review` | plan → review | Plan markdown `Review:` line | dashed |
| `spec-implemented-by` | spec → code-file | Spec frontmatter `source-manifest.files[]` | solid, green |
| `cross-cutting-affects` | cross-cutting → module | Cross-cutting frontmatter `affects:` array | dashed, wide |
| `epic-planned-by` | epic → plan | Epic row `Plan-Ref` column | solid |
| `issue-belongs-to-epic` | issue → epic | Issue row `Epic` column | solid |
| `issue-planned-by` | issue → plan | Issue row `Plan-Ref` column | dashed |
| `issue-implements-task` | issue → plan | Issue row `Plan-Task` column (specific task within plan) | solid |
| `issue-blocked-by` | issue → issue | Issue row `Deps` column | solid, red |
| `session-touches-spec` | session → spec | Session frontmatter `specs-touched:` | dashed |
| `session-creates-commit` | session → code-file | Session frontmatter `commits:` + `git show --stat` | dashed |
| `code-imports-code` | code-file → code-file | Repomap `dependency-graph.json` edges | solid, thin |
| `code-belongs-to-module` | code-file → module | Manifest module paths + file path matching | solid, thin |

### 1.3 Graph JSON Schema

The build script emits a single `graph-data.json` with this structure:

```json
{
  "version": "1.0.0",
  "metadata": {
    "projectName": "adev-plugin",
    "generated": "2026-04-11T10:00:00Z",
    "commit": "abc1234",
    "extractionDuration": 1234
  },
  "typeRegistry": {
    "nodeTypes": {
      "module": { "label": "Module", "color": "#6366f1", "shape": "hexagon" },
      "spec":   { "label": "Spec",   "color": "#3b82f6", "shape": "round-rectangle" }
    },
    "edgeTypes": {
      "charter-scopes-spec":  { "label": "scopes",     "color": "#888", "style": "solid" },
      "issue-blocked-by":     { "label": "blocked by",  "color": "#ef4444", "style": "solid" }
    }
  },
  "nodes": [
    {
      "id": "module:cli",
      "type": "module",
      "title": "CLI",
      "status": null,
      "created": null,
      "updated": null,
      "metadata": { "slug": "cli", "paths": ["cli/"] }
    },
    {
      "id": "spec:spec-lifecycle/source-manifest",
      "type": "spec",
      "title": "Source Manifest",
      "status": "validated",
      "created": "2026-03-27",
      "updated": "2026-03-28",
      "metadata": {
        "charter": "spec-lifecycle",
        "risk_level": "medium",
        "milestone": "v1",
        "revision": 1,
        "sourceManifest": { "sha": "789c1a0", "files": ["lib/source-manifest.mjs"] }
      }
    }
  ],
  "edges": [
    {
      "source": "charter:spec-lifecycle",
      "target": "spec:spec-lifecycle/source-manifest",
      "type": "charter-scopes-spec"
    }
  ]
}
```

The `typeRegistry` makes the schema self-describing and extensible. Adding a new node or edge type requires only a registry entry — the renderer reads types dynamically.

---

## 2. Gap Analysis: Missing Metadata

After mapping every entity and relationship in the current `.context-index/`, the following gaps prevent a complete graph:

### 2.1 Critical Gaps (Must Fix for v1)

| Gap | Current State | Required For | Proposed Fix |
|-----|--------------|--------------|-------------|
| **No `author` on specs** | Specs have no creator field | "Who built this?" query | Add optional `author:` to spec/plan frontmatter |
| **No `assignee` on issues** | Issues have no assignment | "Who is working on this?" | Add `Assignee` column to tasks.md issue table |
| **Commit-to-spec reverse index** | Commit trailers (`Spec:`, `Plan-task:`) exist in git log but aren't indexed | "What commits implemented this spec?" | Build script extracts commit trailers via `git log --format` |
| **ADR cross-references** | ADRs mention specs in prose but no structured link | "Which ADRs govern this spec?" | Add optional `adrs:` array to spec frontmatter |
| **Session-to-issue link** | Sessions track `specs-touched` and `commits` but not issues | "Which sessions worked on this issue?" | Add optional `issues-touched:` to session frontmatter |
| **Charter status/revision frontmatter** | Some charters lack structured frontmatter | Consistent node metadata | Add YAML frontmatter to all charters: `status`, `revision`, `created`, `updated` |

### 2.2 Desirable Gaps (Should Fix for v1-v2)

| Gap | Current State | Required For | Proposed Fix |
|-----|--------------|--------------|-------------|
| **No validation-report link** | `*-validation.md` files exist but aren't referenced from spec | "Did this spec pass validation?" | Derive by convention (`<spec>-validation.md`), or add `validation-ref:` to spec |
| **Plan task details in JSON** | Plan tasks are markdown prose with ASCII DAG | "Show task dependency graph within a plan" | Build script parses plan markdown for `### Task N:` blocks and `Depends on:` lines |
| **No `tags` system** | No arbitrary categorization beyond type/status | Faceted search and filtering | Add optional `tags:` array to all frontmatter |
| **Cross-cutting → specific spec links** | Cross-cutting specs list `affects: [modules]` but not specific specs | "Which specs are constrained by this cross-cutting decision?" | Derive at build time: link to all specs in affected modules |
| **Execution state overlay** | `.execution-state.md` shows current active work | "What's being worked on right now?" | Build script reads execution state, marks active nodes |
| **Repomap integration** | `dependency-graph.json` exists separately | Code-level dependency view | Build script merges repomap graph into the main graph |

### 2.3 Future Gaps (v3+)

| Gap | Current State | Required For | Proposed Fix |
|-----|--------------|--------------|-------------|
| **Temporal graph snapshots** | Only current state is captured | "How did the graph look 2 weeks ago?" | Store graph-data.json per commit or derive from git history |
| **Token/cost tracking** | Sessions capture basic token usage | "How much did this feature cost to build?" | Aggregate session token usage per spec/epic |
| **Model routing data** | Which model tier handled which task isn't persisted | "Was this spec built by Opus or Sonnet?" | Add `model:` to session/execution state metadata |

---

## 3. Extraction Pipeline

### 3.1 Build Script Architecture

```
viz/build.mjs
├── 1. readManifest()          → project metadata, modules[]
├── 2. extractCharters()       → charter nodes
├── 3. extractSpecs()          → spec, review, plan nodes + edges
├── 4. extractTasks()          → epic, issue nodes + edges
├── 5. extractADRs()           → ADR nodes
├── 6. extractSessions()       → session nodes + edges
├── 7. extractCodeFiles()      → code-file nodes from source-manifests
├── 8. mergeRepomap()          → code→code import edges (if dependency-graph.json exists)
├── 9. extractCommitTrailers() → session→spec, commit→spec edges from git log
├── 10. deriveImplicitEdges()  → cross-cutting→spec, charter→spec (directory convention)
├── 11. computeAnalytics()     → orphan nodes, staleness, coverage metrics
└── 12. writeGraphData()       → graph-data.json
```

### 3.2 Dependencies (Build Script — Node.js only)

| Package | Purpose | Size | Justification |
|---------|---------|------|---------------|
| `js-yaml` | Parse YAML frontmatter in markdown files | ~50KB | Only YAML parser needed; already used by hooks |
| `node:fs`, `node:path`, `node:child_process` | File I/O, git commands | 0 | Node.js built-ins |

**No new runtime dependencies.** `js-yaml` is already used by the project's hooks. The build script runs in Node.js and produces a static JSON file.

### 3.3 Frontmatter Extraction (No Library)

```javascript
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { meta: {}, body: content };
  return { meta: yaml.load(match[1]), body: content.slice(match[0].length) };
}
```

### 3.4 Markdown Table Parsing (No Library)

```javascript
function parseMarkdownTable(text) {
  const lines = text.split('\n').filter(l => l.startsWith('|'));
  if (lines.length < 2) return [];
  const headers = lines[0].split('|').slice(1, -1).map(h => h.trim());
  return lines.slice(2).map(row => {
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] || '']));
  });
}
```

---

## 4. Technology Recommendations

### 4.1 Recommended Stack

| Concern | Tool | Bundle Size | Rationale |
|---------|------|-------------|-----------|
| **Graph rendering** | Cytoscape.js | ~110KB gzip | Purpose-built for knowledge graphs. CSS-like selectors for type filtering (`[type = "spec"]`). Built-in zoom/pan/click. Rich layout extensions. Framework-agnostic. Zero dependencies. |
| **Hierarchical layout** | cytoscape-dagre | ~15KB gzip | Dagre-based layout for module→charter→spec→plan hierarchy |
| **Force layout** | cytoscape-fcose | ~10KB gzip | Fast compound spring embedder for free-form exploration |
| **Timeline axis** | D3 (d3-scale + d3-axis + d3-brush) | ~8KB gzip | Best-in-class time scales. Range brush for time filtering. |
| **Markdown rendering** | marked | ~13KB gzip | Render spec/issue content in detail panel. ESM-compatible. |
| **YAML parsing (build)** | js-yaml | 0 (already a dep) | Parse frontmatter in build script |
| **Dev server** | `npx serve viz/dist` | 0 | No bundler needed for v1 |

**Total browser bundle: ~156KB gzip** — well under the 350KB target.

### 4.2 Alternatives Considered

| Library | Why Not Chosen |
|---------|---------------|
| **G6 (AntV)** | Built-in TimeBar is attractive, but 250KB bundle, Chinese-first docs, and Ant ecosystem lock-in conflict with minimal-deps principle |
| **React Flow** | Requires React as peer dependency. Framework lock-in inappropriate for a tool that should embed anywhere |
| **Sigma.js + Graphology** | WebGL-optimized for 10K+ nodes — overkill at 200-500 nodes. Limited node customization (no HTML). No built-in hierarchical layout |
| **vis-network** | Declining maintenance, enormous bundle (~150KB gzip), superseded by Cytoscape.js |
| **ELKjs** | 700KB for layout-only. Dagre at 15KB covers the hierarchical case adequately |
| **D3 alone** | Maximum flexibility but no graph abstractions — every interaction must be hand-built. Development cost too high for v1 |

### 4.3 File Structure

```
viz/
├── build.mjs              # Node.js extraction script
├── index.html             # Single-page app entry point
├── app.mjs                # Main application logic
├── graph-renderer.mjs     # Cytoscape.js setup, layouts, styles
├── timeline.mjs           # D3 time axis + range brush
├── detail-panel.mjs       # Node detail sidebar
├── filters.mjs            # Type/status/search filter controls
├── analytics.mjs          # Graph analytics (orphans, staleness)
├── style.css              # Layout and theme
├── lib/                   # Vendored libraries (Cytoscape, D3, marked)
│   ├── cytoscape.esm.min.mjs
│   ├── cytoscape-dagre.mjs
│   ├── cytoscape-fcose.mjs
│   ├── d3-scale.mjs
│   ├── d3-axis.mjs
│   ├── d3-brush.mjs
│   └── marked.esm.min.mjs
└── dist/                  # Build output (gitignored)
    └── graph-data.json
```

---

## 5. UI Design

### 5.1 Main Layout

```
┌─────────────────────────────────────────────────────────┐
│  [Filters: ◉Module ◉Charter ◉Spec ◉Issue ...]  [Search]│
├───────────────────────────────────┬─────────────────────┤
│                                   │                     │
│                                   │   Detail Panel      │
│       Interactive Graph           │   ─────────────     │
│       (Cytoscape.js)              │   Title: ...        │
│                                   │   Type: spec        │
│                                   │   Status: validated │
│                                   │   Created: ...      │
│                                   │   Related: [links]  │
│                                   │   Content: [md]     │
│                                   │                     │
├───────────────────────────────────┴─────────────────────┤
│  Timeline: ◀━━━━━━━━[======]━━━━━━━━━━━━━━━━━━━━━━▶    │
│            Mar 2026         Apr 2026         May 2026   │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Interactions

1. **Click node** → highlight connected edges + populate detail panel
2. **Double-click node** → expand/collapse neighbors
3. **Toggle filter chips** → show/hide node types
4. **Drag timeline brush** → filter graph to show only nodes within date range
5. **Search** → highlight matching nodes, fade others
6. **Right-click** → context menu: "Show all paths to...", "Highlight dependency chain"
7. **Layout switcher** → toggle between force-directed (exploration) and hierarchical (structure)

### 5.3 Status Color Overlay

When enabled, node border color reflects lifecycle status:

| Status | Border Color |
|--------|-------------|
| `draft` | `#94a3b8` (gray) |
| `review-pending` | `#f59e0b` (amber) |
| `review-passed` | `#3b82f6` (blue) |
| `implemented` | `#10b981` (green) |
| `validated` | `#22c55e` (bright green) |
| `open` (issue) | `#f97316` (orange) |
| `closed` (issue) | `#6b7280` (dim gray) |
| `blocked` | `#ef4444` (red) |

---

## 6. Graph Analytics (v2)

The build script can compute and include in `graph-data.json`:

| Metric | Description | Value |
|--------|-------------|-------|
| **Orphan specs** | Specs with no plan, no review, and no source-manifest | Highlights incomplete work |
| **Orphan code files** | Files in source roots not referenced by any spec's source-manifest | Code without traceability |
| **Dependency chain length** | Longest issue→issue dependency path | Risk indicator |
| **Staleness score** | Days since `updated` timestamp per node | Highlights abandoned work |
| **Coverage ratio** | Specs with source-manifest / total specs | Implementation progress |
| **Epic completion** | Closed issues / total issues per epic | Feature progress |

---

## Acceptance Criteria

- [ ] Build script (`viz/build.mjs`) reads `.context-index/` and produces valid `graph-data.json`
- [ ] All 11 node types are extracted with correct attributes
- [ ] All 17 edge types are extracted with correct source/target
- [ ] `graph-data.json` schema is self-describing via `typeRegistry`
- [ ] Adding a new node type requires only a registry entry (no renderer code changes)
- [ ] Interactive graph renders 500 nodes at 30fps with zoom/pan/click
- [ ] Node type filter toggles show/hide correctly
- [ ] Click a node to see detail panel with metadata, related nodes, and content preview
- [ ] Timeline brush filters the graph by date range
- [ ] Search highlights matching nodes
- [ ] Layout can switch between force-directed and hierarchical
- [ ] Total browser bundle < 350KB minified
- [ ] Works fully offline after initial page load
- [ ] No external runtime dependencies (build script uses only js-yaml + Node built-ins)
