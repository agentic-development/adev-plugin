---
charter: lifecycle-artifacts
kind: behavioral
status: implemented
risk_level: low
milestone: spec-and-charter-taxonomy
revision: 1
charter-revision: 2
created: 2026-05-14

plan-ref: .context-index/specs/features/lifecycle-artifacts/kind-enumeration.plan.md

source-manifest:
  sha: "3eba56a"
  files:
    - lib/kinds.mjs
    - tests/lib/kinds.test.mjs
  computed-at: "2026-05-14T21:44:35.879Z"
---

# Live Spec: Kind Enumeration

<!-- Live Spec within the lifecycle-artifacts charter.
     Defines the closed enumerations of spec kinds and charter kinds, plus the validation
     helpers consumed by /adev:specify, /adev:brainstorm, and /adev:hygiene.
     This is the foundational primitive; every other capability in the charter depends on it.
     Parent Charter: .context-index/specs/features/lifecycle-artifacts/charter.md -->

## Behavioral Contract

This spec defines the foundational `lib/kinds.mjs` module: the closed enumerations
for spec kinds and charter kinds, plus two validation helpers consumed by every
downstream capability in the lifecycle-artifacts charter.

### Preconditions

- Node.js runtime supporting ESM (per `platform-context.yaml`).
- No other adev modules required — `lib/kinds.mjs` is foundational; it imports nothing from `lib/` and requires no `node:` built-ins.

### Behaviors

1. **When** `SPEC_KINDS` is imported **then** it returns the frozen array `['behavioral', 'refactor', 'action', 'skill', 'integration', 'artifact']` in that exact stable order.
2. **When** `CHARTER_KINDS` is imported **then** it returns the frozen array `['module', 'feature', 'cross-cutting', 'initiative']` in that exact stable order.
3. **When** `isValidKind(layer, kind)` is called with `layer` ∈ `{'spec', 'charter'}` and `kind` present in that layer's enumeration **then** it returns `true`.
4. **When** `isValidKind(layer, kind)` is called with a valid `layer` but a `kind` value not present in that layer's enumeration **then** it returns `false` (does not throw).
5. **When** `isValidKind(layer, kind)` is called with a non-string `kind` (number, object, `null`, `undefined`) **then** it returns `false` (does not throw).
6. **When** `isValidKind(layer, kind)` is called with `layer` ∉ `{'spec', 'charter'}` **then** it throws an `Error` with `code: 'INVALID_LAYER'` and a message naming the offending value.
7. **When** `defaultKindFor('spec')` is called **then** it returns `'behavioral'`. **When** `defaultKindFor('charter')` is called **then** it returns `'feature'`.
8. **When** `defaultKindFor(layer)` is called with `layer` ∉ `{'spec', 'charter'}` **then** it throws an `Error` with `code: 'INVALID_LAYER'`.

### Postconditions

- The module exports exactly four names: `SPEC_KINDS`, `CHARTER_KINDS`, `isValidKind`, `defaultKindFor`. No other exports.
- `SPEC_KINDS` and `CHARTER_KINDS` are frozen (`Object.isFrozen()` returns `true`); under ESM's strict-mode semantics, mutation attempts throw `TypeError`.
- Re-importing the module returns the same array references (module-level constants, not factory functions); identity equality holds across imports.

### Error Cases

| Condition | Expected Behavior | Error Code |
|---|---|---|
| `isValidKind(layer, kind)` with `layer` ∉ `{'spec', 'charter'}` | Throws `Error` | `INVALID_LAYER` |
| `defaultKindFor(layer)` with `layer` ∉ `{'spec', 'charter'}` | Throws `Error` | `INVALID_LAYER` |
| `isValidKind(layer, kind)` with non-string `kind` (number, object, `null`, `undefined`) | Returns `false` (graceful, does not throw) | — |
| Attempt to mutate `SPEC_KINDS` or `CHARTER_KINDS` (push, pop, splice, index assignment) | Throws `TypeError` under ESM strict mode | `TypeError` |

## System Constitution Reference

- **Principle 1: "Minimize external dependencies — prefer Node.js built-ins"** — Applies because `lib/kinds.mjs` has zero imports (no external packages, no `node:` built-ins). Pure JavaScript.
- **Principle 3: "Pure ESM — all `.mjs` files, `'type': 'module'` in package.json"** — Applies directly: the module is `.mjs` ESM with named exports only.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Create `lib/kinds.mjs` | Author the module with `SPEC_KINDS`, `CHARTER_KINDS`, `isValidKind`, `defaultKindFor` per the behavioral contract. Use `Object.freeze()` on the arrays. | small |
| Create `tests/lib/kinds.test.mjs` | Cover all 8 behaviors + frozen invariant + `INVALID_LAYER` error code using `node:test`. | small |

## Acceptance Criteria

- [ ] `lib/kinds.mjs` exists, ESM with `.mjs` extension, zero imports
- [ ] `SPEC_KINDS` exports the six-value frozen array in documented order
- [ ] `CHARTER_KINDS` exports the four-value frozen array in documented order
- [ ] `isValidKind(layer, kind)` returns boolean per behaviors 3–5; throws `INVALID_LAYER` per behavior 6
- [ ] `defaultKindFor(layer)` returns `'behavioral'` for `'spec'` and `'feature'` for `'charter'` per behavior 7; throws `INVALID_LAYER` per behavior 8
- [ ] Tests at `tests/lib/kinds.test.mjs` cover all 8 behaviors and the frozen-array invariant
- [ ] `npm test` passes
- [ ] No constitutional violations introduced
