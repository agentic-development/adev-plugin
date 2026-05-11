# Live Spec: Bundled Templates Cleanup

<!-- Live Spec within the domain-extensions charter.
     Defines the removal of extracted domains from templates/domains/ and the update to BUNDLED_DOMAIN_NAMES.
     Parent Charter: .context-index/specs/features/domain-extensions/charter.md -->

---
charter: domain-extensions
status: review-passed
risk_level: medium
milestone: v1
revision: 1
charter-revision: 2
created: 2026-05-11
updated: 2026-05-11
---

## Behavioral Contract

### Preconditions

- `templates/domains/software/` remains as the bundled default
- `lib/domains/constants.mjs` exports `BUNDLED_DOMAIN_NAMES` containing software, data-engineering, and process-automation
- Extension packages for data-engineering and process-automation exist in `extensions/` (requires `data-engineering-extension.spec.md` and `process-automation-extension.spec.md` to be implemented — the extension content must exist before removing bundled copies)

### Behaviors

1. **When** the cleanup is applied **then** `templates/domains/data-engineering/` is removed entirely (all 7 files and the directory).

2. **When** the cleanup is applied **then** `templates/domains/process-automation/` is removed entirely (all 7 files and the directory).

3. **When** the cleanup is applied **then** `templates/domains/software/` remains unchanged — it is the only bundled domain.

4. **When** `BUNDLED_DOMAIN_NAMES` in `lib/domains/constants.mjs` is updated **then** it contains only `"software"`. The values `"data-engineering"` and `"process-automation"` are removed.

5. **When** `loadDomainConfig("data-engineering", ...)` is called after cleanup without installing the extension **then** it returns `null` for all config types (no custom dir, no bundled dir, no extends parent).

6. **When** `loadDomainConfig("data-engineering", ...)` is called after cleanup with the extension installed **then** it resolves through the custom domain in `.context-index/domains/data-engineering/` via the `extends: software` chain.

7. **When** tests reference `BUNDLED_DOMAIN_NAMES` **then** they are updated to expect only `["software"]`.

8. **When** tests reference `templates/domains/data-engineering/` or `templates/domains/process-automation/` directly **then** they are updated to reference `extensions/data-engineering/domain/` or `extensions/process-automation/domain/` respectively, or removed if no longer applicable.

### Postconditions

- `templates/domains/` contains only the `software/` subdirectory
- `BUNDLED_DOMAIN_NAMES` contains only `"software"`
- All existing tests pass with updated references
- Extension-installed domains continue to resolve correctly

### Error Cases

| Condition | Expected Behavior | Result |
|-----------|-------------------|--------|
| `loadDomainConfig("data-engineering", ...)` without extension installed | Returns `null` — no bundled or custom domain found | `null` return |
| Test references removed bundled path | Test fails — must be updated | test failure |

## System Constitution Reference

- **"Minimize external dependencies"** — Cleanup reduces bundled content, making the plugin leaner.
- **"Skills are primarily markdown"** — Templates remain markdown; only their location changes.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update `BUNDLED_DOMAIN_NAMES` | Remove data-engineering and process-automation from the constant in `lib/domains/constants.mjs` | small |
| Delete bundled directories | Remove `templates/domains/data-engineering/` and `templates/domains/process-automation/` | small |
| Update domain tests | Fix tests in `tests/lib/domains/` that reference removed bundled domains | medium |
| Update other test references | Find and fix any other tests referencing the removed template paths | medium |
| Verify extension install path | Confirm that installing from `extensions/` still works after bundled removal | small |

## Acceptance Criteria

- [ ] `templates/domains/` contains only `software/`
- [ ] `BUNDLED_DOMAIN_NAMES` exports `["software"]` only
- [ ] `loadDomainConfig("data-engineering", ...)` fails without extension installed
- [ ] `loadDomainConfig("data-engineering", ...)` succeeds with extension installed
- [ ] All domain tests pass with updated expectations
- [ ] No other tests reference removed template paths
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
