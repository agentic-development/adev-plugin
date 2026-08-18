---
spec: .context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md
charter: (cross-cutting — no parent charter)
date: 2026-08-18
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 1
file-sha: c40c67183fc7b8f9d06e2558c893688d88559819f1b438e168c83981f842f0ec
findings-total: 14
blockers: 5
warnings: 6
suggestions: 3
---

# Architecture Review: graduated-rigor-tiers

> **Date:** 2026-08-18
> **Spec:** `.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md` (revision 1)
> **Charter:** none (cross-cutting spec)
> **Rigor tier:** full (explicit `--tier full`)
> **Verdict:** BLOCK

> **Falsification-experiment note.** This review was run against a scratch worktree checked out
> at `d5d2d554` — the commit immediately BEFORE `df11ba5d` fixed the `/adev:build --tier`
> propagation gap (issue `he2`). The registry (`review.yaml`) and the `referent-integrity`
> prompt were overwritten with their CURRENT versions before dispatch; everything else in this
> worktree (the spec body, `skills/`, `lib/`) is the historical, pre-fix state. See
> `.context-index/research/referent-integrity-falsification/run-log.md` for the resolved
> project root, plugin root, and pack-verification evidence for this run.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |
| referent-integrity | Referent Integrity | subagent | reviewer-reasoning | `prompts/referent-integrity.md` |

No disabled reviewers. Registry loaded via `adev governance reviewers --json` from inside this
worktree: `referent-integrity` present, `errors: []`.

## Structural Architect (structural-architect)

**Verdict:** FAIL (2 blockers, 3 warnings, 1 suggestion)

- **SA-1 (blocker)** `structural-architect:contradictory-artifact-path:c5c99666` — Output Contract names the bundled quick-reviewer prompt as `templates/review-specs/quick-synthesized.md`, but the spec's own source-manifest (and the real repo) show `skills/review-specs/quick-synthesized-reviewer-prompt.md`; `templates/review-specs/` holds only `defaults.yaml`. Also conflicts with ADR-0003's `plugin:<skill>/<file>` URI scheme. Section: `output-contract`.
- **SA-2 (blocker)** `structural-architect:ambiguous-registry-contract:4844b8f8` — The spec asserts the quick reviewer "is a registry entry" but never defines its fields, and leaves undefined whether a project-added `dispatch: always` reviewer (like `referent-integrity`) is suppressed under `quick` or whether `severity_cap`/`dispatch: triggered` still apply. Section: `output-contract`.
- **SA-3 (warning)** — "Identical gate contract" for the quick synthesized reviewer is asserted but the spec never assigns it a slug or requires blocker_id/section_anchor emission per the aggregator's contract.
- **SA-4 (warning)** — Undefined precedence between legacy `require_review: false` and the new `review_mode` field for existing project policy files.
- **SA-5 (warning)** — No described data path for how `routingEasy` travels from `/adev:route`/`/adev:work` to a later `/adev:review-specs`/`/adev:validate` invocation.
- **SA-6 (suggestion)** — Quick validate set defined by ordinal/exclusion rather than canonical check ID.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES (0 blockers, 1 warning, 2 suggestions)

- **SEC-1 (warning)** — `routingEasy` (from route/work heuristics, unrelated to declared `risk_level`) can silently downgrade a `risk_level: high` spec from full to quick, since `resolveRigorMode`'s precedence never cross-checks `routingEasy` against the policy floor. Failure Modes table doesn't cover this conflict case.
- **SEC-2 (suggestion)** — `risk_level` is self-declared with no cross-check against `boundaries.yaml` crossings or sensitive-path heuristics.
- **SEC-3 (suggestion)** — The emitted lifecycle/`.review.md` header should record which precedence branch resolved the tier, for audit purposes.

No findings on authentication, input-validation, secrets, or rate-limiting.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES (0 blockers, 1 warning)

- **CON-1 (warning)** — The spec's header comment claims it "Resolves CON-1 of single-front-door.spec.md" while its own invariant section says "(Addresses single-front-door SEC-1.)" — internally inconsistent about which finding it addresses.

All other consistency checks passed (naming conventions, pattern conformance to ADR-0003/0004, no cross-cutting-spec conflicts, source-manifest files all resolve, config schema aligns with `risk-policies-template.yaml`).

## Referent Integrity (referent-integrity)

**Verdict:** FAIL (3 blockers, 1 warning)

- **RI-1 (blocker)**, `finding-type: stale-file-path`, `section_anchor: output-contract` — Referent: `templates/review-specs/quick-synthesized.md`. Verification: `ls templates/review-specs/` shows only `defaults.yaml`; the real file is `skills/review-specs/quick-synthesized-reviewer-prompt.md` (matches the spec's own source-manifest). Same underlying defect as SA-1, independently found via referent-existence checking rather than architectural/ADR analysis.
- **RI-2 (blocker)**, `finding-type: stale-file-path`, `section_anchor: output-contract` — Referent: `.validation.md`. Verification: `grep -rln "\.validation\.md" skills/ lib/ templates/` returns zero files; the real artifact is `<spec-slug>.validate.md` (`skills/validate/SKILL.md:417,424`). Acceptance criterion 4 is unverifiable as written.
- **RI-3 (blocker)**, `finding-type: missing-cli-flag`, `section_anchor: arguments` — Referent: `--tier` on `/adev:build`. Verification: read the full Arguments list of `skills/build/SKILL.md` — no `--tier` flag exists; `grep -in "tier|quick|rigor" skills/build/SKILL.md` matches only unrelated senses (gate tiers, model tiers). `/adev:build` is named as a rigor-tier propagator in the Arguments table and Invocation Modes item 1, but cannot honor it. **This is the historical defect this falsification-gate run targets (issue `he2`, fixed in `df11ba5d`).**
- **RI-4 (warning)** — "the three `dispatch: always` defaults" is stale: the live registry has four (`structural-architect`, `security-reviewer`, `consistency-analyzer`, `referent-integrity`).
- No `blocker_id` field emitted on any finding, per `referent-integrity`'s own prompt contract (profile runs under `execute: deny`).

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict above, computed
> from post-cap findings across all reviewers (`adev report --type step --status completed
> --verdict BLOCK --from-summary`, run for real inside this worktree): PASS (zero
> warnings/blockers), PASS_WITH_NOTES (>=1 warning, zero blockers), BLOCK (>=1 blocker, default
> `blocker_threshold`). 5 blockers, 6 warnings, 3 suggestions across the four reviewers.
