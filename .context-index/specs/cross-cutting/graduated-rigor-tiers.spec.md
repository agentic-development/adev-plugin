---
kind: skill
status: review-pending
mode: cross-cutting
risk_level: medium
affects: [review-specs, validate, route, work, init]
source-manifest:
  files:
    - lib/governance/rigor-mode.mjs
    - skills/review-specs/SKILL.md
    - skills/review-specs/quick-synthesized-reviewer-prompt.md
    - skills/validate/SKILL.md
    - skills/route/SKILL.md
    - skills/work/SKILL.md
    - templates/risk-policies-template.yaml
  computed-at: "2026-07-01T00:00:00.000Z"
revision: 1
created: 2026-07-01
updated: 2026-07-01
tracker-ref: "PR #199 / single-front-door CON-1"
---

# Skill Spec: Graduated Rigor Tiers

<!-- Cross-cutting skill spec. Introduces a `rigor mode` (full | quick) for the two gate
     skills — /adev:review-specs and /adev:validate — so low-risk / routing-"easy" work
     runs a fast synthesized gate instead of the full specialist suite, WITHOUT skipping
     the gate (which would stall the strict lifecycle gate chain). Resolves CON-1 of
     single-front-door.spec.md. Design: .context-index/research/adev-simplification-synthesis.md
     (Express Lane) and single-front-door.review.md. -->

## Invocation Modes

A **rigor mode** governs how thoroughly the two gate skills run. It is resolved, not hard-coded, from three sources (highest precedence first):

1. **Explicit `--tier <full|quick>` argument** on `/adev:review-specs` or `/adev:validate` (or propagated by `/adev:build` / `/adev:work`).
2. **Routing signal** — `/adev:route` (or `/adev:work` triage) marks a work item "easy" (low blast-radius, high pattern-coverage) and propagates `--tier quick`.
3. **Declarative risk policy** — the spec's `risk_level` frontmatter mapped through `.context-index/governance/risk-policies.yaml` (`review_mode`, `validate_mode`).

Default when no signal resolves: `full`. `quick` never means "skip" — the gate always runs and always emits its lifecycle event.

### review-specs under `quick`

Dispatch a single **synthesized reviewer** (structural + security + consistency in one pass, `reviewer-capable` profile) instead of the three parallel specialists. Consolidated verdict, `.review.md`, and the `review` lifecycle event are produced exactly as in `full` mode.

### validate under `quick`

Run the fail-fast quality gates (Check 1: tests / lint / typecheck) plus a **single synthesized compliance check** (spec compliance + constitution, one pass), skipping the advisory/design checks that `full` runs. The `.validation.md` report and the `validate` lifecycle event are produced as in `full` mode; a `PASS`/`FAIL` verdict still gates downstream.

## Arguments

| Argument | Required | Description |
|---|---|---|
| `--tier <full\|quick>` | No | Explicit rigor mode for `/adev:review-specs` and `/adev:validate`. Overrides routing signal and risk policy. Invalid value → `INVALID_TIER`, re-prompt/fail. |
| *(propagated)* | No | `/adev:build`, `/adev:work`, `/adev:route` may pass `--tier quick` for routing-"easy" work. |

## Output Contract

**Config (`risk-policies.yaml`)**
- Each policy level (`high`/`medium`/`low`) MAY carry `review_mode: full|quick` and `validate_mode: full|quick`. Absent → `full`. The legacy `require_review: false` on `low` is replaced by `review_mode: quick` (review still runs, cheaply) to avoid the strict-gate stall.
- `/adev:init` scaffolds the new fields with defaults: high/medium → `full`, low → `quick`.

**Resolution helper (lib)**
- A pure helper resolves the effective mode for a skill: `resolveRigorMode({ skill, riskLevel, policies, tierOverride, routingEasy })` → `"full" | "quick"`. Precedence: `tierOverride` > `routingEasy` > policy(`riskLevel`) > `"full"`. No I/O; unit-tested.

**review-specs**
- When resolved mode is `quick`: dispatch exactly one `quick-synthesized-reviewer` (bundled prompt `templates/review-specs/quick-synthesized.md`) rather than the three `dispatch: always` defaults.
- When `full`: unchanged (three specialists).
- Both modes emit the `review` step event with a consolidated verdict and write `.review.md`. The gate contract is identical.

**validate**
- When resolved mode is `quick`: run Check 1 (quality gates, fail-fast) + one synthesized spec/constitution compliance check; skip the remaining full-suite checks.
- When `full`: unchanged (full check set).
- Both modes emit the `validate` step event with `PASS`/`FAIL` and write `.validation.md`.

**route / work**
- `/adev:route` and `/adev:work` classify low-blast-radius / pattern-following work as "easy" and propagate `--tier quick` to the gate skills; high blast-radius or novel work stays `full`.

**Invariant — quick never weakens hard gates.** `quick` reduces reviewer/check breadth only. It MUST NOT bypass: the strict `lifecycle.gate_mode` chain (review still runs), the non-main-branch stop in `/adev:implement`, quality-gate fail-fast in `/adev:validate`, destructive-action gates, or constitution checks. (Addresses single-front-door SEC-1.)

## Module Impact Map

| Skill / file | Impact | Change |
|---|---|---|
| `governance/risk-policies.yaml` (+ init template) | High | Add `review_mode` / `validate_mode` fields; `low → quick`. |
| `lib/governance/*` | Medium | `resolveRigorMode` helper + tests. |
| `review-specs` | High | `--tier` + mode resolution; quick → single synthesized reviewer; new bundled prompt. |
| `validate` | High | `--tier` + mode resolution; quick → fail-fast + synthesized compliance check. |
| `route`, `work` | Low | Classify "easy" work and propagate `--tier quick`. |
| `single-front-door.spec.md` | Low | Express-lane wording: "quick review tier", not "skip" (resolves CON-1). |
| `providers/{codex,opencode}` mirrors | Mechanical | Regenerate. |

## Failure Modes

| Condition | Behavior | User Recovery |
|---|---|---|
| `--tier` value not in {full, quick} | `INVALID_TIER`; fail/re-prompt. | Re-invoke with a valid tier. |
| `risk-policies.yaml` missing/legacy (no `*_mode`) | Fall back to `full` (safe default). | None needed; optionally add fields. |
| `quick` selected but synthesized reviewer/prompt missing | Fail loud with the missing path (do not silently fall back to a weaker run). | Restore the bundled prompt. |
| Quick validate quality gates fail (Check 1) | Fail-fast, same as full. | Fix tests/lint/types. |
| Conflicting signals (`--tier full` on a `low`/easy item) | Explicit `--tier` wins (precedence). | None; expected. |

## System Constitution Reference

- **Principle 1 (Minimize dependencies)** — Applies: resolution helper uses Node built-ins; config is YAML parsed by existing loaders.
- **Principle 2 (Skills are primarily markdown)** — Applies: mode resolution is expressed as SKILL.md branching that names a lib helper / CLI verb; no inline Node in SKILL.md.
- **ADR 0003 (Configurable Review Registry)** — Applies: the quick reviewer is a registry entry; `review.yaml` can override it. This spec extends, not replaces, the registry.
- **ADR 0004 (Execution Profiles)** — Applies: the synthesized reviewer uses the existing `reviewer-capable` profile.
- **Architecture Boundary (Autonomous: editing skill markdown, updating templates)** — Applies: no new skill and no lifecycle-order change; the gate chain is unchanged (quick still runs the gate).

## Acceptance Criteria

- [ ] `resolveRigorMode` returns the correct mode for every precedence combination (tier > routing > policy > full); unit-tested.
- [ ] `risk-policies.yaml` schema + `/adev:init` template carry `review_mode` / `validate_mode`; `low` defaults to `quick`.
- [ ] `/adev:review-specs --tier quick` dispatches exactly one synthesized reviewer and still emits the `review` event + `.review.md`.
- [ ] `/adev:validate --tier quick` runs quality gates + one synthesized compliance check, still emits the `validate` event + `.validation.md`.
- [ ] `/adev:route` / `/adev:work` propagate `--tier quick` for easy/low-risk work.
- [ ] `quick` never bypasses a hard gate (strict review gate, non-main-branch stop, quality-gate fail-fast, constitution).
- [ ] `single-front-door.spec.md` express-lane wording updated to reference the quick tier (CON-1 resolved).
- [ ] Provider mirrors in sync; no inline Node; all edited skills retain their Load Skill Extensions block.
- [ ] `npm test` passes with new coverage.
