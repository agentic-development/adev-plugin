# Architecture Review: verification-ledger-and-deferred-state

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/test-strategies/verification-ledger-and-deferred-state.spec.md`
> **Charter:** `.context-index/specs/features/test-strategies/charter.md`
> **Rigor tier:** full
> **Verdict:** BLOCK
> **last-reviewed-revision:** 1
> **file-sha:** e683fc997312b1ca834479c16eb97b1b4b7375a06ed376185f7ec168e9a99e4c

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

> Domain: `software` (source: default). Reviewed as part of the four-spec
> revision-5 non-code strategy set.

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

> **On the central design decision:** *"The decision to reuse the event log over a
> new store is sound and the reasoning is complete."* The proposed
> `strategy_verification` event fits existing precedent cleanly — `task_id` keying
> matches `plan_task` / `test_depth_assigned`, most-recent-wins matches
> `test_depth_assigned`, and the `[BOUNDARY: human-approved]` gate matches the
> in-code comments on both.

- **SA-4** · blocker (carried from the snapshot review) · `behaviors-5` · `structural-architect:contract:71e64317` — The proposed event payload carries no capture timestamp or baseline checksum, so the snapshot profile's post-hoc-baseline and write-once rules have no durable substrate. Either extend the payload or name a different recording surface in both specs.
- **SA-7** · warning · `behaviors-5` — ADR-0009 §8 designates `agent-reliable-state-artifacts/lifecycle-event-log.spec.md` as the event-log authority, and its canonical-variant enumeration is already stale (missing `spec_amended`, `test_depth_assigned`, `code_drift_*`). This spec cites ADR-0009 correctly but never lists that spec as an update obligation.
- **SA-8** · warning · `postconditions` — Behaviors 4, 7, and 8 are all enforced in `skills/validate|status/SKILL.md`, which the spec defers. The deferral is acknowledged in the Module Impact Map, but Postconditions and ACs are written unconditionally, so a reader cannot tell which ACs are lib-testable now. Separately, Behavior 4 is **retroactive**: it makes every existing task with a shipped non-`unit` assignment `unverified` on first run, with no migration or effective-date rule.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

- **SEC-2** · blocker · `behaviors-3` · `security-reviewer:authentication:db661687` — **Unauthenticated `operator_deferred` source.** The spec requires a recorded human source but never binds it to the project's existing hook-injected `Author-type` / `Operator` provenance. Nothing stops an agent-invoked recorder from self-attesting `{reason_code: operator_deferred, source: "user"}` — which recreates, under a new label, exactly the 235-of-391 silent-skip failure this spec exists to prevent. Bind `source` to hook-verified provenance, or have the recording verb refuse without verified human attribution, mirroring the "machine-sourced, not free prose" rule already applied to `unmet_requirement`.
- **SEC-3** · warning · `behaviors-2` — `runPreflight()` output also includes `probe_error` (up to 200 chars of `sanitizeStderr()`-cleaned stderr, which strips control characters but not credential-shaped substrings). The spec does not forbid populating `unmet_requirement` from `probe_error`, risking partial secret leakage into the committed JSONL. State that `unmet_requirement` is limited to the failing system / env-var / tool **name** from `missing_env_vars` / `missing_tools`.
- **No issues found:** closed-enum outcomes and `deferred`-never-passes semantics are adequate as designed; `evidence_ref`-as-path (rather than payload) is the right call and gets an explicit containment check.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK

- **CON-1** · blocker · `error-cases` · `consistency-analyzer:contract:739ecb0c` — **Error-code collision.** `INVALID_SPEC_PATH` already has an established hard-failure contract (`lib/cli/specify.mjs` `assertWithin()` path-traversal rejection, exit 1, per `tests/cli/specify-revise.test.mjs`). This spec reuses it for an explicitly non-fatal report-and-continue case. Same code, two incompatible severities across modules — precisely what ADR-0009 §5 exists to prevent. Use a distinct code such as `LEDGER_SPEC_PATH_UNRESOLVED`.
- **CON-2** · warning · `charter.md` `capability-map` — The revision-5 charter is internally inconsistent: Business Intent, Scope, Domain Model, and Interface Contracts all say 12 strategies, but the Capability Map row "Strategy Type Registry" still reads "Define the 9 strategy types with summary traits".

---

## Summary

**Total findings:** 8 (2 blockers, 4 warnings, 2 "no issues" notes)
**Action required:** Revise to revision 2 addressing SEC-2 and CON-1 (and SA-4, jointly with the snapshot spec), then re-review. The spec's central decision — reuse the lifecycle event log as the status ledger rather than build a new store — was reviewed explicitly by the structural architect and **endorsed as sound with complete reasoning**. The blockers are about attribution integrity and an error-code collision, not about the architecture.


---

# Round 2 — quick-tier re-review of revision 2 (2026-08-13)

> **Reviewer:** quick-synthesized-reviewer (all three lenses)
> **Verdict:** BLOCK → revised to **revision 3**

**Round-1 blocker partition, verified against shipped code:**

| Round-1 blocker | Bucket |
|---|---|
| SA-1 unsatisfiable cascade order | **addressed** — appending after the trailing `integration` rule is implementable; `models/**/*.sql` → `fixture`, `k6/**` → `threshold`, `migrations/` → `schema` all verified true in `detection.mjs` |
| SA-2 visual AC unachievable | **addressed** — the honest note now matches the code |
| SA-3 seed_data_rule / permitted_tools | **addressed** — `REQUIRED_FIELDS` counts empty arrays as missing (`profiles.mjs:194`), so non-empty defaults do fix it; no contradiction with `UNIT_PROFILE`, which never passes through that validation |
| SA-4 post-hoc-baseline substrate | **inadequately addressed** → SA-12 |
| SEC-1 credentials in recorded commands | **addressed** |
| SEC-2 unauthenticated operator_deferred | **persistent** → SEC-6 |
| CON-1 error-code collision | **addressed** (CON-2 and CON-3 also fixed) |

**Round-2 findings on this spec**

- **SEC-6** · blocker · `behaviors-3` — **The mechanism revision 2 specified does not exist.** `Author-type` / `Operator` are git commit-message trailers written by `.githooks/prepare-commit-msg`, not a runtime channel a CLI verb can read. The derivation fails **open** (`hasSessionId ? agent : human`, plus an empty-string fallback) and its only input is a session-tracking file the attesting session itself writes. Revision 2 therefore asserted a *stronger* guarantee than revision 1 on a substrate providing none. **Fixed in revision 3:** the hook-provenance claim is withdrawn; `operator_deferred` is reachable only via a task named in a checked-in deferral policy file, so there is no runtime path at all.
- **SA-12** · blocker · `behaviors-5` — Strategy-conditional required fields are not expressible in `lib/diagnostics/event-schemas.mjs`, which offers only a flat per-discriminator required-field array. **Fixed in revision 3:** both baseline fields are unconditionally optional in the schema module and the pairing check moves to the emitter. The spec now also states plainly what `baseline_captured_at` can and cannot prove, instead of implying tamper-proofing.
- **CON-9** · blocker · `behaviors-4` — The retroactivity cutoff was defined twice in one paragraph, incompatibly (version anchor and data anchor). Under the data reading, a project that never records anything is permanently exempt — reproducing the 235-of-391 outcome. **Fixed in revision 3:** version anchor only; a project with zero recorded outcomes is maximally unverified, not exempt.
- **SEC-7** · warning · `behaviors-2` — `missing_env_vars` / `missing_tools` are nullable, so a probe-only system that fails yields no name-shaped data. **Fixed in revision 3:** system-name granularity is stated as the floor.

**Status of revision 3:** all four closed by construction; not independently re-reviewed.

> Round 1's endorsement of the central architecture — reusing the lifecycle event log as the status ledger rather than building a new store — was reaffirmed in round 2 and stands.
