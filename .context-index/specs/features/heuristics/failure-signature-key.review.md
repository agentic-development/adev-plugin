---
kind: review
spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
charter: .context-index/specs/features/heuristics/charter.md
verdict: BLOCK
rigor-tier: full
reviewed: 2026-08-15
last-reviewed-revision: 7
file-sha: 091ac6a2319bbce4430a34756e5d802dc06b7cdcdeaa74deb45fbd92dbbf5157
---

# Architecture Review: failure-signature-key

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/features/heuristics/failure-signature-key.spec.md` (revision 7)
> **Charter:** `.context-index/specs/features/heuristics/charter.md` (revision 6, Phase 3)
> **Rigor tier:** full (explicit `--tier full`; `risk_level: high` → `review_mode: full` resolves the same)
> **Verdict:** BLOCK — 1 blocker, 2 warnings, 5 suggestions
> **Prior verdicts:** BLOCK at revisions 1 (6 blockers), 2 (2), 3 (1), 4 (1), 5 (2); revision 6's review stalled before consolidating and produced no durable verdict.

## Convergence against revision 6

Revision 6's review never consolidated — a `.review.md` was written but no `.blockers.md` and no status
transition, so that round has no durable verdict. Its two substantive findings were verified
independently by the orchestrator and fixed in revision 7 (commit `920919a9`):

- **Dual legacy slug conventions.** Confirmed live and correct as now written: `specSlug` in
  `lib/cli/heuristics.mjs:89-95` retains the `.spec` stem, while
  `hooks/post-validate-extract-heuristics.mjs:103` strips it. All seven retained-form store ids the
  spec cites exist verbatim, as do the two stripped-form examples.
- **`_format.md` stale category slugs.** Confirmed: `_format.md:205-217` still documents
  `spec-violation` / `context-gap` / `tool-failure` with the example `spec-violation-a1b2c3`; only
  `tool-failure` is one of the six real categories in `skills/recover/SKILL.md:130-185`. The Task Map
  row now names this explicitly.

All three reviewers independently spot-checked the spec's concrete factual claims against live files
and found them accurate: the four `evidence[].source` spellings and their counts (24 `validation`,
4 `learn`, 2 `validate`, 2 `recover`), the six recover diagnosis categories, the nine named store ids,
`lib/heuristics.mjs:101` / `:185-199` / `:733` / `:767`, `lib/blocker-id.mjs::parseBlockerId`'s
`locationHash` return, and the two test-harness copies at
`tests/skills/validate-success-heuristic-harness.mjs:145` and
`tests/skills/recover-extract-heuristic-harness.mjs:119`. Factual accuracy is not the problem in
revision 7.

Revision 7's blocker is new and does not recur any prior `blocker_id`. Seven rounds, seven disjoint
blocker sets.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Registry: `adev domain load-reviewers` resolved domain `software` (source level: default); project
`review.yaml` declares `reviewers: []`, so all three bundled defaults dispatched with
`dispatch: always`. Context pack `base` is empty by configuration; each reviewer received the charter,
constitution, sibling specs, cross-cutting `review-block-auto-retry.spec.md`, the ADR directory,
`platform-context.yaml`, and the module heuristics (three `medium`-confidence entries) by path.
Deviation from the tier map: the consistency analyzer ran on the `capable` model rather than `fast`,
after a prior round's `fast`-tier reviewer failed to return.

## Structural Architect (structural-architect)

**Verdict:** BLOCK

### SA-1 — `blocker`

- **blocker_id:** `structural-architect:unsatisfiable-migration-proof:d2ec180b`
- **section_anchor:** `behaviors-8`
- **Location:** Behavior 8, "Part 2 — recomputation under a legacy rule reproduces the stored `id`
  exactly", and the acceptance criterion naming `deploy-core-spec-91c5a876` / `prototype-core-277ce212`.

**Finding:** Part 2's discriminator is unsatisfiable against the live store, and it contradicts this
spec's own acceptance criteria. The legacy rule hashed `<absolute-spec-path>|<pattern>`; the absolute
path at write time is not recorded on the entry and is not recoverable from it — that unrecoverability
*is* the bug this spec exists to fix. The reviewer recomputed the legacy rule for both entries the
acceptance criteria name as must-migrate, using each entry's stored `pattern` (verified unmodified
since its introducing commit `1cffdd2b`) against every plausible spec path:

- `deploy-core-spec-91c5a876` → main-repo absolute path yields `9681f3e1`; repo-relative yields
  `97fec754`; the four plausible worktree paths yield `0ff5b6cf` / `b4c9ae8e` / `f6a4b3e0` /
  `41dd7b7e`. None is `91c5a876`.
- `prototype-core-277ce212` → `07cd548f` (absolute) / `42e8f53f` (relative). Neither matches.

**Independently reproduced by the orchestrator** before this reviewer returned: hashing
`sha256(<path>|<stored pattern>)` for `deploy-core-spec-91c5a876` yields `9681f3e1` (absolute,
main-repo), `97fec754` (repo-relative), and `4e966839` / `fe333ee6` for the shorter hook-generated
pattern form — never `91c5a876`. This finding is verified fact, not a reviewer inference.

Under Behavior 8 as written, both entries fail Part 2 under *both* slug conventions, are classified
unprovable, and are skipped — yet the acceptance criterion "Entries in both legacy slug conventions
migrate — asserted against real store ids, one retaining the `.spec` stem
(`deploy-core-spec-91c5a876`) and one stripping it (`prototype-core-277ce212`)" requires exactly these
two to migrate. As specified, the migration rekeys zero entries while its own tests demand the
opposite. An implementer cannot satisfy both; planning cannot proceed without choosing between them.

Note the shape of this defect: it is not the revision-6 finding restated. Revision 6 found that Part 2
implemented only one of two slug conventions; revision 7 correctly added the second convention. The
defect now is that *neither* convention — nor any path variant — reproduces the stored digests,
because the hash input is unrecoverable in principle, not because the prefix rule was incomplete.

**Recommendation:** Resolve the contradiction at the contract level. Either (a) define a discriminator
that keys only on properties recoverable from the entry (for example a structural prefix test plus a
positively-defined in-scope predicate), or (b) restate the migration's guarantee to match what
proof-by-recomputation can actually deliver, and remove the two named-id acceptance criteria. Whichever
is chosen, the Part 2 wording and the acceptance criteria must agree on the same expected outcome for
these two entries.

### SA-2 — `warning`

- **Location:** Behavior 8, "New-key inputs" and "Part 2".

**Finding:** Both the proof recomputation and the new-key derivation are specified to run off "the
entry's `validation`-sourced evidence path", but every stored evidence path is a validate *report*
(`.validate.md`), while both the legacy and the corrected hash input take the *spec* path
(`.spec.md`). The report→spec transform is referenced only as "recovered from the evidence element"
and is never defined; it is also lossy — the hook derives the report path via
`specPath.replace(/\.spec\.md$/, '')` only as a fallback, and `verdict.report_path` may point
elsewhere. Two implementations of "recover" will produce two different new keys.

**Recommendation:** State the evidence-path → spec-path mapping explicitly as part of the Behavior 8
contract, including what happens when the mapping is not invertible (presumably the existing
`skipped-unrecoverable` count).

### SA-3 — `warning`

- **Location:** Behavior 8, "Alias normalization" bullet, versus "Out of scope, never rekeyed" and
  Behavior 10.

**Finding:** The spec does not say whether alias folding (`validate`→`validation`,
`recover`→`recovery`, `learn`→`manual`) is persisted to the store or applied only in memory for
evidence selection. Persisting it conflicts with the out-of-scope guarantee that skipped entries are
"left untouched" (a `learn`-sourced entry that is never rekeyed would still be rewritten) and bears on
Behavior 10's byte-identical second run; not persisting it means the drift the spec identifies
survives the migration. The postcondition "No entry has lost evidence" is also silent on `source`
mutation.

**Recommendation:** Make the persistence decision explicit in Behavior 8 and reconcile it with the
"left untouched" wording and Behavior 10's idempotency statement.

### SA-4 — `suggestion`

- **Location:** Error Cases table, `EMPTY_SIGNATURE_TEXT` row.

**Finding:** The row is unscoped by mode. In inherited mode `--text` is rejected with
`CONFLICTING_SIGNATURE_INPUT` and nothing is hashed, so `EMPTY_SIGNATURE_TEXT` can only apply to
derived mode. Two error codes are reachable for the same missing-flag shape depending on origin.

**Recommendation:** Scope the row to derived mode, mirroring the "in derived mode" qualifiers already
used in Behaviors 1 and 2.

**Not counted as findings:** the known-deferred items (charter Consumed/Exposed API rows,
`FailureSignature.digest`, `EvidenceRef.source` enum, `docs/cli-reference.md`) were checked and none
contradicts this spec's own text. No ADR conflict: ADR-0019's validator-spelling problem is explicitly
sidestepped by the charter's out-of-scope row, and ADR-0016 is satisfied (all state stays under
`.context-index/`, zero new dependencies).

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES (no blockers, no warnings — two suggestions)

### SEC-1 — `suggestion` (input-validation)

Behavior 3 requires a rejected `--origin` value to be stripped of control and ANSI characters and
truncated before it is echoed, but Behavior 8's alias-normalization step — which reports unrecognized
`evidence[].source` spellings — carries no equivalent requirement. The `source` values come from the
git-tracked store, which the threat model treats as trusted content, so this is not exploitable; the
two report paths are simply structurally identical and only one got the treatment.

**Recommendation:** Apply the same stripping-and-truncation rule to the unrecognized-`source` report
line in `migrate-keys`, for consistency rather than because the threat model requires it.

### SEC-2 — `suggestion` (data-exposure)

Because `/adev:recover` is constitutionally required to invoke a CLI verb rather than import a lib
function, diagnosis text passed via `--text` is argv-visible to other local users (`ps`) and lands in
shell and agent-transcript history for the duration of the call. The validate-hook path is unaffected —
it runs in-process. Recover's root-cause text can legitimately contain fragments of command output.

**Recommendation:** Note in the spec (or in `docs/cli-reference.md` when written) that `--text` should
carry normalized diagnosis prose, not raw stderr/stdout capture, consistent with the redaction
boundary the hook already documents. No code change required by this spec.

**Verified as already handled, not re-flagged:** origin-value terminal-echo hardening (Behavior 3);
`blocker_id` parsing reusing `lib/blocker-id.mjs`'s existing allowlists (Behavior 3a); the `signature`
regex and length cap (Behavior 5a); atomic temp-then-rename migration writes and fail-closed behavior
on an unreadable store; fail-closed `id` derivation on an unresolvable project root; existing-wins
`signature` semantics (Behavior 5b). No authentication, authorization, secrets, or rate-limiting
findings apply — this is a local single-user CLI over trusted git-tracked content.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS (no blockers, no warnings — two suggestions)

### CON-1 — `suggestion` (contract)

- **This Spec:** the Task Map row "Correct id hash input" cites
  `hooks/post-validate-extract-heuristics.mjs:123-127`.
- **Conflicts With:** the live file — the `hashInput` / `createHash` composition sits at lines 122-125.
- **Recommendation:** refresh the citation before implementation to avoid a wrong-anchor edit. Drift of
  a few lines only.

### CON-2 — `suggestion` (terminology)

Behavior 8's alias table (`validate`→`validation`, `recover`→`recovery`, `learn`→`manual`) is
charter-conformant against the `EvidenceRef.source` enum in `charter.md`'s Domain Model, and the
spec's own claim that "only `validation` appears in the charter's enum" is accurate. Recorded as
verified, not as a defect.

All other cross-references check out: `signature-retrieval.spec.md`'s dependency on the `signature`
field and its round-trip postcondition; `failure-capture.spec.md` Behavior 6's byte-identical
recover-id requirement, satisfied by Behavior 7a's unchanged `<category-slug>-<digest>` composition
and Behavior 8 Part 1's structural exclusion; and the `blocker_id` contract this spec consumes in
inherited mode, matching `review-block-auto-retry.spec.md` Behavior 3's
`<reviewer>:<type>:<8-hex>` shape.

---

## Summary

**Total findings:** 8 (1 blocker, 2 warnings, 5 suggestions)

**Action required:** SA-1 must be resolved before planning. The spec is otherwise sound — its factual
claims are verified accurate, its two-key model is internally consistent, it is consistent with the
charter and both sibling specs, and it raises no security or ADR concerns. The single blocker is a
contradiction between Behavior 8 Part 2's proof-by-recomputation discriminator and the acceptance
criteria that name two specific store entries as must-migrate: no path variant under either slug
convention reproduces either entry's stored digest, so as written the migration rekeys nothing while
its own tests demand it rekey those two. Resolving it means choosing a recoverable discriminator or
restating the migration's guarantee — a contract-level decision, not a wording fix.

Address the blocker via `/adev:specify --revise`, then re-review. SA-2 and SA-3 are worth folding into
the same revision: both concern Behavior 8, and SA-2's undefined evidence-path → spec-path mapping is
adjacent to whatever discriminator replaces Part 2.

> **Governance:** `risk_level: high` → `require_hitl_approval: true` per
> `.context-index/governance/risk-policies.yaml`. Human approval is required at the spec-to-plan
> transition once this spec passes review.
