# Constitution — orders-service

> Fixture content. This is the constitution of a **fictional** Node.js orders
> library used as the subject of the skill-regression eval suite. Nothing here
> describes adev-plugin itself.
>
> It is the SOURCE of the fixture's `CLAUDE.md` and `AGENTS.md`, so the
> principles below are stated in the same terms those two files restate — a
> constitution that disagreed with its own synced agent files would plant an
> unintended drift finding inside a fixture whose findings are supposed to be
> the planted ones.

## Identity

`orders-service` accepts customer order payloads, validates them, prices them,
and returns a normalized order record. It is a library, not a server: the
caller owns transport and persistence.

## Non-Negotiable Principles

1. **Pure ESM.** Every module is `.mjs` with `import` / `export`. A
   `require(...)` call or a `module.exports` assignment is a defect.
2. **Every public export is documented.** A symbol exported from
   `src/index.mjs` has a matching entry in `docs/api.md`, added in the same
   change that adds the export.
3. **No orphan modules.** Every file under `src/` is reachable from
   `src/index.mjs`. An unreferenced module is dead code and is deleted, not
   kept.
4. **Validation before pricing.** Never compute a total on an unvalidated
   payload.
5. **Every declared dependency is used.** An entry in `package.json`
   `dependencies` that no file under `src/` imports does not belong there.

## Coding Standards

- **Naming:** camelCase for functions and variables, kebab-case for filenames.
- **Errors:** throw `TypeError` for a malformed payload shape; return a result
  object for field-level and business-rule rejections so callers can branch
  without `try`.
- **Money:** integer minor units (cents) everywhere. Never floats, and no
  rounding step exists — nothing is ever fractional, so there is nothing to
  round (ADR-0001).
- **JSDoc:** required on every exported function, with `@param` and
  `@returns`.
- **Tests:** anything added under `src/` gets a `node:test` suite under
  `tests/`.

## Architecture Boundaries

### Requires Human Approval

- Changing the shape of the returned order record
- Adding an external dependency
- Changing the public export surface of `src/index.mjs`

### Autonomous (Agent May Decide)

- Adding tests
- Refactoring inside a directory under `src/`
- Updating `docs/api.md` to match the export surface
- Updating specs when a code change invalidates their assumptions

## Context Routing

| Concern | Location |
|---|---|
| Public entry point | `src/index.mjs` |
| Order creation | `src/orders/` |
| Shipping rates | `src/shipping/` |
| Public API reference | `docs/api.md` |
| Tests | `tests/` |

<!--
  Deliberately NO "## Quality Gates" section, and the omission is a
  hermeticity requirement rather than an oversight: /adev:eval falls back to
  the constitution's quality-gate command block when governance/gates.yaml is
  absent (skills/eval/SKILL.md), which is the door one over from the one the
  gates.yaml ban closes. The hermeticity suite asserts the heading's absence.
-->
