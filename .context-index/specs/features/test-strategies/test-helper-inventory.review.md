# Spec Review: Test Helper Inventory

> **Spec:** `.context-index/specs/features/test-strategies/test-helper-inventory.spec.md`
> **Reviewed:** 2026-08-13
> **Reviewers:** structural-architect + consistency (single combined read-only pass)
> **Verdict (rev 1):** BLOCKED — 3 blockers, 8 concerns
> **Verdict (rev 2):** PASS_WITH_NOTES — all blockers resolved, all concerns addressed or
> explicitly deferred with rationale

## Facts verified against the repo

| Claim in spec | Verified |
|---|---|
| `matchGlob` is exported from `lib/test-strategies/manifest.mjs` | yes (`:20`) |
| `skills/write-test/SKILL.md` has zero conftest / test-helper-module / golden-test-sample references | yes |
| `skills/sample/SKILL.md` excludes test files from sample candidacy | yes (Step 2b `:69`, Red Flag `:245`) |
| `.context-index/samples/general-test-helpers.md` declares `Source: tests/helpers.mjs` | yes (`:4`) |
| `lib/cli/context.mjs` exports no `LIFECYCLE_STEP`, and `tests/cli-driver-pattern.test.mjs` tolerates that | yes (`context.mjs:25`; the test `continue`s when no step is found) |

## Blockers (rev 1) and resolutions (rev 2)

1. **`test_strategies.helpers` nesting inverts the contract it cites.**
   `parseTestStrategies()` (`lib/test-strategies/manifest.mjs:82-91`) requires `test_strategies`
   to be an *array*; an object-shaped section returns `strategies: []` plus a warning. Pinned by
   `tests/lib/test-strategies/manifest.test.mjs:125,197`. Any project adopting rev 1's Behavior 4
   would silently lose every strategy declaration and fall back to `unit`, violating the
   charter's Backward-compatibility attribute.
   **Resolved:** Behavior 4 now declares a top-level `test_helpers` block, a sibling of the
   existing top-level `test_policy` mapping, with the reasoning recorded inline.

2. **Charter omission.** No Capability Map row, no Interface Contract entry; the spec declared
   `charter-revision: 4` against an unamended charter.
   **Resolved:** charter revision 4 → 5, one capability row appended at the end of the Capability
   Map (no existing row reordered or edited), three Interface Contract entries added; spec
   declares `charter-revision: 5`.

3. **Behavior 7 contradicted Behavior 1.** B7 guaranteed byte-identical output; B1 bounded the
   walk by a 2000 ms wall-clock deadline, which is nondeterministic near the boundary and would
   make the determinism acceptance criterion flaky.
   **Resolved:** the wall-clock deadline is removed entirely. The walk is bounded only by counts
   (20 000 visited entries, 200 results) and visits directories in name-sorted order, so even a
   truncated result is stable. B7's guarantee is now unconditional.

## Concerns and dispositions

| # | Concern | Disposition |
|---|---|---|
| 1 | Behavior 3 undefined for most directory probes; per-file emission under `__mocks__/` would exhaust the budget | **Fixed.** Exactly one registry row is directory-shaped; every directory probe lives on it. The walk does not descend into a matched directory, so roll-up depth is unambiguous. |
| 2 | `matchGlob` cannot match a directory path (`dir/**` → `^dir/.*$`) | **Fixed.** Directory globs are written without the trailing `/**` and matched against directory paths during the walk. Stated explicitly in Behavior 3. |
| 3 | Behavior 6's `*.test.*` shapes compile to root-basename-only patterns | **Fixed.** All shapes are `**/`-prefixed. |
| 4 | `> **Sample kind:** test` exists nowhere in the repo; template and `/adev:sample` unamended | **Fixed.** New Behavior 14 makes the template field and the `/adev:sample --test` carve-out explicit deliverables, and flags the Red-Flags edit for independent human veto. Behavior 6's second clause keeps the inventory working if Behavior 14 is rejected. |
| 5 | Postconditions covered `LIFECYCLE_STEP` but not the `run`/`help` exports or `VERB_REGISTRY` registration | **Fixed.** Both added to Postconditions and to Acceptance Criteria. |
| 6 | `check --file` per test file re-runs the full scan (N × cost) | **Fixed.** `--file` is repeatable; the inventory is built once per invocation. Behavior 11 now specifies a single batched call. |
| 7 | `## Shared Test Helpers` collides with `skills/write-test/SKILL.md`'s existing `## Companion Helpers` | **Fixed.** Injected heading is `## Shared Test Helper Inventory`, with the reason recorded in Behavior 11. |
| 8 | `**/testing/**` matches production `lib/testing/` paths — false positives against the charter's zero-false-positive attribute | **Fixed.** Probe dropped from the registry; projects that need it declare `test_helpers.paths`. |

## Notes carried into implementation

- The registry is intentionally path-shaped and will under-detect on non-standard layouts. This
  is documented under Known Limitations as an escape hatch, not a defect.
- The capability ships **no gate**. The Scope Decision section is the spec's own argument for
  why; a reviewer who disagrees should challenge that section rather than the behaviors.
