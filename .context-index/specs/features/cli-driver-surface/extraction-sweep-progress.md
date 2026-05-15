# Extraction Sweep Progress

> **Spec:** `.context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md`
> **Plan:** `.context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.plan.md`
> **Seeded:** 2026-05-15 (Task 0)
> **Allowlist test:** `tests/skills-no-inline-node.test.mjs`

Per-skill / per-block tracker for the inline-Node extraction sweep. Each
extraction PR updates the relevant row, shrinks `ALLOWLIST` in
`tests/skills-no-inline-node.test.mjs`, and lands the helper + paired
test + SKILL.md edit + verb registration in one atomic commit (per spec
Behavior 1).

## Canonical inline-Node footprint (initial state)

Seed command (re-run any time to verify):

```bash
grep -rc "Run inline Node\|node --input-type=module -e\|node -e" skills/*/SKILL.md | grep -v ':0$'
```

| Skill            | Inline blocks (initial count) | Status   | PR(s) | Notes |
|------------------|-------------------------------|----------|-------|-------|
| brainstorm       | 2                             | pending  | —     |       |
| build            | 4                             | partially-extracted | PR 3 (reportStep), PR 4 (requireGate) | reportStep + requireGate extracted (Gate Between Sub-Skill Dispatches); 4 `node --input-type=module -e` blocks remain (not in PR 4 scope); stays on allowlist |
| debug            | 4                             | pending  | —     |       |
| eval             | 2                             | pending  | —     |       |
| hygiene          | 1                             | pending  | —     |       |
| implement        | 10                            | partially-extracted | PR 3 (reportStep), PR 4 (requireGate) | reportStep + requireGate extracted (Step 3 plan-step gate, Step 4 completion); 10 forbidden-regex blocks remain (not in PR 4 scope); stays on allowlist |
| plan             | 2                             | partially-extracted | PR 3 (reportStep), PR 4 (requireGate) | reportStep + requireGate extracted (Step 1.5 entry, Step 6 exit); 2 forbidden-regex blocks remain (not in PR 4 scope); stays on allowlist |
| prototype        | 6                             | pending  | —     |       |
| recover          | 3                             | pending  | —     |       |
| review-specs     | 2                             | partially-extracted | PR 3 (reportStep), PR 4 (requireGate) | reportStep + requireGate extracted (Step 0 entry, Step 8 exit); 2 forbidden-regex blocks remain (not in PR 4 scope); stays on allowlist |
| specify          | 2                             | partially-extracted | PR 3 (reportStep) | reportStep extracted (Step 0 entry, Step 6 exit); specify has no Step 0a requireGate gate (it's the first lifecycle step); 2 forbidden-regex blocks remain; stays on allowlist |
| standalone       | 1                             | pending  | —     |       |
| status           | 1                             | pending  | —     |       |
| validate         | 8                             | partially-extracted | PR 1 (Check 13), PR 2 (reportValidator), PR 3 (reportStep), PR 4 (requireGate) | reportStep + requireGate extracted (Step 0a entry, Step 14 exit); 7 forbidden-regex blocks remain; stays on allowlist |
| write-test       | 3                             | pending  | —     |       |
| **TOTAL**        | **51**                        |          |       |       |

Status legend:
- `pending` — skill still contains inline blocks, no extraction PR landed yet.
- `in-flight` — extraction PR open / under review for this skill.
- `partially-extracted` — some blocks lifted, more remain (rare; PR shapes are usually per-skill atomic).
- `extracted` — all inline blocks removed, all `adev <verb>` calls in place, allowlist entry removed.

## Sweep order (per silent-rate ranking)

Per `research/inline-node-extraction-scope.md` silent-rate measurements
and `research/adev-vs-compiler-dispatch-patterns.md` §5 sequencing
guidance. PR numbers are nominal — actual landing order follows the
named-PR sequence, with the long tail parallelizable.

| PR  | Title                                              | Skills affected                                         | Status   |
|-----|----------------------------------------------------|---------------------------------------------------------|----------|
| 0   | Sweep scaffolding (progress index + allowlist test)| —                                                       | merged   |
| 1   | Extract Check 13 — heuristic extraction            | `validate`                                              | merged   |
| 2   | Extract `reportValidator` per-check emission       | `validate`                                              | merged   |
| 3   | Extract `reportStep` lifecycle entry/exit emission | `specify, review-specs, plan, implement, validate, build` | merged   |
| 4   | Extract Step 0a `requireGate` calls                | `review-specs, plan, implement, validate, build`        | merged   |
| 5   | Extract source-manifest verify                     | `validate`, possibly `implement`                        | pending  |
| 6   | Extract domain-aware gate loading                  | `review-specs`, `validate`, `plan`                      | pending  |
| 7+  | Long-tail extractions (per block)                  | All remaining; one PR per block or per canonical-verb group | pending  |

## Canonical-verb registry (cross-PR re-use, per spec Behavior 9)

Tracks which `lib/cli/<verb>.mjs` helpers have been introduced and which
inline blocks they cover. Subsequent PRs MUST re-use existing verbs when
logic matches — naming is canonical and shared.

| Verb                  | Helper module                 | Introduced in | Covers blocks in                  |
|-----------------------|-------------------------------|---------------|-----------------------------------|
| `gate require`        | `lib/cli/gate.mjs`            | driver-substrate | lifecycle Step 0a in `review-specs, plan, implement, validate, build` (PR 4) |
| `diagnose`            | `lib/cli/diagnose.mjs`        | adev-diagnose-cli | (engine, not from this sweep)   |
| `heuristics extract`  | `lib/cli/heuristics.mjs`      | PR 1          | `validate` Check 13               |
| `report --type validator` | `lib/cli/report.mjs`      | PR 2          | `validate` Per-Check Event Emission |
| `report --type step`  | `lib/cli/report.mjs`          | PR 3          | step-started/completed emissions in `specify, review-specs, plan, implement, validate, build` |

## Acceptance (sweep-complete sentinel)

The sweep is complete when **all** of:

1. `grep -rE "Run inline Node|node --input-type=module -e|node -e" skills/**/SKILL.md` returns zero matches.
2. `tests/skills-no-inline-node.test.mjs`'s `ALLOWLIST` is `new Set()` (empty).
3. All paired helper tests pass (`tests/cli/*.test.mjs`).
4. `tests/cli-driver-pattern.test.mjs` passes (driver-substrate invariant maintained).
5. Charter Capability Map row "Inline-Node extraction sweep" set to `implemented`.

Until then, this file is the live progress tracker. Update the row + PR
column for every extraction PR.
