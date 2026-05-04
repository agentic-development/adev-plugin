---
name: adev:write-test
description: "TDD test authoring: write failing tests (RED phase), produce immutable handoff blocks, and detect specification gaming. Use before implementation. In OpenCode, invoke with skill({ name: 'adev:write-test' })"
---

# adev:write-test

**Identity:** TDD integrity specialist. Authors failing tests (RED phase), produces immutable handoff blocks, detects specification gaming, enforces mocking boundaries, and verifies post-GREEN test tamper.

---

## Invocation Modes

```
adev:write-test --red --spec <path>           # Author tests from a Live Spec
adev:write-test --red --file <path>           # Author tests from a source file's interface
adev:write-test --red "<description>"         # Author tests from free-form behavioral description
adev:write-test --verify --packet <path>      # Post-GREEN tamper check against Handoff Block
adev:write-test --red --spec <path> --no-infra  # Skip infrastructure preflight (user-only)
```

Standalone invocation (any `--red` mode) presents a **pre-flight** summary before authoring.
Dispatched by `adev:implement` (no pre-flight summary — context already confirmed).

---

## Step 0: Standalone Pre-flight

When invoked directly (not dispatched by `adev:implement`):

1. Detect framework (Step 2) and report the result.
2. Show a pre-flight summary:
   ```
   Framework:       <detected framework>
   Target:          <spec path / file path / "inline-description">
   Est. contracts:  <N behavioral statements → N-M tests>
   Output path:     .context-index/packets/<slug>-tests.md
                    (fallback: ./packets/<slug>-tests.md if .context-index/ absent)
   ```
3. Ask: "Proceed? (y/N)"
4. If the user cancels, stop cleanly.

**`.context-index/`-free operation:** If `.context-index/` does not exist, proceed without constitution or spec context. Apply all enforcement rules independently. Write the Handoff Block to `./packets/<slug>-tests.md`.

**Input validation:**
- No input provided → block with: "Usage: adev:write-test --red --spec <path> | --file <path> | \"<description>\"" — `MISSING_INPUT`
- `--spec` and `--file` both provided → block with: "Modes are mutually exclusive. Use --spec OR --file, not both." — `AMBIGUOUS_INPUT`
- `--file <path>` is a directory → block with: "Expected a file, got a directory: <path>" — `INVALID_TARGET`
- Free-form description is too vague → ask one clarifying question before proceeding

---

## Step 1: Model Tier Resolution

Before any subagent dispatch, read `model_tiers` from `.context-index/platform-context.yaml`:

```yaml
model_tiers:
  fast:      # low-stakes: pattern matching, diffs, semantic comparison, gaming detection
  capable:   # high-stakes: code generation, test authoring, behavioral reasoning
  reasoning: # highest-stakes: architecture review, cross-cutting analysis
```

**Tier assignments for this skill:**
- RED phase test authoring subagent → `capable` tier
- `--verify` semantic diff subagent → `fast` tier
- Gaming violation judgment subagent (edge cases) → `fast` tier

**Fallback behavior** (when `model_tiers` is absent or a tier value is empty):

The canonical hardcoded defaults for each tier are defined in `.context-index/specs/cross-cutting/model-routing.md`. Do not hardcode model names in this file. When a tier is unset:
- Resolution order: tier-specific value → `capable` value → hardcoded default from the model-routing spec.

Log a one-time advisory when fallback is active: "model_tiers not configured in platform-context.yaml — using hardcoded defaults. See .context-index/specs/cross-cutting/model-routing.md for default values."

**This skill never contains hardcoded model names.** Use only tier names (`fast`, `capable`, `reasoning`) in all subagent dispatch instructions.

---

## Step 1a: Infrastructure Preflight

After model tier resolution, check whether the spec declares `infra_requirements`. If so, run the infrastructure preflight before proceeding to strategy resolution.

**Dispatch detection:** If `ADEV_DISPATCHED_BY=implement` is set in the environment, skip the preflight step entirely (implement already verified infrastructure). The agent must not set `ADEV_DISPATCHED_BY=implement` except when dispatching from implement.

**Strategy-aware skip:** If the resolved test strategy is `unit`, skip the preflight step regardless of `infra_requirements`. Unit tests do not exercise external infrastructure.

**`--no-infra` resolution:** Read `--no-infra` flag from arguments. If not passed, check `ADEV_NO_INFRA` env var (only exact value `1` activates bypass). Read once at skill entry, convert to `options.noInfra`. The agent must never set `--no-infra` or `ADEV_NO_INFRA` autonomously — if preflight fails, report the failure and wait for user direction.

**Invocation:** Run inline Node.js (same pattern as model tier resolution):

```bash
node --input-type=module -e "
import { runPreflight, formatPreflightReport } from '<ADEV_ROOT>/lib/infra-preflight.mjs';
const report = await runPreflight('<specPath>', null, { timeout: 10, noInfra: <noInfra> });
console.log(JSON.stringify(report));
"
```

Where `<ADEV_ROOT>` is the resolved absolute plugin root path and `<specPath>` is the `--spec` argument.

If `report.passed === false`, display the formatted report and block:

```
Infrastructure Preflight: FAILED

<formatted report output>

Execution blocked. Options:
  1. Fix the issues above and retry
  2. Re-run with --no-infra to bypass (user decision only)
```

If `report.passed === true` and `report.skipped === true`, emit: "Infrastructure preflight skipped (--no-infra)."

If `report.passed === true` and `report.skipped === false`, proceed silently.

If `lib/infra-preflight.mjs` fails to import, block with: "Infrastructure preflight library could not be loaded: <error>. Fix the library before proceeding."

---

## Step 1b: Strategy Profile Resolution

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

In addition to the strategy-specific `gaming_blockers`, always check the 4 shared cross-strategy gaming patterns from `lib/test-strategies/gaming.mjs`:
- `DISABLED_TESTS` — `.skip(`, `xit(`, `xdescribe(`, `.todo(`
- `EMPTY_ASSERTIONS` — test bodies with no assertion calls
- `SWALLOWED_ASSERTIONS` — `try { expect } catch {}` without rethrow
- `CONDITIONAL_ASSERTIONS` — `if (cond) { expect }` without else

Shared pattern violations use prefix `SHARED:`, strategy-specific violations use the strategy name as prefix (e.g., `SCHEMA:`). Both are reported independently.

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

## Step 2: Framework Detection

Run `detect-framework.sh` with the project root:

```bash
result=$(bash detect-framework.sh "$projectRoot")
# Returns JSON: {"framework":"...","command":"...","filePattern":"..."} or exits 1
```

- Returns `{ framework, command, filePattern }` or `null`.
- If `null` → block with the locations checked and ask the user to specify the framework explicitly. Error code: `FRAMEWORK_NOT_DETECTED`.

---

## Step 3: Pre-existing Failure Protocol (--red only)

**Concurrent execution guard:** Check for `.context-index/.write-test.lock` (or `./write-test.lock` if no `.context-index/`). If it exists → block: "Another adev:write-test instance is running. Wait or remove `.context-index/.write-test.lock` if stale." — `CONCURRENT_EXECUTION`.

Write `.context-index/.write-test.lock` (create `.context-index/` if absent).

**Run the test command** on the current working tree. If **all tests pass** → proceed to Step 4. Record `preexisting_check: skipped (clean tree)`.

**If any tests are failing:**

1. Run `git stash --include-untracked` to stash tracked and untracked files.
   - If stash fails → block with git error. Do not proceed. `GIT_STASH_FAILED`.
2. Re-run the **failing tests only** on the clean branch. Apply a **60-second timeout**.
   - On timeout → kill the process. Proceed to step 3 regardless. Report `TIMEOUT_ERROR` after pop.
3. Record the stash SHA and both test outputs (before and after pop).
4. **Always run `git stash pop`** — even if step 2 errored, timed out, or produced unexpected results.
   - If pop fails → block **immediately** with the stash SHA and instruct manual recovery: "Run `git stash pop` to restore your work." — `GIT_POP_FAILED`. Do not continue.
5. **Evaluate the clean-branch result:**
   - Failure existed on clean branch → attach Pre-existing Failure Record to Handoff Block. Record `preexisting_check: pre-existing-recorded`. Proceed to Step 4.
   - Failure did **not** exist on clean branch → block: "Test `<name>` passes on the clean branch but fails with your changes. Fix this regression before writing new tests." — `REGRESSION_DETECTED`. Do not proceed.

Remove `.context-index/.write-test.lock` after stash pop completes (or after `GIT_POP_FAILED` block).

**Invariant:** `git stash pop` MUST always run after `git stash` — no exceptions, no conditions.

---

## Step 4: Test Authoring (RED Phase)

Dispatch a `capable`-tier subagent with:

- The resolved spec, file interface, or free-form description
- The detected framework, test command, and file naming pattern
- All enforcement rules below (pass this section verbatim)

### Deriving Test Contracts

**From `--spec <path>`:** Read the Behavioral Contract section. For each `When...then` statement, derive one or more Test Contracts covering the expected behavior, postconditions, and error cases.

**From `--file <path>`:** Read the file's exported public interface (functions, classes, constants). Derive Test Contracts covering: happy path per export, at least one error/edge case per export, and any documented invariants in JSDoc or comments.

**From free-form description:** Treat the description as the specification. Derive Test Contracts from the described behaviors. Record `spec: inline-description` in the Handoff Block.

### Seed Data Rule

Every assertion must operate on deterministic, explicitly seeded data.

```
Bad:  expect(users.length).toBeGreaterThan(0)   // depends on runtime state
Good: seed 3 users → expect(users).toHaveLength(3) and check specific values
```

Any assertion against unseeded runtime data is a Gaming Violation — `GAMING_VIOLATION`.

### Gaming Violation Detection

Run `detect-gaming.sh` on each test file before producing the Handoff Block:

```bash
violations=$(bash detect-gaming.sh test-file1.test.ts test-file2.test.ts)
# Returns JSON array of violations. Exit 0 always — read the JSON for results.
```

- Any `blocking` violation → block with the violation type, file path, line number, and matched text. Error code: `GAMING_VIOLATION`. Do not produce the Handoff Block until resolved.
- Any `advisory` violation → log with file and line. Do not block.

**The 9 canonical blocking patterns (from `detect-gaming.sh`):**
- `toBeTruthy()` as sole assertion
- `toBeDefined()` as sole assertion
- `toBeGreaterThanOrEqual(0)`
- `toBeGreaterThan(-1)`
- `.skip(` / `test.skip` / `xit(` / `xdescribe(`
- `try { expect } catch {}` without rethrow
- `if (condition) { expect }` without else branch
- `not.toThrow()` as sole assertion
- Hardcoded expected value mirroring an implementation return value

### Mocking Boundary Declaration

Before writing any mock, classify the dependency:

**Permitted boundaries (must declare one of these four types):**

| Type | Examples |
|------|---------|
| `HTTP` | `fetch`, `axios`, `got`, `node-fetch`, `http.request` |
| `DB` | `pg`, `mysql2`, `mongoose`, `prisma`, `knex`, any ORM/query builder |
| `filesystem` | `node:fs` for production I/O side effects, writes outside project |
| `external-api` | `stripe`, `sendgrid`, `twilio`, third-party SDKs, OAuth providers |

**Internal module mocking is a violation:**

```
Internal (VIOLATION): ../services/user-service.mjs, ../../lib/email.mjs, ../utils/format.mjs
External (permitted): node-fetch, pg, stripe, node:fs (production writes)
```

If a test requires mocking an internal module because it has an unacceptable side effect → mock at the actual external boundary (the HTTP call, DB query, or I/O operation it makes), not the internal module.

Every permitted mock requires a justification. No justification → `MISSING_JUSTIFICATION`.

Record all mocks in the Mocking Boundaries table in the Handoff Block.

Any mock targeting an internal module → block with location, target, and boundary suggestion. Error code: `MOCK_VIOLATION`.

### RED State Verification

After writing tests, run the test command **scoped to the new test files**:

```bash
<framework command> <new-test-file-path>
```

Tests must fail because the required behavior is not yet implemented — **not** because of a syntax error, missing import, or test misconfiguration.

- Tests pass immediately → block: "Tests pass before implementation exists — either the behavior is already implemented or the test does not assert the right thing." — `RED_STATE_FAILED`
- Tests fail for wrong reason (syntax/import error) → fix the test setup. Rerun. Maximum 2 fix attempts. If still failing for wrong reason after 2 attempts → block and report. — `SETUP_ERROR`
- Tests fail for behavioral reasons (missing feature, unimplemented function) → RED state confirmed. Proceed to Step 5.

---

## Step 5: Handoff Block Production

Call `write-handoff.sh` with all required fields:

```bash
bash write-handoff.sh write \
  "<slug>" \
  "<spec path or standalone>" \
  ".context-index/packets" \
  "<framework>" \
  "<preexisting_check: passed | skipped | pre-existing-recorded>" \
  "<gaming_check: passed | violations-found>" \
  "<verification command>" \
  "<RED state evidence — last 20 lines of test output>" \
  test-file1.test.ts [test-file2.test.ts ...]
```

If write fails → block with filesystem error. Do not report success. — `WRITE_ERROR`

**Slug derivation:** Lowercase, kebab-case from spec title or filename. No special characters. If a packet with the same slug exists → overwrite and record `previous_hash`.

**Re-running `--red` on same target is safe** — overwrites the packet and records the previous hash for audit.

---

## Step 6: Verify Mode (--verify)

Invoked as: `adev:write-test --verify --packet <path>`

### 6a. Hash Check

```bash
result=$(bash write-handoff.sh verify "<packetPath>")
# Outputs: PASS or HASH_MISMATCH:<stored>:<computed>
```

- `PASS` → verification complete. Report and stop.
- `HASH_MISMATCH` → proceed to semantic diff (Step 6b).
- Packet not found → block: "Packet not found: `<path>`. Run `--red` first." — `PACKET_NOT_FOUND`
- Test file listed in packet no longer exists → block: "Test file missing: `<path>`. Cannot verify integrity." — `STALE_PACKET`

### 6b. Semantic Diff

Dispatch a `fast`-tier subagent with:
- The original test file contents (from the Handoff Block's `## Original Test File Contents` section)
- The current test file contents (read from disk)
- The 5 tamper classifications and their detection rules (pass Step 6c verbatim)

If the `## Original Test File Contents` section is absent → report: "Unable to produce line-level diff — Handoff Block was written without original content storage. Check git log for the commit where tests were written to retrieve originals." — `DIFF_UNAVAILABLE`

### 6c. Tamper Classifications

The `fast`-tier subagent compares original vs current line-by-line:

| Classification | Description |
|----------------|-------------|
| `REMOVED` | An assertion was deleted entirely |
| `LOOSENED` | Matcher was weakened: `toEqual` → `toMatchObject`, `toBe(false)` → `toBeFalsy()`, `toHaveLength(3)` → `toBeGreaterThan(0)` |
| `HARDCODED_TO_PASS` | Expected value was changed to match actual output instead of specified behavior |
| `SKIPPED` | Test disabled: `.skip`, `.todo`, `xit`, `xdescribe`, commented-out test block |
| `CONDITIONAL` | Conditional wrapper added around assertion: `if/else` guard, `try/catch` swallowing failure |

**Cosmetic changes (not tamper):** whitespace, comments, variable renames that do not affect assertion logic.

### 6d. Verdict and Report

**Persona adaptation:** Verify report files written to disk use the full format. The chat summary presented to the user should follow the active persona's output rules.

- **All changes cosmetic** → `PASS_WITH_COSMETIC_CHANGES`. Log what changed. No report file written.
- **Any tamper found** → `TAMPERED`. Produce diff report.

**Diff report format** — write to `.context-index/packets/<slug>-verify-report.md` AND print inline:

```markdown
# Verify Report: <slug>

**Status:** TAMPERED
**Packet:** .context-index/packets/<slug>-tests.md
**Verified:** <ISO timestamp>

## Tampered Assertions

### 1. LOOSENED — <test-file>:<line>

**Original:**
```
expect(user).toEqual({ id: 1, name: "Alice", role: "admin" })
```

**Current:**
```
expect(user).toMatchObject({ id: 1 })
```

**Why this is a violation:** toMatchObject allows extra properties and omits name and role checks.

---

## Required Action

Revert the above changes in the test files. Fix the production code to make the original assertions pass.
Do NOT modify the tests — fix the implementation.
```

If report file is not writable → print inline only. Do not block on write failure.

### 6e. Undeclared Mock Check

During `--verify`, also check if the implementer introduced new mocks in test files that are **not** in the Handoff Block's Mocking Boundaries table. Flag each new undeclared mock as `UNDECLARED_MOCK`.

---

## Error Codes Reference

| Code | Phase | Description |
|------|-------|-------------|
| `CONCURRENT_EXECUTION` | Pre-flight | Lock file exists |
| `MISSING_INPUT` | Pre-flight | No spec, file, or description provided |
| `AMBIGUOUS_INPUT` | Pre-flight | --spec and --file both provided |
| `INVALID_TARGET` | Pre-flight | --file path is a directory |
| `FRAMEWORK_NOT_DETECTED` | Step 2 | No test framework detectable |
| `GIT_STASH_FAILED` | Step 3 | git stash --include-untracked failed |
| `TIMEOUT_ERROR` | Step 3 | Test run exceeded 60s timeout |
| `GIT_POP_FAILED` | Step 3 | git stash pop failed — manual recovery required |
| `REGRESSION_DETECTED` | Step 3 | Failing test passes on clean branch |
| `SPEC_NOT_FOUND` | Step 4 | --spec path does not exist |
| `FILE_NOT_FOUND` | Step 4 | --file path does not exist |
| `MOCK_VIOLATION` | Step 4 | Mock targets internal repository module |
| `MISSING_JUSTIFICATION` | Step 4 | Mock has no declared justification |
| `GAMING_VIOLATION` | Step 4 | Blocking gaming pattern detected in test |
| `RED_STATE_FAILED` | Step 4 | Tests pass before implementation exists |
| `SETUP_ERROR` | Step 4 | Tests fail for wrong reason after 2 fix attempts |
| `WRITE_ERROR` | Step 5 | Handoff block write failed |
| `PACKET_NOT_FOUND` | Step 6 | --verify packet path does not exist |
| `STALE_PACKET` | Step 6 | Test file listed in packet no longer on disk |
| `DIFF_UNAVAILABLE` | Step 6 | Handoff Block missing Original Test File Contents |
| `UNDECLARED_MOCK` | Step 6 | New mock introduced during GREEN phase |

---

## Key Invariants

- `git stash pop` always runs after `git stash` — no exceptions, no conditions
- Every mock must have a declared Mocking Boundary with justification
- Handoff Block is read-only during `--verify` — never modified
- Re-running `--red` on same target is safe — overwrites and records `previous_hash`
- No blocking Gaming Violation may remain when the Handoff Block is produced
- All enforcement rules apply equally in standalone and dispatched modes

---

## Companion Helpers

| Helper | Purpose | Uses |
|--------|---------|------|
| `detect-framework.sh` | Detect test framework from package.json or test files | Step 2 |
| `detect-gaming.sh` | Scan test files for canonical gaming patterns | Step 4 |
| `write-handoff.sh` | Write and verify Handoff Block with SHA-256 hash | Step 5, Step 6 |

These helpers accelerate deterministic checks. The skill functions without them — Claude can apply the same rules manually if a helper is unavailable.
