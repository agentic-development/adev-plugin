# Live Spec: Domain-Aware Skill Integration

<!-- Live Spec within the domain-profiles charter.
     This defines how lifecycle skills consume domain overlays to adapt their behavior.
     Parent Charter: .context-index/specs/features/domain-profiles/charter.md -->

---
charter: domain-profiles
status: review-passed
risk_level: medium
milestone: v1
revision: 3
charter-revision: 3
created: 2026-05-07
updated: 2026-05-08
---

## Behavioral Contract

This spec defines how five lifecycle skills consume domain overlays: brainstorm (charter template), specify (spec template), review-specs (reviewer dispatch), validate (quality gates), and implement (verification config). Each skill calls `resolveDomain()` once at startup, then `loadOverlay()` for its overlay type, and merges the result into its existing behavior.

### Preconditions

- `resolveDomain()` and `loadOverlay()` are implemented (see `domain-resolution-and-overlay-structure.spec.md`)
- The consuming skill is executing its normal flow (brainstorm, specify, review-specs, validate, or implement)

### Behaviors

**Shared: Domain Resolution at Startup**

1. **When** any of the five consuming skills starts **then** it calls `resolveDomain()` once and receives `{ resolved_domain, source_level }`. If `resolved_domain` is `"software"` (whether explicit or by default), the skill does not call `loadOverlay()` and uses base behavior unchanged. This is not a short-circuit optimization — it follows directly from the charter invariant that `"software"` is a reserved name representing base behavior and no `domains/software/` overlay directory is ever consulted (see `domain-resolution-and-overlay-structure.spec.md`, Behavior 5).

**Charter Template Overlay (brainstorm)**

2. **When** `/adev:brainstorm` starts and the resolved domain has a `charter-overlay.md` file **then** the overlay's section names and vocabulary replace or extend the corresponding sections in the base charter template before presenting it to the user.

3. **When** `/adev:brainstorm` starts and the resolved domain has no `charter-overlay.md` **then** the base charter template is used unchanged.

**Spec Template Overlay (specify)**

4. **When** `/adev:specify` starts and the resolved domain has a `spec-overlay.md` file **then** the overlay's sections (e.g., domain-specific error case columns, alternative expectations sections) replace or extend the corresponding sections in the base spec template.

5. **When** `/adev:specify` starts and the resolved domain has no `spec-overlay.md` **then** the base spec template is used unchanged.

**Domain-Aware Reviewer Dispatch (review-specs)**

Domain reviewer overlays provide additional reviewer entries that are merged *into* the base reviewer registry loaded from `governance/review.yaml` (or bundled defaults per ADR-0003). The merge function lives in `lib/domains/merge-reviewers.mjs` and is called by `/adev:review-specs` after loading the base registry. ADR-0003 owns the registry schema and dispatch logic; this module owns only the overlay merge step.

6. **When** `/adev:review-specs` loads its reviewer set and the resolved domain has a `reviewers.yaml` file **then** the domain reviewer entries are merged into the already-loaded base reviewer registry according to the overlay's `merge_strategy` field (`replace` replaces the full reviewer list; `append` adds domain reviewers after the base set; default when `merge_strategy` is omitted: `append`). Each domain reviewer entry must include at minimum an `id` field (unique string). Optional fields (`dispatch`, `profile`, `severity_cap`, `prompt`, `context_pack`) inherit from the registry defaults when omitted: `dispatch: always`, `profile: reviewer-capable`, `severity_cap: blocker`, `context_pack: base`.

7. **When** a domain `reviewers.yaml` specifies `merge_strategy: replace` **then** only the domain-defined reviewers run; base reviewers are excluded. The skill emits a user-visible warning: `"Domain overlay '<domain>' replaced all base reviewers (source: <file-path>). Base reviewers (including security reviewer) are excluded."` This ensures the user is aware that base governance reviewers have been overridden.

8. **When** a domain `reviewers.yaml` specifies `merge_strategy: append` (or omits `merge_strategy`) **then** domain reviewers run in addition to the base reviewer set.

9. **When** `/adev:review-specs` loads its reviewer set and the resolved domain has no `reviewers.yaml` **then** the base reviewer set from `governance/review.yaml` (or skill defaults) is used unchanged.

**Domain-Aware Quality Gates (validate)**

Each gate entry in a `gates.yaml` overlay is identified by its `id` field (a unique string) and contains a `command` field (the shell command to execute). Gate merge uses ID-based matching. The merge function lives in `lib/domains/merge-gates.mjs`.

**Gate command trust model:** Domain gate commands execute with the same trust level and permissions as `governance/gates.yaml` commands — they run as shell commands via `child_process.execFile` (not `exec`) with no shell interpolation. The `command` field must be a string containing a command and its arguments as an array-safe value. Gate commands from domain overlays (both bundled and project-local) are treated as user-authored content at the same trust boundary as any other project configuration. The validate skill does not perform additional sanitization beyond using `execFile` (no-shell mode).

10. **When** `/adev:validate` loads gate commands and the resolved domain has a `gates.yaml` file **then** the domain gate entries are merged into the gate registry by `id`: domain entries with an `id` matching a base gate override that base gate (and the skill emits a user-visible warning: `"Domain gate '<id>' overrides base gate (source: <file-path>)."`); domain entries with a new `id` are appended after the base set.

11. **When** `/adev:validate` loads gate commands and the resolved domain has no `gates.yaml` **then** the base gates from `governance/gates.yaml` are used unchanged.

**Domain-Aware Verification (implement)**

12. **When** `/adev:implement` reaches the verification step and the resolved domain has a `verification.yaml` file **then** it reads the verification config (`type`, `trigger_patterns`, `tool`) and uses the domain-specific verification approach instead of the default visual verification. `trigger_patterns` are file glob patterns (e.g., `*.parquet`, `*.workflow.yaml`) that identify relevant output files. `tool` must be either `"none"` (assertion-based verification) or a known MCP server name. Tool availability is validated at config load time by checking the harness's active MCP server list (the same mechanism used by execution profiles — see ADR-0004, Behavior 17). If the named MCP server is not configured in the current session, the config load fails with TOOL_UNAVAILABLE.

13. **When** the verification config specifies `type: output` **then** implement uses output comparison via assertions — it checks that expected output files matching `trigger_patterns` exist and pass schema/content validation defined in tests. No browser or MCP tool is used.

14. **When** the verification config specifies `type: flow` **then** implement verifies the process flow by checking that workflow definition files matching `trigger_patterns` exist, contain expected integration points, and have corresponding recovery action definitions. Verification is assertion-based using test suite output.

15. **When** the verification config specifies `type: visual` **then** implement uses browser-based snapshot verification (current default behavior).

16. **When** `/adev:implement` reaches the verification step and the resolved domain has no `verification.yaml` **then** the default verification approach (visual, using playwright if available) is used unchanged.

**Shared: Overlay Merge Invariant**

17. **When** any skill merges a domain overlay into its base config **then** the base template/config is never mutated — the merge produces a new in-memory result.

### Postconditions

- Each consuming skill resolves its domain exactly once at startup and passes the result downstream.
- Overlay merge never mutates the base template or config file on disk.
- Skills without a matching overlay behave identically to their pre-domain-profiles behavior.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Overlay file exists but has valid YAML with unexpected/missing fields for the skill | Skill logs a warning identifying the file and field, then skips the malformed entry (per-entry skip, not wholesale overlay discard). This is distinct from OVERLAY_PARSE_ERROR (YAML syntax error at load time, handled by `loadOverlay()`) | OVERLAY_MERGE_WARN |
| Overlay file exists but is empty or contains no actionable entries | Emit OVERLAY_MERGE_WARN and fall back to base behavior | OVERLAY_MERGE_WARN |
| Domain `reviewers.yaml` has `merge_strategy` value other than `replace` or `append` | Treat as `append` with a warning | OVERLAY_MERGE_WARN |
| Domain `reviewers.yaml` entry missing `id` field | Reviewer entry is skipped with a warning; remaining entries proceed | OVERLAY_MERGE_WARN |
| Domain `reviewers.yaml` references an unknown execution profile | Reviewer entry is skipped with a warning; remaining reviewers proceed | UNKNOWN_PROFILE |
| Domain `gates.yaml` entry has no `id` field | Gate entry is skipped with a warning | INVALID_GATE |
| Domain `gates.yaml` entry has no `command` field | Gate entry is skipped with a warning | INVALID_GATE |
| Domain `gates.yaml` entry overrides a base gate by matching `id` | Gate is overridden and a user-visible warning is emitted | — |
| Domain `verification.yaml` specifies unknown `type` (not `output`, `flow`, or `visual`) | Fall back to default verification with a warning | UNKNOWN_VERIFY_TYPE |
| Domain `verification.yaml` specifies a `tool` value other than `"none"` or a configured MCP server name | Fail config load with an actionable message naming the missing server | TOOL_UNAVAILABLE |
| Template overlay contains section names that don't match any base template section | Extra sections are appended after the base template sections (intentional: overlay authors may introduce domain-specific sections that have no base counterpart) | — |

## System Constitution Reference

- **"Skills are primarily markdown"** — Overlay files are markdown and YAML data. The merge logic is companion code in `lib/domains/` that skills call but do not require to function. Skills without overlays work unchanged.
- **"Minimize external dependencies"** — Merge logic uses string operations for markdown overlays and the existing YAML parser for structured overlays. No new dependencies.
- **"Pure ESM"** — Integration points in each skill are ESM imports from `lib/domains/`.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement charter template merge | String-based section replacement/extension for `charter-overlay.md` | medium |
| Implement spec template merge | String-based section replacement/extension for `spec-overlay.md` | medium |
| Implement reviewer overlay merge | Parse `reviewers.yaml`, apply `merge_strategy` (replace/append) against base reviewer set | medium |
| Implement gate overlay merge | Parse `gates.yaml`, merge by ID (override matching, append new) | small |
| Implement verification config loader | Parse `verification.yaml`, return typed config object | small |
| Wire domain resolution into brainstorm | Add `resolveDomain()` + `loadOverlay()` call at brainstorm startup | small |
| Wire domain resolution into specify | Add `resolveDomain()` + `loadOverlay()` call at specify startup | small |
| Wire domain resolution into review-specs | Add overlay merge into reviewer loading step | small |
| Wire domain resolution into validate | Add overlay merge into gate loading step | small |
| Wire domain resolution into implement | Add verification config loading at verification step | small |
| Write integration tests | Test each skill with and without overlays, verify fallback behavior | large |

## Acceptance Criteria

- [ ] All five skills call `resolveDomain()` once at startup; if result is `"software"`, no `loadOverlay()` call is made
- [ ] Brainstorm uses charter template overlay when domain provides one
- [ ] Specify uses spec template overlay when domain provides one
- [ ] Review-specs merges domain reviewer set with `replace` and `append` strategies
- [ ] Review-specs defaults to `append` when `merge_strategy` is omitted
- [ ] Review-specs emits a user-visible warning when `merge_strategy: replace` drops base reviewers
- [ ] Validate merges domain gate entries by `id` field (override matching IDs, append new IDs)
- [ ] Gate overrides of base gates emit a user-visible warning
- [ ] Gate commands execute via `execFile` (no-shell mode), not `exec`
- [ ] Gate entries without an `id` field are skipped with INVALID_GATE warning
- [ ] Implement uses domain verification config (output, flow, or visual type)
- [ ] `trigger_patterns` are interpreted as file glob patterns
- [ ] `tool` values are validated at config load time against the harness's active MCP server list
- [ ] Domain reviewer entries require `id`; optional fields inherit registry defaults
- [ ] All five skills fall back to base behavior when no overlay exists
- [ ] Overlay merge never mutates base templates or configs on disk
- [ ] Domain resolution runs exactly once per skill invocation
- [ ] Semantically malformed overlays (valid YAML, wrong fields) produce OVERLAY_MERGE_WARN warnings with fallback to base behavior
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
