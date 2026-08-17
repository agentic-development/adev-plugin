---
charter: test-strategies
status: implemented
revision: 1
charter-revision: 2
created: 2026-04-20
updated: 2026-05-04
source-manifest:
  files:
    - lib/test-strategies/manifest.mjs
  computed-at: "2026-05-10T23:51:01.456Z"
---

# Spec: Manifest Schema Extension

## Capability

`test_strategies` section in manifest.yaml for declaring available strategies, commands, tiers, and path globs.

## Preconditions

- A project has a `manifest.yaml` file in `.context-index/`
- The manifest may or may not contain a `test_strategies` section

## Behavioral Contract

### Behaviors

1. When `manifest.yaml` contains a `test_strategies` section, then each entry declares: `strategy_id` (one of the 8 types), `command` (array of command + args, executed via `spawn` without shell interpolation — never passed to `exec` as a string), `tier` (`fast`/`integration`/`e2e`), and `paths` (array of relative file globs — must not contain `../` or start with `/`)
2. When `manifest.yaml` has no `test_strategies` section, then consuming skills behave identically to today — all tasks default to `unit` strategy with no warnings or errors
3. When a `test_strategies` entry references a `strategy_id` not in the registry, then manifest parsing logs a warning and skips that entry
4. When multiple `test_strategies` entries declare overlapping path globs, then the first matching entry wins (declaration order)
5. When the `command` field is omitted from a strategy entry, then the strategy uses the project's default test command from `gates.test`

### Example Manifest Schema

```yaml
test_strategies:
  - strategy_id: schema
    command: ["npm", "run", "test:migrations"]
    tier: integration
    paths: ["migrations/**", "prisma/migrations/**"]
  - strategy_id: fixture
    command: ["dbt", "test"]
    tier: integration
    paths: ["models/**", "macros/**"]
  - strategy_id: policy
    command: ["conftest", "test"]
    tier: fast
    paths: ["terraform/**", "k8s/**"]
```

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Invalid `strategy_id` | Warning logged, entry skipped | UNKNOWN_STRATEGY |
| Missing `paths` array | Warning logged, entry skipped | MISSING_PATHS |
| Empty `test_strategies` array | Treated as no section (fallback to unit) | — |
| Malformed YAML in `test_strategies` | Manifest parse error (existing behavior) | MANIFEST_PARSE_ERROR |

## Constitution Reference

- "Minimize external dependencies" — Manifest parsing uses existing YAML reading logic, no new dependencies
- "Skills are primarily markdown" — The schema is documentation-first; skills read the parsed YAML structure

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define YAML schema | Document the `test_strategies` section schema with all fields and validation rules | small |
| Implement manifest parser extension | Read and validate `test_strategies` entries from `manifest.yaml` | medium |
| Update manifest template | Add commented-out `test_strategies` example to the scaffold template | small |
| Backward compatibility tests | Verify manifests without `test_strategies` work identically to today | small |

## Acceptance Criteria

- [ ] `test_strategies` section is optional — omitting it preserves current behavior
- [ ] Each entry validates `strategy_id` against the registry
- [ ] Invalid entries produce warnings, not errors
- [ ] Path globs use standard glob syntax
- [ ] First-match-wins on overlapping paths
- [ ] `command` field falls back to `gates.test` when omitted
- [ ] Manifest template includes commented example
- [ ] All quality gates pass
- [ ] `command` field is an array executed via `spawn`, never passed to a shell as a string
- [ ] Path globs are validated to be relative and non-traversal before use
- [ ] No constitutional violations introduced
