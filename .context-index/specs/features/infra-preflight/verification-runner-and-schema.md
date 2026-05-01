---
charter: infra-preflight
status: review-pending
risk_level: medium
milestone: 1
revision: 1
charter-revision: 1
created: 2026-05-01
updated: 2026-05-01
---

# Live Spec: Verification Runner and Schema Extension

**Capabilities covered:** Verification Runner, Schema Extension, Per-System Check Level Override, Probe Timeout Configuration

**Capability:** A generic infrastructure verification runner (`lib/infra-preflight.mjs`) that parses `infra_requirements` declarations from spec and plan frontmatter, runs env var presence checks, CLI tool PATH/version checks, and connectivity probe commands, and returns a structured PreflightReport. The `infra_requirements` schema is extended with `cli_tools[]`, `probe`, `check_level`, and `env_file` verification fields.

## Behavioral Contract

### Preconditions

- A spec or plan file path is provided to `runPreflight()`
- The file exists and contains YAML frontmatter
- `@dotenvx/dotenvx` is available as a dev dependency (for `.env` file loading)

### Behaviors

**1. Parse and merge infra_requirements**

**When** `runPreflight(specPath, planPath, options)` is called with both a spec and plan path **then** it reads `infra_requirements.systems[]` from both files' YAML frontmatter, merges them into a union deduplicated by `name`, and uses **plan values** when the same system name appears in both (plan wins on conflict).

**When** only one path is provided (spec or plan) **then** it reads `infra_requirements` from that file only.

**When** neither file contains `infra_requirements` **then** `runPreflight()` returns `{ passed: true, systems: [], skipped: false }` immediately (no checks needed — backward compatible).

**2. Load environment variables via dotenvx**

**When** `infra_requirements` declares a top-level `env_file` field **then** the runner loads that file using dotenvx before running any checks.

**When** no `env_file` is declared **then** the runner defaults to loading `.env.test` from the project root if it exists. If `.env.test` does not exist, it proceeds with `process.env` only (no error).

**When** the declared `env_file` does not exist **then** the runner emits a warning ("env file not found: <path>") and proceeds with `process.env` only.

**3. Environment variable presence check**

**When** a system declares `env_vars: [VAR1, VAR2]` **then** the runner checks each variable is defined and non-empty in the resolved environment (`process.env.VAR !== undefined && process.env.VAR !== ''`). Missing or empty variables are reported in `missing_env_vars[]`.

**4. CLI tool existence and version check**

**When** a system declares `cli_tools: ["psql"]` (string form) **then** the runner checks the tool exists on PATH via `which`. Missing tools are reported in `missing_tools[]`.

**When** a system declares `cli_tools: [{ name: "psql", version: ">=15" }]` (object form) **then** the runner checks existence via `which` AND runs `<tool> --version`, parses the version number, and compares against the declared semver constraint. Version mismatch is reported as a failure with the found version and required constraint.

**When** a system declares `cli_tools` with a mix of string and object entries **then** both forms are accepted in the same array.

**5. Probe command execution**

**When** a system declares `probe: "pg_isready -h $DB_HOST"` **then** the runner executes the command via `child_process.execSync` with `shell: true` (enabling env var expansion), using the dotenvx-resolved environment. Exit code 0 = pass, non-zero = fail.

**When** a probe command exceeds the timeout **then** the runner kills the process and reports `probe_ok: false` with `probe_error: "timeout after <N>s"`.

**When** prerequisite checks (env vars or CLI tools) fail for a system **then** the runner skips the probe for that system and reports `probe_ok: null` with `probe_error: "skipped — prerequisites failed"`.

**6. Per-system check level override**

**When** a system declares `check_level: "presence-only"` **then** only env var and CLI tool checks run; the probe is skipped (even if declared).

**When** a system declares `check_level: "skip"` **then** all checks for that system are skipped. The system appears in the report as `skipped: true`.

**When** a system has no `check_level` or `check_level: "full"` **then** all declared checks run (env vars, CLI tools, probe). This is the default.

**7. Probe timeout configuration**

**When** a system declares `timeout: 5` **then** its probe uses a 5-second timeout instead of the default.

**When** `options.timeout` is passed to `runPreflight()` **then** it overrides the default timeout for all systems that do not declare their own.

**When** neither system-level `timeout` nor `options.timeout` is set **then** the default is 10 seconds.

**When** `manifest.yaml` declares `infra_preflight.default_timeout` **then** it serves as the project-level default, overridden by `options.timeout` and system-level `timeout`. Priority: system > options > manifest > hardcoded 10s.

**8. Structured PreflightReport**

**When** all system checks pass **then** `runPreflight()` returns `{ passed: true, systems: [...], skipped: false }` where each system entry is a `SystemCheckResult`.

**When** any system check fails **then** `runPreflight()` returns `{ passed: false, systems: [...], skipped: false }` with failure details per system.

**9. Formatted output**

**When** `formatPreflightReport(report)` is called **then** it renders a human-readable markdown block with per-system pass/fail using checkmarks, showing env var names (never values), CLI tool versions, probe results with timing, and a final blocking/passing summary line.

**10. Security: no secret leakage**

**When** formatting the report **then** env var names are shown but their values are never included. Probe command stderr/stdout is truncated to 200 characters to avoid leaking sensitive output.

### Postconditions

- A `PreflightReport` object is returned with deterministic pass/fail per system
- No side effects beyond reading files and running probe commands
- No secret values in the report output

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Spec/plan file does not exist | Throw with message: "File not found: <path>" | `PREFLIGHT_FILE_NOT_FOUND` |
| YAML frontmatter cannot be parsed | Throw with message: "Failed to parse frontmatter: <path>" | `PREFLIGHT_PARSE_ERROR` |
| `cli_tools` entry has invalid format (not string or `{ name, version }`) | Skip entry, emit warning: "Invalid cli_tools entry: <value>" | `PREFLIGHT_INVALID_TOOL` |
| Probe command contains shell metacharacters beyond env var expansion (`|`, `;`, `&&`, backticks) | Block probe execution, report: "Probe blocked — disallowed shell operators" | `PREFLIGHT_UNSAFE_PROBE` |
| `check_level` has unrecognized value | Default to `"full"`, emit warning: "Unknown check_level '<value>' for <system> — defaulting to full" | `PREFLIGHT_UNKNOWN_CHECK_LEVEL` |
| `version` constraint in `cli_tools` is not valid semver range | Skip version check, report existence only, emit warning | `PREFLIGHT_INVALID_VERSION` |
| dotenvx not installed | Emit warning: "dotenvx not found — env files will not be loaded. Install with: npm i -D @dotenvx/dotenvx". Proceed with process.env only. | `PREFLIGHT_NO_DOTENVX` |

## System Constitution Reference

- **"Minimize external dependencies"** — This spec introduces one new dependency (`@dotenvx/dotenvx`). An ADR must be created to justify it. The dependency is dev-only and provides secure `.env` file loading that would otherwise require a custom parser.
- **"Skills are primarily markdown"** — `lib/infra-preflight.mjs` is companion code. Skills remain functional without it (degraded: emit warning, suggest `--no-infra`). The SKILL.md instructions explain when and how to invoke the runner.
- **"Pure ESM"** — `lib/infra-preflight.mjs` uses ESM imports and exports.

## Extended Schema

The `infra_requirements` block in spec/plan frontmatter is extended with these fields:

```yaml
infra_requirements:
  env_file: ".env.test"                    # Optional. Path to env file. Default: .env.test
  systems:
    - name: "Postgres 15"                  # Required. Human-readable system name.
      env_vars: [DATABASE_URL]             # Optional. Env vars to check (names only).
      cli_tools:                           # Optional. CLI tools to verify.
        - psql                             # String form: existence check only
        - name: docker                     # Object form: existence + version check
          version: ">=24"
      probe: "pg_isready -h $DB_HOST"      # Optional. Connectivity command (exit 0 = pass).
      check_level: full                    # Optional. "full" (default) | "presence-only" | "skip"
      timeout: 5                           # Optional. Probe timeout in seconds (default: 10).
      notes: "Test DB, migrated before schema tests"  # Optional. Human-readable guidance.
  ci_tag: "integration"                    # Optional. Tag for CI filtering.
  on_fail: "fail"                          # Optional. "fail" (default) | "skip" (user-only).
```

All existing fields from the plan-infra-requirements spec (`name`, `env_vars`, `notes`, `ci_tag`, `on_fail`) are preserved. New fields (`cli_tools`, `probe`, `check_level`, `timeout`, `env_file`) are additive and optional — specs authored before this extension continue to work (env var checks only).

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create `lib/infra-preflight.mjs` with `parseInfraRequirements()` | Parse YAML frontmatter, extract and validate `infra_requirements` block, support merge of spec + plan | medium |
| Implement env var presence checks | Loop `env_vars[]`, check non-empty in dotenvx-resolved env | small |
| Implement CLI tool checks | `which` for existence, `--version` parsing + semver comparison for versioned entries | medium |
| Implement probe execution | `execSync` with shell, timeout, env var expansion, unsafe command blocking, stderr truncation | medium |
| Implement `runPreflight()` orchestrator | Compose parse → dotenvx load → per-system checks (with cascading skip) → aggregate into PreflightReport | medium |
| Implement `formatPreflightReport()` | Render markdown output with checkmarks, timing, actionable error messages | small |
| Add `@dotenvx/dotenvx` dependency + ADR | Add dev dependency, create ADR justifying it | small |
| Update live-spec template | Add `cli_tools`, `probe`, `check_level`, `timeout`, `env_file` as commented examples in the `infra_requirements` block | small |
| Write tests for all behaviors | Unit tests covering parse, merge, env checks, CLI checks, probe execution, cascading skip, timeout, security | large |

## Acceptance Criteria

- [ ] `parseInfraRequirements(filePath)` extracts `infra_requirements` from YAML frontmatter and returns structured InfraRequirement objects, or `null` if none declared
- [ ] `runPreflight(specPath, planPath)` merges systems from both files, deduplicated by `name`, plan wins on conflict
- [ ] Env var presence checks verify variables are defined and non-empty
- [ ] CLI tool checks verify existence on PATH via `which`; versioned entries also check `--version` output against semver constraint
- [ ] Probe commands execute with `shell: true` and dotenvx-resolved environment; exit 0 = pass, non-zero = fail
- [ ] Probe commands with shell metacharacters (`|`, `;`, `&&`, backticks) beyond env var expansion are blocked
- [ ] Probes are skipped when prerequisite checks (env vars or CLI tools) fail for that system
- [ ] `check_level: "presence-only"` skips probes; `check_level: "skip"` skips all checks for that system
- [ ] Probe timeout defaults to 10s, overridable at system level, options level, and manifest level (system > options > manifest > default)
- [ ] dotenvx loads `.env.test` by default, or the declared `env_file`; falls back to `process.env` if file missing or dotenvx unavailable
- [ ] `formatPreflightReport()` produces human-readable markdown with per-system pass/fail, never exposing env var values
- [ ] Probe stderr/stdout is truncated to 200 characters in the report
- [ ] No `infra_requirements` in the file → returns `{ passed: true }` immediately (backward compatible)
- [ ] ADR created justifying `@dotenvx/dotenvx` dependency
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
