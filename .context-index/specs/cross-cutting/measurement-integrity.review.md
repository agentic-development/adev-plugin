---
spec: .context-index/specs/cross-cutting/measurement-integrity.spec.md
date: 2026-08-12
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 1
file-sha: 827af1c1e68b92edbdcdf0894a2af17633c2601d144e6549269eae85dec11daf
---

# Architecture Review: measurement-integrity

> **Date:** 2026-08-12
> **Spec:** `.context-index/specs/cross-cutting/measurement-integrity.spec.md`
> **Charter:** cross-cutting (no parent charter)
> **Rigor tier:** full (risk_level: medium → review_mode: full)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** BLOCK

**SA-1** · `blocker` · Behaviors §2, Error Cases row 3, Task Map "Report rotation"
`blocker_id: structural-architect:adr-conflict:7c3f19ab` · `section_anchor: behaviors-2`
Rotated filenames `<spec-stem>.review.<rev>.md` conflict with **ADR-0012** (Accepted), §"Permitted peers": the peer set is closed by ADR and skills MUST NOT write arbitrary `<stem>.<x>.md` files outside the enumeration. The rotated shape also breaks the three-segment naming convention and invalidates the declared "rewritten on each run" lifecycle. No ADR citation, amendment task, or ADR row in the Module Impact Map.
**Recommendation:** Cite ADR-0012 and add an ADR-amendment obligation (enumerating rotated peers, naming shape, revised lifecycle) as a precondition of the rotation work.

**SA-2** · `warning` · Module Impact Map; Integration Points 1–3
Impact map omits the actual owners: `lib/cli/artifact.mjs:41-42` (the real writer of both reports, closed `type → suffix` map, `.tmp`+rename), `lib/reality-check.mjs:323-348` (derives report paths by regex; drives verdict from `.validate.md` existence — directly affected by Behavior 5), `lib/specify-revise.mjs:20` (documents that `.review.md` is rewritten, an assumption rotation invalidates), `.context-index/governance/diagnostics.yaml:39-40` + `lib/lifecycle-state.mjs:409`. Assigning rotation to skill prose would violate the constitution's control-flow-in-CLI anti-pattern.

**SA-3** · `warning` · Integration Points §2
Rotate-then-write leaves the canonical path absent during the write window, so a crash yields a gate observing no report — contradicting "downstream gates are unaffected."

**SA-4** · `warning` · Behaviors §2
`<rev>` is undefined against two existing revision vocabularies (spec frontmatter `revision:`, and the event-log `revision` field). If it equals the spec revision, two attempts at one revision collide and `ROTATION_COLLISION` becomes the normal path.

**SA-5** · `warning` · Behaviors §3, Postconditions
Postcondition claims "no free-text check IDs" but Behavior 3 constrains only `--validator`; `--reviewer` and `--step` remain unvalidated (`lib/cli/report.mjs:224,153,219,380`). Also "single source of truth" contradicts Integration Point 1's two contributing sources.

**SA-6** · `warning` · Behaviors §6, Error Cases row 5
"Never silently `[]`" forbids the correct outcome for a commit touching only `lib/` with no trailer. The `derivation: partial` marker appears only in Error Cases, and no module owns the session-file schema.

**SA-7** · `warning` · Behaviors §5
`VALIDATED_WITHOUT_REPORT` is artifact-verifiability, which ADR-0010 §"Decision flow" step 5 routes to `diagnostics.yaml` as Tier-2, not a hygiene pass. Implicit supersession; record the rationale.

**SA-8** · `suggestion` · Task Map
Six of seven tasks are ADR-independent; only rotation is gated on the SA-1 amendment. Split rotation out so the rest can proceed.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

**SEC-1** · `blocker` · input-validation
`blocker_id: security-reviewer:command-injection:7c3a91d4` · `section_anchor: behaviors-6`
Behavior 6 promotes the `Spec:` trailer to load-bearing machine input with no escaping contract, while the existing hook interpolates it **raw** into an inline Node script. **Verified in committed code:** `git show HEAD:.githooks/post-commit` line 17 captures `SPECS_TOUCHED` from `%(trailers:key=Spec,valueonly)`, and line 60 embeds it as `specsTouched: '${SPECS_TOUCHED}'.split(',')` inside `node --input-type=module -e "…"` (line 51). `COMMIT_SUBJECT`/`COMMIT_BODY` are JSON-escaped through a round-trip; `SPECS_TOUCHED` is not. A crafted `Spec:` trailer executes attacker-controlled code on the committer's machine when merging/pulling a fetched branch. The value is also emitted into YAML frontmatter as an unquoted flow sequence, so `]`, `,`, or a newline corrupts frontmatter that hygiene/status parse.
**Recommendation:** State that trailer and path values cross a trust boundary and must never be shell- or source-interpolated — pass raw git output on stdin or via `process.env`, never `"${VAR}"` inside `node -e`. Emit `specs-touched` as double-quoted YAML scalars with escaping. Add an acceptance criterion: a fixture commit whose trailer contains `'`, `"`, `]`, and a newline produces a well-formed session file and executes nothing.

**SEC-2** · `warning` · input-validation
Nothing constrains trailer values to project-root-relative `.context-index/specs/**/*.spec.md` paths. `Spec: ../../../../etc/passwd` lands in `specs-touched` and is resolved by downstream consumers. Repo precedent rejects this shape (`lib/lifecycle-state.mjs:1035-1039`; `assertWithin` in `lib/partial-artifact.mjs:195`). Normalize, reject `..`/absolute, cap entry count.

**SEC-3** · `warning` · rate-limiting
Rotation has no retention bound; with the auto-retry loop each blocked spec accumulates reports indefinitely. `ROTATION_COLLISION` "pick next free rev" is an unbounded probe. Rotation target derives from a CLI argument with no containment requirement. Specify retention cap, bound the probe, require `assertWithin`.

**SEC-4** · `suggestion` · data-exposure
Retention goes from one report to N; secrets in an early attempt now persist instead of being overwritten. Require report bodies through the SEC-3 redaction set as `lib/blockers-writer.mjs` does.

**SEC-5** · `suggestion` · data-exposure
Echoing the rejected `--validator` ID allows terminal-escape injection into logs; strip control/ANSI and truncate. Define the `frontmatter-missing` payload as `{ path, reason_code }` with no raw frontmatter text.

**Positive note:** Behavior 7's fail-closed `UNKNOWN_GATE_STEP` converts two silently-passing gates into explicit denials — a genuine security improvement. Behavior 1's exclusion list correctly covers fixture suites; `createTempDir()` uses `os.tmpdir()` so recursive discovery cannot pick up generated fixtures.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK

**CON-1** · `blocker` · domain-model
`blocker_id: consistency-analyzer:diagnostic-rename:59671228` · `section_anchor: behaviors-4`
**The premise of Behavior 4 is factually wrong.** `lib/diagnostics/tier1/frontmatter-present.mjs` already returns `{ fired: false }` on well-formed frontmatter — it fires only on missing/malformed frontmatter at severity `error`. The 52% event volume cited from `harness-simplification-study.md:74` is therefore **genuine failures, not zero-information noise**: `tasks.json` #3448 records 130 of 201 `.spec.md` files violating the first-non-blank-line `---` rule, with a reconciliation spec designated as the fix and "changing the diagnostic itself" explicitly out of scope. The rename is additionally a registry-key break across `diagnostics.yaml`, `lib/lifecycle-state.mjs:409`, `lib/diagnostics/tier1/status-enum-legal.mjs:30,55,58`, and `diagnostic-registry.spec.md` Behavior 9 + ACs, with no paired amendment (mandatory per `incremental-artifact-writes.spec.md`).
**Recommendation:** Drop Behavior 4 and its AC, or rewrite it as the real defect (frontmatter placement in 130 files) and delegate the diagnostic to the reconciliation spec. Note this spec's own frontmatter sits after its H1, so it fires the diagnostic it redefines.

**CON-2** · `blocker` · contract
`blocker_id: consistency-analyzer:check-id-enum:c1329112` · `section_anchor: behaviors-3`
`.context-index/governance/validate.yaml` uses namespace-qualified IDs (`validate.check-2-spec-compliance`); `lib/cli/report.mjs:459` documents `--validator` with the **unqualified** example `check-2-spec-compliance`. The spec never pins which form is canonical, so enum enforcement would reject every invocation in the CLI's own help text.
**Recommendation:** Pin the canonical form (recommend qualified, loader normalizes legacy), state whether historically-emitted removed IDs (`check-3`, `check-7`, `check-10`, `check-12-*`) are admitted so event replay doesn't hard-fail, and reconcile `UNKNOWN_CHECK_ID` against the three existing codes in this domain (`INVALID_CHECK_ID`, `RESURRECTED_CHECK_ID`, `REMOVED_CHECK_ID` — `lib/governance/validate-config.mjs:58-165`).

**CON-3** · `warning` · naming
`rev` is an occupied token meaning the spec's frontmatter `revision:` (`spec-amendment-artifacts.spec.md` Behavior 1; `review-block-auto-retry.spec.md` Behaviors 1–2). Rename to `<spec-stem>.review.<attempt>.md` and state the relationship explicitly.

**CON-4** · `warning` · contract
`.blockers.md` is excluded from rotation, but `review-block-auto-retry.spec.md` treats `.review.md`/`.blockers.md` as an inseparable pair and `--revise` clears `.blockers.md` every attempt. The postcondition therefore fails for exactly the loop that needs per-attempt history.

**CON-5** · `warning` · pattern
No discovery helper exists for rotated reports; `lib/reality-check.mjs:323-348` is canonical-only. `spec-file-suffixes.spec.md` mandates positive globs that correctly do not match rotated names, and `incremental-artifact-writes.spec.md` establishes scanner-invisibility as a load-bearing invariant requiring a regression test.

**Explicitly checked and clean:** no glob collision from rotation (all consumers anchor on full suffixes; no bare `/\.review\./` match exists in `lib/` or `skills/`); Behavior 7's `SKILL_STEP_MAP` removal has no call sites in `skills/` or `providers/`, though `UNKNOWN_GATE_STEP` only has meaning for the mapped-but-absent-from-`STEP_ORDER` case and must not disturb `specify` (index 0) or `route` (`OPTIONAL_GATE_STEPS`).

---

## Summary

**Total findings:** 18 (4 blockers, 11 warnings, 3 suggestions)

| Reviewer | Verdict | Blockers | Warnings | Suggestions |
|---|---|---|---|---|
| structural-architect | BLOCK | 1 | 6 | 1 |
| security-reviewer | BLOCK | 1 | 2 | 2 |
| consistency-analyzer | BLOCK | 2 | 3 | 0 |

**Action required:** Revise the spec via `/adev:specify --revise` addressing the four blockers, then re-review.

Two findings extend beyond this spec and warrant separate tracking:

1. **SEC-1 is a live vulnerability in committed code**, not merely a spec gap — `.githooks/post-commit` at HEAD interpolates commit-message-derived text into `node -e`. This should be filed and fixed independently of this spec's lifecycle.
2. **CON-1 invalidates a premise of the source study.** `.context-index/research/harness-simplification-study.md` lists `adev/frontmatter-present` as pure overhead; it is in fact an error-severity diagnostic reporting 130 real violations tracked by issue #3448. The study needs correcting, and Behavior 4 should be dropped or re-scoped.
