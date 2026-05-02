# ADR 0006: Add @dotenvx/dotenvx as Dev Dependency

## Status

Accepted

## Date

2026-05-02

## Context

Multiple adev skills need to load environment variables from `.env` files in user projects:

- **Infrastructure preflight** (`lib/infra-preflight.mjs`) loads `.env.test` to verify that required env vars are set before running integration tests
- **Future skills** may need to resolve env vars for probe commands, CI configuration, or credential verification across arbitrary project types

The existing `parseDotenv()` in `lib/profiles/env.mjs` handles basic `KEY=VALUE` patterns but lacks:
- Multiline values (common in certs, private keys)
- Variable expansion (`${DB_HOST}` referencing other vars)
- `.env` file cascading (`.env.local` → `.env.test` → `.env`)
- Encrypted vault support (`.env.vault`)

These limitations would surface in real projects that use adev. The constitution requires ADR justification for any new external dependency.

## Decision

Add `@dotenvx/dotenvx` as a **dev dependency** with the following constraints:

1. **Dev-only** — listed in `devDependencies`, excluded from the published package via the `files` field in `package.json`
2. **Pinned version** — exact version pinned (no range), integrity hash in `package-lock.json`
3. **No network calls** — verified that dotenvx performs no network I/O during `.env` file loading (encryption/decryption is local)
4. **Graceful degradation** — if dotenvx is unavailable (e.g., in CI without dev deps), code falls back to the internal `parseDotenv()` for basic `KEY=VALUE` loading
5. **Dynamic import** — loaded via `await import('@dotenvx/dotenvx')` so missing module is a runtime warning, not a startup crash

## Alternatives Considered

1. **Internal `parseDotenv()` only** — Insufficient for real-world `.env` files with multiline values, variable expansion, and cascading. Would require building our own parser to feature parity, violating the spirit of "minimize dependencies" by re-implementing a well-solved problem.

2. **Node.js `--env-file` flag** — Only available in Node 20.6+. Not usable as a library API (requires process-level flag). Does not support variable expansion or cascading.

3. **`dotenv` (original package)** — Lacks encryption support, variable expansion requires a separate plugin (`dotenv-expand`), and maintenance concerns (single maintainer). dotenvx is the maintained successor with a clearer security posture.

## Consequences

- One new dev dependency added (`@dotenvx/dotenvx`)
- Published package size unchanged (excluded via `files` field)
- `lib/infra-preflight.mjs` uses dotenvx when available, falls back to internal parser
- Future skills can import dotenvx for full `.env` loading without additional ADRs
- Supply chain surface increases by one package — mitigated by pinning, integrity hash, and dev-only scope
