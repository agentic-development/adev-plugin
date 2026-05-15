# Live Spec: Preconditions and Argument Parsing

---
charter: adev:codehealth
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 1
created: 2026-04-02
updated: 2026-04-02
source-manifest:
  sha: "4e2d51a"
  files:
    - .context-index/manifest.yaml
    - skills/codehealth/SKILL.md
    - skills/hygiene/SKILL.md
    - tests/skills/codehealth.test.mjs
  computed-at: "2026-04-12T11:48:02.735Z"
drift_detected: true
drift_source: skills/hygiene/SKILL.md
drift_at: 2026-05-15T16:42:13.604Z
---

## Behavioral Contract

### Preconditions

- `.context-index/manifest.yaml` exists and contains `hygiene.source_roots` and top-level `modules` fields
- The skill is invoked as `/adev:codehealth` with optional `--module <slug>` and `--pass <name>` arguments

### Behaviors

1. **When** the skill is invoked with no arguments **then** it loads `manifest.yaml`, verifies repomap artifacts exist at `.context-index/hygiene/symbol-ranks.json` and `.context-index/hygiene/dependency-graph.json`, and proceeds to run all detection passes against all `source_roots`.

2. **When** `--module <slug>` is provided **then** the skill resolves the module's `paths` from `manifest.yaml` `modules[]` and restricts all detection passes to files within those paths that also fall within `hygiene.source_roots`. The resolved scope is the intersection of the module's paths and `source_roots`, minus `coverage_exclude` patterns.

3. **When** `--pass <name>` is provided with a comma-separated list (e.g., `--pass dead-exports,orphan-files`) **then** only the named passes execute. Valid pass names are: `dead-exports`, `orphan-files`, `unused-deps`, `stale-code`, `duplicate-logic`.

4. **When** both `--module` and `--pass` are provided **then** both filters apply (intersection: only named passes, only files in the module).

5. **When** `symbol-ranks.json` or `dependency-graph.json` is missing **then** the skill emits an actionable error: "Repomap artifacts not found. Run `/adev:repomap` first to generate the symbol index and dependency graph." and stops without running any passes.

6. **When** `manifest.yaml` is missing or has no `source_roots` **then** the skill emits a diagnostic error: "Missing or invalid manifest.yaml — `source_roots` is required for codehealth scanning." and stops.

7. **When** `--module <slug>` references a slug not present in `manifest.yaml` `modules[]` **then** the skill emits: "Unknown module '<slug>'. Available modules: <list>." and stops.

8. **When** `--pass <name>` includes an unrecognized pass name **then** the skill emits: "Unknown pass '<name>'. Valid passes: dead-exports, orphan-files, unused-deps, stale-code, duplicate-logic." and stops.

### Postconditions

- If all preconditions pass, detection passes execute with the resolved file scope and pass selection
- If any precondition fails, no detection passes run and no report is written
- `coverage_exclude` glob patterns from `manifest.yaml` `hygiene.coverage_exclude` are applied to exclude matching files from all passes
- File scope resolution order: load `hygiene.source_roots` → intersect with `modules[].paths` if `--module` provided → subtract `coverage_exclude` patterns → pass resulting file list to detection passes

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Repomap artifacts missing | Actionable error pointing to `/adev:repomap` | MISSING_REPOMAP |
| `manifest.yaml` missing or no `source_roots` | Diagnostic error | INVALID_MANIFEST |
| Unknown `--module` slug | List available modules | UNKNOWN_MODULE |
| Unknown `--pass` name | List valid pass names | UNKNOWN_PASS |

## System Constitution Reference

- **Principle 2:** "Skills are primarily markdown" — This spec defines argument parsing as skill instructions, not executable code. The skill's SKILL.md contains the parsing logic as structured instructions for Claude.
- **Principle 1:** "Minimize external dependencies" — Manifest and JSON parsing use only Node.js built-ins available to the agent (Read tool, JSON.parse).

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define argument schema in SKILL.md | Document `--module` and `--pass` arguments with validation rules | small |
| Write precondition check instructions | Step-by-step instructions for verifying repomap artifacts and manifest | small |
| Define file scope resolution | Instructions for resolving source_roots + module paths + coverage_exclude into a file list | medium |

## Acceptance Criteria

- [ ] Skill stops with MISSING_REPOMAP error when `symbol-ranks.json` or `dependency-graph.json` is absent
- [ ] Skill stops with INVALID_MANIFEST error when `manifest.yaml` is missing or lacks `source_roots`
- [ ] `--module <slug>` correctly restricts file scope to the module's paths
- [ ] `--pass <name>` correctly restricts which detection passes run
- [ ] Unknown module slug produces a helpful error listing available modules
- [ ] Unknown pass name produces a helpful error listing valid passes
- [ ] `coverage_exclude` patterns are applied to filter files before any pass runs
- [ ] All quality gates pass (tests)
- [ ] No constitutional violations introduced
