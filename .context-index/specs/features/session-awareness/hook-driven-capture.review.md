---
spec: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md
last-reviewed-revision: 3
file-sha: 7fa85c871e2ec3bd6275122bc40872064d07fd13ef3d07f69233625a402adbf9
verdict: PASS
date: 2026-05-20
previous-verdict: PASS_WITH_NOTES
previous-revision: 2
---

# Architecture Review: hook-driven-capture (rev 3)

> **Spec:** `.context-index/specs/features/session-awareness/hook-driven-capture.spec.md` (rev 3)
> **Charter:** `.context-index/specs/features/session-awareness/charter.md` (rev 6, approved)
> **Verdict:** **PASS** — spec is ready to proceed to `/adev:plan`. Both rev-2 warnings (SEC-9, SEC-10) have been resolved cleanly; only low-severity suggestions remain, all of which are acceptable as plan tasks.
> **Previous review:** rev 2 verdict was PASS_WITH_NOTES (0 blockers, 2 warnings, 6 suggestions). The 2 warnings are addressed in rev 3; 3 of the 6 suggestions are also addressed (SA-10 / CON-9 duplicated pair resolved by dropping the `platform-context.yaml` override clause).

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reasoning (claude-opus-4-7) | plugin:review-specs/prompts/structural.md |
| security-reviewer | Security Reviewer | subagent | capable (claude-sonnet-4-6) | plugin:review-specs/prompts/security.md |
| consistency-analyzer | Consistency Analyzer | subagent | fast (claude-haiku-4-5) | plugin:review-specs/prompts/consistency.md |

## Prior-finding resolution (rev 2 → rev 3)

| Finding | Severity (rev 2) | Status in rev 3 |
|---|---|---|
| SEC-9 (redaction list — PEM, Slack, Google, Stripe with underscore distinction) | warning | **addressed** — Invariant section lists PEM private-key blocks (multiline, processed first), Stripe `sk_(live\|test)_[0-9A-Za-z]{24,}` (underscore — explicit "do not collapse" note), Slack `xox[abprs]-`, Google `AIza[0-9A-Za-z_-]{35}`. AC item updated; pattern order asserted by tests. |
| SEC-10 (realpath-vs-realpath containment for transcript root + cwd manifest walk) | warning | **addressed** — Invariant at line 73 requires "both operands of the prefix comparison must be the `realpath`-resolved forms — never compare resolved-vs-raw." Invariant at line 72 requires the manifest walk to "start from the **resolved** path... must NOT start from the raw input." Two new AC items pin the behavior. |
| SA-9 (payload-schema fixture pin for upstream version-skew detection) | suggestion | carries forward — no schema-fixture row added to Preconditions or Module Impact Map. Acceptable as plan task. |
| SA-10 (platform-context.yaml override clause has no contract) | suggestion | **addressed** — clause dropped; the rev 3 explanatory comment confirms incidentally resolving the duplicated CON-9. |
| SEC-11 (sentinel-mismatch error case) | suggestion | carries forward — no Error Cases row added for unmatched sentinel pair. Acceptable as plan task. |
| CON-8 (conflict-warning surface anchoring) | suggestion | carries forward — Behavior 3 still uses "surfaces" without anchoring the channel (prompt body vs. stderr). Acceptable as plan task. |
| CON-9 (duplicate of SA-10) | suggestion | **addressed** by SA-10 resolution. |
| CON-10 (stderr reason-code grammar — optional subject token) | suggestion | carries forward — invariant grammar at line 91 still says `<reason-code> <project-relative-path?>`, but Error Cases uses sub-tokens (`validation-error session-id`, `payload-error session-id-missing`, etc.). Acceptable as plan task. |

## Structural Architect (structural-architect)

**Verdict:** PASS
**Summary:** SA-10 cleanly resolved by removing the unanchored override clause. SA-9 still carries forward as a suggestion (no schema-fixture pin), but the reactive parse-error placeholder behavior is in place and the suggestion was already classified as defer-to-plan in rev 2. No net-new structural findings. Module Impact Map and Actionable Task Map remain coherent; 16 behaviors decompose cleanly to AC items.

- **SA-9** (suggestion, carried forward from rev 2; Preconditions / Module Impact Map — External Contracts gap) — Still no proactive payload-schema fixture pin. Reactive parse-error placeholder handles the runtime path, but a breaking upstream rename (`session_id` → `sessionId`) would silently degrade every capture to placeholder without a distinct signal.
  - *Suggestion:* Plan task — add `tests/fixtures/claude-code-payloads/<version>.json`, a versioned schema assertion in the validator chain, and a distinct stderr reason code (e.g., `payload-error schema-skew`) when fields are present but shaped differently. Defer-to-plan is acceptable.

## Security Reviewer (security-reviewer)

**Verdict:** PASS
**Summary:** Both rev-2 warnings (SEC-9 redaction list, SEC-10 realpath containment) are resolved with testable contracts. The PEM-block matcher is correctly positioned first in the pattern order (multiline match may contain `KEY=VALUE`-like tail; matching first avoids partial substring redaction). Stripe `sk_` vs LLM `sk-` distinction is explicit and documented as "do not collapse." The PEM regex uses backreference `\1?` to allow algorithm-marker mismatch between BEGIN/END — deliberate widening for defense-in-depth against malformed-but-recognizable blocks; correct posture for redaction. Realpath-vs-realpath comparison is now explicit for both operands; cwd manifest walk starts from the resolved path; AC items 219-220 pin the test surface for resolved-vs-raw rejection. No net-new security findings.

- **SEC-11** (suggestion, carried forward from rev 2; Invariants — Paired-marker idempotency / Behavior 13) — Spec still does not specify behavior for malformed/unmatched sentinel pair. Installer could either greedily extend to EOF or silently no-op. Risk is install-time misbehavior, not exploitability.
  - *Suggestion:* Plan task — add Error Cases row: "Sentinel-bounded block has opening marker without matching closing marker (or vice versa) → installer exits 0 with stderr `[adev:session-capture] validation-error sentinel-mismatch <project-relative-file>`, no modification. User must repair manually." Defer-to-plan is acceptable.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS
**Summary:** CON-9 resolved cleanly by SA-10's resolution (single edit removed both flags). Pattern-order assertion in the redaction invariant ("Pattern order is significant: PEM block first…") is consistent with the AC item ("PEM block matcher runs first; pattern order is asserted by tests"). Stripe-vs-LLM separator distinction is consistent across invariant, AC, and explanatory comment. Realpath-vs-realpath language is consistent across invariant lines 72-73 and AC lines 219-220. CON-8 and CON-10 carry forward as low-severity grammar/anchor refinements; neither blocks planning.

- **CON-8** (suggestion, carried forward from rev 2; Behavior 3 / Error Cases / AC — SA-4 conflict-warning surface) — Behavior 3 still describes the manifest-vs-detection conflict warning without naming the surface ("surfaces a one-line informational warning" — channel unspecified).
  - *Suggestion:* Plan task — anchor the warning channel explicitly (e.g., "rendered in the prompt body above the default-accept question") so `/adev:plan` and `/adev:write-test` can deterministically locate the surface to assert against. Defer-to-plan is acceptable.

- **CON-10** (suggestion, carried forward from rev 2; Error Cases — `validation-error` reason-code subcategories) — The *Stderr diagnostic format* invariant enumerates six reason codes with grammar `<reason-code> <project-relative-path?>`, but Error Cases consistently uses sub-tokens (`validation-error session-id`, `validation-error cwd`, `path-error transcript`, `payload-error session-id-missing`, `payload-error transcript-path-missing`).
  - *Suggestion:* Plan task — document the optional subject token in the invariant grammar (e.g., `<reason-code>[ <subject>] <project-relative-path?>`) and enumerate legal subjects (`session-id`, `cwd`, `transcript`, `sessions-dir`, `session-id-missing`, `transcript-path-missing`). Defer-to-plan is acceptable.

---

## Summary

**Total findings:** 4 suggestions (0 blockers, 0 warnings, 4 suggestions). The 2 rev-2 warnings are resolved; 3 of 6 rev-2 suggestions are also resolved. The 4 carried-forward suggestions (SA-9, SEC-11, CON-8, CON-10) were already classified as defer-to-plan in the rev 2 review.

**Verdict:** PASS. Spec is ready for `/adev:plan`.

### Recommended actions

None blocking. The 4 carried-forward suggestions are appropriate as plan tasks; none require a spec revision.

### Defer-to-plan (acceptable as plan tasks)

- **SA-9** — Payload-schema fixture for upstream version-skew detection (`tests/fixtures/claude-code-payloads/`, validator schema assertion, distinct `payload-error schema-skew` reason code).
- **SEC-11** — Sentinel-mismatch error case (one row in Error Cases; `validation-error sentinel-mismatch` reason code).
- **CON-8** — Anchor the conflict-warning channel in Behavior 3.
- **CON-10** — Stderr reason-code grammar refinement to document the optional subject token.

The spec's behavioral contract is complete and decomposable. `/adev:plan --spec hook-driven-capture.spec.md` will produce a clean task graph.
