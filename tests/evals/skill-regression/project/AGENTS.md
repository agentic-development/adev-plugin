# AGENTS.md

Agent-facing instructions for `orders-service`. Same rules as `CLAUDE.md`,
restated under the filename other tools read.

## What this project is

A small ESM library that turns a raw order payload into a validated, priced
order record. No network, no database, no framework.

## Rules

1. Pure ESM only — `.mjs`, `import` / `export`. A `require(...)` call or a
   `module.exports` assignment is a defect.
2. Anything exported from `src/index.mjs` must appear in `docs/api.md`.
3. Every file under `src/` must be reachable from `src/index.mjs`. An
   unreferenced module is dead code and should be deleted, not kept.
4. Money is integer cents. Rounding happens once, at the end of pricing.
5. Exported functions carry JSDoc with `@param` and `@returns`.

## Working on this repo

- Add behaviour under `src/orders/` and re-export it from `src/index.mjs`.
- Add a `node:test` suite under `tests/` for anything you add.
- Update `docs/api.md` in the same change that adds a public export.

## Verify

```bash
node --test tests/
```
