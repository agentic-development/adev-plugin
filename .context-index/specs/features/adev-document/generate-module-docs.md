# Live Spec: Generate module docs

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
- `manifest.yaml` exists with module definitions
- `docs/` directory exists

### Behaviors

1. **When** `/adev-document` is invoked **then** it generates a `docs/modules/<slug>.md` file for each module listed in `manifest.yaml`.

2. **When** generating a module doc **then** include the Purpose section from the module's charter Business Intent, or inferred from code if no charter exists.

3. **When** generating Key Exports **then** filter `symbol-ranks.json` to symbols within the module's paths, including: symbol name, kind (class/function/interface), file location, importance score, description (from spec or inferred).

4. **When** generating Dependencies **then** extract from `dependency-graph.json`: modules this module imports from (outbound), modules that import from this module (inbound).

5. **When** generating Related Specs **then** scan `.context-index/specs/features/<module>/` for charter.md and any .md files, generating links to each.

6. **When** `--module <slug>` is provided **then** generate or update only the specified module doc, skip all others.

7. **When** a module doc already exists **then** preserve content below `<!-- adev:human -->` marker, only regenerate content above `<!-- adev:generated -->`.

8. **When** `--check` flag is provided **then** output the generated content as a diff without writing to disk.

### Postconditions

- `docs/modules/` directory exists
- Each module in manifest.yaml has a corresponding `docs/modules/<slug>.md`
- Module docs contain: Purpose, Key Exports table, Dependencies, Related Specs
- Human content below `<!-- adev:human -->` preserved

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Module slug not in manifest | Output warning: "Module '<slug>' not found in manifest. Skipping." | 0 |
| Symbol data missing for module | Generate doc with empty Key Exports section | 0 |
| Module charter missing | Use inferred purpose from code | 0 |
| docs/modules/ cannot be created | Output error with path and reason | 1 |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Applies because adev-document is a skill that generates markdown documentation.
- **Principle:** "Minimize external dependencies" — Applies because the skill reads JSON/markdown files using Node.js built-ins only.
- **Principle:** "Pure ESM" — Applies because any companion code must be .mjs format.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Read manifest modules | Load module list from manifest.yaml | small |
| Create docs/modules/ | Ensure directory exists | small |
| Generate per-module doc | For each module, build Purpose, Exports, Deps, Specs | medium |
| Read charter for purpose | Load charter Business Intent for each module | small |
| Extract key exports | Filter symbol-ranks.json to module paths | medium |
| Extract dependencies | Parse dependency-graph.json edges | medium |
| Link related specs | Scan module spec directory | small |
| Preserve human content | Split on marker, preserve adev:human section | small |
| Handle --module flag | Filter to single module | small |

## Acceptance Criteria

- [ ] Generates docs/modules/<slug>.md for each module in manifest.yaml
- [ ] Purpose section populated from charter Business Intent
- [ ] Key Exports table includes symbols from symbol-ranks.json filtered to module
- [ ] Dependencies section shows inbound and outbound from dependency-graph.json
- [ ] Related Specs links to charter and other specs in the module directory
- [ ] --module <slug> generates only that module
- [ ] Preserves human content when file already exists
- [ ] --check flag shows diff without writing
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
