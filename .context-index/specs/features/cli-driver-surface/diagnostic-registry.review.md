---
last-reviewed-revision: 2
file-sha: 3c9af6fce45c3f781a33c87252b2f88399aee37d9ea70e0289f0c3cad9994d95
---

# Architecture Review: diagnostic-registry (rev 2, second re-review)

> **Date:** 2026-05-14
> **Spec:** `.context-index/specs/features/cli-driver-surface/diagnostic-registry.spec.md`
> **Charter:** `.context-index/specs/features/cli-driver-surface/charter.md`
> **Verdict:** PASS
> **Re-review note:** This is the second re-review of rev 2. The first re-review (BLOCK) flagged 3 blockers (SEC-1, CON-1, CON-2) and 8 warnings. All have been resolved in subsequent amendments; the rev 2 amendment block now spans 15 numbered clauses covering every prior finding. Three new minor suggestions surfaced during this re-review (SA-8, SA-9, SA-10); SA-9 and SA-10 were applied, SA-8 was documented in a new amendment clause (14) clarifying the naming convention.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-capable (reasoning tier) | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable (capable tier) | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-capable (fast tier) | `plugin:review-specs/consistency-analyzer-prompt.md` |

---

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES → all findings are suggestions; per the skill's verdict rules this counts as PASS in aggregate.

**Resolution audit (one-liners — all prior findings resolved):**

- SEC-1 (blocker, prior): RESOLVED. Behavior 2 Steps A–D specify `..` rejection + prefix-required + `realpathSync` + per-root containment with cross-root deputy rejection; AC requires 6 test cases; pure `startsWith` explicitly forbidden.
- CON-1 (blocker, prior): RESOLVED. `write-time-diagnostic-hook.spec.md` rev 2 swaps dropped-producer references for `adev/event-schema-valid`.
- CON-2 (blocker, prior): RESOLVED. Charter rev 3; producer count = 3 on In Scope line + Capability Map row; Relationships entry path corrected.
- SA-1 / CON-9 (warning, prior): RESOLVED. `SCHEMA_INVALID` used consistently across Behavior 2, Error Cases, AC, and amendment clause (5).
- SA-2 (warning, prior): RESOLVED. Authority chain explicit — `agent-reliable-state-artifacts/lifecycle-event-log.spec.md` is canonical source, `event-schemas.mjs` is mechanical mirror.
- SA-3 (warning, prior): RESOLVED. `normaliseEventInPlace` permissiveness explicit; closed-discriminator enforcement is mode-dependent.
- SA-4, SA-5, SA-6, SA-7 (suggestions, prior): all RESOLVED (process documented, skill-prose limitation acknowledged, charter row updated, AC text cleaner).
- SEC-2, SEC-3, SEC-4 (warnings, prior): RESOLVED (runner allowlist, redaction contract, hard timeout).
- SEC-7 (suggestion, prior): RESOLVED (first-wins duplicate resolution).
- CON-3, CON-4, CON-5 (warnings, prior): RESOLVED (templates/event-schemas ACs, migration scope tightened, charter path corrected).

**Self-diagnostic ID audit (new requested check):** Seven IDs total; behaviorally distinct (`runner-missing` for file/export absence at import; `runner-invalid` for containment-guard rejection before import attempt; `slow` 200 ms soft; `timeout` 500 ms hard; `duplicate-id`; `registry-missing` for missing config; `spec-not-found` for missing spec argument). No overlap. Severity assignments coherent.

**New findings (3 suggestions):**

- **SA-8** (suggestion, naming): Two of seven self-diagnostic IDs (`adev/registry-missing`, `adev/spec-not-found`) lack the `diagnostic-` infix used by the other five. Engine-input failures vs runner-level findings — defensible but worth documenting. *Author response: documented in new amendment clause (14).*
- **SA-9** (suggestion, internal inconsistency): Behavior 2 Step A names the field as `path` ("If a runner entry's `path` field..."), but the registry schema uses `runner` (Behavior 2 line 62, charter Domain Model). *Author response: applied — Step A now uses `runner`.*
- **SA-10** (suggestion, test-coverage gap): SEC-3 redaction contract added in Behavior 3, but no AC asserts the redaction actually happens. *Author response: applied — new AC tests three redaction scenarios.*

---

## Security Reviewer (security-reviewer)

**Verdict:** PASS

**Verification summary:**

- **SEC-1 RESOLVED.** Steps A–D fully specified: `..`-reject (line 66), `realpathSync` on roots + candidate (line 72), per-root containment with cross-root deputy rejection (line 73). AC at line 170 lists all six test cases. Pure `startsWith` explicitly forbidden. TOCTOU between `realpathSync` and `import()` not addressed — acceptable since the threat model assumes operators run their own engine.
- **SEC-2 RESOLVED.** `plugin:` / `project:` prefixes with hard-coded subdirectory allowlist (`lib/diagnostics/`, `.context-index/diagnostics/`). Bare/absolute paths rejected. Symlink-inside-allowlisted-dir-pointing-out attempts caught by Step C+D realpath chain.
- **SEC-3 RESOLVED.** Redaction contract in Behavior 3 covers all surfaced messages with 4-form rewriting + stack-suppression. Debug stderr path is operator-only.
- **SEC-4 RESOLVED.** `Promise.race` 500 ms hard timeout emits `adev/diagnostic-timeout` (error); abandoned-promise residual acknowledged with trust-model justification; AC requires 3 test cases including engine continuation after timeout.
- **SEC-5, SEC-6** still suggestions, not required. SEC-5 implicitly addressed by amendment clause (8) (mode-dependent enforcement gives operators control).
- **SEC-7 RESOLVED.** First-wins duplicate resolution; combined with SEC-2 allowlist, tampering-amplification chain is broken.

No regressions, no new attack surfaces introduced by the fixes themselves.

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

**Verification summary:**

- **CON-1 RESOLVED.** No `lifecycle-prerequisite-met` references in `write-time-diagnostic-hook.spec.md` outside the rev 2 amendment block.
- **CON-2 + CON-5 RESOLVED.** Charter rev 3; producer count = 3 on lines 27 + 97; Relationships entry corrected to `lib/diagnostics/tier1/`. Sibling specs `adev-diagnose-cli.spec.md` and `inline-node-extraction-sweep.spec.md` have zero references to the dropped producer or 4-producer count.
- **CON-3 RESOLVED.** Two new ACs cover `templates/diagnostics-template.yaml` byte-equivalence and `lib/diagnostics/event-schemas.mjs` exports.
- **CON-4 RESOLVED.** Migration task narrowed to 2 grep-confirmed sites (`lib/meta-tools.mjs`, `lib/reality-check.mjs`) with re-grep-at-implementation guidance.
- **CON-9 RESOLVED.** Single remaining `schema-invalid` occurrence is in the rev 2 amendment block (line 28) describing the fix.

**New cross-spec checks (no findings):**

- `adev-diagnose-cli.spec.md` JSON shape (`fired/skipped/errors`) matches engine return.
- ADR-0009 ↔ spec cross-references bidirectional + accurate.
- `lib/lifecycle-state.mjs:171-172` and `:859` citations verified accurate.
- Self-diagnostic ID naming + severity assignments coherent (info for soft observability, error for hard timeout/invalid/not-found, warning for missing/duplicate/recoverable).

**Minor observation (not a finding):** The engine-emitted self-diagnostic IDs (`adev/diagnostic-runner-invalid`, `adev/diagnostic-timeout`, `adev/diagnostic-duplicate-id`, `adev/diagnostic-slow`, `adev/diagnostic-runner-missing`) appear only in Error Cases + ACs and are NOT entries in `governance/diagnostics.yaml` — correct, since they're engine-emitted, not registered runners.

---

## Summary

**Total findings:** 3 (0 blockers, 0 warnings, 3 suggestions).

**Per-skill verdict logic:** "All reviewers returned zero findings or only suggestion severity" → aggregate **PASS**.

**Action required:** None blocking. SA-9 and SA-10 were applied in-loop during this review; SA-8 was documented in amendment clause (14). The spec is ready for `/adev:plan`.

**Comparison vs prior verdict:** rev 2 initial review was BLOCK (3 blockers + 8 warnings + 12 suggestions); the rev 2 amendments now address all 3 blockers + 8 of 8 warnings + 1 of the 12 prior suggestions (SEC-7 → first-wins). The remaining prior suggestions (SA-5 via implicit fix, SEC-5/SEC-6 still pending) are non-blocking polish.

---

## Lifecycle status

- Spec status: `review-blocked` → `review-passed`
- Charter Capability Map rows: "Diagnostic registry engine", "`governance/diagnostics.yaml` schema + initial scaffold", "Tier-1 producers (v1 set)" — remain at `review-passed` (already at this state on the charter; will advance to `specified` when the producer-extraction lands per the spec's own Postconditions).
- Next gate: `/adev:plan --spec .context-index/specs/features/cli-driver-surface/diagnostic-registry.spec.md`.
