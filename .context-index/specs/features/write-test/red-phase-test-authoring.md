# Live Spec: RED Phase Test Authoring

<!-- Live Spec within the adev:write-test charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/adev:write-test/charter.md -->

---
charter: adev:write-test
status: implemented
risk_level: medium
milestone: v1
revision: 1
charter-revision: 1
created: 2026-03-27
updated: 2026-03-27
cross-cutting-refs:
  - .context-index/specs/cross-cutting/model-routing.md
---

## Behavioral Contract

### Preconditions

- The skill is invoked with at least one of: `--spec <path>`, `--file <path>`, or a free-form behavioral description
- The working tree is in a known clean or stash-verified state (pre-existing failure protocol has run if any tests were failing)
- A test framework is detectable from `package.json` or existing test files in the repository
- `model_tiers` has been read from `.context-index/platform-context.yaml` (or fallback defaults are in effect)

### Behaviors

1. **When** invoked with `--spec <path>` **then** the skill reads the Live Spec's Behavioral Contract section and derives one Test Contract per behavioral statement, mapping each `When...then` statement to one or more concrete assertions.

2. **When** invoked with `--file <path>` or a free-form description (standalone mode, no spec) **then** the skill derives Test Contracts from the file's exported interface or the described behavior directly, without requiring a Live Spec to be present.

3. **When** authoring a test that calls a dependency **then** the skill requires every mock to reference a declared Mocking Boundary (`HTTP`, `DB`, `filesystem`, or `external-api`). Any mock targeting a module within the same repository is flagged as an undeclared mock violation and blocks output.

4. **When** authoring a test that asserts on data **then** the skill requires deterministic seed data to be set up at the start of the test. Any assertion against unseeded runtime data (e.g., `expect(count).toBeGreaterThan(0)`, `expect(result).toBeDefined()` as the sole assertion) is flagged as a Gaming Violation and blocks output.

5. **When** a test is written **then** the skill runs the project's test command (framework-detected) scoped to the new test file. Tests must fail because the required behavior is not yet implemented — not because of a syntax error, missing import, or test misconfiguration. If tests fail for the wrong reason, the skill fixes the test setup and reruns before proceeding.

6. **When** RED state is confirmed (test fails for the right reason) **then** the skill produces an Immutable Handoff Block at `.context-index/packets/<slug>-tests.md` containing: test file paths, the exact verification command, a failure summary proving RED state, locked test constraints, and a SHA-256 content hash of the written test files.

7. **When** a Gaming Violation is detected during authoring — hardcoded return value mirroring the assertion, vacuous matcher as sole assertion (`toBeTruthy`, `toBeDefined`, `>= 0`), or conditional skip (`if/else` around an assertion, `try/catch` swallowing failures) — **then** the skill blocks and reports the specific violation with file path and line number. It does not produce the handoff block until all violations are resolved.

8. **When** dispatching the test-authoring subagent **then** the skill uses the `capable` model tier resolved from `model_tiers` in `.context-index/platform-context.yaml`, per the model-routing cross-cutting spec. If `capable` is unset, falls back to `claude-sonnet-4-6`.

### Postconditions

- A Handoff Block exists at `.context-index/packets/<slug>-tests.md`
- All written tests are confirmed failing for behavioral reasons (not setup errors)
- All mocks reference declared Mocking Boundaries
- All assertions operate on deterministic seed data
- No Gaming Violations remain in the written tests
- The Handoff Block's content hash matches the test files on disk

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `--spec <path>` file not found | Block with "Spec not found: <path>". Do not proceed. | SPEC_NOT_FOUND |
| `--file <path>` file not found | Block with "File not found: <path>". Do not proceed. | FILE_NOT_FOUND |
| No test framework detectable | Block with list of checked locations (`package.json`, `*.test.*`, `*.spec.*`). Ask user to specify framework explicitly. | FRAMEWORK_NOT_DETECTED |
| Tests pass immediately (RED state not achieved) | Block with "Tests pass before implementation exists — either the behavior is already implemented or the test does not assert the right thing." Do not produce handoff block. | RED_STATE_FAILED |
| Tests fail for wrong reason (syntax/import error) | Fix the test setup. Rerun. If still failing for wrong reason after 2 attempts, block and report. | SETUP_ERROR |
| Undeclared mock detected | Block with mock location, target module, and explanation of why it must be an external boundary. | MOCK_VIOLATION |
| Gaming Violation detected | Block with violation type, file path, line number, and the specific anti-pattern found. | GAMING_VIOLATION |
| Handoff block write fails | Block with filesystem error. Do not report success. | WRITE_ERROR |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown — companion code is allowed but must not be required for the skill to function" — Applies because gaming violation detection and framework detection are implemented as `.mjs` helpers that assist the skill, but the skill's core authoring logic is in SKILL.md instructions to Claude.
- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies because the content hash uses Node.js `crypto` (SHA-256), framework detection uses `fs` and `path`, and gaming detection uses regex — all built-ins with no external packages.
- **Principle:** "Pure ESM — all `.mjs` files" — Applies to the companion `.mjs` helpers for gaming detection and framework detection.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Write `skills/write-test/SKILL.md` | Core skill instructions: RED phase workflow, mocking boundary rules, seed data enforcement, Gaming Violation definitions, handoff block production | Large |
| Write `skills/write-test/detect-framework.mjs` | Reads `package.json` and scans for `*.test.*` / `*.spec.*` files to identify the test framework. Returns framework name and test command. | Small |
| Write `skills/write-test/detect-gaming.mjs` | Regex-based scanner for Gaming Violation patterns: vacuous matchers, conditional skips, unseeded assertions. Returns list of violations with file and line. | Medium |
| Write `skills/write-test/write-handoff.mjs` | Writes the Handoff Block to `.context-index/packets/<slug>-tests.md`. Computes SHA-256 hash of test file contents. | Small |
| Write tests for companion helpers | `tests/adev:write-test/detect-framework.test.mjs`, `detect-gaming.test.mjs`, `write-handoff.test.mjs` using `node:test` | Medium |

## Acceptance Criteria

- [ ] Invoking with `--spec <path>` produces tests that map to each behavioral statement in the spec's Behavioral Contract
- [ ] Invoking with `--file <path>` produces tests covering the file's exported public interface without requiring a spec
- [ ] Any mock not targeting an external boundary (`HTTP`, `DB`, `filesystem`, `external-api`) causes a MOCK_VIOLATION error with the mock's location
- [ ] Any test with a vacuous matcher as its sole assertion causes a GAMING_VIOLATION error with type and line number
- [ ] Any assertion against unseeded runtime data causes a GAMING_VIOLATION error
- [ ] After authoring, running the test command confirms all written tests fail for behavioral reasons (missing implementation), not setup errors
- [ ] A Handoff Block is written to `.context-index/packets/<slug>-tests.md` containing test paths, verification command, failure summary, constraints, and SHA-256 hash
- [ ] The `capable` model tier from `platform-context.yaml` is used for subagent dispatch; falls back to `claude-sonnet-4-6` if unset
- [ ] `detect-gaming.mjs`, `detect-framework.mjs`, and `write-handoff.mjs` are pure ESM `.mjs` files using only Node.js built-ins
- [ ] All companion helper tests pass with `npm test`
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
