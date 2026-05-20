---
spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
last-reviewed-revision: 1
file-sha: 1c4b8d6540cbeb29276d380878ad1c035b4736845b0e69d5f4716d43aeb0b65f
verdict: PASS_WITH_NOTES
date: 2026-05-20
---

# Architecture Review: retro-session-consumption (rev 1)

> **Spec:** `.context-index/specs/features/session-awareness/retro-session-consumption.spec.md` (rev 1)
> **Charter:** `.context-index/specs/features/session-awareness/charter.md` (rev 6, approved)
> **Verdict:** **PASS_WITH_NOTES** — fresh first review. Structurally sound and the producer/consumer contract with `hook-driven-capture.spec.md` rev 4 is well-aligned. Six warnings worth addressing before plan; four polish suggestions can defer.
> **Reviewed paired with:** `hook-driven-capture.spec.md` rev 4 (producer).

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reasoning (claude-opus-4-7) | plugin:review-specs/prompts/structural.md |
| security-reviewer | Security Reviewer | subagent | capable (claude-sonnet-4-6) | plugin:review-specs/prompts/security.md |
| consistency-analyzer | Consistency Analyzer | subagent | fast (claude-haiku-4-5) | plugin:review-specs/prompts/consistency.md |

## Structural Architect

**Verdict:** PASS_WITH_NOTES — 3 warnings, 1 suggestion.

- **SA-1** (warning, Behaviors 2/12/13 — section ordering) — The *Stable section position* invariant places Session Activity at "subsection 1.8" in Step 1, but Behavior 12 says it "replaces the conditional placeholder at `skills/retro/SKILL.md:125`" — which currently lives *inside* Step 2. Structural ambiguity: is Context Gaps a Step-1 subsection rendered in the new block, OR does the existing Step 2 logic delete and move to § 1.8?
  - *Suggestion:* Clarify Behavior 12: "The existing conditional Context Gaps logic at retro:125 (in Step 2) is *removed*; the first-class replacement renders inside § 1.8 in Step 1." Add a Module Impact Map line explicitly listing the delete-from-Step-2 edit.

- **SA-2** (warning, Module Impact Map — sub-helper shape) — The `lib/retro/session-metrics/` row says "One file each or one rollup file. Plan decides shape." Specs should name modules they own with stable paths. Also: Behavior 13 lists 6 rendered sub-blocks (a-f) but only 5 sub-helpers are named in tasks; the format-breakdown line (a) is unallocated.
  - *Suggestion:* Pick one shape (recommend single rollup file `lib/retro/session-metrics.mjs`). Explicitly assign the format-breakdown line to the `gatherSessionActivity()` core.

- **SA-3** (warning, Behavior 7 — undocumented producer-output contract) — Behavior 7 says the tool-use parser uses "`### <Tool>` headings, `**Tool:** <name>` lines, or whatever shape `fromTranscript()` produces". Spec A defines `fromTranscript()` but does NOT document the markdown body shape. The "or whatever shape" clause makes the consumer's contract non-testable.
  - *Suggestion:* Either (a) add a plan task to pin `fromTranscript()`'s body shape with a fixture-based contract test in Spec A, OR (b) tighten Behavior 7 to enumerate exact patterns owned by Spec B (decoupling from producer's prose shape). Path (b) is cleaner — keeps the consumer self-contained.

- **SA-4** (suggestion, Preconditions — issue board API) — Behavior 11 joins against "closed issues in the analysis window from the issue board" but neither Preconditions nor Module Impact Map declares the consumed API (`lib/issues/registry.mjs::getIssueManager()`).
  - *Suggestion:* Add to Preconditions: "`getIssueManager(manifest)` exposes a list-closed-issues-in-window operation; consumed read-only." Add Module Impact Map row.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES — 3 warnings, 1 suggestion.

- **SEC-B1** (warning, Behaviors 8/12 — body-grep adversarial content) — **Two related risks:**
  - (a) **Regex DoS** — Body-grep patterns aren't constrained as non-backtracking. `.context-index/specs/.+/.+\.spec\.md` against a multi-MB body of `/` chars is a catastrophic-backtracking trap; "no matches" with surrounding quantifiers similarly. Session bodies are transcript-derived and only bounded by transcript length.
  - (b) **Adversarial gap injection** — Behavior 12 scans for "no matches" / "file not found" / "0 results" patterns without specifying the match must be inside a tool-output block. Adversarial prose injects false gaps that bubble up to ADR candidates.
  - *Suggestion:* Add invariants:
    - All body scans use literal `String.includes()` or non-backtracking regex (RE2-style or fixed-string lookups). Reject backtracking quantifiers like `.+`/`.*` on body content.
    - Body length cap (e.g., 5MB) — skip metric extraction beyond it.
    - Context Gaps requires the "no matches" pattern be anchored inside a tool-output frame (define the frame).

- **SEC-B2** (warning, Behavior 11 — issue-id injection) — Behavior 11 reads `issue:` frontmatter and joins against the issue board. If Spec A doesn't validate `issue` at write time (see Spec A SEC-13), Spec B encounters `issue: "../../../etc/passwd"`, `issue: "<img onerror=…>"`, or huge strings. Two sub-risks: (a) if the board lookup is implemented as `path.join(issuesDir, issueId)`, `../` escapes; (b) rendered xref-row table embeds the value verbatim — if retro is later piped through markdown→HTML, XSS-active.
  - *Suggestion:* Add invariant: Spec B treats `issue`/`epic` as untrusted. Validates against `^[a-z0-9][a-z0-9.-]{0,63}$` before any filesystem join or board lookup. On charset mismatch, render row with `(invalid)` annotation. Required regardless of producer-side validation (defense-in-depth at the trust boundary).

- **SEC-B3** (warning, Behaviors 4-6 — YAML parser safety) — `classifyFormat()` is described as "pure function over parsed frontmatter" but the spec doesn't say what YAML parser is used or its safety posture. Session frontmatter is written by the producer but consumers should not trust it. Classic YAML attacks: billion-laughs (alias-expansion memory exhaustion), `!!js/function` arbitrary-code-exec tags.
  - *Suggestion:* Add Precondition or Invariant: frontmatter YAML parsed in safe-load mode — no custom tags, no functions, no aliases expanded > N times. If a third-party library is used, name it and pin the safe-load contract; otherwise the hand-rolled parser explicitly rejects anchor/alias/tag syntax. Add frontmatter size cap (e.g., 16KB) — skip and classify `unknown` beyond it.

- **SEC-B4** (suggestion, Invariant — read scope) — *No raw transcript reading* invariant is good. Worth strengthening to "retro MUST NOT open any file outside `.context-index/sessions/` and the project's issue board" so a session body containing `See ~/.ssh/id_rsa for context` cannot cause an accidental read.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES — Cross-spec field contract matrix verified clean. Findings are polish.

- **CON-X1** (suggestion, format-name vocabulary) — Spec B's `classifyFormat()` returns `hook` while Spec A uses `kind: session-end | pre-compact | placeholder`. Not a contradiction but invites reader confusion (`hook` is classifier label, not frontmatter value).
  - *Suggestion:* Spec B add a one-line note: "`hook` is the classifier's label, not a stored frontmatter value."

- **CON-X3** (suggestion, undefined `session_id_short`) — Behavior 11 mentions "session_id_short values" once with no definition. Spec A explicitly committed to full session_id (rev 2 superseded the 8-char-prefix form).
  - *Suggestion:* Add to Behavior 11: "session_id_short = first 8 hex chars of session_id, for display only — the underlying join is on the full session_id".

- **CON-X4** (suggestion, stale header comment + Task Map row) — Spec B's header comment and Actionable Task Map row 1 reference the rev-4 amendment as pending. The amendment is now landed in hook-driven-capture rev 4.
  - *Suggestion:* Mark Task Map row 1 as complete (or remove); update header comment to "(landed in hook-driven-capture rev 4)".

- **CON-X5** (suggestion, Error Cases — `(unknown)` annotation semantics) — Spec B Behavior 11 says the xref table joins against "issues closed within the analysis window," but the (unknown) Error Case applies to any absent issue regardless of close-window membership. Mildly underspecified.
  - *Suggestion:* Add to Behavior 11: "When the referenced issue id is not present on the board at all, the row renders with `(unknown)` as title and no closed-date column value."

- **CON-X2 (DUPLICATE OF SA-1 / SA-2 STRUCTURAL XS-2)** — Spec B should narrow Behaviors 9/11 to session-end-only to match Spec A's invariant scope. See Spec A review's Cross-Spec section for the full discussion.

## Cross-Spec Findings (paired with hook-driven-capture.spec.md rev 4)

See the hook-driven-capture review for cross-spec findings XS-1 / XS-2 / XS-3. Spec B's actions for each:
- XS-1 (trust boundary): If producer adds validation (SEC-12/13 in Spec A), Spec B's tolerance rows become defense-in-depth — still valuable, no spec change required.
- XS-2 (session-end scope): Spec B Behaviors 9/11 should say "session-end" not "hook-mode". One-line tightening.
- XS-3 (redaction-marker grammar): Spec B should note body-grep patterns don't collide with `[REDACTED:[a-z-]+]`.

## Summary

**Total findings:** 12 (0 blockers, 6 warnings, 6 suggestions). All warnings concentrated on consumer-side defense-in-depth (regex DoS, YAML safety, untrusted-input handling) and one structural ambiguity (Context Gaps placement). The cross-spec contract on the six optional fields is internally consistent.

**Action required:** Six warnings worth addressing before plan:
- **SA-1** (Context Gaps placement clarification) — one-sentence fix in Behavior 12
- **SA-2** (sub-helper module shape) — pick `lib/retro/session-metrics.mjs` single-file
- **SA-3** (tool-use parser contract) — enumerate patterns directly in Spec B (path b)
- **SEC-B1** (regex DoS + body-length cap + frame-anchored gap matching)
- **SEC-B2** (issue-id charset validation before board lookup)
- **SEC-B3** (YAML safe-load contract + size cap)

Plus three cross-spec items (XS-2 scope narrowing, CON-X1 vocabulary clarification, CON-X3 session_id_short definition) that are small textual fixes.

If a rev 2 pass folds all of these together, the spec lands on a stronger contract for /adev:plan. Defer-to-plan is also acceptable for the consumer-side defense-in-depth items since the producer-side validation (Spec A SEC-12/13) eliminates much of the risk.

Spec B is otherwise structurally sound and the consumer/producer alignment with Spec A rev 4 is correct.
