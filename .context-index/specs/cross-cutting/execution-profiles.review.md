# Architecture Review: execution-profiles

> **Date:** 2026-04-19
> **Spec:** .context-index/specs/cross-cutting/execution-profiles.md
> **Charter:** (cross-cutting — no parent charter)
> **Verdict:** PASS_WITH_NOTES

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1 (warning, Behaviors 11-12, 16, Tool Categories Seed table):** Category → concrete-tool mapping authority still split. The seed table ("Maps to (Claude Code)") gives a concrete mapping while Behavior 16 makes the adapter authoritative. Declare which artifact is normative (recommend: adapter is authoritative; seed table illustrative) and state precedence when they diverge.
- **SA-2 (warning, Behavior 8):** `extends` resolution remains non-associative across three-link chains. Mid-chain `allow` replacement produces different effective tools vs. `allow_add` union. Either document "non-associative; root-order matters" or forbid `allow` on non-root profiles.
- **SA-3 (warning, Behaviors 8, 19):** `env.files` child-replaces-parent while `env.allow` unions — inconsistent inheritance semantics. Document rationale in spec body or add `files_add` for parity with `allow_add`.
- **SA-4 (warning, Behaviors 13 vs 17):** MCP *presence* is load-time-checked; `mcp__<name>__*` *expansion* remains dispatch-time-session-dependent. Effective `allowedTools` is not pure-data-deterministic. Either freeze expansion at load or state explicitly in Postconditions that `allowedTools` is not a pure function of (profile, platform-context).
- **SA-5 (warning, Behaviors 11-12, extension protocol):** Tool categories still defined by prose only. Require the extension protocol to include 2-3 testable invariants per category so adapter correctness is checkable.
- **SA-6 (warning, adapter contract):** Adapter export surface is under-specified. Behavior 36 requires audited-channels declaration and Behavior 16 requires unsupported-category list, but no single canonical export shape is specified. Enumerate required exports (`IMPLEMENTED`, `UNSUPPORTED`, `AUDITED_CHANNELS`, `capabilities.envTrustBoundary`) so `loadProfiles` can fail-closed deterministically.
- **SA-7 (suggestion, Behaviors 1-4, 32):** Profile *definition* source symmetric to env resolution is implicit. Add a one-line behavior: "The `repoRoot` passed to `loadProfiles` is the consumer repo root (same repo-selection rule as Behavior 32)."
- **SA-8 (suggestion, Acceptance Criteria, Behavior 36):** Redaction-pipeline AC references no enumerable adapter export. Tie the AC to the adapter's declared audited-channels export so coverage is mechanically checkable.
- **SA-9 (suggestion, Behavior 22a):** Ownership of the contributing-file mapping downstream is unclear (dispatch record vs. report header vs. both). Clarify so consumers don't duplicate or drop the audit field.
- **SA-10 (suggestion):** No behavior addresses profile reload / cache invalidation across a long-running session. Specify single-shot-per-invocation vs. per-dispatch re-read.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

### Rev 1 Blocker Remediation

- **SEC-1 (tool-scoping escape): RESOLVED.** Behavior 5 rejects `{ category: "*" }` at schema validation. Behavior 14 requires explicit `allow_unportable: true` on literal entries (load fails without it). Behaviors 14a/14b emit real load-level WARNs (not adapter advisory) when `allow_add` broadens posture. `implementer` enumerates all six categories explicitly.
- **SEC-2 (env file shadow): RESOLVED.** Behavior 22 distinguishes bare (required-to-exist) vs `optional:`-prefixed paths. Behavior 22a records the contributing file per key. Silent-skip-on-absence is now opt-in.
- **SEC-3 (redaction channel gaps): RESOLVED.** Behavior 36 enumerates six audited channels and declares a single chokepoint. Adapters must declare audited channels in module exports.
- **SEC-4 (redaction bypass classes): RESOLVED.** Behavior 36a specifies 8-char minimum, streaming-boundary lookback buffering, and shared-value disambiguation. Behavior 36b documents bypass classes as v1-accepted risk with "treat model as adversarial" guidance.

### New Findings

- **SEC-12 (warning, authorization/secrets):** `implementer` profile still ships with full filesystem/shell/network. Any project can `extends: implementer` and inherit root privileges with only a WARN (14a/14b), not a hard gate. Now the easiest bypass since other escape hatches are closed. Gate behind opt-in flag or require governance attestation.
- **SEC-13 (warning, secrets):** Behavior 22a writes `{KEY: contributing-file}` verbatim into committed `.review.md` / `.validate.md` report headers. File paths can themselves be sensitive (`optional:config/.env.production-customer-x`). Normalize to repo-relative; keep full mapping in non-committed audit log. Add AC forbidding absolute-path leak.
- **SEC-14 (warning, data-exposure):** Behavior 36a's `<REDACTED:K1|K2>` placeholder leaks that two keys share a value — useful signal to an attacker confirming secret reuse. Use an opaque index `<REDACTED:#1>` in log bytes; keep `#1 → {K1,K2}` mapping only in non-model audit record.
- **SEC-15 (suggestion, authorization):** 14a/14b WARN on broadening but load still succeeds. Add manifest-level `strict_profile_inheritance: true` that upgrades these WARNs to load errors so CI can fail closed.
- **SEC-16 (suggestion, secrets):** Behavior 27 silently drops allowlist-absent keys. A misspelled `.env` key (real secret sitting unused) is invisible. Emit INFO-level note listing parsed-but-dropped keys so misspellings surface.
- **SEC-17 (suggestion, defense-in-depth):** Behavior 37 refuses dispatch for adapters lacking env trust boundary, but no capability-version check for silent regression in a later adapter version. Require `envTrustBoundary: { version: 1 }` checked against a declared minimum.

### Unaddressed Prior Warnings (informational)

SEC-5 (unbounded `$workspace/` ancestor search), SEC-6 (MCP dispatch-time expansion drift), SEC-7 (adapter fail-safe exports), SEC-8 (extends downgrade of `required`→`optional`), SEC-9 (`redactionSet` serialization hardening), SEC-10 (strict unknown-key rejection on security-sensitive fields), SEC-11 (implementer opt-in) are not explicitly resolved in rev 2. SEC-7 is partially addressed (adapter MUST list unsupported categories); SEC-8 is partially addressed (union rule for `env.allow`). These remain original-severity warnings; none are new blockers.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES (original BLOCK resolved in-flight — see note)

- **CON-1 (RESOLVED IN SAME CHANGESET):** Rev 2's `@workspace/` → `$workspace/` rename was not propagated to `configurable-checks.md:114` (Behavior 25), which referenced the old form. **Fixed in the same commit** as this review: Behavior 25 now reads `$workspace/` with a disjointness note pointing at `multi-repo-workspace/charter.md`.
- **CON-2 (RESOLVED IN SAME CHANGESET):** Charter `features/review/charter.md:78,122` still described the shared-env opt-in as `@workspace/`. **Fixed in the same commit.**
- **CON-3 (RESOLVED IN SAME CHANGESET):** ADR-0004 (`adrs/0004-execution-profiles.md:38,81`) still used `@workspace/`. Per CLAUDE.md ("Updating specs/ADRs when code changes affect their assumptions" is required), the ADR needed amendment. **Fixed in the same commit**, with a rationale line on why the `$` sigil was chosen.
- **CON-4 (confirmed consistent):** `cross-repo-references.md` uses `@<repo-slug>/<spec-slug>` for spec refs only — no collision with the new `$workspace/` env-file prefix. Rev 2's explicit disjointness note (Behavior 27 preamble) cites `multi-repo-workspace/charter.md` correctly.
- **CON-5 (confirmed consistent):** Model tiers (`fast | capable | reasoning`) match `model-routing.md`. Fallback semantics inherited transitively via Behavior 15's platform-context deferral. One-line cross-reference would be polish.
- **CON-6 (warning, terminology):** Rev 2 Behavior 27 preamble uses "pre-rev-2 form" when rejecting `@workspace/` — an internal revision artifact that will confuse readers once rev 2 is canonical. Remove; leave only the functional rejection message.
- **CON-7 (suggestion, naming):** Document (one line, in the grammar preamble) that the `$` sigil was chosen because it cannot appear in valid POSIX path components and will not collide with future cross-repo env grammars.
- **CON-8 (suggestion, pattern):** Rev 2 introduces lettered sub-behaviors (`14a`, `14b`, `22a`, `36a`, `36b`). Sibling cross-cutting `model-routing.md` uses flat numeric numbering. Renumber to flat sequence before status flips to `approved` for corpus consistency.

---

## Summary

**Total findings:** 28 (0 blockers, 14 warnings, 14 suggestions)
**Action required:** None blocking. All five rev-1 blockers (SEC-1..4 + CON-2) remediated. The consistency BLOCK from cross-file drift was resolved in-flight by the same changeset (CON-1/2/3). Remaining warnings (SEC-12 implementer privilege, SEC-13 path leak in report, SEC-14 shared-value leak, SA-2 associativity, SA-6 adapter export contract) should be tracked for implementation but do not gate advancement to planning.

---

last-reviewed-revision: 2
file-sha: 4f2c2b37e4530a331ab29129f6d8eb421acb1b34
