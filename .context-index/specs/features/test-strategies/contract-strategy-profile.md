---
charter: test-strategies
charter-extension: true
status: review-passed
revision: 1
charter-revision: 2
created: 2026-04-20
updated: 2026-04-20
---

# Spec: Contract Strategy Profile

## Capability

Define the complete rule set for the `contract` test strategy, enabling TDD for service integrations, API boundaries, and consumer-driven contracts.

## Behavioral Contract

### Preconditions

- The task involves contract files (detected via `*.proto`, `*.pact.json`, `openapi.yaml`, `contracts/` paths)
- A contract testing framework is available (Pact, Spring Cloud Contract, Specmatic, or manual OpenAPI validation)
- The strategy profile contract (`getStrategyProfile`) can load this profile

### Behaviors

1. **When** write-test loads the contract profile **then** it uses these RED/GREEN semantics: RED means the consumer contract verification fails because the provider does not implement the expected endpoint or message shape; GREEN means provider verification passes all consumer contracts
2. **When** write-test authors tests for a contract task **then** it writes consumer contract definitions that verify: request/response structure AND semantic content (field values, not just types), error response contracts (4xx/5xx shapes), and message schema contracts for async communication
3. **When** write-test checks for gaming in contract tests **then** it detects these strategy-specific patterns: structure-only assertions (checking field existence without value semantics), provider verification against mocks instead of real service, orphan contracts not tied to actual consumer usage, and happy-path-only contracts (no error scenarios)
4. **When** write-test applies assertion rules for contract tests **then** it requires: both structural AND semantic assertions (field values must be meaningful, not just present), error response contracts alongside success contracts, consumer identity declared in each contract
5. **When** write-test applies seed data rules **then** it requires: contracts define explicit example payloads with realistic data, provider state setup described for each interaction (e.g., "given user 123 exists"), no assertions against random or auto-generated IDs
6. **When** write-test produces the handoff block **then** it includes: contract file paths (Pact JSON, proto, OpenAPI), consumer identity, provider state requirements, interaction count, and expected verification command
7. **When** a contract test's RED state is verified **then** the provider verification must fail because the endpoint/message is not implemented — not because the contract file is malformed or the provider is unreachable

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Contract file malformed | Block with parse error details | CONTRACT_PARSE_ERROR |
| No contract framework detected | Advisory: list supported frameworks | CONTRACT_NO_FRAMEWORK |
| Provider unreachable during verification | Distinguish from RED state — this is a setup error | CONTRACT_PROVIDER_UNREACHABLE |

## Constitution Reference

- "Skills are primarily markdown" — The contract profile is a markdown document consumed by write-test as structured instructions
- "Minimize external dependencies" — Contract verification uses the project's existing contract tool, not new dependencies

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Write contract profile markdown | Create `lib/test-strategies/profiles/contract.md` with all required fields | medium |
| Write contract profile tests | Verify profile loads correctly and all fields are present | small |
| Document contract testing patterns | Examples of good vs. gaming contract assertions | small |

## Acceptance Criteria

- [ ] Profile file contains all 8 required fields
- [ ] gaming_blockers includes: structure-only assertions, mock-based verification, orphan contracts, happy-path-only
- [ ] assertion_rules require both structural and semantic assertions
- [ ] seed_data_rule requires explicit example payloads with provider state
- [ ] handoff_format includes contract files, consumer identity, and verification command
- [ ] `getStrategyProfile('contract')` loads the profile without fallback
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
