---
spec: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md
last-reviewed-revision: 2
file-sha: 1bf56cc032939a803d6b028414aa1d8be32ed268e52f870778ad4357409af2e3
verdict: PASS_WITH_NOTES
date: 2026-05-20
previous-verdict: BLOCK
previous-revision: 1
---

# Architecture Review: hook-driven-capture (rev 2)

> **Spec:** `.context-index/specs/features/session-awareness/hook-driven-capture.spec.md` (rev 2)
> **Charter:** `.context-index/specs/features/session-awareness/charter.md` (rev 6, approved)
> **Verdict:** **PASS_WITH_NOTES** — spec is ready to proceed to `/adev:plan`. Two warnings worth addressing before plan if convenient; six suggestions can fold into plan tasks or remain advisory.
> **Previous review:** rev 1 verdict was BLOCK (3 security blockers, 8 warnings, 11 suggestions). All 23 prior findings addressed in rev 2 (verified by reviewer dispatch).

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reasoning (claude-opus-4-7) | plugin:review-specs/prompts/structural.md |
| security-reviewer | Security Reviewer | subagent | capable (claude-sonnet-4-6) | plugin:review-specs/prompts/security.md |
| consistency-analyzer | Consistency Analyzer | subagent | fast (claude-haiku-4-5) | plugin:review-specs/prompts/consistency.md |

## Prior-finding resolution

| Finding | Status |
|---|---|
| SA-1 (external payload contract) | partially-addressed — reactive parse-error placeholder is in place, but no proactive payload-schema fixture pin. See new SA-9. |
| SA-2 (PreCompact-after-SessionEnd) | addressed |
| SA-3 (sentinel markers for post-commit removal) | addressed |
| SA-4 (manifest-vs-detection conflict) | addressed |
| SA-5 (init-wizard CLI verb) | addressed — `adev init prompt session-capture` named consistently |
| SA-6 (Module Impact Map gaps) | addressed |
| SA-7 (symmetric gitignore removal on capture: off) | addressed |
| SA-8 (supersession bookkeeping) | addressed |
| SEC-1 (transcript redaction policy) | addressed — see new SEC-9 for gap in pattern list |
| SEC-2 (session_id charset) | addressed |
| SEC-3 (transcript_path containment) | addressed — see new SEC-10 for realpath comparison tightening |
| SEC-4 (temp-name PID collision) | addressed |
| SEC-5 (paired gitignore markers) | addressed |
| SEC-6 (bash-wrapper gate-check) | addressed |
| SEC-7 (stable stderr format) | addressed — see new CON-10 for grammar refinement |
| SEC-8 (mode-transition cleanup hint) | addressed |
| CON-1 (`supersedes:` frontmatter) | addressed |
| CON-2 (charter-extension omission) | addressed (intentional) |
| CON-3 (session_id_short narrowing charter contract) | addressed — full session_id used consistently |
| CON-4 (/adev:retro in Behavior 12) | addressed (Behavior 15 in rev 2) |
| CON-5 (ADR 0014 stderr reference) | addressed |
| CON-6 (provider key behavior coverage) | addressed |
| CON-7 (kind: behavioral confirmation) | confirmed |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES
**Summary:** All 8 prior SA findings addressed (SA-1 partially via reactive Error Cases; no proactive schema pin). Two new low-severity suggestions; neither blocks planning.

- **SA-9** (suggestion, Preconditions / Module Impact Map — External Contracts gap) — SA-1 only half-addressed in rev 2 (reactive placeholder on missing fields, but no proactive payload-schema pin). A breaking upstream rename (e.g., `session_id` → `sessionId`) would silently degrade every capture to placeholder without alerting maintainers.
  - *Suggestion:* Add an "External Contracts" Preconditions bullet or Module Impact row pinning a payload-schema fixture under `tests/fixtures/claude-code-payloads/` (versioned). Validator chain asserts the documented field shape; emit a distinct stderr reason code (e.g., `payload-error schema-skew`) when fields are present but shaped differently than expected.

- **SA-10** (suggestion, Invariants — Transcript path containment / Preconditions) — The transcripts-root invariant references `platform-context.yaml` as an override location, but no other section of the spec defines, references, or links to that file. The override clause has no contract.
  - *Suggestion:* Either drop the `platform-context.yaml` clause (rely solely on `~/.claude/projects/<cwd-encoded>/`), or add a Module Impact row + AC item committing to a schema for the override key. Prefer dropping unless there's a concrete need.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES
**Summary:** All eight rev-1 security findings addressed precisely with testable contracts. Two new warnings (redaction-list gaps, realpath-vs-raw containment) and one suggestion (sentinel mismatch handling).

- **SEC-9** (warning, Invariants — Transcript redaction) — Redaction pattern list misses high-impact secret classes: PEM private-key blocks (`-----BEGIN (RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----`), Slack tokens (`xox[abprs]-…`), Google API keys (`AIza[0-9A-Za-z_-]{35}`), Stripe keys (`sk_(live|test)_[0-9A-Za-z]{24,}` — note the underscore distinction from the existing `sk-` pattern). PEM blocks are the highest-impact gap.
  - *Suggestion:* Add PEM private-key block matcher (multiline, replace entire block with `[REDACTED:private-key]`), Slack, Google API, and Stripe `sk_(live|test)_` to the documented pattern list. Note the underscore-vs-hyphen distinction for Stripe vs OpenAI/Anthropic.

- **SEC-10** (warning, Invariants — Transcript path containment / Working directory check) — `realpath` resolution for `transcript_path` is specified, but the spec does not require the SAME for the transcripts-root anchor (`~/.claude/projects/<cwd-encoded>/`). If the anchor itself is a symlink (e.g., `~/.claude` → `/tmp/...`), containment comparison may pass on string-prefix while still escaping. Same concern for `cwd`'s manifest-bearing-directory walk — the walk MUST start from the realpath, not the raw input.
  - *Suggestion:* Tighten the invariant: "after `realpath` resolution of BOTH `transcript_path` AND the configured transcripts root, the resolved transcript_path must be a path-prefix child of the resolved root (compare resolved-vs-resolved, not resolved-vs-raw)." Apply the same `realpath`-then-walk discipline to `cwd`'s manifest-bearing-directory check.

- **SEC-11** (suggestion, Invariants — Paired-marker idempotency / Behavior 13) — Sentinel-based regions are safe against accidental user edits, but the spec does not specify behavior when a malformed/unmatched sentinel pair is encountered (e.g., stray `# >>> adev:session-capture >>>` without its closing `<<<` due to user merge conflict). The installer could either greedily extend to EOF or silently no-op; both are surprising. Risk is install-time misbehavior, not exploitability.
  - *Suggestion:* Add an Error Cases row: "Sentinel-bounded block has opening marker without matching closing marker (or vice versa) → installer exits 0 with stderr `[adev:session-capture] validation-error sentinel-mismatch <project-relative-file>`, no modification. User must repair manually."

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES
**Summary:** All 7 prior consistency findings cleanly resolved. Sentinel markers, CLI verb naming, and session_id usage are consistent throughout. Three net-new suggestions on conflict-warning surface, `platform-context.yaml` stray reference, and stderr reason-code grammar.

- **CON-8** (suggestion, Behavior 3 / Error Cases / AC — SA-4 conflict-warning surface) — Behavior 3 and the SA-4 error-case row describe the manifest-vs-detection conflict warning, but neither location specifies WHERE the warning is emitted (stderr? prompt body? both?). Mild contract drift between invariant ("surfaces") and Behavior 3 (implied prompt-body rendering).
  - *Suggestion:* Anchor the warning channel explicitly — e.g., "rendered in the prompt body above the default-accept question" — so `/adev:plan` and `/adev:write-test` can deterministically locate the surface to assert against.

- **CON-9** (suggestion, Invariants — Transcript path containment / Preconditions) — DUPLICATE of SA-10: `platform-context.yaml` override-file reference has no surrounding contract. (Two reviewers flagged the same issue, raising its priority.)
  - *Suggestion:* Drop the override clause, or first-class it as a Precondition + Module Impact + AC.

- **CON-10** (suggestion, Error Cases — `validation-error` reason-code subcategories) — The *Stderr diagnostic format* invariant enumerates six reason codes, but the Error Cases table uses sub-tokens (`validation-error session-id`, `validation-error cwd`) and `path-error transcript`. The invariant grammar is `<code>` but practice is `<code> <subject>`.
  - *Suggestion:* Document the optional second token in the invariant as a subject identifier (e.g., `<reason-code>[ <subject>] <project-relative-path?>`), and enumerate legal subjects (`session-id`, `cwd`, `transcript`, `sessions-dir`, `session-id-missing`, `transcript-path-missing`, `sentinel-mismatch`).

---

## Summary

**Total findings:** 8 net-new (0 blockers, 2 warnings, 6 suggestions). All 23 prior findings resolved (1 partial: SA-1 → see SA-9).
**Verdict:** PASS_WITH_NOTES. Spec is ready for `/adev:plan`.

### Recommended actions before plan

- **SEC-9** (warning) — Adding PEM block matcher to the redaction pattern list is one regex; defensible to do in this revision pass before plan. Stripe / Slack / Google can follow.
- **SEC-10** (warning) — Tighten the containment invariant to compare realpath-vs-realpath. One sentence change to the invariant.
- **SA-10 / CON-9** (suggestion, duplicated by two reviewers) — Drop the `platform-context.yaml` override clause unless there's a concrete need to support project-local transcripts roots.
- **CON-8** (suggestion) — Anchor the conflict-warning surface explicitly in Behavior 3.

### Defer-to-plan (acceptable as plan tasks)

- **SA-9** (suggestion) — Payload-schema fixture for upstream version-skew detection. A plan task; a small fixture + assertion is enough.
- **SEC-11** (suggestion) — Sentinel-mismatch error case. One row in the Error Cases table; can be added as a plan task.
- **CON-10** (suggestion) — Stderr reason-code grammar documentation refinement.

The spec's behavioral contract is otherwise complete and decomposable. `/adev:plan --spec hook-driven-capture.spec.md` will produce a clean task graph.
