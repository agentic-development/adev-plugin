---
spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log-rev-5-review-gate-integrity.spec.md
charter: agent-reliable-state-artifacts
date: 2026-08-17
verdict: BLOCK
tier: full
last-reviewed-revision: 1
file-sha: 918f9b2139ae7d1244613d31ea40d1d11bab26f584bf13017ee307ed72c6abbb
---

# Architecture Review: lifecycle-event-log-rev-5-review-gate-integrity

> **Date:** 2026-08-17
> **Spec:** `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log-rev-5-review-gate-integrity.spec.md`
> **Charter:** `.context-index/specs/features/agent-reliable-state-artifacts/charter.md`
> **Verdict:** BLOCK
> **Rigor tier:** full (risk_level: high → review_mode: full)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Context packs were delivered as **path manifests** (`delivery: manifest` on `review-base`).
Registry warnings at load: `CONTEXT_PACK_OVERRIDE` (expected — `review-base` is
overridden to set delivery), plus three `BROADEN_*` advisories on the unrelated
`browser-review` profile.

## Structural Architect (structural-architect)

**Verdict:** FAIL

### SA-1 — blocker — contract-conflict

- **blocker_id:** `structural-architect:contract-conflict:b5da728a`
- **section_anchor:** `behavioral-delta`
- **Location:** BEH-1, BEH-4, Acceptance Criteria
- **Finding:** BEH-1 defines `spec_sha` over the spec file's whole bytes (frontmatter
  included) and BEH-4 blocks when the current whole-file digest differs. But the
  lifecycle mutates spec frontmatter after reviewers run and before the `plan` gate:
  `skills/review-specs/SKILL.md:390` writes `status: review-pending → review-passed`
  during consolidation, after each `reportReviewer` event has already stamped the
  digest. Downstream `updated:`, `source-manifest:` (ADR-0011) and `drift_detected:`
  stampings mutate the same bytes. Under strict mode the recorded digest can never
  match at gate time, so `GATE_SPEC_SHA_MISMATCH` fires on every well-behaved spec.
  BEH-5's fail-soft does not rescue this — a `specSha` is present, so the comparison
  is not skipped.
- **Recommendation:** Define the digest scope in BEH-1 as the reviewed content,
  excluding lifecycle-managed frontmatter keys (or the frontmatter block entirely),
  and state the exclusion set in the contract. Add an acceptance criterion that a
  spec whose only change is a lifecycle status/source-manifest restamp still
  satisfies the gate.

### SA-2 — blocker — ambiguous-behavior

- **blocker_id:** `structural-architect:ambiguous-behavior:6b02596c`
- **section_anchor:** `behavioral-delta`
- **Location:** BEH-3, Acceptance Criteria
- **Finding:** `skills/review-specs/SKILL.md:500` emits one `reviewer_report` per
  dispatched reviewer — three under `--tier full`. BEH-3 speaks of projecting "the
  value" onto `steps.<step>.specSha` as if one existed, and defines no rule for
  reconciling several reports for the same step carrying different `spec_sha`
  values — precisely the mid-review-rewrite case this amendment exists to close.
  Last-write-wins lets a reviewer who read the new bytes launder a stale review;
  first-write-wins does the opposite.
- **Recommendation:** State the N-report reconciliation rule in BEH-3 (e.g. a single
  agreed digest projects; divergent digests project a distinguishable state that
  BEH-4 treats as a mismatch), with an acceptance criterion covering three reports
  carrying two distinct `spec_sha` values.

### SA-3 — warning — module-boundary

- **Location:** BEH-7, BEH-8, Amendment Rationale
- **Finding:** BEH-7/BEH-8 contract the CLI surface `adev report --type step`
  (`lib/cli/report.mjs`). The base spec scopes itself to `lib/lifecycle-state.mjs` /
  `lib/lifecycle-events.mjs`; its source-manifest lists neither the CLI file nor any
  `adev report` behavior, and the string `adev report` does not appear in it.
  `lib/cli/report.mjs` is claimed by `explicit-governance-registries.spec.md` and
  `measurement-integrity.spec.md`. Amending a lib-scoped spec to impose a new CLI
  exit path creates cross-spec coupling with no declared coordination.
- **Recommendation:** Either place BEH-7/BEH-8 in the spec owning `lib/cli/report.mjs`,
  or state in the Rationale that this amendment extends scope to the CLI writer and
  name the co-owning specs.

### SA-4 — suggestion — ambiguous-behavior

- **Location:** BEH-4
- **Finding:** BEH-4 does not say whether the gate reads top-level
  `steps.<step>.specSha` or `byRevision[N].specSha`. BEH-3 populates both, and under
  `review-block-auto-retry` a step legitimately carries multiple revisions.
- **Recommendation:** Name the read path in BEH-4.

### SA-5 — suggestion — ambiguous-behavior

- **Location:** BEH-7
- **Finding:** BEH-7 rejects a terminal with no preceding `started` but is silent on a
  terminal for an already-closed step — a second `completed` reopens the forgery
  channel with one prior `started` present.
- **Recommendation:** State whether re-closing a terminal step is accepted, ignored,
  or rejected.

**Reviewer note:** the amendment is structurally disciplined — it reuses the
optional-field + fail-soft mechanism rather than adding a `CANONICAL_EVENTS` variant
(ADR-0009 boundary respected), the `reportReviewer` / `requireGate` signatures match
the implementation, the no-I/O constraint in BEH-6 is consistent with the base
contract, `target-revision: 5` satisfies the `> base revision: 4` rule, and BEH-1's
digest matches `lib/source-manifest.mjs:83`. The blockers are scope-of-digest and
fold semantics, not the overall design.

## Security Reviewer (security-reviewer)

**Verdict:** FAIL

### SEC-1 — blocker — authorization

- **blocker_id:** `security-reviewer:authorization:d10e1641`
- **section_anchor:** `behavioral-delta`
- **Location:** BEH-1, BEH-4
- **Finding:** BEH-1 stamps `spec_sha` at `reportReviewer` time (SKILL.md Step 6a),
  but Step 7 of the same skill writes `review-pending → review-passed` back into the
  spec frontmatter after the event lands. Every `spec_sha` is therefore stale by
  construction, and BEH-4 strict mode blocks the next gate with
  `GATE_SPEC_SHA_MISMATCH` for a spec nobody edited. `hooks/spec-drift.sh`
  (`drift_detected: true`) and `/adev:implement`'s source-manifest stamp mutate the
  same frontmatter later, compounding it. The predictable operator response is
  `lifecycle.gate_mode: advisory`, which disables the pre-existing review gate too —
  a new control that fails open the old one. SKILL.md:420 documents this exact hazard
  for `.review.md`'s `file-sha`.
- **Recommendation:** Pin the digest to content the lifecycle does not machine-rewrite:
  hash the spec body below the frontmatter and state that scope normatively in BEH-1.
  If whole-file hashing is kept, move stamping to a post-status-write step mirroring
  Step 6c. Add an acceptance criterion that a spec receiving only lifecycle frontmatter
  writes still satisfies the strict gate.

### SEC-2 — warning — authorization

- **Location:** Amendment Rationale item 1, BEH-1
- **Finding:** The rationale asserts nothing records which bytes the reviewer read, but
  `.review.md` already carries `file-sha` (SKILL.md:377/407/420) computed
  post-status-write. The amendment introduces a second digest of the same artifact with
  different scope and timing; the two will disagree, giving downstream consumers two
  contradictory drift answers.
- **Recommendation:** Acknowledge `.review.md::file-sha` and specify the relationship —
  either define `spec_sha` as the same digest at the same stamping point, or state why
  they differ and which one gates.

### SEC-3 — warning — authorization

- **Location:** BEH-5, BEH-6, Preconditions Delta
- **Finding:** The control is inert by default and bypassable by omission: no
  `currentSpecSha` (BEH-6) or no recorded `specSha` (BEH-5) both skip with a warning,
  and the spec names no call site obliged to pass `currentSpecSha`. All acceptance
  criteria can pass with zero real gates enforcing.
- **Recommendation:** Name at least one mandatory enforcement point in the Preconditions
  Delta — the `review → plan` gate in `skills/plan/SKILL.md` MUST compute and pass the
  digest — with an acceptance criterion asserting it. Fail-soft on missing history
  (BEH-5) is right; fail-soft on a caller that simply omits the argument is not.

### SEC-4 — warning — authentication

- **Location:** BEH-7, BEH-8, Amendment Rationale item 2
- **Finding:** The rationale claims forged terminals are closed, but BEH-8 leaves
  `--status started` unvalidated. `report --status started` followed by
  `--status completed` still forges a completion indistinguishable from a real one —
  the bar rises by one CLI call. Neither event carries actor/session provenance, so
  `completed` remains unauthenticated.
- **Recommendation:** Downgrade the rationale's claim to what BEH-7 delivers (a
  sequencing invariant, not authenticity) and state the residual in the Error Cases
  Delta so downstream gates do not treat `completed` as attested. Actor/session
  provenance is a separate spec.

### SEC-5 — suggestion — data-exposure

- **Location:** BEH-2, Error Cases Delta (`SPEC_SHA_UNAVAILABLE`)
- **Finding:** "naming the path" does not say which form. The base spec's SEC-3 boundary
  requires project-root-relative paths and forbids persisting absolute paths.
- **Recommendation:** Specify project-root-relative in BEH-2.

### SEC-6 — suggestion — authorization

- **Location:** BEH-4, advisory branch
- **Finding:** An advisory-mode mismatch leaves no durable record — only `console.warn` —
  so a gate bypass is invisible to `/adev:hygiene` and `/adev:retro`.
- **Recommendation:** Append a `manual_override` event (existing canonical variant, no
  ADR-0009 boundary crossed) carrying `{expectedSpecSha, currentSpecSha}`.

### SEC-7 — suggestion — input-validation

- **Location:** BEH-1
- **Finding:** "the same way `lib/source-manifest.mjs` computes a per-file hash" is
  ambiguous — that module hashes a raw Buffer in one path (line 83) and a utf-8-decoded
  string in another (line 228). Emitter and enforcer computing via different paths yield
  spurious mismatches on non-UTF-8-clean bytes.
- **Recommendation:** Name the exact exported function and input form in BEH-1, with an
  acceptance criterion that emitter and gate caller share one helper.

**Reviewer scope note:** `spec_sha` covers the spec file only; the reviewer also consumed
the charter, constitution and ADRs, which can change post-review without detection. Worth
one sentence in BEH-1 bounding the claim.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** FAIL

### CON-1 — blocker — contract

- **blocker_id:** `consistency-analyzer:contract:da811cc5`
- **section_anchor:** `acceptance-criteria`
- **Location:** Acceptance Criteria line 1, BEH-5, BEH-6
- **Finding:** BEH-6 makes `currentSpecSha` caller-supplied and forbids `requireGate`
  from reading the spec; BEH-5 makes a missing sha never blocking. Acceptance Criteria
  line 1 nonetheless asserts that a spec whose bytes differ does not satisfy the gate
  under strict mode. But `lib/cli/gate.mjs:144` — the sole enforcement caller — invokes
  `requireGate(currentState(...), step, { mode })` with no sha, and the amendment names
  no obligation on `adev gate require`, on its owning spec
  `explicit-governance-registries.spec.md`, or on the skills that invoke it. Every gate
  in the shipping system therefore takes the `SPEC_SHA_UNVERIFIABLE` path permanently:
  defect #1 in the Rationale stays open and AC-1 is unsatisfiable by this delta.
- **Recommendation:** Add a behavior obliging `adev gate require` to compute the digest
  of the resolved spec and pass it as `currentSpecSha` (a `--spec-sha` flag or an
  internal read in the CLI arm, not in `requireGate`), and reword AC-1 to name that
  caller. Alternatively descope AC-1 to the library contract and file the caller change
  as a named sibling.

### CON-2 — warning — contract

- **Location:** Amendment Rationale item 1, BEH-1
- **Finding:** `lib/cli/report.mjs:301` — the `--type reviewer` arm — runs after the
  reviewer subagent returns. The digest therefore attests bytes at report time, not at
  dispatch/read time, so a spec edited during the review window is stamped post-edit and
  satisfies BEH-4.
- **Recommendation:** State in BEH-1 that `spec_sha` is a report-time attestation
  (narrower than the Rationale claims, and reword the Rationale to match), or have the
  dispatcher capture the digest before dispatch and pass it into `reportReviewer`.

### CON-3 — warning — naming

- **Location:** BEH-3
- **Finding:** `lifecycle-event-log.spec.md:137` defines the `byRevision[N]` member shape
  as `{ verdict, blockers[], completed_at, reports[] }` — snake_case `completed_at` —
  while the same spec's Naming Conventions (line 43) and AC (line 105) mandate camelCase
  throughout the projection. Adding a camelCase key beside `completed_at` deepens an
  undocumented mixed convention.
- **Recommendation:** Note in BEH-3 that `byRevision` carries a known legacy snake_case
  member and that `specSha` follows the projection rule, or exclude `byRevision` from
  BEH-3 (top-level `steps.<step>.specSha` is what BEH-4 actually reads).

### CON-4 — suggestion — pattern

- **Location:** Behavioral Delta
- **Finding:** Behaviors are rendered `BEH-1`..`BEH-8` with no
  `<!-- retired-behavior-ids: -->` comment. `spec-behavior-ids.spec.md` pairs the ID form
  with a mandatory tombstone; its Out of Scope section explicitly excludes `--amend`
  artifacts, so this is not a violation — but the amendment adopts the ID half without
  the allocator half, and these IDs are visually indistinguishable from base-spec
  behavior IDs (the base has none; its behaviors are unnumbered bullets).
- **Recommendation:** Add the tombstone comment and a line stating these IDs are
  amendment-scoped. Worth flagging upstream that `lib/specify-amend.mjs`'s hardcoded
  `## Behavioral Delta` renderer now produces IDs the convention spec says it does not
  reach.

### CON-5 — suggestion — domain-model

- **Location:** BEH-7, BEH-8, Error Cases Delta
- **Finding:** These place a CLI-argument-validation contract in a spec whose Error Cases
  table is otherwise entirely `lib/lifecycle-state.mjs` library errors. The base scopes
  the artifact as "a new library module (`lib/lifecycle-state.mjs`)"; the CLI arm lives in
  `lib/cli/report.mjs` under the `cli-driver-surface` charter. The base already leaks one
  CLI detail (`--from-summary`), so the boundary is fuzzy rather than clean.
- **Recommendation:** State that the placement is deliberate, or push BEH-7/BEH-8 into a
  `cli-driver-surface` sibling and keep only the projection guarantee here.

**Verified consistent:** `target-revision: 5` = base `revision: 4` + 1; filename matches
the `<base-stem>-rev-<N>-<descriptor>.spec.md` form; frontmatter carries
`amends`/`target-revision`/`kind`/`revision`/`status`; the Scope note's claim about
`require_review: false` → `review_mode: quick` matches `graduated-rigor-tiers.spec.md:62`;
error-code naming follows the base table's pattern; snake_case-on-event /
camelCase-on-projection matches CON-1 of the base Naming Conventions; BEH-7 is compatible
with every documented `adev report --type step` call site.

---

## Summary

**Total findings:** 17 (4 blockers, 6 warnings, 7 suggestions)

**Convergent finding:** SA-1 and SEC-1 independently identify the same defect — the
whole-file digest is invalidated by the lifecycle's own post-review frontmatter writes.
CON-2 approaches the same area from the timing side. This is the amendment's central
problem: as specified, strict mode would block every honest spec while the attack it
targets remains indistinguishable from the tool's own writes.

**Second structural gap:** CON-1 shows the control is unreachable in the shipping system —
no caller passes `currentSpecSha` — so AC-1 cannot be satisfied by this delta. SEC-3
reaches the same conclusion at warning severity.

**Action required:** Revise the spec to (1) define a digest scope stable across the
review→plan window, (2) name the mandatory enforcement caller, and (3) define the
multi-reviewer fold reconciliation rule. Then re-review.
