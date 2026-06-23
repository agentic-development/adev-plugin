# Live Spec: Generate module docs

<!-- Live Spec within the adev:document charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/adev:document/charter.md -->

---
charter: adev:document
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 1
created: 2026-03-23
updated: 2026-05-04
source-manifest:
  sha: "3b57de6"
  files:
    - skills/document/SKILL.md
    - tests/skills/document.test.mjs
  computed-at: "2026-04-12T11:48:02.740Z"
drift_detected: true
---

## Behavioral Contract

### Preconditions

- `dependency-graph.json` exists in `.context-index/hygiene/` (from adev:repomap)
- `symbol-ranks.json` exists in `.context-index/hygiene/` (from adev:repomap)
- `manifest.yaml` exists in `.context-index/` with module definitions

### Behaviors

1. **When** `/adev:document` is invoked **then** it generates a `docs/modules/<slug>.md` file for each module listed in `manifest.yaml`.

2. **When** generating a module doc **then** include the Purpose section from the module's charter Business Intent, or inferred from code if no charter exists.

3. **When** generating Key Exports **then** filter `symbol-ranks.json` to symbols within the module's paths, including: symbol name, kind (class/function/interface), file location, importance score, description (from spec or inferred).

4. **When** generating Dependencies **then** extract from `dependency-graph.json`: modules this module imports from (outbound), modules that import from this module (inbound).

5. **When** generating Related Specs **then** scan `.context-index/specs/features/<module>/` for charter.md and any .md files, generating links to each.

6. **When** `--module <slug>` is provided **then** the slug MUST be validated before any file system access: reject slugs containing `/`, `\`, `..`, null bytes, or any character outside `[a-z0-9_-]`. After constructing the resolved path, assert it starts within `docs/modules/` using `path.resolve()` and a directory prefix check. Generate or update only the specified module doc, skip all others.

7. **When** a module doc already exists **then** preserve content below `<!-- adev:human -->` marker, only regenerate content above `<!-- adev:generated -->`. The canonical file structure is: generated content first (from file start up to and including `<!-- adev:generated -->`), then human content (from `<!-- adev:human -->` to end of file). If `<!-- adev:human -->` is absent, treat the entire file as generated (safe to overwrite). If `<!-- adev:generated -->` is absent but `<!-- adev:human -->` is present, treat the file as human-owned and refuse to overwrite — emit a warning and skip the file (exit 0).

8. **When** `--check` flag is provided **then** output the generated content as a diff without writing to disk.

9. **When** `--force` flag is provided **then** regenerate all sections unconditionally. The `<!-- adev:human -->` preservation invariant still applies — human content is never overwritten even with `--force`. If a module doc has `<!-- adev:human -->` but no `<!-- adev:generated -->` marker, `--force` does not override the skip — the file is still skipped with a warning.

### Postconditions

- `docs/modules/` directory exists (created by this skill if absent)
- Each module in manifest.yaml has a corresponding `docs/modules/<slug>.md`
- Module docs contain: Purpose, Key Exports table, Dependencies, Related Specs
- Human content below `<!-- adev:human -->` preserved

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Module slug not in manifest (batch run) | Output warning: "Module '<slug>' not found in manifest. Skipping." | 0 |
| Module slug not in manifest (--module flag) | Output error: "Module '<slug>' not found in manifest." | 1 |
| --module slug fails validation (invalid characters or path traversal) | Output error: "Invalid module slug '<slug>'. Slugs must match [a-z0-9_-]." | 1 |
| Module doc has `<!-- adev:human -->` but no `<!-- adev:generated -->` | Emit warning, skip file | 0 |
| Symbol data missing for module | Generate doc with empty Key Exports section | 0 |
| Module charter missing | Use inferred purpose from code | 0 |
| docs/modules/ cannot be created | Output error with path and reason | 1 |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Applies because adev:document is a skill that generates markdown documentation.
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
- [ ] --module with an invalid slug (path traversal, bad characters) exits 1 with clear error
- [ ] --module with a slug not in manifest exits 1 with clear error
- [ ] --force flag regenerates all sections (human content still preserved)
- [ ] Preserves human content when file already exists
- [ ] Module doc with human marker but no generated marker is skipped with warning
- [ ] --check flag shows diff without writing
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
