# Live Spec: Content Installation

---
charter: extensions
status: validated
risk_level: medium
milestone:
revision: 2
charter-revision: 2
created: 2026-05-10
updated: 2026-05-11
source-manifest:
  sha: "b2179e7"
  files:
    - lib/extensions/content-install.mjs
    - tests/lib/extensions/content-install.test.mjs
  computed-at: "2026-07-03T22:27:11.364Z"
---

## Behavioral Contract

### Preconditions

- Extension source has been resolved to a local directory with a valid `adev-extension.yaml` (extension-core spec)
- `.context-index/` exists with `manifest.yaml`
- `BUNDLED_DOMAIN_NAMES` constant is importable from `lib/domains/constants.mjs`

### Behaviors

1. **When** `installExtension()` encounters a `provides.domain-profile` entry **then** it copies the domain profile directory to `.context-index/domains/<name>/`, including all provided files (charter-template.md, spec-template.md, reviewers.yaml, gates.yaml, verification.yaml, gate-config.yaml, test-config.yaml), and generates a `domain.yaml` containing `extends: <parent>` where `<parent>` is specified in the extension manifest's domain-profile entry.

2. **When** a domain profile name matches a value in `BUNDLED_DOMAIN_NAMES` (software, data-engineering, process-automation) **then** installation fails with a `BUNDLED_COLLISION` error listing the conflicting name and explaining that bundled domain names cannot be overridden.

3. **When** a domain profile name does not match the kebab-case pattern (`^[a-z][a-z0-9-]*$`) **then** installation fails with an `INVALID_DOMAIN_NAME` error showing the name and the expected pattern.

4. **When** `installExtension()` is called again for an extension that already installed a domain profile **then** it overwrites the existing domain profile directory with the new content (idempotent re-install). No duplicate directories are created.

5. **When** `installExtension()` encounters `provides.governance` entries **then** it first validates each entry against the governance entry schema: `id` must be a non-empty string (max 128 characters), all field values must be strings, numbers, booleans, or arrays of strings (no nested objects, no YAML anchors/aliases). Entries failing schema validation are rejected with a `GOVERNANCE_SCHEMA` error listing the invalid entry `id` and the validation failure. Valid entries are then merged into `governance/review.yaml`, `governance/gates.yaml`, and `governance/validate.yaml` (paths relative to `<projectRoot>/.context-index/`) using merge-by-id semantics per ADR-0003 (`.context-index/adrs/0003-configurable-review-registry.md`): entries with a matching `id` field are field-overridden (project values win over extension values), entries with a new `id` are appended.

6. **When** a target governance file (e.g., `governance/review.yaml`) does not exist **then** `installExtension()` creates the file with the extension's validated entries as the initial content.

7. **When** governance merge encounters an entry whose `id` already exists in the project file **then** project values for all fields take precedence. Extension values only fill in fields not already set in the project entry.

8. **When** `installExtension()` encounters `provides.samples` entries **then** for each sample file it canonicalizes both the source path (via `fs.realpathSync`) and the destination path (via `path.resolve`), verifies the source falls within the extension's resolved source directory and the destination falls within `<projectRoot>/.context-index/samples/`, and copies the file. If either path escapes its intended directory, the install fails with a `PATH_TRAVERSAL` error listing the offending path. If a sample file already exists at the target path, it is overwritten with a warning logged to the install report.

9. **When** `installExtension()` encounters `provides.skills` entries **then** before installing, it checks each skill name against the list of bundled skill names. If any collision is found, the entire install is blocked with a `SKILL_COLLISION` error listing all conflicting skill names.

10. **When** conflict detection passes for skills **then** skill content is copied to the appropriate location and registered (registration details in cli-and-registration spec).

### Postconditions

- Domain profiles are installed at `.context-index/domains/<name>/` with a valid `domain.yaml` containing `extends: <parent>`.
- Governance files reflect the merge result: existing project entries unchanged, new extension entries appended.
- Sample files are present at `.context-index/samples/` (overwritten if previously existing).
- No bundled domain names or bundled skill names are overridden.
- Install report lists every file written, every merge applied, and every warning issued.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Domain profile name in `BUNDLED_DOMAIN_NAMES` | Block install, list conflicting name | BUNDLED_COLLISION |
| Domain profile name not kebab-case | Block install, show name and expected pattern | INVALID_DOMAIN_NAME |
| Skill name collides with bundled skill | Block entire install, list all conflicting names | SKILL_COLLISION |
| Governance entry fails schema validation | Block install, list invalid entry id and failure reason | GOVERNANCE_SCHEMA |
| Sample source or dest path escapes intended directory | Block install, list offending path | PATH_TRAVERSAL |
| Governance target file missing | Create file with extension entries as initial content | N/A (auto-create) |
| Sample file already exists | Overwrite with warning in install report | N/A (warn) |
| Domain profile directory already exists (re-install) | Overwrite contents (idempotent) | N/A |

## System Constitution Reference

- **"Minimize external dependencies"** -- governance merge uses plain YAML parsing and array operations via Node.js built-ins. No merge library needed.
- **"No executable code in extensions"** -- extensions provide only markdown, YAML, and bash content. `installExtension()` copies/merges these files without executing them.
- **"Hook protocol compliance"** -- governance merge follows ADR-0003 semantics (project wins on conflict), maintaining consistency with the existing merge protocol.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Domain profile installer | Copy domain profile directory, generate `domain.yaml` with `extends`, validate name | medium |
| Bundled name guard | Check domain profile name against `BUNDLED_DOMAIN_NAMES`, block on collision | small |
| Governance merge engine | Implement merge-by-id for review.yaml, gates.yaml, validate.yaml with project-wins semantics | large |
| Governance file auto-create | Create governance files if they do not exist before merge | small |
| Sample installer | Copy sample files to `.context-index/samples/`, warn on overwrite | small |
| Skill conflict detection | Check extension skill names against bundled skill names, block on collision | small |
| Install report builder | Collect and return all files written, merges applied, and warnings for CLI display | medium |

## Acceptance Criteria

- [ ] Domain profiles install to `.context-index/domains/<name>/` with a valid `domain.yaml`
- [ ] `extends: <parent>` is correctly set in generated `domain.yaml`
- [ ] Installing a domain profile with a `BUNDLED_DOMAIN_NAMES` name fails with `BUNDLED_COLLISION`
- [ ] Invalid domain profile names (non-kebab-case) are rejected with `INVALID_DOMAIN_NAME`
- [ ] Re-installing the same domain profile overwrites existing files (idempotent)
- [ ] Governance entries are validated against schema before merge (id, field types, no YAML anchors)
- [ ] Invalid governance entries fail with `GOVERNANCE_SCHEMA` error
- [ ] Governance merge appends new `id` entries and preserves existing project entries on conflict
- [ ] Missing governance files are auto-created on first merge
- [ ] Sample source paths are verified to fall within extension source directory (path containment)
- [ ] Sample dest paths are verified to fall within `.context-index/samples/` (path containment)
- [ ] Path traversal attempts in samples are rejected with `PATH_TRAVERSAL` error
- [ ] Samples are copied to `.context-index/samples/` with overwrite warning for existing files
- [ ] Skill name collision with bundled skills blocks the entire install
- [ ] Install report accurately lists all files written and merges applied
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
