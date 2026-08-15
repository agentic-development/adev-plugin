---
kind: review
spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
charter: .context-index/specs/features/heuristics/charter.md
verdict: BLOCK
rigor-tier: full
reviewed: 2026-08-15
last-reviewed-revision: 4
file-sha: f21030511ace7630f8ef0596caee082caa2ff56eae052b7d781401293180221c
---

# Architecture Review: failure-signature-key

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/features/heuristics/failure-signature-key.spec.md` (revision 4)
> **Charter:** `.context-index/specs/features/heuristics/charter.md` (revision 6, Phase 3)
> **Rigor tier:** full (explicit `--tier full`; `risk_level: high` → `review_mode: full` resolves the same)
> **Verdict:** BLOCK
> **Prior verdicts:** BLOCK at revision 1 (6 blockers), revision 2 (2 blockers), revision 3 (1 blocker)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Registry source: domain `software` (source level `default`); `.context-index/governance/review.yaml` declares `reviewers: []`, so no overrides applied. No registry warnings. Severity cap `blocker` for all three — nothing was clamped.

Heuristics injected: 3 module-scoped entries at `summary` tier (`adev heuristics retrieve --module heuristics`). Skill extensions: `__NONE__`.

Cross-repo `depends-on` validation: skipped — the spec declares no `depends-on` frontmatter and no workspace was detected.

## Revision-3 blocker disposition

The single revision-3 blocker was independently re-checked against the revision-4 body by the reviewer that raised it. **It is resolved in the normative sections.**

| Prior blocker_id | Status | Evidence in revision 4 |
|---|---|---|
| `structural-architect:charter-invariant-conflict:5c58f7d8` | RESOLVED | Behavior 5(b) now reads "`signature` uses existing-wins semantics, deliberately unlike `antiPattern` and `tags`"; Behavior 5a extends preservation to all three cases (omit / same / different); new Behavior 5b makes divergence a warning-level log with the stored value kept; a matching acceptance criterion exists. This matches the charter invariant "A `signature` is never rewritten once assigned" |

The three revision-3 warnings were also genuinely folded in:

| Prior finding | Status | Evidence in revision 4 |
|---|---|---|
| SA-2 (out-of-scope enumeration not total) | FOLDED IN | Behavior 8's out-of-scope clause is now the complement of the in-scope test ("every entry that is not in scope… not an enumeration"), with the source list demoted to "concretely this covers today's…". A future `EvidenceRef.source` value is excluded by default |
| SA-3 (unconditional postcondition vs permitted skips) | FOLDED IN | Postcondition 3 is scoped to "every entry that was in migration scope", with skipped entries explicitly retaining their prior `id` and reported by count, plus a rationale tying it to Behavior 8 |
| SA-4 (post-merge confidence invariant) | FOLDED IN | Behavior 9 re-applies the contradiction invariant after the union and archives at two contradictions; a matching acceptance criterion exists |

**Convergence:** the revision-4 blocker set `{structural-architect:task-map-contradicts-behavior:17ad4a0f}` is disjoint from the revision-3 set `{5c58f7d8}`, the revision-2 set `{d46375fd, ff941c2c}`, and the revision-1 set. Zero prior blocker_ids recur across four revisions. Blocker count: 6 → 2 → 1 → 1, and the residue is now a single stale phrase in a derived section rather than a design gap.

## Structural Architect (structural-architect)

**Verdict:** BLOCK

**Claim verification performed by the reviewer and re-confirmed by the aggregator:** all of revision 4's line-number and code-shape claims check out. `validateEntry` at `lib/heuristics.mjs:101` with no `signature` handling; `FIELD_ORDER` at `:185-199` without `signature`; the two `finalEntry` object literals (`:733` update / `:767` new) as fixed whitelists with conditional `antiPattern`/`tags` blocks explicitly commented "incoming wins"; `hashInput = \`${normalizePath(specPath)}|${pattern}\`` at `hooks/post-validate-extract-heuristics.mjs:123-124` over the absolute path, with `source: 'validation'` written at `:132`; `parseBlockerId` at `lib/blocker-id.mjs:110` returning an 8-lowercase-hex `locationHash`.

### SA-1 — blocker

- **Location:** Actionable Task Map, row "Thread `signature` through the write path"
- **blocker_id:** `structural-architect:task-map-contradicts-behavior:17ad4a0f`
- **section_anchor:** `actionable-task-map`
- **Finding:** The row still reads "…names it in both `finalEntry` literals (`:733` update, `:767` new) **with incoming-wins-then-preserve semantics**". That is the exact rule revision 4 removed from Behavior 5(b), and it contradicts both Behavior 5(b)/5a (existing-wins) and the charter invariant "A `signature` is never rewritten once assigned". This is the section `/adev:plan` decomposes into implementation tasks, so an implementer following the Task Map writes the charter-forbidden overwrite while the behavior text says otherwise. Revision 4's edit reached the Behaviors and Acceptance Criteria but not the Task Map.
- **Recommendation:** Replace "incoming-wins-then-preserve semantics" with "existing-wins semantics (an assigned `signature` is never replaced; divergence is logged at warning level)". One-phrase edit; no other section changes.

### SA-2 — warning

- **Location:** Behavior 8, "Out of scope, never rekeyed"
- **Finding:** The complement rule is now total, which closes revision-3 SA-2's structural gap. But the live store contains 2 entries with `source: validate` (singular) alongside 24 with `validation` — plus 4 `learn` and 2 `recover` (verified by the aggregator against `.context-index/memory/heuristics/`). The `validate`-spelled entries were written by a path-dependent-era writer yet fall out of scope under the strict `=== "validation"` test, so they keep machine-dependent ids permanently, counted only as "skipped-out-of-scope". The complement is sound for *future* source values but silently mis-buckets an *existing* drift.
- **Recommendation:** Either note in Behavior 8 that near-miss source spellings are reported separately from genuine out-of-scope sources, or state explicitly that `source` vocabulary reconciliation is charter/`_format.md` work and that these entries are accepted as permanently unmigrated.

### SA-3 — suggestion

- **Location:** Error Cases, rows 2 and 3
- **Finding:** Precedence between `EMPTY_SIGNATURE_TEXT` and `CONFLICTING_SIGNATURE_INPUT` remains unspecified for `--origin review-specs` with neither `--text` nor `--blocker-id` (carried forward from revision-2 SA-4, not re-escalated). Both rows are readable as matching.
- **Recommendation:** One clause: origin/input-shape validation precedes emptiness validation.

### SA-4 — suggestion

- **Location:** Charter, Interface Contracts
- **Finding:** Known documentation lag, confirmed present, no contradiction with the spec: the Consumed APIs row names `buildBlockerId(...)` where the spec depends on `parseBlockerId`; the Exposed API row documents only the `--text` path, not the two-input shape; `FailureSignature.digest` is stated without the `review-specs` carve-out. Charter revision 7 work, independent of this loop.

**ADR compliance:** no conflicts. ADR-0016 (adev-owned state is canonical) and ADR-0005 (workspace isolation) both favor the location-independent `id`; ADR-0014's stderr policy is scoped to `adev issues migrate` and imposes nothing on `migrate-keys` reporting.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

**Threat model applied (unchanged):** local dev CLI plus a git-tracked, team-shared markdown store in a single repository. No auth/authz boundary — all operators already have full repo write access. No network surface.

Revision 4's changed territory (Behaviors 5(b)/5a/5b, Behavior 8, Behavior 9, and the postconditions) was reviewed for security implications specifically. **No new security findings.**

- **Behavior 5b (existing-wins):** the divergence is logged "at warning level" rather than silently overwritten. The logged value is a validated `[a-z0-9][a-z0-9-]*` slug (max 64 chars) derived from a digest, never raw failure text — no new secrets or data-exposure surface from that log line.
- **Behavior 8 (complement):** the discriminator reads only stored `evidence[].path` and `pattern`; unresolvable paths are left untouched (fail closed, no guessing). No new external input surface, no path-traversal vector.
- **Behavior 9 (post-merge contradiction re-check):** archiving a merged entry that trips the two-contradiction invariant is a data-integrity control, not a security control.
- **Postconditions:** scoping to migrated entries introduces no new inputs or trust boundary.

### SEC-2 — suggestion (secrets)

- **Finding:** Unaddressed, unchanged from revisions 2 and 3. Behavior 1's `--origin <slug> --text <text>` still passes failure text as a bare argv value for the `recover`, `validate`, and `implement` origins, visible via `ps aux` and persisted in shell history. The `review-specs` origin remains exempt via 3a, which reduces but does not eliminate the exposure. Revision 4's changed territory does not touch input transport, so nothing regressed or improved here.
- **Recommendation:** Accept `--text -` (or auto-detect non-TTY stdin) as an alternative to the argv form, and have the callers in `failure-capture.spec.md` pipe captured text. Worth closing before the sibling specs wire up their callers.

### SEC-3 — suggestion (input-validation)

- **Finding:** Unaddressed, unchanged from revisions 2 and 3. Behavior 3 still says the rejected `--origin` value is "truncated before it is echoed" with no pinned length, so the `INVALID_SIGNATURE_ORIGIN` error contract is untestable and can regress silently.
- **Recommendation:** Pin a concrete constant — reuse the 200-char `BLOCKER_FINDING_TEXT_TRUNCATE` precedent at `lib/blocker-id.mjs:26`, or a smaller value appropriate to a single CLI flag such as 80 — and state it in Behavior 3.

**Explicitly not flagged (unchanged):** origin allowlist enforcement and ANSI/control-char stripping; atomic temp-then-rename writes; migration rollback-on-read-failure; idempotent re-runs; no shell execution and no path-traversal surface; raw `--text` is never persisted — only its 8-hex digest survives into `signature`.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

No new blockers, warnings, or naming/pattern violations detected in revision 4. The revision-3 blocker and all three warnings were independently confirmed resolved from the consistency side.

Verified alignments:

- Behavior 5(b)/5a/5b's existing-wins rule aligns with the charter invariant "A `signature` is never rewritten once assigned", now including the conflicting-value case the consistency reviewer did not reach in revision 3.
- Behavior 8's complement formulation correctly classifies the live `_global.md` entries carrying `source: learn` as out of scope, and is forward-compatible with future `EvidenceRef.source` values.
- Behavior 9's post-merge re-application matches the charter demotion invariant "two contradictions archive the entry regardless of prior confidence".
- Behavior 3a's use of `parseBlockerId` respects the `blocker_id` format defined by `review-block-auto-retry.spec.md` Behavior 3 (`<reviewer>:<type>:<8-hex>`, deterministic).
- The origin enum (`recover`, `validate`, `review-specs`, `implement`) matches the charter's Exposed API row exactly.
- `signature` validation (`[a-z0-9][a-z0-9-]*`, max 64) is consistent with the safe-slug convention at `lib/heuristics.mjs:54`.
- Sibling preconditions in `failure-capture.spec.md` and `signature-retrieval.spec.md` ("signature round-trips through serialization") are satisfied by Behavior 5.
- Error codes are all scoped to the signature primitive; no collisions with sibling or cross-cutting specs.
- Constitution compliance: Node built-ins only (`node:crypto`), pure ESM, no inline-Node in skill prose, control-flow logic lives in the CLI verb.

### CON-1 / CON-2 / CON-3 — suggestions (carried forward, charter-side)

Unchanged and still open, but charter documentation lag rather than spec defects, explicitly not re-escalated: the Consumed APIs row names `buildBlockerId(...)` where this spec depends on `parseBlockerId`; the Exposed APIs row documents only the `--text` path, not the two-input signature; `FailureSignature.digest` is stated unconditionally without the `review-specs` carve-out that the charter's own Phase 3 prose describes. All three belong in a charter revision 7, independent of this revise loop.

### CON-4 — suggestion (terminology)

Behavior 2 still traces `normalizeFailureText` to `skills/recover/SKILL.md:393` rather than giving the normalizer's own canonical definition location. Informational; not re-escalated.

---

## Advisories

- No `LEGACY_REVIEWER_OUTPUT` advisories: the single `blocker` finding carried a well-formed `blocker_id`.
- No `INVALID_BLOCKER_ID` advisories: `structural-architect:task-map-contradicts-behavior:17ad4a0f` parses cleanly via `lib/blocker-id.mjs::parseBlockerId` (verified by the aggregator, not asserted) → `{ reviewer: "structural-architect", type: "task-map-contradicts-behavior", locationHash: "17ad4a0f" }`.
- No `MISSING_SECTION_ANCHOR` advisories: the blocker carried a lowercase-kebab `section_anchor` (`actionable-task-map`).
- No `BLOCKER_ID_COLLISION` advisories: a single sidecar entry.
- No `SECTION_ANCHOR_NORMALIZED` advisories this round.
- Severity cap (`blocker` for all three reviewers) demoted nothing.
- **Convergence note:** the revision-4 blocker set is disjoint from all three prior sets. Zero blocker_ids have ever recurred across this loop. The remaining blocker is a one-phrase inconsistency between the Task Map and the Behaviors that revision 4's edit did not reach, not a new design defect.

## Governance Footer

`.context-index/governance/gates.yaml` declares `transitions: {}` (the `spec-to-plan` block is commented out), so no `approver_role` is named for this transition. Note that `risk-policies.yaml` sets `require_hitl_approval: true` for `risk_level: high` — this spec is `high`, so human sign-off is expected before implementation regardless of the review verdict.

---

## Summary

**Total findings:** 9 (1 blocker, 1 warning, 7 suggestions)

**Blockers:**

| ID | blocker_id | Section | Theme |
|----|-----------|---------|-------|
| SA-1 | `structural-architect:task-map-contradicts-behavior:17ad4a0f` | `actionable-task-map` | The Actionable Task Map row for the write path still specifies "incoming-wins-then-preserve semantics" for `signature`, contradicting revision 4's own Behavior 5(b)/5a existing-wins rule and the charter invariant. `/adev:plan` decomposes this section into tasks, so an implementer would build the forbidden overwrite |

**Action required:** BLOCK. The fix is a single phrase in one Task Map row — replace "incoming-wins-then-preserve semantics" with "existing-wins semantics (an assigned `signature` is never replaced; divergence is logged at warning level)". The one warning (SA-2: two live `source: validate` entries fall outside the migration's strict `validation` test and stay permanently unmigrated) is worth folding into the same edit but does not block on its own.

Both sibling Phase-3 specs (`failure-capture.spec.md`, `signature-retrieval.spec.md`) declare a precondition that this spec ships first, so they remain transitively blocked. CON-1 through CON-4 and SA-4 are charter-side edits that can land independently as charter revision 7.
