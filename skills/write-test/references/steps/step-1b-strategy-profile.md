## Step 1b: Strategy Profile Resolution

**Domain-Aware Test Config:** Before resolving the test strategy, load domain-specific test config via the CLI:

```bash
adev domain load-test-config --module <module-slug> [--charter <charter-path>]
```

The verb resolves the active domain and emits a single JSON object on stdout:

```json
{ "domain": { "resolved_domain": "...", "source_level": "..." }, "config": { ... }, "warnings": [...] }
```

The `config` object includes `permitted_tools` (valid test frameworks for this domain), `max_test_file_size` (gaming detection threshold), and `skip_patterns` (regex patterns for detecting skipped tests).
Pass `config.permitted_tools` to `loadProfile()` for test framework detection.
Use `config.max_test_file_size` for gaming detection threshold.
Use `config.skip_patterns` for skipped test detection alongside the 4 shared cross-strategy gaming patterns.
Log any warnings from the `warnings` field.

Before writing any tests, resolve the test strategy for this task:

1. Read the task's `Strategy` field from the plan (set by `/adev:plan`'s Strategy Assignment step).
2. Call `getStrategyProfile(strategyId, profilesDir)` from `lib/test-strategies/profiles.mjs` to load the matching strategy profile.
3. If the profile loads successfully, use its rules for the remainder of this skill:
   - `red_exit_condition` replaces the hardcoded "test runner fails for behavioral reasons" check in RED State Verification
   - `gaming_blockers` replaces the 9 canonical blocking patterns in Gaming Violation Detection (strategy-specific patterns)
   - `assertion_rules` replaces the Mocking Boundary Declaration rules
   - `seed_data_rule` replaces the hardcoded seed data requirement
   - `handoff_format` replaces the default Handoff Block structure
   - `permitted_tools` informs which test frameworks are valid for this strategy
4. If the profile falls back to unit (missing profile, invalid strategy ID), log an advisory: "Profile for '<strategy>' not found — using unit profile as fallback" and proceed with unit rules.
5. When strategy is `unit`, behavior is identical to the existing hardcoded rules (the unit profile codifies all current write-test behavior).

**Profile fields are descriptive instructions consumed by this skill — no profile field is passed directly to a shell or exec API.**

In addition to the strategy-specific `gaming_blockers`, always check all 8 detectors from
`lib/test-strategies/gaming.mjs` — 4 shared cross-strategy patterns plus 4 integration-specific
patterns. **A `PreToolUse` hook (`hooks/gaming-gate.sh`) already re-runs these detectors on
every `Write`/`Edit` of a test file and hard-blocks a newly introduced violation before it
reaches disk — this list is a courtesy for the agent authoring tests, not the only
enforcement.**

Shared (apply to every test, any strategy):
- `DISABLED_TESTS` — `.skip(`, `xit(`, `xdescribe(`, `.todo(`
- `EMPTY_ASSERTIONS` — test bodies with no assertion calls
- `SWALLOWED_ASSERTIONS` — `try { expect } catch {}` without rethrow
- `CONDITIONAL_ASSERTIONS` — `if (cond) { expect }` without else

Integration-specific (apply when the resolved strategy is `integration`):
- `BOUNDARY_MOCKING` — mocking the specific infrastructure SDK the module under test wraps
- `CI_BYPASS` — `if (process.env.CI) { ... skip/return ... }`
- `CREDENTIAL_ABSENT_PASS` — instantiating an infra SDK client with no credential guard
- `AGENT_SKIP` — `.skipIf(`, `canConnect`, `skipUnless`, or infra-conditional `skip:` options

Shared pattern violations use prefix `SHARED:`, integration-specific violations use prefix
`INTEGRATION:`, strategy-specific `gaming_blockers` violations use the strategy name as prefix
(e.g., `SCHEMA:`). All are reported independently.

### Integration Strategy: Mandatory Infrastructure Requirements Block

When the resolved strategy is `integration`:

**Before authoring any test code**, emit the following Infrastructure Requirements block. This is required by the spec (Behavior 3) and validated by `/adev:validate`. Proceeding to RED without this block triggers `INTEGRATION_NO_REQUIREMENTS_BLOCK`.

Read the spec's `infra_requirements:` frontmatter field if present (authoritative). If absent, derive from the task's file paths and the Behavior 4 boundary table. Document env var names only — never record actual values, connection strings with embedded passwords, or any secret material.

```
## Infrastructure Requirements

**Strategy:** integration
**External systems:** <comma-separated list, e.g., "AWS S3, Postgres 15">

### Credentials / Environment Variables
> **Never record actual credential values here.** List env var names and descriptions only.
> Note: connection-string variables like DATABASE_URL embed credentials — treat as secrets.

| Variable | Description |
|----------|-------------|
| VAR_NAME | Purpose and where to obtain it (e.g., AWS IAM console — inject as CI secret) |

### Pre-Provisioned State
- [ ] <resource that must exist before tests run>

### Connectivity Requirements
- Test runner must reach <host/service> on <port/protocol>

### CI Notes
- These tests require real credentials — they CANNOT run without them
- Use a dedicated test account with scoped permissions (least privilege)
- Run with: `npm run test:integration` or `node --test --test-name-pattern "integration"`
- Expected run time: 30–120 seconds (network I/O dominates)
```

**Infrastructure setup errors are NOT valid RED:**
- Missing env vars → `INTEGRATION_NO_CREDENTIALS`: Fail with "Integration tests require credentials. Set the variables listed in the Infrastructure Requirements block before running."
- Unreachable host → `INTEGRATION_HOST_UNREACHABLE`: Fail with "External host unreachable — this is a setup error, not a test failure. Verify network access before interpreting this as a behavioral defect."

Resolve these setup errors before starting the TDD cycle.

**Default behavior when infrastructure is unavailable is test FAILURE, not skip.** The test connects directly to the external system. If the connection fails for any reason (missing credentials, wrong credentials, host down, port closed), the test fails with a runtime error. This is correct behavior — a test that cannot reach its infrastructure is a failing test.

**The agent must NEVER add skip guards** (`describe.skipIf`, `describe.skip`, `canConnect` checks, `skipUnless`, or `process.exit` before test blocks) to bypass infrastructure unavailability. Only the user may configure skip behavior — via an explicit `on_fail: skip` field in the spec's `infra_requirements` block or by direct request. Without that explicit configuration, the default is always hard failure.

---
