# CLAUDE.md

## Identity

`orders-service` accepts customer order payloads, validates them, prices them,
and returns a normalized order record. It is a library, not a server: the
caller owns transport and persistence.

## Non-Negotiable Principles

1. **Pure ESM.** Every module is `.mjs` with `import` / `export`. No CommonJS.
2. **Every public export is documented.** A symbol exported from `src/index.mjs`
   has a matching entry in `docs/api.md`.
3. **No orphan modules.** Every file under `src/` is reachable from
   `src/index.mjs`.
4. **Validation before pricing.** Never compute a total on an unvalidated
   payload.

## Coding Standards

- **Naming:** camelCase for functions and variables, kebab-case for filenames.
- **Errors:** throw `TypeError` for a malformed payload shape; return a result
  object for field-level and business-rule rejections so callers can branch
  without `try`.
- **Money:** integer minor units (cents) everywhere. Never floats.
- **JSDoc:** required on every exported function, with `@param` and `@returns`.

## Architecture Boundaries

| Concern | Location |
|---|---|
| Public entry point | `src/index.mjs` |
| Order creation | `src/orders/` |
| Public API reference | `docs/api.md` |
| Tests | `tests/` |

## Quality Gates

```bash
node --test tests/
```
