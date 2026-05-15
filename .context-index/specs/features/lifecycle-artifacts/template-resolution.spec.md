---
charter: lifecycle-artifacts
kind: behavioral
status: implemented
risk_level: medium
milestone: spec-and-charter-taxonomy
revision: 2
charter-revision: 2
created: 2026-05-14

plan-ref: .context-index/specs/features/lifecycle-artifacts/template-resolution.plan.md

source-manifest:
  sha: "460d98e"
  files:
    - lib/template-resolution.mjs
    - tests/lib/template-resolution.test.mjs
  computed-at: "2026-05-15T13:32:34.277Z"
---

# Live Spec: Template Resolution

<!-- Defines resolveTemplate(layer, kind, domain) → template_path: the API consumed
     by /adev:specify, /adev:brainstorm, and /adev:init to load the right template
     for a given (artifact_layer, kind, domain) tuple. -->

## Behavioral Contract

This spec defines the `resolveTemplate(layer, kind, domain)` function in `lib/template-resolution.mjs` — a peer of `lib/domains/domain-config.mjs`. The function returns the path to the most-specific template file available for the requested combination, falling through domain → bundled software defaults.

### Preconditions

- `lib/kinds.mjs` exists and exports `isValidKind`, `defaultKindFor` (see `kind-enumeration.spec.md`).
- `lib/domains/domain-config.mjs` exists with the existing `loadDomainConfig()` API.
- Bundled templates exist at `templates/spec-template.<kind>.md` and `templates/charter-template.<kind>.md` for every valid kind (see `spec-templates.spec.md` and `charter-templates.spec.md`).
- **Path-containment roots** are determined at module load: the plugin's `templates/` directory (resolved via the plugin root from `cli/index.mjs`) and any registered domain extension's `domain/` directory (resolved via `loadDomainConfig()`). Any resolved template path MUST be a descendant of one of these roots (verified via `fs.realpathSync` to follow symlinks).

### Behaviors

1. **When** `resolveTemplate(layer, kind, domain)` is called with valid `layer` ∈ `{'spec', 'charter'}`, `kind` valid for that layer, and `domain` either `null` or a string **then** it returns the absolute filesystem path of the most-specific template file available.
2. **When** the resolution chain has a domain-specific override available **then** that path wins (domain extension's `domain/spec-template.<kind>.md` or `domain/charter-template.<kind>.md`).
3. **When** the domain has no override for the requested `(layer, kind)` **then** resolution falls through to the bundled `software`-domain default at `templates/<layer>-template.<kind>.md`.
4. **When** `domain` is `null` or `undefined` **then** resolution starts at the bundled `software` default (no domain lookup).
5. **When** `layer` ∉ `{'spec', 'charter'}` **then** it throws `Error` with `code: 'INVALID_LAYER'` (propagated from `lib/kinds.mjs`; preserves the distinction established by `kind-enumeration.spec.md`).
6. **When** `layer` is valid but `kind` is not in the layer's enumeration (`isValidKind(layer, kind)` returns `false`) **then** it throws `Error` with `code: 'INVALID_KIND'`.
7. **When** no template file exists for the requested combination (neither domain override nor bundled default) **then** it throws `Error` with `code: 'TEMPLATE_NOT_FOUND'` carrying the resolved paths attempted.
8. **When** the resolved candidate path is NOT a descendant of an allowed path-containment root (escape via symlink or `..` in a domain override) **then** it throws `Error` with `code: 'UNSAFE_TEMPLATE_PATH'` and the offending path is included in the error message. Performs `fs.realpathSync` on the candidate before containment check to defeat symlink escape.
9. **When** the resolved template file is unreadable (permission denied, etc.) **then** it throws the underlying `fs` error per Node.js conventions.

### Postconditions

- Returned paths are absolute and exist on disk (`fs.existsSync()` returns `true`).
- The function is read-only; never creates, modifies, or deletes any template file.
- Resolution is deterministic: same inputs return the same path.

### Error Cases

| Condition | Expected Behavior | Error Code |
|---|---|---|
| `layer` ∉ `{'spec', 'charter'}` | Throws `Error` (propagated from `kinds.mjs`) | `INVALID_LAYER` |
| `kind` not in the layer's enumeration | Throws `Error` | `INVALID_KIND` |
| No template available for (layer, kind) — neither domain nor bundled | Throws `Error` with attempted-paths context | `TEMPLATE_NOT_FOUND` |
| Resolved candidate path escapes the allowed roots (symlink/`..` traversal) | Throws `Error` with offending path | `UNSAFE_TEMPLATE_PATH` |
| Domain extension has malformed config | Falls through to bundled (existing `loadDomainConfig()` tolerance) | — |
| Template file unreadable | Throws underlying `fs` error | `EACCES` / `EISDIR` |

## System Constitution Reference

- **Principle 1: "Minimize external dependencies"** — Uses only Node.js `node:fs` and `node:path` built-ins.
- **Principle 3: "Pure ESM"** — `.mjs` module with named exports.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Create `lib/template-resolution.mjs` | `resolveTemplate(layer, kind, domain)` function with the fallback chain | small |
| Tests | Cover 7 behaviors, both layers, all 10 kinds, domain present/absent, missing-template error | small |

## Acceptance Criteria

- [ ] `lib/template-resolution.mjs` exists, ESM
- [ ] `resolveTemplate(layer, kind, domain)` resolves to an existing absolute path for every (layer, kind) in `SPEC_KINDS` × `CHARTER_KINDS`
- [ ] Domain override wins when present; falls through to bundled software default otherwise
- [ ] Throws `INVALID_LAYER`, `INVALID_KIND`, `TEMPLATE_NOT_FOUND`, and `UNSAFE_TEMPLATE_PATH` per error cases
- [ ] Path containment verified via `fs.realpathSync` before returning; symlinks pointing outside allowed roots rejected
- [ ] Tests cover all 9 behaviors + symlink-escape attempt
- [ ] `npm test` passes
- [ ] No constitutional violations introduced
