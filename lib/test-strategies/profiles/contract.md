---
strategy_id: contract
red_exit_condition: "Consumer contract verification fails because the provider does not implement the expected endpoint or message shape"
green_exit_condition: "Provider verification passes all consumer contracts — all interactions match, all response shapes valid, all error contracts satisfied"
gaming_blockers:
  - "Structure-only assertions — checking field existence without value semantics"
  - "Provider verification against mocks instead of the real running service"
  - "Orphan contracts not tied to actual consumer usage"
  - "Happy-path-only contracts — no error response scenarios (4xx/5xx)"
  - "Contracts that check response status code only without body validation"
assertion_rules: "Both structural AND semantic assertions required — field values must be meaningful, not just present. Error response contracts must accompany success contracts. Consumer identity must be declared in each contract."
seed_data_rule: "Contracts define explicit example payloads with realistic data. Provider state setup described for each interaction (e.g., 'given user 123 exists'). No assertions against random or auto-generated IDs."
handoff_format: "Contract file paths (Pact JSON, proto, OpenAPI) + consumer identity + provider state requirements + interaction count + expected verification command"
permitted_tools:
  - "Pact"
  - "Pactflow"
  - "Spring Cloud Contract"
  - "Specmatic"
  - "WireMock"
  - "grpc-testing"
  - "buf"
  - "openapi-diff"
---

# Contract Strategy Profile

Consumer-driven contract testing profile. Verifies service integrations through contract definitions with both structural and semantic assertions.
