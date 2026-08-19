---
name: adev:write-test
description: "TDD test authoring: write failing tests (RED phase), produce immutable handoff blocks, and detect specification gaming. Use before implementation."
---

# adev:write-test

**Identity:** TDD integrity specialist. Authors failing tests (RED phase), produces immutable handoff blocks, detects specification gaming, enforces mocking boundaries, and verifies post-GREEN test tamper.

---

### Dispatch Turn Discipline

**Never end your turn to wait for a dispatched subagent.** A synchronous dispatch (`run_in_background: false`) returns its final result directly in the tool call — there is nothing to wait for. If a dispatch ever returns a task ID instead of a result, that is a bug in the dispatch (the rule above was violated, or the harness backgrounded it anyway): fix the dispatch and re-run it synchronously. Do not end the turn hoping a completion notification will resume you — in a nested subagent context it will not. If this skill is itself running as a dispatched subagent (e.g., a build pipeline step), your own caller is waiting on a result contract — for build pipeline steps this is the `STEP_RESULT` format defined in `skills/build/SKILL.md`. Ending your turn without that result to report is a protocol violation, not a valid pause point.

**Always pass `run_in_background: false` on every `Agent({...})` dispatch in this skill.** The harness backgrounds Agent dispatches by default: the call returns immediately with a task ID and the caller is only re-invoked by a completion notification. That notification path is reliable only at the top level of a session — inside a nested subagent context (write-test usually runs as a subagent dispatched by `/adev:implement`) it does not re-invoke the caller, so a backgrounded dispatch stalls the task loop (field-observed as steps that auto-background and never return a result). This applies to every subagent dispatch in this skill: RED phase test authoring, `--verify` semantic diff, and gaming violation judgment.

---

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill write-test
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

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

Applies only when invoked outside an implement run.

> **Conditional loading:** Read `skills/write-test/references/steps/step-0-standalone-preflight.md` for the full instructions. Do not act on this section from the summary above.

## Step 1: Model Tier Resolution

Picks the model tier for the authoring subagent.

> **Conditional loading:** Read `skills/write-test/references/steps/step-1-model-tier.md` for the full instructions. Do not act on this section from the summary above.

## Step 1a: Infrastructure Preflight

Runs only when the task declares infra_requirements.

> **Conditional loading:** Read `skills/write-test/references/steps/step-1a-infra-preflight.md` for the full instructions. Do not act on this section from the summary above.

## Step 1b: Strategy Profile Resolution

Resolves the test-strategy profile that governs depth and tiering.

> **Conditional loading:** Read `skills/write-test/references/steps/step-1b-strategy-profile.md` for the full instructions. Do not act on this section from the summary above.

## Step 2: Framework Detection

Run `scripts/detect-framework.sh` with the project root:

```bash
result=$(bash scripts/detect-framework.sh "$projectRoot")
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

## Step 3a: Shared Test Helper Inventory (required, `--red` only)

**Do this before authoring a single test.** A fresh authoring subagent starts contextless,
so unless the project's existing test infrastructure is put in front of it, it will invent
its own setup, teardown, and fixtures. That is measurable: this repo hand-rolled
`makeTempProject` 61 times and redefined `cleanup()` 29 times while only 39% of test files
imported the shared helper module.

Load the inventory:

```bash
adev test-helpers inventory --format text
```

Stdout is a budget-capped text block listing the project's shared helper modules (with their
exported symbols), fixture/setup files, fixture-data directories, and any curated golden TEST
samples. It is language-agnostic — `conftest.py` and pytest fixtures in a Python project,
`spec_helper.rb` in Ruby, `tests/helpers.mjs` here.

Handling:

- **If the output is `No shared test helpers, fixtures, or test samples detected.`** — omit the
  section from the Step 4 prompt entirely. Do not emit an empty placeholder.
- **If the verb fails for any reason** — log a one-line advisory and continue. A missing
  inventory never blocks RED authoring.
- **Otherwise** — pass the block verbatim into the Step 4 authoring subagent's prompt under the
  heading `## Shared Test Helper Inventory`, prefixed with:

  > These shared test helpers, fixtures, and golden test samples already exist in this project.
  > Read the relevant ones before writing setup, teardown, or fixture code. Reuse them where
  > they fit; define new local helpers only when nothing listed here does the job.

  (The heading is `## Shared Test Helper Inventory`, not `## Shared Test Helpers` — this file
  already has a `## Companion Helpers` section meaning this skill's own bundled scripts, and
  the two must not read as siblings.)

Injecting the block is what this step actually accomplishes. Nothing verifies that the
authoring subagent reused anything — see the advisory duplication check at the end of Step 4.

---

## Step 4: Test Authoring (RED Phase)

Writes the failing tests that define the contract.

> **Conditional loading:** Read `skills/write-test/references/steps/step-4-test-authoring.md` for the full instructions. Do not act on this section from the summary above.

## Step 5: Handoff Block Production

Call `scripts/write-handoff.sh` with all required fields:

```bash
bash scripts/write-handoff.sh write \
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

Applies only with --verify: re-checks an existing handoff block.

> **Conditional loading:** Read `skills/write-test/references/steps/step-6-verify-mode.md` for the full instructions. Do not act on this section from the summary above.

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
| `scripts/detect-framework.sh` | Detect test framework from package.json or test files | Step 2 |
| `scripts/detect-gaming.sh` | Scan test files for canonical gaming patterns | Step 4 |
| `scripts/write-handoff.sh` | Write and verify Handoff Block with SHA-256 hash | Step 5, Step 6 |

These helpers accelerate deterministic checks. The skill functions without them — Claude can apply the same rules manually if a helper is unavailable.
