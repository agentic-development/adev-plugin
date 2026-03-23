# Feature Charter: adev-document

<!-- Feature Charter for the adev-document skill.
     This defines WHAT the module does and its boundaries, not HOW it is built.
     Live Specs within this charter define specific behavioral contracts. -->

## Business Intent

Create `/adev-document` skill that generates human-readable developer documentation in `docs/` by consuming tree-sitter repomap output. Shifts orientation from `.context-index/orientation/` (agent-focused) to `docs/` (human-focused), enabling developers to browse architecture docs on GitHub.

## Scope and Boundaries

### In Scope

- Generate `docs/architecture.md` from repomap data (module map, dependency flow, entry points, ADR links)
- Generate `docs/modules/<slug>.md` for each module in manifest (purpose, key exports, dependencies, related specs)
- Generate `docs/GENERATED.md` manifest tracking generated files and last commit
- Read inputs: `dependency-graph.json`, `symbol-ranks.json`, `repo-map.md`, `constitution.md`, `platform-context.yaml`, `manifest.yaml`, charters, ADRs
- Support arguments: `--module <slug>`, `--check`, `--force`
- Error with clear message if repomap data missing

### Out of Scope

- Migration from `.context-index/orientation/` (deferred to Phase 2)
- Incremental update mode with diff presentation (Phase 2)
- Updates to `/adev-hygiene`, `/adev-init`, constitution template (Phase 3)
- API reference generation (JSDoc/TSDoc)
- User-facing product documentation
- Rendering/hosting (static site generators)

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| adev-repomap | internal module | Produces dependency-graph.json and symbol-ranks.json that adev-document consumes |
| constitution | shared context | Provides Identity and Context Routing sections |
| platform-context | shared context | Provides tech stack information |
| manifest | shared context | Provides module list for generating module docs |
| charters | shared context | Provides Business Intent for Module Purpose sections |
| ADRs | shared context | Provides architecture decisions for ADR Links |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| GeneratedDoc | A generated documentation file | path, lastCommit, generatedSections[] |
| ModuleDoc | Per-module documentation | moduleSlug, purpose, exports[], deps, relatedSpecs[] |
| ArchitectureDoc | Project-level overview | moduleMap[], dependencyFlow, entryPoints[], adrLinks[] |
| GeneratedManifest | Tracking file for generated docs | files[], lastRun |

### Relationships

- GeneratedManifest contains many GeneratedDoc
- ArchitectureDoc references ModuleDoc entries
- ModuleDoc references charters and ADRs

### Invariants

- Every entry in GENERATED.md must correspond to an actual file in docs/
- Architecture.md must include all modules from manifest.yaml
- Module docs must not overwrite content below `<!-- adev:human -->` marker

## Capability Map

| Capability | Description | Priority | Phase |
|------------|-------------|----------|-------|
| Generate architecture.md | Create project-level overview with module map, dependency flow, entry points | must-have | v1 |
| Generate module docs | Create docs/modules/<slug>.md for each module in manifest | must-have | v1 |
| GENERATED.md manifest | Track generated files, last commit, sections | must-have | v1 |
| Argument: --module | Generate/update single module doc | must-have | v1 |
| Argument: --check | Dry-run: show what would change without writing | must-have | v1 |
| Argument: --force | Regenerate all sections ignoring diff | should-have | v1 |
| Error on missing repomap | Clear error if dependency-graph.json or symbol-ranks.json missing | must-have | v1 |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| /adev-document | skill | Generate or update all documentation |
| /adev-document --module \<slug\> | skill argument | Generate single module doc |
| /adev-document --check | skill argument | Dry-run mode, show diff without writing |
| /adev-document --force | skill argument | Regenerate all sections ignoring diff |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| dependency-graph.json | adev-repomap | Dependency graph for module map and dependency flow |
| symbol-ranks.json | adev-repomap | Symbol importance rankings for key exports |
| repo-map.md | adev-repomap | Symbol index for export details |
| constitution.md | shared context | Identity and Context Routing sections |
| platform-context.yaml | shared context | Tech stack (framework, language, runtime) |
| manifest.yaml | shared context | Module list and structure |
| charter.md files | design module | Business Intent for Module Purpose |
| ADR files | shared context | Architecture decisions for ADR Links |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Performance | Generates docs/architecture.md in <2s for typical projects |
| Reliability | Never overwrites human content below `<!-- adev:human -->` marker |
| Observability | Reports generated file count, module count, any errors |
| Code-grounded | All claims trace to repomap data; no hallucinated exports or deps |
