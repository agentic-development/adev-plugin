---
charter: lifecycle-artifacts
kind: behavioral
status: validated
risk_level: medium
milestone:
revision: 2
charter-revision: 2
created: 2026-05-14

plan-ref: .context-index/specs/features/lifecycle-artifacts/frontmatter-discriminator.plan.md

source-manifest:
  sha: "59b27ba"
  files:
    - lib/meta-tools.mjs
    - tests/lib/frontmatter-kind-field.test.mjs
  computed-at: "2026-07-03T22:27:11.354Z"
---

# Live Spec: Frontmatter Discriminator

<!-- Defines the kind: frontmatter field semantics: read-time defaulting for legacy artifacts,
     write-time validation for new artifacts, and parser integration with spec-lifecycle. -->

## Behavioral Contract

This spec defines the runtime behavior of the `kind:` frontmatter field on `.spec.md` and `charter.md` files: how it is read, defaulted, validated, and exposed to consumers. **This spec is the canonical owner of the parser output fields `kind`, `kindValid`, and `kindResolved`.** Other specs (e.g., `read-time-defaulting.spec.md`) integrate these fields but do not introduce them.

### Preconditions

- `lib/kinds.mjs` exists and exports `SPEC_KINDS`, `CHARTER_KINDS`, `isValidKind`, `defaultKindFor` (see `kind-enumeration.spec.md`).
- The spec-lifecycle frontmatter parser (existing in `lib/lifecycle-state.mjs` and related modules) accepts a registry of recognized fields.

### Behaviors

1. **When** a `.spec.md` file is parsed with `kind: <valid spec kind>` in its frontmatter **then** the parsed result exposes `kind` set to that value.
2. **When** a `.spec.md` file is parsed without `kind:` in its frontmatter **then** the parsed result exposes `kind` set to `defaultKindFor('spec')` (= `'behavioral'`). Disk content is not modified.
3. **When** a `charter.md` file is parsed with `kind: <valid charter kind>` in its frontmatter **then** the parsed result exposes that value.
4. **When** a `charter.md` file is parsed without `kind:` in its frontmatter **then** the parsed result exposes `kind` set to `defaultKindFor('charter')` (= `'feature'`). Disk content is not modified.
5. **When** a `.spec.md` or `charter.md` file is parsed with `kind:` set to a value not in the layer's enumeration **then** the parsed result exposes the raw value verbatim AND sets a sentinel field `kindValid: false` for downstream consumers (hygiene, status). When the value IS in the enumeration (or has been defaulted), `kindValid: true`.
6. **When** a `.spec.md` or `charter.md` file is parsed **then** the parsed result exposes `kindResolved: 'explicit'` if `kind:` was present in the frontmatter, or `kindResolved: 'default'` if the value was applied by the read-time defaulting path (behaviors 2 / 4). This field lets consumers distinguish authored intent from inferred default without re-reading the file.
7. **When** `/adev:specify` or `/adev:brainstorm` is invoked to author a new artifact after Layer 1 lands **then** the resulting frontmatter MUST contain an explicit `kind:` field; the skill's write path rejects missing or invalid values upfront (this is the strict-on-write half of the posture).
8. **When** a manual edit to a spec/charter file leaves `kind:` missing **then** behaviors 2 / 4 (read-time defaulting) apply on next parse; `/adev:hygiene` reports the missing field as a non-blocking finding so it can be backfilled in Layer 2.

### Postconditions

- Every consumer of parsed spec/charter frontmatter sees a non-null `kind` value (either explicit or defaulted).
- Parsing is a pure read operation; never mutates files on disk.
- The `kindValid` sentinel allows downstream consumers to distinguish "validated kind" from "raw-but-unknown kind" without re-validating.
- The `kindResolved` sentinel allows downstream consumers to distinguish "authored intent" from "inferred default" without re-reading the file.
- The parser exposes exactly three new fields on the result object: `kind: string`, `kindValid: boolean`, `kindResolved: 'explicit' | 'default'`. All three are always present and non-null on every parsed result.

### Error Cases

| Condition | Expected Behavior | Error Code |
|---|---|---|
| Parser called on a non-existent path | Throws `Error` per existing parser contract | `FILE_NOT_FOUND` |
| Parser called on a file with unparseable frontmatter | Throws `Error` per existing parser contract | `INVALID_FRONTMATTER` |
| Skill write path called with missing `kind:` for a new artifact | Skill re-prompts user; no write occurs | `KIND_REQUIRED` (skill-level, not file-level) |
| Skill write path called with `kind:` not in enumeration | Skill rejects, shows valid options, re-prompts | `INVALID_KIND` |

## System Constitution Reference

- **Principle 2: "Skills are primarily markdown — Companion code (helpers, validators) is allowed but must not be required for the skill to function"** — Applies because the parser integration adds field recognition; the skill's authoring flow still works without it (the discriminator is additive).
- **Principle 3: "Pure ESM"** — Applies to the parser integration module.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Extend frontmatter parser | Recognize `kind:` field on spec/charter reads; apply `defaultKindFor(layer)` when missing | small |
| Add `kindValid` sentinel | Set `true`/`false` on parsed result based on `isValidKind(layer, kind)` | small |
| Add `kindResolved` sentinel | Set `'explicit'` when `kind:` was present, `'default'` when applied via read-time defaulting | small |
| Wire `/adev:specify` and `/adev:brainstorm` strict-write rejection | Reject missing/invalid `kind:` at skill write time | small (covered in skill-routing specs) |
| Tests | Cover all 8 behaviors + error paths | small |

## Acceptance Criteria

- [ ] Parser recognizes `kind:` and exposes it on parsed result
- [ ] Missing `kind:` defaults at read time per layer
- [ ] Invalid `kind:` exposed verbatim with `kindValid: false` sentinel
- [ ] `kindResolved` field exposed on every parsed result: `'explicit'` for present values, `'default'` for missing-then-defaulted
- [ ] Disk content unchanged by read-path defaulting
- [ ] Tests cover all 8 behaviors
- [ ] `npm test` passes
- [ ] No constitutional violations introduced
