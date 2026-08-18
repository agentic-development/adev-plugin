---
spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log-rev-5-review-gate-integrity.spec.md
charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md
date: 2026-08-17
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 2
file-sha: e21c9f557e1c8320db5e49d8e29d508a6273c3e673a8ac7402dcbb9aa98b12ab
---

# Architecture Review: lifecycle-event-log-rev-5-review-gate-integrity

> **Date:** 2026-08-17
> **Spec:** `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log-rev-5-review-gate-integrity.spec.md`
> **Charter:** `.context-index/specs/features/agent-reliable-state-artifacts/charter.md`
> **Verdict:** BLOCK
> **Rigor tier:** full (risk_level `high` → `review_mode: full`; no `--tier` override)

## Registry Notes

Registry loaded via `adev governance reviewers --json` — 0 errors, 4 warnings:

| Code | Message |
|------|---------|
| BROADEN_TOOL | Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'. |
| BROADEN_TOOL | Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'. |
| BROADEN_NETWORK | Profile 'browser-review': network broadened 'deny' → 'read-only'. |
| CONTEXT_PACK_OVERRIDE | Context pack 'review-base' overrides bundled default. |

Governance: `spec-to-plan` transition — no `approver_role` declared in `gates.yaml`.
Risk policy for `high`: `require_review: true`, `require_hitl_approval: true`, `test_depth: thorough`.
No workspace detected; spec declares no `depends-on` cross-repo references. No `.context-index/references/` directory.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

No reviewers are disabled in `.context-index/governance/review.yaml`.

---

## Structural Architect (structural-architect)

**Verdict:** FAIL

### SA-1 — `"divergent"` is an absorbing state, so the normal retry path permanently blocks the gate

- **Severity:** `blocker`
- **blocker_id:** `structural-architect:absorbing-projection-state:df6733b5`
- **section_anchor:** `behavioral-delta`
- **Location:** Behavioral Delta, BEH-3a / BEH-3b (and the AC "Three `reviewer_report` events for one step carrying two distinct `spec_sha` values project `divergent`")
- **Finding:** BEH-3a scopes reconciliation to "a step" — the entire step history — not to one review attempt or one revision. The base spec's fold is explicit that `steps.<step>` top-level fields reflect the **latest revision** (`lifecycle-event-log.spec.md` Behaviors, `byRevision[N]` row; confirmed in `lib/lifecycle-state.mjs:1543-1575`), so BEH-3a contradicts the projection rule it extends. The consequence is not cosmetic: the `review-block-auto-retry` loop (BLOCK → `/adev:specify --revise` → rev N+1 → re-review) is the *designed* path, and it guarantees differing `spec_sha` values across revisions for the same step. Under BEH-3a that step projects `"divergent"`, and under BEH-3b `requireGate` treats it as a mismatch. Because the log is append-only by construction, nothing can ever clear it — no later clean review at rev N+1 with three identical digests can restore a non-divergent projection. Every spec that converges through the retry loop becomes permanently un-plannable under `gate_mode: strict`. The same trap fires without any revision bump: two runs of `/adev:review-specs` over an edited spec both fold into `byRevision[1]` and diverge forever.
- **Recommendation:** Scope the reconciliation set explicitly. State which events participate — the reports of the latest revision only, or of the latest review attempt — so `steps.<step>.specSha` follows the same latest-wins rule as `verdict`/`status`, and `byRevision[N].specSha` carries the per-attempt history BEH-4 already declares audit-only. Add an AC asserting that a rev-1 review and a rev-2 review with different digests do **not** project `"divergent"`.

### SA-2 — The named enforcement point excludes the largest gate consumer

- **Severity:** `warning`
- **Location:** Behavioral Delta, BEH-9; Amendment Rationale ("defect 1")
- **Finding:** BEH-9 designates `adev gate require` (`lib/cli/gate.mjs`) as the mandatory enforcement caller. But `/adev:build` — the orchestrator that chains review → plan → implement without human intervention, i.e. the scenario where a mid-pipeline rewrite is most plausible — calls `requireGate` directly through the lib import, not through the CLI verb (`skills/build/SKILL.md:340-359`, `skills/build/resume-mode.md:13,42`). Under BEH-6 that path supplies no `currentSpecSha` and takes the `SPEC_SHA_UNVERIFIABLE` advisory forever. The Rationale's "Bounding the claim" paragraph bounds BEH-7 but not this residual gap, so the amendment reads as closing defect 1 more completely than it does.
- **Recommendation:** Either add the build orchestrator's gate calls to BEH-9's enforcement set, or extend the Rationale's bounding paragraph to state that lib-direct callers remain unverified and name that as out of scope.

### SA-3 — The body-boundary rule diverges from the repo's canonical frontmatter boundary, and the shared helper is unnamed

- **Severity:** `warning`
- **Location:** Behavioral Delta, BEH-1
- **Finding:** Two gaps. (a) BEH-1 defines the digest input as "the exact byte range following the second `---` line". The repo's canonical parser, `lib/frontmatter.mjs::parseFrontmatter`, deliberately does **not** use that rule — it locates the opening fence via `findOpeningFence`, which tolerates an H1/comment preamble before the fence, and returns a decoded, split/joined `body` string rather than a byte range. An implementer reaching for the existing helper produces a different digest than BEH-1 specifies, and the spec neither reconciles the two nor forbids the helper. (b) BEH-1 and BEH-9 both require "one shared exported helper" but never name its owning module or export. The base spec's AC #1 enumerates the exact export surface of `lib/lifecycle-state.mjs`; adding a public export without declaring it leaves the API shape undefined, and the AC "asserted by test, not by inspection" has no named symbol to assert against.
- **Recommendation:** Name the module and export for the shared digest helper, and state explicitly whether it wraps or deliberately bypasses `lib/frontmatter.mjs::parseFrontmatter` (the byte-range/no-decode requirement suggests bypass; say so).

### SA-4 — BEH-7's sequencing invariant is placed on the CLI arm, leaving the library write path unguarded

- **Severity:** `warning`
- **Location:** Behavioral Delta, BEH-7 / BEH-8
- **Finding:** BEH-7 is worded against `adev report --type step`, and BEH-8 says only that "the check reads the projection". Neither says whether the invariant lives in `lib/cli/report.mjs` or in `reportStep` itself. `reportStep` has at least one non-CLI caller today — `lib/specify-amend.mjs:224-225` emits `started` then `completed` directly — so a CLI-only check makes the invariant bypassable by construction rather than by policy, which is a weaker guarantee than the base spec's append-only invariant (enforced by an architectural CI test).
- **Recommendation:** State where the check lives. If it is deliberately CLI-only, say so and explain why the library must stay permissive; if it belongs in `reportStep`, say that and confirm `lib/specify-amend.mjs`'s ordered pair still satisfies it.

### SA-5 — In-band sentinel on a digest-typed field

- **Severity:** `suggestion`
- **Location:** BEH-3a, Error Cases Delta (`expectedSpecSha: "divergent"`)
- **Finding:** `steps.<step>.specSha` is otherwise a 64-char hex string; `"divergent"` overloads the same field with a control value, and it leaks into the `GateError` payload where consumers must special-case it.
- **Recommendation:** Consider an out-of-band signal (e.g. a sibling boolean or the set of observed digests) so the digest field stays single-typed.

**Positive notes.** Frontmatter-vs-body digest scoping (BEH-1) is correctly reasoned against the ADR-0011 restamp and the reviewing skill's own `status` write, and the regression AC for it is present. The optional-field-plus-fail-soft mechanism keeps the ADR-0009 `[BOUNDARY: human-approved]` line uncrossed. BEH-6's no-I/O constraint on `requireGate` preserves the base spec's caller-resolves-inputs contract, matching the existing `mode` precedent. BEH-5's never-block-on-missing-provenance rule correctly protects the entire existing review corpus. Postconditions extend the base's abort-safety property verbatim. No ADR conflict found across ADRs 0009, 0011, 0012, 0015, 0016, 0018. `target-revision: 5` against base `revision: 4` matches the convention used by `configurable-reviewers-rev-5-*`.

---

## Security Reviewer (security-reviewer)

**Verdict:** FAIL

### SEC-1 — Governance-controlling frontmatter is outside the attested region

- **Severity:** `blocker`
- **Category:** authorization
- **blocker_id:** `security-reviewer:authorization:41561e5c`
- **section_anchor:** `behavioral-delta`
- **Finding:** BEH-1 scopes the integrity digest to the spec body below the closing frontmatter delimiter, leaving the whole frontmatter block unattested. `risk_level`, `amends`, `target-revision` and `charter` live there and drive governance decisions, so a post-review frontmatter rewrite still satisfies the strict gate. Concretely: a spec reviewed at `risk_level: high` can be flipped to `low` after review; `risk-policies.yaml` then yields `require_hitl_approval: false`, `review_mode: quick`, `test_depth: minimal`, and BEH-4 sees an identical body digest and passes. The same trick re-points `amends`/`target-revision` at a different base spec. The spec's justification for body scope covers only the four lifecycle-owned keys (`status`, `updated`, `drift_detected`, `source-manifest`) but the exclusion is written as all-frontmatter.
- **Recommendation:** Digest a canonicalized frontmatter subset plus the body: parse frontmatter, delete an explicit denylist of lifecycle-machine-written keys (`status`, `updated`, `drift_detected`, `source-manifest`), serialize the remaining keys sorted by name in a fixed encoding, and hash `canonicalFrontmatter || "\n" || body` inside the same shared helper BEH-1 already mandates. Add an AC asserting that mutating `risk_level` alone changes `spec_sha` and blocks the strict gate, alongside the existing AC that lifecycle frontmatter writes do not. This is the CWE-345 (insufficient verification of data authenticity) surface the amendment exists to close; leaving governance-controlling fields outside the signed region reproduces it one level up.

### SEC-2 — `spec_sha` is unvalidated on write and on fold, and the sentinel shares its namespace

- **Severity:** `warning`
- **Category:** input-validation
- **Finding:** Nothing validates `spec_sha` on write or on fold. The base spec's schema is deliberately open and `appendEvent` is exported, so any writer can append a `reviewer_report` with an arbitrary `spec_sha` — including the literal string `"divergent"`, which BEH-3a reserves as an in-band sentinel in the same field namespace as real digests. A single forged report carrying `"divergent"` permanently blocks a step under BEH-3b; a forged report carrying a precomputed future digest pre-authorizes bytes no reviewer read. BEH-4 also compares raw values, so a non-hex value silently becomes a "mismatch" rather than a schema error.
- **Recommendation:** Constrain `spec_sha` at write time in `reportReviewer`/`appendEvent`'s `reviewer_report` validation to `/^[0-9a-f]{64}$/`, rejecting anything else with the existing `EVENT_SCHEMA_INVALID` code (same discipline the base spec already applies to `partial_recovery.action`'s closed enum and its absolute-path rejection). Move the divergence signal out of band — project `steps.<step>.specShaDivergent: true` alongside an absent `specSha` — so no persisted event value can ever impersonate the sentinel, and have the fold treat a malformed persisted `spec_sha` as absent (BEH-5 path) with a distinct warning.

### SEC-3 — BEH-9a fails open on an unreadable spec even when provenance exists

- **Severity:** `warning`
- **Category:** authorization
- **Finding:** BEH-9a collapses two distinct states into one fail-open path. "No review ever recorded a digest" (legacy corpus — correctly non-blocking per BEH-5) and "the prior step *did* record a digest but `adev gate require` cannot read the spec right now" are both routed to `SPEC_SHA_UNVERIFIABLE` and pass. The second case is an attacker- or accident-triggerable downgrade: making the spec transiently unreadable (permission change, symlink swap, race) disables the control for that invocation with only a `console.warn`. `resolveSpecOrExit` already guarantees the file exists, so a read failure here is anomalous, not routine.
- **Recommendation:** Branch on whether the prior step projects a `specSha`. If it does not, keep BEH-5's fail-soft verbatim. If it does and the current digest cannot be computed, emit a distinct code (e.g. `SPEC_SHA_UNCOMPUTABLE`) and block under `mode === "strict"` while warning under advisory — the enforcement regime the recorded provenance already opted into. Add the corresponding Error Cases row and an AC. This keeps "never block on missing history" intact while removing the "make it unreadable to skip the check" bypass (OWASP A01, security control failing open).

### SEC-4 — Unscoped reconciliation makes the normal remediation flow permanently blocking

- **Severity:** `warning`
- **Category:** authorization
- **Finding:** BEH-3a's reconciliation set is "every present `spec_sha` for that step", unscoped by revision, while BEH-4 reads the top-level `steps.<step>.specSha`. Under the `review-block-auto-retry` path a step is legitimately reviewed at revision 1 (digest A) and again at revision 2 (digest B) after the author addresses blockers — two differing values on the same step — so the projection yields `"divergent"` and BEH-3b blocks the strict gate permanently for every spec that was ever revised and re-reviewed. That is the normal remediation flow, not an edge case. The predictable operator response is a project-wide `lifecycle.gate_mode: advisory`, which disables the control this amendment adds.
- **Recommendation:** Scope BEH-3a's reconciliation to the reports folding into the latest revision (`byRevision[max(N)]`), consistent with the base spec's rule that top-level step fields reflect the latest revision; earlier revisions' digests stay in `byRevision[N].specSha` for audit. Add an AC: a step with a revision-1 report carrying digest A and revision-2 reports carrying identical digest B projects `specSha === B`, not `"divergent"`.

### SEC-5 — Residual mid-review-window gap is not recorded in Acceptance Criteria

- **Severity:** `suggestion`
- **Category:** authorization
- **Finding:** BEH-1a concedes the digest attests bytes at `reportReviewer` time, i.e. after the subagent returned, so an edit made during the review window is stamped post-edit and passes BEH-4. The amendment's stated defect 1 ("a spec can pass review, be rewritten, and still satisfy the gate") is therefore only closed for rewrites landing after the report, not during review. The bounding is stated honestly, but nothing in the Acceptance Criteria records the residual gap.
- **Recommendation:** Have `/adev:review-specs` compute the body digest once at dispatch via the same shared helper, pass it into each reviewer's context pack, and have `reportReviewer` accept it as an explicit argument, falling back to a fresh read only when the caller omits it — BEH-3a's divergence rule then catches a mid-window rewrite because the pre-dispatch and post-return digests differ. If that is deferred, add an explicit non-goal line to Acceptance Criteria so the gap is tracked rather than assumed closed.

**Clean areas.** No authentication, secrets, or data-exposure issues found: the `GateError` and `console.warn` payloads carry only step names and hex digests, `spec_sha` is derived data with no secret material, and the base spec's SEC-1/SEC-4 path-containment and SEC-8 absolute-path prohibitions are untouched by this delta.

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** FAIL

### CON-1 — BEH-3a contradicts `review-block-auto-retry`'s latest-revision projection rule

- **Severity:** `blocker`
- **Category:** contract
- **blocker_id:** `consistency-analyzer:contract:086796d4`
- **section_anchor:** `BEH-3a`
- **This Spec:** BEH-3a reconciles `spec_sha` across the reports folded into "a step" — if any two differ, `steps.<step>.specSha` projects `"divergent"`. BEH-3b then makes `"divergent"` a BEH-4 mismatch, blocking the gate under strict mode.
- **Conflicts With:** `.context-index/specs/cross-cutting/review-block-auto-retry.spec.md` Behavior 5 ("the current top-level `state.steps.<step>` remains the verdict of the **latest revision**") and Behaviors 6–8 / Postcondition 1 ("the lifecycle log carries M `spec_revised` events plus **M+1 `reviewer_report` events**" on the same `review` step). Also `lifecycle-event-log.spec.md:137`, which scopes the top-level projection to the latest revision. Each revise round rewrites the spec body, so reports from rev N and rev N+1 necessarily carry different `spec_sha`. BEH-3a is not revision-scoped, so **every spec that passed through the BLOCK→revise→PASS loop projects `"divergent"` permanently** and is gate-blocked forever with no escape but `gate_mode: advisory`. This amendment itself is `revision: 2` and would block itself.
- **Recommendation:** Scope BEH-3a's reconciliation to the reports of the **latest revision** only (matching the base's latest-revision top-level rule); let `byRevision[N].specSha` hold the per-revision value. Add an AC: reports across two revisions with different digests project the latest revision's digest, not `"divergent"`.

### CON-2 — `GATE_SPEC_SHA_MISMATCH` breaks the dispatcher's `GATE_BLOCKED` → exit-2 contract

- **Severity:** `blocker`
- **Category:** contract
- **blocker_id:** `consistency-analyzer:contract:a83f6329`
- **section_anchor:** `error-cases-delta`
- **This Spec:** BEH-4 and the Error Cases Delta specify a `GateError` under error code `GATE_SPEC_SHA_MISMATCH`, carrying `{requiredStep, currentStatus, mode, expectedSpecSha, currentSpecSha}`.
- **Conflicts With:** `.context-index/specs/features/cli/charter.md:41` — "The dispatcher catches `GateError` (detected via `err.code === 'GATE_BLOCKED'`) … and converts it to exit code 2. Other exceptions exit with code 1" — implemented at `cli/index.mjs:2005` and asserted by `.context-index/specs/features/cli-driver-surface/driver-substrate.validate.md:66`. `GateError` hardcodes `this.code = 'GATE_BLOCKED'` (`lib/lifecycle-state.mjs:1892`) and its constructor destructures only `{requiredStep, currentStatus, mode}`. A distinct `code` makes `adev gate require` exit **1**, not 2 — while `skills/review-specs/SKILL.md:29` and every gate consumer key on exit 2.
- **Recommendation:** Keep `code: 'GATE_BLOCKED'` and carry `GATE_SPEC_SHA_MISMATCH` in a separate discriminator field (e.g. `reason`), or explicitly amend the dispatcher contract in `features/cli/charter.md`. Either way, state that the constructor widens to accept `expectedSpecSha`/`currentSpecSha` — `lifecycle-event-log.spec.md:196` documents the payload as the three-field form.

### CON-3 — `byRevision[N].specSha` silently takes last-write-wins

- **Severity:** `warning`
- **Category:** contract
- **This Spec:** BEH-3 projects `spec_sha` onto `byRevision[N].specSha`; BEH-4 calls it "retained for audit only."
- **Conflicts With:** BEH-3a of this same spec, which rejects last-write-wins ("lets a reviewer who read the rewritten bytes launder a review of the old text"). Within one revision, `--tier full` folds three reports into the same `byRevision[N]`; no reconciliation rule is given, so the audit key silently takes last-write-wins — the exact pathology BEH-3a names.
- **Recommendation:** Apply the same identical-or-`"divergent"` rule to `byRevision[N].specSha`, or state explicitly that the audit key records the last report and is not authoritative.

### CON-4 — Two independent staleness mechanisms on adjacent log variants

- **Severity:** `warning`
- **Category:** pattern
- **This Spec:** Introduces `spec_sha` on `reviewer_report` as a staleness detector for the reviewed artifact.
- **Conflicts With:** `.context-index/specs/cross-cutting/explicit-governance-registries.spec.md:233,381,466` — `manifest_sha` on `validator_report` already exists as "the spec source-manifest `sha` at the moment of the gate run," consumed by a freshness rule that SKIPs stale records. Two independent staleness mechanisms now sit on adjacent variants of the same log with different granularity (git commit sha vs SHA-256 body digest) and no cross-reference; `_sha` reads as one kind of value to a JSONL consumer.
- **Recommendation:** Add a sentence to BEH-1 citing `explicit-governance-registries.spec.md` Behavior 4 and stating why the source-manifest `sha` is insufficient here (it covers source files, not the spec body). Consider `spec_body_sha256` if the naming ambiguity is worth closing.

### CON-5 — Suffixed behavior IDs depart from the adopted allocation rule

- **Severity:** `warning`
- **Category:** naming
- **This Spec:** Uses `BEH-1a`, `BEH-3a`, `BEH-3b`, `BEH-9a` alongside `BEH-1`…`BEH-9`, and carries a `retired-behavior-ids` comment.
- **Conflicts With:** `.context-index/specs/cross-cutting/spec-behavior-ids.spec.md` §"The convention" — `BEH-<n>` where `<n>` is a positive integer, allocated above the maximum ever used, never interpolated; the pathology is named in `check-id-enum.spec.md`. Not a violation (that spec's Out of Scope excludes `--amend` artifacts), but the spec voluntarily adopts the convention and then departs from its allocation rule — and blocker `section_anchor`s will cite these suffixed IDs.
- **Recommendation:** Renumber the suffixed behaviors to `BEH-10`…`BEH-13`, or add one line stating the suffixes are deliberate sub-clauses of their parent behavior and not independently citable.

### CON-6 — BEH-7 interacts with the still-open `--step` vocabulary

- **Severity:** `warning`
- **Category:** contract
- **This Spec:** BEH-7 hard-fails `adev report --type step --status completed|failed` with `ORPHAN_STEP_TERMINAL` when the projection records no `started` for the named `--step`.
- **Conflicts With:** `.context-index/specs/cross-cutting/check-id-enum.spec.md` §Non-goals, which explicitly records that `--step` is unvalidated free text (`lib/cli/report.mjs:153,219,224,380`) and defers closing that vocabulary. A misspelled `--step` on an exit event now aborts non-zero — and since the code is not `GATE_BLOCKED`, `cli/index.mjs:2009-2011` exits 1 with a stack, masking the original abort that `skills/implement/failure-path-exit-event.md` exists to record.
- **Recommendation:** State BEH-7's interaction with the open `--step` vocabulary, and specify that on the failure path the command prints `ORPHAN_STEP_TERMINAL` without displacing the operator's original error. (Verified: all six documented emitters — specify, review-specs, plan, implement, validate — scope their terminal events to after `--status started`, so BEH-7 is otherwise compatible.)

### CON-7 — Charter Interface Contracts block is stale on `requireGate`

- **Severity:** `suggestion`
- **Category:** contract
- **This Spec:** BEH-4/BEH-6 declare `requireGate(state, stepName, { mode, currentSpecSha })`; frontmatter declares `charter-revision: 3`.
- **Conflicts With:** `.context-index/specs/features/agent-reliable-state-artifacts/charter.md:236` — Interface Contracts still declares `requireGate(state, stepName) → void`, already stale from the base spec's `{ mode }` widening.
- **Recommendation:** Note the charter Interface Contracts block needs the third-argument update, or accept the drift explicitly.

**Verified consistent.** `spec_sha` (event, snake_case) / `specSha` (projection, camelCase) match base CON-1 and the `completed_at` legacy carve-out is correctly cited. Optional-field-on-existing-variant matches the `revision` and `gate_outcomes` precedent, and `lib/diagnostics/event-schemas.mjs` passes extra fields through, so no `CANONICAL_EVENTS` change is needed as claimed. Filename and `target-revision: 5` conform to `spec-amendment-artifacts.spec.md` Behaviors 1–3 (base is `revision: 4`). The `review_mode: quick` scope note matches `graduated-rigor-tiers.spec.md:62`, and `--tier full` → three reviewers matches `skills/review-specs/SKILL.md:18`. Code citations check out: `lib/source-manifest.mjs:83` is the cited `createHash("sha256")` call, and `lib/cli/gate.mjs:144` is the sole `requireGate` enforcement caller, passing no sha.

---

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict
> in the header above, computed from post-cap findings across all reviewers.
> All three reviewers carry `severity_cap: blocker`, so no finding was demoted.
> `computeVerdict` with `blocker_threshold: 1` over 4 blockers → BLOCK.

## Heuristics — prior occurrences of this blocker

The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observations

*(The store returned the same module-level block for all four blocker signatures — no signature-specific prior occurrence is recorded.)*

---

## Summary

**Total findings:** 17 (4 blockers, 10 warnings, 3 suggestions)

**Convergent blocker.** SA-1, CON-1 and SEC-4 are three independent readings of the same defect: BEH-3a's reconciliation set is not revision-scoped, so the `"divergent"` sentinel becomes an unrecoverable absorbing state on any step that was reviewed more than once — which is precisely what the `review-block-auto-retry` loop guarantees. This spec, at `revision: 2` after one revise round, would block itself.

**Independent blockers.** SEC-1 (governance-controlling frontmatter left outside the attested region, so a post-review `risk_level` downgrade still passes) and CON-2 (`GATE_SPEC_SHA_MISMATCH` as `err.code` breaks the dispatcher's `GATE_BLOCKED` → exit-2 contract, turning a gate block into an exit-1 crash).

**Action required:** Run `/adev:specify --revise` against
`.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log-rev-5-review-gate-integrity.spec.md`
to address the 4 blockers recorded in the `.blockers.md` sidecar, then re-run
`/adev:review-specs`. The 10 warnings and 3 suggestions are not blocking but
should be folded into the same revision where cheap.

**Governance footer:** `spec-to-plan` transition declares no `approver_role` in `.context-index/governance/gates.yaml`. Risk policy for `risk_level: high` sets `require_hitl_approval: true` — human approval is required at the plan transition once this spec passes review.
