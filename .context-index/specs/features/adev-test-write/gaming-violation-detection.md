# Live Spec: Gaming Violation Detection

<!-- Live Spec within the adev-test-write charter.
     Parent Charter: .context-index/specs/features/adev-test-write/charter.md -->

---
charter: adev-test-write
status: implemented
risk_level: medium
milestone: v1
revision: 1
charter-revision: 1
created: 2026-03-27
updated: 2026-03-27
---

## Behavioral Contract

### Preconditions

- One or more test files have been written or are being verified
- `detect-gaming.mjs` is available as a companion helper

### Behaviors

1. **When** a test file is scanned **then** `detect-gaming.mjs` runs regex patterns against the file contents and returns a list of violations, each with: violation type, file path, line number, matched text, and severity (`blocking` or `advisory`).

2. **When** a **vacuous matcher** is detected as the sole assertion in a test — patterns include `toBeTruthy()`, `toBeFalsy()`, `toBeDefined()`, `toBeUndefined()`, `toBeNull()`, `expect(x).not.toThrow()` with no further assertions, `toBeGreaterThanOrEqual(0)`, `toBeGreaterThan(-1)` — **then** the violation is `blocking`. The test does not protect against regression.

3. **When** a **hardcoded mirror** is detected — the expected value in an assertion is a literal that matches a return value hardcoded in the implementation being tested (detectable when the test file imports the implementation and the literal appears in both) — **then** the violation is `blocking`. This pattern indicates the test was written to match the code rather than to specify behavior.

4. **When** a **conditional skip** is detected — patterns include `if (condition) { expect(...) }` without an else branch, `try { expect(...) } catch {}`, `.skip(`, `.todo(`, `test.skip`, `xit(`, `xdescribe(` — **then** the violation is `blocking`. A test that can be bypassed is not a test.

5. **When** an **unseeded assertion** is detected — patterns include `expect(array.length).toBeGreaterThan(0)`, `expect(result).not.toBeNull()` without preceding seed setup, assertions on `Date.now()` or `Math.random()` output without mocking — **then** the violation is `blocking`. The test outcome depends on runtime state rather than controlled input.

6. **When** a **weak equality** is detected as a downgrade from a stronger form — `toContain` used where `toEqual` is appropriate for the full value, `toMatchObject` used where `toStrictEqual` is appropriate — **then** the violation is `advisory` (logged but non-blocking). Implementers are notified but not stopped.

7. **When** `detect-gaming.mjs` is run as part of `--verify` mode (post-GREEN check) **then** it additionally flags any violations present in the current test files that were NOT present in the Handoff Block's locked constraints — indicating the implementer introduced gaming patterns while fixing tests.

### Postconditions

- All `blocking` violations prevent Handoff Block production or `--verify` passing
- All `advisory` violations are logged with file and line but do not block
- The violation list is included in the Handoff Block under a `gaming_check` field

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Test file unreadable | Skip that file, log warning, continue with remaining files | FILE_READ_ERROR |
| Regex engine error | Block with internal error — do not silently skip violation detection | DETECTION_ERROR |

## Canonical Violation Patterns

These are the regex-detectable patterns `detect-gaming.mjs` must cover:

| Pattern Name | Regex Hint | Severity |
|---|---|---|
| `toBeTruthy()` sole assertion | `expect\([^)]+\)\.toBeTruthy\(\)` as only `expect` in test | blocking |
| `toBeDefined()` sole assertion | `expect\([^)]+\)\.toBeDefined\(\)` as only `expect` in test | blocking |
| `toBeGreaterThanOrEqual(0)` | `toBeGreaterThanOrEqual\(\s*0\s*\)` | blocking |
| `toBeGreaterThan(-1)` | `toBeGreaterThan\(\s*-1\s*\)` | blocking |
| `.skip(` / `test.skip` / `xit(` | `\.skip\(`, `test\.skip`, `\bxit\(` | blocking |
| `try { expect` without rethrow | `try\s*\{[^}]*expect` + no rethrow in catch | blocking |
| `if (x) { expect` without else | `if\s*\([^)]+\)\s*\{[^}]*expect` + no `else` | blocking |
| Unchecked `not.toThrow()` | `\.not\.toThrow\(\)` as only assertion | blocking |
| `toMatchObject` on full value | Advisory — flagged when spec says exact match | advisory |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — All pattern detection uses Node.js built-in `RegExp`. No AST parser, no ESLint plugin, no external dependency.
- **Principle:** "Skills are primarily markdown — companion code is allowed but must not be required" — The skill's SKILL.md defines the violation categories; `detect-gaming.mjs` is an acceleration helper. Without it, Claude can apply the same rules manually.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement `detect-gaming.mjs` | Regex scanner returning typed violation objects with file, line, matched text, severity | Medium |
| Write tests for each violation pattern | One test per canonical pattern, plus edge cases (violation inside a describe block, multiple violations in one file) | Medium |
| Integrate into `--red` authoring phase | Run before Handoff Block production; block on any `blocking` violation | Small |
| Integrate into `--verify` mode | Run on current test files; additionally flag new violations not in original handoff | Small |

## Acceptance Criteria

- [ ] Each of the 9 canonical patterns in the table above is detected correctly by `detect-gaming.mjs`
- [ ] `blocking` violations prevent Handoff Block production with a structured error (type, file, line, matched text)
- [ ] `advisory` violations are logged but do not block
- [ ] `--verify` mode detects new gaming violations introduced by the implementer that were not in the original Handoff Block
- [ ] `detect-gaming.mjs` uses only Node.js built-ins (`fs`, `path`)
- [ ] All canonical pattern tests pass with `npm test`
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
