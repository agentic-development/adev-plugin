---
charter: test-strategies
kind: behavioral
status: validated
risk_level: medium
revision: 1
charter-revision: 2
amends: .context-index/specs/features/test-strategies/strategy-profile-contract.spec.md
target-revision: 3
created: 2026-09-11
updated: 2026-09-11
---

# Amendment: Spec: Strategy Profile Contract (targeting rev 3)

> This spec **amends** `.context-index/specs/features/test-strategies/strategy-profile-contract.spec.md` targeting revision 3.
> The base spec is immutable; this artifact carries the delta and is
> reviewed, planned, and validated on its own lifecycle.

## Amendment Rationale

A test-suite audit of this repository (session 2026-09-11) found that although nearly
every feature exposes a working CLI subcommand or hook, roughly 55-65% of `unit`-strategy
tests import an internal `lib/**` function directly and assert on its return value,
bypassing the CLI/hook boundary the feature is actually delivered through. Concrete
example: `tests/lib/manifest.test.mjs` unit-tests `findDuplicateTopLevelKeys` in isolation,
duplicating coverage `tests/cli/manifest-lint.test.mjs` already provides by spawning
`adev manifest lint --json` and asserting on its output. This is the classic
white-box-vs-black-box TDD distinction (Kent Beck's original intent; Ian Cooper, "TDD,
where did it all go wrong" — attach tests at the public service boundary, not at every
internal function) and it is currently unenforced: the base spec's Behavior 5
(`assertion_rules`) governs *what may be mocked* but says nothing about *which entry
point the test itself must invoke*.

The other 8 strategies do not need this amendment. Their RED/GREEN mechanism is itself
an external-boundary artifact by construction — a schema assertion script, a Pact
consumer contract, an OPA policy denial, a screenshot diff — so there is no internal
function to bypass into. Only `unit` covers freeform business logic reachable via
ordinary language-level imports, which is where the entry-point-bypass pattern is
possible at all. This amendment is scoped to `unit` accordingly.

## Behavioral Delta

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** the `unit` strategy profile's `assertion_rules` field is authored
  or updated, **then** it states an entry-point boundary rule in addition to the existing
  mocking-boundary rule: a test's primary assertion for a given behavior MUST invoke that
  behavior through its designated public entry point — a CLI subcommand invoked as a
  subprocess, a hook's stdin/stdout + exit-code contract, or a function the module
  explicitly documents as a public library API — whenever such a public entry point
  exists for the behavior under test.
- **BEH-2** — **When** a behavior is implemented behind both a public entry point and
  internal helper functions it composes, **then** internal-function-level tests remain
  permitted only as a supplement to (never a replacement for) a public-entry-point test of
  the same behavior — e.g., covering branch combinations of a pure internal algorithm that
  are impractical to drive end-to-end through the CLI/hook. A suite that tests only the
  internal helper and never exercises the public entry point for that behavior does not
  satisfy this rule.
- **BEH-3** — **When** no public entry point exists for a given behavior (e.g., a helper
  with no CLI/hook surface and no documented library-API status), **then** the
  entry-point-boundary rule does not apply and a direct internal-function test is
  sufficient — this amendment does not mandate manufacturing a public entry point where
  none is warranted.
- **BEH-4** — **When** `docs/test-strategies.md` documents the `unit` strategy's
  `assertion_rules`, **then** it states the entry-point boundary rule alongside the
  existing external-boundary mocking rule, so the two are read together rather than the
  new rule being profile-only and undiscoverable from the docs.

### Out of Scope

- The other 8 strategy profiles (`schema`, `fixture`, `policy`, `contract`, `integration`,
  `threshold`, `visual`, `smoke`) are unaffected — see Amendment Rationale for why.
- No enforcement mechanism (a gaming-detector rule, a validate-time check) is introduced
  by this amendment. Per the base spec's existing model, `assertion_rules` is guidance
  consumed by `/adev:write-test` at authoring time, not a mechanically verified gate — the
  same advisory posture `test_depth_assigned`'s floor already uses (ADR-0017). A follow-on
  could add `ENTRY_POINT_BYPASS` as a `unit` gaming_blocker if the advisory approach proves
  insufficient; that is out of scope here.
- Retrofitting the existing test suite (the ~150 `lib/**`-importing tests the audit found)
  is out of scope. This amendment changes the rule going forward; it does not mandate a
  migration of pre-existing tests.

## Acceptance Criteria

- [ ] `lib/test-strategies/profiles/unit.md`'s `assertion_rules` field states the
      entry-point boundary rule (BEH-1) alongside the existing mocking-boundary rule
- [ ] `docs/test-strategies.md` documents the entry-point boundary rule under the `unit`
      strategy's assertion rules discussion (BEH-4)
- [ ] The rule's scope (BEH-2, BEH-3) is stated clearly enough that a supplementing
      internal-function test is not mistaken for a violation
- [ ] No changes to `schema-strategy-profile.spec.md`, `contract-strategy-profile.spec.md`,
      or the other 6 non-`unit` profile specs
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
