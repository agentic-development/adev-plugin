---
charter: infra-preflight
status: validated
risk_level: medium
milestone:
revision: 3
charter-revision: 1
created: 2026-05-01
updated: 2026-05-04
source-manifest:
  files:
    - lib/infra-preflight.mjs
  computed-at: "2026-05-10T23:51:01.456Z"
---

# Live Spec: Verification Runner and Schema Extension

**Capabilities covered:** Verification Runner, Schema Extension, Per-System Check Level Override, Probe Timeout Configuration

> **Scope note:** This spec covers the core library and schema. Skill integration (adding the preflight step to implement, validate, build, write-test, debug, eval, recover SKILL.md files) is covered by a sibling spec. The `--no-infra` flag is received by skills and passed to `runPreflight()` as `options.noInfra` — this spec defines the library's behavior when that option is set; the sibling spec defines how skills parse the flag from user input.

**Capability:** A generic infrastructure verification runner (`lib/infra-preflight.mjs`) that parses `infra_requirements` declarations from spec and plan frontmatter, runs env var presence checks, CLI tool PATH/version checks, and connectivity probe commands, and returns a structured PreflightReport. The `infra_requirements` schema is extended with `cli_tools[]`, `probe`, `check_level`, and `env_file` verification fields.

> **ADR prerequisite:** This spec introduces `@dotenvx/dotenvx` as a dev dependency. An ADR must be approved before implementation of any dotenvx-dependent behavior begins. The ADR must verify: (1) dotenvx does not make network calls during `.env` loading, (2) version is pinned with integrity hash in `package.json`, (3) dependency is dev-only and excluded from the published package via `files` field or `.npmignore`. If dotenvx cannot satisfy (1), replace with a minimal custom `.env` parser using Node.js `fs`.

## Behavioral Contract

### Preconditions

- One or both of spec/plan file paths are provided to `runPreflight()`. If both are provided, systems are merged with plan values winning on name conflict. Either path may be `null` to indicate "not available."
- The provided file(s) exist and contain YAML frontmatter

### Behaviors

**1. Parse and merge infra_requirements**

**When** `runPreflight(specPath, planPath, options)` is called with both a spec and plan path (both non-null) **then** it reads `infra_requirements.systems[]` from both files' YAML frontmatter, merges them into a union deduplicated by `name`, and uses **plan values** when the same system name appears in both (plan wins on conflict).

**When** only one path is provided (the other is `null`) **then** it reads `infra_requirements` from that file only.

**When** neither file contains `infra_requirements` **then** `runPreflight()` returns `{ passed: true, systems: [], skipped: false }` immediately (no checks needed — backward compatible).

**2. No-infra bypass**

**When** `options.noInfra` is `true` **then** `runPreflight()` skips all system checks and returns `{ passed: true, systems: [], skipped: true }` immediately.

**When** `options.noInfra` is `false` or not provided **then** `runPreflight()` proceeds with all checks normally. The library must never default `noInfra` to `true` — it must only accept it as explicit caller input. This enforces the charter invariant that only the user can bypass the preflight.

**3. Load environment variables via dotenvx**

**When** `infra_requirements` declares a top-level `env_file` field **then** the runner validates that the resolved path (`path.resolve(projectRoot, env_file)`) is within the project root. The containment check requires that the resolved path starts with `projectRoot + path.sep`, or equals `projectRoot` exactly — this prevents prefix-collision bypasses (e.g., `/app-secrets/` falsely matching a `projectRoot` of `/app`). If valid, it loads the file using dotenvx before running any checks. If the path escapes the project root, the runner rejects it with error code `PREFLIGHT_UNSAFE_ENV_FILE` and does not attempt to read the file.

**When** no `env_file` is declared **then** the runner defaults to loading `.env.test` from the project root if it exists. If `.env.test` does not exist, it proceeds with `process.env` only (no error).

**When** the declared `env_file` does not exist (and the path is within project root) **then** the runner emits a warning ("env file not found: <relative-path>") and proceeds with `process.env` only.

**When** `@dotenvx/dotenvx` is not installed **then** the runner emits a warning: "dotenvx not found — env files will not be loaded. Install with: npm i -D @dotenvx/dotenvx". It proceeds with `process.env` only. This is the graceful degradation path.

**4. Environment variable presence check**

**When** a system declares `env_vars: [VAR1, VAR2]` **then** the runner checks each variable is defined and non-empty in the resolved environment (`process.env.VAR !== undefined && process.env.VAR !== ''`). Missing or empty variables are reported in `missing_env_vars[]` and `env_vars_ok` is set to `false`.

**5. CLI tool existence and version check**

**When** a system declares `cli_tools: ["psql"]` (string form) **then** the runner validates the tool name matches `[a-zA-Z0-9._-]+` (reject names containing spaces, path separators, or shell metacharacters with `PREFLIGHT_INVALID_TOOL`). If valid, it checks the tool exists on PATH via `child_process.execFileSync('which', [toolName])`. Missing tools are reported in `missing_tools[]`.

**When** a system declares `cli_tools: [{ name: "psql", version: ">=15" }]` (object form) **then** the runner validates the `name` field against the same `[a-zA-Z0-9._-]+` pattern, checks existence via `which`, AND runs `child_process.execFileSync(toolPath, ['--version'])` (using `execFileSync` — no shell). It extracts the first semver-like token (`\d+\.\d+(\.\d+)?`) from combined stdout/stderr. If no token is found, it emits `PREFLIGHT_INVALID_VERSION` warning and reports existence only (version check skipped). If a token is found, it compares against the declared semver constraint. Version mismatch is reported as a failure with the found version and required constraint.

**When** a system declares `cli_tools` with a mix of string and object entries **then** both forms are accepted in the same array.

**6. Probe command execution**

**When** a system declares `probe: "pg_isready -h $DB_HOST"` **then** the runner executes the command using `child_process.execFileSync` with **no shell**. The probe string is first split on whitespace into argv tokens. Then `$VAR` references (matching `$[A-Z_][A-Z0-9_]*`) are substituted **per-token** (not on the full string before splitting), so that env var values containing spaces are treated as single arguments and cannot introduce new argv tokens. The first token is the command, the rest are arguments. Exit code 0 = pass, non-zero = fail.

This approach eliminates the shell injection surface entirely. Only simple `$VAR` expansion is supported — no `${VAR:-default}`, no `$()`, no pipes, no redirects, no chaining. If a probe requires complex shell features, the user should wrap it in a script file and reference the script as the probe command.

**When** a probe command's first token (the command name) is not found on PATH **then** the runner reports `probe_ok: false` with `probe_error: "command not found: <command>"`.

**When** a probe command exceeds the timeout **then** the runner kills the process and reports `probe_ok: false` with `probe_error: "timeout after <N>s"`.

**When** prerequisite checks (env vars or CLI tools) fail for a system **then** the runner skips the probe for that system and reports `probe_ok: null` with `probe_error: "skipped — prerequisites failed"`. This applies regardless of `check_level` — if `check_level` is `"full"` and env vars fail, the probe is still skipped for that system.

**7. Per-system check level override**

**When** a system declares `check_level: "presence-only"` **then** only env var and CLI tool checks run; the probe is skipped (even if declared). `probe_ok` is set to `null` with `probe_error: "skipped — check_level: presence-only"`.

**When** a system declares `check_level: "skip"` **then** all checks for that system are skipped. The SystemCheckResult for that system has all `_ok` fields set to `null` and a top-level `skipped: true`.

**When** a system has no `check_level` or `check_level: "full"` **then** all declared checks run (env vars, CLI tools, probe). This is the default.

**8. Probe timeout configuration**

**When** a system declares `timeout: 5` **then** its probe uses a 5-second timeout instead of the default.

**When** `options.timeout` is passed to `runPreflight()` **then** it overrides the default timeout for all systems that do not declare their own.

**When** `manifest.yaml` declares `infra_preflight.default_timeout` **then** it serves as the project-level default. Priority chain: system-level `timeout` > `options.timeout` > `manifest.infra_preflight.default_timeout` > hardcoded 10s.

**When** neither system-level `timeout` nor `options.timeout` nor manifest default is set **then** the default is 10 seconds.

**9. Structured PreflightReport**

**When** all system checks pass **then** `runPreflight()` returns a PreflightReport with `passed: true`.

**When** any system check fails **then** `runPreflight()` returns a PreflightReport with `passed: false`.

The return schema:

```typescript
interface PreflightReport {
  passed: boolean;              // true if all systems passed or were skipped
  systems: SystemCheckResult[]; // one entry per declared system
  skipped: boolean;             // true only when options.noInfra was set
}

interface SystemCheckResult {
  name: string;                 // system name from infra_requirements
  skipped: boolean;             // true when check_level: "skip"
  env_vars_ok: boolean | null;  // null when skipped
  missing_env_vars: string[];   // names of missing/empty vars
  cli_tools_ok: boolean | null; // null when skipped
  missing_tools: string[];      // names of missing tools
  version_mismatches: Array<{   // tools with wrong version
    tool: string;
    required: string;
    found: string;
  }>;
  probe_ok: boolean | null;     // null when skipped or prerequisites failed
  probe_error: string | null;   // sanitized error (max 200 chars, no ANSI codes)
  probe_duration_ms: number | null; // elapsed time for probe execution
}
```

**10. Formatted output**

**When** `formatPreflightReport(report)` is called **then** it renders a human-readable markdown block with per-system pass/fail using checkmarks, showing env var names (never values), CLI tool versions, probe results with timing, and a final blocking/passing summary line. All file paths in the output are project-root-relative.

**11. Security: no secret leakage**

**When** capturing probe output **then** stdout and stderr are truncated to 200 characters **at capture time** (before storing in `SystemCheckResult.probe_error`). ANSI escape codes and control characters are stripped before truncation. The truncated, sanitized string is the only form stored — raw output is never retained in memory or on disk.

**When** formatting the report **then** env var names are shown but their values are never included. The `probe_error` field is the pre-sanitized 200-char maximum string from capture time.

### Postconditions

- A `PreflightReport` object is returned with deterministic pass/fail per system
- No side effects beyond reading files and running probe commands
- No secret values in the report output or in any stored `SystemCheckResult` field

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Spec/plan file does not exist | Throw with message: "File not found: <relative-path>" (project-root-relative) | `PREFLIGHT_FILE_NOT_FOUND` |
| YAML frontmatter cannot be parsed | Throw with message: "Failed to parse frontmatter: <relative-path>" | `PREFLIGHT_PARSE_ERROR` |
| `cli_tools` entry has invalid format (not string or `{ name, version }`) | Skip entry, emit warning: "Invalid cli_tools entry: <value>" | `PREFLIGHT_INVALID_TOOL` |
| `cli_tools` name contains characters outside `[a-zA-Z0-9._-]` | Skip entry, emit warning: "Invalid tool name: <name> — must match [a-zA-Z0-9._-]+" | `PREFLIGHT_INVALID_TOOL` |
| `check_level` has unrecognized value | Default to `"full"`, emit warning: "Unknown check_level '<value>' for <system> — defaulting to full" | `PREFLIGHT_UNKNOWN_CHECK_LEVEL` |
| `version` constraint in `cli_tools` is not valid semver range | Skip version check, report existence only, emit warning | `PREFLIGHT_INVALID_VERSION` |
| `--version` output contains no semver-like token | Skip version check, report existence only, emit warning: "Could not parse version from <tool> --version output" | `PREFLIGHT_INVALID_VERSION` |
| `env_file` path resolves outside project root | Reject with: "env_file path escapes project root: <relative-path>". Do not attempt to read the file. | `PREFLIGHT_UNSAFE_ENV_FILE` |
| dotenvx not installed | Emit warning: "dotenvx not found — env files will not be loaded. Install with: npm i -D @dotenvx/dotenvx". Proceed with process.env only. | `PREFLIGHT_NO_DOTENVX` |

## System Constitution Reference

- **"Minimize external dependencies"** — This spec introduces one new dependency (`@dotenvx/dotenvx`). An ADR must be created and approved before implementation begins. The dependency is dev-only, must not make network calls during `.env` loading, must be version-pinned with integrity hash, and must be excluded from the published package. If these criteria cannot be satisfied, a minimal custom `.env` parser using Node.js `fs` must be used instead.
- **"Skills are primarily markdown"** — `lib/infra-preflight.mjs` is companion code. Skills remain functional without it (degraded: emit warning, suggest `--no-infra`). The SKILL.md instructions explain when and how to invoke the runner.
- **"Pure ESM"** — `lib/infra-preflight.mjs` uses ESM imports and exports.

## Extended Schema

The `infra_requirements` block in spec/plan frontmatter is extended with verification fields. This spec layers runtime verification on top of the existing plan-infra-requirements spec (test-strategies charter), which defines the planning-phase schema. The extension is additive — existing specs without the new fields continue to work with env var checks only.

```yaml
infra_requirements:
  env_file: ".env.test"                    # Optional. Path to env file (must be within project root). Default: .env.test
  systems:
    - name: "Postgres 15"                  # Required. Human-readable system name.
      env_vars: [DATABASE_URL]             # Optional. Env vars to check (names only).
      cli_tools:                           # Optional. CLI tools to verify.
        - psql                             # String form: existence check only
        - name: docker                     # Object form: existence + version check
          version: ">=24"
      probe: "pg_isready -h $DB_HOST"      # Optional. Connectivity command (exit 0 = pass). Only $VAR expansion supported — no pipes, redirects, or chaining.
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
| Create `lib/infra-preflight.mjs` with `parseInfraRequirements()` | Parse YAML frontmatter, extract and validate `infra_requirements` block, support merge of spec + plan with plan-wins-on-conflict deduplication | medium |
| Implement env var presence checks | Loop `env_vars[]`, check non-empty in dotenvx-resolved env | small |
| Implement dotenvx env file loading | Load `.env.test` by default or declared `env_file` via dotenvx; validate path within project root; graceful degradation when dotenvx unavailable | medium |
| Implement CLI tool checks | `execFileSync('which', [name])` for existence; `execFileSync(path, ['--version'])` for versioned entries; extract first semver token via `\d+\.\d+(\.\d+)?` regex; validate tool names against `[a-zA-Z0-9._-]+` | medium |
| Implement probe execution | `execFileSync` with manual `$VAR` substitution (no shell), timeout, capture-time output sanitization (200 char, strip ANSI) | medium |
| Implement `runPreflight()` orchestrator | Compose parse → noInfra check → dotenvx load → per-system checks (with cascading skip and check_level) → aggregate into PreflightReport | medium |
| Implement `formatPreflightReport()` | Render markdown output with checkmarks, timing, actionable error messages, project-root-relative paths | small |
| Implement manifest timeout resolution | Read `infra_preflight.default_timeout` from manifest.yaml; integrate into timeout priority chain | small |
| Add `@dotenvx/dotenvx` dependency + ADR | Add dev dependency (pinned version, integrity hash, excluded from published package), create ADR justifying it with security verification criteria | small |
| Update live-spec template | Add `cli_tools`, `probe`, `check_level`, `timeout`, `env_file` as commented examples in the `infra_requirements` block | small |
| Write tests for all behaviors | Unit tests covering parse, merge, noInfra bypass, env checks, CLI checks (name validation, version parsing), probe execution (substitution, timeout, cascading skip), check_level overrides, security (path traversal, output sanitization) | large |

## Acceptance Criteria

- [ ] `parseInfraRequirements(filePath)` extracts `infra_requirements` from YAML frontmatter and returns structured InfraRequirement objects, or `null` if none declared
- [ ] `runPreflight(specPath, planPath, options)` merges systems from both files, deduplicated by `name`, plan wins on conflict
- [ ] `runPreflight()` with `options.noInfra: true` returns `{ passed: true, systems: [], skipped: true }` without running any checks
- [ ] `runPreflight()` never defaults `noInfra` to `true` — only accepts it as explicit caller input
- [ ] Env var presence checks verify variables are defined and non-empty
- [ ] CLI tool names are validated against `[a-zA-Z0-9._-]+`; invalid names are rejected with `PREFLIGHT_INVALID_TOOL`
- [ ] CLI tool checks verify existence on PATH via `execFileSync('which', [name])`; versioned entries run `execFileSync(path, ['--version'])` and extract the first semver-like token via `\d+\.\d+(\.\d+)?` regex
- [ ] If `--version` output contains no semver token, version check is skipped with `PREFLIGHT_INVALID_VERSION` warning (existence-only result)
- [ ] Probe commands execute via `execFileSync` with no shell — `$VAR` references are substituted manually from the resolved environment before execution
- [ ] Probes are skipped when prerequisite checks (env vars or CLI tools) fail for that system
- [ ] `check_level: "presence-only"` skips probes; `check_level: "skip"` skips all checks for that system
- [ ] Probe timeout defaults to 10s, overridable at system level, options level, and manifest level (system > options > manifest > default)
- [ ] dotenvx loads `.env.test` by default, or the declared `env_file`; falls back to `process.env` if file missing or dotenvx unavailable
- [ ] `env_file` paths are validated to be within project root; paths escaping the root are rejected with `PREFLIGHT_UNSAFE_ENV_FILE`
- [ ] Probe stdout/stderr is truncated to 200 characters and stripped of ANSI codes **at capture time**, not at format time
- [ ] `SystemCheckResult.probe_error` stores only the pre-sanitized 200-char string — raw output is never retained
- [ ] `formatPreflightReport()` produces human-readable markdown with per-system pass/fail, never exposing env var values, using project-root-relative paths
- [ ] No `infra_requirements` in the file → returns `{ passed: true, systems: [], skipped: false }` immediately (backward compatible)
- [ ] PreflightReport and SystemCheckResult match the TypeScript schemas defined in Behavior 9
- [ ] ADR created and approved justifying `@dotenvx/dotenvx` dependency (must verify: no network calls, pinned version, dev-only)
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
