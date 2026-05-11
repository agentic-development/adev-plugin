# Live Spec: Domain-Aware Skill Integration

<!-- Live Spec within the domain-profiles charter.
     This defines how lifecycle skills consume domain overlays to adapt their behavior.
     Parent Charter: .context-index/specs/features/domain-profiles/charter.md -->

---
charter: domain-profiles
status: validated
risk_level: medium
milestone:
revision: 6
charter-revision: 5
created: 2026-05-07
updated: 2026-05-10
source-manifest:
  sha: "4a296cf"
  files:
    - docs/configuration.md
    - docs/hooks.md
    - lib/domains/merge-gate-config.mjs
    - lib/domains/merge-gates.mjs
    - lib/domains/merge-reviewers.mjs
    - lib/domains/merge-test-config.mjs
    - lib/domains/merge-verification.mjs
    - lib/governance/review-config.mjs
    - lib/governance/validate-config.mjs
    - lib/lifecycle-gate-config.mjs
    - lib/test-strategies/profiles.mjs
    - skills/brainstorm/SKILL.md
    - skills/implement/SKILL.md
    - skills/review-specs/SKILL.md
    - skills/specify/SKILL.md
    - skills/validate/SKILL.md
    - skills/write-test/SKILL.md
    - tests/lib/domains/integration.test.mjs
    - tests/lib/domains/merge-gate-config.test.mjs
    - tests/lib/domains/merge-gates.test.mjs
    - tests/lib/domains/merge-reviewers.test.mjs
    - tests/lib/domains/merge-test-config.test.mjs
    - tests/lib/domains/merge-verification.test.mjs
    - tests/lib/domains/refactor-constants.test.mjs
  computed-at: "2026-05-11T16:09:28.518Z"
---

## Behavioral Contract

This spec defines how lifecycle skills consume domain config to adapt their behavior. Skills have NO hardcoded defaults — all configurable behavior is read from the resolved domain profile via deterministic companion code. The config loading pipeline is:

1. Skill calls `resolveDomain()` to get the active domain
2. Skill calls `loadDomainConfig()` for its overlay type(s) — `loadDomainConfig()` resolves through the `extends` chain (custom override -> parent bundled profile) automatically
3. Skill reads governance files (if any) for project-level overrides
4. Skill's merge function combines domain config + governance into final config
5. Skill operates on the merged config

All config loading and merging is implemented as executable JavaScript in `lib/domains/` and `lib/governance/`, not as markdown instructions. Skills invoke these modules programmatically.

### Companion Code Requirement

Each config merge function MUST be implemented as a deterministic JavaScript module:
- `lib/domains/merge-reviewers.mjs` — merge domain reviewers + governance reviewers
- `lib/domains/merge-gates.mjs` — merge domain gates + governance gates
- `lib/domains/merge-verification.mjs` — merge domain verification config
- `lib/domains/merge-gate-config.mjs` — merge domain lifecycle gate config (file exclusions, bash passthrough)
- `lib/domains/merge-test-config.mjs` — merge domain test config (permitted tools, gaming thresholds)

Skills call these merge functions directly. The merge functions are unit-testable with fixture data.

### Preconditions

- `resolveDomain()` and `loadDomainConfig()` are implemented (see `domain-resolution-and-overlay-structure.spec.md`)
- The consuming skill is executing its normal flow

### Behaviors

**Shared: Config Loading at Startup**

1. **When** any consuming skill starts **then** it calls `resolveDomain()` once, then `loadDomainConfig()` for its required overlay type(s). `loadDomainConfig()` automatically resolves through the `extends` chain for custom domains, so skills always receive the fully resolved config without awareness of inheritance. The domain profile always provides defaults — there are no hardcoded fallbacks in skill code. If `loadDomainConfig()` returns `null` (domain profile missing or incomplete), the skill logs a warning and operates with empty config (which may cause downstream failures if required config is missing).

**Charter Template Overlay (brainstorm)**

2. **When** `/adev:brainstorm` starts **then** it loads the complete charter template via `loadDomainConfig(domain, "charter-template", ...)`. The template provides the full section structure and vocabulary for the domain. Skills use the template directly as the charter structure -- no H2 section merging is needed.

3. **When** `/adev:brainstorm` loads a charter overlay that includes a Quality Attributes section **then** the domain-specific quality attribute suggestions are presented to the user (e.g., data-engineering suggests freshness, completeness, accuracy; software suggests latency, throughput, availability).

**Spec Template Overlay (specify)**

4. **When** `/adev:specify` starts **then** it loads the complete spec template via `loadDomainConfig(domain, "spec-template", ...)`. The template provides the full section structure for the domain. Skills use the template directly -- no H2 section merging is needed.

**Domain-Aware Reviewer Dispatch (review-specs)**

5. **When** `/adev:review-specs` loads its reviewer set **then** it calls `loadReviewerConfig()` from `lib/domains/merge-reviewers.mjs` which:
   a. Loads domain reviewers via `loadDomainConfig(domain, "reviewers", ...)`
   b. Loads governance reviewers from `.context-index/governance/review.yaml` (if exists)
   c. Merges: domain reviewers first, then governance reviewers applied on top
   d. Returns the final merged reviewer list

6. **When** a domain `reviewers.yaml` specifies `merge_strategy: append` (or omits `merge_strategy`) **then** governance reviewers are appended after domain reviewers. If a governance reviewer `id` matches a domain reviewer `id`, the governance entry overrides the domain entry (governance wins).

7. **When** a domain `reviewers.yaml` specifies `merge_strategy: replace` **then** only the domain-defined reviewers are used as the base (bundled defaults are excluded). Governance reviewers are still applied on top. The merge function emits a user-visible warning: `"Domain '<domain>' replaced base reviewers. Governance overrides still apply."`

8. **When** a reviewer entry is missing the required `id` field **then** it is skipped with `DOMAIN_CONFIG_MERGE_WARN`. Optional fields (`dispatch`, `profile`, `severity_cap`, `context_pack`) inherit defaults: `dispatch: always`, `profile: reviewer-capable`, `severity_cap: blocker`, `context_pack: base`.

9. **When** no domain reviewers overlay exists and no governance reviewers file exists **then** the skill has no reviewers configured and emits a warning. This can only happen if the `software` profile is corrupted or missing.

**Domain-Aware Quality Gates (validate)**

10. **When** `/adev:validate` loads gate commands **then** it calls `loadDomainGateHookConfig()` from `lib/domains/merge-gates.mjs` which:
    a. Loads domain gates via `loadDomainConfig(domain, "gates", ...)`
    b. Loads governance gates from `.context-index/governance/gates.yaml` (if exists)
    c. Merges by `id`: governance gates with matching IDs override domain gates; governance gates with new IDs are appended
    d. Returns the final merged gate list

Gate commands execute with `execFile` (no shell interpolation). Gate entries require `id` and `command` fields; entries missing either are skipped with `INVALID_GATE`.

11. **When** a governance gate overrides a domain gate by matching `id` **then** a user-visible warning is emitted: `"Governance gate '<id>' overrides domain gate (source: <file-path>)."`

**Domain-Aware Verification (implement)**

12. **When** `/adev:implement` reaches the verification step **then** it loads verification config via `loadDomainConfig(domain, "verification", ...)`. The config specifies `type` (`visual`, `output`, or `flow`), `trigger_patterns` (file globs evaluated relative to project root, rejecting `..` and absolute paths), and `tool` (`"none"` or a configured MCP server name validated against the harness's active server list).

13. **When** `type: output` **then** implement uses output comparison via assertions — no browser or MCP tool.

14. **When** `type: flow` **then** implement verifies process flow via assertion-based checks on workflow definition files.

15. **When** `type: visual` **then** implement uses browser-based snapshot verification.

16. **When** no verification config exists for the resolved domain **then** implement logs a warning and skips domain-specific verification. The `software` profile ships with `type: visual` as default.

**Domain-Aware Lifecycle Gate Config (hooks)**

17. **When** lifecycle gate hooks execute **then** they load gate config via `loadGateHookConfig()` from `lib/domains/merge-gate-config.mjs` which:
    a. Loads domain gate config via `loadDomainConfig(domain, "gate-config", ...)`
    b. Returns the merged config containing `file_exclusions` (glob patterns for files exempt from lifecycle tracking) and `bash_passthrough` (commands allowed without lifecycle session)

18. **When** no gate config exists for the resolved domain **then** the hooks use empty exclusion and passthrough lists (strictest possible — everything is tracked). The `software` profile ships with the current 44 file exclusions and 32 bash passthrough commands as defaults.

**Domain-Aware Test Config (write-test, implement)**

19. **When** `/adev:write-test` or `/adev:implement` loads test configuration **then** it loads test config via `loadDomainConfig(domain, "test-config", ...)`. The config specifies `permitted_tools` (test framework commands), `max_test_file_size` (gaming detection threshold), and `skip_patterns` (regex patterns for detecting skipped tests in the domain's test frameworks).

20. **When** no test config exists for the resolved domain **then** the skill logs a warning and uses empty permitted tools (which will cause test framework detection to fail). The `software` profile ships with the current defaults (node:test, jest, vitest, etc.).

**Shared: Immutability Invariant**

21. **When** any skill merges a domain overlay into its base config **then** the base template/config is never mutated — the merge produces a new in-memory result. Immutability is enforced by convention and verified by tests (merge functions return new objects, not mutated inputs).

### Postconditions

- Each consuming skill resolves its domain exactly once at startup and passes the result downstream.
- Overlay merge never mutates the base template or config file on disk.
- No skill contains hardcoded defaults for any configurable behavior — all defaults come from domain profile files.
- Config merge order is always: domain profile -> governance overlay (governance wins on conflict).

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Overlay file has valid YAML with unexpected/missing fields | Skill logs a warning identifying the file and field, skips the malformed entry (per-entry skip, not wholesale discard) | DOMAIN_CONFIG_MERGE_WARN |
| Overlay file is empty or contains no actionable entries | Emit DOMAIN_CONFIG_MERGE_WARN and use empty config | DOMAIN_CONFIG_MERGE_WARN |
| Domain `reviewers.yaml` has `merge_strategy` value other than `replace` or `append` | Treat as `append` with a warning | DOMAIN_CONFIG_MERGE_WARN |
| Domain `reviewers.yaml` entry missing `id` field | Reviewer entry skipped with warning; remaining entries proceed | DOMAIN_CONFIG_MERGE_WARN |
| Domain `reviewers.yaml` references unknown execution profile | Reviewer entry skipped with warning; remaining reviewers proceed | UNKNOWN_PROFILE |
| Governance reviewer `id` matches domain reviewer `id` | Governance entry overrides domain entry (governance wins) | — |
| Domain `gates.yaml` entry has no `id` or `command` field | Gate entry skipped with warning | INVALID_GATE |
| Governance gate overrides domain gate by matching `id` | Gate overridden, user-visible warning emitted | — |
| Domain `verification.yaml` specifies unknown `type` | Fall back to no verification with a warning | UNKNOWN_VERIFY_TYPE |
| Domain `verification.yaml` `tool` is not `"none"` and not a configured MCP server | Fail config load with actionable message naming the missing server | TOOL_UNAVAILABLE |
| `trigger_patterns` contain `..` or absolute paths | Patterns are rejected with warning; verification proceeds without those patterns | INVALID_PATTERN |
| Domain template file is missing | `loadDomainConfig()` returns `null`; skill falls back to base template | DOMAIN_NOT_FOUND |
| Domain profile missing entirely (no bundled directory) | All overlays return `null`; skill warns and uses empty config | DOMAIN_NOT_FOUND |

## System Constitution Reference

- **"Skills are primarily markdown"** — Overlay files are markdown and YAML data. Merge logic is companion code in `lib/domains/` that skills call.
- **"Minimize external dependencies"** — Merge logic uses string operations for markdown overlays and the existing YAML parser for structured overlays. No new dependencies.
- **"Pure ESM"** — Integration points in each skill are ESM imports from `lib/domains/`.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement `mergeReviewers()` in `lib/domains/merge-reviewers.mjs` | Load domain reviewers + governance reviewers, apply merge_strategy, return merged list | medium |
| Implement `mergeGates()` in `lib/domains/merge-gates.mjs` | Load domain gates + governance gates, merge by ID, return merged list | small |
| Implement `mergeVerification()` in `lib/domains/merge-verification.mjs` | Load and validate verification config (type, trigger_patterns, tool) | small |
| Implement `mergeGateConfig()` in `lib/domains/merge-gate-config.mjs` | Load domain gate config, return file_exclusions and bash_passthrough lists | small |
| Implement `mergeTestConfig()` in `lib/domains/merge-test-config.mjs` | Load domain test config, return permitted_tools, max_test_file_size, skip_patterns | small |
| ~~Implement charter template merge function~~ | ~~String-based H2 section replacement/extension for `charter-overlay.md`~~ — **Obsolete:** replaced by full domain templates (see `template-replacement.spec.md`) | ~~medium~~ |
| ~~Implement spec template merge function~~ | ~~String-based H2 section replacement/extension for `spec-overlay.md`~~ — **Obsolete:** replaced by full domain templates (see `template-replacement.spec.md`) | ~~medium~~ |
| Wire domain resolution into brainstorm | Call `resolveDomain()` + `loadDomainConfig()` at startup, apply charter overlay | small |
| Wire domain resolution into specify | Call `resolveDomain()` + `loadDomainConfig()` at startup, apply spec overlay | small |
| Wire domain resolution into review-specs | Replace hardcoded reviewer loading with `mergeReviewers()` | small |
| Wire domain resolution into validate | Replace hardcoded gate loading with `mergeGates()` | small |
| Wire domain resolution into implement | Replace hardcoded verification with `mergeVerification()` | small |
| Wire domain resolution into lifecycle gate hooks | Replace hardcoded exclusions/passthrough with `mergeGateConfig()` | medium |
| Wire domain resolution into write-test/implement | Replace hardcoded test tools with `mergeTestConfig()` | small |
| Refactor `lib/governance/review-config.mjs` | Remove `BUNDLED_REVIEWER_IDS` constant and hardcoded defaults; delegate to domain profile | medium |
| Refactor `lib/governance/validate-config.mjs` | Remove `DEFAULT_SEVERITY_BY_KIND` and hardcoded defaults; delegate to domain profile | medium |
| Refactor `lib/lifecycle-gate-config.mjs` | Remove `DEFAULT_FILE_EXCLUSIONS` and `DEFAULT_BASH_PASSTHROUGH`; delegate to domain profile | medium |
| Refactor `lib/test-strategies/profiles.mjs` | Remove hardcoded `UNIT_PROFILE` and `permitted_tools`; delegate to domain profile | medium |
| Write integration tests | Test each skill with and without overlays, verify governance wins on conflict, verify no hardcoded fallbacks remain | large |
| Update `docs/configuration.md` and `docs/hooks.md` | Document config merge order per skill, domain-aware lifecycle gate config | small |

## Acceptance Criteria

- [ ] All config loading is implemented as deterministic JavaScript modules in `lib/domains/`, not markdown instructions
- [ ] All five skills call `resolveDomain()` once at startup
- [ ] No skill contains hardcoded default reviewers, gates, verification config, file exclusions, bash passthrough, or test tools
- [ ] `lib/governance/review-config.mjs` no longer has `BUNDLED_REVIEWER_IDS` constant — reviewer defaults come from domain profile
- [ ] `lib/governance/validate-config.mjs` no longer has `DEFAULT_SEVERITY_BY_KIND` — severity defaults come from domain profile
- [ ] `lib/lifecycle-gate-config.mjs` no longer has `DEFAULT_FILE_EXCLUSIONS` or `DEFAULT_BASH_PASSTHROUGH` — come from domain profile
- [ ] `lib/test-strategies/profiles.mjs` no longer has hardcoded `permitted_tools` — come from domain profile
- [ ] Config merge order is domain profile -> governance (governance wins on ID conflict)
- [ ] Brainstorm loads domain charter template via `loadDomainConfig(domain, "charter-template", ...)`
- [ ] Specify loads domain spec template via `loadDomainConfig(domain, "spec-template", ...)`
- [ ] Review-specs merges domain + governance reviewers via `mergeReviewers()`
- [ ] `merge_strategy: replace` drops base reviewers but governance still applies on top
- [ ] Validate merges domain + governance gates via `mergeGates()` by `id` field
- [ ] Gate overrides emit user-visible warnings
- [ ] Gate commands execute via `execFile` (no-shell mode)
- [ ] Implement uses domain verification config (output, flow, or visual type)
- [ ] `trigger_patterns` reject `..` and absolute paths
- [ ] Lifecycle gate hooks use domain gate-config for file exclusions and bash passthrough
- [ ] Write-test/implement use domain test-config for permitted tools and gaming thresholds
- [ ] Immutability: merge functions return new objects, never mutate inputs (verified by tests)
- [ ] `docs/configuration.md` documents the config merge order (domain profile -> governance) for each skill integration point
- [ ] `docs/hooks.md` documents domain-aware lifecycle gate config (file exclusions, bash passthrough)
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
