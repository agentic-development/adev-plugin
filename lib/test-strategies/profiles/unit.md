---
strategy_id: unit
red_exit_condition: "Test runner exits non-zero because the expected behavior is not yet implemented"
green_exit_condition: "Test runner exits zero — all tests pass"
gaming_blockers:
  - "toBeTruthy/toBeDefined/toBeFalsy/toBeUndefined/toBeNull as sole assertion"
  - "toBeGreaterThanOrEqual(0) or toBeGreaterThan(-1) as useless bounds"
  - ".skip(/.todo(/xit(/xdescribe( — disabled tests"
  - "try { expect } catch {} without rethrow — swallowed assertions"
  - "if (condition) { expect } without else — conditional assertions"
  - ".not.toThrow() as sole assertion"
  - "Hardcoded expected values mirroring implementation return values"
  - "Assertions on unseeded/non-deterministic data"
  - "Empty test body or setup-only without assertions"
assertion_rules: "Mock only at external boundaries (HTTP, DB, filesystem, external-API). Internal module mocking is forbidden."
seed_data_rule: "Every assertion must operate on deterministic, explicitly seeded data."
handoff_format: "SHA-256 hash of test files + verbatim test file contents + mocking boundaries table"
permitted_tools:
  - "node:test"
  - "jest"
  - "vitest"
  - "mocha"
  - "pytest"
  - "go test"
  - "cargo test"
---

# Unit Strategy Profile

Standard unit testing profile. Codifies the existing write-test behavior.
