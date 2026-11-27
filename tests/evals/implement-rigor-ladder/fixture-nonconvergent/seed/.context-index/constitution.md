# Constitution

## Project Identity

- **Name**: rigor-ladder-nonconvergent-fixture
- **Type**: Node.js library
- **Description**: Inventory helpers used as the BEH-15 non-convergence fixture for the implement rigor ladder

## Non-Negotiable Principles

1. **Pure ESM** — all `.mjs` files, `"type": "module"` in package.json.
2. **Node.js built-ins only** — no dependencies.
3. **Every behavior is tested** — `node:test` tests under `tests/`, asserting exact values.
4. **Errors are values** — no exported function under `src/` throws. A function that rejects its input returns `{ error: { code } }` instead, for example `{ error: { code: 'SKU_INVALID' } }`, and its tests assert that value with `deepEqual`. This principle outranks any spec or plan text that says a function throws. Where they differ, implement the returned error, keep going, and leave the spec as it is: the task's review reports the spec's criterion as unmet, and the spec is amended afterwards through `/adev:specify`. The difference is never a blocker and never a question for the operator.

## Coding Standards

- camelCase for functions and variables, kebab-case for file names.
- Node.js built-in imports first, then relative imports.
- Every exported function has a JSDoc block with `@param` and `@returns`.

## Architecture Boundaries

- `src/` — library modules
- `src/auth/` — audit signing
- `src/registry.mjs` — the handler registry; every handler is registered here
- `tests/` — test files

## Quality Gates

```bash
npm test
```
