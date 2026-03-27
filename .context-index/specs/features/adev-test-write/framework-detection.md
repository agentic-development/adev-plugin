# Live Spec: Framework Detection

<!-- Live Spec within the adev-test-write charter.
     Parent Charter: .context-index/specs/features/adev-test-write/charter.md -->

---
charter: adev-test-write
status: review-passed
risk_level: low
milestone: v1
created: 2026-03-27
---

## Behavioral Contract

### Preconditions

- `detect-framework.mjs` is invoked from the project root
- `package.json` exists or test files exist somewhere in the repository

### Behaviors

1. **When** `detect-framework.mjs` runs **then** it checks `package.json` `dependencies` and `devDependencies` for known test framework packages and returns the first match in priority order: `vitest` → `jest` → `node:test` (present if Node.js ≥ 18) → `mocha` → `jasmine` → `pytest` (if `pyproject.toml` or `setup.py` exists) → `go test` (if `go.mod` exists) → `cargo test` (if `Cargo.toml` exists).

2. **When** a framework is detected **then** the helper returns the test command from the Supported Frameworks table only — it does not read `package.json` `scripts.test` or any user-defined script. Commands are constructed from an allowlist (`npx vitest run`, `npx jest`, `node --test`, etc.) regardless of what `scripts.test` contains. This prevents shell injection via a crafted `package.json`.

3. **When** no framework is found in `package.json` **then** the helper scans for existing test files matching common patterns (`**/*.test.*`, `**/*.spec.*`, `**/*_test.*`, `**/test_*.py`) and infers the framework from import statements. Each candidate file is read up to 4096 bytes only — files exceeding this threshold or containing non-UTF-8 bytes are skipped with a warning.

4. **When** multiple frameworks are detected **then** the helper returns all matches ranked by priority and asks the skill to present the list to the user for confirmation before proceeding.

5. **When** no framework is detectable by any method **then** the helper returns `null` and the skill blocks with a message listing the locations checked and asking the user to specify the framework explicitly.

### Postconditions

- Detected framework name, test command, and file naming pattern are available to the skill
- If detection is ambiguous, the user has confirmed the correct framework before tests are written

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `package.json` malformed JSON | Skip package.json check, proceed to file scan | — |
| No test files and no `package.json` match | Return `null` — skill blocks and asks user | FRAMEWORK_NOT_DETECTED |
| File scan finds conflicting frameworks | Return all matches — skill asks user to confirm | — |

## Supported Frameworks

| Framework | Detection Source | Test Command | File Pattern |
|-----------|-----------------|--------------|--------------|
| vitest | `package.json` devDep | `npx vitest run` | `*.test.ts`, `*.spec.ts` |
| jest | `package.json` devDep | `npx jest` | `*.test.js`, `*.spec.js` |
| node:test | Node.js ≥ 18 (always available) | `node --test` | `*.test.mjs`, `*.test.js` |
| mocha | `package.json` devDep | `npx mocha` | `*.test.js`, `test/*.js` |
| jasmine | `package.json` devDep | `npx jasmine` | `*spec.js`, `*Spec.js` |
| pytest | `pyproject.toml` or `setup.py` | `pytest` | `test_*.py`, `*_test.py` |
| go test | `go.mod` present | `go test ./...` | `*_test.go` |
| cargo test | `Cargo.toml` present | `cargo test` | `*_test.rs`, `tests/*.rs` |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Detection uses `fs.readFileSync` for `package.json` and `fs.readdirSync` / glob-like recursive scan for test files. No external framework detection library.
- **Principle:** "Pure ESM" — `detect-framework.mjs` exports a single async function, imports only `node:fs` and `node:path`.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement `detect-framework.mjs` | Priority-ordered detection from package.json then file scan. Returns `{ framework, command, filePattern }` or `null`. | Small |
| Write tests for each supported framework | Fixture-based tests using `writeFixture()` from `tests/helpers.mjs` | Small |

## Acceptance Criteria

- [ ] `vitest`, `jest`, `node:test`, `mocha`, `jasmine`, `pytest`, `go test`, `cargo test` are all detectable
- [ ] Test commands come from the Supported Frameworks allowlist only — `package.json` `scripts.test` is never executed
- [ ] File scan reads at most 4096 bytes per candidate file; non-UTF-8 files are skipped
- [ ] Detection priority order is respected (vitest before jest before node:test)
- [ ] Correct test command and file naming pattern returned for each framework
- [ ] Falls back to file scan when `package.json` has no match
- [ ] Returns `null` when no framework is detectable, causing the skill to block
- [ ] `detect-framework.mjs` uses only `node:fs` and `node:path`
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
