# Live Spec: Generate architecture.md

<!-- Live Spec within the adev-document charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/adev-document/charter.md -->

---
charter: adev-document
status: draft
risk_level: low
milestone: v1
created: 2026-03-23
---

## Behavioral Contract

### Preconditions

- `dependency-graph.json` exists in `.context-index/hygiene/` (from adev-repomap)
- `symbol-ranks.json` exists in `.context-index/hygiene/` (from adev-repomap)
- `docs/` directory exists (create if not present)

### Behaviors

1. **When** `/adev-document` is invoked **then** it reads repomap data and context files, then generates `docs/architecture.md` with module map, dependency flow, entry points, and ADR links.

2. **When** generating the module map **then** include all modules from `manifest.yaml` with: module name, purpose (from charter Business Intent or inferred), key exports (from symbol-ranks.json), inbound dependency count, outbound dependency count.

3. **When** generating the dependency flow **then** describe how modules relate, identifying core modules (high inbound) vs leaf modules (high outbound), using data from `dependency-graph.json`.

4. **When** generating entry points **then** identify files with zero inbound edges from `symbol-ranks.json` and list them as entry points.

5. **When** generating ADR links **then** scan `.context-index/adrs/*.md` and include links to all ADRs in the architecture.md.

6. **When** `docs/architecture.md` already exists **then** preserve content below `<!-- adev:human -->` marker, only regenerate content above `<!-- adev:generated -->` marker.

7. **When** `--check` flag is provided **then** output the generated content as a diff without writing to disk, reporting what would change.

### Postconditions

- `docs/architecture.md` exists with valid structure
- Module map table lists all modules from manifest.yaml
- Dependency flow describes module relationships from graph data
- Entry points listed from zero-inbound files
- ADR links section includes all ADRs
- Human content below `<!-- adev:human -->` preserved

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| dependency-graph.json missing | Output error: "Run /adev-repomap first. /adev-document requires the dependency graph." | 1 |
| symbol-ranks.json missing | Output error: "Run /adev-repomap first. /adev-document requires the symbol index." | 1 |
| docs/ directory cannot be created | Output error with path and reason | 1 |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Applies because adev-document is a skill that generates markdown documentation.
- **Principle:** "Minimize external dependencies" — Applies because the skill reads JSON/markdown files using Node.js built-ins only.
- **Principle:** "Pure ESM" — Applies because any companion code must be .mjs format.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Pre-flight checks | Validate repomap data exists, create docs/ if needed | small |
| Read context files | Load constitution, platform-context, manifest, charters, ADRs | small |
| Generate module map | Build table from manifest + dependency-graph.json | medium |
| Generate dependency flow | Create narrative from graph edges | medium |
| Generate entry points | Identify zero-inbound files from symbol-ranks | small |
| Generate ADR links | Scan adrs/ directory and build links | small |
| Preserve human content | Split on marker, preserve adev:human section | small |
| Handle --check flag | Output diff without writing | small |

## Acceptance Criteria

- [ ] Runs without error when repomap data exists
- [ ] Creates docs/architecture.md with module map table
- [ ] Module map includes all modules from manifest.yaml
- [ ] Dependency flow section describes module relationships
- [ ] Entry points listed from zero-inbound files
- [ ] ADR links section includes all ADRs in .context-index/adrs/
- [ ] Preserves human content when file already exists
- [ ] --check flag shows diff without writing
- [ ] Errors clearly when repomap data missing
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
