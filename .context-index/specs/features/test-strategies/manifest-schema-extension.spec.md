---
charter: test-strategies
status: implemented
revision: 2
charter-revision: 2
created: 2026-04-20
updated: 2026-11-17
tracker-ref: adev-plugin-a0zm
source-manifest:
  files:
    - lib/test-strategies/manifest.mjs
    - lib/test-strategies/strategy-gates.mjs
    - lib/gates/path-scope.mjs
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

1. When `manifest.yaml` contains a `test_strategies` section, then each entry declares: `strategy_id` (one of the 8 types), `command` (array of command + args, run as a gate with `execFile` semantics and no shell interpolation — never passed to `exec` as a string; see Behaviors 6-9), `tier` (`fast`/`integration`/`e2e`), and `paths` (array of relative file globs — must not contain `../` or start with `/`)
2. When `manifest.yaml` has no `test_strategies` section, then consuming skills behave identically to today — all tasks default to `unit` strategy with no warnings or errors
3. When a `test_strategies` entry references a `strategy_id` not in the registry, then manifest parsing logs a warning and skips that entry
4. When multiple `test_strategies` entries declare overlapping path globs, then the first matching entry wins (declaration order)
5. When the `command` field is omitted from a strategy entry, then no strategy gate is created; the project's own gates (normally `test`) cover the strategy's files
6. When `adev governance materialize --registry gates` runs, then each entry that declares a `command` is written into `governance/gates.yaml` as `id: strategy-<strategy_id>` with the entry's `command`, `tier` and `paths` and `source: project` — unless that file already declares `strategy-<strategy_id>` or a gate with the same argv. Strategies are composed only on this adoption path, never at run time: `gates.yaml` alone declares what runs (`explicit-governance-registries.spec.md`)
7. When a gate declares `paths` and `adev domain load-gates` is given `--changed-since <base>` or `--changed-files <csv>`, then the gate is marked `applies: true` only if a changed file matches one of the globs, and otherwise `applies: false` with a `skip_reason`. `/adev:validate` Check 1 and `/adev:implement` Steps 2h and 2-post do not run a gate with `applies: false`; Check 1 records it as `skip` in `gate_outcomes`. Gates without `paths` always apply
8. When the change set cannot be read (`CHANGED_BASE_UNRESOLVED`), then every gate is marked as applying
9. When a strategy declares a `command` and `gates.yaml` has no row for it, then `adev gate doctor` reports `gate-doctor/strategy-gate-not-adopted` naming the materialize command

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
| `command` not a non-empty list of strings, or `tier` not fast/integration/e2e | Warning; the entry still assigns its strategy but is not adopted as a gate | STRATEGY_GATE_SKIPPED |
| A gate's `paths` is empty, not a list of strings, absolute, or contains `../` | Warning; `paths` ignored and the gate runs on every change | INVALID_GATE_PATHS |
| `--changed-since` base cannot be diffed | Warning; every gate applies | CHANGED_BASE_UNRESOLVED |

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
- [ ] An entry without `command` creates no strategy gate
- [ ] Materialize adopts each strategy command as a path-scoped `strategy-<id>` gate, once, and skips a command already gated (Behavior 6)
- [ ] `load-gates --changed-since` / `--changed-files` mark path-scoped gates `applies`; Check 1 records a non-applying gate as `skip` (Behaviors 7-8)
- [ ] `adev gate doctor` reports an unadopted strategy command (Behavior 9)
- [ ] Manifest template includes commented example
- [ ] All quality gates pass
- [ ] `command` field is an argv array, never passed to a shell as a string
- [ ] Path globs are validated to be relative and non-traversal before use
- [ ] No constitutional violations introduced
