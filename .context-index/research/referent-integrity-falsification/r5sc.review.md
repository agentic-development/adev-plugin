---
spec: .context-index/specs/features/review/configurable-reviewers.spec.md
charter: review
date: 2026-08-18
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 3
file-sha: baaa7bfc7e00fdf09765d790c1a905c44b4bd883fab20291426a0f408605cfb4
findings-total: 15
blockers: 6
warnings: 7
suggestions: 2
---

# Architecture Review: configurable-reviewers

> **Date:** 2026-08-18
> **Spec:** `.context-index/specs/features/review/configurable-reviewers.spec.md` (revision 3)
> **Charter:** `.context-index/specs/features/review/charter.md`
> **Rigor tier:** full (explicit `--tier full`)
> **Verdict:** BLOCK

> **Falsification-experiment note.** Run against a scratch worktree checked out at `104a06e6` —
> the commit immediately BEFORE `0476a7bc`/`8d8d5c5a` fixed the `BLOCK`-verdict contradiction
> (issue `r5sc`). `review.yaml` and the `referent-integrity` prompt were overwritten with their
> CURRENT versions before dispatch. This spec's lifecycle log has no verdict-stamped `specify`
> `step_completed` event (a pre-existing gap confirmed to reproduce identically on the CURRENT
> main tree, unrelated to this experiment) — the strict-mode Step-0 self-gate was bypassed via
> `lifecycle.gate_mode: advisory`, set only in this scratch worktree's `manifest.yaml` (discarded
> on teardown). See `run-log.md` for full detail and citation of the current-tree reproduction.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |
| referent-integrity | Referent Integrity | subagent | reviewer-reasoning | `prompts/referent-integrity.md` |

Registry loaded via `adev governance reviewers --json` from inside this worktree: `referent-integrity` present, `errors: []`.

## Structural Architect (structural-architect)

**Verdict:** FAIL (1 blocker, 4 warnings, 1 suggestion)

- **SA-1 (blocker)** `structural-architect:unresolvable-path-scheme:2eace1a7` — Precondition 2/Behavior 1 locate bundled defaults at `plugin:review-specs/defaults.yaml`, but Behavior 16's own `plugin:<skill-name>/<file>` → `<plugin-root>/skills/<skill-name>/<file>` rule cannot resolve it (the real file is `templates/review-specs/defaults.yaml`). Self-contradiction between two sections of the same spec.
- **SA-2 (warning)** — `depends-on` cites `execution-profiles.md`; real file is `execution-profiles.spec.md` (orphaned-reference drift).
- **SA-3 (warning)** — `governance/review.yaml`'s anchor root is never stated in Preconditions, unlike prompt paths.
- **SA-4 (warning)** — Behavior 11a's literal-tool carve-out names an empty set (no bundled read-only-derived profile uses a literal tool).
- **SA-5 (warning)** — `lib/governance/dispatch-shape.mjs` is in the source-manifest but no behavior/task-map row describes its ownership of dispatch shape / report rendering.
- **SA-6 (suggestion)** — `drift_detected: true` flag unresolved in frontmatter.

## Security Reviewer (security-reviewer)

**Verdict:** FAIL (1 blocker, 1 warning, 1 suggestion)

- **SEC-1 (blocker)** `security-reviewer:data-exposure:30344976` — Behavior 33's redaction/truncation pipeline only applies on the package-mode adapter's parse-FAILURE path; on the success path, `renderReviewReport` writes finding messages straight to `.review.md` with no redaction, contradicting the depended-on `execution-profiles.spec.md` Behavior 36's "all audited channels" invariant.
- **SEC-2 (warning)** — Path-normalization fallback doesn't cover `consumerRepoRoot`/`workspaceRoot` in multi-repo workspaces.
- **SEC-3 (suggestion)** — Behavior 24's `SKILL.md:86` line citation is stale (real logic at line 168).

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS (0 findings)

Full consistency confirmed across naming, pattern conformance, contract compatibility with `execution-profiles.spec.md`, domain-model alignment, and terminology. No findings.

## Referent Integrity (referent-integrity)

**Verdict:** FAIL (4 blockers, 2 warnings)

- **RI-1 (blocker)**, `finding-type: unsupported-enum-value`, `section_anchor: verdict-consolidation` — Referent: `BLOCK` as a consolidated verdict value passed to `adev report`. Verification: `lib/cli/report.mjs:64` — `VALID_VERDICTS = new Set(["PASS", "PASS_WITH_NOTES", "FAIL"])`, enforced at `:171-174`/`:234-237`/`:396-399` with `process.exit(1)`. The spec's own `computeVerdict` (`review-config.mjs:275-286`) DOES return `"BLOCK"`, but the CLI verb that records it rejects that value. **This is the historical defect this falsification-gate run targets (issue `r5sc`, fixed in `0476a7bc`).**
- **RI-2 (blocker)**, `finding-type: verdict-scope-mismatch`, `section_anchor: verdict-consolidation` — Referent: per-reviewer `**Verdict:** ... | BLOCK` template. Verification: `skills/review-specs/SKILL.md:244` tells an individual reviewer to emit `BLOCK`, a verdict the spec assigns only to the aggregate (Behavior 37); the per-reviewer set the spec actually defines is `PASS | PASS_WITH_NOTES | UNKNOWN`. **This is the other half of the r5sc defect (fixed in `8d8d5c5a`).**
- **RI-3 (blocker)**, `finding-type: stale-file-path`, `section_anchor: preconditions` — Referent: `plugin:review-specs/defaults.yaml`. Verification: `skills/review-specs/` contains no `defaults.yaml`; real load site is `lib/governance/review-config.mjs:54` (`templates/review-specs/defaults.yaml`). Same underlying defect as SA-1, independently found.
- **RI-4 (blocker)**, `finding-type: stale-file-path`, `section_anchor: frontmatter` — Referent: `.context-index/specs/cross-cutting/execution-profiles.md`. Verification: no such file; real path is `execution-profiles.spec.md`. Same underlying defect as SA-2, independently found.
- **RI-5 (warning)** — `SKILL.md:86` line citation stale (same as SEC-3).
- **RI-6 (warning)** — Behavior 11a's quoted error string is missing the `(offenders)` interpolation present in the real message.
- No `blocker_id` field emitted on any finding, per `referent-integrity`'s own prompt contract.

> Consolidated verdict computed via `adev report --type step --status completed --verdict BLOCK
> --from-summary`, run for real inside this worktree, from the four `reviewer_report` events
> above: 6 blockers, 7 warnings, 2 suggestions total.
