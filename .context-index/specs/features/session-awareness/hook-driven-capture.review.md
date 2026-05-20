---
spec: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md
last-reviewed-revision: 4
file-sha: f5abe46032dfc0ca99c41c732d4cc404e957fa731ecd366a145690647dfcf353
verdict: PASS_WITH_NOTES
date: 2026-05-20
previous-verdict: PASS
previous-revision: 3
---

# Architecture Review: hook-driven-capture (rev 4)

> **Spec:** `.context-index/specs/features/session-awareness/hook-driven-capture.spec.md` (rev 4)
> **Charter:** `.context-index/specs/features/session-awareness/charter.md` (rev 6, approved)
> **Verdict:** **PASS_WITH_NOTES** — spec is ready to proceed. Rev-4 amendment (six optional SessionEnd frontmatter fields for downstream retro consumption) opened two defense-in-depth gaps around producer-side validation that are worth addressing before plan.
> **Previous review:** rev 3 was PASS. Rev 4 is a small amendment with a fresh review surface (one new invariant, expanded Behavior 8, five new error-case rows, four new ACs).
> **Reviewed paired with:** `retro-session-consumption.spec.md` rev 1 (consumer). Cross-spec findings surfaced where the producer/consumer contract has gaps.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reasoning (claude-opus-4-7) | plugin:review-specs/prompts/structural.md |
| security-reviewer | Security Reviewer | subagent | capable (claude-sonnet-4-6) | plugin:review-specs/prompts/security.md |
| consistency-analyzer | Consistency Analyzer | subagent | fast (claude-haiku-4-5) | plugin:review-specs/prompts/consistency.md |

## Structural Architect

**Verdict:** PASS — 2 suggestions.

- **SA-1** (suggestion, Invariants / Module Impact Map) — The new invariant says the helper MAY emit `epic` "resolved from the issue's `epicId` on the issue board, when present," but neither Preconditions nor Module Impact Map declares the dependency on the issue board reader. The SessionEnd helper now reads `lib/issues/` indirectly — should be named as a consumed API.
  - *Suggestion:* Defer-to-plan. Add an Error Cases row "issue board read fails → `epic` omitted; `issue` still written; no error" and a Module Impact Map row for the read-only issue-board access from the SessionEnd helper.

- **SA-2** (suggestion, Invariants / Preconditions) — `issueBinding` is read from `.execution-state.json`, which is owned by the `agent-reliable-state-artifacts` charter. The rev 4 amendment doesn't cite that ownership.
  - *Suggestion:* Add a Precondition: "The `issueBinding` field is read-only from `agent-reliable-state-artifacts`; `epicId` is read-only from the task-management module."

## Security Reviewer

**Verdict:** PASS — 2 warnings, 1 suggestion.

- **SEC-12** (warning, Invariants — Optional SessionEnd frontmatter / AC / Error Cases) — **Producer-side numeric validation missing.** `fromTranscript()` derives `cost_usd`, `input_tokens`, `output_tokens`, `model` from transcript JSONL usage blocks. A malicious or version-skewed harness can feed `"cost_usd": "<script>alert(1)</script>"`, `"input_tokens": "1e10000"` (NaN/Infinity coercion bait), a deeply-nested object, or a 10MB `model` string. The spec doesn't specify what kind check gates persistence. Once written, retro reads `model` verbatim into a per-model table — no revalidation downstream.
  - *Suggestion:* Add to the invariant an explicit validation contract:
    - `cost_usd`: `Number.isFinite(v) && v >= 0 && v < 1e6`, persisted at fixed precision (e.g., `toFixed(4)`). Otherwise omit.
    - `input_tokens` / `output_tokens`: `Number.isInteger(v) && v >= 0 && v < 1e9`. Otherwise omit.
    - `model`: `^[A-Za-z0-9._-]{1,64}$`. Otherwise omit. (Note YAML-frontmatter injection vector if unbounded.)
    Add paired Error Cases row + AC asserting each rejection path.

- **SEC-13** (warning, Invariants — Optional SessionEnd frontmatter / Error Cases) — **`issueBinding` charset validation missing.** `issue` and `epic` are sourced from `.context-index/.execution-state.json` and the issue board respectively. The execution-state file is in-repo but could be hand-edited or written by buggy code. Concrete vectors: `issueBinding: "../../../etc/passwd"` or `"\n- evil: true"` (YAML injection at frontmatter render). Even though IDs aren't directly sensitive, persisting unsanitized content into committed-by-mistake markdown is a defense-in-depth gap, and Spec B reads these without revalidation by default.
  - *Suggestion:* Before writing `issue` / `epic` to frontmatter, validate against `^[a-z0-9][a-z0-9.-]{0,63}$` (matches existing `parseId()` charset in `lib/issues/id-utils.mjs`). On mismatch, omit the field and emit `[adev:session-capture] validation-error issue-id` to stderr. Add Error Cases row + AC.

- **SEC-14** (suggestion, Invariants / Init prompt) — **Privacy: cost/model/tokens are usage telemetry that may surprise users when `gitignored: false`.** The redaction policy intentionally does NOT redact these fields (they're metrics, not secrets), but a user who chose `gitignored: false` may not realize captured sessions will commit their per-project LLM spend and usage patterns.
  - *Suggestion:* Defer-to-plan acceptable. Add a one-line note in the `adev init prompt session-capture` verb output: "Note: captured sessions include cost, token counts, and model in frontmatter — these are usage telemetry, not secrets, but will be committed if `gitignored: false`."

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES — Field contract matrix verified; the six optional fields match naming, types, and absence semantics between Spec A and Spec B. Findings concentrated cross-spec; see Cross-Spec section below.

## Cross-Spec Findings (paired with retro-session-consumption.spec.md rev 1)

- **XS-1** (warning, security trust boundary) — The producer/consumer contract is asymmetric on *malformed-but-present* values. Spec A says fields are "strictly optional — absent fields are not errors." Spec B's Error Cases anticipate "non-numeric → excluded from aggregate" — implying Spec B already expects Spec A to emit malformed data. The trust-boundary enforcement point is ambiguous.
  - *Suggestion:* Recommended path: SEC-12/SEC-13 close this at the producer (Spec A validates at write time). Spec B keeps its tolerance rows as defense-in-depth. Add a sentence to both specs naming the validating party.

- **XS-2** (suggestion, scope) — Spec A's *Optional SessionEnd frontmatter* invariant is scoped to `kind: session-end` files only (Behavior 8). Spec B Behaviors 9/11 treat the optional fields as available on *any* hook-mode file (including pre-compact / placeholder). No functional contradiction (absent fields are tolerated), but the scope mismatch invites reader confusion.
  - *Suggestion:* Spec B should qualify Behaviors 9/11 with "session-end" rather than "hook-mode" to mirror the producer's narrower contract.

- **XS-3** (suggestion, redaction-marker grammar) — Spec B body-grep patterns might accidentally match redaction-marker output from Spec A's `redactSecrets()` (`[REDACTED:<class>]`). Low-impact noise.
  - *Suggestion:* Spec B add a one-line note that body-grep patterns are designed not to collide with `[REDACTED:[a-z-]+]` marker grammar.

## Summary

**Total findings:** 7 (0 blockers, 2 warnings, 5 suggestions).
**Action required:** SEC-12 and SEC-13 are real defense-in-depth gaps that the rev-4 amendment introduced. Both are addressable with a single rev-5 amendment — validation contract for numeric fields and charset check for issue/epic. The other findings can defer to plan.

The two security warnings are independent of Spec B's findings — closing them at the producer simplifies Spec B's consumer-side validation requirements. Recommended: address SEC-12 and SEC-13 in a rev 5 pass before planning.

Spec A is otherwise structurally sound, internally consistent, and the rev-4 producer/consumer contract is correct on field names, types, and presence semantics.
