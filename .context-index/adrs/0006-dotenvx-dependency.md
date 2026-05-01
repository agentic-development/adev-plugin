# ADR 0006: Use Existing parseDotenv Instead of Adding dotenvx

## Status

Accepted

## Date

2026-05-01

## Context

The infra-preflight spec originally proposed `@dotenvx/dotenvx` as a dev dependency for loading `.env` files during preflight checks. The constitution requires ADR justification for any new external dependency.

## Decision

Use the existing `parseDotenv()` function from `lib/profiles/env.mjs` instead of adding dotenvx. The existing parser already handles KEY=VALUE, quoted values, comments, and inline comments — sufficient for `.env.test` files used in preflight. This avoids: (1) a new supply chain risk, (2) version pinning maintenance, (3) violating the "minimize external dependencies" principle when an in-house solution already exists.

## Alternatives Considered

1. **@dotenvx/dotenvx** — Rejected because the existing parser is sufficient and adding it introduces supply chain risk.
2. **Node.js `--env-file` flag** — Rejected because it requires Node 20.6+, not available at runtime for library code.

## Consequences

- No new dependencies added to the project.
- The `parseDotenv()` function may need minor hardening if edge cases arise (e.g., multiline values), but the current implementation covers standard `.env` file patterns.
