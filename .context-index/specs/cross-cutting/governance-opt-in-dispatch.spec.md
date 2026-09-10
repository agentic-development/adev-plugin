---
partial_schema: spec@1
status: implemented
mode: cross-cutting
affects:
  - setup
  - review
  - reviewer-domain-fit
  - validation
kind: behavioral
revision: 3
created: 2026-09-09
updated: 2026-09-10
source-manifest:
  sha: "a87b0af"
  files:
    - .context-index/specs/features/review/charter.md
    - .context-index/specs/features/setup/risk-tier-bundles.spec.md
    - docs/cli-reference.md
    - docs/governance.md
    - lib/cli/governance.mjs
    - lib/governance/registry-marker.mjs
    - lib/governance/registry-scaffold.mjs
    - skills/init/SKILL.md
    - skills/review-specs/SKILL.md
    - skills/validate/SKILL.md
    - templates/risk-tiers/prototype/review-overlay.yaml
    - templates/risk-tiers/prototype/validate-overlay.yaml
    - templates/risk-tiers/strict/review-overlay.yaml
    - templates/risk-tiers/strict/validate-overlay.yaml
    - tests/cli/governance-scaffold.test.mjs
    - tests/cross-skill/governance-opt-in-handoff.test.mjs
    - tests/governance/registry-scaffold.test.mjs
    - tests/risk-tiers/tier-overlay-referential-integrity.test.mjs
    - tests/skills/init-governance-explicit-selection.test.mjs
    - tests/skills/init-risk-tier-overlay-baseline.test.mjs
    - tests/skills/review-specs-zero-reviewers-warning.test.mjs
    - tests/skills/validate-zero-checks-warning.test.mjs
    - tests/specs/governance-opt-in-dispatch-contract.test.mjs
  computed-at: "2026-09-10T16:25:27.464Z"
---

<!-- Cross-Cutting Live Spec. No single owning charter — affects setup
     (/adev:init Step 7 scaffold), review (governance/review.yaml contract,
     /adev:review-specs dispatch), reviewer-domain-fit (bundled reviewers.yaml
     content), and validation (governance/validate.yaml contract,
     /adev:validate dispatch). -->

# Live Spec: Governance Opt-In Dispatch

## Behavioral Contract

Neither `governance/review.yaml` nor `governance/validate.yaml` has a real "bundled defaults" fallback at dispatch time today — both loaders (`lib/governance/review-config.mjs`, `lib/governance/validate-config.mjs`) read only the project's own materialized file, exactly as their own "single-source model" doc comments already state. The two registries currently diverge only in *how a project ends up with checks/reviewers configured*, and in *what happens when it doesn't*:

- `governance/validate.yaml` is auto-scaffolded by `/adev:init` Step 7d.0 — copying the resolved domain's full starter (currently all 8 live checks) into the project's file the moment the operator says yes to Step 7 at all, with no per-check choice required. If the file is missing entirely (Step 7 skipped outright), `/adev:validate` hard-crashes with `MISSING_VALIDATE_CONFIG`.
- `governance/review.yaml` has no such auto-scaffold. It is written only if the operator makes an explicit customization/adoption/migration choice inside Step 7c. A project that opts into Step 7 but changes nothing in 7c ends up with **no file at all**, `assertMaterialized` treats that as a legitimate absent state, and `/adev:review-specs` dispatches **zero reviewers, silently** — no error, no warning, and the review step still reports a passing verdict.

This spec unifies both registries under one explicit-choice-at-scaffold-time model, and closes the silent-zero-reviewers gap: nothing dispatches unless an operator explicitly selected it, and an empty selection is always visible, never silent.

This does **not** change the loaders' single-source contract (`lib/governance/review-config.mjs`, `validate-config.mjs` already read only the project file — that stays). What changes is upstream, at `/adev:init` Step 7c/7d: the auto-copy-everything scaffold for `validate.yaml` is replaced with an explicit per-check selection, matching what `review.yaml` already effectively requires; and both paths gain a standing warning when the resulting selection is empty.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-------------------|
| `setup` | High | Step 7d.0's unconditional domain-starter copy becomes an explicit selection step (checklist or equivalent — exact UI placement is an open design question, see Coverage Gaps). Step 7c gains the same standing-warning behavior Step 7d gains. Step 7 summary reports the resulting selection counts and the warning state. |
| `review` | Medium | `skills/review-specs/SKILL.md` Step 3 gains a check: when `adev governance reviewers --json` returns zero enabled reviewers, print a standing warning before proceeding (the review still runs — zero dispatched reviewers is not itself an error — but it must never look identical to a normal pass). |
| `reviewer-domain-fit` | Low | No change to `templates/domains/software/reviewers.yaml`'s content — this spec does not touch which reviewers exist or their defaults, only how a project opts into running them. |
| `validation` | Medium | `skills/validate/SKILL.md` gains the equivalent standing-warning check for zero enabled checks. `templates/domains/<domain>/validate.yaml`'s role changes from "the file `/adev:init` copies verbatim" to "the menu `/adev:init` selects from" — the starter file itself is unchanged, only how `/adev:init` consumes it. |

## Integration Points

1. `setup` ↔ `review`/`validation`: `/adev:init` Step 7c/7d write `governance/review.yaml`/`governance/validate.yaml` reflecting only the operator's explicit selection — both loaders already only trust what's in those files, so this is purely an authoring-time change, not a loader change.
2. `review` ↔ `validation`: both skills implement the same "zero enabled → standing warning, not silence" pattern independently (no shared warning-rendering code exists today; whether to extract one is a `/adev:plan`-time call, not a behavioral requirement here).
3. `setup` ↔ `reviewer-domain-fit`: Step 7c.3's existing bundled-reviewer customization prompt (disable one / cap severity / propose project reviewer) becomes the same prompt an opt-in flow reuses — this spec does not require inventing a second customization surface, only changing its starting state from "all pre-selected" to "none pre-selected."

## System Constitution Reference

- **"Minimize external dependencies"** — No new dependency; this is a change to existing skill prose and CLI verb behavior (`adev governance materialize`, `adev init` Step 7 flow), all Node built-ins.
- **"Gate-Based Governance" (`skills/using-adev/SKILL.md`'s stated "four pillars" of the framework — not a `.context-index/constitution.md` principle; verified this phrase does not appear in the constitution itself)** — This spec's whole purpose is closing a gate that currently fails open (zero reviewers silently reads as "reviewed"). Directly serves the pillar rather than adding scope to it.
- **Architecture Boundaries — Requires Human Approval** — None of the five listed categories (new skill in lifecycle order, hook protocol, CLI install path, plugin registration format, external dependency) apply. This changes default *content* `/adev:init` writes and default *warning* behavior in two existing skills — squarely "editing skill markdown content" and "updating templates" under Autonomous, despite being a consequential behavior change. Flagged for human sign-off in this session anyway (2026-09-09 chat) because of blast radius, not because the constitution's own boundary list requires it.

## Coverage Gaps (open design questions)

- **UI placement is resolved: enhance in place at Step 7c.3/7d.1, not a combined screen at Step 7.0.** Step 7.0 exists for a different, already-orthogonal axis — risk tier, characterized as "orthogonal-to-domain" in `risk-tier-bundles.spec.md`. Folding a per-reviewer/per-check inclusion checklist into the risk-tier prompt would conflate two independent decisions into one screen the operator has to parse at once. Step 7c.3 already runs a customization prompt over the bundled reviewer list (`[d]`/`[c]`/`[p]`/`[s]`) and Step 7d.1 already runs a checklist-style quality-gate proposal (`Detected stack: Node.js. Propose these quality-gates: [ ] npm test ...`); enhancing those existing surfaces to ask *inclusion* first, then the existing per-item options, is the smaller change and reuses a UI shape the operator has already seen in the same wizard, rather than inventing a second one. This matches Integration Point 3's own framing for Step 7c ("this spec does not require inventing a second customization surface, only changing its starting state") — the same reasoning extends to Step 7d.
- **Warning surface exact wording/placement for `/adev:review-specs` and `/adev:validate`** is specified as "a standing warning, not silence" (Behaviors below) but the precise message text and whether it also appears in `/adev:init`'s own summary (in addition to at review/validate run time) is left to planning.
- **Existing projects.** A project already `/adev:init`-ed under the old auto-copy-everything model has a materialized `governance/validate.yaml` with all checks already selected — this spec does not require retroactively un-selecting anything for existing projects; it governs scaffold-time behavior for projects that (re-)run Step 7 after this ships.
- **`risk-tier-bundles`' overlay semantics** (adev-plugin-i2vl, shipped 2026-09-07/09): the `prototype`/`strict` tier overlays currently assume the resolved domain's full reviewer/check set as their starting point to soften or tighten. Once Step 7c/7d's baseline becomes "nothing selected" instead of "everything selected," a tier overlay applied on top of an *empty* selection has no defined behavior yet — this is the concrete interaction that makes this spec and risk-tier-bundles "the same thread." Resolving it is this spec's Behavior 6 below, not deferred.

### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `/adev:init` Step 7d runs (governance opted in) **then** the operator is presented with the resolved domain's full check list and explicitly selects which checks to include, rather than the checklist arriving pre-selected; `governance/validate.yaml` is written containing only the selected checks (plus their `materialized_at`-equivalent — `validate.yaml` is marker-exempt, so this is the write itself, not a separate stamp). The write reuses `spliceRegistryEntries` (`lib/extensions/governance-splice.mjs`) — the same non-destructive, text-preserving mechanism `materialize.mjs` already applies to this class of file (DDR-7) — never a bare re-serialize of a parsed document; a generic YAML re-stringify is explicitly out, since it has already caused data loss on a real `validate.yaml` once (a naive reserializer replaced 7 checks and 20 comment lines with three lines). Step 7d.0 sub-step 5's existing idempotency guard ("if `governance/validate.yaml` already exists: no-op, skip overlay re-write") is preserved unchanged under this rework — the selection UI and the splice-based write replace the byte-verbatim copy, not the guard around it.
- **BEH-2** — **When** the operator selects zero checks at Step 7d **then** `governance/validate.yaml` is still written (an explicit empty `checks: []`, not an absent file) — an operator who deliberately chose nothing is in a different, legitimate state from one who never engaged with Step 7d, and only the file's presence distinguishes them for the loader.
- **BEH-3** — **When** `/adev:init` Step 7c runs and the operator selects zero reviewers **then** `governance/review.yaml` is written with an explicit empty `reviewers: []`, **including its `materialized_at` marker** (same reasoning as BEH-2, but unlike `validate.yaml`, `review.yaml` *is* a marked registry — `assertMaterialized` treats an unmarked-but-present file as invalid, `code: REGISTRY_NOT_MATERIALIZED`; omitting the marker on this write would make BEH-4's "zero reviewers, standing warning" path unreachable, routing instead into that pre-existing, unrelated failure mode) — closing today's gap where "chose nothing" and "never ran Step 7c" are indistinguishable (both currently produce no file).
- **BEH-4** — **When** `/adev:review-specs` calls `adev governance reviewers --json` and `reviewers.filter(r => r.enabled !== false).length === 0` (the registry's `reviewers` field includes disabled entries — a project with reviewers declared but all disabled must also trigger this, not just a project with an empty list) **then** the skill prints a standing warning naming the project and stating that no reviewers are configured, before proceeding — the review still completes (verdict PASS, zero findings is not falsified), but the warning is not suppressible by the normal report format.
- **BEH-5** — **When** `/adev:validate` loads `governance/validate.yaml` and the enabled check count is zero **then** the skill prints the equivalent standing warning and proceeds (this is a *new*, softer outcome — today an entirely-absent file hard-crashes with `MISSING_VALIDATE_CONFIG`; a file that exists but selects nothing warns instead of crashing, since BEH-1/BEH-2 make "selected nothing" an explicit, deliberate state rather than an error).
- **BEH-6** — **When** a risk tier overlay (`lib/risk-tiers/merge-review-overlay.mjs` / `merge-validate-overlay.mjs`) is applied at Step 7c.0/7d.0 against a base list **then** the base list is the operator's own Step 7c/7d selection from BEH-1/BEH-3 (post-selection), not the full domain bundle, **and** the overlay function's `warnings` return value (`RISK_TIER_OVERLAY_UNKNOWN_ID`, `RISK_TIER_OVERLAY_INVALID_EXTRA_CHECK`, `RISK_TIER_OVERLAY_DUPLICATE_ID`) is surfaced to the operator at scaffold time — the same summary-line treatment Step 7 already gives its other warnings (Module Impact Map, `setup` row) — rather than computed and discarded. A tier overlay's `enable`/`severity_caps` entries naming an id the operator did not select surface as `RISK_TIER_OVERLAY_UNKNOWN_ID`, which is now a meaningful, operator-visible signal ("your tier expects this reviewer, but you didn't select it") rather than something that could never fire under the old always-full-baseline model, or that fired into a value nothing read.
- **BEH-7** — **When** `/adev:plan` decomposes Task 2 (or an equivalent implementation task covering BEH-1/BEH-2/BEH-3) **then** the resulting plan includes a test exercising the actual cross-skill hand-off — `/adev:init` writes the selection file, then `/adev:review-specs`/`/adev:validate` reads it back and warns on empty — not only each skill's local behavior in isolation; and `tests/risk-tiers/tier-overlay-referential-integrity.test.mjs` is updated to also exercise a *partial* (or empty) operator selection as BEH-6's base list, alongside its existing full-bundle case, with its docstring's "same end-to-end path Step 7c.0/7d.0 exercises" claim corrected to describe both cases rather than only the pre-BEH-6 full-bundle one.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|----------------------|
| 1 | Resolve the open UI-placement question (Coverage Gaps) — this blocks Task 2 | small (decision, not code) |
| 2 | Rework `/adev:init` Step 7d.0 from auto-copy to explicit selection, writing via `spliceRegistryEntries` and preserving the existing idempotency guard; write BEH-1/BEH-2 | medium |
| 3 | Rework `/adev:init` Step 7c to write an explicit empty `reviewers: []` **with its `materialized_at` marker** on a zero-selection outcome; write BEH-3 | small |
| 4 | Add the standing-warning check to `skills/review-specs/SKILL.md` Step 3, using the exact `enabled !== false` computation from BEH-4; write BEH-4 | small |
| 5 | Add the standing-warning check to `skills/validate/SKILL.md`, softening `MISSING_VALIDATE_CONFIG`'s hard-crash for the "file exists, selects nothing" case only (absent file stays a hard error); write BEH-5 | medium |
| 6 | Update `lib/risk-tiers/merge-review-overlay.mjs`/`merge-validate-overlay.mjs` call sites in `skills/init/SKILL.md` Step 7c.0/7d.0 to pass the post-selection list, not the full domain bundle, **and** surface the overlay's `warnings` to the operator at scaffold time; write BEH-6 | small |
| 7 | Correct the stale "bundled defaults ship enabled" claims in `skills/init/SKILL.md` Step 7 intro and `docs/governance.md` | small |
| 8 | Reconcile `.context-index/specs/features/setup/risk-tier-bundles.spec.md`'s own Behaviors (BEH-13/14/15) and its `prototype`/`strict` template YAML comments, which currently describe softening/tightening "the resolved domain's reviewer/check defaults" — that phrase needs updating once the baseline is the operator's selection, not the domain bundle | small |
| 9 | Add the cross-skill hand-off test (init writes → review-specs/validate reads and warns) and update `tests/risk-tiers/tier-overlay-referential-integrity.test.mjs` for a partial/empty-selection case, correcting its stale docstring claim; write BEH-7 | medium |

## Acceptance Criteria

- [x] `governance/validate.yaml` written by `/adev:init` Step 7d reflects an explicit operator selection, never an unconditional full copy, and the write goes through `spliceRegistryEntries` rather than a generic re-serialize.
- [x] A zero-selection outcome at Step 7c or Step 7d writes an explicit empty list, distinguishable from "Step 7c/7d never ran"; the Step 7c write includes the `materialized_at` marker so the zero-reviewers path reaches `/adev:review-specs`'s warning rather than `REGISTRY_NOT_MATERIALIZED`.
- [x] `/adev:review-specs` prints a standing warning (not silence) when `reviewers.filter(r => r.enabled !== false).length === 0` — covering both "declared nothing" and "declared some, all disabled."
- [x] `/adev:validate` prints a standing warning (not a hard crash) when `governance/validate.yaml` exists but selects zero checks; an entirely absent file still hard-crashes with `MISSING_VALIDATE_CONFIG`.
- [x] Risk tier overlays apply against the operator's own selection, not the full domain bundle, and their `warnings` output is surfaced to the operator at scaffold time (not computed and discarded); `.context-index/specs/features/setup/risk-tier-bundles.spec.md` is updated to match.
- [x] `skills/init/SKILL.md` and `docs/governance.md` no longer claim a bundled-defaults fallback that doesn't exist in `lib/governance/{review,validate}-config.mjs`.
- [x] A test exercises the actual init-writes → review-specs/validate-reads-and-warns hand-off, not just each skill's local behavior; `tests/risk-tiers/tier-overlay-referential-integrity.test.mjs` covers a partial-selection overlay case, not only the full-bundle case.
- [x] All quality gates pass.
- [x] No constitutional violations.
