# Live Spec: Configurable Validate Check Registry

---
charter: validation
status: validated
risk_level: medium
revision: 3
charter-revision: 1
created: 2026-04-19
updated: 2026-05-04
depends-on:
  - .context-index/adrs/0003-configurable-review-registry.md
  - .context-index/adrs/0004-execution-profiles.md
  - .context-index/specs/cross-cutting/execution-profiles.md
  - .context-index/specs/features/unified-gates/unified-gate-system.md
source-manifest:
  files:
    - lib/governance/validate-config.mjs
    - lib/governance/quality-gate.mjs
    - lib/governance/context-pack.mjs
    - skills/validate/SKILL.md
    - templates/validate/defaults.yaml
  computed-at: "2026-05-10T23:51:35.315Z"
drift_detected: true
drift_source: skills/validate/SKILL.md
drift_at: 2026-05-16T00:17:38.940Z
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `manifest.yaml`, `constitution.md`, optionally governance files.
- `governance/gates.yaml` governs Check 1 (unchanged, owned by `unified-gates` charter).
- `plugin:validate/defaults.yaml` ships with the plugin and encodes today's Checks 1.5 and 2-12.
- Execution profiles loaded per cross-cutting spec.

### Behaviors

#### Registry Loading and Merge

1. **When** `/adev:validate` runs **then** before Check 2 it calls `loadValidateConfig(repoRoot)` from `lib/governance/validate-config.mjs`. Bundled defaults from `plugin:validate/defaults.yaml` load first; project `governance/validate.yaml` overlays. Entries merge by `id`: matching `id` overrides field-by-field; new `id` is appended.

2. **When** `governance/validate.yaml` does not exist **then** the merged config equals bundled defaults; Checks 2-12 behave identically to today's hardcoded prose.

3. **When** `governance/validate.yaml` contains a `checks:` list **then** each entry is validated. Required fields: `id`, `kind`. Optional fields: `enabled` (default: `true`), `severity` (defaults below), `fail_fast` (default: `false`), `tier`, `command`, `prompt`, `profile`, `context_pack`, `after`.

4. **When** a check entry has `enabled: false` **then** it is skipped with note: `"Check '<id>' skipped — disabled by governance/validate.yaml."` Does not contribute to verdict.

#### Canonical Check IDs

5. **When** bundled defaults load **then** the following IDs correspond to today's prose checks:
   - `validate.check-1.5-source-manifest`
   - `validate.check-2-spec-compliance`
   - `validate.check-3-charter-consistency`
   - `validate.check-4-constitution`
   - `validate.check-5-adrs`
   - `validate.check-6-cross-cutting`
   - `validate.check-7-specialist-review`
   - `validate.check-8-boundaries`
   - `validate.check-9-transition-gates`
   - `validate.check-10-platform-drift`
   - `validate.check-11-visual-verification`
   - `validate.check-12-heuristic-extraction`
   - Check 1 (quality gates) is not in this registry; it remains sourced from `governance/gates.yaml`.

#### Check Kinds

6. **When** a check has `kind: quality-gate` **then** it executes `command` in **argv form** (via `child_process.execFile` or equivalent) — **never** via a shell. The `command` field is a YAML list: `[<executable>, <arg>, <arg>, ...]`. No string form is accepted; no shell metacharacters are interpreted. The resolved `profile`'s env (cross-cutting Behavior 34) is passed as the subprocess environment. Exit code 0 is PASS; non-zero is FAIL. Exists for one-off gates outside the tiered fast/integration/e2e pipeline.

6a. **When** a `kind: quality-gate` entry's `command` is a string (not a list) **then** load fails: `"Check '<id>': quality-gate 'command' must be a YAML list of argv tokens (e.g. [npm, test, --, --silent]). Shell-form strings are rejected to prevent command injection."`

6b. **When** any `command` argv token contains a `{{ ... }}` interpolation placeholder, an environment-variable reference (`$VAR`, `${VAR}`, `%VAR%`), or any other templating syntax **then** load fails: `"Check '<id>': quality-gate 'command' argv tokens may not interpolate spec-derived, env-derived, or templated values. Argv is treated as a static constant. Values the subprocess needs come from the profile's resolved env via the process environment, not from argv substitution."` This is enforced by syntactic inspection at load — the loader never performs interpolation.

6c. **When** a `kind: quality-gate` entry attempts to set `shell: true`, `cwd` outside the repo root, or any other `child_process` option not explicitly whitelisted **then** load fails. The v1 whitelist is empty: the subprocess always runs with `shell: false`, `cwd` = consumer repo root, and `env` = profile-resolved env only (no inheritance from the invoking `.adev` shell beyond what the profile declares).

7. **When** a check has `kind: subagent-review` **then** it resolves `prompt` (subject to the `plugin:` URI rules from the reviewer spec) and `context_pack`, dispatches a subagent under the resolved `profile`, and treats the returned verdict as PASS/FAIL/WARN. Used for Checks 2, 3, 4, 5, 6, 7, 8, 9, 10.

8. **When** a check has `kind: deterministic-check` **then** it runs a bundled library function identified by `id` (e.g. `validate.check-1.5-source-manifest` calls `verifyManifest(specPath)` from `lib/source-manifest.mjs`). Projects may not register new `deterministic-check` entries in v1.

9. **When** a check has `kind: observational` **then** it runs but never affects the verdict; output appears under "Observations." Used for `validate.check-12-heuristic-extraction`.

10. **When** `kind` is not in `{quality-gate, subagent-review, deterministic-check, observational}` **then** load fails.

#### Profile Reference

11. **When** a `subagent-review` or `quality-gate` check has a `profile: <name>` field **then** the named execution profile is resolved via the cross-cutting spec. Tool permissions, env, MCP requirements, model tier, limits all come from the profile.

12. **When** a `subagent-review` check omits `profile` **then** `reviewer-capable` is the default.

13. **When** a `quality-gate` check omits `profile` **then** load fails: `"Check '<id>': kind 'quality-gate' requires an explicit 'profile'. Profiles describe subagent tool permissions; they do NOT sandbox the subprocess spawned by a quality-gate. Declare the subprocess privilege posture explicitly (e.g. profile: read-only if you acknowledge the subprocess will inherit OS-level privileges of the invoking user) to avoid a misleading default."` There is no implicit default — selecting `read-only` is a positive acknowledgement that the author understands profile permissions scope the adapter's tool surface, not the spawned subprocess.

13a. **When** a `quality-gate` check's resolved profile declares `env.allow.required` keys **then** those keys (and only those keys) form the subprocess environment, augmented by the minimal PATH, HOME, and locale entries required for the subprocess to start. No other environment variables from the invoking shell are inherited. Projects that need additional keys declare them in the profile's `env.allow.optional` list.

14. **When** a `subagent-review` check's profile requires an MCP server (e.g. `browser-review` for visual verification) and that server is not available in the current session **then** load fails per cross-cutting Behavior 17.

15. **When** `validate.check-11-visual-verification` is bundled **then** it ships with `profile: browser-review` so the Playwright MCP requirement is enforced at config-load time, not at dispatch time. Today's runtime failure mode is replaced by an upfront, actionable error.

#### Ordering and `after`

16. **When** all checks are loaded **then** they are topologically sorted by `after`. Cycles fail load.

17. **When** `after` references an unknown ID **then** WARN; treat as empty.

#### Fail-Fast and Severity

18. **When** Check 1 (quality gates) fails with error severity **then** today's behavior is preserved: Checks 2-10 are skipped, Check 11 follows its UI trigger rules, Check 12 is skipped. Enforced in `skills/validate/SKILL.md`, not by the registry.

19. **When** a registry check has `fail_fast: true` and fails with `severity: error` **then** all checks declaring it in their `after` chain are skipped: `"Skipped — prerequisite '<id>' failed."`

20. **When** a registry check has `severity: warning` **then** failure records WARN; verdict degrades to PASS_WITH_NOTES; no fail-fast.

21. **When** a registry check has `severity: info` **then** output is informational only (used for observational kinds).

#### Prompt and Context Pack (for `subagent-review`)

22. **When** a `subagent-review` check resolves its `prompt` field **then** the same resolution rules apply as in the reviewer spec: `plugin:<skill>/<file>` for current-plugin paths; relative paths resolve from `.context-index/`; absolute paths rejected; cross-plugin (`plugin:<other>:...`) fails load in v1.

23. **When** a `subagent-review` check references a `context_pack` **then** it resolves via the shared context-pack machinery (`lib/governance/context-pack.mjs`). Packs from `governance/review.yaml` and `governance/validate.yaml` share a namespace; collisions WARN with second-wins.

#### Multi-Repo Dispatch

24. **When** `/adev:validate` runs against a spec located in repo X within an `adev-workspace.yaml` context **then** env resolution for any check whose profile uses `env.files` follows the cross-cutting consumer-repo-local rule: paths resolve from repo X, regardless of the user's CWD.

25. **When** a check uses `$workspace/` prefixed paths in its profile **then** they resolve via the workspace root per cross-cutting Behavior 29. The `@` sigil is reserved for cross-repo spec references (`@<repo-slug>/<spec-slug>`, see `specs/features/multi-repo-workspace/charter.md`) and is never used for env-file paths.

#### Quality-Gate Output Redaction

25a. **When** a `kind: quality-gate` check captures subprocess stdout and stderr **then** the captured bytes pass through the cross-cutting redaction pipeline (execution-profiles Behavior 36) before any use — specifically before any of: write to `.validate.md`, write to the dispatch record, display to the user, or inclusion in the check-status aggregation. The pipeline is applied using the `redactionSet` built from the check's resolved profile env. No channel bypass is permitted; the quality-gate output path is an audited channel per execution-profiles Behavior 36.

25b. **When** redaction has been applied **then** the captured text is also bound to 64 KiB in the report (stdout and stderr combined); the tail is replaced with `"…[truncated <N> bytes — full redacted output in dispatch record]"`. The dispatch record retains the full (redacted) bytes.

#### Registry Emission in Report

26. **When** `/adev:validate` completes **then** the report's check summary lists every registered check by ID, status (PASS/FAIL/WARN/SKIP/SKIPPED-DISABLED), kind, and (for `subagent-review`/`quality-gate`) the profile used and prompt source.

### Postconditions

- Verdict computation unchanged: FAIL on any error-severity failure, PASS_WITH_NOTES on warnings-only, PASS otherwise. Observational checks never contribute.
- Projects without `governance/validate.yaml` see identical output to today's flow.
- `defaults.yaml` is the single source of truth for bundled check behavior; SKILL.md prose references the registry rather than re-describing each check.
- Profile-driven env resolution means a `quality-gate` check that needs `DATABASE_URL` declares it in its profile and gets it from the consumer repo's `.env` deterministically, not via shell-inheritance accident.

### Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| `governance/validate.yaml` malformed YAML | Load fails with line-cited parse error. |
| `subagent-review` check missing `prompt` | Load fails. |
| `deterministic-check` registered by project (not bundled) | Load fails with kind-restriction error. |
| Profile referenced does not exist | Load fails per cross-cutting spec. |
| Profile requires MCP server not available | Load fails per cross-cutting spec. |
| Required env keys missing for a check's profile | Load fails per cross-cutting spec. |
| Ordering cycle | Load fails. |
| All checks disabled | Skill runs Check 1 only, reports: `"No Checks 2-12 enabled — validation is quality-gates-only."` Exit 0 if gates pass. |

## System Constitution Reference

- **Principle #1:** Shared YAML parser, profile loader, and context-pack library with the reviewer spec. No new dependencies.
- **Principle #2:** SKILL.md prose for Checks 2-12 collapses to a single registry-driven section. Per-check intent is preserved as `name`/`description` on each entry in `defaults.yaml`.
- **Principle #5 (Version parity):** The version bump for this change happens at implementation time and applies to both `package.json` and `.claude-plugin/plugin.json`.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Extract `plugin:validate/defaults.yaml` | Encode Checks 1.5 and 2-12 as registry entries with `name`, `description`, `kind`, `profile`, `after`, and (for `subagent-review`) `prompt` + `context_pack`. Move per-check prompt text from SKILL.md into `skills/validate/prompts/<id>.md`. | large |
| Implement `lib/governance/validate-config.mjs` | Load, validate, merge, topologically sort. Reuses `lib/profiles/` and `lib/governance/context-pack.mjs`. | medium |
| Rewrite Checks 2-12 section of `skills/validate/SKILL.md` | Replace 500+ lines of prose with a registry-driven loop. Preserve fail-fast, severity semantics, Check 1 handling. | medium |
| Migrate Check 11 to `browser-review` profile | The Playwright MCP requirement becomes load-time-enforced. | small |
| `/adev:init` scaffolding | Write commented-out `governance/validate.yaml` template. | small |
| Tests | `tests/governance/validate-config.test.mjs`; integration test for zero-config behavior parity. | large |

## Acceptance Criteria

- [ ] Zero-config behavior: `/adev:validate` with no `governance/validate.yaml` produces a report identical to pre-change for at least one fixture spec.
- [ ] Disabling `validate.check-10-platform-drift` causes it to appear as `SKIPPED-DISABLED`; verdict unaffected by drift.
- [ ] A project-added `subagent-review` check with `after: [validate.check-2-spec-compliance]` runs after Check 2; profile + prompt source identified in report.
- [ ] A project cannot register a `deterministic-check` (rejected at load with clear error).
- [ ] `severity: warning` downgrades a FAIL to WARN without affecting verdict.
- [ ] Malformed YAML fails load with a line-cited error before Check 2.
- [ ] Check 11's profile (`browser-review`) is verified at load: missing Playwright MCP fails fast with the cross-cutting error message.
- [ ] `validate.check-12-heuristic-extraction` (observational) never contributes to verdict.
- [ ] Context packs are shared between `governance/review.yaml` and `governance/validate.yaml`; a pack defined in one is resolvable from the other.
- [ ] Multi-repo: validating a spec from another repo within an `adev-workspace.yaml` context resolves env per consumer-repo-local rule.
- [ ] A `quality-gate` check with `profile` declaring `env.allow.required` fails load if a required key is absent — replacing today's silent shell-inheritance behavior.
- [ ] A `quality-gate` check with string-form `command` fails load with the shell-form-rejected message (Behavior 6a).
- [ ] A `quality-gate` check whose argv contains `{{ ... }}`, `$VAR`, or `${VAR}` fails load with the no-interpolation message (Behavior 6b). The loader never performs substitution.
- [ ] A `quality-gate` check omitting `profile` fails load with the explicit-acknowledgement message (Behavior 13).
- [ ] A `quality-gate` check's captured stdout and stderr pass through the cross-cutting redaction pipeline before being written to `.validate.md` or the dispatch record. A fixture with a secret in stdout produces `<REDACTED:<KEY>>` in the report.
- [ ] A `quality-gate` check's subprocess runs with `shell: false` and an environment consisting only of profile-resolved keys plus the minimal startup set (Behavior 13a); a fixture verifies arbitrary invoking-shell env vars do not leak.
- [ ] All quality gates pass.
- [ ] No constitutional violations.
