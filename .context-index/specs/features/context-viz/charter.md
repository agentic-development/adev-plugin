---
status: draft
revision: 1
updated: 2026-04-13
---

# Feature Charter: context-viz

<!-- Feature Charter for the context-viz module.
     This defines WHAT the module does and its boundaries, not HOW it is built. -->

## Business Intent

The context-viz module provides an interactive web-based visualization of the `.context-index/` knowledge graph. It answers the questions developers and stakeholders ask about a project built with adev: **what** was built, **why** it was built, **when**, **by whom**, and **what relates to what**. The visualization makes the invisible structure of spec-driven development visible and navigable.

## Scope and Boundaries

### In Scope

- Static web app that visualizes the full context index as an interactive graph
- Node types: modules, charters, specs, reviews, plans, epics, issues, ADRs, sessions, code files, heuristics, providers
- Edge types: all cross-references between the above entities (ownership, dependency, traceability, temporal)
- Build-time extraction: Node.js script that reads `.context-index/` and emits a `graph-data.json`
- Interactive exploration: zoom, pan, click-to-expand, filter by type/status/time
- Detail panel: click a node to see its metadata, relationships, and content summary
- Timeline view: show when artifacts were created/updated, filter by time range
- Extensible data model: new node and edge types can be added without rewriting the app
- Graph analytics: highlight orphan nodes, dependency chains, staleness, coverage gaps

### Out of Scope

- Real-time editing of specs/issues from the visualization (read-only)
- Server-side processing or databases (static files only)
- Authentication or multi-user collaboration
- Integration with external issue trackers (GitHub Issues, Jira)
- Automated deployment or hosting (user runs locally or serves statically)

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| `.context-index/` | internal data | All markdown/YAML files comprising the knowledge graph |
| `lib/issues/file-adapter.mjs` | internal module | Issue/epic data model and storage format |
| `lib/source-manifest.mjs` | internal module | Source manifest schema for spec-to-code traceability |
| `lib/execution-state.mjs` | internal module | Current work-in-progress state |
| `lib/heuristics.mjs` | internal module | Heuristic store read/write for per-module lessons learned |
| `lib/provider/` | internal module | Provider adapter registry (claude-code, opencode, codex) |
| `lib/repomap/` | internal module | AST-based symbol index and dependency graph |
| Cytoscape.js | external library | Graph rendering and layout engine |
| D3.js (d3-scale, d3-axis, d3-brush) | external library | Timeline axis and time-range filtering |
| marked | external library | Markdown rendering in detail panels (browser) |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| GraphNode | Any artifact in the context index | id, type, title, status, created, updated, metadata{} |
| GraphEdge | A relationship between two nodes | source, target, type, label, metadata{} |
| NodeType | Registry of known node types | slug, label, color, shape, icon |
| EdgeType | Registry of known edge types | slug, label, color, style (solid/dashed) |
| TimelineEntry | A node plotted on a time axis | nodeId, created, updated, type |
| FilterState | Current active filters | nodeTypes[], edgeTypes[], timeRange, statusFilter, searchQuery |
| GraphData | The complete extracted graph | nodes[], edges[], metadata{generated, commit, projectName} |

### Relationships

- A GraphNode **has many** outgoing GraphEdges (source)
- A GraphNode **has many** incoming GraphEdges (target)
- Each GraphNode **belongs to** exactly one NodeType
- Each GraphEdge **belongs to** exactly one EdgeType
- A GraphNode **maps to** zero or one TimelineEntries (if it has timestamps)
- FilterState **controls** which nodes/edges are visible

### Invariants

- Every edge must reference existing source and target nodes
- Node IDs are unique across the entire graph
- The graph data JSON schema is self-describing (includes type registries)
- The build script must be idempotent (same input always produces same output)
- The browser app must work with zero network requests after initial load (fully offline)

## Capability Map

| Capability | Description | Priority | Phase |
|-----------|-------------|----------|-------|
| Graph extraction | Node.js build script reads `.context-index/`, emits `graph-data.json` | must-have | v1 |
| Interactive graph view | Force-directed + hierarchical layout with zoom/pan/click | must-have | v1 |
| Node type filtering | Toggle visibility of node types (specs, issues, code, etc.) | must-have | v1 |
| Detail panel | Click a node to see metadata, relationships, content preview | must-have | v1 |
| Timeline view | Time axis showing when artifacts were created/updated | should-have | v1 |
| Time-range filter | Slider to filter graph by date range | should-have | v1 |
| Search | Full-text search across node titles and metadata | should-have | v1 |
| Graph analytics | Orphan detection, dependency chain length, staleness heatmap | should-have | v2 |
| Status overlay | Color-code nodes by lifecycle status (draft, validated, etc.) | should-have | v1 |
| Dependency path highlighting | Click a node to highlight its full dependency chain | nice-to-have | v2 |
| Export graph as SVG/PNG | Static export for documentation | nice-to-have | v2 |
| Extensible type registry | Add new node/edge types via JSON config without code changes | must-have | v1 |
| Diff view | Compare graph state between two commits/timestamps | nice-to-have | v3 |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `viz/build.mjs` | CLI script | `node viz/build.mjs [--root <path>]` — extracts graph, writes `graph-data.json` |
| `graph-data.json` | JSON file | Complete graph data with nodes, edges, type registries, metadata |
| `viz/index.html` | Static web page | Entry point — loads JSON, renders interactive visualization |

### Consumed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `.context-index/manifest.yaml` | YAML file | Project metadata, module registry |
| `.context-index/tasks/tasks.md` | Markdown file | Epic and issue tables |
| `.context-index/specs/**/*.md` | Markdown files | Specs, reviews, plans with YAML frontmatter |
| `.context-index/adrs/*.md` | Markdown files | Architecture decision records |
| `.context-index/sessions/*.md` | Markdown files | Session summaries with YAML frontmatter |
| `git log` | CLI command | Commit history for spec-to-commit traceability |

## Quality Attributes

| Attribute | Target |
|-----------|--------|
| Performance | Render 500 nodes + 1000 edges at 30fps with smooth interaction |
| Bundle size | Browser JS < 350KB minified (Cytoscape + D3 + marked) |
| Build time | Graph extraction completes in < 5 seconds for 500-file context index |
| Offline | Fully functional after initial load — no network requests |
| Extensibility | Adding a new node type requires only a JSON config entry, no code changes |
| Accessibility | Keyboard navigation for graph nodes, ARIA labels on controls |
