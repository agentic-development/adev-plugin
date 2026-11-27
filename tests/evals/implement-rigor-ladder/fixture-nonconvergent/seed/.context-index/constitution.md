# Constitution

## Project Identity

- **Name**: rigor-ladder-nonconvergent-fixture
- **Type**: Node.js library
- **Description**: Inventory helpers used as the BEH-15 non-convergence fixture for the implement rigor ladder

## Non-Negotiable Principles

1. **Pure ESM** — all `.mjs` files, `"type": "module"` in package.json.
2. **Node.js built-ins only** — no dependencies.
3. **Every behavior is tested** — `node:test` tests under `tests/`, asserting exact values.

## Architecture Boundaries

- `src/` — library modules
- `src/auth/` — audit signing
- `src/registry.mjs` — the handler registry; every handler is registered here
- `tests/` — test files

## Quality Gates

```bash
npm test
```
