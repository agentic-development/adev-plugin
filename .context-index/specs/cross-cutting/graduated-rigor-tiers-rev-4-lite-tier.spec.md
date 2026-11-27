---
mode: cross-cutting
affects: [review-specs, validate, route, work, init, build, implement]
kind: skill
status: review-pending
risk_level: medium
revision: 1
charter-revision: 1
amends: .context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md
target-revision: 4
created: 2026-11-26
updated: 2026-11-26
---

# Amendment: Skill Spec: Graduated Rigor Tiers (targeting rev 4)

> This spec **amends** `.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md` targeting revision 4.
> The base spec is immutable; this artifact carries the delta and is
> reviewed, planned, and validated on its own lifecycle.

## Amendment Rationale

`.context-index/specs/features/implementation/implement-rigor-ladder.spec.md` adds a third rigor tier, `lite`, used only by `/adev:implement`. A `lite` task gets no per-task reviewer. The base spec's invariant "quick never weakens hard gates" names only `quick`, so it says nothing about the new tier. BEH-14 requires that a run with `lite` tasks relaxes no hard gate, and that per-task review is classified as review breadth rather than as a hard gate. Without this amendment, "no per-task reviewer" could be read as a skipped gate.

## Behavioral Delta

- **Legal tiers.** `RIGOR_MODES` is `full | quick | lite`. `isValidTier('lite')` is true; any other value still fails with `INVALID_TIER`.
- **Resolution helper.** `resolveRigorMode` returns `full | quick | lite`, but returns `lite` only for `skill === "implement"`. For every other skill a resolved `lite` maps to `quick`. The implement fallback becomes `quick`; the `review_mode` and `validate_mode` fallbacks stay `full`.
- **Policy validation.** `loadRigorPolicies` validates `review_mode`, `validate_mode` and `implement_mode` against `RIGOR_MODES`, throws `INVALID_TIER` for a bad value or an unparseable file, and throws `LITE_NOT_ALLOWED_FOR_HIGH` for `high.implement_mode: lite`. The Failure Modes row "`risk-policies.yaml` missing/legacy → `full`" still holds for `review_mode` and `validate_mode`. For `implement_mode`, a missing file or missing key resolves `quick` (BEH-2), as the Resolution helper bullet above states. A malformed value or an unparseable file is now an error for all three keys.
- **`--tier lite` on the gate skills.** `/adev:review-specs` and `/adev:validate` accept `--tier lite` and run exactly as `--tier quick`, printing one line saying so. `/adev:build` and `/adev:work` forward `--lite` or `--tier lite` only when the operator typed it.
- **Routing signal.** `/adev:route` output is an eligibility signal, never an authorization for `lite`. Route's "easy" rule for `lite` is `liteEligible(entry)` in `lib/implement/review-depth.mjs`.

### Amended invariant

The base invariant "quick never weakens hard gates" is replaced by:

> **Invariant — `quick` and `lite` never weaken hard gates.** `quick` reduces reviewer and check breadth. `lite` removes the per-task reviewer for eligible `/adev:implement` tasks. Per-task review is review breadth, not a hard gate. Neither tier may bypass any of these, which apply to a run with `quick` or `lite` tasks exactly as in `full`:

- The strict `lifecycle.gate_mode` chain (review still runs).
- `adev gate require` before the step-started event.
- The non-main-branch stop in `/adev:implement`.
- Skill extensions loaded through `adev skill-ext load`.
- `test-integrity.md`, in every mode and for every task.
- Quality-gate fail-fast, per task and, after any `lite` task, over the whole run.
- Destructive-action gates.
- Constitution checks.

`skills/implement/references/lite-mode.md` section 8 lists every gate above, and a test compares the two lists.

## Acceptance Criteria

The base criterion "`quick` never bypasses a hard gate (strict review gate, non-main-branch stop, quality-gate fail-fast, constitution)" is amended to cover `lite` and the full gate list above. The base criterion "`resolveRigorMode` returns the correct mode for every precedence combination" now also covers `lite` and its mapping to `quick` for every skill other than `implement`.

- [ ] `resolveRigorMode` returns `lite` only for `implement` and maps `lite` to `quick` for `review-specs` and `validate`; the implement fallback is `quick`.
- [ ] `loadRigorPolicies` throws `INVALID_TIER` for a malformed value or unparseable file and `LITE_NOT_ALLOWED_FOR_HIGH` for `high.implement_mode: lite`.
- [ ] `/adev:review-specs --tier lite` and `/adev:validate --tier lite` run as `quick` and print the mapping line.
- [ ] The amended invariant names `lite`, states that per-task review is review breadth, not a hard gate, and every gate it lists appears in `lite-mode.md` section 8 (`implement-rigor-ladder.spec.md` BEH-14).
