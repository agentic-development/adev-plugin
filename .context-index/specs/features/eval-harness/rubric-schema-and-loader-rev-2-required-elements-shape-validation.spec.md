---
charter: eval-harness
kind: behavioral
status: review-pending
risk_level: medium
revision: 1
charter-revision: 2
amends: .context-index/specs/features/eval-harness/rubric-schema-and-loader.spec.md
target-revision: 2
created: 2026-11-15
updated: 2026-11-15
---

# Amendment: Live Spec: Unified rubric schema and loader (targeting rev 2)

> This spec **amends** `.context-index/specs/features/eval-harness/rubric-schema-and-loader.spec.md` targeting revision 2.
> The base spec is immutable; this artifact carries the delta and is
> reviewed, planned, and validated on its own lifecycle.

## Amendment Rationale

Filed as `adev-plugin-rubric-shape-validation-2iuh` (P2), confirmed by two independent
`/adev:validate` passes against this spec. `loadRubric` validates the *presence* of
`required_elements` and `quality_dimensions` (BEH-3) but never their *shape*: a rubric
declaring `required_elements: "oops"` — a string, not a list — loads successfully. The
same `!Array.isArray(entries) return;` early-return recurs at all four sites in
`lib/evals/rubric.mjs` that read either list key (`assertListEntriesComplete`,
`assertListVerdictsLegal`, `assertNoLegacyWeights`, `assertListIdsUnique`), so a
wrong-typed list key silently degrades to "zero entries" at every one of them rather than
failing once, loudly, at load time.

This directly contradicts the base spec's own Behavioral Contract: "a rubric that
violates the schema fails loudly at load time rather than degrading silently at score
time." It is the same class of failure BEH-2 exists to prevent for nested maps — caught
there, missed here. Downstream, `skills/eval/SKILL.md`'s "Deterministic layer" step
iterates `required_elements` directly; a rubric with a string there scores as though the
author declared zero deterministic elements, which is indistinguishable from the
legitimate, intentional empty list `no-required-elements.yaml` already exercises (BEH-9
below exists precisely to keep those two cases distinguishable).

**Why this is a spec amendment, not a loader patch:** the base spec is `status:
validated` and immutable in place. BEH-3 as written ("Missing required top-level keys...")
is silent on shape on purpose — the base spec never claimed to validate it — so tightening
`loadRubric` without first amending the contract it is validated against would make the
loader diverge from its own spec rather than converge with it.

## Behavioral Delta

**Unaffected by this amendment (stated for clarity, not re-specified):** BEH-1 through
BEH-8 carry forward unchanged, including BEH-3's absence-only scope for required-key
presence and BEH-6's shape rule for `budget_max_*` keys (a different, numeric-ranged key
family, out of scope here — see Error Cases delta).

**Adds BEH-9** (new — no equivalent in the base spec; numbered to continue the base's own
`BEH-<n>` sequence, since it takes effect on the same loader at the same target revision):

- **BEH-9 (list-key shape)** — **When** `required_elements` or `quality_dimensions` is
  present with a value that is not a list (a string, a number, or a boolean) **then**
  `loadRubric` throws `RUBRIC_INVALID_LIST_SHAPE` naming the offending key and the type it
  declared, and returns no partial structure. **When** either key's value is a list, of
  any length including zero **then** this behavior does not fire — an empty list remains
  the sanctioned way to declare "no entries of this kind" (see `no-required-elements.yaml`
  / `no-quality-dimensions.yaml`, both predating this amendment and both unaffected by it).
  A map value for either key is already rejected by BEH-2 (`RUBRIC_NESTED_MAP`) before this
  pass runs, so BEH-9's own scope is the two list keys' non-map, non-array scalars.

  This closes the shape gap BEH-3 deliberately left open for required-key presence: BEH-3
  asks only "is the key there at all", and BEH-9 is the first behavior to ask "if it's
  there, is it even the right kind of value" for the two keys every other pass assumes are
  lists. It must run after BEH-3 (absence is reported first) and before every pass that
  reads either list's entries (BEH-4's verdict check, BEH-5's completeness check, BEH-8's
  legacy-weight check, and the per-list uniqueness check that backs the "ids asserted
  unique" Acceptance Criterion) — those passes may now assume the key, if present, is
  genuinely a list.

**Error Cases delta:** adds one row (below); no existing row is changed or removed. The
new code is additive to `RUBRIC_ERROR_CODES` in `lib/evals/rubric-schema.mjs`.

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `required_elements` or `quality_dimensions` present but not a list | Throw, naming the key and the illegal type; no partial structure returned | `RUBRIC_INVALID_LIST_SHAPE` |

**Explicitly out of scope** (same filed report, lower severity, tracked separately): the
report's second instance — `insufficient_evidence_threshold_percent` arriving as a
non-numeric value, which makes the insufficient-evidence guard silently never fire — is a
numeric-ranged key, not a list-typed key, and already has its own belt-and-braces defense
at the scoring-engine boundary (`SCORE_INVALID_RUBRIC`, per the filed report's comment).
Folding it into BEH-9 would conflate two different value shapes under one behavior; it is
left for its own amendment if the loader-level gap there is to be closed too.

## Acceptance Criteria

- [ ] `required_elements: "oops"` (a string) is rejected by `loadRubric` with
      `RUBRIC_INVALID_LIST_SHAPE`, naming `required_elements` and the type `string`
- [ ] `quality_dimensions: "oops"` is rejected the same way, naming `quality_dimensions`
- [ ] A non-array, non-string scalar (a number, a boolean) in either key's place is
      rejected the same way — not just the string case
- [ ] `required_elements: []` and `quality_dimensions: []` (empty lists) still load
      cleanly — BEH-9 does not fire on an empty, well-typed list
- [ ] The existing `no-required-elements.yaml` / `no-quality-dimensions.yaml` fixtures and
      their scoring tests (`NOT_SCORED` on the empty half) are unaffected
- [ ] A map value for either key still raises `RUBRIC_NESTED_MAP` (BEH-2), not
      `RUBRIC_INVALID_LIST_SHAPE` — BEH-2 continues to run first
- [ ] `RUBRIC_INVALID_LIST_SHAPE` is declared in `RUBRIC_ERROR_CODES`
      (`lib/evals/rubric-schema.mjs`)
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations — zero new external dependencies
